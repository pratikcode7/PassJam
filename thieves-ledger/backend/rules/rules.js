const { activePrices, stolen } = require('./context');

/**
 * Every rule is an "evidence" riddle: the text looks like a story, a note or a
 * receipt, but the answer is hidden in its structure (word lengths, first letters,
 * last letters, reversed text, number codes, logic, arithmetic).
 * The player must stop reading it as a story and start treating it as evidence.
 *
 * Rule shape:
 *  { id, title, difficulty (1-5), riddle(ctx), format, hint(ctx), answer(ctx), check(password, ctx) }
 *
 * answer(ctx) is the string that has to appear in the password. It is NEVER sent
 * to the client. check() must be pure and must never log or store the password.
 */

const has = (pw, needle) => pw.toLowerCase().includes(needle);
const alphaNumbers = (word) => [...word].map((c) => c.charCodeAt(0) - 96).join(' · ');

const SHOP_ITEMS = ['Watch', 'Ring', 'Necklace', 'Camera'];
const SHOP_ITEMS_SHIFTED = ['Violin', 'Painting', 'Statue', 'Laptop'];
const receiptLines = (names, prices) =>
  names.map((n, i) => `${n} ${'.'.repeat(14 - n.length)} $${prices[i]}`).join('\n');

const EVIDENCE_RULES = [
  {
    id: 'thief-message',
    title: 'The Thief Left a Message',
    difficulty: 1,
    riddle: () =>
      [
        'I came in through the door.',
        '',
        'I left through the window.',
        '',
        'I took nothing.',
        '',
        'I left something behind.',
        '',
        'D O O R',
        'W I N D O W',
        'N O T H I N G',
        '',
        'What did I leave?',
      ].join('\n'),
    format: 'Digits only, written together.',
    hint: () =>
      'Stop searching for an object. This is evidence, not a story. Count the letters in D O O R, W I N D O W and N O T H I N G, then write the three numbers side by side.',
    answer: () => '467', // DOOR=4, WINDOW=6, NOTHING=7
    check: (pw) => pw.includes('467'),
  },
  {
    id: 'guard-report',
    title: "The Guard's Report",
    difficulty: 2,
    riddle: () =>
      [
        'Security report, filed by the night guard:',
        '',
        'Several guards were asleep.',
        'All the cameras were turned away.',
        'Fingerprints? Wiped clean.',
        'Every alarm stayed silent.',
        '',
        'The report is too clean. What was the thief after?',
      ].join('\n'),
    format: 'One word, lowercase.',
    hint: () => 'Do not read the sentences. Look at how each line begins.',
    answer: () => 'safe', // S-A-F-E
    check: (pw) => has(pw, 'safe'),
  },
  {
    id: 'ransom-note',
    title: 'The Ransom Note',
    difficulty: 3,
    riddle: () =>
      [
        'Ransom note, delivered by pigeon:',
        '',
        'Bring the old rope',
        'Burn every fax',
        'Order a taxi',
        'Leave at night',
        '',
        'The kidnapper is already gone. Which way did he go?',
      ].join('\n'),
    format: 'One word, lowercase.',
    hint: () => 'Four lines. Forget the beginning of each one: look at how every line ends.',
    answer: () => 'exit', // rop-E, fa-X, tax-I, nigh-T
    check: (pw) => has(pw, 'exit'),
  },
  {
    id: 'lipstick-mirror',
    title: 'Lipstick on the Mirror',
    difficulty: 3,
    riddle: () =>
      [
        'Something is written on the bathroom mirror, in lipstick:',
        '',
        'ELBAT EHT REDNU',
        '',
        'The thief wanted it read in the mirror. Where is the loot hidden?',
      ].join('\n'),
    format: 'One word, lowercase.',
    hint: () => 'Hold it up to a mirror, or just read it from the other end.',
    answer: () => 'table', // UNDER THE TABLE
    check: (pw) => has(pw, 'table'),
  },
  {
    id: 'ticket-stubs',
    title: 'Torn Ticket Stubs',
    difficulty: 3,
    riddle: (ctx) =>
      [
        "Torn ticket stubs found in the thief's coat, numbered in the order he used them:",
        '',
        alphaNumbers(ctx.ticketWord),
        '',
        'Where did he go next?',
      ].join('\n'),
    format: 'One word, lowercase.',
    hint: () => 'Numbers can be letters. A is 1, B is 2, C is 3...',
    answer: (ctx) => ctx.ticketWord,
    check: (pw, ctx) => has(pw, ctx.ticketWord),
  },
  {
    id: 'line-up',
    title: 'The Line-Up',
    difficulty: 4,
    riddle: () =>
      [
        'Four suspects. One thief. The thief is the only one who lied.',
        '',
        'Anna: "Raj did it."',
        'Raj: "I did not do it."',
        'Mira: "Anna did it."',
        'Dev: "I did not do it."',
        '',
        'Who is the thief?',
      ].join('\n'),
    format: 'One name, lowercase.',
    hint: () =>
      'Try each suspect as the thief in turn. Only one choice leaves the other three telling the truth.',
    answer: () => 'anna',
    check: (pw) => has(pw, 'anna'),
  },
  {
    // TWIST: this is the riddle the vault mutates (see MUTATION_REVEAL).
    id: 'shop-receipt',
    title: 'The Shop Receipt',
    difficulty: 4,
    riddle: (ctx) =>
      ctx.mutated
        ? [
            'The vault shudders, and a fresh receipt slides out from under the door:',
            '',
            receiptLines(SHOP_ITEMS_SHIFTED, ctx.pricesShifted),
            '',
            'Same thief, same habit: he left the most expensive item behind. How many dollars did he take?',
          ].join('\n')
        : [
            'Receipt left on the shop counter:',
            '',
            receiptLines(SHOP_ITEMS, ctx.prices),
            '',
            'The thief took everything except the most expensive item. How many dollars did he take?',
          ].join('\n'),
    format: 'Digits only.',
    hint: () => 'Add up every price, then take away the single biggest one.',
    answer: (ctx) => String(stolen(activePrices(ctx))),
    check: (pw, ctx) => pw.includes(String(stolen(activePrices(ctx)))),
  },
];

/**
 * Finale: the vault inspector wants the evidence filed in the order it was found.
 * Every answer must appear in the password, in riddle order, without overlapping.
 */
function chainOfEvidence(pw, ctx) {
  if (pw.length === 0 || pw.length > 40 || has(pw, 'password')) return false;
  const lower = pw.toLowerCase();
  let pos = 0;
  for (const rule of EVIDENCE_RULES) {
    const idx = lower.indexOf(rule.answer(ctx), pos);
    if (idx < 0) return false;
    pos = idx + rule.answer(ctx).length;
  }
  return true;
}

const CHAIN_RULE = {
  id: 'chain-of-evidence',
  title: 'Chain of Evidence',
  difficulty: 5,
  riddle: () =>
    [
      'The vault inspector wants the evidence filed properly.',
      '',
      'Put every answer you found into ONE password, in the order of the riddles (the first riddle\'s answer first, the last riddle\'s answer last), with no overlaps.',
      '',
      'The vault is small: 40 characters at most. And the word "password" is banned, obviously.',
    ].join('\n'),
  format: 'Letters or symbols between the answers are fine.',
  hint: () =>
    "Riddle 1's answer goes first and the shop receipt's answer last. Anything in between is allowed, but stay within 40 characters.",
  answer: () => '',
  check: chainOfEvidence,
};

const RULES = [...EVIDENCE_RULES, CHAIN_RULE];

// The vault shifts the moment rule 8 unlocks (i.e. rules 1-7 have all passed once).
const MUTATION_REVEAL = 8;
const MUTATED_RULE_ID = 'shop-receipt';

module.exports = { RULES, EVIDENCE_RULES, MUTATION_REVEAL, MUTATED_RULE_ID };
