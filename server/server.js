require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { connectDB } = require('./config/db');
const seed = require('./seed');

// Write PID so start_node.sh can kill us cleanly next restart
try { fs.writeFileSync('/home1/a1751tyi/node.pid', String(process.pid)); } catch (_) {}

const app = express();

// Request logger — prints every incoming request to node.log
app.use((req, res, next) => {
  const ts = new Date().toISOString().slice(11, 19);
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${ts}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

connectDB().then(seed).then(() => {
  const push = require('./services/push');
  push.init();
  const wa = require('./services/whatsapp');
  wa.autoReconnectAll();
}).catch(err => console.error('Startup error:', err.message));

app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth',    require('./routes/auth'));
app.use('/api/shops',   require('./routes/shops'));
app.use('/api/offers',  require('./routes/offers'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/admin',   require('./routes/admin'));
app.use('/api/leads',      require('./routes/leads'));
app.use('/api/campaigns',  require('./routes/campaigns'));
app.use('/api/push',       require('./routes/push'));

app.get('/api/health', (req, res) => res.json({ status: 'OfferCity API running', port: process.env.PORT || 5000 }));

const PORT = parseInt(process.env.PORT) || 5000;
const PORT_FILE = '/home1/a1751tyi/node_port.txt';

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} — ${new Date().toISOString()}`);
  try { fs.writeFileSync(PORT_FILE, String(PORT)); } catch (_) {}
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} in use — try next port or run start_node.sh`);
  }
  process.exit(1);
});
