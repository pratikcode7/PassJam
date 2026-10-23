const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { openDb } = require('../db');
const { createApp } = require('../app');
const L = require('../rules/ledger');

const T0 = Date.parse('2026-10-23T10:00:00Z'); // a Friday in Asia/Kolkata
const FRIDAY = { weekday: 'Friday', nightWatch: false };

async function boot(configOverrides = {}) {
  const state = { now: T0 };
  const db = openDb(':memory:');
  const app = createApp({
    db,
    clock: () => state.now,
    config: {
      logRequests: false,
      validateRateLimitPerMin: 1000,
      startRateLimitPerMin: 1000,
      frontendFile: path.join(__dirname, '..', '..', 'index.html'),
      ...configOverrides,
    },
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(method, p, body) {
    const res = await fetch(base + p, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text };
  }
  return { state, db, call, close: () => new Promise((r) => server.close(() => { db.close(); r(); })) };
}

// The same oath the page's hidden Ctrl+J key writes.
function oathFor(weekday) {
  let s = `XL ${weekday} steps on the map, piano, cumin, emases, $ dawn 99994`;
  while (!L.isPrime(L.len(s))) s += '.';
  return s;
}

// ------------------------------------------------------------------ rules

const CASES = {
  gatekeeper: { pass: ['abcdefghijkl'], fail: ['abcdefghijk', ''] },
  'tall-one': { pass: ['a B'], fail: ['all lower', ''] },
  scribe: { pass: ['xXLx'], fail: ['xl', 'Xl', 'LX'] },
  weigher: { pass: ['99994', '9 9 9 9 4'], fail: ['9999', '99995', ''] },
  cartographer: { pass: ['MAP'], fail: ['ma p'] },
  'spice-thief': { pass: ['Cumin', 'paprika'], fail: ['salt', ''] },
  eavesdropper: { pass: ['EMASES'], fail: ['sesame'] },
  'toll-keeper': { pass: ['$', '₹', '¢'], fail: ['USD', ''] },
  wanderer: { pass: ['footsteps'], fail: ['step'] },
  watchman: { pass: ['friday'], fail: ['thursday'] },
  musician: { pass: ['Piano'], fail: ['pian o'] },
  mathematician: { pass: ['ab', 'abc', '₹₹'], fail: ['', 'a', 'abcd'] },
  'night-watch': { pass: ['DAWN'], fail: ['dusk'] },
};

test('every thief has a passing and a failing case', () => {
  assert.equal(L.ALL.length, 13);
  for (const t of L.ALL) {
    const c = CASES[t.id];
    assert.ok(c, `missing cases for ${t.id}`);
    for (const p of c.pass) assert.equal(t.check(p, FRIDAY), true, `${t.id} should pass "${p}"`);
    for (const p of c.fail) assert.equal(t.check(p, FRIDAY), false, `${t.id} should fail "${p}"`);
  }
});

test('the demo oath satisfies every thief on every weekday', () => {
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    const r = L.checkOath(oathFor(day), { weekday: day, nightWatch: true });
    assert.equal(r.allPassed, true, day);
    assert.equal(r.results.length, 13);
  }
});

test('the Night Watch only counts once he is awake', () => {
  const noDawn = oathFor('Friday').replace('dawn', 'dusk');
  assert.equal(L.checkOath(noDawn, FRIDAY).allPassed, true);
  assert.equal(L.checkOath(noDawn, { ...FRIDAY, nightWatch: true }).allPassed, false);
});

test('ranks follow the gold kept', () => {
  assert.equal(L.rankFor(100), 'Ali Baba himself');
  assert.equal(L.rankFor(90), 'Ali Baba himself');
  assert.equal(L.rankFor(89), 'Clever Morgiana');
  assert.equal(L.rankFor(60), 'Clever Morgiana');
  assert.equal(L.rankFor(30), 'Honest Woodcutter');
  assert.equal(L.rankFor(29), 'Greedy Kasim');
  assert.equal(L.rankFor(0), 'Greedy Kasim');
});

// ------------------------------------------------------------------- HTTP

test('full ledger: start, bribe, Captain, miss, peek, win, finish, leaderboard', async (t) => {
  const s = await boot();
  t.after(s.close);
  const oath = oathFor('Friday');

  const start = await s.call('POST', '/api/ledger/start', { name: 'Morgiana', tz: 'Asia/Kolkata' });
  assert.equal(start.status, 201);
  const id = start.json.gameId;
  assert.equal(start.json.gold, 100);
  assert.equal(start.json.weekday, 'Friday');
  assert.match(start.json.note, /Never write a real password/);

  const v = await s.call('POST', `/api/ledger/${id}/validate`, { oath: 'Map XL' });
  assert.equal(v.status, 200);
  assert.equal(v.json.allPassed, false);
  assert.equal(v.json.results.length, 12);
  assert.equal(v.json.candle.lit, true);
  assert.equal(v.json.results.find((r) => r.id === 'scribe').passed, true);

  const b1 = await s.call('POST', `/api/ledger/${id}/bribe`, { thief: 3 });
  assert.equal(b1.json.gold, 90);
  assert.match(b1.json.plain, /add up to exactly 40/);
  const b2 = await s.call('POST', `/api/ledger/${id}/bribe`, { thief: 'weigher' });
  assert.equal(b2.json.alreadyPaid, true, 'the same bribe is never paid twice');
  assert.equal(b2.json.gold, 90);
  const asleep = await s.call('POST', `/api/ledger/${id}/bribe`, { thief: 12 });
  assert.equal(asleep.status, 403);

  const early = await s.call('POST', `/api/ledger/${id}/captain`, { oath: 'Map XL' });
  assert.equal(early.status, 409);
  assert.equal(early.json.error.code, 'OATH_NOT_READY');
  assert.ok(Array.isArray(early.json.error.details.results));

  const cap = await s.call('POST', `/api/ledger/${id}/captain`, { oath });
  assert.equal(cap.status, 200);
  assert.equal(cap.json.status, 'captain');
  assert.equal((await s.call('POST', `/api/ledger/${id}/validate`, { oath })).status, 409, 'no rewriting before the Captain');

  s.state.now += 30_000;
  const miss = await s.call('POST', `/api/ledger/${id}/swear`, { oath, attempt: 'XL Friday wrong' });
  assert.equal(miss.json.won, false);
  assert.equal(miss.json.correct, 10);
  assert.equal(miss.json.total, L.len(oath));
  assert.equal(miss.json.gold, 85);

  const longer = await s.call('POST', `/api/ledger/${id}/swear`, { oath, attempt: oath + '!' });
  assert.equal(longer.json.saidTooMuch, true);
  assert.equal(longer.json.gold, 80);

  const pk = await s.call('POST', `/api/ledger/${id}/peek`);
  assert.equal(pk.json.gold, 55);

  const notYet = await s.call('POST', `/api/ledger/${id}/finish`, {});
  assert.equal(notYet.status, 409);

  s.state.now += 10_000;
  const won = await s.call('POST', `/api/ledger/${id}/swear`, { oath, attempt: oath });
  assert.equal(won.json.won, true);
  assert.equal(won.json.gold, 55);
  assert.equal(won.json.title, 'Honest Woodcutter');
  assert.equal(won.json.elapsedMs, 40_000);

  s.state.now += 60_000; // dawdling over the name does not count
  const fin = await s.call('POST', `/api/ledger/${id}/finish`, {});
  assert.equal(fin.status, 200);
  assert.equal(fin.json.name, 'Morgiana');
  assert.equal(fin.json.elapsedMs, 40_000);
  assert.equal(fin.json.place, 1);
  assert.equal((await s.call('POST', `/api/ledger/${id}/finish`, {})).status, 409);

  const board = await s.call('GET', '/api/ledger/leaderboard?limit=5');
  assert.equal(board.json.entries.length, 1);
  assert.deepEqual(
    { name: board.json.entries[0].name, gold: board.json.entries[0].gold, title: board.json.entries[0].title },
    { name: 'Morgiana', gold: 55, title: 'Honest Woodcutter' }
  );

  // The oath must never reach the database.
  const dump = JSON.stringify([s.db.prepare('SELECT * FROM ledger_games').all(), s.db.prepare('SELECT * FROM ledger_bribes').all()]);
  assert.equal(dump.includes('emases'), false);
  assert.equal(dump.includes('XL Friday'), false);
});

test('the candle burns for six minutes, then the Night Watch wakes', async (t) => {
  const s = await boot();
  t.after(s.close);
  const id = (await s.call('POST', '/api/ledger/start', {})).json.gameId;
  const noDawn = oathFor('Friday').replace('dawn', 'dusk');

  const unlit = await s.call('POST', `/api/ledger/${id}/validate`, { oath: '' });
  assert.equal(unlit.json.candle.lit, false, 'an empty oath does not light the candle');

  await s.call('POST', `/api/ledger/${id}/validate`, { oath: 'x' });
  s.state.now += 359_000;
  const before = await s.call('POST', `/api/ledger/${id}/validate`, { oath: noDawn });
  assert.equal(before.json.candle.nightWatch, false);
  assert.equal(before.json.candle.secondsLeft, 1);

  s.state.now += 2_000;
  const after = await s.call('POST', `/api/ledger/${id}/validate`, { oath: noDawn });
  assert.equal(after.json.candle.nightWatch, true);
  assert.equal(after.json.results.length, 13);
  assert.equal(after.json.allPassed, false);
  assert.equal(after.json.candle.secondsLeft, 359, 'the candle relights');

  assert.equal((await s.call('POST', `/api/ledger/${id}/captain`, { oath: noDawn })).status, 409);
  assert.equal((await s.call('POST', `/api/ledger/${id}/captain`, { oath: oathFor('Friday') })).status, 200);
});

test('the candle does not burn while the recruit stands before the Captain', async (t) => {
  const s = await boot();
  t.after(s.close);
  const id = (await s.call('POST', '/api/ledger/start', {})).json.gameId;
  const oath = oathFor('Friday').replace('dawn', 'dusk');
  await s.call('POST', `/api/ledger/${id}/validate`, { oath });
  s.state.now += 100_000;
  assert.equal((await s.call('POST', `/api/ledger/${id}/captain`, { oath })).status, 200);
  s.state.now += 400_000;
  const back = await s.call('POST', `/api/ledger/${id}/back`);
  assert.equal(back.json.candle.nightWatch, false);
  const v = await s.call('POST', `/api/ledger/${id}/validate`, { oath });
  assert.equal(v.json.candle.nightWatch, false);
  assert.equal(v.json.candle.secondsLeft, 260);
});

test('gold never goes below zero and a light purse cannot bribe or peek', async (t) => {
  const s = await boot();
  t.after(s.close);
  const oath = oathFor('Friday');
  const id = (await s.call('POST', '/api/ledger/start', {})).json.gameId;
  for (let i = 0; i < 10; i++) assert.equal((await s.call('POST', `/api/ledger/${id}/bribe`, { thief: i })).status, 200);
  const light = await s.call('POST', `/api/ledger/${id}/bribe`, { thief: 10 });
  assert.equal(light.status, 409);
  assert.equal(light.json.error.code, 'PURSE_TOO_LIGHT');

  await s.call('POST', `/api/ledger/${id}/captain`, { oath });
  assert.equal((await s.call('POST', `/api/ledger/${id}/peek`)).status, 409);
  const miss = await s.call('POST', `/api/ledger/${id}/swear`, { oath, attempt: 'nope' });
  assert.equal(miss.json.gold, 0);
  assert.equal(miss.json.paid, 0);
  const won = await s.call('POST', `/api/ledger/${id}/swear`, { oath, attempt: oath });
  assert.equal(won.json.won, true, 'still winnable with an empty purse');
  assert.equal(won.json.title, 'Greedy Kasim');
});

test('bad input is refused without echoing the oath', async (t) => {
  const s = await boot();
  t.after(s.close);
  assert.equal((await s.call('POST', '/api/ledger/start', { name: '<script>' })).status, 400);
  assert.equal((await s.call('POST', '/api/ledger/start', { tz: 'Mars/Olympus' })).status, 400);
  const id = (await s.call('POST', '/api/ledger/start', {})).json.gameId;
  assert.equal((await s.call('POST', `/api/ledger/${id}/validate`, { oath: 42 })).status, 400);
  const tooLong = await s.call('POST', `/api/ledger/${id}/validate`, { oath: 'secret-'.repeat(20) });
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.text.includes('secret-'), false);
  assert.equal((await s.call('POST', '/api/ledger/nope/validate', { oath: 'x' })).status, 404);
});

test('the server hands out the game page with the online marker, and nothing else', async (t) => {
  const s = await boot();
  t.after(s.close);
  const page = await s.call('GET', '/');
  assert.equal(page.status, 200);
  assert.match(page.text, /<meta name="ledger-api" content="\/api\/ledger">/);
  assert.match(page.text, /The Thieves' Ledger/);
  assert.equal((await s.call('GET', '/backend/config.js')).status, 404);
  assert.equal((await s.call('GET', '/package.json')).status, 404);
});
