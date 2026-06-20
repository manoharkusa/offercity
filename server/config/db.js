const mysql = require('mysql2/promise');

let pool;

const connectDB = async () => {
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
    const conn = await pool.getConnection();
    console.log('MySQL connected');
    conn.release();
    await createTables();
  } catch (err) {
    console.error('MySQL connection error:', err.message);
    setTimeout(connectDB, 10000);
  }
};

const createTables = async () => {
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
    await pool.query(q);
  }

  // Add missing columns for upgrades (safe to run every startup)
  const migrations = [
    ["offers", "is_active", "BOOLEAN DEFAULT true AFTER image"],
    ["offers", "views",     "INT DEFAULT 0 AFTER is_active"],
    ["shops",  "slug",      "VARCHAR(150) UNIQUE AFTER name"],
    ["shops",  "pin_code",  "VARCHAR(10) DEFAULT NULL AFTER city"],
  ];

  // push_subscriptions table
  await pool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shop_id INT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh VARCHAR(512) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_sub (shop_id, endpoint(200)),
    FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  for (const [tbl, col, def] of migrations) {
    const [cols] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [tbl, col]
    );
    if (cols.length === 0) {
      await pool.query(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`);
      console.log(`Migration: added ${tbl}.${col}`);
    }
  }

  console.log('Tables ready');
};

const getPool = () => pool;

module.exports = { connectDB, getPool };
