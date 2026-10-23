const BASE_SCORE = 1000;
const PENALTY_PER_SECOND = 3;
const PENALTY_PER_HINT = 75;

/** Server-side score. elapsedMs is measured by the server, never sent by the client. */
function computeScore({ elapsedMs, hintsUsed }) {
  const seconds = Math.floor(Math.max(0, Number(elapsedMs) || 0) / 1000);
  const hints = Math.max(0, Math.floor(Number(hintsUsed) || 0));
  const timePenalty = seconds * PENALTY_PER_SECOND;
  const hintPenalty = hints * PENALTY_PER_HINT;
  const score = Math.max(0, BASE_SCORE - timePenalty - hintPenalty);
  return { score, seconds, breakdown: { base: BASE_SCORE, timePenalty, hintPenalty } };
}

module.exports = { computeScore, BASE_SCORE, PENALTY_PER_SECOND, PENALTY_PER_HINT };
