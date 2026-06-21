const express = require('express');
const { getPool } = require('../config/db');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

// POST /api/coming  — user marks "I'm Coming"
router.post('/', protect, async (req, res) => {
  const { offer_id, eta_minutes = 15 } = req.body;
  if (!offer_id) return res.status(400).json({ message: 'offer_id required' });
  try {
    const pool = getPool();
    const [offerRows] = await pool.query(
      'SELECT o.*, s.id AS shop_id, s.name AS shop_name FROM offers o JOIN shops s ON s.id = o.shop_id WHERE o.id = ?',
      [offer_id]
    );
    if (offerRows.length === 0) return res.status(404).json({ message: 'Offer not found' });
    const offer = offerRows[0];
    const expires_at = new Date(Date.now() + parseInt(eta_minutes) * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      `INSERT INTO im_coming (offer_id, user_id, shop_id, user_name, eta_minutes, expires_at, status)
       VALUES (?,?,?,?,?,?,'coming')
       ON DUPLICATE KEY UPDATE eta_minutes=?, expires_at=?, status='coming'`,
      [offer_id, req.user.id, offer.shop_id, req.user.name, eta_minutes, expires_at, eta_minutes, expires_at]
    );
    res.json({ message: 'Confirmed! Shop notified.', eta_minutes, expires_at });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/coming/mine  — user sees their active reservations
router.get('/mine', protect, async (req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT ic.*, o.title AS offer_title, o.discount, s.name AS shop_name, s.address
       FROM im_coming ic
       JOIN offers o ON o.id = ic.offer_id
       JOIN shops s ON s.id = ic.shop_id
       WHERE ic.user_id = ? AND ic.status = 'coming' AND ic.expires_at > NOW()
       ORDER BY ic.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/coming/shop  — shop owner sees incoming customers
router.get('/shop', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const { shop_id } = req.query;
  try {
    const pool = getPool();
    let query = `
      SELECT ic.*, o.title AS offer_title, o.discount
      FROM im_coming ic
      JOIN offers o ON o.id = ic.offer_id
      JOIN shops s ON s.id = ic.shop_id
      WHERE ic.status = 'coming' AND ic.expires_at > NOW()
      AND s.owner_id = ?
      ${shop_id ? 'AND ic.shop_id = ?' : ''}
      ORDER BY ic.expires_at ASC`;
    const params = shop_id ? [req.user.id, shop_id] : [req.user.id];
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/coming/:id/arrived  — shop owner marks customer arrived
router.put('/:id/arrived', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  try {
    await getPool().query("UPDATE im_coming SET status='arrived' WHERE id=?", [req.params.id]);
    res.json({ message: 'Marked as arrived' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/coming/:id  — user cancels
router.delete('/:id', protect, async (req, res) => {
  try {
    await getPool().query(
      "UPDATE im_coming SET status='cancelled' WHERE id=? AND user_id=?",
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Cancelled' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
