// ── Bootstrap logger — must be first, before ANY require that could crash ─────
const fs   = require('fs');
const path0 = require('path');
// Write log next to server.js so cPanel File Manager can find it at public_html/server/node.log
const LOG_FILE = path0.join(__dirname, 'node.log');
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
flog('INFO', 'express OK');
const cors    = require('cors');
flog('INFO', 'cors OK');
const path    = require('path');
flog('INFO', 'path OK');

// Write PID so start_node.sh can kill us cleanly next restart
try { fs.writeFileSync('/home1/a1751tyi/node.pid', String(process.pid)); } catch (_) {}

flog('INFO', 'Loading DB module...');
const { connectDB } = require('./config/db');
flog('INFO', 'DB module OK');
flog('INFO', 'Loading seed module...');
const seed = require('./seed');
flog('INFO', 'Core modules loaded.');

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
const cache = require('./utils/cache');
app.get('/api/health', (req, res) => {
  res.json({ status: 'OfferCity API running', port: process.env.PORT || 5000, pid: process.pid, v: '2.1', cache_keys: cache.size() });
});

// ── Deploy: upload client dist as tar.gz, extract to client/dist ─────────────
app.post('/api/deploy-dist', (req, res) => {
  const secret = process.env.DEPLOY_SECRET || 'offerscity-deploy-2025';
  if (req.headers['x-deploy-secret'] !== secret) return res.status(403).json({ error: 'forbidden' });

  const { execSync } = require('child_process');
  const distDir = path0.join(__dirname, '..', 'client', 'dist');
  const tmpFile = '/tmp/dist_upload.tar.gz';
  const chunks  = [];

  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    try {
      fs.writeFileSync(tmpFile, Buffer.concat(chunks));
      execSync(`rm -rf "${distDir}" && mkdir -p "${distDir}" && tar -xzf "${tmpFile}" -C "${distDir}"`, { stdio: 'pipe' });
      fs.unlinkSync(tmpFile);
      log.info('[DEPLOY] dist uploaded and extracted OK');
      res.json({ ok: true });
    } catch (e) {
      log.error('[DEPLOY] dist upload error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
});

// ── Deploy webhook — git pull + npm ci server only, client dist uploaded by CI ─
app.post('/api/deploy-restart', (req, res) => {
  const secret = process.env.DEPLOY_SECRET || 'offerscity-deploy-2025';
  if (req.headers['x-deploy-secret'] !== secret) return res.status(403).json({ error: 'forbidden' });
  log.info('[DEPLOY] webhook triggered — git pull + npm ci + restart');
  res.json({ ok: true, msg: 'Deploy started — server restarts in ~20s' });

  const { execSync } = require('child_process');
  const root = path0.join(__dirname, '..');
  setTimeout(() => {
    try {
      log.info('[DEPLOY] git pull...');
      execSync('git pull origin main', { cwd: root, stdio: 'pipe' });
      log.info('[DEPLOY] npm ci server...');
      execSync('npm ci --omit=dev', { cwd: __dirname, stdio: 'pipe' });
      log.info('[DEPLOY] done — exiting for PM2 restart');
    } catch (e) {
      log.error('[DEPLOY] error:', e.message);
    }
    process.exit(0);
  }, 500);
});

// ── Logs endpoint (admin-only) ────────────────────────────────────────────────
const { protect: _protect, requireRole: _requireRole } = require('./middleware/auth');
app.get('/api/logs', _protect, _requireRole('admin'), (req, res) => {
  try {
    const data  = fs.readFileSync(LOG_FILE, 'utf8');
    const all   = data.split('\n').filter(Boolean);
    const n     = parseInt(req.query.n) || 500;
    const search = req.query.search || '';
    const filtered = search
      ? all.filter(l => l.toLowerCase().includes(search.toLowerCase()))
      : all;
    res.json({ lines: filtered.slice(-n), total: all.length });
  } catch (e) { res.json({ lines: [], total: 0, error: e.message }); }
});

// ── DB import webhook (one-shot migration, deploy-secret protected) ───────────
app.post('/api/deploy-db-import', (req, res) => {
  const secret = process.env.DEPLOY_SECRET || 'offerscity-deploy-2025';
  if (req.headers['x-deploy-secret'] !== secret) return res.status(403).json({ error: 'forbidden' });

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const sql = Buffer.concat(chunks).toString('utf8');
    if (!sql.includes('CREATE TABLE') && !sql.includes('INSERT INTO')) {
      return res.status(400).json({ error: 'Does not look like a valid SQL dump' });
    }
    const { execSync } = require('child_process');
    const tmpFile = '/tmp/import_dump.sql';
    try {
      fs.writeFileSync(tmpFile, sql);
      const dbHost = process.env.DB_HOST || 'localhost';
      const dbUser = process.env.DB_USER || 'offercity';
      const dbPass = process.env.DB_PASS || process.env.DB_PASSWORD || '';
      const dbName = process.env.DB_NAME || 'offercity';
      const passArg = dbPass ? `-p'${dbPass}'` : '';
      execSync(`mysql -h${dbHost} -u${dbUser} ${passArg} ${dbName} < ${tmpFile}`, { stdio: 'pipe' });
      fs.unlinkSync(tmpFile);
      log.info('[DB-IMPORT] Migration import completed OK');
      res.json({ ok: true, msg: 'Database imported successfully' });
    } catch (e) {
      log.error('[DB-IMPORT] error:', e.message);
      res.status(500).json({ error: e.message });
    }
  });
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

// Self-ping every 90s so Passenger doesn't kill the process for inactivity
// (shared hosting kills idle Node.js processes; this keeps the process warm)
setInterval(() => {
  require('http').get(`http://localhost:${PORT}/api/health`, (res) => {
    res.resume(); // drain response body
  }).on('error', () => {}); // ignore errors silently
}, 90 * 1000);
