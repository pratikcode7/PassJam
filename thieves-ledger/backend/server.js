const config = require('./config');
const { openDb } = require('./db');
const { createApp } = require('./app');

const db = openDb(config.dbPath);
const app = createApp({ db });

const purge = () => app.locals.service.purgeStale() + app.locals.ledger.purgeStale();
const removed = purge();
if (removed) console.log(`Purged ${removed} abandoned game(s).`);
setInterval(purge, 30 * 60 * 1000).unref();

// Express 5 passes a listen error (such as a busy port) to this callback.
const server = app.listen(config.port, (err) => {
  if (err) {
    console.error(
      err.code === 'EADDRINUSE'
        ? `Port ${config.port} is already in use. Stop the other server, or pick another port: PORT=3100 npm start`
        : `Could not start the server: ${err.message}`
    );
    db.close();
    process.exit(1);
  }
  console.log(`The Thieves' Ledger is open at http://localhost:${config.port}`);
});

const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
