import { useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/* ─── Area chips ────────────────────────────────────────────── */
function AreaChips({ offers, selected, onSelect }) {
  const areas = ['All', ...Array.from(new Set(
    offers.map(o => o.city || o.area).filter(Boolean)
  )).sort()];

  return (
    <div className="ofs-chips" role="listbox" aria-label="Filter by area">
      {areas.map(a => (
        <button
          key={a}
          role="option"
          aria-selected={selected === a}
          className={`ofs-chip${selected === a ? ' active' : ''}`}
          onClick={() => onSelect(a)}
        >
          {a === 'All' ? '📍 All Areas' : a}
        </button>
      ))}
    </div>
  );
}

/* ─── Single offer slide ────────────────────────────────────── */
function OfferSlide({ offer, index, isMobile, navigate }) {
  const hasMedia = !!offer.image;
  const isVideo  = offer.image && /\.(mp4|webm|mov)$/i.test(offer.image);

  return (
    <div
      className="ofs-slide"
      onClick={() => navigate(`/offers/${offer.id}`)}
      aria-label={`${offer.title} — ${offer.discount}% off at ${offer.shop_name}`}
    >
      {/* Background media */}
      <div className="ofs-media">
        {hasMedia && !isVideo && (
          <img
            src={offer.image}
            alt={offer.title}
            loading={index < 3 ? 'eager' : 'lazy'}
            draggable={false}
          />
        )}
        {hasMedia && isVideo && (
          <video
            src={offer.image}
            autoPlay
            muted
            loop
            playsInline
          />
        )}
        {!hasMedia && (
          <div className="ofs-no-img">
            <span>{offer.category === 'Food' ? '🍽️' : offer.category === 'Fashion' ? '👗' : offer.category === 'Electronics' ? '📱' : offer.category === 'Beauty' ? '💄' : offer.category === 'Grocery' ? '🛒' : '🏷️'}</span>
          </div>
        )}
      </div>

      {/* Gradient overlay */}
      <div className="ofs-overlay" />

      {/* Content */}
      <div className="ofs-content">
        {/* Discount badge */}
        <div className="ofs-badge">{offer.discount}% OFF</div>

        {/* Offer title */}
        <div className="ofs-title">{offer.title}</div>

        {/* Price row */}
        {(offer.offer_price || offer.original_price) && (
          <div className="ofs-price-row">
            {offer.offer_price && <span className="ofs-price-new">₹{Number(offer.offer_price).toLocaleString('en-IN')}</span>}
            {offer.original_price && <span className="ofs-price-old">₹{Number(offer.original_price).toLocaleString('en-IN')}</span>}
          </div>
        )}

        {/* Shop info */}
        <div className="ofs-shop-row">
          <div className="ofs-shop-dot" />
          <div>
            <div className="ofs-shop-name">{offer.shop_name}</div>
            {offer.city && <div className="ofs-shop-city">{offer.address ? `${offer.address}, ` : ''}{offer.city}</div>}
          </div>
        </div>

        {/* Valid until */}
        {offer.valid_until && (
          <div className="ofs-expiry">
            ⏰ Valid till {new Date(offer.valid_until).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
          </div>
        )}

        {/* CTA */}
        <div className="ofs-cta">View Offer →</div>
      </div>

      {/* Mobile swipe hint on first card */}
      {isMobile && index === 0 && (
        <div className="ofs-swipe-hint">
          <span>↑</span>
          <span>Swipe up for more</span>
        </div>
      )}
    </div>
  );
}

/* ─── Main OffersScroll component ───────────────────────────── */
export default function OffersScroll({ offers }) {
  const navigate   = useNavigate();
  const trackRef   = useRef(null);
  const [area, setArea]         = useState('All');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 680);
  const [canPrev, setCanPrev]   = useState(false);
  const [canNext, setCanNext]   = useState(true);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 680);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const filtered = area === 'All'
    ? offers
    : offers.filter(o => o.city === area || o.area === area);

  // Update arrow visibility on scroll
  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [filtered, onScroll]);

  const scroll = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    const w = el.clientWidth * 0.85;
    el.scrollBy({ left: dir * w, behavior: 'smooth' });
  };

  if (!offers.length) return null;

  return (
    <div className="ofs-root">
      {/* Area filter chips */}
      <AreaChips offers={offers} selected={area} onSelect={a => { setArea(a); trackRef.current?.scrollTo({ left: 0, top: 0 }); }} />

      {filtered.length === 0 && (
        <div className="ofs-empty">No offers in {area}. Try another area.</div>
      )}

      {/* Track */}
      <div className="ofs-track-wrap">
        {/* Desktop prev arrow */}
        {!isMobile && canPrev && (
          <button className="ofs-arrow ofs-arrow-l" onClick={() => scroll(-1)} aria-label="Previous">‹</button>
        )}

        <div ref={trackRef} className={`ofs-track${isMobile ? ' mobile' : ' desktop'}`}>
          {filtered.map((offer, i) => (
            <OfferSlide key={offer.id} offer={offer} index={i} isMobile={isMobile} navigate={navigate} />
          ))}
        </div>

        {/* Desktop next arrow */}
        {!isMobile && canNext && (
          <button className="ofs-arrow ofs-arrow-r" onClick={() => scroll(1)} aria-label="Next">›</button>
        )}
      </div>

      {/* Desktop dot counter */}
      {!isMobile && filtered.length > 1 && (
        <div className="ofs-counter">{filtered.length} offers</div>
      )}
    </div>
  );
}
