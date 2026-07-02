const https  = require('https');
const crypto = require('crypto');
const log    = require('../utils/log');
const settings = require('../utils/settings');
const { getPool } = require('../config/db');

// ── MSG91 config — admin panel (app_settings) with .env fallback; when no
// auth key is set we run in MOCK mode: nothing leaves the server, sends are
// logged to sms_logs with status 'mock' and OTP codes surface in the API
// response so testing works end-to-end.
const AUTH_KEY    = () => settings.get('MSG91_AUTH_KEY');
const SENDER_ID   = () => settings.get('MSG91_SENDER_ID') || 'OFRCTY';
// DLT-approved template IDs (required in India for commercial SMS)
const TPL_CAMPAIGN = () => settings.get('MSG91_TEMPLATE_CAMPAIGN');
const TPL_OTP      = () => settings.get('MSG91_TEMPLATE_OTP');

const OTP_TTL_MIN      = 5;    // OTP valid for 5 minutes
const OTP_MAX_ATTEMPTS = 5;    // wrong tries before code is dead
const OTP_RESEND_SEC   = 60;   // min gap between sends to same phone

function isLive() { return !!AUTH_KEY(); }

// Normalize to 91XXXXXXXXXX (12 digits) — Indian numbers only for now
function normalizePhone(raw) {
  let p = String(raw || '').replace(/\D/g, '');
  if (p.length === 10) p = '91' + p;
  if (p.length === 12 && p.startsWith('91')) return p;
  return null;
}

// ── Low-level MSG91 call (Flow API v5) ────────────────────────────────────────
function msg91Request(pathName, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'control.msg91.com',
      path: pathName,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'authkey': AUTH_KEY(),
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300 && json.type !== 'error') resolve(json);
          else reject(new Error(`MSG91 ${res.statusCode}: ${data.slice(0, 300)}`));
        } catch { reject(new Error(`MSG91 bad response: ${data.slice(0, 300)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('MSG91 request timed out')); });
    req.write(payload);
    req.end();
  });
}

async function logSend({ ownerId = null, campaignId = null, phone, kind, message, status, providerId = null }) {
  try {
    await getPool().query(
      `INSERT INTO sms_logs (owner_id, campaign_id, phone, kind, message, status, provider_msg_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ownerId, campaignId, phone, kind, message, status, providerId]
    );
  } catch (e) { log.error('[sms] logSend error:', e.message, e.stack); }
}

// ── sendSMS — one message to one phone. Returns { ok, mock } ─────────────────
// vars: { var1, var2, ... } filled into the DLT template on MSG91's side.
async function sendSMS(rawPhone, message, { ownerId = null, campaignId = null, kind = 'campaign', vars = null } = {}) {
  const phone = normalizePhone(rawPhone);
  if (!phone) { log.warn(`[sms] invalid phone skipped: ${rawPhone}`); return { ok: false, mock: false }; }

  if (!isLive()) {
    log.info(`[sms MOCK] to=${phone} kind=${kind} msg="${String(message).slice(0, 80)}"`);
    await logSend({ ownerId, campaignId, phone, kind, message, status: 'mock' });
    return { ok: true, mock: true };
  }

  try {
    const templateId = kind === 'otp' ? TPL_OTP() : TPL_CAMPAIGN();
    const recipient = { mobiles: phone, ...(vars || {}) };
    const resp = await msg91Request('/api/v5/flow/', {
      template_id: templateId,
      sender: SENDER_ID(),
      short_url: '1',
      recipients: [recipient],
    });
    const providerId = resp.data?.[0]?.message_id || resp.message || null;
    await logSend({ ownerId, campaignId, phone, kind, message, status: 'sent', providerId });
    log.info(`[sms] sent to=${phone} kind=${kind} owner=${ownerId}`);
    return { ok: true, mock: false };
  } catch (e) {
    log.error(`[sms] send failed to=${phone}:`, e.message);
    await logSend({ ownerId, campaignId, phone, kind, message, status: 'failed' });
    return { ok: false, mock: false };
  }
}

// ── sendBulk — same message to many phones. Returns { sent, failed } ─────────
// MSG91 Flow API accepts up to ~100 recipients per call; we chunk to be safe.
async function sendBulk(phones, message, { ownerId, campaignId, vars = null } = {}) {
  let sent = 0, failed = 0;
  const valid = phones.map(normalizePhone).filter(Boolean);
  failed += phones.length - valid.length;

  if (!isLive()) {
    for (const p of valid) {
      log.info(`[sms MOCK bulk] to=${p} msg="${String(message).slice(0, 60)}"`);
      await logSend({ ownerId, campaignId, phone: p, kind: 'campaign', message, status: 'mock' });
      sent++;
    }
    return { sent, failed, mock: true };
  }

  const CHUNK = 100;
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK);
    try {
      await msg91Request('/api/v5/flow/', {
        template_id: TPL_CAMPAIGN(),
        sender: SENDER_ID(),
        short_url: '1',
        recipients: chunk.map(m => ({ mobiles: m, ...(vars || {}) })),
      });
      for (const p of chunk) await logSend({ ownerId, campaignId, phone: p, kind: 'campaign', message, status: 'sent' });
      sent += chunk.length;
    } catch (e) {
      log.error(`[sms] bulk chunk failed (${chunk.length} numbers):`, e.message);
      for (const p of chunk) await logSend({ ownerId, campaignId, phone: p, kind: 'campaign', message, status: 'failed' });
      failed += chunk.length;
    }
  }
  return { sent, failed, mock: false };
}

// ── OTP: we generate + verify codes ourselves; MSG91 is only the delivery pipe.
// Keeps verification logic local — switching SMS provider later won't touch it.
async function sendOTP(rawPhone, purpose = 'verify') {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, message: 'Enter a valid 10-digit mobile number' };

  const pool = getPool();

  // Rate limit: one send per phone per OTP_RESEND_SEC
  const [recent] = await pool.query(
    `SELECT id FROM otp_codes WHERE phone = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? SECOND) LIMIT 1`,
    [phone, OTP_RESEND_SEC]
  );
  if (recent.length) return { ok: false, message: `Please wait ${OTP_RESEND_SEC}s before requesting another code` };

  const code = String(crypto.randomInt(100000, 1000000)); // 6 digits, crypto-secure

  // Invalidate previous unverified codes for this phone+purpose, then insert
  await pool.query(`DELETE FROM otp_codes WHERE phone = ? AND purpose = ? AND verified = 0`, [phone, purpose]);
  await pool.query(
    `INSERT INTO otp_codes (phone, code, purpose, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [phone, code, purpose, OTP_TTL_MIN]
  );

  const message = `${code} is your OfferCity verification code. Valid for ${OTP_TTL_MIN} minutes.`;
  // OTPs are platform-paid (no ownerId) — never bill a shop's wallet for these
  const res = await sendSMS(phone, message, { kind: 'otp', vars: { var1: code } });

  if (res.mock) log.info(`[otp MOCK] phone=${phone} code=${code} purpose=${purpose}`);

  if (!res.ok) return { ok: false, message: 'Could not send SMS. Please try again.' };
  // In mock mode surface the code so end-to-end testing works without MSG91
  return { ok: true, ...(res.mock ? { devCode: code } : {}) };
}

async function verifyOTP(rawPhone, code, purpose = 'verify') {
  const phone = normalizePhone(rawPhone);
  if (!phone || !/^\d{6}$/.test(String(code || ''))) return { ok: false, message: 'Invalid code' };

  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT id, code, attempts, verified, expires_at < NOW() AS expired
     FROM otp_codes WHERE phone = ? AND purpose = ? AND verified = 0
     ORDER BY id DESC LIMIT 1`,
    [phone, purpose]
  );
  if (!rows.length) return { ok: false, message: 'No code found — request a new one' };
  const row = rows[0];

  if (row.expired) return { ok: false, message: 'Code expired — request a new one' };
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, message: 'Too many wrong attempts — request a new one' };

  if (row.code !== String(code)) {
    await pool.query(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`, [row.id]);
    return { ok: false, message: 'Wrong code, try again' };
  }

  await pool.query(`UPDATE otp_codes SET verified = 1 WHERE id = ?`, [row.id]);
  log.info(`[otp] verified phone=${phone} purpose=${purpose}`);
  return { ok: true, phone };
}

module.exports = { isLive, normalizePhone, sendSMS, sendBulk, sendOTP, verifyOTP };
