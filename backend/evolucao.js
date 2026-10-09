/**
 * Regras puras (sem banco) do prazo de avaliação e da evolução das cartas.
 * Ficam separadas do server.js para poderem ser testadas isoladamente.
 */

// ---------------------------------------------------------------------------
// Prazo da votação
// ---------------------------------------------------------------------------

// Janela de avaliação: abre quando o administrador encerra a partida e dura 12 horas,
// a não ser que ele tenha finalizado a votação antes ou mudado a duração. Esse prazo
// definido à mão fica em matches.rating_deadline.
const HORAS_PARA_AVALIAR = 12;
const DURACAO_MAXIMA_DA_AVALIACAO = 7 * 24; // horas

/** Momento (em ms) em que a votação da partida fecha, ou NaN se ela nunca abriu. */
function fimDaAvaliacao(match) {
  if (!match || !match.finished_at) return NaN;
  if (match.rating_deadline) return new Date(match.rating_deadline).getTime();
  return new Date(match.finished_at).getTime() + HORAS_PARA_AVALIAR * 60 * 60 * 1000;
}

function janelaDeAvaliacao(match, agora = Date.now()) {
  if (!match || match.status !== 'completed' || !match.finished_at) {
    return { aberta: false, terminaEm: null, horas: null };
  }
  const fim = fimDaAvaliacao(match);
  if (isNaN(fim)) return { aberta: false, terminaEm: null, horas: null };
  // Duração total contada do apito final, com uma casa decimal
  const horas = Math.round(((fim - new Date(match.finished_at).getTime()) / 3600000) * 10) / 10;
  return { aberta: agora < fim, terminaEm: new Date(fim).toISOString(), horas };
}

// ---------------------------------------------------------------------------
// Evolução das cartas
//
// Os atributos gravados em users (vindos da planilha de avaliação do elenco) são a
// BASE e nunca são alterados pelos jogos. A cada leitura calculamos a "forma" do
// atleta a partir das partidas encerradas e devolvemos os atributos já evoluídos.
// Por ser derivado, dá para recalibrar a fórmula sem estragar nenhum dado, e
// reabrir ou corrigir uma partida reflete sozinho na carta.
//
// Cada atuação é comparada com o que se espera do NÍVEL e da POSIÇÃO do atleta, e
// não com uma régua única. Nota 7 é ótima para um 60 e abaixo do esperado para um
// 81; fazer 2 gols é muito numa partida de 4 gols e pouco numa de 25. Assim um OVR
// alto só se sustenta com atuação alta, e quem joga acima do próprio nível sobe.
//
// Constantes calibradas com as partidas reais do clube (setembro/2026).
// ---------------------------------------------------------------------------
const EVOLUCAO = {
  // Nota esperada para cada nível. Nas partidas reais o grupo já dá notas maiores a
  // quem tem OVR maior (correlação de 0,64): cerca de +0,9 de nota a cada 10 de OVR.
  // Um atleta de OVR 62 costuma tirar 6,2; um de 81, perto de 7,9.
  NOTA_MEDIA_DO_GRUPO: 6.2,
  OVR_MEDIO_DO_GRUPO: 62,
  NOTA_A_MAIS_POR_PONTO_DE_OVR: 0.09,
  // Cada ponto de nota acima (ou abaixo) do esperado move todos os atributos em 3
  PONTOS_POR_PONTO_DE_NOTA: 3,

  // Parcela dos gols do time que se espera de cada posição, em gols e em assistências.
  // Medir a parcela, e não o número de gols, faz o placar do jogo não importar: numa
  // pelada de 15 gols, marcar 2 é pouco. Ficar abaixo do esperado não tira ponto —
  // zagueiro que não marca não perde nada —, só ficar acima soma.
  PARCELA_DE_GOLS_ESPERADA:   { ATA: 0.28, MEI: 0.18, VOL: 0.14, LAT: 0.14, ZAG: 0.03, GOL: 0.01 },
  PARCELA_DE_ASSIST_ESPERADA: { ATA: 0.10, MEI: 0.15, VOL: 0.12, LAT: 0.10, ZAG: 0.03, GOL: 0.01 },
  // Participar de 10% a mais dos gols do time do que o esperado vale 2 pontos
  PONTOS_POR_PARCELA_EXTRA: 20,
  TETO_BONUS_OFENSIVO: 8,

  // Peso de cada partida do atleta, da mais recente para a mais antiga: 1, 0.85,
  // 0.72, 0.61... Todas contam, mas a fase atual pesa mais.
  DECAIMENTO: 0.85,

  // Com poucas partidas o efeito é parcial: 1 jogo = 50%, 2 = 71%, 3 = 87%, 4 ou mais
  // = 100%. Antes era linear e 1 jogo valia só 25%, o que apagava atuações de destaque.
  JOGOS_PARA_CONFIANCA_TOTAL: 4,

  // Acima de 75 subir fica gradualmente mais lento (um 85 sobe a 80% do ritmo, um 95
  // a 60%). Abaixo disso não há freio extra: a nota esperada maior já cobra o nível.
  OVR_ONDE_SUBIR_FICA_MAIS_LENTO: 75,
  RITMO_MINIMO_DE_SUBIDA: 0.6,

  // Quanto cada atributo pode se afastar da base, para cima ou para baixo
  VARIACAO_MAXIMA: 10
};

const ATRIBUTOS = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'];
const limitar = (valor, minimo, maximo) => Math.max(minimo, Math.min(maximo, valor));

/**
 * Calcula a variação de cada atributo de todos os atletas que já jogaram.
 *
 * Recebe uma linha por (atleta, partida encerrada), da mais recente para a mais
 * antiga, com: user_id, finished_at, rating_deadline, position, os seis atributos
 * base, gols, assists, nota (média recebida na partida) e gols_time.
 * Devolve um Map de user_id -> { delta, partidas, nota, nota_esperada, bonus_gol, bonus_assist }.
 */
function calcularFormasDe(linhas, calcOVR, agora = Date.now()) {
  // A nota só entra depois que a votação fecha. Enquanto ela corre, a média oscila a
  // cada voto e a carta de alguém poderia despencar só porque a primeira pessoa a
  // votar deu nota baixa. Gols e assistências são fatos e contam na hora.
  const notaFechada = (jogo) => {
    if (!jogo.finished_at) return true; // partida antiga, de antes do prazo existir
    const fim = fimDaAvaliacao(jogo);
    return isNaN(fim) || fim <= agora;
  };

  const porAtleta = new Map();
  linhas.forEach(l => {
    const id = Number(l.user_id);
    if (!porAtleta.has(id)) porAtleta.set(id, []);
    porAtleta.get(id).push(l);
  });

  const E = EVOLUCAO;
  const formas = new Map();

  porAtleta.forEach((jogos, id) => {
    const atleta = jogos[0];
    const base = {};
    ATRIBUTOS.forEach(k => { base[k] = Number(atleta[k]) || 50; });

    // O nível do atleta é o OVR da planilha, nunca o já evoluído: comparar com o
    // evoluído realimentaria a fórmula a cada leitura
    const ovrBase = calcOVR({ ...atleta, ...base });
    const posicao = String(atleta.position || 'MEI').toUpperCase().trim();
    const parcelaGolEsperada = E.PARCELA_DE_GOLS_ESPERADA[posicao] ?? E.PARCELA_DE_GOLS_ESPERADA.MEI;
    const parcelaAssistEsperada = E.PARCELA_DE_ASSIST_ESPERADA[posicao] ?? E.PARCELA_DE_ASSIST_ESPERADA.MEI;
    const notaEsperada = E.NOTA_MEDIA_DO_GRUPO + (ovrBase - E.OVR_MEDIO_DO_GRUPO) * E.NOTA_A_MAIS_POR_PONTO_DE_OVR;

    let somaPesos = 0, somaPesosNota = 0, somaDesvioNota = 0, somaExtraGol = 0, somaExtraAssist = 0, somaNotas = 0;

    jogos.forEach((jogo, indice) => {
      const peso = Math.pow(E.DECAIMENTO, indice);
      somaPesos += peso;

      // Avaliado jogo a jogo: uma partida sem gol não apaga o bônus de outra com 5
      const golsDoTime = Math.max(Number(jogo.gols_time), 1);
      somaExtraGol += peso * Math.max(0, Number(jogo.gols) / golsDoTime - parcelaGolEsperada);
      somaExtraAssist += peso * Math.max(0, Number(jogo.assists) / golsDoTime - parcelaAssistEsperada);

      if (jogo.nota !== null && jogo.nota !== undefined && notaFechada(jogo)) {
        somaPesosNota += peso;
        somaDesvioNota += peso * (Number(jogo.nota) - notaEsperada);
        somaNotas += peso * Number(jogo.nota);
      }
    });

    const desvioNota = somaPesosNota > 0 ? somaDesvioNota / somaPesosNota : 0;
    const efeitoNota = desvioNota * E.PONTOS_POR_PONTO_DE_NOTA;
    const bonusGol = Math.min((somaExtraGol / somaPesos) * E.PONTOS_POR_PARCELA_EXTRA, E.TETO_BONUS_OFENSIVO);
    const bonusAssist = Math.min((somaExtraAssist / somaPesos) * E.PONTOS_POR_PARCELA_EXTRA, E.TETO_BONUS_OFENSIVO);

    const confianca = Math.sqrt(Math.min(jogos.length / E.JOGOS_PARA_CONFIANCA_TOTAL, 1));
    const ritmoDeSubida = limitar(1 - (ovrBase - E.OVR_ONDE_SUBIR_FICA_MAIS_LENTO) / 50, E.RITMO_MINIMO_DE_SUBIDA, 1);

    // A nota mexe em tudo; participação em gols puxa finalização, em assistências
    // puxa passe, e o drible fica com metade de cada
    const bruto = {
      pace: efeitoNota,
      defending: efeitoNota,
      physical: efeitoNota,
      shooting: efeitoNota + bonusGol,
      passing: efeitoNota + bonusAssist,
      dribbling: efeitoNota + (bonusGol + bonusAssist) / 2
    };

    const delta = {};
    ATRIBUTOS.forEach(k => {
      const ajustado = bruto[k] >= 0 ? bruto[k] * ritmoDeSubida : bruto[k];
      delta[k] = Math.round(limitar(ajustado * confianca, -E.VARIACAO_MAXIMA, E.VARIACAO_MAXIMA));
    });

    formas.set(id, {
      delta,
      partidas: jogos.length,
      nota: somaPesosNota > 0 ? Math.round((somaNotas / somaPesosNota) * 10) / 10 : null,
      nota_esperada: Math.round(notaEsperada * 10) / 10,
      // Quanto da evolução veio de participação em gols e assistências (pontos já
      // com confiança aplicada). A tela usa isso para explicar a variação.
      bonus_gol: Math.round(bonusGol * ritmoDeSubida * confianca * 10) / 10,
      bonus_assist: Math.round(bonusAssist * ritmoDeSubida * confianca * 10) / 10
    });
  });

  return formas;
}

/**
 * Devolve o atleta com os atributos evoluídos. Os valores originais da planilha
 * seguem em base_attrs, e form traz quanto cada atributo mudou.
 */
function aplicarForma(atleta, formas) {
  if (!atleta) return atleta;

  const base = {};
  ATRIBUTOS.forEach(k => { base[k] = Number(atleta[k]) || 50; });

  const saida = { ...atleta, base_attrs: base, form: null };
  const forma = formas && formas.get(Number(atleta.id));
  if (!forma) return saida;

  const variacao = {};
  ATRIBUTOS.forEach(k => {
    saida[k] = limitar(base[k] + forma.delta[k], 25, 99);
    // Variação real: o teto de 99 pode ter comido parte do bônus
    variacao[k] = saida[k] - base[k];
  });

  saida.form = {
    ...variacao,
    partidas: forma.partidas,
    nota: forma.nota,
    nota_esperada: forma.nota_esperada,
    bonus_gol: forma.bonus_gol,
    bonus_assist: forma.bonus_assist
  };
  return saida;
}

module.exports = {
  HORAS_PARA_AVALIAR,
  DURACAO_MAXIMA_DA_AVALIACAO,
  EVOLUCAO,
  ATRIBUTOS,
  fimDaAvaliacao,
  janelaDeAvaliacao,
  calcularFormasDe,
  aplicarForma
};
