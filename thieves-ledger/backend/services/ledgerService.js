const crypto = require('crypto');
const { ApiError } = require('../middleware/errors');
const L = require('../rules/ledger');

const NOTE = 'This is a game. Never write a real password in the ledger.';
const NAME_RE = /^[\p{L}\p{N} '’._-]{1,28}$/u;
const DEFAULT_NAME = 'The Nameless One';
const START_GOLD = 100;
const COST = { bribe: 10, miss: 5, peek: 25 };

/**
 * Server side of The Thieves' Ledger.
 *
 * The server keeps the purse, the candle and the clock, and it checks every oath.
 * The oath itself only lives inside a single request: it is checked and dropped,
 * and no table has a column that could hold it.
 *
 * The candle: it lights on the first non-empty oath and burns for 6 minutes.
 * It does not burn while the recruit stands before the Captain. Once it has burned
 * out, the Night Watch is awake for the rest of the game.
 */
function createLedgerService({ db, clock = Date.now, config }) {
  const q = {
    insert: db.prepare(`INSERT INTO ledger_games (id, name, tz, started_at, gold) VALUES (@id, @name, @tz, @startedAt, @gold)`),
    get: db.prepare(`SELECT * FROM ledger_games WHERE id = ?`),
    light: db.prepare(`UPDATE ledger_games SET lit_at = @now WHERE id = @id AND lit_at IS NULL`),
    validated: db.prepare(`UPDATE ledger_games SET validations = validations + 1, night_watch = MAX(night_watch, @nightWatch) WHERE id = @id`),
    gold: db.prepare(`UPDATE ledger_games SET gold = @gold WHERE id = @id`),
    bribeGet: db.prepare(`SELECT 1 FROM ledger_bribes WHERE game_id = ? AND thief = ?`),
    bribeAdd: db.prepare(`INSERT INTO ledger_bribes (game_id, thief) VALUES (?, ?)`),
    toCaptain: db.prepare(`UPDATE ledger_games SET status = 'captain', paused_since = @now, night_watch = MAX(night_watch, @nightWatch) WHERE id = @id`),
    back: db.prepare(`UPDATE ledger_games SET status = 'active', paused_ms = paused_ms + @delta, paused_since = NULL WHERE id = @id`),
    miss: db.prepare(`UPDATE ledger_games SET gold = @gold, misses = misses + 1 WHERE id = @id`),
    peek: db.prepare(`UPDATE ledger_games SET gold = @gold, peeks = peeks + 1 WHERE id = @id`),
    win: db.prepare(`UPDATE ledger_games SET status = 'won', solved_at = @now, paused_ms = paused_ms + @delta, paused_since = NULL WHERE id = @id`),
    finish: db.prepare(`UPDATE ledger_games SET status = 'finished', finished_at = @now, duration_ms = @durationMs, name = @name WHERE id = @id`),
    place: db.prepare(
      `SELECT COUNT(*) AS n FROM ledger_games WHERE status = 'finished'
         AND (gold > @gold OR (gold = @gold AND duration_ms < @durationMs))`
    ),
    board: db.prepare(
      `SELECT name, gold, duration_ms, night_watch, misses, peeks, finished_at FROM ledger_games
         WHERE status = 'finished' ORDER BY gold DESC, duration_ms ASC, finished_at ASC LIMIT @limit`
    ),
    purge: db.prepare(`DELETE FROM ledger_games WHERE status != 'finished' AND started_at < ?`),
  };

  // ------------------------------------------------------------- helpers
  function load(id) {
    const row = typeof id === 'string' ? q.get.get(id) : undefined;
    if (!row) throw new ApiError(404, 'GAME_NOT_FOUND', 'No such ledger. Start a new game.');
    return row;
  }
  function assertFresh(row) {
    if (clock() - row.started_at > config.gameTtlMinutes * 60 * 1000) {
      throw new ApiError(410, 'GAME_EXPIRED', 'This ledger has expired. Start a new game.');
    }
  }
  function assertStatus(row, ...allowed) {
    if (!allowed.includes(row.status)) {
      const msg = {
        active: 'The recruit is still writing the oath.',
        captain: 'The recruit stands before the Captain.',
        won: 'The recruit is already sworn in.',
        finished: 'This ledger is closed.',
      }[row.status];
      throw new ApiError(409, 'WRONG_STEP', `${msg} That cannot be done now.`);
    }
  }
  function assertOath(value, field) {
    if (typeof value !== 'string') throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be a string.`);
    if (value.length > config.maxPasswordLength) {
      throw new ApiError(400, 'VALIDATION_ERROR', `${field} must be at most ${config.maxPasswordLength} characters.`);
    }
  }
  function checkTz(tz) {
    try {
      L.weekdayIn(tz, clock());
      return tz;
    } catch {
      throw new ApiError(400, 'INVALID_TIMEZONE', 'Unknown timezone. Use an IANA name like "Asia/Kolkata".');
    }
  }

  // How long the candle has burned, in ms. Time before the Captain does not count.
  function burnedMs(row, now) {
    if (!row.lit_at) return 0;
    const pausedNow = row.paused_since ? now - row.paused_since : 0;
    return Math.max(0, now - row.lit_at - row.paused_ms - pausedNow);
  }
  function candle(row, now) {
    const burned = burnedMs(row, now);
    const nightWatch = !!row.night_watch || burned >= L.CANDLE_SECONDS * 1000;
    const secondsLeft = row.lit_at ? L.CANDLE_SECONDS - (Math.floor(burned / 1000) % L.CANDLE_SECONDS) : L.CANDLE_SECONDS;
    return { lit: !!row.lit_at, nightWatch, secondsLeft };
  }
  const ctxFor = (row, now, nightWatch) => ({ weekday: L.weekdayIn(row.tz, now), nightWatch });

  // ----------------------------------------------------------------- start
  function start({ name, tz } = {}) {
    let nm = DEFAULT_NAME;
    if (name !== undefined && name !== null && String(name).trim() !== '') {
      if (typeof name !== 'string' || !NAME_RE.test(name.trim())) {
        throw new ApiError(400, 'VALIDATION_ERROR', "name must be 1-28 letters, digits, spaces or ' . _ -");
      }
      nm = name.trim();
    }
    if (tz !== undefined && typeof tz !== 'string') throw new ApiError(400, 'VALIDATION_ERROR', 'tz must be a string.');
    const zone = checkTz(tz || config.defaultTimezone);
    const now = clock();
    const id = crypto.randomUUID();
    q.insert.run({ id, name: nm, tz: zone, startedAt: now, gold: START_GOLD });
    return {
      gameId: id,
      name: nm,
      tz: zone,
      weekday: L.weekdayIn(zone, now),
      gold: START_GOLD,
      costs: COST,
      candleSeconds: L.CANDLE_SECONDS,
      totalThieves: L.THIEVES.length,
      note: NOTE,
    };
  }

  // -------------------------------------------------------------- validate
  // The oath lives only in this function's scope: it is checked and dropped.
  function validate(id, oath) {
    assertOath(oath, 'oath');
    return db.transaction(() => {
      const row = load(id);
      assertStatus(row, 'active');
      assertFresh(row);
      if (row.validations >= config.maxValidationsPerGame) {
        throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Attempt limit reached for this ledger. Start a new game.');
      }
      const now = clock();
      if (oath.length && !row.lit_at) {
        q.light.run({ id, now });
        row.lit_at = now;
      }
      const c = candle(row, now);
      q.validated.run({ id, nightWatch: c.nightWatch ? 1 : 0 });
      const { results, allPassed } = L.checkOath(oath, ctxFor(row, now, c.nightWatch));
      return { gameId: id, results, allPassed, candle: c, gold: row.gold, note: NOTE };
    })();
  }

  // ----------------------------------------------------------------- bribe
  function bribe(id, ref) {
    return db.transaction(() => {
      const row = load(id);
      assertStatus(row, 'active');
      assertFresh(row);
      const thief = L.findThief(ref);
      if (!thief) throw new ApiError(400, 'VALIDATION_ERROR', 'thief must be a thief index (0-12) or id.');
      const now = clock();
      const c = candle(row, now);
      if (thief === L.NIGHT_WATCH && !c.nightWatch) {
        throw new ApiError(403, 'THIEF_ASLEEP', 'The Night Watch is still asleep.');
      }
      const already = !!q.bribeGet.get(id, thief.index);
      let gold = row.gold;
      if (!already) {
        if (gold < COST.bribe) throw new ApiError(409, 'PURSE_TOO_LIGHT', 'Your purse is too light to bribe him.');
        gold -= COST.bribe;
        q.gold.run({ id, gold });
        q.bribeAdd.run(id, thief.index);
      }
      return {
        gameId: id,
        thief: { index: thief.index, id: thief.id, numeral: thief.numeral, name: thief.name },
        plain: thief.plain(ctxFor(row, now, c.nightWatch)),
        alreadyPaid: already,
        gold,
        note: NOTE,
      };
    })();
  }

  // -------------------------------------------------------- the Captain
  function presentToCaptain(id, oath) {
    assertOath(oath, 'oath');
    return db.transaction(() => {
      const row = load(id);
      assertStatus(row, 'active');
      assertFresh(row);
      const now = clock();
      const c = candle(row, now);
      const { results, allPassed } = L.checkOath(oath, ctxFor(row, now, c.nightWatch));
      if (!allPassed) {
        const err = new ApiError(409, 'OATH_NOT_READY', 'Not every thief is won over yet.');
        err.details = { results, candle: c };
        throw err;
      }
      q.toCaptain.run({ id, now, nightWatch: c.nightWatch ? 1 : 0 });
      return { gameId: id, status: 'captain', gold: row.gold, candle: c, note: NOTE };
    })();
  }

  function peek(id) {
    return db.transaction(() => {
      const row = load(id);
      assertStatus(row, 'captain');
      assertFresh(row);
      if (row.gold < COST.peek) throw new ApiError(409, 'PURSE_TOO_LIGHT', 'Your purse is too light for a peek.');
      const gold = row.gold - COST.peek;
      q.peek.run({ id, gold });
      return { gameId: id, gold, seconds: 3, note: NOTE };
    })();
  }

  // Both strings only live inside this request. Nothing about either is stored.
  function swear(id, oath, attempt) {
    assertOath(oath, 'oath');
    assertOath(attempt, 'attempt');
    if (!attempt.length) throw new ApiError(400, 'VALIDATION_ERROR', 'attempt must not be empty.');
    return db.transaction(() => {
      const row = load(id);
      assertStatus(row, 'captain');
      assertFresh(row);
      const now = clock();
      const c = candle(row, now);
      if (!L.checkOath(oath, ctxFor(row, now, c.nightWatch)).allPassed) {
        throw new ApiError(409, 'OATH_NOT_READY', 'That oath would not satisfy the thieves.');
      }
      const want = Array.from(oath);
      const typed = Array.from(attempt);
      if (attempt === oath) {
        q.win.run({ id, now, delta: row.paused_since ? now - row.paused_since : 0 });
        return { gameId: id, won: true, gold: row.gold, title: L.rankFor(row.gold), elapsedMs: now - (row.lit_at || row.started_at), note: NOTE };
      }
      let correct = 0;
      while (correct < typed.length && correct < want.length && typed[correct] === want[correct]) correct++;
      const gold = Math.max(0, row.gold - COST.miss);
      q.miss.run({ id, gold });
      return {
        gameId: id,
        won: false,
        correct,
        total: want.length,
        saidTooMuch: correct === want.length && typed.length > want.length,
        paid: row.gold - gold,
        gold,
        note: NOTE,
      };
    })();
  }

  function back(id) {
    return db.transaction(() => {
      const row = load(id);
      assertStatus(row, 'captain');
      const now = clock();
      q.back.run({ id, delta: row.paused_since ? now - row.paused_since : 0 });
      return { gameId: id, status: 'active', candle: candle({ ...row, paused_since: null, paused_ms: row.paused_ms + (row.paused_since ? now - row.paused_since : 0) }, now), note: NOTE };
    })();
  }

  // ---------------------------------------------------------------- finish
  function finish(id, name) {
    return db.transaction(() => {
      const row = load(id);
      if (row.status === 'finished') throw new ApiError(409, 'ALREADY_FINISHED', 'This recruit is already on the roll.');
      assertStatus(row, 'won');
      let nm = row.name;
      if (name !== undefined && name !== null && String(name).trim() !== '') {
        if (typeof name !== 'string' || !NAME_RE.test(name.trim())) {
          throw new ApiError(400, 'VALIDATION_ERROR', "name must be 1-28 letters, digits, spaces or ' . _ -");
        }
        nm = name.trim();
      }
      // The clock starts at the first word of the oath and stops when the Captain accepts it.
      const durationMs = row.solved_at - (row.lit_at || row.started_at);
      q.finish.run({ id, now: clock(), durationMs, name: nm });
      const place = q.place.get({ gold: row.gold, durationMs }).n + 1;
      return { gameId: id, name: nm, gold: row.gold, title: L.rankFor(row.gold), elapsedMs: durationMs, place, note: NOTE };
    })();
  }

  function leaderboard({ limit = 10 } = {}) {
    const n = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    return {
      entries: q.board.all({ limit: n }).map((r, i) => ({
        place: i + 1,
        name: r.name,
        gold: r.gold,
        title: L.rankFor(r.gold),
        elapsedMs: r.duration_ms,
        nightWatch: !!r.night_watch,
        misses: r.misses,
        peeks: r.peeks,
        finishedAt: r.finished_at,
      })),
    };
  }

  function purgeStale() {
    return q.purge.run(clock() - config.gameTtlMinutes * 2 * 60 * 1000).changes;
  }

  return { start, validate, bribe, presentToCaptain, peek, swear, back, finish, leaderboard, purgeStale };
}

module.exports = { createLedgerService, NOTE, COST, START_GOLD };
