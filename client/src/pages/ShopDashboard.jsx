import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';

const CATEGORIES = ['Food', 'Fashion', 'Electronics', 'Beauty', 'Grocery', 'Health', 'Travel', 'Other'];
const DISCOUNTS  = [5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90];

const EMPTY_OFFER = { shop_id: '', title: '', description: '', category: 'Food', discount: '', original_price: '', offer_price: '', valid_until: '' };
const fmt   = (n) => n ? Number(n).toLocaleString('en-IN') : '';
const fmtSz = (b) => b < 1048576 ? `${(b/1024).toFixed(0)} KB` : `${(b/1048576).toFixed(1)} MB`;

const compressImage = (file, maxWidth = 900, quality = 0.82) =>
  new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(maxWidth / img.width, 1);
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(resolve, 'image/jpeg', quality);
    };
    img.src = url;
  });

export default function ShopDashboard() {
  const [tab, setTab]             = useState('shops');
  const [shops, setShops]         = useState([]);
  const [offers, setOffers]       = useState([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [shopForm, setShopForm]   = useState({ name:'', description:'', category:'Food', address:'', city:'', pin_code:'', lng:'', lat:'' });
  const [shopImageFile, setShopImageFile] = useState(null);
  const [shopImagePreview, setShopImagePreview] = useState(null);
  const [locDetecting, setLocDetecting] = useState(false);
  const [locAddress, setLocAddress]     = useState('');
  const [openQR, setOpenQR]             = useState(null); // shopId whose QR is shown
  const shopImageRef = useRef();
  const [offerForm, setOfferForm] = useState(EMPTY_OFFER);
  const [editingOffer, setEditingOffer] = useState(null);
  const [msg, setMsg]             = useState('');
  const [msgType, setMsgType]     = useState('ok');   // 'ok' | 'err'

  // stepped flow
  const [photoStep, setPhotoStep]       = useState('pick');  // pick | optimizing | details | success
  const [imageFile, setImageFile]       = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [compressStats, setCompressStats] = useState(null);
  const [uploading, setUploading]       = useState(false);
  const [postedOffer, setPostedOffer]   = useState(null);

  const cameraRef  = useRef();
  const galleryRef = useRef();
  const [cameraMsg, setCameraMsg] = useState('');

  const openCamera = async () => {
    setCameraMsg('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      setCameraMsg('Camera not supported in this browser. Please use Gallery.');
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some(d => d.kind === 'videoinput');
      if (!hasCamera) {
        setCameraMsg('No camera found on this device. Please use Gallery to upload a photo.');
        return;
      }
      cameraRef.current?.click();
    } catch {
      setCameraMsg('Could not access camera. Please use Gallery.');
    }
  };

  // Campaign / WhatsApp state
  const [waStatus, setWaStatus]           = useState({ status: 'disconnected', qr: null, contacts: 0 });
  const [activeCampaign, setActiveCampaign] = useState(null);
  const [campHistory, setCampHistory]     = useState([]);
  const [campMsg, setCampMsg]             = useState('');
  const [campOfferId, setCampOfferId]     = useState('');
  const [campLoading, setCampLoading]     = useState(false);
  const waTimer   = useRef(null);
  const campTimer = useRef(null);

  // Pairing code state (connect WhatsApp on same phone without scanning QR)
  const [pairPhone, setPairPhone]         = useState('');
  const [pairingCode, setPairingCode]     = useState('');
  const [pairLoading, setPairLoading]     = useState(false);
  const [pairCountdown, setPairCountdown] = useState(0);

  useEffect(() => {
    api.get('/shops/owner/mine').then(r => setShops(r.data)).catch(() => {});
  }, []);

  // Auto-select first shop as default (user can change if they have multiple)
  useEffect(() => {
    if (shops.length > 0 && !offerForm.shop_id) {
      setOfferForm(f => ({ ...f, shop_id: String(shops[0].id) }));
    }
  }, [shops]);

  useEffect(() => {
    if (selectedShop) api.get(`/offers/shop/${selectedShop}`).then(r => setOffers(r.data)).catch(() => {});
  }, [selectedShop]);

  // Auto-select first shop and always refresh offers when tab opens
  useEffect(() => {
    if (tab !== 'offers') return;
    if (!selectedShop && shops.length > 0) {
      setSelectedShop(String(shops[0].id));
    } else if (selectedShop) {
      api.get(`/offers/shop/${selectedShop}`).then(r => setOffers(r.data)).catch(() => {});
    }
  }, [tab]);

  // Auto-detect location when Add Shop tab opens (if not already set)
  useEffect(() => {
    if (tab === 'add-shop' && !shopForm.lat) getLocation(true);
  }, [tab]);

  // Poll WhatsApp status when on campaign tab
  useEffect(() => {
    if (tab !== 'campaign') { clearInterval(waTimer.current); return; }
    const poll = () => api.get('/campaigns/whatsapp/status').then(r => setWaStatus(r.data)).catch(() => {});
    poll();
    waTimer.current = setInterval(poll, 3000);
    api.get('/campaigns').then(r => setCampHistory(r.data)).catch(() => {});
    return () => clearInterval(waTimer.current);
  }, [tab]);

  // Poll active campaign progress every 4 sec
  useEffect(() => {
    if (!activeCampaign?.id || ['completed','stopped','failed'].includes(activeCampaign.status)) {
      clearInterval(campTimer.current); return;
    }
    campTimer.current = setInterval(() =>
      api.get(`/campaigns/${activeCampaign.id}`)
        .then(r => setActiveCampaign(r.data)).catch(() => {}),
    4000);
    return () => clearInterval(campTimer.current);
  }, [activeCampaign?.id, activeCampaign?.status]);

  const flash = (m, type = 'ok') => { setMsg(m); setMsgType(type); setTimeout(() => setMsg(''), 5000); };

  // Reset pairing state when WhatsApp connects or disconnects
  useEffect(() => {
    if (waStatus.status === 'connected' || waStatus.status === 'disconnected') {
      setPairingCode(''); setPairPhone(''); setPairCountdown(0);
    }
  }, [waStatus.status]);

  const getPairingCode = async () => {
    setPairLoading(true);
    setPairingCode('');
    setPairCountdown(0);
    try {
      const { data } = await api.post('/campaigns/whatsapp/connect-pairing', { phone: pairPhone.replace(/\D/g, '') });
      setPairingCode(data.code);
      setPairCountdown(60);
    } catch (err) {
      flash(err.response?.data?.message || 'Could not get pairing code', 'err');
    } finally { setPairLoading(false); }
  };

  // 60-second countdown after pairing code is received
  useEffect(() => {
    if (!pairingCode || pairCountdown <= 0) return;
    const t = setTimeout(() => setPairCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [pairingCode, pairCountdown]);

  const resetOffer = () => {
    const defaultShopId = shops.length > 0 ? String(shops[0].id) : '';
    setOfferForm({ ...EMPTY_OFFER, shop_id: defaultShopId });
    setEditingOffer(null);
    setImageFile(null);
    setImagePreview(null);
    setCompressStats(null);
    setPhotoStep('pick');
    setPostedOffer(null);
  };

  // Auto-calculate offer price when discount or original price changes
  const setDiscount = (val) => {
    const disc = Number(val);
    const orig = Number(offerForm.original_price);
    const newOffer = orig && disc ? String(Math.round(orig * (1 - disc / 100))) : offerForm.offer_price;
    setOfferForm(f => ({ ...f, discount: val, offer_price: newOffer }));
  };

  const setOriginalPrice = (val) => {
    const orig = Number(val);
    const disc = Number(offerForm.discount);
    const newOffer = orig && disc ? String(Math.round(orig * (1 - disc / 100))) : offerForm.offer_price;
    setOfferForm(f => ({ ...f, original_price: val, offer_price: newOffer }));
  };

  const handleImage = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const originalSize = file.size;
    setPhotoStep('optimizing');
    setImagePreview(URL.createObjectURL(file));
    const compressed = await compressImage(file);
    setImageFile(compressed);
    setImagePreview(URL.createObjectURL(compressed));
    setCompressStats({ original: fmtSz(originalSize), compressed: fmtSz(compressed.size), saved: Math.round((1 - compressed.size / originalSize) * 100) });
    setPhotoStep('details');
  }, []);

  const buildFD = (extra = {}) => {
    const fd = new FormData();
    const payload = { ...offerForm, ...extra };
    Object.entries(payload).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
    if (imageFile) fd.append('image', imageFile, 'offer.jpg');
    return fd;
  };

  const submitOffer = async (e) => {
    e.preventDefault();
    const shopId = offerForm.shop_id || (shops.length > 0 ? String(shops[0].id) : '');
    if (!shopId) { flash('Please select a shop first', 'err'); return; }
    setUploading(true);
    try {
      const fd = buildFD({ shop_id: shopId });
      const { data } = await api.post('/offers', fd);
      setOffers(prev => [...prev, data]);
      setPostedOffer(data);
      setPhotoStep('success');
    } catch (err) {
      flash(err.response?.data?.message || 'Error posting offer — please try again', 'err');
    } finally { setUploading(false); }
  };

  const startEdit = (offer) => {
    setEditingOffer(offer.id);
    setOfferForm({
      shop_id: String(offer.shop_id), title: offer.title, description: offer.description || '',
      category: offer.category || 'Food', discount: String(offer.discount),
      original_price: offer.original_price ? String(offer.original_price) : '',
      offer_price: offer.offer_price ? String(offer.offer_price) : '',
      valid_until: offer.valid_until ? offer.valid_until.slice(0, 10) : '',
      is_active: offer.is_active
    });
    if (offer.image) { setImagePreview(offer.image); setPhotoStep('details'); }
    else setPhotoStep('pick');
    setTab('add-offer');
  };

  const updateOffer = async (e) => {
    e.preventDefault();
    setUploading(true);
    try {
      const { data } = await api.put(`/offers/${editingOffer}`, buildFD());
      setOffers(prev => prev.map(o => o.id === editingOffer ? data : o));
      flash('✅ Offer updated successfully!');
      resetOffer();
      setTab('offers');
    } catch (err) {
      flash(err.response?.data?.message || 'Error updating offer', 'err');
    } finally { setUploading(false); }
  };

  const toggleActive = async (offer) => {
    try {
      const { data } = await api.put(`/offers/${offer.id}`, { is_active: !offer.is_active });
      setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, is_active: data.is_active } : o));
    } catch { flash('Error toggling offer', 'err'); }
  };

  const deleteOffer = async (id) => {
    if (!window.confirm('Delete this offer?')) return;
    try { await api.delete(`/offers/${id}`); setOffers(prev => prev.filter(o => o.id !== id)); flash('Offer deleted.'); }
    catch { flash('Error deleting offer', 'err'); }
  };

  const getLocation = (silent = false) => {
    if (!navigator.geolocation) { if (!silent) flash('Geolocation not supported by your browser', 'err'); return; }
    setLocDetecting(true);
    setLocAddress('');
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const lat = coords.latitude.toFixed(6);
        const lng = coords.longitude.toFixed(6);
        setShopForm(f => ({ ...f, lat, lng }));
        setLocDetecting(false);
        // Reverse geocode to show human-readable address
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const d = await r.json();
          setLocAddress(d.display_name || `${lat}, ${lng}`);
        } catch { setLocAddress(`${lat}, ${lng}`); }
      },
      (err) => {
        setLocDetecting(false);
        if (!silent) flash('Could not detect location. Please enter manually.', 'err');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const validUntilDisplay = offerForm.valid_until
    ? new Date(offerForm.valid_until + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
    : null;

  const savingsAmt = offerForm.original_price && offerForm.offer_price
    ? Number(offerForm.original_price) - Number(offerForm.offer_price)
    : null;

  const qrImgUrl = (pageUrl) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(pageUrl)}&margin=12&color=1a1a1a&bgcolor=ffffff`;

  const downloadQR = async (pageUrl, shopName) => {
    try {
      const res = await fetch(qrImgUrl(pageUrl));
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${shopName.replace(/\s+/g, '-').toLowerCase()}-qr.png`;
      a.click();
    } catch { flash('Could not download QR. Try right-click → Save image.', 'err'); }
  };

  const shopUrl = (s) => {
    if (!s) return '';
    const city = (s.city || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return city ? `/${city}/${s.slug}` : `/shop/${s.slug}`;
  };

  const buildWAMessage = (offer) => {
    const shop = shops.find(s => s.id === (offer?.shop_id));
    const validDate = offer?.valid_until
      ? new Date(offer.valid_until).toLocaleDateString('en-IN', { day:'numeric', month:'short' }) : '';
    return `🔥 *${offer?.title}* — ${offer?.discount}% OFF!\n💰 ₹${fmt(offer?.offer_price)} (was ₹${fmt(offer?.original_price)})\n📍 ${shop?.name || ''}, ${shop?.city || ''}\n⏰ Valid till ${validDate}\n\n👉 ${window.location.origin}${shopUrl(shop)}`;
  };

  const startCampaign = async () => {
    if (!campMsg.trim()) { flash('Please write a message first', 'err'); return; }
    setCampLoading(true);
    try {
      const offerId = campOfferId ? Number(campOfferId) : null;
      const shopId  = offerId ? offers.find(o => o.id === offerId)?.shop_id : null;
      const { data } = await api.post('/campaigns', { offer_id: offerId, shop_id: shopId, message: campMsg });
      setActiveCampaign(data);
      setCampHistory(h => [data, ...h]);
    } catch (err) {
      flash(err.response?.data?.message || 'Could not start campaign', 'err');
    } finally { setCampLoading(false); }
  };

  const pauseCampaign  = (id) => api.post(`/campaigns/${id}/pause`).then(() => setActiveCampaign(a => ({...a, status:'paused'})));
  const resumeCampaign = (id) => api.post(`/campaigns/${id}/resume`).then(() => setActiveCampaign(a => ({...a, status:'running'})));
  const stopCampaign   = (id) => { if (window.confirm('Stop this campaign?')) api.post(`/campaigns/${id}/stop`).then(() => setActiveCampaign(a => ({...a, status:'stopped'}))); };

  const WA_STATUS_LABEL = { disconnected:'Disconnected', connecting:'Connecting…', waiting_scan:'Scan QR Code', connected:'Connected ✅', reconnecting:'Reconnecting…', unavailable:'Not available on this server', error:'Error' };
  const WA_STATUS_COLOR = { disconnected:'#888', connecting:'#f57c00', waiting_scan:'#1565c0', connected:'#2e7d32', reconnecting:'#f57c00', unavailable:'#c62828', error:'#c62828' };

  return (
    <div className="page sd-pg">
      <div className="sd-header">
        <span className="sd-header-icon">🏪</span>
        <div>
          <div className="sd-header-name">Shop Dashboard</div>
          <div className="sd-header-sub">{shops.length} shop{shops.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div className="dashboard">

        <aside className="sidebar">
          <h3>Menu</h3>
          {[
            ['shops',    '🏪 My Shops'],
            ['add-shop', '➕ Add Shop'],
            ['offers',   '🏷 My Offers'],
            ['add-offer', editingOffer ? '✏️ Edit Offer' : '➕ Add Offer'],
            ['campaign', '📣 Campaign']
          ].map(([t, label]) => (
            <button key={t} className={tab === t ? 'active' : ''}
              onClick={() => { if (t !== 'add-offer') resetOffer(); setTab(t); }}>
              {label}
              {t === 'campaign' && waStatus.status === 'connected' && (
                <span style={{ marginLeft:6, background:'#25D366', color:'#fff', borderRadius:10, padding:'1px 6px', fontSize:11 }}>ON</span>
              )}
            </button>
          ))}
        </aside>

        <div className="panel">
          {msg && (
            <p style={{ color: msgType==='err' ? '#c62828' : '#2e7d32',
                        background: msgType==='err' ? '#ffebee' : '#e8f5e9',
                        padding:'10px 14px', borderRadius:8, marginBottom:16 }}>
              {msg}
            </p>
          )}

          {/* ── My Shops ── */}
          {tab === 'shops' && (
            <>
              <h2>My Shops</h2>
              {shops.length === 0
                ? <p style={{ color:'#888' }}>No shops yet. Click "Add Shop".</p>
                : shops.map(s => {
                  const link = `${window.location.origin}${shopUrl(s)}`;
                  return (
                    <div key={s.id} style={{ background:'#fff', borderRadius:12, padding:20, marginBottom:16, boxShadow:'0 2px 8px rgba(0,0,0,.07)', border:'1px solid #f0e6d6' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:8, alignItems:'flex-start' }}>
                        <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                          {s.image
                            ? <img src={s.image} alt="" style={{ width:60, height:60, objectFit:'cover', borderRadius:10, flexShrink:0 }} />
                            : <div style={{ width:60, height:60, background:'#ffe0b2', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>🏪</div>
                          }
                          <div>
                            <h3 style={{ margin:'0 0 4px', color:'#e65100' }}>{s.name}</h3>
                            <p style={{ margin:0, color:'#888', fontSize:13 }}>{s.address} · {s.city}{s.pin_code ? ` – ${s.pin_code}` : ''} · {s.category}</p>
                          </div>
                        </div>
                        <a href={shopUrl(s)} target="_blank" rel="noreferrer"
                          style={{ padding:'6px 14px', background:'#e65100', color:'#fff', borderRadius:8, fontSize:13, textDecoration:'none', fontWeight:600 }}>
                          🔗 View Page
                        </a>
                      </div>
                      <div className="shop-share-row" style={{ background:'#fff8f0', border:'1px solid #ffe0b2', borderRadius:8, padding:'10px 14px', marginTop:14, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                        <span style={{ fontSize:13, color:'#555', flex:1, wordBreak:'break-all', minWidth:0 }}>📲 <span style={{ color:'#e65100' }}>{link}</span></span>
                        <button onClick={() => { navigator.clipboard.writeText(link); flash('Link copied!'); }}
                          style={{ padding:'8px 16px', background:'#e65100', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600 }}>📋 Copy</button>
                        <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(`🛍️ *${s.name}* on OfferCity!\n📍 ${s.address}, ${s.city}${s.pin_code ? ' – ' + s.pin_code : ''}\n👉 ${link}`)}`, '_blank')}
                          style={{ padding:'8px 16px', background:'#25D366', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontSize:13, fontWeight:600 }}>💬 WhatsApp</button>
                      </div>
                    </div>
                  );
                })
              }
            </>
          )}

          {/* ── Add Shop ── */}
          {tab === 'add-shop' && (
            <>
              <h2>Register a Shop</h2>
              <form onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const fd = new FormData();
                  Object.entries(shopForm).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) fd.append(k, v); });
                  if (shopImageFile) fd.append('image', shopImageFile, 'shop.jpg');
                  const { data } = await api.post('/shops', fd);
                  setShops(p => [...p, data]);
                  flash('Shop registered! Your shop page is now live.');
                  setShopForm({ name:'', description:'', category:'Food', address:'', city:'', pin_code:'', lng:'', lat:'' });
                  setShopImageFile(null);
                  setShopImagePreview(null);
                } catch (err) { flash(err.response?.data?.message || 'Error', 'err'); }
              }}>

                {/* Shop Photo */}
                <div className="form-group">
                  <label>Shop / Business Photo</label>
                  {shopImagePreview
                    ? (
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
                        <img src={shopImagePreview} alt="" style={{ width:80, height:70, objectFit:'cover', borderRadius:10, border:'2px solid #e65100' }} />
                        <button type="button" onClick={() => { setShopImageFile(null); setShopImagePreview(null); }}
                          style={{ padding:'6px 12px', background:'#eee', border:'none', borderRadius:6, cursor:'pointer', fontSize:13 }}>🗑 Remove</button>
                      </div>
                    )
                    : (
                      <div style={{ border:'2px dashed #ffb74d', borderRadius:10, padding:'18px', textAlign:'center', cursor:'pointer', background:'#fff8f0', marginBottom:8 }}
                        onClick={() => shopImageRef.current?.click()}>
                        <div style={{ fontSize:32 }}>📸</div>
                        <p style={{ margin:'4px 0 0', fontSize:13, color:'#e65100' }}>Tap to add shop photo</p>
                      </div>
                    )
                  }
                  <input ref={shopImageRef} type="file" accept="image/*" style={{ display:'none' }}
                    onChange={async (e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const compressed = await compressImage(file);
                      setShopImageFile(compressed);
                      setShopImagePreview(URL.createObjectURL(compressed));
                    }} />
                </div>

                {[['name','Shop / Business Name',true],['description','Description (what you sell)',false],['address','Full Address',true]].map(([k,l,req]) => (
                  <div className="form-group" key={k}>
                    <label>{l}</label>
                    <input value={shopForm[k]} onChange={e => setShopForm({ ...shopForm, [k]: e.target.value })} required={req} />
                  </div>
                ))}

                <div style={{ display:'flex', gap:10 }}>
                  <div className="form-group" style={{ flex:2 }}>
                    <label>City / Village *</label>
                    <input value={shopForm.city} onChange={e => setShopForm({ ...shopForm, city: e.target.value })} required placeholder="e.g. Hyderabad" />
                  </div>
                  <div className="form-group" style={{ flex:1 }}>
                    <label>PIN Code *</label>
                    <input value={shopForm.pin_code} onChange={e => setShopForm({ ...shopForm, pin_code: e.target.value })} required placeholder="500001" maxLength={6} pattern="\d{6}" title="6-digit PIN code" />
                  </div>
                </div>

                <div className="form-group">
                  <label>Category</label>
                  <select value={shopForm.category} onChange={e => setShopForm({ ...shopForm, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                {/* Location */}
                <div style={{ background: shopForm.lat ? '#e8f5e9' : '#fff3e0', border: `2px solid ${shopForm.lat ? '#66bb6a' : '#ffb74d'}`, borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: shopForm.lat ? 8 : 0 }}>
                    <span style={{ fontWeight:600, fontSize:14, color: shopForm.lat ? '#2e7d32' : '#e65100' }}>
                      {locDetecting ? '⏳ Detecting location…' : shopForm.lat ? '📍 Location detected' : '📍 Location required *'}
                    </span>
                    <button type="button" onClick={() => getLocation(false)}
                      style={{ padding:'6px 14px', background:'#1565c0', color:'#fff', border:'none', borderRadius:7, cursor:'pointer', fontSize:13, fontWeight:600 }}>
                      {locDetecting ? 'Detecting…' : shopForm.lat ? '🔄 Re-detect' : '📍 Detect Location'}
                    </button>
                  </div>
                  {locAddress && <p style={{ margin:'4px 0 8px', fontSize:12, color:'#555' }}>{locAddress}</p>}
                  {shopForm.lat && (
                    <div style={{ display:'flex', gap:10 }}>
                      <div className="form-group" style={{ flex:1, marginBottom:0 }}>
                        <label style={{ fontSize:12 }}>Longitude (editable)</label>
                        <input value={shopForm.lng} onChange={e => setShopForm({ ...shopForm, lng: e.target.value })} required placeholder="78.4867" style={{ marginBottom:0 }} />
                      </div>
                      <div className="form-group" style={{ flex:1, marginBottom:0 }}>
                        <label style={{ fontSize:12 }}>Latitude (editable)</label>
                        <input value={shopForm.lat} onChange={e => setShopForm({ ...shopForm, lat: e.target.value })} required placeholder="17.3850" style={{ marginBottom:0 }} />
                      </div>
                    </div>
                  )}
                </div>
                <button className="btn-primary" type="submit" disabled={!shopForm.lat || locDetecting}>
                  {!shopForm.lat ? '📍 Detect Location First' : 'Register Shop'}
                </button>
              </form>
            </>
          )}

          {/* ── My Offers ── */}
          {tab === 'offers' && (
            <>
              <h2>My Offers</h2>
              <div className="form-group" style={{ marginBottom:16 }}>
                <select value={selectedShop} onChange={e => setSelectedShop(e.target.value)}>
                  <option value="">— Select a shop —</option>
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {!selectedShop ? <p style={{ color:'#888' }}>Select a shop to see offers.</p>
                : offers.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'32px 16px' }}>
                    <div style={{ fontSize:40, marginBottom:8 }}>🏷</div>
                    <p style={{ fontSize:15, color:'#888', marginBottom:4 }}>No offers yet</p>
                    <p style={{ fontSize:13, color:'#bbb' }}>Tap <strong>Add Offer</strong> to post your first deal</p>
                  </div>
                )
                : (
                  <>
                    {/* Desktop table */}
                    <div className="table-scroll sd-offers-table"><table className="data-table">
                      <thead><tr><th>Photo</th><th>Title</th><th>Discount</th><th>Price</th><th>Valid</th><th>Status</th><th>Views</th><th></th></tr></thead>
                      <tbody>
                        {offers.map(o => (
                          <tr key={o.id}>
                            <td>{o.image ? <img src={o.image} alt="" style={{ width:44, height:38, objectFit:'cover', borderRadius:6 }} /> : <span>📷</span>}</td>
                            <td><strong>{o.title}</strong></td>
                            <td style={{ color:'#e65100', fontWeight:700 }}>{o.discount}% OFF</td>
                            <td>
                              {o.original_price && <span style={{ textDecoration:'line-through', color:'#aaa', fontSize:12 }}>₹{fmt(o.original_price)}</span>}
                              {o.offer_price && <span style={{ color:'#2e7d32', fontWeight:600, marginLeft:4 }}>₹{fmt(o.offer_price)}</span>}
                            </td>
                            <td style={{ fontSize:12 }}>{o.valid_until ? new Date(o.valid_until).toLocaleDateString('en-IN') : '—'}</td>
                            <td><span className={`tag ${o.is_active ? 'green' : 'red'}`}>{o.is_active ? 'Active' : 'Off'}</span></td>
                            <td>👁 {o.views||0}</td>
                            <td style={{ whiteSpace:'nowrap' }}>
                              <button onClick={() => startEdit(o)} style={{ color:'#1565c0', background:'none', border:'none', cursor:'pointer', marginRight:6 }}>✏️</button>
                              <button onClick={() => toggleActive(o)} style={{ color: o.is_active?'#e65100':'#2e7d32', background:'none', border:'none', cursor:'pointer', marginRight:6 }}>{o.is_active?'⏸':'▶️'}</button>
                              <button onClick={() => deleteOffer(o.id)} style={{ color:'#c62828', background:'none', border:'none', cursor:'pointer' }}>🗑</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table></div>

                    {/* Mobile cards */}
                    <div className="sd-offer-cards">
                      {offers.map(o => (
                        <div key={o.id} className="sd-oc">
                          <div className="sd-oc-img">
                            {o.image ? <img src={o.image} alt="" /> : <span>📷</span>}
                            <span className={`sd-oc-badge ${o.is_active ? 'live' : 'off'}`}>
                              {o.is_active ? 'Live' : 'Off'}
                            </span>
                          </div>
                          <div className="sd-oc-body">
                            <div className="sd-oc-title">{o.title}</div>
                            <div className="sd-oc-price-row">
                              <span className="sd-oc-pct">{o.discount}% OFF</span>
                              {o.offer_price && <span className="sd-oc-final">₹{fmt(o.offer_price)}</span>}
                              {o.original_price && <span className="sd-oc-orig">₹{fmt(o.original_price)}</span>}
                            </div>
                            <div className="sd-oc-foot">
                              {o.valid_until ? `⏰ Till ${new Date(o.valid_until).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}` : ''}&nbsp;· 👁 {o.views||0}
                            </div>
                          </div>
                          <div className="sd-oc-acts">
                            <button onClick={() => startEdit(o)} title="Edit">✏️</button>
                            <button onClick={() => toggleActive(o)} title={o.is_active?'Deactivate':'Activate'}>{o.is_active?'⏸':'▶️'}</button>
                            <button onClick={() => deleteOffer(o.id)} className="sd-del" title="Delete">🗑</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )
              }
            </>
          )}

          {/* ── Add / Edit Offer ── */}
          {tab === 'add-offer' && (
            <>
              {/* Step indicator */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                <h2 style={{ margin:0 }}>{editingOffer ? '✏️ Edit Offer' : '➕ New Offer'}</h2>
                {photoStep !== 'success' && (
                  <div className="step-indicators">
                    {['pick','optimizing','details'].map((s, i) => (
                      <span key={s} style={{ display:'flex', alignItems:'center', gap:4 }}>
                        {i > 0 && <span className="step-line" />}
                        <span className={`step-dot ${photoStep===s?'active':((['pick','optimizing','details'].indexOf(photoStep) > i)?'done':'')}`}>{i+1}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* STEP 1 — Pick Photo */}
              {photoStep === 'pick' && (
                <div className="photo-pick-screen">
                  <div className="photo-pick-hero">
                    <span style={{ fontSize:56 }}>📸</span>
                    <h3>Add a Product Photo</h3>
                    <p>Offers with photos get <strong>3× more views</strong></p>
                  </div>
                  <div className="photo-pick-btns">
                    <button className="photo-btn camera" onClick={openCamera}>
                      <span>📷</span><strong>Take Photo</strong><small>Open camera</small>
                    </button>
                    <button className="photo-btn gallery" onClick={() => { setCameraMsg(''); galleryRef.current?.click(); }}>
                      <span>🖼</span><strong>Gallery</strong><small>Choose existing</small>
                    </button>
                  </div>
                  {cameraMsg && (
                    <div style={{ margin:'10px auto', padding:'10px 16px', background:'#fff3cd', border:'1px solid #ffc107', borderRadius:8, color:'#7a5700', fontSize:13, maxWidth:340, textAlign:'center' }}>
                      ⚠️ {cameraMsg}
                    </div>
                  )}
                  <input ref={cameraRef}  type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e => handleImage(e.target.files[0])} />
                  <input ref={galleryRef} type="file" accept="image/*"                        style={{ display:'none' }} onChange={e => handleImage(e.target.files[0])} />
                  <button className="photo-skip-btn" onClick={() => setPhotoStep('details')}>Skip photo, just add details →</button>
                </div>
              )}

              {/* STEP 2 — Optimizing */}
              {photoStep === 'optimizing' && (
                <div className="optimizing-screen">
                  {imagePreview && <img src={imagePreview} alt="" className="optimizing-thumb" />}
                  <div className="optimizing-content">
                    <div className="opt-spinner" />
                    <h3>Optimizing your photo...</h3>
                    <p>Compressing & resizing for fast loading ✨</p>
                  </div>
                </div>
              )}

              {/* STEP 3 — Offer Details */}
              {photoStep === 'details' && (
                <div className="offer-creator">

                  {/* Left: Form */}
                  <div className="offer-form-col">

                    {/* Photo bar */}
                    {imagePreview && (
                      <div className="photo-preview-bar">
                        <img src={imagePreview} alt="" className="photo-bar-img" />
                        <div className="photo-bar-info">
                          {compressStats
                            ? <><span className="compress-badge">✅ Optimized</span><span className="compress-detail">{compressStats.original} → {compressStats.compressed} ({compressStats.saved}% smaller)</span></>
                            : <span className="compress-badge">📸 Current photo</span>
                          }
                        </div>
                        <button className="photo-bar-change" onClick={() => { setImageFile(null); setImagePreview(null); setCompressStats(null); setPhotoStep('pick'); }}>🔄 Change</button>
                      </div>
                    )}

                    <form onSubmit={editingOffer ? updateOffer : submitOffer}>

                      {shops.length > 1 && (
                        <div className="form-group">
                          <label>Shop *</label>
                          <select value={offerForm.shop_id} onChange={e => setOfferForm({ ...offerForm, shop_id: e.target.value })} required>
                            <option value="">— Select shop —</option>
                            {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                      )}

                      <div className="form-group">
                        <label>Offer Title *</label>
                        <input value={offerForm.title} onChange={e => setOfferForm({ ...offerForm, title: e.target.value })}
                          required placeholder="e.g. Flat 40% Off on Sarees" />
                      </div>

                      {/* Discount + Price row */}
                      <div className="quick-price-row">
                        <div className="form-group">
                          <label>Discount *</label>
                          <select value={offerForm.discount} onChange={e => setDiscount(e.target.value)} required
                            style={{ fontWeight:700, color: offerForm.discount ? '#e65100' : '#999' }}>
                            <option value="">— % —</option>
                            {DISCOUNTS.map(d => <option key={d} value={d}>{d}% OFF</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Original Price ₹ *</label>
                          <input type="number" value={offerForm.original_price} required
                            onChange={e => setOriginalPrice(e.target.value)} placeholder="e.g. 1500" />
                        </div>
                      </div>

                      {/* Calculated offer price box */}
                      {offerForm.discount && offerForm.original_price && (
                        <div className="offer-price-box">
                          <div className="offer-price-box-inner">
                            <span className="opb-label">Customer pays</span>
                            <span className="opb-price">₹{fmt(offerForm.offer_price)}</span>
                            <span className="opb-saves">saves ₹{fmt(savingsAmt)}</span>
                          </div>
                          <div className="opb-badge">{offerForm.discount}% OFF</div>
                        </div>
                      )}

                      <div style={{ display:'flex', gap:12 }}>
                        <div className="form-group" style={{ flex:1 }}>
                          <label>Category</label>
                          <select value={offerForm.category} onChange={e => setOfferForm({ ...offerForm, category: e.target.value })}>
                            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ flex:1 }}>
                          <label>Valid Until *</label>
                          <input type="date" value={offerForm.valid_until}
                            onChange={e => setOfferForm({ ...offerForm, valid_until: e.target.value })}
                            required min={new Date().toISOString().slice(0,10)} />
                        </div>
                      </div>

                      <div className="form-group">
                        <label>Description <span style={{ color:'#bbb', fontWeight:400 }}>(optional)</span></label>
                        <textarea value={offerForm.description} rows={2}
                          onChange={e => setOfferForm({ ...offerForm, description: e.target.value })}
                          placeholder="Any extra details for customers..." />
                      </div>

                      {editingOffer && (
                        <div className="form-group" style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <input type="checkbox" id="activeToggle" checked={!!offerForm.is_active}
                            onChange={e => setOfferForm({ ...offerForm, is_active: e.target.checked })} />
                          <label htmlFor="activeToggle" style={{ margin:0 }}>Active (visible to customers)</label>
                        </div>
                      )}

                      <div style={{ display:'flex', gap:12, marginTop:12 }}>
                        <button className="btn-post-offer" type="submit" disabled={uploading}>
                          {uploading ? '⏳ Posting...' : editingOffer ? '💾 Save Changes' : '🚀 Post Offer Now'}
                        </button>
                        <button type="button" onClick={() => { resetOffer(); setTab(editingOffer ? 'offers' : 'add-offer'); }}
                          style={{ padding:'0 20px', background:'#eee', border:'none', borderRadius:10, cursor:'pointer', fontWeight:600 }}>✕</button>
                      </div>
                    </form>
                  </div>

                  {/* Right: Live Preview */}
                  <div className="offer-preview-col">
                    <p className="preview-label">👁 CUSTOMER PREVIEW</p>
                    <div className="offer-card preview-card">
                      {imagePreview
                        ? <img src={imagePreview} alt="offer" style={{ width:'100%', height:180, objectFit:'cover' }} />
                        : <div className="no-img" style={{ height:140, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6 }}>
                            <span style={{ fontSize:32 }}>📸</span><span style={{ fontSize:12, color:'#bbb' }}>No photo yet</span>
                          </div>
                      }
                      <div className="card-body">
                        {offerForm.category && <span className="badge">{offerForm.category}</span>}
                        <h3 style={{ margin:'8px 0 4px', fontSize:15, lineHeight:1.3 }}>
                          {offerForm.title || <span style={{ color:'#ccc' }}>Your offer title</span>}
                        </h3>
                        {offerForm.description && <p style={{ color:'#666', fontSize:12, marginBottom:8 }}>{offerForm.description}</p>}
                        <div className="price-row">
                          {offerForm.discount && <span className="discount">{offerForm.discount}% OFF</span>}
                          {offerForm.original_price && <span className="original">₹{fmt(offerForm.original_price)}</span>}
                          {offerForm.offer_price && <span className="discounted">₹{fmt(offerForm.offer_price)}</span>}
                        </div>
                        {validUntilDisplay && <p className="meta">⏰ Valid till {validUntilDisplay}</p>}
                      </div>
                    </div>
                    <p style={{ color:'#bbb', fontSize:11, textAlign:'center', marginTop:8 }}>Updates live as you type</p>
                  </div>
                </div>
              )}

              {/* STEP 4 — Success */}
              {photoStep === 'success' && postedOffer && (
                <div className="success-screen">
                  <div className="success-icon">🎉</div>
                  <h2>Offer Posted!</h2>
                  <p>Your offer is now live and visible to nearby customers</p>

                  <div className="offer-card" style={{ maxWidth:300, margin:'20px auto' }}>
                    {postedOffer.image
                      ? <img src={postedOffer.image} alt="" style={{ width:'100%', height:160, objectFit:'cover' }} />
                      : <div className="no-img" style={{ height:100, display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ fontSize:28 }}>📸</span></div>
                    }
                    <div className="card-body">
                      <span className="badge">{postedOffer.category}</span>
                      <h3 style={{ margin:'8px 0 4px', fontSize:15 }}>{postedOffer.title}</h3>
                      <div className="price-row">
                        <span className="discount">{postedOffer.discount}% OFF</span>
                        {postedOffer.original_price && <span className="original">₹{fmt(postedOffer.original_price)}</span>}
                        {postedOffer.offer_price && <span className="discounted">₹{fmt(postedOffer.offer_price)}</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginTop:8 }}>
                    <button className="btn-post-offer" style={{ flex:'0 0 auto', padding:'12px 28px' }}
                      onClick={() => { resetOffer(); setTab('add-offer'); }}>
                      ➕ Post Another Offer
                    </button>
                    <button onClick={() => { setSelectedShop(String(postedOffer.shop_id)); setTab('offers'); }}
                      style={{ padding:'12px 28px', background:'#fff', border:'2px solid #e65100', color:'#e65100', borderRadius:10, cursor:'pointer', fontWeight:700 }}>
                      📋 View My Offers
                    </button>
                  </div>

                  <div className="share-success-row">
                    <p style={{ color:'#888', fontSize:13, marginBottom:8 }}>📣 Share this offer:</p>
                    <div style={{ display:'flex', gap:10, flexWrap:'wrap', justifyContent:'center' }}>
                      <button onClick={() => {
                        const shopSlug = shops.find(s => s.id === postedOffer.shop_id)?.slug || '';
                        const text = encodeURIComponent(`🔥 *${postedOffer.title}* — ${postedOffer.discount}% OFF!\n🛍 Offer Price: ₹${fmt(postedOffer.offer_price)}\n📍 Check it on OfferCity: ${window.location.origin}/shop/${shopSlug}`);
                        window.open(`https://wa.me/?text=${text}`, '_blank');
                      }} style={{ padding:'10px 20px', background:'#25D366', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:14 }}>
                        💬 Share on WhatsApp
                      </button>
                      <button onClick={() => {
                        setCampOfferId(String(postedOffer.id));
                        setCampMsg(buildWAMessage(postedOffer));
                        setTab('campaign');
                      }} style={{ padding:'10px 20px', background:'#e65100', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:14 }}>
                        📣 Send to All Contacts
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {/* ── Campaign Tab ── */}
          {tab === 'campaign' && (
            <>
              <h2>📣 WhatsApp Campaign</h2>

              {/* WhatsApp Connection Card */}
              <div className="wa-connect-card">

                {/* Status + action row */}
                <div className="wa-status-row">
                  <span className="wa-icon">💬</span>
                  <div>
                    <div className="wa-status-label" style={{ color: WA_STATUS_COLOR[waStatus.status] || '#888' }}>
                      {pairLoading ? 'Connecting…' : (WA_STATUS_LABEL[waStatus.status] || waStatus.status)}
                    </div>
                    {waStatus.contacts > 0 && (
                      <div className="wa-contacts-count">👥 {waStatus.contacts} contacts ready</div>
                    )}
                  </div>
                  <div className="wa-connect-btn-wrap">
                    {waStatus.status === 'connected'
                      ? <button className="wa-btn-disconnect" onClick={() => api.post('/campaigns/whatsapp/disconnect').then(() => setWaStatus({ status:'disconnected', qr:null, contacts:0 }))}>Disconnect</button>
                      : !pairLoading && !pairingCode && (
                          <button className="wa-btn-connect"
                            onClick={() => api.post('/campaigns/whatsapp/connect').catch(() => {})}
                            disabled={['connecting','waiting_scan','reconnecting'].includes(waStatus.status)}>
                            {waStatus.status === 'waiting_scan' ? 'Scan QR…' : waStatus.status === 'connecting' ? 'Connecting…' : '🔗 Connect WhatsApp'}
                          </button>
                        )
                    }
                  </div>
                </div>

                {/* QR code — hide when pairing code flow is active */}
                {waStatus.qr && !pairLoading && !pairingCode && (
                  <div className="wa-qr-wrap">
                    <p style={{ color:'#555', marginBottom:8 }}>Open WhatsApp → ⋮ → Linked Devices → Link a Device → Scan this code</p>
                    <img src={waStatus.qr} alt="WhatsApp QR" className="wa-qr-img" />
                    <p style={{ color:'#aaa', fontSize:12, marginTop:6 }}>QR refreshes every 30 seconds</p>
                  </div>
                )}

                {/* Pairing code section — always visible when not connected */}
                {waStatus.status !== 'connected' && (
                  <div className="wa-pair-section">

                    {/* Input — shown when no active code and not loading */}
                    {!pairLoading && !pairingCode && (
                      <>
                        <div className="wa-pair-divider"><span>connect on this phone</span></div>
                        <div className="wa-pair-input-row">
                          <input value={pairPhone} onChange={e => setPairPhone(e.target.value.replace(/\D/g, ''))}
                            placeholder="WhatsApp number with country code — e.g. 919876543210" type="tel"
                            inputMode="numeric" />
                          <button onClick={getPairingCode} disabled={!pairPhone.trim() || pairPhone.length < 10}>
                            Get Code →
                          </button>
                        </div>
                        <p style={{ fontSize:11, color:'#999', marginTop:4, marginBottom:0 }}>
                          Include country code, no + or spaces. India: 91XXXXXXXXXX
                        </p>
                        <div className="wa-desktop-tip">
                          💻 <strong>Easier on computer:</strong> Open this page on a laptop — scan the QR with your phone in 2 seconds.
                        </div>
                      </>
                    )}

                    {/* Loading spinner */}
                    {pairLoading && (
                      <div style={{ textAlign:'center', padding:'16px 0' }}>
                        <div className="opt-spinner" style={{ margin:'0 auto 10px' }} />
                        <p style={{ color:'#666', fontSize:13 }}>Generating code… (5–10 seconds)</p>
                      </div>
                    )}

                    {/* Code ready */}
                    {pairingCode && (
                      <div className="wa-pair-code-box">
                        <div className="wa-pair-timer" style={{
                          color: pairCountdown < 15 ? '#c62828' : pairCountdown < 30 ? '#f57c00' : '#2e7d32',
                          fontWeight: 700, fontSize: 13, marginBottom: 6
                        }}>
                          {pairCountdown > 0 ? `⏱ ${pairCountdown}s — enter NOW` : '⚠️ Expired — get new code'}
                        </div>
                        <div className="wa-pair-code">
                          {pairingCode.length === 8 ? `${pairingCode.slice(0,4)}-${pairingCode.slice(4)}` : pairingCode}
                        </div>
                        <ol className="wa-pair-steps">
                          <li>Open <strong>WhatsApp</strong> on your phone</li>
                          <li>Tap <strong>⋮</strong> (3 dots, top-right corner)</li>
                          <li>Tap <strong>Linked Devices</strong></li>
                          <li>Tap <strong>Link a Device</strong></li>
                          <li>Below the QR camera, tap <strong style={{color:'#1565c0'}}>"Link with phone number instead"</strong></li>
                          <li>Enter the code above <strong style={{color:'#c62828'}}>within {pairCountdown}s</strong></li>
                        </ol>
                        {pairCountdown === 0
                          ? <button className="wa-pair-regen-btn" onClick={getPairingCode} disabled={pairLoading}>
                              {pairLoading ? '…' : '🔄 Get New Code'}
                            </button>
                          : <button style={{marginTop:8, fontSize:12, padding:'6px 12px'}}
                              onClick={() => { setPairingCode(''); setPairCountdown(0); }}>
                              ✕ Cancel
                            </button>
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── AI Chatbot Card ── */}
              {waStatus.status === 'connected' && (
                <div className="wa-ai-card" style={{
                  background: waStatus.chatbot ? 'linear-gradient(135deg,#e8f5e9,#f1f8e9)' : '#fafafa',
                  border: `2px solid ${waStatus.chatbot ? '#66bb6a' : '#e0e0e0'}`,
                  borderRadius: 14, padding: '18px 20px', marginBottom: 20
                }}>
                  <div className="wa-ai-top" style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ fontSize: 36 }}>🤖</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: waStatus.chatbot ? '#2e7d32' : '#333' }}>
                        AI Auto-Reply {waStatus.chatbot ? '— ON ✅' : '— OFF'}
                      </div>
                      <div style={{ fontSize: 13, color: '#666', marginTop: 3 }}>
                        {waStatus.chatbot
                          ? 'AI is replying to customer messages automatically using your shop info & offers'
                          : 'Turn ON to let AI reply to customers 24/7 — uses your shop details & active offers'}
                      </div>
                    </div>
                    {/* Toggle switch */}
                    <div onClick={async () => {
                        const { data } = await api.post('/campaigns/chatbot/toggle');
                        setWaStatus(s => ({ ...s, chatbot: data.chatbot }));
                      }}
                      style={{
                        width: 52, height: 28, borderRadius: 14, cursor: 'pointer', flexShrink: 0,
                        background: waStatus.chatbot ? '#43a047' : '#bbb',
                        position: 'relative', transition: 'background 0.2s'
                      }}>
                      <div style={{
                        position: 'absolute', top: 3, left: waStatus.chatbot ? 26 : 3,
                        width: 22, height: 22, borderRadius: '50%', background: '#fff',
                        boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left 0.2s'
                      }} />
                    </div>
                  </div>

                  {waStatus.chatbot && (
                    <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['Replies in Telugu/Hindi/English', 'Shares your active offers', 'Answers price & product queries', '2–3 sec human-like delay', 'Skips groups'].map(f => (
                        <span key={f} style={{ background:'#c8e6c9', color:'#1b5e20', padding:'3px 10px', borderRadius:12, fontSize:12, fontWeight:500 }}>✓ {f}</span>
                      ))}
                    </div>
                  )}

                  {!process.env.ANTHROPIC_API_KEY && waStatus.chatbot && (
                    <p style={{ marginTop:10, color:'#c62828', fontSize:13 }}>
                      ⚠️ Add ANTHROPIC_API_KEY to your .env file to activate AI replies
                    </p>
                  )}
                </div>
              )}

              {/* Active Campaign Progress */}
              {activeCampaign && !['completed','stopped'].includes(activeCampaign.status) && (
                <div className="camp-progress-card">
                  <div className="camp-progress-header">
                    <strong>{activeCampaign.offer_title || 'Campaign'}</strong>
                    <span className={`camp-badge camp-badge-${activeCampaign.status}`}>{activeCampaign.status}</span>
                  </div>
                  <div className="camp-counts">
                    <span className="camp-sent">✅ {activeCampaign.sent_count} sent</span>
                    <span className="camp-fail">❌ {activeCampaign.failed_count} failed</span>
                    <span className="camp-total">/ {activeCampaign.total_contacts} total</span>
                  </div>
                  <div className="camp-bar-bg">
                    <div className="camp-bar-fill" style={{ width: `${Math.round(((activeCampaign.sent_count + activeCampaign.failed_count) / Math.max(activeCampaign.total_contacts, 1)) * 100)}%` }} />
                  </div>
                  <div className="camp-eta">
                    ⏱ ~{Math.ceil((activeCampaign.total_contacts - activeCampaign.sent_count - activeCampaign.failed_count) * 25 / 60)} min remaining · Rate: 2–3 msgs/min
                  </div>
                  <div style={{ display:'flex', gap:10, marginTop:12 }}>
                    {activeCampaign.status === 'running'
                      ? <button className="camp-btn-pause" onClick={() => pauseCampaign(activeCampaign.id)}>⏸ Pause</button>
                      : <button className="camp-btn-resume" onClick={() => resumeCampaign(activeCampaign.id)}>▶ Resume</button>
                    }
                    <button className="camp-btn-stop" onClick={() => stopCampaign(activeCampaign.id)}>⏹ Stop</button>
                  </div>
                </div>
              )}

              {activeCampaign?.status === 'completed' && (
                <div className="camp-done-card">
                  <span style={{ fontSize:32 }}>🎉</span>
                  <h3>Campaign Done!</h3>
                  <p>✅ {activeCampaign.sent_count} sent · ❌ {activeCampaign.failed_count} failed out of {activeCampaign.total_contacts} contacts</p>
                  <button onClick={() => setActiveCampaign(null)} style={{ marginTop:8, padding:'8px 20px', background:'#e65100', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700 }}>
                    Start Another
                  </button>
                </div>
              )}

              {/* Launch New Campaign — only when connected and no active campaign */}
              {waStatus.status === 'connected' && (!activeCampaign || ['completed','stopped'].includes(activeCampaign.status)) && (
                <div className="camp-launch-card">
                  <h3 style={{ marginBottom:16 }}>🚀 Launch New Campaign</h3>

                  {/* Pick offer (optional) */}
                  <div className="form-group">
                    <label>Link to an offer <span style={{ color:'#bbb', fontWeight:400 }}>(optional)</span></label>
                    <select value={campOfferId} onChange={e => {
                      setCampOfferId(e.target.value);
                      if (e.target.value) {
                        const o = offers.find(x => String(x.id) === e.target.value);
                        if (o) setCampMsg(buildWAMessage(o));
                      }
                    }}>
                      <option value="">— No specific offer —</option>
                      {offers.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}
                    </select>
                  </div>

                  {/* Message */}
                  <div className="form-group">
                    <label>Message <span style={{ color:'#e65100', fontWeight:600 }}>*</span></label>
                    <textarea value={campMsg} rows={6} onChange={e => setCampMsg(e.target.value)}
                      placeholder={`Type your offer message here...\n\nExample:\n🔥 Big Sale Today!\n💰 Up to 50% off on all items\n📍 Visit us at Main Street\n👉 https://offerscity.co.in/shop/yourshop`}
                      style={{ fontFamily:'inherit', lineHeight:1.6 }} />
                    <div style={{ textAlign:'right', color:'#aaa', fontSize:12 }}>{campMsg.length} chars</div>
                  </div>

                  <div className="camp-recipient-info">
                    👥 Will be sent to <strong>{waStatus.contacts}</strong> WhatsApp contacts · <strong>2–3 msgs/min</strong> · ~{Math.ceil(waStatus.contacts * 25 / 60)} min total
                  </div>

                  <button className="btn-post-offer" onClick={startCampaign} disabled={campLoading || !campMsg.trim()}>
                    {campLoading ? '⏳ Starting…' : `🚀 Send to ${waStatus.contacts} Contacts`}
                  </button>
                </div>
              )}

              {waStatus.status !== 'connected' && waStatus.status !== 'waiting_scan' && (
                <div className="camp-hint">
                  <p>Connect your WhatsApp above to broadcast offers to all your saved contacts.</p>
                  <p style={{ color:'#aaa', fontSize:13 }}>Messages are sent at 2–3 per minute to stay safe. No spam risk.</p>
                </div>
              )}

              {/* ── QR Code Generator ── */}
              {shops.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <h3 style={{ color:'#e65100', marginBottom:12 }}>📱 Shop QR Codes</h3>
                  <p style={{ color:'#777', fontSize:13, marginBottom:14 }}>
                    Print on pamphlets, banners, visiting cards. Customers scan → land on your shop page → see all offers.
                  </p>

                  {shops.map(s => {
                    const fullUrl = `${window.location.origin}${shopUrl(s)}`;
                    const isOpen  = openQR === s.id;
                    return (
                      <div key={s.id} style={{ background:'#fff', borderRadius:12, border:'1px solid #f0e6d6', marginBottom:12, overflow:'hidden' }}>

                        {/* Shop row — click to expand/collapse */}
                        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', cursor:'pointer' }}
                          onClick={() => setOpenQR(isOpen ? null : s.id)}>
                          {s.image
                            ? <img src={s.image} alt="" style={{ width:40, height:40, objectFit:'cover', borderRadius:8, flexShrink:0 }} />
                            : <div style={{ width:40, height:40, background:'#ffe0b2', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🏪</div>
                          }
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:700, color:'#333' }}>{s.name}</div>
                            <div style={{ fontSize:12, color:'#aaa', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fullUrl}</div>
                          </div>
                          <span style={{ fontSize:18, color:'#e65100', flexShrink:0 }}>{isOpen ? '▲' : '▼'}</span>
                        </div>

                        {/* Expanded QR panel */}
                        {isOpen && (
                          <div style={{ borderTop:'1px solid #f5e6d6', padding:'20px 16px', display:'flex', gap:24, flexWrap:'wrap', alignItems:'flex-start' }}>
                            {/* QR image */}
                            <div style={{ textAlign:'center' }}>
                              <img
                                src={qrImgUrl(fullUrl)}
                                alt="QR Code"
                                style={{ width:200, height:200, border:'3px solid #e65100', borderRadius:12, display:'block' }}
                              />
                              <p style={{ fontSize:11, color:'#aaa', marginTop:6 }}>Scan to open shop page</p>
                            </div>

                            {/* Actions */}
                            <div style={{ flex:1, minWidth:200 }}>
                              <p style={{ fontSize:13, color:'#555', marginBottom:14, lineHeight:1.6 }}>
                                <strong>How to use:</strong><br/>
                                ✅ Print on pamphlets & leaflets<br/>
                                ✅ Paste on shop window / counter<br/>
                                ✅ Add to visiting cards<br/>
                                ✅ Send in WhatsApp messages<br/>
                                ✅ Put on delivery packaging
                              </p>

                              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                                <button onClick={() => downloadQR(fullUrl, s.name)}
                                  style={{ padding:'10px 16px', background:'#e65100', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:14, textAlign:'left' }}>
                                  ⬇️ Download QR (PNG)
                                </button>
                                <button onClick={() => {
                                    const text = encodeURIComponent(`📲 Scan this QR to see all offers from *${s.name}*!\n\n👉 Or visit: ${fullUrl}`);
                                    window.open(`https://wa.me/?text=${text}`, '_blank');
                                  }}
                                  style={{ padding:'10px 16px', background:'#25D366', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:14, textAlign:'left' }}>
                                  💬 Share Link on WhatsApp
                                </button>
                                <button onClick={() => { navigator.clipboard.writeText(fullUrl); flash('Shop link copied!'); }}
                                  style={{ padding:'10px 16px', background:'#f5f5f5', color:'#333', border:'1px solid #ddd', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:14, textAlign:'left' }}>
                                  📋 Copy Shop Link
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Campaign History */}
              {campHistory.length > 0 && (
                <div style={{ marginTop:28 }}>
                  <h3 style={{ marginBottom:12, color:'#555' }}>📋 Campaign History</h3>
                  <div className="table-scroll"><table className="data-table">
                    <thead><tr><th>Offer</th><th>Sent</th><th>Failed</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
                    <tbody>
                      {campHistory.map(h => (
                        <tr key={h.id} style={{ cursor:'pointer' }} onClick={() => setActiveCampaign(h)}>
                          <td>{h.offer_title || '—'}</td>
                          <td style={{ color:'#2e7d32', fontWeight:700 }}>{h.sent_count}</td>
                          <td style={{ color: h.failed_count > 0 ? '#c62828' : '#aaa' }}>{h.failed_count}</td>
                          <td>{h.total_contacts}</td>
                          <td><span className={`tag ${h.status === 'completed' ? 'green' : h.status === 'running' ? 'yellow' : 'red'}`}>{h.status}</span></td>
                          <td style={{ fontSize:12 }}>{new Date(h.created_at).toLocaleDateString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="sd-bottom-nav">
        {[
          ['shops',     '🏪', 'My Shops'],
          ['add-shop',  '➕', 'Add Shop'],
          ['offers',    '🏷', 'Offers'],
          ['add-offer', '✨', editingOffer ? 'Edit' : 'Add Offer'],
          ['campaign',  '📣', 'Campaign'],
        ].map(([t, icon, label]) => (
          <button key={t}
            className={`sd-btab${tab === t ? ' active' : ''}`}
            onClick={() => { if (t !== 'add-offer') resetOffer(); setTab(t); }}>
            <span className="sd-btab-icon">{icon}</span>
            <span className="sd-btab-lbl">{label}</span>
            {t === 'campaign' && waStatus.status === 'connected' && (
              <span className="sd-btab-dot" />
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
