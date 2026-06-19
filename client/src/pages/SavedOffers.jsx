import { useState, useEffect } from 'react';
import api from '../services/api';
import OfferCard from '../components/OfferCard';

export default function SavedOffers() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/auth/me')
      .then(r => {
        setOffers(r.data.savedOffers || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('saved offers:', err.response?.data || err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="page">
      <h1 style={{ color: '#e65100', marginBottom: 24 }}>❤️ Saved Offers</h1>
      {loading ? <p className="loading">Loading...</p> :
        offers.length === 0 ? <p className="loading">No saved offers yet. Browse and save deals!</p> :
        <div className="offers-grid">
          {offers.map(offer => <OfferCard key={offer.id} offer={offer} />)}
        </div>
      }
    </div>
  );
}
