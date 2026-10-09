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
 * Posições que concorrem à medalha Xerife. O cadastro usa 'LAT' para os laterais;
 * 'LE' e 'LD' ficam para atletas antigos, gravados antes da posição única.
 */
const POSICOES_DEFENSIVAS = ['ZAG', 'LAT', 'LE', 'LD', 'VOL', 'GOL'];

/**
 * Nota que vale para o ranking e para os prêmios: a média ajustada pelo número de
 * partidas avaliadas (calculada no servidor), que não deixa quem jogou 2 partidas passar
 * na frente de quem manteve o nível em 5. Null se o atleta não tem nota no período.
 */
export function notaDoRanking(player) {
  if (!player) return null;
  if (player.nota_ajustada !== undefined && player.nota_ajustada !== null) return Number(player.nota_ajustada);
  return player.avg_rating > 0 ? Number(player.avg_rating) : null;
}

/** Jogou o suficiente no período para concorrer a MVP, Craque do Mês, Xerife e Pé Murcho. */
export function elegivelAPremio(player) {
  if (!player) return false;
  if (typeof player.elegivel_premio === 'boolean') return player.elegivel_premio;
  return (player.matches_count || 0) >= 2;
}

/**
 * Ordem do ranking: nota ajustada (quem tem nota vem antes), depois aproveitamento,
 * participação em gols e número de jogos.
 */
export function compararNoRanking(a, b) {
  const na = notaDoRanking(a);
  const nb = notaDoRanking(b);
  if (na !== null || nb !== null) {
    if (na === null) return 1;
    if (nb === null) return -1;
    if (nb !== na) return nb - na;
  }
  return (b.win_rate || 0) - (a.win_rate || 0)
    || ((b.goals || 0) + (b.assists || 0)) - ((a.goals || 0) + (a.assists || 0))
    || (b.matches_count || 0) - (a.matches_count || 0);
}

/**
 * Regras automatizadas de conquistas e medalhas para jogadores (Skill: pelada-achievements).
 * Fonte única das medalhas: o ranking, o elenco e o perfil do atleta usam esta função.
 * `allStats` é o elenco inteiro do mesmo período, para comparar quem é o maior.
 *
 * Artilheiro, Garçom e sequência de vitórias são totais e valem para qualquer um. As
 * medalhas que dependem de nota (MVP/Craque, Xerife, Pé Murcho) usam a nota ajustada e
 * só consideram quem jogou o mínimo de partidas do período.
 */
export function getPlayerAchievements(player, allStats = [], period = 'all') {
  if (!player || !allStats || allStats.length === 0) return [];
  const achievements = [];

  const maxGoals = Math.max(...allStats.map(s => s.goals || 0));
  const maxAssists = Math.max(...allStats.map(s => s.assists || 0));
  const maxStreak = Math.max(...allStats.map(s => s.win_streak || 0));

  // Concorrem aos prêmios de nota só os elegíveis que têm nota no período
  const comNota = allStats.filter(s => elegivelAPremio(s) && notaDoRanking(s) !== null);
  const notaDele = notaDoRanking(player);
  const concorre = elegivelAPremio(player) && notaDele !== null;
  const maxNota = comNota.length ? Math.max(...comNota.map(notaDoRanking)) : null;
  const minNota = comNota.length > 2 ? Math.min(...comNota.map(notaDoRanking)) : null;

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

  if (concorre && notaDele === maxNota) {
    achievements.push({
      id: 'mvp',
      title: period === 'month' ? 'Craque do Mês' : 'MVP da Temporada',
      shortLabel: period === 'month' ? 'Craque' : 'MVP',
      badge: '👑',
      color: '#ffd700',
      bg: 'linear-gradient(135deg, rgba(255, 215, 0, 0.25), rgba(218, 165, 32, 0.1))',
      border: 'rgba(255, 215, 0, 0.55)',
      glow: '0 0 12px rgba(255, 215, 0, 0.35)',
      description: `Melhor nota do período (${formatarNota(notaDele)}, ajustada por ${player.rated_matches || player.matches_count || 0} partida(s) avaliada(s))`
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

  if (concorre && POSICOES_DEFENSIVAS.includes(player.position) && notaDele >= 6.8) {
    const defensores = comNota.filter(s => POSICOES_DEFENSIVAS.includes(s.position));
    const melhorDefensor = Math.max(...defensores.map(notaDoRanking));
    if (notaDele === melhorDefensor) {
      achievements.push({
        id: 'wall',
        title: 'Paredão / Xerife da Zaga',
        shortLabel: 'Xerife',
        badge: '🛡️',
        color: '#c084fc',
        bg: 'linear-gradient(135deg, rgba(192, 132, 252, 0.22), rgba(126, 34, 206, 0.08))',
        border: 'rgba(192, 132, 252, 0.45)',
        glow: '0 0 10px rgba(192, 132, 252, 0.25)',
        description: `Melhor nota defensiva (${formatarNota(notaDele)})`
      });
    }
  }

  if (concorre && minNota !== null && notaDele === minNota && minNota < 6.0) {
    achievements.push({
      id: 'cafe_com_leite',
      title: 'Pé Murcho (Café com Leite)',
      shortLabel: 'Pé Murcho',
      badge: '☕',
      color: '#ff4d79',
      bg: 'linear-gradient(135deg, rgba(255, 77, 121, 0.22), rgba(190, 18, 60, 0.08))',
      border: 'rgba(255, 77, 121, 0.45)',
      glow: '0 0 10px rgba(255, 77, 121, 0.25)',
      description: `Menor nota do elenco (${formatarNota(notaDele)})`
    });
  }

  return achievements;
}
