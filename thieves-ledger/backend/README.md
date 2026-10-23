# Riddle Lock: backend

Backend for **Riddle Lock: The Pedantic Vault**, a browser puzzle game where the password is the puzzle.
A thief has hit the vault. Players forge a password out of the answers to 8 *evidence riddles* that unlock one at a time.

**The riddles:** each one looks like a story, a note or a receipt, but the answer is hidden in its structure
(word lengths, first letters, last letters, mirror writing, number codes, logic, arithmetic). The player has to stop
treating the text as a story and start treating it as evidence.

**The twist:** the moment the last rule unlocks, the vault *mutates*. A fresh shop receipt slides out with new
items and prices, so the answer you already filed stops working and you must rework the password.
Prices and the ticket-stub word come from a per-game seed, so every game plays differently.

Node 20+ · Express 5 · SQLite (better-sqlite3) · no external services.

## Run it

```bash
npm install
cp .env.example .env     # optional, every value has a default
npm start                # http://localhost:3000
npm test                 # 40 tests: every rule, scoring, full game over HTTP
npm run verify           # proves a valid password exists for 500 seeds x 31 days x both phases
npm run seed             # fills the leaderboard with sample rows for demos
```

## API

All bodies are JSON. Every error looks like `{ "error": { "code": "...", "message": "..." } }`.
Every game response carries `"note": "This is a game. Do not use a real password."`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/game/start` | New game. Body (all optional): `{ "mode": "random"\|"daily", "seed": "abc", "tz": "Asia/Kolkata" }` |
| POST | `/api/game/:id/validate` | Body `{ "password": "..." }`. Returns pass/fail for every unlocked rule |
| POST | `/api/game/:id/hint` | Body `{ "ruleId": "sky-test" }` (or 1-based order). First hint per rule costs 75 points |
| GET | `/api/game/:id` | Current state (unlocked rules, time, hints) |
| POST | `/api/game/:id/finish` | Body `{ "nickname": "Ada" }`. Only after winning. Saves the score |
| GET | `/api/leaderboard?limit=10&mode=daily` | Top scores (limit 1-50, mode optional) |
| GET | `/api/daily?tz=Asia/Kolkata` | Today's shared seed |
| GET | `/api/health` | Liveness check |

### Example curl session

```bash
# 1. start
curl -s -X POST localhost:3000/api/game/start -H 'content-type: application/json' -d '{}'
# -> { "gameId": "…", "seed": "9f3a1c02", "playDate": "2026-10-23", "rules": [ rule 1 ], … }

ID=<gameId from above>

# 2. try a password
curl -s -X POST localhost:3000/api/game/$ID/validate -H 'content-type: application/json' \
     -d '{"password":"467-safe-exit"}'

# 3. need help? (costs 75 points, repeating the same hint is free)
curl -s -X POST localhost:3000/api/game/$ID/hint -H 'content-type: application/json' -d '{"ruleId":"thief-message"}'

# 4. once validate says "won": true
curl -s -X POST localhost:3000/api/game/$ID/finish -H 'content-type: application/json' -d '{"nickname":"Ada"}'

# 5. leaderboard
curl -s 'localhost:3000/api/leaderboard?limit=10'
```

### What `validate` returns

```jsonc
{
  "status": "active",            // "solved" once every rule passes at the same time
  "won": false,
  "canFinish": false,
  "solvedCount": 8, "revealedCount": 9, "totalRules": 12,
  "mutated": true,
  "rules": [ { "id": "guard-report", "order": 2, "title": "The Guard\'s Report", "riddle": "…multi-line text…",
               "format": "One word, lowercase.", "difficulty": 2, "passed": true }, … ],
  "newlyUnlocked": ["chain-of-evidence"],   // rule ids that appeared on this call
  "events": [ { "type": "mutation", "ruleId": "shop-receipt", "message": "The vault shudders…" } ],
  "hintsUsed": 0, "elapsedMs": 41230,
  "vaultMessage": "Getting warmer. Do not break anything.",
  "note": "This is a game. Do not use a real password."
}
```

When `events` contains a `mutation`, re-render rule `shop-receipt` from the `rules` array: its riddle text
changed (a new receipt) and it flips back to failing.

`riddle` is multi-line text. Render it with `white-space: pre-line` (or `pre-wrap`) so line breaks and spacing
survive, e.g. the spaced-out `D O O R` lines. `format` is a short answer-format line to show under it.

## Riddles (easy to hard)

Each answer is a string that must appear in the password (case-insensitive for words). The full answer key is
below, so keep this file private if you demo the game to judges who haven't played yet.

| # | Riddle | The trick | Answer |
|---|---|---|---|
| 1 | **The Thief Left a Message** (`thief-message`) | "I came in through the door..." Stop searching for an object. Count the letters in DOOR, WINDOW, NOTHING | `467` |
| 2 | **The Guard's Report** (`guard-report`) | A too-clean security report. Read the first letter of each line | `safe` |
| 3 | **The Ransom Note** (`ransom-note`) | Four lines. Read the last letter of each line | `exit` |
| 4 | **Lipstick on the Mirror** (`lipstick-mirror`) | `ELBAT EHT REDNU` is mirror writing: read it from the other end | `table` |
| 5 | **Torn Ticket Stubs** (`ticket-stubs`) | Numbers are letters (A=1, B=2...). The word is picked by the seed | `bank` / `dock` / `port` / `mint` / `mall` / `park` |
| 6 | **The Line-Up** (`line-up`) | Four suspects, only the thief lied. Logic: try each as the thief | `anna` |
| 7 | **The Shop Receipt** (`shop-receipt`) | Four seeded prices; the thief took everything except the dearest item. **Mutates** when rule 8 unlocks | total minus the highest price |
| 8 | **Chain of Evidence** (`chain-of-evidence`) | File every answer in ONE password, in riddle order, no overlaps, max 40 characters, no "password" | e.g. `467-safe-exit-table-bank-anna-690` |

Rule 8 is the meta-puzzle: after the shift, the receipt answer inside the chain has to be swapped for the new one.

Add or change riddles in `rules/rules.js`. Each rule is
`{ id, title, difficulty, riddle(ctx), format, hint(ctx), answer(ctx), check(pw, ctx) }`.
`answer` and `check` never leave the server. Seeded values live in `rules/context.js`.
To add a riddle, add it to `EVIDENCE_RULES` (the chain rule picks it up automatically), add a pass/fail case in
`tests/rules.test.js`, and run `npm run verify`.

## Privacy and security

- **Passwords are never stored or logged.** They exist only inside the `validate` call, are evaluated, and are dropped.
  There is no column anywhere that could hold one. Request logs contain method, path and status only.
- JSON parse errors never echo the request body (a syntax error message can contain a snippet of it).
- Input validation: password must be a string of at most 100 characters; body limit 2 KB.
- Answers and check logic are never sent to the client: the API returns riddle text, format line and pass/fail only.
- Rate limits per IP: `/validate` 120/min and `/start` 30/min by default (`.env`). **Debounce typing in the frontend (~300 ms).**
  Each game is also capped at 5000 validations.
- Scores are computed on the server from server-measured time. The clock stops when the vault opens, not when the
  nickname is submitted. Clients can't send a score.
- Games expire after 4 hours (`GAME_TTL_MINUTES`).
- CORS allows any `http://localhost:*` / `127.0.0.1:*` origin, plus `Origin: null` so a frontend opened by
  double-clicking `index.html` still works. Add deployed origins with `CORS_ORIGINS`.

## Scoring

`score = max(0, 1000 − 3 × seconds − 75 × hints)`. Leaderboard order: score, then faster time.

## Daily mode

`POST /api/game/start {"mode":"daily"}` uses the seed `daily-YYYY-MM-DD` for the player's timezone
(default `Asia/Kolkata`, override with `tz` or `DEFAULT_TZ`), so everyone gets the same puzzle that day.

## Connect the frontend

```js
const API = 'http://localhost:3000/api';
const post = (path, body) =>
  fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then(async (r) => { const j = await r.json(); if (!r.ok) throw j.error; return j; });

// start (the timezone only matters for the daily-mode seed)
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const game = await post('/game/start', { tz });             // game.gameId, game.rules

// validate while typing, debounced
let timer;
input.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const r = await post(`/game/${game.gameId}/validate`, { password: input.value });
    render(r.rules);                        // riddle + format + pass/fail per unlocked rule
    r.events.forEach(showMutationBanner);   // the vault shifted!
    if (r.won) showWinScreen();
  }, 300);
});

// hint, then finish
const hint = await post(`/game/${game.gameId}/hint`, { ruleId: 'thief-message' });
const done = await post(`/game/${game.gameId}/finish`, { nickname: 'Ada' });  // done.score, done.rank
const board = await fetch(`${API}/leaderboard?limit=10`).then((r) => r.json());
```

**Hackathon safety net:** the problem statement says the game must run in the browser. Keep your frontend's
local rule checks as a fallback so the game still plays if the server is down, and use this backend for the
leaderboard, daily seed and server-verified scores.

## Layout

```
server.js            entry point (port, db, graceful shutdown)
app.js               createApp({ db, clock, config }): middleware + routes (injectable for tests)
config.js            env-driven settings
routes/              game.js, leaderboard.js, daily.js
rules/               rules.js (the 8 riddles), context.js (seeded values), engine.js (unlock + mutation logic)
services/            gameService.js, scoring.js, vaultMessages.js, solver.js (tests only, not exposed)
middleware/          errors.js (consistent error format), rateLimit.js
db/index.js          SQLite schema
scripts/             seed.js, verify-solvable.js
tests/               rules, scoring, full-game API tests
```

## Assumptions

- Leaderboard is derived from the `games` table (finished rows), not a separate table.
- A custom `seed` is allowed on `/start` for practice and reproducible demos. It only changes the numeric targets.
- The play date (in the requested timezone) is stored per game and only feeds the daily seed.
- The unlock order is strict: rule N+1 appears once rules 1..N have passed together. Unlocks are permanent,
  but winning requires all 8 rules passing at the same moment.
