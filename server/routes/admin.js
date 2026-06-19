const express = require('express');
const { getPool } = require('../config/db');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(protect, requireRole('admin'));

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const pool = getPool();
    const [[{ users }]] = await pool.query('SELECT COUNT(*) AS users FROM users');
    const [[{ shops }]] = await pool.query('SELECT COUNT(*) AS shops FROM shops');
    const [[{ offers }]] = await pool.query('SELECT COUNT(*) AS offers FROM offers');
    const [[{ reviews }]] = await pool.query('SELECT COUNT(*) AS reviews FROM reviews');
    res.json({ users, shops, offers, reviews });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const [users] = await getPool().query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    await getPool().query('DELETE FROM users WHERE id = ?', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/shops
router.get('/shops', async (req, res) => {
  try {
    const [shops] = await getPool().query(
      `SELECT s.*, u.name AS owner_name, u.email AS owner_email
       FROM shops s JOIN users u ON u.id = s.owner_id ORDER BY s.created_at DESC`
    );
    res.json(shops);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/shops/:id
router.delete('/shops/:id', async (req, res) => {
  try {
    await getPool().query('DELETE FROM shops WHERE id = ?', [req.params.id]);
    res.json({ message: 'Shop deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/offers
router.get('/offers', async (req, res) => {
  try {
    const [offers] = await getPool().query(
      `SELECT o.*, s.name AS shop_name FROM offers o
       JOIN shops s ON s.id = o.shop_id ORDER BY o.created_at DESC`
    );
    res.json(offers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/users/:id/role
router.put('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['user', 'shop_owner', 'admin'].includes(role))
    return res.status(400).json({ message: 'Invalid role' });
  try {
    await getPool().query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ message: 'Role updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
