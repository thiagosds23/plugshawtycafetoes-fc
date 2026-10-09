import { describe, it, expect } from 'vitest';
import { sortearTimes, ordemDeRevelacao } from '../utils/sorteio';
import { calcOVR } from '../utils/ovr';

/** Gerador previsível para os testes (mulberry32). */
function semente(valor) {
  let a = valor >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const atleta = (id, nivel, position = 'MEI') => ({
  id, position, pace: nivel, shooting: nivel, passing: nivel, dribbling: nivel, defending: nivel, physical: nivel
});
const soma = (t) => t.reduce((s, p) => s + calcOVR(p), 0);
const ids = (t) => t.map(p => p.id).sort((a, b) => a - b).join(',');
const divisao = (r) => [ids(r.timeA), ids(r.timeB)].sort().join(' | ');

/** Menor diferença de força possível, testando todas as divisões na mão. */
function melhorDiferenca(jogadores) {
  const n = jogadores.length;
  const forca = jogadores.map(p => calcOVR(p));
  const total = forca.reduce((a, b) => a + b, 0);
  let melhor = Infinity;
  for (let mascara = 0; mascara < (1 << n); mascara++) {
    let qtd = 0, s = 0;
    for (let i = 0; i < n; i++) if (mascara & (1 << i)) { qtd++; s += forca[i]; }
    if (qtd !== Math.floor(n / 2)) continue;
    melhor = Math.min(melhor, Math.abs(2 * s - total));
  }
  return melhor;
}

const ELENCO = [
  atleta(1, 81, 'ATA'), atleta(2, 78, 'VOL'), atleta(3, 75, 'LAT'), atleta(4, 75, 'ATA'),
  atleta(5, 73, 'ATA'), atleta(6, 70, 'VOL'), atleta(7, 64, 'MEI'), atleta(8, 63, 'ZAG'),
  atleta(9, 58, 'LAT'), atleta(10, 57, 'LAT'), atleta(11, 52, 'ZAG'), atleta(12, 48, 'ZAG')
];

describe('Sorteio dos times', () => {
  it('fica sempre perto da divisão mais equilibrada possível', () => {
    const otima = melhorDiferenca(ELENCO);
    for (let s = 1; s <= 30; s++) {
      const r = sortearTimes(ELENCO, { aleatorio: semente(s) });
      expect(r.timeA).toHaveLength(6);
      expect(r.timeB).toHaveLength(6);
      // Folga de força (4) mais o que as posições podem custar
      expect(Math.abs(soma(r.timeA) - soma(r.timeB))).toBeLessThanOrEqual(otima + 8);
    }
  });

  it('com os mesmos convocados, sorteios diferentes dão times diferentes', () => {
    const divisoes = new Set();
    for (let s = 1; s <= 40; s++) divisoes.add(divisao(sortearTimes(ELENCO, { aleatorio: semente(s) })));
    // O antigo zigue-zague por OVR dava sempre a mesma divisão
    expect(divisoes.size).toBeGreaterThanOrEqual(4);
  });

  it('foge da divisão do último racha', () => {
    const iguais = Array.from({ length: 8 }, (_, i) => atleta(i + 1, 70));
    const ultimo = { teams: [[1, 2, 3, 4], [5, 6, 7, 8]] };
    // Com 8 atletas iguais, as divisões repetem 4, 6 ou 12 duplas do último racha (12 =
    // os mesmos times). O sorteio escolhe entre as próximas da melhor: nunca a de 12.
    const repetidas = [];
    for (let s = 1; s <= 30; s++) {
      const r = sortearTimes(iguais, { historico: [ultimo], aleatorio: semente(s) });
      expect(divisao(r)).not.toBe('1,2,3,4 | 5,6,7,8');
      expect(r.resumo.duplasRepetidas).toBeLessThanOrEqual(6);
      repetidas.push(r.resumo.duplasRepetidas);
    }
    expect(repetidas).toContain(4);
  });

  it('nunca repete exatamente os mesmos times quando existe outra opção', () => {
    const quatro = [atleta(1, 70), atleta(2, 70), atleta(3, 70), atleta(4, 70)];
    for (let s = 1; s <= 40; s++) {
      const r = sortearTimes(quatro, { historico: [{ teams: [[1, 2], [3, 4]] }], aleatorio: semente(s) });
      expect(divisao(r)).not.toBe('1,2 | 3,4');
    }
  });

  it('divide os zagueiros e põe um goleiro de cada lado', () => {
    const elenco = [
      atleta(1, 70, 'GOL'), atleta(2, 70, 'GOL'), atleta(3, 70, 'ZAG'), atleta(4, 70, 'ZAG'),
      atleta(5, 70, 'ATA'), atleta(6, 70, 'ATA'), atleta(7, 70, 'MEI'), atleta(8, 70, 'MEI')
    ];
    for (let s = 1; s <= 20; s++) {
      const r = sortearTimes(elenco, { aleatorio: semente(s) });
      [r.timeA, r.timeB].forEach(t => {
        expect(t.filter(p => p.position === 'GOL')).toHaveLength(1);
        expect(t.filter(p => p.position === 'ZAG')).toHaveLength(1);
      });
    }
  });

  it('com número ímpar, um time fica com um atleta a mais', () => {
    const r = sortearTimes(ELENCO.slice(0, 11), { aleatorio: semente(7) });
    expect([r.timeA.length, r.timeB.length].sort()).toEqual([5, 6]);
  });

  it('com muita gente (busca em vez de testar tudo) continua equilibrado', () => {
    const muitos = Array.from({ length: 26 }, (_, i) => atleta(i + 1, 45 + ((i * 37) % 40), ['ATA', 'MEI', 'VOL', 'LAT', 'ZAG'][i % 5]));
    const r = sortearTimes(muitos, { aleatorio: semente(3) });
    expect(r.timeA.length + r.timeB.length).toBe(26);
    expect(Math.abs(r.resumo.ovrMedioA - r.resumo.ovrMedioB)).toBeLessThan(1.5);
  });

  it('revela os times alternando, do maior OVR para o menor', () => {
    const r = sortearTimes(ELENCO, { aleatorio: semente(2) });
    const ordem = ordemDeRevelacao(r.timeA, r.timeB);
    expect(ordem).toHaveLength(12);
    expect(ordem.map(o => o.isTeamA)).toEqual([true, false, true, false, true, false, true, false, true, false, true, false]);
    const doA = ordem.filter(o => o.isTeamA).map(o => calcOVR(o.player));
    expect(doA).toEqual([...doA].sort((a, b) => b - a));
  });
});
