const path = require('path');
const fs   = require('fs');

const SESSION_BASE   = process.env.WA_SESSION_DIR
  || (process.platform === 'linux' ? '/home1/a1751tyi/whatsapp_sessions' : path.join(__dirname, '../whatsapp_sessions'));
const contactsFile   = (id) => path.join(SESSION_BASE, String(id), 'contacts.json');

const sockets       = {};   // ownerId → sock
const connStatus    = {};   // ownerId → string
const qrCodes       = {};   // ownerId → { dataUrl, ts }
const contactMap    = {};   // ownerId → [{jid, phone, name}]
const lidToPhone    = {};   // ownerId → { lidJid → phoneJid } — resolves WA internal IDs
const activeCamps   = {};   // campaignId → { running: bool }
const keepAlive     = {};   // ownerId → intervalId
const reconnectTry  = {};   // ownerId → attempt count (for backoff)
const lockTimers    = {};   // ownerId → lock refresh intervalId

const MY_PID = String(process.pid);

// File-based lock so only ONE Node process connects to WhatsApp, even when
// cPanel runs multiple zombie processes simultaneously (pid conflict 440 loop).
function lockFile(ownerId) { return path.join(SESSION_BASE, String(ownerId), 'wa.lock'); }

function checkLock(ownerId) {
  try {
    const f = lockFile(ownerId);
    if (!fs.existsSync(f)) return false;
    const [pid, ts] = fs.readFileSync(f, 'utf8').trim().split(':');
    if (pid === MY_PID) return false;              // we own it
    if (Date.now() - parseInt(ts) > 60_000) return false; // stale (holder died)
    try { process.kill(parseInt(pid), 0); return true; }  // live process holds it
    catch { return false; }                        // PID is dead, take over
  } catch { return false; }
}

function acquireLock(ownerId) {
  try { fs.writeFileSync(lockFile(ownerId), `${MY_PID}:${Date.now()}`); } catch {}
}

function releaseLock(ownerId) {
  try {
    const f = lockFile(ownerId);
    const pid = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split(':')[0] : '';
    if (pid === MY_PID) fs.rmSync(f, { force: true });
  } catch {}
}

function startLockRefresh(ownerId) {
  clearInterval(lockTimers[ownerId]);
  lockTimers[ownerId] = setInterval(() => {
    try { fs.writeFileSync(lockFile(ownerId), `${MY_PID}:${Date.now()}`); } catch {}
  }, 15_000);
}

function stopLockRefresh(ownerId) {
  clearInterval(lockTimers[ownerId]);
  delete lockTimers[ownerId];
}

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
  if (!lidToPhone[ownerId]) lidToPhone[ownerId] = {};
  // Log first contact's fields once so we can see what Baileys provides
  if (incoming.length && !mergeContacts._logged) {
    mergeContacts._logged = true;
    const sample = incoming[0];
    console.log(`[WA CONTACT FIELDS] keys=${Object.keys(sample).join(',')} sample=${JSON.stringify(sample).slice(0, 200)}`);
  }
  for (const c of incoming) {
    if (!c.id) continue;
    // pn = actual phone number (newer Baileys for LID contacts)
    if (c.pn) {
      const phone = String(c.pn).replace(/\D/g, '');
      const lid   = c.id.split('@')[0];
      if (phone) lidToPhone[ownerId][lid] = phone;
    }
    // lid field = LID when id is the phone JID (alternative Baileys format)
    if (c.lid) {
      const lid = String(c.lid).split('@')[0].replace(/\D/g, '');
      const phone = c.id.split('@')[0];
      if (lid && /^\d+$/.test(phone)) lidToPhone[ownerId][lid] = phone;
    }
    if (!c.id.endsWith('@s.whatsapp.net')) continue;
    const phone = (c.pn ? String(c.pn).replace(/\D/g, '') : null) || c.id.replace('@s.whatsapp.net', '');
    const entry = { jid: c.id, phone, name: c.name || c.notify || c.pushName || '' };
    const idx = contactMap[ownerId].findIndex(x => x.jid === c.id);
    if (idx >= 0) Object.assign(contactMap[ownerId][idx], entry);
    else contactMap[ownerId].push(entry);
  }
  persistContacts(ownerId);
}

// Resolve a LID JID (WhatsApp internal ID) to the real phone JID for reliable delivery
// pushName is the sender's display name — used as last-resort fallback via name lookup in stored contacts
function resolvePhoneJid(ownerId, jid, pushName) {
  if (!jid) return jid;
  const user = jid.split('@')[0];
  // Real Indian phone: ≤13 digits (91+10). LIDs are 14-15 digits.
  if (/^\d+$/.test(user) && user.length <= 13) return jid;
  // LID → phone from lidToPhone map (built from contacts.set pn/lid fields)
  const phone = lidToPhone[ownerId]?.[user];
  if (phone) { console.log(`[WA] LID ${user} → ${phone} (map)`); return `${phone}@s.whatsapp.net`; }
  // JID-based lookup — only useful if the stored phone is a real phone (≤13 digits)
  const contact = (contactMap[ownerId] || []).find(c => c.jid === jid);
  if (contact?.phone && contact.phone.length <= 13) {
    console.log(`[WA] LID ${user} → ${contact.phone} (contact jid)`);
    return `${contact.phone}@s.whatsapp.net`;
  }
  // Name-based lookup: find an older phone-JID entry for the same person
  if (pushName) {
    const nl = pushName.toLowerCase();
    const byName = (contactMap[ownerId] || []).find(c =>
      c.name && c.name.toLowerCase() === nl &&
      /^\d+$/.test(c.phone) && c.phone.length <= 13
    );
    if (byName) { console.log(`[WA] LID ${user} → ${byName.phone} (name:${pushName})`); return byName.jid; }
  }
  const cmap = contactMap[ownerId] || [];
  console.log(`[WA] LID ${user} unresolved name="${pushName}" contacts=${cmap.length} phoneJids=${cmap.filter(c=>/^\d+$/.test(c.phone)&&c.phone.length<=13).length}`);
  return jid;
}

async function connect(ownerId) {
  if (connStatus[ownerId] === 'connected') return;
  if (connStatus[ownerId] === 'connecting') return;
  // Only skip waiting_scan if we actually have a QR shown — not if stuck from pairing mode
  if (connStatus[ownerId] === 'waiting_scan' && qrCodes[ownerId]) return;

  // If another live process already holds the lock, stand down — let it own WhatsApp
  if (checkLock(ownerId)) {
    console.log(`[WA] Owner ${ownerId} — pid ${MY_PID} standing down, another process holds the lock`);
    connStatus[ownerId] = 'connected'; // show connected in UI (the other proc is handling it)
    return;
  }
  acquireLock(ownerId);

  // Close any leftover socket (e.g. from a pairing code attempt)
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
  reconnectTry[ownerId] = reconnectTry[ownerId] || 0;

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['OfferCity', 'Chrome', '120.0'],
    syncFullHistory:              false,
    getMessage:                   async () => undefined,
    keepAliveIntervalMs:            20_000,
    connectTimeoutMs:               60_000,  // allow 60s to establish WS (was 30s)
    defaultQueryTimeoutMs:          30_000,  // 30s — long enough for fetchProps, short enough to not hang LID sends
    retryRequestDelayMs:            2_000,
    generateHighQualityLinkPreview: false,
    markOnlineOnConnect:            false,
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
      reconnectTry[ownerId] = 0;
      delete qrCodes[ownerId];
      console.log(`[WA] Owner ${ownerId} connected (pid ${MY_PID})`);

      startLockRefresh(ownerId); // keep lock fresh every 15s so other pids stay out

      // Presence heartbeat every 30s — tells WhatsApp we're online
      clearInterval(keepAlive[ownerId]);
      keepAlive[ownerId] = setInterval(async () => {
        try { await sock.sendPresenceUpdate('available'); } catch {}
      }, 30_000);

      resumePendingCampaigns(ownerId);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      clearInterval(keepAlive[ownerId]);
      stopLockRefresh(ownerId);
      releaseLock(ownerId);
      delete sockets[ownerId];
      console.log(`[WA] Owner ${ownerId} closed — code ${code} (pid ${MY_PID})`);
      if (code === DisconnectReason.loggedOut) {
        connStatus[ownerId] = 'disconnected';
        reconnectTry[ownerId] = 0;
        contactMap[ownerId] = [];
        fs.rmSync(sessionDir, { recursive: true, force: true });
      } else if (code === 408) {
        // Init query timeout — retry quickly, don't penalise with backoff
        connStatus[ownerId] = 'reconnecting';
        console.log(`[WA] Owner ${ownerId} init timeout — retrying in 3s`);
        setTimeout(() => connect(ownerId), 3000);
      } else {
        connStatus[ownerId] = 'reconnecting';
        // Exponential backoff for other errors: 5s, 10s, 20s, 40s — max 60s
        const attempt = reconnectTry[ownerId]++ || 0;
        const delay = Math.min(5000 * Math.pow(2, attempt), 60_000);
        console.log(`[WA] Owner ${ownerId} retry #${attempt + 1} in ${delay / 1000}s`);
        setTimeout(() => connect(ownerId), delay);
      }
    }
  });

  sock.ev.on('contacts.set', ({ contacts }) => { mergeContacts(ownerId, contacts); });
  sock.ev.on('contacts.update', (upd) => { mergeContacts(ownerId, upd); });
  sock.ev.on('messaging-history.set', ({ contacts: c }) => { if (c?.length) mergeContacts(ownerId, c); });

  // AI chatbot: reply to incoming individual messages
  const ai = require('./aichatbot');
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        if (msg.key.fromMe) continue;
        const remoteJid = msg.key.remoteJid || '';
        // Only handle direct 1-on-1 chats — skip groups, status broadcasts, newsletters
        if (!remoteJid.endsWith('@s.whatsapp.net')) continue;
        const age = Date.now() / 1000 - (msg.messageTimestamp || 0);
        const text = msg.message?.conversation
          || msg.message?.extendedTextMessage?.text
          || msg.message?.imageMessage?.caption
          || '';
        const replyJid = resolvePhoneJid(ownerId, remoteJid, msg.pushName || '');
        console.log(`[WA MSG] jid=${remoteJid} replyJid=${replyJid} name="${msg.pushName || ''}" age=${Math.round(age)}s text="${text.slice(0, 40)}"`);
        if (age > 300) continue;
        if (!text.trim()) continue;
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
        const reply = await ai.handleIncoming(ownerId, replyJid, text, msg.pushName || '');
        if (reply) {
          // Timeout resolves (not rejects) so a hung LID send never blocks the loop
          const sent = await Promise.race([
            sock.sendMessage(replyJid, { text: reply }).then(() => true),
            new Promise(r => setTimeout(() => r(false), 12000))
          ]);
          console.log(`[AI] Send ${sent ? 'OK' : 'TIMEOUT'} → ${replyJid}`);
        }
      } catch (e) { console.error('[WA] message handler error:', e.message); }
    }
  });
}

async function disconnect(ownerId) {
  clearInterval(keepAlive[ownerId]);
  delete keepAlive[ownerId];
  stopLockRefresh(ownerId);
  releaseLock(ownerId);
  reconnectTry[ownerId] = 0;
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

// Wait up to `ms` milliseconds for WhatsApp to reach 'connected' state
function waitForConnected(ownerId, ms = 60000) {
  return new Promise(resolve => {
    if (connStatus[ownerId] === 'connected') return resolve(true);
    const deadline = Date.now() + ms;
    const t = setInterval(() => {
      if (connStatus[ownerId] === 'connected') { clearInterval(t); resolve(true); }
      else if (Date.now() >= deadline) { clearInterval(t); resolve(false); }
    }, 1000);
  });
}

async function sendWAMessage(ownerId, phone, text) {
  // If reconnecting, wait up to 40 seconds instead of failing immediately
  if (connStatus[ownerId] === 'reconnecting') {
    const ok = await waitForConnected(ownerId, 40000);
    if (!ok) throw new Error('WhatsApp reconnection timed out');
  }
  const sock = sockets[ownerId];
  if (!sock || connStatus[ownerId] !== 'connected') throw new Error('WhatsApp not connected');
  const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text });
}

// Resume any campaigns left in 'running' state (e.g. after server restart)
async function resumePendingCampaigns(ownerId) {
  try {
    const { getPool } = require('../config/db');
    const [rows] = await getPool().query(
      'SELECT id FROM campaigns WHERE owner_id = ? AND status = "running"', [ownerId]
    );
    for (const r of rows) {
      if (!activeCamps[r.id]) {
        console.log(`[WA] Resuming campaign ${r.id} for owner ${ownerId}`);
        runCampaign(r.id);
      }
    }
  } catch (e) { console.error('[WA] resumePendingCampaigns:', e.message); }
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

    let sent = false;
    for (let attempt = 0; attempt < 2 && !sent; attempt++) {
      try {
        await sendWAMessage(camp.owner_id, log.phone, camp.message);
        await pool.query('UPDATE campaign_logs SET status="sent", sent_at=NOW() WHERE id=?', [log.id]);
        await pool.query('UPDATE campaigns SET sent_count=sent_count+1, updated_at=NOW() WHERE id=?', [campaignId]);
        sent = true;
      } catch (e) {
        console.error(`[Camp ${campaignId}] attempt ${attempt+1} failed for ${log.phone}:`, e.message);
        if (attempt === 0) await new Promise(r => setTimeout(r, 5000)); // brief wait before retry
      }
    }
    if (!sent) {
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

  // Close any existing socket
  if (sockets[ownerId]) {
    try { sockets[ownerId].ws?.close(); } catch {}
    delete sockets[ownerId];
    delete qrCodes[ownerId];
  }
  connStatus[ownerId] = 'disconnected';

  const sessionDir = path.join(SESSION_BASE, String(ownerId));

  // Nuclear session clear: save contacts, wipe whole dir, restore contacts.
  // Baileys MUST start with no saved credentials to generate a fresh QR for requestPairingCode.
  const contactsPath = path.join(sessionDir, 'contacts.json');
  let savedContacts = null;
  try { if (fs.existsSync(contactsPath)) savedContacts = fs.readFileSync(contactsPath); } catch {}
  try { fs.rmSync(sessionDir, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(sessionDir, { recursive: true });
  if (savedContacts) { try { fs.writeFileSync(contactsPath, savedContacts); } catch {} }

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
    keepAliveIntervalMs: 20_000,
    connectTimeoutMs:    30_000,
    retryRequestDelayMs: 2_000,
  });

  sockets[ownerId] = sock;
  sock.ev.on('creds.update', saveCreds);

  // Register connection.update FIRST — before any async event could fire — so we never miss the QR
  const pairResult = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out — try again')), 20000);

    sock.ev.on('connection.update', async ({ qr, connection, lastDisconnect }) => {
      if (qr) {
        connStatus[ownerId] = 'waiting_scan';
        try {
          const code = await sock.requestPairingCode(cleanPhone);
          clearTimeout(timeout);
          resolve(code);
        } catch (e) {
          clearTimeout(timeout);
          connStatus[ownerId] = 'error';
          reject(new Error('WhatsApp rejected the code request: ' + e.message));
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

  // Register remaining handlers after promise is set up
  const ai = require('./aichatbot');
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        if (msg.key.fromMe) continue;
        const remoteJid2 = msg.key.remoteJid || '';
        if (!remoteJid2.endsWith('@s.whatsapp.net')) continue;
        const age = Date.now() / 1000 - (msg.messageTimestamp || 0);
        if (age > 300) continue;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';
        if (!text.trim()) continue;
        await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
        const replyJid2 = resolvePhoneJid(ownerId, remoteJid2, msg.pushName || '');
        const reply = await ai.handleIncoming(ownerId, replyJid2, text, msg.pushName || '');
        if (reply) {
          const sent2 = await Promise.race([
            sock.sendMessage(replyJid2, { text: reply }).then(() => true),
            new Promise(r => setTimeout(() => r(false), 12000))
          ]);
          console.log(`[AI] Send ${sent2 ? 'OK' : 'TIMEOUT'} → ${replyJid2}`);
        }
      } catch (e) { console.error('[WA] message handler error:', e.message); }
    }
  });
  sock.ev.on('contacts.set',      ({ contacts }) => mergeContacts(ownerId, contacts));
  sock.ev.on('contacts.update',   upd => mergeContacts(ownerId, upd));
  sock.ev.on('messaging-history.set', ({ contacts: c }) => { if (c?.length) mergeContacts(ownerId, c); });

  return pairResult;
}

// On server start, reconnect any owner that has saved Baileys credentials
async function autoReconnectAll() {
  try {
    if (!fs.existsSync(SESSION_BASE)) return;
    const entries = fs.readdirSync(SESSION_BASE, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const ownerId = e.name;
      const credsPath = path.join(SESSION_BASE, ownerId, 'creds.json');
      if (fs.existsSync(credsPath)) {
        connStatus[ownerId] = 'reconnecting';
        loadSavedContacts(ownerId);
        // Restore chatbot toggle from disk so it survives server restarts
        require('./aichatbot').loadEnabled(ownerId);
        console.log(`[WA] Auto-reconnecting owner ${ownerId} from saved session`);
        connect(ownerId).catch(err => console.error(`[WA] Auto-reconnect failed for ${ownerId}:`, err.message));
      }
    }
  } catch (e) {
    console.error('[WA] autoReconnectAll error:', e.message);
  }
}

// Watchdog: every 3 min, reconnect any owner whose session file exists but socket dropped
function startWatchdog() {
  setInterval(() => {
    try {
      if (!fs.existsSync(SESSION_BASE)) return;
      const entries = fs.readdirSync(SESSION_BASE, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const ownerId = e.name;
        const status  = connStatus[ownerId];
        const hasCreds = fs.existsSync(path.join(SESSION_BASE, ownerId, 'creds.json'));
        if (hasCreds && status !== 'connected' && status !== 'connecting' && status !== 'reconnecting') {
          console.log(`[WA] Watchdog: reconnecting owner ${ownerId} (was: ${status})`);
          connect(ownerId).catch(() => {});
        }
      }
    } catch {}
  }, 3 * 60 * 1000);
}

module.exports = { connect, disconnect, getStatus, getContacts, sendWAMessage, runCampaign, activeCamps, connectWithPairingCode, autoReconnectAll, startWatchdog };
