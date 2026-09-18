/**
 * Utilitários centralizados de formatação e nomes para o plugshawtycafetoes FC.
 */

/**
 * Normaliza altura do jogador aceitando múltiplos formatos (178, 1,78, 1.78) para "1.78"
 */
export function formatHeight(val) {
  if (val === null || val === undefined || val === '') return '';
  let str = String(val).trim().replace(',', '.');
  const num = parseFloat(str);
  if (isNaN(num)) return str;
  if (num > 10) {
    return (num / 100).toFixed(2);
  }
  return num.toFixed(2);
}

/**
 * Retorna o primeiro apelido ou o nome de usuário do atleta.
 * Aceita o objeto atleta ou (nickname, username).
 */
export function getPrimaryName(playerOrNickname, fallbackUsername) {
  if (!playerOrNickname) return fallbackUsername || '';
  if (typeof playerOrNickname === 'object') {
    const p = playerOrNickname;
    if (p.nickname && typeof p.nickname === 'string') {
      const first = p.nickname.split(',')[0].trim();
      if (first) return first;
    }
    return p.username || '';
  }
  if (typeof playerOrNickname === 'string') {
    const first = playerOrNickname.split(',')[0].trim();
    if (first) return first;
  }
  return fallbackUsername || '';
}

/**
 * Formata o nome do time para visualização compacta no celular (COM / SEM para colete).
 */
export function formatShortTeamName(name) {
  if (!name) return '';
  const upper = String(name).toUpperCase();
  if (upper.includes('COLETE') && upper.includes('SEM')) return 'SEM';
  if (upper.includes('COLETE') && upper.includes('COM')) return 'COM';
  return name;
}

/**
 * Retorna a cor semântica da nota (escala 0 a 10).
 */
export function corDaNota(nota) {
  if (nota >= 9) return '#00f59b';
  if (nota >= 7) return '#4ade80';
  if (nota >= 5) return '#fbbf24';
  if (nota >= 3) return '#fb923c';
  return '#ef4444';
}

/**
 * Formata nota decimal no padrão brasileiro (ex: 7,5).
 */
export function formatarNota(valor) {
  if (valor === null || valor === undefined) return '-';
  return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * Retorna o nome principal a exibir na carta (primeiro apelido ou username).
 */
export function getCardDisplayName(player) {
  return getPrimaryName(player);
}

/**
 * Retorna o Tier visual da carta com base no OVR.
 * - Especial / In-Form: 85+
 * - Ouro: 75 a 84
 * - Prata: 65 a 74
 * - Bronze: abaixo de 65
 */
export function getCardTier(ovr) {
  if (ovr >= 85) return 'special';
  if (ovr >= 75) return 'gold';
  if (ovr >= 65) return 'silver';
  return 'bronze';
}

/**
 * Regras automatizadas de conquistas e medalhas para jogadores (Skill: pelada-achievements).
 */
export function getPlayerAchievements(player, allStats = [], period = 'all') {
  if (!player || !allStats || allStats.length === 0) return [];
  const achievements = [];

  const maxGoals = Math.max(...allStats.map(s => s.goals || 0));
  const maxAssists = Math.max(...allStats.map(s => s.assists || 0));
  const maxRating = Math.max(...allStats.map(s => s.avg_rating || 0));
  const maxStreak = Math.max(...allStats.map(s => s.win_streak || 0));
  const activePlayers = allStats.filter(s => (s.matches_count || 0) >= 2);
  const minRating = activePlayers.length > 2 
    ? Math.min(...activePlayers.map(s => (s.avg_rating > 0 ? s.avg_rating : 99)))
    : 99;

  if (player.goals && player.goals === maxGoals && maxGoals > 0) {
    achievements.push({
      id: 'top_scorer',
      title: period === 'month' ? 'Artilheiro do Mês' : 'Artilheiro da Temporada',
      shortLabel: 'Artilheiro',
      badge: '⚽',
      color: '#00f59b',
      bg: 'linear-gradient(135deg, rgba(0, 245, 155, 0.22), rgba(0, 200, 115, 0.08))',
      border: 'rgba(0, 245, 155, 0.45)',
      glow: '0 0 10px rgba(0, 245, 155, 0.25)',
      description: `${player.goals} gols marcados`
    });
  }

  if (player.assists && player.assists === maxAssists && maxAssists > 0) {
    achievements.push({
      id: 'top_playmaker',
      title: period === 'month' ? 'Garçom do Mês' : 'Líder em Assistências',
      shortLabel: 'Garçom',
      badge: '👟',
      color: '#00e5ff',
      bg: 'linear-gradient(135deg, rgba(0, 229, 255, 0.22), rgba(0, 160, 220, 0.08))',
      border: 'rgba(0, 229, 255, 0.45)',
      glow: '0 0 10px rgba(0, 229, 255, 0.25)',
      description: `${player.assists} assistências concedidas`
    });
  }

  if (player.avg_rating && player.avg_rating === maxRating && maxRating > 0) {
    achievements.push({
      id: 'mvp',
      title: period === 'month' ? 'Craque do Mês' : 'MVP da Temporada',
      shortLabel: period === 'month' ? 'Craque' : 'MVP',
      badge: '👑',
      color: '#ffd700',
      bg: 'linear-gradient(135deg, rgba(255, 215, 0, 0.25), rgba(218, 165, 32, 0.1))',
      border: 'rgba(255, 215, 0, 0.55)',
      glow: '0 0 12px rgba(255, 215, 0, 0.35)',
      description: `Nota média de elite (${player.avg_rating.toFixed(1)})`
    });
  }

  if (player.win_streak && player.win_streak === maxStreak && maxStreak >= 2) {
    achievements.push({
      id: 'hot_streak',
      title: `Quem Tá Voando (${player.win_streak} vitórias seguidas)`,
      shortLabel: `${player.win_streak}V Seguidas`,
      badge: '🔥',
      color: '#ff7700',
      bg: 'linear-gradient(135deg, rgba(255, 119, 0, 0.25), rgba(255, 68, 0, 0.08))',
      border: 'rgba(255, 119, 0, 0.5)',
      glow: '0 0 12px rgba(255, 119, 0, 0.35)',
      description: `Sequência de ${player.win_streak} vitórias consecutivas`
    });
  }

  if (['ZAG', 'LE', 'LD', 'VOL', 'GOL'].includes(player.position) && player.avg_rating && player.avg_rating >= 6.8 && (player.matches_count || 0) >= 2) {
    const defenders = allStats.filter(s => ['ZAG', 'LE', 'LD', 'VOL', 'GOL'].includes(s.position) && (s.matches_count || 0) >= 2);
    const topDefRating = Math.max(...defenders.map(d => d.avg_rating || 0));
    if (player.avg_rating === topDefRating) {
      achievements.push({
        id: 'wall',
        title: 'Paredão / Xerife da Zaga',
        shortLabel: 'Xerife',
        badge: '🛡️',
        color: '#c084fc',
        bg: 'linear-gradient(135deg, rgba(192, 132, 252, 0.22), rgba(126, 34, 206, 0.08))',
        border: 'rgba(192, 132, 252, 0.45)',
        glow: '0 0 10px rgba(192, 132, 252, 0.25)',
        description: `Melhor nota defensiva (${player.avg_rating.toFixed(1)})`
      });
    }
  }

  if (player.avg_rating && player.avg_rating === minRating && minRating < 6.0 && (player.matches_count || 0) >= 2 && activePlayers.length > 2) {
    achievements.push({
      id: 'cafe_com_leite',
      title: 'Pé Murcho (Café com Leite)',
      shortLabel: 'Pé Murcho',
      badge: '☕',
      color: '#ff4d79',
      bg: 'linear-gradient(135deg, rgba(255, 77, 121, 0.22), rgba(190, 18, 60, 0.08))',
      border: 'rgba(255, 77, 121, 0.45)',
      glow: '0 0 10px rgba(255, 77, 121, 0.25)',
      description: `Menor nota média do elenco (${player.avg_rating.toFixed(1)})`
    });
  }

  return achievements;
}


