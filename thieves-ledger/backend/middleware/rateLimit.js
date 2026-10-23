const rateLimit = require('express-rate-limit');
const { sendError } = require('./errors');

const limiter = (limit, message) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => sendError(res, 429, 'RATE_LIMITED', message),
  });

module.exports = {
  validateLimiter: (limit) => limiter(limit, 'Too many attempts. Slow down and let the vault breathe.'),
  startLimiter: (limit) => limiter(limit, 'Too many new games started. Try again in a minute.'),
};
