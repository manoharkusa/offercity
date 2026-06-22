const express = require('express');
const { getPool } = require('../config/db');
const { callClaudeAI, callGroqAI, buildSystemPromptForShop } = require('../services/aichatbot');

const router = express.Router();

// IP-based rate limit: ip → { count, resetAt }
const ipLimits = {};
const LIMIT = 30;         // max 30 messages per window
const WINDOW_MS = 60000;  // per 1 minute

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

// POST /api/chat/ask  — public web chat (no auth needed)
// Body: { shop_id, message, history: [{role,content}] }
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

    // Include last 6 turns of conversation history for context
    const messages = [
      ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: message.trim() }
    ];

    let reply = null;
    if (process.env.ANTHROPIC_API_KEY) {
      reply = await callClaudeAI(systemPrompt, messages);
    } else {
      reply = await callGroqAI(systemPrompt, messages);
    }

    if (!reply || reply.trim().toUpperCase() === 'SKIP') {
      return res.json({ reply: `I can only help with questions about ${shop.name}. What would you like to know about our offers or services?` });
    }

    res.json({ reply });
  } catch (err) {
    console.error('[CHAT] Error:', err.message);
    res.status(500).json({ message: 'Could not get a reply. Please try again.' });
  }
});

module.exports = router;
