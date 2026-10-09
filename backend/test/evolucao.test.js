const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { janelaDeAvaliacao, fimDaAvaliacao, calcularFormasDe, aplicarForma } = require('../evolucao');

const HORA = 3600 * 1000;
const agora = Date.parse('2026-10-08T20:00:00Z');
const haHoras = (h) => new Date(agora - h * HORA).toISOString();

// Mesma fórmula de OVR que o servidor usa (vive no frontend)
let calcOVR;
test.before(async () => {
  calcOVR = (await import(pathToFileURL(path.join(__dirname, '../../frontend/src/utils/ovr.js')).href)).calcOVR;
});

test('votação: 12 horas por padrão a partir do encerramento', () => {
  const j = janelaDeAvaliacao({ status: 'completed', finished_at: haHoras(2) }, agora);
  assert.equal(j.aberta, true);
  assert.equal(j.horas, 12);
  assert.equal(janelaDeAvaliacao({ status: 'completed', finished_at: haHoras(13) }, agora).aberta, false);
});

test('votação: prazo definido pelo admin vale no lugar do padrão', () => {
  const finalizada = { status: 'completed', finished_at: haHoras(2), rating_deadline: haHoras(1) };
  assert.equal(janelaDeAvaliacao(finalizada, agora).aberta, false);
  assert.equal(janelaDeAvaliacao(finalizada, agora).horas, 1);

  const estendida = { status: 'completed', finished_at: haHoras(20), rating_deadline: new Date(agora + 4 * HORA).toISOString() };
  assert.equal(janelaDeAvaliacao(estendida, agora).aberta, true);
  assert.equal(janelaDeAvaliacao(estendida, agora).horas, 24);
});

test('votação: partida aberta ou sem encerramento não tem votação', () => {
  assert.equal(janelaDeAvaliacao({ status: 'scheduled', finished_at: null }, agora).aberta, false);
  assert.ok(isNaN(fimDaAvaliacao({ finished_at: null })));
});

const ATACANTE = { position: 'ATA', pace: 70, shooting: 70, passing: 70, dribbling: 70, defending: 70, physical: 70 };
const jogo = (extra) => ({ user_id: 1, ...ATACANTE, gols: 0, assists: 0, nota: null, gols_time: 10, finished_at: haHoras(48), rating_deadline: null, ...extra });

test('evolução: nota só conta depois que a votação fecha', () => {
  const aberta = calcularFormasDe([jogo({ nota: 9, finished_at: haHoras(1) })], calcOVR, agora).get(1);
  assert.equal(aberta.nota, null);
  assert.equal(aberta.delta.pace, 0);

  const fechada = calcularFormasDe([jogo({ nota: 9, finished_at: haHoras(1), rating_deadline: haHoras(0.5) })], calcOVR, agora).get(1);
  assert.equal(fechada.nota, 9);
  assert.ok(fechada.delta.pace > 0);
});

test('evolução: nota acima do esperado sobe, abaixo desce', () => {
  const boa = calcularFormasDe([jogo({ nota: 9 })], calcOVR, agora).get(1);
  const ruim = calcularFormasDe([jogo({ nota: 3 })], calcOVR, agora).get(1);
  assert.ok(boa.delta.physical > 0);
  assert.ok(ruim.delta.physical < 0);
});

test('evolução: gol acima da parcela esperada puxa finalização; abaixo não penaliza', () => {
  const artilheiro = calcularFormasDe([jogo({ gols: 6, gols_time: 10 })], calcOVR, agora).get(1);
  assert.ok(artilheiro.delta.shooting > 0);
  assert.equal(artilheiro.delta.pace, 0);
  assert.ok(artilheiro.bonus_gol > 0);

  const semGol = calcularFormasDe([jogo({ gols: 0, gols_time: 10 })], calcOVR, agora).get(1);
  assert.equal(semGol.delta.shooting, 0);
});

test('evolução: variação de cada atributo fica entre -10 e +10', () => {
  const jogos = Array.from({ length: 8 }, () => jogo({ nota: 0, gols: 0 }));
  const forma = calcularFormasDe(jogos, calcOVR, agora).get(1);
  Object.values(forma.delta).forEach(d => assert.ok(d >= -10 && d <= 10));
  assert.equal(forma.delta.pace, -10);
});

test('evolução: com 1 jogo o efeito é a metade do de 4 jogos', () => {
  const um = calcularFormasDe([jogo({ nota: 8 })], calcOVR, agora).get(1);
  const quatro = calcularFormasDe(Array.from({ length: 4 }, () => jogo({ nota: 8 })), calcOVR, agora).get(1);
  assert.ok(Math.abs(um.delta.pace - quatro.delta.pace * 0.5) <= 1);
});

test('aplicarForma: base fica em base_attrs e o teto de 99 limita a variação', () => {
  const formas = new Map([[1, { delta: { pace: 5, shooting: 5, passing: 0, dribbling: 0, defending: -3, physical: 0 }, partidas: 2, nota: 8, nota_esperada: 7, bonus_gol: 0, bonus_assist: 0 }]]);
  const atleta = aplicarForma({ id: 1, pace: 97, shooting: 60, passing: 60, dribbling: 60, defending: 60, physical: 60 }, formas);
  assert.equal(atleta.base_attrs.pace, 97);
  assert.equal(atleta.pace, 99);
  assert.equal(atleta.form.pace, 2);
  assert.equal(atleta.defending, 57);
  assert.equal(aplicarForma({ id: 2, pace: 50 }, formas).form, null);
});
