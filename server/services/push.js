const webpush = require('web-push');

let ready = false;

function init() {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  webpush.setVapidDetails(
    'mailto:admin@offerscity.co.in',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  ready = true;
  console.log('[PUSH] Web Push ready');
}

// Haversine distance in km between two lat/lng points
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Called when a new offer is published — notifies users within RADIUS_KM of the shop
async function notifyNearbyUsers(offer, shop) {
  if (!ready) return;
  if (!shop?.lat || !shop?.lng) return;

  const RADIUS_KM = 10;
  const { getPool } = require('../config/db');
  const pool = getPool();

  // Fetch all subscriptions that have a stored location
  const [subs] = await pool.query(
    'SELECT * FROM push_subscriptions WHERE lat IS NOT NULL AND lng IS NOT NULL'
  );

  const nearby = subs.filter(s =>
    distanceKm(parseFloat(shop.lat), parseFloat(shop.lng), s.lat, s.lng) <= RADIUS_KM
  );

  if (!nearby.length) return;

  const shopUrl = shop.slug ? `/shop/${shop.slug}` : '/';
  const title   = shop.name;
  const body    = 'New offer available';
  const payload = JSON.stringify({ title, body, url: shopUrl, icon: '/favicon.ico' });

  const expired = [];
  let sent = 0;
  for (const sub of nearby) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) expired.push(sub.id);
    }
  }

  if (expired.length) {
    await pool.query('DELETE FROM push_subscriptions WHERE id IN (?)', [expired]);
  }
  console.log(`[PUSH] Notified ${sent} nearby users for offer "${offer.title}" (shop: ${shop.name})`);
}

// Generic nearby push — title, body, url, radius in km
async function sendNearby(lat, lng, radiusKm, title, body, url = '/') {
  if (!ready) return;
  if (!lat || !lng) return;
  const { getPool } = require('../config/db');
  const [subs] = await getPool().query(
    'SELECT * FROM push_subscriptions WHERE lat IS NOT NULL AND lng IS NOT NULL'
  );
  const nearby = subs.filter(s => distanceKm(parseFloat(lat), parseFloat(lng), s.lat, s.lng) <= radiusKm);
  if (!nearby.length) return;
  const payload = JSON.stringify({ title, body, url, icon: '/favicon.ico' });
  const expired = [];
  let sent = 0;
  for (const sub of nearby) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) expired.push(sub.id);
    }
  }
  if (expired.length) await getPool().query('DELETE FROM push_subscriptions WHERE id IN (?)', [expired]);
  console.log(`[PUSH] sendNearby: sent ${sent} within ${radiusKm}km of (${lat},${lng})`);
}

module.exports = { init, notifyNearbyUsers, sendNearby };
