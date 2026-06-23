const express = require('express');
const bcrypt  = require('bcryptjs');
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
  if (!['user', 'shop_owner', 'admin', 'bdo'].includes(role))
    return res.status(400).json({ message: 'Invalid role' });
  try {
    await getPool().query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    res.json({ message: 'Role updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── BDO Management ────────────────────────────────────────────────────────

// POST /api/admin/bdos — create a new BDO
router.post('/bdos', async (req, res) => {
  const { name, email, phone, password, pincodes } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password required' });
  try {
    const pool = getPool();
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'bdo')",
      [name, email, hash]
    );
    const bdoId = result.insertId;
    if (pincodes && pincodes.length > 0) {
      for (const { pincode, area_name } of pincodes) {
        await pool.query(
          'INSERT IGNORE INTO bdo_areas (bdo_id, pincode, area_name) VALUES (?, ?, ?)',
          [bdoId, pincode.trim(), area_name || '']
        );
      }
    }
    res.status(201).json({ id: bdoId, name, email, phone, role: 'bdo' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Email already exists' });
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/bdos — list all BDOs with their areas
router.get('/bdos', async (req, res) => {
  try {
    const pool = getPool();
    const [bdos] = await pool.query(
      "SELECT id, name, email, created_at FROM users WHERE role = 'bdo' ORDER BY created_at DESC"
    );
    for (const bdo of bdos) {
      const [areas] = await pool.query(
        'SELECT pincode, area_name FROM bdo_areas WHERE bdo_id = ? ORDER BY area_name',
        [bdo.id]
      );
      bdo.areas = areas;
      const [[{ pending }]] = await pool.query(
        `SELECT COUNT(*) AS pending FROM shops WHERE bdo_id = ? AND status = 'pending'`, [bdo.id]
      );
      bdo.pending_count = pending;
    }
    res.json(bdos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/bdos/:id/areas — replace pincodes for a BDO
router.put('/bdos/:id/areas', async (req, res) => {
  const { pincodes } = req.body; // [{ pincode, area_name }]
  try {
    const pool = getPool();
    await pool.query('DELETE FROM bdo_areas WHERE bdo_id = ?', [req.params.id]);
    for (const { pincode, area_name } of (pincodes || [])) {
      await pool.query(
        'INSERT INTO bdo_areas (bdo_id, pincode, area_name) VALUES (?, ?, ?)',
        [req.params.id, pincode.trim(), area_name || '']
      );
    }
    res.json({ message: 'Areas updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/admin/bdos/:id
router.delete('/bdos/:id', async (req, res) => {
  try {
    await getPool().query("DELETE FROM users WHERE id = ? AND role = 'bdo'", [req.params.id]);
    res.json({ message: 'BDO deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/admin/shops/pending — all pending shops with payment & Aadhar info
router.get('/shops/pending', async (req, res) => {
  try {
    const [shops] = await getPool().query(
      `SELECT s.id, s.name, s.category, s.address, s.city, s.pin_code,
              s.description, s.status, s.created_at,
              s.owner_phone, s.owner_aadhar_number, s.owner_aadhar_photo,
              s.payment_screenshot, s.payment_amount, s.rejection_reason,
              u.name AS owner_name, u.email AS owner_email,
              b.name AS bdo_name, b.id AS bdo_id
       FROM shops s
       JOIN users u ON u.id = s.owner_id
       LEFT JOIN users b ON b.id = s.bdo_id
       WHERE s.status = 'pending'
       ORDER BY s.created_at DESC`
    );
    res.json(shops);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/shops/:id/approve — approve + generate fresh credentials for shop owner
router.put('/shops/:id/approve', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT s.*, u.email AS owner_email, u.name AS owner_name FROM shops s JOIN users u ON u.id = s.owner_id WHERE s.id = ?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Shop not found' });

    // Generate a new password for the shop owner
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const newPassword = Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const hash = await bcrypt.hash(newPassword, 10);

    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hash, rows[0].owner_id]);
    await pool.query(
      "UPDATE shops SET status='approved', approved_at=NOW(), rejection_reason=NULL WHERE id=?",
      [req.params.id]
    );

    res.json({
      message: 'Shop approved and live.',
      credentials: {
        shop_name:  rows[0].name,
        owner_name: rows[0].owner_name,
        email:      rows[0].owner_email,
        password:   newPassword,
        login_url:  'https://offerscity.co.in/login',
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/admin/shops/:id/reject
router.put('/shops/:id/reject', async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ message: 'Rejection reason required' });
  try {
    await getPool().query(
      "UPDATE shops SET status='rejected', rejection_reason=? WHERE id=?",
      [reason, req.params.id]
    );
    res.json({ message: 'Shop rejected.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
