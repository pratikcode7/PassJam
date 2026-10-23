const test = require('node:test');
const assert = require('node:assert/strict');
const { computeScore, BASE_SCORE } = require('../services/scoring');

test('instant, hint-free solve earns the base score', () => {
  assert.equal(computeScore({ elapsedMs: 0, hintsUsed: 0 }).score, BASE_SCORE);
});

test('time costs 3 points per full second', () => {
  assert.equal(computeScore({ elapsedMs: 60_000, hintsUsed: 0 }).score, 820);
  assert.equal(computeScore({ elapsedMs: 60_999, hintsUsed: 0 }).score, 820); // partial second ignored
});

test('each hint costs 75 points', () => {
  const r = computeScore({ elapsedMs: 60_000, hintsUsed: 2 });
  assert.equal(r.score, 670);
  assert.deepEqual(r.breakdown, { base: 1000, timePenalty: 180, hintPenalty: 150 });
});

test('score never goes below zero', () => {
  assert.equal(computeScore({ elapsedMs: 10 * 60 * 60 * 1000, hintsUsed: 50 }).score, 0);
});

test('garbage input is clamped, not trusted', () => {
  assert.equal(computeScore({ elapsedMs: -5000, hintsUsed: -3 }).score, BASE_SCORE);
  assert.equal(computeScore({ elapsedMs: 'abc', hintsUsed: undefined }).score, BASE_SCORE);
});
