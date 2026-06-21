const express = require('express');
const { getPool } = require('../config/db');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

// User's stamp code = zero-padded user ID (e.g. user 7 → "000007")
const toCode = (id) => String(id).padStart(6, '0');
const fromCode = (code) => parseInt(code, 10);

// POST /api/stamps/cards  — shop owner creates a stamp card
router.post('/cards', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const { shop_id, title, required_stamps = 5, reward } = req.body;
  if (!shop_id || !title || !reward) return res.status(400).json({ message: 'shop_id, title and reward required' });
  try {
    const pool = getPool();
    const [shopRows] = await pool.query('SELECT id FROM shops WHERE id=? AND owner_id=?', [shop_id, req.user.id]);
    if (shopRows.length === 0 && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not your shop' });
    const [result] = await pool.query(
      'INSERT INTO stamp_cards (shop_id, title, required_stamps, reward) VALUES (?,?,?,?)',
      [shop_id, title, required_stamps, reward]
    );
    const [rows] = await pool.query('SELECT * FROM stamp_cards WHERE id=?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/stamps/cards/shop/:shopId  — public, get active cards for a shop
router.get('/cards/shop/:shopId', async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT * FROM stamp_cards WHERE shop_id=? AND is_active=1 ORDER BY created_at DESC',
      [req.params.shopId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/stamps/cards/mine  — shop owner's cards
router.get('/cards/mine', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT sc.*, s.name AS shop_name,
        (SELECT COUNT(*) FROM customer_stamps cs WHERE cs.card_id=sc.id) AS total_customers,
        (SELECT COALESCE(SUM(cs.redeemed),0) FROM customer_stamps cs WHERE cs.card_id=sc.id) AS total_redeemed
       FROM stamp_cards sc JOIN shops s ON s.id=sc.shop_id
       WHERE s.owner_id=? ORDER BY sc.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/stamps/mine  — logged-in user sees their stamp progress
router.get('/mine', protect, async (req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT cs.*, sc.title, sc.required_stamps, sc.reward,
              s.name AS shop_name, s.slug, s.area, s.city
       FROM customer_stamps cs
       JOIN stamp_cards sc ON sc.id=cs.card_id
       JOIN shops s ON s.id=sc.shop_id
       WHERE cs.user_id=? AND sc.is_active=1
       ORDER BY cs.last_stamp_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/stamps/mycode  — user gets their stamp QR code value
router.get('/mycode', protect, (req, res) => {
  res.json({ code: toCode(req.user.id), user_id: req.user.id });
});

// POST /api/stamps/add  — shop owner adds a stamp to customer
router.post('/add', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const { card_id, user_code } = req.body;
  if (!card_id || !user_code) return res.status(400).json({ message: 'card_id and user_code required' });
  const user_id = fromCode(user_code);
  if (!user_id) return res.status(400).json({ message: 'Invalid customer code' });
  try {
    const pool = getPool();
    // Verify card belongs to owner
    const [cardRows] = await pool.query(
      `SELECT sc.*, s.owner_id FROM stamp_cards sc JOIN shops s ON s.id=sc.shop_id WHERE sc.id=?`,
      [card_id]
    );
    if (cardRows.length === 0) return res.status(404).json({ message: 'Card not found' });
    if (cardRows[0].owner_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not your stamp card' });
    // Verify customer exists
    const [userRows] = await pool.query('SELECT id, name FROM users WHERE id=?', [user_id]);
    if (userRows.length === 0) return res.status(404).json({ message: 'Customer not found' });

    const card = cardRows[0];
    await pool.query(
      `INSERT INTO customer_stamps (card_id, user_id, stamps, last_stamp_at)
       VALUES (?,?,1,NOW())
       ON DUPLICATE KEY UPDATE stamps=stamps+1, last_stamp_at=NOW()`,
      [card_id, user_id]
    );
    const [[cs]] = await pool.query('SELECT * FROM customer_stamps WHERE card_id=? AND user_id=?', [card_id, user_id]);
    const completed = Math.floor(cs.stamps / card.required_stamps);
    const newlyCompleted = completed > cs.redeemed;
    res.json({
      stamps: cs.stamps,
      required: card.required_stamps,
      customer_name: userRows[0].name,
      completed: newlyCompleted,
      reward: newlyCompleted ? card.reward : null,
      message: newlyCompleted
        ? `🎉 ${userRows[0].name} earned the reward: ${card.reward}!`
        : `✅ Stamp added! ${userRows[0].name} has ${cs.stamps}/${card.required_stamps} stamps.`
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/stamps/redeem/:id  — customer redeems their reward
router.post('/redeem/:id', protect, async (req, res) => {
  try {
    const pool = getPool();
    const [[cs]] = await pool.query(
      'SELECT cs.*, sc.required_stamps, sc.reward FROM customer_stamps cs JOIN stamp_cards sc ON sc.id=cs.card_id WHERE cs.id=? AND cs.user_id=?',
      [req.params.id, req.user.id]
    );
    if (!cs) return res.status(404).json({ message: 'Not found' });
    const earned = Math.floor(cs.stamps / cs.required_stamps);
    if (earned <= cs.redeemed) return res.status(400).json({ message: 'No reward to redeem yet' });
    await pool.query('UPDATE customer_stamps SET redeemed=redeemed+1 WHERE id=?', [req.params.id]);
    res.json({ message: `Reward redeemed: ${cs.reward}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
