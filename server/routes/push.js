const express = require('express');
const router  = express.Router();
const { getPool } = require('../config/db');

// GET /api/push/vapid-key
router.get('/vapid-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push not configured' });
  res.json({ publicKey: key });
});

// POST /api/push/subscribe  — save browser push subscription + user location
router.post('/subscribe', async (req, res) => {
  const { endpoint, p256dh, auth, lat, lng } = req.body;
  if (!endpoint || !p256dh || !auth)
    return res.status(400).json({ error: 'Missing fields' });

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, lat, lng)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth),
                               lat = VALUES(lat), lng = VALUES(lng)`,
      [endpoint, p256dh, auth, lat || null, lng || null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[PUSH] subscribe error:', err.message);
    res.status(500).json({ error: 'DB error' });
  }
});

// POST /api/push/unsubscribe
router.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  await getPool().query('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
  res.json({ ok: true });
});

module.exports = router;
