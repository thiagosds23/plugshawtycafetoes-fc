import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Clock, Shield, Goal, Footprints, CheckCircle2 } from 'lucide-react';
import { corDaNota, getPrimaryName } from '../../utils/formatters';

/**
 * Contador regressivo do prazo de avaliação de 12 horas.
 */
export function ContadorPrazo({ terminaEm, agoraServidor }) {
  const desvio = agoraServidor ? Date.now() - new Date(agoraServidor).getTime() : 0;
  const restanteAgora = () => new Date(terminaEm).getTime() - (Date.now() - desvio);

  const [restante, setRestante] = useState(restanteAgora);

  useEffect(() => {
    const timer = setInterval(() => {
      setRestante(new Date(terminaEm).getTime() - (Date.now() - desvio));
    }, 1000);
    return () => clearInterval(timer);
  }, [terminaEm, desvio]);

  if (!terminaEm || restante <= 0) return <span>prazo encerrado</span>;

  const horas = Math.floor(restante / 3600000);
  const minutos = Math.floor((restante % 3600000) / 60000);
  const segundos = Math.floor((restante % 60000) / 1000);

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {horas}h {String(minutos).padStart(2, '0')}m {String(segundos).padStart(2, '0')}s
    </span>
  );
}

export default function RatingModal({
  isOpen,
  onClose,
  match,
  ratings,
  setRatings,
  onSubmitRatings,
  jaAvaliei = false,
  user,
  getPlayerEventCount = () => 0
}) {
  if (!isOpen || !match || !match.teams) return null;

  const allMatchPlayers = match.teams.flatMap(t => t.players || []);

  return (
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-card mt-4" style={{ borderColor: '#fbbf24', padding: '16px' }}>
      <div style={{ padding: '0 8px' }}>
        <h3 className="font-bold text-xl md:text-2xl mb-1 text-center text-yellow-400">Vestiário (Avaliação da Partida)</h3>
        <p className="text-center text-muted text-xs md:text-sm mb-2">
          Dê a nota de cada jogador que entrou em campo, inclusive a sua. ({Object.keys(ratings).length}/{allMatchPlayers.length} avaliados)
        </p>
        <p className="text-center text-xs mb-6" style={{ color: '#fbbf24', fontWeight: 700 }}>
          <Clock size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
          Você tem <ContadorPrazo terminaEm={match.rating_ends_at} agoraServidor={match.server_now} /> para enviar ou corrigir.
        </p>
      </div>
      
      {/* Scrollable Player Evaluation Grid */}
      <div style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: '4px', marginBottom: '24px' }}>
        {match.teams.map((team, tIdx) => (
          <div key={team.id} className="mb-6">
            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: tIdx === 0 ? '#00f59b' : '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={16} /> {team.name}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '12px' }}>
              {team.players.map(p => {
                const nota = ratings[p.id];
                const avaliado = nota !== undefined && nota !== null;
                const valorBarra = avaliado ? nota : 5;
                const cor = avaliado ? corDaNota(nota) : 'rgba(255,255,255,0.22)';
                const golsNaPartida = getPlayerEventCount(p.id, 'goals');
                const assistsNaPartida = getPlayerEventCount(p.id, 'assists');

                return (
                  <div key={p.id} className="p-3" style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: `1px solid ${avaliado ? cor + '55' : 'var(--border)'}`, transition: 'border-color 0.2s ease' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="font-bold text-main" style={{ fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                          {getPrimaryName(p.nickname, p.username)}
                          {user && user.id === p.id && <span style={{ fontSize: '10px', color: 'var(--primary)', marginLeft: '6px' }}>(Você)</span>}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', fontSize: '0.72rem', fontWeight: 800, minHeight: '15px' }}>
                          {golsNaPartida > 0 && (
                            <span style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Gols na partida">
                              <Goal size={13} /> {golsNaPartida}
                            </span>
                          )}
                          {assistsNaPartida > 0 && (
                            <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '3px' }} title="Assistências na partida">
                              <Footprints size={13} /> {assistsNaPartida}
                            </span>
                          )}
                          {golsNaPartida === 0 && assistsNaPartida === 0 && (
                            <span style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.68rem' }}>
                              sem gols ou assistências
                            </span>
                          )}
                        </div>
                      </div>

                      <span style={{ fontSize: '1.45rem', fontWeight: 900, color: cor, lineHeight: 1.1, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        {avaliado ? nota : '–'}
                      </span>
                    </div>

                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="1"
                      value={valorBarra}
                      onChange={e => setRatings({ ...ratings, [p.id]: Number(e.target.value) })}
                      className="nota-slider"
                      style={{ '--nota-cor': cor, '--nota-pct': `${valorBarra * 10}%` }}
                      aria-label={`Nota de ${getPrimaryName(p.nickname, p.username)}, de 0 a 10`}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '2px' }}>
                      <span>0</span>
                      {!avaliado && <span style={{ fontSize: '0.6rem' }}>arraste para dar a nota</span>}
                      <span>10</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button className="btn py-3 text-sm md:text-lg font-bold" style={{ flex: '1 1 200px' }} onClick={onSubmitRatings}>
          <CheckCircle2 size={18} /> {jaAvaliei ? 'Atualizar minha avaliação' : 'Enviar minha avaliação'}
        </button>
        <button className="btn btn-secondary py-3 text-sm md:text-lg" style={{ flex: '1 1 100px' }} onClick={onClose}>Voltar</button>
      </div>
    </motion.div>
  );
}
