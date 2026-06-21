const mysql = require('mysql2/promise');
const log   = require('../utils/log');

let pool;

const connectDB = async () => {
  log.info('connectDB: creating pool...');
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'a1751tyi_offeruser',
    password: process.env.DB_PASS ?? '',
    database: process.env.DB_NAME || 'a1751tyi_offerscity',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  try {
    log.info('connectDB: testing connection...');
    const conn = await pool.getConnection();
    log.info('MySQL connected');
    conn.release();
    await createTables();
  } catch (err) {
    log.error('MySQL connection error:', err.message, err.stack);
    setTimeout(connectDB, 10000);
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
    ["offers", "flash_expires_at",  "TIMESTAMP NULL DEFAULT NULL AFTER valid_until"],
  ];

  // "I'm Coming" reservations
  await pool.query(`CREATE TABLE IF NOT EXISTS im_coming (
    id INT AUTO_INCREMENT PRIMARY KEY,
    offer_id INT NOT NULL,
    user_id INT NOT NULL,
    shop_id INT NOT NULL,
    user_name VARCHAR(255),
    eta_minutes INT DEFAULT 15,
    expires_at TIMESTAMP NOT NULL,
    status ENUM('coming','arrived','cancelled') DEFAULT 'coming',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY one_active (offer_id, user_id),
    FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  // Loyalty stamp cards
  await pool.query(`CREATE TABLE IF NOT EXISTS stamp_cards (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shop_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    required_stamps INT NOT NULL DEFAULT 5,
    reward VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  await pool.query(`CREATE TABLE IF NOT EXISTS customer_stamps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    card_id INT NOT NULL,
    user_id INT NOT NULL,
    stamps INT DEFAULT 0,
    redeemed INT DEFAULT 0,
    last_stamp_at TIMESTAMP NULL,
    UNIQUE KEY one_per (card_id, user_id),
    FOREIGN KEY (card_id) REFERENCES stamp_cards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);

  // Extend users.role enum to include 'bdo'
  try {
    await pool.query(`ALTER TABLE users MODIFY COLUMN role ENUM('user','shop_owner','admin','bdo') DEFAULT 'user'`);
  } catch (_) {}

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
