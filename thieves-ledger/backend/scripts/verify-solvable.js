// Proves every game seed has a valid password for BOTH phases of the twist.
// Usage: npm run verify [seedCount]   (default 500 seeds x 31 days x 2 phases)
const { buildContext } = require('../rules/context');
const { RULES } = require('../rules/rules');
const { evaluate } = require('../rules/engine');
const { solve } = require('../services/solver');

const seedCount = parseInt(process.argv[2], 10) || 500;
let checked = 0;
const failures = [];

for (let s = 0; s < seedCount; s++) {
  for (let day = 1; day <= 31; day++) {
    const ctx = buildContext(`verify-${s}`, `2026-10-${String(day).padStart(2, '0')}`);
    try {
      const first = solve(ctx, { mutated: false });
      const second = solve(ctx, { mutated: true });

      // End-to-end through the real engine: phase 1 triggers the shift, phase 2 wins.
      const a = evaluate(first, ctx, 1);
      const b = evaluate(second, a.ctx, a.revealed);
      if (!a.ctx.mutated || a.won || !b.won || b.revealed !== RULES.length) {
        throw new Error('engine did not follow the expected mutation -> win path');
      }
      checked += 2;
    } catch (e) {
      failures.push(`seed=verify-${s} day=${day}: ${e.message}`);
    }
  }
}

if (failures.length) {
  console.error(`FAILED: ${failures.length} unsolvable combination(s)`);
  failures.slice(0, 10).forEach((f) => console.error('  ' + f));
  process.exit(1);
}
console.log(`OK: ${checked} password phases verified (${seedCount} seeds x 31 days x 2 phases, ${RULES.length} rules).`);
