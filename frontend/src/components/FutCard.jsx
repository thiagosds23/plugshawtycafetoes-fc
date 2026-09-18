import React from 'react';
import { UserCircle } from 'lucide-react';
import { calcOVR, ovrTrend } from '../utils/ovr';
import { formatPhotoUrl } from '../config';
import { getCardDisplayName, getCardTier } from '../utils/formatters';

/**
 * Componente Reutilizável de Carta FUT oficial do plugshawtycafetoes FC.
 * Respeita proporções percentuais milimétricas do layout EA FC.
 */
export default function FutCard({
  player,
  size = 'normal', // 'normal' | 'sm' | 'xs'
  showTrend = true,
  actionButtons = null,
  onCardClick = null,
  className = '',
  style = {},
  id = undefined
}) {
  if (!player) return null;

  const overall = calcOVR(player);
  const tendencia = showTrend ? ovrTrend(player) : 0;
  const tier = getCardTier(overall);
  const displayName = getCardDisplayName(player);

  const getAttrDeltaClass = (attrKey) => {
    const delta = player.form && player.form[attrKey];
    if (delta > 0) return ' up';
    if (delta < 0) return ' down';
    return '';
  };

  const cardId = id || (player.id ? `fut-card-${player.id}` : undefined);

  return (
    <div
      id={cardId}
      className={`fut-card fut-card-${tier} fut-card-size-${size} ${className}`}
      onClick={onCardClick}
      style={{
        cursor: onCardClick ? 'pointer' : 'default',
        ...style
      }}
    >
      <div className="fut-card-shine" />
      <img src="/fut-bg.png" alt="Card Background" className="fut-card-bg" />

      <div className="fut-card-inner">
        {/* Ações / Botões Flutuantes (ex: Download, Editar) */}
        {actionButtons && (
          <div className="fut-card-actions-slot">
            {actionButtons}
          </div>
        )}

        {/* Overall Rating (OVR) */}
        <div className="fut-rating">{overall}</div>

        {/* Posição Tática */}
        <div className="fut-position">{player.position || 'MEI'}</div>

        {/* Indicador de Tendência / Forma Recente */}
        {tendencia !== 0 && (
          <div
            className={`fut-trend ${tendencia > 0 ? 'up' : 'down'}`}
            title={`OVR ${tendencia > 0 ? 'subiu +' : 'caiu '}${tendencia} pelo desempenho nas partidas`}
          >
            {tendencia > 0 ? '▲' : '▼'}{Math.abs(tendencia)}
          </div>
        )}

        {/* Foto do Atleta (com fallback de ícone) */}
        <div className="fut-photo">
          {player.photo ? (
            <img src={formatPhotoUrl(player.photo)} alt={displayName} loading="lazy" />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent'
              }}
            >
              <UserCircle size={105} color="rgba(0,0,0,0.35)" />
            </div>
          )}
        </div>

        {/* Nome ou Apelido Principal */}
        <div className="fut-name" title={displayName}>
          {displayName}
        </div>

        {/* Linha Oficial dos 6 Atributos */}
        <div className="fut-stats">
          <div className="fut-stat-item">
            <span className="fut-stat-label">PAC</span>
            <span className={`fut-stat-val${getAttrDeltaClass('pace')}`}>
              {player.pace || 50}
            </span>
          </div>
          <div className="fut-stat-item">
            <span className="fut-stat-label">SHO</span>
            <span className={`fut-stat-val${getAttrDeltaClass('shooting')}`}>
              {player.shooting || 50}
            </span>
          </div>
          <div className="fut-stat-item">
            <span className="fut-stat-label">PAS</span>
            <span className={`fut-stat-val${getAttrDeltaClass('passing')}`}>
              {player.passing || 50}
            </span>
          </div>
          <div className="fut-stat-item">
            <span className="fut-stat-label">DRI</span>
            <span className={`fut-stat-val${getAttrDeltaClass('dribbling')}`}>
              {player.dribbling || 50}
            </span>
          </div>
          <div className="fut-stat-item">
            <span className="fut-stat-label">DEF</span>
            <span className={`fut-stat-val${getAttrDeltaClass('defending')}`}>
              {player.defending || 50}
            </span>
          </div>
          <div className="fut-stat-item">
            <span className="fut-stat-label">PHY</span>
            <span className={`fut-stat-val${getAttrDeltaClass('physical')}`}>
              {player.physical || 50}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
