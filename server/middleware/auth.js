const jwt = require('jsonwebtoken');
const { getPool } = require('../config/db');

const protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ message: 'Not authorized' });

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role) {
      // New token — role is embedded, no DB needed
      req.user = { id: decoded.id, name: decoded.name, email: decoded.email, role: decoded.role };
    } else {
      // Old token (pre-migration) — fall back to DB lookup once
      const [rows] = await getPool().query('SELECT id, name, email, role FROM users WHERE id = ?', [decoded.id]);
      if (!rows.length) return res.status(401).json({ message: 'User not found' });
      req.user = rows[0];
    }
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).json({ message: 'Access denied' });
  next();
};

module.exports = { protect, requireRole };
