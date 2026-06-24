const express = require('express');
const https = require('https');
const { getPool } = require('../config/db');
const log = require('../utils/log');

const router = express.Router();

function pushToSheets(params) {
  const url = process.env.GOOGLE_SHEET_URL;
  if (!url) return;
  try {
    const query = new URLSearchParams(params).toString();
    const full = new URL(url + '?' + query);
    const opts = { hostname: full.hostname, path: full.pathname + full.search,
                   headers: { 'User-Agent': 'OfferCity/1.0' } };

    https.get(opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redir = new URL(res.headers.location);
        https.get({ hostname: redir.hostname, path: redir.pathname + redir.search,
                    headers: { 'User-Agent': 'OfferCity/1.0' } },
          (r) => r.resume()
        ).on('error', () => {});
      }
      res.resume();
    }).on('error', () => {});
  } catch (_) {}
}

// POST /api/leads
router.post('/', async (req, res) => {
  const { name, phone, email } = req.body;
  if (!name && !email) return res.status(400).json({ message: 'Name or email required' });

  const safeName  = name?.trim()  || 'Guest';
  const safePhone = phone?.trim() || '';
  const safeEmail = email?.trim() || null;

  try {
    const pool = getPool();
    await pool.query(
      'INSERT INTO leads (name, phone, email) VALUES (?,?,?)',
      [safeName, safePhone, safeEmail]
    );
    log.info(`[leads] new lead: ${safeName} ${safeEmail || safePhone}`);
  } catch (err) {
    log.error('[leads] DB error:', err.message, err.stack);
  }

  pushToSheets({
    name: safeName, phone: safePhone, email: safeEmail || '',
    source: 'OfferCity', time: new Date().toLocaleString('en-IN')
  });

  res.json({ ok: true });
});

// GET /api/leads/count
router.get('/count', async (req, res) => {
  try {
    const [[row]] = await getPool().query('SELECT COUNT(*) AS total FROM leads');
    res.json({ total: row.total });
  } catch (err) {
    log.error('[leads] GET /count error:', err.message, err.stack);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
