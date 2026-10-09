/**
 * Identidade de quem usa o app.
 *
 * O login devolve um token assinado pelo servidor (HMAC-SHA256) que o app manda em
 * todo pedido no cabeçalho "Authorization: Bearer <token>". Sem a assinatura válida
 * ninguém consegue se passar por outro atleta, ao contrário do antigo x-user-id,
 * que qualquer um podia trocar no navegador.
 *
 * O token carrega uma "versão do PIN": quando o PIN é criado, trocado ou resetado,
 * todos os tokens antigos daquele atleta deixam de valer.
 */
const crypto = require('crypto');

const VALIDADE_DO_TOKEN_DIAS = 180;
const TENTATIVAS_DE_PIN = 5;
const BLOQUEIO_DE_PIN_MINUTOS = 15;

function resolverSegredo() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  // Sem AUTH_SECRET, deriva do token do banco, que já é secreto. Trocar o token do
  // Turso desconecta todo mundo, o que é o comportamento certo depois de um vazamento.
  if (process.env.TURSO_AUTH_TOKEN) {
    return crypto.createHash('sha256').update(`plugshawty-auth:${process.env.TURSO_AUTH_TOKEN}`).digest('hex');
  }
  console.warn('⚠️  AUTH_SECRET não definido: usando um segredo de desenvolvimento.');
  return 'segredo-de-desenvolvimento-plugshawty';
}

const SEGREDO = resolverSegredo();

const assinar = (texto) => crypto.createHmac('sha256', SEGREDO).update(texto).digest('base64url');

/** Muda sempre que o PIN guardado muda (inclusive de "sem PIN" para "com PIN"). */
function versaoDoPin(pinGuardado) {
  return crypto.createHash('sha256').update(String(pinGuardado || '')).digest('base64url').slice(0, 12);
}

/** Token de sessão para o atleta. Recebe a linha de users com a coluna pin. */
function criarToken(atleta, agora = Date.now()) {
  const dados = {
    uid: Number(atleta.id),
    pv: versaoDoPin(atleta.pin),
    exp: agora + VALIDADE_DO_TOKEN_DIAS * 24 * 60 * 60 * 1000
  };
  const corpo = Buffer.from(JSON.stringify(dados)).toString('base64url');
  return `${corpo}.${assinar(corpo)}`;
}

/** Devolve { uid, pv } se o token é autêntico e não venceu; senão null. */
function lerToken(token, agora = Date.now()) {
  if (typeof token !== 'string') return null;
  const [corpo, assinatura] = token.split('.');
  if (!corpo || !assinatura) return null;

  const esperada = Buffer.from(assinar(corpo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) return null;

  try {
    const dados = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    if (!dados || !Number.isInteger(dados.uid) || typeof dados.pv !== 'string') return null;
    if (!(dados.exp > agora)) return null;
    return { uid: dados.uid, pv: dados.pv };
  } catch {
    return null;
  }
}

/** Extrai o token do cabeçalho Authorization. */
function tokenDaRequisicao(req) {
  const cabecalho = req.headers.authorization || '';
  return cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : null;
}

// ---------------------------------------------------------------------------
// PIN
// ---------------------------------------------------------------------------

/** PIN novo precisa ter exatamente 4 dígitos. */
const pinValido = (pin) => /^\d{4}$/.test(String(pin ?? ''));

/** Guarda o PIN com scrypt e sal aleatório, nunca em texto puro. */
function hashPin(pin) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pin), sal, 32);
  return `scrypt$${sal.toString('base64url')}$${hash.toString('base64url')}`;
}

const pinEstaComHash = (guardado) => typeof guardado === 'string' && guardado.startsWith('scrypt$');

/** Confere o PIN digitado. Aceita PINs antigos em texto puro até serem convertidos. */
function conferePin(pin, guardado) {
  if (!guardado || pin === undefined || pin === null) return false;
  const digitado = String(pin).trim();

  if (!pinEstaComHash(guardado)) {
    const a = Buffer.from(digitado);
    const b = Buffer.from(String(guardado).trim());
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  const [, sal, hash] = guardado.split('$');
  const esperado = Buffer.from(hash, 'base64url');
  const calculado = crypto.scryptSync(digitado, Buffer.from(sal, 'base64url'), esperado.length);
  return crypto.timingSafeEqual(esperado, calculado);
}

// Tentativas erradas por atleta. Fica em memória: reiniciar o servidor zera, o que é
// aceitável para um PIN de 4 dígitos com bloqueio de 15 minutos a cada 5 erros.
const tentativas = new Map();

function pinBloqueado(userId, agora = Date.now()) {
  const t = tentativas.get(Number(userId));
  return !!(t && t.bloqueadoAte > agora);
}

/** Registra um erro de PIN. Devolve true se o atleta acabou de ser bloqueado. */
function registrarErroDePin(userId, agora = Date.now()) {
  const id = Number(userId);
  const t = tentativas.get(id) || { erros: 0, bloqueadoAte: 0 };
  t.erros += 1;
  if (t.erros >= TENTATIVAS_DE_PIN) {
    t.erros = 0;
    t.bloqueadoAte = agora + BLOQUEIO_DE_PIN_MINUTOS * 60 * 1000;
    tentativas.set(id, t);
    return true;
  }
  tentativas.set(id, t);
  return false;
}

const limparErrosDePin = (userId) => tentativas.delete(Number(userId));

// ---------------------------------------------------------------------------
// Login: quem é o atleta digitado
// ---------------------------------------------------------------------------

const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const digitos = (s) => String(s || '').replace(/\D/g, '');

/**
 * Atletas que correspondem EXATAMENTE ao que foi digitado no login: nome de usuário,
 * e-mail, celular (com ou sem DDI) ou um dos apelidos. Antes o apelido casava por
 * pedaço do texto e o primeiro resultado entrava, às vezes na conta errada.
 */
function encontrarAtletas(termo, atletas) {
  const t = normalizar(termo);
  const tel = digitos(termo);
  if (!t) return [];

  return atletas.filter(a => {
    if (normalizar(a.username) === t) return true;
    if (a.email && normalizar(a.email) === t) return true;
    if (tel.length >= 8 && a.phone) {
      const deles = digitos(a.phone);
      if (deles === tel) return true;
      // "54999998888" e "+55 54 99999-8888" são o mesmo número
      const [curto, longo] = deles.length < tel.length ? [deles, tel] : [tel, deles];
      if (curto.length >= 10 && longo.endsWith(curto)) return true;
    }
    return String(a.nickname || '').split(',').some(n => normalizar(n) && normalizar(n) === t);
  });
}

module.exports = {
  criarToken,
  lerToken,
  tokenDaRequisicao,
  versaoDoPin,
  pinValido,
  hashPin,
  pinEstaComHash,
  conferePin,
  pinBloqueado,
  registrarErroDePin,
  limparErrosDePin,
  encontrarAtletas,
  normalizar
};
