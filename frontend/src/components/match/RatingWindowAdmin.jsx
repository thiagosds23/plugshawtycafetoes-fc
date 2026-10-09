import React, { useState } from 'react';
import { Hourglass, CircleStop, Save } from 'lucide-react';
import { api } from '../../utils/api';

const DURACOES_RAPIDAS = [6, 12, 24, 48];
const DURACAO_MAXIMA = 7 * 24;

const formatarPrazo = (ms) =>
  new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Controles do administrador sobre a votação de uma partida encerrada: finalizar
 * antes do prazo ou mudar a duração. A duração conta do apito final, então
 * aumentá-la depois que a votação fechou abre a votação de novo.
 */
export default function RatingWindowAdmin({ match, user, onChanged }) {
  const [editando, setEditando] = useState(false);
  const [horas, setHoras] = useState(() => String(Math.round(match.rating_hours || 12)));
  const [salvando, setSalvando] = useState(false);

  const enviar = async (body) => {
    setSalvando(true);
    try {
      await api(`/matches/${match.id}/rating-window`, { method: 'PUT', body, user });
      onChanged();
      return true;
    } catch (err) {
      console.error('Falha ao ajustar a votação:', err);
      alert(err.message);
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const finalizar = async () => {
    const confirmado = window.confirm(
      'Finalizar a votação agora? Ninguém mais poderá dar nota, e as notas já enviadas passam a contar na evolução das cartas.'
    );
    if (confirmado) await enviar({ action: 'close' });
  };

  const salvarDuracao = async () => {
    const ok = await enviar({ hours: Number(horas) });
    if (ok) setEditando(false);
  };

  const horasNum = Number(horas);
  const duracaoValida = Number.isFinite(horasNum) && horasNum >= 1 && horasNum <= DURACAO_MAXIMA;
  const novoFim = duracaoValida ? new Date(match.finished_at).getTime() + horasNum * 3600000 : null;

  const estiloBotao = { width: 'auto', padding: '8px 16px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '6px' };

  return (
    <div style={{ width: '100%', maxWidth: '440px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px' }}>
        {match.rating_open && (
          <button
            className="btn btn-secondary"
            style={{ ...estiloBotao, color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.4)', background: 'rgba(239, 68, 68, 0.08)' }}
            onClick={finalizar}
            disabled={salvando}
          >
            <CircleStop size={14} /> Finalizar votação
          </button>
        )}
        <button className="btn btn-secondary" style={estiloBotao} onClick={() => setEditando(v => !v)} disabled={salvando}>
          <Hourglass size={14} /> {match.rating_open ? 'Alterar duração' : 'Reabrir / alterar duração'}
        </button>
      </div>

      {editando && (
        <div className="glass-card" style={{ width: '100%', padding: '14px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '10px', textAlign: 'center' }}>
            Duração total da votação, contada a partir do encerramento da partida
            {match.rating_hours ? ` (hoje: ${match.rating_hours}h)` : ''}.
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px', marginBottom: '10px' }}>
            {DURACOES_RAPIDAS.map(h => (
              <button
                key={h}
                type="button"
                className={`btn ${horasNum === h ? '' : 'btn-secondary'}`}
                style={{ width: 'auto', padding: '6px 12px', fontSize: '0.78rem' }}
                onClick={() => setHoras(String(h))}
              >
                {h}h
              </button>
            ))}
            <input
              type="number"
              min="1"
              max={DURACAO_MAXIMA}
              className="input"
              value={horas}
              onChange={e => setHoras(e.target.value)}
              title="Duração em horas"
              style={{ width: '76px', marginBottom: 0, padding: '6px 10px', textAlign: 'center' }}
            />
          </div>

          <div style={{ fontSize: '0.76rem', textAlign: 'center', marginBottom: '10px', color: novoFim && novoFim <= Date.now() ? '#fbbf24' : 'var(--text-muted)' }}>
            {!duracaoValida
              ? `Escolha entre 1 e ${DURACAO_MAXIMA} horas.`
              : novoFim <= Date.now()
                ? `Esse prazo já passou (${formatarPrazo(novoFim)}): a votação fica encerrada.`
                : `A votação vai até ${formatarPrazo(novoFim)}.`}
          </div>

          <button
            className="btn w-full"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            onClick={salvarDuracao}
            disabled={!duracaoValida || salvando}
          >
            <Save size={15} /> {salvando ? 'Salvando...' : 'Salvar duração'}
          </button>
        </div>
      )}
    </div>
  );
}
