const QUIPS = [
  'Speak, mortal. What is the password?',
  'Is that all? My cat could crack that.',
  'Hmm. A detective. Barely.',
  'Oh, you can read between the lines. I will have to try harder.',
  'Impressive... for a human.',
  'The tumblers are starting to click...',
  'Getting warmer. Do not break anything.',
  'Almost... I smell a receipt.',
  'Last riddle. File the evidence in order.',
];

function vaultMessage({ passedCount, won, empty }) {
  if (won) return 'Impossible... the vault is open.';
  if (empty) return QUIPS[0];
  return QUIPS[Math.min(passedCount + 1, QUIPS.length - 1)];
}

module.exports = { vaultMessage };
