import { describe, it, expect } from 'vitest';
import { ajustarParaOVR, calcOVR } from '../utils/ovr';

const atleta = { pace: 62, shooting: 79, passing: 78, dribbling: 77, defending: 52, physical: 63 };

describe('Ajustar os atributos para um OVR', () => {
  it('chega exatamente no OVR pedido, em qualquer posição', () => {
    for (const position of ['ATA', 'MEI', 'VOL', 'ZAG', 'LAT', 'GOL']) {
      for (const alvo of [40, 60, 75, 88, 95]) {
        expect(calcOVR({ ...ajustarParaOVR(atleta, alvo, position), position })).toBe(alvo);
      }
    }
  });

  it('mantém o perfil do atleta: as diferenças entre os atributos continuam iguais', () => {
    const novo = ajustarParaOVR(atleta, calcOVR({ ...atleta, position: 'ATA' }) + 5, 'ATA');
    expect(novo.shooting - novo.defending).toBe(atleta.shooting - atleta.defending);
    expect(novo.passing - novo.pace).toBe(atleta.passing - atleta.pace);
  });

  it('respeita os limites de 1 a 99', () => {
    const novo = ajustarParaOVR(atleta, 99, 'ATA');
    Object.values(novo).forEach(v => {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(99);
    });
  });
});
