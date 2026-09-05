import React, { useEffect, useState, useRef, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { Camera, UserCircle, Edit2, Check, X, Plus, Trash2, Sliders, Image as ImageIcon, Sparkles, RefreshCw, Loader2, Save, UserCheck, Users, Shield, Search, ArrowUpDown, Filter, FileSpreadsheet, KeyRound, Lock, ClipboardList, ExternalLink, ShieldCheck, Download, HardDriveDownload, User, Tag, Info, Phone, Mail, ShieldAlert, Zap, Goal, Footprints, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
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

      // Carrega a engine de IA (onnxruntime, ~400KB) so na hora de recortar a foto.
      // Import estatico colocava tudo no bundle inicial e deixava o app lento para abrir.
      const { removeBackground } = await import('@imgly/background-removal');

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

      const previewPhotoW = 190 * 0.42;
      const previewPhotoH = 190 * 0.44;
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.90)', backdropFilter: 'blur(10px)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px' }}>
      <div 
        className="glass-card" 
        style={{ 
          width: '100%', 
          maxWidth: '380px', 
          maxHeight: '98dvh',
          padding: '14px 14px 12px', 
          textAlign: 'center', 
          display: 'flex', 
          flexDirection: 'column', 
          background: 'rgba(16, 18, 28, 0.98)',
          border: '1px solid var(--border)',
          borderRadius: '20px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.9)',
          overflow: 'hidden'
        }}
      >
        {/* Header Compacto com Botão Fechar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div style={{ textAlign: 'left' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: 'var(--primary)', letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Camera size={16} color="var(--primary)" /> Ajustar Foto da Carta
            </h3>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Arraste dentro da carta para enquadrar
            </span>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            style={{ 
              background: 'rgba(255,255,255,0.06)', 
              border: '1px solid var(--border)', 
              color: 'var(--text-muted)', 
              width: '32px', 
              height: '32px', 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              cursor: 'pointer' 
            }}
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>

        {/* Carta FUT Proporcional Compacta (190px de largura - cabe 100% na tela) */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '2px 0 6px' }}>
          <div className="fut-card" style={{ width: '190px', margin: 0, position: 'relative' }}>
            <img src="/fut-bg.png" alt="Card Background" className="fut-card-bg" />
            <div className="fut-card-inner">
              <div className="fut-rating" style={{ fontSize: '1.55rem' }}>{overall}</div>
              <div className="fut-position" style={{ fontSize: '0.68rem' }}>{player.position || 'MEI'}</div>
              
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
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#fff', fontSize: '9px' }}>
                    <Loader2 className="animate-spin" size={16} color="var(--primary)" />
                    <span>IA ({bgProgress}%)...</span>
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

              <div className="fut-name" style={{ fontSize: '0.78rem' }}>
                {player.nickname ? player.nickname.split(',')[0].trim() : player.username}
              </div>

              {/* Atributos da Carta */}
              <div className="fut-stats" style={{ fontSize: '0.60rem' }}>
                <div className="fut-stat-item"><span className="fut-stat-label">PAC</span><span className="fut-stat-val">{player.pace || 50}</span></div>
                <div className="fut-stat-item"><span className="fut-stat-label">SHO</span><span className="fut-stat-val">{player.shooting || 50}</span></div>
                <div className="fut-stat-item"><span className="fut-stat-label">PAS</span><span className="fut-stat-val">{player.passing || 50}</span></div>
                <div className="fut-stat-item"><span className="fut-stat-label">DRI</span><span className="fut-stat-val">{player.dribbling || 50}</span></div>
                <div className="fut-stat-item"><span className="fut-stat-label">DEF</span><span className="fut-stat-val">{player.defending || 50}</span></div>
                <div className="fut-stat-item"><span className="fut-stat-label">PHY</span><span className="fut-stat-val">{player.physical || 50}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Linha 1 de Controles: Zoom e Trocar Foto */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.3fr', gap: '6px', marginBottom: '6px' }}>
          <button 
            type="button"
            className="btn btn-secondary" 
            style={{ padding: '6px 4px', fontSize: '0.74rem', fontWeight: 800, width: '100%', borderRadius: '10px' }} 
            onClick={() => setZoom(prev => Math.max(prev - 0.15, 0.8))}
          >
            - Zoom
          </button>
          <button 
            type="button"
            className="btn btn-secondary" 
            style={{ padding: '6px 4px', fontSize: '0.74rem', fontWeight: 800, width: '100%', borderRadius: '10px' }} 
            onClick={() => setZoom(prev => Math.min(prev + 0.15, 3.5))}
          >
            + Zoom
          </button>
          <label 
            className="btn btn-secondary" 
            style={{ padding: '6px 6px', fontSize: '0.74rem', fontWeight: 800, width: '100%', cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', borderRadius: '10px' }}
          >
            <ImageIcon size={13} color="var(--primary)" /> Trocar
            <input type="file" style={{ display: 'none' }} accept="image/*" onChange={handleNewFile} />
          </label>
        </div>

        {/* Linha 2 de Controles: Recorte e Limpeza de Fundo */}
        <div style={{ display: 'grid', gridTemplateColumns: (hasRemovedBg || player.photo) ? '1.4fr 1fr' : '1fr', gap: '6px', marginBottom: '8px' }}>
          <a 
            href="https://www.remove.bg/pt-br/upload" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="btn btn-secondary" 
            style={{ 
              color: '#00f59b', 
              borderColor: 'rgba(0, 245, 155, 0.45)', 
              background: 'rgba(0, 245, 155, 0.08)',
              fontWeight: 800, 
              fontSize: '0.74rem',
              padding: '7px 8px',
              borderRadius: '10px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              textDecoration: 'none',
              width: '100%'
            }}
            title="Recortar fundo no remove.bg"
          >
            <ExternalLink size={13} /> Recortar Fundo
          </a>

          {hasRemovedBg ? (
            <button 
              type="button"
              className="btn btn-secondary" 
              onClick={handleRestoreOriginal} 
              style={{ borderRadius: '10px', padding: '7px 6px', fontSize: '0.74rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              <RefreshCw size={13} /> Original
            </button>
          ) : player.photo ? (
            <button 
              type="button"
              className="btn btn-secondary" 
              onClick={onDeletePhoto} 
              style={{ borderColor: 'rgba(239, 68, 68, 0.35)', color: '#ef4444', background: 'rgba(239, 68, 68, 0.06)', borderRadius: '10px', padding: '7px 6px', fontSize: '0.74rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              <Trash2 size={13} /> Excluir
            </button>
          ) : null}
        </div>

        {/* Linha 3: Botões de Ação (Confirmar / Cancelar) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '8px' }}>
          <button 
            type="button"
            className="btn" 
            style={{ padding: '9px', fontSize: '0.84rem', fontWeight: 900, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} 
            onClick={handleSave} 
            disabled={isRemovingBg}
          >
            <Check size={16} /> Confirmar
          </button>
          <button 
            type="button"
            className="btn btn-secondary" 
            style={{ padding: '9px', fontSize: '0.84rem', borderRadius: '12px' }} 
            onClick={onClose} 
            disabled={isRemovingBg}
          >
            Cancelar
          </button>
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

  const { user } = useContext(AuthContext);
  const [pinVal, setPinVal] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [pinFeedback, setPinFeedback] = useState('');
  const [hasPinState, setHasPinState] = useState(Boolean(player?.has_pin || (user?.id === player?.id && user?.has_pin)));

  useEffect(() => {
    setHasPinState(Boolean(player?.has_pin || (user?.id === player?.id && user?.has_pin)));
  }, [player?.has_pin, player?.id, user?.has_pin, user?.id]);

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
      if (user && user.id === player.id) {
        user.has_pin = data.has_pin;
      }
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
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }} title="Fechar">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div style={{ padding: '20px 20px 30px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Manage Photo Section */}
          <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
            <div style={{ fontWeight: '800', fontSize: '0.75rem', marginBottom: '16px', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Camera size={14} color="var(--primary)" /> Foto da Carta FUT
              </span>
              {player.photo ? (
                <span style={{ fontSize: '10px', color: '#fbbf24', background: 'rgba(251,191,36,0.15)', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>Foto Ativa</span>
              ) : (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '10px' }}>Silhueta Padrão</span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
              <div style={{ 
                width: '100px', 
                height: '100px', 
                borderRadius: '16px', 
                background: '#0a0a0f', 
                overflow: 'hidden', 
                border: '2px solid var(--primary)', 
                boxShadow: '0 0 16px rgba(0, 245, 155, 0.25)', 
                flexShrink: 0, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                position: 'relative'
              }}>
                {player.photo ? (
                  <img src={formatPhotoUrl(player.photo)} alt="Thumbnail" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <UserCircle size={56} color="rgba(255,255,255,0.3)" />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                {player.photo ? (
                  <>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        type="button" 
                        className="btn btn-secondary"
                        onClick={onOpenAdjustPhoto}
                        style={{ padding: '8px 12px', fontSize: '0.78rem', fontWeight: 800, flex: 1, color: 'var(--primary)', borderColor: 'var(--primary)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                      >
                        <Sliders size={14} /> Ajustar
                      </button>

                      <label className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '0.78rem', fontWeight: 800, flex: 1, cursor: 'pointer', margin: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', borderRadius: '10px' }}>
                        <Camera size={14} /> Trocar
                        <input type="file" style={{ display: 'none' }} accept="image/*" onChange={onSelectNewPhoto} />
                      </label>
                    </div>

                    <button 
                      type="button" 
                      className="btn btn-secondary"
                      onClick={onDeletePhoto}
                      style={{ padding: '7px 12px', fontSize: '0.74rem', width: '100%', color: '#ef4444', borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.06)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
                    >
                      <Trash2 size={14} /> Deletar Foto
                    </button>
                  </>
                ) : (
                  <label className="btn" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', margin: 0, borderRadius: '10px' }}>
                    <Plus size={16} /> Adicionar Foto
                    <input type="file" style={{ display: 'none' }} accept="image/*" onChange={onSelectNewPhoto} />
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Personal Info Grid (Explicit 2 columns) */}
          <div style={{ marginBottom: '10px' }}>
            <h4 style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={14} color="var(--primary)" /> Dados Pessoais & Posição
            </h4>
            
            {/* Nome (Usuário) */}
            <div style={{ marginBottom: '12px' }}>
              <label className="label text-xs font-bold" style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                <UserCheck size={14} color="var(--primary)" /> Nome (Usuário)
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
                <label className="label text-xs" style={{ margin: 0, fontWeight: '800', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Tag size={13} color="var(--primary)" /> Apelidos de Jogo ({currentNicknames.length})
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
                  placeholder="Ex: Mursilha Jr" 
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
                <label className="label text-xs" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Phone size={12} color="var(--primary)" /> Telefone
                </label>
                <input type="text" className="input" style={{ marginBottom: 0, padding: '8px 12px' }} placeholder="54999999999" value={editForm.phone} onChange={e => setEditForm({...editForm, phone: e.target.value})} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label className="label text-xs" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Mail size={12} color="var(--primary)" /> E-mail de Login
                </label>
                <input type="email" className="input" style={{ marginBottom: 0, padding: '8px 12px', width: '100%' }} placeholder="seu@email.com" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} />
              </div>
            </div>
          </div>

          {/* Seção PIN / Senha de Segurança da Conta */}
          <div style={{ padding: '14px 16px', borderRadius: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
              <h4 style={{ fontSize: '0.78rem', fontWeight: '800', color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lock size={14} color="var(--primary)" /> Senha / PIN de Segurança
              </h4>
              <span className={hasPinState ? 'badge badge-volt' : 'badge'} style={{ fontSize: '0.68rem', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {hasPinState ? <><ShieldCheck size={12} /> Protegido com PIN</> : <><ShieldAlert size={12} /> Sem Senha (Livre)</>}
              </span>
            </div>

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
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Info size={12} color="var(--text-muted)" /> Definidas pelas avaliações do elenco e planilha oficial
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

// Subcomponent: Central de Auditoria do Administrador
function AuditModal({ onClose, adminUser }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState('ALL');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/audit-logs`, {
        headers: { 'x-user-id': String(adminUser?.id) }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleClear = async () => {
    if (!window.confirm('Tem certeza que deseja limpar todos os registros de auditoria?')) return;
    try {
      const res = await fetch(`${API_URL}/audit-logs`, {
        method: 'DELETE',
        headers: { 'x-user-id': String(adminUser?.id) }
      });
      if (res.ok) {
        setLogs([]);
      }
    } catch (e) {
      alert('Erro ao limpar auditoria');
    }
  };

  const [isExportingBackup, setIsExportingBackup] = useState(false);

  const handleDownloadBackup = async () => {
    setIsExportingBackup(true);
    try {
      const res = await fetch(`${API_URL}/admin/backup`, {
        headers: { 'x-user-id': String(adminUser?.id) }
      });
      if (!res.ok) throw new Error('Falha ao gerar backup');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-plugshawty-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      fetchLogs();
    } catch (err) {
      alert('Erro ao baixar backup: ' + err.message);
    } finally {
      setIsExportingBackup(false);
    }
  };

  const getActionBadge = (action) => {
    switch (action) {
      case 'LOGIN':
        return { bg: 'rgba(0, 245, 155, 0.15)', color: '#00f59b', border: 'rgba(0, 245, 155, 0.4)', icon: <KeyRound size={11} /> };
      case 'FOTO':
        return { bg: 'rgba(0, 210, 255, 0.15)', color: '#00d2ff', border: 'rgba(0, 210, 255, 0.4)', icon: <Camera size={11} /> };
      case 'PERFIL':
      case 'POSIÇÃO':
        return { bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.4)', icon: <Edit2 size={11} /> };
      case 'PIN':
        return { bg: 'rgba(234, 179, 8, 0.15)', color: '#eab308', border: 'rgba(234, 179, 8, 0.4)', icon: <Lock size={11} /> };
      case 'AVALIAÇÃO':
        return { bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.4)', icon: <ClipboardList size={11} /> };
      case 'ADMIN':
        return { bg: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'rgba(239, 68, 68, 0.4)', icon: <Shield size={11} /> };
      case 'PLANILHA':
        return { bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.4)', icon: <FileSpreadsheet size={11} /> };
      default:
        return { bg: 'rgba(255, 255, 255, 0.1)', color: '#e2e8f0', border: 'rgba(255, 255, 255, 0.2)', icon: <Zap size={11} /> };
    }
  };

  const filteredLogs = logs.filter(item => {
    const matchesSearch = !search || 
      (item.username && item.username.toLowerCase().includes(search.toLowerCase())) ||
      (item.details && item.details.toLowerCase().includes(search.toLowerCase())) ||
      (item.action && item.action.toLowerCase().includes(search.toLowerCase()));
    
    if (!matchesSearch) return false;
    if (selectedAction === 'ALL') return true;
    return item.action === selectedAction;
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 15 }} 
        animate={{ scale: 1, opacity: 1, y: 0 }} 
        exit={{ scale: 0.95, opacity: 0, y: 15 }}
        className="glass-card" 
        style={{ 
          width: '680px', 
          maxWidth: '96vw', 
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(15, 18, 28, 0.98)', 
          border: '1px solid rgba(139, 92, 246, 0.4)', 
          borderRadius: '24px', 
          boxShadow: '0 25px 60px rgba(0,0,0,0.95), 0 0 30px rgba(139, 92, 246, 0.15)', 
          padding: '24px',
          position: 'relative'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(139, 92, 246, 0.2)', border: '1px solid #8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={18} color="#c084fc" />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff', margin: 0 }}>
                Auditoria do App (Admin)
              </h3>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Registro de todas as atividades, logins e alterações feitas pelos atletas.
            </p>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '7px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar: Filtros e Busca */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="Buscar por atleta ou detalhe..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '8px 12px 8px 34px', 
                  borderRadius: '10px', 
                  background: 'rgba(255,255,255,0.04)', 
                  border: '1px solid var(--border)', 
                  color: '#fff', 
                  fontSize: '0.82rem' 
                }}
              />
            </div>
            <button 
              className="btn btn-secondary" 
              onClick={fetchLogs} 
              disabled={loading}
              style={{ padding: '8px 14px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Atualizar registros agora"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={handleDownloadBackup} 
              disabled={isExportingBackup}
              style={{ padding: '8px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', color: '#60a5fa', borderColor: 'rgba(96, 165, 250, 0.4)' }}
              title="Baixar backup completo do banco de dados em JSON"
            >
              <HardDriveDownload size={14} className={isExportingBackup ? 'animate-spin' : ''} />
              {isExportingBackup ? 'Baixando...' : 'Backup (.json)'}
            </button>
            {logs.length > 0 && (
              <button 
                className="btn btn-secondary" 
                onClick={handleClear} 
                style={{ padding: '8px 12px', fontSize: '0.8rem', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                title="Limpar histórico"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {/* Categorias Rápidas */}
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
            {[
              { id: 'ALL', label: 'Todos' },
              { id: 'LOGIN', label: 'Logins' },
              { id: 'FOTO', label: 'Fotos' },
              { id: 'PERFIL', label: 'Perfis' },
              { id: 'PIN', label: 'PINs' },
              { id: 'AVALIAÇÃO', label: 'Avaliações' },
              { id: 'ADMIN', label: 'Admin' }
            ].map(cat => (
              <button 
                key={cat.id}
                onClick={() => setSelectedAction(cat.id)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '8px',
                  fontSize: '0.74rem',
                  fontWeight: selectedAction === cat.id ? '800' : '500',
                  background: selectedAction === cat.id ? 'var(--primary)' : 'rgba(255,255,255,0.04)',
                  color: selectedAction === cat.id ? '#000' : 'var(--text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Resumo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', marginBottom: '12px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
          <span>Mostrando <strong>{filteredLogs.length}</strong> de {logs.length} registros</span>
          <span>Atualizado em tempo real</span>
        </div>

        {/* Lista de Registros */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
          {loading && logs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px', color: 'var(--primary)' }} />
              Carregando histórico de auditoria...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Nenhum registro encontrado para este filtro.
            </div>
          ) : (
            filteredLogs.map(log => {
              const badge = getActionBadge(log.action);
              return (
                <div 
                  key={log.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '10px 14px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '12px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div 
                      style={{ 
                        padding: '4px 8px', 
                        borderRadius: '6px', 
                        fontSize: '0.72rem', 
                        fontWeight: '800', 
                        background: badge.bg, 
                        color: badge.color, 
                        border: `1px solid ${badge.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        flexShrink: 0
                      }}
                    >
                      <span>{badge.icon}</span>
                      <span>{log.action}</span>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: '800', color: '#fff', lineHeight: 1.2 }}>
                        {log.username}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', marginTop: '2px', lineHeight: 1.3 }}>
                        {log.details}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0, marginTop: '2px' }}>
                    {log.created_at}
                  </div>
                </div>
              );
            })
          )}
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
  const [showAuditModal, setShowAuditModal] = useState(false);

  // Player Stats Modal state
  const [selectedPlayerModal, setSelectedPlayerModal] = useState(null);
  const [playerHistory, setPlayerHistory] = useState([]);
  const [playerHistoryLoading, setPlayerHistoryLoading] = useState(false);

  useEffect(() => {
    if (selectedPlayerModal) {
      setPlayerHistoryLoading(true);
      fetch(`${API_URL}/users/${selectedPlayerModal.id}/history`)
        .then(res => res.json())
        .then(data => {
          setPlayerHistory(data);
          setPlayerHistoryLoading(false);
        })
        .catch(err => {
          console.error(err);
          setPlayerHistoryLoading(false);
        });
    }
  }, [selectedPlayerModal]);

  const EVAL_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdBKBRFIXYLRsJwf0FwNqQJqhD8a5PvD0xLbB9zY1v3x26gQw/viewform';

  const handleConfirmAlreadyAnswered = () => {
    localStorage.setItem('has_answered_eval_' + (user?.id || 'guest'), 'true');
    setEvalAnswered(true);
    setEvalConfirmationView(true);

    // Registra na auditoria do app
    fetch(`${API_URL}/audit-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-id': String(user?.id) },
      body: JSON.stringify({ action: 'AVALIAÇÃO', details: 'Confirmou que respondeu ao Formulário Oficial de Avaliação' })
    }).catch(() => {});
  };

  const handleGoToForm = () => {
    window.open(EVAL_FORM_URL, '_blank', 'noopener,noreferrer');
    setShowEvalModal(false);
    setEvalConfirmationView(false);
  };

  const [downloadingCardId, setDownloadingCardId] = useState(null);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);

  const handleDownloadBackupDirect = async () => {
    setIsDownloadingBackup(true);
    try {
      const res = await fetch(`${API_URL}/admin/backup`, {
        headers: { 'x-user-id': String(user?.id) }
      });
      if (!res.ok) throw new Error('Falha ao gerar backup');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-plugshawty-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      alert('✅ Backup do clube exportado com sucesso em JSON!');
    } catch (err) {
      alert('Erro ao baixar backup: ' + err.message);
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const handleDownloadCard = async (player, e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    const cardEl = document.getElementById(`fut-card-${player.id}`);
    if (!cardEl) return;

    setDownloadingCardId(player.id);
    try {
      const dataUrl = await toPng(cardEl, { 
        cacheBust: true, 
        pixelRatio: 2.5,
        filter: (node) => !node.classList?.contains('fut-card-btn-action') && !node.classList?.contains('fut-card-shine'),
        style: {
          transform: 'none',
          boxShadow: 'none'
        }
      });

      const playerName = player.nickname ? player.nickname.split(',')[0].trim() : player.username;
      const fileName = `carta-fut-${playerName.toLowerCase().replace(/\s+/g, '-')}-ovr${calcOVR(player)}.png`;

      // Download direto do arquivo PNG no dispositivo (PC e celular)
      const link = document.createElement('a');
      link.download = fileName;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro ao gerar imagem da carta:', err);
      alert('Não foi possível gerar a imagem da carta FUT. Tente novamente.');
    } finally {
      setDownloadingCardId(null);
    }
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
    if (!isMyPlayer(player) && !isAdmin) {
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
    if (!isMyPlayer(player) && !isAdmin) {
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
    if (!isMyPlayer(targetPlayer) && !isAdmin) {
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
    if (!isMyPlayer(cropModalPlayer) && !isAdmin) {
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

  const location = useLocation();

  useEffect(() => {
    if (location.state?.autoEdit && players.length > 0) {
      const me = players.find(p => isMyPlayer(p));
      if (me) {
        startEditing(me);
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, players]);

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
          <div 
            className="fut-card" 
            id={`fut-card-${player.id}`} 
            style={{ 
              cursor: 'pointer',
              ...(isEditable ? { filter: 'drop-shadow(0 0 18px rgba(0, 245, 155, 0.45))' } : {}) 
            }}
            onClick={() => setSelectedPlayerModal(player)}
          >
            <img src="/fut-bg.png" alt="Card Background" className="fut-card-bg" />
            <div className="fut-card-shine" />
            <div className="fut-card-inner">
              {/* Botão de Download / Compartilhar Carta FUT */}
              <button 
                onClick={(e) => handleDownloadCard(player, e)}
                style={{ 
                  position: 'absolute', 
                  top: 14, 
                  left: 16, 
                  width: '34px',
                  height: '34px',
                  background: 'rgba(18, 20, 32, 0.94)', 
                  border: '1.5px solid rgba(0, 245, 155, 0.55)', 
                  borderRadius: '50%', 
                  padding: 0, 
                  color: '#fff', 
                  cursor: 'pointer', 
                  zIndex: 10,
                  boxShadow: '0 0 12px rgba(0, 245, 155, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                className="fut-card-btn-action"
                title="Baixar ou Compartilhar Carta FUT em HD"
                disabled={downloadingCardId === player.id}
              >
                {downloadingCardId === player.id ? (
                  <Loader2 size={15} className="animate-spin" color="var(--primary)" />
                ) : (
                  <Download size={15} color="var(--primary)" />
                )}
              </button>

              {/* Botão de edição: exibido APENAS para o Meu Jogador */}
              {isEditable && (
                <button 
                  onClick={() => startEditing(player)}
                  style={{ 
                    position: 'absolute', 
                    top: 14, 
                    right: 16, 
                    width: '34px',
                    height: '34px',
                    background: 'rgba(18, 20, 32, 0.94)', 
                    border: '1.5px solid var(--primary)', 
                    borderRadius: '50%', 
                    padding: 0, 
                    color: '#fff', 
                    cursor: 'pointer', 
                    zIndex: 10,
                    boxShadow: '0 0 12px rgba(0, 245, 155, 0.45)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  className="fut-card-btn-action"
                  title="Editar Meu Perfil & Carta"
                >
                  <Edit2 size={15} color="var(--primary)" />
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

          {/* Botões de Ação para o Meu Jogador */}
          {isEditable && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '310px' }}>
              <button 
                className="btn" 
                style={{ 
                  width: '100%', 
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



              {isAdmin && (
                <>
                  <button 
                    className="btn btn-secondary" 
                    style={{ 
                      width: '100%', 
                      padding: '10px 16px', 
                      fontSize: '0.82rem', 
                      fontWeight: '800', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '8px',
                      borderRadius: '12px',
                      border: '1px solid rgba(139, 92, 246, 0.45)',
                      background: 'rgba(139, 92, 246, 0.1)',
                      color: '#c084fc',
                      boxShadow: '0 0 14px rgba(139, 92, 246, 0.15)'
                    }}
                    onClick={() => setShowAuditModal(true)}
                  >
                    <ShieldCheck size={16} color="#c084fc" /> Auditoria do App (Admin)
                  </button>

                  <button 
                    className="btn btn-secondary" 
                    style={{ 
                      width: '100%', 
                      padding: '9px 16px', 
                      fontSize: '0.80rem', 
                      fontWeight: '800', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '8px',
                      borderRadius: '12px',
                      border: '1px solid rgba(96, 165, 250, 0.4)',
                      background: 'rgba(96, 165, 250, 0.08)',
                      color: '#60a5fa'
                    }}
                    onClick={handleDownloadBackupDirect}
                    disabled={isDownloadingBackup}
                  >
                    <HardDriveDownload size={15} color="#60a5fa" className={isDownloadingBackup ? 'animate-spin' : ''} />
                    {isDownloadingBackup ? 'Gerando Backup...' : 'Baixar Backup do Clube (.json)'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Botões para Outros Atletas */}
          {!isEditable && (
            <div style={{ width: '310px', display: 'flex', flexDirection: 'column', gap: '6px' }}>


              {isAdmin && (
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
              )}


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
              {players.length} Atletas cadastrados
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
            {/* Botão de Avaliação do Elenco (Para todos os jogadores) */}
            <button 
              type="button" 
              className="btn" 
              style={{ 
                flex: 1, 
                padding: '10px 6px', 
                fontSize: '0.8rem', 
                fontWeight: '800',
                background: evalAnswered 
                  ? 'rgba(0, 245, 155, 0.08)' 
                  : 'linear-gradient(135deg, rgba(0, 245, 155, 0.22) 0%, rgba(0, 180, 216, 0.22) 100%)',
                border: '1px solid var(--primary)',
                color: 'var(--primary)',
                boxShadow: evalAnswered ? 'none' : '0 0 16px rgba(0, 245, 155, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
              onClick={() => { setShowEvalModal(true); setEvalConfirmationView(evalAnswered); }}
              title="Preencher ou consultar formulário de avaliação dos jogadores"
            >
              <ClipboardList size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Avaliação {evalAnswered && '✅'}</span>
            </button>

            {isAdmin && (
              <>
                <label 
                  className="btn btn-secondary desktop-only" 
                  style={{ width: 'auto', padding: '10px', cursor: 'pointer', margin: 0, alignItems: 'center', justifyContent: 'center', display: 'flex', gap: '8px' }}
                  title="Importar notas da planilha Excel (.xlsx)"
                >
                  <FileSpreadsheet size={16} color="var(--primary)" /> 
                  {isImporting && <Loader2 size={16} className="animate-spin" color="var(--primary)" />}
                  <input 
                    type="file" 
                    accept=".xlsx,.xls,.csv" 
                    style={{ display: 'none' }} 
                    onChange={handleImportExcel}
                    disabled={isImporting}
                  />
                </label>

                <button className="btn" style={{ flex: 1, padding: '10px 6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', whiteSpace: 'nowrap' }} onClick={() => setIsCreating(!isCreating)}>
                  <Plus size={16} style={{ flexShrink: 0 }} /> Novo Atleta
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            
            {/* Search Box */}
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                className="input" 
                placeholder="Buscar atleta..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '40px', marginBottom: 0, width: '100%', height: '40px' }}
              />
            </div>

            {/* Position Pills (5 colunas simétricas no grid - cabem todos na tela de uma vez) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px', width: '100%' }}>
              {[
                { id: 'ALL', label: 'Todos' },
                { id: 'ATA', label: 'ATA' },
                { id: 'MEI', label: 'MEI' },
                { id: 'DEF', label: 'DEF' },
                { id: 'GOL', label: 'GOL' }
              ].map(pos => (
                <button
                  key={pos.id}
                  type="button"
                  className={`btn ${selectedPosition === pos.id ? '' : 'btn-secondary'}`}
                  style={{ 
                    padding: '8px 2px', 
                    fontSize: '0.78rem', 
                    fontWeight: 800, 
                    width: '100%', 
                    borderRadius: '10px', 
                    textAlign: 'center', 
                    justifyContent: 'center' 
                  }}
                  onClick={() => setSelectedPosition(pos.id)}
                >
                  {pos.label}
                </button>
              ))}
            </div>

            {/* Sort Selector (100% da largura, perfeitamente visível) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
              <ArrowUpDown size={15} color="var(--primary)" style={{ flexShrink: 0 }} />
              <select 
                className="input" 
                style={{ width: '100%', marginBottom: 0, padding: '7px 12px', fontSize: '0.80rem', height: '38px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)' }}
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

                <h3 className="text-xl font-extrabold text-main" style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Check size={22} color="var(--primary)" /> Tudo Certo!
                </h3>
                <p className="text-muted text-sm" style={{ margin: '0 0 22px', lineHeight: 1.45 }}>
                  Suas notas já foram enviadas e são levadas em conta no cálculo oficial do OVR do elenco. Segue o jogo!
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

      {/* Central de Auditoria Exclusiva do Admin */}
      {showAuditModal && (
        <AuditModal onClose={() => setShowAuditModal(false)} adminUser={user} />
      )}

      {/* Modal de Estatísticas e Histórico do Atleta */}
      <AnimatePresence>
        {selectedPlayerModal && (
          <div 
            style={{ 
              position: 'fixed', 
              inset: 0, 
              background: 'rgba(0,0,0,0.85)', 
              backdropFilter: 'blur(16px)', 
              WebkitBackdropFilter: 'blur(16px)',
              zIndex: 1200, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              padding: '16px' 
            }}
            onClick={() => setSelectedPlayerModal(null)}
          >
            <motion.div 
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="glass-card"
              style={{ 
                width: '100%', 
                maxWidth: '520px', 
                maxHeight: '90dvh', 
                overflowY: 'auto',
                background: 'rgba(14, 16, 26, 0.98)', 
                borderRadius: '24px', 
                border: '1.5px solid rgba(0, 245, 155, 0.35)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(0,245,155,0.15)',
                padding: '24px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
              }}
            >
              {/* Barra Superior do Modal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Perfil & Histórico do Atleta
                </span>
                <button 
                  onClick={() => setSelectedPlayerModal(null)} 
                  style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Cabeçalho do Atleta: Foto, Nome, Posição e OVR */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '18px', border: '1px solid var(--border)' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#0a0a0f', border: '2.5px solid var(--primary)', boxShadow: '0 0 16px rgba(0, 245, 155, 0.3)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selectedPlayerModal.photo ? (
                    <img src={formatPhotoUrl(selectedPlayerModal.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: '24px', fontWeight: 900, color: 'var(--primary)' }}>
                      {selectedPlayerModal.username?.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                    {selectedPlayerModal.nickname ? String(selectedPlayerModal.nickname).split(',')[0].trim() : (selectedPlayerModal.username || 'Atleta')}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span className="badge badge-volt" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                      {selectedPlayerModal.position || 'MEI'}
                    </span>
                    {selectedPlayerModal.height && <span>• {Number(selectedPlayerModal.height).toFixed(2)}m</span>}
                    {selectedPlayerModal.weight && <span>• {selectedPlayerModal.weight}kg</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'center', background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 215, 0, 0.05))', border: '1.5px solid rgba(255, 215, 0, 0.4)', borderRadius: '14px', padding: '8px 12px', flexShrink: 0 }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffd700', lineHeight: 1 }}>
                    {calcOVR(selectedPlayerModal)}
                  </div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#ffd700', textTransform: 'uppercase', marginTop: '2px' }}>
                    OVR
                  </div>
                </div>
              </div>

              {/* Grid de Estatísticas na Temporada */}
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                  Estatísticas na Temporada
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{selectedPlayerModal.matches_count || 0}</div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>PARTIDAS</div>
                  </div>
                  <div style={{ background: 'rgba(0, 245, 155, 0.06)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid rgba(0, 245, 155, 0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--primary)', lineHeight: 1.1 }}>{selectedPlayerModal.goals || 0}</div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--primary)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>GOLS</div>
                  </div>
                  <div style={{ background: 'rgba(251, 191, 36, 0.06)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid rgba(251, 191, 36, 0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fbbf24', lineHeight: 1.1 }}>{selectedPlayerModal.assists || 0}</div>
                    <div style={{ fontSize: '0.66rem', color: '#fbbf24', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>ASSISTS</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#38bdf8', lineHeight: 1.1 }}>{selectedPlayerModal.win_rate || 0}%</div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>VITÓRIAS</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ffd700', lineHeight: 1.1 }}>
                      {selectedPlayerModal.avg_rating ? Number(selectedPlayerModal.avg_rating).toFixed(1) : '-'}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>NOTA MÉDIA</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f43f5e', lineHeight: 1.1 }}>{selectedPlayerModal.win_streak || 0}</div>
                    <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>SEQUÊNCIA</div>
                  </div>
                </div>
              </div>

              {/* Atributos da Carta FUT */}
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                  Atributos da Carta FUT
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {[
                    { label: 'Ritmo (PAC)', val: selectedPlayerModal.pace || 50 },
                    { label: 'Finalização (SHO)', val: selectedPlayerModal.shooting || 50 },
                    { label: 'Passe (PAS)', val: selectedPlayerModal.passing || 50 },
                    { label: 'Drible (DRI)', val: selectedPlayerModal.dribbling || 50 },
                    { label: 'Defesa (DEF)', val: selectedPlayerModal.defending || 50 },
                    { label: 'Físico (PHY)', val: selectedPlayerModal.physical || 50 }
                  ].map(attr => (
                    <div key={attr.label} style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{attr.label}</span>
                        <span style={{ color: attr.val >= 75 ? 'var(--primary)' : attr.val >= 60 ? '#fbbf24' : '#ef4444', fontWeight: 900 }}>{attr.val}</span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, Math.max(0, attr.val))}%`, height: '100%', background: attr.val >= 75 ? 'var(--primary)' : attr.val >= 60 ? '#fbbf24' : '#ef4444', borderRadius: '2px' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Histórico em Peladas Recentes */}
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                  Histórico em Partidas
                </div>
                {playerHistoryLoading ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Carregando histórico...</div>
                ) : playerHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                    Nenhuma partida anterior registrada para este atleta.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                    {playerHistory.map(h => {
                      const hDate = new Date(h.date + 'T12:00:00');
                      const rawHDate = isNaN(hDate.getTime()) ? h.date : hDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                      const formattedHDate = rawHDate ? rawHDate.charAt(0).toUpperCase() + rawHDate.slice(1) : '';

                      return (
                        <div key={h.match_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff' }}>{formattedHDate}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{h.team_name}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem', fontWeight: 800 }}>
                            {h.goals > 0 && <span style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Goal size={13} /> {h.goals}</span>}
                            {h.assists > 0 && <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Footprints size={13} /> {h.assists}</span>}
                            {h.rating && <span style={{ color: '#ffd700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Star size={13} fill="#ffd700" color="#ffd700" /> {h.rating}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Botões de Ação do Modal */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                {(isMyPlayer(selectedPlayerModal) || isAdmin) && (
                  <button 
                    className="btn" 
                    style={{ flex: 1, padding: '11px', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    onClick={() => {
                      const p = selectedPlayerModal;
                      setSelectedPlayerModal(null);
                      startEditing(p);
                    }}
                  >
                    <Edit2 size={16} /> Editar Dados e Carta FUT
                  </button>
                )}
                <button 
                  className="btn btn-secondary" 
                  style={{ flex: (isMyPlayer(selectedPlayerModal) || isAdmin) ? '0 0 100px' : 1, padding: '11px', fontSize: '0.85rem' }}
                  onClick={() => setSelectedPlayerModal(null)}
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
