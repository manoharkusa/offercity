const bcrypt = require('bcryptjs');
const { getPool } = require('./config/db');

const seed = async () => {
  const pool = getPool();
  const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', ['admin@offercity.com']);
  if (existing.length > 0) return;

  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const future = (days) => {
    const d = new Date(Date.now() + days * 86400000);
    return d.toISOString().split('T')[0];
  };

  // Users
  const [adminRes] = await pool.query(
    'INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)',
    ['Admin', 'admin@offercity.com', hash('admin123'), 'admin']
  );
  const [owner1Res] = await pool.query(
    'INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)',
    ['Ravi Kumar', 'ravi@offercity.com', hash('shop123'), 'shop_owner']
  );
  const [owner2Res] = await pool.query(
    'INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)',
    ['Priya Reddy', 'priya@offercity.com', hash('shop123'), 'shop_owner']
  );
  await pool.query(
    'INSERT INTO users (name, email, password, role) VALUES (?,?,?,?)',
    ['Test Customer', 'user@offercity.com', hash('user123'), 'user']
  );

  const o1 = owner1Res.insertId;
  const o2 = owner2Res.insertId;

  // Shops
  const [s1] = await pool.query(
    'INSERT INTO shops (owner_id, name, slug, description, category, address, city, lat, lng) VALUES (?,?,?,?,?,?,?,?,?)',
    [o1, 'Ravi Fashion Hub', 'ravi-fashion-hub', 'Latest fashion for men and women', 'Fashion', 'Ameerpet', 'Hyderabad', 17.4374, 78.4483]
  );
  const [s2] = await pool.query(
    'INSERT INTO shops (owner_id, name, slug, description, category, address, city, lat, lng) VALUES (?,?,?,?,?,?,?,?,?)',
    [o1, 'Ravi Electronics', 'ravi-electronics', 'Best electronics deals in town', 'Electronics', 'Kukatpally', 'Hyderabad', 17.4948, 78.4103]
  );
  const [s3] = await pool.query(
    'INSERT INTO shops (owner_id, name, slug, description, category, address, city, lat, lng) VALUES (?,?,?,?,?,?,?,?,?)',
    [o2, "Priya's Beauty Parlour", 'priyas-beauty-parlour', 'Premium beauty and wellness', 'Beauty', 'Banjara Hills', 'Hyderabad', 17.4126, 78.4482]
  );
  const [s4] = await pool.query(
    'INSERT INTO shops (owner_id, name, slug, description, category, address, city, lat, lng) VALUES (?,?,?,?,?,?,?,?,?)',
    [o2, 'Fresh Grocery Mart', 'fresh-grocery-mart', 'Daily fresh vegetables and groceries', 'Grocery', 'Madhapur', 'Hyderabad', 17.4487, 78.3810]
  );
  const [s5] = await pool.query(
    'INSERT INTO shops (owner_id, name, slug, description, category, address, city, lat, lng) VALUES (?,?,?,?,?,?,?,?,?)',
    [o1, 'Spice Garden Restaurant', 'spice-garden-restaurant', 'Authentic Hyderabadi biryani', 'Food', 'Dilsukhnagar', 'Hyderabad', 17.3692, 78.5247]
  );

  const offers = [
    [s1.insertId, 'Summer Sale – Kurta Sets', 'Beautiful cotton kurta sets for summer.', 40, 1500, 900, future(15)],
    [s1.insertId, 'Buy 1 Get 1 Free – Sarees', 'Pure cotton and silk sarees.', 50, 2500, 1250, future(10)],
    [s2.insertId, '₹2000 Off on Smartphones', 'Instant discount on smartphones above ₹15,000.', 15, 18000, 16000, future(7)],
    [s2.insertId, 'Flat 30% Off – Earphones', 'Top branded earphones at 30% discount.', 30, 3000, 2100, future(20)],
    [s3.insertId, 'Bridal Package – 25% Off', 'Complete bridal makeup at 25% off.', 25, 8000, 6000, future(30)],
    [s3.insertId, 'Hair Spa + Facial Combo', 'Relaxing hair spa + fruit facial combo.', 35, 2000, 1300, future(12)],
    [s4.insertId, '20% Off on Fresh Vegetables', 'Daily fresh farm vegetables at 20% off.', 20, 500, 400, future(5)],
    [s4.insertId, 'Weekend Rice & Dal Combo', 'Basmati rice 5kg + Toor dal 2kg.', 18, 700, 574, future(3)],
    [s5.insertId, 'Hyderabadi Dum Biryani – 30% Off', 'Authentic dum biryani on weekdays.', 30, 350, 245, future(14)],
    [s5.insertId, 'Family Meal Deal', '2 biryanis + 4 starters + 4 desserts.', 22, 1800, 1400, future(8)]
  ];

  for (const o of offers) {
    await pool.query(
      'INSERT INTO offers (shop_id, title, description, discount, original_price, offer_price, valid_until) VALUES (?,?,?,?,?,?,?)',
      o
    );
  }

  console.log('Seed data created:');
  console.log('  admin@offercity.com  / admin123');
  console.log('  ravi@offercity.com   / shop123');
  console.log('  priya@offercity.com  / shop123');
  console.log('  user@offercity.com   / user123');
  console.log('  5 shops + 10 offers added');
};

module.exports = seed;
