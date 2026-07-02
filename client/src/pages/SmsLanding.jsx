import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { subscribeToPush } from '../utils/push';

// Landing page for SMS offer links (/o/:id).
// New visitor: verify phone via OTP → capture name/email/pincode → push opt-in → offer page.
// Known visitor: straight to the offer page with chat open.
export default function SmsLanding() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loginWithToken } = useAuth();

  const [step, setStep]       = useState('phone'); // phone | code | profile | notify
  const [phone, setPhone]     = useState('');
  const [code, setCode]       = useState('');
  const [devCode, setDevCode] = useState(null);
  const [profile, setProfile] = useState({ name: '', email: '', pin_code: '' });
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [offer, setOffer]     = useState(null);

  const offerUrl = `/offers/${id}?chat=1&src=sms`;

  useEffect(() => {
    api.get(`/offers/${id}`).then(r => setOffer(r.data)).catch(() => {});
    if (user) navigate(offerUrl, { replace: true });
  }, [id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendOtp = async () => {
    setError(''); setBusy(true);
    try {
      const { data } = await api.post('/otp/send', { phone, purpose: 'sms_link' });
      if (data.devCode) setDevCode(data.devCode); // mock mode only — shown for testing
      setStep('code');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send OTP');
    } finally { setBusy(false); }
  };

  const verifyOtp = async () => {
    setError(''); setBusy(true);
    try {
      const { data } = await api.post('/otp/verify', { phone, code, purpose: 'sms_link' });
      loginWithToken(data.token, data.user);
      if (data.isNew || !data.user.pin_code) setStep('profile');
      else setStep('notify');
    } catch (err) {
      setError(err.response?.data?.message || 'Wrong code');
    } finally { setBusy(false); }
  };

  const saveProfile = async () => {
    setError(''); setBusy(true);
    try {
      const payload = {};
      if (profile.name.trim())    payload.name = profile.name.trim();
      if (profile.email.trim())   payload.email = profile.email.trim();
      if (profile.pin_code.trim()) payload.pin_code = profile.pin_code.trim();
      if (Object.keys(payload).length) {
        const { data } = await api.put('/otp/profile', payload);
        loginWithToken(data.token, data.user);
      }
      setStep('notify');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save details');
    } finally { setBusy(false); }
  };

  const enableNotify = async () => {
    setBusy(true);
    await subscribeToPush(); // best-effort — proceed to the offer either way
    setBusy(false);
    navigate(offerUrl, { replace: true });
  };

  const inputStyle = { width: '100%', padding: '12px 14px', fontSize: 16, border: '1px solid #ddd', borderRadius: 10, outline: 'none', boxSizing: 'border-box' };
  const btnStyle = { width: '100%', padding: '13px', fontSize: 15, fontWeight: 700, background: '#e65100', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', opacity: busy ? 0.6 : 1 };

  return (
    <div className="page" style={{ maxWidth: 420, margin: '0 auto', paddingTop: 24 }}>
      {/* Offer teaser so the visitor knows what they're unlocking */}
      {offer && (
        <div style={{ background: '#fff3e0', borderRadius: 14, padding: '16px 18px', marginBottom: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#e65100', fontWeight: 700, marginBottom: 4 }}>🎁 {offer.shop_name}</div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{offer.title}</div>
          {offer.discount > 0 && <div style={{ fontSize: 22, color: '#2e7d32', fontWeight: 800, marginTop: 4 }}>{parseFloat(offer.discount)}% OFF</div>}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 14, padding: 22, boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
        {step === 'phone' && (
          <>
            <h3 style={{ margin: '0 0 6px' }}>Verify your number</h3>
            <p style={{ color: '#777', fontSize: 13.5, margin: '0 0 16px' }}>Enter your mobile number to view this offer and chat with the shop.</p>
            <input style={inputStyle} type="tel" maxLength={10} placeholder="10-digit mobile number"
              value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} />
            <button style={{ ...btnStyle, marginTop: 14 }} disabled={busy || phone.length !== 10} onClick={sendOtp}>
              {busy ? 'Sending…' : 'Send OTP'}
            </button>
          </>
        )}

        {step === 'code' && (
          <>
            <h3 style={{ margin: '0 0 6px' }}>Enter the code</h3>
            <p style={{ color: '#777', fontSize: 13.5, margin: '0 0 16px' }}>We sent a 6-digit code to {phone}.</p>
            {devCode && <p style={{ background:'#e8f5e9', padding:'8px 12px', borderRadius:8, fontSize:13, color:'#2e7d32' }}>Test mode — your code: <strong>{devCode}</strong></p>}
            <input style={{ ...inputStyle, letterSpacing: 6, textAlign: 'center', fontSize: 22 }} type="tel" maxLength={6}
              placeholder="______" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} />
            <button style={{ ...btnStyle, marginTop: 14 }} disabled={busy || code.length !== 6} onClick={verifyOtp}>
              {busy ? 'Verifying…' : 'Verify'}
            </button>
            <button style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, marginTop: 10, cursor: 'pointer', width: '100%' }}
              onClick={() => { setStep('phone'); setCode(''); setDevCode(null); }}>
              Change number
            </button>
          </>
        )}

        {step === 'profile' && (
          <>
            <h3 style={{ margin: '0 0 6px' }}>Almost done!</h3>
            <p style={{ color: '#777', fontSize: 13.5, margin: '0 0 16px' }}>Tell us a little about you — we'll show offers near your area.</p>
            <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="Your name"
              value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} />
            <input style={{ ...inputStyle, marginBottom: 10 }} type="email" placeholder="Email (optional)"
              value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} />
            <input style={inputStyle} type="tel" maxLength={6} placeholder="PIN code (6 digits)"
              value={profile.pin_code} onChange={e => setProfile({ ...profile, pin_code: e.target.value.replace(/\D/g, '') })} />
            <button style={{ ...btnStyle, marginTop: 14 }} disabled={busy} onClick={saveProfile}>
              {busy ? 'Saving…' : 'Continue'}
            </button>
            <button style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, marginTop: 10, cursor: 'pointer', width: '100%' }}
              onClick={() => setStep('notify')}>
              Skip for now
            </button>
          </>
        )}

        {step === 'notify' && (
          <>
            <h3 style={{ margin: '0 0 6px' }}>🔔 Never miss an offer</h3>
            <p style={{ color: '#777', fontSize: 13.5, margin: '0 0 16px' }}>Get notified when shops near you post new offers.</p>
            <button style={btnStyle} disabled={busy} onClick={enableNotify}>
              {busy ? 'Setting up…' : 'Enable notifications'}
            </button>
            <button style={{ background: 'none', border: 'none', color: '#888', fontSize: 13, marginTop: 10, cursor: 'pointer', width: '100%' }}
              onClick={() => navigate(offerUrl, { replace: true })}>
              Maybe later — show me the offer
            </button>
          </>
        )}

        {error && <p style={{ color: '#c62828', fontSize: 13.5, marginTop: 12, textAlign: 'center' }}>{error}</p>}
      </div>
    </div>
  );
}
