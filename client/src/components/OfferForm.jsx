import { useState, useRef, useCallback } from 'react';
import api from '../services/api';
import { OFFER_CATEGORIES } from '../constants/categories';
import { compressImage, fmt, fmtSz } from '../utils/offerHelpers';

const CATEGORIES  = OFFER_CATEGORIES.map(c => c.key);
const DISCOUNTS   = [5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90];
const EMPTY_OFFER = { shop_id: '', title: '', description: '', category: 'Food', discount: '', original_price: '', offer_price: '', valid_until: '', flash_hours: '' };

// Same 4-step offer creation flow (pick photo → optimizing → details → success) used
// both by the standalone "Add Offer" tab and inline from a catalog item.
export default function OfferForm({
  shops, shopId, initialValues, editingOffer, flash,
  onCreated, onUpdated, onCancel, onViewOffers, onSendCampaign, showCloseButton,
}) {
  const initForm = () => {
    if (editingOffer) {
      return {
        shop_id: String(editingOffer.shop_id), title: editingOffer.title, description: editingOffer.description || '',
        category: editingOffer.category || 'Food', discount: String(editingOffer.discount),
        original_price: editingOffer.original_price ? String(editingOffer.original_price) : '',
        offer_price: editingOffer.offer_price ? String(editingOffer.offer_price) : '',
        valid_until: editingOffer.valid_until ? editingOffer.valid_until.slice(0, 10) : '',
        flash_hours: '', is_active: editingOffer.is_active,
      };
    }
    return { ...EMPTY_OFFER, shop_id: shopId || (shops.length > 0 ? String(shops[0].id) : ''), ...(initialValues || {}) };
  };

  const [offerForm, setOfferForm]         = useState(initForm);
  const [photoStep, setPhotoStep]         = useState(editingOffer?.image ? 'details' : 'pick');
  const [imageFile, setImageFile]         = useState(null);
  const [imagePreview, setImagePreview]   = useState(editingOffer?.image || null);
  const [aiImagePath, setAiImagePath]     = useState(null);
  const [aiGenerating, setAiGenerating]   = useState(false);
  const [compressStats, setCompressStats] = useState(null);
  const [uploading, setUploading]         = useState(false);
  const [postedOffer, setPostedOffer]     = useState(null);
  const [cameraMsg, setCameraMsg]         = useState('');

  const cameraRef  = useRef();
  const galleryRef = useRef();

  const resetLocal = () => {
    setOfferForm(initForm());
    setImageFile(null);
    setImagePreview(null);
    setAiImagePath(null);
    setCompressStats(null);
    setPhotoStep('pick');
    setPostedOffer(null);
  };

  const close = () => onCancel?.();

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

  const generateAiImage = async () => {
    const sid = offerForm.shop_id || shopId || (shops.length > 0 ? String(shops[0].id) : '');
    const shop = shops.find(s => String(s.id) === sid);
    setAiGenerating(true);
    try {
      const { data } = await api.post('/offers/generate-image', {
        category: shop?.category || 'Other',
        title: offerForm.title || 'Special Offer',
        discount: offerForm.discount || '20',
        shop_name: shop?.name || ''
      });

      // Fetch image as blob to avoid canvas CORS taint
      const resp = await fetch(data.image);
      const blob = await resp.blob();
      const objUrl = URL.createObjectURL(blob);

      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const W = img.width, H = img.height;
          const canvas = document.createElement('canvas');
          canvas.width = W; canvas.height = H;
          const ctx = canvas.getContext('2d');

          // Base image
          ctx.drawImage(img, 0, 0);

          // Bottom gradient for text readability
          const grad = ctx.createLinearGradient(0, H * 0.5, 0, H);
          grad.addColorStop(0, 'rgba(0,0,0,0)');
          grad.addColorStop(1, 'rgba(0,0,0,0.78)');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, W, H);

          // Discount badge (top-left)
          const disc = offerForm.discount || shop?.discount;
          if (disc) {
            ctx.fillStyle = '#FF3D00';
            const bx = 24, by = 24, bw = 148, bh = 64, br = 14;
            ctx.beginPath();
            ctx.moveTo(bx + br, by);
            ctx.lineTo(bx + bw - br, by); ctx.quadraticCurveTo(bx+bw, by, bx+bw, by+br);
            ctx.lineTo(bx + bw, by + bh - br); ctx.quadraticCurveTo(bx+bw, by+bh, bx+bw-br, by+bh);
            ctx.lineTo(bx + br, by + bh); ctx.quadraticCurveTo(bx, by+bh, bx, by+bh-br);
            ctx.lineTo(bx, by + br); ctx.quadraticCurveTo(bx, by, bx+br, by);
            ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.round(W * 0.048)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillText(`${disc}% OFF`, bx + bw / 2, by + bh * 0.68);
          }

          // Helper: wrap text
          const wrapText = (text, maxW) => {
            const words = text.split(' ');
            const lines = [];
            let line = '';
            for (const w of words) {
              const test = line ? line + ' ' + w : w;
              if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
              else line = test;
            }
            if (line) lines.push(line);
            return lines;
          };

          const pad = Math.round(W * 0.05);

          // Shop name
          ctx.font = `${Math.round(W * 0.032)}px Arial`;
          ctx.fillStyle = 'rgba(255,255,255,0.82)';
          ctx.textAlign = 'center';
          ctx.fillText(shop?.name || '', W / 2, H - Math.round(H * 0.085));

          // Offer title (bold, wrapped)
          ctx.font = `bold ${Math.round(W * 0.052)}px Arial`;
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          const titleLines = wrapText(offerForm.title || 'Special Offer', W - pad * 2);
          const lineH = Math.round(W * 0.062);
          const titleY = H - Math.round(H * 0.135) - (titleLines.length - 1) * lineH;
          titleLines.forEach((ln, i) => ctx.fillText(ln, W / 2, titleY + i * lineH));

          URL.revokeObjectURL(objUrl);
          canvas.toBlob(composited => {
            if (!composited) { resolve(); return; }
            setImageFile(composited);
            setAiImagePath(null);
            setCompressStats(null);
            setImagePreview(URL.createObjectURL(composited));
            setPhotoStep('details');
            resolve();
          }, 'image/jpeg', 0.88);
        };
        img.onerror = () => {
          setAiImagePath(data.image);
          setImageFile(null);
          setCompressStats(null);
          setImagePreview(data.image);
          setPhotoStep('details');
          resolve();
        };
        img.src = objUrl;
      });
    } catch {
      flash('Could not generate image — please try again', 'err');
    } finally {
      setAiGenerating(false);
    }
  };

  const buildFD = (extra = {}) => {
    const fd = new FormData();
    const payload = { ...offerForm, ...extra };
    Object.entries(payload).forEach(([k, v]) => { if (v !== undefined && v !== null) fd.append(k, v); });
    if (imageFile) fd.append('image', imageFile, 'offer.jpg');
    else if (aiImagePath) fd.append('ai_image_path', aiImagePath);
    return fd;
  };

  const submitOffer = async (e) => {
    e.preventDefault();
    const sid = offerForm.shop_id || shopId || (shops.length > 0 ? String(shops[0].id) : '');
    if (!sid) { flash('Please select a shop first', 'err'); return; }
    setUploading(true);
    try {
      const fd = buildFD({ shop_id: sid });
      const { data } = await api.post('/offers', fd);
      onCreated?.(data);
      setPostedOffer(data);
      setPhotoStep('success');
    } catch (err) {
      flash(err.response?.data?.message || 'Error posting offer — please try again', 'err');
    } finally { setUploading(false); }
  };

  const updateOffer = async (e) => {
    e.preventDefault();
    setUploading(true);
    try {
      const { data } = await api.put(`/offers/${editingOffer.id}`, buildFD());
      onUpdated?.(data);
    } catch (err) {
      flash(err.response?.data?.message || 'Error updating offer', 'err');
    } finally { setUploading(false); }
  };

  const validUntilDisplay = offerForm.valid_until
    ? new Date(offerForm.valid_until + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })
    : null;

  const savingsAmt = offerForm.original_price && offerForm.offer_price
    ? Number(offerForm.original_price) - Number(offerForm.offer_price)
    : null;

  return (
    <>
      {/* Step indicator */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <h2 style={{ margin:0 }}>{editingOffer ? '✏️ Edit Offer' : '➕ New Offer'}</h2>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
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
          {showCloseButton && (
            <button type="button" onClick={close} aria-label="Close"
              style={{ padding:'4px 10px', background:'#eee', border:'none', borderRadius:6, cursor:'pointer', fontSize:16, lineHeight:1 }}>
              ✕
            </button>
          )}
        </div>
      </div>

      {/* STEP 1 — Pick Photo */}
      {photoStep === 'pick' && (
        <div className="photo-pick-screen">
          <div className="photo-pick-hero">
            <span style={{ fontSize:56 }}>📸</span>
            <h3>Add a Product Photo</h3>
            <p>Offers with photos get <strong>3× more views</strong></p>
          </div>
          {/* Primary: upload your own photo */}
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

          {/* OR divider */}
          <div className="photo-or"><span>or</span></div>

          {/* Alternative: generate with AI for owners who don't want to upload */}
          <button className="photo-ai-alt" onClick={generateAiImage} disabled={aiGenerating}>
            <span className="photo-ai-alt-icon">{aiGenerating ? '⏳' : '✨'}</span>
            <span className="photo-ai-alt-text">
              <strong>{aiGenerating ? 'Generating your image…' : "No photo? Generate one with AI"}</strong>
              <small>{aiGenerating ? 'Please wait a few seconds' : 'Free · Instant · Made from your offer details'}</small>
            </span>
          </button>

          <input ref={cameraRef}  type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e => handleImage(e.target.files[0])} />
          <input ref={galleryRef} type="file" accept="image/*"                        style={{ display:'none' }} onChange={e => { setAiImagePath(null); handleImage(e.target.files[0]); }} />
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
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button type="button" className="photo-bar-change" onClick={generateAiImage} disabled={aiGenerating}
                    style={{ background: aiGenerating ? '#f3e8ff' : 'linear-gradient(135deg,#7c3aed,#a855f7)', color:'#fff', borderColor:'transparent', opacity: aiGenerating ? 0.85 : 1 }}
                    title="Turn this into a polished AI image based on your offer details">
                    {aiGenerating ? '⏳ Creating…' : '✨ AI Version'}
                  </button>
                  <button type="button" className="photo-bar-change" onClick={() => { setImageFile(null); setImagePreview(null); setAiImagePath(null); setCompressStats(null); setPhotoStep('pick'); }}>🔄 Change</button>
                </div>
              </div>
            )}

            <form onSubmit={editingOffer ? updateOffer : submitOffer}>

              {shops.length > 1 && !shopId && (
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

              <div className="form-group">
                <label>Category * <span style={{ fontWeight:400, color:'#999', fontSize:12 }}>— so it shows under the right filter</span></label>
                <select value={offerForm.category || 'Other'} required
                  onChange={e => setOfferForm({ ...offerForm, category: e.target.value })}>
                  {OFFER_CATEGORIES.map(c => (
                    <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                  ))}
                </select>
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
                    required={!offerForm.flash_hours}
                    min={new Date().toISOString().slice(0,10)} />
                </div>
              </div>

              {/* Flash Sale */}
              <div style={{ background:'#fff8f5', border:'2px solid #ffcc80', borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: offerForm.flash_hours ? 10 : 0 }}>
                  <span style={{ fontSize:20 }}>⚡</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, color:'#e65100', fontSize:14 }}>Flash Sale</div>
                    <div style={{ fontSize:12, color:'#888' }}>Instant push to nearby users · Offer expires automatically</div>
                  </div>
                  <select value={offerForm.flash_hours}
                    onChange={e => setOfferForm({ ...offerForm, flash_hours: e.target.value })}
                    style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #ffcc80', fontSize:13, fontWeight:600, color: offerForm.flash_hours ? '#e65100' : '#888' }}>
                    <option value="">Off</option>
                    <option value="1">1 hour</option>
                    <option value="2">2 hours</option>
                    <option value="4">4 hours</option>
                    <option value="6">6 hours</option>
                    <option value="12">12 hours</option>
                  </select>
                </div>
                {offerForm.flash_hours && (
                  <div style={{ fontSize:12, color:'#e65100', fontWeight:600 }}>
                    ⚡ Push notification fires immediately · Expires in {offerForm.flash_hours} hour{offerForm.flash_hours > 1 ? 's' : ''}
                  </div>
                )}
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
                <button type="button" onClick={() => { resetLocal(); close(); }}
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
            <button className="btn-post-offer" style={{ flex:'0 0 auto', padding:'12px 28px' }} onClick={resetLocal}>
              ➕ Post Another Offer
            </button>
            {onViewOffers && (
              <button onClick={() => onViewOffers(postedOffer)}
                style={{ padding:'12px 28px', background:'#fff', border:'2px solid #e65100', color:'#e65100', borderRadius:10, cursor:'pointer', fontWeight:700 }}>
                📋 View My Offers
              </button>
            )}
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
              {onSendCampaign && (
                <button onClick={() => onSendCampaign(postedOffer)}
                  style={{ padding:'10px 20px', background:'#e65100', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontWeight:700, fontSize:14 }}>
                  📣 Send to All Contacts
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
