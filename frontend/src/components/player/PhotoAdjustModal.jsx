import React, { useState, useRef } from 'react';
import { Camera, X, Image as ImageIcon, RefreshCw, Trash2, Check, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { calcOVR } from '../../utils/ovr';
import { formatPhotoUrl } from '../../config';
import { downscaleForAI } from '../../utils/imageProcessing';

export default function PhotoAdjustModal({ player, initialSrc, rawFile, onClose, onSave, onDeletePhoto }) {
  const previewImgRef = useRef(null);
  const [src, setSrc] = useState(initialSrc);
  const [originalSrc, setOriginalSrc] = useState(player && player.original_photo ? formatPhotoUrl(player.original_photo) : initialSrc);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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

      const optimizedBlob = await downscaleForAI(rawBlob, 480);
      setBgProgress(40);

      await new Promise(r => setTimeout(r, 60));

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
      alert('Não foi possível remover o fundo automaticamente neste dispositivo. Recomendamos o remove.bg pelo link abaixo.');
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
      }, 'image/webp', 0.92);
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

        <div style={{ display: 'grid', gridTemplateColumns: hasRemovedBg ? '1fr 1fr' : '1.3fr 1fr', gap: '6px', marginBottom: '8px' }}>
          <button 
            type="button"
            className="btn btn-secondary" 
            onClick={handleRemoveBackground}
            disabled={isRemovingBg}
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
              width: '100%'
            }}
            title="Recortar fundo usando IA local"
          >
            {isRemovingBg ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {isRemovingBg ? `IA (${bgProgress}%)...` : 'Recortar Fundo (IA)'}
          </button>

          {hasRemovedBg ? (
            <button 
              type="button"
              className="btn btn-secondary" 
              onClick={handleRestoreOriginal} 
              style={{ borderRadius: '10px', padding: '7px 6px', fontSize: '0.74rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              <RefreshCw size={13} /> Original
            </button>
          ) : (
            <a 
              href="https://www.remove.bg/pt-br/upload" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn btn-secondary" 
              style={{ 
                color: 'var(--text-muted)', 
                fontSize: '0.72rem',
                padding: '7px 6px',
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                textDecoration: 'none',
                width: '100%'
              }}
              title="Recortar fundo no remove.bg se a IA local falhar"
            >
              <ExternalLink size={12} /> remove.bg
            </a>
          )}
        </div>

        {player?.photo && onDeletePhoto && (
          <div style={{ marginBottom: '8px' }}>
            <button 
              type="button"
              className="btn btn-secondary" 
              onClick={onDeletePhoto} 
              style={{ borderColor: 'rgba(239, 68, 68, 0.35)', color: '#ef4444', background: 'rgba(239, 68, 68, 0.06)', borderRadius: '10px', padding: '7px 6px', fontSize: '0.74rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            >
              <Trash2 size={13} /> Excluir Foto do Atleta
            </button>
          </div>
        )}

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
