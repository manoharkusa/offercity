import { useState, useEffect } from 'react';
import api from '../services/api';

// SMS campaign hub for shop owners: wallet, pack purchase (Razorpay),
// customer contact list, and offer broadcast via SMS link.
export default function SmsCampaign({ offers = [] }) {
  const [wallet, setWallet]       = useState({ balance: 0, transactions: [] });
  const [packsInfo, setPacksInfo] = useState({ packs: [], paymentLive: false, smsLive: false });
  const [contacts, setContacts]   = useState([]);
  const [showContacts, setShowContacts] = useState(false);
  const [showHistory, setShowHistory]   = useState(false);
  const [importText, setImportText]     = useState('');
  const [selOffer, setSelOffer]   = useState('');
  const [busy, setBusy]           = useState(false);
  const [note, setNote]           = useState(null); // { kind: 'ok'|'err', text }

  const flash = (text, kind = 'ok') => { setNote({ kind, text }); setTimeout(() => setNote(null), 6000); };

  const reload = () => {
    api.get('/sms/wallet').then(r => setWallet(r.data)).catch(() => {});
    api.get('/sms/contacts').then(r => setContacts(r.data.list)).catch(() => {});
  };

  useEffect(() => {
    reload();
    api.get('/sms/packs').then(r => setPacksInfo(r.data)).catch(() => {});
  }, []);

  // ── Pack purchase ───────────────────────────────────────────────────────────
  const buyPack = async (pack) => {
    setBusy(true);
    try {
      const { data: order } = await api.post('/sms/order', { pack_id: pack.id });

      if (order.mock) {
        // No Razorpay keys yet — instant test credit so the flow can be exercised
        const { data } = await api.post('/sms/verify-payment', { razorpay_order_id: order.order_id });
        flash(`${data.message} (test mode — no real payment)`);
        reload();
        return;
      }

      // Load Razorpay checkout script on demand
      if (!window.Razorpay) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://checkout.razorpay.com/v1/checkout.js';
          s.onload = res; s.onerror = () => rej(new Error('Could not load payment page'));
          document.body.appendChild(s);
        });
      }

      const rzp = new window.Razorpay({
        key: order.razorpayKeyId,
        amount: order.amount,
        currency: 'INR',
        name: 'OfferCity',
        description: `${pack.label} — ${pack.sms} SMS`,
        order_id: order.order_id,
        handler: async (resp) => {
          try {
            const { data } = await api.post('/sms/verify-payment', {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            flash(data.message);
            reload();
          } catch (err) {
            flash(err.response?.data?.message || 'Payment verification failed', 'err');
          }
        },
        theme: { color: '#e65100' },
      });
      rzp.open();
    } catch (err) {
      flash(err.response?.data?.message || 'Could not start payment', 'err');
    } finally { setBusy(false); }
  };

  // ── Contacts import: paste "name,phone" or plain numbers, one per line ─────
  const importContacts = async () => {
    const lines = importText.split(/\n+/).map(l => l.trim()).filter(Boolean);
    const parsed = lines.map(l => {
      const parts = l.split(/[,;\t]/).map(p => p.trim());
      if (parts.length >= 2 && /\d{10}/.test(parts[1])) return { name: parts[0], phone: parts[1] };
      if (parts.length >= 2 && /\d{10}/.test(parts[0])) return { phone: parts[0], name: parts[1] };
      return { phone: parts[0] };
    });
    if (!parsed.length) return;
    setBusy(true);
    try {
      const { data } = await api.post('/sms/contacts', { contacts: parsed });
      flash(`Added ${data.added} contact${data.added !== 1 ? 's' : ''}${data.skipped ? `, ${data.skipped} skipped (invalid/duplicate)` : ''}`);
      setImportText('');
      reload();
    } catch (err) {
      flash(err.response?.data?.message || 'Import failed', 'err');
    } finally { setBusy(false); }
  };

  const removeContact = async (cid) => {
    try { await api.delete(`/sms/contacts/${cid}`); setContacts(prev => prev.filter(c => c.id !== cid)); } catch {}
  };

  // ── Send campaign ───────────────────────────────────────────────────────────
  const offer = offers.find(o => String(o.id) === String(selOffer));
  const previewMsg = offer
    ? `${offer.shop_name || 'Your shop'}: ${offer.discount > 0 ? `${Math.round(offer.discount)}% OFF ` : ''}${offer.title}. View & chat: offerscity.co.in/o/${offer.id}`
    : '';

  const sendCampaign = async () => {
    if (!offer) return;
    if (!window.confirm(`Send this offer to all ${contacts.length} contacts? This uses ${contacts.length} SMS credits.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post('/sms/campaign', { offer_id: offer.id });
      flash(`✅ Sent to ${data.sent} customers${data.failed ? `, ${data.failed} failed (refunded)` : ''}${data.mock ? ' — TEST MODE, no real SMS sent' : ''}`);
      reload();
    } catch (err) {
      flash(err.response?.data?.message || 'Campaign failed', 'err');
    } finally { setBusy(false); }
  };

  const card = { background: '#fff', borderRadius: 12, padding: '16px 18px', marginBottom: 14, boxShadow: '0 1px 6px rgba(0,0,0,.07)' };

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px' }}>
        📨 SMS Campaign
        {!packsInfo.smsLive && <span style={{ fontSize: 11, background: '#fff3cd', color: '#7a5700', padding: '3px 10px', borderRadius: 12, fontWeight: 600 }}>TEST MODE</span>}
      </h3>

      {note && (
        <div style={{ background: note.kind === 'ok' ? '#e8f5e9' : '#ffebee', color: note.kind === 'ok' ? '#2e7d32' : '#c62828',
          padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13.5 }}>
          {note.text}
        </div>
      )}

      {/* Wallet */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, color: '#888' }}>SMS Balance</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: wallet.balance > 0 ? '#2e7d32' : '#c62828' }}>{wallet.balance}</div>
          <button onClick={() => setShowHistory(h => !h)} style={{ background: 'none', border: 'none', color: '#888', fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
            {showHistory ? 'Hide history' : 'View history'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {packsInfo.packs.map(p => (
            <button key={p.id} disabled={busy} onClick={() => buyPack(p)}
              style={{ border: '1.5px solid #e65100', background: '#fff', color: '#e65100', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
              ₹{p.rupees}<div style={{ fontSize: 11, fontWeight: 500, color: '#888' }}>{p.sms} SMS</div>
            </button>
          ))}
        </div>
      </div>

      {showHistory && (
        <div style={card}>
          {wallet.transactions.length === 0 && <p style={{ color: '#999', fontSize: 13 }}>No transactions yet.</p>}
          {wallet.transactions.map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f4f4f4' }}>
              <span>{t.note || t.type}</span>
              <span style={{ fontWeight: 700, color: t.sms_count > 0 ? '#2e7d32' : '#c62828' }}>{t.sms_count > 0 ? '+' : ''}{t.sms_count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Contacts */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700 }}>👥 Customer Numbers</div>
            <div style={{ fontSize: 13, color: '#888' }}>{contacts.length} saved</div>
          </div>
          <button onClick={() => setShowContacts(s => !s)}
            style={{ border: '1px solid #ddd', background: '#fff', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
            {showContacts ? 'Close' : 'Manage'}
          </button>
        </div>

        {showContacts && (
          <div style={{ marginTop: 14 }}>
            <textarea value={importText} onChange={e => setImportText(e.target.value)}
              placeholder={'Paste numbers — one per line:\n9876543210\nRamesh, 9876543211'}
              style={{ width: '100%', minHeight: 90, border: '1px solid #ddd', borderRadius: 8, padding: 10, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
            <button disabled={busy || !importText.trim()} onClick={importContacts}
              style={{ marginTop: 8, background: '#e65100', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
              Add numbers
            </button>
            <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 12 }}>
              {contacts.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f4f4f4', fontSize: 13.5 }}>
                  <span>{c.name ? `${c.name} — ` : ''}{c.phone}</span>
                  <button onClick={() => removeContact(c.id)} style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 15 }}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Send */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>🚀 Send an offer</div>
        <select value={selOffer} onChange={e => setSelOffer(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginBottom: 10 }}>
          <option value="">— Select an offer —</option>
          {offers.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>

        {offer && (
          <div style={{ background: '#f8f8f8', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#555', marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>Customers receive:</div>
            {previewMsg}
          </div>
        )}

        <button disabled={busy || !offer || contacts.length === 0} onClick={sendCampaign}
          style={{ width: '100%', background: (!offer || contacts.length === 0) ? '#ccc' : '#e65100', color: '#fff', border: 'none',
            borderRadius: 10, padding: '12px', cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>
          {contacts.length === 0 ? 'Add customer numbers first' : `Send to ${contacts.length} customers (${contacts.length} SMS)`}
        </button>
        {offer && contacts.length > wallet.balance && (
          <p style={{ color: '#c62828', fontSize: 12.5, marginTop: 8, textAlign: 'center' }}>
            Not enough credits — need {contacts.length}, have {wallet.balance}. Buy a pack above.
          </p>
        )}
      </div>
    </div>
  );
}
