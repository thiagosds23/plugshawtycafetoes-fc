/**
 * Estrutura do banco e migrações. Roda a cada boot.
 *
 * As tabelas são criadas com "IF NOT EXISTS", então num banco que já existe (o do
 * Turso) nada muda, e num banco vazio (desenvolvimento local) o app sobe completo.
 * Colunas que surgiram depois entram por ALTER TABLE, que ignora "coluna já existe".
 */
const db = require('./db');
const { hashPin, pinEstaComHash } = require('./auth');

const TABELAS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    nickname TEXT,
    position TEXT DEFAULT 'MEI',
    height TEXT,
    weight TEXT,
    pace INTEGER DEFAULT 50,
    shooting INTEGER DEFAULT 50,
    passing INTEGER DEFAULT 50,
    dribbling INTEGER DEFAULT 50,
    defending INTEGER DEFAULT 50,
    physical INTEGER DEFAULT 50,
    photo TEXT,
    original_photo TEXT,
    pin TEXT,
    pin_prompted INTEGER DEFAULT 0,
    is_admin INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT,
    location TEXT,
    status TEXT DEFAULT 'scheduled',
    finished_at TEXT,
    type TEXT DEFAULT 'internal',
    opponent TEXT,
    rating_deadline TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id),
    name TEXT,
    manual_score INTEGER,
    is_opponent INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS team_players (
    team_id INTEGER NOT NULL REFERENCES teams(id),
    user_id INTEGER NOT NULL REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER REFERENCES matches(id),
    user_id INTEGER REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS assists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER REFERENCES matches(id),
    user_id INTEGER REFERENCES users(id)
  )`,
  `CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER REFERENCES matches(id),
    rater_id INTEGER REFERENCES users(id),
    rated_id INTEGER REFERENCES users(id),
    score INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT,
    details TEXT,
    created_at TEXT
  )`,
  // Migrações de DADOS já aplicadas (ver aplicarUmaVez)
  'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT)'
];

// Colunas que surgiram depois da criação das tabelas no banco de produção
const COLUNAS = [
  // Momento em que a partida foi encerrada: é daqui que conta o prazo de avaliação
  'ALTER TABLE matches ADD COLUMN finished_at TEXT',
  // Administrador de verdade, em vez de deduzir pelo nome do usuário
  'ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0',
  // Tipo da partida: 'internal' (racha entre o próprio elenco) ou 'rival' (contra outro time)
  "ALTER TABLE matches ADD COLUMN type TEXT DEFAULT 'internal'",
  // Nome do adversário, só nas partidas contra rival
  'ALTER TABLE matches ADD COLUMN opponent TEXT',
  // O adversário vira um time sem jogadores. Assim placar, vitórias e derrotas do
  // ranking funcionam igual ao racha, sem lógica paralela.
  'ALTER TABLE teams ADD COLUMN is_opponent INTEGER DEFAULT 0',
  // Prazo da votação definido pelo administrador (finalizar antes ou mudar a
  // duração). Vazio, vale o padrão de 12 horas depois do encerramento.
  'ALTER TABLE matches ADD COLUMN rating_deadline TEXT'
];

const INDICES = [
  // Cada atleta dá no máximo uma nota por companheiro em cada partida
  'CREATE UNIQUE INDEX IF NOT EXISTS ux_ratings_unicas ON ratings (match_id, rater_id, rated_id)',
  // Um atleta aparece uma única vez em cada time (impede duplicata por clique duplo)
  'CREATE UNIQUE INDEX IF NOT EXISTS ux_team_players ON team_players (team_id, user_id)',
  // Índices de alta performance para acelerar ranking, histórico e listagens
  'CREATE INDEX IF NOT EXISTS idx_team_players_team ON team_players (team_id)',
  'CREATE INDEX IF NOT EXISTS idx_team_players_user ON team_players (user_id)',
  'CREATE INDEX IF NOT EXISTS idx_goals_match_user ON goals (match_id, user_id)',
  'CREATE INDEX IF NOT EXISTS idx_assists_match_user ON assists (match_id, user_id)',
  'CREATE INDEX IF NOT EXISTS idx_ratings_match_rater ON ratings (match_id, rater_id)',
  'CREATE INDEX IF NOT EXISTS idx_matches_date_status ON matches (date, status)',
  'CREATE INDEX IF NOT EXISTS idx_teams_match ON teams (match_id)'
];

/**
 * Executa uma migração de dados no máximo uma vez na vida do banco.
 *
 * O marcador é gravado ANTES do trabalho: se outra instância do servidor subir ao
 * mesmo tempo, a chave primária rejeita a segunda e o dado não é convertido duas
 * vezes — o que, no caso das notas, dobraria valores já dobrados.
 */
async function aplicarUmaVez(nome, executar) {
  try {
    await db.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', [nome, new Date().toISOString()]);
  } catch {
    return false; // já aplicada anteriormente
  }

  try {
    await executar();
    return true;
  } catch (err) {
    // Desfaz o marcador para a migração poder ser tentada de novo no próximo boot
    await db.run('DELETE FROM schema_migrations WHERE name = ?', [nome]).catch(() => {});
    console.error(`⚠️  Migração "${nome}" falhou:`, err.message);
    return false;
  }
}

async function tentar(sql) {
  try {
    await db.run(sql);
  } catch (err) {
    if (!/duplicate column|already exists/i.test(err.message || '')) {
      console.error('⚠️  Migração falhou:', sql.slice(0, 80), '->', err.message);
    }
  }
}

async function runMigrations() {
  for (const sql of TABELAS) await tentar(sql);
  for (const sql of COLUNAS) await tentar(sql);

  // Converte as notas antigas, dadas em estrelas de 1 a 5, para a escala de 0 a 10.
  // Uma nota 4 vira 8, mantendo a proporção. Num banco novo não há notas, e a
  // migração só fica registrada.
  await aplicarUmaVez('notas_escala_0_a_10', async () => {
    const r = await db.run('UPDATE ratings SET score = score * 2');
    console.log(`⭐ ${r.changes} nota(s) convertidas de 0-5 para 0-10`);
  });

  // Antes do índice único: remove escalações repetidas que um clique duplo possa ter criado
  await aplicarUmaVez('team_players_sem_duplicata', async () => {
    const r = await db.run('DELETE FROM team_players WHERE rowid NOT IN (SELECT MIN(rowid) FROM team_players GROUP BY team_id, user_id)');
    if (r.changes) console.log(`🧹 ${r.changes} escalação(ões) repetida(s) removida(s)`);
  });

  for (const sql of INDICES) await tentar(sql);

  // Os PINs eram guardados em texto puro. Converte todos para hash uma única vez;
  // o login também aceita o formato antigo, caso algum escape.
  await aplicarUmaVez('pins_com_hash', async () => {
    const comPin = await db.all("SELECT id, pin FROM users WHERE pin IS NOT NULL AND pin != ''");
    const aConverter = comPin.filter(u => !pinEstaComHash(u.pin));
    if (aConverter.length === 0) return;
    await db.batch(aConverter.map(u => ({ sql: 'UPDATE users SET pin = ? WHERE id = ?', args: [hashPin(String(u.pin).trim()), u.id] })));
    console.log(`🔐 ${aConverter.length} PIN(s) convertidos para hash`);
  });

  // Quem escolheu "entrar sem PIN" antes do login novo nunca mais veria a pergunta.
  // Agora que o PIN é a única proteção da conta, o app pergunta de novo, uma única vez,
  // a todos que ainda não têm PIN (continua dando para pular).
  await aplicarUmaVez('perguntar_pin_de_novo', async () => {
    const r = await db.run("UPDATE users SET pin_prompted = 0 WHERE pin IS NULL OR pin = ''");
    if (r.changes) console.log(`🔑 ${r.changes} atleta(s) sem PIN vão ver a sugestão de PIN de novo`);
  });

  // Limpa registros órfãos de gols e assistências nulos caso tenham ocorrido
  await db.run('DELETE FROM goals WHERE match_id IS NULL OR user_id IS NULL').catch(() => {});
  await db.run('DELETE FROM assists WHERE match_id IS NULL OR user_id IS NULL').catch(() => {});
}

module.exports = { runMigrations };
