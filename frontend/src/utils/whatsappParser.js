// Leitor da lista de convocados colada do WhatsApp, com reconhecimento aproximado
// dos apelidos do elenco

// Palavras do cabeçalho da lista ("futebol sábado 15h arena petrópolis") que não
// aparecem em nomes. A comparação é por PALAVRA inteira: por prefixo, "domingo"
// descartava o Domingos, "campo" o Campos e "quadra" o Quadrado.
const PALAVRAS_DE_CABECALHO = new Set([
  'futebol', 'jogo', 'partida', 'sabado', 'domingo', 'segunda',
  'terca', 'quarta', 'quinta', 'sexta', 'arena', 'ginasio', 'campo',
  'quadra', 'mensalistas', 'convocados', 'lista', 'presenca', 'horario',
  'local', 'aviso', 'regras', 'confirmados', 'time', 'vs', 'valor', 'pix'
]);

// Preposições e artigos não identificam ninguém. Sem esta lista, o "de" de
// "Ademilson 52 de panturrilha" casava por prefixo com "Denilson".
const PALAVRAS_IGNORADAS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'di', 'du', 'e', 'o', 'a', 'os', 'as',
  'em', 'no', 'na', 'nos', 'nas', 'com', 'sem', 'por', 'pra', 'pro', 'para'
]);

// Abaixo disso a linha não é reconhecida como nenhum atleta do elenco
const PONTUACAO_MINIMA = 70;

const normalizar = (str) =>
  (str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Palavras de um texto, sem acento e sem pontuação. */
const palavrasDe = (texto) => normalizar(texto).split(/[^a-z0-9]+/).filter(Boolean);

/** Palavra que pode identificar um atleta: 3 letras ou mais, sem número, e não é preposição. */
const ehPalavraUtil = (palavra) =>
  palavra.length >= 3 && !/\d/.test(palavra) && !PALAVRAS_IGNORADAS.has(palavra);

/** `trecho` aparece inteiro, palavra por palavra e na mesma ordem, dentro de `palavras`. */
function contemSequencia(palavras, trecho) {
  if (trecho.length === 0 || trecho.length > palavras.length) return false;
  for (let i = 0; i + trecho.length <= palavras.length; i++) {
    if (trecho.every((p, j) => palavras[i + j] === p)) return true;
  }
  return false;
}

/**
 * O quanto a linha da lista parece com o atleta: `pontos` (0 = nada) e, para
 * desempatar, `cobertura`, quantas palavras da linha aparecem no nome ou nos
 * apelidos dele. Em "thiago felino", o Thiago (apelido Felino) cobre as duas
 * palavras e vence outro Thiago qualquer.
 */
function pontuar(linha, player) {
  const apelidos = (player.nickname || '').split(',');
  const nomes = [...apelidos, player.username || '']
    .map(palavrasDe)
    .filter(nome => nome.length > 0);
  const linhaTexto = linha.join(' ');
  const letrasNaLinha = linha.join('').length;
  const palavrasDaLinha = linha.filter(ehPalavraUtil);
  const palavrasDoAtleta = nomes.flat().filter(ehPalavraUtil);
  const cobertura = palavrasDaLinha.filter(palavra => palavrasDoAtleta.includes(palavra)).length;

  // 1. A linha é exatamente o nome ou um dos apelidos
  if (nomes.some(nome => nome.join(' ') === linhaTexto)) return { pontos: 100, cobertura };
  // 2. O nome/apelido inteiro aparece na linha ("thiago felino" contém "felino")
  if (nomes.some(nome => nome.join('').length >= 3 && contemSequencia(linha, nome))) return { pontos: 90, cobertura };
  // 3. A linha inteira é parte do nome ("caca" em "caca rato")
  if (letrasNaLinha >= 3 && nomes.some(nome => contemSequencia(nome, linha))) return { pontos: 85, cobertura };

  // 4. Palavras soltas: igual vale mais que prefixo ("rafa" -> "rafael")
  let pontos = 0;
  for (const palavra of palavrasDaLinha) {
    if (palavrasDoAtleta.includes(palavra)) {
      pontos = Math.max(pontos, 80);
    } else if (palavrasDoAtleta.some(p => p.startsWith(palavra) || palavra.startsWith(p))) {
      pontos = Math.max(pontos, 70);
    }
  }
  return { pontos, cobertura };
}

/**
 * Lê a lista colada e tenta reconhecer cada linha como um atleta do elenco.
 *
 * Cada item devolvido traz:
 * - `matchedPlayer`: o atleta reconhecido, ou null;
 * - `candidatos`: quando dois ou mais atletas empatam na melhor pontuação, a linha
 *   fica sem atleta e a lista dos empatados vai aqui para o usuário escolher.
 *   Escolher o primeiro em silêncio convocava a pessoa errada;
 * - `isNew`: nenhum atleta parecido, a linha vira um cadastro novo.
 */
export function parseWhatsAppList(text, playersList = []) {
  if (!text) return [];

  const recognized = [];

  text.split(/\r?\n/).forEach((rawLine) => {
    // Tira numeração, marcadores e emojis do começo da linha
    const cleaned = rawLine
      .replace(/^[\s\d.*•):#]+/, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .trim();

    if (cleaned.length < 2) return;

    const linha = palavrasDe(cleaned);
    if (linha.length === 0) return;

    // Linha de cabeçalho: tem uma das palavras de cabeçalho, inteira
    if (linha.some(palavra => PALAVRAS_DE_CABECALHO.has(palavra))) return;

    let melhorPontuacao = 0;
    let melhorCobertura = 0;
    let empatados = [];
    playersList.forEach((player) => {
      const { pontos, cobertura } = pontuar(linha, player);
      if (pontos === 0) return;
      if (pontos > melhorPontuacao || (pontos === melhorPontuacao && cobertura > melhorCobertura)) {
        melhorPontuacao = pontos;
        melhorCobertura = cobertura;
        empatados = [player];
      } else if (pontos === melhorPontuacao && cobertura === melhorCobertura) {
        empatados.push(player);
      }
    });

    const reconhecida = melhorPontuacao >= PONTUACAO_MINIMA;
    const ambigua = reconhecida && empatados.length > 1;

    recognized.push({
      originalLine: rawLine.trim(),
      cleanedText: cleaned,
      suggestedName: cleaned,
      matchedPlayer: reconhecida && !ambigua ? empatados[0] : null,
      candidatos: ambigua ? empatados : [],
      score: melhorPontuacao,
      isNew: !reconhecida,
      selected: true
    });
  });

  return recognized;
}
