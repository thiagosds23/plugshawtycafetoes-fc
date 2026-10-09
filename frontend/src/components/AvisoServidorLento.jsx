import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Faixa no topo da tela enquanto o servidor demora a responder. No plano gratuito do
 * Render ele dorme depois de uns 15 minutos sem uso e leva até um minuto para voltar;
 * sem o aviso, o app parecia travado. Escuta o evento "servidor-lento" de utils/api.js.
 */
export default function AvisoServidorLento() {
  const [lento, setLento] = useState(false);

  useEffect(() => {
    const aoMudar = (e) => setLento(Boolean(e.detail));
    window.addEventListener('servidor-lento', aoMudar);
    return () => window.removeEventListener('servidor-lento', aoMudar);
  }, []);

  if (!lento) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1500,
        display: 'flex',
        justifyContent: 'center',
        padding: '8px 12px',
        pointerEvents: 'none'
      }}
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          maxWidth: '560px',
          padding: '10px 16px',
          borderRadius: '14px',
          background: 'rgba(251, 191, 36, 0.14)',
          border: '1px solid rgba(251, 191, 36, 0.45)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
          color: '#fbbf24',
          fontSize: '0.8rem',
          fontWeight: 700,
          lineHeight: 1.35
        }}
      >
        <RefreshCw size={16} className="animate-spin" style={{ flexShrink: 0 }} />
        <span>
          Acordando o servidor... Quando o app fica um tempo sem uso, a primeira resposta pode levar até 1 minuto.
        </span>
      </div>
    </div>
  );
}
