import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';

const CATEGORY_EMOJI = { Food: '🍔', Fashion: '👗', Electronics: '📱', Beauty: '💄', Grocery: '🛒', Health: '💊', Travel: '✈️', Other: '🏷️' };

function useCountdown(expiresAt) {
  const [left, setLeft] = useState('');
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt) - Date.now();
      if (ms <= 0) { setLeft('Expired'); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLeft(h > 0 ? `${h}h ${m}m left` : `${m}m ${s}s left`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return left;
}

export default function OfferCard({ offer }) {
  const navigate  = useNavigate();
  const emoji     = CATEGORY_EMOJI[offer.category] || '🏷️';
  const countdown = useCountdown(offer.flash_expires_at);
  const isFlash   = !!offer.flash_expires_at && new Date(offer.flash_expires_at) > new Date();
  const expires   = offer.valid_until
    ? new Date(offer.valid_until).toLocaleDateString('en-IN')
    : 'No expiry';

  return (
    <div className="offer-card" onClick={() => navigate(`/offers/${offer.id}`)}
      style={{ position: 'relative', border: isFlash ? '2px solid #e65100' : undefined }}>

      {isFlash && (
        <div style={{
          position: 'absolute', top: 8, left: 8, zIndex: 2,
          background: '#e65100', color: '#fff', borderRadius: 6,
          padding: '3px 8px', fontSize: 11, fontWeight: 800,
          display: 'flex', alignItems: 'center', gap: 4,
          boxShadow: '0 2px 8px rgba(230,81,0,0.4)'
        }}>
          ⚡ FLASH &nbsp;·&nbsp; {countdown}
        </div>
      )}

      {offer.image ? (
        <img src={offer.image} alt={offer.title} />
      ) : (
        <div className="no-img">{emoji}</div>
      )}

      <div className="card-body">
        <span className="badge">{offer.category}</span>
        <h3>{offer.title}</h3>
        <p className="shop-name">📍 {offer.shop_name}</p>
        {offer.city && <p className="shop-name" style={{ fontSize: 12, color: '#888' }}>🏙 {offer.area || offer.city}</p>}
        <div className="price-row">
          <span className="discount">{offer.discount}% OFF</span>
          {offer.original_price && <span className="original">₹{Number(offer.original_price).toLocaleString('en-IN')}</span>}
          {offer.offer_price && <span className="discounted">₹{Number(offer.offer_price).toLocaleString('en-IN')}</span>}
        </div>
        {isFlash
          ? <p className="meta" style={{ color: '#e65100', fontWeight: 700 }}>⚡ {countdown}</p>
          : <p className="meta">⏰ Valid till {expires}</p>
        }
        <p className="meta">👁 {offer.views || 0} views</p>
        {offer.distance !== undefined && (
          <p className="meta">📍 {offer.distance.toFixed(1)} km away</p>
        )}
      </div>
    </div>
  );
}
