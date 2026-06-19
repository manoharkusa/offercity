const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('../config/db');
const { protect } = require('../middleware/auth');

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: 'Name, email and password required' });
  const userRole = ['user', 'shop_owner'].includes(role) ? role : 'user';
  try {
    const pool = getPool();
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(400).json({ message: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 8);
    const [result] = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashed, userRole]
    );
    const token = signToken(result.insertId);
    res.status(201).json({ token, user: { id: result.insertId, name, email, role: userRole } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });
    // Re-hash with lower cost factor if stored hash uses cost > 8 (speeds up future logins)
    const costMatch = user.password.match(/^\$2[ab]?\$(\d+)\$/);
    if (costMatch && parseInt(costMatch[1]) > 8) {
      bcrypt.hash(password, 8).then(h =>
        pool.query('UPDATE users SET password=? WHERE id=?', [h, user.id])
      ).catch(() => {});
    }
    const token = signToken(user.id);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/me', protect, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id, name, email, role, lat, lng, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const [saved] = await pool.query(
      `SELECT o.*, s.name AS shop_name, s.city
       FROM saved_offers so
       JOIN offers o ON o.id = so.offer_id
       JOIN shops s ON s.id = o.shop_id
       WHERE so.user_id = ?`,
      [req.user.id]
    );
    res.json({ ...rows[0], savedOffers: saved });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/location', protect, async (req, res) => {
  const { lat, lng } = req.body;
  try {
    await getPool().query('UPDATE users SET lat = ?, lng = ? WHERE id = ?', [lat, lng, req.user.id]);
    res.json({ message: 'Location updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/save-offer/:offerId', protect, async (req, res) => {
  try {
    const pool = getPool();
    const [existing] = await pool.query(
      'SELECT id FROM saved_offers WHERE user_id = ? AND offer_id = ?',
      [req.user.id, req.params.offerId]
    );
    if (existing.length > 0) {
      await pool.query('DELETE FROM saved_offers WHERE user_id = ? AND offer_id = ?',
        [req.user.id, req.params.offerId]);
      return res.json({ saved: false });
    }
    await pool.query('INSERT INTO saved_offers (user_id, offer_id) VALUES (?, ?)',
      [req.user.id, req.params.offerId]);
    res.json({ saved: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
