const test = require('node:test');
const assert = require('node:assert/strict');
const { historicoDeNotas } = require('../notas');

const agora = Date.parse('2026-10-13T12:00:00Z');
const fechada = { status: 'completed', finished_at: '2026-09-20T12:00:00Z', rating_deadline: null };
const aberta = { status: 'completed', finished_at: new Date(agora - 3600 * 1000).toISOString(), rating_deadline: null };
const nomes = { 1: 'Fela', 2: 'Calebe', 3: 'Stocco' };
const nota = (match, date, de, para, score, extra = fechada) => ({
  match_id: match, date, type: 'internal', opponent: null, ...extra,
  rater_id: de, rated_id: para, score,
  rater_username: nomes[de], rater_nickname: nomes[de], rated_username: nomes[para], rated_nickname: nomes[para]
});

test('separa notas recebidas e dadas por partida, da mais recente para a mais antiga', () => {
  const h = historicoDeNotas(1, [
    nota(10, '2026-09-05', 2, 1, 8), nota(10, '2026-09-05', 3, 1, 6), nota(10, '2026-09-05', 1, 2, 9),
    nota(11, '2026-10-10', 2, 1, 9, aberta), nota(11, '2026-10-10', 1, 1, 7, aberta)
  ], agora);

  assert.deepEqual(h.partidas.map(p => p.match_id), [11, 10]);
  const [recente, antiga] = h.partidas;
  assert.equal(recente.votacao_aberta, true, 'notas de votação aberta também aparecem');
  assert.deepEqual(recente.recebidas.map(n => [n.de, n.nota, n.propria]), [['Calebe', 9, false], ['Fela', 7, true]]);
  assert.deepEqual(recente.dadas.map(n => [n.para, n.nota]), [['Fela', 7]]);
  assert.equal(antiga.media_recebida, 7);
  assert.deepEqual(antiga.dadas.map(n => [n.para, n.nota]), [['Calebe', 9]]);
  // Média das médias por partida: (8 + 7) / 2
  assert.equal(h.media_recebida, 7.5);
  assert.equal(h.partidas_com_nota, 2);
});

test('partida em que ele só deu notas não entra na média recebida', () => {
  const h = historicoDeNotas(1, [nota(12, '2026-09-12', 1, 3, 5)], agora);
  assert.equal(h.partidas[0].media_recebida, null);
  assert.equal(h.media_recebida, null);
  assert.equal(h.media_dada, 5);
});
