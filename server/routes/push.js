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

// GET /api/push/nearby-shops?lat=X&lng=Y&km=5
// Returns shops with active offers within radius — used by client for proximity alerts
router.get('/nearby-shops', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const km  = parseFloat(req.query.km) || 2;
  if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' });

  try {
    const pool = getPool();
    // Haversine bounding box rough filter, then exact calc in JS
    const [shops] = await pool.query(
      `SELECT s.id, s.name, s.slug, s.category, s.address, s.city, s.lat, s.lng,
              COUNT(o.id) AS offer_count,
              MAX(o.discount) AS best_discount,
              MAX(o.title) AS top_offer
       FROM shops s
       JOIN offers o ON o.shop_id = s.id
         AND o.is_active = 1
         AND (o.valid_until IS NULL OR o.valid_until >= CURDATE())
       WHERE s.status = 'approved' AND s.lat IS NOT NULL AND s.lng IS NOT NULL
       GROUP BY s.id`
    );

    function distKm(lat1, lng1, lat2, lng2) {
      const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
      const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    const nearby = shops
      .map(s => ({ ...s, distance_km: distKm(lat, lng, parseFloat(s.lat), parseFloat(s.lng)) }))
      .filter(s => s.distance_km <= km)
      .sort((a, b) => a.distance_km - b.distance_km);

    res.json(nearby);
  } catch (err) {
    console.error('[PUSH] nearby-shops error:', err.message);
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
