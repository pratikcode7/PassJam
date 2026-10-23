require('dotenv').config({ quiet: true });
const path = require('path');

const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

module.exports = {
  port: int(process.env.PORT, 3000),
  dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'riddle-lock.db'),
  // The Thieves' Ledger page, served at "/".
  frontendFile: process.env.FRONTEND_FILE || path.join(__dirname, '..', 'index.html'),

  // CORS: any http://localhost:* / 127.0.0.1:* is always allowed.
  // Extra origins (comma separated) can be added here.
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // A frontend opened by double-clicking index.html sends "Origin: null".
  allowFileOrigin: process.env.ALLOW_FILE_ORIGIN !== 'false',

  // The frontend validates while typing, so debounce ~300ms and keep this generous.
  validateRateLimitPerMin: int(process.env.VALIDATE_RATE_LIMIT_PER_MIN, 120),
  startRateLimitPerMin: int(process.env.START_RATE_LIMIT_PER_MIN, 30),

  gameTtlMinutes: int(process.env.GAME_TTL_MINUTES, 240),
  maxValidationsPerGame: int(process.env.MAX_VALIDATIONS_PER_GAME, 5000),
  maxPasswordLength: 100,
  defaultTimezone: process.env.DEFAULT_TZ || 'Asia/Kolkata',
  logRequests: process.env.LOG_REQUESTS
    ? process.env.LOG_REQUESTS === 'true'
    : process.env.NODE_ENV !== 'test',
};
