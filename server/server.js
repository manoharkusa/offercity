// ── Bootstrap logger — must be first, before ANY require that could crash ─────
const fs = require('fs');
const LOG_FILE = '/home1/a1751tyi/node.log';
function flog(level, msg) {
  const line = `[${new Date().toISOString().slice(0,19).replace('T',' ')}] [${level}] ${msg}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(LOG_FILE, line); } catch (_) {}
}
flog('INFO', `=== OfferCity starting === Node ${process.version} PID ${process.pid}`);

// Catch crashes before express is even loaded
process.on('uncaughtException', (err) => {
  flog('CRASH', `uncaughtException: ${err.message}`);
  flog('CRASH', err.stack || '(no stack)');
});
process.on('unhandledRejection', (reason) => {
  flog('CRASH', `unhandledRejection: ${reason instanceof Error ? reason.stack : JSON.stringify(reason)}`);
});

flog('INFO', 'Loading dotenv...');
require('dotenv').config();
flog('INFO', `PORT env: ${process.env.PORT || '(not set)'}`);

flog('INFO', 'Loading utils/log...');
let log;
try {
  log = require('./utils/log');
  flog('INFO', 'utils/log loaded OK');
} catch (e) {
  flog('WARN', `utils/log failed (${e.message}) — using inline logger`);
  log = { info: (...a) => flog('INFO', a.join(' ')), warn: (...a) => flog('WARN', a.join(' ')), error: (...a) => flog('ERROR', a.join(' ')) };
}

flog('INFO', 'Loading express...');
const express = require('express');
const cors    = require('cors');
const path    = require('path');

// Write PID so start_node.sh can kill us cleanly next restart
try { fs.writeFileSync('/home1/a1751tyi/node.pid', String(process.pid)); } catch (_) {}

log.info('Loading DB module...');
const { connectDB } = require('./config/db');
log.info('Loading seed module...');
const seed = require('./seed');
log.info('Core modules loaded.');

const app = express();

// ── Request logger ────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const lvl = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    log[lvl](`${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ── Connect DB then start services ────────────────────────────────────────────
connectDB()
  .then(seed)
  .then(() => {
    log.info('DB + seed done. Loading push service...');
    try {
      const push = require('./services/push');
      push.init();
      log.info('Push service ready.');
    } catch (e) { log.error('Push service failed to load:', e.message); }

    try {
      const wa = require('./services/whatsapp');
      wa.autoReconnectAll();
      wa.startWatchdog();
      log.info('WhatsApp service ready.');
    } catch (e) { log.error('WhatsApp service failed to load:', e.message); }
  })
  .catch(err => log.error('DB startup error:', err.message, err.stack));

app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes — each in try/catch so one bad file can't kill the server ──────────
const routes = [
  ['/api/auth',      './routes/auth'],
  ['/api/shops',     './routes/shops'],
  ['/api/offers',    './routes/offers'],
  ['/api/reviews',   './routes/reviews'],
  ['/api/admin',     './routes/admin'],
  ['/api/bdo',       './routes/bdo'],
  ['/api/coming',    './routes/coming'],
  ['/api/stamps',    './routes/stamps'],
  ['/api/leads',     './routes/leads'],
  ['/api/campaigns', './routes/campaigns'],
  ['/api/push',      './routes/push'],
  ['/api/chat',      './routes/chat'],
];

for (const [prefix, mod] of routes) {
  try {
    app.use(prefix, require(mod));
    log.info('Route loaded:', prefix);
  } catch (e) {
    log.error(`FAILED to load route ${prefix} (${mod}):`, e.message);
    // register a fallback so other routes keep working
    app.use(prefix, (_req, res) =>
      res.status(503).json({ error: `Route ${prefix} unavailable`, detail: e.message })
    );
  }
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'OfferCity API running', port: process.env.PORT || 5000, pid: process.pid, v: '2.1' });
});

// ── Deploy restart ────────────────────────────────────────────────────────────
app.post('/api/deploy-restart', (req, res) => {
  const secret = process.env.DEPLOY_SECRET || 'offerscity-deploy-2025';
  if (req.headers['x-deploy-secret'] !== secret) return res.status(403).json({ error: 'forbidden' });
  log.info('[DEPLOY] restart triggered');
  res.json({ ok: true, pid: process.pid });
  setTimeout(() => {
    server.close(() => {
      log.info('[DEPLOY] graceful shutdown complete');
      process.exit(0);
    });
    setTimeout(() => { log.info('[DEPLOY] force exit'); process.exit(0); }, 8000);
  }, 500);
});

// ── Logs endpoint ─────────────────────────────────────────────────────────────
app.get('/api/logs', (req, res) => {
  const logFile = '/home1/a1751tyi/node.log';
  try {
    const data  = fs.readFileSync(logFile, 'utf8');
    const lines = data.split('\n').filter(Boolean).slice(-200);
    res.json({ lines });
  } catch (e) { res.json({ lines: [], error: e.message }); }
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  log.error('Unhandled route error:', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ── Listen ────────────────────────────────────────────────────────────────────
const PORT      = parseInt(process.env.PORT) || 5000;
const PORT_FILE = '/home1/a1751tyi/node_port.txt';

const server = app.listen(PORT, () => {
  log.info(`Server listening on port ${PORT}`);
  try { fs.writeFileSync(PORT_FILE, String(PORT)); } catch (_) {}
});

server.on('error', (err) => {
  log.error('Server listen error:', err.code, err.message);
  if (err.code === 'EADDRINUSE') {
    // Port still held by dying old process — wait and retry once
    log.info(`Port ${PORT} busy — retrying in 4s…`);
    setTimeout(() => server.listen(PORT), 4000);
  } else {
    process.exit(1);
  }
});
