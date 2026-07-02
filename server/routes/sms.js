const express = require('express');
const https   = require('https');
const crypto  = require('crypto');
const { getPool } = require('../config/db');
const { protect, requireRole } = require('../middleware/auth');
const sms   = require('../services/sms');
const PACKS = require('../config/smsPacks');
const log   = require('../utils/log');

const router = express.Router();
const owner = [protect, requireRole('shop_owner', 'admin')];

const settings = require('../utils/settings');

const RZP_KEY_ID     = () => settings.get('RAZORPAY_KEY_ID');
const RZP_KEY_SECRET = () => settings.get('RAZORPAY_KEY_SECRET');
const rzpLive = () => !!(RZP_KEY_ID() && RZP_KEY_SECRET());

const SITE_URL = () => settings.get('SITE_URL') || 'https://offerscity.co.in';

// ── Razorpay REST helper (no SDK — direct HTTPS, basic auth) ─────────────────
function razorpayRequest(method, apiPath, body = null) {
  const payload = body ? JSON.stringify(body) : null;
  const auth = Buffer.from(`${RZP_KEY_ID()}:${RZP_KEY_SECRET()}`).toString('base64');
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.razorpay.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else reject(new Error(`Razorpay ${res.statusCode}: ${json.error?.description || data.slice(0, 200)}`));
        } catch { reject(new Error(`Razorpay bad response: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Razorpay request timed out')); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function getWallet(ownerId) {
  const pool = getPool();
  await pool.query('INSERT IGNORE INTO sms_wallets (owner_id, balance) VALUES (?, 0)', [ownerId]);
  const [[w]] = await pool.query('SELECT * FROM sms_wallets WHERE owner_id = ?', [ownerId]);
  return w;
}

// ── GET /api/sms/packs — available packs + whether payment/sms are live ───────
router.get('/packs', ...owner, (req, res) => {
  res.json({ packs: PACKS, paymentLive: rzpLive(), smsLive: sms.isLive(), razorpayKeyId: RZP_KEY_ID() || null });
});

// ── GET /api/sms/wallet — balance + recent transactions ──────────────────────
router.get('/wallet', ...owner, async (req, res) => {
  try {
    const w = await getWallet(req.user.id);
    const [tx] = await getPool().query(
      `SELECT type, sms_count, amount_rupees, note, created_at
       FROM sms_transactions WHERE owner_id = ? ORDER BY id DESC LIMIT 20`,
      [req.user.id]
    );
    res.json({ balance: w.balance, total_purchased: w.total_purchased, transactions: tx });
  } catch (err) {
    log.error('[sms] wallet error:', err.message, err.stack);
    res.status(500).json({ message: 'Could not load wallet' });
  }
});

// ── POST /api/sms/order { pack_id } — create a Razorpay order ────────────────
router.post('/order', ...owner, async (req, res) => {
  const pack = PACKS.find(p => p.id === req.body.pack_id);
  if (!pack) return res.status(400).json({ message: 'Unknown pack' });

  try {
    if (!rzpLive()) {
      // Mock mode — no Razorpay keys yet. Order id is signed so /verify-payment
      // can't be called with a forged pack in mock mode.
      const nonce = crypto.randomBytes(6).toString('hex');
      const sig = crypto.createHmac('sha256', process.env.JWT_SECRET)
        .update(`${req.user.id}:${pack.id}:${nonce}`).digest('hex').slice(0, 16);
      const orderId = `mock_${req.user.id}_${pack.id}_${nonce}_${sig}`;
      log.info(`[sms] MOCK order created: ${orderId} owner=${req.user.id}`);
      return res.json({ mock: true, order_id: orderId, amount: pack.rupees * 100, pack });
    }

    const order = await razorpayRequest('POST', '/v1/orders', {
      amount: pack.rupees * 100,            // paise
      currency: 'INR',
      receipt: `sms_${req.user.id}_${pack.id}`,
      notes: { owner_id: String(req.user.id), pack_id: pack.id },
    });
    log.info(`[sms] razorpay order created: ${order.id} owner=${req.user.id} pack=${pack.id}`);
    res.json({ mock: false, order_id: order.id, amount: order.amount, pack, razorpayKeyId: RZP_KEY_ID() });
  } catch (err) {
    log.error('[sms] order error:', err.message, err.stack);
    res.status(500).json({ message: 'Could not create payment order' });
  }
});

// ── POST /api/sms/verify-payment — verify Razorpay signature, credit wallet ──
router.post('/verify-payment', ...owner, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const pool = getPool();

  try {
    let pack;

    if (!rzpLive()) {
      // Mock flow: validate our signed mock order id
      const m = String(razorpay_order_id || '').match(/^mock_(\d+)_(\w+)_([0-9a-f]+)_([0-9a-f]{16})$/);
      if (!m || m[1] !== String(req.user.id)) return res.status(400).json({ message: 'Invalid order' });
      const expect = crypto.createHmac('sha256', process.env.JWT_SECRET)
        .update(`${m[1]}:${m[2]}:${m[3]}`).digest('hex').slice(0, 16);
      if (expect !== m[4]) return res.status(400).json({ message: 'Invalid order signature' });
      pack = PACKS.find(p => p.id === m[2]);
      if (!pack) return res.status(400).json({ message: 'Unknown pack' });
    } else {
      // Real flow: HMAC check proves the payment, order fetch proves pack + amount
      const expected = crypto.createHmac('sha256', RZP_KEY_SECRET())
        .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
      if (expected !== razorpay_signature) {
        log.warn(`[sms] payment signature MISMATCH owner=${req.user.id} order=${razorpay_order_id}`);
        return res.status(400).json({ message: 'Payment verification failed' });
      }
      const order = await razorpayRequest('GET', `/v1/orders/${razorpay_order_id}`);
      pack = PACKS.find(p => p.id === order.notes?.pack_id && p.rupees * 100 === order.amount);
      if (!pack) return res.status(400).json({ message: 'Order does not match any pack' });
      if (order.notes?.owner_id !== String(req.user.id)) return res.status(403).json({ message: 'Not your order' });
    }

    // Idempotency: unique key on razorpay_payment_id blocks double-crediting
    const paymentId = razorpay_payment_id || razorpay_order_id; // mock mode has no payment id
    try {
      await pool.query(
        `INSERT INTO sms_transactions (owner_id, type, sms_count, amount_rupees, razorpay_order_id, razorpay_payment_id, note)
         VALUES (?, 'purchase', ?, ?, ?, ?, ?)`,
        [req.user.id, pack.sms, pack.rupees, razorpay_order_id, paymentId, `${pack.label} pack${rzpLive() ? '' : ' (mock)'}`]
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Payment already processed' });
      throw e;
    }

    await getWallet(req.user.id);
    await pool.query(
      'UPDATE sms_wallets SET balance = balance + ?, total_purchased = total_purchased + ? WHERE owner_id = ?',
      [pack.sms, pack.sms, req.user.id]
    );
    const w = await getWallet(req.user.id);
    log.info(`[sms] wallet credited: owner=${req.user.id} +${pack.sms} balance=${w.balance}`);
    res.json({ message: `${pack.sms} SMS credits added`, balance: w.balance });
  } catch (err) {
    log.error('[sms] verify-payment error:', err.message, err.stack);
    res.status(500).json({ message: 'Payment verification failed' });
  }
});

// ── Contacts: the shop owner's customer phone list ────────────────────────────

// GET /api/sms/contacts
router.get('/contacts', ...owner, async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT id, phone, name, source, created_at FROM sms_contacts WHERE owner_id = ? ORDER BY id DESC',
      [req.user.id]
    );
    res.json({ count: rows.length, list: rows });
  } catch (err) {
    log.error('[sms] contacts list error:', err.message, err.stack);
    res.status(500).json({ message: 'Could not load contacts' });
  }
});

// POST /api/sms/contacts { contacts: [{ phone, name? }] } — bulk add / CSV import
router.post('/contacts', ...owner, async (req, res) => {
  const incoming = Array.isArray(req.body.contacts) ? req.body.contacts : [];
  if (!incoming.length) return res.status(400).json({ message: 'No contacts given' });
  if (incoming.length > 2000) return res.status(400).json({ message: 'Max 2000 contacts per import' });

  try {
    const pool = getPool();
    let added = 0, skipped = 0;
    for (const c of incoming) {
      const phone = sms.normalizePhone(c.phone);
      if (!phone) { skipped++; continue; }
      const [r] = await pool.query(
        `INSERT IGNORE INTO sms_contacts (owner_id, phone, name, source) VALUES (?, ?, ?, ?)`,
        [req.user.id, phone, (c.name || '').slice(0, 100) || null, incoming.length > 5 ? 'import' : 'manual']
      );
      if (r.affectedRows) added++; else skipped++;
    }
    log.info(`[sms] contacts import: owner=${req.user.id} added=${added} skipped=${skipped}`);
    res.json({ added, skipped });
  } catch (err) {
    log.error('[sms] contacts add error:', err.message, err.stack);
    res.status(500).json({ message: 'Could not save contacts' });
  }
});

// DELETE /api/sms/contacts/:id
router.delete('/contacts/:id', ...owner, async (req, res) => {
  try {
    await getPool().query('DELETE FROM sms_contacts WHERE id = ? AND owner_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    log.error('[sms] contact delete error:', err.message, err.stack);
    res.status(500).json({ message: 'Could not delete contact' });
  }
});

// ── POST /api/sms/campaign { offer_id, phones? } — send an offer via SMS ─────
// Message carries a short link to the offer page; the link opens our web
// chatbot tied to that offer (replaces the WhatsApp broadcast flow).
router.post('/campaign', ...owner, async (req, res) => {
  const { offer_id, phones } = req.body;
  if (!offer_id) return res.status(400).json({ message: 'offer_id required' });

  try {
    const pool = getPool();

    const [[offer]] = await pool.query(
      `SELECT o.id, o.title, o.discount, s.name AS shop_name, s.owner_id
       FROM offers o JOIN shops s ON s.id = o.shop_id WHERE o.id = ?`,
      [offer_id]
    );
    if (!offer) return res.status(404).json({ message: 'Offer not found' });
    if (offer.owner_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not your offer' });

    // Recipients: explicit list from the picker, else the whole contact book
    let list;
    if (Array.isArray(phones) && phones.length) {
      list = phones.map(sms.normalizePhone).filter(Boolean);
    } else {
      const [rows] = await pool.query('SELECT phone FROM sms_contacts WHERE owner_id = ?', [req.user.id]);
      list = rows.map(r => r.phone);
    }
    list = [...new Set(list)];
    if (!list.length) return res.status(400).json({ message: 'No recipients — add customer numbers first' });

    // Wallet check + upfront reserve (refund failures after send)
    const w = await getWallet(req.user.id);
    if (w.balance < list.length)
      return res.status(402).json({ message: `Not enough SMS credits — need ${list.length}, have ${w.balance}. Buy a pack to continue.`, needed: list.length, balance: w.balance });

    const link = `${SITE_URL()}/o/${offer.id}`;
    const discountTxt = offer.discount > 0 ? `${Math.round(offer.discount)}% OFF ` : '';
    const message = `${offer.shop_name}: ${discountTxt}${offer.title}. View & chat: ${link}`;

    const [campIns] = await pool.query(
      `INSERT INTO campaigns (offer_id, shop_id, owner_id, platform, total_contacts, status, message)
       SELECT ?, shop_id, ?, 'sms', ?, 'running', ? FROM offers WHERE id = ?`,
      [offer.id, req.user.id, list.length, message, offer.id]
    );
    const campaignId = campIns.insertId;

    await pool.query('UPDATE sms_wallets SET balance = balance - ? WHERE owner_id = ?', [list.length, req.user.id]);
    await pool.query(
      `INSERT INTO sms_transactions (owner_id, type, sms_count, campaign_id, note) VALUES (?, 'debit', ?, ?, ?)`,
      [req.user.id, -list.length, campaignId, `Campaign: ${offer.title.slice(0, 60)}`]
    );

    // SMS gateway handles bulk natively — no drip pacing needed (unlike WhatsApp)
    const result = await sms.sendBulk(list, message, {
      ownerId: req.user.id,
      campaignId,
      vars: { var1: offer.shop_name, var2: `${discountTxt}${offer.title}`.slice(0, 60), var3: link },
    });

    if (result.failed > 0) {
      await pool.query('UPDATE sms_wallets SET balance = balance + ? WHERE owner_id = ?', [result.failed, req.user.id]);
      await pool.query(
        `INSERT INTO sms_transactions (owner_id, type, sms_count, campaign_id, note) VALUES (?, 'refund', ?, ?, 'Failed sends refunded')`,
        [req.user.id, result.failed, campaignId]
      );
    }

    await pool.query(
      `UPDATE campaigns SET sent_count = ?, failed_count = ?, status = 'completed', updated_at = NOW() WHERE id = ?`,
      [result.sent, result.failed, campaignId]
    );

    const wAfter = await getWallet(req.user.id);
    log.info(`[sms] campaign ${campaignId} done: owner=${req.user.id} sent=${result.sent} failed=${result.failed} mock=${!!result.mock}`);
    res.json({ campaign_id: campaignId, sent: result.sent, failed: result.failed, mock: !!result.mock, balance: wAfter.balance });
  } catch (err) {
    log.error('[sms] campaign error:', err.message, err.stack);
    res.status(500).json({ message: 'Campaign failed. Please try again.' });
  }
});

module.exports = router;
