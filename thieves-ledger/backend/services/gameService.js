const crypto = require('crypto');
const { ApiError } = require('../middleware/errors');
const { buildContext } = require('../rules/context');
const { RULES } = require('../rules/rules');
const { evaluate, publicRule } = require('../rules/engine');
const { computeScore, PENALTY_PER_HINT } = require('./scoring');
const { vaultMessage } = require('./vaultMessages');

const NOTE = 'This is a game. Do not use a real password.';
const SEED_RE = /^[A-Za-z0-9_-]{1,32}$/;
const NICK_RE = /^[\p{L}\p{N} _.-]{1,20}$/u;

function localDate(tz, nowMs) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(nowMs));
  } catch {
    throw new ApiError(400, 'INVALID_TIMEZONE', 'Unknown timezone. Use an IANA name like "Asia/Kolkata".');
  }
}

function createGameService({ db, clock = Date.now, config }) {
  const q = {
    insert: db.prepare(
      `INSERT INTO games (id, seed, mode, play_date, started_at) VALUES (@id, @seed, @mode, @playDate, @startedAt)`
    ),
    get: db.prepare(`SELECT * FROM games WHERE id = ?`),
    update: db.prepare(
      `UPDATE games SET revealed=@revealed, mutated=@mutated, validations=@validations,
         solved_at=@solvedAt, status=@status WHERE id=@id`
    ),
    hintGet: db.prepare(`SELECT 1 FROM game_hints WHERE game_id=? AND rule_id=?`),
    hintAdd: db.prepare(`INSERT INTO game_hints (game_id, rule_id) VALUES (?, ?)`),
    hintBump: db.prepare(`UPDATE games SET hints_used = hints_used + 1 WHERE id = ?`),
    finish: db.prepare(
      `UPDATE games SET status='finished', finished_at=@finishedAt, duration_ms=@durationMs,
         score=@score, nickname=@nickname WHERE id=@id`
    ),
    rank: db.prepare(
      `SELECT COUNT(*) AS n FROM games WHERE status='finished'
         AND (score > @score OR (score = @score AND duration_ms < @durationMs))`
    ),
    board: db.prepare(
      `SELECT nickname, score, duration_ms, hints_used, mode, play_date, finished_at
         FROM games WHERE status='finished' AND (@mode IS NULL OR mode = @mode)
         ORDER BY score DESC, duration_ms ASC, finished_at ASC LIMIT @limit`
    ),
    purge: db.prepare(`DELETE FROM games WHERE status IN ('active','solved') AND started_at < ?`),
  };

  const ctxFor = (row, mutatedOverride) => ({
    ...buildContext(row.seed, row.play_date),
    mutated: mutatedOverride === undefined ? !!row.mutated : mutatedOverride,
  });

  const elapsedOf = (row) => (row.solved_at || clock()) - row.started_at;

  function load(id) {
    const row = typeof id === 'string' ? q.get.get(id) : undefined;
    if (!row) throw new ApiError(404, 'GAME_NOT_FOUND', 'No such game.');
    return row;
  }

  function assertFresh(row) {
    if (clock() - row.started_at > config.gameTtlMinutes * 60 * 1000) {
      throw new ApiError(410, 'GAME_EXPIRED', 'This game has expired. Start a new one.');
    }
  }

  function assertActive(row) {
    if (row.status !== 'active') {
      throw new ApiError(409, 'GAME_NOT_ACTIVE', 'This vault is already cracked. Finish the game or start a new one.');
    }
  }

  const revealedRules = (row, ctx, results) =>
    RULES.slice(0, row.revealed).map((r, i) => publicRule(r, i, ctx, results ? results[i] : undefined));

  // ---------------------------------------------------------------- start
  function startGame({ mode = 'random', seed, tz } = {}) {
    if (mode !== 'random' && mode !== 'daily') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'mode must be "random" or "daily".');
    }
    if (seed !== undefined && (typeof seed !== 'string' || !SEED_RE.test(seed))) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'seed must be 1-32 characters: letters, digits, _ or -.');
    }
    if (tz !== undefined && typeof tz !== 'string') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'tz must be a string.');
    }

    const now = clock();
    const playDate = localDate(tz || config.defaultTimezone, now);
    const finalSeed = mode === 'daily' ? `daily-${playDate}` : seed || crypto.randomBytes(4).toString('hex');
    const id = crypto.randomUUID();
    q.insert.run({ id, seed: finalSeed, mode, playDate, startedAt: now });

    const row = load(id);
    const ctx = ctxFor(row);
    return {
      gameId: id,
      mode,
      seed: finalSeed,
      playDate,
      totalRules: RULES.length,
      startedAt: now,
      rules: revealedRules(row, ctx),
      vaultMessage: vaultMessage({ passedCount: 0, empty: true }),
      note: NOTE,
    };
  }

  // ------------------------------------------------------------- get state
  function getGame(id) {
    const row = load(id);
    const ctx = ctxFor(row);
    return {
      gameId: row.id,
      status: row.status,
      mode: row.mode,
      seed: row.seed,
      playDate: row.play_date,
      totalRules: RULES.length,
      revealedCount: row.revealed,
      mutated: !!row.mutated,
      hintsUsed: row.hints_used,
      elapsedMs: elapsedOf(row),
      rules: revealedRules(row, ctx),
      note: NOTE,
    };
  }

  // -------------------------------------------------------------- validate
  // The password lives only in this function's scope: it is evaluated and dropped.
  function validate(id, password) {
    if (typeof password !== 'string') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'password must be a string.');
    }
    if (password.length > config.maxPasswordLength) {
      throw new ApiError(400, 'VALIDATION_ERROR', `password must be at most ${config.maxPasswordLength} characters.`);
    }

    return db.transaction(() => {
      const row = load(id);
      assertActive(row);
      assertFresh(row);
      if (row.validations >= config.maxValidationsPerGame) {
        throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Attempt limit reached for this game. Start a new one.');
      }

      const before = row.revealed;
      const out = evaluate(password, ctxFor(row), row.revealed);
      const now = clock();
      const status = out.won ? 'solved' : 'active';

      q.update.run({
        id: row.id,
        revealed: out.revealed,
        mutated: out.ctx.mutated ? 1 : 0,
        validations: row.validations + 1,
        solvedAt: out.won ? now : null,
        status,
      });

      const shown = RULES.slice(0, out.revealed);
      const passedCount = out.results.slice(0, out.revealed).filter(Boolean).length;
      return {
        gameId: row.id,
        status,
        won: out.won,
        canFinish: out.won,
        solvedCount: passedCount,
        revealedCount: out.revealed,
        totalRules: RULES.length,
        mutated: out.ctx.mutated,
        rules: shown.map((r, i) => publicRule(r, i, out.ctx, out.results[i])),
        newlyUnlocked: shown.slice(before).map((r) => r.id),
        events: out.events,
        hintsUsed: row.hints_used,
        elapsedMs: now - row.started_at,
        vaultMessage: vaultMessage({ passedCount, won: out.won, empty: password.length === 0 }),
        note: NOTE,
      };
    })();
  }

  // ------------------------------------------------------------------ hint
  function hint(id, ruleRef) {
    return db.transaction(() => {
      const row = load(id);
      assertActive(row);
      assertFresh(row);

      let index = -1;
      if (typeof ruleRef === 'string') index = RULES.findIndex((r) => r.id === ruleRef);
      else if (Number.isInteger(ruleRef)) index = ruleRef - 1;
      if (index < 0 || index >= RULES.length) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'ruleId must be a rule id or its 1-based order.');
      }
      if (index >= row.revealed) {
        throw new ApiError(403, 'RULE_NOT_REVEALED', 'That riddle has not been unlocked yet.');
      }

      const rule = RULES[index];
      const already = !!q.hintGet.get(row.id, rule.id);
      let hintsUsed = row.hints_used;
      if (!already) {
        q.hintAdd.run(row.id, rule.id);
        q.hintBump.run(row.id);
        hintsUsed += 1;
      }
      return {
        gameId: row.id,
        ruleId: rule.id,
        hint: rule.hint(ctxFor(row)),
        alreadyUsed: already,
        hintsUsed,
        penaltyPerHint: PENALTY_PER_HINT,
        note: NOTE,
      };
    })();
  }

  // ---------------------------------------------------------------- finish
  function finish(id, nickname) {
    let nick = 'Anonymous';
    if (nickname !== undefined && nickname !== null && String(nickname).trim() !== '') {
      if (typeof nickname !== 'string' || !NICK_RE.test(nickname.trim())) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'nickname must be 1-20 letters, digits, spaces, _ . or -.');
      }
      nick = nickname.trim();
    }

    return db.transaction(() => {
      const row = load(id);
      if (row.status === 'finished') throw new ApiError(409, 'ALREADY_FINISHED', 'This score was already saved.');
      if (row.status !== 'solved') {
        throw new ApiError(409, 'GAME_NOT_SOLVED', 'The vault is still locked. Solve every riddle first.');
      }
      // Time stops when the vault opened, not when the nickname was submitted.
      const durationMs = row.solved_at - row.started_at;
      const { score, seconds, breakdown } = computeScore({ elapsedMs: durationMs, hintsUsed: row.hints_used });
      q.finish.run({ id: row.id, finishedAt: clock(), durationMs, score, nickname: nick });
      const rank = q.rank.get({ score, durationMs }).n + 1;
      return { gameId: row.id, nickname: nick, score, seconds, elapsedMs: durationMs, hintsUsed: row.hints_used, rank, breakdown, note: NOTE };
    })();
  }

  // ----------------------------------------------------- leaderboard / daily
  function leaderboard({ limit = 10, mode } = {}) {
    const n = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    if (mode !== undefined && mode !== 'random' && mode !== 'daily') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'mode must be "random" or "daily".');
    }
    const rows = q.board.all({ limit: n, mode: mode || null });
    return {
      entries: rows.map((r, i) => ({
        rank: i + 1,
        nickname: r.nickname,
        score: r.score,
        elapsedMs: r.duration_ms,
        hintsUsed: r.hints_used,
        mode: r.mode,
        playDate: r.play_date,
        finishedAt: r.finished_at,
      })),
    };
  }

  function daily(tz) {
    const playDate = localDate(tz || config.defaultTimezone, clock());
    return { mode: 'daily', playDate, seed: `daily-${playDate}`, note: NOTE };
  }

  function purgeStale() {
    return q.purge.run(clock() - config.gameTtlMinutes * 2 * 60 * 1000).changes;
  }

  return { startGame, getGame, validate, hint, finish, leaderboard, daily, purgeStale };
}

module.exports = { createGameService, NOTE };
