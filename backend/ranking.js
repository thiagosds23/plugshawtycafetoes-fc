/**
 * Regras puras do ranking (sem banco).
 *
 * A média crua das notas premiava quem jogou pouco: um atleta com 8,4 em 2 partidas
 * passava na frente de quem manteve 8,2 em 5. Agora a nota do ranking é ajustada pela
 * quantidade de partidas avaliadas (média bayesiana): somamos às notas do atleta duas
 * "partidas imaginárias" na média do grupo. Com muitas partidas, a nota é praticamente
 * a dele; com poucas, fica perto da média até ele provar o contrário.
 *
 * Prêmios (MVP, Craque do Mês, Xerife) só para quem jogou pelo menos metade das
 * partidas do período, com mínimo de 2.
 */
const RANKING = {
  JOGOS_IMAGINARIOS_NA_MEDIA: 2,
  FRACAO_MINIMA_PARA_PREMIO: 0.5,
  MINIMO_DE_JOGOS_PARA_PREMIO: 2
};

const media = (lista) => lista.reduce((a, b) => a + b, 0) / lista.length;

/**
 * Nota ajustada de um atleta. `notas` é a média que ele recebeu em cada partida
 * avaliada; `mediaDoGrupo`, a média de todas as notas do período. Null se ele não
 * tem nenhuma partida avaliada.
 */
function notaAjustada(notas, mediaDoGrupo) {
  if (!notas.length) return null;
  if (!Number.isFinite(mediaDoGrupo)) return media(notas);
  const k = RANKING.JOGOS_IMAGINARIOS_NA_MEDIA;
  return (notas.reduce((a, b) => a + b, 0) + k * mediaDoGrupo) / (notas.length + k);
}

/** Quantas partidas o atleta precisa ter jogado no período para concorrer a prêmio. */
function minimoParaPremio(partidasNoPeriodo) {
  return Math.max(
    RANKING.MINIMO_DE_JOGOS_PARA_PREMIO,
    Math.ceil((Number(partidasNoPeriodo) || 0) * RANKING.FRACAO_MINIMA_PARA_PREMIO)
  );
}

/**
 * A partir das notas por (atleta, partida) do período, devolve um Map de user_id ->
 * { media, ajustada, avaliadas } e a média do grupo.
 */
function notasDoPeriodo(linhas) {
  const porAtleta = new Map();
  linhas.forEach(l => {
    const id = Number(l.rated_id);
    if (!porAtleta.has(id)) porAtleta.set(id, []);
    porAtleta.get(id).push(Number(l.media));
  });
  const todas = linhas.map(l => Number(l.media));
  const mediaDoGrupo = todas.length ? media(todas) : NaN;

  const resultado = new Map();
  porAtleta.forEach((notas, id) => {
    resultado.set(id, {
      media: media(notas),
      ajustada: notaAjustada(notas, mediaDoGrupo),
      avaliadas: notas.length
    });
  });
  return { porAtleta: resultado, mediaDoGrupo };
}

module.exports = { RANKING, notaAjustada, minimoParaPremio, notasDoPeriodo };
