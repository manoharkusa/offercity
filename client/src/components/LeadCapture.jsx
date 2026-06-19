import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const VISITOR_KEY  = 'offercity_visitor';
const SKIP_KEY     = 'offercity_skip';
const CAPTURED_KEY = 'offercity_captured';   // tracks logged-in users already sent

export default function LeadCapture() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Silently capture logged-in user's email (once per account)
  useEffect(() => {
    if (!user) return;
    const key = CAPTURED_KEY + '_' + user.email;
    if (localStorage.getItem(key)) return;
    api.post('/leads', { name: user.name, phone: '', email: user.email })
      .catch(() => {});
    localStorage.setItem(key, '1');
  }, [user]);

  useEffect(() => {
    if (user) return;                                          // logged-in → handled above
    if (localStorage.getItem(VISITOR_KEY)) return;            // already registered
    const skip = localStorage.getItem(SKIP_KEY);
    if (skip && Date.now() < Number(skip)) return;            // user skipped recently

    const t = setTimeout(() => setShow(true), 5000);
    return () => clearTimeout(t);
  }, [user]);

  const save = (data) => {
    localStorage.setItem(VISITOR_KEY, JSON.stringify({
      ...data, joinedAt: Date.now(), lastOfferCount: 0, lastVisit: Date.now()
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/leads', form);
    } catch (_) {
      // still save locally even if API is down
    } finally {
      save(form);
      setDone(true);
      setLoading(false);
      setTimeout(() => setShow(false), 2200);
    }
  };

  const skip = () => {
    // Don't ask again for 3 days
    localStorage.setItem(SKIP_KEY, String(Date.now() + 3 * 86400000));
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="lead-overlay" onClick={(e) => e.target === e.currentTarget && skip()}>
      <div className="lead-modal">
        {done ? (
          <div className="lead-success">
            <span style={{ fontSize: 52 }}>🎉</span>
            <h3>Welcome, {form.name}!</h3>
            <p>You'll see the best deals near you now.</p>
          </div>
        ) : (
          <>
            <div className="lead-top">
              <span style={{ fontSize: 40 }}>🔥</span>
              <h2>Get Exclusive Deals Near You!</h2>
              <p>Join OfferCity — discover the best offers from shops around you.</p>
            </div>

            <form onSubmit={submit} style={{ padding: '0 4px' }}>
              <div className="form-group">
                <label>Your Name *</label>
                <input
                  placeholder="e.g. Ravi Kumar"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  autoComplete="name"
                />
              </div>
              <div className="form-group">
                <label>Phone Number *</label>
                <input
                  type="tel"
                  placeholder="e.g. 9876543210"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  required
                  pattern="[6-9][0-9]{9}"
                  title="Enter a valid 10-digit Indian mobile number"
                  autoComplete="tel"
                />
              </div>
              <div className="form-group">
                <label>Email <span style={{ color: '#aaa', fontWeight: 400 }}>(optional)</span></label>
                <input
                  type="email"
                  placeholder="e.g. ravi@gmail.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  autoComplete="email"
                />
              </div>

              <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: 4 }}>
                {loading ? 'Saving...' : '🎯 Get Exclusive Deals'}
              </button>
            </form>

            <p className="lead-skip" onClick={skip}>Skip for now</p>
          </>
        )}
      </div>
    </div>
  );
}
