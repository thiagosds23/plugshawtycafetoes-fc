/**
 * Confronto direto entre dois atletas (regras puras, sem banco).
 */
const { janelaDeAvaliacao } = require('./evolucao');

const resultado = (pro, contra) => (pro > contra ? 'V' : pro < contra ? 'D' : 'E');
const mediaDe = (lista) => (lista.length
  ? Math.round((lista.reduce((s, n) => s + Number(n.score), 0) / lista.length) * 10) / 10
  : null);

/**
 * Resume o confronto entre os atletas `a` e `b`.
 *
 * `linhas`: uma por (atleta, partida encerrada em que os dois jogaram), da mais recente
 * para a mais antiga, com match_id, date, type, opponent, user_id, team_id,
 * placar_pro, placar_contra, gols e assists.
 * `notas`: as notas que um deu ao outro, com rater_id, score e os dados da partida para
 * saber se a votação já fechou (status, finished_at, rating_deadline). Notas de votação
 * aberta ficam de fora, como na tela da partida.
 */
function resumirConfronto(a, b, linhas, notas, agora = Date.now()) {
  const porPartida = new Map();
  linhas.forEach(l => {
    if (!porPartida.has(l.match_id)) {
      porPartida.set(l.match_id, { match_id: l.match_id, date: l.date, type: l.type, opponent: l.opponent });
    }
    porPartida.get(l.match_id)[Number(l.user_id) === a ? 'a' : 'b'] = l;
  });

  const mesmoTime = { jogos: 0, vitorias: 0, empates: 0, derrotas: 0 };
  const timesOpostos = { jogos: 0, vitorias_a: 0, empates: 0, vitorias_b: 0 };
  const confrontos = [];

  porPartida.forEach(p => {
    if (!p.a || !p.b) return;
    const juntos = p.a.team_id === p.b.team_id;
    const resA = resultado(Number(p.a.placar_pro), Number(p.a.placar_contra));
    if (juntos) {
      mesmoTime.jogos++;
      if (resA === 'V') mesmoTime.vitorias++;
      else if (resA === 'D') mesmoTime.derrotas++;
      else mesmoTime.empates++;
    } else {
      timesOpostos.jogos++;
      if (resA === 'V') timesOpostos.vitorias_a++;
      else if (resA === 'D') timesOpostos.vitorias_b++;
      else timesOpostos.empates++;
    }
    confrontos.push({
      match_id: p.match_id,
      date: p.date,
      adversario: p.type === 'rival' ? p.opponent : null,
      mesmo_time: juntos,
      resultado_a: resA,
      placar: `${p.a.placar_pro} x ${p.a.placar_contra}`,
      gols_a: Number(p.a.gols), gols_b: Number(p.b.gols),
      assists_a: Number(p.a.assists), assists_b: Number(p.b.assists)
    });
  });

  const fechadas = notas.filter(n => !janelaDeAvaliacao(n, agora).aberta);
  const deAparaB = fechadas.filter(n => Number(n.rater_id) === a);
  const deBparaA = fechadas.filter(n => Number(n.rater_id) === b);

  return {
    a,
    b,
    jogos_em_comum: confrontos.length,
    mesmo_time: mesmoTime,
    times_opostos: timesOpostos,
    confrontos: confrontos.slice(0, 10),
    notas_entre_eles: {
      a_para_b: mediaDe(deAparaB), a_para_b_qtd: deAparaB.length,
      b_para_a: mediaDe(deBparaA), b_para_a_qtd: deBparaA.length
    }
  };
}

module.exports = { resumirConfronto };
