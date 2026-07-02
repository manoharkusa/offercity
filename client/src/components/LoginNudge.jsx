import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const COOKIE_KEY  = 'oc_cookies_accepted';
const NUDGE_DELAY = 15 * 1000;

export function acceptCookies() {
  localStorage.setItem(COOKIE_KEY, 'true');
}

async function saveLead(email) {
  if (!email || !email.includes('@')) return;
  try { await api.post('/leads', { name: 'Guest', email: email.trim(), phone: '' }); } catch (_) {}
}

// Request browser notification permission + subscribe to push — called from a click handler
async function requestPushPermission() {
  try {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    // Get VAPID public key from server
    const { data } = await api.get('/push/vapid-key');
    if (!data?.publicKey) return;

    const reg = await navigator.serviceWorker.ready;

    // Convert VAPID key to Uint8Array
    const key = data.publicKey.replace(/-/g, '+').replace(/_/g, '/');
    const raw = Uint8Array.from(atob(key), c => c.charCodeAt(0));

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: raw,
    });

    const { endpoint, keys } = sub.toJSON();

    // Get user's location to enable nearby notifications
    const getCoords = () => new Promise(resolve => {
      navigator.geolocation?.getCurrentPosition(
        ({ coords: c }) => resolve({ lat: c.latitude, lng: c.longitude }),
        () => resolve({})
      );
    });
    const coords = await getCoords();

    await api.post('/push/subscribe', {
      endpoint,
      p256dh: keys.p256dh,
      auth:   keys.auth,
      lat:    coords.lat,
      lng:    coords.lng,
    });

    console.log('[Push] Subscribed for nearby notifications');
  } catch (e) {
    console.warn('[Push] Could not subscribe:', e.message);
  }
}

const AUTH_PAGES = ['/login', '/register'];

export default function LoginNudge() {
  const { user }    = useAuth();
  const navigate    = useNavigate();
  const { pathname} = useLocation();
  const [show, setShow]   = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (user) { acceptCookies(); return; }
    if (localStorage.getItem(COOKIE_KEY) === 'true') return;
    if (AUTH_PAGES.includes(pathname)) return;
    // SMS-link landing has its own capture flow (OTP → profile → push) —
    // popping this nudge over it double-prompts the visitor and kills conversion
    if (pathname.startsWith('/o/')) return;
    const t = setTimeout(() => setShow(true), NUDGE_DELAY);
    return () => clearTimeout(t);
  }, [user, pathname]);

  useEffect(() => {
    if (user) { acceptCookies(); setShow(false); }
  }, [user]);

  useEffect(() => {
    if (AUTH_PAGES.includes(pathname)) setShow(false);
  }, [pathname]);

  const dismiss = async (goLogin = false) => {
    setShow(false);
    await saveLead(email);
    acceptCookies();
    // Request push permission from inside this click — browser allows it here
    await requestPushPermission();
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

        <input
          className="nudge-email"
          type="email"
          placeholder="Your email (optional)"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
        />

        <p className="nudge-cookie">🍪 This site uses cookies &amp; may send you offer alerts nearby.</p>

        <div className="nudge-actions">
          <button className="nudge-btn-login" onClick={() => dismiss(true)}>Login / Register</button>
          <button className="nudge-btn-skip"  onClick={() => dismiss(false)}>Skip</button>
        </div>
      </div>
    </>
  );
}
