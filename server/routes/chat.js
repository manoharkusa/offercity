const express = require('express');
const { getPool } = require('../config/db');
const { callClaudeAI, callGroqAI, buildSystemPromptForShop, logChat } = require('../services/aichatbot');
const { protect, requireRole } = require('../middleware/auth');
const log = require('../utils/log');

const router = express.Router();

// IP-based rate limit: ip → { count, resetAt }
const ipLimits = {};
const LIMIT = 30;
const WINDOW_MS = 60000;

function checkRateLimit(ip) {
  const now = Date.now();
  if (!ipLimits[ip] || now > ipLimits[ip].resetAt) {
    ipLimits[ip] = { count: 1, resetAt: now + WINDOW_MS };
    return true;
  }
  if (ipLimits[ip].count >= LIMIT) return false;
  ipLimits[ip].count++;
  return true;
}

// POST /api/chat/ask  — public web chat (no auth needed, Claude primary / Groq fallback)
router.post('/ask', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ message: 'Too many messages. Please wait a moment.' });

  const { shop_id, message, history = [] } = req.body;
  if (!shop_id || !message?.trim()) return res.status(400).json({ message: 'shop_id and message required' });

  try {
    const pool = getPool();
    const [shops] = await pool.query(
      `SELECT id, name, category, address, city, pin_code, description, owner_id, lat, lng FROM shops WHERE id = ? LIMIT 1`,
      [shop_id]
    );
    if (!shops.length) return res.status(404).json({ message: 'Shop not found' });
    const shop = shops[0];

    const [offers] = await pool.query(
      `SELECT title, discount, offer_price, original_price, valid_until
       FROM offers WHERE shop_id = ? AND is_active = 1
       AND (valid_until IS NULL OR valid_until >= CURDATE())
       ORDER BY created_at DESC LIMIT 20`,
      [shop_id]
    );

    const mapsUrl = (shop.lat && shop.lng)
      ? `https://www.google.com/maps?q=${shop.lat},${shop.lng}`
      : null;
    const systemPrompt = buildSystemPromptForShop({ shops: [shop], offers, mapsUrl }, 'auto');

    const messages = [
      ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message.trim() }
    ];

    let reply = null;
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        reply = await callClaudeAI(systemPrompt, messages);
      } catch (claudeErr) {
        log.warn(`[chat] Claude failed, trying Groq: ${claudeErr.message}`);
        if (process.env.GROQ_API_KEY) {
          reply = await callGroqAI(systemPrompt, messages);
        }
      }
    } else if (process.env.GROQ_API_KEY) {
      reply = await callGroqAI(systemPrompt, messages);
    } else {
      log.warn('[chat] No AI API key configured');
      return res.status(503).json({ message: 'AI service not configured on server.' });
    }

    if (!reply || reply.trim().toUpperCase() === 'SKIP') {
      reply = `I can only help with questions about ${shop.name}. What would you like to know about our offers or services?`;
    }

    log.info(`[chat] ask shop=${shop_id} ip=${ip} msgLen=${message.trim().length}`);
    logChat({ shop_id, channel: 'web', customer_name: null, customer_phone: null, message: message.trim(), reply });

    res.json({ reply });
  } catch (err) {
    log.error('[chat] ask error:', err.message, err.stack);
    res.status(500).json({ message: 'Could not get a reply. Please try again.' });
  }
});

// GET /api/chat/logs?shop_id=X&channel=all&page=1
router.get('/logs', protect, requireRole('shop_owner', 'admin'), async (req, res) => {
  const { shop_id, channel = 'all', page = 1 } = req.query;
  const perPage = 100;
  const offset  = (parseInt(page) - 1) * perPage;

  try {
    const pool = getPool();

    if (req.user.role !== 'admin') {
      if (!shop_id) return res.status(400).json({ message: 'shop_id required' });
      const [own] = await pool.query('SELECT id FROM shops WHERE id = ? AND owner_id = ?', [shop_id, req.user.id]);
      if (!own.length) return res.status(403).json({ message: 'Not your shop' });
    }

    let where = shop_id ? 'cl.shop_id = ?' : '1=1';
    const params = shop_id ? [shop_id] : [];

    if (channel !== 'all') {
      where += ' AND cl.channel = ?';
      params.push(channel);
    }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM chat_logs cl WHERE ${where}`, params);

    const [rows] = await pool.query(
      `SELECT cl.id, cl.shop_id, s.name AS shop_name, cl.channel,
              cl.customer_name, cl.customer_phone, cl.message, cl.reply, cl.created_at
       FROM chat_logs cl
       JOIN shops s ON s.id = cl.shop_id
       WHERE ${where}
       ORDER BY cl.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, perPage, offset]
    );

    res.json({ total, page: parseInt(page), perPage, rows });
  } catch (err) {
    log.error('[chat] GET /logs error:', err.message, err.stack);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
