import React, { useState, useId } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { calcOVR } from '../../utils/ovr';
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
 * Escolha de um atleta de fora da partida para entrar num time.
 *
 * `onEscolher(userId)` faz a inclusão; quem chama fecha o modal se deu certo.
 */
export default function AdicionarJogadorModal({ players = [], onClose, onEscolher }) {
  const tituloId = useId();
  // Um toque por vez: o segundo toque, com o primeiro ainda em andamento, tentava
  // colocar outro atleta no mesmo pedido
  const [enviando, setEnviando] = useState(false);

  const escolher = async (userId) => {
    if (enviando) return;
    setEnviando(true);
    try {
      await onEscolher(userId);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <FundoModal tituloId={tituloId} onClose={onClose}>
      {/* w-full + 384px: a largura de "max-w-sm" que o modal sempre pretendeu ter */}
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card w-full p-6" style={{ background: '#0a0a0f', maxWidth: '384px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex justify-between items-center mb-4">
          <h4 id={tituloId} className="font-extrabold text-main" style={{ margin: 0 }}>Adicionar Jogador</h4>
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
        <p className="text-muted mb-4">Selecione um jogador para entrar neste time:</p>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {players.length > 0 ? (
            players.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => escolher(p.id)}
                disabled={enviando}
                style={estiloLinha}
              >
                <span className="font-bold">{getPrimaryName(p)}</span>
                <span className="font-bold text-muted">OVR {calcOVR(p)}</span>
              </button>
            ))
          ) : (
            <div className="text-center text-muted">Todos os jogadores já estão na partida.</div>
          )}
        </div>

        <button className="btn btn-secondary w-full mt-4" onClick={onClose}>Cancelar</button>
      </motion.div>
    </FundoModal>
  );
}
