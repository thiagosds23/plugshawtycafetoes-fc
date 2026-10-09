import React from 'react';
import { useEscapeKey } from '../../utils/useEscapeKey';

/**
 * Fundo escurecido dos modais da tela da partida. Junta num lugar só o que todo
 * modal precisa para leitor de tela e teclado: role="dialog", aria-modal, o título
 * que o anuncia (aria-labelledby) e o Esc para fechar.
 *
 * Sem `onClose` o Esc não faz nada (ex.: enquanto um envio está em andamento).
 */
export default function FundoModal({ tituloId, onClose, estilo, children }) {
  useEscapeKey(onClose, Boolean(onClose));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(10px)',
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        ...estilo
      }}
    >
      {children}
    </div>
  );
}
