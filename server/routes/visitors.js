const express = require('express');
const { getPool } = require('../config/db');
const log = require('../utils/log');

const router = express.Router();

// POST /api/visitors/track  — record an anonymous visitor (upsert by uuid).
// Called on app load. Links to a user_id once they log in. No auth required.
router.post('/track', async (req, res) => {
  const { uuid, user_id } = req.body || {};
  if (!uuid || typeof uuid !== 'string' || uuid.length > 64)
    return res.status(400).json({ message: 'valid uuid required' });
  const ua = (req.headers['user-agent'] || '').slice(0, 255);
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO visitors (visitor_uuid, user_id, user_agent, visits)
       VALUES (?,?,?,1)
       ON DUPLICATE KEY UPDATE
         visits = visits + 1,
         last_seen = CURRENT_TIMESTAMP,
         user_id = COALESCE(VALUES(user_id), user_id)`,
      [uuid, user_id || null, ua]
    );
    res.json({ ok: true });
  } catch (err) {
    log.error('[visitors] track error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/visitors/count  — total unique visitors (admin-style stat, public read)
router.get('/count', async (_req, res) => {
  try {
    const [[row]] = await getPool().query('SELECT COUNT(*) AS total, SUM(visits) AS total_visits FROM visitors');
    res.json({ unique: row.total || 0, visits: row.total_visits || 0 });
  } catch (err) {
    log.error('[visitors] count error:', err.message);
    res.json({ unique: 0, visits: 0 });
  }
});

module.exports = router;
