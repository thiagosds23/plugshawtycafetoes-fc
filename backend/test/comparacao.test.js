const test = require('node:test');
const assert = require('node:assert/strict');
const { resumirConfronto } = require('../comparacao');

const agora = Date.parse('2026-10-13T12:00:00Z');
const linha = (match, user, team, pro, contra, gols = 0, extra = {}) => ({
  match_id: match, date: `2026-09-${String(match).padStart(2, '0')}`, type: 'internal', opponent: null,
  user_id: user, team_id: team, placar_pro: pro, placar_contra: contra, gols, assists: 0, ...extra
});
const fechada = { status: 'completed', finished_at: '2026-09-20T12:00:00Z', rating_deadline: null };
const aberta = { status: 'completed', finished_at: new Date(agora - 3600 * 1000).toISOString(), rating_deadline: null };

test('separa os jogos juntos dos jogos um contra o outro', () => {
  const r = resumirConfronto(1, 2, [
    // partida 5: juntos e venceram
    linha(5, 1, 50, 10, 6, 3), linha(5, 2, 50, 10, 6, 1),
    // partida 4: um contra o outro, o 1 venceu
    linha(4, 1, 40, 9, 8, 2), linha(4, 2, 41, 8, 9, 4),
    // partida 3: um contra o outro, empate
    linha(3, 1, 30, 5, 5), linha(3, 2, 31, 5, 5)
  ], [], agora);
  assert.equal(r.jogos_em_comum, 3);
  assert.deepEqual(r.mesmo_time, { jogos: 1, vitorias: 1, empates: 0, derrotas: 0 });
  assert.deepEqual(r.times_opostos, { jogos: 2, vitorias_a: 1, empates: 1, vitorias_b: 0 });
  assert.equal(r.confrontos[1].placar, '9 x 8');
  assert.equal(r.confrontos[1].gols_b, 4);
});

test('jogo contra rival aparece como juntos, com o nome do adversário', () => {
  const r = resumirConfronto(1, 2, [
    linha(6, 1, 60, 6, 12, 0, { type: 'rival', opponent: 'Betas FC' }),
    linha(6, 2, 60, 6, 12, 0, { type: 'rival', opponent: 'Betas FC' })
  ], [], agora);
  assert.equal(r.mesmo_time.derrotas, 1);
  assert.equal(r.confrontos[0].adversario, 'Betas FC');
});

test('notas entre eles: todas contam (inclusive de votação aberta), média com uma casa', () => {
  const r = resumirConfronto(1, 2, [], [
    { rater_id: 1, rated_id: 2, score: 8, ...fechada },
    { rater_id: 1, rated_id: 2, score: 7, ...fechada },
    { rater_id: 2, rated_id: 1, score: 9, ...aberta }
  ], agora);
  assert.equal(r.notas_entre_eles.a_para_b, 7.5);
  assert.equal(r.notas_entre_eles.a_para_b_qtd, 2);
  assert.equal(r.notas_entre_eles.b_para_a, 9, 'a nota da votação aberta também aparece');
});

test('sem jogos em comum', () => {
  const r = resumirConfronto(1, 2, [], [], agora);
  assert.equal(r.jogos_em_comum, 0);
  assert.deepEqual(r.confrontos, []);
});
