// Riddlelock rule set. Pure functions only, so it runs in the browser and in Node.
(function (root) {
  const letters = (p) => (p.match(/[a-z]/gi) || []).length;
  const digits = (p) => (p.match(/\d/g) || []).map(Number);
  const sum = (a) => a.reduce((s, n) => s + n, 0);
  const has = (p, w) => p.toLowerCase().includes(w);

  // Any palindrome of 3+ letters contains one of length 3 or 4 at its centre,
  // so checking those two sizes inside each run of letters is enough.
  function hasPalindrome(p) {
    const runs = p.toLowerCase().match(/[a-z]+/g) || [];
    return runs.some((r) => {
      for (let i = 0; i + 2 < r.length; i++) {
        if (r[i] === r[i + 2]) return true;
        if (i + 3 < r.length && r[i] === r[i + 3] && r[i + 1] === r[i + 2]) return true;
      }
      return false;
    });
  }

  function repeatedDigits(p) {
    const seen = {};
    digits(p).forEach((d) => (seen[d] = (seen[d] || 0) + 1));
    return Object.keys(seen).filter((d) => seen[d] > 1);
  }

  const RULES = [
    {
      id: 1,
      riddle: "I'm the number of legs on a spider. Your password must be at least me long.",
      hint: "At least 8 characters.",
      keeper: "Welcome. I'm <b>Tumbler</b>, keeper of this vault. Make me a password. I have… a few requirements.",
      check: (p) => p.length >= 8,
      status: (p) => `${p.length} / 8 characters`,
    },
    {
      id: 2,
      riddle: "I stand tall at the start of every name.",
      hint: "At least one UPPERCASE letter.",
      keeper: "Decent length. But it's so… lowercase. Give it some posture.",
      check: (p) => /[A-Z]/.test(p),
    },
    {
      id: 3,
      riddle: "I have keys but open no locks. Put me in your password.",
      hint: "Contains a musical instrument with 88 keys.",
      keeper: "Every vault deserves a soundtrack. Solve this one.",
      check: (p) => has(p, "piano"),
    },
    {
      id: 4,
      riddle: "I'm a face lying on its side, and I'm happy to see you.",
      hint: "Contains a happy emoticon, like :) or :D",
      keeper: "You look tense. Your password should look happier than you do.",
      check: (p) => /[:;=]-?[)DP]|\(-?[:;=]/.test(p),
    },
    {
      id: 5,
      riddle: "I have hands but I can't clap. I'm in your password too.",
      hint: "Contains something that tells time (5 letters).",
      keeper: "Tick tock. Literally.",
      check: (p) => has(p, "clock"),
    },
    {
      id: 6,
      riddle: "Count the letters of the thing with keys and the thing with hands. Write that total in digits.",
      hint: "Letters in the rule 3 answer + the rule 5 answer, written as a number.",
      keeper: "Now show your working. Maths is a password's best friend.",
      check: (p) => p.includes("10"),
    },
    {
      id: 7,
      riddle: "What goes up but never comes down? Write me the way a mirror would.",
      hint: "Your a _ _ … spelled backwards.",
      keeper: "Mirrors are the only honest thing in security.",
      check: (p) => has(p, "ega"),
    },
    {
      id: 8,
      riddle: "I begin where I end.",
      hint: "First and last character must be identical (case matters).",
      keeper: "I like a password with closure.",
      check: (p) => p.length >= 2 && p[0] === p[p.length - 1],
      status: (p) => (p.length ? `starts "${p[0]}" · ends "${p[p.length - 1]}"` : ""),
    },
    {
      id: 9,
      riddle: "I'm the sky on a clear day and the mood of a sad song.",
      hint: "Contains a colour: b _ _ e",
      keeper: "My favourite colour. Don't ask why. It's personal.",
      check: (p) => has(p, "blue"),
    },
    {
      id: 10,
      riddle: "Racecars, kayaks and noon all share a secret. Your password must share it too.",
      hint: "Contains a palindrome of 3+ letters in a row (e.g. wow, level).",
      keeper: "Now let's get symmetrical.",
      check: hasPalindrome,
    },
    {
      id: 11,
      riddle: "Balance the scales: what your digits add up to must equal how many letters you have.",
      hint: "Sum of all digits = number of letters (A–Z).",
      keeper: "Balance. Everything must be balanced. Count carefully.",
      check: (p) => letters(p) > 0 && sum(digits(p)) === letters(p),
      status: (p) => `digits add to ${sum(digits(p))} · letters: ${letters(p)}`,
    },
    {
      id: 12,
      riddle: "No digit likes to see its twin.",
      hint: "Each digit 0–9 may appear at most once.",
      keeper: "Final rule. Digits are territorial: no twins allowed.",
      check: (p) => repeatedDigits(p).length === 0,
      status: (p) => {
        const r = repeatedDigits(p);
        return r.length ? `twins: ${r.join(", ")}` : "";
      },
    },
  ];

  const api = { RULES, stats: { letters, digits, sum } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Riddlelock = api;
})(typeof window !== "undefined" ? window : globalThis);
