const express = require('express');
const { ApiError } = require('../middleware/errors');
const { validateLimiter, startLimiter } = require('../middleware/rateLimit');

// Express 5 leaves req.body undefined when nothing was parsed.
const bodyOf = (req) => {
  const b = req.body;
  if (b === undefined || b === null) return {};
  if (typeof b !== 'object' || Array.isArray(b)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }
  return b;
};

function ledgerRouter(service, config) {
  const router = express.Router();
  const checks = validateLimiter(config.validateRateLimitPerMin);

  router.get('/leaderboard', (req, res) => {
    res.json(service.leaderboard({ limit: req.query.limit }));
  });

  router.post('/start', startLimiter(config.startRateLimitPerMin), (req, res) => {
    const { name, tz } = bodyOf(req);
    res.status(201).json(service.start({ name, tz }));
  });

  router.post('/:id/validate', checks, (req, res) => {
    res.json(service.validate(req.params.id, bodyOf(req).oath));
  });

  router.post('/:id/bribe', (req, res) => {
    res.json(service.bribe(req.params.id, bodyOf(req).thief));
  });

  router.post('/:id/captain', checks, (req, res) => {
    res.json(service.presentToCaptain(req.params.id, bodyOf(req).oath));
  });

  router.post('/:id/peek', (req, res) => {
    res.json(service.peek(req.params.id));
  });

  router.post('/:id/swear', checks, (req, res) => {
    const { oath, attempt } = bodyOf(req);
    res.json(service.swear(req.params.id, oath, attempt));
  });

  router.post('/:id/back', (req, res) => {
    res.json(service.back(req.params.id));
  });

  router.post('/:id/finish', (req, res) => {
    res.json(service.finish(req.params.id, bodyOf(req).name));
  });

  return router;
}

module.exports = ledgerRouter;
