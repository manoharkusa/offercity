import { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { OFFER_CATEGORIES } from '../constants/categories';
import OfferForm from '../components/OfferForm';
import SmsCampaign from '../components/SmsCampaign';
import { compressImage, fmt } from '../utils/offerHelpers';

const CATEGORIES = OFFER_CATEGORIES.map(c => c.key);

// ── Catalog management sub-component ────────────────────────────────────────
function CatalogTab({ shops, flash }) {
  const [shopId,  setShopId]  = useState('');
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null); // itemId being edited
  const [editBuf, setEditBuf] = useState({});   // draft values for the row being edited
  const [newItem, setNewItem] = useState({ name: '', price: '', description: '' });
  const [adding,  setAdding]  = useState(false);
  const [offerItemId, setOfferItemId] = useState(null); // catalog item currently showing inline "Create Offer" form

  const loadCatalog = async (id) => {
    setShopId(id); setEditing(null); setItems([]); setOfferItemId(null);
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/shops/${id}/catalog`);
      setItems(data);
    } catch { flash('Could not load catalog', 'err'); }
    setLoading(false);
  };

  const addItem = async () => {
    if (!newItem.name.trim()) { flash('Enter item name', 'err'); return; }
    setAdding(true);
    try {
      const { data } = await api.post(`/shops/${shopId}/catalog`, newItem);
      setItems(p => [...p, data]);
      setNewItem({ name: '', price: '', description: '' });
    } catch (err) { flash(err.response?.data?.message || 'Failed to add', 'err'); }
    setAdding(false);
  };

  const startEdit = (item) => {
    setEditing(item.id);
    setEditBuf({ name: item.name, price: item.price || '', description: item.description || '' });
  };

  const saveEdit = async (item) => {
    if (!editBuf.name.trim()) { flash('Item name cannot be empty', 'err'); return; }
    try {
      await api.put(`/shops/${shopId}/catalog/${item.id}`, editBuf);
      setItems(p => p.map(x => x.id === item.id ? { ...x, ...editBuf } : x));
      setEditing(null);
    } catch (err) { flash(err.response?.data?.message || 'Save failed', 'err'); }
  };

  const deleteItem = async (itemId) => {
    if (!window.confirm('Remove this item?')) return;
    try {
      await api.delete(`/shops/${shopId}/catalog/${itemId}`);
      setItems(p => p.filter(x => x.id !== itemId));
    } catch { flash('Delete failed', 'err'); }
  };

  const inp = { padding: '7px 10px', border: '1px solid #ddd', borderRadius: 7, fontSize: 13, width: '100%', boxSizing: 'border-box' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>📋 Services &amp; Catalog</h2>
        {shopId && <span style={{ fontSize: 13, color: '#888' }}>{items.length} items</span>}
      </div>

      <div style={{ marginBottom: 20 }}>
        <select value={shopId} onChange={e => loadCatalog(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, minWidth: 220 }}>
          <option value="">— Select a shop —</option>
          {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {loading && <p style={{ color: '#aaa' }}>Loading…</p>}

      {shopId && !loading && (
        <>
          {/* Existing items */}
          {items.length === 0 && (
            <p style={{ color: '#aaa', fontSize: 14, marginBottom: 20 }}>No items yet. Add your first service below.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {items.map((item, i) => (
              <div key={item.id} style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.07)', border: '1px solid #eee' }}>
                {editing === item.id ? (
                  /* Edit mode */
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr', gap: 8, marginBottom: 10 }}>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#555', display: 'block', marginBottom: 3 }}>Item Name *</label>
                        <input value={editBuf.name} onChange={e => setEditBuf(b => ({ ...b, name: e.target.value }))} style={inp} autoFocus />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#555', display: 'block', marginBottom: 3 }}>Price (₹)</label>
                        <input type="number" value={editBuf.price} onChange={e => setEditBuf(b => ({ ...b, price: e.target.value }))} style={inp} placeholder="0.00" />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#555', display: 'block', marginBottom: 3 }}>Description</label>
                        <input value={editBuf.description} onChange={e => setEditBuf(b => ({ ...b, description: e.target.value }))} style={inp} placeholder="Optional" />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => saveEdit(item)}
                        style={{ padding: '7px 18px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                        ✅ Save
                      </button>
                      <button onClick={() => setEditing(null)}
                        style={{ padding: '7px 14px', background: '#eee', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: '#aaa', minWidth: 22, textAlign: 'right' }}>{i + 1}.</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                        {item.description && <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>{item.description}</div>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontWeight: 700, color: item.price ? '#2e7d32' : '#bbb', fontSize: 15, whiteSpace: 'nowrap' }}>
                        {item.price ? `₹${Number(item.price).toLocaleString('en-IN')}` : '—'}
                      </span>
                      <button onClick={() => setOfferItemId(offerItemId === item.id ? null : item.id)}
                        style={{ padding: '5px 12px', background: offerItemId === item.id ? '#ffe0b2' : '#fff3e0', color: '#e65100', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        🏷 {offerItemId === item.id ? 'Close' : 'Create Offer'}
                      </button>
                      <button onClick={() => startEdit(item)}
                        style={{ padding: '5px 12px', background: '#e3f2fd', color: '#1565c0', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        ✏️ Edit
                      </button>
                      <button onClick={() => deleteItem(item.id)}
                        style={{ padding: '5px 10px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        🗑
                      </button>
                    </div>
                  </div>
                )}

                {offerItemId === item.id && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px dashed #ffcc80' }}>
                    <OfferForm
                      shops={shops}
                      shopId={shopId}
                      initialValues={{ title: item.name, description: item.description || '', original_price: item.price ? String(item.price) : '' }}
                      flash={flash}
                      onCancel={() => setOfferItemId(null)}
                      showCloseButton
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add new item row */}
          <div style={{ background: '#f3e5f5', borderRadius: 12, padding: 16, border: '2px dashed #ce93d8' }}>
            <div style={{ fontWeight: 700, color: '#6a1b9a', marginBottom: 12, fontSize: 14 }}>➕ Add New Item</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr', gap: 8, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#555', display: 'block', marginBottom: 3 }}>Item Name *</label>
                <input value={newItem.name} onChange={e => setNewItem(n => ({ ...n, name: e.target.value }))}
                  placeholder="e.g. Haircut, Oil Change, Biryani…" style={inp}
                  onKeyDown={e => e.key === 'Enter' && addItem()} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#555', display: 'block', marginBottom: 3 }}>Price (₹)</label>
                <input type="number" value={newItem.price} onChange={e => setNewItem(n => ({ ...n, price: e.target.value }))}
                  placeholder="0.00" style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#555', display: 'block', marginBottom: 3 }}>Description</label>
                <input value={newItem.description} onChange={e => setNewItem(n => ({ ...n, description: e.target.value }))}
                  placeholder="Optional details" style={inp} />
              </div>
            </div>
            <button onClick={addItem} disabled={adding}
              style={{ padding: '9px 24px', background: adding ? '#aaa' : '#6a1b9a', color: '#fff', border: 'none', borderRadius: 8, cursor: adding ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}>
              {adding ? 'Adding…' : '+ Add to Catalog'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Chat Logs sub-component ─────────────────────────────────────────────────
function ChatLogsTab({ shops, flash }) {
  const firstId = shops.length ? String(shops[0].id) : '';
  const [shopId,  setShopId]  = useState(firstId);
  const [channel, setChannel] = useState('all');
  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [page,    setPage]    = useState(1);
  const [loadErr, setLoadErr] = useState(false);

  const load = async (sid, ch, pg) => {
    if (!sid) return;
    setLoading(true);
    setLoadErr(false);
    try {
      const { data } = await api.get('/chat/logs', { params: { shop_id: sid, channel: ch, page: pg } });
      setLogs(data.rows);
      setTotal(data.total);
    } catch {
      setLoadErr(true);
      flash('Could not load chat logs — server may be starting up. Retry in a moment.', 'err');
    }
    setLoading(false);
  };

  // Auto-load when tab opens
  useEffect(() => { if (firstId) load(firstId, 'all', 1); }, []); // eslint-disable-line

  const onShop = (id) => { setShopId(id); setPage(1); load(id, channel, 1); };
  const onChannel = (ch) => { setChannel(ch); setPage(1); load(shopId, ch, 1); };
  const onPage = (pg) => { setPage(pg); load(shopId, channel, pg); };

  const exportCSV = () => {
    if (!logs.length) return;
    const header = ['Date', 'Time', 'Channel', 'Customer Name', 'Phone', 'Message', 'AI Reply'];
    const rows = logs.map(l => {
      const d = new Date(l.created_at);
      return [
        d.toLocaleDateString('en-IN'),
        d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        l.channel === 'whatsapp' ? 'WhatsApp' : 'Web Chat',
        l.customer_name || '-',
        l.customer_phone || '-',
        `"${(l.message || '').replace(/"/g, '""')}"`,
        `"${(l.reply   || '').replace(/"/g, '""')}"`,
      ];
    });
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `chat-logs-${shopId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const perPage = 100;
  const totalPages = Math.ceil(total / perPage);

  const th = { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#888', borderBottom: '2px solid #f0ebe4', whiteSpace: 'nowrap' };
  const td = { padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #f5f5f5', verticalAlign: 'top' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ margin: 0 }}>💬 AI Chat Conversations</h2>
        <button onClick={exportCSV} disabled={!logs.length}
          style={{ padding: '8px 18px', background: logs.length ? '#2e7d32' : '#ccc', color: '#fff', border: 'none', borderRadius: 8, cursor: logs.length ? 'pointer' : 'default', fontWeight: 700, fontSize: 13 }}>
          ⬇ Export CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <select value={shopId} onChange={e => onShop(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, minWidth: 200 }}>
          <option value="">— Select a shop —</option>
          {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={channel} onChange={e => onChannel(e.target.value)}
          style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 }}>
          <option value="all">All Channels</option>
          <option value="web">🌐 Web Chat</option>
          <option value="whatsapp">📱 WhatsApp</option>
        </select>
        {shopId && !loading && <span style={{ alignSelf: 'center', fontSize: 13, color: '#888' }}>{total} conversation{total !== 1 ? 's' : ''}</span>}
      </div>

      {!shopId && <p style={{ color: '#aaa', fontSize: 14 }}>Select a shop to view its chat history.</p>}
      {loading && <p style={{ color: '#aaa' }}>Loading…</p>}

      {loadErr && !loading && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <p style={{ color: '#c62828', marginBottom: 12, fontSize: 14 }}>Could not load — server may be starting up.</p>
          <button onClick={() => load(shopId, channel, page)}
            style={{ padding: '8px 24px', background: '#e65100', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
            Retry
          </button>
        </div>
      )}

      {shopId && !loading && !loadErr && logs.length === 0 && (
        <p style={{ color: '#aaa', fontSize: 14 }}>No chat conversations yet for this shop.</p>
      )}

      {logs.length > 0 && (
        <>
          {/* Desktop: table */}
          <div className="chatlog-table" style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #f0ebe4', background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead style={{ background: '#faf7f3' }}>
                <tr>
                  <th style={th}>Date & Time</th>
                  <th style={th}>Channel</th>
                  <th style={th}>Customer</th>
                  <th style={th}>Phone</th>
                  <th style={th}>Question</th>
                  <th style={th}>AI Reply</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id} style={{ transition: 'background .1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fdf9f5'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: '#888', fontSize: 12 }}>
                      {new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}<br />
                      {new Date(l.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={td}>
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                        background: l.channel === 'whatsapp' ? '#e8f5e9' : '#e3f2fd',
                        color: l.channel === 'whatsapp' ? '#2e7d32' : '#1565c0' }}>
                        {l.channel === 'whatsapp' ? '📱 WhatsApp' : '🌐 Web'}
                      </span>
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{l.customer_name || <span style={{ color: '#bbb' }}>Anonymous</span>}</td>
                    <td style={{ ...td, color: '#555', fontSize: 12 }}>{l.customer_phone || <span style={{ color: '#bbb' }}>—</span>}</td>
                    <td style={{ ...td, maxWidth: 260 }}>
                      <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {l.message}
                      </div>
                    </td>
                    <td style={{ ...td, maxWidth: 260, color: '#444' }}>
                      <div style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {l.reply || <span style={{ color: '#bbb' }}>No reply</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards */}
          <div className="chatlog-cards">
            {logs.map(l => (
              <div key={l.id} className="chatlog-card">
                <div className="clc-top">
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    background: l.channel === 'whatsapp' ? '#e8f5e9' : '#e3f2fd',
                    color: l.channel === 'whatsapp' ? '#2e7d32' : '#1565c0' }}>
                    {l.channel === 'whatsapp' ? '📱 WhatsApp' : '🌐 Web'}
                  </span>
                  <span className="clc-date">
                    {new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, {new Date(l.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="clc-cust">
                  {l.customer_name || 'Anonymous'}
                  {l.customer_phone && <span style={{ color: '#888', fontWeight: 400 }}> · {l.customer_phone}</span>}
                </div>
                <div className="clc-q"><b>Q:</b>{l.message}</div>
                <div className="clc-a"><b>AI:</b>{l.reply || 'No reply'}</div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button onClick={() => onPage(page - 1)} disabled={page <= 1}
                style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #ddd', background: page <= 1 ? '#f5f5f5' : '#fff', cursor: page <= 1 ? 'default' : 'pointer' }}>← Prev</button>
              <span style={{ alignSelf: 'center', fontSize: 13, color: '#888' }}>Page {page} of {totalPages}</span>
              <button onClick={() => onPage(page + 1)} disabled={page >= totalPages}
                style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #ddd', background: page >= totalPages ? '#f5f5f5' : '#fff', cursor: page >= totalPages ? 'default' : 'pointer' }}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ShopDashboard() {
  const [tab, setTab]             = useState('shops');
  const [shops, setShops]         = useState([]);
  const [offers, setOffers]       = useState([]);
  const [qrMap, setQrMap]         = useState({});
  const [siteStats, setSiteStats] = useState(null);
  const [selectedShop, setSelectedShop] = useState('');
  const [shopForm, setShopForm]   = useState({ name:'', description:'', category:'Food', address:'', city:'', area:'', pin_code:'', lng:'', lat:'' });
  const [shopImageFile, setShopImageFile] = useState(null);
  const [shopImagePreview, setShopImagePreview] = useState(null);
  const [locDetecting, setLocDetecting] = useState(false);
  const [locAddress, setLocAddress]     = useState('');
  const [openQR, setOpenQR]             = useState(null); // shopId whose QR is shown
  const shopImageRef = useRef();
  const [editingOfferId, setEditingOfferId] = useState(null);
  const [msg, setMsg]             = useState('');
  const [msgType, setMsgType]     = useState('ok');   // 'ok' | 'err'

  // Campaign / WhatsApp state
  const [showWaDev, setShowWaDev]         = useState(false); // WhatsApp section collapsed as 'under development'
  const [waStatus, setWaStatus]           = useState({ status: 'disconnected', qr: null, contacts: 0 });
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [campHistory, setCampHistory]     = useState([]);
  const [campMsg, setCampMsg]             = useState('');
  const [campOfferId, setCampOfferId]     = useState('');
  const [campLoading, setCampLoading]     = useState(false);
  const [campOffers, setCampOffers]       = useState([]);
  const [campOffersLoading, setCampOffersLoading] = useState(false);
  const [campShopId, setCampShopId]       = useState('');
  const [sendMode, setSendMode]           = useState('all');
  const [allContacts, setAllContacts]     = useState([]);
  const [selectedPhones, setSelectedPhones] = useState(new Set());
  const [contactSearch, setContactSearch] = useState('');
  const [contactsLoading, setContactsLoading] = useState(false);
  const [allGroups, setAllGroups]         = useState([]);
  const [selectedGroups, setSelectedGroups] = useState(new Set());
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [pickerTab, setPickerTab]         = useState('contacts'); // 'contacts' | 'groups'
  const [savedGroup, setSavedGroup]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('wa_contact_group') || 'null') || { phones:[], names:{}, groups:[] }; }
    catch { return { phones:[], names:{}, groups:[] }; }
  });
  const [showGroupEdit, setShowGroupEdit] = useState(false);
  const waTimer   = useRef(null);
  const campTimer = useRef(null);

  // Pairing code state (connect WhatsApp on same phone without scanning QR)
  const [pairPhone, setPairPhone]         = useState('');
  const [pairingCode, setPairingCode]     = useState('');
  const [pairLoading, setPairLoading]     = useState(false);
  const [pairCountdown, setPairCountdown] = useState(0);

  useEffect(() => {
    api.get('/shops/owner/mine').then(r => setShops(r.data)).catch(() => {});
    api.get('/visitors/count').then(r => setSiteStats(r.data)).catch(() => {});
  }, []);

  // Auto-select first shop as default (user can change if they have multiple)
  useEffect(() => {
    if (shops.length > 0 && !selectedShop) setSelectedShop(String(shops[0].id));
  }, [shops]);

  useEffect(() => {
    if (selectedShop) api.get(`/offers/shop/${selectedShop}`).then(r => setOffers(r.data)).catch(() => {});
  }, [selectedShop]);

  // Load offers for selected shop on demand
  useEffect(() => {
    if (!campShopId) { setCampOffers([]); return; }
    setCampOffersLoading(true);
    api.get(`/offers/shop/${campShopId}`)
      .then(r => setCampOffers(r.data))
      .catch(() => setCampOffers([]))
      .finally(() => setCampOffersLoading(false));
  }, [campShopId]);

  // Auto-select first shop and always refresh offers when tab opens
  useEffect(() => {
    if (tab !== 'offers') return;
    if (!selectedShop && shops.length > 0) {
      setSelectedShop(String(shops[0].id));
    } else if (selectedShop) {
      api.get(`/offers/shop/${selectedShop}`).then(r => setOffers(r.data)).catch(() => {});
    }
  }, [tab]);

  // Auto-detect location when Add Shop tab opens (if not already set)
  useEffect(() => {
    if (tab === 'add-shop' && !shopForm.lat) getLocation(true);
  }, [tab]);

  // Poll WhatsApp status when on campaign tab
  useEffect(() => {
    if (tab !== 'campaign') { clearInterval(waTimer.current); return; }
    const poll = () => api.get('/campaigns/whatsapp/status').then(r => setWaStatus(r.data)).catch(() => {});
    poll();
    waTimer.current = setInterval(poll, 3000);
    api.get('/campaigns').then(r => setCampHistory(r.data)).catch(() => {});
    return () => clearInterval(waTimer.current);
  }, [tab]);

  // Poll active campaign progress every 4 sec
  useEffect(() => {
    if (!activeCampaign?.id || ['completed','stopped','failed'].includes(activeCampaign.status)) {
      clearInterval(campTimer.current); return;
    }
    campTimer.current = setInterval(() =>
      api.get(`/campaigns/${activeCampaign.id}`)
        .then(r => setActiveCampaign(r.data)).catch(() => {}),
    4000);
    return () => clearInterval(campTimer.current);
  }, [activeCampaign?.id, activeCampaign?.status]);

  const flash = (m, type = 'ok') => { setMsg(m); setMsgType(type); setTimeout(() => setMsg(''), 5000); };

  // Reset pairing state when WhatsApp connects or disconnects
  useEffect(() => {
    if (waStatus.status === 'connected' || waStatus.status === 'disconnected') {
      setPairingCode(''); setPairPhone(''); setPairCountdown(0);
    }
  }, [waStatus.status]);

  const getPairingCode = async () => {
    setPairLoading(true);
    setPairingCode('');
    setPairCountdown(0);
    try {
      const { data } = await api.post('/campaigns/whatsapp/connect-pairing', { phone: pairPhone.replace(/\D/g, '') });
      setPairingCode(data.code);
      setPairCountdown(60);
    } catch (err) {
      flash(err.response?.data?.message || 'Could not get pairing code', 'err');
    } finally { setPairLoading(false); }
  };

  // 60-second countdown after pairing code is received
  useEffect(() => {
    if (!pairingCode || pairCountdown <= 0) return;
    const t = setTimeout(() => setPairCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [pairingCode, pairCountdown]);

  const resetOffer = () => setEditingOfferId(null);

  const startEdit = (offer) => {
    setEditingOfferId(offer.id);
    setTab('add-offer');
  };

  const toggleActive = async (offer) => {
    try {
      const { data } = await api.put(`/offers/${offer.id}`, { is_active: !offer.is_active });
      setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, is_active: data.is_active } : o));
    } catch { flash('Error toggling offer', 'err'); }
  };

  const deleteOffer = async (id) => {
    if (!window.confirm('Delete this offer?')) return;
    try { await api.delete(`/offers/${id}`); setOffers(prev => prev.filter(o => o.id !== id)); flash('Offer deleted.'); }
    catch { flash('Error deleting offer', 'err'); }
  };

  const getLocation = (silent = false) => {
    if (!navigator.geolocation) { if (!silent) flash('Geolocation not supported by your browser', 'err'); return; }
    setLocDetecting(true);
    setLocAddress('');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const lat = coords.latitude.toFixed(6);
        const lng = coords.longitude.toFixed(6);
        setShopForm(f => ({ ...f, lat, lng }));
        setLocDetecting(false);
        // Reverse geocode to show human-readable address
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const d = await r.json();
          setLocAddress(d.display_name || `${lat}, ${lng}`);
        } catch { setLocAddress(`${lat}, ${lng}`); }
      },
      (err) => {
        setLocDetecting(false);
        if (!silent) flash('Could not detect location. Please enter manually.', 'err');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const qrImgUrl = (pageUrl) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(pageUrl)}&margin=12&color=1a1a1a&bgcolor=ffffff`;

  const downloadQR = async (pageUrl, shopName) => {
    try {
      const res = await fetch(qrImgUrl(pageUrl));
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${shopName.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
      a.click();
    } catch { flash('Could not download QR. Try right-click → Save image.', 'err'); }
  };

  const shopUrl = (s) => {
    if (!s) return '';
    const area = ((s.area || s.city || '')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return area ? `/${area}/${s.slug}` : `/shop/${s.slug}`;
  };

  const buildWAMessage = (offer) => {
    const shop = shops.find(s => s.id === (offer?.shop_id));
    const validDate = offer?.valid_until
      ? new Date(offer.valid_until).toLocaleDateString('en-IN', { day:'numeric', month:'short' }) : '';
    return `🔥 *${offer?.title}* — ${offer?.discount}% OFF!\n💰 ₹${fmt(offer?.offer_price)} (was ₹${fmt(offer?.original_price)})\n📍 ${shop?.name || ''}, ${shop?.city || ''}\n⏰ Valid till ${validDate}\n\n👉 ${window.location.origin}${shopUrl(shop)}`;
  };

  const loadAllContacts = async () => {
    setContactsLoading(true);
    try {
      const { data } = await api.get('/campaigns/whatsapp/contacts?all=1');
      setAllContacts(data.list || []);
    } catch { flash('Could not load contacts', 'err'); }
    finally { setContactsLoading(false); }
  };

  const loadGroups = async () => {
    setGroupsLoading(true);
    try {
      const { data } = await api.get('/campaigns/whatsapp/groups');
      setAllGroups(data || []);
    } catch { flash('Could not load groups', 'err'); }
    finally { setGroupsLoading(false); }
  };

  const togglePhone = (phone, checked) => {
    setSelectedPhones(prev => {
      const next = new Set(prev);
      checked ? next.add(phone) : next.delete(phone);
      return next;
    });
  };

  const toggleGroup = (jid, checked) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      checked ? next.add(jid) : next.delete(jid);
      return next;
    });
  };

  const saveContactGroup = () => {
    const names = {};
    [...selectedPhones].forEach(p => { names[p] = allContacts.find(c => c.phone === p)?.name || ''; });
    const groups = [...selectedGroups].map(jid => ({
      jid, name: allGroups.find(g => g.jid === jid)?.name || 'Group'
    }));
    const group = { phones: [...selectedPhones], names, groups };
    localStorage.setItem('wa_contact_group', JSON.stringify(group));
    setSavedGroup(group);
    setShowGroupEdit(false);
  };

  const startCampaign = async () => {
    if (!campMsg.trim()) { flash('Please write a message first', 'err'); return; }
    setCampLoading(true);
    try {
      const offerId = campOfferId ? Number(campOfferId) : null;
      const shopId  = offerId ? offers.find(o => o.id === offerId)?.shop_id : null;
      const payload = { offer_id: offerId, shop_id: shopId, message: campMsg };
      // Merge individual contact phones + group JIDs into one recipient list
      const groupJids = (savedGroup.groups || []).map(g => g.jid);
      const allRecipients = [...savedGroup.phones, ...groupJids];
      if (allRecipients.length > 0) payload.selected_phones = allRecipients;
      const { data } = await api.post('/campaigns', payload);
      setActiveCampaign(data);
      setCampHistory(h => [data, ...h]);
    } catch (err) {
      flash(err.response?.data?.message || 'Could not start campaign', 'err');
    } finally { setCampLoading(false); }
  };

  const pauseCampaign  = (id) => api.post(`/campaigns/${id}/pause`).then(() => setActiveCampaign(a => ({...a, status:'paused'})));
  const resumeCampaign = (id) => api.post(`/campaigns/${id}/resume`).then(() => setActiveCampaign(a => ({...a, status:'running'})));
  const stopCampaign   = (id) => { if (window.confirm('Stop this campaign?')) api.post(`/campaigns/${id}/stop`).then(() => setActiveCampaign(a => ({...a, status:'stopped'}))); };

  const WA_STATUS_LABEL = { disconnected:'Disconnected', connecting:'Connecting…', waiting_scan:'Scan QR Code', connected:'Connected ✅', reconnecting:'Reconnecting…', unavailable:'Not available on this server', error:'Error' };
  const WA_STATUS_COLOR = { disconnected:'#888', connecting:'#f57c00', waiting_scan:'#1565c0', connected:'#2e7d32', reconnecting:'#f57c00', unavailable:'#c62828', error:'#c62828' };

  return (
    <div className="page sd-pg">
      <div className="sd-header">
        <span className="sd-header-icon">🏪</span>
        <div>
          <div className="sd-header-name">Shop Dashboard</div>
          <div className="sd-header-sub">{shops.length} shop{shops.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div className="dashboard">

        <aside className="sidebar">
          <h3>Menu</h3>
          {[
            ['shops',    '🏪 My Shops'],
            ['add-shop', '➕ Add Shop'],
            ['catalog',  '📋 Catalog'],
            ['offers',   '🏷 My Offers'],
            ['add-offer', editingOfferId ? '✏️ Edit Offer' : '➕ Add Offer'],
            ['campaign', '📣 Campaign'],
            ['chat-logs','💬 Chat Logs']
          ].map(([t, label]) => (
            <button key={t} className={tab === t ? 'active' : ''}
              onClick={() => { if (t !== 'add-offer') resetOffer(); setTab(t); }}>
              {label}
              {t === 'campaign' && waStatus.status === 'connected' && (
                <span style={{ marginLeft:6, background:'#25D366', color:'#fff', borderRadius:10, padding:'1px 6px', fontSize:11 }}>ON</span>
              )}
            </button>
          ))}
        </aside>

        <div className="panel">
          {msg && (
            <p style={{ color: msgType==='err' ? '#c62828' : '#2e7d32',
                        background: msgType==='err' ? '#ffebee' : '#e8f5e9',
                        padding:'10px 14px', borderRadius:8, marginBottom:16 }}>
              {msg}
            </p>
          )}

          {/* ── My Shops ── */}
          {tab === 'shops' && (
            <>
              <h2>My Shops</h2>
              {shops.length === 0
                ? <p style={{ color:'#888' }}>No shops yet. Click "Add Shop".</p>
                : shops.map(s => {
                  const link = `${window.location.origin}${shopUrl(s)}`;
                  return (
                    <div key={s.id} style={{ background:'#fff', borderRadius:12, padding:20, marginBottom:16, boxShadow:'0 2px 8px rgba(0,0,0,.07)', border:'1px solid #f0e6d6' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8, alignItems:'flex-start' }}>
                        <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                          {s.image
                            ? <img src={s.image} alt="" style={{ width:60, height:60, objectFit:'cover', borderRadius:10, flexShrink:0 }} />
                            : <div style={{ width:60, height:60, background:'#ffe0b2', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>🏪</div>
                          }
                          <div>
                            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                              <h3 style={{ margin:'0 0 4px', color:'#e65100' }}>{s.name}</h3>
                              {s.status === 'pending' && (
                                <span style={{ background:'#fff3e0', color:'#e65100', border:'1px solid #ffcc80', borderRadius:12, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                                  ⏳ Pending BDO Approval
                                </span>
                              )}
                              {s.status === 'rejected' && (
                                <span style={{ background:'#ffebee', color:'#c62828', border:'1px solid #ef9a9a', borderRadius:12, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                                  ❌ Rejected{s.rejection_reason ? ` — ${s.rejection_reason}` : ''}
                                </span>
                              )}
                              {s.status === 'approved' && (
                                <span style={{ background:'#e8f5e9', color:'#2e7d32', border:'1px solid #a5d6a7', borderRadius:12, padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                                  ✅ Live
                                </span>
                              )}
                            </div>
                            <p style={{ margin:0, color:'#888', fontSize:13 }}>{s.address} · {s.city}{s.pin_code ? ` – ${s.pin_code}` : ''} · {s.category}</p>
                            <p style={{ margin:'4px 0 0', fontSize:12, color:'#7b1fa2', fontWeight:600 }}>🏪 {(s.views||0).toLocaleString('en-IN')} shop views</p>
                          </div>
                        </div>
                        <a href={shopUrl(s)} target="_blank" rel="noreferrer"
                          style={{ padding:'6px 14px', background:'#e65100', color:'#fff', borderRadius:8, fontSize:13, textDecoration:'none', fontWeight:600 }}>
                          🔗 View Page
                        </a>
                      </div>
                      {/* Location pin row */}
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:10, flexWrap:'wrap' }}>
                        {s.lat && s.lng ? (
                          <span style={{ fontSize:12, color:'#2e7d32', background:'#e8f5e9', borderRadius:8, padding:'4px 10px', fontWeight:600 }}>
                            📍 Location set — customers will get proximity alerts
                          </span>
                        ) : (
                          <span style={{ fontSize:12, color:'#e65100', background:'#fff3e0', borderRadius:8, padding:'4px 10px', fontWeight:600 }}>
                            ⚠️ No location — customers won't get nearby alerts
                          </span>
                        )}
                        <button onClick={async () => {
                          if (!navigator.geolocation) { flash('Geolocation not supported', 'err'); return; }
                          flash('📍 Detecting your location…');
                          navigator.geolocation.getCurrentPosition(async ({ coords }) => {
                            try {
                              await api.put(`/shops/${s.id}/location`, { lat: coords.latitude, lng: coords.longitude });
                              setShops(prev => prev.map(x => x.id === s.id ? { ...x, lat: coords.latitude, lng: coords.longitude } : x));
                              flash('✅ Shop location saved! Proximity alerts are now active.');
                            } catch { flash('Failed to save location', 'err'); }
                          }, () => flash('Could not detect location. Allow location access and try again.', 'err'),
                          { enableHighAccuracy: true, timeout: 10000 });
                        }}
                          style={{ padding:'6px 14px', background:'#1565c0', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:600 }}>
                          {s.lat ? '🔄 Update Location' : '📍 Set My Shop Location'}
                        </button>
                      </div>

                      <div className="shop-share-row" style={{ background:'#fff8f0', border:'1px solid #ffe0b2', borderRadius:8, padding:'10px 14px', marginTop:10, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                        <span style={{ fontSize:13, color:'#555', flex:1, wordBreak:'break-all', minWidth:0 }}>📲 <span style={{ color:'#e65100' }}>{link}</span></span>
                        <button onClick={() => { navigator.clipboard.writeText(link); flash('Link copied!'); }}
                          style={{ padding:'8px 16px', background:'#e65100', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600 }}>📋 Copy</button>
                        <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`🛍️ *${s.name}* on OfferCity!\n📍 ${s.address}, ${s.city}${s.pin_code ? ' – ' + s.pin_code : ''}\n👉 ${link}`)}`, '_blank')}
                          style={{ padding:'8px 16px', background:'#25D366', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600 }}>💬 WhatsApp</button>
                      </div>

                      {/* QR Code section */}
                      <div style={{ marginTop:10 }}>
                        {!qrMap[s.id] ? (
                          <button onClick={async () => {
                            try {
                              const { data } = await api.get(`/shops/${s.id}/qrcode`);
                              setQrMap(prev => ({ ...prev, [s.id]: data.dataUrl }));
                            } catch { flash('Could not generate QR code', 'err'); }
                          }} style={{ padding:'8px 16px', background:'#4a148c', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600 }}>
                            📷 Get QR Code
                          </button>
                        ) : (
                          <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', background:'#f3e5f5', border:'1px solid #ce93d8', borderRadius:8, padding:'12px 16px' }}>
                            <img src={qrMap[s.id]} alt="Shop QR Code" style={{ width:110, height:110, borderRadius:6, background:'#fff', padding:4 }} />
                            <div>
                              <p style={{ margin:'0 0 8px', fontSize:13, color:'#555' }}>
                                Print this QR and stick it at your shop.<br />
                                Customers scan it to view your offers.
                              </p>
                              <a href={qrMap[s.id]} download={`${s.name}-qr.png`}
                                style={{ padding:'8px 16px', background:'#4a148c', color:'#fff', borderRadius:6, fontSize:13, fontWeight:600, textDecoration:'none', display:'inline-block' }}>
                                ⬇️ Download PNG
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              }
            </>
          )}

          {/* ── Add Shop ── */}
          {tab === 'add-shop' && (
            <>
              <h2>Register a Shop</h2>
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const fd = new FormData();
                  Object.entries(shopForm).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) fd.append(k, v); });
                  if (shopImageFile) fd.append('image', shopImageFile, 'shop.jpg');
                  const { data } = await api.post('/shops', fd);
                  setShops(p => [...p, data]);
                  flash('Shop registered! Your shop page is now live.');
                  setShopForm({ name:'', description:'', category:'Food', address:'', city:'', area:'', pin_code:'', lng:'', lat:'' });
                  setShopImageFile(null);
                  setShopImagePreview(null);
                } catch (err) { flash(err.response?.data?.message || 'Error', 'err'); }
              }}>

                {/* Shop Photo */}
                <div className="form-group">
                  <label>Shop / Business Photo</label>
                  {shopImagePreview
                    ? (
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
                        <img src={shopImagePreview} alt="" style={{ width:80, height:70, objectFit:'cover', borderRadius:10, border:'2px solid #e65100' }} />
                        <button type="button" onClick={() => { setShopImageFile(null); setShopImagePreview(null); }}
                          style={{ padding:'6px 12px', background:'#eee', border:'none', borderRadius:6, cursor:'pointer', fontSize:13 }}>🗑 Remove</button>
                      </div>
                    )
                    : (
                      <div style={{ border:'2px dashed #ffb74d', borderRadius:10, padding:'18px', textAlign:'center', cursor:'pointer', background:'#fff8f0', marginBottom:8 }}
                        onClick={() => shopImageRef.current?.click()}>
                        <div style={{ fontSize:32 }}>📸</div>
                        <p style={{ margin:'4px 0 0', fontSize:13, color:'#e65100' }}>Tap to add shop photo</p>
                      </div>
                    )
                  }
                  <input ref={shopImageRef} type="file" accept="image/*" style={{ display:'none' }}
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const compressed = await compressImage(file);
                      setShopImageFile(compressed);
                      setShopImagePreview(URL.createObjectURL(compressed));
                    }} />
                </div>

                {[['name','Shop / Business Name',true],['description','Description (what you sell)',false],['address','Full Address',true]].map(([k,l,req]) => (
                  <div className="form-group" key={k}>
                    <label>{l}</label>
                    <input value={shopForm[k]} onChange={e => setShopForm({ ...shopForm, [k]: e.target.value })} required={req} />
                  </div>
                ))}

                <div style={{ display:'flex', gap:10 }}>
                  <div className="form-group" style={{ flex:2 }}>
                    <label>City / Village *</label>
                    <input value={shopForm.city} onChange={e => setShopForm({ ...shopForm, city: e.target.value })} required placeholder="e.g. Hyderabad" />
                  </div>
                  <div className="form-group" style={{ flex:2 }}>
                    <label>District / Area *</label>
                    <input value={shopForm.area} onChange={e => setShopForm({ ...shopForm, area: e.target.value })} required placeholder="e.g. Kompally, Secunderabad" />
                  </div>
                  <div className="form-group" style={{ flex:1 }}>
                    <label>PIN Code *</label>
                    <input value={shopForm.pin_code} onChange={e => setShopForm({ ...shopForm, pin_code: e.target.value })} required placeholder="500001" maxLength={6} pattern="\d{6}" title="6-digit PIN code" />
                  </div>
                </div>

                <div className="form-group">
                  <label>Category</label>
                  <select value={shopForm.category} onChange={e => setShopForm({ ...shopForm, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                {/* Location */}
                <div style={{ background: shopForm.lat ? '#e8f5e9' : '#fff3e0', border: `2px solid ${shopForm.lat ? '#66bb6a' : '#ffb74d'}`, borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: shopForm.lat ? 8 : 0 }}>
                    <span style={{ fontWeight:600, fontSize:14, color: shopForm.lat ? '#2e7d32' : '#e65100' }}>
                      {locDetecting ? '⏳ Detecting location…' : shopForm.lat ? '📍 Location detected' : '📍 Location required *'}
                    </span>
                    <button type="button" onClick={() => getLocation(false)}
                      style={{ padding:'6px 14px', background:'#1565c0', color:'#fff', border:'none', borderRadius:7, cursor:'pointer', fontSize:13, fontWeight:600 }}>
                      {locDetecting ? 'Detecting…' : shopForm.lat ? '🔄 Re-detect' : '📍 Detect Location'}
                    </button>
                  </div>
                  {locAddress && <p style={{ margin:'4px 0 8px', fontSize:12, color:'#555' }}>{locAddress}</p>}
                  {shopForm.lat && (
                    <div style={{ display:'flex', gap:10 }}>
                      <div className="form-group" style={{ flex:1, marginBottom:0 }}>
                        <label style={{ fontSize:12 }}>Longitude (editable)</label>
                        <input value={shopForm.lng} onChange={e => setShopForm({ ...shopForm, lng: e.target.value })} required placeholder="78.4867" style={{ marginBottom:0 }} />
                      </div>
                      <div className="form-group" style={{ flex:1, marginBottom:0 }}>
                        <label style={{ fontSize:12 }}>Latitude (editable)</label>
                        <input value={shopForm.lat} onChange={e => setShopForm({ ...shopForm, lat: e.target.value })} required placeholder="17.3850" style={{ marginBottom:0 }} />
                      </div>
                    </div>
                  )}
                </div>
                <button className="btn-primary" type="submit" disabled={!shopForm.lat || locDetecting}>
                  {!shopForm.lat ? '📍 Detect Location First' : 'Register Shop'}
                </button>
              </form>
            </>
          )}

          {/* ── Catalog ── */}
          {tab === 'catalog' && (
            <CatalogTab shops={shops} flash={flash} />
          )}

          {/* ── My Offers ── */}
          {tab === 'offers' && (
            <>
              <h2>My Offers</h2>

              {/* Stats summary */}
              <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
                {[
                  ['🏪 Shop Page Views',  shops.find(s => String(s.id) === selectedShop)?.views ?? 0,            '#7b1fa2', '#f3e5f5'],
                  ['👁 Offer Views',       offers.reduce((s, o) => s + (o.views || 0), 0),                        '#e65100', '#fff3e0'],
                  ['📊 Total App Views',   siteStats?.visits ?? '—',                                               '#2e7d32', '#e8f5e9'],
                ].map(([label, val, color, bg]) => (
                  <div key={label} style={{ flex:1, minWidth:120, background:bg, border:`1px solid ${color}22`, borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:22, fontWeight:800, color }}>{typeof val === 'number' ? val.toLocaleString('en-IN') : val}</div>
                    <div style={{ fontSize:11, color:'#666', marginTop:2 }}>{label}</div>
                  </div>
                ))}
              </div>

              <div className="form-group" style={{ marginBottom:16 }}>
                <select value={selectedShop} onChange={e => setSelectedShop(e.target.value)}>
                  <option value="">— Select a shop —</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {!selectedShop ? <p style={{ color:'#888' }}>Select a shop to see offers.</p>
                : offers.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'32px 16px' }}>
                    <div style={{ fontSize:40, marginBottom:8 }}>🏷</div>
                    <p style={{ fontSize:15, color:'#888', marginBottom:4 }}>No offers yet</p>
                    <p style={{ fontSize:13, color:'#bbb' }}>Tap <strong>Add Offer</strong> to post your first deal</p>
                  </div>
                )
                : (
                  <>
                    {/* Desktop table */}
                    <div className="table-scroll sd-offers-table"><table className="data-table">
                      <thead><tr><th>Photo</th><th>Title</th><th>Discount</th><th>Price</th><th>Valid</th><th>Status</th><th>Views</th><th></th></tr></thead>
                      <tbody>
                        {offers.map(o => (
                          <tr key={o.id}>
                            <td>{o.image ? <img src={o.image} alt="" style={{ width:44, height:38, objectFit:'cover', borderRadius:6 }} /> : <span>📷</span>}</td>
                            <td><strong>{o.title}</strong></td>
                            <td style={{ color:'#e65100', fontWeight:700 }}>{o.discount}% OFF</td>
                            <td>
                              {o.original_price && <span style={{ textDecoration:'line-through', color:'#aaa', fontSize:12 }}>₹{fmt(o.original_price)}</span>}
                              {o.offer_price && <span style={{ color:'#2e7d32', fontWeight:600, marginLeft:4 }}>₹{fmt(o.offer_price)}</span>}
                            </td>
                            <td style={{ fontSize:12 }}>{o.valid_until ? new Date(o.valid_until).toLocaleDateString('en-IN') : '—'}</td>
                            <td><span className={`tag ${o.is_active ? 'green' : 'red'}`}>{o.is_active ? 'Active' : 'Off'}</span></td>
                            <td>👁 {o.views||0}</td>
                            <td style={{ whiteSpace:'nowrap' }}>
                              <button onClick={() => startEdit(o)} style={{ color:'#1565c0', background:'none', border:'none', cursor:'pointer', marginRight:6 }}>✏️</button>
                              <button onClick={() => toggleActive(o)} style={{ color: o.is_active?'#e65100':'#2e7d32', background:'none', border:'none', cursor:'pointer', marginRight:6 }}>{o.is_active?'⏸':'▶️'}</button>
                              <button onClick={() => deleteOffer(o.id)} style={{ color:'#c62828', background:'none', border:'none', cursor:'pointer' }}>🗑</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>

                    {/* Mobile cards */}
                    <div className="sd-offer-cards">
                      {offers.map(o => (
                        <div key={o.id} className="sd-oc">
                          <div className="sd-oc-img">
                            {o.image ? <img src={o.image} alt="" /> : <span>📷</span>}
                            <span className={`sd-oc-badge ${o.is_active ? 'live' : 'off'}`}>
                              {o.is_active ? 'Live' : 'Off'}
                            </span>
                          </div>
                          <div className="sd-oc-body">
                            <div className="sd-oc-title">{o.title}</div>
                            <div className="sd-oc-price-row">
                              <span className="sd-oc-pct">{o.discount}% OFF</span>
                              {o.offer_price && <span className="sd-oc-final">₹{fmt(o.offer_price)}</span>}
                              {o.original_price && <span className="sd-oc-orig">₹{fmt(o.original_price)}</span>}
                            </div>
                            <div className="sd-oc-foot">
                              {o.valid_until ? `⏰ Till ${new Date(o.valid_until).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}` : ''}&nbsp;· 👁 {o.views||0}
                            </div>
                          </div>
                          <div className="sd-oc-acts">
                            <button onClick={() => startEdit(o)} title="Edit">✏️</button>
                            <button onClick={() => toggleActive(o)} title={o.is_active?'Deactivate':'Activate'}>{o.is_active?'⏸':'▶️'}</button>
                            <button onClick={() => deleteOffer(o.id)} className="sd-del" title="Delete">🗑</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )
              }
            </>
          )}

          {/* ── Add / Edit Offer ── */}
          {tab === 'add-offer' && (
            <OfferForm
              key={editingOfferId ? `edit-${editingOfferId}` : 'new'}
              shops={shops}
              editingOffer={editingOfferId ? offers.find(o => o.id === editingOfferId) : null}
              flash={flash}
              onCreated={(offer) => setOffers(prev => [...prev, offer])}
              onUpdated={(offer) => {
                setOffers(prev => prev.map(o => o.id === offer.id ? offer : o));
                flash('✅ Offer updated successfully!');
                setEditingOfferId(null);
                setTab('offers');
              }}
              onCancel={() => { if (editingOfferId) { setEditingOfferId(null); setTab('offers'); } }}
              onViewOffers={(offer) => { setSelectedShop(String(offer.shop_id)); setTab('offers'); }}
              onSendCampaign={(offer) => { setCampOfferId(String(offer.id)); setCampMsg(buildWAMessage(offer)); setTab('campaign'); }}
            />
          )}
          {/* ── Campaign Tab ── */}
          {tab === 'campaign' && (
            <>
              <h2>📣 Campaigns</h2>

              {/* SMS is now the primary campaign channel */}
              <SmsCampaign offers={offers} />

              {/* WhatsApp — parked under development; SMS replaced it as primary */}
              <div
                onClick={() => setShowWaDev(s => !s)}
                style={{ background:'#f7f7f7', border:'1px dashed #ccc', borderRadius:12, padding:'13px 16px',
                  display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer', marginBottom:14 }}>
                <div>
                  <span style={{ fontWeight:700, color:'#777' }}>💬 WhatsApp Campaign</span>
                  <span style={{ fontSize:11, background:'#fff3cd', color:'#7a5700', padding:'3px 10px', borderRadius:12, fontWeight:600, marginLeft:10 }}>🚧 UNDER DEVELOPMENT</span>
                </div>
                <span style={{ color:'#aaa', fontSize:16 }}>{showWaDev ? '▲' : '▼'}</span>
              </div>

              {showWaDev && (<>
              {/* WhatsApp Connection Card */}
              <div className="wa-connect-card">

                {/* Status + action row */}
                <div className="wa-status-row">
                  <span className="wa-icon">💬</span>
                  <div>
                    <div className="wa-status-label" style={{ color: WA_STATUS_COLOR[waStatus.status] || '#888' }}>
                      {pairLoading ? 'Connecting…' : (WA_STATUS_LABEL[waStatus.status] || waStatus.status)}
                    </div>
                    {waStatus.contacts > 0 && (
                      <div className="wa-contacts-count">👥 {waStatus.contacts} contacts ready</div>
                    )}
                  </div>
                  <div className="wa-connect-btn-wrap">
                    {waStatus.status === 'connected'
                      ? <button className="wa-btn-disconnect" onClick={() => api.post('/campaigns/whatsapp/disconnect').then(() => setWaStatus({ status:'disconnected', qr:null, contacts:0 }))}>Disconnect</button>
                      : !pairLoading && !pairingCode && (
                          <button className="wa-btn-connect"
                            onClick={async () => {
                              try { await api.post('/campaigns/whatsapp/connect'); }
                              catch (err) { flash(err.response?.data?.message || 'Could not connect WhatsApp', 'err'); }
                            }}
                            disabled={['connecting','waiting_scan','reconnecting'].includes(waStatus.status)}>
                            {waStatus.status === 'waiting_scan' ? 'Scan QR…'
                              : waStatus.status === 'reconnecting' ? 'Reconnecting…'
                              : waStatus.status === 'connecting' ? 'Generating QR…'
                              : '🔗 Connect WhatsApp'}
                          </button>
                        )
                    }
                  </div>
                </div>

                {/* QR code — hide when pairing code flow is active */}
                {waStatus.qr && !pairLoading && !pairingCode && (
                  <div className="wa-qr-wrap">
                    <p style={{ color:'#555', marginBottom:8 }}>Open WhatsApp → ⋮ → Linked Devices → Link a Device → Scan this code</p>
                    <img src={waStatus.qr} alt="WhatsApp QR" className="wa-qr-img" />
                    <p style={{ color:'#aaa', fontSize:12, marginTop:6 }}>QR refreshes every 30 seconds</p>
                  </div>
                )}

                {/* Pairing code section — hide only when connected or auto-reconnecting */}
                {!['connected','reconnecting'].includes(waStatus.status) && (
                  <div className="wa-pair-section">

                    {/* Input — shown when no active code and not loading */}
                    {!pairLoading && !pairingCode && (
                      <>
                        {waStatus.status === 'connecting' && (
                          <div style={{ textAlign:'center', padding:'12px 0 4px', color:'#f57c00', fontSize:13 }}>
                            <div className="opt-spinner" style={{ margin:'0 auto 8px', width:22, height:22 }} />
                            Generating QR code… (5–15 sec)
                          </div>
                        )}
                        <div className="wa-pair-divider"><span>connect on this phone</span></div>
                        <div className="wa-pair-input-row">
                          <input value={pairPhone} onChange={e => setPairPhone(e.target.value.replace(/\D/g, ''))}
                            placeholder="WhatsApp number with country code — e.g. 919876543210" type="tel"
                            inputMode="numeric" />
                          <button onClick={getPairingCode} disabled={!pairPhone.trim() || pairPhone.length < 10}>
                            Get Code →
                          </button>
                        </div>
                        <p style={{ fontSize:11, color:'#999', marginTop:4, marginBottom:0 }}>
                          Include country code, no + or spaces. India: 91XXXXXXXXXX
                        </p>
                        <div className="wa-desktop-tip">
                          💻 <strong>Easier on computer:</strong> Open this page on a laptop — scan the QR with your phone in 2 seconds.
                        </div>
                      </>
                    )}

                    {/* Loading spinner */}
                    {pairLoading && (
                      <div style={{ textAlign:'center', padding:'16px 0' }}>
                        <div className="opt-spinner" style={{ margin:'0 auto 10px' }} />
                        <p style={{ color:'#666', fontSize:13 }}>Generating code… (5–10 seconds)</p>
                      </div>
                    )}

                    {/* Code ready */}
                    {pairingCode && (
                      <div className="wa-pair-code-box">
                        <div className="wa-pair-timer" style={{
                          color: pairCountdown < 15 ? '#c62828' : pairCountdown < 30 ? '#f57c00' : '#2e7d32',
                          fontWeight: 700, fontSize: 13, marginBottom: 6
                        }}>
                          {pairCountdown > 0 ? `⏱ ${pairCountdown}s — enter NOW` : '⚠️ Expired — get new code'}
                        </div>
                        <div className="wa-pair-code">
                          {pairingCode.length === 8 ? `${pairingCode.slice(0,4)}-${pairingCode.slice(4)}` : pairingCode}
                        </div>
                        <ol className="wa-pair-steps">
                          <li>Open <strong>WhatsApp</strong> on your phone</li>
                          <li>Tap <strong>⋮</strong> (3 dots, top-right corner)</li>
                          <li>Tap <strong>Linked Devices</strong></li>
                          <li>Tap <strong>Link a Device</strong></li>
                          <li>Below the QR camera, tap <strong style={{color:'#1565c0'}}>"Link with phone number instead"</strong></li>
                          <li>Enter the code above <strong style={{color:'#c62828'}}>within {pairCountdown}s</strong></li>
                        </ol>
                        {pairCountdown === 0
                          ? <button className="wa-pair-regen-btn" onClick={getPairingCode} disabled={pairLoading}>
                              {pairLoading ? '…' : '🔄 Get New Code'}
                            </button>
                          : <button style={{marginTop:8, fontSize:12, padding:'6px 12px'}}
                              onClick={() => { setPairingCode(''); setPairCountdown(0); }}>
                              ✕ Cancel
                            </button>
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ══ CAMPAIGN HUB ══ */}
              {(waStatus.status === 'connected' || waStatus.contacts > 0) && (
                <div className="camp-hub">
                  {['connecting','reconnecting'].includes(waStatus.status) && (
                    <div style={{ background:'#fff3cd', border:'1px solid #ffc107', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:13, color:'#7a5700' }}>
                      ⏳ WhatsApp reconnecting… Your contacts are ready. Wait a moment before sending.
                    </div>
                  )}

                  {/* ── LIVE: sending ── */}
                  {activeCampaign && !['completed','stopped'].includes(activeCampaign.status) && (
                    <div className="camp-live">
                      <div className="camp-live-label">Sending campaign…</div>
                      <div className="camp-live-count">
                        <span className="camp-live-num">{activeCampaign.sent_count}</span>
                        <span className="camp-live-sep"> / </span>
                        <span className="camp-live-tot">{activeCampaign.total_contacts}</span>
                      </div>
                      <div className="camp-live-sublabel">messages sent</div>
                      <div className="camp-bar-bg" style={{ margin:'12px 0 8px' }}>
                        <div className="camp-bar-fill" style={{ width:`${Math.round((activeCampaign.sent_count+activeCampaign.failed_count)/Math.max(activeCampaign.total_contacts,1)*100)}%` }} />
                      </div>
                      {activeCampaign.failed_count > 0 && (
                        <div style={{ fontSize:12, color:'#e53935', marginBottom:8 }}>❌ {activeCampaign.failed_count} failed</div>
                      )}
                      <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                        {activeCampaign.status === 'running'
                          ? <button className="camp-btn-pause" onClick={() => pauseCampaign(activeCampaign.id)}>⏸ Pause</button>
                          : <button className="camp-btn-resume" onClick={() => resumeCampaign(activeCampaign.id)}>▶ Resume</button>
                        }
                        <button className="camp-btn-stop" onClick={() => stopCampaign(activeCampaign.id)}>⏹ Stop</button>
                      </div>
                    </div>
                  )}

                  {/* ── DONE / STOPPED ── */}
                  {activeCampaign && ['completed','stopped'].includes(activeCampaign.status) && (
                    <div className="camp-result">
                      <div className="camp-result-icon">{activeCampaign.status === 'completed' ? '🎉' : '⏹'}</div>
                      <div className="camp-result-num">{activeCampaign.sent_count}</div>
                      <div className="camp-result-lbl">messages sent</div>
                      {activeCampaign.failed_count > 0 && (
                        <div style={{ fontSize:13, color:'#e53935', margin:'4px 0' }}>❌ {activeCampaign.failed_count} failed</div>
                      )}
                      <button className="camp-send-big" style={{ marginTop:16 }} onClick={() => {
                        setActiveCampaign(null); setCampMsg(''); setCampOfferId('');
                      }}>🚀 New Campaign</button>
                    </div>
                  )}

                  {/* ── SETUP ── */}
                  {!activeCampaign && (
                    <div className="camp-setup">

                      {/* Row: Contacts & Groups */}
                      <div className="camp-row">
                        <span className="camp-row-icon">👥</span>
                        <div className="camp-row-body">
                          <div className="camp-row-title">Recipients</div>
                          <div className="camp-row-sub">
                            {(savedGroup.phones.length > 0 || (savedGroup.groups||[]).length > 0)
                              ? [
                                  savedGroup.phones.length > 0 && `${savedGroup.phones.length} contact${savedGroup.phones.length > 1 ? 's' : ''}`,
                                  (savedGroup.groups||[]).length > 0 && `${savedGroup.groups.length} group${savedGroup.groups.length > 1 ? 's' : ''}`
                                ].filter(Boolean).join(' + ')
                              : `All ${waStatus.contacts} contacts`}
                          </div>
                        </div>
                        <button className="camp-row-action" onClick={() => {
                          if (allContacts.length === 0) loadAllContacts();
                          if (allGroups.length === 0) loadGroups();
                          setSelectedPhones(new Set(savedGroup.phones));
                          setSelectedGroups(new Set((savedGroup.groups||[]).map(g => g.jid)));
                          setContactSearch('');
                          setPickerTab('contacts');
                          setShowGroupEdit(true);
                        }}>
                          {(savedGroup.phones.length > 0 || (savedGroup.groups||[]).length > 0) ? 'Edit' : 'Select'}
                        </button>
                      </div>

                      {/* Row: AI Robo */}
                      <div className="camp-row">
                        <span className="camp-row-icon">🤖</span>
                        <div className="camp-row-body">
                          <div className="camp-row-title">AI Auto-Reply (Robo)</div>
                          <div className="camp-row-sub">{waStatus.chatbot ? 'ON — replying to customers 24/7' : 'OFF'}</div>
                        </div>
                        <div className="camp-toggle-wrap" onClick={async () => {
                          const { data } = await api.post('/campaigns/chatbot/toggle');
                          setWaStatus(s => ({ ...s, chatbot: data.chatbot }));
                        }}>
                          <div className="camp-toggle" style={{ background: waStatus.chatbot ? '#43a047' : '#ccc' }}>
                            <div className="camp-toggle-knob" style={{ left: waStatus.chatbot ? 26 : 3 }} />
                          </div>
                        </div>
                      </div>

                      {/* Row: Reply Language */}
                      <div className="camp-row" style={{ opacity: waStatus.chatbot ? 1 : 0.5 }}>
                        <span className="camp-row-icon">🌐</span>
                        <div className="camp-row-body">
                          <div className="camp-row-title">Reply Language</div>
                          <div className="camp-row-sub">Language the AI uses to reply to customers</div>
                        </div>
                        <select
                          value={waStatus.chatbotLang || 'auto'}
                          disabled={!waStatus.chatbot}
                          onChange={async (e) => {
                            const { data } = await api.post('/campaigns/chatbot/language', { lang: e.target.value });
                            setWaStatus(s => ({ ...s, chatbotLang: data.chatbotLang }));
                          }}
                          style={{
                            padding: '6px 10px', borderRadius: 8, border: '1.5px solid #1976d2',
                            background: '#fff', color: '#1a237e', fontWeight: 600,
                            fontSize: 13, cursor: waStatus.chatbot ? 'pointer' : 'not-allowed',
                            minWidth: 110,
                          }}
                        >
                          <option value="auto">Auto-detect</option>
                          <option value="english">English</option>
                          <option value="telugu">Telugu</option>
                          <option value="hindi">Hindi</option>
                        </select>
                      </div>

                      {/* Row: Shop + Offer selectors */}
                      <div className="camp-row" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                        <div style={{ flex: 1, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 5 }}>
                              🏪 Select Shop
                            </div>
                            <select className="camp-offer-select" style={{ marginTop: 0 }} value={campShopId} onChange={e => {
                              setCampShopId(e.target.value);
                              setCampOfferId('');
                              setCampMsg('');
                            }}>
                              <option value="">— Select a shop —</option>
                              {shops.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                            </select>
                          </div>
                          <div style={{ flex: '2 1 240px', minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 5 }}>
                              🏷️ Select Offer {campOffersLoading && <span style={{ fontWeight: 400, color: '#aaa' }}>Loading…</span>}
                            </div>
                            <select className="camp-offer-select" style={{ marginTop: 0 }} value={campOfferId}
                              disabled={!campShopId || campOffersLoading}
                              onChange={e => {
                                setCampOfferId(e.target.value);
                                if (e.target.value) {
                                  const o = campOffers.find(x => String(x.id) === e.target.value);
                                  if (o) setCampMsg(buildWAMessage(o));
                                } else { setCampMsg(''); }
                              }}>
                              <option value="">{campShopId ? (campOffersLoading ? 'Loading offers…' : campOffers.length ? '— Pick an offer —' : '— No offers found —') : '— Select a shop first —'}</option>
                              {campOffers.map(o => (
                                <option key={o.id} value={o.id}>{o.title} — {o.discount}% OFF</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Message */}
                      <div className="form-group" style={{ marginTop:4 }}>
                        <label style={{ fontSize:12, color:'#888' }}>
                          Message {campOfferId ? '(auto-filled — you can edit)' : '*'}
                        </label>
                        <textarea value={campMsg} rows={4} onChange={e => setCampMsg(e.target.value)}
                          placeholder="Pick an offer above to auto-fill, or type your message here…"
                          style={{ fontFamily:'inherit', lineHeight:1.6, fontSize:13 }} />
                        <div style={{ textAlign:'right', color:'#ccc', fontSize:11 }}>{campMsg.length} chars</div>
                      </div>

                      {/* Send */}
                      <button className="camp-send-big" onClick={startCampaign}
                        disabled={campLoading || !campMsg.trim() || waStatus.status !== 'connected'}>
                        {campLoading ? '⏳ Starting…'
                          : waStatus.status !== 'connected' ? '⏳ Waiting for WhatsApp…'
                          : (() => {
                              const c = savedGroup.phones.length;
                              const g = (savedGroup.groups||[]).length;
                              if (c === 0 && g === 0) return `🚀 Send to All ${waStatus.contacts} Contacts`;
                              const parts = [];
                              if (c > 0) parts.push(`${c} Contact${c>1?'s':''}`);
                              if (g > 0) parts.push(`${g} Group${g>1?'s':''}`);
                              return `🚀 Send to ${parts.join(' + ')}`;
                            })()}
                      </button>
                    </div>
                  )}

                </div>
              )}

              {/* Recipients picker — bottom sheet (Contacts + Groups tabs) */}
              {showGroupEdit && (
                <div className="camp-group-overlay" onClick={e => { if (e.target === e.currentTarget) setShowGroupEdit(false); }}>
                  <div className="camp-group-sheet">

                    {/* Header */}
                    <div className="camp-group-header">
                      <span style={{ fontWeight:700, fontSize:15 }}>Select Recipients</span>
                      <div style={{ display:'flex', gap:8 }}>
                        <button className="camp-group-cancel" onClick={() => setShowGroupEdit(false)}>Cancel</button>
                        <button className="camp-group-save" onClick={saveContactGroup}>
                          Save ({selectedPhones.size + selectedGroups.size})
                        </button>
                      </div>
                    </div>

                    {/* Tab toggle */}
                    <div className="camp-picker-tabs">
                      <button
                        className={`camp-picker-tab${pickerTab === 'contacts' ? ' active' : ''}`}
                        onClick={() => setPickerTab('contacts')}
                      >
                        👤 Contacts {selectedPhones.size > 0 && <span className="camp-tab-badge">{selectedPhones.size}</span>}
                      </button>
                      <button
                        className={`camp-picker-tab${pickerTab === 'groups' ? ' active' : ''}`}
                        onClick={() => { setPickerTab('groups'); if (allGroups.length === 0) loadGroups(); }}
                      >
                        👨‍👩‍👦 Groups {selectedGroups.size > 0 && <span className="camp-tab-badge">{selectedGroups.size}</span>}
                      </button>
                    </div>

                    {/* CONTACTS TAB */}
                    {pickerTab === 'contacts' && (
                      contactsLoading
                        ? <div style={{ textAlign:'center', padding:24 }}>
                            <div className="opt-spinner" style={{ margin:'0 auto 10px' }} />
                            <p style={{ color:'#888', fontSize:13 }}>Loading contacts…</p>
                          </div>
                        : <>
                            <div className="camp-picker-header">
                              <input className="camp-contacts-search"
                                value={contactSearch}
                                onChange={e => setContactSearch(e.target.value)}
                                placeholder="🔍 Search name or number…" />
                              <div className="camp-picker-actions">
                                <button onClick={() => setSelectedPhones(new Set(allContacts.map(c => c.phone)))}>All</button>
                                <button onClick={() => setSelectedPhones(new Set())}>None</button>
                                <span className="camp-sel-count">{selectedPhones.size} / {allContacts.length}</span>
                              </div>
                            </div>
                            <div className="camp-contacts-list">
                              {allContacts
                                .filter(c => {
                                  const q = contactSearch.toLowerCase();
                                  return !q || (c.name||'').toLowerCase().includes(q) || (c.phone||'').includes(q);
                                })
                                .map(c => (
                                  <label key={c.phone} className="camp-contact-row">
                                    <input type="checkbox"
                                      checked={selectedPhones.has(c.phone)}
                                      onChange={e => togglePhone(c.phone, e.target.checked)} />
                                    <div className="camp-contact-info">
                                      <span className="camp-contact-name">{c.name || 'Unknown'}</span>
                                      <span className="camp-contact-phone">+{c.phone}</span>
                                    </div>
                                  </label>
                                ))}
                              {allContacts.length === 0 && (
                                <p style={{ padding:16, color:'#aaa', fontSize:13, textAlign:'center' }}>
                                  No contacts yet — connect WhatsApp first to sync contacts.
                                </p>
                              )}
                            </div>
                          </>
                    )}

                    {/* GROUPS TAB */}
                    {pickerTab === 'groups' && (
                      groupsLoading
                        ? <div style={{ textAlign:'center', padding:24 }}>
                            <div className="opt-spinner" style={{ margin:'0 auto 10px' }} />
                            <p style={{ color:'#888', fontSize:13 }}>Loading groups…</p>
                          </div>
                        : <>
                            <div className="camp-picker-header">
                              <input className="camp-contacts-search"
                                value={contactSearch}
                                onChange={e => setContactSearch(e.target.value)}
                                placeholder="🔍 Search group name…" />
                              <div className="camp-picker-actions">
                                <button onClick={() => setSelectedGroups(new Set(allGroups.map(g => g.jid)))}>All</button>
                                <button onClick={() => setSelectedGroups(new Set())}>None</button>
                                <span className="camp-sel-count">{selectedGroups.size} / {allGroups.length}</span>
                              </div>
                            </div>
                            <div className="camp-contacts-list">
                              {allGroups
                                .filter(g => !contactSearch || g.name.toLowerCase().includes(contactSearch.toLowerCase()))
                                .map(g => (
                                  <label key={g.jid} className="camp-contact-row">
                                    <input type="checkbox"
                                      checked={selectedGroups.has(g.jid)}
                                      onChange={e => toggleGroup(g.jid, e.target.checked)} />
                                    <div className="camp-contact-info">
                                      <span className="camp-contact-name">👨‍👩‍👦 {g.name}</span>
                                      <span className="camp-contact-phone">{g.size} member{g.size !== 1 ? 's' : ''}</span>
                                    </div>
                                  </label>
                                ))}
                              {allGroups.length === 0 && (
                                <p style={{ padding:16, color:'#aaa', fontSize:13, textAlign:'center' }}>
                                  No groups found. Make sure WhatsApp is connected and you are in at least one group.
                                </p>
                              )}
                            </div>
                          </>
                    )}

                  </div>
                </div>
              )}

              {waStatus.status !== 'connected' && waStatus.contacts === 0 && (
                <div className="camp-hint">
                  <p>Connect your WhatsApp above to broadcast offers to your customers.</p>
                  <p style={{ color:'#aaa', fontSize:13 }}>Messages are sent at 2–3 per minute to stay safe.</p>
                </div>
              )}
              </>)}

              {/* ── QR Code Generator ── */}
              {shops.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <h3 style={{ color:'#e65100', marginBottom:12 }}>📱 Shop QR Codes</h3>
                  <p style={{ color:'#777', fontSize:13, marginBottom:14 }}>
                    Print on pamphlets, banners, visiting cards. Customers scan → land on your shop page → see all offers.
                  </p>

                  {shops.map(s => {
                    const fullUrl = `${window.location.origin}${shopUrl(s)}`;
                    const isOpen  = openQR === s.id;
                    return (
                      <div key={s.id} style={{ background:'#fff', borderRadius:12, border:'1px solid #f0e6d6', marginBottom:12, overflow:'hidden' }}>

                        {/* Shop row — click to expand/collapse */}
                        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', cursor:'pointer' }}
                          onClick={() => setOpenQR(isOpen ? null : s.id)}>
                          {s.image
                            ? <img src={s.image} alt="" style={{ width:40, height:40, objectFit:'cover', borderRadius:8, flexShrink:0 }} />
                            : <div style={{ width:40, height:40, background:'#ffe0b2', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🏪</div>
                          }
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:700, color:'#333' }}>{s.name}</div>
                            <div style={{ fontSize:12, color:'#aaa', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fullUrl}</div>
                          </div>
                          <span style={{ fontSize:18, color:'#e65100', flexShrink:0 }}>{isOpen ? '▲' : '▼'}</span>
                        </div>

                        {/* Expanded QR panel */}
                        {isOpen && (
                          <div style={{ borderTop:'1px solid #f5e6d6', padding:'20px 16px', display:'flex', gap:24, flexWrap:'wrap', alignItems:'flex-start' }}>
                            {/* QR image */}
                            <div style={{ textAlign:'center' }}>
                              <img
                                src={qrImgUrl(fullUrl)}
                                alt="QR Code"
                                style={{ width:200, height:200, border:'3px solid #e65100', borderRadius:12, display:'block' }}
                              />
                              <p style={{ fontSize:11, color:'#aaa', marginTop:6 }}>Scan to open shop page</p>
                            </div>

                            {/* Actions */}
                            <div style={{ flex:1, minWidth:200 }}>
                              <p style={{ fontSize:13, color:'#555', marginBottom:14, lineHeight:1.6 }}>
                                <strong>How to use:</strong><br/>
                                ✅ Print on pamphlets & leaflets<br/>
                                ✅ Paste on shop window / counter<br/>
                                ✅ Add to visiting cards<br/>
                                ✅ Send in WhatsApp messages<br/>
                                ✅ Put on delivery packaging
                              </p>

                              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                                <button onClick={() => downloadQR(fullUrl, s.name)}
                                  style={{ padding:'10px 16px', background:'#e65100', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:14, textAlign:'left' }}>
                                  ⬇️ Download QR (PNG)
                                </button>
                                <button onClick={() => {
                                    const text = encodeURIComponent(`📲 Scan this QR to see all offers from *${s.name}*!\n\n👉 Or visit: ${fullUrl}`);
                                    window.open(`https://wa.me/?text=${text}`, '_blank');
                                  }}
                                  style={{ padding:'10px 16px', background:'#25D366', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:14, textAlign:'left' }}>
                                  💬 Share Link on WhatsApp
                                </button>
                                <button onClick={() => { navigator.clipboard.writeText(fullUrl); flash('Shop link copied!'); }}
                                  style={{ padding:'10px 16px', background:'#f5f5f5', color:'#333', border:'1px solid #ddd', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:14, textAlign:'left' }}>
                                  📋 Copy Shop Link
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Campaign History */}
              {campHistory.length > 0 && (
                <div style={{ marginTop:28 }}>
                  <h3 style={{ marginBottom:12, color:'#555' }}>📋 Campaign History</h3>
                  <div className="table-scroll"><table className="data-table">
                    <thead><tr><th>Offer</th><th>Sent</th><th>Failed</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
                    <tbody>
                      {campHistory.map(h => (
                        <tr key={h.id} style={{ cursor:'pointer' }} onClick={() => setActiveCampaign(h)}>
                          <td>{h.offer_title || '—'}</td>
                          <td style={{ color:'#2e7d32', fontWeight:700 }}>{h.sent_count}</td>
                          <td style={{ color: h.failed_count > 0 ? '#c62828' : '#aaa' }}>{h.failed_count}</td>
                          <td>{h.total_contacts}</td>
                          <td><span className={`tag ${h.status === 'completed' ? 'green' : h.status === 'running' ? 'yellow' : 'red'}`}>{h.status}</span></td>
                          <td style={{ fontSize:12 }}>{new Date(h.created_at).toLocaleDateString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              )}
            </>
          )}

          {/* ── Chat Logs Tab ── */}
          {tab === 'chat-logs' && (
            <ChatLogsTab shops={shops} flash={flash} />
          )}

        </div>
      </div>

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="sd-bottom-nav">
        {[
          ['shops',     '🏪', 'My Shops'],
          ['add-shop',  '➕', 'Add Shop'],
          ['offers',    '🏷', 'Offers'],
          ['add-offer', '✨', editingOfferId ? 'Edit' : 'Add Offer'],
          ['campaign',  '📣', 'Campaign'],
          ['chat-logs', '💬', 'Chat'],
        ].map(([t, icon, label]) => (
          <button key={t}
            className={`sd-btab${tab === t ? ' active' : ''}`}
            onClick={() => { if (t !== 'add-offer') resetOffer(); setTab(t); }}>
            <span className="sd-btab-icon">{icon}</span>
            <span className="sd-btab-lbl">{label}</span>
            {t === 'campaign' && waStatus.status === 'connected' && (
              <span className="sd-btab-dot" />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
