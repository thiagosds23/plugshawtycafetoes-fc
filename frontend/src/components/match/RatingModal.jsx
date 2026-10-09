import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import { motion } from 'framer-motion';
import { Clock, Shield, Goal, Footprints, CheckCircle2 } from 'lucide-react';
import { corDaNota, getPrimaryName } from '../../utils/formatters';
import { useEscapeKey } from '../../utils/useEscapeKey';

/**
 * Contador regressivo do prazo de avaliação.
 *
 * `onExpire` (opcional) é chamado uma única vez quando o tempo zera, para a tela
 * recarregar a partida e tirar o botão "Avaliar" antes de o usuário preencher tudo
 * e só então levar a recusa do servidor.
 */
export function ContadorPrazo({ terminaEm, agoraServidor, onExpire }) {
  // Diferença entre o relógio do celular e o do servidor, medida uma única vez quando
  // a partida chega. Recalculada a cada render, ela anulava o tempo passado e o
  // contador ficava parado.
  const desvio = useMemo(
    () => (agoraServidor ? Date.now() - new Date(agoraServidor).getTime() : 0),
    [agoraServidor]
  );

  const [restante, setRestante] = useState(() => new Date(terminaEm).getTime() - (Date.now() - desvio));

  // Guarda a função mais recente sem reiniciar o contador quando ela muda
  const aoExpirarRef = useRef(onExpire);
  useEffect(() => { aoExpirarRef.current = onExpire; }, [onExpire]);
  // Prazo que já foi avisado. É por prazo, e não um sim/não: o recarregamento traz um
  // server_now novo (e o desvio muda), mas não pode avisar de novo o mesmo prazo, senão
  // virava um laço de recarregamentos
  const prazoAvisadoRef = useRef(null);

  useEffect(() => {
    const calcular = () => new Date(terminaEm).getTime() - (Date.now() - desvio);
    const atualizar = () => {
      const agora = calcular();
      setRestante(agora);
      if (terminaEm && agora <= 0 && prazoAvisadoRef.current !== terminaEm) {
        prazoAvisadoRef.current = terminaEm;
        if (aoExpirarRef.current) aoExpirarRef.current();
      }
    };
    // Prazo novo (o administrador mudou a duração) aparece na hora, sem esperar o tick
    atualizar();
    const timer = setInterval(atualizar, 1000);
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

/** Nota registrada? Zero é nota válida; "ainda não avaliei" é a ausência da chave. */
const temNota = (nota) => nota !== undefined && nota !== null;

/**
 * Painel de avaliação da partida. Ocupa o lugar da escalação na tela (não é um
 * modal sobreposto), por isso tem role="dialog" mas não aria-modal.
 */
export default function RatingModal({
  isOpen,
  onClose,
  match,
  ratings,
  setRatings,
  onSubmitRatings,
  jaAvaliei = false,
  user,
  getPlayerEventCount = () => 0,
  isSubmitting = false,
  onPrazoEncerrado
}) {
  const tituloId = useId();
  useEscapeKey(onClose, Boolean(isOpen));

  if (!isOpen || !match || !match.teams) return null;

  // Contra rival o adversário é um time sem jogadores: não há quem avaliar nele
  const timesAvaliados = match.teams.filter(t => !t.is_opponent);
  const allMatchPlayers = timesAvaliados.flatMap(t => t.players || []);
  // Só conta nota de quem está nesta partida (as notas podem ter chaves de atletas
  // que saíram dela)
  const quantosAvaliados = allMatchPlayers.filter(p => temNota(ratings[p.id])).length;

  const darNota = (atletaId, valor) => setRatings(prev => ({ ...prev, [atletaId]: Number(valor) }));

  return (
    <motion.div
      role="dialog"
      aria-labelledby={tituloId}
      initial={{ scale: 0.95, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="glass-card mt-4"
      style={{ borderColor: '#fbbf24', padding: '16px' }}
    >
      <div style={{ padding: '0 8px' }}>
        <h3 id={tituloId} className="font-bold mb-1 text-center">Vestiário (Avaliação da Partida)</h3>
        <p className="text-center text-muted mb-2">
          Dê a nota de cada jogador que entrou em campo, inclusive a sua. ({quantosAvaliados}/{allMatchPlayers.length} avaliados)
        </p>
        <p className="text-center mb-6" style={{ color: '#fbbf24', fontWeight: 700 }}>
          <Clock size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
          Você tem <ContadorPrazo terminaEm={match.rating_ends_at} agoraServidor={match.server_now} onExpire={onPrazoEncerrado} /> para enviar ou corrigir.
        </p>
      </div>

      {/* Scrollable Player Evaluation Grid */}
      <div style={{ maxHeight: '65vh', overflowY: 'auto', paddingRight: '4px', marginBottom: '24px' }}>
        {timesAvaliados.map((team, tIdx) => (
          <div key={team.id} className="mb-6">
            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: tIdx === 0 ? '#00f59b' : '#ffffff', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={16} /> {team.name}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '12px' }}>
              {(team.players || []).map(p => {
                const nota = ratings[p.id];
                const avaliado = temNota(nota);
                // Sem nota a barra fica no meio, mas cinza e com "–": é só a posição
                // inicial, não uma nota 5
                const valorBarra = avaliado ? nota : 5;
                const cor = avaliado ? corDaNota(nota) : 'rgba(255,255,255,0.22)';
                const golsNaPartida = getPlayerEventCount(p.id, 'goals');
                const assistsNaPartida = getPlayerEventCount(p.id, 'assists');
                const nome = getPrimaryName(p.nickname, p.username);

                return (
                  <div key={p.id} className="p-3" style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: `1px solid ${avaliado ? cor + '55' : 'var(--border)'}`, transition: 'border-color 0.2s ease' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="font-bold text-main" style={{ fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                          {nome}
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
                      onChange={e => darNota(p.id, e.target.value)}
                      // Tocar na barra sem arrastar não muda o valor, então o onChange não
                      // dispara: sem isto, quem queria dar 5 (a posição inicial) não
                      // conseguia registrar a nota
                      onPointerUp={e => { if (!avaliado) darNota(p.id, e.currentTarget.value); }}
                      onKeyUp={e => { if (!avaliado && (e.key === 'Enter' || e.key === ' ')) darNota(p.id, e.currentTarget.value); }}
                      className="nota-slider"
                      style={{ '--nota-cor': cor, '--nota-pct': `${valorBarra * 10}%` }}
                      aria-label={`Nota de ${nome}, de 0 a 10`}
                      aria-valuetext={avaliado ? `nota ${nota}` : 'sem nota'}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: '2px' }}>
                      <span>0</span>
                      {!avaliado && <span style={{ fontSize: '0.6rem' }}>sem nota: toque ou arraste</span>}
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
        <button className="btn font-bold" style={{ flex: '1 1 200px' }} onClick={onSubmitRatings} disabled={isSubmitting}>
          <CheckCircle2 size={18} /> {isSubmitting ? 'Enviando...' : (jaAvaliei ? 'Atualizar minha avaliação' : 'Enviar minha avaliação')}
        </button>
        <button className="btn btn-secondary" style={{ flex: '1 1 100px' }} onClick={onClose}>Voltar</button>
      </div>
    </motion.div>
  );
}
