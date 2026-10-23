/**
 * The Thieves' Ledger: the twelve thieves (and the Night Watch) as pure checks.
 * These mirror the rules in ../../index.html so the server can verify a recruit's oath.
 *
 * Thief shape: { index, id, numeral, name, plain(ctx), check(oath, ctx) }
 * ctx: { weekday: 'Friday', nightWatch: boolean }
 *
 * check() must be pure and must never log or store the oath.
 */

const SPICES = ['saffron', 'cumin', 'cinnamon', 'cardamom', 'clove', 'pepper', 'nutmeg', 'turmeric', 'ginger', 'sumac', 'anise', 'paprika'];
const CANDLE_SECONDS = 360;

// Count characters, not UTF-16 units, so emoji and ₹ count as one.
const len = (s) => Array.from(s).length;
const isPrime = (n) => {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
};
const digitSum = (s) => (s.match(/[0-9]/g) || []).reduce((a, d) => a + Number(d), 0);
const lower = (s) => s.toLowerCase();

function weekdayIn(tz, nowMs) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: tz }).format(new Date(nowMs));
}

const THIEVES = [
  { id: 'gatekeeper', name: 'The Gatekeeper', plain: () => 'At least 12 characters.', check: (p) => len(p) >= 12 },
  { id: 'tall-one', name: 'The Tall One', plain: () => 'At least one uppercase letter.', check: (p) => /\p{Lu}/u.test(p) },
  { id: 'scribe', name: 'The Scribe', plain: () => 'Contains XL, in capitals.', check: (p) => p.includes('XL') },
  { id: 'weigher', name: 'The Weigher', plain: () => 'All the digits add up to exactly 40.', check: (p) => digitSum(p) === 40 },
  { id: 'cartographer', name: 'The Cartographer', plain: () => 'Contains the word map.', check: (p) => lower(p).includes('map') },
  {
    id: 'spice-thief',
    name: 'The Spice Thief',
    plain: () => `Contains a spice: ${SPICES.join(', ')}.`,
    check: (p) => SPICES.some((s) => lower(p).includes(s)),
  },
  { id: 'eavesdropper', name: 'The Eavesdropper', plain: () => 'Contains emases, which is sesame backwards.', check: (p) => lower(p).includes('emases') },
  { id: 'toll-keeper', name: 'The Toll Keeper', plain: () => 'Contains a currency sign: $ € £ ¥ ₹ or ¢.', check: (p) => /[$€£¥₹¢]/u.test(p) },
  { id: 'wanderer', name: 'The Wanderer', plain: () => 'Contains the word steps.', check: (p) => lower(p).includes('steps') },
  {
    id: 'watchman',
    name: 'The Watchman',
    plain: (ctx) => `Contains today's weekday in English: ${ctx.weekday}.`,
    check: (p, ctx) => lower(p).includes(lower(ctx.weekday)),
  },
  { id: 'musician', name: 'The Musician', plain: () => 'Contains the word piano.', check: (p) => lower(p).includes('piano') },
  { id: 'mathematician', name: 'The Mathematician', plain: () => 'The total length must be a prime number.', check: (p) => isPrime(len(p)) },
];

const NIGHT_WATCH = { id: 'night-watch', name: 'The Night Watch', plain: () => 'Contains the word dawn.', check: (p) => lower(p).includes('dawn') };

const ALL = [...THIEVES, NIGHT_WATCH];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII'];
ALL.forEach((t, i) => Object.assign(t, { index: i, numeral: ROMAN[i] }));

/** The thieves an oath must satisfy right now. The Night Watch only counts once he is awake. */
const required = (ctx) => (ctx.nightWatch ? ALL : THIEVES);

/** Checks an oath against every thief that is awake. */
function checkOath(oath, ctx) {
  const results = required(ctx).map((t) => ({ index: t.index, id: t.id, numeral: t.numeral, passed: !!t.check(oath, ctx) }));
  return { results, allPassed: results.every((r) => r.passed) };
}

/** Finds a thief by 0-based index or by id. */
function findThief(ref) {
  if (Number.isInteger(ref)) return ALL[ref];
  if (typeof ref === 'string') return ALL.find((t) => t.id === ref);
  return undefined;
}

const rankFor = (gold) =>
  gold >= 90 ? 'Ali Baba himself' : gold >= 60 ? 'Clever Morgiana' : gold >= 30 ? 'Honest Woodcutter' : 'Greedy Kasim';

module.exports = { THIEVES, NIGHT_WATCH, ALL, SPICES, CANDLE_SECONDS, checkOath, findThief, required, weekdayIn, rankFor, len, isPrime };
