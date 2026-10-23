const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../db');
const { createApp } = require('../app');
const { buildContext } = require('../rules/context');
const { solve } = require('../services/solver');

const T0 = Date.parse('2026-10-23T10:00:00Z'); // 15:30 in Asia/Kolkata, still the 23rd

async function boot(configOverrides = {}) {
  const state = { now: T0 };
  const db = openDb(':memory:');
  const app = createApp({
    db,
    clock: () => state.now,
    config: { logRequests: false, validateRateLimitPerMin: 1000, startRateLimitPerMin: 1000, ...configOverrides },
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  }

  return {
    state,
    db,
    call,
    close: () => new Promise((resolve) => server.close(() => { db.close(); resolve(); })),
  };
}

const ctxOf = (start) => buildContext(start.seed, start.playDate);

test('full game: start -> mutation -> win -> finish -> leaderboard', async (t) => {
  const s = await boot();
  t.after(s.close);

  // start
  const started = await s.call('POST', '/api/game/start', { seed: 'fixed-seed-1' });
  assert.equal(started.status, 201);
  const g = started.json;
  assert.equal(g.seed, 'fixed-seed-1');
  assert.equal(g.playDate, '2026-10-23');
  assert.equal(g.totalRules, 8);
  assert.equal(g.rules.length, 1);
  assert.match(g.note, /Do not use a real password/);
  assert.equal('check' in g.rules[0], false, 'check logic must never leak');
  assert.equal('answer' in g.rules[0], false, 'answers must never leak');
  assert.equal('hint' in g.rules[0], false, 'hints must not leak');
  const id = g.gameId;

  // can't ask for a hint on a locked riddle, or finish an unsolved game
  assert.equal((await s.call('POST', `/api/game/${id}/hint`, { ruleId: 'shop-receipt' })).json.error.code, 'RULE_NOT_REVEALED');
  assert.equal((await s.call('POST', `/api/game/${id}/finish`, { nickname: 'Eager' })).json.error.code, 'GAME_NOT_SOLVED');

  // empty password: only rule 1 visible, failing
  let r = await s.call('POST', `/api/game/${id}/validate`, { password: '' });
  assert.equal(r.status, 200);
  assert.equal(r.json.revealedCount, 1);
  assert.equal(r.json.rules[0].passed, false);
  assert.equal(r.json.won, false);

  // a password that satisfies everything under the FIRST receipt triggers the twist
  const ctx = ctxOf(g);
  const first = solve(ctx, { mutated: false });
  r = await s.call('POST', `/api/game/${id}/validate`, { password: first });
  assert.equal(r.json.won, false);
  assert.equal(r.json.mutated, true);
  assert.equal(r.json.revealedCount, 8);
  assert.equal(r.json.events[0].type, 'mutation');
  assert.equal(r.json.events[0].ruleId, 'shop-receipt');
  assert.equal(r.json.newlyUnlocked.length, 7);
  const guard = r.json.rules.find((x) => x.id === 'shop-receipt');
  assert.equal(guard.passed, false);
  assert.match(guard.riddle, new RegExp(`\\$${ctx.pricesShifted[0]}`));
  assert.match(guard.riddle, /fresh receipt/);

  // hints: first costs a hint, repeating the same one is free
  let h = await s.call('POST', `/api/game/${id}/hint`, { ruleId: 'shop-receipt' });
  assert.equal(h.status, 200);
  assert.equal(h.json.hintsUsed, 1);
  assert.equal(h.json.alreadyUsed, false);
  h = await s.call('POST', `/api/game/${id}/hint`, { ruleId: 7 }); // by 1-based order
  assert.equal(h.json.hintsUsed, 1);
  assert.equal(h.json.alreadyUsed, true);

  // the real solution, 90 seconds later
  s.state.now += 90_000;
  const second = solve(ctx, { mutated: true });
  r = await s.call('POST', `/api/game/${id}/validate`, { password: second });
  assert.equal(r.json.won, true);
  assert.equal(r.json.status, 'solved');
  assert.equal(r.json.canFinish, true);
  assert.equal(r.json.solvedCount, 8);
  assert.equal(r.json.events.length, 0);

  // no more guessing once solved
  r = await s.call('POST', `/api/game/${id}/validate`, { password: second });
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'GAME_NOT_ACTIVE');

  // time stops when the vault opens, not when the nickname is typed
  s.state.now += 60_000;
  const fin = await s.call('POST', `/api/game/${id}/finish`, { nickname: '  Tester  ' });
  assert.equal(fin.status, 200);
  assert.equal(fin.json.nickname, 'Tester');
  assert.equal(fin.json.elapsedMs, 90_000);
  assert.equal(fin.json.hintsUsed, 1);
  assert.equal(fin.json.score, 1000 - 90 * 3 - 75); // 655
  assert.equal(fin.json.rank, 1);

  // can't double-submit
  assert.equal((await s.call('POST', `/api/game/${id}/finish`, { nickname: 'Again' })).json.error.code, 'ALREADY_FINISHED');

  // leaderboard
  const lb = await s.call('GET', '/api/leaderboard?limit=5');
  assert.equal(lb.status, 200);
  assert.equal(lb.json.entries.length, 1);
  assert.equal(lb.json.entries[0].nickname, 'Tester');
  assert.equal(lb.json.entries[0].score, 655);

  // state endpoint
  const state = await s.call('GET', `/api/game/${id}`);
  assert.equal(state.json.status, 'finished');
});

test('leaderboard ranks by score (desc) and filters by mode', async (t) => {
  const s = await boot();
  t.after(s.close);

  async function play(mode, seconds, nickname) {
    const g = (await s.call('POST', '/api/game/start', mode === 'daily' ? { mode } : { seed: 'lb-seed' })).json;
    const ctx = ctxOf(g);
    await s.call('POST', `/api/game/${g.gameId}/validate`, { password: solve(ctx, { mutated: false }) });
    s.state.now += seconds * 1000;
    await s.call('POST', `/api/game/${g.gameId}/validate`, { password: solve(ctx, { mutated: true }) });
    return (await s.call('POST', `/api/game/${g.gameId}/finish`, { nickname })).json;
  }

  const slow = await play('random', 100, 'Slow');
  const fast = await play('random', 20, 'Fast');
  const daily = await play('daily', 50, 'Daily');
  assert.equal(slow.rank, 1);
  assert.equal(fast.rank, 1); // beats the slow one
  assert.equal(daily.rank, 2);

  const all = (await s.call('GET', '/api/leaderboard')).json.entries.map((e) => e.nickname);
  assert.deepEqual(all, ['Fast', 'Daily', 'Slow']);
  const onlyDaily = (await s.call('GET', '/api/leaderboard?mode=daily')).json.entries;
  assert.deepEqual(onlyDaily.map((e) => e.nickname), ['Daily']);
  assert.equal((await s.call('GET', '/api/leaderboard?mode=bogus')).status, 400);
});

test('passwords are never stored, returned or logged', async (t) => {
  const s = await boot();
  t.after(s.close);

  const captured = [];
  const originals = {};
  for (const m of ['log', 'info', 'warn', 'error']) {
    originals[m] = console[m];
    console[m] = (...args) => captured.push(args.map(String).join(' '));
  }
  t.after(() => { for (const m of Object.keys(originals)) console[m] = originals[m]; });

  const g = (await s.call('POST', '/api/game/start', { seed: 'privacy-seed' })).json;
  const ctx = ctxOf(g);
  const pw1 = solve(ctx, { mutated: false });
  const pw2 = solve(ctx, { mutated: true });
  const odd = 'ZzSecretPw-9!';

  const responses = [];
  for (const pw of [odd, pw1, pw2]) {
    responses.push((await s.call('POST', `/api/game/${g.gameId}/validate`, { password: pw })).text);
  }
  responses.push((await s.call('POST', `/api/game/${g.gameId}/finish`, { nickname: 'Priv' })).text);
  // malformed JSON containing a password must not be echoed back in the parse error
  const bad = await s.call('POST', `/api/game/${g.gameId}/validate`, '{"password": ZzSecretPw-9! oops');
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error.code, 'INVALID_JSON');
  responses.push(bad.text);

  const dump = JSON.stringify({
    games: s.db.prepare('SELECT * FROM games').all(),
    hints: s.db.prepare('SELECT * FROM game_hints').all(),
  });
  for (const secret of [odd, pw1, pw2, 'ZzSecretPw']) {
    assert.equal(dump.includes(secret), false, 'database must not contain passwords');
    assert.equal(captured.join('\n').includes(secret), false, 'logs must not contain passwords');
    assert.equal(responses.slice(0, 3).join('\n').includes(secret), false, 'responses must not echo passwords');
    assert.equal(bad.text.includes(secret), false, 'parse errors must not echo passwords');
  }
});

test('input validation and consistent error format', async (t) => {
  const s = await boot();
  t.after(s.close);
  const g = (await s.call('POST', '/api/game/start', {})).json;
  const id = g.gameId;
  const code = (r) => r.json && r.json.error && r.json.error.code;

  assert.equal(code(await s.call('POST', `/api/game/${id}/validate`, { password: 12345 })), 'VALIDATION_ERROR');
  assert.equal(code(await s.call('POST', `/api/game/${id}/validate`, { password: ['a'] })), 'VALIDATION_ERROR');
  assert.equal(code(await s.call('POST', `/api/game/${id}/validate`, {})), 'VALIDATION_ERROR');
  assert.equal(code(await s.call('POST', `/api/game/${id}/validate`, { password: 'x'.repeat(101) })), 'VALIDATION_ERROR');
  assert.equal((await s.call('POST', `/api/game/${id}/validate`, { password: 'x'.repeat(100) })).status, 200);
  assert.equal(code(await s.call('POST', `/api/game/${id}/validate`, '[1,2]')), 'VALIDATION_ERROR');
  assert.equal(code(await s.call('POST', `/api/game/${id}/validate`, { password: 'x'.repeat(5000) })), 'PAYLOAD_TOO_LARGE');
  assert.equal(code(await s.call('POST', '/api/game/nope/validate', { password: 'a' })), 'GAME_NOT_FOUND');
  assert.equal(code(await s.call('GET', '/api/game/nope')), 'GAME_NOT_FOUND');
  assert.equal(code(await s.call('GET', '/api/nothing-here')), 'NOT_FOUND');
  assert.equal(code(await s.call('POST', '/api/game/start', { seed: 'bad seed!' })), 'VALIDATION_ERROR');
  assert.equal(code(await s.call('POST', '/api/game/start', { mode: 'chaos' })), 'VALIDATION_ERROR');
  assert.equal(code(await s.call('POST', '/api/game/start', { tz: 'Mars/Olympus' })), 'INVALID_TIMEZONE');
  assert.equal(code(await s.call('POST', `/api/game/${id}/hint`, { ruleId: 'no-such-rule' })), 'VALIDATION_ERROR');
  assert.equal(code(await s.call('POST', `/api/game/${id}/hint`, {})), 'VALIDATION_ERROR');
  assert.equal(code(await s.call('POST', `/api/game/${id}/finish`, { nickname: '<script>' })), 'VALIDATION_ERROR');
});

test('rate limiting on /validate returns 429 in the standard error format', async (t) => {
  const s = await boot({ validateRateLimitPerMin: 3 });
  t.after(s.close);
  const g = (await s.call('POST', '/api/game/start', {})).json;
  const statuses = [];
  let last;
  for (let i = 0; i < 5; i++) {
    last = await s.call('POST', `/api/game/${g.gameId}/validate`, { password: 'abc' });
    statuses.push(last.status);
  }
  assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
  assert.equal(last.json.error.code, 'RATE_LIMITED');
});

test('daily mode shares one seed and the same puzzle for everyone', async (t) => {
  const s = await boot();
  t.after(s.close);

  const d = await s.call('GET', '/api/daily');
  assert.equal(d.json.seed, 'daily-2026-10-23');
  assert.equal(d.json.playDate, '2026-10-23');
  assert.equal((await s.call('GET', '/api/daily?tz=Nope/Zone')).status, 400);

  const a = (await s.call('POST', '/api/game/start', { mode: 'daily' })).json;
  const b = (await s.call('POST', '/api/game/start', { mode: 'daily' })).json;
  assert.notEqual(a.gameId, b.gameId);
  assert.equal(a.seed, b.seed);
  assert.equal(a.seed, 'daily-2026-10-23');

  // the next day (in the player's timezone) is a different puzzle seed
  s.state.now += 24 * 60 * 60 * 1000;
  assert.equal((await s.call('GET', '/api/daily')).json.seed, 'daily-2026-10-24');
});

test('games expire after the TTL', async (t) => {
  const s = await boot({ gameTtlMinutes: 10 });
  t.after(s.close);
  const g = (await s.call('POST', '/api/game/start', {})).json;
  s.state.now += 11 * 60 * 1000;
  const r = await s.call('POST', `/api/game/${g.gameId}/validate`, { password: 'abc' });
  assert.equal(r.status, 410);
  assert.equal(r.json.error.code, 'GAME_EXPIRED');
  assert.equal(s.app === undefined, true); // sanity: nothing leaked on the harness object
});

test('CORS: localhost and file:// frontends allowed, random sites are not', async (t) => {
  const s = await boot();
  t.after(s.close);
  const acao = async (origin) => (await s.call('GET', '/api/health', undefined, { origin })).headers.get('access-control-allow-origin');
  assert.equal(await acao('http://localhost:5173'), 'http://localhost:5173');
  assert.equal(await acao('http://127.0.0.1:5500'), 'http://127.0.0.1:5500');
  assert.equal(await acao('null'), 'null');
  assert.equal(await acao('https://evil.example'), null);
});
