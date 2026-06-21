const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { getPool } = require('../config/db');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();
const bdoOnly = [protect, requireRole('bdo')];

// POST /api/bdo/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      "SELECT id, name, email, role, password FROM users WHERE email = ? AND role = 'bdo'",
      [email]
    );
    if (rows.length === 0) return res.status(401).json({ message: 'Invalid credentials' });
    const bdo = rows[0];
    const ok  = await bcrypt.compare(password, bdo.password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ id: bdo.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: bdo.id, name: bdo.name, email: bdo.email, role: 'bdo' } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/bdo/me — profile + assigned areas
router.get('/me', ...bdoOnly, async (req, res) => {
  try {
    const pool = getPool();
    const [areas] = await pool.query(
      'SELECT pincode, area_name FROM bdo_areas WHERE bdo_id = ? ORDER BY area_name',
      [req.user.id]
    );
    res.json({ ...req.user, areas });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/bdo/stats
router.get('/stats', ...bdoOnly, async (req, res) => {
  try {
    const pool = getPool();
    const [pincodes] = await pool.query('SELECT pincode FROM bdo_areas WHERE bdo_id = ?', [req.user.id]);
    if (pincodes.length === 0) return res.json({ pending: 0, approved: 0, rejected: 0, total: 0 });

    const pins = pincodes.map(r => r.pincode);
    const placeholders = pins.map(() => '?').join(',');

    const [[{ pending }]]  = await pool.query(`SELECT COUNT(*) AS pending  FROM shops WHERE pin_code IN (${placeholders}) AND status='pending'`,  pins);
    const [[{ approved }]] = await pool.query(`SELECT COUNT(*) AS approved FROM shops WHERE pin_code IN (${placeholders}) AND status='approved'`, pins);
    const [[{ rejected }]] = await pool.query(`SELECT COUNT(*) AS rejected FROM shops WHERE pin_code IN (${placeholders}) AND status='rejected'`, pins);
    res.json({ pending, approved, rejected, total: pending + approved + rejected });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/bdo/shops?status=pending|approved|rejected|all
router.get('/shops', ...bdoOnly, async (req, res) => {
  const { status = 'pending' } = req.query;
  try {
    const pool = getPool();
    const [pincodes] = await pool.query('SELECT pincode FROM bdo_areas WHERE bdo_id = ?', [req.user.id]);
    if (pincodes.length === 0) return res.json([]);

    const pins = pincodes.map(r => r.pincode);
    const placeholders = pins.map(() => '?').join(',');
    const statusClause = status === 'all' ? '' : `AND s.status = '${['pending','approved','rejected'].includes(status) ? status : 'pending'}'`;

    const [shops] = await pool.query(
      `SELECT s.*, u.name AS owner_name, u.email AS owner_email, u.id AS owner_user_id
       FROM shops s JOIN users u ON u.id = s.owner_id
       WHERE s.pin_code IN (${placeholders}) ${statusClause}
       ORDER BY s.created_at DESC`,
      pins
    );
    res.json(shops);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/bdo/shops/:id/approve
router.put('/shops/:id/approve', ...bdoOnly, async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM shops WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Shop not found' });

    // Verify this shop is in BDO's area
    const [areas] = await pool.query('SELECT pincode FROM bdo_areas WHERE bdo_id = ?', [req.user.id]);
    const pins = areas.map(a => a.pincode);
    if (!pins.includes(rows[0].pin_code))
      return res.status(403).json({ message: 'This shop is not in your area' });

    await pool.query(
      "UPDATE shops SET status='approved', bdo_id=?, rejection_reason=NULL, approved_at=NOW() WHERE id=?",
      [req.user.id, req.params.id]
    );
    res.json({ message: 'Shop approved and now live' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/bdo/shops/:id/reject
router.put('/shops/:id/reject', ...bdoOnly, async (req, res) => {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ message: 'Rejection reason is required' });
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM shops WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Shop not found' });

    const [areas] = await pool.query('SELECT pincode FROM bdo_areas WHERE bdo_id = ?', [req.user.id]);
    const pins = areas.map(a => a.pincode);
    if (!pins.includes(rows[0].pin_code))
      return res.status(403).json({ message: 'This shop is not in your area' });

    await pool.query(
      "UPDATE shops SET status='rejected', bdo_id=?, rejection_reason=?, approved_at=NULL WHERE id=?",
      [req.user.id, reason, req.params.id]
    );
    res.json({ message: 'Shop rejected' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
