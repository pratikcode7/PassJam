const { RULES, MUTATION_REVEAL, MUTATED_RULE_ID } = require('./rules');

/**
 * Pure evaluation of a password against the rules.
 *
 * - Rules unlock one at a time: rule N+1 appears once rules 1..N all pass.
 * - TWIST: when rule 8 unlocks for the first time the vault "mutates":
 *   the shop receipt is replaced with new prices and re-evaluated immediately.
 * - `won` is true only when ALL rules pass at the same time.
 *
 * Never logs or stores the password.
 */
function evaluate(password, ctx, revealed) {
  const events = [];
  let c = { ...ctx };
  let r = revealed;
  let results = RULES.map((rule) => rule.check(password, c));

  while (r < RULES.length && results.slice(0, r).every(Boolean)) {
    r += 1;
    if (r === MUTATION_REVEAL && !c.mutated) {
      c = { ...c, mutated: true };
      events.push({
        type: 'mutation',
        ruleId: MUTATED_RULE_ID,
        message: 'The vault shudders and slides out a fresh receipt. The old numbers no longer count!',
      });
      results = RULES.map((rule) => rule.check(password, c));
    }
  }

  return { results, revealed: r, ctx: c, events, won: results.every(Boolean) };
}

const publicRule = (rule, index, ctx, passed) => ({
  id: rule.id,
  order: index + 1,
  title: rule.title,
  difficulty: rule.difficulty,
  riddle: rule.riddle(ctx),
  format: rule.format,
  ...(passed === undefined ? {} : { passed }),
});

module.exports = { evaluate, publicRule };
