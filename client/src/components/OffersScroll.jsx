import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const CAT_COLORS = {
  Food: '#d84315', Fashion: '#6a1b9a', Electronics: '#1565c0',
  Beauty: '#ad1457', Grocery: '#2e7d32', Health: '#00695c',
  Travel: '#0277bd', Other: '#4e342e',
};
const CAT_EMOJI = {
  Food: '🍽️', Fashion: '👗', Electronics: '📱',
  Beauty: '💄', Grocery: '🛒', Health: '💊',
  Travel: '✈️', Other: '🏷️',
};

function AreaChips({ offers, selected, onSelect }) {
  const areas = ['All', ...Array.from(new Set(
    offers.map(o => o.city || o.area).filter(Boolean)
  )).sort()];
  return (
    <div className="ofs-chips">
      {areas.map(a => (
        <button key={a} className={`ofs-chip${selected === a ? ' active' : ''}`} onClick={() => onSelect(a)}>
          {a === 'All' ? '📍 All Areas' : a}
        </button>
      ))}
    </div>
  );
}

/* ─── Desktop card ───────────────────────────────────────── */
function OfferCard({ offer, navigate }) {
  const initial = offer.shop_name?.charAt(0)?.toUpperCase() || '?';
  const color = CAT_COLORS[offer.category] || '#e65100';
  return (
    <div className="ofs-card" onClick={() => navigate(`/offers/${offer.id}`)}>
      {/* Image */}
      {offer.image
        ? <img className="ofs-card-img" src={offer.image} alt={offer.title} loading="lazy" />
        : <div className="ofs-card-no-img" style={{ '--card-color': color }}>
            {CAT_EMOJI[offer.category] || '🏷️'}
          </div>
      }
      {/* Discount badge on image */}
      <div className="ofs-card-badge">{offer.discount}% OFF</div>

      <div className="ofs-card-body">
        <div className="ofs-card-title">{offer.title}</div>

        {(offer.offer_price || offer.original_price) && (
          <div className="ofs-card-price-row">
            {offer.offer_price && <span className="ofs-card-price-new">₹{Number(offer.offer_price).toLocaleString('en-IN')}</span>}
            {offer.original_price && <span className="ofs-card-price-old">₹{Number(offer.original_price).toLocaleString('en-IN')}</span>}
          </div>
        )}

        <div className="ofs-card-shop">
          <div className="ofs-card-shop-avatar">{initial}</div>
          <div className="ofs-card-shop-info">
            <div className="ofs-card-shop-name">{offer.shop_name}</div>
            {offer.city && <div className="ofs-card-shop-loc">📍 {offer.address ? `${offer.address}, ` : ''}{offer.city}</div>}
          </div>
        </div>

        <div className="ofs-card-footer">
          {offer.valid_until
            ? <span className="ofs-card-expiry">⏰ Till {new Date(offer.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
            : <span />}
          <button className="ofs-card-cta">Grab Deal →</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Mobile reel slide ──────────────────────────────────── */
function OfferSlide({ offer, index, navigate }) {
  const hasMedia = !!offer.image;
  const isVideo  = offer.image && /\.(mp4|webm|mov)$/i.test(offer.image);
  return (
    <div className="ofs-slide" onClick={() => navigate(`/offers/${offer.id}`)}>
      <div className="ofs-media">
        {hasMedia && !isVideo && <img src={offer.image} alt={offer.title} loading={index < 2 ? 'eager' : 'lazy'} draggable={false} />}
        {hasMedia && isVideo  && <video src={offer.image} autoPlay muted loop playsInline />}
        {!hasMedia && <div className="ofs-no-img">{CAT_EMOJI[offer.category] || '🏷️'}</div>}
      </div>
      <div className="ofs-overlay" />
      <div className="ofs-content">
        <div className="ofs-badge">{offer.discount}% OFF</div>
        <div className="ofs-title">{offer.title}</div>
        {(offer.offer_price || offer.original_price) && (
          <div className="ofs-price-row">
            {offer.offer_price  && <span className="ofs-price-new">₹{Number(offer.offer_price).toLocaleString('en-IN')}</span>}
            {offer.original_price && <span className="ofs-price-old">₹{Number(offer.original_price).toLocaleString('en-IN')}</span>}
          </div>
        )}
        <div className="ofs-shop-row">
          <div className="ofs-shop-dot" />
          <div>
            <div className="ofs-shop-name">{offer.shop_name}</div>
            {offer.city && <div className="ofs-shop-city">{offer.address ? `${offer.address}, ` : ''}{offer.city}</div>}
          </div>
        </div>
        {offer.valid_until && (
          <div className="ofs-expiry">⏰ Valid till {new Date(offer.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
        )}
        <div className="ofs-cta">View Offer →</div>
      </div>
      {index === 0 && (
        <div className="ofs-swipe-hint"><span>↑</span><span>Swipe up</span></div>
      )}
    </div>
  );
}

/* ─── Main ─────────────────────────────────────────────────── */
export default function OffersScroll({ offers }) {
  const navigate = useNavigate();
  const [area, setArea] = useState('All');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 680);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 680);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const filtered = area === 'All' ? offers : offers.filter(o => o.city === area || o.area === area);

  if (!offers.length) return null;

  return (
    <div className="ofs-root">
      <AreaChips offers={offers} selected={area} onSelect={a => setArea(a)} />

      {filtered.length === 0 && <div className="ofs-empty">No offers in {area}. Try another area.</div>}

      {/* DESKTOP: grid of white cards */}
      {!isMobile && (
        <div className="ofs-grid">
          {filtered.map(o => <OfferCard key={o.id} offer={o} navigate={navigate} />)}
        </div>
      )}

      {/* MOBILE: vertical reels */}
      {isMobile && (
        <div className="ofs-track-wrap">
          <div className="ofs-track mobile">
            {filtered.map((o, i) => <OfferSlide key={o.id} offer={o} index={i} navigate={navigate} />)}
          </div>
        </div>
      )}
    </div>
  );
}
