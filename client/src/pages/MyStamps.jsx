import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

export default function MyStamps() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stamps, setStamps] = useState([]);
  const [myCode, setMyCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [redeemMsg, setRedeemMsg] = useState({});

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    Promise.all([
      api.get('/stamps/mine'),
      api.get('/stamps/mycode'),
    ]).then(([s, c]) => {
      setStamps(s.data);
      setMyCode(c.data.code);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [user]);

  const redeem = async (id) => {
    try {
      const { data } = await api.post(`/stamps/redeem/${id}`);
      setRedeemMsg(prev => ({ ...prev, [id]: { ok: true, text: data.message } }));
      setStamps(prev => prev.map(s => s.id === id ? { ...s, redeemed: (s.redeemed || 0) + 1 } : s));
    } catch (err) {
      setRedeemMsg(prev => ({ ...prev, [id]: { ok: false, text: err.response?.data?.message || 'Error' } }));
    }
  };

  if (loading) return <p className="loading">Loading your stamps…</p>;

  return (
    <div className="page" style={{ maxWidth:640, margin:'0 auto' }}>
      <h1 style={{ color:'#e65100', marginBottom:4 }}>🎟 My Loyalty Stamps</h1>

      {/* Customer stamp code */}
      <div style={{ background:'#fff3e0', border:'2px solid #ffcc80', borderRadius:14, padding:'18px 24px', marginBottom:28, textAlign:'center' }}>
        <div style={{ fontSize:13, color:'#888', marginBottom:8 }}>Your stamp code — show this at shops</div>
        <div style={{ fontFamily:'monospace', fontSize:38, fontWeight:900, letterSpacing:10, color:'#e65100' }}>{myCode}</div>
      </div>

      {stamps.length === 0 && (
        <div style={{ textAlign:'center', padding:'48px 0', color:'#bbb' }}>
          <div style={{ fontSize:56 }}>🎟</div>
          <p style={{ marginTop:12 }}>No stamp cards yet</p>
          <p style={{ fontSize:13 }}>Visit shops and ask them to add your stamp code!</p>
        </div>
      )}

      {stamps.map(card => {
        const earned = Math.floor(card.stamps / card.required_stamps);
        const canRedeem = earned > (card.redeemed || 0);
        const progress = card.stamps % card.required_stamps || (canRedeem ? card.required_stamps : 0);
        const dots = card.required_stamps;

        return (
          <div key={card.id} style={{ background:'#fff', borderRadius:14, padding:20, marginBottom:16,
            boxShadow:'0 2px 12px rgba(0,0,0,.08)', border: canRedeem ? '2px solid #2e7d32' : '1px solid #f0e6d6' }}>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
              <div>
                <div style={{ fontWeight:700, fontSize:16 }}>{card.title}</div>
                <div style={{ fontSize:13, color:'#888', marginTop:2 }}>{card.shop_name}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#e65100' }}>🎁 {card.reward}</div>
              </div>
            </div>

            {/* Punch card dots */}
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
              {Array.from({ length: dots }).map((_, i) => (
                <div key={i} style={{
                  width:34, height:34, borderRadius:'50%',
                  background: i < progress ? '#e65100' : '#f5f5f5',
                  border: i < progress ? '2px solid #e65100' : '2px solid #ddd',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:16, transition:'background 0.2s',
                }}>
                  {i < progress ? '★' : ''}
                </div>
              ))}
            </div>

            <div style={{ fontSize:13, color:'#666', marginBottom: canRedeem ? 12 : 0 }}>
              {card.stamps} stamps collected · {card.required_stamps - progress} more for next reward
              {(card.redeemed || 0) > 0 && ` · ${card.redeemed} reward${card.redeemed > 1 ? 's' : ''} redeemed`}
            </div>

            {canRedeem && (
              <button onClick={() => redeem(card.id)}
                style={{ width:'100%', padding:'12px 0', background:'#2e7d32', color:'#fff', border:'none',
                  borderRadius:10, cursor:'pointer', fontWeight:700, fontSize:15 }}>
                🎉 Redeem Reward: {card.reward}
              </button>
            )}

            {redeemMsg[card.id] && (
              <div style={{ marginTop:10, padding:'10px 14px', borderRadius:8, fontWeight:600, fontSize:14,
                background: redeemMsg[card.id].ok ? '#e8f5e9' : '#ffebee',
                color: redeemMsg[card.id].ok ? '#2e7d32' : '#c62828' }}>
                {redeemMsg[card.id].text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
