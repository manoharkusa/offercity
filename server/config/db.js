const mysql = require('mysql2/promise');
const log   = require('../utils/log');

let pool;

const connectDB = async () => {
  log.info('connectDB: creating pool...');
  pool = mysql.createPool({
    host:     process.env.DB_HOST || 'localhost',
    user:     process.env.DB_USER || 'a1751tyi_offeruser',
    password: process.env.DB_PASS ?? '',
    database: process.env.DB_NAME || 'a1751tyi_offerscity',
    waitForConnections: true,
    connectionLimit: 3,      // keep low — shared hosting has strict per-user limits
    queueLimit: 10,
    connectTimeout: 10000,   // 10s per connection attempt
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
  });

  try {
    log.info('connectDB: testing connection...');
    // Race against a 12s timeout so the server never hangs here
    const conn = await Promise.race([
      pool.getConnection(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB connection timed out after 12s')), 12000))
    ]);
    log.info('MySQL connected');
    conn.release();
    await createTables();
  } catch (err) {
    log.error('MySQL connection error:', err.message);
    log.info('Retrying DB connection in 15s...');
    setTimeout(connectDB, 15000);
  }
};

const createTables = async () => {
  log.info('createTables: starting...');
  const queries = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('user','shop_owner','admin') DEFAULT 'user',
      lat DECIMAL(10,8) DEFAULT NULL,
      lng DECIMAL(11,8) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS shops (
      id INT AUTO_INCREMENT PRIMARY KEY,
      owner_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      category VARCHAR(100),
      address TEXT,
      city VARCHAR(100),
      lat DECIMAL(10,8) NOT NULL,
      lng DECIMAL(11,8) NOT NULL,
      image VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS offers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      shop_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      discount DECIMAL(5,2) DEFAULT 0,
      original_price DECIMAL(10,2),
      offer_price DECIMAL(10,2),
      valid_until DATE,
      image VARCHAR(500),
      is_active BOOLEAN DEFAULT true,
      views INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      shop_id INT NOT NULL,
      rating INT NOT NULL,
      comment TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_review (user_id, shop_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS saved_offers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      offer_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_save (user_id, offer_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS leads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      email VARCHAR(200),
      source VARCHAR(100) DEFAULT 'OfferCity',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS campaigns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      offer_id INT,
      shop_id INT,
      owner_id INT NOT NULL,
      platform VARCHAR(20) DEFAULT 'whatsapp',
      total_contacts INT DEFAULT 0,
      sent_count INT DEFAULT 0,
      failed_count INT DEFAULT 0,
      status ENUM('running','paused','completed','stopped','failed') DEFAULT 'running',
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`,

    `CREATE TABLE IF NOT EXISTS campaign_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      campaign_id INT NOT NULL,
      phone VARCHAR(30) NOT NULL,
      contact_name VARCHAR(255),
      status ENUM('pending','sent','failed') DEFAULT 'pending',
      sent_at TIMESTAMP NULL,
      INDEX idx_camp_status (campaign_id, status)
    ) ENGINE=InnoDB`
  ];

  for (const q of queries) {
    const tblMatch = q.match(/CREATE TABLE IF NOT EXISTS (\w+)/i);
    const tblName  = tblMatch ? tblMatch[1] : 'unknown';
    try {
      await pool.query(q);
      log.info(`createTables: table OK — ${tblName}`);
    } catch (e) {
      log.error(`createTables: FAILED table ${tblName}:`, e.message);
      throw e;
    }
  }

  // BDO areas table — pincodes assigned to each BDO
  await pool.query(`CREATE TABLE IF NOT EXISTS bdo_areas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bdo_id INT NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    area_name VARCHAR(255),
    UNIQUE KEY unique_bdo_pin (bdo_id, pincode),
    FOREIGN KEY (bdo_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  // Add missing columns for upgrades (safe to run every startup)
  const migrations = [
    ["offers", "is_active",         "BOOLEAN DEFAULT true AFTER image"],
    ["offers", "views",             "INT DEFAULT 0 AFTER is_active"],
    ["shops",  "slug",              "VARCHAR(150) UNIQUE AFTER name"],
    ["shops",  "pin_code",          "VARCHAR(10) DEFAULT NULL AFTER city"],
    ["shops",  "status",            "ENUM('pending','approved','rejected') DEFAULT 'pending' AFTER pin_code"],
    ["shops",  "bdo_id",            "INT DEFAULT NULL AFTER status"],
    ["shops",  "area",              "VARCHAR(150) DEFAULT NULL AFTER bdo_id"],
    ["shops",  "rejection_reason",  "TEXT DEFAULT NULL AFTER area"],
    ["shops",  "approved_at",        "TIMESTAMP NULL DEFAULT NULL AFTER rejection_reason"],
    ["offers", "flash_expires_at",       "TIMESTAMP NULL DEFAULT NULL AFTER valid_until"],
    ["offers", "category",               "VARCHAR(100) DEFAULT NULL AFTER flash_expires_at"],
    // BDO profile fields
    ["users",  "phone",                  "VARCHAR(20) DEFAULT NULL"],
    ["users",  "aadhar_number",          "VARCHAR(20) DEFAULT NULL"],
    ["users",  "aadhar_photo",           "VARCHAR(255) DEFAULT NULL"],
    ["users",  "photo",                  "VARCHAR(255) DEFAULT NULL"],
    // Shop onboarding by BDO
    ["shops",  "owner_aadhar_number",    "VARCHAR(20) DEFAULT NULL"],
    ["shops",  "owner_aadhar_photo",     "VARCHAR(255) DEFAULT NULL"],
    ["shops",  "payment_screenshot",     "VARCHAR(255) DEFAULT NULL"],
    ["shops",  "payment_amount",         "DECIMAL(10,2) DEFAULT NULL"],
    ["shops",  "owner_phone",            "VARCHAR(20) DEFAULT NULL"],
    ["shops",  "views",                  "INT DEFAULT 0 AFTER owner_phone"],
    // Geo-based push notifications
    ["push_subscriptions", "lat", "FLOAT DEFAULT NULL"],
    ["push_subscriptions", "lng", "FLOAT DEFAULT NULL"],
    // SMS-link user capture: area targeting by pincode
    ["users",  "pin_code",               "VARCHAR(10) DEFAULT NULL"],
  ];

  // Shop catalog — services/items list (max 25 per shop)
  await pool.query(`CREATE TABLE IF NOT EXISTS shop_catalog (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    shop_id     INT NOT NULL,
    name        VARCHAR(255) NOT NULL,
    price       DECIMAL(10,2) DEFAULT NULL,
    description VARCHAR(500) DEFAULT NULL,
    sort_order  INT DEFAULT 0,
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  // Extend users.role enum to include 'bdo'
  try {
    await pool.query(`ALTER TABLE users MODIFY COLUMN role ENUM('user','shop_owner','admin','bdo') DEFAULT 'user'`);
  } catch (_) {}

  // Auto-approve shops that have no BDO assigned — they were created before the BDO flow
  // or are in areas with no BDO, so there's nobody to approve them.
  try {
    const [r] = await pool.query(
      `UPDATE shops SET status='approved' WHERE status='pending' AND bdo_id IS NULL`
    );
    if (r.affectedRows > 0) log.info(`Migration: auto-approved ${r.affectedRows} unassigned shop(s)`);
  } catch (e) { log.error('Migration auto-approve shops:', e.message); }

  // chat_logs — stores all AI chatbot conversations (web + WhatsApp) per shop
  await pool.query(`CREATE TABLE IF NOT EXISTS chat_logs (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    shop_id        INT NOT NULL,
    channel        ENUM('web','whatsapp') NOT NULL DEFAULT 'web',
    customer_name  VARCHAR(255) DEFAULT NULL,
    customer_phone VARCHAR(30)  DEFAULT NULL,
    message        TEXT NOT NULL,
    reply          TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_shop_channel (shop_id, channel),
    INDEX idx_created (created_at)
  ) ENGINE=InnoDB`);

  // visitors — anonymous visitor tracking (soft login/skip gate). Links to a
  // user once they sign in; otherwise stays anonymous (skip = no change to UX).
  await pool.query(`CREATE TABLE IF NOT EXISTS visitors (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    visitor_uuid VARCHAR(64) NOT NULL UNIQUE,
    user_id      INT DEFAULT NULL,
    visits       INT DEFAULT 1,
    user_agent   VARCHAR(255) DEFAULT NULL,
    first_seen   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  // push_subscriptions — location-based, no shop dependency
  await pool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    p256dh VARCHAR(512) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    lat FLOAT DEFAULT NULL,
    lng FLOAT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_endpoint (endpoint(200))
  ) ENGINE=InnoDB`);

  // ── SMS system: wallet per shop owner, transactions, send logs, contact lists, OTPs ──

  // sms_wallets — one row per shop owner; balance = SMS credits remaining
  await pool.query(`CREATE TABLE IF NOT EXISTS sms_wallets (
    owner_id INT PRIMARY KEY,
    balance INT NOT NULL DEFAULT 0,
    total_purchased INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  // sms_transactions — every wallet movement (pack purchase, campaign debit, refund, admin credit)
  await pool.query(`CREATE TABLE IF NOT EXISTS sms_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL,
    type ENUM('purchase','debit','refund','admin_credit') NOT NULL,
    sms_count INT NOT NULL,
    amount_rupees DECIMAL(10,2) DEFAULT NULL,
    razorpay_order_id VARCHAR(64) DEFAULT NULL,
    razorpay_payment_id VARCHAR(64) DEFAULT NULL,
    campaign_id INT DEFAULT NULL,
    note VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_owner_created (owner_id, created_at),
    UNIQUE KEY unique_rzp_payment (razorpay_payment_id)
  ) ENGINE=InnoDB`);

  // sms_logs — every SMS sent (or mocked), for audit + delivery troubleshooting
  await pool.query(`CREATE TABLE IF NOT EXISTS sms_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT DEFAULT NULL,
    campaign_id INT DEFAULT NULL,
    phone VARCHAR(20) NOT NULL,
    kind ENUM('campaign','otp') NOT NULL DEFAULT 'campaign',
    message TEXT,
    status ENUM('sent','failed','mock') NOT NULL,
    provider_msg_id VARCHAR(100) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_owner (owner_id),
    INDEX idx_campaign (campaign_id)
  ) ENGINE=InnoDB`);

  // sms_contacts — shop owner's customer phone list (manual add / CSV import / auto-captured)
  await pool.query(`CREATE TABLE IF NOT EXISTS sms_contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL,
    phone VARCHAR(20) NOT NULL,
    name VARCHAR(255) DEFAULT NULL,
    source ENUM('manual','import','captured') DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_owner_phone (owner_id, phone),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  // app_settings — admin-managed integration keys (MSG91, Razorpay) with .env fallback
  await pool.query(`CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(64) PRIMARY KEY,
    setting_value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  // otp_codes — SMS OTP verification (link landing, login, signup)
  await pool.query(`CREATE TABLE IF NOT EXISTS otp_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(6) NOT NULL,
    purpose VARCHAR(30) NOT NULL DEFAULT 'verify',
    attempts INT NOT NULL DEFAULT 0,
    verified BOOLEAN NOT NULL DEFAULT 0,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_phone_purpose (phone, purpose)
  ) ENGINE=InnoDB`);
  for (const [tbl, col, def] of migrations) {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [tbl, col]
    );
    if (cols.length === 0) {
      await pool.query(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`);
      log.info(`Migration: added ${tbl}.${col}`);
    }
  }

  log.info('createTables: all done.');
};

const getPool = () => pool;

module.exports = { connectDB, getPool };
