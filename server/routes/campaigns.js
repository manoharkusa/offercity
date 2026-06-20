const express = require('express');
const { protect, requireRole } = require('../middleware/auth');
const wa = require('../services/whatsapp');
const ai = require('../services/aichatbot');
const { getPool } = require('../config/db');

const router = express.Router();

// GET /api/campaigns/whatsapp/status  — poll for QR + connection state + chatbot flag
router.get('/whatsapp/status', protect, requireRole('shop_owner', 'admin'), (req, res) => {
  res.json({ ...wa.getStatus(req.user.id), chatbot: ai.isEnabled(req.user.id) });
});

// POST /api/campaigns/chatbot/toggle
router.post('/chatbot/toggle', protect, requireRole('shop_owner', 'admin'), (req, res) => {
  const current = ai.isEnabled(req.user.id);
  ai.setEnabled(req.user.id, !current);
  ai.invalidateCache(req.user.id); // force fresh shop context on next message
  res.json({ chatbot: !current });
});

// POST /api/campaigns/whatsapp/connect
router.post('/whatsapp/connect', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  wa.connect(req.user.id);  // fire-and-forget; frontend polls /status for QR
  res.json({ message: 'Connecting…' });
});

// POST /api/campaigns/whatsapp/disconnect
router.post('/whatsapp/disconnect', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  await wa.disconnect(req.user.id);
  res.json({ message: 'Disconnected' });
});

// POST /api/campaigns/whatsapp/connect-pairing  — connect using pairing code (same-phone flow)
// Creates a fresh socket, waits for QR event, calls requestPairingCode at the right moment
router.post('/whatsapp/connect-pairing', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ message: 'Phone number is required' });
  try {
    const code = await wa.connectWithPairingCode(req.user.id, phone);
    res.json({ code });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/campaigns/whatsapp/contacts
router.get('/whatsapp/contacts', protect, requireRole('shop_owner', 'admin'), (req, res) => {
  const list = wa.getContacts(req.user.id);
  if (req.query.all === '1') return res.json({ count: list.length, list });
  res.json({ count: list.length, preview: list.slice(0, 8) });
});

// GET /api/campaigns — list past campaigns
router.get('/', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT c.*, o.title AS offer_title
     FROM campaigns c LEFT JOIN offers o ON o.id = c.offer_id
     WHERE c.owner_id = ? ORDER BY c.created_at DESC LIMIT 20`,
    [req.user.id]
  );
  res.json(rows);
});

// POST /api/campaigns — create & start
router.post('/', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const { offer_id, shop_id, message, selected_phones } = req.body;
  if (!message) return res.status(400).json({ message: 'message is required' });

  const status = wa.getStatus(req.user.id);
  if (status.status !== 'connected') return res.status(400).json({ message: 'WhatsApp not connected' });

  let list = wa.getContacts(req.user.id);
  if (list.length === 0) return res.status(400).json({ message: 'No contacts found yet — wait a moment after connecting' });

  // Filter to selected contacts when provided
  if (Array.isArray(selected_phones) && selected_phones.length > 0) {
    const allowed = new Set(selected_phones.map(String));
    list = list.filter(c => allowed.has(String(c.phone)));
    if (list.length === 0) return res.status(400).json({ message: 'None of the selected contacts were found' });
  }

  const pool = getPool();
  const [ins] = await pool.query(
    `INSERT INTO campaigns (offer_id, shop_id, owner_id, total_contacts, sent_count, failed_count, status, message)
     VALUES (?,?,?,?,0,0,'running',?)`,
    [offer_id || null, shop_id || null, req.user.id, list.length, message]
  );
  const campId = ins.insertId;

  const logRows = list.map(c => [campId, c.phone, c.name || '', 'pending']);
  await pool.query('INSERT INTO campaign_logs (campaign_id, phone, contact_name, status) VALUES ?', [logRows]);

  const [[camp]] = await pool.query('SELECT * FROM campaigns WHERE id = ?', [campId]);
  wa.runCampaign(campId);   // background — non-blocking
  res.status(201).json(camp);
});

// GET /api/campaigns/:id — live progress
router.get('/:id', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const pool = getPool();
  const [[camp]] = await pool.query(
    `SELECT c.*, o.title AS offer_title
     FROM campaigns c LEFT JOIN offers o ON o.id = c.offer_id
     WHERE c.id = ? AND c.owner_id = ?`,
    [req.params.id, req.user.id]
  );
  if (!camp) return res.status(404).json({ message: 'Not found' });
  res.json(camp);
});

// POST /api/campaigns/:id/pause
router.post('/:id/pause', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const pool = getPool();
  await pool.query('UPDATE campaigns SET status="paused" WHERE id=? AND owner_id=?', [req.params.id, req.user.id]);
  const c = wa.activeCamps[req.params.id];
  if (c) c.running = false;
  res.json({ message: 'Paused' });
});

// POST /api/campaigns/:id/resume
router.post('/:id/resume', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const pool = getPool();
  await pool.query('UPDATE campaigns SET status="running" WHERE id=? AND owner_id=?', [req.params.id, req.user.id]);
  wa.runCampaign(parseInt(req.params.id, 10));
  res.json({ message: 'Resumed' });
});

// POST /api/campaigns/:id/stop
router.post('/:id/stop', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const pool = getPool();
  await pool.query('UPDATE campaigns SET status="stopped", updated_at=NOW() WHERE id=? AND owner_id=?', [req.params.id, req.user.id]);
  const c = wa.activeCamps[req.params.id];
  if (c) c.running = false;
  res.json({ message: 'Stopped' });
});

module.exports = router;
