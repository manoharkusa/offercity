import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import OfferCard from '../components/OfferCard';
import MapView from '../components/MapView';

const CATEGORIES = ['All', 'Food', 'Fashion', 'Electronics', 'Beauty', 'Grocery', 'Health', 'Travel', 'Other'];

const VISITOR_KEY = 'offercity_visitor';

export default function Home() {
  const { user, updateLocation } = useAuth();
  const navigate = useNavigate();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [radius, setRadius] = useState(10);
  const [view, setView] = useState('grid');
  const [newOffersCount, setNewOffersCount] = useState(0);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      ({ coords: c }) => {
        const pos = { lng: c.longitude, lat: c.latitude };
        setCoords(pos);
        if (user) updateLocation(pos.lng, pos.lat);
      },
      () => setCoords({ lng: 78.4867, lat: 17.3850 }) // fallback: Hyderabad center
    );
  }, []);

  useEffect(() => {
    if (!coords) return;
    fetchOffers();
  }, [coords, category, radius]);

  const fetchOffers = async () => {
    setLoading(true);
    try {
      const params = { lat: coords.lat, lng: coords.lng, radius };
      if (category !== 'All') params.category = category;
      const { data } = await api.get('/offers', { params });
      setOffers(data);

      // New-offers notification for returning anonymous visitors
      if (!user) {
        try {
          const raw = localStorage.getItem(VISITOR_KEY);
          if (raw) {
            const visitor = JSON.parse(raw);
            const currentCount = data.length;
            const lastCount = visitor.lastOfferCount || 0;
            if (currentCount > lastCount && lastCount > 0) {
              setNewOffersCount(currentCount - lastCount);
            }
            localStorage.setItem(VISITOR_KEY, JSON.stringify({
              ...visitor, lastOfferCount: currentCount, lastVisit: Date.now()
            }));
          }
        } catch (_) {}
      }
    } catch (err) {
      console.error('fetchOffers error:', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  // Deduplicate by shop so each shop shows once on the map
  const shopMarkers = [];
  const seenShops = new Set();
  offers.forEach(o => {
    if (o.lat && o.lng && !seenShops.has(o.shop_id)) {
      seenShops.add(o.shop_id);
      shopMarkers.push({
        id: o.shop_id,
        lng: parseFloat(o.lng),
        lat: parseFloat(o.lat),
        label: o.shop_name,
        sublabel: `${o.category} · ${o.address}`,
        link: o.slug ? `/shop/${o.slug}` : null,
        color: '#e65100',
      });
    }
  });

  return (
    <div className="page">
      <h1 style={{ marginBottom: newOffersCount ? 12 : 20, color: '#e65100' }}>🔥 Nearby Offers & Deals</h1>

      {newOffersCount > 0 && (
        <div className="new-offers-bar">
          <span>🎉 <strong>{newOffersCount} new offer{newOffersCount > 1 ? 's' : ''}</strong> added near you since your last visit!</span>
          <button onClick={() => setNewOffersCount(0)}>✕</button>
        </div>
      )}

      <div className="search-bar">
        <input
          placeholder="Search offers or products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && fetchOffers()}
        />
        <select value={category} onChange={e => setCategory(e.target.value)}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={radius} onChange={e => setRadius(Number(e.target.value))}>
          <option value={1}>Within 1 km</option>
          <option value={3}>Within 3 km</option>
          <option value={5}>Within 5 km</option>
          <option value={10}>Within 10 km</option>
          <option value={25}>Within 25 km</option>
          <option value={50}>Within 50 km</option>
        </select>
        <button onClick={fetchOffers}>Search</button>
        <button
          onClick={() => setView(v => v === 'grid' ? 'map' : 'grid')}
          style={{ background: view === 'map' ? '#e65100' : '#555' }}
        >
          {view === 'grid' ? '🗺 Map View' : '⊞ Grid View'}
        </button>
      </div>

      {!coords && <p className="loading">📍 Detecting your location...</p>}

      {/* MAP VIEW — shows nearby shops as clickable pins */}
      {view === 'map' && coords && (
        <>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>
            📍 Click a pin to see the shop. Showing {shopMarkers.length} nearby shops.
          </p>
          <MapView
            center={[coords.lng, coords.lat]}
            markers={[
              { lng: coords.lng, lat: coords.lat, label: 'You are here', sublabel: 'Your location', color: '#1565c0' },
              ...shopMarkers
            ]}
            onMarkerClick={(m) => m.link && navigate(m.link)}
          />
          {shopMarkers.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 style={{ color: '#e65100', marginBottom: 12 }}>Shops on Map</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {shopMarkers.map(m => (
                  <div
                    key={m.id}
                    onClick={() => m.link && navigate(m.link)}
                    style={{
                      background: '#fff', border: '1px solid #ffe0b2', borderRadius: 10,
                      padding: '10px 14px', cursor: 'pointer', minWidth: 160,
                      boxShadow: '0 1px 4px rgba(0,0,0,.06)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e65100', display: 'inline-block' }} />
                      <strong style={{ fontSize: 14 }}>{m.label}</strong>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>{m.sublabel}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* GRID VIEW */}
      {view === 'grid' && (
        loading ? <p className="loading">Loading nearby offers...</p> :
        offers.length === 0
          ? <p className="loading">No offers found near you. Try increasing the radius.</p>
          : <div className="offers-grid">
              {offers.map(offer => <OfferCard key={offer.id} offer={offer} />)}
            </div>
      )}
    </div>
  );
}
