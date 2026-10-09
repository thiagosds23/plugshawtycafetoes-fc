import React from 'react';
import { Shield, Plus, RefreshCw, UserPlus, UserMinus, Goal, Footprints } from 'lucide-react';
import { calcOVR } from '../../utils/ovr';
import { formatPhotoUrl } from '../../config';
import { getPrimaryName } from '../../utils/formatters';

/**
 * Cartão de um time na lista detalhada da partida: cabeçalho com nome e OVR médio e,
 * para cada atleta, os botões de trocar de time, substituir e tirar da partida, e os
 * campos de gols e assistências. Toda ação sobe para o MatchDetails pelas props on*.
 */
export default function CartaoDoTime({
  team,
  idx,
  ovrMedio,
  isRival,
  podeMexerNaEscalacao,
  podeEditarPlacar,
  mexendoNaEscalacao,
  getPlayerEventCount,
  onAddPlayer,
  onOpenPlayer,
  onSwitchTeam,
  onSubstitute,
  onRemovePlayer,
  onSetEventCount
}) {
  return (
    <div
      className="glass-card"
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '18px 14px',
        borderRadius: '20px',
        borderColor: idx === 0 ? 'rgba(0, 245, 155, 0.4)' : 'rgba(255, 255, 255, 0.25)',
        background: idx === 0 ? 'rgba(0, 245, 155, 0.04)' : 'rgba(255, 255, 255, 0.03)'
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: idx === 0 ? '#00f59b' : '#ffffff' }}></div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="font-extrabold" style={{ color: idx === 0 ? '#00f59b' : '#ffffff', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Shield size={20} /> {team.name}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => onAddPlayer(team.id)}
            className="btn btn-secondary no-export"
            style={{ padding: '4px 8px', fontSize: '0.70rem', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px', minWidth: 'auto', width: 'auto' }}
            title="Adicionar jogador a este time"
            hidden={!podeMexerNaEscalacao}
          >
            <Plus size={14} /> JOGADOR
          </button>
          <span className="badge" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border)', fontSize: '0.78rem', padding: '4px 10px', margin: 0 }}>
            OVR Médio: {ovrMedio}
          </span>
        </div>
      </div>

      {/* Player rows with 100% visible name and clean touch controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {team.players.map(p => {
          const gCount = getPlayerEventCount(p.id, 'goals');
          const aCount = getPlayerEventCount(p.id, 'assists');
          const displayName = getPrimaryName(p);

          return (
            <div
              key={p.id}
              onClick={() => onOpenPlayer(p)}
              style={{
                padding: '12px 12px',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '14px',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                cursor: 'pointer',
                transition: 'background 0.15s, border-color 0.15s'
              }}
              title="Toque no card para ver estatísticas e histórico"
            >
              {/* Linha 1: Avatar + Nome Completo + Posição e Botões de Ação */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, padding: '2px 0' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'var(--secondary)', overflow: 'hidden', flexShrink: 0, border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {p.photo ? (
                      <img src={formatPhotoUrl(p.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                        {p.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="font-extrabold text-main" style={{ fontSize: '0.94rem', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {displayName}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{p.position || 'MEI'}</span>
                      <span>•</span>
                      <span>OVR {calcOVR(p)}</span>
                    </div>
                  </div>
                </div>

                {/* Botões de Ação Rápida: Trocar de Time, Substituir e Tirar da partida.
                    Ficam fora da arte exportada para o WhatsApp. */}
                <div className="no-export" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button
                    className="btn btn-secondary"
                    style={{ width: '34px', height: '34px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: '9px' }}
                    title="Trocar de time (COM COLETE ⇄ SEM COLETE)"
                    aria-label={`Trocar ${displayName} de time`}
                    hidden={isRival}
                    onClick={(e) => { e.stopPropagation(); onSwitchTeam(p.id); }}
                    disabled={!podeMexerNaEscalacao || mexendoNaEscalacao}
                  >
                    <RefreshCw size={14} />
                  </button>

                  <button
                    className="btn btn-secondary"
                    style={{ width: '34px', height: '34px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', borderRadius: '9px' }}
                    title="Substituir por outro atleta do elenco"
                    aria-label={`Substituir ${displayName} por outro atleta do elenco`}
                    onClick={(e) => { e.stopPropagation(); onSubstitute({ user_id: p.id, name: displayName, team_name: team.name }); }}
                    disabled={!podeMexerNaEscalacao || mexendoNaEscalacao}
                  >
                    <UserPlus size={14} />
                  </button>

                  <button
                    className="btn btn-secondary"
                    style={{ width: '34px', height: '34px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.35)', borderRadius: '9px' }}
                    title="Tirar da partida"
                    aria-label={`Tirar ${displayName} da partida`}
                    onClick={(e) => { e.stopPropagation(); onRemovePlayer(p); }}
                    disabled={!podeMexerNaEscalacao || mexendoNaEscalacao}
                  >
                    <UserMinus size={14} />
                  </button>
                </div>
              </div>

              {/* Linha 2: Contadores de Gols e Assistências Claros e Espaçosos */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)' }} onClick={e => e.stopPropagation()}>
                {/* Goals Counter Pill with ⚽ Emoji lado a lado */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    background: 'rgba(0, 245, 155, 0.08)',
                    border: '1px solid rgba(0, 245, 155, 0.3)',
                    borderRadius: '10px',
                    padding: '4px 10px',
                    height: '38px',
                    flex: 1,
                    minWidth: 0
                  }}
                  title="Gols marcados pelo atleta"
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <Goal size={14} />
                    <span>Gols</span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={gCount}
                    onFocus={e => e.target.select()}
                    onChange={e => onSetEventCount(p.id, 'goal', e.target.value, e.target)}
                    disabled={!podeEditarPlacar}
                    aria-label={`Gols de ${displayName}`}
                    style={{
                      width: '32px',
                      height: '28px',
                      textAlign: 'center',
                      fontSize: '1rem',
                      fontWeight: '900',
                      background: 'rgba(0,0,0,0.4)',
                      borderRadius: '6px',
                      border: '1px solid rgba(0, 245, 155, 0.3)',
                      color: 'var(--primary)',
                      padding: 0,
                      margin: 0,
                      outline: 'none',
                      flexShrink: 0
                    }}
                  />
                </div>

                {/* Assists Counter Pill with 👟 Emoji e palavra lado a lado */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    background: 'rgba(251, 191, 36, 0.08)',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    borderRadius: '10px',
                    padding: '4px 10px',
                    height: '38px',
                    flex: 1,
                    minWidth: 0
                  }}
                  title="Assistências do atleta"
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    <Footprints size={14} />
                    <span>Assist.</span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={aCount}
                    onFocus={e => e.target.select()}
                    onChange={e => onSetEventCount(p.id, 'assist', e.target.value, e.target)}
                    disabled={!podeEditarPlacar}
                    aria-label={`Assistências de ${displayName}`}
                    style={{
                      width: '32px',
                      height: '28px',
                      textAlign: 'center',
                      fontSize: '1rem',
                      fontWeight: '900',
                      background: 'rgba(0,0,0,0.4)',
                      borderRadius: '6px',
                      border: '1px solid rgba(251, 191, 36, 0.3)',
                      color: '#fbbf24',
                      padding: 0,
                      margin: 0,
                      outline: 'none',
                      flexShrink: 0
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
