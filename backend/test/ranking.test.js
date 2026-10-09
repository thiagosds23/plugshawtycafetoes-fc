const test = require('node:test');
const assert = require('node:assert/strict');
const { notaAjustada, minimoParaPremio, notasDoPeriodo } = require('../ranking');

test('nota ajustada: 8,4 em 2 partidas fica atrás de 8,3 em 3 (caso real de set/2026)', () => {
  const media = 6.8;
  const bnd = notaAjustada([8.8, 8.0], media);
  const calebe = notaAjustada([9.2, 8.2, 7.6], media);
  assert.ok(calebe > bnd, `${calebe} deveria passar ${bnd}`);
});

test('nota ajustada: com muitas partidas fica perto da média do próprio atleta', () => {
  const ajustada = notaAjustada(Array(20).fill(8), 6.8);
  assert.ok(Math.abs(ajustada - 8) < 0.15);
});

test('nota ajustada: sem partidas avaliadas é null; sem média do grupo usa a própria', () => {
  assert.equal(notaAjustada([], 6.8), null);
  assert.equal(notaAjustada([7, 9], NaN), 8);
});

test('prêmio exige metade das partidas do período, no mínimo 2', () => {
  assert.equal(minimoParaPremio(5), 3);
  assert.equal(minimoParaPremio(4), 2);
  assert.equal(minimoParaPremio(10), 5);
  assert.equal(minimoParaPremio(0), 2);
  assert.equal(minimoParaPremio(1), 2);
});

test('notas do período: média por partida, ajustada pela média do grupo', () => {
  const { porAtleta, mediaDoGrupo } = notasDoPeriodo([
    { rated_id: 1, match_id: 10, media: 8 },
    { rated_id: 1, match_id: 11, media: 6 },
    { rated_id: 2, match_id: 10, media: 7 }
  ]);
  assert.equal(mediaDoGrupo, 7);
  assert.equal(porAtleta.get(1).media, 7);
  assert.equal(porAtleta.get(1).avaliadas, 2);
  assert.equal(porAtleta.get(2).ajustada, 7);
});
