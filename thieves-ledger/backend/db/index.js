const fs = require('fs');
const path = require('path');
// Node's built-in SQLite (Node 22.5+), so there is no native package to compile.
const { DatabaseSync } = require('node:sqlite');

// NOTE: there is intentionally no column anywhere that could hold a password.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id          TEXT PRIMARY KEY,
  seed        TEXT NOT NULL,
  mode        TEXT NOT NULL DEFAULT 'random' CHECK (mode IN ('random','daily')),
  play_date   TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  solved_at   INTEGER,
  finished_at INTEGER,
  duration_ms INTEGER,
  revealed    INTEGER NOT NULL DEFAULT 1,
  mutated     INTEGER NOT NULL DEFAULT 0,
  hints_used  INTEGER NOT NULL DEFAULT 0,
  validations INTEGER NOT NULL DEFAULT 0,
  score       INTEGER,
  nickname    TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','solved','finished'))
);

CREATE TABLE IF NOT EXISTS game_hints (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  PRIMARY KEY (game_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_games_leaderboard ON games (status, score DESC, duration_ms ASC);

-- The Thieves' Ledger. Again, no column can hold an oath.
CREATE TABLE IF NOT EXISTS ledger_games (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  tz           TEXT NOT NULL,
  started_at   INTEGER NOT NULL,
  lit_at       INTEGER,
  paused_ms    INTEGER NOT NULL DEFAULT 0,
  paused_since INTEGER,
  gold         INTEGER NOT NULL DEFAULT 100,
  misses       INTEGER NOT NULL DEFAULT 0,
  peeks        INTEGER NOT NULL DEFAULT 0,
  night_watch  INTEGER NOT NULL DEFAULT 0,
  validations  INTEGER NOT NULL DEFAULT 0,
  solved_at    INTEGER,
  finished_at  INTEGER,
  duration_ms  INTEGER,
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','captain','won','finished'))
);

CREATE TABLE IF NOT EXISTS ledger_bribes (
  game_id TEXT NOT NULL REFERENCES ledger_games(id) ON DELETE CASCADE,
  thief   INTEGER NOT NULL,
  PRIMARY KEY (game_id, thief)
);

CREATE INDEX IF NOT EXISTS idx_ledger_board ON ledger_games (status, gold DESC, duration_ms ASC);
`;

/**
 * Opens the database. The returned object keeps the small better-sqlite3 surface the
 * services use: prepare(sql) -> { run, get, all }, exec, pragma, transaction(fn), close.
 */
function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  const db = {
    prepare: (sql) => raw.prepare(sql),
    exec: (sql) => raw.exec(sql),
    pragma: (p) => raw.exec(`PRAGMA ${p}`),
    // transaction(fn) returns a function that runs fn inside BEGIN/COMMIT, rolling back on error.
    transaction: (fn) => (...args) => {
      raw.exec('BEGIN IMMEDIATE');
      try {
        const out = fn(...args);
        raw.exec('COMMIT');
        return out;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
    close: () => raw.close(),
  };
  if (file !== ':memory:') db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb };
