import React from 'react';
import { useNotasDoAtleta } from '../utils/notasDoAtleta';
import { getPrimaryName } from '../utils/formatters';

/**
 * Nota de um atleta que, ao ser tocada, abre o histórico de notas dele (recebidas e
 * dadas, partida por partida). Envolve o que já era mostrado, sem mudar o visual.
 * Com `matchId`, a janela abre destacando aquela partida.
 */
export default function NotaClicavel({ atleta, matchId = null, children, style }) {
  const abrirNotas = useNotasDoAtleta();
  if (!atleta || !atleta.id) return children;

  return (
    <button
      type="button"
      onClick={(e) => {
        // Muitas notas ficam dentro de linhas ou cartões clicáveis: o toque é só da nota
        e.stopPropagation();
        abrirNotas(atleta, matchId);
      }}
      title={`Ver as notas de ${getPrimaryName(atleta)}`}
      aria-label={`Ver as notas de ${getPrimaryName(atleta)}`}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        margin: 0,
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        textDecoration: 'underline dotted rgba(255,255,255,0.35)',
        textUnderlineOffset: '3px',
        ...style
      }}
    >
      {children}
    </button>
  );
}
