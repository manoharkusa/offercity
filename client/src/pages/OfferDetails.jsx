import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import MapView from '../components/MapView';
import ChatWidget from '../components/ChatWidget';

export default function OfferDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const [offer, setOffer] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [route, setRoute] = useState(null);
  const [userCoords, setUserCoords] = useState(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, comment: '' });
  const [saved,       setSaved]       = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [coming,      setComing]      = useState(false);
  const [comingMsg,   setComingMsg]   = useState('');

  const loadOffer = () => {
    setLoadError(null);
    api.get(`/offers/${id}`).then(r => {
      setOffer(r.data);
      api.get(`/reviews/${r.data.shop_id}`).then(rv => setReviews(rv.data)).catch(() => {});
    }).catch(err => {
      console.error('load offer:', err.response?.data || err.message);
      setLoadError(err.code === 'ECONNABORTED' ? 'Server is starting up, please retry.' : 'Could not load offer details.');
    });
  };

  useEffect(() => {
    loadOffer();
    navigator.geolocation?.getCurrentPosition(({ coords: c }) =>
      setUserCoords({ lng: c.longitude, lat: c.latitude })
    );
  }, [id]);

  const getRoute = () => {
    const sLat = parseFloat(offer.lat);
    const sLng = parseFloat(offer.lng);
    let url;
    if (userCoords) {
      url = `https://www.google.com/maps/dir/?api=1&origin=${userCoords.lat},${userCoords.lng}&destination=${sLat},${sLng}&travelmode=driving`;
    } else {
      url = `https://www.google.com/maps/dir/?api=1&destination=${sLat},${sLng}&travelmode=driving`;
    }
    window.open(url, '_blank');
  };

  const markComing = async (eta) => {
    try {
      await api.post('/coming', { offer_id: id, eta_minutes: eta });
      setComing(true);
      setComingMsg(`Shop notified! Your offer is reserved for ${eta} minutes.`);
    } catch (err) {
      setComingMsg(err.response?.data?.message || 'Could not notify shop');
    }
  };

  const toggleSave = async () => {
    setSaveLoading(true);
    try {
      const { data } = await api.post(`/auth/save-offer/${id}`);
      setSaved(data.saved);
    } catch (err) {
      console.error('save offer:', err.response?.data || err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const submitReview = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/reviews/${offer.shop_id}`, reviewForm);
      setReviews(prev => [data, ...prev]);
      setReviewForm({ rating: 5, comment: '' });
    } catch (err) {
      alert(err.response?.data?.message || 'Error submitting review');
    }
  };

  if (loadError) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ color: '#c62828', marginBottom: 16 }}>{loadError}</p>
      <button className="btn-primary" style={{ width: 'auto', padding: '10px 28px' }} onClick={loadOffer}>
        Retry
      </button>
    </div>
  );
  if (!offer) return <p className="loading">Loading offer...</p>;

  const sLng = parseFloat(offer.lng);
  const sLat = parseFloat(offer.lat);
  const expires = offer.valid_until
    ? new Date(offer.valid_until).toLocaleDateString('en-IN')
    : 'No expiry';

  return (
    <div className="page">
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          {offer.image && <img src={offer.image} alt={offer.title} style={{ width: '100%', borderRadius: 12, marginBottom: 16 }} />}
          <span className="tag green">{offer.category}</span>
          <h1 style={{ margin: '10px 0 6px', color: '#e65100' }}>{offer.title}</h1>
          <p style={{ color: '#555', marginBottom: 12 }}>{offer.description}</p>

          <div className="price-row" style={{ marginBottom: 12 }}>
            <span className="discount" style={{ fontSize: 28 }}>{offer.discount}% OFF</span>
            {offer.original_price && <span className="original">₹{Number(offer.original_price).toLocaleString('en-IN')}</span>}
            {offer.offer_price && <span className="discounted" style={{ fontSize: 22 }}>₹{Number(offer.offer_price).toLocaleString('en-IN')}</span>}
          </div>

          <p>⏰ Valid till <strong>{expires}</strong></p>
          <p style={{ color: '#888', marginTop: 4 }}>👁 {offer.views} views</p>

          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {user && (
              <button className="btn-primary" style={{ width:'auto', padding:'10px 20px' }}
                onClick={toggleSave} disabled={saveLoading}>
                {saved ? '❤️ Saved' : '🤍 Save Offer'}
              </button>
            )}
            <button className="btn-primary"
              style={{ width:'auto', padding:'10px 20px', background:'#1565c0' }}
              onClick={getRoute}>
              🗺 Get Directions
            </button>
            {user && user.role === 'user' && !coming && (
              <div style={{ position:'relative' }}>
                <button className="btn-primary"
                  style={{ width:'auto', padding:'10px 20px', background:'#2e7d32' }}
                  onClick={() => markComing(15)}>
                  🚶 I'm Coming
                </button>
              </div>
            )}
          </div>

          {comingMsg && (
            <div style={{ marginTop:12, background: coming ? '#e8f5e9' : '#ffebee',
              color: coming ? '#2e7d32' : '#c62828', borderRadius:8,
              padding:'10px 16px', fontSize:14, fontWeight:600 }}>
              {coming ? '✅ ' : '⚠️ '}{comingMsg}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          <h3 style={{ marginBottom: 8 }}>📍 {offer.shop_name}</h3>
          <p style={{ color: '#666', marginBottom: 4 }}>{offer.address}</p>
          <p style={{ color: '#888', marginBottom: 12 }}>🏙 {offer.city}</p>
          <MapView
            center={[sLng, sLat]}
            markers={[
              { lng: sLng, lat: sLat, label: offer.shop_name },
              ...(userCoords ? [{ lng: userCoords.lng, lat: userCoords.lat, label: 'You', color: '#1565c0' }] : [])
            ]}
            route={route}
          />
        </div>
      </div>

      <div style={{ marginTop: 32 }}>
        <h2 style={{ color: '#e65100', marginBottom: 16 }}>Customer Reviews</h2>
        {user && (
          <form onSubmit={submitReview} style={{ background: '#fff', padding: 20, borderRadius: 12, marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
            <h3 style={{ marginBottom: 12 }}>Write a Review</h3>
            <div className="form-group">
              <label>Rating</label>
              <select value={reviewForm.rating} onChange={e => setReviewForm({ ...reviewForm, rating: +e.target.value })}>
                {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} ⭐</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Comment</label>
              <textarea placeholder="Share your experience..." value={reviewForm.comment}
                onChange={e => setReviewForm({ ...reviewForm, comment: e.target.value })} />
            </div>
            <button className="btn-primary" style={{ width: 'auto', padding: '10px 24px' }}>Submit</button>
          </form>
        )}
        {reviews.length === 0 ? <p style={{ color: '#888' }}>No reviews yet. Be the first!</p> :
          reviews.map(r => (
            <div key={r.id} style={{ background: '#fff', padding: 16, borderRadius: 10, marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{r.user_name}</strong>
                <span className="stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
              </div>
              <p style={{ color: '#555', marginTop: 6 }}>{r.comment}</p>
              <p style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
                {new Date(r.created_at).toLocaleDateString('en-IN')}
              </p>
            </div>
          ))
        }
      </div>
      {offer?.shop_id && <ChatWidget shopId={offer.shop_id} shopName={offer.shop_name} />}
    </div>
  );
}
