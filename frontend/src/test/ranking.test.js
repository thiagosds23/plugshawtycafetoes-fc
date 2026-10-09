import { describe, it, expect } from 'vitest';
import { getPlayerAchievements, compararNoRanking, notaDoRanking } from '../utils/formatters';

// Recorte do ranking real de set/2026 (5 partidas, mínimo de 3 para prêmio)
const atleta = (nome, extra) => ({
  username: nome, position: 'MEI', goals: 0, assists: 0, win_streak: 0, win_rate: 50, matches_count: 5,
  elegivel_premio: true, ...extra
});
const ELENCO = [
  atleta('BND', { position: 'ATA', avg_rating: 8.42, nota_ajustada: 7.62, rated_matches: 2, matches_count: 2, elegivel_premio: false, goals: 9 }),
  atleta('Calebe', { position: 'VOL', avg_rating: 8.33, nota_ajustada: 7.72, rated_matches: 3, assists: 10, goals: 10 }),
  atleta('Fela', { position: 'ATA', avg_rating: 8.24, nota_ajustada: 7.53, rated_matches: 2, matches_count: 4, goals: 16 }),
  atleta('Wellington', { position: 'LAT', avg_rating: 4.67, nota_ajustada: 6.1, rated_matches: 1, matches_count: 3 }),
  atleta('Yuri', { avg_rating: 0, nota_ajustada: null, rated_matches: 0, matches_count: 4 })
];
const medalhas = (nome) => getPlayerAchievements(ELENCO.find(p => p.username === nome), ELENCO, 'season').map(m => m.id);

describe('Ranking e prêmios', () => {
  it('ordena pela nota ajustada, e quem não tem nota vai para o fim', () => {
    const ordem = [...ELENCO].sort(compararNoRanking).map(p => p.username);
    expect(ordem).toEqual(['Calebe', 'BND', 'Fela', 'Wellington', 'Yuri']);
  });

  it('MVP é a melhor nota ajustada entre quem jogou o mínimo de partidas', () => {
    expect(medalhas('Calebe')).toContain('mvp');
    expect(medalhas('BND')).not.toContain('mvp');
  });

  it('artilheiro e garçom continuam pelos totais, para qualquer um', () => {
    expect(medalhas('Fela')).toContain('top_scorer');
    expect(medalhas('Calebe')).toContain('top_playmaker');
  });

  it('volante com a melhor nota defensiva é o Xerife', () => {
    expect(medalhas('Calebe')).toContain('wall');
  });

  it('sem nota ajustada (dados antigos), cai na média crua', () => {
    expect(notaDoRanking({ avg_rating: 7.5 })).toBe(7.5);
    expect(notaDoRanking({ avg_rating: 0 })).toBe(null);
  });
});
