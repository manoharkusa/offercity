const log = require('./log');

// Admin-managed integration settings, stored in app_settings and cached in
// memory. Lookup order: DB value (admin panel) → process.env → ''.
// Keys the admin panel is allowed to manage:
const MANAGED_KEYS = [
  'MSG91_AUTH_KEY',
  'MSG91_SENDER_ID',
  'MSG91_TEMPLATE_CAMPAIGN',
  'MSG91_TEMPLATE_OTP',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'SITE_URL',
];

// Which keys are secrets (masked in GET responses)
const SECRET_KEYS = new Set(['MSG91_AUTH_KEY', 'RAZORPAY_KEY_SECRET']);

const cache = {};

async function loadAll() {
  try {
    const { getPool } = require('../config/db');
    const [rows] = await getPool().query('SELECT setting_key, setting_value FROM app_settings');
    for (const r of rows) cache[r.setting_key] = r.setting_value || '';
    log.info(`[settings] loaded ${rows.length} settings from DB`);
  } catch (e) {
    log.error('[settings] loadAll error:', e.message);
  }
}

function get(key) {
  const dbVal = cache[key];
  if (dbVal !== undefined && dbVal !== '') return dbVal;
  return process.env[key] || '';
}

async function setMany(obj) {
  const { getPool } = require('../config/db');
  const pool = getPool();
  for (const [key, value] of Object.entries(obj)) {
    if (!MANAGED_KEYS.includes(key)) continue;
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, String(value ?? '').trim()]
    );
    cache[key] = String(value ?? '').trim();
  }
}

// For the admin GET: secrets masked, plus whether each key has ANY value (db or env)
function summary() {
  return MANAGED_KEYS.map(key => {
    const val = get(key);
    const fromDb = cache[key] !== undefined && cache[key] !== '';
    let display = val;
    if (SECRET_KEYS.has(key) && val) display = val.slice(0, 4) + '••••••' + val.slice(-2);
    return { key, value: display, set: !!val, source: !val ? null : (fromDb ? 'admin' : 'env') };
  });
}

module.exports = { loadAll, get, setMany, summary, MANAGED_KEYS };
