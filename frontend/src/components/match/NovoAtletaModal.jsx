import React, { useState, useId } from 'react';
import { UserPlus, X } from 'lucide-react';
import FundoModal from './FundoModal';

/**
 * Cadastro rápido de um atleta direto da tela da partida.
 *
 * `onSave({ username, nickname, position })` faz o cadastro; quem chama é que fecha
 * o modal quando dá certo e mostra o erro quando não dá.
 */
export default function NovoAtletaModal({ onClose, onSave }) {
  const tituloId = useId();
  const [nome, setNome] = useState('');
  const [apelido, setApelido] = useState('');
  const [posicao, setPosicao] = useState('MEI');
  // Trava o botão durante o envio: dois toques cadastravam o atleta duas vezes
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    if (!nome.trim() || enviando) return;
    setEnviando(true);
    try {
      await onSave({
        username: nome.trim(),
        nickname: apelido.trim() || nome.trim(),
        position: posicao
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <FundoModal tituloId={tituloId} onClose={enviando ? undefined : onClose}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '440px', padding: '28px' }}>
        <div className="flex justify-between items-center mb-4">
          <h3 id={tituloId} className="font-extrabold text-main flex items-center gap-2">
            <UserPlus color="var(--primary)" size={20} /> Cadastrar Novo Atleta
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={enviando}
            aria-label="Fechar"
            title="Fechar"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={enviar}>
          <div className="mb-4">
            <label className="label font-bold" htmlFor={`${tituloId}-nome`}>Nome Completo</label>
            <input
              id={`${tituloId}-nome`}
              type="text"
              className="input"
              placeholder="Ex: João da Silva"
              value={nome}
              onChange={e => setNome(e.target.value)}
              required
              style={{ marginBottom: 0 }}
            />
          </div>

          <div className="mb-4">
            <label className="label font-bold" htmlFor={`${tituloId}-apelido`}>Apelido Principal de Jogo (Opcional)</label>
            <input
              id={`${tituloId}-apelido`}
              type="text"
              className="input"
              placeholder="Ex: Mursilha Jr, Caça Rato, Olise"
              value={apelido}
              onChange={e => setApelido(e.target.value)}
              style={{ marginBottom: 0 }}
            />
          </div>

          <div className="mb-6">
            <label className="label font-bold" htmlFor={`${tituloId}-posicao`}>Posição de Jogo</label>
            <select
              id={`${tituloId}-posicao`}
              className="input"
              value={posicao}
              onChange={e => setPosicao(e.target.value)}
              style={{ marginBottom: 0, height: '42px' }}
            >
              <option value="GOL">GOL — Goleiro</option>
              <option value="ZAG">ZAG — Zagueiro</option>
              <option value="LAT">LAT — Lateral</option>
              <option value="VOL">VOL — Volante</option>
              <option value="MEI">MEI — Meio-Campo</option>
              <option value="ATA">ATA — Atacante</option>
            </select>
          </div>

          <div className="flex gap-3">
            <button type="submit" className="btn" style={{ flex: 1 }} disabled={enviando}>
              {enviando ? 'Cadastrando...' : 'Cadastrar Atleta'}
            </button>
            <button type="button" className="btn btn-secondary" style={{ width: 'auto' }} onClick={onClose} disabled={enviando}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </FundoModal>
  );
}
