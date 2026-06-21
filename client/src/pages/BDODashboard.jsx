import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

const STATUS_COLOR = { pending: '#e65100', approved: '#2e7d32', rejected: '#c62828' };
const STATUS_BG    = { pending: '#fff3e0', approved: '#e8f5e9', rejected: '#ffebee' };

export default function BDODashboard() {
  const { user } = useAuth();
  const [tab,     setTab]    = useState('pending');
  const [stats,   setStats]  = useState(null);
  const [shops,   setShops]  = useState([]);
  const [profile, setProfile]= useState(null);
  const [reject,  setReject] = useState(null); // { shopId, reason }
  const [msg,     setMsg]    = useState('');

  useEffect(() => {
    api.get('/bdo/me').then(r => setProfile(r.data));
    api.get('/bdo/stats').then(r => setStats(r.data));
  }, []);

  useEffect(() => {
    const status = tab === 'all' ? 'all' : tab;
    api.get(`/bdo/shops?status=${status}`).then(r => setShops(r.data));
  }, [tab]);

  const approve = async (id) => {
    setMsg('');
    try {
      await api.put(`/bdo/shops/${id}/approve`);
      setMsg('Shop approved and is now live!');
      setShops(s => s.filter(x => x.id !== id));
      api.get('/bdo/stats').then(r => setStats(r.data));
    } catch (err) {
      setMsg(err.response?.data?.message || 'Error');
    }
  };

  const submitReject = async () => {
    if (!reject.reason.trim()) return;
    try {
      await api.put(`/bdo/shops/${reject.shopId}/reject`, { reason: reject.reason });
      setMsg('Shop rejected.');
      setReject(null);
      setShops(s => s.filter(x => x.id !== reject.shopId));
      api.get('/bdo/stats').then(r => setStats(r.data));
    } catch (err) {
      setMsg(err.response?.data?.message || 'Error');
    }
  };

  const isMobile = window.innerWidth < 768;

  return (
    <div className="page" style={{ maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ color:'#e65100', margin:0 }}>🧑‍💼 BDO Dashboard</h1>
          <p style={{ color:'#888', margin:'4px 0 0', fontSize:14 }}>
            {user?.name} &nbsp;·&nbsp;
            {profile?.areas?.length > 0
              ? profile.areas.map(a => a.pincode + (a.area_name ? ` (${a.area_name})` : '')).join(', ')
              : 'No areas assigned yet'}
          </p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:14, marginBottom:28 }}>
          {[
            ['Pending',  stats.pending,  '#fff3e0', '#e65100'],
            ['Approved', stats.approved, '#e8f5e9', '#2e7d32'],
            ['Rejected', stats.rejected, '#ffebee', '#c62828'],
            ['Total',    stats.total,    '#e3f2fd', '#1565c0'],
          ].map(([label, val, bg, color]) => (
            <div key={label} style={{ background:bg, borderRadius:10, padding:'16px 20px', textAlign:'center' }}>
              <div style={{ fontSize:28, fontWeight:800, color }}>{val}</div>
              <div style={{ fontSize:13, color:'#555', marginTop:4 }}>{label} Shops</div>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div style={{ background: msg.includes('live') ? '#e8f5e9' : '#ffebee', color: msg.includes('live') ? '#2e7d32' : '#c62828', borderRadius:8, padding:'10px 16px', marginBottom:16, fontSize:14, fontWeight:600 }}>
          {msg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {[['pending','⏳ Pending'],['approved','✅ Approved'],['rejected','❌ Rejected'],['all','📋 All Shops']].map(([key, label]) => (
          <button key={key} onClick={() => { setTab(key); setMsg(''); }}
            style={{ padding:'8px 18px', borderRadius:20, border:'none', cursor:'pointer', fontWeight:600, fontSize:14,
              background: tab === key ? '#e65100' : '#f0f0f0',
              color: tab === key ? '#fff' : '#555' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Shop list */}
      {shops.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'#aaa', fontSize:16 }}>
          No {tab} shops in your area.
        </div>
      ) : isMobile ? (
        /* Mobile — card view */
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {shops.map(s => (
            <div key={s.id} style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 2px 8px rgba(0,0,0,0.08)', border:'1px solid #eee' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:16 }}>{s.name}</div>
                  <div style={{ fontSize:13, color:'#888', marginTop:2 }}>{s.category}</div>
                </div>
                <span style={{ background: STATUS_BG[s.status], color: STATUS_COLOR[s.status], borderRadius:12, padding:'3px 10px', fontSize:12, fontWeight:700 }}>
                  {s.status}
                </span>
              </div>
              <div style={{ fontSize:13, color:'#555', marginBottom:4 }}>📍 {s.address}</div>
              <div style={{ fontSize:13, color:'#555', marginBottom:4 }}>📮 Pincode: <strong>{s.pin_code}</strong></div>
              <div style={{ fontSize:13, color:'#555', marginBottom:12 }}>👤 {s.owner_name} · {s.owner_email}</div>
              {s.status === 'pending' && (
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={() => approve(s.id)}
                    style={{ flex:1, background:'#2e7d32', color:'#fff', border:'none', borderRadius:8, padding:'10px', fontWeight:700, cursor:'pointer', fontSize:14 }}>
                    ✅ Approve
                  </button>
                  <button onClick={() => setReject({ shopId: s.id, shopName: s.name, reason:'' })}
                    style={{ flex:1, background:'#c62828', color:'#fff', border:'none', borderRadius:8, padding:'10px', fontWeight:700, cursor:'pointer', fontSize:14 }}>
                    ❌ Reject
                  </button>
                </div>
              )}
              {s.status === 'rejected' && s.rejection_reason && (
                <div style={{ fontSize:12, color:'#c62828', background:'#ffebee', borderRadius:6, padding:'6px 10px', marginTop:6 }}>
                  Reason: {s.rejection_reason}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Desktop — table view */
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Shop Name</th><th>Owner</th><th>Category</th>
                <th>Pincode</th><th>Address</th><th>Status</th><th>Date</th>
                {tab === 'pending' && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {shops.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight:600 }}>{s.name}</td>
                  <td>
                    {s.owner_name}<br />
                    <span style={{ fontSize:12, color:'#888' }}>{s.owner_email}</span>
                  </td>
                  <td>{s.category}</td>
                  <td><strong>{s.pin_code}</strong></td>
                  <td style={{ fontSize:13, maxWidth:200 }}>{s.address}</td>
                  <td>
                    <span style={{ background: STATUS_BG[s.status], color: STATUS_COLOR[s.status], borderRadius:12, padding:'3px 10px', fontSize:12, fontWeight:700 }}>
                      {s.status}
                    </span>
                    {s.status === 'rejected' && s.rejection_reason && (
                      <div style={{ fontSize:11, color:'#c62828', marginTop:4 }}>{s.rejection_reason}</div>
                    )}
                  </td>
                  <td style={{ fontSize:12 }}>{new Date(s.created_at).toLocaleDateString('en-IN')}</td>
                  {tab === 'pending' && (
                    <td style={{ whiteSpace:'nowrap' }}>
                      <button onClick={() => approve(s.id)}
                        style={{ background:'none', border:'none', color:'#2e7d32', fontWeight:700, cursor:'pointer', marginRight:10, fontSize:14 }}>
                        ✅ Approve
                      </button>
                      <button onClick={() => setReject({ shopId: s.id, shopName: s.name, reason:'' })}
                        style={{ background:'none', border:'none', color:'#c62828', fontWeight:700, cursor:'pointer', fontSize:14 }}>
                        ❌ Reject
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject modal */}
      {reject && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}>
          <div style={{ background:'#fff', borderRadius:14, padding:28, width:440, maxWidth:'100%' }}>
            <h3 style={{ margin:'0 0 6px', color:'#c62828' }}>Reject Shop</h3>
            <p style={{ margin:'0 0 16px', color:'#555', fontSize:14 }}><strong>{reject.shopName}</strong></p>
            <textarea rows={4} placeholder="Reason for rejection (visible to shop owner)..."
              value={reject.reason}
              onChange={e => setReject(r => ({ ...r, reason: e.target.value }))}
              style={{ width:'100%', padding:10, border:'1px solid #ddd', borderRadius:8, fontSize:14, resize:'vertical', boxSizing:'border-box' }} />
            <div style={{ display:'flex', gap:10, marginTop:14 }}>
              <button onClick={submitReject}
                style={{ flex:1, background:'#c62828', color:'#fff', border:'none', borderRadius:8, padding:'11px', fontWeight:700, cursor:'pointer' }}>
                Confirm Reject
              </button>
              <button onClick={() => setReject(null)}
                style={{ flex:1, background:'#eee', border:'none', borderRadius:8, padding:'11px', cursor:'pointer', fontWeight:600 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
