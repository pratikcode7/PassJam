// Deterministic per-game context. Same seed + same play date => same puzzle.

function seedFromString(str) {
  // xmur3 string hash -> 32-bit seed
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Destinations for the "torn ticket stubs" riddle (encoded as A=1, B=2, ...).
const TICKET_WORDS = ['bank', 'dock', 'port', 'mint', 'mall', 'park'];

// Shop receipts for the mutating riddle: [initial item prices], [prices after the vault shifts].
const stolen = (prices) => prices.reduce((a, b) => a + b, 0) - Math.max(...prices);

function makePrices(rng) {
  const set = new Set();
  while (set.size < 4) set.add(120 + 10 * Math.floor(rng() * 37)); // 120..480, all distinct
  return [...set];
}

/**
 * ctx fields
 *  - ticketWord:    the word hidden in the ticket-stub numbers (seeded)
 *  - prices:        4 prices on the first shop receipt (seeded)
 *  - pricesShifted: 4 prices on the replacement receipt after the vault mutates
 *  - mutated:       flips to true once the vault shifts (stored per game)
 *
 * The two receipts are guaranteed to give different answers, and neither answer
 * is a substring of the other, so an old answer can never satisfy the new rule.
 */
function buildContext(seed, playDate) {
  const rng = mulberry32(seedFromString(String(seed)));
  const ticketWord = TICKET_WORDS[Math.floor(rng() * TICKET_WORDS.length)];

  let prices = makePrices(rng);
  let pricesShifted = makePrices(rng);
  for (let i = 0; i < 100; i++) {
    const a = String(stolen(prices));
    const b = String(stolen(pricesShifted));
    if (a !== b && !a.includes(b) && !b.includes(a)) break;
    pricesShifted = makePrices(rng);
  }
  const a = String(stolen(prices));
  const b = String(stolen(pricesShifted));
  if (a === b || a.includes(b) || b.includes(a)) {
    prices = [150, 230, 310, 420];
    pricesShifted = [180, 260, 340, 450];
  }

  return { seed: String(seed), playDate, ticketWord, prices, pricesShifted, mutated: false };
}

const activePrices = (ctx) => (ctx.mutated ? ctx.pricesShifted : ctx.prices);

module.exports = { buildContext, activePrices, stolen, TICKET_WORDS };
