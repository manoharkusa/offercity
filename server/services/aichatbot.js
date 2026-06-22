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

// Per-owner reply language: 'auto' | 'english' | 'telugu' | 'hindi'
const chatbotLang = {};

function enabledFile(ownerId) {
  return path.join(SESSION_BASE, String(ownerId), 'chatbot_enabled');
}

function langFile(ownerId) {
  return path.join(SESSION_BASE, String(ownerId), 'chatbot_lang');
}

const VALID_LANGS = ['auto', 'english', 'telugu', 'hindi'];

function setLang(ownerId, lang) {
  const l = VALID_LANGS.includes(lang) ? lang : 'auto';
  chatbotLang[ownerId] = l;
  try {
    fs.mkdirSync(path.join(SESSION_BASE, String(ownerId)), { recursive: true });
    fs.writeFileSync(langFile(ownerId), l);
  } catch {}
}

function getLang(ownerId) {
  if (!chatbotLang[ownerId]) {
    try { chatbotLang[ownerId] = fs.readFileSync(langFile(ownerId), 'utf8').trim() || 'auto'; }
    catch { chatbotLang[ownerId] = 'auto'; }
  }
  return chatbotLang[ownerId];
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

const LANG_INSTRUCTIONS = {
  auto:    'Reply in the SAME language the customer uses (Telugu, Hindi, English, etc.)',
  english: 'Always reply in English only, regardless of what language the customer uses.',
  telugu:  'Always reply in Telugu (తెలుగు) using Telugu script, regardless of what language the customer uses.',
  hindi:   'Always reply in Hindi (हिंदी) using Devanagari script, regardless of what language the customer uses.',
};

function buildSystemPrompt(context, lang = 'auto') {
  const { shops, offers } = context;
  const primary = shops[0];

  const offerLines = offers.length
    ? offers.map(o => `- ${o.title}: ${o.discount}% off, price ₹${o.offer_price || ''}${o.valid_until ? `, valid till ${new Date(o.valid_until).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}` : ''}`).join('\n')
    : 'No active offers right now.';

  const shopList = shops.length > 1
    ? shops.map(s => `${s.name} (${s.city})`).join(', ')
    : `${primary.name}`;

  const langRule = LANG_INSTRUCTIONS[lang] || LANG_INSTRUCTIONS.auto;

  return `You are a smart, friendly shop assistant for ${shopList}.

Shop info:
- Name: ${primary.name}
- Category: ${primary.category}
- Address: ${primary.address}, ${primary.city}${primary.pin_code ? ` - ${primary.pin_code}` : ''}
${primary.description ? `- About: ${primary.description}` : ''}

Active offers today:
${offerLines}

Rules:
- ${langRule}
- Keep replies SHORT — 2 to 3 sentences maximum
- Be warm and helpful, like a real shop assistant
- If asked about something you don't know (stock, custom orders), say "Please call or visit the shop for this"
- Never invent prices or offers not listed above
- If customer says hi/hello, greet them and mention 1-2 current offers
- IMPORTANT: If the message is clearly a personal/private message NOT related to the shop (e.g. grocery lists, family messages, personal requests, unrelated topics), reply with exactly one word only: SKIP`;
}

function callAI(systemPrompt, userMessage) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set in .env');

  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
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
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(parsed.choices?.[0]?.message?.content?.trim() || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Only auto-reply to numbers the owner previously messaged via campaigns (= customers).
// Personal friends who message the owner's WhatsApp are NOT in campaign_logs → skipped.
async function isKnownCustomer(ownerId, jid) {
  try {
    const phone = jid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    if (!phone) return false;
    const last10 = phone.slice(-10);
    const { getPool } = require('../config/db');
    const [rows] = await getPool().query(
      `SELECT 1 FROM campaign_logs cl
       JOIN campaigns c ON c.id = cl.campaign_id
       WHERE c.owner_id = ? AND RIGHT(REPLACE(cl.phone,'+',''), 10) = ?
       LIMIT 1`,
      [ownerId, last10]
    );
    const found = rows.length > 0;
    console.log(`[AI] isKnownCustomer phone=${last10} owner=${ownerId} → ${found ? 'FOUND in campaign_logs' : 'NOT in campaign_logs'}`);
    return found;
  } catch (err) {
    console.log(`[AI] isKnownCustomer DB error: ${err.message} — blocking reply`);
    return false;
  }
}

function callClaudeAI(systemPrompt, userMessage) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 280,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(parsed.content?.[0]?.text?.trim() || '');
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

  // Only reply to known customers — skip personal contacts
  const customer = await isKnownCustomer(ownerId, jid);
  if (!customer) {
    console.log(`[AI] Skipped ${jid.replace('@s.whatsapp.net','')} — not a campaign contact`);
    return null;
  }

  try {
    const context = await getShopContext(ownerId);
    if (!context) return null;

    const lang = getLang(ownerId);
    const systemPrompt = buildSystemPrompt(context, lang);
    const greeting = senderName ? `(Customer name: ${senderName})\n` : '';
    const input = greeting + messageText;

    let reply = null;

    if (process.env.ANTHROPIC_API_KEY) {
      // Claude is primary when API key is set — better Telugu/Hindi/regional language quality
      try {
        reply = await callClaudeAI(systemPrompt, input);
      } catch (claudeErr) {
        console.log(`[AI] Claude failed (${claudeErr.message}) — falling back to Groq`);
        try { reply = await callAI(systemPrompt, input); } catch (_) {}
      }
    } else {
      // Groq only (free tier, llama-3.3-70b)
      try {
        reply = await callAI(systemPrompt, input);
      } catch (groqErr) {
        console.error('[AI] Groq failed:', groqErr.message);
      }
    }

    if (reply && reply.trim().toUpperCase() === 'SKIP') {
      console.log(`[AI] Skipped personal message from ${jid.replace('@s.whatsapp.net', '')}`);
      return null;
    }
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

module.exports = { handleIncoming, setEnabled, loadEnabled, isEnabled, invalidateCache, setLang, getLang };
