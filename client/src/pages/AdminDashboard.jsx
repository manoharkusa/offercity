import { useState, useEffect } from 'react';
import api from '../services/api';

export default function AdminDashboard() {
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [users, setUsers] = useState([]);
  const [offers, setOffers] = useState([]);

  useEffect(() => { api.get('/admin/stats').then(r => setStats(r.data)); }, []);

  const loadPending = () => api.get('/admin/shops/pending').then(r => setPending(r.data));
  const loadUsers  = () => api.get('/admin/users').then(r => setUsers(r.data));
  const loadOffers = () => api.get('/admin/offers').then(r => setOffers(r.data));

  useEffect(() => {
    if (tab === 'pending') loadPending();
    if (tab === 'users') loadUsers();
    if (tab === 'offers') loadOffers();
  }, [tab]);

  const approveShop = async (id) => {
    await api.put(`/admin/shops/${id}/approve`);
    setPending(prev => prev.filter(s => s._id !== id));
  };

  const deleteShop = async (id) => {
    await api.delete(`/admin/shops/${id}`);
    setPending(prev => prev.filter(s => s._id !== id));
  };

  const deleteUser = async (id) => {
    await api.delete(`/admin/users/${id}`);
    setUsers(prev => prev.filter(u => u._id !== id));
  };

  return (
    <div className="page">
      <h1 style={{ color: '#e65100', marginBottom: 24 }}>🛡 Admin Dashboard</h1>
      <div className="dashboard">
        <aside className="sidebar">
          <h3>Manage</h3>
          {['stats', 'pending', 'users', 'offers'].map(t => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'stats' ? '📊 Analytics' : t === 'pending' ? '⏳ Pending Shops' : t === 'users' ? '👥 Users' : '🏷 Offers'}
            </button>
          ))}
        </aside>

        <div className="panel">
          {tab === 'stats' && stats && (
            <>
              <h2>Platform Analytics</h2>
              <div className="stats-grid">
                {[['Total Users', stats.users], ['Total Shops', stats.shops], ['Total Offers', stats.offers], ['Active Offers', stats.activeOffers], ['Pending Shops', stats.pendingShops], ['Total Reviews', stats.reviews]].map(([label, num]) => (
                  <div className="stat-card" key={label}>
                    <div className="num">{num}</div>
                    <div className="label">{label}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === 'pending' && (
            <>
              <h2>Pending Shop Approvals</h2>
              {pending.length === 0 ? <p style={{ color: '#888' }}>No pending shops.</p> :
                <div className="table-scroll"><table className="data-table">
                  <thead><tr><th>Shop Name</th><th>Owner</th><th>Category</th><th>Address</th><th>Actions</th></tr></thead>
                  <tbody>
                    {pending.map(s => (
                      <tr key={s._id}>
                        <td>{s.name}</td><td>{s.owner?.name}<br /><span style={{ fontSize: 12, color: '#888' }}>{s.owner?.email}</span></td>
                        <td>{s.category}</td><td style={{ fontSize: 13 }}>{s.address}</td>
                        <td>
                          <button onClick={() => approveShop(s._id)} style={{ color: '#2e7d32', marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>✅ Approve</button>
                          <button onClick={() => deleteShop(s._id)} style={{ color: '#c62828', background: 'none', border: 'none', cursor: 'pointer' }}>❌ Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              }
            </>
          )}

          {tab === 'users' && (
            <>
              <h2>All Users</h2>
              <div className="table-scroll"><table className="data-table">
                <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Action</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u._id}>
                      <td>{u.name}</td><td>{u.email}</td>
                      <td><span className={`tag ${u.role === 'admin' ? 'green' : u.role === 'shop_owner' ? 'grey' : ''}`}>{u.role}</span></td>
                      <td style={{ fontSize: 13 }}>{new Date(u.createdAt).toLocaleDateString('en-IN')}</td>
                      <td>{u.role !== 'admin' && <button onClick={() => deleteUser(u._id)} style={{ color: '#c62828', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </>
          )}

          {tab === 'offers' && (
            <>
              <h2>All Offers</h2>
              <div className="table-scroll"><table className="data-table">
                <thead><tr><th>Title</th><th>Shop</th><th>Discount</th><th>Category</th><th>Valid Until</th><th>Views</th></tr></thead>
                <tbody>
                  {offers.map(o => (
                    <tr key={o._id}>
                      <td>{o.title}</td><td>{o.shop?.name}</td><td>{o.discount}%</td><td>{o.category}</td>
                      <td>{new Date(o.validUntil).toLocaleDateString('en-IN')}</td><td>👁 {o.views}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
