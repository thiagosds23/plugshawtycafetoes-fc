const path = require('path');
// Variáveis locais em backend/.env (nunca versionado). No Render vêm do painel.
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const multer = require('multer');
const fs = require('fs');
const XLSX = require('xlsx');
const db = require('./db');
const auth = require('./auth');
const { runMigrations } = require('./schema');
const {
  HORAS_PARA_AVALIAR,
  DURACAO_MAXIMA_DA_AVALIACAO,
  janelaDeAvaliacao,
  calcularFormasDe,
  aplicarForma
} = require('./evolucao');
const { notasDoPeriodo, minimoParaPremio } = require('./ranking');

const app = express();
// Comprime JSON e o bundle do frontend (o JS principal cai de ~620KB para ~180KB)
app.use(compression());
// A identidade vai no cabeçalho Authorization (não em cookie), então liberar outras
// origens não expõe a sessão de ninguém: um site de fora não tem como ler o token.
app.use(cors());
app.use(express.json());

// Fotos antigas, gravadas em disco antes de irem para o banco
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { dotfiles: 'ignore', index: false }));

// Servir frontend compilado estaticamente (Modo Fullstack Unificado na Nuvem)
const frontendDist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));

  // Interceptador SPA: toda navegação do browser (GET com accept: text/html) que não
  // seja um arquivo físico serve o index.html. Isso evita "Cannot GET /login" ao
  // puxar para atualizar no celular.
  app.use((req, res, next) => {
    if (req.method === 'GET') {
      const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
      const hasExt = path.extname(req.path) !== '';
      // Fotos de atleta não têm extensão no caminho: sem esta exceção o
      // interceptador devolveria o index.html no lugar da imagem
      const isAsset = req.path.startsWith('/uploads') || (req.path.startsWith('/users/') && req.path.endsWith('/photo'));

      if (acceptsHtml && !hasExt && !isAsset) {
        return res.sendFile(path.join(frontendDist, 'index.html'));
      }
    }
    next();
  });
}

// Uploads ficam só em memória: a foto vira data URI no banco e a planilha é lida
// direto do buffer. Nada é gravado em disco, então não sobra arquivo temporário.
const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const upload = multer({
  storage: multer.memoryStorage(),
  // A foto recortada pelo app tem 400x480 (bem menos de 1MB); o limite cobre a original
  limits: { fileSize: 4 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    if (allowedImageMimes.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Apenas imagens válidas (JPEG, PNG, WebP, GIF) são permitidas.'));
  }
});

const allowedDocExts = ['.xlsx', '.xls', '.csv'];
const docUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedDocExts.includes(ext)) cb(null, true);
    else cb(new Error('Apenas arquivos de planilha (.xlsx, .xls, .csv) são permitidos.'));
  }
});

// Responde 500 sem vazar detalhes internos (SQL, nomes de tabela) para o cliente
function erroInterno(res, contexto, err, mensagem = 'Erro interno do servidor.') {
  console.error(`Erro ao ${contexto}:`, err && err.message ? err.message : err);
  res.status(500).json({ error: mensagem });
}

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------

// Colunas de um atleta que podem trafegar em qualquer listagem. Telefone e e-mail
// ficam de fora: só o próprio atleta e o administrador os veem (GET /users/:id).
const USER_COLS = 'id, username, position, nickname, height, weight, pace, shooting, passing, dribbling, defending, physical, is_admin';
const HAS_PIN_COL = "(CASE WHEN pin IS NOT NULL AND pin != '' THEN 1 ELSE 0 END) AS has_pin";

// As fotos ficam guardadas como data URI Base64 (até 400KB cada). Trazer isso em
// toda listagem colocava ~7MB na memória do servidor por request e era o que
// estourava o limite do Render. Aqui o banco devolve apenas o cabeçalho, o tamanho
// e o final da string: o suficiente para montar uma URL versionada, sem carregar a
// imagem. O navegador então busca cada foto uma única vez e cacheia.
function photoCols(prefix) {
  const t = prefix ? prefix + '.' : '';
  return `SUBSTR(${t}photo, 1, 96) AS photo_head, LENGTH(${t}photo) AS photo_len, SUBSTR(${t}photo, -12) AS photo_tail, ` +
         `SUBSTR(${t}original_photo, 1, 96) AS orig_head, LENGTH(${t}original_photo) AS orig_len, SUBSTR(${t}original_photo, -12) AS orig_tail`;
}

// Monta a URL curta da foto. A versão vem do próprio conteúdo (tamanho + últimos
// caracteres), então trocar a foto muda a URL e derruba o cache do navegador.
function buildPhotoRef(userId, head, len, tail, isOriginal) {
  if (!len || !head) return null;
  const h = String(head);
  // Fotos antigas foram gravadas como caminho (/uploads/arquivo.png) e cabem
  // inteiras nos 96 primeiros caracteres: essas seguem sendo servidas direto.
  if (!h.startsWith('data:')) return h;
  const version = `${len}${String(tail || '').replace(/[^a-zA-Z0-9]/g, '')}`;
  return `/users/${userId}/photo?v=${version}${isOriginal ? '&original=1' : ''}`;
}

// Troca os campos crus de foto da linha pelas URLs curtas
function withPhotoUrls(row, userId) {
  if (!row) return row;
  const id = userId !== undefined ? userId : row.id;
  const out = { ...row };
  out.photo = buildPhotoRef(id, row.photo_head, row.photo_len, row.photo_tail, false);
  out.original_photo = buildPhotoRef(id, row.orig_head, row.orig_len, row.orig_tail, true);
  ['photo_head', 'photo_len', 'photo_tail', 'orig_head', 'orig_len', 'orig_tail'].forEach(k => delete out[k]);
  return out;
}

// ---------------------------------------------------------------------------
// Evolução das cartas (com cache)
// ---------------------------------------------------------------------------

// A fórmula de OVR por posição vive no frontend (utils/ovr.js) e é carregada daqui
// também, para servidor e tela usarem exatamente a mesma conta. O arquivo não
// importa nada, então pode rodar no Node sem o resto do frontend.
const carregandoCalcOVR = import(
  require('url').pathToFileURL(path.join(__dirname, '../frontend/src/utils/ovr.js')).href
).then(modulo => modulo.calcOVR);
carregandoCalcOVR.catch(err => console.error('⚠️  Não foi possível carregar a fórmula de OVR:', err.message));

async function calcularFormas() {
  const calcOVR = await carregandoCalcOVR;
  const linhas = await db.all(`
    -- Os nomes dos CTEs não podem repetir os das tabelas: "assists AS (... FROM assists)"
    -- vira uma referência circular no SQLite
    WITH gols_partida AS (SELECT match_id, user_id, COUNT(*) AS n FROM goals GROUP BY match_id, user_id),
         assists_partida AS (SELECT match_id, user_id, COUNT(*) AS n FROM assists GROUP BY match_id, user_id),
         notas_partida AS (SELECT match_id, rated_id AS user_id, AVG(score) AS media FROM ratings GROUP BY match_id, rated_id),
         gols_do_time AS (
           SELECT tp.team_id, COUNT(*) AS n
           FROM goals g
           JOIN team_players tp ON tp.user_id = g.user_id
           JOIN teams t ON t.id = tp.team_id AND t.match_id = g.match_id
           GROUP BY tp.team_id
         ),
         -- Placar de cada time pela mesma regra da tela: o digitado pelo admin ou a soma
         -- dos gols lançados para os atletas do time
         placar_time AS (
           SELECT t.id AS team_id, t.match_id, COALESCE(t.manual_score, COALESCE(gt2.n, 0)) AS gols
           FROM teams t
           LEFT JOIN gols_do_time gt2 ON gt2.team_id = t.id
         )
    SELECT tp.user_id, m.id AS match_id, m.date, m.finished_at, m.rating_deadline,
           t.id AS team_id, adv.team_id AS time_adversario,
           pro.gols AS placar_pro, COALESCE(adv.gols, 0) AS placar_contra,
           u.position, u.pace, u.shooting, u.passing, u.dribbling, u.defending, u.physical,
           COALESCE(gp.n, 0) AS gols,
           COALESCE(ap.n, 0) AS assists,
           np.media AS nota,
           COALESCE(gt.n, 0) AS gols_time
    FROM team_players tp
    JOIN teams t ON tp.team_id = t.id
    JOIN matches m ON t.match_id = m.id
    JOIN users u ON u.id = tp.user_id
    JOIN placar_time pro ON pro.team_id = t.id
    -- O outro time da partida (no jogo contra rival, o adversário sem atletas)
    LEFT JOIN placar_time adv ON adv.match_id = m.id AND adv.team_id != t.id
    LEFT JOIN gols_partida gp ON gp.match_id = m.id AND gp.user_id = tp.user_id
    LEFT JOIN assists_partida ap ON ap.match_id = m.id AND ap.user_id = tp.user_id
    LEFT JOIN notas_partida np ON np.match_id = m.id AND np.user_id = tp.user_id
    LEFT JOIN gols_do_time gt ON gt.team_id = t.id
    WHERE m.status = 'completed'
    ORDER BY m.date DESC, m.id DESC
  `);
  return calcularFormasDe(linhas, calcOVR);
}

// A evolução varre todas as partidas e era recalculada a cada /users, /stats e
// /matches/:id. Agora fica guardada por até 1 minuto e é descartada a cada escrita.
// O minuto cobre o único caso sem escrita: o prazo de uma votação vencer sozinho.
const VALIDADE_DO_CACHE_MS = 60 * 1000;
let cacheFormas = null; // { promessa, criadoEm }

function obterFormas() {
  if (cacheFormas && Date.now() - cacheFormas.criadoEm < VALIDADE_DO_CACHE_MS) return cacheFormas.promessa;
  const promessa = calcularFormas();
  cacheFormas = { promessa, criadoEm: Date.now() };
  promessa.catch(() => { if (cacheFormas && cacheFormas.promessa === promessa) cacheFormas = null; });
  return promessa;
}

const invalidarFormas = () => { cacheFormas = null; };

// Qualquer escrita (fora GET) pode mudar gols, notas, escalações ou atributos
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
    res.on('finish', invalidarFormas);
  }
  next();
});

// ---------------------------------------------------------------------------
// Autorização
// ---------------------------------------------------------------------------

/**
 * Atleta dono do token da requisição, ou null. O resultado fica guardado na própria
 * requisição para os middlewares não consultarem o banco duas vezes.
 */
function getRequester(req) {
  if (!req._requester) {
    req._requester = (async () => {
      const dados = auth.lerToken(auth.tokenDaRequisicao(req));
      if (!dados) return null;
      const user = await db.get('SELECT id, username, nickname, is_admin, pin FROM users WHERE id = ?', [dados.uid]);
      // PIN trocado ou resetado derruba os tokens antigos
      if (!user || auth.versaoDoPin(user.pin) !== dados.pv) return null;
      const temPin = !!(user.pin && String(user.pin).trim());
      delete user.pin;
      return { ...user, has_pin: temPin };
    })().catch(err => {
      console.error('Erro ao identificar o atleta:', err.message);
      return null;
    });
  }
  return req._requester;
}

/**
 * Administrador de verdade: is_admin E com PIN. Sem PIN, qualquer um entraria na
 * conta só digitando o nome; por isso os poderes de admin só valem com PIN definido.
 */
function isAdminUser(user) {
  return !!(user && Number(user.is_admin) === 1 && user.has_pin);
}

const nomeDoAtleta = (u) => (u.nickname ? `${u.username} (${String(u.nickname).split(',')[0].trim()})` : u.username);

function requireAuth(req, res, next) {
  getRequester(req).then(user => {
    if (!user) return res.status(401).json({ error: 'Sua sessão expirou. Entre de novo no app.' });
    req.requester = user;
    next();
  });
}

// Placar, gols, assistências, agenda e encerramento são exclusivos do administrador
function requireAdmin(req, res, next) {
  getRequester(req).then(user => {
    if (!user) return res.status(401).json({ error: 'Sua sessão expirou. Entre de novo no app.' });
    if (!isAdminUser(user)) {
      const motivo = Number(user.is_admin) === 1 ? ' Defina seu PIN para liberar as funções de administrador.' : '';
      return res.status(403).json({ error: 'Apenas o administrador pode fazer isso.' + motivo });
    }
    req.requester = user;
    next();
  });
}

// O próprio atleta ou o administrador (fotos, perfil, PIN)
function requireSelfOrAdmin(req, res, next) {
  getRequester(req).then(user => {
    if (!user) return res.status(401).json({ error: 'Sua sessão expirou. Entre de novo no app.' });
    if (String(user.id) !== String(req.params.id) && !isAdminUser(user)) {
      return res.status(403).json({ error: 'Acesso negado: apenas o administrador pode alterar outros jogadores.' });
    }
    req.requester = user;
    next();
  });
}

// Montar e ajustar os times fica livre (para quem está logado) enquanto a pelada não
// foi encerrada; depois do apito só o administrador mexe, para o resultado não mudar.
function requireOpenMatchOrAdmin(req, res, next) {
  Promise.all([
    getRequester(req),
    db.get('SELECT id, status, type FROM matches WHERE id = ?', [req.params.id])
  ]).then(([user, match]) => {
    if (!user) return res.status(401).json({ error: 'Sua sessão expirou. Entre de novo no app.' });
    if (!match) return res.status(404).json({ error: 'Partida não encontrada' });
    req.requester = user;
    req.match = match;
    if (isAdminUser(user)) return next();
    if (match.status === 'completed') {
      return res.status(403).json({ error: 'Partida encerrada: apenas o administrador pode alterá-la.' });
    }
    next();
  }).catch(err => erroInterno(res, 'verificar a partida', err));
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

// Sistema de Auditoria em Tempo Real (Horário de Brasília). Não bloqueia a resposta.
function logAudit(userId, username, action, details) {
  const brTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  db.run(
    'INSERT INTO audit_logs (user_id, username, action, details, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId || null, username || 'Desconhecido', action, details, brTime]
  ).catch(err => console.error('Erro ao gravar log de auditoria:', err.message));
}

const auditar = (req, action, details) => {
  const quem = req.requester;
  logAudit(quem ? quem.id : null, quem ? nomeDoAtleta(quem) : 'Atleta', action, details);
};

app.get('/audit-logs', requireAdmin, async (req, res) => {
  try {
    res.json({ logs: await db.all('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300') });
  } catch (err) {
    erroInterno(res, 'listar a auditoria', err);
  }
});

app.delete('/audit-logs', requireAdmin, async (req, res) => {
  try {
    await db.run('DELETE FROM audit_logs');
    auditar(req, 'ADMIN', 'Limpou o histórico de auditoria');
    res.json({ success: true, message: 'Histórico de auditoria limpo com sucesso!' });
  } catch (err) {
    erroInterno(res, 'limpar a auditoria', err);
  }
});

// Registrar evento vindo do frontend (ex: avaliação de elenco preenchida)
app.post('/audit-logs', requireAuth, (req, res) => {
  const action = String(req.body.action || 'GERAL').slice(0, 40);
  const details = String(req.body.details || 'Ação registrada').slice(0, 300);
  auditar(req, action, details);
  res.json({ success: true });
});

// Exportar Backup Completo do Clube em JSON (Apenas Administrador)
app.get('/admin/backup', requireAdmin, async (req, res) => {
  try {
    const tables = ['users', 'matches', 'teams', 'team_players', 'goals', 'assists', 'ratings', 'audit_logs'];
    const linhas = await Promise.all(tables.map(t => db.all(`SELECT * FROM ${t}`)));

    const database = {};
    tables.forEach((t, i) => {
      // O hash do PIN nunca sai do servidor
      database[t] = t === 'users' ? linhas[i].map(({ pin, ...resto }) => resto) : linhas[i];
    });

    auditar(req, 'ADMIN', 'Baixou backup completo do banco de dados');
    res.setHeader('Content-Disposition', `attachment; filename=backup-plugshawty-${new Date().toISOString().slice(0, 10)}.json`);
    res.json({
      app: 'plugshawtycafetoes FC',
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      exported_by: req.requester.username,
      database
    });
  } catch (err) {
    erroInterno(res, 'gerar o backup', err);
  }
});

// ---------------------------------------------------------------------------
// Cadastro, login e PIN
// ---------------------------------------------------------------------------

// Códigos de convite vêm do ambiente (INVITE_CODES=COD1,COD2). Os antigos ficaram
// públicos no repositório, então só valem enquanto a variável não for configurada.
const INVITE_CODES = (process.env.INVITE_CODES || 'JOGO2026,PELADA2026')
  .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
if (!process.env.INVITE_CODES) {
  console.warn('⚠️  INVITE_CODES não definido: usando os códigos de convite antigos, que são públicos.');
}

/** Dados que o próprio atleta recebe ao entrar (inclui telefone, e-mail e token). */
async function sessaoDoAtleta(userId) {
  const row = await db.get(`SELECT ${USER_COLS}, phone, email, pin, ${photoCols()} FROM users WHERE id = ?`, [userId]);
  if (!row) return null;
  const formas = await obterFormas();
  const token = auth.criarToken(row);
  const temPin = !!(row.pin && String(row.pin).trim());
  delete row.pin;
  return { ...aplicarForma(withPhotoUrls(row), formas), has_pin: temPin, token };
}

app.post('/register', async (req, res) => {
  const { username, email, phone, inviteCode } = req.body;
  if (!INVITE_CODES.includes(String(inviteCode || '').trim().toUpperCase())) {
    return res.status(400).json({ error: 'Código de convite inválido' });
  }
  if (!String(username || '').trim() || !String(email || '').trim() || !String(phone || '').trim()) {
    return res.status(400).json({ error: 'Preencha o Nome de Usuário, Celular e E-mail' });
  }

  const uName = username.trim();
  const uEmail = email.trim().toLowerCase();
  const uPhone = phone.trim();

  try {
    const atletas = await db.all('SELECT id, username, nickname, email, phone FROM users');
    const norm = auth.normalizar;
    if (atletas.some(a => norm(a.username) === norm(uName))) {
      return res.status(400).json({ error: 'Este nome de usuário já está cadastrado.' });
    }
    if (atletas.some(a => a.email && norm(a.email) === norm(uEmail))) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado.' });
    }
    if (auth.encontrarAtletas(uPhone, atletas.map(a => ({ ...a, username: '', email: '', nickname: '' }))).length > 0) {
      return res.status(400).json({ error: 'Este telefone já está cadastrado.' });
    }

    const criado = await db.run('INSERT INTO users (username, email, phone) VALUES (?, ?, ?)', [uName, uEmail, uPhone]);
    logAudit(criado.lastID, uName, 'CADASTRO', 'Criou a conta no app');
    res.json(await sessaoDoAtleta(criado.lastID));
  } catch (err) {
    erroInterno(res, 'cadastrar usuário', err, 'Erro ao cadastrar usuário');
  }
});

// Cadastro rápido de atleta pelo elenco ou pela convocação (qualquer atleta logado)
app.post('/users', requireAuth, async (req, res) => {
  const name = String(req.body.username || '').trim();
  const nick = String(req.body.nickname || name).trim();
  const pos = req.body.position || 'MEI';
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

  try {
    // Se o atleta já existe pelo nome ou apelido, devolve o existente
    const existentes = await db.all(`SELECT ${USER_COLS}, ${photoCols()} FROM users`);
    const [existente] = auth.encontrarAtletas(name, existentes).concat(auth.encontrarAtletas(nick, existentes));
    if (existente) return res.json(withPhotoUrls(existente));

    const criado = await db.run(
      'INSERT INTO users (username, nickname, position, pace, shooting, passing, dribbling, defending, physical) VALUES (?, ?, ?, 50, 50, 50, 50, 50, 50)',
      [name, nick, pos]
    );
    auditar(req, 'ELENCO', `Cadastrou o atleta ${name}`);
    res.json({ id: criado.lastID, username: name, nickname: nick, position: pos, ovr: 50 });
  } catch (err) {
    erroInterno(res, 'cadastrar atleta', err, 'Erro ao cadastrar atleta');
  }
});

app.post('/login', async (req, res) => {
  const { username, pin } = req.body; // nome de usuário, apelido, e-mail ou celular
  if (!String(username || '').trim()) return res.status(400).json({ error: 'Informe seu usuário, e-mail ou telefone' });

  try {
    const atletas = await db.all('SELECT id, username, nickname, email, phone, is_admin, pin, pin_prompted FROM users');
    const encontrados = auth.encontrarAtletas(username, atletas);

    if (encontrados.length === 0) {
      return res.status(401).json({ error: 'Usuário, e-mail, telefone ou apelido não encontrado' });
    }
    if (encontrados.length > 1) {
      return res.status(409).json({ error: 'Mais de um atleta tem esse nome ou apelido. Entre com seu e-mail ou celular.' });
    }

    const atleta = encontrados[0];
    const temPin = !!(atleta.pin && String(atleta.pin).trim());
    const pinInformado = pin !== undefined && pin !== null && String(pin).trim() !== '';

    if (temPin) {
      if (!pinInformado) {
        const foto = await db.get(`SELECT ${photoCols()} FROM users WHERE id = ?`, [atleta.id]);
        return res.json({
          requiresPin: true,
          username: atleta.username,
          nickname: atleta.nickname,
          photo: buildPhotoRef(atleta.id, foto.photo_head, foto.photo_len, foto.photo_tail, false)
        });
      }
      if (auth.pinBloqueado(atleta.id)) {
        return res.status(429).json({ error: 'Muitas tentativas erradas. Espere 15 minutos ou peça ao administrador para resetar o PIN.' });
      }
      if (!auth.conferePin(pin, atleta.pin)) {
        const bloqueou = auth.registrarErroDePin(atleta.id);
        return res.status(401).json({
          error: bloqueou
            ? 'Muitas tentativas erradas. O PIN ficou bloqueado por 15 minutos.'
            : 'PIN incorreto. Tente novamente ou peça ao administrador para resetar.'
        });
      }
      auth.limparErrosDePin(atleta.id);
    }

    const sessao = await sessaoDoAtleta(atleta.id);

    // Administrador sem PIN precisa criar um antes de usar o app: sem PIN, qualquer um
    // entraria na conta dele só digitando o nome
    const adminSemPin = Number(atleta.is_admin) === 1 && !temPin;
    // Primeiro login de quem não tem PIN: oferece criar um
    if (adminSemPin || (!temPin && !atleta.pin_prompted)) {
      return res.json({ askInitialPin: true, pinRequired: adminSemPin, user: sessao });
    }

    logAudit(atleta.id, nomeDoAtleta(atleta), 'LOGIN', 'Entrou no aplicativo');
    res.json(sessao);
  } catch (err) {
    erroInterno(res, 'entrar no app', err, 'Erro ao entrar. Tente de novo.');
  }
});

/** Depois de mudar o PIN do próprio atleta, o token antigo deixa de valer: manda um novo. */
async function tokenNovoSeForOProprio(req, userId) {
  if (String(req.requester.id) !== String(userId)) return undefined;
  const row = await db.get('SELECT id, pin FROM users WHERE id = ?', [userId]);
  return row ? auth.criarToken(row) : undefined;
}

// Definir, alterar ou remover o PIN (o próprio atleta ou o administrador)
app.post('/users/:id/pin', requireSelfOrAdmin, async (req, res) => {
  const { pin } = req.body; // 4 dígitos, ou null para remover
  const remover = pin === null || pin === undefined || String(pin).trim() === '';

  try {
    const alvo = await db.get('SELECT id, username, is_admin FROM users WHERE id = ?', [req.params.id]);
    if (!alvo) return res.status(404).json({ error: 'Atleta não encontrado' });
    if (!remover && !auth.pinValido(String(pin).trim())) {
      return res.status(400).json({ error: 'O PIN precisa ter exatamente 4 números.' });
    }
    if (remover && Number(alvo.is_admin) === 1) {
      return res.status(400).json({ error: 'O administrador precisa ter um PIN.' });
    }

    const guardado = remover ? null : auth.hashPin(String(pin).trim());
    await db.run('UPDATE users SET pin = ?, pin_prompted = 1 WHERE id = ?', [guardado, alvo.id]);
    auth.limparErrosDePin(alvo.id);
    auditar(req, 'PIN', remover ? `Removeu o PIN de ${alvo.username}` : `Definiu o PIN de ${alvo.username}`);

    res.json({ success: true, has_pin: !remover, token: await tokenNovoSeForOProprio(req, alvo.id) });
  } catch (err) {
    erroInterno(res, 'salvar o PIN', err, 'Erro ao salvar PIN');
  }
});

// Usuário optou por entrar sem PIN no primeiro login (não perguntar mais)
app.post('/users/:id/skip-pin', requireAuth, async (req, res) => {
  if (String(req.requester.id) !== String(req.params.id)) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }
  if (Number(req.requester.is_admin) === 1) {
    return res.status(400).json({ error: 'O administrador precisa definir um PIN.' });
  }
  try {
    await db.run('UPDATE users SET pin_prompted = 1 WHERE id = ?', [req.params.id]);
    auditar(req, 'PIN', 'Optou por entrar sem PIN');
    res.json({ success: true });
  } catch (err) {
    erroInterno(res, 'registrar a preferência', err, 'Erro ao registrar preferência');
  }
});

// Resetar o PIN (o administrador para qualquer atleta, ou o próprio atleta logado)
app.post('/users/:id/reset-pin', requireSelfOrAdmin, async (req, res) => {
  try {
    const r = await db.run('UPDATE users SET pin = NULL, pin_prompted = 0 WHERE id = ?', [req.params.id]);
    if (!r.changes) return res.status(404).json({ error: 'Atleta não encontrado' });
    auth.limparErrosDePin(req.params.id);
    auditar(req, 'ADMIN', `Resetou o PIN do atleta ID ${req.params.id}`);
    res.json({ success: true, message: 'PIN resetado com sucesso!', token: await tokenNovoSeForOProprio(req, req.params.id) });
  } catch (err) {
    erroInterno(res, 'resetar o PIN', err, 'Erro ao resetar PIN');
  }
});

// ---------------------------------------------------------------------------
// Atletas
// ---------------------------------------------------------------------------

app.get('/users', async (req, res) => {
  try {
    const [rows, formas] = await Promise.all([
      db.all(`SELECT ${USER_COLS}, ${HAS_PIN_COL}, ${photoCols()} FROM users`),
      obterFormas()
    ]);
    res.json(rows.map(r => aplicarForma(withPhotoUrls(r), formas)));
  } catch (err) {
    erroInterno(res, 'listar atletas', err);
  }
});

// Dados de um único atleta. Telefone e e-mail só para o próprio atleta e o admin.
app.get('/users/:id', async (req, res) => {
  try {
    const [row, formas, quem] = await Promise.all([
      db.get(`SELECT ${USER_COLS}, phone, email, ${HAS_PIN_COL}, ${photoCols()} FROM users WHERE id = ?`, [req.params.id]),
      obterFormas(),
      getRequester(req)
    ]);
    if (!row) return res.status(404).json({ error: 'Atleta não encontrado' });
    const podeVerContato = quem && (String(quem.id) === String(row.id) || isAdminUser(quem));
    if (!podeVerContato) {
      delete row.phone;
      delete row.email;
    }
    res.json(aplicarForma(withPhotoUrls(row), formas));
  } catch (err) {
    erroInterno(res, 'carregar o atleta', err);
  }
});

// Serve a foto do atleta como imagem binária. Como a URL carrega a versão do
// conteúdo, a resposta pode ser cacheada de forma agressiva pelo navegador.
app.get('/users/:id/photo', async (req, res) => {
  const column = req.query.original === '1' ? 'original_photo' : 'photo';
  try {
    const row = await db.get(`SELECT ${column} AS img FROM users WHERE id = ?`, [req.params.id]);
    if (!row || !row.img) return res.status(404).json({ error: 'Foto não encontrada' });

    const img = String(row.img);
    if (!img.startsWith('data:')) return res.redirect(302, img);

    const comma = img.indexOf(',');
    if (comma === -1) return res.status(404).json({ error: 'Foto inválida' });
    const mime = img.slice(5, comma).split(';')[0] || 'image/png';

    res.set({
      'Content-Type': mime,
      // Sem ?v= a URL não identifica a versão, então não pode ficar presa no cache
      'Cache-Control': req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'ETag': `"${img.length}-${img.slice(-12).replace(/[^a-zA-Z0-9]/g, '')}"`
    });
    // res.send (e não res.end) deixa o Express responder 304 quando o navegador
    // revalida a imagem com If-None-Match
    res.send(Buffer.from(img.slice(comma + 1), 'base64'));
  } catch (err) {
    erroInterno(res, 'carregar a foto', err);
  }
});

const paraDataUri = (arquivo) => `data:${arquivo.mimetype || 'image/png'};base64,${arquivo.buffer.toString('base64')}`;

// A autorização vem antes do multer: quem não pode trocar a foto nem chega a enviar o arquivo
app.post('/users/:id/photo', requireSelfOrAdmin, upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'original_photo', maxCount: 1 }]), async (req, res) => {
  const photoFile = req.files && req.files.photo && req.files.photo[0];
  const origFile = req.files && req.files.original_photo && req.files.original_photo[0];
  if (!photoFile) return res.status(400).json({ error: 'Nenhuma foto enviada' });

  try {
    const photoUrl = paraDataUri(photoFile);
    const origUrl = origFile ? paraDataUri(origFile) : null;

    const r = origUrl
      ? await db.run('UPDATE users SET photo = ?, original_photo = ? WHERE id = ?', [photoUrl, origUrl, req.params.id])
      : await db.run('UPDATE users SET photo = ? WHERE id = ?', [photoUrl, req.params.id]);
    if (!r.changes) return res.status(404).json({ error: 'Atleta não encontrado' });

    auditar(req, 'FOTO', 'Atualizou a foto de perfil da carta FUT');

    // O cliente recebe a URL curta e versionada, nunca o data URI inteiro
    const ref = (dataUri, isOriginal) => buildPhotoRef(req.params.id, dataUri.slice(0, 96), dataUri.length, dataUri.slice(-12), isOriginal);
    res.json({ photoUrl: ref(photoUrl, false), origUrl: origUrl ? ref(origUrl, true) : undefined });
  } catch (err) {
    erroInterno(res, 'salvar a foto', err, 'Erro ao processar imagem');
  }
});

app.delete('/users/:id/photo', requireSelfOrAdmin, async (req, res) => {
  try {
    await db.run('UPDATE users SET photo = NULL, original_photo = NULL WHERE id = ?', [req.params.id]);
    auditar(req, 'FOTO', 'Removeu a foto da carta FUT');
    res.json({ success: true });
  } catch (err) {
    erroInterno(res, 'remover a foto', err, 'Erro ao remover foto.');
  }
});

function formatHeight(val) {
  if (val === null || val === undefined || val === '') return '';
  const num = parseFloat(String(val).trim().replace(',', '.'));
  if (isNaN(num)) return val;
  return (num > 10 ? num / 100 : num).toFixed(2);
}

// Atualiza só os campos enviados: um formulário sem telefone ou e-mail não os apaga
app.put('/users/:id/profile', requireSelfOrAdmin, async (req, res) => {
  const campos = [];
  const args = [];
  const definir = (coluna, valor) => { campos.push(`${coluna} = ?`); args.push(valor); };
  const { username, nickname, position, height, weight, phone, email } = req.body;

  if (username !== undefined) {
    if (!String(username).trim()) return res.status(400).json({ error: 'O nome não pode ficar vazio.' });
    definir('username', String(username).trim());
  }
  if (nickname !== undefined) definir('nickname', nickname);
  if (position !== undefined) definir('position', position);
  if (height !== undefined) definir('height', formatHeight(height));
  if (weight !== undefined) definir('weight', weight);
  // Telefone e e-mail não aparecem nas listagens: em branco aqui quer dizer que a tela
  // não os tinha carregado, e não que o atleta quer apagá-los
  if (phone !== undefined && String(phone).trim() !== '') definir('phone', String(phone).trim());
  if (email !== undefined && String(email).trim() !== '') definir('email', String(email).trim().toLowerCase());
  if (campos.length === 0) return res.json({ success: true });

  try {
    args.push(req.params.id);
    await db.run(`UPDATE users SET ${campos.join(', ')} WHERE id = ?`, args);

    const detalhes = [position && `Posição: ${position}`, nickname && `Apelido: ${nickname}`, username && `Nome: ${username}`]
      .filter(Boolean).join(', ') || 'dados cadastrais';
    auditar(req, 'PERFIL', `Atualizou perfil (${detalhes})`);
    res.json({ success: true, height: height !== undefined ? formatHeight(height) : undefined });
  } catch (err) {
    erroInterno(res, 'atualizar o perfil', err, 'Erro ao atualizar perfil');
  }
});

/**
 * Lê as notas de atributos da planilha de avaliação. Aceita dois formatos:
 * 1) tabela com colunas Nome / PAC / SHO / PAS / DRI / DEF / PHY (ou os nomes em português);
 * 2) respostas do Google Forms ("1. Thiago Silva (Fela) [PAC (Velocidade)]").
 * Notas de 0 a 10 viram 0 a 100. Devolve [{ rawName, normName, pac, sho, ... }].
 */
function lerPlanilhaDeAvaliacao(workbook) {
  const normalize = auth.normalizar;
  const tipoDoAtributo = (s) => {
    if (s.includes('pac') || s.includes('ritmo') || s.includes('velocidade')) return 'pac';
    if (s.includes('sho') || s.includes('chute') || s.includes('finalizacao')) return 'sho';
    if (s.includes('pas') || s.includes('passe')) return 'pas';
    if (s.includes('dri') || s.includes('drible') || s.includes('controle')) return 'dri';
    if (s.includes('def') || s.includes('defesa') || s.includes('marcacao')) return 'def';
    if (s.includes('phy') || s.includes('fisico') || s.includes('resistencia')) return 'phy';
    return null;
  };
  const toScore = (val) => {
    if (val === undefined || val === null || String(val).trim() === '') return null;
    const num = parseFloat(String(val).replace(',', '.'));
    if (isNaN(num) || num <= 0) return null;
    const scaled = num <= 10 ? Math.round(num * 10) : Math.round(num);
    return Math.max(15, Math.min(99, scaled));
  };
  const media = (arr) => (arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  const novoAtleta = (rawName, normName) => ({ rawName, normName, pac: [], sho: [], pas: [], dri: [], def: [], phy: [] });
  const resumir = (mapa) => [...mapa.values()].map(d => ({
    rawName: d.rawName, normName: d.normName,
    pac: media(d.pac), sho: media(d.sho), pas: media(d.pas), dri: media(d.dri), def: media(d.def), phy: media(d.phy)
  }));

  const planilhas = workbook.SheetNames.map(n => XLSX.utils.sheet_to_json(workbook.Sheets[n], { header: 1 }));

  // Formato 1: tabela com cabeçalho nas 10 primeiras linhas
  for (const rows of planilhas) {
    if (!rows || rows.length < 2) continue;
    for (let rIdx = 0; rIdx < Math.min(rows.length, 10); rIdx++) {
      const row = rows[rIdx];
      if (!Array.isArray(row)) continue;
      const cab = Array.from(row, c => (c ? normalize(c) : ''));
      const coluna = (tipo) => cab.findIndex(c => c && tipoDoAtributo(c) === tipo);
      const nameIdx = cab.findIndex(c => c && (c.includes('nome') || c.includes('jogador') || c.includes('atleta')));
      const cols = { pac: coluna('pac'), sho: coluna('sho'), pas: coluna('pas'), dri: coluna('dri'), def: coluna('def'), phy: coluna('phy') };
      if (cols.pac === -1 || cols.sho === -1 || nameIdx === -1) continue;

      const mapa = new Map();
      for (let i = rIdx + 1; i < rows.length; i++) {
        const dataRow = rows[i];
        if (!dataRow || !dataRow[nameIdx]) continue;
        const rawName = dataRow[nameIdx].toString().trim();
        const normName = normalize(rawName);
        if (normName.length < 2) continue;

        const notas = {};
        Object.entries(cols).forEach(([tipo, idx]) => { notas[tipo] = idx !== -1 ? toScore(dataRow[idx]) : null; });
        if (notas.pac === null && notas.sho === null) continue;

        if (!mapa.has(normName)) mapa.set(normName, novoAtleta(rawName, normName));
        const entry = mapa.get(normName);
        Object.entries(notas).forEach(([tipo, n]) => { if (n !== null) entry[tipo].push(n); });
      }
      return resumir(mapa);
    }
  }

  // Formato 2: respostas do Google Forms, uma coluna por atleta e atributo
  for (const rows of planilhas) {
    if (!rows || rows.length < 2) continue;
    const colMap = [];
    Array.from(rows[0] || [], c => (c ? c.toString() : '')).forEach((titulo, cIdx) => {
      const m = titulo.match(/^(?:\d+[.\-\s]*)?([^[-]+)[[-]([^\])]+)/);
      if (!m) return;
      const playerName = m[1].replace(/\([^)]*\)/g, '').trim();
      const statType = tipoDoAtributo(normalize(m[2]));
      if (statType && playerName.length >= 2) colMap.push({ cIdx, normName: normalize(playerName), rawName: playerName, statType });
    });
    if (colMap.length < 6) continue;

    const mapa = new Map();
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      colMap.forEach(({ cIdx, normName, rawName, statType }) => {
        const score = toScore(row[cIdx]);
        if (score === null) return;
        if (!mapa.has(normName)) mapa.set(normName, novoAtleta(rawName, normName));
        mapa.get(normName)[statType].push(score);
      });
    }
    return resumir(mapa);
  }

  return [];
}

// Importa os atributos BASE do elenco a partir da planilha de avaliação (só admin)
app.post('/users/import-ratings-excel', requireAdmin, docUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo de planilha enviado' });

  let parsedStats;
  try {
    parsedStats = lerPlanilhaDeAvaliacao(XLSX.read(req.file.buffer, { type: 'buffer' }));
  } catch (err) {
    console.error('Erro ao ler planilha:', err.message);
    return res.status(400).json({ error: 'Não foi possível ler a planilha enviada.' });
  }
  if (parsedStats.length === 0) {
    return res.status(400).json({ error: 'Não foi possível encontrar colunas de atributos de jogadores (PAC, SHO, PAS, DRI, DEF, PHY ou Velocidade, Finalização...) na planilha enviada.' });
  }

  try {
    const users = await db.all('SELECT id, username, nickname FROM users');
    const norm = auth.normalizar;
    const updated = [];
    const comandos = [];

    for (const stat of parsedStats) {
      // Nome exato ou apelido exato primeiro; só então um nome contido no outro
      const exato = users.find(u => norm(u.username) === stat.normName || String(u.nickname || '').split(',').some(n => norm(n) === stat.normName));
      const parecido = users.filter(u => {
        const uNorm = norm(u.username);
        return uNorm.length >= 3 && (stat.normName.includes(uNorm) || uNorm.includes(stat.normName));
      });
      const matchedUser = exato || (parecido.length === 1 ? parecido[0] : null);
      if (!matchedUser) continue;

      comandos.push({
        sql: `UPDATE users SET pace = COALESCE(?, pace), shooting = COALESCE(?, shooting), passing = COALESCE(?, passing),
              dribbling = COALESCE(?, dribbling), defending = COALESCE(?, defending), physical = COALESCE(?, physical) WHERE id = ?`,
        args: [stat.pac, stat.sho, stat.pas, stat.dri, stat.def, stat.phy, matchedUser.id]
      });
      updated.push({ id: matchedUser.id, name: matchedUser.username, stat });
    }

    if (comandos.length > 0) await db.batch(comandos);
    auditar(req, 'ADMIN', `Importou a planilha de avaliação (${updated.length} atletas)`);
    res.json({ success: true, updatedCount: updated.length, updatedPlayers: updated });
  } catch (err) {
    erroInterno(res, 'importar a planilha', err, 'Erro ao salvar notas no banco de dados.');
  }
});

app.delete('/users/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    // Numa transação e na ordem certa: os registros dependentes saem antes do atleta
    await db.batch([
      { sql: 'DELETE FROM team_players WHERE user_id = ?', args: [id] },
      { sql: 'DELETE FROM goals WHERE user_id = ?', args: [id] },
      { sql: 'DELETE FROM assists WHERE user_id = ?', args: [id] },
      { sql: 'DELETE FROM ratings WHERE rater_id = ? OR rated_id = ?', args: [id, id] },
      { sql: 'DELETE FROM users WHERE id = ?', args: [id] }
    ]);
    auditar(req, 'ADMIN', `Excluiu o atleta ID ${id}`);
    res.json({ success: true, message: 'Jogador excluído com sucesso!' });
  } catch (err) {
    erroInterno(res, 'excluir atleta', err, 'Erro ao excluir atleta.');
  }
});

// Histórico detalhado de partidas e desempenho do atleta
app.get('/users/:id/history', async (req, res) => {
  const userId = req.params.id;
  try {
    const [partidas, gols, assists, notas] = await Promise.all([
      db.all(`
        SELECT m.id as match_id, m.date, m.status, t.name as team_name
        FROM matches m
        JOIN teams t ON t.match_id = m.id
        JOIN team_players tp ON tp.team_id = t.id
        WHERE tp.user_id = ?
        ORDER BY m.date DESC, m.id DESC
      `, [userId]),
      db.all('SELECT match_id, COUNT(*) as n FROM goals WHERE user_id = ? GROUP BY match_id', [userId]),
      db.all('SELECT match_id, COUNT(*) as n FROM assists WHERE user_id = ? GROUP BY match_id', [userId]),
      db.all('SELECT match_id, AVG(score) as media FROM ratings WHERE rated_id = ? GROUP BY match_id', [userId])
    ]);

    const porPartida = (linhas, campo) => Object.fromEntries(linhas.map(l => [l.match_id, l[campo]]));
    const golsMap = porPartida(gols, 'n');
    const assistsMap = porPartida(assists, 'n');
    const notasMap = porPartida(notas, 'media');

    res.json(partidas.map(m => ({
      match_id: m.match_id,
      date: m.date,
      status: m.status,
      team_name: m.team_name,
      goals: golsMap[m.match_id] || 0,
      assists: assistsMap[m.match_id] || 0,
      rating: notasMap[m.match_id] ? Number(notasMap[m.match_id]).toFixed(1) : null
    })));
  } catch (err) {
    erroInterno(res, 'carregar o histórico', err);
  }
});

// ---------------------------------------------------------------------------
// Partidas
// ---------------------------------------------------------------------------

// Nome do time do clube nas partidas contra adversários
const NOME_DO_CLUBE = 'plugshawty FC';

app.post('/matches', requireAdmin, async (req, res) => {
  const { date, time, location, type, opponent } = req.body;
  const matchTime = String(time || '').trim() || '15h';
  const matchLocation = String(location || '').trim() || 'Arena Petrópolis';
  const contraRival = type === 'rival';
  const adversario = String(opponent || '').trim();

  if (!date) return res.status(400).json({ error: 'Informe a data da partida.' });
  if (contraRival && !adversario) {
    return res.status(400).json({ error: 'Informe o nome do time adversário.' });
  }

  try {
    // Contra rival os dois times já nascem prontos, na mesma transação da partida: o
    // nosso, que recebe a escalação, e o adversário, que só serve para o placar.
    const comandos = [{
      sql: 'INSERT INTO matches (date, time, location, type, opponent) VALUES (?, ?, ?, ?, ?)',
      args: [date, matchTime, matchLocation, contraRival ? 'rival' : 'internal', contraRival ? adversario : null]
    }];
    if (contraRival) {
      comandos.push(
        { sql: 'INSERT INTO teams (match_id, name, is_opponent) VALUES ((SELECT MAX(id) FROM matches), ?, 0)', args: [NOME_DO_CLUBE] },
        { sql: 'INSERT INTO teams (match_id, name, is_opponent) VALUES ((SELECT MAX(id) FROM matches), ?, 1)', args: [adversario] }
      );
    }
    const [criada] = await db.batch(comandos);

    auditar(req, 'PARTIDA', contraRival ? `Criou jogo contra ${adversario} em ${date}` : `Criou racha em ${date}`);
    res.json({
      id: criada.lastID, date, time: matchTime, location: matchLocation, status: 'scheduled',
      type: contraRival ? 'rival' : 'internal', opponent: contraRival ? adversario : null
    });
  } catch (err) {
    erroInterno(res, 'criar partida', err, 'Não foi possível criar a partida.');
  }
});

app.put('/matches/:id', requireAdmin, async (req, res) => {
  const { status, date, time, location, opponent } = req.body;
  const fields = [];
  const args = [];
  const novoAdversario = typeof opponent === 'string' ? opponent.trim() : null;

  if (novoAdversario) { fields.push('opponent = ?'); args.push(novoAdversario); }
  if (status !== undefined) {
    if (status !== 'completed' && status !== 'scheduled') return res.status(400).json({ error: 'Status inválido.' });
    fields.push('status = ?');
    args.push(status);
    if (status === 'completed') {
      // Marca o apito final: é daqui que conta o prazo de avaliação.
      // COALESCE preserva o horário original caso já estivesse encerrada.
      fields.push('finished_at = COALESCE(finished_at, ?)');
      args.push(new Date().toISOString());
    } else {
      // Reabrir a partida zera o prazo, que recomeça no próximo encerramento, e
      // descarta a duração que o administrador tinha ajustado
      fields.push('finished_at = NULL', 'rating_deadline = NULL');
    }
  }
  if (date !== undefined) { fields.push('date = ?'); args.push(date); }
  if (time !== undefined) { fields.push('time = ?'); args.push(time); }
  if (location !== undefined) { fields.push('location = ?'); args.push(location); }

  if (fields.length === 0) return res.json({ success: false });

  try {
    const comandos = [{ sql: `UPDATE matches SET ${fields.join(', ')} WHERE id = ?`, args: [...args, req.params.id] }];
    // O nome do adversário também é o nome do time dele no placar
    if (novoAdversario) {
      comandos.push({ sql: 'UPDATE teams SET name = ? WHERE match_id = ? AND is_opponent = 1', args: [novoAdversario, req.params.id] });
    }
    const [r] = await db.batch(comandos);
    if (!r.changes) return res.status(404).json({ error: 'Partida não encontrada' });

    if (status === 'completed') auditar(req, 'PARTIDA', `Encerrou a partida ${req.params.id}`);
    else if (status === 'scheduled') auditar(req, 'PARTIDA', `Reabriu a partida ${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    erroInterno(res, 'atualizar a partida', err, 'Não foi possível atualizar a partida.');
  }
});

app.get('/matches', async (req, res) => {
  try {
    res.json(await db.all('SELECT * FROM matches ORDER BY date DESC, id DESC'));
  } catch (err) {
    erroInterno(res, 'listar partidas', err);
  }
});

app.get('/matches/:id', async (req, res) => {
  const matchId = req.params.id;

  try {
    const [match, quem] = await Promise.all([
      db.get('SELECT * FROM matches WHERE id = ?', [matchId]),
      getRequester(req)
    ]);
    if (!match) return res.status(404).json({ error: 'Partida não encontrada' });

    // As consultas abaixo não dependem umas das outras: em paralelo o custo passa a
    // ser o da consulta mais lenta, e não a soma das idas e voltas até o banco
    const [teamRows, goalRows, assistRows, ratingRows, raterRows, myRatingRows, formas] = await Promise.all([
      db.all(`
        SELECT t.id as team_id, t.name as team_name, t.manual_score, t.is_opponent, u.id as user_id, u.username, u.nickname, u.position,
               u.pace, u.shooting, u.passing, u.dribbling, u.defending, u.physical, ${photoCols('u')}
        FROM teams t
        LEFT JOIN team_players tp ON t.id = tp.team_id
        LEFT JOIN users u ON tp.user_id = u.id
        WHERE t.match_id = ?
      `, [matchId]),

      db.all(`
        SELECT g.id, g.user_id, u.username, u.nickname, tp.team_id
        FROM goals g
        JOIN users u ON g.user_id = u.id
        LEFT JOIN team_players tp ON (tp.user_id = u.id AND tp.team_id IN (SELECT id FROM teams WHERE match_id = ?))
        WHERE g.match_id = ?
        ORDER BY g.id ASC
      `, [matchId, matchId]),

      db.all(`
        SELECT a.id, a.user_id, u.username, u.nickname, tp.team_id
        FROM assists a
        JOIN users u ON a.user_id = u.id
        LEFT JOIN team_players tp ON (tp.user_id = u.id AND tp.team_id IN (SELECT id FROM teams WHERE match_id = ?))
        WHERE a.match_id = ?
        ORDER BY a.id ASC
      `, [matchId, matchId]),

      db.all(`
        SELECT r.rated_id, r.score, u.username, u.nickname
        FROM ratings r
        JOIN users u ON r.rated_id = u.id
        WHERE r.match_id = ?
      `, [matchId]),

      // Quem já avaliou, para a tela mostrar o progresso. Não expomos qual nota
      // cada um deu para ninguém além do próprio avaliador.
      db.all('SELECT DISTINCT rater_id FROM ratings WHERE match_id = ?', [matchId]),

      // As notas que quem está pedindo a partida já registrou
      quem
        ? db.all('SELECT rated_id, score FROM ratings WHERE match_id = ? AND rater_id = ?', [matchId, quem.id])
        : Promise.resolve([]),

      obterFormas()
    ]);

    const teams = {};
    teamRows.forEach(row => {
      if (!teams[row.team_id]) {
        teams[row.team_id] = {
          id: row.team_id,
          name: row.team_name,
          manual_score: row.manual_score,
          is_opponent: Number(row.is_opponent) === 1,
          players: []
        };
      }
      if (row.user_id) {
        teams[row.team_id].players.push(aplicarForma({
          id: row.user_id,
          username: row.username,
          nickname: row.nickname,
          photo: buildPhotoRef(row.user_id, row.photo_head, row.photo_len, row.photo_tail, false),
          original_photo: buildPhotoRef(row.user_id, row.orig_head, row.orig_len, row.orig_tail, true),
          position: row.position,
          pace: row.pace,
          shooting: row.shooting,
          passing: row.passing,
          dribbling: row.dribbling,
          defending: row.defending,
          physical: row.physical
        }, formas));
      }
    });

    // O time do clube sempre primeiro: a tela usa teams[0] como "nós" e teams[1]
    // como o adversário nas partidas contra rival
    match.teams = Object.values(teams).sort((a, b) => (a.is_opponent - b.is_opponent) || (a.id - b.id));
    match.type = match.type || 'internal';
    match.goals = goalRows;
    match.assists = assistRows;
    match.ratings = ratingRows;

    match.teams.forEach(t => {
      t.score = t.manual_score !== null && t.manual_score !== undefined
        ? t.manual_score
        : match.goals.filter(g => g.team_id === t.id).length;
    });

    // Estado da janela de avaliação. O relógio que vale é o do servidor: mandamos
    // server_now junto para o contador da tela não depender da hora do celular.
    const janela = janelaDeAvaliacao(match);
    match.rating_open = janela.aberta;
    match.rating_ends_at = janela.terminaEm;
    match.rating_hours = janela.horas;
    match.server_now = new Date().toISOString();
    match.raters = raterRows.map(r => Number(r.rater_id));
    match.my_ratings = Object.fromEntries(myRatingRows.map(r => [r.rated_id, r.score]));

    res.json(match);
  } catch (err) {
    erroInterno(res, 'carregar a partida', err, 'Erro ao carregar a partida');
  }
});

/** Lista de ids inteiros, sem repetição. */
const idsUnicos = (lista) => [...new Set((Array.isArray(lista) ? lista : []).map(Number).filter(Number.isInteger))];

app.post('/matches/:id/teams', requireOpenMatchOrAdmin, async (req, res) => {
  const matchId = req.params.id;
  const teams = Array.isArray(req.body.teams) ? req.body.teams : [];

  try {
    // Contra rival não existe sorteio: só trocamos quem está escalado no nosso time.
    // Recriar os times apagaria o adversário e o placar que o admin já tivesse lançado.
    if (req.match.type === 'rival') {
      const nosso = await db.get('SELECT id FROM teams WHERE match_id = ? AND is_opponent = 0', [matchId]);
      if (!nosso) return res.status(400).json({ error: 'Time do clube não encontrado nesta partida.' });

      const playerIds = idsUnicos(teams[0] && teams[0].playerIds);
      const comandos = [{ sql: 'DELETE FROM team_players WHERE team_id = ?', args: [nosso.id] }];
      if (playerIds.length > 0) {
        comandos.push({
          sql: `INSERT INTO team_players (team_id, user_id) VALUES ${playerIds.map(() => '(?, ?)').join(', ')}`,
          args: playerIds.flatMap(playerId => [nosso.id, playerId])
        });
      }
      await db.batch(comandos);
      auditar(req, 'PARTIDA', `Escalou ${playerIds.length} atleta(s) na partida ${matchId}`);
      return res.json({ success: true });
    }

    // Um atleta só pode estar em um dos times
    const vistos = new Set();
    const times = teams.map(t => ({
      name: String(t.name || '').trim() || 'TIME',
      playerIds: idsUnicos(t.playerIds).filter(id => !vistos.has(id) && vistos.add(id))
    }));

    // Tudo numa transação: antes, os INSERT dos times novos corriam junto com o
    // DELETE dos antigos e a escalação saía embaralhada
    const comandos = [
      { sql: 'DELETE FROM team_players WHERE team_id IN (SELECT id FROM teams WHERE match_id = ?)', args: [matchId] },
      { sql: 'DELETE FROM teams WHERE match_id = ?', args: [matchId] }
    ];
    times.forEach(time => {
      comandos.push({ sql: 'INSERT INTO teams (match_id, name) VALUES (?, ?)', args: [matchId, time.name] });
      if (time.playerIds.length > 0) {
        comandos.push({
          // O time acabou de ser criado nesta transação: é o maior id da partida
          sql: `INSERT INTO team_players (team_id, user_id) VALUES ${time.playerIds.map(() => '((SELECT MAX(id) FROM teams WHERE match_id = ?), ?)').join(', ')}`,
          args: time.playerIds.flatMap(playerId => [matchId, playerId])
        });
      }
    });
    await db.batch(comandos);

    auditar(req, 'PARTIDA', `Montou os times da partida ${matchId}`);
    res.json({ success: true });
  } catch (err) {
    erroInterno(res, 'salvar os times', err, 'Não foi possível salvar a escalação.');
  }
});

// Placar digitado pelo admin. Vazio (null) volta ao automático: a soma dos gols lançados.
app.put('/matches/:id/team-score', requireAdmin, async (req, res) => {
  const { team_id, score } = req.body;
  const numScore = score === null || score === undefined || score === '' ? null : parseInt(score, 10);
  if (numScore !== null && (isNaN(numScore) || numScore < 0 || numScore > 99)) {
    return res.status(400).json({ error: 'Placar inválido.' });
  }

  try {
    const r = await db.run('UPDATE teams SET manual_score = ? WHERE id = ? AND match_id = ?', [numScore, team_id, req.params.id]);
    if (!r.changes) return res.status(404).json({ error: 'Time não encontrado nesta partida.' });
    res.json({ success: true, score: numScore });
  } catch (err) {
    erroInterno(res, 'salvar o placar', err, 'Não foi possível salvar o placar.');
  }
});

// Número de gols ou assistências de um atleta na partida
app.put('/matches/:id/player-events', requireAdmin, async (req, res) => {
  const matchId = req.params.id;
  const { user_id, type, count } = req.body;
  if (type !== 'goal' && type !== 'assist') {
    return res.status(400).json({ error: 'Tipo de evento inválido (deve ser "goal" ou "assist").' });
  }
  const table = type === 'goal' ? 'goals' : 'assists';
  const targetCount = Math.min(30, Math.max(0, parseInt(count, 10) || 0));

  try {
    // Apagar e regravar na mesma transação: dois envios seguidos do mesmo atleta não
    // conseguem mais se misturar e duplicar os gols
    const comandos = [{ sql: `DELETE FROM ${table} WHERE match_id = ? AND user_id = ?`, args: [matchId, user_id] }];
    if (targetCount > 0) {
      comandos.push({
        sql: `INSERT INTO ${table} (match_id, user_id) VALUES ${Array(targetCount).fill('(?, ?)').join(', ')}`,
        args: Array.from({ length: targetCount }, () => [matchId, user_id]).flat()
      });
    }
    await db.batch(comandos);
    res.json({ success: true, count: targetCount });
  } catch (err) {
    erroInterno(res, `atualizar ${table}`, err, 'Erro ao atualizar eventos.');
  }
});

// -- RATINGS --
// Envio das notas da partida. Cada atleta que entrou em campo avalia todos os
// jogadores (inclusive a si mesmo), e pode reenviar para corrigir enquanto a votação
// estiver aberta.
app.post('/ratings', requireAuth, async (req, res) => {
  try {
    const matchId = req.body.match_id;
    const notas = req.body.ratings || {};
    const avaliador = req.requester;

    const match = await db.get('SELECT id, status, finished_at, rating_deadline FROM matches WHERE id = ?', [matchId]);
    if (!match) return res.status(404).json({ error: 'Partida não encontrada' });

    const janela = janelaDeAvaliacao(match);
    if (!janela.aberta) {
      return res.status(403).json({
        error: match.status === 'completed'
          ? 'A votação desta partida já foi encerrada.'
          : 'A partida ainda não foi encerrada pelo administrador.'
      });
    }

    // Só quem entrou em campo avalia, e só dá nota a quem também jogou
    const escalados = await db.all(
      'SELECT tp.user_id FROM team_players tp JOIN teams t ON tp.team_id = t.id WHERE t.match_id = ?',
      [matchId]
    );
    const jogaram = new Set(escalados.map(r => Number(r.user_id)));

    if (!jogaram.has(Number(avaliador.id))) {
      return res.status(403).json({ error: 'Somente quem jogou esta partida pode avaliar.' });
    }

    const entradas = Object.entries(notas)
      .map(([id, nota]) => [Number(id), Math.round(Number(nota))])
      .filter(([id, nota]) => jogaram.has(id) && nota >= 0 && nota <= 10);

    if (entradas.length === 0) {
      return res.status(400).json({ error: 'Nenhuma nota válida foi enviada.' });
    }

    // Reenviar substitui as notas anteriores deste avaliador, na mesma transação
    await db.batch([
      { sql: 'DELETE FROM ratings WHERE match_id = ? AND rater_id = ?', args: [matchId, avaliador.id] },
      {
        sql: `INSERT INTO ratings (match_id, rater_id, rated_id, score) VALUES ${entradas.map(() => '(?, ?, ?, ?)').join(', ')}`,
        args: entradas.flatMap(([ratedId, nota]) => [matchId, avaliador.id, ratedId, nota])
      }
    ]);

    auditar(req, 'AVALIAÇÃO', `Avaliou ${entradas.length} atleta(s) na partida ${matchId}`);
    res.json({ success: true, saved: entradas.length, rating_ends_at: janela.terminaEm });
  } catch (err) {
    erroInterno(res, 'gravar as avaliações', err, 'Erro ao gravar as avaliações');
  }
});

// O administrador pode finalizar a votação antes do prazo ({ action: 'close' }) ou
// mudar quanto tempo ela dura ({ hours }). A duração conta sempre do apito final,
// então aumentá-la depois que a votação fechou abre a votação de novo.
app.put('/matches/:id/rating-window', requireAdmin, async (req, res) => {
  try {
    const match = await db.get('SELECT id, status, finished_at, rating_deadline FROM matches WHERE id = ?', [req.params.id]);
    if (!match) return res.status(404).json({ error: 'Partida não encontrada' });
    if (match.status !== 'completed' || !match.finished_at) {
      return res.status(400).json({ error: 'Encerre a partida antes de mexer na votação.' });
    }

    let prazo;
    let descricao;
    if (req.body.action === 'close') {
      prazo = new Date();
      descricao = `Finalizou a votação da partida ${match.id}`;
    } else {
      const horas = Number(req.body.hours);
      if (!Number.isFinite(horas) || horas < 1 || horas > DURACAO_MAXIMA_DA_AVALIACAO) {
        return res.status(400).json({ error: `Informe uma duração entre 1 e ${DURACAO_MAXIMA_DA_AVALIACAO} horas.` });
      }
      prazo = new Date(new Date(match.finished_at).getTime() + horas * 60 * 60 * 1000);
      descricao = `Mudou a duração da votação da partida ${match.id} para ${horas}h`;
    }

    await db.run('UPDATE matches SET rating_deadline = ? WHERE id = ?', [prazo.toISOString(), match.id]);
    auditar(req, 'AVALIAÇÃO', descricao);

    const janela = janelaDeAvaliacao({ ...match, rating_deadline: prazo.toISOString() });
    res.json({ success: true, rating_open: janela.aberta, rating_ends_at: janela.terminaEm, rating_hours: janela.horas });
  } catch (err) {
    erroInterno(res, 'ajustar a votação', err, 'Não foi possível ajustar a votação.');
  }
});

// Excluir um gol ou uma assistência específica
['goals', 'assists'].forEach(tabela => {
  app.delete(`/${tabela}/:id`, requireAdmin, async (req, res) => {
    try {
      const r = await db.run(`DELETE FROM ${tabela} WHERE id = ?`, [req.params.id]);
      if (!r.changes) return res.status(404).json({ error: 'Registro não encontrado.' });
      res.json({ success: true });
    } catch (err) {
      erroInterno(res, `excluir de ${tabela}`, err, 'Não foi possível excluir.');
    }
  });
});

// Excluir a partida e tudo que depende dela
app.delete('/matches/:id', requireAdmin, async (req, res) => {
  const matchId = req.params.id;
  try {
    // Numa transação e na ordem certa: o Turso valida chaves estrangeiras, então os
    // registros filhos precisam sair antes da partida
    const resultados = await db.batch([
      { sql: 'DELETE FROM ratings WHERE match_id = ?', args: [matchId] },
      { sql: 'DELETE FROM goals WHERE match_id = ?', args: [matchId] },
      { sql: 'DELETE FROM assists WHERE match_id = ?', args: [matchId] },
      { sql: 'DELETE FROM team_players WHERE team_id IN (SELECT id FROM teams WHERE match_id = ?)', args: [matchId] },
      { sql: 'DELETE FROM teams WHERE match_id = ?', args: [matchId] },
      { sql: 'DELETE FROM matches WHERE id = ?', args: [matchId] }
    ]);
    if (!resultados[resultados.length - 1].changes) return res.status(404).json({ error: 'Partida não encontrada' });

    auditar(req, 'PARTIDA', `Excluiu a partida ${matchId}`);
    res.json({ success: true });
  } catch (err) {
    erroInterno(res, 'excluir partida', err, 'Não foi possível excluir a partida.');
  }
});

/** Times da partida que recebem jogadores (o adversário de um jogo rival fica de fora). */
const timesComJogadores = (matchId) =>
  db.all('SELECT id FROM teams WHERE match_id = ? AND COALESCE(is_opponent, 0) = 0 ORDER BY id', [matchId]);

/** Em qual time da partida o atleta está, ou undefined. */
const timeDoAtleta = (matchId, userId) =>
  db.get('SELECT tp.team_id FROM team_players tp JOIN teams t ON tp.team_id = t.id WHERE t.match_id = ? AND tp.user_id = ?', [matchId, userId]);

// Trocar o atleta de time (COM COLETE <-> SEM COLETE). Não existe em jogo contra rival.
app.put('/matches/:id/switch-team', requireOpenMatchOrAdmin, async (req, res) => {
  const matchId = req.params.id;
  const userId = Number(req.body.user_id);
  if (req.match.type === 'rival') {
    return res.status(400).json({ error: 'Em jogo contra rival não há troca de time.' });
  }

  try {
    const times = await timesComJogadores(matchId);
    if (times.length !== 2) return res.status(400).json({ error: 'A partida precisa ter exatamente 2 times.' });

    const atual = await timeDoAtleta(matchId, userId);
    if (!atual) return res.status(404).json({ error: 'Jogador não encontrado na partida' });

    const newTeamId = atual.team_id === times[0].id ? times[1].id : times[0].id;
    await db.run('UPDATE team_players SET team_id = ? WHERE user_id = ? AND team_id = ?', [newTeamId, userId, atual.team_id]);
    res.json({ success: true, newTeamId });
  } catch (err) {
    erroInterno(res, 'trocar de time', err, 'Não foi possível trocar o atleta de time.');
  }
});

// Substituir um atleta da partida por outro do elenco que ainda não está nela
app.put('/matches/:id/replace-player', requireOpenMatchOrAdmin, async (req, res) => {
  const matchId = req.params.id;
  const oldUserId = Number(req.body.old_user_id);
  const newUserId = Number(req.body.new_user_id);

  try {
    const [saindo, entrando, existe] = await Promise.all([
      timeDoAtleta(matchId, oldUserId),
      timeDoAtleta(matchId, newUserId),
      db.get('SELECT id FROM users WHERE id = ?', [newUserId])
    ]);
    if (!saindo) return res.status(404).json({ error: 'O atleta substituído não está na partida.' });
    if (!existe) return res.status(404).json({ error: 'Atleta não encontrado.' });
    if (entrando) return res.status(400).json({ error: 'Esse atleta já está na partida.' });

    await db.run('UPDATE team_players SET user_id = ? WHERE user_id = ? AND team_id = ?', [newUserId, oldUserId, saindo.team_id]);
    res.json({ success: true });
  } catch (err) {
    erroInterno(res, 'substituir atleta', err, 'Não foi possível substituir o atleta.');
  }
});

// Colocar mais um atleta em um time da partida
app.put('/matches/:id/add-player', requireOpenMatchOrAdmin, async (req, res) => {
  const matchId = req.params.id;
  const userId = Number(req.body.user_id);
  const teamId = Number(req.body.team_id);
  if (!userId || !teamId) return res.status(400).json({ error: 'Usuário e Time são obrigatórios' });

  try {
    const times = await timesComJogadores(matchId);
    // O time precisa ser desta partida, e nunca o adversário
    if (!times.some(t => t.id === teamId)) return res.status(400).json({ error: 'Time inválido para esta partida.' });
    if (await timeDoAtleta(matchId, userId)) return res.status(400).json({ error: 'O jogador já está nesta partida' });

    await db.run('INSERT INTO team_players (team_id, user_id) VALUES (?, ?)', [teamId, userId]);
    res.json({ success: true, team_id: teamId, user_id: userId });
  } catch (err) {
    erroInterno(res, 'adicionar atleta', err, 'Não foi possível adicionar o atleta.');
  }
});

// Tira um atleta da partida. Junto saem os gols, as assistências e as notas dele
// nesta partida: quem não jogou não pontua no ranking nem avalia os outros.
app.delete('/matches/:id/players/:userId', requireOpenMatchOrAdmin, async (req, res) => {
  const matchId = req.params.id;
  const userId = req.params.userId;

  try {
    if (!(await timeDoAtleta(matchId, userId))) return res.status(404).json({ error: 'Este atleta não está na partida.' });

    // Gols e assistências são exclusivos do administrador: tirar alguém que já tem
    // lances lançados apagaria esses números, então isso fica só com ele
    if (!isAdminUser(req.requester)) {
      const lances = await db.get(
        `SELECT (SELECT COUNT(*) FROM goals WHERE match_id = ? AND user_id = ?) +
                (SELECT COUNT(*) FROM assists WHERE match_id = ? AND user_id = ?) AS n`,
        [matchId, userId, matchId, userId]
      );
      if (lances && Number(lances.n) > 0) {
        return res.status(403).json({ error: 'Este atleta já tem gols ou assistências lançados: só o administrador pode tirá-lo da partida.' });
      }
    }

    await db.batch([
      { sql: 'DELETE FROM ratings WHERE match_id = ? AND (rater_id = ? OR rated_id = ?)', args: [matchId, userId, userId] },
      { sql: 'DELETE FROM goals WHERE match_id = ? AND user_id = ?', args: [matchId, userId] },
      { sql: 'DELETE FROM assists WHERE match_id = ? AND user_id = ?', args: [matchId, userId] },
      { sql: 'DELETE FROM team_players WHERE user_id = ? AND team_id IN (SELECT id FROM teams WHERE match_id = ?)', args: [userId, matchId] }
    ]);

    auditar(req, 'PARTIDA', `Tirou o atleta ID ${userId} da partida ${matchId}`);
    res.json({ success: true });
  } catch (err) {
    erroInterno(res, 'tirar atleta da partida', err, 'Não foi possível tirar o atleta da partida.');
  }
});

// ---------------------------------------------------------------------------
// Ranking e estatísticas
// ---------------------------------------------------------------------------
app.get('/stats', async (req, res) => {
  const { month, year } = req.query;

  // Filtro de período aplicado sobre as partidas encerradas
  let dateFilter = '';
  const dateArgs = [];
  if (year && month) {
    dateFilter = ' AND m.date LIKE ?';
    dateArgs.push(`${year}-${String(month).padStart(2, '0')}%`);
  } else if (year) {
    dateFilter = ' AND m.date LIKE ?';
    dateArgs.push(`${year}-%`);
  }

  try {
    // Consultas independentes: rodam juntas em vez de encadeadas
    const [users, goalsRows, assistsRows, ratingsRows, matchDetails, formas, periodo] = await Promise.all([
      db.all(`SELECT ${USER_COLS}, ${HAS_PIN_COL}, ${photoCols()} FROM users`),

      db.all(`SELECT g.user_id, COUNT(*) as cnt FROM goals g JOIN matches m ON g.match_id = m.id
              WHERE m.status = 'completed'${dateFilter} GROUP BY g.user_id`, dateArgs),

      db.all(`SELECT a.user_id, COUNT(*) as cnt FROM assists a JOIN matches m ON a.match_id = m.id
              WHERE m.status = 'completed'${dateFilter} GROUP BY a.user_id`, dateArgs),

      // Média de cada atleta em cada partida: a nota do ranking é a média dessas médias,
      // e não de todos os votos juntos (senão a partida com mais votantes pesava mais)
      db.all(`SELECT r.rated_id, r.match_id, AVG(r.score) as media FROM ratings r JOIN matches m ON r.match_id = m.id
              WHERE m.status = 'completed'${dateFilter} GROUP BY r.rated_id, r.match_id`, dateArgs),

      // Detalhe por partida, necessário para calcular sequência e forma recente.
      // O placar de cada time segue a mesma regra da tela da partida: o digitado pelo
      // admin ou, se ele não digitou, a soma dos gols lançados para os atletas daquele
      // time.
      db.all(`
        WITH placar_time AS (
          SELECT t.id AS team_id,
                 COALESCE(t.manual_score, (
                   SELECT COUNT(*) FROM goals g
                   JOIN team_players tpg ON tpg.user_id = g.user_id AND tpg.team_id = t.id
                   WHERE g.match_id = t.match_id
                 )) AS gols
          FROM teams t
        )
        SELECT tp.user_id, m.id as match_id, m.date,
          po.gols as own_score,
          pa.gols as opp_score
        FROM team_players tp
        JOIN teams t_own ON tp.team_id = t_own.id
        JOIN matches m ON t_own.match_id = m.id
        JOIN placar_time po ON po.team_id = t_own.id
        LEFT JOIN teams t_opp ON t_opp.match_id = m.id AND t_opp.id != t_own.id
        LEFT JOIN placar_time pa ON pa.team_id = t_opp.id
        WHERE m.status = 'completed'${dateFilter}
        ORDER BY m.date DESC, m.id DESC
      `, dateArgs),

      // A evolução da carta usa sempre o histórico completo, mesmo quando o ranking
      // está filtrado por mês: o OVR é do atleta, não do período
      obterFormas(),

      // Partidas encerradas no período: base do mínimo de jogos para concorrer a prêmio
      db.get(`SELECT COUNT(*) AS n FROM matches m WHERE m.status = 'completed'${dateFilter}`, dateArgs)
    ]);

    const porAtleta = (linhas, chave, valor) => Object.fromEntries(linhas.map(r => [r[chave], r[valor]]));
    const goalsMap = porAtleta(goalsRows, 'user_id', 'cnt');
    const assistsMap = porAtleta(assistsRows, 'user_id', 'cnt');
    const { porAtleta: notas } = notasDoPeriodo(ratingsRows);
    const partidasNoPeriodo = Number(periodo && periodo.n) || 0;
    const minimoPremio = minimoParaPremio(partidasNoPeriodo);

    const userMatchMap = {};
    matchDetails.forEach(row => {
      if (!userMatchMap[row.user_id]) userMatchMap[row.user_id] = [];
      userMatchMap[row.user_id].push(row);
    });

    res.json(users.map(user => {
      const userMatches = userMatchMap[user.id] || [];
      let wins = 0, draws = 0, losses = 0;
      const formList = userMatches.map(um => {
        const ownScore = um.own_score ?? 0;
        const oppScore = um.opp_score ?? 0;
        if (ownScore > oppScore) { wins++; return 'V'; }
        if (ownScore < oppScore) { losses++; return 'D'; }
        draws++;
        return 'E';
      });

      let winStreak = 0;
      for (const r of formList) {
        if (r !== 'V') break;
        winStreak++;
      }

      const matchesCount = userMatches.length;
      const nota = notas.get(Number(user.id));
      return {
        ...aplicarForma(withPhotoUrls(user), formas),
        goals: goalsMap[user.id] || 0,
        assists: assistsMap[user.id] || 0,
        avg_rating: nota ? Math.round(nota.media * 100) / 100 : 0,
        // Nota do ranking: puxada para a média do grupo quando há poucas partidas avaliadas
        nota_ajustada: nota ? Math.round(nota.ajustada * 100) / 100 : null,
        rated_matches: nota ? nota.avaliadas : 0,
        // Concorre a MVP/Craque/Xerife quem jogou pelo menos metade das partidas do período
        elegivel_premio: matchesCount >= minimoPremio,
        minimo_para_premio: minimoPremio,
        partidas_no_periodo: partidasNoPeriodo,
        matches_count: matchesCount,
        wins,
        draws,
        losses,
        win_rate: matchesCount > 0 ? Math.round((wins / matchesCount) * 100) : 0,
        recent_form: formList.slice(0, 5),
        win_streak: winStreak
      };
    }));
  } catch (err) {
    erroInterno(res, 'calcular estatísticas', err, 'Erro ao calcular estatísticas');
  }
});

// Tratamento de erros de upload e de requisição
app.use((err, req, res, next) => {
  if (!err) return next();
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'O arquivo enviado excede o limite permitido (4MB para fotos, 15MB para planilhas).' });
    }
    return res.status(400).json({ error: `Erro no upload: ${err.message}` });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Requisição inválida.' });
  }
  // Erros lançados pelos filtros de upload têm mensagem pensada para o usuário
  if (err.message && /permitid/.test(err.message)) return res.status(400).json({ error: err.message });
  erroInterno(res, 'processar a requisição', err, 'Erro inesperado na requisição.');
});

// Fallback SPA para Express 5: qualquer rota não tratada pelas APIs envia o index.html
if (fs.existsSync(frontendDist)) {
  app.use((req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Só começa a atender depois que o banco está no formato esperado
const PORT = process.env.PORT || 3001;
runMigrations()
  .catch(err => console.error('⚠️  Falha nas migrações:', err.message))
  .finally(() => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor rodando na porta ${PORT} (http://localhost:${PORT})`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`⚠️  A porta ${PORT} já está em uso. Feche o outro servidor (npx kill-port ${PORT}) e rode de novo.`);
      } else {
        console.error('Erro no servidor backend:', err);
      }
      process.exit(1);
    });
  });

// Erro não tratado deixa o processo num estado desconhecido: registra e encerra, e o
// Render sobe o servidor de novo
process.on('uncaughtException', (err) => {
  console.error('Erro não capturado (uncaughtException):', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Rejeição não tratada (unhandledRejection):', reason);
});
