// Adds sample leaderboard rows so the board isn't empty during a demo.
// Usage: npm run seed
const crypto = require('crypto');
const config = require('../config');
const { openDb } = require('../db');
const { computeScore } = require('../services/scoring');

const SAMPLES = [
  { nickname: 'VaultBreaker', seconds: 74, hints: 0, mode: 'random' },
  { nickname: 'Riddler', seconds: 96, hints: 1, mode: 'daily' },
  { nickname: 'PuneCoder', seconds: 128, hints: 0, mode: 'random' },
  { nickname: 'SneakyLock', seconds: 151, hints: 2, mode: 'daily' },
  { nickname: 'NightOwl', seconds: 210, hints: 1, mode: 'random' },
  { nickname: 'Tumbler', seconds: 275, hints: 3, mode: 'random' },
  { nickname: 'Hackathon', seconds: 330, hints: 2, mode: 'daily' },
  { nickname: 'SlowAndSure', seconds: 410, hints: 4, mode: 'random' },
];

const db = openDb(config.dbPath);
const insert = db.prepare(
  `INSERT INTO games (id, seed, mode, play_date, started_at, solved_at, finished_at, duration_ms,
                      revealed, mutated, hints_used, validations, score, nickname, status)
   VALUES (@id, @seed, @mode, @playDate, @startedAt, @solvedAt, @finishedAt, @durationMs,
           8, 1, @hints, 0, @score, @nickname, 'finished')`
);

const now = Date.now();
const playDate = new Date(now).toISOString().slice(0, 10);

db.transaction(() => {
  for (const s of SAMPLES) {
    const durationMs = s.seconds * 1000;
    const { score } = computeScore({ elapsedMs: durationMs, hintsUsed: s.hints });
    insert.run({
      id: `seed-${crypto.randomUUID()}`,
      seed: s.mode === 'daily' ? `daily-${playDate}` : crypto.randomBytes(4).toString('hex'),
      mode: s.mode,
      playDate,
      startedAt: now - durationMs - 5000,
      solvedAt: now - 5000,
      finishedAt: now,
      durationMs,
      hints: s.hints,
      score,
      nickname: s.nickname,
    });
  }
})();

// Sample recruits for The Thieves' Ledger's Roll of Honour.
const RECRUITS = [
  { name: 'Morgiana', gold: 95, seconds: 212 },
  { name: 'Kasim the Younger', gold: 70, seconds: 301 },
  { name: 'Woodcutter of Pune', gold: 45, seconds: 266 },
  { name: 'Sly Hassan', gold: 20, seconds: 388 },
];
const insertRecruit = db.prepare(
  `INSERT INTO ledger_games (id, name, tz, started_at, lit_at, gold, solved_at, finished_at, duration_ms, status)
   VALUES (@id, @name, 'Asia/Kolkata', @startedAt, @startedAt, @gold, @solvedAt, @finishedAt, @durationMs, 'finished')`
);
db.transaction(() => {
  for (const r of RECRUITS) {
    const durationMs = r.seconds * 1000;
    insertRecruit.run({
      id: `seed-${crypto.randomUUID()}`,
      name: r.name,
      startedAt: now - durationMs - 5000,
      gold: r.gold,
      solvedAt: now - 5000,
      finishedAt: now,
      durationMs,
    });
  }
})();

console.log(`Seeded ${SAMPLES.length} Riddle Lock rows and ${RECRUITS.length} Ledger recruits into ${config.dbPath}`);
db.close();
