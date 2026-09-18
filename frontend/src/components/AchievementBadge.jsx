import React from 'react';
import { Goal, Crown, Footprints, Flame, ShieldCheck, Coffee, Sparkles } from 'lucide-react';

const ICON_MAP = {
  top_scorer: Goal,
  top_playmaker: Footprints,
  mvp: Crown,
  hot_streak: Flame,
  wall: ShieldCheck,
  cafe_com_leite: Coffee
};

/**
 * Componente oficial de Conquistas & Badges do plugshawtycafetoes FC.
 * Substitui emojis genéricos de sistema operacional por insígnias VIP EA FC / Champions League.
 */
export default function AchievementBadge({ 
  badge, 
  size = 'sm', // 'xs' | 'sm' | 'md'
  variant = 'pill', // 'pill' (ícone + label) | 'compact' (ícone único com glow)
  showLabel = true,
  className = ''
}) {
  if (!badge) return null;

  const IconComponent = ICON_MAP[badge.id] || Sparkles;

  const isXs = size === 'xs';
  const isMd = size === 'md';
  const iconSize = isXs ? 12 : isMd ? 16 : 13;

  const padding = isXs 
    ? (variant === 'compact' ? '3px 5px' : '3px 7px') 
    : isMd 
    ? (variant === 'compact' ? '6px 8px' : '6px 12px')
    : (variant === 'compact' ? '4px 6px' : '4px 9px');

  const fontSize = isXs ? '0.62rem' : isMd ? '0.78rem' : '0.69rem';
  const borderRadius = isXs ? '6px' : isMd ? '10px' : '8px';

  return (
    <span
      className={`achievement-badge ${className}`}
      title={badge.title || badge.description || ''}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: variant === 'compact' ? '0px' : '5px',
        padding,
        borderRadius,
        background: badge.bg || 'rgba(255, 255, 255, 0.06)',
        border: `1.5px solid ${badge.border || 'rgba(255, 255, 255, 0.15)'}`,
        boxShadow: badge.glow || 'none',
        color: badge.color || '#fff',
        fontWeight: 900,
        fontSize,
        letterSpacing: '0.3px',
        textTransform: 'uppercase',
        cursor: 'help',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        flexShrink: 0
      }}
    >
      <IconComponent 
        size={iconSize} 
        color={badge.color} 
        fill={badge.id === 'mvp' || badge.id === 'hot_streak' ? badge.color : 'none'}
        style={{ flexShrink: 0 }}
      />
      {variant !== 'compact' && showLabel && (
        <span style={{ lineHeight: 1, textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>
          {badge.shortLabel || badge.title}
        </span>
      )}
    </span>
  );
}
