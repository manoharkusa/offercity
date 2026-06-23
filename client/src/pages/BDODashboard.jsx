import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATUS_COLOR = { pending: '#e65100', approved: '#2e7d32', rejected: '#c62828' };
const STATUS_BG    = { pending: '#fff3e0', approved: '#e8f5e9', rejected: '#ffebee' };

const BLANK_FORM = {
  owner_name: '', owner_email: '', owner_phone: '', owner_aadhar_number: '',
  shop_name: '', category: '', address: '', city: '', pin_code: '', description: '', payment_amount: '',
};
const BLANK_ITEM = { name: '', price: '', description: '' };

export default function BDODashboard() {
  const { user } = useAuth();
  const [tab,     setTab]    = useState('register');
  const [stats,   setStats]  = useState(null);
  const [myShops, setMyShops]= useState([]);
  const [profile, setProfile]= useState(null);
  const [msg,     setMsg]    = useState({ text: '', ok: true });

  // Register form state
  const [form,    setForm]    = useState(BLANK_FORM);
  const [files,   setFiles]   = useState({ owner_aadhar_photo: null, payment_screenshot: null });
  const [catalog, setCatalog] = useState([{ ...BLANK_ITEM }]);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    api.get('/bdo/me').then(r => setProfile(r.data));
    api.get('/bdo/stats').then(r => setStats(r.data));
  }, []);

  useEffect(() => {
    if (tab === 'my-shops') {
      api.get('/bdo/my-shops').then(r => setMyShops(r.data));
    }
  }, [tab]);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submitShop = async (e) => {
    e.preventDefault();
    setMsg({ text: '', ok: true });
    if (!files.payment_screenshot) {
      setMsg({ text: 'Please upload the payment screenshot.', ok: false }); return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (files.owner_aadhar_photo)  fd.append('owner_aadhar_photo',  files.owner_aadhar_photo);
      if (files.payment_screenshot)  fd.append('payment_screenshot',  files.payment_screenshot);
      const validItems = catalog.filter(i => i.name.trim());
      fd.append('catalog', JSON.stringify(validItems));

      await api.post('/bdo/register-shop', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setMsg({ text: '✅ Shop registered! Submitted for admin approval.', ok: true });
      setForm(BLANK_FORM);
      setFiles({ owner_aadhar_photo: null, payment_screenshot: null });
      setCatalog([{ ...BLANK_ITEM }]);
      api.get('/bdo/stats').then(r => setStats(r.data));
    } catch (err) {
      setMsg({ text: err.response?.data?.message || 'Registration failed.', ok: false });
    }
    setSaving(false);
  };

  const TABS = [
    ['register', '➕ Register Shop'],
    ['my-shops', '🏪 My Shops'],
  ];

  const inputStyle = {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd',
    borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 4, display: 'block' };

  return (
    <div className="page" style={{ maxWidth: 900 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ color: '#e65100', margin: 0 }}>🧑‍💼 BDO Dashboard</h1>
        <p style={{ color: '#888', margin: '4px 0 0', fontSize: 14 }}>
          {user?.name} &nbsp;·&nbsp;
          {profile?.areas?.length > 0
            ? profile.areas.map(a => a.pincode + (a.area_name ? ` (${a.area_name})` : '')).join(', ')
            : 'No areas assigned'}
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 12, marginBottom: 24 }}>
          {[
            ['Pending',  stats.pending,  '#fff3e0', '#e65100'],
            ['Approved', stats.approved, '#e8f5e9', '#2e7d32'],
            ['Rejected', stats.rejected, '#ffebee', '#c62828'],
            ['Total',    stats.total,    '#e3f2fd', '#1565c0'],
          ].map(([label, val, bg, color]) => (
            <div key={label} style={{ background: bg, borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color }}>{val}</div>
              <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>{label} Shops</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setMsg({ text: '', ok: true }); }}
            style={{ padding: '9px 20px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14,
              background: tab === key ? '#e65100' : '#f0f0f0',
              color: tab === key ? '#fff' : '#555' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Message */}
      {msg.text && (
        <div style={{ background: msg.ok ? '#e8f5e9' : '#ffebee', color: msg.ok ? '#2e7d32' : '#c62828',
          borderRadius: 8, padding: '10px 16px', marginBottom: 18, fontSize: 14, fontWeight: 600 }}>
          {msg.text}
        </div>
      )}

      {/* ── REGISTER SHOP ─────────────────────────────────────────────── */}
      {tab === 'register' && (
        <form onSubmit={submitShop}
          style={{ background: '#fff', borderRadius: 14, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>

          <h3 style={{ margin: '0 0 20px', color: '#333' }}>Register New Shop</h3>

          {/* Section: Shop Owner */}
          <div style={{ background: '#f8f9fa', borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: '#e65100', marginBottom: 14, fontSize: 15 }}>👤 Shop Owner Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14 }}>
              {[
                ['owner_name',    'Owner Full Name *', 'text', true],
                ['owner_email',   'Owner Email *',     'email', true],
                ['owner_phone',   'Owner Phone',       'tel',   false],
                ['owner_aadhar_number', 'Aadhar Number', 'text', false],
              ].map(([key, label, type, req]) => (
                <div key={key}>
                  <label style={labelStyle}>{label}</label>
                  <input type={type} required={req} value={form[key]}
                    onChange={e => setF(key, e.target.value)} style={inputStyle}
                    placeholder={label.replace(' *', '')} />
                </div>
              ))}
            </div>

            {/* Owner Aadhar Photo */}
            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Owner Aadhar Photo</label>
              <input type="file" accept="image/*,.pdf"
                onChange={e => setFiles(f => ({ ...f, owner_aadhar_photo: e.target.files[0] }))}
                style={{ fontSize: 13 }} />
              {files.owner_aadhar_photo && (
                <span style={{ fontSize: 12, color: '#2e7d32', marginLeft: 8 }}>✓ {files.owner_aadhar_photo.name}</span>
              )}
            </div>
          </div>

          {/* Section: Shop Details */}
          <div style={{ background: '#f8f9fa', borderRadius: 10, padding: 16, marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: '#e65100', marginBottom: 14, fontSize: 15 }}>🏪 Shop Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14 }}>
              {[
                ['shop_name', 'Shop Name *',  'text',  true],
                ['category',  'Category *',   'text',  true],
                ['city',      'City *',        'text',  true],
                ['pin_code',  'Pincode',       'text',  false],
                ['address',   'Address *',    'text',  true],
              ].map(([key, label, type, req]) => (
                <div key={key}>
                  <label style={labelStyle}>{label}</label>
                  <input type={type} required={req} value={form[key]}
                    onChange={e => setF(key, e.target.value)} style={inputStyle}
                    placeholder={label.replace(' *', '')} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14 }}>
              <label style={labelStyle}>Shop Description / Catalog</label>
              <textarea rows={3} value={form.description}
                onChange={e => setF('description', e.target.value)}
                placeholder="Products, services, specialties..."
                style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>

          {/* Section: Catalog */}
          <div style={{ background: '#f3e5f5', borderRadius: 10, padding: 16, marginBottom: 20, border: '1px solid #ce93d8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, color: '#6a1b9a', fontSize: 15 }}>
                📋 Services / Catalog &nbsp;<span style={{ fontWeight: 400, fontSize: 12, color: '#888' }}>({catalog.length}/25 items)</span>
              </div>
              {catalog.length < 25 && (
                <button type="button"
                  onClick={() => setCatalog(c => [...c, { ...BLANK_ITEM }])}
                  style={{ padding: '5px 14px', background: '#6a1b9a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  + Add Item
                </button>
              )}
            </div>

            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr 32px', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Service / Item Name *</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Price (₹)</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>Description</span>
              <span />
            </div>

            {catalog.map((item, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 1fr 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input placeholder={`Item ${i + 1}`} value={item.name}
                  onChange={e => setCatalog(c => c.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                  style={{ ...inputStyle, fontSize: 13 }} />
                <input type="number" placeholder="0.00" value={item.price}
                  onChange={e => setCatalog(c => c.map((x, j) => j === i ? { ...x, price: e.target.value } : x))}
                  style={{ ...inputStyle, fontSize: 13 }} />
                <input placeholder="Optional details" value={item.description}
                  onChange={e => setCatalog(c => c.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                  style={{ ...inputStyle, fontSize: 13 }} />
                <button type="button" onClick={() => setCatalog(c => c.filter((_, j) => j !== i))}
                  style={{ width: 30, height: 30, background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>
                  ×
                </button>
              </div>
            ))}

            {catalog.length === 0 && (
              <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>No items added yet. Click "+ Add Item" to start.</p>
            )}
          </div>

          {/* Section: Payment */}
          <div style={{ background: '#fff8e1', borderRadius: 10, padding: 16, marginBottom: 24, border: '1px solid #ffe082' }}>
            <div style={{ fontWeight: 700, color: '#f57c00', marginBottom: 14, fontSize: 15 }}>💰 Payment Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 14, alignItems: 'flex-end' }}>
              <div>
                <label style={labelStyle}>Installation Amount (₹)</label>
                <input type="number" value={form.payment_amount} onChange={e => setF('payment_amount', e.target.value)}
                  placeholder="e.g. 999" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Payment Screenshot * <span style={{ color: '#c62828' }}>(Required)</span></label>
                <input type="file" accept="image/*" required
                  onChange={e => setFiles(f => ({ ...f, payment_screenshot: e.target.files[0] }))}
                  style={{ fontSize: 13 }} />
                {files.payment_screenshot && (
                  <span style={{ fontSize: 12, color: '#2e7d32', display: 'block', marginTop: 4 }}>
                    ✓ {files.payment_screenshot.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button type="submit" disabled={saving}
            style={{ width: '100%', padding: '14px', background: saving ? '#aaa' : '#e65100',
              color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 16, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Submitting…' : '📤 Submit for Admin Approval'}
          </button>
        </form>
      )}

      {/* ── MY SHOPS ─────────────────────────────────────────────────── */}
      {tab === 'my-shops' && (
        <div>
          {myShops.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#aaa', fontSize: 16 }}>
              No shops registered yet. Use "Register Shop" to add your first shop.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {myShops.map(s => (
                <div key={s.id} style={{ background: '#fff', borderRadius: 12, padding: 18,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.07)', border: '1px solid #eee' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>{s.name}</div>
                      <div style={{ fontSize: 13, color: '#888' }}>{s.category} · {s.city}</div>
                    </div>
                    <span style={{ background: STATUS_BG[s.status], color: STATUS_COLOR[s.status],
                      borderRadius: 12, padding: '4px 12px', fontSize: 13, fontWeight: 700 }}>
                      {s.status === 'pending' ? '⏳ Pending Approval' : s.status === 'approved' ? '✅ Live' : '❌ Rejected'}
                    </span>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 13, color: '#555' }}>
                    👤 {s.owner_name} &nbsp;·&nbsp; {s.owner_email}
                    {s.owner_phone && <> &nbsp;·&nbsp; 📞 {s.owner_phone}</>}
                  </div>
                  <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                    Registered: {new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
