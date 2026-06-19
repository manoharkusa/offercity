const path = require('path');
const fs   = require('fs');

const SESSION_BASE   = '/home1/a1751tyi/whatsapp_sessions';
const contactsFile   = (id) => path.join(SESSION_BASE, String(id), 'contacts.json');

const sockets     = {};   // ownerId → sock
const connStatus  = {};   // ownerId → string
const qrCodes     = {};   // ownerId → { dataUrl, ts }
const contactMap  = {};   // ownerId → [{jid, phone, name}]
const activeCamps = {};   // campaignId → { running: bool }

function loadSavedContacts(ownerId) {
  try {
    const f = contactsFile(ownerId);
    if (fs.existsSync(f)) contactMap[ownerId] = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {}
}

function persistContacts(ownerId) {
  try { fs.writeFileSync(contactsFile(ownerId), JSON.stringify(contactMap[ownerId] || [])); } catch {}
}

function mergeContacts(ownerId, incoming) {
  if (!contactMap[ownerId]) contactMap[ownerId] = [];
  for (const c of incoming) {
    if (!c.id?.endsWith('@s.whatsapp.net')) continue;
    const entry = { jid: c.id, phone: c.id.replace('@s.whatsapp.net', ''), name: c.name || c.pushName || '' };
    const idx = contactMap[ownerId].findIndex(x => x.jid === c.id);
    if (idx >= 0) Object.assign(contactMap[ownerId][idx], entry);
    else contactMap[ownerId].push(entry);
  }
  persistContacts(ownerId);
}

async function connect(ownerId) {
  if (['connecting', 'waiting_scan', 'connected'].includes(connStatus[ownerId])) return;

  const sessionDir = path.join(SESSION_BASE, String(ownerId));
  fs.mkdirSync(sessionDir, { recursive: true });
  loadSavedContacts(ownerId);

  let mod;
  try { mod = await import('@whiskeysockets/baileys'); }
  catch (e) { connStatus[ownerId] = 'unavailable'; console.error('[WA] Baileys missing:', e.message); return; }

  let QRCode;
  try { QRCode = require('qrcode'); } catch { QRCode = null; }

  // makeWASocket is a named export in Baileys, not the default export
  const makeWASocket = mod.makeWASocket || mod.default;
  const { useMultiFileAuthState, DisconnectReason } = mod;
  if (typeof makeWASocket !== 'function') {
    console.error('[WA] makeWASocket not found in Baileys exports. Keys:', Object.keys(mod).join(','));
    connStatus[ownerId] = 'unavailable';
    return;
  }
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  connStatus[ownerId] = 'connecting';

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['OfferCity', 'Chrome', '120.0'],
    syncFullHistory: false,
    getMessage: async () => undefined,
  });

  sockets[ownerId] = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ qr, connection, lastDisconnect }) => {
    if (qr && QRCode) {
      try {
        const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 264 });
        qrCodes[ownerId] = { dataUrl, ts: Date.now() };
        connStatus[ownerId] = 'waiting_scan';
      } catch {}
    }
    if (connection === 'open') {
      connStatus[ownerId] = 'connected';
      delete qrCodes[ownerId];
      console.log(`[WA] Owner ${ownerId} connected`);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      delete sockets[ownerId];
      if (code === DisconnectReason.loggedOut) {
        connStatus[ownerId] = 'disconnected';
        contactMap[ownerId] = [];
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } else {
        connStatus[ownerId] = 'reconnecting';
        setTimeout(() => connect(ownerId), 6000);
      }
    }
  });

  sock.ev.on('contacts.set', ({ contacts }) => { mergeContacts(ownerId, contacts); });
  sock.ev.on('contacts.update', (upd) => { mergeContacts(ownerId, upd); });
  sock.ev.on('messaging-history.set', ({ contacts: c }) => { if (c?.length) mergeContacts(ownerId, c); });

  // AI chatbot: reply to incoming individual messages
  const ai = require('./aichatbot');
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return; // skip historical sync
    for (const msg of messages) {
      if (msg.key.fromMe) continue;                          // skip own messages
      if (msg.key.remoteJid?.endsWith('@g.us')) continue;   // skip groups
      const age = Date.now() / 1000 - (msg.messageTimestamp || 0);
      if (age > 60) continue;                                // skip messages older than 60s
      const text = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || msg.message?.imageMessage?.caption
        || '';
      if (!text.trim()) continue;

      // Small human-like delay (1-2 sec)
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
      const reply = await ai.handleIncoming(ownerId, msg.key.remoteJid, text, msg.pushName || '');
      if (reply) {
        await sock.sendMessage(msg.key.remoteJid, { text: reply });
      }
    }
  });
}

async function disconnect(ownerId) {
  try { if (sockets[ownerId]) await sockets[ownerId].logout(); } catch {}
  delete sockets[ownerId];
  delete qrCodes[ownerId];
  connStatus[ownerId] = 'disconnected';
  contactMap[ownerId] = [];
  fs.rmSync(path.join(SESSION_BASE, String(ownerId)), { recursive: true, force: true });
}

function getStatus(ownerId) {
  return {
    status:   connStatus[ownerId] || 'disconnected',
    qr:       qrCodes[ownerId]?.dataUrl || null,
    contacts: (contactMap[ownerId] || []).length,
  };
}

function getContacts(ownerId) { return contactMap[ownerId] || []; }

async function sendWAMessage(ownerId, phone, text) {
  const sock = sockets[ownerId];
  if (!sock || connStatus[ownerId] !== 'connected') throw new Error('WhatsApp not connected');
  const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text });
}

// 2-3 messages per minute: 1 msg every 20-30 sec with random jitter
async function runCampaign(campaignId) {
  const { getPool } = require('../config/db');
  const pool = getPool();

  const [[camp]] = await pool.query('SELECT * FROM campaigns WHERE id = ?', [campaignId]);
  if (!camp || camp.status !== 'running') return;

  activeCamps[campaignId] = { running: true };

  const [pending] = await pool.query(
    'SELECT * FROM campaign_logs WHERE campaign_id = ? AND status = "pending" ORDER BY id',
    [campaignId]
  );

  for (const log of pending) {
    const [[cur]] = await pool.query('SELECT status FROM campaigns WHERE id = ?', [campaignId]);
    if (!activeCamps[campaignId]?.running || cur.status !== 'running') break;

    try {
      await sendWAMessage(camp.owner_id, log.phone, camp.message);
      await pool.query('UPDATE campaign_logs SET status="sent", sent_at=NOW() WHERE id=?', [log.id]);
      await pool.query('UPDATE campaigns SET sent_count=sent_count+1, updated_at=NOW() WHERE id=?', [campaignId]);
    } catch {
      await pool.query('UPDATE campaign_logs SET status="failed" WHERE id=?', [log.id]);
      await pool.query('UPDATE campaigns SET failed_count=failed_count+1, updated_at=NOW() WHERE id=?', [campaignId]);
    }

    // 20–30 second delay = 2–3 msgs/min
    await new Promise(r => setTimeout(r, 20000 + Math.floor(Math.random() * 10000)));
  }

  const [[fin]] = await pool.query('SELECT status FROM campaigns WHERE id = ?', [campaignId]);
  if (fin.status === 'running') {
    await pool.query('UPDATE campaigns SET status="completed", updated_at=NOW() WHERE id=?', [campaignId]);
  }
  delete activeCamps[campaignId];
}

// connectWithPairingCode — creates a fresh socket and requests a pairing code
// right when the QR event fires. This is the only reliable timing for requestPairingCode().
async function connectWithPairingCode(ownerId, phone) {
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 10)
    throw new Error('Enter a valid phone number with country code (e.g. 919876543210)');

  // Close any existing socket so we start fresh
  if (sockets[ownerId]) {
    try { sockets[ownerId].ws?.close(); } catch {}
    delete sockets[ownerId];
    delete qrCodes[ownerId];
  }

  const sessionDir = path.join(SESSION_BASE, String(ownerId));
  fs.mkdirSync(sessionDir, { recursive: true });
  loadSavedContacts(ownerId);

  let mod;
  try { mod = await import('@whiskeysockets/baileys'); }
  catch { connStatus[ownerId] = 'unavailable'; throw new Error('WhatsApp module not available on this server'); }

  const makeWASocket = mod.makeWASocket || mod.default;
  const { useMultiFileAuthState, DisconnectReason } = mod;
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  connStatus[ownerId] = 'connecting';

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['OfferCity', 'Chrome', '120.0'],
    syncFullHistory: false,
    getMessage: async () => undefined,
  });

  sockets[ownerId] = sock;
  sock.ev.on('creds.update', saveCreds);

  const ai = require('./aichatbot');
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (msg.key.fromMe || msg.key.remoteJid?.endsWith('@g.us')) continue;
      const age = Date.now() / 1000 - (msg.messageTimestamp || 0);
      if (age > 60) continue;
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';
      if (!text.trim()) continue;
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
      const reply = await ai.handleIncoming(ownerId, msg.key.remoteJid, text, msg.pushName || '');
      if (reply) await sock.sendMessage(msg.key.remoteJid, { text: reply });
    }
  });
  sock.ev.on('contacts.set',      ({ contacts }) => mergeContacts(ownerId, contacts));
  sock.ev.on('contacts.update',   upd => mergeContacts(ownerId, upd));
  sock.ev.on('messaging-history.set', ({ contacts: c }) => { if (c?.length) mergeContacts(ownerId, c); });

  // Return a Promise that resolves with the pairing code or rejects on timeout/error
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for QR — try again')), 16000);

    sock.ev.on('connection.update', async ({ qr, connection, lastDisconnect }) => {
      if (qr) {
        // QR event is the correct moment to call requestPairingCode
        connStatus[ownerId] = 'waiting_scan';
        try {
          const code = await sock.requestPairingCode(cleanPhone);
          clearTimeout(timeout);
          resolve(code);
        } catch (e) {
          clearTimeout(timeout);
          connStatus[ownerId] = 'error';
          reject(new Error('Could not generate pairing code: ' + e.message));
        }
      }
      if (connection === 'open') {
        connStatus[ownerId] = 'connected';
        delete qrCodes[ownerId];
        clearTimeout(timeout);
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        delete sockets[ownerId];
        if (code === DisconnectReason?.loggedOut) {
          connStatus[ownerId] = 'disconnected';
          contactMap[ownerId] = [];
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } else {
          connStatus[ownerId] = 'reconnecting';
          setTimeout(() => connect(ownerId), 6000);
        }
      }
    });
  });
}

module.exports = { connect, disconnect, getStatus, getContacts, sendWAMessage, runCampaign, activeCamps, connectWithPairingCode };
