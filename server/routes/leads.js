const express = require('express');
const https = require('https');
const { getPool } = require('../config/db');

const router = express.Router();

// Fire data to Google Sheets via Apps Script GET URL (fire-and-forget, one redirect allowed)
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
  if (!name) return res.status(400).json({ message: 'Name is required' });

  try {
    const pool = getPool();
    await pool.query(
      'INSERT INTO leads (name, phone, email) VALUES (?,?,?)',
      [name.trim(), phone?.trim() || '', email?.trim() || null]
    );
  } catch (err) {
    console.error('Lead DB error:', err.message);
  }

  pushToSheets({
    name: name.trim(),
    phone: phone?.trim() || '',
    email: email?.trim() || '',
    source: 'OfferCity',
    time: new Date().toLocaleString('en-IN')
  });

  res.json({ ok: true });
});

// GET /api/leads/count  (admin use)
router.get('/count', async (req, res) => {
  try {
    const [[row]] = await getPool().query('SELECT COUNT(*) AS total FROM leads');
    res.json({ total: row.total });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
