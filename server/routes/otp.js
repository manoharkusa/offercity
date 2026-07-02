const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { getPool } = require('../config/db');
const { protect } = require('../middleware/auth');
const sms = require('../services/sms');
const log = require('../utils/log');

const router = express.Router();

const signToken = (user) =>
  jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

// IP rate limit for OTP sends — stricter than chat (SMS costs money)
const ipLimits = {};
function checkIpLimit(ip, max = 10, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  if (!ipLimits[ip] || now > ipLimits[ip].resetAt) {
    ipLimits[ip] = { count: 1, resetAt: now + windowMs };
    return true;
  }
  if (ipLimits[ip].count >= max) return false;
  ipLimits[ip].count++;
  return true;
}

// POST /api/otp/send  { phone, purpose? } — public
router.post('/send', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  if (!checkIpLimit(ip)) return res.status(429).json({ message: 'Too many OTP requests. Try again later.' });

  const { phone, purpose = 'verify' } = req.body;
  try {
    const result = await sms.sendOTP(phone, purpose);
    if (!result.ok) return res.status(400).json({ message: result.message });
    log.info(`[otp] sent purpose=${purpose} ip=${ip}`);
    // devCode only present in mock mode (no MSG91 key) so testing works
    res.json({ message: 'OTP sent', ...(result.devCode ? { devCode: result.devCode } : {}) });
  } catch (err) {
    log.error('[otp] send error:', err.message, err.stack);
    res.status(500).json({ message: 'Could not send OTP' });
  }
});

// POST /api/otp/verify  { phone, code, purpose? }
// On success: finds or creates the user for this phone and returns a JWT —
// this is the SMS-link landing flow (customer clicked an offer link from SMS).
router.post('/verify', async (req, res) => {
  const { phone, code, purpose = 'verify' } = req.body;
  try {
    const result = await sms.verifyOTP(phone, code, purpose);
    if (!result.ok) return res.status(400).json({ message: result.message });

    const pool = getPool();
    const cleanPhone = result.phone; // normalized 91XXXXXXXXXX

    let [rows] = await pool.query('SELECT * FROM users WHERE phone = ? LIMIT 1', [cleanPhone]);
    let user = rows[0];
    let isNew = false;

    if (!user) {
      // Create a minimal account — email/pincode captured right after via PUT /profile.
      // users.email is UNIQUE NOT NULL, so use a phone-derived placeholder until then.
      const placeholderEmail = `${cleanPhone}@sms.offerscity.co.in`;
      const randomPass = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 8);
      const [ins] = await pool.query(
        'INSERT INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)',
        [`User ${cleanPhone.slice(-4)}`, placeholderEmail, randomPass, 'user', cleanPhone]
      );
      [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [ins.insertId]);
      user = rows[0];
      isNew = true;
      log.info(`[otp] new user created via SMS link: id=${user.id} phone=${cleanPhone}`);
    }

    const token = signToken(user);
    log.info(`[otp] verified + login: user=${user.id} new=${isNew}`);
    res.json({
      token,
      isNew,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, pin_code: user.pin_code },
    });
  } catch (err) {
    log.error('[otp] verify error:', err.message, err.stack);
    res.status(500).json({ message: 'Verification failed. Please try again.' });
  }
});

// PUT /api/otp/profile  { name?, email?, pin_code? } — capture step after OTP login
router.put('/profile', protect, async (req, res) => {
  const { name, email, pin_code } = req.body;
  try {
    const pool = getPool();
    const sets = [], vals = [];

    if (name && String(name).trim())        { sets.push('name = ?');     vals.push(String(name).trim().slice(0, 100)); }
    if (pin_code && /^\d{6}$/.test(pin_code)) { sets.push('pin_code = ?'); vals.push(pin_code); }
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const [taken] = await pool.query('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.user.id]);
      if (taken.length) return res.status(400).json({ message: 'Email already in use' });
      sets.push('email = ?'); vals.push(email);
    }

    if (!sets.length) return res.status(400).json({ message: 'Nothing to update' });
    vals.push(req.user.id);
    await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);

    const [[user]] = await pool.query(
      'SELECT id, name, email, role, phone, pin_code FROM users WHERE id = ?', [req.user.id]
    );
    log.info(`[otp] profile updated: user=${req.user.id} pin=${pin_code || '-'}`);
    // Fresh token so name/email in the JWT stay current
    res.json({ token: signToken(user), user });
  } catch (err) {
    log.error('[otp] profile error:', err.message, err.stack);
    res.status(500).json({ message: 'Could not update profile' });
  }
});

module.exports = router;
