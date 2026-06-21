const express = require('express');
const multer = require('multer');
const path = require('path');
const { getPool } = require('../config/db');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const makeSlug = (str) =>
  str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const uniqueSlug = async (pool, base, excludeId = null) => {
  let slug = base;
  let n = 1;
  while (true) {
    const [rows] = await pool.query(
      `SELECT id FROM shops WHERE slug = ? ${excludeId ? 'AND id != ?' : ''}`,
      excludeId ? [slug, excludeId] : [slug]
    );
    if (rows.length === 0) return slug;
    slug = base + n++;
  }
};

const shopDetail = async (pool, shopId) => {
  const [rows] = await pool.query(
    'SELECT s.*, u.name AS owner_name FROM shops s JOIN users u ON u.id = s.owner_id WHERE s.id = ?',
    [shopId]
  );
  if (rows.length === 0) return null;
  const [offers] = await pool.query(
    'SELECT * FROM offers WHERE shop_id = ? AND is_active = 1 AND (valid_until IS NULL OR valid_until >= CURDATE()) ORDER BY created_at DESC',
    [shopId]
  );
  const [reviews] = await pool.query(
    `SELECT r.*, u.name AS user_name FROM reviews r
     JOIN users u ON u.id = r.user_id WHERE r.shop_id = ? ORDER BY r.created_at DESC`,
    [shopId]
  );
  const [[avg]] = await pool.query(
    'SELECT AVG(rating) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE shop_id = ?',
    [shopId]
  );
  return { ...rows[0], offers, reviews, avg_rating: avg.avg_rating, review_count: avg.review_count };
};

// GET /api/shops/owner/mine  — must come before /:id
router.get('/owner/mine', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  try {
    const [shops] = await getPool().query(
      'SELECT * FROM shops WHERE owner_id = ? ORDER BY created_at DESC', [req.user.id]
    );
    res.json(shops);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/shops/slug/:slug  — public shop profile page data
router.get('/slug/:slug', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT id FROM shops WHERE slug = ?', [req.params.slug]);
    if (rows.length === 0) return res.status(404).json({ message: 'Shop not found' });
    const detail = await shopDetail(pool, rows[0].id);
    res.json(detail);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/shops?lat=&lng=&radius=&category=&city=
router.get('/', async (req, res) => {
  const { lat, lng, radius = 10, category, city } = req.query;
  try {
    const pool = getPool();
    let query, params;
    if (lat && lng) {
      query = `
        SELECT s.*, u.name AS owner_name,
          (6371 * ACOS(COS(RADIANS(?)) * COS(RADIANS(s.lat)) *
            COS(RADIANS(s.lng) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(s.lat)))) AS distance
        FROM shops s JOIN users u ON u.id = s.owner_id
        WHERE s.status = 'approved'
        HAVING distance <= ? ORDER BY distance ASC LIMIT 50
      `;
      params = [lat, lng, lat, parseFloat(radius)];
    } else {
      query = `
        SELECT s.*, u.name AS owner_name FROM shops s JOIN users u ON u.id = s.owner_id
        WHERE s.status = 'approved'
        ${category ? 'AND s.category = ?' : ''}
        ${city ? 'AND s.city LIKE ?' : ''}
        ORDER BY s.created_at DESC LIMIT 50
      `;
      params = [];
      if (category) params.push(category);
      if (city) params.push(`%${city}%`);
    }
    const [shops] = await pool.query(query, params);
    res.json(shops);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/shops/:id
router.get('/:id', async (req, res) => {
  try {
    const pool = getPool();
    const detail = await shopDetail(pool, req.params.id);
    if (!detail) return res.status(404).json({ message: 'Shop not found' });
    res.json(detail);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/shops
router.post('/', protect, requireRole('shop_owner', 'admin'), upload.single('image'), async (req, res) => {
  const { name, description, category, address, city, pin_code, lat, lng } = req.body;
  if (!name || !lat || !lng) return res.status(400).json({ message: 'Name, lat and lng required' });
  if (!pin_code) return res.status(400).json({ message: 'Pin code is required' });
  try {
    const pool = getPool();
    const slug = await uniqueSlug(pool, makeSlug(name));
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    // Auto-assign BDO by pincode
    const [bdoRows] = await pool.query(
      'SELECT bdo_id FROM bdo_areas WHERE pincode = ? LIMIT 1', [pin_code.trim()]
    );
    const bdo_id = bdoRows.length > 0 ? bdoRows[0].bdo_id : null;
    const status = req.user.role === 'admin' ? 'approved' : 'pending';

    const [result] = await pool.query(
      'INSERT INTO shops (owner_id, name, slug, description, category, address, city, pin_code, lat, lng, image, status, bdo_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [req.user.id, name, slug, description, category, address, city, pin_code.trim(), lat, lng, image, status, bdo_id]
    );
    const [rows] = await pool.query('SELECT * FROM shops WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/shops/:id
router.put('/:id', protect, requireRole('shop_owner', 'admin'), upload.single('image'), async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM shops WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Shop not found' });
    if (rows[0].owner_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not authorized' });

    const { name, description, category, address, city, pin_code, lat, lng } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : rows[0].image;
    const newName = name || rows[0].name;
    const slug = name && name !== rows[0].name
      ? await uniqueSlug(pool, makeSlug(name), req.params.id)
      : rows[0].slug;

    await pool.query(
      'UPDATE shops SET name=?, slug=?, description=?, category=?, address=?, city=?, pin_code=?, lat=?, lng=?, image=? WHERE id=?',
      [newName, slug, description, category, address, city,
       pin_code !== undefined ? pin_code : rows[0].pin_code,
       lat || rows[0].lat, lng || rows[0].lng, image, req.params.id]
    );
    const [updated] = await pool.query('SELECT * FROM shops WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
