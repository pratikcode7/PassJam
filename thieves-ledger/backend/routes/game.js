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

function gameRouter(service, config) {
  const router = express.Router();

  router.post('/start', startLimiter(config.startRateLimitPerMin), (req, res) => {
    const { mode, seed, tz } = bodyOf(req);
    res.status(201).json(service.startGame({ mode, seed, tz }));
  });

  router.get('/:id', (req, res) => {
    res.json(service.getGame(req.params.id));
  });

  router.post('/:id/validate', validateLimiter(config.validateRateLimitPerMin), (req, res) => {
    const { password } = bodyOf(req);
    res.json(service.validate(req.params.id, password));
  });

  router.post('/:id/hint', (req, res) => {
    const { ruleId } = bodyOf(req);
    res.json(service.hint(req.params.id, ruleId));
  });

  router.post('/:id/finish', (req, res) => {
    const { nickname } = bodyOf(req);
    res.json(service.finish(req.params.id, nickname));
  });

  return router;
}

module.exports = gameRouter;
