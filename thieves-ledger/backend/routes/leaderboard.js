const express = require('express');

function leaderboardRouter(service) {
  const router = express.Router();

  // GET /api/leaderboard?limit=10&mode=daily
  router.get('/', (req, res) => {
    const { limit, mode } = req.query;
    res.json(service.leaderboard({ limit, mode }));
  });

  return router;
}

module.exports = leaderboardRouter;
