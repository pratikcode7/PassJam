// Constructive solver used by tests and `npm run verify`. It is NOT exposed through the API.
// It proves a password satisfying every rule exists for a given context by filing the
// answers in riddle order, then checking the result against the real rule engine.
const { RULES, EVIDENCE_RULES } = require('../rules/rules');

/**
 * @param ctx   context from buildContext()
 * @param opts  { mutated: boolean } which receipt (before or after the vault shifts) to satisfy
 * @returns a password that passes ALL rules for that phase, or throws.
 */
function solve(ctx, { mutated = false } = {}) {
  const c = { ...ctx, mutated };
  const pw = EVIDENCE_RULES.map((r) => r.answer(c)).join('-');
  if (!RULES.every((r) => r.check(pw, c))) {
    throw new Error(`No solution found for seed=${ctx.seed} mutated=${mutated}`);
  }
  return pw;
}

module.exports = { solve };
