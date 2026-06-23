const fs   = require('fs');
const path = require('path');

// Same file as flog() in server.js — next to server.js at public_html/server/node.log
const LOG_FILE = path.join(__dirname, '..', 'node.log');
const MAX_BYTES = 2 * 1024 * 1024; // rotate at 2 MB

function write(level, ...args) {
  const ts  = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  const line = `[${ts}] [${level}] ${msg}\n`;

  // always echo to stdout so local dev still works
  process.stdout.write(line);

  // write to file — rotate when too large
  try {
    let stat;
    try { stat = fs.statSync(LOG_FILE); } catch (_) { stat = null; }
    if (stat && stat.size > MAX_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.bak');
    }
    fs.appendFileSync(LOG_FILE, line);
  } catch (_) { /* never crash just because logging failed */ }
}

const log = {
  info:  (...a) => write('INFO ', ...a),
  warn:  (...a) => write('WARN ', ...a),
  error: (...a) => write('ERROR', ...a),
};

module.exports = log;
