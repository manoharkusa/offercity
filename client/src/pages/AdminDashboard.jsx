import { useState, useEffect } from 'react';
import api from '../services/api';

const TABS = [
  { key: 'stats',        label: '📊 Analytics' },
  { key: 'bdos',         label: '🧑‍💼 BDO Management' },
  { key: 'pending',      label: '⏳ Pending Shops' },
  { key: 'users',        label: '👥 Users' },
  { key: 'offers',       label: '🏷 Offers' },
  { key: 'integrations', label: '🔌 Integrations' },
];

// Field metadata for the Integrations tab — key order matches server MANAGED_KEYS
const INTEGRATION_FIELDS = [
  { key: 'MSG91_AUTH_KEY',         label: 'MSG91 Auth Key',            hint: 'MSG91 dashboard → Settings → API Keys', secret: true },
  { key: 'MSG91_SENDER_ID',        label: 'MSG91 Sender ID',           hint: '6-letter DLT-approved header, e.g. OFRCTY' },
  { key: 'MSG91_TEMPLATE_CAMPAIGN',label: 'MSG91 Campaign Template ID',hint: 'DLT-approved flow/template ID for offer SMS' },
  { key: 'MSG91_TEMPLATE_OTP',     label: 'MSG91 OTP Template ID',     hint: 'DLT-approved flow/template ID for OTP SMS' },
  { key: 'RAZORPAY_KEY_ID',        label: 'Razorpay Key ID',           hint: 'Razorpay dashboard → Account & Settings → API Keys' },
  { key: 'RAZORPAY_KEY_SECRET',    label: 'Razorpay Key Secret',       hint: 'Shown once when generating the key pair', secret: true },
  { key: 'SITE_URL',               label: 'Site URL (for SMS links)',  hint: 'Default: https://offerscity.co.in' },
];

const btn = (color, extra = {}) => ({
  background: 'none', border: 'none', cursor: 'pointer',
  fontWeight: 600, color, ...extra
});

export default function AdminDashboard() {
  const [tab,     setTab]     = useState('stats');
  const [stats,   setStats]   = useState(null);
  const [vis,     setVis]     = useState(null);
  const [pending, setPending] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [offers,  setOffers]  = useState([]);
  const [bdos,    setBdos]    = useState([]);
  const [bdoForm, setBdoForm] = useState({ name:'', email:'', phone:'', password:'', pincodes:'' });
  const [bdoMsg,  setBdoMsg]  = useState('');
  const [editAreas, setEditAreas] = useState(null);
  const [credentials, setCredentials] = useState(null); // shown after approve
  const [rejectModal, setRejectModal] = useState(null); // { shopId, shopName, reason }
  const [rejectMsg,   setRejectMsg]   = useState('');
  const [integ,       setInteg]       = useState({ values: {}, meta: {} }); // integrations form
  const [integMsg,    setIntegMsg]    = useState('');

  useEffect(() => { api.get('/admin/stats').then(r => setStats(r.data)); }, []);
  useEffect(() => { api.get('/visitors/count').then(r => setVis(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    if (tab === 'pending') api.get('/admin/shops/pending').then(r => setPending(r.data));
    if (tab === 'users')   api.get('/admin/users').then(r => setUsers(r.data));
    if (tab === 'offers')  api.get('/admin/offers').then(r => setOffers(r.data));
    if (tab === 'bdos')    api.get('/admin/bdos').then(r => setBdos(r.data));
    if (tab === 'integrations') loadIntegrations();
  }, [tab]);

  const loadIntegrations = () =>
    api.get('/admin/integrations').then(r => {
      const values = {}, meta = {};
      for (const s of r.data.settings) { values[s.key] = s.value || ''; meta[s.key] = s; }
      setInteg({ values, meta });
    }).catch(() => {});

  const saveIntegrations = async () => {
    setIntegMsg('');
    try {
      const { data } = await api.put('/admin/integrations', integ.values);
      setIntegMsg('✅ ' + data.message);
      const values = {}, meta = {};
      for (const s of data.settings) { values[s.key] = s.value || ''; meta[s.key] = s; }
      setInteg({ values, meta });
    } catch (err) {
      setIntegMsg('❌ ' + (err.response?.data?.message || 'Save failed'));
    }
  };

  const deleteShop = async (id) => {
    await api.delete(`/admin/shops/${id}`);
    setPending(p => p.filter(s => s.id !== id));
  };

  const approveShop = async (id) => {
    try {
      const r = await api.put(`/admin/shops/${id}/approve`);
      setCredentials(r.data.credentials);
      setPending(p => p.filter(s => s.id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Approval failed');
    }
  };

  const submitReject = async () => {
    if (!rejectModal?.reason?.trim()) return;
    try {
      await api.put(`/admin/shops/${rejectModal.shopId}/reject`, { reason: rejectModal.reason });
      setPending(p => p.filter(s => s.id !== rejectModal.shopId));
      setRejectModal(null);
    } catch (err) {
      setRejectMsg(err.response?.data?.message || 'Error');
    }
  };

  const deleteUser = async (id) => {
    await api.delete(`/admin/users/${id}`);
    setUsers(p => p.filter(u => u.id !== id));
  };

  const createBdo = async (e) => {
    e.preventDefault();
    setBdoMsg('');
    try {
      const pincodes = bdoForm.pincodes.split(',').map(p => p.trim()).filter(Boolean)
        .map(pin => {
          const [pincode, ...rest] = pin.split(':');
          return { pincode: pincode.trim(), area_name: rest.join(':').trim() };
        });
      await api.post('/admin/bdos', { ...bdoForm, pincodes });
      setBdoMsg('BDO created successfully');
      setBdoForm({ name:'', email:'', phone:'', password:'', pincodes:'' });
      api.get('/admin/bdos').then(r => setBdos(r.data));
    } catch (err) {
      setBdoMsg(err.response?.data?.message || 'Error creating BDO');
    }
  };

  const deleteBdo = async (id) => {
    if (!window.confirm('Delete this BDO?')) return;
    await api.delete(`/admin/bdos/${id}`);
    setBdos(p => p.filter(b => b.id !== id));
  };

  const saveAreas = async () => {
    const pincodes = editAreas.pincodes.split(',').map(p => p.trim()).filter(Boolean)
      .map(pin => {
        const [pincode, ...rest] = pin.split(':');
        return { pincode: pincode.trim(), area_name: rest.join(':').trim() };
      });
    await api.put(`/admin/bdos/${editAreas.bdoId}/areas`, { pincodes });
    setEditAreas(null);
    api.get('/admin/bdos').then(r => setBdos(r.data));
  };

  return (
    <div className="page">
      <h1 style={{ color:'#e65100', marginBottom:24 }}>🛡 Admin Dashboard</h1>
      <div className="dashboard">
        <aside className="sidebar">
          <h3>Manage</h3>
          {TABS.map(t => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </aside>

        <div className="panel">

          {/* ── Analytics ── */}
          {tab === 'stats' && stats && (
            <>
              <h2>Platform Analytics</h2>
              <div className="stats-grid">
                {[
                  ['Total Users',       stats.users],
                  ['Total Visitors',    vis?.unique],
                  ['Total App Views',   vis?.visits],
                  ['Total Shop Views',  stats.shopViews],
                  ['Total Offer Views', stats.offerViews],
                  ['Total Shops',       stats.shops],
                  ['Total Offers',      stats.offers],
                  ['Total Reviews',     stats.reviews],
                ].map(([label, num]) => (
                  <div className="stat-card" key={label}>
                    <div className="num">{num != null ? Number(num).toLocaleString('en-IN') : 0}</div>
                    <div className="label">{label}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── BDO Management ── */}
          {tab === 'bdos' && (
            <>
              <h2>BDO Management</h2>

              {/* Create form */}
              <div style={{ background:'#fff8f5', border:'1px solid #ffd0b0', borderRadius:10, padding:20, marginBottom:28 }}>
                <h3 style={{ margin:'0 0 14px', color:'#e65100' }}>Create New BDO</h3>
                <form onSubmit={createBdo} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[['name','Full Name'],['email','Email'],['phone','Phone'],['password','Password']].map(([field, ph]) => (
                    <input key={field} type={field === 'password' ? 'password' : 'text'}
                      placeholder={ph} value={bdoForm[field]} required={field !== 'phone'}
                      onChange={e => setBdoForm(f => ({ ...f, [field]: e.target.value }))}
                      style={{ padding:'8px 12px', border:'1px solid #ddd', borderRadius:6, fontSize:14 }} />
                  ))}
                  <input type="text" placeholder="Pincodes: 500001:Abids, 500002:Begumpet"
                    value={bdoForm.pincodes}
                    onChange={e => setBdoForm(f => ({ ...f, pincodes: e.target.value }))}
                    style={{ gridColumn:'1/-1', padding:'8px 12px', border:'1px solid #ddd', borderRadius:6, fontSize:14 }} />
                  <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:12 }}>
                    <button type="submit" style={{ background:'#e65100', color:'#fff', border:'none', borderRadius:6, padding:'8px 20px', fontWeight:700, cursor:'pointer' }}>
                      Create BDO
                    </button>
                    {bdoMsg && <span style={{ color: bdoMsg.includes('success') ? '#2e7d32' : '#c62828', fontSize:13 }}>{bdoMsg}</span>}
                  </div>
                </form>
                <p style={{ margin:'10px 0 0', fontSize:12, color:'#999' }}>
                  Pincode format: <code>500001:Abids, 500002:Begumpet</code> (area name after colon is optional)
                </p>
              </div>

              {/* BDO list */}
              {bdos.length === 0 ? <p style={{ color:'#888' }}>No BDOs created yet.</p> : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>Name</th><th>Email</th><th>Assigned Areas</th><th>Pending</th><th>Actions</th></tr></thead>
                    <tbody>
                      {bdos.map(b => (
                        <tr key={b.id}>
                          <td style={{ fontWeight:600 }}>{b.name}</td>
                          <td style={{ fontSize:13 }}>{b.email}</td>
                          <td style={{ fontSize:13 }}>
                            {b.areas.length === 0
                              ? <span style={{ color:'#aaa' }}>None assigned</span>
                              : b.areas.map(a => (
                                  <span key={a.pincode} style={{ display:'inline-block', background:'#fff3e0', borderRadius:4, padding:'2px 6px', margin:'2px', fontSize:12 }}>
                                    {a.pincode}{a.area_name ? ` (${a.area_name})` : ''}
                                  </span>
                                ))}
                            <button onClick={() => setEditAreas({ bdoId: b.id, pincodes: b.areas.map(a => `${a.pincode}:${a.area_name}`).join(', ') })}
                              style={{ ...btn('#1565c0'), fontSize:12, marginLeft:6 }}>Edit</button>
                          </td>
                          <td><span style={{ background:'#fff3e0', color:'#e65100', borderRadius:12, padding:'2px 10px', fontSize:13, fontWeight:700 }}>{b.pending_count}</span></td>
                          <td>
                            <button onClick={() => deleteBdo(b.id)} style={btn('#c62828')}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Edit areas modal */}
              {editAreas && (
                <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 }}>
                  <div style={{ background:'#fff', borderRadius:12, padding:28, width:480, maxWidth:'90vw' }}>
                    <h3 style={{ margin:'0 0 12px' }}>Edit Assigned Pincodes</h3>
                    <textarea rows={4} value={editAreas.pincodes}
                      onChange={e => setEditAreas(a => ({ ...a, pincodes: e.target.value }))}
                      placeholder="500001:Abids, 500002:Begumpet"
                      style={{ width:'100%', padding:10, border:'1px solid #ddd', borderRadius:6, fontSize:14, resize:'vertical' }} />
                    <p style={{ fontSize:12, color:'#999', margin:'6px 0 16px' }}>Comma-separated. Format: pincode:area_name</p>
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={saveAreas} style={{ background:'#e65100', color:'#fff', border:'none', borderRadius:6, padding:'8px 20px', fontWeight:700, cursor:'pointer' }}>Save</button>
                      <button onClick={() => setEditAreas(null)} style={{ background:'#eee', border:'none', borderRadius:6, padding:'8px 16px', cursor:'pointer' }}>Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Pending Shops ── */}
          {tab === 'pending' && (
            <>
              <h2>Pending Shop Approvals</h2>
              {pending.length === 0 ? <p style={{ color:'#888' }}>No pending shops.</p> : (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  {pending.map(s => (
                    <div key={s.id} style={{ background:'#fff', borderRadius:14, padding:20, boxShadow:'0 2px 10px rgba(0,0,0,0.08)', border:'1px solid #eee' }}>
                      {/* Shop + BDO header */}
                      <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:14 }}>
                        <div>
                          <div style={{ fontWeight:700, fontSize:17 }}>{s.name}</div>
                          <div style={{ fontSize:13, color:'#888' }}>{s.category} · {s.city}{s.pin_code ? ` · ${s.pin_code}` : ''}</div>
                          {s.bdo_name && <div style={{ fontSize:12, color:'#1565c0', marginTop:2 }}>BDO: {s.bdo_name}</div>}
                        </div>
                        <div style={{ fontSize:12, color:'#aaa' }}>{new Date(s.created_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>
                      </div>

                      {/* Owner + Aadhar */}
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px,1fr))', gap:14, marginBottom:14 }}>
                        <div style={{ background:'#f8f9fa', borderRadius:8, padding:12 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:'#555', marginBottom:6 }}>SHOP OWNER</div>
                          <div style={{ fontWeight:600 }}>{s.owner_name}</div>
                          <div style={{ fontSize:13, color:'#555' }}>{s.owner_email}</div>
                          {s.owner_phone && <div style={{ fontSize:13, color:'#555' }}>📞 {s.owner_phone}</div>}
                          {s.owner_aadhar_number && <div style={{ fontSize:13, color:'#555' }}>🪪 Aadhar: {s.owner_aadhar_number}</div>}
                        </div>

                        {/* Aadhar Photo */}
                        {s.owner_aadhar_photo && (
                          <div style={{ background:'#f8f9fa', borderRadius:8, padding:12 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:'#555', marginBottom:6 }}>AADHAR PHOTO</div>
                            <a href={`/uploads/${s.owner_aadhar_photo}`} target="_blank" rel="noreferrer">
                              <img src={`/uploads/${s.owner_aadhar_photo}`} alt="Aadhar"
                                style={{ width:'100%', maxHeight:90, objectFit:'cover', borderRadius:6, cursor:'pointer' }} />
                            </a>
                          </div>
                        )}

                        {/* Payment Screenshot */}
                        {s.payment_screenshot && (
                          <div style={{ background:'#fff8e1', borderRadius:8, padding:12, border:'1px solid #ffe082' }}>
                            <div style={{ fontSize:12, fontWeight:700, color:'#f57c00', marginBottom:6 }}>
                              PAYMENT SCREENSHOT{s.payment_amount ? ` — ₹${s.payment_amount}` : ''}
                            </div>
                            <a href={`/uploads/${s.payment_screenshot}`} target="_blank" rel="noreferrer">
                              <img src={`/uploads/${s.payment_screenshot}`} alt="Payment"
                                style={{ width:'100%', maxHeight:90, objectFit:'cover', borderRadius:6, cursor:'pointer' }} />
                            </a>
                            <div style={{ fontSize:11, color:'#888', marginTop:4 }}>Click to enlarge</div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                        <button onClick={() => approveShop(s.id)}
                          style={{ padding:'10px 24px', background:'#2e7d32', color:'#fff', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer', fontSize:14 }}>
                          ✅ Approve & Generate Credentials
                        </button>
                        <button onClick={() => setRejectModal({ shopId:s.id, shopName:s.name, reason:'' })}
                          style={{ padding:'10px 24px', background:'#c62828', color:'#fff', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer', fontSize:14 }}>
                          ❌ Reject
                        </button>
                        <button onClick={() => deleteShop(s.id)}
                          style={{ padding:'10px 16px', background:'none', color:'#999', border:'1px solid #ddd', borderRadius:8, cursor:'pointer', fontSize:13 }}>
                          🗑 Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Credentials Modal */}
              {credentials && (
                <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
                  <div style={{ background:'#fff', borderRadius:16, padding:28, width:440, maxWidth:'100%' }}>
                    <h3 style={{ margin:'0 0 6px', color:'#2e7d32' }}>✅ Shop Approved!</h3>
                    <p style={{ margin:'0 0 18px', color:'#555', fontSize:14 }}>Share these credentials with the shop owner:</p>
                    <div style={{ background:'#f1f8e9', borderRadius:10, padding:16, fontFamily:'monospace', fontSize:14, lineHeight:2 }}>
                      <div>🏪 Shop: <strong>{credentials.shop_name}</strong></div>
                      <div>👤 Name: <strong>{credentials.owner_name}</strong></div>
                      <div>📧 Email: <strong>{credentials.email}</strong></div>
                      <div>🔑 Password: <strong style={{ fontSize:16, color:'#1565c0' }}>{credentials.password}</strong></div>
                      <div>🌐 Login: <strong>{credentials.login_url}</strong></div>
                    </div>
                    <button onClick={() => {
                      navigator.clipboard?.writeText(
                        `OfferCity Login\nEmail: ${credentials.email}\nPassword: ${credentials.password}\nURL: ${credentials.login_url}`
                      );
                    }}
                      style={{ width:'100%', marginTop:14, padding:10, background:'#1565c0', color:'#fff', border:'none', borderRadius:8, fontWeight:700, cursor:'pointer', fontSize:14 }}>
                      📋 Copy Credentials
                    </button>
                    <button onClick={() => setCredentials(null)}
                      style={{ width:'100%', marginTop:8, padding:10, background:'#eee', border:'none', borderRadius:8, cursor:'pointer', fontWeight:600 }}>
                      Close
                    </button>
                  </div>
                </div>
              )}

              {/* Reject Modal */}
              {rejectModal && (
                <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
                  <div style={{ background:'#fff', borderRadius:14, padding:28, width:420, maxWidth:'100%' }}>
                    <h3 style={{ margin:'0 0 6px', color:'#c62828' }}>Reject Shop</h3>
                    <p style={{ margin:'0 0 14px', color:'#555', fontSize:14 }}><strong>{rejectModal.shopName}</strong></p>
                    <textarea rows={4} placeholder="Reason for rejection..."
                      value={rejectModal.reason}
                      onChange={e => setRejectModal(m => ({ ...m, reason: e.target.value }))}
                      style={{ width:'100%', padding:10, border:'1px solid #ddd', borderRadius:8, fontSize:14, resize:'vertical', boxSizing:'border-box' }} />
                    {rejectMsg && <div style={{ color:'#c62828', fontSize:13, marginTop:6 }}>{rejectMsg}</div>}
                    <div style={{ display:'flex', gap:10, marginTop:14 }}>
                      <button onClick={submitReject}
                        style={{ flex:1, background:'#c62828', color:'#fff', border:'none', borderRadius:8, padding:11, fontWeight:700, cursor:'pointer' }}>
                        Confirm Reject
                      </button>
                      <button onClick={() => { setRejectModal(null); setRejectMsg(''); }}
                        style={{ flex:1, background:'#eee', border:'none', borderRadius:8, padding:11, cursor:'pointer', fontWeight:600 }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Users ── */}
          {tab === 'users' && (
            <>
              <h2>All Users</h2>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Action</th></tr></thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td>{u.email}</td>
                        <td><span className={`tag ${u.role === 'admin' ? 'green' : u.role === 'bdo' ? 'blue' : u.role === 'shop_owner' ? 'grey' : ''}`}>{u.role}</span></td>
                        <td style={{ fontSize:13 }}>{new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                        <td>{u.role !== 'admin' && <button onClick={() => deleteUser(u.id)} style={btn('#c62828')}>Delete</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Offers ── */}
          {tab === 'offers' && (
            <>
              <h2>All Offers</h2>
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>Title</th><th>Shop</th><th>Discount</th><th>Valid Until</th><th>Views</th></tr></thead>
                  <tbody>
                    {offers.map(o => (
                      <tr key={o.id}>
                        <td>{o.title}</td>
                        <td>{o.shop_name}</td>
                        <td>{o.discount}%</td>
                        <td>{o.valid_until ? new Date(o.valid_until).toLocaleDateString('en-IN') : '—'}</td>
                        <td>👁 {o.views}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Integrations: MSG91 + Razorpay keys ── */}
          {tab === 'integrations' && (
            <>
              <h2>🔌 Integrations</h2>
              <p style={{ color:'#777', fontSize:13.5, marginBottom:18 }}>
                Paste your MSG91 and Razorpay credentials here after registration. Until keys are set,
                SMS and payments run in <strong>test mode</strong> (no real SMS or money moves).
                Values saved here override the server .env file.
              </p>

              <div style={{ background:'#fff', borderRadius:12, padding:22, boxShadow:'0 2px 8px rgba(0,0,0,.08)', maxWidth:560 }}>
                {INTEGRATION_FIELDS.map(f => (
                  <div key={f.key} style={{ marginBottom:16 }}>
                    <label style={{ display:'flex', alignItems:'center', gap:8, fontWeight:600, fontSize:13.5, marginBottom:4 }}>
                      {f.label}
                      {integ.meta[f.key]?.set
                        ? <span style={{ fontSize:10.5, background:'#e8f5e9', color:'#2e7d32', padding:'2px 8px', borderRadius:10 }}>
                            ✓ set{integ.meta[f.key]?.source === 'env' ? ' (from .env)' : ''}
                          </span>
                        : <span style={{ fontSize:10.5, background:'#fff3cd', color:'#7a5700', padding:'2px 8px', borderRadius:10 }}>not set</span>}
                    </label>
                    <input
                      type="text"
                      value={integ.values[f.key] || ''}
                      onChange={e => setInteg(prev => ({ ...prev, values: { ...prev.values, [f.key]: e.target.value } }))}
                      placeholder={f.hint}
                      autoComplete="off"
                      style={{ width:'100%', padding:'10px 12px', border:'1px solid #ddd', borderRadius:8, fontSize:13.5, boxSizing:'border-box',
                        fontFamily: f.secret ? 'monospace' : 'inherit' }}
                    />
                    <div style={{ fontSize:11.5, color:'#aaa', marginTop:3 }}>{f.hint}</div>
                  </div>
                ))}

                <button className="btn-primary" style={{ width:'auto', padding:'11px 28px' }} onClick={saveIntegrations}>
                  Save Settings
                </button>
                {integMsg && <p style={{ marginTop:10, fontSize:13.5 }}>{integMsg}</p>}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
