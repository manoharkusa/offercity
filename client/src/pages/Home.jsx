import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import OffersScroll from '../components/OffersScroll';
import { HOME_CATEGORIES as CATEGORIES } from '../constants/categories';

const MapView = lazy(() => import('../components/MapView'));

const VISITOR_KEY = 'offercity_visitor';

export default function Home() {
  const { user, updateLocation } = useAuth();
  const navigate = useNavigate();
  const [offers, setOffers]           = useState([]);
  const [loading, setLoading]         = useState(true);
  // Start with Hyderabad default so offers load immediately — GPS updates it later
  const [coords, setCoords]           = useState({ lng: 78.4867, lat: 17.3850 });
  const [search, setSearch]           = useState('');
  const [category, setCategory]       = useState('All');
  const [radius, setRadius]           = useState(25);
  const [view, setView]               = useState('scroll');
  const [newOffersCount, setNewOffersCount] = useState(0);
  const [locationLabel, setLocationLabel]   = useState('Hyderabad');
  const [siteStats,     setSiteStats]       = useState(null);
  const [cities,        setCities]           = useState([]);
  const [selectedCity,  setSelectedCity]     = useState('');

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      ({ coords: c }) => {
        const pos = { lng: c.longitude, lat: c.latitude };
        setCoords(pos);
        setLocationLabel('Near You');
        if (user) updateLocation(pos.lng, pos.lat);
      },
      () => { /* keep Hyderabad default */ },
      { timeout: 6000, maximumAge: 60000 }
    );
  }, []);

  useEffect(() => {
    api.get('/visitors/count').then(r => setSiteStats(r.data)).catch(() => {});
    api.get('/shops/cities').then(r => setCities(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    fetchOffers();
  }, [coords, category, radius, selectedCity]);

  const fetchOffers = async () => {
    setLoading(true);
    try {
      const params = selectedCity
        ? { city: selectedCity }
        : { lat: coords.lat, lng: coords.lng, radius };
      if (category !== 'All') params.category = category;
      const { data } = await api.get('/offers', { params });
      setOffers(data);
      if (!user) {
        try {
          const raw = localStorage.getItem(VISITOR_KEY);
          if (raw) {
            const visitor = JSON.parse(raw);
            const diff = data.length - (visitor.lastOfferCount || 0);
            if (diff > 0 && visitor.lastOfferCount > 0) setNewOffersCount(diff);
            localStorage.setItem(VISITOR_KEY, JSON.stringify({ ...visitor, lastOfferCount: data.length, lastVisit: Date.now() }));
          }
        } catch (_) {}
      }
    } catch (err) {
      console.error('fetchOffers error:', err.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  const shopMarkers = [];
  const seenShops = new Set();
  offers.forEach(o => {
    if (o.lat && o.lng && !seenShops.has(o.shop_id)) {
      seenShops.add(o.shop_id);
      shopMarkers.push({ id: o.shop_id, lng: parseFloat(o.lng), lat: parseFloat(o.lat), label: o.shop_name, sublabel: `${o.category} · ${o.address}`, link: o.slug ? `/shop/${o.slug}` : null, color: '#e65100' });
    }
  });

  const handleSearch = (e) => {
    e.preventDefault();
    fetchOffers();
  };

  return (
    <div className="home-root">

      {/* ── HERO ── */}
      <section className="home-hero">
        <div className="home-hero-inner">
          <h1 className="hero-tagline">Discover the Best Deals<br />Near You — Every Day!</h1>
          <p className="hero-sub">Exclusive offers from local shops in your city</p>

          {/* Location + Search bar */}
          <form className="hero-search" onSubmit={handleSearch}>
            <div className="hero-loc">
              <span>📍</span>
              {selectedCity ? (
                <select
                  value={selectedCity}
                  onChange={e => { setSelectedCity(e.target.value); if (!e.target.value) setLocationLabel('Near You'); }}
                  className="hero-radius"
                  style={{ fontWeight: 600, color: '#e65100' }}
                >
                  <option value="">📍 Near You</option>
                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              ) : (
                <>
                  <select
                    value=""
                    onChange={e => { if (e.target.value) setSelectedCity(e.target.value); }}
                    className="hero-radius"
                    style={{ color: '#555' }}
                  >
                    <option value="">{locationLabel}</option>
                    {cities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={radius} onChange={e => setRadius(Number(e.target.value))} className="hero-radius">
                    <option value={1}>1 km</option>
                    <option value={3}>3 km</option>
                    <option value={5}>5 km</option>
                    <option value={10}>10 km</option>
                    <option value={25}>25 km</option>
                    <option value={50}>50 km</option>
                  </select>
                </>
              )}
            </div>
            <div className="hero-search-divider" />
            <input
              className="hero-search-input"
              placeholder="Search offers, shops or products…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button type="submit" className="hero-search-btn">🔍</button>
          </form>
        </div>
      </section>

      {/* ── CATEGORY PILL STRIP (sticky, horizontal scroll) ── */}
      <section className="home-cats-section">
        <div className="home-cats-inner">
          <div className="home-cats-strip">
            {CATEGORIES.map(cat => {
              const count = cat.key === 'All' ? offers.length : offers.filter(o => o.category === cat.key).length;
              return (
                <button
                  key={cat.key}
                  className={`cat-pill${category === cat.key ? ' active' : ''}`}
                  onClick={() => setCategory(cat.key)}
                >
                  <span className="cat-pill-icon">{cat.icon}</span>
                  <span className="cat-pill-name">{cat.label}</span>
                  {count > 0 && <span className="cat-pill-count">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── OFFERS SECTION ── */}
      <div className="home-offers-section">

        {newOffersCount > 0 && (
          <div className="new-offers-bar">
            <span>🎉 <strong>{newOffersCount} new offer{newOffersCount > 1 ? 's' : ''}</strong> added near you since your last visit!</span>
            <button onClick={() => setNewOffersCount(0)}>✕</button>
          </div>
        )}

        {/* Section header */}
        <div className="offers-section-head">
          <div>
            <h2 className="offers-section-title">
              {category === 'All' ? '🔥 All Nearby Offers' : `${CATEGORIES.find(c=>c.key===category)?.icon} ${category} Offers`}
            </h2>
            {!loading && (
              <p className="offers-section-sub">
                {offers.length} offer{offers.length !== 1 ? 's' : ''} found near you
                {siteStats && <span style={{ color: '#e65100', fontWeight: 600 }}> · 👁 {Number(siteStats.visits || 0).toLocaleString('en-IN')} views · {Number(siteStats.unique || 0).toLocaleString('en-IN')} visitors</span>}
              </p>
            )}
          </div>
          <button
            className="btn-map-toggle"
            onClick={() => setView(v => v === 'map' ? 'scroll' : 'map')}
          >
            {view === 'map' ? '🎞 Scroll View' : '🗺 Map View'}
          </button>
        </div>

        {!coords && <p className="loading">📍 Detecting your location…</p>}

        {/* MAP VIEW */}
        {view === 'map' && coords && (
          <>
            <p style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>📍 {shopMarkers.length} nearby shops on map. Click a pin to view.</p>
            <Suspense fallback={<div style={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading map…</div>}>
            <MapView
              center={[coords.lng, coords.lat]}
              markers={[
                { lng: coords.lng, lat: coords.lat, label: 'You are here', sublabel: 'Your location', color: '#1565c0' },
                ...shopMarkers
              ]}
              onMarkerClick={(m) => m.link && navigate(m.link)}
            />
            </Suspense>
            {shopMarkers.length > 0 && (
              <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {shopMarkers.map(m => (
                  <div key={m.id} onClick={() => m.link && navigate(m.link)}
                    style={{ background: '#fff', border: '1px solid #ffe0b2', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', minWidth: 160, boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#e65100', display: 'inline-block' }} />
                      <strong style={{ fontSize: 14 }}>{m.label}</strong>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888' }}>{m.sublabel}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* SCROLL FEED */}
        {view === 'scroll' && (
          loading
            ? <p className="loading">Loading nearby offers…</p>
            : offers.length === 0
              ? <p className="loading">No offers found near you. Try increasing the radius.</p>
              : <OffersScroll offers={offers} />
        )}
      </div>

    </div>
  );
}
