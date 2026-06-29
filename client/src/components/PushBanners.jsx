import { useState } from 'react';

const ORANGE = 'linear-gradient(135deg, #e65100, #ff8f00)';

// 1 — Classic dark bottom bar, full width
function V1({ shopName, loading, onAllow, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 999,
      background: '#1a1a1a', color: '#fff', padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
      boxShadow: '0 -2px 14px rgba(0,0,0,.3)', animation: 'slideUp .35s ease-out'
    }}>
      <span style={{ fontSize: 22 }}>🔔</span>
      <div style={{ flex: '1 1 220px', minWidth: 180 }}>
        <strong style={{ fontSize: 14 }}>Get offer alerts from {shopName}</strong>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, opacity: 0.75 }}>We'll notify you the moment a new deal drops.</p>
      </div>
      <div style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
        <button onClick={onDismiss} style={{ padding: '9px 16px', background: 'transparent', color: '#ccc', border: '1px solid #555', borderRadius: 8, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>Not now</button>
        <button onClick={onAllow} disabled={loading} style={{ padding: '9px 18px', background: '#e65100', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>{loading ? '...' : 'Allow'}</button>
      </div>
    </div>
  );
}

// 2 — Floating rounded card, branded gradient badge (current default)
function V2({ shopName, loading, onAllow, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 999, maxWidth: 420, margin: '0 auto',
      background: '#fff', borderRadius: 18, padding: 18,
      boxShadow: '0 12px 32px rgba(0,0,0,.18)', border: '1px solid #f1e4d8', animation: 'slideUp .35s ease-out'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, background: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🔔</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 15, color: '#222', display: 'block' }}>Never miss a deal at {shopName}</strong>
          <p style={{ margin: '3px 0 0', fontSize: 13, color: '#777', lineHeight: 1.4 }}>Turn on alerts and we'll ping you the moment a new offer drops.</p>
        </div>
        <button onClick={onDismiss} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 2, flexShrink: 0 }}>×</button>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={onDismiss} style={{ flex: 1, padding: '11px 0', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Not now</button>
        <button onClick={onAllow} disabled={loading} style={{ flex: 1.4, padding: '11px 0', background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700, boxShadow: '0 4px 12px rgba(230,81,0,.3)' }}>{loading ? '...' : '🔔 Turn On Alerts'}</button>
      </div>
    </div>
  );
}

// 3 — Slim top strip
function V3({ shopName, loading, onAllow, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, top: 0, zIndex: 999,
      background: '#fff3e0', color: '#7a3b00', padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center',
      boxShadow: '0 2px 10px rgba(0,0,0,.08)', animation: 'fadeIn .3s ease-out', fontSize: 13
    }}>
      <span>🔔 Get offer alerts from <strong>{shopName}</strong></span>
      <button onClick={onAllow} disabled={loading} style={{ padding: '6px 14px', background: '#e65100', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, fontSize: 12.5 }}>{loading ? '...' : 'Allow'}</button>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#a67', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
    </div>
  );
}

// 4 — Centered modal with backdrop
function V4({ shopName, loading, onAllow, onDismiss }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 28, maxWidth: 360, textAlign: 'center', animation: 'popIn .25s ease-out', boxShadow: '0 20px 50px rgba(0,0,0,.3)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 16px' }}>🔔</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#222' }}>Stay updated on {shopName}</h3>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#777' }}>Get notified instantly whenever this shop posts a new offer.</p>
        <button onClick={onAllow} disabled={loading} style={{ width: '100%', padding: '13px 0', background: ORANGE, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{loading ? '...' : '🔔 Enable Notifications'}</button>
        <button onClick={onDismiss} style={{ width: '100%', padding: '11px 0', background: 'none', color: '#999', border: 'none', cursor: 'pointer', fontSize: 13 }}>Maybe later</button>
      </div>
    </div>
  );
}

// 5 — Desktop-style corner toast
function V5({ shopName, loading, onAllow, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 999, width: 'min(320px, calc(100vw - 32px))',
      background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 10px 28px rgba(0,0,0,.2)',
      animation: 'slideUp .3s ease-out', borderLeft: '4px solid #e65100'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <strong style={{ fontSize: 14, color: '#222' }}>🔔 {shopName}</strong>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: 16, padding: 0 }}>×</button>
      </div>
      <p style={{ margin: '6px 0 12px', fontSize: 12.5, color: '#777' }}>Want a heads-up on new deals here?</p>
      <button onClick={onAllow} disabled={loading} style={{ width: '100%', padding: '9px 0', background: '#e65100', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>{loading ? '...' : 'Notify Me'}</button>
    </div>
  );
}

// 6 — Sticky inline card (not fixed — sticks near top of content)
function V6({ shopName, loading, onAllow, onDismiss }) {
  return (
    <div style={{
      position: 'sticky', top: 12, zIndex: 50, marginBottom: 20,
      background: '#fff3e0', borderRadius: 12, padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      border: '1px solid #ffe0b2', animation: 'fadeIn .3s ease-out'
    }}>
      <span style={{ fontSize: 20 }}>🔔</span>
      <span style={{ flex: 1, fontSize: 13.5, color: '#7a3b00' }}>Get notified when <strong>{shopName}</strong> posts a new offer</span>
      <button onClick={onAllow} disabled={loading} style={{ padding: '8px 16px', background: '#e65100', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>{loading ? '...' : 'Allow'}</button>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#a67', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>Dismiss</button>
    </div>
  );
}

// 7 — Compact pill that expands on tap
function V7({ shopName, loading, onAllow, onDismiss }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        position: 'fixed', left: 16, bottom: 16, zIndex: 999,
        background: ORANGE, color: '#fff', border: 'none', borderRadius: 30,
        padding: '12px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        boxShadow: '0 6px 18px rgba(230,81,0,.4)', animation: 'slideUp .3s ease-out'
      }}>🔔 Get Alerts</button>
    );
  }
  return (
    <div style={{
      position: 'fixed', left: 16, bottom: 16, zIndex: 999, width: 280,
      background: '#fff', borderRadius: 14, padding: 16, boxShadow: '0 10px 28px rgba(0,0,0,.2)',
      animation: 'popIn .2s ease-out'
    }}>
      <strong style={{ fontSize: 14, color: '#222' }}>🔔 Alerts for {shopName}</strong>
      <p style={{ margin: '6px 0 12px', fontSize: 12.5, color: '#777' }}>Get notified on new offers from this shop.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => { onDismiss(); setOpen(false); }} style={{ flex: 1, padding: '8px 0', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12.5 }}>No</button>
        <button onClick={onAllow} disabled={loading} style={{ flex: 1, padding: '8px 0', background: '#e65100', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 12.5 }}>{loading ? '...' : 'Yes'}</button>
      </div>
    </div>
  );
}

// 8 — Premium bottom sheet with drag handle look
function V8({ shopName, loading, onAllow, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 999,
      background: '#fff', borderRadius: '24px 24px 0 0', padding: '10px 24px 26px',
      boxShadow: '0 -8px 30px rgba(0,0,0,.2)', animation: 'slideUp .35s ease-out',
      maxWidth: 480, margin: '0 auto'
    }}>
      <div style={{ width: 40, height: 4, background: '#e0e0e0', borderRadius: 2, margin: '0 auto 18px' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{ width: 50, height: 50, borderRadius: 14, background: ORANGE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🔔</div>
        <div>
          <strong style={{ fontSize: 16, color: '#222', display: 'block' }}>Stay in the loop</strong>
          <span style={{ fontSize: 13, color: '#888' }}>{shopName} will alert you on new deals</span>
        </div>
      </div>
      <button onClick={onAllow} disabled={loading} style={{ width: '100%', padding: '14px 0', background: ORANGE, color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 700, marginBottom: 10, boxShadow: '0 4px 14px rgba(230,81,0,.3)' }}>{loading ? '...' : '🔔 Enable Alerts'}</button>
      <button onClick={onDismiss} style={{ width: '100%', textAlign: 'center', background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 13.5 }}>Not right now</button>
    </div>
  );
}

// 9 — Festive vibrant gradient, pulsing bell
function V9({ shopName, loading, onAllow, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 999,
      background: 'linear-gradient(120deg, #ff6b35, #ff8f00, #ffb347)', color: '#fff',
      padding: '18px 20px', borderRadius: '20px 20px 0 0',
      boxShadow: '0 -6px 24px rgba(0,0,0,.25)', animation: 'slideUp .35s ease-out',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center'
    }}>
      <span style={{ fontSize: 28, animation: 'bounce 1.6s ease-in-out infinite' }}>🔔</span>
      <div style={{ flex: '1 1 220px', minWidth: 180 }}>
        <strong style={{ fontSize: 15 }}>🎉 Don't miss out on {shopName}'s deals!</strong>
        <p style={{ margin: '2px 0 0', fontSize: 12.5, opacity: 0.9 }}>Get instant alerts for fresh offers.</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onDismiss} style={{ padding: '9px 14px', background: 'rgba(255,255,255,.2)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>Skip</button>
        <button onClick={onAllow} disabled={loading} style={{ padding: '9px 18px', background: '#fff', color: '#e65100', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>{loading ? '...' : 'Yes, Notify Me'}</button>
      </div>
    </div>
  );
}

// 10 — Ultra-minimal text strip
function V10({ shopName, loading, onAllow, onDismiss }) {
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 999,
      background: '#222', color: '#eee', padding: '10px 16px', fontSize: 12.5,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, animation: 'fadeIn .25s ease-out'
    }}>
      <span>Get alerts from {shopName}?</span>
      <button onClick={onAllow} disabled={loading} style={{ background: 'none', border: 'none', color: '#ffb347', cursor: 'pointer', fontWeight: 700, fontSize: 12.5, textDecoration: 'underline', padding: 0 }}>{loading ? '...' : 'Turn on'}</button>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 12.5, textDecoration: 'underline', padding: 0 }}>No thanks</button>
    </div>
  );
}

export const PUSH_BANNER_VARIANTS = { 1: V1, 2: V2, 3: V3, 4: V4, 5: V5, 6: V6, 7: V7, 8: V8, 9: V9, 10: V10 };
