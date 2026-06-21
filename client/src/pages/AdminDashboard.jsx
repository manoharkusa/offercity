import { useState, useEffect } from 'react';
import api from '../services/api';

const TABS = [
  { key: 'stats',   label: '📊 Analytics' },
  { key: 'bdos',    label: '🧑‍💼 BDO Management' },
  { key: 'pending', label: '⏳ Pending Shops' },
  { key: 'users',   label: '👥 Users' },
  { key: 'offers',  label: '🏷 Offers' },
];

const btn = (color, extra = {}) => ({
  background: 'none', border: 'none', cursor: 'pointer',
  fontWeight: 600, color, ...extra
});

export default function AdminDashboard() {
  const [tab,     setTab]     = useState('stats');
  const [stats,   setStats]   = useState(null);
  const [pending, setPending] = useState([]);
  const [users,   setUsers]   = useState([]);
  const [offers,  setOffers]  = useState([]);
  const [bdos,    setBdos]    = useState([]);
  const [bdoForm, setBdoForm] = useState({ name:'', email:'', phone:'', password:'', pincodes:'' });
  const [bdoMsg,  setBdoMsg]  = useState('');
  const [editAreas, setEditAreas] = useState(null); // { bdoId, pincodes }

  useEffect(() => { api.get('/admin/stats').then(r => setStats(r.data)); }, []);

  useEffect(() => {
    if (tab === 'pending') api.get('/admin/shops/pending').then(r => setPending(r.data));
    if (tab === 'users')   api.get('/admin/users').then(r => setUsers(r.data));
    if (tab === 'offers')  api.get('/admin/offers').then(r => setOffers(r.data));
    if (tab === 'bdos')    api.get('/admin/bdos').then(r => setBdos(r.data));
  }, [tab]);

  const deleteShop = async (id) => {
    await api.delete(`/admin/shops/${id}`);
    setPending(p => p.filter(s => s.id !== id));
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
                  ['Total Users',    stats.users],
                  ['Total Shops',    stats.shops],
                  ['Total Offers',   stats.offers],
                  ['Total Reviews',  stats.reviews],
                ].map(([label, num]) => (
                  <div className="stat-card" key={label}>
                    <div className="num">{num ?? 0}</div>
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
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>Shop</th><th>Owner</th><th>Pincode</th><th>BDO Assigned</th><th>Created</th><th>Action</th></tr></thead>
                    <tbody>
                      {pending.map(s => (
                        <tr key={s.id}>
                          <td style={{ fontWeight:600 }}>{s.name}</td>
                          <td>{s.owner_name}<br /><span style={{ fontSize:12, color:'#888' }}>{s.owner_email}</span></td>
                          <td>{s.pin_code || '—'}</td>
                          <td>{s.bdo_name ? <span style={{ color:'#1565c0', fontWeight:600 }}>{s.bdo_name}</span> : <span style={{ color:'#e65100', fontSize:13 }}>No BDO for this pincode</span>}</td>
                          <td style={{ fontSize:12 }}>{new Date(s.created_at).toLocaleDateString('en-IN')}</td>
                          <td><button onClick={() => deleteShop(s.id)} style={btn('#c62828')}>Delete</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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

        </div>
      </div>
    </div>
  );
}
