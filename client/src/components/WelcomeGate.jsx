import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const UUID_KEY = 'oc_visitor_uuid';
const GATE_KEY = 'oc_gate_done';   // set once the visitor logs in or skips
const DELAY_MS = 120000;           // show ~2 minutes after landing

function getVisitorUuid() {
  let id = localStorage.getItem(UUID_KEY);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2));
    localStorage.setItem(UUID_KEY, id);
  }
  return id;
}

// Tracks every visitor (anonymous), and after ~2 min shows a soft login/skip
// prompt to guests. Skip = continue as guest (no change to existing flow).
export default function WelcomeGate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);

  // Track the visitor on load (and link to user when logged in)
  useEffect(() => {
    const uuid = getVisitorUuid();
    api.post('/visitors/track', { uuid, user_id: user?.id || null }).catch(() => {});
  }, [user]);

  // Soft gate: guests only, once, after the delay
  useEffect(() => {
    if (user) return;
    if (localStorage.getItem(GATE_KEY)) return;
    const t = setTimeout(() => setShow(true), DELAY_MS);
    return () => clearTimeout(t);
  }, [user]);

  if (!show || user) return null;

  const done = () => { localStorage.setItem(GATE_KEY, '1'); setShow(false); };

  return (
    <div className="wg-overlay" onClick={done}>
      <div className="wg-card" onClick={e => e.stopPropagation()}>
        <div className="wg-icon">🔥</div>
        <h3>Save your favourite deals</h3>
        <p>Log in to save offers, get nearby deal alerts, and pick up where you left off. It’s quick and free.</p>
        <div className="wg-actions">
          <button className="wg-primary" onClick={() => { done(); navigate('/login'); }}>Log in</button>
          <button className="wg-secondary" onClick={() => { done(); navigate('/register'); }}>Create account</button>
        </div>
        <button className="wg-skip" onClick={done}>Skip for now</button>
      </div>
    </div>
  );
}
