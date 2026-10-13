/**
 * Histórico de notas de um atleta, partida por partida (regras puras, sem banco).
 * As notas são públicas, inclusive durante a votação.
 */
const { janelaDeAvaliacao } = require('./evolucao');

const nomeDe = (username, nickname) => {
  const apelido = String(nickname || '').split(',')[0].trim();
  return apelido || username || '';
};
const media = (lista) => (lista.length ? Math.round((lista.reduce((s, n) => s + n, 0) / lista.length) * 100) / 100 : null);

/**
 * Agrupa as notas recebidas e dadas pelo atleta `id`, da partida mais recente para a
 * mais antiga.
 *
 * `linhas`: notas em que ele é o avaliado ou o avaliador, com match_id, date, type,
 * opponent, status, finished_at, rating_deadline, rater_id, rated_id, score e os nomes
 * (rater_username/rater_nickname, rated_username/rated_nickname).
 */
function historicoDeNotas(id, linhas, agora = Date.now()) {
  const partidas = new Map();
  linhas.forEach(l => {
    if (!partidas.has(l.match_id)) {
      partidas.set(l.match_id, {
        match_id: l.match_id,
        date: l.date,
        adversario: l.type === 'rival' ? l.opponent : null,
        votacao_aberta: janelaDeAvaliacao(l, agora).aberta,
        recebidas: [],
        dadas: []
      });
    }
    const p = partidas.get(l.match_id);
    const nota = Number(l.score);
    const propria = Number(l.rater_id) === Number(l.rated_id);
    if (Number(l.rated_id) === id) {
      p.recebidas.push({ de_id: Number(l.rater_id), de: nomeDe(l.rater_username, l.rater_nickname), nota, propria });
    }
    if (Number(l.rater_id) === id) {
      p.dadas.push({ para_id: Number(l.rated_id), para: nomeDe(l.rated_username, l.rated_nickname), nota, propria });
    }
  });

  const porNota = (x, y) => y.nota - x.nota;
  const lista = [...partidas.values()]
    .map(p => ({
      ...p,
      recebidas: p.recebidas.sort(porNota),
      dadas: p.dadas.sort(porNota),
      media_recebida: media(p.recebidas.map(n => n.nota)),
      media_dada: media(p.dadas.map(n => n.nota))
    }))
    .sort((x, y) => String(y.date).localeCompare(String(x.date)) || y.match_id - x.match_id);

  const comNota = lista.filter(p => p.media_recebida !== null);
  return {
    // Média das médias por partida (a mesma conta do ranking, sem o ajuste)
    media_recebida: media(comNota.map(p => p.media_recebida)),
    partidas_com_nota: comNota.length,
    media_dada: media(lista.filter(p => p.media_dada !== null).map(p => p.media_dada)),
    partidas: lista
  };
}

module.exports = { historicoDeNotas };
