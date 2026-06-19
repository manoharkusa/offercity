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
}

async function notifyShopSubscribers(shopId, offer, shopName, shopPageUrl) {
  if (!ready) return;
  const { getPool } = require('../config/db');
  const pool = getPool();
  const [subs] = await pool.query(
    'SELECT * FROM push_subscriptions WHERE shop_id = ?', [shopId]
  );
  if (!subs.length) return;

  const title = `🔥 ${shopName} — New Offer!`;
  const body  = `${offer.discount}% OFF: ${offer.title}${offer.offer_price ? ' at ₹' + Math.round(offer.offer_price) : ''}`;
  const payload = JSON.stringify({ title, body, url: shopPageUrl });

  const expired = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) expired.push(sub.id);
    }
  }
  if (expired.length) {
    await pool.query('DELETE FROM push_subscriptions WHERE id IN (?)', [expired]);
  }
  console.log(`[PUSH] Notified ${subs.length - expired.length} subscribers for shop ${shopId}`);
}

module.exports = { init, notifyShopSubscribers };
