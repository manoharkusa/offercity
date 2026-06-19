const express = require('express');
const { getPool } = require('../config/db');
const { protect } = require('../middleware/auth');

const router = express.Router();

// POST /api/reviews/:shopId
router.post('/:shopId', protect, async (req, res) => {
  const { rating, comment } = req.body;
  if (!rating || rating < 1 || rating > 5)
    return res.status(400).json({ message: 'Rating must be 1-5' });
  try {
    const pool = getPool();
    const [existing] = await pool.query(
      'SELECT id FROM reviews WHERE user_id = ? AND shop_id = ?',
      [req.user.id, req.params.shopId]
    );
    if (existing.length > 0)
      return res.status(400).json({ message: 'You already reviewed this shop' });
    const [result] = await pool.query(
      'INSERT INTO reviews (user_id, shop_id, rating, comment) VALUES (?, ?, ?, ?)',
      [req.user.id, req.params.shopId, rating, comment]
    );
    const [rows] = await pool.query(
      `SELECT r.*, u.name AS user_name FROM reviews r
       JOIN users u ON u.id = r.user_id WHERE r.id = ?`,
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reviews/:shopId
router.get('/:shopId', async (req, res) => {
  try {
    const [reviews] = await getPool().query(
      `SELECT r.*, u.name AS user_name FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.shop_id = ? ORDER BY r.created_at DESC`,
      [req.params.shopId]
    );
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
