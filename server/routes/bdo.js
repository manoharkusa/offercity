const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const multer  = require('multer');
const path    = require('path');
const { getPool } = require('../config/db');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();
const bdoOnly = [protect, requireRole('bdo')];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.fieldname + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

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

// POST /api/bdo/register-shop
// BDO fills shop details, captures owner Aadhar + payment screenshot
const registerFields = upload.fields([
  { name: 'owner_aadhar_photo',  maxCount: 1 },
  { name: 'payment_screenshot',  maxCount: 1 },
]);
router.post('/register-shop', ...bdoOnly, registerFields, async (req, res) => {
  const {
    owner_name, owner_email, owner_phone,
    owner_aadhar_number,
    shop_name, category, address, city, pin_code, description,
    payment_amount,
  } = req.body;

  if (!owner_name || !owner_email || !shop_name || !category || !address || !city) {
    return res.status(400).json({ message: 'owner_name, owner_email, shop_name, category, address, city are required' });
  }

  const aadharPhoto      = req.files?.owner_aadhar_photo?.[0]?.filename || null;
  const paymentScreenshot = req.files?.payment_screenshot?.[0]?.filename || null;

  if (!paymentScreenshot) {
    return res.status(400).json({ message: 'Payment screenshot is required' });
  }

  try {
    const pool = getPool();

    // Check if owner email already exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [owner_email]);
    let ownerId;

    if (existing.length > 0) {
      ownerId = existing[0].id;
    } else {
      // Create a temporary password — will be reset by admin on approval
      const tempPass = Math.random().toString(36).slice(-8) + 'Oc1!';
      const hash = await bcrypt.hash(tempPass, 10);
      const [result] = await pool.query(
        "INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, 'shop_owner', ?)",
        [owner_name, owner_email, hash, owner_phone || null]
      );
      ownerId = result.insertId;
    }

    // Generate slug
    const base = shop_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    let slug = base, n = 1;
    while (true) {
      const [rows] = await pool.query('SELECT id FROM shops WHERE slug = ?', [slug]);
      if (!rows.length) break;
      slug = base + n++;
    }

    const [shopResult] = await pool.query(
      `INSERT INTO shops
         (name, slug, category, address, city, pin_code, description, owner_id,
          bdo_id, status,
          owner_phone, owner_aadhar_number, owner_aadhar_photo,
          payment_screenshot, payment_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      [
        shop_name, slug, category, address, city, pin_code || null, description || null, ownerId,
        req.user.id,
        owner_phone || null, owner_aadhar_number || null, aadharPhoto,
        paymentScreenshot, payment_amount || null,
      ]
    );

    res.status(201).json({
      message: 'Shop registered successfully. Pending admin approval.',
      shop_id: shopResult.insertId,
      owner_id: ownerId,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/bdo/my-shops — shops created by this BDO
router.get('/my-shops', ...bdoOnly, async (req, res) => {
  try {
    const [shops] = await getPool().query(
      `SELECT s.id, s.name, s.category, s.city, s.status, s.created_at,
              u.name AS owner_name, u.email AS owner_email, s.owner_phone
       FROM shops s JOIN users u ON u.id = s.owner_id
       WHERE s.bdo_id = ?
       ORDER BY s.created_at DESC`,
      [req.user.id]
    );
    res.json(shops);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
