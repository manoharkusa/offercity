import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const COOKIE_KEY  = 'oc_cookies_accepted';
const NUDGE_DELAY = 15 * 1000; // 15 seconds after page load

export function acceptCookies() {
  localStorage.setItem(COOKIE_KEY, 'true');
}

async function saveLead(email) {
  if (!email || !email.includes('@')) return;
  try {
    await api.post('/leads', { name: 'Guest', email: email.trim(), phone: '' });
  } catch (_) {}
}

export default function LoginNudge() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [show, setShow]   = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    // If already logged in — accept cookies silently, never show modal
    if (user) { acceptCookies(); return; }

    // Already accepted (enrolled or skipped before) — skip modal
    if (localStorage.getItem(COOKIE_KEY) === 'true') return;

    const t = setTimeout(() => setShow(true), NUDGE_DELAY);
    return () => clearTimeout(t);
  }, [user]);

  // If user logs in while modal is open — close it
  useEffect(() => {
    if (user) { acceptCookies(); setShow(false); }
  }, [user]);

  const dismiss = async (goLogin = false) => {
    await saveLead(email);
    acceptCookies();
    setShow(false);
    if (goLogin) navigate('/login');
  };

  if (!show) return null;

  return (
    <>
      <div className="nudge-backdrop" onClick={() => dismiss(false)} />

      <div className="nudge-modal" role="dialog" aria-modal="true" aria-labelledby="nudge-title">
        <button className="nudge-close" onClick={() => dismiss(false)} aria-label="Close">✕</button>

        <div className="nudge-icon">🏪</div>
        <h2 className="nudge-title" id="nudge-title">Get the Best Deals Near You!</h2>
        <p className="nudge-body">
          Sign in to save offers and get personalised deals — or drop your email and we'll keep you posted.
        </p>

        {/* Email capture */}
        <input
          className="nudge-email"
          type="email"
          placeholder="Your email (optional)"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
        />

        <p className="nudge-cookie">🍪 This site uses cookies to personalise your experience.</p>

        <div className="nudge-actions">
          <button className="nudge-btn-login" onClick={() => dismiss(true)}>Login / Register</button>
          <button className="nudge-btn-skip"  onClick={() => dismiss(false)}>Skip</button>
        </div>
      </div>
    </>
  );
}
