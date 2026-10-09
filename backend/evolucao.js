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
// Cada partida gera quatro sinais, todos comparados com o que se esperava do atleta
// e do time naquele jogo — nunca com uma régua única:
//
//  1. RESULTADO: vitória, empate ou derrota e o saldo de gols, contra o esperado pela
//     força dos dois times (OVR médio da planilha). Ganhar de um time mais forte vale
//     mais; perder de um mais fraco custa mais. Existe em TODA partida, com ou sem
//     votação, e é o que faz a carta cair quando o time vai mal.
//  2. NOTA: a média recebida na votação contra a nota esperada para o nível do
//     atleta. A régua se recalibra sozinha com as notas reais do grupo.
//  3. GOLS e ASSISTÊNCIAS: a fatia dos gols do time contra a fatia esperada da posição,
//     levando em conta o tamanho e a formação do time naquele jogo.
//  4. ASSIDUIDADE: quem joga com frequência ganha um pouco de físico.
//
// As partidas antigas pesam menos (meia-vida de 45 dias) e quem para de jogar vê a
// forma voltar aos poucos para a base da planilha.
//
// Constantes calibradas com as partidas reais do clube (setembro/2026: 5 partidas,
// 37 notas, ~10 gols por time por jogo, times de 5 a 7 atletas).
// ---------------------------------------------------------------------------
const EVOLUCAO = {
  // --- Resultado ---
  // Diferença de OVR médio entre os times que faz o mais forte ser favorito por 3 a 1
  // (75% de chance). Times sorteados costumam ficar a 1-3 pontos um do outro (≈55%).
  ESCALA_DE_FORCA: 15,
  // O desempenho do time mistura o resultado (60%) e o saldo de gols relativo ao total
  // de gols da partida (40%): vencer de 15 a 8 vale mais que de 9 a 8
  PESO_DO_SALDO: 0.4,
  // Desempenho acima do esperado em todas as partidas recentes rende até ~4 pontos
  PONTOS_POR_RESULTADO: 10,
  // Defesa sente mais o resultado de quem defende: o time sofrer muitos gols é,
  // antes de tudo, problema da zaga
  PESO_DA_DEFESA_NO_RESULTADO: { ZAG: 1.6, GOL: 1.6, VOL: 1.3, LAT: 1.3, MEI: 1.0, ATA: 0.6 },

  // --- Nota ---
  // Usados enquanto o grupo tiver poucas notas para a régua se calibrar sozinha.
  // Medido em set/2026: nota média 6,82 com OVR médio 64,6, e +0,08 por ponto de OVR
  // (correlação 0,64). A régua antiga (6,2 com OVR 62) era 0,4 baixa e inflava as cartas.
  NOTA_MEDIA_PADRAO: 6.8,
  OVR_DE_REFERENCIA_PADRAO: 65,
  NOTA_A_MAIS_POR_PONTO_DE_OVR: 0.08,
  // Com pelo menos isto de notas (atleta x partida), a régua sai das próprias notas
  NOTAS_PARA_CALIBRAR: 20,
  // Cada ponto de nota acima (ou abaixo) do esperado move todos os atributos em 3
  PONTOS_POR_PONTO_DE_NOTA: 3,

  // --- Gols e assistências ---
  // Peso de cada posição na divisão dos gols do time (1 = a fatia de um atleta médio).
  // A fatia esperada de cada um é o peso dele dividido pela soma dos pesos do time
  // naquele jogo, então time de 5 espera mais de cada atleta que time de 7.
  // Medido em set/2026: atacante marca 1,9x a média, lateral e volante ~1x, zagueiro
  // quase nada; nas assistências lateral e volante lideram (1,5x).
  PESO_NOS_GOLS:   { ATA: 1.8, MEI: 1.1, VOL: 0.9, LAT: 0.9, ZAG: 0.25, GOL: 0.05 },
  PESO_NAS_ASSIST: { ATA: 1.1, MEI: 1.4, VOL: 1.3, LAT: 1.2, ZAG: 0.35, GOL: 0.1 },
  // Participar de 10% a mais dos gols do time do que o esperado vale 2 pontos
  PONTOS_POR_PARCELA_EXTRA: 20,
  // Ficar abaixo do esperado custa bem menos do que ficar acima rende: o zagueiro
  // quase não perde nada, e o atacante só perde se passar vários jogos sem participar
  PESO_DE_FICAR_ABAIXO: 0.4,
  TETO_BONUS_OFENSIVO: 8,
  PISO_BONUS_OFENSIVO: -4,

  // --- Assiduidade ---
  // Jogos nos últimos 45 dias: quem joga quase toda semana (6+) ganha até 2 de físico
  JANELA_DA_ASSIDUIDADE_DIAS: 45,
  JOGOS_PARA_ASSIDUIDADE_TOTAL: 6,
  BONUS_MAXIMO_DE_ASSIDUIDADE: 2,

  // --- Peso no tempo ---
  // Uma partida de 45 dias atrás vale metade de uma de hoje; uma de 90 dias, um quarto
  MEIA_VIDA_DIAS: 45,
  // Confiança pela quantidade de jogos recentes (soma dos pesos): ~1 jogo = 50%,
  // 2 = 71%, 3 = 87%, 4 ou mais = 100%. Quem para de jogar perde confiança e a forma
  // volta para a base.
  JOGOS_PARA_CONFIANCA_TOTAL: 4,

  // --- Limites ---
  // Acima de 75 subir fica gradualmente mais lento (um 85 sobe a 80% do ritmo, um 95
  // a 60%). Abaixo disso não há freio extra: a nota esperada maior já cobra o nível.
  OVR_ONDE_SUBIR_FICA_MAIS_LENTO: 75,
  RITMO_MINIMO_DE_SUBIDA: 0.6,
  // Quanto cada atributo pode se afastar da base, para cima ou para baixo
  VARIACAO_MAXIMA: 10
};

const ATRIBUTOS = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'];
const DIA_MS = 24 * 60 * 60 * 1000;
const limitar = (valor, minimo, maximo) => Math.max(minimo, Math.min(maximo, valor));
const posicaoDe = (linha) => String(linha.position || 'MEI').toUpperCase().trim();
const pesoDaPosicao = (tabela, posicao) => tabela[posicao] ?? tabela.MEI;
const media = (lista) => (lista.length ? lista.reduce((a, b) => a + b, 0) / lista.length : 0);
const arred1 = (v) => Math.round(v * 10) / 10;

/** Atributos da planilha (base) de uma linha, com 50 para o que faltar. */
function atributosBase(linha) {
  const base = {};
  ATRIBUTOS.forEach(k => { base[k] = Number(linha[k]) || 50; });
  return base;
}

/**
 * Chance esperada de o time A ir bem contra o B (0 a 1), pela diferença de OVR médio.
 * Sem o adversário (jogo contra rival, que não tem atletas cadastrados), 50%.
 */
function desempenhoEsperado(ovrTime, ovrAdversario) {
  if (!Number.isFinite(ovrTime) || !Number.isFinite(ovrAdversario)) return 0.5;
  return 1 / (1 + Math.pow(10, -(ovrTime - ovrAdversario) / EVOLUCAO.ESCALA_DE_FORCA));
}

/**
 * Desempenho real do time (0 a 1): 60% resultado (vitória 1, empate 0,5, derrota 0)
 * e 40% saldo de gols relativo ao total da partida.
 */
function desempenhoReal(golsPro, golsContra) {
  const pro = Number(golsPro) || 0;
  const contra = Number(golsContra) || 0;
  const resultado = pro > contra ? 1 : pro < contra ? 0 : 0.5;
  const saldo = (pro - contra) / Math.max(pro + contra, 1);
  return (1 - EVOLUCAO.PESO_DO_SALDO) * resultado + EVOLUCAO.PESO_DO_SALDO * (0.5 + 0.5 * saldo);
}

/**
 * Régua da nota esperada: passa pela média real das notas do grupo, com +0,08 por
 * ponto de OVR (ou a inclinação medida, se houver notas suficientes). Assim, se o
 * grupo passar a dar notas mais altas ou mais baixas, as cartas não inflam nem murcham
 * todas juntas: só quem foge da média do próprio nível se mexe.
 */
function calibrarNotaEsperada(pares) {
  const E = EVOLUCAO;
  if (pares.length < E.NOTAS_PARA_CALIBRAR) {
    return { notaMedia: E.NOTA_MEDIA_PADRAO, ovrReferencia: E.OVR_DE_REFERENCIA_PADRAO, inclinacao: E.NOTA_A_MAIS_POR_PONTO_DE_OVR, amostras: pares.length };
  }
  const mx = media(pares.map(p => p.ovr));
  const my = media(pares.map(p => p.nota));
  const sxx = pares.reduce((s, p) => s + (p.ovr - mx) ** 2, 0);
  const sxy = pares.reduce((s, p) => s + (p.ovr - mx) * (p.nota - my), 0);
  // Inclinação medida, mas dentro de uma faixa razoável: com poucas notas ela oscila
  const inclinacao = sxx > 0 ? limitar(sxy / sxx, 0.04, 0.12) : E.NOTA_A_MAIS_POR_PONTO_DE_OVR;
  return { notaMedia: my, ovrReferencia: mx, inclinacao, amostras: pares.length };
}

/**
 * Calcula a variação de cada atributo de todos os atletas que já jogaram.
 *
 * Recebe uma linha por (atleta, partida encerrada) com: user_id, match_id, date,
 * finished_at, rating_deadline, team_id, time_adversario, placar_pro, placar_contra,
 * position, os seis atributos base, gols, assists, nota (média recebida na partida,
 * ou null) e gols_time (gols lançados para atletas do time).
 *
 * Devolve um Map de user_id -> forma, com o delta de cada atributo e os componentes
 * que o explicam. O Map tem também a propriedade `regua` (a nota esperada usada).
 */
function calcularFormasDe(linhas, calcOVR, agora = Date.now()) {
  const E = EVOLUCAO;

  // A nota só entra depois que a votação fecha. Enquanto ela corre, a média oscila a
  // cada voto e a carta de alguém poderia despencar só porque a primeira pessoa a
  // votar deu nota baixa. Resultado, gols e assistências são fatos e contam na hora.
  const notaFechada = (jogo) => {
    if (!jogo.finished_at) return true; // partida antiga, de antes do prazo existir
    const fim = fimDaAvaliacao(jogo);
    return isNaN(fim) || fim <= agora;
  };
  const temNota = (jogo) => jogo.nota !== null && jogo.nota !== undefined && notaFechada(jogo);

  // OVR da planilha de cada linha (o nível usado em toda comparação; o evoluído
  // realimentaria a fórmula a cada leitura)
  const ovrBaseDaLinha = new Map();
  linhas.forEach(l => ovrBaseDaLinha.set(l, calcOVR({ ...l, ...atributosBase(l) })));

  // Força e formação de cada time em cada jogo
  const porTime = new Map();
  linhas.forEach(l => {
    const chave = String(l.team_id);
    if (!porTime.has(chave)) porTime.set(chave, []);
    porTime.get(chave).push(l);
  });
  const ovrDoTime = new Map();
  const pesosDoTime = new Map();
  porTime.forEach((atletas, chave) => {
    ovrDoTime.set(chave, media(atletas.map(a => ovrBaseDaLinha.get(a))));
    pesosDoTime.set(chave, {
      gols: atletas.reduce((s, a) => s + pesoDaPosicao(E.PESO_NOS_GOLS, posicaoDe(a)), 0),
      assist: atletas.reduce((s, a) => s + pesoDaPosicao(E.PESO_NAS_ASSIST, posicaoDe(a)), 0)
    });
  });

  const regua = calibrarNotaEsperada(
    linhas.filter(temNota).map(l => ({ ovr: ovrBaseDaLinha.get(l), nota: Number(l.nota) }))
  );
  const notaEsperadaPara = (ovr) => regua.notaMedia + (ovr - regua.ovrReferencia) * regua.inclinacao;

  // Peso de uma partida pela idade dela
  const pesoNoTempo = (jogo) => {
    const quando = new Date(`${String(jogo.date).slice(0, 10)}T12:00:00`).getTime();
    const dias = Number.isFinite(quando) ? Math.max(0, (agora - quando) / DIA_MS) : 0;
    return Math.pow(0.5, dias / E.MEIA_VIDA_DIAS);
  };

  const porAtleta = new Map();
  linhas.forEach(l => {
    const id = Number(l.user_id);
    if (!porAtleta.has(id)) porAtleta.set(id, []);
    porAtleta.get(id).push(l);
  });

  const formas = new Map();
  formas.regua = { ...regua, notaMedia: arred1(regua.notaMedia), ovrReferencia: arred1(regua.ovrReferencia) };

  porAtleta.forEach((jogos, id) => {
    const atleta = jogos[0];
    const ovrBase = ovrBaseDaLinha.get(atleta);
    const posicao = posicaoDe(atleta);
    const notaEsperada = notaEsperadaPara(ovrBase);

    let somaPesos = 0;
    let somaResultado = 0;
    let pesosNota = 0, somaDesvioNota = 0, somaNotas = 0;
    let pesosOfensivos = 0, somaExtraGol = 0, somaExtraAssist = 0;
    let jogosRecentes = 0;
    let vitorias = 0, empates = 0, derrotas = 0;

    jogos.forEach(jogo => {
      const peso = pesoNoTempo(jogo);
      somaPesos += peso;

      const diasAtras = (agora - new Date(`${String(jogo.date).slice(0, 10)}T12:00:00`).getTime()) / DIA_MS;
      if (diasAtras <= E.JANELA_DA_ASSIDUIDADE_DIAS) jogosRecentes += 1;

      // 1. Resultado contra o esperado pela força dos times
      const timeId = String(jogo.team_id);
      const adversarioId = jogo.time_adversario === null || jogo.time_adversario === undefined ? null : String(jogo.time_adversario);
      const esperado = desempenhoEsperado(ovrDoTime.get(timeId), adversarioId ? ovrDoTime.get(adversarioId) : NaN);
      somaResultado += peso * (desempenhoReal(jogo.placar_pro, jogo.placar_contra) - esperado);
      const pro = Number(jogo.placar_pro) || 0, contra = Number(jogo.placar_contra) || 0;
      if (pro > contra) vitorias++; else if (pro < contra) derrotas++; else empates++;

      // 2. Nota contra a esperada para o nível
      if (temNota(jogo)) {
        pesosNota += peso;
        somaDesvioNota += peso * (Number(jogo.nota) - notaEsperada);
        somaNotas += peso * Number(jogo.nota);
      }

      // 3. Fatia dos gols do time contra a esperada para a posição nesta formação.
      // Avaliado jogo a jogo: uma partida sem gol não apaga o bônus de outra com 5
      const golsDoTime = Number(jogo.gols_time) || 0;
      const pesos = pesosDoTime.get(timeId);
      if (golsDoTime > 0 && pesos) {
        const ajustar = (extra) => (extra >= 0 ? extra : extra * E.PESO_DE_FICAR_ABAIXO);
        const esperadoGol = pesoDaPosicao(E.PESO_NOS_GOLS, posicao) / pesos.gols;
        const esperadoAssist = pesoDaPosicao(E.PESO_NAS_ASSIST, posicao) / pesos.assist;
        pesosOfensivos += peso;
        somaExtraGol += peso * ajustar(Number(jogo.gols) / golsDoTime - esperadoGol);
        somaExtraAssist += peso * ajustar(Number(jogo.assists) / golsDoTime - esperadoAssist);
      }
    });

    const efeitoResultado = somaPesos > 0 ? (somaResultado / somaPesos) * E.PONTOS_POR_RESULTADO : 0;
    const efeitoNota = pesosNota > 0 ? (somaDesvioNota / pesosNota) * E.PONTOS_POR_PONTO_DE_NOTA : 0;
    const bonusOfensivo = (soma) => (pesosOfensivos > 0
      ? limitar((soma / pesosOfensivos) * E.PONTOS_POR_PARCELA_EXTRA, E.PISO_BONUS_OFENSIVO, E.TETO_BONUS_OFENSIVO)
      : 0);
    const bonusGol = bonusOfensivo(somaExtraGol);
    const bonusAssist = bonusOfensivo(somaExtraAssist);
    const assiduidade = (Math.min(jogosRecentes, E.JOGOS_PARA_ASSIDUIDADE_TOTAL) / E.JOGOS_PARA_ASSIDUIDADE_TOTAL) * E.BONUS_MAXIMO_DE_ASSIDUIDADE;

    const confianca = Math.sqrt(Math.min(somaPesos / E.JOGOS_PARA_CONFIANCA_TOTAL, 1));
    const ritmoDeSubida = limitar(1 - (ovrBase - E.OVR_ONDE_SUBIR_FICA_MAIS_LENTO) / 50, E.RITMO_MINIMO_DE_SUBIDA, 1);
    const pesoDefesa = pesoDaPosicao(E.PESO_DA_DEFESA_NO_RESULTADO, posicao);

    // Nota e resultado mexem em tudo (a defesa sente mais o resultado de quem defende);
    // gols puxam finalização, assistências puxam passe, e o drible fica com metade de cada
    const bruto = {
      pace: efeitoNota + efeitoResultado,
      physical: efeitoNota + efeitoResultado,
      defending: efeitoNota + efeitoResultado * pesoDefesa,
      shooting: efeitoNota + efeitoResultado + bonusGol,
      passing: efeitoNota + efeitoResultado + bonusAssist,
      dribbling: efeitoNota + efeitoResultado + (bonusGol + bonusAssist) / 2
    };

    const delta = {};
    ATRIBUTOS.forEach(k => {
      const ajustado = (bruto[k] >= 0 ? bruto[k] * ritmoDeSubida : bruto[k]) * confianca;
      // A assiduidade não depende de confiança: ela já é a contagem de jogos recentes
      const comAssiduidade = k === 'physical' ? ajustado + assiduidade : ajustado;
      delta[k] = Math.round(limitar(comAssiduidade, -E.VARIACAO_MAXIMA, E.VARIACAO_MAXIMA));
    });

    // Quanto cada sinal contribuiu, já com confiança e ritmo (para a tela explicar)
    const aplicado = (v) => arred1((v >= 0 ? v * ritmoDeSubida : v) * confianca);
    formas.set(id, {
      delta,
      partidas: jogos.length,
      nota: pesosNota > 0 ? arred1(somaNotas / pesosNota) : null,
      nota_esperada: arred1(notaEsperada),
      jogos_avaliados: jogos.filter(temNota).length,
      vitorias,
      empates,
      derrotas,
      jogos_recentes: jogosRecentes,
      confianca: Math.round(confianca * 100) / 100,
      componentes: {
        resultado: aplicado(efeitoResultado),
        nota: aplicado(efeitoNota),
        gols: aplicado(bonusGol),
        assistencias: aplicado(bonusAssist),
        assiduidade: arred1(assiduidade)
      },
      // Mantidos para compatibilidade com a tela antiga
      bonus_gol: aplicado(bonusGol),
      bonus_assist: aplicado(bonusAssist)
    });
  });

  return formas;
}

/**
 * Devolve o atleta com os atributos evoluídos. Os valores originais da planilha
 * seguem em base_attrs, e form traz quanto cada atributo mudou e por quê.
 */
function aplicarForma(atleta, formas) {
  if (!atleta) return atleta;

  const base = atributosBase(atleta);
  const saida = { ...atleta, base_attrs: base, form: null };
  const forma = formas && formas.get(Number(atleta.id));
  if (!forma) return saida;

  const variacao = {};
  ATRIBUTOS.forEach(k => {
    saida[k] = limitar(base[k] + forma.delta[k], 25, 99);
    // Variação real: o teto de 99 pode ter comido parte do bônus
    variacao[k] = saida[k] - base[k];
  });

  const { delta, ...resto } = forma;
  saida.form = { ...variacao, ...resto };
  return saida;
}

module.exports = {
  HORAS_PARA_AVALIAR,
  DURACAO_MAXIMA_DA_AVALIACAO,
  EVOLUCAO,
  ATRIBUTOS,
  fimDaAvaliacao,
  janelaDeAvaliacao,
  desempenhoEsperado,
  desempenhoReal,
  calibrarNotaEsperada,
  calcularFormasDe,
  aplicarForma
};
