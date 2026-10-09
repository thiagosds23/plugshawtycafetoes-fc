import React, { useState, useId } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import FundoModal from './FundoModal';

/**
 * Edição de data, horário, local e (contra rival) nome do adversário.
 *
 * `onSave(form)` grava; quem chama fecha o modal quando dá certo e mostra o erro
 * quando não dá.
 */
export default function EditarPartidaModal({ match, isRival, onClose, onSave }) {
  const tituloId = useId();
  const [form, setForm] = useState(() => ({
    date: match.date || '',
    time: match.time || '',
    location: match.location || '',
    opponent: match.opponent || ''
  }));
  const [salvando, setSalvando] = useState(false);

  const mudar = (campo) => (e) => setForm(prev => ({ ...prev, [campo]: e.target.value }));

  const enviar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    try {
      await onSave(form);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <FundoModal tituloId={tituloId} onClose={salvando ? undefined : onClose}>
      {/* w-full + 384px: a largura de "max-w-sm" que o modal sempre pretendeu ter */}
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card w-full p-6" style={{ background: '#0a0a0f', maxWidth: '384px' }}>
        <div className="flex justify-between items-center mb-4">
          <h4 id={tituloId} className="font-extrabold text-main" style={{ margin: 0 }}>Editar Partida</h4>
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            aria-label="Fechar"
            title="Fechar"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={enviar}>
          <div className="mb-4">
            <label className="font-bold text-muted mb-2" htmlFor={`${tituloId}-data`}>Data da Partida</label>
            <input id={`${tituloId}-data`} type="date" className="input" required value={form.date} onChange={mudar('date')} />
          </div>
          <div className="mb-4">
            <label className="font-bold text-muted mb-2" htmlFor={`${tituloId}-hora`}>Horário</label>
            <input id={`${tituloId}-hora`} type="text" className="input" placeholder="ex: 15h, 19:30" required value={form.time} onChange={mudar('time')} />
          </div>
          <div className="mb-6">
            <label className="font-bold text-muted mb-2" htmlFor={`${tituloId}-local`}>Local / Arena</label>
            <input id={`${tituloId}-local`} type="text" className="input" placeholder="ex: Arena Petrópolis" required value={form.location} onChange={mudar('location')} />
          </div>
          {isRival && (
            <div className="mb-6">
              <label className="font-bold text-muted mb-2" htmlFor={`${tituloId}-adversario`}>Time Adversário</label>
              <input id={`${tituloId}-adversario`} type="text" className="input" placeholder="ex: Real Madruga FC" required maxLength={40} value={form.opponent} onChange={mudar('opponent')} />
            </div>
          )}
          <button type="submit" className="btn w-full" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </form>
      </motion.div>
    </FundoModal>
  );
}
