import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import OfferCard from '../components/OfferCard';
import { PUSH_BANNER_VARIANTS } from '../components/PushBanners';

const CATEGORY_EMOJI = { Food: '🍔', Fashion: '👗', Electronics: '📱', Beauty: '💄', Grocery: '🛒', Health: '💊', Travel: '✈️', Other: '🏷️' };

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export default function ShopPage() {
  const params = useParams();
  const slug = params.slug; // works for both /shop/:slug and /shop/:city/:slug
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const bannerVariant = parseInt(searchParams.get('ui'), 10) || 2;
  const PushBanner = PUSH_BANNER_VARIANTS[bannerVariant] || PUSH_BANNER_VARIANTS[2];
  const { user } = useAuth();
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [reviewMsg, setReviewMsg] = useState('');
  const [pushState, setPushState] = useState('idle');
  const [catalog, setCatalog] = useState([]);

  useEffect(() => {
    api.get(`/shops/slug/${slug}`)
      .then(r => {
        setShop(r.data);
        setLoading(false);
        api.get(`/shops/${r.data.id}/catalog`).then(c => setCatalog(c.data)).catch(() => {});
      })
      .catch(() => { setLoading(false); });
  }, [slug]);

  const doSubscribe = async (reg) => {
    const { data } = await api.get('/push/vapid-key');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey)
    });
    const { endpoint, keys } = sub.toJSON();
    await api.post('/push/subscribe', { shopId: shop.id, endpoint, p256dh: keys.p256dh, auth: keys.auth });
    setPushState('subscribed');
  };

  useEffect(() => {
    if (!shop) return;
    let bannerTimer;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;

    // iPhone Safari only supports Web Push for Home Screen apps, not regular tabs
    if (isIOS && !isStandalone) {
      if (!sessionStorage.getItem('iosPushTipDismissed')) setPushState('ios-tip');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    navigator.serviceWorker.ready.then(async (reg) => {
      const existing = await reg.pushManager.getSubscription();
      if (existing) { setPushState('subscribed'); return; }
      if (Notification.permission === 'denied') return;

      if (Notification.permission === 'granted') {
        // Permission already granted on this origin from another shop page — subscribe silently
        try { await doSubscribe(reg); } catch (_) {}
        return;
      }

      // Not yet asked — show our own soft-ask banner first instead of
      // firing the native browser prompt unprompted (browsers penalize that pattern)
      if (!sessionStorage.getItem('pushBannerDismissed')) {
        bannerTimer = setTimeout(() => setPushState('soft-ask'), 2500);
      }
    });

    return () => clearTimeout(bannerTimer);
  }, [shop]);

  const allowPush = async () => {
    setPushState('loading');
    try {
      const reg = await navigator.serviceWorker.ready;
      await doSubscribe(reg);
    } catch (_) {
      setPushState('idle');
    }
  };

  const dismissPush = () => {
    sessionStorage.setItem('pushBannerDismissed', '1');
    setPushState('idle');
  };

  const dismissIosTip = () => {
    sessionStorage.setItem('iosPushTipDismissed', '1');
    setPushState('idle');
  };

  const unsubscribePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
    } catch (_) {}
    setPushState('idle');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(
      `🛍️ Check out *${shop.name}* on OfferCity!\n` +
      `📍 ${shop.address}, ${shop.city}\n` +
      `🔥 ${shop.offers?.length || 0} active deals right now!\n` +
      `👉 ${window.location.href}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const submitReview = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/reviews/${shop.id}`, reviewForm);
      setShop(prev => ({ ...prev, reviews: [data, ...(prev.reviews || [])] }));
      setReviewForm({ rating: 5, comment: '' });
      setReviewMsg('Review submitted! Thank you.');
      setTimeout(() => setReviewMsg(''), 3000);
    } catch (err) {
      setReviewMsg(err.response?.data?.message || 'Error submitting review');
    }
  };

  if (loading) return <p className="loading">Loading shop...</p>;
  if (!shop) return (
    <div className="page" style={{ textAlign: 'center', padding: 60 }}>
      <h2>Shop not found</h2>
      <button className="btn-primary" style={{ width: 'auto', marginTop: 16 }} onClick={() => navigate('/')}>
        Browse Nearby Offers
      </button>
    </div>
  );

  const emoji = CATEGORY_EMOJI[shop.category] || '🏷️';
  const avgRating = shop.avg_rating ? Number(shop.avg_rating).toFixed(1) : null;

  return (
    <div className="page" style={{ maxWidth: 900, margin: '0 auto', paddingBottom: pushState === 'soft-ask' ? 170 : undefined }}>

      {/* Shop Header Banner */}
      <div style={{
        background: shop.image
          ? `linear-gradient(rgba(0,0,0,0.52), rgba(0,0,0,0.52)), url(${shop.image}) center/cover no-repeat`
          : 'linear-gradient(135deg, #e65100 0%, #ff8f00 100%)',
        borderRadius: 16, padding: '32px 28px', marginBottom: 28,
        color: '#fff', position: 'relative', overflow: 'hidden'
      }}>
        {!shop.image && <div style={{ fontSize: 48, marginBottom: 8 }}>{emoji}</div>}
        <h1 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 800, textShadow: shop.image ? '0 1px 4px rgba(0,0,0,.6)' : 'none' }}>{shop.name}</h1>
        <p style={{ margin: '0 0 4px', opacity: 0.95, fontSize: 15 }}>
          📍 {shop.address}{shop.city ? `, ${shop.city}` : ''}{shop.pin_code ? ` – ${shop.pin_code}` : ''}
        </p>
        {shop.description && (
          <p style={{ margin: '8px 0 0', opacity: 0.9, fontSize: 14, maxWidth: 600 }}>{shop.description}</p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          <span style={{ background: 'rgba(255,255,255,0.25)', padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600 }}>
            {emoji} {shop.category}
          </span>
          {avgRating && (
            <span style={{ background: 'rgba(255,255,255,0.25)', padding: '4px 14px', borderRadius: 20, fontSize: 13 }}>
              ⭐ {avgRating} ({shop.review_count} reviews)
            </span>
          )}
          <span style={{ background: 'rgba(255,255,255,0.25)', padding: '4px 14px', borderRadius: 20, fontSize: 13 }}>
            🔥 {shop.offers?.length || 0} active deals
          </span>
        </div>
      </div>

      {/* Push subscribed indicator */}
      {pushState === 'subscribed' && (
        <p style={{ fontSize: 13, color: '#2e7d32', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          🔔 You're getting offer alerts from this shop
          <button onClick={unsubscribePush} style={{
            background: 'none', border: 'none', color: '#888', textDecoration: 'underline',
            cursor: 'pointer', fontSize: 12.5, padding: 0
          }}>Turn off</button>
        </p>
      )}

      {/* iOS tip — Web Push needs Home Screen install on iPhone */}
      {pushState === 'ios-tip' && (
        <div style={{
          background: '#fff3e0', borderRadius: 10, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap'
        }}>
          <span style={{ fontSize: 13, color: '#e65100' }}>
            📱 Add OfferCity to your Home Screen (Share → Add to Home Screen) to get offer alerts on iPhone.
          </span>
          <button onClick={dismissIosTip} style={{
            background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0
          }}>×</button>
        </div>
      )}

      {/* Share Bar */}
      <div style={{
        background: '#fff', borderRadius: 12, padding: '16px 20px', marginBottom: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,.07)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
      }}>
        <span style={{ color: '#555', fontSize: 14, flex: 1 }}>
          🔗 <strong>Share this shop:</strong> {window.location.href}
        </span>
        <button onClick={copyLink} style={{
          padding: '8px 18px', background: copied ? '#2e7d32' : '#e65100',
          color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14
        }}>
          {copied ? '✅ Copied!' : '📋 Copy Link'}
        </button>
        <button onClick={shareWhatsApp} style={{
          padding: '8px 18px', background: '#25D366',
          color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14
        }}>
          💬 Share on WhatsApp
        </button>
      </div>

      {/* Active Offers */}
      <h2 style={{ color: '#e65100', marginBottom: 16 }}>
        🔥 Active Offers {shop.offers?.length > 0 ? `(${shop.offers.length})` : ''}
      </h2>
      {!shop.offers?.length ? (
        <p style={{ color: '#888', marginBottom: 32 }}>No active offers right now. Check back soon!</p>
      ) : (
        <div className="offers-grid" style={{ marginBottom: 32 }}>
          {shop.offers.map(offer => (
            <OfferCard key={offer.id} offer={{ ...offer, shop_name: shop.name, category: shop.category }} />
          ))}
        </div>
      )}

      {/* Catalog / Services */}
      {catalog.length > 0 && (
        <>
          <h2 style={{ color: '#e65100', marginBottom: 16 }}>📋 Services &amp; Pricing</h2>
          <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.07)', marginBottom: 32 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fff3e0' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 13, color: '#e65100', fontWeight: 700 }}>#</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 13, color: '#e65100', fontWeight: 700 }}>Service / Item</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 13, color: '#e65100', fontWeight: 700 }}>Description</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 13, color: '#e65100', fontWeight: 700 }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((item, i) => (
                  <tr key={item.id} style={{ borderTop: '1px solid #f0e6d6', background: i % 2 === 0 ? '#fff' : '#fffaf7' }}>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: '#aaa' }}>{i + 1}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 600, fontSize: 14 }}>{item.name}</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: '#666' }}>{item.description || '—'}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: item.price ? '#2e7d32' : '#aaa', fontSize: 14 }}>
                      {item.price ? `₹${Number(item.price).toLocaleString('en-IN')}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Reviews */}
      <h2 style={{ color: '#e65100', marginBottom: 16 }}>
        ⭐ Customer Reviews {shop.reviews?.length > 0 ? `(${shop.reviews.length})` : ''}
      </h2>

      {user && (
        <form onSubmit={submitReview} style={{
          background: '#fff', padding: 20, borderRadius: 12, marginBottom: 20,
          boxShadow: '0 2px 8px rgba(0,0,0,.08)'
        }}>
          <h3 style={{ marginBottom: 12 }}>Write a Review</h3>
          {reviewMsg && (
            <p style={{ color: reviewMsg.includes('Error') || reviewMsg.includes('already') ? '#c62828' : '#2e7d32',
              marginBottom: 10 }}>{reviewMsg}</p>
          )}
          <div className="form-group">
            <label>Rating</label>
            <select value={reviewForm.rating} onChange={e => setReviewForm({ ...reviewForm, rating: +e.target.value })}>
              {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} ⭐</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Comment</label>
            <textarea placeholder="Share your experience at this shop..."
              value={reviewForm.comment}
              onChange={e => setReviewForm({ ...reviewForm, comment: e.target.value })} />
          </div>
          <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }}>Submit Review</button>
        </form>
      )}

      {!shop.reviews?.length ? (
        <p style={{ color: '#888' }}>No reviews yet. Be the first to review!</p>
      ) : (
        shop.reviews.map(r => (
          <div key={r.id} style={{
            background: '#fff', padding: 16, borderRadius: 10, marginBottom: 12,
            boxShadow: '0 1px 4px rgba(0,0,0,.06)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <strong>{r.user_name}</strong>
              <span style={{ color: '#ff8f00' }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
            </div>
            <p style={{ color: '#555', margin: 0 }}>{r.comment}</p>
            <p style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>
              {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        ))
      )}

      <div style={{ textAlign: 'center', marginTop: 40, paddingTop: 20, borderTop: '1px solid #eee' }}>
        <button className="btn-primary" style={{ width: 'auto', padding: '12px 28px' }} onClick={() => navigate('/')}>
          🔍 Browse More Offers Near You
        </button>
      </div>

      {/* Soft-ask push notification banner — own UI first, real browser prompt only on tap.
          Switch design via ?ui=1..10 in the URL — no redeploy needed. */}
      {(pushState === 'soft-ask' || pushState === 'loading') && (
        <PushBanner
          shopName={shop.name}
          loading={pushState === 'loading'}
          onAllow={allowPush}
          onDismiss={dismissPush}
        />
      )}
    </div>
  );
}
