const https = require('https');
const path  = require('path');
const fs    = require('fs');

const SESSION_BASE = process.env.WA_SESSION_DIR
  || (process.platform === 'linux' ? '/home1/a1751tyi/whatsapp_sessions' : path.join(__dirname, '../whatsapp_sessions'));

// In-memory cache: ownerId → { context, ts }
const contextCache = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// Per-contact rate limit: "ownerId:jid" → last reply timestamp
const lastReply = {};
const RATE_LIMIT_MS = 30000; // 30 sec between replies to same contact

// Per-owner toggle: ownerId → bool (in-memory mirror of the file)
const chatbotEnabled = {};

function enabledFile(ownerId) {
  return path.join(SESSION_BASE, String(ownerId), 'chatbot_enabled');
}

function setEnabled(ownerId, val) {
  chatbotEnabled[ownerId] = val;
  // Persist so toggle survives server restarts
  try {
    fs.mkdirSync(path.join(SESSION_BASE, String(ownerId)), { recursive: true });
    if (val) {
      fs.writeFileSync(enabledFile(ownerId), '1');
    } else {
      fs.rmSync(enabledFile(ownerId), { force: true });
    }
  } catch {}
}

function loadEnabled(ownerId) {
  if (chatbotEnabled[ownerId] !== undefined) return; // already loaded
  try {
    chatbotEnabled[ownerId] = fs.existsSync(enabledFile(ownerId));
  } catch {
    chatbotEnabled[ownerId] = false;
  }
}

function isEnabled(ownerId) {
  if (chatbotEnabled[ownerId] === undefined) loadEnabled(ownerId);
  return chatbotEnabled[ownerId] === true;
}

async function getShopContext(ownerId) {
  const now = Date.now();
  if (contextCache[ownerId] && now - contextCache[ownerId].ts < CACHE_TTL) {
    return contextCache[ownerId].data;
  }
  const { getPool } = require('../config/db');
  const pool = getPool();

  const [shops] = await pool.query(
    `SELECT id, name, category, address, city, pin_code, description FROM shops WHERE owner_id = ? LIMIT 3`,
    [ownerId]
  );
  if (!shops.length) return null;

  const shopIds = shops.map(s => s.id);
  const [offers] = await pool.query(
    `SELECT title, discount, offer_price, original_price, valid_until, shop_id
     FROM offers WHERE shop_id IN (?) AND is_active = 1
     AND (valid_until IS NULL OR valid_until >= CURDATE())
     ORDER BY created_at DESC LIMIT 20`,
    [shopIds]
  );

  const data = { shops, offers };
  contextCache[ownerId] = { data, ts: now };
  return data;
}

function buildSystemPrompt(context) {
  const { shops, offers } = context;
  const primary = shops[0];

  const offerLines = offers.length
    ? offers.map(o => `- ${o.title}: ${o.discount}% off, price ₹${o.offer_price || ''}${o.valid_until ? `, valid till ${new Date(o.valid_until).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}` : ''}`).join('\n')
    : 'No active offers right now.';

  const shopList = shops.length > 1
    ? shops.map(s => `${s.name} (${s.city})`).join(', ')
    : `${primary.name}`;

  return `You are a smart, friendly shop assistant for ${shopList}.

Shop info:
- Name: ${primary.name}
- Category: ${primary.category}
- Address: ${primary.address}, ${primary.city}${primary.pin_code ? ` - ${primary.pin_code}` : ''}
${primary.description ? `- About: ${primary.description}` : ''}

Active offers today:
${offerLines}

Rules:
- Reply in the SAME language the customer uses (Telugu, Hindi, English, etc.)
- Keep replies SHORT — 2 to 3 sentences maximum
- Be warm and helpful, like a real shop assistant
- If asked about something you don't know (stock, custom orders), say "Please call or visit the shop for this"
- Never invent prices or offers not listed above
- If customer says hi/hello, greet them and mention 1-2 current offers`;
}

function callAI(systemPrompt, userMessage) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set in .env');

  const body = JSON.stringify({
    model: 'llama-3.1-8b-instant',
    max_tokens: 280,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage  }
    ]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed.choices?.[0]?.message?.content?.trim() || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function handleIncoming(ownerId, jid, messageText, senderName) {
  if (!isEnabled(ownerId)) return null;

  const rateKey = `${ownerId}:${jid}`;
  const now = Date.now();
  if (lastReply[rateKey] && now - lastReply[rateKey] < RATE_LIMIT_MS) return null;

  try {
    const context = await getShopContext(ownerId);
    if (!context) return null;

    const systemPrompt = buildSystemPrompt(context);
    const greeting = senderName ? `(Customer name: ${senderName})\n` : '';
    const reply = await callAI(systemPrompt, greeting + messageText);

    if (reply) {
      lastReply[rateKey] = now;
      console.log(`[AI] Owner ${ownerId} → replied to ${jid.replace('@s.whatsapp.net', '')}`);
    }
    return reply || null;
  } catch (err) {
    console.error('[AI] Error:', err.message);
    return null;
  }
}

function invalidateCache(ownerId) {
  delete contextCache[ownerId];
}

module.exports = { handleIncoming, setEnabled, loadEnabled, isEnabled, invalidateCache };
