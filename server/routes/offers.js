const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { getPool } = require('../config/db');
const { protect, requireRole } = require('../middleware/auth');
const log = require('../utils/log');

const cache = require('../utils/cache');
const router = express.Router();

function buildImagePrompt({ category, title, discount, shop_name }) {
  const styles = {
    'Fashion':     'luxury Indian fashion boutique, elegant ethnic wear and sarees on display, silk embroidery, vibrant jewel tones, golden warm lighting, premium store atmosphere',
    'Food':        'appetizing Indian restaurant food photography, fresh ingredients, steam rising, warm candlelight, rustic wooden table, Michelin star plating quality',
    'Electronics': 'modern electronics product photography, futuristic neon blue lighting, dark background, clean minimalist tech aesthetic, cinematic composition',
    'Beauty':      'luxury beauty cosmetics flat lay, flower petals, marble surface, rose gold accents, soft studio lighting, glamour editorial style',
    'Grocery':     'fresh colorful vegetables and fruits arranged artfully, vibrant farmers market style, natural sunlight, wholesome organic feel',
    'Health':      'clean wellness health products, white minimalist background, green accents, fresh herbs, calm spa atmosphere',
    'Travel':      'breathtaking scenic Indian destination, golden hour landscape, vibrant colors, professional travel photography, wanderlust',
    'Other':       'professional product photography, clean background, vibrant colors, commercial advertisement style'
  };
  const style = styles[category] || styles['Other'];
  const discountText = discount ? `${discount}% discount special sale offer` : 'special promotional offer';
  return `${style}, ${discountText}, Indian market, high quality commercial photography, ultra realistic, 8K detail, no text, no watermark, no price tags`;
}

function downloadImage(url, depth = 0) {
  if (depth > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadImage(res.headers.location, depth + 1));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.setTimeout(45000, () => { req.destroy(new Error('Image download timed out')); });
    req.on('error', reject);
  });
}

// Per-user cooldown for AI image generation (max 1 per 10s)
const _aiGenLastCall = {};
function aiRateLimit(userId) {
  const now = Date.now();
  if (_aiGenLastCall[userId] && now - _aiGenLastCall[userId] < 10000) return false;
  _aiGenLastCall[userId] = now;
  return true;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/offers?lat=&lng=&radius=&category=&city=
router.get('/', async (req, res) => {
  const { lat, lng, radius = 10, category, city } = req.query;
  const cacheKey = `offers:list:${city||''}:${category||''}:${lat||''}:${lng||''}:${radius}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);
  try {
    const pool = getPool();
    let query, params;

    const activeClause = `o.is_active = true
        AND (o.valid_until IS NULL OR o.valid_until >= CURDATE())
        AND (o.flash_expires_at IS NULL OR o.flash_expires_at > NOW())
        AND s.status != 'rejected'`;

    if (lat && lng) {
      const r = parseFloat(radius);
      const latDelta = r / 111.0;
      const lngDelta = r / (111.0 * Math.cos(parseFloat(lat) * Math.PI / 180));
      query = `
        SELECT o.*, s.name AS shop_name, s.slug, s.city, s.area, s.address, s.category, s.lat, s.lng,
          (6371 * ACOS(LEAST(1, COS(RADIANS(?)) * COS(RADIANS(s.lat)) *
            COS(RADIANS(s.lng) - RADIANS(?)) +
            SIN(RADIANS(?)) * SIN(RADIANS(s.lat))))) AS distance
        FROM offers o JOIN shops s ON s.id = o.shop_id
        WHERE ${activeClause}
          AND s.lat BETWEEN ? AND ?
          AND s.lng BETWEEN ? AND ?
        HAVING distance <= ?
        ORDER BY o.flash_expires_at IS NULL ASC, distance ASC
        LIMIT 50
      `;
      params = [lat, lng, lat,
        parseFloat(lat) - latDelta, parseFloat(lat) + latDelta,
        parseFloat(lng) - lngDelta, parseFloat(lng) + lngDelta,
        r];
    } else {
      query = `
        SELECT o.*, s.name AS shop_name, s.slug, s.city, s.area, s.address, s.category, s.lat, s.lng
        FROM offers o JOIN shops s ON s.id = o.shop_id
        WHERE ${activeClause}
        ${category ? 'AND s.category = ?' : ''}
        ${city ? 'AND s.city LIKE ?' : ''}
        ORDER BY o.flash_expires_at IS NULL ASC, o.created_at DESC LIMIT 50
      `;
      params = [];
      if (category) params.push(category);
      if (city) params.push(`%${city}%`);
    }

    const [offers] = await pool.query(query, params);
    cache.set(cacheKey, offers);
    res.json(offers);
  } catch (err) {
    log.error('[offers] error:', err.message, err.stack);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/offers/mine  — all active offers for the logged-in owner (all shops)
router.get('/mine', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT o.*, s.name AS shop_name FROM offers o
       JOIN shops s ON s.id = o.shop_id
       WHERE s.owner_id = ? AND o.is_active = 1
       ORDER BY s.name, o.title`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { log.error('[offers] error:', err.message); res.status(500).json({ message: err.message }); }
});

// GET /api/offers/shop/:shopId  — must be BEFORE /:id
router.get('/shop/:shopId', async (req, res) => {
  try {
    const [offers] = await getPool().query(
      'SELECT * FROM offers WHERE shop_id = ? ORDER BY created_at DESC', [req.params.shopId]
    );
    res.json(offers);
  } catch (err) {
    log.error('[offers] error:', err.message, err.stack);
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
    log.error('[offers] error:', err.message, err.stack);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/offers/generate-image  — free AI image via Pollinations.ai (no API key needed)
router.post('/generate-image', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  if (!aiRateLimit(req.user.id))
    return res.status(429).json({ message: 'Please wait 10 seconds before generating another image' });

  const { category, title, discount, shop_name } = req.body;
  try {
    const prompt = buildImagePrompt({ category: category || 'Other', title, discount, shop_name });
    const seed = Math.floor(Math.random() * 99999);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;

    log.info(`[offers] AI image: category=${category} title=${title} discount=${discount}`);
    const buffer = await downloadImage(url);
    const filename = `ai_${Date.now()}.jpg`;
    await fs.promises.writeFile(path.join(__dirname, '../uploads', filename), buffer);

    res.json({ image: `/uploads/${filename}` });
  } catch (err) {
    log.error('[offers] generate-image error:', err.message, err.stack);
    res.status(500).json({ message: 'Could not generate image — please try again' });
  }
});

// POST /api/offers  (shop_owner)
router.post('/', protect, requireRole('shop_owner', 'admin'), upload.single('image'), async (req, res) => {
  const { shop_id, title, description, discount, original_price, offer_price, valid_until, flash_hours } = req.body;
  if (!shop_id || !title) return res.status(400).json({ message: 'shop_id and title required' });
  try {
    const pool = getPool();
    const [shopRows] = await pool.query('SELECT id, name, city, slug FROM shops WHERE id = ? AND owner_id = ?', [shop_id, req.user.id]);
    if (shopRows.length === 0 && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Not your shop' });

    const aiPath = req.body.ai_image_path;
    const image = req.file
      ? `/uploads/${req.file.filename}`
      : (typeof aiPath === 'string' && /^\/uploads\/ai_\d+\.jpg$/.test(aiPath) ? aiPath : null);
    const flash_expires_at = flash_hours
      ? new Date(Date.now() + parseFloat(flash_hours) * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')
      : null;

    const [result] = await pool.query(
      'INSERT INTO offers (shop_id, title, description, discount, original_price, offer_price, valid_until, image, flash_expires_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [shop_id, title, description, discount || 0, original_price, offer_price, valid_until || null, image, flash_expires_at]
    );
    const [rows] = await pool.query('SELECT * FROM offers WHERE id = ?', [result.insertId]);
    cache.del('offers:list:');
    cache.del(`offers:shop:${shop_id}`);
    cache.del(`shops:id:${shop_id}`);
    cache.del(`shops:slug:${shopRows[0].slug}`);
    res.status(201).json(rows[0]);

    // Fire-and-forget push — flash sales get urgent title
    const [shopFull] = await getPool().query('SELECT * FROM shops WHERE id = ?', [shop_id]);
    if (shopFull.length) {
      const pushOffer = flash_expires_at
        ? { ...rows[0], title: `⚡ FLASH SALE — ${flash_hours}hr only! ${title}` }
        : rows[0];
      require('../services/push').notifyNearbyUsers(pushOffer, shopFull[0]).catch(() => {});
    }
  } catch (err) {
    log.error('[offers] error:', err.message, err.stack);
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
    cache.del('offers:list:');
    cache.del(`offers:shop:${rows[0].shop_id}`);
    cache.del(`shops:id:${rows[0].shop_id}`);
    res.json(updated[0]);
  } catch (err) {
    log.error('[offers] error:', err.message, err.stack);
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
    cache.del('offers:list:');
    cache.del(`offers:shop:${rows[0].shop_id}`);
    cache.del(`shops:id:${rows[0].shop_id}`);
    res.json({ message: 'Offer deleted' });
  } catch (err) {
    log.error('[offers] error:', err.message, err.stack);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
