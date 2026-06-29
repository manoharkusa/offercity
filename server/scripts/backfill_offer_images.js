/**
 * One-time backfill: generate an innovative AI image (Pollinations/flux) for every
 * offer that has no image, then update the DB row. Run on EC2:
 *   cd /home/ubuntu/offercity/server && node scripts/backfill_offer_images.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

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
    req.setTimeout(60000, () => req.destroy(new Error('Image download timed out')));
    req.on('error', reject);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const pool = mysql.createPool({
    host:     process.env.DB_HOST || 'localhost',
    user:     process.env.DB_USER || 'offercity',
    password: process.env.DB_PASS ?? process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'offercity',
    waitForConnections: true, connectionLimit: 2,
  });

  const uploadsDir = path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const [offers] = await pool.query(
    `SELECT o.id, o.title, o.discount, s.category, s.name AS shop_name
     FROM offers o JOIN shops s ON s.id = o.shop_id
     WHERE o.image IS NULL OR o.image = ''`
  );
  console.log(`Found ${offers.length} offers without an image.\n`);

  let ok = 0, fail = 0;
  for (const o of offers) {
    try {
      const prompt = buildImagePrompt({ category: o.category, title: o.title, discount: o.discount, shop_name: o.shop_name });
      const seed = Math.floor(Math.random() * 99999);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux&nologo=true&seed=${seed}`;
      process.stdout.write(`#${o.id} "${o.title.slice(0,30)}" [${o.category||'Other'}] ... `);
      const buf = await downloadImage(url);
      if (!buf || buf.length < 2000) throw new Error(`tiny buffer ${buf && buf.length}`);
      const filename = `ai_${Date.now()}.jpg`;
      await fs.promises.writeFile(path.join(uploadsDir, filename), buf);
      await pool.query('UPDATE offers SET image = ? WHERE id = ?', [`/uploads/${filename}`, o.id]);
      console.log(`OK (${Math.round(buf.length/1024)}KB) -> /uploads/${filename}`);
      ok++;
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
      fail++;
    }
    await sleep(2000); // be gentle to Pollinations
  }

  console.log(`\nDone. generated=${ok} failed=${fail}`);
  await pool.end();
  process.exit(0);
})();
