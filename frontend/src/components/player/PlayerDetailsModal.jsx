import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Goal, Footprints, Star, Edit2 } from 'lucide-react';
import { calcOVR } from '../../utils/ovr';
import { formatPhotoUrl } from '../../config';
import { getPrimaryName } from '../../utils/formatters';
import ResumoForma from '../ResumoForma';
import AchievementBadge from '../AchievementBadge';

export default function PlayerDetailsModal({
  isOpen,
  player,
  onClose,
  playerHistory = [],
  playerHistoryLoading = false,
  isMyPlayer = () => false,
  isAdmin = false,
  onEdit
}) {
  if (!isOpen || !player) return null;

  const displayName = getPrimaryName(player);

  const badges = [];
  if (player.goals && player.goals >= 5) {
    badges.push({
      id: 'top_scorer',
      title: `${player.goals} gols marcados na temporada`,
      shortLabel: `${player.goals} Gols`,
      color: '#00f59b',
      bg: 'linear-gradient(135deg, rgba(0, 245, 155, 0.22), rgba(0, 200, 115, 0.08))',
      border: 'rgba(0, 245, 155, 0.45)',
      glow: '0 0 10px rgba(0, 245, 155, 0.25)'
    });
  }
  if (player.assists && player.assists >= 3) {
    badges.push({
      id: 'top_playmaker',
      title: `${player.assists} assistências na temporada`,
      shortLabel: `${player.assists} Ast`,
      color: '#00e5ff',
      bg: 'linear-gradient(135deg, rgba(0, 229, 255, 0.22), rgba(0, 160, 220, 0.08))',
      border: 'rgba(0, 229, 255, 0.45)',
      glow: '0 0 10px rgba(0, 229, 255, 0.25)'
    });
  }
  if (player.avg_rating && player.avg_rating >= 7.5) {
    badges.push({
      id: 'mvp',
      title: `Nota média de elite (${player.avg_rating.toFixed(1)})`,
      shortLabel: 'Elite',
      color: '#ffd700',
      bg: 'linear-gradient(135deg, rgba(255, 215, 0, 0.25), rgba(218, 165, 32, 0.1))',
      border: 'rgba(255, 215, 0, 0.55)',
      glow: '0 0 12px rgba(255, 215, 0, 0.35)'
    });
  }
  if (player.win_streak && player.win_streak >= 2) {
    badges.push({
      id: 'hot_streak',
      title: `Sequência de ${player.win_streak} vitórias consecutivas`,
      shortLabel: `${player.win_streak}V`,
      color: '#ff7700',
      bg: 'linear-gradient(135deg, rgba(255, 119, 0, 0.25), rgba(255, 68, 0, 0.08))',
      border: 'rgba(255, 119, 0, 0.5)',
      glow: '0 0 12px rgba(255, 119, 0, 0.35)'
    });
  }

  return (
    <AnimatePresence>
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.82)',
          backdropFilter: 'blur(10px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}
        onClick={onClose}
      >
        <motion.div 
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="glass-card"
          style={{ 
            width: '100%', 
            maxWidth: '520px', 
            maxHeight: '90dvh', 
            overflowY: 'auto',
            background: 'rgba(14, 16, 26, 0.98)', 
            borderRadius: '24px', 
            border: '1.5px solid rgba(0, 245, 155, 0.35)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 30px rgba(0,245,155,0.15)',
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}
        >
          {/* Barra Superior do Modal */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
              Perfil & Histórico do Atleta
            </span>
            <button 
              onClick={onClose} 
              style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: '#fff', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Cabeçalho do Atleta: Foto, Nome, Posição e OVR */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '18px', border: '1px solid var(--border)' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#0a0a0f', border: '2.5px solid var(--primary)', boxShadow: '0 0 16px rgba(0, 245, 155, 0.3)', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {player.photo ? (
                <img src={formatPhotoUrl(player.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '24px', fontWeight: 900, color: 'var(--primary)' }}>
                  {player.username?.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.3px', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="badge badge-volt" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                  {player.position || 'MEI'}
                </span>
                {player.height && <span>• {Number(player.height).toFixed(2)}m</span>}
                {player.weight && <span>• {player.weight}kg</span>}
                {badges.map((b, idx) => (
                  <AchievementBadge
                    key={idx}
                    badge={b}
                    size="xs"
                    variant="pill"
                  />
                ))}
              </div>
            </div>
            <div style={{ textAlign: 'center', background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15), rgba(255, 215, 0, 0.05))', border: '1.5px solid rgba(255, 215, 0, 0.4)', borderRadius: '14px', padding: '8px 12px', flexShrink: 0 }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffd700', lineHeight: 1 }}>
                {calcOVR(player)}
              </div>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, color: '#ffd700', textTransform: 'uppercase', marginTop: '2px' }}>
                OVR
              </div>
            </div>
          </div>

          {/* Grid de Estatísticas na Temporada */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
              Estatísticas na Temporada
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{player.matches_count || 0}</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>PARTIDAS</div>
              </div>
              <div style={{ background: 'rgba(0, 245, 155, 0.06)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid rgba(0, 245, 155, 0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--primary)', lineHeight: 1.1 }}>{player.goals || 0}</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--primary)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>GOLS</div>
              </div>
              <div style={{ background: 'rgba(251, 191, 36, 0.06)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid rgba(251, 191, 36, 0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#fbbf24', lineHeight: 1.1 }}>{player.assists || 0}</div>
                <div style={{ fontSize: '0.66rem', color: '#fbbf24', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>ASSISTS</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#38bdf8', lineHeight: 1.1 }}>{player.win_rate || 0}%</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>VITÓRIAS</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#ffd700', lineHeight: 1.1 }}>
                  {player.avg_rating ? Number(player.avg_rating).toFixed(1) : '-'}
                </div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>NOTA MÉDIA</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 6px', minHeight: '68px', borderRadius: '14px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#f43f5e', lineHeight: 1.1 }}>{player.win_streak || 0}</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '0.3px', marginTop: '4px' }}>SEQUÊNCIA</div>
              </div>
            </div>
          </div>

          {/* Atributos da Carta FUT */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
              Atributos da Carta FUT
            </div>
            <ResumoForma atleta={player} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {[
                { key: 'pace', label: 'Ritmo (PAC)', val: player.pace || 50 },
                { key: 'shooting', label: 'Finalização (SHO)', val: player.shooting || 50 },
                { key: 'passing', label: 'Passe (PAS)', val: player.passing || 50 },
                { key: 'dribbling', label: 'Drible (DRI)', val: player.dribbling || 50 },
                { key: 'defending', label: 'Defesa (DEF)', val: player.defending || 50 },
                { key: 'physical', label: 'Físico (PHY)', val: player.physical || 50 }
              ].map(attr => {
                const variacao = (player.form && player.form[attr.key]) || 0;
                return (
                  <div key={attr.label} style={{ background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{attr.label}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '5px' }}>
                        {variacao !== 0 && (
                          <span style={{ fontSize: '0.66rem', fontWeight: 800, color: variacao > 0 ? 'var(--primary)' : '#ef4444' }}>
                            {variacao > 0 ? '▲' : '▼'}{Math.abs(variacao)}
                          </span>
                        )}
                        <span style={{ color: attr.val >= 75 ? 'var(--primary)' : attr.val >= 60 ? '#fbbf24' : '#ef4444', fontWeight: 900 }}>{attr.val}</span>
                      </span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, Math.max(0, attr.val))}%`, height: '100%', background: attr.val >= 75 ? 'var(--primary)' : attr.val >= 60 ? '#fbbf24' : '#ef4444', borderRadius: '2px' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Histórico em Partidas */}
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
              Histórico em Partidas
            </div>
            {playerHistoryLoading ? (
              <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Carregando histórico...</div>
            ) : playerHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                Nenhuma partida anterior registrada para este atleta.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                {playerHistory.map(h => {
                  const hDate = new Date(h.date + 'T12:00:00');
                  const rawHDate = isNaN(hDate.getTime()) ? h.date : hDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                  const formattedHDate = rawHDate ? rawHDate.charAt(0).toUpperCase() + rawHDate.slice(1) : '';

                  return (
                    <div key={h.match_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#fff' }}>{formattedHDate}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{h.team_name}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem', fontWeight: 800 }}>
                        {h.goals > 0 && <span style={{ color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Goal size={13} /> {h.goals}</span>}
                        {h.assists > 0 && <span style={{ color: '#fbbf24', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Footprints size={13} /> {h.assists}</span>}
                        {h.rating && <span style={{ color: '#ffd700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}><Star size={13} fill="#ffd700" color="#ffd700" /> {h.rating}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Botões de Ação do Modal */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            {onEdit && (isMyPlayer(player) || isAdmin) && (
              <button 
                className="btn" 
                style={{ flex: 1, padding: '11px', fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={() => {
                  const p = player;
                  onClose();
                  onEdit(p);
                }}
              >
                <Edit2 size={16} /> Editar Dados e Carta FUT
              </button>
            )}
            <button 
              className="btn btn-secondary" 
              style={{ flex: onEdit && (isMyPlayer(player) || isAdmin) ? '0 0 100px' : 1, padding: '11px', fontSize: '0.85rem' }}
              onClick={onClose}
            >
              Fechar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
