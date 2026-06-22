import { useState, useRef, useEffect } from 'react';
import api from '../services/api';

export default function ChatWidget({ shopId, shopName }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `Hi! 👋 I'm the assistant for ${shopName}. Ask me about our offers, prices, or location!` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const updated = [...messages, { role: 'user', content: text }];
    setMessages(updated);
    setLoading(true);
    try {
      const history = updated.slice(1).map(m => ({ role: m.role, content: m.content }));
      const { data } = await api.post('/chat/ask', { shop_id: shopId, message: text, history });
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, could not connect. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const onKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000 }}>
      {open && (
        <div style={{
          width: 320, height: 440, background: '#fff', borderRadius: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)', display: 'flex',
          flexDirection: 'column', marginBottom: 12, overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{ background: '#e65100', color: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>💬 {shopName}</div>
              <div style={{ fontSize: 11, opacity: 0.85 }}>AI Shop Assistant</div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.5,
                  background: m.role === 'user' ? '#e65100' : '#f5f5f5',
                  color: m.role === 'user' ? '#fff' : '#333',
                  borderBottomRightRadius: m.role === 'user' ? 4 : 12,
                  borderBottomLeftRadius: m.role === 'assistant' ? 4 : 12,
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ background: '#f5f5f5', borderRadius: 12, padding: '8px 14px', fontSize: 18, color: '#999' }}>
                  ···
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid #eee', display: 'flex', gap: 8 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask about offers, prices..."
              style={{ flex: 1, border: '1px solid #ddd', borderRadius: 20, padding: '8px 14px', fontSize: 13, outline: 'none' }}
              disabled={loading}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{ background: '#e65100', color: '#fff', border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ➤
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: 56, height: 56, borderRadius: '50%', background: '#e65100',
          color: '#fff', border: 'none', fontSize: 24, cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(230,81,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s',
        }}>
        {open ? '✕' : '💬'}
      </button>
    </div>
  );
}
