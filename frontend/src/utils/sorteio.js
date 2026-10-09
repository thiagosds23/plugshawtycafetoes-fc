import { calcOVR } from './ovr';

/**
 * Sorteio dos times do racha.
 *
 * O sorteio antigo ordenava os convocados por OVR e distribuía em zigue-zague: com os
 * mesmos convocados o resultado era sempre idêntico, e os mesmos atletas caíam juntos
 * toda semana. Agora:
 *
 *  1. EQUILÍBRIO primeiro: testa todas as divisões possíveis (ou, com muita gente, busca
 *     as melhores) e só considera as que ficam perto da menor diferença de força
 *     possível. Força = soma do OVR atual, que já reflete o desempenho nas partidas.
 *  2. POSIÇÕES: entre as equilibradas, prefere as que dividem a defesa, o meio e o
 *     ataque, e põem um goleiro de cada lado.
 *  3. VARIEDADE: cada dupla que jogou junta nos últimos rachas custa pontos (o último
 *     pesa mais), e o resultado é sorteado ao acaso entre as melhores opções. Sortear
 *     de novo dá outro time, sem perder o equilíbrio.
 */
export const SORTEIO = {
  // Divisões até esta distância (em soma de OVR) da mais equilibrada possível contam
  // como equilibradas. 4 pontos num 6x6 é menos de 1 ponto de OVR médio por atleta.
  FOLGA_DE_FORCA: 4,
  // Custo de cada atleta a mais de uma linha (defesa, meio, ataque) num dos times
  PESO_DA_POSICAO: 2,
  // Dois goleiros no mesmo time praticamente nunca
  PESO_DO_GOLEIRO: 12,
  // Custo de cada dupla que jogou junta no último racha; nos anteriores, metade a cada jogo
  PESO_DA_DUPLA_REPETIDA: 1.2,
  MEMORIA_DE_RACHAS: 4,
  // O resultado sai ao acaso entre as divisões até esta distância da melhor nota
  FOLGA_DO_SORTEIO: 3,
  // Até aqui testa todas as divisões (22 atletas ≈ 700 mil); acima, busca local
  LIMITE_PARA_TESTAR_TUDO: 22
};

const LINHA_DA_POSICAO = { GOL: 'goleiro', ZAG: 'defesa', LAT: 'defesa', VOL: 'meio', MEI: 'meio', ATA: 'ataque' };
const linhaDe = (p) => LINHA_DA_POSICAO[String(p.position || 'MEI').toUpperCase().trim()] || 'meio';

/**
 * Peso de cada dupla pelo histórico: matriz n x n com quanto custa os dois jogarem
 * juntos de novo. `historico` vem do mais recente para o mais antigo, cada item com
 * `teams` = lista de listas de ids.
 */
function pesosDasDuplas(jogadores, historico) {
  const indice = new Map(jogadores.map((p, i) => [Number(p.id), i]));
  const n = jogadores.length;
  const pesos = Array.from({ length: n }, () => new Float64Array(n));
  historico.slice(0, SORTEIO.MEMORIA_DE_RACHAS).forEach((partida, idade) => {
    const peso = Math.pow(0.5, idade);
    (partida.teams || []).forEach(time => {
      const presentes = time.map(id => indice.get(Number(id))).filter(i => i !== undefined);
      for (let a = 0; a < presentes.length; a++) {
        for (let b = a + 1; b < presentes.length; b++) {
          pesos[presentes[a]][presentes[b]] += peso;
          pesos[presentes[b]][presentes[a]] += peso;
        }
      }
    });
  });
  return pesos;
}

/** Monta a função que avalia uma divisão (lado[i] = true se o atleta i vai para o time A). */
function avaliador(jogadores, historico) {
  const n = jogadores.length;
  const forca = jogadores.map(p => calcOVR(p));
  const total = forca.reduce((a, b) => a + b, 0);
  const linhas = jogadores.map(linhaDe);
  const nomesDasLinhas = [...new Set(linhas)];
  const pesos = pesosDasDuplas(jogadores, historico);

  return (lado) => {
    let somaA = 0;
    for (let i = 0; i < n; i++) if (lado[i]) somaA += forca[i];
    const diferenca = Math.abs(2 * somaA - total);

    let posicoes = 0;
    for (const linha of nomesDasLinhas) {
      let a = 0, b = 0;
      for (let i = 0; i < n; i++) {
        if (linhas[i] !== linha) continue;
        if (lado[i]) a++;
        else b++;
      }
      // Com número ímpar na linha, um time sempre fica com um a mais: isso não custa nada
      const excesso = Math.abs(a - b) - ((a + b) % 2);
      posicoes += excesso * (linha === 'goleiro' ? SORTEIO.PESO_DO_GOLEIRO : SORTEIO.PESO_DA_POSICAO);
    }

    let repeticao = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (lado[i] === lado[j]) repeticao += pesos[i][j];
      }
    }

    return {
      diferenca,
      nota: diferenca + posicoes + repeticao * SORTEIO.PESO_DA_DUPLA_REPETIDA
    };
  };
}

/** Todas as divisões possíveis, guardando só as que ficam perto da mais equilibrada. */
function divisoesEquilibradas(jogadores) {
  const n = jogadores.length;
  const forca = jogadores.map(p => calcOVR(p));
  const total = forca.reduce((a, b) => a + b, 0);
  // Times de tamanhos iguais, ou com um de diferença quando o número é ímpar
  const tamanhosDeA = n % 2 === 0 ? [n / 2] : [Math.floor(n / 2), Math.ceil(n / 2)];

  let melhor = Infinity;
  let guardadas = [];
  const lado = new Array(n).fill(false);
  // O atleta 0 fica sempre no time A: trocar os nomes dos times dá a mesma divisão
  lado[0] = true;

  const visitar = (i, noA, somaA) => {
    const restantes = n - i;
    if (!tamanhosDeA.some(t => noA <= t && noA + restantes >= t)) return;
    if (i === n) {
      if (!tamanhosDeA.includes(noA)) return;
      const diferenca = Math.abs(2 * somaA - total);
      if (diferenca > melhor + SORTEIO.FOLGA_DE_FORCA) return;
      if (diferenca < melhor) {
        melhor = diferenca;
        guardadas = guardadas.filter(d => d.diferenca <= melhor + SORTEIO.FOLGA_DE_FORCA);
      }
      guardadas.push({ lado: lado.slice(), diferenca });
      return;
    }
    lado[i] = true;
    visitar(i + 1, noA + 1, somaA + forca[i]);
    lado[i] = false;
    visitar(i + 1, noA, somaA);
  };
  visitar(1, 1, forca[0]);

  return guardadas.filter(d => d.diferenca <= melhor + SORTEIO.FOLGA_DE_FORCA);
}

/** Com muitos atletas: várias buscas locais a partir de divisões aleatórias. */
function divisoesPorBusca(jogadores, avaliar, aleatorio) {
  const n = jogadores.length;
  const tamanhoA = Math.floor(n / 2);
  const resultados = [];
  for (let tentativa = 0; tentativa < 150; tentativa++) {
    const ordem = jogadores.map((_, i) => i).sort(() => aleatorio() - 0.5);
    const lado = new Array(n).fill(false);
    ordem.slice(0, tamanhoA).forEach(i => { lado[i] = true; });
    let atual = avaliar(lado).nota;
    let melhorou = true;
    while (melhorou) {
      melhorou = false;
      for (let i = 0; i < n && !melhorou; i++) {
        if (!lado[i]) continue;
        for (let j = 0; j < n; j++) {
          if (lado[j]) continue;
          lado[i] = false; lado[j] = true;
          const nota = avaliar(lado).nota;
          if (nota < atual - 1e-9) { atual = nota; melhorou = true; break; }
          lado[i] = true; lado[j] = false;
        }
      }
    }
    resultados.push({ lado: lado.slice() });
  }
  return resultados;
}

/**
 * Sorteia os dois times.
 *
 * @param jogadores atletas convocados (com position e os atributos já evoluídos)
 * @param opcoes.historico escalações dos últimos rachas, do mais recente ao mais antigo:
 *        [{ teams: [[ids do time 1], [ids do time 2]] }]
 * @param opcoes.aleatorio gerador de números entre 0 e 1 (os testes passam um fixo)
 * @returns { timeA, timeB, resumo }
 */
export function sortearTimes(jogadores, { historico = [], aleatorio = Math.random } = {}) {
  const lista = [...jogadores];
  if (lista.length < 2) {
    return { timeA: lista, timeB: [], resumo: null };
  }

  const avaliar = avaliador(lista, historico);
  const candidatas = lista.length <= SORTEIO.LIMITE_PARA_TESTAR_TUDO
    ? divisoesEquilibradas(lista)
    : divisoesPorBusca(lista, avaliar, aleatorio);

  let avaliadas = candidatas.map(c => ({ lado: c.lado, ...avaliar(c.lado) }));

  // Repetir exatamente os times do último racha (ou os atuais, no "sortear de novo")
  // nunca é a escolha quando existe outra divisão equilibrada. Com poucos atletas a
  // penalidade das duplas sozinha não bastava: 2x2 repetido custa só 2 duplas.
  const repetida = divisaoDoHistorico(historico[0], lista);
  if (repetida) {
    const diferentes = avaliadas.filter(c => chaveDaDivisao(c.lado, lista) !== repetida);
    if (diferentes.length > 0) avaliadas = diferentes;
  }

  const melhorNota = Math.min(...avaliadas.map(c => c.nota));
  const finalistas = avaliadas.filter(c => c.nota <= melhorNota + SORTEIO.FOLGA_DO_SORTEIO);
  const escolhida = finalistas[Math.floor(aleatorio() * finalistas.length)] || avaliadas[0];

  // Qual dos dois vira COM COLETE também é sorteado
  const inverter = aleatorio() < 0.5;
  const timeA = lista.filter((_, i) => escolhida.lado[i] !== inverter);
  const timeB = lista.filter((_, i) => escolhida.lado[i] === inverter);

  return { timeA, timeB, resumo: resumoDoSorteio(timeA, timeB, historico, finalistas.length) };
}

/** Identifica uma divisão pelos ids do time em que está o primeiro atleta da lista. */
function chaveDaDivisao(lado, lista) {
  const ladoDoPrimeiro = lado[0];
  return lista.filter((_, i) => lado[i] === ladoDoPrimeiro).map(p => Number(p.id)).sort((a, b) => a - b).join(',');
}

/** Chave da divisão de uma partida do histórico, se ela teve exatamente estes atletas. */
function divisaoDoHistorico(partida, lista) {
  if (!partida || !Array.isArray(partida.teams)) return null;
  const nosTimes = partida.teams.flat().map(Number);
  const daLista = new Set(lista.map(p => Number(p.id)));
  if (nosTimes.length !== daLista.size || !nosTimes.every(id => daLista.has(id))) return null;
  const doPrimeiro = partida.teams.find(t => t.map(Number).includes(Number(lista[0].id)));
  return doPrimeiro ? doPrimeiro.map(Number).sort((a, b) => a - b).join(',') : null;
}

/** Números para mostrar ao fim do sorteio. */
function resumoDoSorteio(timeA, timeB, historico, opcoes) {
  const soma = (t) => t.reduce((s, p) => s + calcOVR(p), 0);
  const ultimo = historico[0];
  let duplasRepetidas = 0;
  if (ultimo) {
    const timeDoUltimo = new Map();
    (ultimo.teams || []).forEach((time, idx) => time.forEach(id => timeDoUltimo.set(Number(id), idx)));
    [timeA, timeB].forEach(time => {
      for (let i = 0; i < time.length; i++) {
        for (let j = i + 1; j < time.length; j++) {
          const a = timeDoUltimo.get(Number(time[i].id));
          const b = timeDoUltimo.get(Number(time[j].id));
          if (a !== undefined && a === b) duplasRepetidas++;
        }
      }
    });
  }
  return {
    ovrMedioA: timeA.length ? soma(timeA) / timeA.length : 0,
    ovrMedioB: timeB.length ? soma(timeB) / timeB.length : 0,
    forcaA: soma(timeA),
    forcaB: soma(timeB),
    duplasRepetidas: ultimo ? duplasRepetidas : null,
    opcoesEquilibradas: opcoes
  };
}

/**
 * Ordem de revelação na animação: alterna os times, do maior OVR para o menor, para
 * a tela mostrar os dois lados crescendo juntos.
 */
export function ordemDeRevelacao(timeA, timeB) {
  const porOVR = (t) => [...t].sort((a, b) => calcOVR(b) - calcOVR(a));
  const a = porOVR(timeA), b = porOVR(timeB);
  const ordem = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) ordem.push({ player: a[i], teamName: 'COM COLETE', isTeamA: true });
    if (b[i]) ordem.push({ player: b[i], teamName: 'SEM COLETE', isTeamA: false });
  }
  return ordem;
}
