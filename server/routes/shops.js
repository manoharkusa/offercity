const express = require('express');
const multer = require('multer');
const path = require('path');
const { getPool } = require('../config/db');
const { protect, requireRole } = require('../middleware/auth');
const log = require('../utils/log');
const cache = require('../utils/cache');

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

// GET /api/shops/cities — distinct cities that have at least one active offer
router.get('/cities', async (req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT DISTINCT s.city FROM shops s
       JOIN offers o ON o.shop_id = s.id
       WHERE s.city IS NOT NULL AND s.city != ''
         AND s.status != 'rejected'
         AND o.is_active = 1
         AND (o.valid_until IS NULL OR o.valid_until >= CURDATE())
       ORDER BY s.city ASC`
    );
    res.json(rows.map(r => r.city));
  } catch (err) {
    log.error('[shops] cities error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/shops/owner/mine  — must come before /:id
router.get('/owner/mine', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  try {
    const [shops] = await getPool().query(
      'SELECT * FROM shops WHERE owner_id = ? ORDER BY created_at DESC', [req.user.id]
    );
    res.json(shops);
  } catch (err) {
    log.error('[shops] error:', err.message, err.stack);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/shops/slug/:slug  — public shop profile page data
router.get('/slug/:slug', async (req, res) => {
  const cacheKey = `shops:slug:${req.params.slug}`;
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT id FROM shops WHERE slug = ?', [req.params.slug]);
    if (rows.length === 0) return res.status(404).json({ message: 'Shop not found' });
    // Increment shop view count on every load (fire-and-forget)
    pool.query('UPDATE shops SET views = views + 1 WHERE id = ?', [rows[0].id]).catch(() => {});
    const cached = cache.get(cacheKey);
    if (cached) return res.set('X-Cache', 'HIT').json(cached);
    const detail = await shopDetail(pool, rows[0].id);
    cache.set(cacheKey, detail);
    res.json(detail);
  } catch (err) {
    log.error('[shops] error:', err.message, err.stack);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/shops?lat=&lng=&radius=&category=&city=
router.get('/', async (req, res) => {
  const { lat, lng, radius = 10, category, city } = req.query;
  const cacheKey = `shops:list:${city||''}:${category||''}:${lat||''}:${lng||''}:${radius}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.set('X-Cache', 'HIT').json(cached);
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
    cache.set(cacheKey, shops);
    res.json(shops);
  } catch (err) {
    log.error('[shops] error:', err.message, err.stack);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/shops/:id
router.get('/:id', async (req, res) => {
  const cacheKey = `shops:id:${req.params.id}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.set('X-Cache', 'HIT').json(cached);
  try {
    const pool = getPool();
    const detail = await shopDetail(pool, req.params.id);
    if (!detail) return res.status(404).json({ message: 'Shop not found' });
    cache.set(cacheKey, detail);
    res.json(detail);
  } catch (err) {
    log.error('[shops] error:', err.message, err.stack);
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

    // Auto-assign BDO and area name by pincode
    const [bdoRows] = await pool.query(
      'SELECT bdo_id, area_name FROM bdo_areas WHERE pincode = ? LIMIT 1', [pin_code.trim()]
    );
    const bdo_id   = bdoRows.length > 0 ? bdoRows[0].bdo_id : null;
    const area     = bdoRows.length > 0 ? (bdoRows[0].area_name || null) : null;
    const status   = req.user.role === 'admin' ? 'approved' : 'pending';

    const [result] = await pool.query(
      'INSERT INTO shops (owner_id, name, slug, description, category, address, city, pin_code, lat, lng, image, status, bdo_id, area) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [req.user.id, name, slug, description, category, address, city, pin_code.trim(), lat, lng, image, status, bdo_id, area]
    );
    const [rows] = await pool.query('SELECT * FROM shops WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    log.error('[shops] error:', err.message, err.stack);
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
    // Bust cache for this shop (slug may have changed too)
    cache.del(`shops:id:${req.params.id}`);
    cache.del(`shops:slug:${rows[0].slug}`);
    cache.del(`shops:slug:${updated[0].slug}`);
    cache.del('shops:list:');
    res.json(updated[0]);
  } catch (err) {
    log.error('[shops] error:', err.message, err.stack);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/shops/:id/catalog
router.get('/:id/catalog', async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT id, name, price, description, sort_order FROM shop_catalog WHERE shop_id = ? ORDER BY sort_order, id',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { log.error('[shops] error:', err.message); res.status(500).json({ message: err.message }); }
});

// Helper: verify shop ownership
async function ownsShop(pool, shopId, user) {
  const [rows] = await pool.query('SELECT owner_id FROM shops WHERE id = ?', [shopId]);
  if (!rows.length) return null;
  if (user.role === 'admin' || rows[0].owner_id === user.id) return rows[0];
  return null;
}

// POST /api/shops/:id/catalog — add a single item
router.post('/:id/catalog', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const { name, price, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Item name is required' });
  try {
    const pool = getPool();
    if (!await ownsShop(pool, req.params.id, req.user))
      return res.status(403).json({ message: 'Not your shop' });
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM shop_catalog WHERE shop_id = ?', [req.params.id]);
    const [r] = await pool.query(
      'INSERT INTO shop_catalog (shop_id, name, price, description, sort_order) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, name.trim(), price || null, description?.trim() || null, n]
    );
    res.status(201).json({ id: r.insertId, name: name.trim(), price: price || null, description: description?.trim() || null, sort_order: n });
  } catch (err) { log.error('[shops] error:', err.message); res.status(500).json({ message: err.message }); }
});

// PUT /api/shops/:id/catalog/:itemId — update a single item in-place
router.put('/:id/catalog/:itemId', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const { name, price, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: 'Item name is required' });
  try {
    const pool = getPool();
    if (!await ownsShop(pool, req.params.id, req.user))
      return res.status(403).json({ message: 'Not your shop' });
    await pool.query(
      'UPDATE shop_catalog SET name=?, price=?, description=? WHERE id=? AND shop_id=?',
      [name.trim(), price || null, description?.trim() || null, req.params.itemId, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { log.error('[shops] error:', err.message); res.status(500).json({ message: err.message }); }
});

// DELETE /api/shops/:id/catalog/:itemId — remove a single item
router.delete('/:id/catalog/:itemId', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  try {
    const pool = getPool();
    if (!await ownsShop(pool, req.params.id, req.user))
      return res.status(403).json({ message: 'Not your shop' });
    await pool.query('DELETE FROM shop_catalog WHERE id=? AND shop_id=?', [req.params.itemId, req.params.id]);
    res.json({ ok: true });
  } catch (err) { log.error('[shops] error:', err.message); res.status(500).json({ message: err.message }); }
});

// PUT /api/shops/:id/location — shop owner saves their GPS coordinates
router.put('/:id/location', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) return res.status(400).json({ message: 'lat and lng required' });
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT owner_id FROM shops WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Shop not found' });
    if (req.user.role !== 'admin' && rows[0].owner_id !== req.user.id)
      return res.status(403).json({ message: 'Not your shop' });
    await pool.query('UPDATE shops SET lat = ?, lng = ? WHERE id = ?', [lat, lng, req.params.id]);
    res.json({ ok: true, lat, lng });
  } catch (err) {
    log.error('[shops] error:', err.message, err.stack);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/shops/:id/qrcode — returns QR data URL for the shop's public page
router.get('/:id/qrcode', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT slug, name FROM shops WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Shop not found' });
    const { slug } = rows[0];
    const shopUrl = `${process.env.CLIENT_URL || 'https://offercity.in'}/shop/${slug}`;
    const QRCode = require('qrcode');
    const dataUrl = await QRCode.toDataURL(shopUrl, { margin: 1, width: 300 });
    res.json({ dataUrl, url: shopUrl });
  } catch (err) {
    log.error('[shops] qrcode error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
