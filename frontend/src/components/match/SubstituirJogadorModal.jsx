import React, { useState, useId } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { getPrimaryName } from '../../utils/formatters';
import FundoModal from './FundoModal';

// Linha clicável de atleta. É um <button> para funcionar também pelo teclado.
const estiloLinha = {
  padding: '10px 14px',
  borderRadius: '10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  textAlign: 'left',
  color: 'inherit',
  font: 'inherit'
};

/**
 * Troca de um atleta da partida por outro do elenco que está de fora.
 *
 * `alvo` é { user_id, name } de quem sai; `onEscolher(novoUserId)` faz a troca e
 * quem chama fecha o modal se deu certo.
 */
export default function SubstituirJogadorModal({ alvo, players = [], onClose, onEscolher }) {
  const tituloId = useId();
  const [enviando, setEnviando] = useState(false);

  const escolher = async (novoUserId) => {
    if (enviando) return;
    setEnviando(true);
    try {
      await onEscolher(novoUserId);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <FundoModal tituloId={tituloId} onClose={onClose}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '440px', padding: '24px' }}>
        <div className="flex justify-between items-center mb-4">
          <h3 id={tituloId} className="font-bold text-main">Substituir {alvo.name}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            title="Fechar"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-muted mb-4">Escolha um jogador do elenco para entrar no lugar de <strong>{alvo.name}</strong>:</p>

        <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
          {players.length > 0 ? (
            players.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => escolher(p.id)}
                disabled={enviando}
                style={estiloLinha}
              >
                <span>
                  <span className="font-bold text-main">{getPrimaryName(p)}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>{p.position || 'CM'}</span>
                </span>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>Entrar <ArrowRight size={13} /></span>
              </button>
            ))
          ) : (
            <div className="text-center text-muted">Nenhum jogador reserva disponível fora da partida.</div>
          )}
        </div>

        <button className="btn btn-secondary w-full" onClick={onClose}>Cancelar</button>
      </div>
    </FundoModal>
  );
}
