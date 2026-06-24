const jwt = require('jsonwebtoken');
const { getPool } = require('../config/db');

const protect = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ message: 'Not authorized' });

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // User data is embedded in the JWT — no DB round-trip needed per request
    req.user = { id: decoded.id, name: decoded.name, email: decoded.email, role: decoded.role };
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
