const test = require('node:test');
const assert = require('node:assert/strict');
const { RULES, EVIDENCE_RULES, MUTATION_REVEAL, MUTATED_RULE_ID } = require('../rules/rules');
const { buildContext, stolen, TICKET_WORDS } = require('../rules/context');
const { evaluate, publicRule } = require('../rules/engine');
const { solve } = require('../services/solver');

// A hand-built context so the expected answers are easy to verify by eye:
//   first receipt:   150 + 230 + 310 + 420 = 1110, minus the dearest (420) = 690
//   shifted receipt: 180 + 260 + 340 + 450 = 1230, minus the dearest (450) = 780
const ctx = {
  seed: 'unit',
  playDate: '2026-10-23',
  ticketWord: 'bank',
  prices: [150, 230, 310, 420],
  pricesShifted: [180, 260, 340, 450],
  mutated: false,
};
const mutatedCtx = { ...ctx, mutated: true };

// At least one passing and one failing example for EVERY rule.
const CASES = {
  'thief-message': { pass: ['467', 'x467x'], fail: ['4-6-7', '476', '4 6 7', ''] },
  'guard-report': { pass: ['safe', 'xSAFEx'], fail: ['sage', 'sa fe', ''] },
  'ransom-note': { pass: ['exit', 'EXIT!'], fail: ['exot', 'enter', ''] },
  'lipstick-mirror': { pass: ['table', 'Table1'], fail: ['tabel', 'elbat', ''] },
  'ticket-stubs': { pass: ['bank', 'xBANKx'], fail: ['dock', 'ban k', ''] },
  'line-up': { pass: ['anna', 'Anna'], fail: ['raj', 'mira', 'dev', ''] },
  'shop-receipt': { pass: ['690', 'x690y'], fail: ['780', '69', '1110', ''] },
  'chain-of-evidence': {
    pass: ['467-safe-exit-table-bank-anna-690', '467safeexittablebankanna690'],
    fail: [
      'safe-467-exit-table-bank-anna-690', // out of order
      '467-safe-exit-table-bank-anna', // missing the receipt answer
      'x'.repeat(10) + '467-safe-exit-table-bank-anna-690', // 43 characters: too long
      '467safeexittablebankanna690password', // banned word
      '',
    ],
  },
};

test('every rule has test cases and a well-formed definition', () => {
  const ids = RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'rule ids are unique');
  assert.ok(RULES.length >= 8, 'at least 8 rules');
  for (const rule of RULES) {
    assert.ok(CASES[rule.id], `missing test cases for ${rule.id}`);
    assert.equal(typeof rule.riddle(ctx), 'string');
    assert.equal(typeof rule.hint(ctx), 'string');
    assert.equal(typeof rule.format, 'string');
    assert.ok(rule.difficulty >= 1 && rule.difficulty <= 5);
  }
});

test('difficulty never decreases down the list (ramp)', () => {
  for (let i = 1; i < RULES.length; i++) {
    assert.ok(RULES[i].difficulty >= RULES[i - 1].difficulty, `${RULES[i].id} breaks the ramp`);
  }
});

for (const rule of RULES) {
  test(`rule ${rule.id}: passing examples pass`, () => {
    for (const pw of CASES[rule.id].pass) {
      assert.equal(rule.check(pw, ctx), true, `expected pass: ${JSON.stringify(pw)}`);
    }
  });
  test(`rule ${rule.id}: failing examples fail`, () => {
    for (const pw of CASES[rule.id].fail) {
      assert.equal(rule.check(pw, ctx), false, `expected fail: ${JSON.stringify(pw)}`);
    }
  });
}

test('the riddles really do hide their answers in the structure', () => {
  // Each answer is derivable from the text with the trick the hint describes.
  const text = (id) => RULES.find((r) => r.id === id).riddle(ctx);

  const t = text('thief-message');
  assert.deepEqual(['DOOR', 'WINDOW', 'NOTHING'].map((w) => w.length), [4, 6, 7]);
  assert.match(t, /D O O R\nW I N D O W\nN O T H I N G/);

  const guardLines = text('guard-report').split('\n').slice(2, 6);
  assert.equal(guardLines.map((l) => l[0]).join('').toLowerCase(), 'safe');

  const ransomLines = text('ransom-note').split('\n').slice(2, 6);
  assert.equal(ransomLines.map((l) => l.trim().slice(-1)).join(''), 'exit');

  const mirror = text('lipstick-mirror').split('\n')[2];
  assert.equal([...mirror].reverse().join('').toLowerCase(), 'under the table');

  const stubs = text('ticket-stubs').split('\n')[2].split(' · ').map(Number);
  assert.equal(stubs.map((n) => String.fromCharCode(96 + n)).join(''), 'bank');
});

test('riddle text never contains its own answer', () => {
  for (const rule of EVIDENCE_RULES) {
    if (rule.id === 'line-up') continue; // suspects' names are part of the story
    assert.equal(rule.riddle(ctx).toLowerCase().includes(rule.answer(ctx)), false, rule.id);
  }
});

test('shop-receipt switches to the shifted receipt after the vault mutates', () => {
  const rule = RULES.find((r) => r.id === MUTATED_RULE_ID);
  assert.equal(rule.check('690', ctx), true);
  assert.equal(rule.check('690', mutatedCtx), false);
  assert.equal(rule.check('780', mutatedCtx), true);
  assert.match(rule.riddle(ctx), /\$420/);
  assert.match(rule.riddle(mutatedCtx), /\$450/);
  assert.match(rule.riddle(mutatedCtx), /fresh receipt/);
  assert.equal(stolen([150, 230, 310, 420]), 690);
});

test('chain-of-evidence follows the active (mutated) receipt answer', () => {
  const rule = RULES.find((r) => r.id === 'chain-of-evidence');
  const old = '467-safe-exit-table-bank-anna-690';
  assert.equal(rule.check(old, ctx), true);
  assert.equal(rule.check(old, mutatedCtx), false);
  assert.equal(rule.check('467-safe-exit-table-bank-anna-780', mutatedCtx), true);
});

test('buildContext is deterministic and receipts never collide', () => {
  assert.deepEqual(buildContext('abc', '2026-01-05'), buildContext('abc', '2026-01-05'));
  const words = new Set();
  for (let i = 0; i < 500; i++) {
    const c = buildContext(`s${i}`, '2026-10-23');
    assert.ok(TICKET_WORDS.includes(c.ticketWord));
    words.add(c.ticketWord);
    for (const list of [c.prices, c.pricesShifted]) {
      assert.equal(list.length, 4);
      assert.equal(new Set(list).size, 4, 'prices are distinct so the dearest item is unambiguous');
      assert.ok(list.every((p) => p >= 120 && p <= 480 && p % 10 === 0));
    }
    const a = String(stolen(c.prices));
    const b = String(stolen(c.pricesShifted));
    assert.notEqual(a, b);
    assert.equal(a.includes(b) || b.includes(a), false, 'old answer must never satisfy the new receipt');
  }
  assert.ok(words.size > 1, 'the seed varies the ticket word');
});

test('publicRule never exposes answers or check logic', () => {
  const view = publicRule(RULES[0], 0, ctx, true);
  assert.deepEqual(Object.keys(view).sort(), ['difficulty', 'format', 'id', 'order', 'passed', 'riddle', 'title']);
});

test('engine: rules unlock one at a time and stay unlocked', () => {
  let out = evaluate('', ctx, 1);
  assert.equal(out.revealed, 1);
  out = evaluate('467', ctx, 1); // passes rule 1 only
  assert.equal(out.revealed, 2);
  out = evaluate('', ctx, out.revealed); // now fails everything, rule 2 stays unlocked
  assert.equal(out.revealed, 2);
  assert.equal(out.won, false);
});

test('engine: the vault mutates exactly when the last rule unlocks', () => {
  const phase1 = solve(ctx, { mutated: false });
  const out = evaluate(phase1, ctx, 1);
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].type, 'mutation');
  assert.equal(out.events[0].ruleId, MUTATED_RULE_ID);
  assert.equal(out.ctx.mutated, true);
  assert.equal(out.revealed, MUTATION_REVEAL); // the chain rule is now visible
  const receiptIndex = RULES.findIndex((r) => r.id === MUTATED_RULE_ID);
  assert.equal(out.results[receiptIndex], false, 'the old receipt answer no longer works');
  assert.equal(out.won, false);

  // Already mutated: no second event, and the new answer wins.
  const phase2 = solve(ctx, { mutated: true });
  const won = evaluate(phase2, out.ctx, out.revealed);
  assert.equal(won.events.length, 0);
  assert.equal(won.won, true);
  assert.equal(won.revealed, RULES.length);
});

test('solver: a valid password exists for many seeds and both phases', () => {
  for (let s = 0; s < 200; s++) {
    const c = buildContext(`seed${s}`, '2026-10-23');
    for (const mutated of [false, true]) {
      const pw = solve(c, { mutated });
      assert.ok(pw.length <= 40, `seed${s}: ${pw.length} chars`);
      assert.ok(RULES.every((r) => r.check(pw, { ...c, mutated })), `seed${s}`);
    }
  }
});
