const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const {
  janelaDeAvaliacao, fimDaAvaliacao, calcularFormasDe, aplicarForma, desempenhoEsperado, desempenhoReal
} = require('../evolucao');

const HORA = 3600 * 1000;
const DIA = 24 * HORA;
const agora = Date.parse('2026-10-08T20:00:00Z');
const haHoras = (h) => new Date(agora - h * HORA).toISOString();
const haDias = (d) => new Date(agora - d * DIA).toISOString().slice(0, 10);

// Mesma fórmula de OVR que o servidor usa (vive no frontend)
let calcOVR;
test.before(async () => {
  calcOVR = (await import(pathToFileURL(path.join(__dirname, '../../frontend/src/utils/ovr.js')).href)).calcOVR;
});

// ---------------------------------------------------------------------------
// Votação
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Peças do resultado
// ---------------------------------------------------------------------------

test('resultado esperado: times iguais 50%, mais forte é favorito, rival sem atletas 50%', () => {
  assert.equal(desempenhoEsperado(70, 70), 0.5);
  assert.ok(Math.abs(desempenhoEsperado(75, 60) - 0.909) < 0.01);
  assert.equal(desempenhoEsperado(70, NaN), 0.5);
});

test('resultado real: vitória folgada vale mais que apertada; empate é 0,5', () => {
  assert.equal(desempenhoReal(9, 9), 0.5);
  assert.ok(desempenhoReal(15, 8) > desempenhoReal(9, 8));
  assert.ok(desempenhoReal(9, 8) > 0.6);
  assert.ok(desempenhoReal(8, 15) < desempenhoReal(8, 9));
  assert.equal(desempenhoReal(5, 0), 1);
});

// ---------------------------------------------------------------------------
// Montagem de partidas para os testes
// ---------------------------------------------------------------------------

const atleta = (id, posicao = 'MEI', nivel = 70) => ({
  id, posicao,
  attrs: { pace: nivel, shooting: nivel, passing: nivel, dribbling: nivel, defending: nivel, physical: nivel }
});

let proximoTime = 1;
/**
 * Linhas (como as do SQL do servidor) de uma partida entre os times A e B.
 * `gols` e `assist` são mapas id -> quantidade; `notas`, id -> média recebida.
 */
function partida({ dias = 2, a, b, placar, gols = {}, assist = {}, notas = {}, votacaoFechada = true, rival = false, id = proximoTime }) {
  const timeA = proximoTime++;
  const timeB = rival ? proximoTime++ : proximoTime++;
  const data = haDias(dias);
  const fim = votacaoFechada ? haHoras(dias * 24 - 1) : new Date(agora + HORA).toISOString();
  const linhasDoTime = (lista, time, adversario, pro, contra) => {
    const golsTime = lista.reduce((s, p) => s + (gols[p.id] || 0), 0);
    return lista.map(p => ({
      user_id: p.id, match_id: id, date: data, finished_at: haHoras(dias * 24), rating_deadline: fim,
      team_id: time, time_adversario: adversario, placar_pro: pro, placar_contra: contra,
      position: p.posicao, ...p.attrs,
      gols: gols[p.id] || 0, assists: assist[p.id] || 0, nota: notas[p.id] ?? null, gols_time: golsTime
    }));
  };
  return [
    ...linhasDoTime(a, timeA, timeB, placar[0], placar[1]),
    ...(rival ? [] : linhasDoTime(b, timeB, timeA, placar[1], placar[0]))
  ];
}

const formas = (linhas) => calcularFormasDe(linhas, calcOVR, agora);
const time = (ids, posicao = 'MEI', nivel = 70) => ids.map(id => atleta(id, posicao, nivel));

// ---------------------------------------------------------------------------
// Evolução
// ---------------------------------------------------------------------------

test('sem votação a carta mexe: quem vence sobe e quem perde desce', () => {
  const f = formas(partida({ a: time([1, 2, 3]), b: time([4, 5, 6]), placar: [10, 6] }));
  assert.ok(f.get(1).delta.pace > 0, 'vencedor sobe');
  assert.ok(f.get(4).delta.pace < 0, 'perdedor desce');
  assert.equal(f.get(1).nota, null);
  assert.ok(f.get(1).componentes.resultado > 0);
});

test('vencer um time mais forte vale mais do que vencer um mais fraco', () => {
  const zebra = formas(partida({ a: time([1, 2, 3], 'MEI', 60), b: time([4, 5, 6], 'MEI', 75), placar: [8, 6] })).get(1);
  const obrigacao = formas(partida({ a: time([1, 2, 3], 'MEI', 75), b: time([4, 5, 6], 'MEI', 60), placar: [8, 6] })).get(1);
  assert.ok(zebra.componentes.resultado > obrigacao.componentes.resultado);
});

test('perder para quem era muito mais fraco custa mais do que perder para quem era mais forte', () => {
  const vexame = formas(partida({ a: time([1, 2, 3], 'MEI', 75), b: time([4, 5, 6], 'MEI', 60), placar: [6, 8] })).get(1);
  const normal = formas(partida({ a: time([1, 2, 3], 'MEI', 60), b: time([4, 5, 6], 'MEI', 75), placar: [6, 8] })).get(1);
  assert.ok(vexame.componentes.resultado < normal.componentes.resultado);
});

test('jogo contra rival: perder derruba a carta (adversário sem atletas conta como 50%)', () => {
  const f = formas(partida({ a: time([1, 2, 3]), b: [], placar: [6, 12], rival: true }));
  assert.ok(f.get(1).delta.pace < 0);
});

test('zagueiro sente mais na defesa o resultado do time', () => {
  const f = formas(partida({ a: [atleta(1, 'ZAG'), atleta(2, 'ATA')], b: time([3, 4]), placar: [4, 12] }));
  const zagueiro = f.get(1).delta, atacante = f.get(2).delta;
  assert.ok(zagueiro.defending < zagueiro.pace, 'na defesa o zagueiro perde mais que no ritmo');
  assert.ok(atacante.defending > atacante.pace, 'na defesa o atacante perde menos que no ritmo');
});

test('nota só conta depois que a votação fecha', () => {
  const aberta = formas(partida({ a: time([1, 2]), b: time([3, 4]), placar: [5, 5], notas: { 1: 9.5 }, votacaoFechada: false })).get(1);
  assert.equal(aberta.nota, null);
  assert.equal(aberta.componentes.nota, 0);

  const fechada = formas(partida({ a: time([1, 2]), b: time([3, 4]), placar: [5, 5], notas: { 1: 9.5 } })).get(1);
  assert.equal(fechada.nota, 9.5);
  assert.ok(fechada.componentes.nota > 0);
});

test('régua da nota se recalibra: grupo generoso não infla todas as cartas', () => {
  // 24 atletas do mesmo nível, todos com nota 9: ninguém está acima do próprio grupo
  const linhas = [];
  for (let p = 0; p < 4; p++) {
    const ids = Array.from({ length: 6 }, (_, i) => p * 6 + i + 1);
    linhas.push(...partida({ dias: 3 + p, a: time(ids.slice(0, 3)), b: time(ids.slice(3)), placar: [5, 5], notas: Object.fromEntries(ids.map(i => [i, 9])) }));
  }
  const f = formas(linhas);
  assert.equal(f.regua.notaMedia, 9);
  assert.equal(f.get(1).componentes.nota, 0);
  assert.equal(f.get(1).delta.pace, 0);
});

test('com poucas notas, a régua usa a medida nas partidas reais (6,8 com OVR 65)', () => {
  const f = formas(partida({ a: time([1, 2], 'MEI', 65), b: time([3, 4], 'MEI', 65), placar: [5, 5], notas: { 1: 6.8 } }));
  assert.equal(f.get(1).nota_esperada, 6.8);
  assert.equal(f.get(1).componentes.nota, 0);
});

test('gols acima da fatia esperada puxam finalização; zagueiro sem gol quase não perde', () => {
  const f = formas(partida({
    a: [atleta(1, 'ATA'), atleta(2, 'ZAG'), atleta(3, 'MEI')], b: time([4, 5, 6]),
    placar: [10, 10], gols: { 1: 7, 3: 3 }
  }));
  assert.ok(f.get(1).delta.shooting > f.get(1).delta.pace, 'artilheiro sobe na finalização');
  assert.ok(f.get(2).componentes.gols > -0.5, 'zagueiro sem gol quase não perde');
});

test('atacante que passa jogos sem participar de gol perde um pouco de finalização', () => {
  const linhas = [];
  for (let d = 0; d < 4; d++) {
    linhas.push(...partida({ dias: 2 + d * 7, a: [atleta(1, 'ATA'), atleta(2, 'MEI'), atleta(3, 'MEI')], b: time([4, 5, 6]), placar: [6, 6], gols: { 2: 3, 3: 3 } }));
  }
  const atacante = formas(linhas).get(1);
  assert.ok(atacante.componentes.gols < 0);
  assert.ok(atacante.componentes.gols >= -4);
});

test('a fatia esperada depende do tamanho do time', () => {
  // 3 gols de 10: muito num time de 7, normal num time de 3
  const timeGrande = formas(partida({ a: time([1, 2, 3, 4, 5, 6, 7], 'MEI'), b: time([8, 9]), placar: [10, 10], gols: { 1: 3, 2: 7 } })).get(1);
  const timePequeno = formas(partida({ a: time([1, 2, 3], 'MEI'), b: time([8, 9]), placar: [10, 10], gols: { 1: 3, 2: 7 } })).get(1);
  assert.ok(timeGrande.componentes.gols > timePequeno.componentes.gols);
});

test('quem para de jogar vê a forma voltar para a base', () => {
  const recente = formas(partida({ dias: 3, a: time([1, 2]), b: time([3, 4]), placar: [12, 2] })).get(1);
  const antigo = formas(partida({ dias: 150, a: time([1, 2]), b: time([3, 4]), placar: [12, 2] })).get(1);
  assert.ok(recente.delta.pace > antigo.delta.pace);
  assert.ok(antigo.confianca < recente.confianca);
});

test('assiduidade: jogar quase toda semana dá até +2 de físico', () => {
  const linhas = [];
  for (let s = 0; s < 6; s++) linhas.push(...partida({ dias: 1 + s * 7, a: time([1, 2]), b: time([3, 4]), placar: [5, 5] }));
  const f = formas(linhas).get(1);
  assert.equal(f.jogos_recentes, 6);
  assert.equal(f.componentes.assiduidade, 2);
  assert.equal(f.delta.physical, 2);
  assert.equal(f.delta.pace, 0);
});

test('variação de cada atributo fica entre -10 e +10', () => {
  const linhas = [];
  for (let d = 0; d < 8; d++) linhas.push(...partida({ dias: 2 + d, a: time([1, 2], 'ZAG'), b: time([3, 4], 'ZAG', 40), placar: [0, 20], notas: { 1: 0 } }));
  const f = formas(linhas).get(1);
  Object.values(f.delta).forEach(d => assert.ok(d >= -10 && d <= 10));
  assert.equal(f.delta.defending, -10);
});

test('aplicarForma: base em base_attrs, teto de 99 e componentes para a tela', () => {
  const f = new Map([[1, { delta: { pace: 5, shooting: 5, passing: 0, dribbling: 0, defending: -3, physical: 0 }, partidas: 2, nota: 8, nota_esperada: 7, componentes: { resultado: 1 } }]]);
  const a = aplicarForma({ id: 1, pace: 97, shooting: 60, passing: 60, dribbling: 60, defending: 60, physical: 60 }, f);
  assert.equal(a.base_attrs.pace, 97);
  assert.equal(a.pace, 99);
  assert.equal(a.form.pace, 2);
  assert.equal(a.defending, 57);
  assert.equal(a.form.componentes.resultado, 1);
  assert.equal(a.form.delta, undefined);
  assert.equal(aplicarForma({ id: 2, pace: 50 }, f).form, null);
});
