const express = require('express');

function dailyRouter(service) {
  const router = express.Router();

  // GET /api/daily?tz=Asia/Kolkata -> today's shared seed
  router.get('/', (req, res) => {
    const tz = typeof req.query.tz === 'string' ? req.query.tz : undefined;
    res.json(service.daily(tz));
  });

  return router;
}

module.exports = dailyRouter;
