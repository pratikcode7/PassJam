const fs = require('fs');
const express = require('express');
const cors = require('cors');
const defaultConfig = require('./config');
const { notFound, errorHandler } = require('./middleware/errors');
const { createGameService } = require('./services/gameService');
const { createLedgerService } = require('./services/ledgerService');
const gameRouter = require('./routes/game');
const leaderboardRouter = require('./routes/leaderboard');
const dailyRouter = require('./routes/daily');
const ledgerRouter = require('./routes/ledger');

// The page opens offline by default. When this server sends it, this marker tells
// the page that the ledger's keeper is present and where to find him.
const API_MARKER = '<!--LEDGER_API-->';
const API_META = '<meta name="ledger-api" content="/api/ledger">';

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * App factory so tests can inject an in-memory db, a fake clock and tight rate limits.
 */
function createApp({ db, clock = Date.now, config: overrides = {} }) {
  const config = { ...defaultConfig, ...overrides };
  const service = createGameService({ db, clock, config });
  const ledger = createLedgerService({ db, clock, config });
  const app = express();

  app.disable('x-powered-by');

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true); // curl, server-to-server
        if (LOCAL_ORIGIN.test(origin)) return cb(null, true);
        if (origin === 'null' && config.allowFileOrigin) return cb(null, true); // file:// frontend
        if (config.corsOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
    })
  );

  // Request logging: method, path and status only. Never bodies or query strings,
  // because bodies carry passwords.
  if (config.logRequests) {
    app.use((req, res, next) => {
      const t0 = Date.now();
      const path = req.originalUrl.split('?')[0]; // drop the query string
      res.on('finish', () => console.log(`${req.method} ${path} ${res.statusCode} ${Date.now() - t0}ms`));
      next();
    });
  }

  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '2kb' }));

  // Only the game page is served, never the folder, so no backend file can leak.
  app.get(['/', '/index.html'], (req, res, next) => {
    fs.readFile(config.frontendFile, 'utf8', (err, html) => {
      if (err) return next();
      res.type('html').send(html.replace(API_MARKER, API_META));
    });
  });

  app.get('/api/health', (req, res) => res.json({ ok: true, games: ["The Thieves' Ledger", 'Riddle Lock'], time: clock() }));
  app.use('/api/ledger', ledgerRouter(ledger, config));
  app.use('/api/game', gameRouter(service, config));
  app.use('/api/leaderboard', leaderboardRouter(service));
  app.use('/api/daily', dailyRouter(service));

  app.use(notFound);
  app.use(errorHandler);

  app.locals.service = service;
  app.locals.ledger = ledger;
  return app;
}

module.exports = { createApp };
