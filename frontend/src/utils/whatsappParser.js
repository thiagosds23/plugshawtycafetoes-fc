// Intelligent WhatsApp List Parser with Fuzzy Matching
export function parseWhatsAppList(text, playersList = []) {
  if (!text) return [];

  const normalize = (str) =>
    (str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  // Common matchday header keywords to skip
  const headerKeywords = [
    'futebol', 'jogo', 'partida', 'sabado', 'domingo', 'segunda',
    'terca', 'quarta', 'quinta', 'sexta', 'arena', 'ginasio', 'campo',
    'quadra', 'mensalistas', 'convocados', 'lista', 'presenca', 'horario',
    'local', 'aviso', 'regras', 'confirmados', 'time', 'vs', 'valor', 'pix'
  ];

  const lines = text.split(/\r?\n/);
  const recognized = [];

  lines.forEach((rawLine) => {
    // Strip leading numbers, bullets, emojis
    let cleaned = rawLine
      .replace(/^[\s\d.*•):#]+/, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .trim();

    if (cleaned.length < 2) return;

    const normLine = normalize(cleaned);

    // Skip header lines
    const isHeader = headerKeywords.some(kw => normLine.startsWith(kw) || (normLine.includes(kw) && normLine.length > 20));
    if (isHeader) return;

    const lineWords = normLine.split(/\s+/).filter(w => w.length >= 2);

    let bestMatch = null;
    let highestScore = 0;

    playersList.forEach((player) => {
      const pNicknames = (player.nickname || '')
        .split(',')
        .map(n => normalize(n))
        .filter(Boolean);
      const pUser = normalize(player.username || '');
      const pNames = [...pNicknames, pUser].filter(Boolean);

      let score = 0;

      // 1. Exact match with username or any of the player's nicknames
      if (pNames.some(n => n === normLine)) {
        score = 100;
      }
      // 2. Line contains player username or any of the player's nicknames
      else if (pNames.some(n => n.length >= 3 && normLine.includes(n))) {
        score = 90;
      }
      // 3. Player name or any nickname contains line
      else if (pNames.some(n => n.length >= 3 && n.includes(normLine))) {
        score = 85;
      }
      // 4. Token matches with any token of username or any nickname
      else {
        const playerTokens = [
          ...pNicknames.flatMap(n => n.split(/\s+/)),
          ...pUser.split(/\s+/)
        ].filter(t => t.length >= 3);

        for (const lw of lineWords) {
          if (playerTokens.includes(lw)) {
            score = Math.max(score, 80);
          } else if (playerTokens.some(pt => pt.startsWith(lw) || lw.startsWith(pt))) {
            score = Math.max(score, 70);
          }
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = player;
      }
    });

    recognized.push({
      originalLine: rawLine.trim(),
      cleanedText: cleaned,
      suggestedName: cleaned,
      matchedPlayer: highestScore >= 70 ? bestMatch : null,
      score: highestScore,
      isNew: highestScore < 70,
      selected: true
    });
  });

  return recognized;
}
