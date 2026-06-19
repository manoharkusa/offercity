import { useNavigate } from 'react-router-dom';

const CATEGORY_EMOJI = { Food: '🍔', Fashion: '👗', Electronics: '📱', Beauty: '💄', Grocery: '🛒', Health: '💊', Travel: '✈️', Other: '🏷️' };

export default function OfferCard({ offer }) {
  const navigate = useNavigate();
  const emoji = CATEGORY_EMOJI[offer.category] || '🏷️';
  const expires = offer.valid_until
    ? new Date(offer.valid_until).toLocaleDateString('en-IN')
    : 'No expiry';

  return (
    <div className="offer-card" onClick={() => navigate(`/offers/${offer.id}`)}>
      {offer.image ? (
        <img src={offer.image} alt={offer.title} />
      ) : (
        <div className="no-img">{emoji}</div>
      )}
      <div className="card-body">
        <span className="badge">{offer.category}</span>
        <h3>{offer.title}</h3>
        <p className="shop-name">📍 {offer.shop_name}</p>
        {offer.city && <p className="shop-name" style={{ fontSize: 12, color: '#888' }}>🏙 {offer.city}</p>}
        <div className="price-row">
          <span className="discount">{offer.discount}% OFF</span>
          {offer.original_price && <span className="original">₹{Number(offer.original_price).toLocaleString('en-IN')}</span>}
          {offer.offer_price && <span className="discounted">₹{Number(offer.offer_price).toLocaleString('en-IN')}</span>}
        </div>
        <p className="meta">⏰ Valid till {expires}</p>
        <p className="meta">👁 {offer.views || 0} views</p>
        {offer.distance !== undefined && (
          <p className="meta">📍 {offer.distance.toFixed(1)} km away</p>
        )}
      </div>
    </div>
  );
}
