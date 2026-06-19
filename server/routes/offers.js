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

// GET /api/offers?lat=&lng=&radius=&category=&city=
router.get('/', async (req, res) => {
  const { lat, lng, radius = 10, category, city } = req.query;
  try {
    const pool = getPool();
    let query, params;

    if (lat && lng) {
      query = `
        SELECT o.*, s.name AS shop_name, s.slug, s.city, s.address, s.category, s.lat, s.lng,
          (6371 * ACOS(COS(RADIANS(?)) * COS(RADIANS(s.lat)) *
            COS(RADIANS(s.lng) - RADIANS(?)) +
            SIN(RADIANS(?)) * SIN(RADIANS(s.lat)))) AS distance
        FROM offers o
        JOIN shops s ON s.id = o.shop_id
        WHERE o.is_active = true AND (o.valid_until IS NULL OR o.valid_until >= CURDATE())
        HAVING distance <= ?
        ORDER BY distance ASC
        LIMIT 50
      `;
      params = [lat, lng, lat, parseFloat(radius)];
    } else {
      query = `
        SELECT o.*, s.name AS shop_name, s.slug, s.city, s.address, s.category, s.lat, s.lng
        FROM offers o
        JOIN shops s ON s.id = o.shop_id
        WHERE o.is_active = true AND (o.valid_until IS NULL OR o.valid_until >= CURDATE())
        ${category ? 'AND s.category = ?' : ''}
        ${city ? 'AND s.city LIKE ?' : ''}
        ORDER BY o.created_at DESC LIMIT 50
      `;
      params = [];
      if (category) params.push(category);
      if (city) params.push(`%${city}%`);
    }

    const [offers] = await pool.query(query, params);
    res.json(offers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/offers/:id
router.get('/:id', async (req, res) => {
  try {
    const pool = getPool();
    await pool.query('UPDATE offers SET views = views + 1 WHERE id = ?', [req.params.id]);
    const [rows] = await pool.query(
      `SELECT o.*, s.name AS shop_name, s.city, s.address, s.lat, s.lng, s.category
       FROM offers o JOIN shops s ON s.id = o.shop_id WHERE o.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Offer not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/offers  (shop_owner)
router.post('/', protect, requireRole('shop_owner', 'admin'), upload.single('image'), async (req, res) => {
  const { shop_id, title, description, discount, original_price, offer_price, valid_until } = req.body;
  if (!shop_id || !title) return res.status(400).json({ message: 'shop_id and title required' });
  try {
    const pool = getPool();
    const [shopRows] = await pool.query('SELECT id, name, city, slug FROM shops WHERE id = ? AND owner_id = ?', [shop_id, req.user.id]);
    if (shopRows.length === 0 && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not your shop' });
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    const [result] = await pool.query(
      'INSERT INTO offers (shop_id, title, description, discount, original_price, offer_price, valid_until, image) VALUES (?,?,?,?,?,?,?,?)',
      [shop_id, title, description, discount || 0, original_price, offer_price, valid_until || null, image]
    );
    const [rows] = await pool.query('SELECT * FROM offers WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);

    // Fire-and-forget push notifications to subscribers
    if (shopRows.length) {
      const s = shopRows[0];
      const pageUrl = `https://offerscity.co.in/${s.city}/${s.slug}`;
      require('../services/push').notifyShopSubscribers(shop_id, rows[0], s.name, pageUrl).catch(() => {});
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/offers/:id
router.put('/:id', protect, requireRole('shop_owner', 'admin'), upload.single('image'), async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT o.*, s.owner_id FROM offers o JOIN shops s ON s.id = o.shop_id WHERE o.id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Offer not found' });
    if (rows[0].owner_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not authorized' });

    const { title, description, discount, original_price, offer_price, valid_until, is_active } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : rows[0].image;
    await pool.query(
      'UPDATE offers SET title=?, description=?, discount=?, original_price=?, offer_price=?, valid_until=?, is_active=?, image=? WHERE id=?',
      [title || rows[0].title, description, discount ?? rows[0].discount,
       original_price, offer_price, valid_until || null,
       is_active !== undefined ? is_active : rows[0].is_active, image, req.params.id]
    );
    const [updated] = await pool.query('SELECT * FROM offers WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/offers/:id
router.delete('/:id', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT o.id, s.owner_id FROM offers o JOIN shops s ON s.id = o.shop_id WHERE o.id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Offer not found' });
    if (rows[0].owner_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not authorized' });
    await pool.query('DELETE FROM offers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Offer deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/offers/shop/:shopId
router.get('/shop/:shopId', async (req, res) => {
  try {
    const [offers] = await getPool().query(
      'SELECT * FROM offers WHERE shop_id = ? ORDER BY created_at DESC', [req.params.shopId]
    );
    res.json(offers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
