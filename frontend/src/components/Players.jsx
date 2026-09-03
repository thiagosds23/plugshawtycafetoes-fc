import React, { useEffect, useState, useRef, useContext } from 'react';
import { Camera, UserCircle, Edit2, Check, X, Plus, Trash2, Sliders, Image as ImageIcon, Sparkles, RefreshCw, Loader2, Save, UserCheck, Users, Shield, Search, ArrowUpDown, Filter, FileSpreadsheet, KeyRound, Lock, ClipboardList, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { removeBackground } from '@imgly/background-removal';
import { AuthContext } from '../AuthContext';
import { calcOVR } from '../utils/ovr';
import { API_URL, formatPhotoUrl } from '../config';
import '../fut-card.css';

// Flexible Height Formatter: Accepts 178, 1,78, or 1.78 and normalizes to "1.78"
function formatHeight(val) {
  if (val === null || val === undefined || val === '') return '';
  let str = String(val).trim().replace(',', '.');
  const num = parseFloat(str);
  if (isNaN(num)) return val;
  if (num > 10) {
    return (num / 100).toFixed(2);
  }
  return num.toFixed(2);
}

// Pre-downscale high-res photos to optimal model size (max 320px)
// This prevents WASM memory exhaustion, eliminates browser freezing, and speeds up AI inference on mobile!
const downscaleForAI = async (blob, maxDim = 320) => {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((resizedBlob) => resolve(resizedBlob || blob), 'image/jpeg', 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
};

// Subcomponent: Interactive Drag-to-Position Photo Crop & AI Background Removal Modal
function PhotoAdjustModal({ player, initialSrc, rawFile, onClose, onSave, onDeletePhoto }) {
  const previewImgRef = useRef(null);
  const [src, setSrc] = useState(initialSrc);
  const [originalSrc, setOriginalSrc] = useState(player && player.original_photo ? `${API_URL}${player.original_photo}` : initialSrc);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // AI Background Removal state
  const isAlreadyCutout = Boolean(player && player.photo && initialSrc && initialSrc.includes(player.photo));
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [bgProgress, setBgProgress] = useState(0);
  const [hasRemovedBg, setHasRemovedBg] = useState(isAlreadyCutout);
  const [newRawFile, setNewRawFile] = useState(rawFile);

  const overall = calcOVR(player);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offsetX, y: e.clientY - offsetY });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setOffsetX(e.clientX - dragStart.x);
    setOffsetY(e.clientY - dragStart.y);
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX - offsetX, y: e.touches[0].clientY - offsetY });
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    setOffsetX(e.touches[0].clientX - dragStart.x);
    setOffsetY(e.touches[0].clientY - dragStart.y);
  };

  const handleTouchEnd = () => setIsDragging(false);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom(prev => Math.min(Math.max(prev + delta, 0.8), 3.5));
  };

  const handleNewFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      setNewRawFile(file);
      const reader = new FileReader();
      reader.onload = () => {
        setSrc(reader.result);
        setOriginalSrc(reader.result);
        setHasRemovedBg(false);
        setZoom(1);
        setOffsetX(0);
        setOffsetY(0);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveBackground = async () => {
    setIsRemovingBg(true);
    setBgProgress(10);
    try {
      const response = await fetch(src);
      const rawBlob = await response.blob();
      setBgProgress(25);

      // Pre-otimiza resolução para 480px (tamanho ideal para o card FUT, ultraleve e sem travar o PC)
      const optimizedBlob = await downscaleForAI(rawBlob, 480);
      setBgProgress(40);

      // Yield assíncrono para o navegador pintar a tela e esvaziar a fila de eventos do Chrome
      await new Promise(r => setTimeout(r, 60));

      let transparentBlob;
      try {
        transparentBlob = await removeBackground(optimizedBlob, {
          model: 'isnet_quint8',
          device: 'gpu',
          progress: (key, current, total) => {
            if (total > 0) {
              const pct = Math.round(40 + (current / total) * 55);
              setBgProgress(Math.min(pct, 95));
            }
          }
        });
      } catch (gpuErr) {
        console.warn('WebGPU falhou ou indisponível no dispositivo. Tentando via CPU...', gpuErr);
        transparentBlob = await removeBackground(optimizedBlob, {
          model: 'isnet_quint8',
          device: 'cpu',
          progress: (key, current, total) => {
            if (total > 0) {
              const pct = Math.round(40 + (current / total) * 55);
              setBgProgress(Math.min(pct, 95));
            }
          }
        });
      }
      setBgProgress(100);

      const transparentUrl = URL.createObjectURL(transparentBlob);
      setSrc(transparentUrl);
      setHasRemovedBg(true);
    } catch (err) {
      console.error('Erro ao remover fundo:', err);
      alert('Não foi possível remover o fundo automaticamente neste dispositivo (falta de memória/recursos do navegador). Recomendamos usar o remove.bg pelo link abaixo, que remove com qualidade perfeita em 2 segundos!');
    } finally {
      setIsRemovingBg(false);
      setBgProgress(0);
    }
  };

  const handleRestoreOriginal = () => {
    setSrc(originalSrc);
    setHasRemovedBg(false);
  };

  const handleSave = () => {
    const img = previewImgRef.current;
    if (!img || !img.naturalWidth) {
      if (rawFile) onSave(rawFile, newRawFile);
      else alert('Erro ao carregar imagem para ajuste.');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      const targetWidth = 400;
      const targetHeight = 480;
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      const previewPhotoW = 260 * 0.42;
      const previewPhotoH = 260 * 0.44;
      const scaleFactorX = targetWidth / previewPhotoW;
      const scaleFactorY = targetHeight / previewPhotoH;

      const aspect = img.naturalWidth / img.naturalHeight;
      let drawW = targetWidth * zoom;
      let drawH = (targetWidth / aspect) * zoom;

      // Align top Y=0 to match CSS object-position: center top (no head cutoff!)
      let drawX = ((targetWidth - drawW) / 2) + (offsetX * scaleFactorX);
      let drawY = (offsetY * scaleFactorY);

      ctx.fillStyle = 'transparent';
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);

      canvas.toBlob((blob) => {
        if (blob) {
          onSave(blob, newRawFile);
        } else if (rawFile) {
          onSave(rawFile, newRawFile);
        } else {
          alert('Erro ao converter imagem ajustada.');
        }
      }, 'image/png');
    } catch (err) {
      console.error('Erro ao salvar ajuste da imagem:', err);
      if (rawFile) {
        onSave(rawFile, newRawFile);
      } else {
        alert('Não foi possível salvar o enquadramento desta imagem.');
      }
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '440px', padding: '24px', textAlign: 'center' }}>
        <h3 className="font-bold text-xl mb-1 text-primary">Ajustar Posição & Fundo da Foto</h3>
        <p className="text-muted text-xs mb-4">Arraste a foto com o mouse/dedo diretamente dentro da carta para posicionar.</p>

        {/* Real FUT Card Preview inside Modal */}
        <div className="fut-card mb-4" style={{ width: '260px', margin: '0 auto 16px', position: 'relative' }}>
          <img src="/fut-bg.png" alt="Card Background" className="fut-card-bg" />
          <div className="fut-card-inner">
            <div className="fut-rating">{overall}</div>
            <div className="fut-position">{player.position || 'MEI'}</div>
            
            <div 
              className="fut-photo"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
              style={{
                cursor: isDragging ? 'grabbing' : 'grab',
                touchAction: 'none',
                background: isRemovingBg ? 'rgba(0,0,0,0.6)' : 'transparent'
              }}
            >
              {isRemovingBg && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#fff', fontSize: '10px' }}>
                  <Loader2 className="animate-spin" size={20} color="var(--primary)" />
                  <span>Removendo fundo (IA)...</span>
                </div>
              )}

              <img 
                ref={previewImgRef}
                src={src} 
                alt="Preview" 
                crossOrigin="anonymous"
                draggable={false}
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover', 
                  transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`,
                  transformOrigin: 'center top',
                  transition: isDragging ? 'none' : 'transform 0.05s ease-out'
                }} 
              />
            </div>

            <div className="fut-name">{player.nickname ? player.nickname.split(',')[0].trim() : player.username}</div>

            {/* Official Horizontal Row of 6 Stats */}
            <div className="fut-stats">
              <div className="fut-stat-item"><span className="fut-stat-label">PAC</span><span className="fut-stat-val">{player.pace || 50}</span></div>
              <div className="fut-stat-item"><span className="fut-stat-label">SHO</span><span className="fut-stat-val">{player.shooting || 50}</span></div>
              <div className="fut-stat-item"><span className="fut-stat-label">PAS</span><span className="fut-stat-val">{player.passing || 50}</span></div>
              <div className="fut-stat-item"><span className="fut-stat-label">DRI</span><span className="fut-stat-val">{player.dribbling || 50}</span></div>
              <div className="fut-stat-item"><span className="fut-stat-label">DEF</span><span className="fut-stat-val">{player.defending || 50}</span></div>
              <div className="fut-stat-item"><span className="fut-stat-label">PHY</span><span className="fut-stat-val">{player.physical || 50}</span></div>
            </div>
          </div>
        </div>

        {/* Ações de Recorte de Fundo: Remove.bg (Instantâneo) + IA no Aparelho */}
        <div className="mb-4 flex flex-col items-center justify-center gap-2">
          <div className="flex justify-center gap-2 flex-wrap">
            {/* Opção 1: Remove.bg - 100% à prova de falhas em qualquer celular */}
            <a 
              href="https://www.remove.bg/pt-br/upload" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn" 
              style={{ 
                background: 'linear-gradient(135deg, #00f59b 0%, #00d285 100%)', 
                color: '#000', 
                fontWeight: '800', 
                fontSize: '0.84rem',
                padding: '9px 15px',
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                textDecoration: 'none',
                boxShadow: '0 0 16px rgba(0, 245, 155, 0.35)'
              }}
              title="Abre o Remove.bg em nova aba para recortar em 2 segundos"
            >
              <ExternalLink size={15} /> ⚡ Recortar no Remove.bg
            </a>

            {!hasRemovedBg ? (
              <button 
                className="btn btn-secondary flex items-center justify-center gap-2 py-2 text-xs" 
                onClick={handleRemoveBackground} 
                disabled={isRemovingBg}
                style={{ borderRadius: '10px', padding: '9px 13px', fontSize: '0.8rem' }}
                title="Tenta recortar usando a memória do seu próprio navegador"
              >
                {isRemovingBg ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {isRemovingBg ? `IA (${bgProgress}%)...` : 'Tentar IA no Aparelho'}
              </button>
            ) : (
              <button 
                className="btn btn-secondary flex items-center justify-center gap-2 py-2 text-xs" 
                onClick={handleRestoreOriginal}
                disabled={isRemovingBg}
                style={{ borderRadius: '10px', padding: '9px 13px', fontSize: '0.8rem' }}
              >
                <RefreshCw size={15} /> Fundo Original
              </button>
            )}

            {player.photo && (
              <button 
                className="btn btn-secondary flex items-center justify-center gap-1.5 py-2 text-xs text-red-400" 
                onClick={onDeletePhoto}
                disabled={isRemovingBg}
                style={{ borderColor: 'rgba(239, 68, 68, 0.4)', borderRadius: '10px', padding: '9px 12px' }}
              >
                <Trash2 size={15} /> Remover Foto
              </button>
            )}
          </div>

          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', margin: '4px 0 6px' }}>
            💡 <strong>Recomendado no celular:</strong> O <em>Remove.bg</em> não trava nem esquenta o aparelho. Após baixar a foto recortada, clique em <strong>"Outra Foto"</strong> abaixo!
          </div>

          {isRemovingBg && (
            <div style={{ width: '100%', maxWidth: '280px', marginTop: '4px' }}>
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${bgProgress}%`, height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #00f59b)', transition: 'width 0.2s ease-out' }}></div>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-2 mb-6 items-center flex-wrap">
          <button className="btn btn-secondary" style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem' }} onClick={() => setZoom(prev => Math.max(prev - 0.2, 0.8))}>- Zoom</button>
          <button className="btn btn-secondary" style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem' }} onClick={() => setZoom(prev => Math.min(prev + 0.2, 3.5))}>+ Zoom</button>

          <label className="btn btn-secondary" style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8rem', cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <ImageIcon size={14} /> Outra Foto
            <input type="file" style={{ display: 'none' }} accept="image/*" onChange={handleNewFile} />
          </label>
        </div>

        <div className="flex gap-3">
          <button className="btn py-3 text-base" onClick={handleSave} disabled={isRemovingBg}><Check size={18} /> Confirmar Ajuste</button>
          <button className="btn btn-secondary py-3 text-base" onClick={onClose} disabled={isRemovingBg}><X size={18} /> Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// Subcomponent: Ultra Modern Luxury Edit Profile Modal
function EditPlayerModal({ player, editForm, setEditForm, onClose, onSave, onDeletePlayer, onOpenAdjustPhoto, onSelectNewPhoto, onDeletePhoto, isAdmin }) {
  const overall = calcOVR({ ...player, position: editForm.position });
  
  const [newNickInput, setNewNickInput] = useState('');

  const currentNicknames = (editForm.nickname || '')
    .split(',')
    .map(n => n.trim())
    .filter(Boolean);

  const handleAddNickname = () => {
    if (!newNickInput.trim()) return;
    const cleaned = newNickInput.trim().replace(/,/g, '');
    if (!currentNicknames.some(n => n.toLowerCase() === cleaned.toLowerCase())) {
      const updated = [...currentNicknames, cleaned];
      setEditForm({ ...editForm, nickname: updated.join(', ') });
    }
    setNewNickInput('');
  };

  const handleRemoveNickname = (indexToRemove) => {
    const updated = currentNicknames.filter((_, idx) => idx !== indexToRemove);
    setEditForm({ ...editForm, nickname: updated.join(', ') });
  };

  const primaryName = currentNicknames[0] || editForm.username || player.username;

  const [pinVal, setPinVal] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [pinFeedback, setPinFeedback] = useState('');
  const [hasPinState, setHasPinState] = useState(!!player.has_pin);

  const handleSavePin = async (val) => {
    setIsSavingPin(true);
    setPinFeedback('');
    try {
      const res = await fetch(`${API_URL}/users/${player.id}/pin`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': String(player.id)
        },
        body: JSON.stringify({ pin: val })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar PIN');
      setHasPinState(data.has_pin);
      player.has_pin = data.has_pin;
      setPinFeedback(val ? '✅ PIN atualizado!' : '✅ PIN removido! Acesso livre.');
      setPinVal('');
      setTimeout(() => setPinFeedback(''), 3500);
    } catch (err) {
      setPinFeedback(`❌ ${err.message}`);
    } finally {
      setIsSavingPin(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card" style={{ width: '580px', maxWidth: '96vw', maxHeight: '92dvh', display: 'flex', flexDirection: 'column', background: 'rgba(18, 20, 32, 0.98)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 30px rgba(0,245,155,0.12)', overflow: 'hidden', padding: 0 }}>
        
        {/* Sticky Header with Top Save Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(0,245,155,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--primary)', boxShadow: 'var(--glow)' }}>
              <Edit2 size={20} color="var(--primary)" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 className="font-extrabold text-lg text-main" style={{ margin: 0 }}>
                  {editForm.username || player.username}
                </h3>
                {currentNicknames.length > 0 && (
                  <span style={{ fontSize: '0.88rem', color: 'var(--primary)', fontWeight: '800' }}>
                    ({currentNicknames.join(', ')})
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                <span className="font-bold text-primary">{editForm.position || 'MEI'}</span>
                <span>•</span>
                <span className="font-bold text-yellow-400">OVR {overall}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn" style={{ padding: '8px 18px', fontSize: '0.85rem', fontWeight: 'bold', width: 'auto' }} onClick={onSave}>
              <Save size={16} /> Salvar Alterações
            </button>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div style={{ padding: '20px 20px 30px', overflowY: 'auto', flex: 1 }}>
          
          {/* Manage Photo Section */}
          <div style={{ padding: '14px', borderRadius: '14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', marginBottom: '18px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '0.75rem', marginBottom: '10px', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>📸 Foto da Carta FUT</span>
              {player.photo ? (
                <span style={{ fontSize: '10px', color: '#fbbf24', background: 'rgba(251,191,36,0.15)', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>Foto Ativa</span>
              ) : (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '10px' }}>Silhueta Padrão</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '12px', background: '#0a0a0f', overflow: 'hidden', border: '2px solid var(--primary)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {player.photo ? (
                  <img src={formatPhotoUrl(player.photo)} alt="Thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <UserCircle size={40} color="rgba(255,255,255,0.3)" />
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', flex: 1, flexWrap: 'wrap' }}>
                {player.photo ? (
                  <>
                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      onClick={onOpenAdjustPhoto}
                      style={{ padding: '8px 14px', fontSize: '0.75rem', width: 'auto', flex: 1, color: 'var(--primary)', borderColor: 'var(--primary)' }}
                    >
                      <Sliders size={14} /> Ajustar Foto
                    </button>

                    <label className="btn btn-secondary" style={{ padding: '8px 14px', fontSize: '0.75rem', width: 'auto', flex: 1, cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <Camera size={14} /> Trocar Foto
                      <input type="file" style={{ display: 'none' }} accept="image/*" onChange={onSelectNewPhoto} />
                    </label>

                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      onClick={onDeletePhoto}
                      style={{ padding: '8px 14px', fontSize: '0.75rem', width: 'auto', color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }}
                    >
                      <Trash2 size={14} /> Deletar
                    </button>
                  </>
                ) : (
                  <label className="btn" style={{ padding: '10px 16px', fontSize: '0.8rem', width: '100%', cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <Camera size={16} /> Adicionar Foto do Jogador
                    <input type="file" style={{ display: 'none' }} accept="image/*" onChange={onSelectNewPhoto} />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Personal Info Grid (Explicit 2 columns) */}
          <div style={{ marginBottom: '18px' }}>
            <h4 style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>📋 Dados Pessoais & Posição</h4>
            
            {/* Nome (Usuário) */}
            <div style={{ marginBottom: '12px' }}>
              <label className="label text-xs font-bold" style={{ color: 'var(--primary)' }}>
                👤 Nome (Usuário)
              </label>
              <input 
                type="text" 
                className="input" 
                style={{ marginBottom: 0, padding: '10px 14px', fontSize: '0.9rem' }} 
                placeholder="Ex: Thiago Silva" 
                value={editForm.username || ''} 
                onChange={e => setEditForm({ ...editForm, username: e.target.value })} 
                required 
              />
            </div>

            {/* Multiple Nicknames Manager Section */}
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '14px', border: '1px solid var(--border)', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label className="label text-xs" style={{ margin: 0, fontWeight: 'bold', color: 'var(--primary)' }}>
                  🏷️ Apelidos de Jogo ({currentNicknames.length})
                </label>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Pressione Enter ou Vírgula para adicionar
                </span>
              </div>

              {/* Current Nickname Tags */}
              {currentNicknames.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                  {currentNicknames.map((nick, idx) => (
                    <span 
                      key={idx} 
                      style={{ 
                        background: 'rgba(0, 245, 155, 0.12)', 
                        border: '1px solid rgba(0, 245, 155, 0.35)', 
                        borderRadius: '16px', 
                        padding: '4px 10px', 
                        fontSize: '0.8rem', 
                        fontWeight: '800', 
                        color: 'var(--primary)', 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '6px' 
                      }}
                    >
                      {nick} {idx === 0 && <span style={{ fontSize: '9px', opacity: 0.7 }}>(Principal)</span>}
                      <button 
                        type="button" 
                        onClick={() => handleRemoveNickname(idx)}
                        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 0, fontSize: '13px', lineHeight: 1, display: 'flex', alignItems: 'center' }}
                        title="Remover este apelido"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  Nenhum apelido cadastrado. Adicione apelidos para o sistema reconhecer na convocação!
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <input 
                  type="text" 
                  className="input" 
                  style={{ marginBottom: 0, padding: '8px 12px', fontSize: '0.85rem' }} 
                  placeholder="Novo apelido (ex: Mursilha Jr, Caça Rato, Olise...)" 
                  value={newNickInput} 
                  onChange={e => setNewNickInput(e.target.value)} 
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ',') {
                      e.preventDefault();
                      handleAddNickname();
                    }
                  }}
                />
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ width: 'auto', padding: '0 16px', fontSize: '0.82rem' }}
                  onClick={handleAddNickname}
                >
                  + Adicionar
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label className="label text-xs">Posição de Jogo</label>
                <select 
                  className="input" 
                  style={{ marginBottom: 0, height: '40px', padding: '6px 12px' }} 
                  value={editForm.position} 
                  onChange={e => setEditForm({...editForm, position: e.target.value})}
                >
                  <option value="ATA">ATA - Atacante / Pivô</option>
                  <option value="MEI">MEI - Meio-Campista / Ala</option>
                  <option value="VOL">VOL - Volante / Fixo</option>
                  <option value="ZAG">ZAG - Zagueiro / Defensor</option>
                  <option value="LAT">LAT - Lateral / Ala</option>
                  <option value="GOL">GOL - Goleiro</option>
                </select>
              </div>

              <div>
                <label className="label text-xs">Altura (m)</label>
                <input 
                  type="text" 
                  className="input" 
                  style={{ marginBottom: 0, padding: '8px 12px' }} 
                  placeholder="Ex: 1.78, 1,78 ou 178" 
                  value={editForm.height} 
                  onChange={e => setEditForm({...editForm, height: e.target.value})} 
                  onBlur={e => setEditForm({...editForm, height: formatHeight(e.target.value)})}
                />
              </div>
              <div>
                <label className="label text-xs">Peso (kg)</label>
                <input type="text" className="input" style={{ marginBottom: 0, padding: '8px 12px' }} placeholder="Ex: 75" value={editForm.weight} onChange={e => setEditForm({...editForm, weight: e.target.value})} />
              </div>

              <div>
                <label className="label text-xs">WhatsApp / Telefone</label>
                <input type="text" className="input" style={{ marginBottom: 0, padding: '8px 12px' }} placeholder="(11) 99999-8888" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
              </div>
              <div>
                <label className="label text-xs">E-mail de Login</label>
                <input type="email" className="input" style={{ marginBottom: 0, padding: '8px 12px' }} placeholder="seu@email.com" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} />
              </div>
            </div>
          </div>

          {/* Seção PIN / Senha de Segurança da Conta */}
          <div style={{ padding: '14px 16px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
              <h4 style={{ fontSize: '0.78rem', fontWeight: '800', color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <KeyRound size={14} color="var(--primary)" /> Senha / PIN de Segurança
              </h4>
              <span className={hasPinState ? 'badge badge-volt' : 'badge'} style={{ fontSize: '0.68rem', padding: '2px 8px' }}>
                {hasPinState ? '🔒 Protegido com PIN' : '🔓 Sem Senha (Livre)'}
              </span>
            </div>

            <p className="text-muted text-xs" style={{ margin: '0 0 10px', fontSize: '0.72rem', lineHeight: 1.35 }}>
              {hasPinState 
                ? 'Sua conta está protegida. Apenas quem tem seu PIN pode alterar sua foto e dados.' 
                : 'Você pode definir um PIN de 4 números para proteger sua carta oficial contra alterações.'}
            </p>

            {pinFeedback && (
              <div style={{ fontSize: '0.75rem', fontWeight: 'bold', marginBottom: '8px', color: pinFeedback.startsWith('✅') ? 'var(--primary)' : '#ff3366' }}>
                {pinFeedback}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input 
                type="password"
                maxLength={6}
                className="input"
                placeholder={hasPinState ? "Novo PIN (4 dígitos)" : "Criar PIN (4 dígitos)"}
                value={pinVal}
                onChange={e => setPinVal(e.target.value)}
                style={{ flex: '1 1 140px', padding: '7px 12px', fontSize: '0.82rem', height: '36px', marginBottom: 0, borderRadius: '8px' }}
              />
              <button 
                type="button" 
                className="btn" 
                style={{ padding: '7px 14px', fontSize: '0.78rem', height: '36px', width: 'auto', borderRadius: '8px' }}
                onClick={() => handleSavePin(pinVal)}
                disabled={isSavingPin || !pinVal.trim()}
              >
                {isSavingPin ? 'Salvando...' : (hasPinState ? 'Alterar PIN' : 'Definir PIN')}
              </button>
              {hasPinState && (
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ padding: '7px 12px', fontSize: '0.75rem', height: '36px', width: 'auto', borderRadius: '8px', color: '#ff3366' }}
                  onClick={() => { if (confirm('Deseja remover o PIN? Qualquer pessoa poderá acessar com seu nome.')) handleSavePin(null); }}
                  disabled={isSavingPin}
                >
                  Remover PIN
                </button>
              )}
            </div>
          </div>

          {/* FUT Attributes Display (Estatísticas Oficiais do Clube - Somente Leitura) */}
          <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h4 style={{ fontSize: '0.78rem', fontWeight: '800', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={14} color="var(--primary)" /> Estatísticas Oficiais do Atleta
                </h4>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  🔒 Definidas pelas avaliações do elenco e planilha oficial
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0, 245, 155, 0.1)', padding: '4px 10px', borderRadius: '10px', border: '1px solid var(--primary-glow)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>OVR {editForm.position || 'MEI'}:</span>
                <span style={{ fontSize: '0.92rem', fontWeight: '900', color: 'var(--primary)' }}>{overall}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
              {[
                { label: 'PAC (Ritmo)', val: player.pace || 50 },
                { label: 'SHO (Chute)', val: player.shooting || 50 },
                { label: 'PAS (Passe)', val: player.passing || 50 },
                { label: 'DRI (Drible)', val: player.dribbling || 50 },
                { label: 'DEF (Defesa)', val: player.defending || 50 },
                { label: 'PHY (Físico)', val: player.physical || 50 }
              ].map((stat, i) => (
                <div 
                  key={i} 
                  style={{ 
                    background: 'rgba(14, 16, 23, 0.7)', 
                    padding: '8px 4px', 
                    borderRadius: '12px', 
                    border: '1px solid var(--border)' 
                  }}
                >
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '2px' }}>{stat.label}</div>
                  <div style={{ 
                    fontSize: '1.05rem', 
                    fontWeight: 900, 
                    color: stat.val >= 80 ? '#ffd700' : stat.val >= 70 ? 'var(--primary)' : stat.val >= 60 ? 'var(--cyan)' : 'var(--text-main)' 
                  }}>
                    {stat.val}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Sticky Bottom Footer */}
        <div className="modal-bottom-bar">
          <button className="btn btn-save-main" onClick={onSave}>
            <Check size={18} /> Salvar Alterações
          </button>

          <div className="secondary-group">
            <button className="btn btn-secondary" onClick={onClose}>
              <X size={16} /> Cancelar
            </button>
            {isAdmin && (
              <button type="button" onClick={onDeletePlayer} className="btn btn-secondary" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }}>
                <Trash2 size={16} /> Excluir Jogador
              </button>
            )}
          </div>
        </div>

      </motion.div>
    </div>
  );
}

export default function Players() {
  const { user, updateUser } = useContext(AuthContext);

  const [players, setPlayers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPosition, setSelectedPosition] = useState('ALL');
  const [sortBy, setSortBy] = useState('ovr'); // 'ovr', 'goals', 'win_rate', 'name'
  
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isCreating, setIsCreating] = useState(false);
  const [newUsername, setNewUsername] = useState('');

  // Crop modal state
  const [cropModalPlayer, setCropModalPlayer] = useState(null);
  const [tempImageSrc, setTempImageSrc] = useState(null);
  const [rawFile, setRawFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);

  // Evaluation modal state
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [evalAnswered, setEvalAnswered] = useState(() => {
    return localStorage.getItem('has_answered_eval_' + (user?.id || 'guest')) === 'true';
  });
  const [evalConfirmationView, setEvalConfirmationView] = useState(false);

  const EVAL_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdBKBRFIXYLRsJwf0FwNqQJqhD8a5PvD0xLbB9zY1v3x26gQw/viewform';

  const handleConfirmAlreadyAnswered = () => {
    localStorage.setItem('has_answered_eval_' + (user?.id || 'guest'), 'true');
    setEvalAnswered(true);
    setEvalConfirmationView(true);
  };

  const handleGoToForm = () => {
    window.open(EVAL_FORM_URL, '_blank', 'noopener,noreferrer');
    setShowEvalModal(false);
    setEvalConfirmationView(false);
  };

  const normalize = str => (str || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  // Verifica se o jogador corresponde ao usuário logado
  const isMyPlayer = (p) => {
    if (!user || !p) return false;
    if (user.id && p.id && String(p.id) === String(user.id)) return true;
    if (user.username && p.username && normalize(p.username) === normalize(user.username)) return true;
    if (user.nickname && p.nickname && normalize(user.nickname).length >= 2) {
      const uNick = normalize(user.nickname);
      const pNick = normalize(p.nickname);
      if (pNick.split(',').map(s => s.trim()).includes(uNick)) return true;
    }
    return false;
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/users/import-ratings-excel`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✅ Sucesso! Foram atualizados os atributos de ${data.updatedCount} atletas a partir da planilha.`);
        loadPlayers();
      } else {
        alert(data.error || 'Erro ao importar planilha.');
      }
    } catch (err) {
      console.error('Erro na importação da planilha:', err);
      alert('Erro ao enviar arquivo de planilha.');
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const loadPlayers = () => {
    fetch(`${API_URL}/stats`)
      .then(res => res.json())
      .then(data => setPlayers(data));
  };
  
  useEffect(() => {
    loadPlayers();
  }, []);

  const handlePhotoSelect = (player, e) => {
    if (!isMyPlayer(player)) {
      alert('Você só pode alterar a foto do seu próprio atleta.');
      return;
    }
    const file = e.target.files && e.target.files[0];
    if (file) {
      setRawFile(file);
      setCropModalPlayer(player);
      const reader = new FileReader();
      reader.onload = () => {
        setTempImageSrc(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const openAdjustExistingPhoto = (player) => {
    if (!isMyPlayer(player)) {
      alert('Você só pode alterar a foto do seu próprio atleta.');
      return;
    }
    const photoToLoad = player.photo || player.original_photo;
    if (!photoToLoad) return;
    setRawFile(null);
    setCropModalPlayer(player);
    setTempImageSrc(`${API_URL}${photoToLoad}`);
  };

  const removePlayerPhoto = async (playerId) => {
    const targetPlayer = players.find(p => p.id === playerId);
    if (!isMyPlayer(targetPlayer)) {
      alert('Você só pode remover a foto do seu próprio atleta.');
      return;
    }
    if (window.confirm('Tem certeza que deseja remover a sua foto?')) {
      const res = await fetch(`${API_URL}/users/${playerId}/photo`, { 
        method: 'DELETE',
        headers: { 'x-user-id': user?.id }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Erro ao remover foto.');
        return;
      }
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, photo: null, original_photo: null } : p));
      if (cropModalPlayer && cropModalPlayer.id === playerId) {
        setCropModalPlayer(null);
        setTempImageSrc(null);
      }
      loadPlayers();
    }
  };

  const handleSaveCroppedPhoto = async (croppedBlob, originalFile) => {
    if (!cropModalPlayer || !croppedBlob) return;
    if (!isMyPlayer(cropModalPlayer)) {
      alert('Você só pode alterar a foto do seu próprio atleta.');
      return;
    }
    const formData = new FormData();
    formData.append('photo', croppedBlob, 'cropped_player.png');
    if (originalFile) {
      formData.append('original_photo', originalFile);
    }
    const res = await fetch(`${API_URL}/users/${cropModalPlayer.id}/photo`, { 
      method: 'POST', 
      headers: { 'x-user-id': user?.id },
      body: formData 
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      alert(errData.error || 'Erro ao salvar foto.');
      return;
    }
    const data = await res.json();
    
    // Atualiza o estado imediatamente para renderizar a nova foto
    setPlayers(prev => prev.map(p => p.id === cropModalPlayer.id ? { ...p, photo: data.photoUrl, original_photo: data.origUrl || p.original_photo } : p));
    
    if (isMyPlayer(cropModalPlayer) && updateUser) {
      updateUser({ photo: data.photoUrl, original_photo: data.origUrl || data.photoUrl });
    }

    setCropModalPlayer(null);
    setTempImageSrc(null);
    setRawFile(null);
    loadPlayers();
  };

  const isAdmin = user && (user.id === 1 || (user.username && user.username.toLowerCase().includes('thiago')) || (user.nickname && user.nickname.toLowerCase().includes('fela')));

  const handleAdminResetPin = async (targetPlayer) => {
    const targetName = targetPlayer.nickname ? targetPlayer.nickname.split(',')[0].trim() : targetPlayer.username;
    if (!window.confirm(`Deseja resetar o PIN do atleta ${targetName}? Ele poderá entrar sem senha novamente e definir um novo PIN se quiser.`)) return;

    try {
      const res = await fetch(`${API_URL}/users/${targetPlayer.id}/reset-pin`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-id': String(user?.id)
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao resetar PIN');
      alert(data.message || 'PIN resetado com sucesso!');
      loadPlayers();
    } catch (err) {
      alert(err.message);
    }
  };

  const startEditing = (player) => {
    if (!isMyPlayer(player) && !isAdmin) {
      alert('Você só tem permissão para editar o seu próprio jogador.');
      return;
    }
    setEditingId(player.id);
    setEditForm({
      username: player.username || '',
      nickname: player.nickname || '',
      position: player.position || 'MEI',
      height: player.height ? formatHeight(player.height) : '',
      weight: player.weight || '',
      phone: player.phone || '',
      email: player.email || '',
      pace: player.pace || 50,
      shooting: player.shooting || 50,
      passing: player.passing || 50,
      dribbling: player.dribbling || 50,
      defending: player.defending || 50,
      physical: player.physical || 50
    });
  };

  const saveProfile = async (id) => {
    const targetPlayer = players.find(p => p.id === id);
    if (!isMyPlayer(targetPlayer) && !isAdmin) {
      alert('Você só tem permissão para editar o seu próprio jogador.');
      return;
    }
    const payload = {
      ...editForm,
      height: formatHeight(editForm.height)
    };
    const res = await fetch(`${API_URL}/users/${id}/profile`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'x-user-id': user?.id
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      alert(errData.error || 'Erro ao salvar perfil.');
      return;
    }
    if (isMyPlayer(targetPlayer) && updateUser) {
      updateUser(payload);
    }
    setEditingId(null);
    loadPlayers();
  };

  const createPlayer = async (e) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername })
    });
    setNewUsername('');
    setIsCreating(false);
    loadPlayers();
  };

  const deletePlayer = async (id) => {
    if (!isAdmin) {
      alert('Apenas o Administrador pode excluir jogadores.');
      return;
    }
    if (window.confirm('Tem certeza que deseja excluir este jogador? Esta ação não pode ser desfeita.')) {
      const res = await fetch(`${API_URL}/users/${id}`, { 
        method: 'DELETE',
        headers: { 'x-user-id': user?.id }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || 'Erro ao excluir jogador.');
        return;
      }
      setEditingId(null);
      loadPlayers();
    }
  };

  // Separação entre Meu Jogador e Resto do Elenco
  const myPlayer = players.find(p => isMyPlayer(p));
  const otherPlayers = myPlayer ? players.filter(p => p.id !== myPlayer.id) : players;

  // Filtros aplicados no Resto do Elenco
  const filteredOtherPlayers = (otherPlayers || []).filter(p => {
    if (!p) return false;
    const matchesSearch = String(p.nickname || p.username || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (selectedPosition === 'ALL') return true;
    if (selectedPosition === 'DEF') return ['ZAG', 'LAT', 'VOL'].includes(p.position);
    return p.position === selectedPosition;
  }).sort((a, b) => {
    if (!a || !b) return 0;
    if (sortBy === 'ovr') return calcOVR(b) - calcOVR(a);
    if (sortBy === 'goals') return (b.goals || 0) - (a.goals || 0);
    if (sortBy === 'win_rate') return (b.win_rate || 0) - (a.win_rate || 0);
    if (sortBy === 'name') return String(a.nickname || a.username || '').localeCompare(String(b.nickname || b.username || ''));
    return 0;
  });

  const editingPlayer = players.find(p => p.id === editingId);

  // Renderizador de Carta FUT
  const renderPlayerCard = (player, isEditable, idx = 0) => {
    if (!player) return null;
    const overall = calcOVR(player);
    const displayName = player.nickname ? String(player.nickname).split(',')[0].trim() : (player.username || 'Atleta');

    return (
      <motion.div 
        key={player.id || idx} 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: idx * 0.03 }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div className="fut-card" style={isEditable ? { filter: 'drop-shadow(0 0 18px rgba(0, 245, 155, 0.45))' } : {}}>
            <img src="/fut-bg.png" alt="Card Background" className="fut-card-bg" />
            <div className="fut-card-inner">
              {/* Botão de edição: exibido APENAS para o Meu Jogador */}
              {isEditable && (
                <button 
                  onClick={() => startEditing(player)}
                  style={{ 
                    position: 'absolute', 
                    top: -8, 
                    right: -8, 
                    background: 'rgba(18, 20, 32, 0.95)', 
                    border: '1.5px solid var(--primary)', 
                    borderRadius: '50%', 
                    padding: '9px', 
                    color: '#fff', 
                    cursor: 'pointer', 
                    zIndex: 10,
                    boxShadow: '0 0 14px rgba(0, 245, 155, 0.5)'
                  }}
                  title="Editar Meu Perfil & Carta"
                >
                  <Edit2 size={16} color="var(--primary)" />
                </button>
              )}
              
              <div className="fut-rating">{overall}</div>
              <div className="fut-position">{player.position || 'MEI'}</div>
              
              {/* Foto do Atleta */}
              <div className="fut-photo">
                {player.photo ? (
                  <img src={formatPhotoUrl(player.photo)} alt="Player" />
                ) : (
                  <div style={{ width: '100%', height: '100%', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <UserCircle size={110} color="rgba(0,0,0,0.3)" />
                  </div>
                )}
              </div>
              
              <div className="fut-name">{displayName}</div>
              
              {/* Linha Oficial de 6 Atributos */}
              <div className="fut-stats">
                <div className="fut-stat-item"><span className="fut-stat-label">PAC</span><span className="fut-stat-val">{player.pace || 50}</span></div>
                <div className="fut-stat-item"><span className="fut-stat-label">SHO</span><span className="fut-stat-val">{player.shooting || 50}</span></div>
                <div className="fut-stat-item"><span className="fut-stat-label">PAS</span><span className="fut-stat-val">{player.passing || 50}</span></div>
                <div className="fut-stat-item"><span className="fut-stat-label">DRI</span><span className="fut-stat-val">{player.dribbling || 50}</span></div>
                <div className="fut-stat-item"><span className="fut-stat-label">DEF</span><span className="fut-stat-val">{player.defending || 50}</span></div>
                <div className="fut-stat-item"><span className="fut-stat-label">PHY</span><span className="fut-stat-val">{player.physical || 50}</span></div>
              </div>
            </div>
          </div>

          {/* Barra de Estatísticas Resumidas */}
          <div className="glass-card" style={{ padding: '8px 16px', width: '310px', display: 'flex', justifyContent: 'space-around', textAlign: 'center', fontSize: '0.75rem', borderRadius: '12px' }}>
            <div>
              <div className="text-muted font-bold">Jogos</div>
              <div className="font-extrabold text-main">{player.matches_count || 0}</div>
            </div>
            <div>
              <div className="text-muted font-bold">Gols</div>
              <div className="font-extrabold text-primary">{player.goals || 0}</div>
            </div>
            <div>
              <div className="text-muted font-bold">V/E/D</div>
              <div className="font-extrabold" style={{ color: 'var(--cyan)' }}>{player.wins || 0}/{player.draws || 0}/{player.losses || 0}</div>
            </div>
            <div>
              <div className="text-muted font-bold">Aprov.</div>
              <div className="font-extrabold text-gold">{player.win_rate || 0}%</div>
            </div>
          </div>

          {/* Botão de Ação Direta para o Meu Jogador */}
          {isEditable && (
            <button 
              className="btn" 
              style={{ 
                width: '310px', 
                padding: '11px 16px', 
                fontSize: '0.86rem', 
                fontWeight: '800', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                gap: '8px',
                borderRadius: '12px',
                boxShadow: '0 0 16px rgba(0, 245, 155, 0.25)'
              }}
              onClick={() => startEditing(player)}
            >
              <Edit2 size={16} /> Editar Meu Jogador
            </button>
          )}

          {/* Botão de Admin para Editar ou Resetar PIN de outros jogadores */}
          {!isEditable && isAdmin && (
            <div style={{ width: '310px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button 
                className="btn" 
                style={{ 
                  width: '100%', 
                  padding: '9px 14px', 
                  fontSize: '0.82rem', 
                  fontWeight: '800', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '6px',
                  borderRadius: '10px'
                }}
                onClick={() => startEditing(player)}
              >
                <Edit2 size={15} /> Editar Jogador (Admin)
              </button>

              {player.has_pin ? (
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ width: '100%', padding: '7px 12px', fontSize: '0.74rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => handleAdminResetPin(player)}
                  title="Resetar PIN deste atleta caso ele tenha esquecido"
                >
                  <KeyRound size={14} color="var(--primary)" /> Resetar PIN do Atleta
                </button>
              ) : null}
            </div>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      
      {/* Page Title & Add Player */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          {/* Textos em Cima Corretamente */}
          <div>
            <h2 className="text-2xl font-extrabold text-main" style={{ margin: '0 0 4px', letterSpacing: '-0.4px' }}>
              Plantel do Elenco
            </h2>
            <div className="text-muted text-sm">
              {players.length} Atletas cadastrados • Cartas Oficiais dos Atletas
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Botão de Avaliação do Elenco (Para todos os jogadores) */}
            <button 
              type="button" 
              className="btn" 
              style={{ 
                width: 'auto', 
                padding: '10px 16px', 
                fontSize: '0.84rem', 
                fontWeight: '800',
                background: evalAnswered 
                  ? 'rgba(0, 245, 155, 0.08)' 
                  : 'linear-gradient(135deg, rgba(0, 245, 155, 0.22) 0%, rgba(0, 180, 216, 0.22) 100%)',
                border: '1px solid var(--primary)',
                color: 'var(--primary)',
                boxShadow: evalAnswered ? 'none' : '0 0 16px rgba(0, 245, 155, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
              onClick={() => { setShowEvalModal(true); setEvalConfirmationView(evalAnswered); }}
              title="Preencher ou consultar formulário de avaliação dos jogadores"
            >
              <ClipboardList size={16} color="var(--primary)" />
              <span>Avaliação do Elenco {evalAnswered && '✅'}</span>
            </button>

            {isAdmin && (
              <>
                {/* Import Spreadsheet Button — Exclusivo para Desktop/PC */}
                <label 
                  className="btn btn-secondary desktop-only" 
                  style={{ width: 'auto', padding: '10px 18px', cursor: 'pointer', margin: 0, alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
                  title="Importar notas da planilha Excel (.xlsx)"
                >
                  <FileSpreadsheet size={16} color="var(--primary)" /> 
                  {isImporting ? 'Importando...' : '📥 Importar Planilha'}
                  <input 
                    type="file" 
                    accept=".xlsx,.xls,.csv" 
                    style={{ display: 'none' }} 
                    onChange={handleImportExcel}
                    disabled={isImporting}
                  />
                </label>

                <button className="btn" style={{ width: 'auto', padding: '10px 18px', fontSize: '0.85rem' }} onClick={() => setIsCreating(!isCreating)}>
                  <Plus size={16} /> Novo Jogador
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isCreating && (
          <motion.form 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }} 
            exit={{ height: 0, opacity: 0 }}
            onSubmit={createPlayer} 
            className="glass-card mb-6 overflow-hidden"
          >
            <div className="flex gap-3 items-end flex-wrap">
              <div style={{ flex: '1 1 200px' }}>
                <label className="label">Nome do Jogador</label>
                <input 
                  type="text" 
                  className="input" 
                  style={{ marginBottom: 0 }}
                  value={newUsername} 
                  onChange={e => setNewUsername(e.target.value)} 
                  autoFocus
                  placeholder="Nome do atleta"
                />
              </div>
              <button type="submit" className="btn" style={{ width: 'auto', minWidth: '100px' }}>Salvar</button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* 1. SEÇÃO: MEU JOGADOR (Exclusivo para o atleta logado editar a sua carta) */}
      {myPlayer && (
        <div style={{ marginBottom: '38px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 className="text-xl font-extrabold text-main" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserCheck color="var(--primary)" size={22} /> Meu Jogador
              </h3>
              <p className="text-muted text-xs" style={{ margin: '3px 0 0' }}>
                Sua carta oficial no clube. Apenas você pode alterar seu perfil, apelido e foto.
              </p>
            </div>
            <span className="badge" style={{ background: 'rgba(0, 245, 155, 0.12)', color: 'var(--primary)', border: '1px solid rgba(0, 245, 155, 0.35)', fontSize: '0.78rem', padding: '5px 12px' }}>
              ⭐ Perfil Próprio
            </span>
          </div>

          <div 
            className="glass-card" 
            style={{ 
              padding: '24px 14px', 
              display: 'flex', 
              justifyContent: 'center', 
              background: 'radial-gradient(ellipse at top, rgba(0, 245, 155, 0.08) 0%, rgba(14, 16, 23, 0.95) 70%)',
              borderColor: 'rgba(0, 245, 155, 0.35)',
              borderRadius: '24px'
            }}
          >
            {renderPlayerCard(myPlayer, true, 0)}
          </div>
        </div>
      )}

      {/* 2. SEÇÃO: RESTO DO ELENCO (Somente Visualização) */}
      <div style={{ marginTop: myPlayer ? '36px' : '0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 className="text-xl font-extrabold text-main" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users color="var(--primary)" size={22} /> Resto do Elenco
            </h3>
            <p className="text-muted text-xs" style={{ margin: '3px 0 0' }}>
              Cartas dos outros atletas do time ({otherPlayers.length} jogadores) • Somente visualização
            </p>
          </div>
        </div>

        {/* Search, Position Filter and Sort Bar */}
        <div className="glass-card mb-8" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            
            {/* Search Box */}
            <div style={{ position: 'relative', flex: '1 1 100%' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                className="input" 
                placeholder="Buscar atleta por apelido ou nome..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '40px', marginBottom: 0 }}
              />
            </div>

            {/* Position Pills */}
            <div className="hide-scrollbar" style={{ display: 'flex', gap: '6px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', maxWidth: '100%', padding: '2px 0' }}>
              {[
                { id: 'ALL', label: 'Todos' },
                { id: 'ATA', label: 'Atacantes' },
                { id: 'MEI', label: 'Meias' },
                { id: 'DEF', label: 'Defesa' },
                { id: 'GOL', label: 'Goleiros' }
              ].map(pos => (
                <button
                  key={pos.id}
                  type="button"
                  className={`btn ${selectedPosition === pos.id ? '' : 'btn-secondary'}`}
                  style={{ padding: '6px 12px', fontSize: '0.75rem', width: 'auto', borderRadius: '10px', whiteSpace: 'nowrap', flexShrink: 0 }}
                  onClick={() => setSelectedPosition(pos.id)}
                >
                  {pos.label}
                </button>
              ))}
            </div>

            {/* Sort Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <ArrowUpDown size={15} color="var(--text-muted)" />
              <select 
                className="input" 
                style={{ width: 'auto', marginBottom: 0, padding: '6px 12px', fontSize: '0.78rem', height: '36px', borderRadius: '10px' }}
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                <option value="ovr">Maior OVR</option>
                <option value="goals">Mais Gols</option>
                <option value="win_rate">Melhor Aproveitamento</option>
                <option value="name">Ordem Alfabética</option>
              </select>
            </div>

          </div>
        </div>

        {/* Grid de Cartas do Resto do Elenco (Nenhum destes possui botão de edição) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: '28px', justifyContent: 'center' }}>
          {filteredOtherPlayers.map((player, idx) => renderPlayerCard(player, false, idx))}

          {filteredOtherPlayers.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px' }} className="glass-card text-muted">
              Nenhum atleta encontrado para os filtros selecionados.
            </div>
          )}
        </div>
      </div>

      {/* Photo Crop Modal with Drag to Position & AI Background Removal */}
      {cropModalPlayer && tempImageSrc && (
        <PhotoAdjustModal 
          player={cropModalPlayer} 
          initialSrc={tempImageSrc} 
          rawFile={rawFile}
          onClose={() => { setCropModalPlayer(null); setTempImageSrc(null); setRawFile(null); }}
          onSave={handleSaveCroppedPhoto}
          onDeletePhoto={() => removePlayerPhoto(cropModalPlayer.id)}
        />
      )}

      {/* Modern Edit Profile Modal Overlay */}
      {editingPlayer && (
        <EditPlayerModal 
          player={editingPlayer}
          editForm={editForm}
          setEditForm={setEditForm}
          onClose={() => setEditingId(null)}
          onSave={() => saveProfile(editingPlayer.id)}
          onDeletePlayer={() => deletePlayer(editingPlayer.id)}
          onOpenAdjustPhoto={() => openAdjustExistingPhoto(editingPlayer)}
          onSelectNewPhoto={(e) => handlePhotoSelect(editingPlayer, e)}
          onDeletePhoto={() => removePlayerPhoto(editingPlayer.id)}
          isAdmin={isAdmin}
        />
      )}

      {/* Evaluation Form Modal Popup */}
      {showEvalModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <motion.div 
            initial={{ scale: 0.92, opacity: 0, y: 15 }} 
            animate={{ scale: 1, opacity: 1, y: 0 }} 
            exit={{ scale: 0.92, opacity: 0, y: 15 }}
            className="glass-card" 
            style={{ 
              width: '460px', 
              maxWidth: '94vw', 
              background: 'rgba(15, 18, 28, 0.98)', 
              border: '1px solid rgba(0, 245, 155, 0.35)', 
              borderRadius: '24px', 
              boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 35px rgba(0,245,155,0.15)', 
              padding: '26px 22px',
              textAlign: 'center',
              position: 'relative'
            }}
          >
            <button 
              onClick={() => { setShowEvalModal(false); setEvalConfirmationView(false); }} 
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '7px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} />
            </button>

            {!evalConfirmationView ? (
              <>
                {/* Header Icon */}
                <div style={{ width: '56px', height: '56px', borderRadius: '18px', background: 'rgba(0,245,155,0.1)', border: '1.5px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 20px rgba(0,245,155,0.25)' }}>
                  <ClipboardList size={28} color="var(--primary)" />
                </div>

                <h3 className="text-xl font-extrabold text-main" style={{ margin: '0 0 6px', letterSpacing: '-0.3px' }}>
                  Avaliação Oficial do Elenco
                </h3>
                <p className="text-muted text-xs" style={{ margin: '0 0 20px', lineHeight: 1.4 }}>
                  plugshawtycafetoes FC • Temporada 2026
                </p>

                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px 14px', marginBottom: '22px', textAlign: 'left' }}>
                  <div style={{ fontSize: '0.94rem', fontWeight: 800, color: '#fff', marginBottom: '6px' }}>
                    ❓ Você já respondeu ao formulário de avaliação dos jogadores?
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    As notas atribuídas pelos atletas são indispensáveis para calcular os atributos oficiais (PAC, SHO, PAS, DRI, DEF, PHY) e o OVR de cada carta FUT.
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Opção 1: Não respondeu -> Vai para o formulário */}
                  <button 
                    type="button" 
                    className="btn" 
                    style={{ 
                      padding: '13px 18px', 
                      fontSize: '0.90rem', 
                      fontWeight: '800', 
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      background: 'linear-gradient(135deg, #00f59b 0%, #00d285 100%)',
                      color: '#000',
                      boxShadow: '0 0 20px rgba(0,245,155,0.3)'
                    }}
                    onClick={handleGoToForm}
                  >
                    <ExternalLink size={16} /> Não, responder agora
                  </button>

                  {/* Opção 2: Já respondeu -> Confirma e segue ok */}
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ 
                      padding: '12px 18px', 
                      fontSize: '0.86rem', 
                      fontWeight: '700', 
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                    onClick={handleConfirmAlreadyAnswered}
                  >
                    <Check size={16} color="var(--primary)" /> Sim, já respondi
                  </button>
                </div>
              </>
            ) : (
              /* Confirmação quando já respondeu */
              <>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(0,245,155,0.12)', border: '1.5px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 25px rgba(0,245,155,0.3)' }}>
                  <Check size={28} color="var(--primary)" />
                </div>

                <h3 className="text-xl font-extrabold text-main" style={{ margin: '0 0 8px' }}>
                  Tudo Certo! ✅
                </h3>
                <p className="text-muted text-sm" style={{ margin: '0 0 22px', lineHeight: 1.45 }}>
                  Suas notas já foram enviadas e são levadas em conta no cálculo oficial do OVR do elenco. Segue o jogo! ⚽🔥
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button 
                    type="button" 
                    className="btn" 
                    style={{ padding: '12px', fontSize: '0.90rem', fontWeight: '800', borderRadius: '12px' }}
                    onClick={() => { setShowEvalModal(false); setEvalConfirmationView(false); }}
                  >
                    Ok, Continuar
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '10px', fontSize: '0.78rem', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    onClick={handleGoToForm}
                  >
                    <ExternalLink size={13} /> Abrir formulário novamente
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </div>
      )}

    </motion.div>
  );
}
