const express = require('express');
const router  = express.Router();
const { getPool } = require('../config/db');

router.get('/vapid-key', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: 'Push not configured' });
  res.json({ publicKey: key });
});

router.post('/subscribe', async (req, res) => {
  const { shopId, endpoint, p256dh, auth: authKey } = req.body;
  if (!shopId || !endpoint || !p256dh || !authKey)
    return res.status(400).json({ error: 'Missing fields' });

  const pool = getPool();
  await pool.query(
    `INSERT INTO push_subscriptions (shop_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth)`,
    [shopId, endpoint, p256dh, authKey]
  );
  res.json({ ok: true });
});

router.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' });
  const pool = getPool();
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
  res.json({ ok: true });
});

module.exports = router;
