import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const COOKIE_KEY  = 'oc_cookies_accepted';
const NUDGE_DELAY = 2 * 60 * 1000; // 2 minutes

export function useCookiesAccepted() {
  return localStorage.getItem(COOKIE_KEY) === 'true';
}

export function acceptCookies() {
  localStorage.setItem(COOKIE_KEY, 'true');
}

export default function LoginNudge() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Already accepted or logged in → mark accepted, never show
    if (localStorage.getItem(COOKIE_KEY) === 'true' || user) {
      acceptCookies();
      return;
    }

    const timer = setTimeout(() => setShow(true), NUDGE_DELAY);
    return () => clearTimeout(timer);
  }, [user]);

  // When user logs in mid-session, accept cookies and hide nudge
  useEffect(() => {
    if (user) {
      acceptCookies();
      setShow(false);
    }
  }, [user]);

  const handleSkip = () => {
    acceptCookies();
    setShow(false);
  };

  const handleLogin = () => {
    acceptCookies();
    setShow(false);
    navigate('/login');
  };

  if (!show) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="nudge-backdrop" onClick={handleSkip} />

      {/* Modal */}
      <div className="nudge-modal" role="dialog" aria-modal="true" aria-labelledby="nudge-title">
        {/* Close */}
        <button className="nudge-close" onClick={handleSkip} aria-label="Close">✕</button>

        {/* Icon */}
        <div className="nudge-icon">🏪</div>

        {/* Text */}
        <h2 className="nudge-title" id="nudge-title">Get the Best Deals Near You!</h2>
        <p className="nudge-body">
          Sign in to save offers, get personalized deals, and never miss a discount near you.
        </p>

        {/* Cookie note */}
        <p className="nudge-cookie">
          🍪 This site uses cookies to improve your experience.
        </p>

        {/* Actions */}
        <div className="nudge-actions">
          <button className="nudge-btn-login" onClick={handleLogin}>Login / Register</button>
          <button className="nudge-btn-skip"  onClick={handleSkip}>Skip &amp; Accept Cookies</button>
        </div>
      </div>
    </>
  );
}
