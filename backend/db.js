const path = require('path');
const { createClient } = require('@libsql/client');

// Credenciais SEMPRE por variável de ambiente (no Render: Environment; local: backend/.env).
// Nunca escreva o token aqui: o repositório é público.
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

// No Render o banco na nuvem é obrigatório. Cair num arquivo local lá daria a
// impressão de que os dados sumiram (o disco do Render é apagado a cada deploy).
if (!TURSO_URL && process.env.RENDER) {
  console.error('❌ TURSO_DATABASE_URL e TURSO_AUTH_TOKEN não configurados no Render (Environment).');
  process.exit(1);
}

// Sem Turso configurado, o desenvolvimento local usa um arquivo SQLite com o mesmo
// cliente libSQL, então o código é igual nos dois ambientes.
const url = TURSO_URL || `file:${path.resolve(__dirname, 'database.sqlite')}`;
console.log(TURSO_URL ? `⚡ Banco Turso na nuvem: ${TURSO_URL}` : `📁 Banco local: ${url}`);

const client = createClient(TURSO_URL ? { url, authToken: TURSO_TOKEN } : { url });

const linhas = (res) => res.rows.map(r => ({ ...r }));

/** Todas as linhas da consulta. */
async function all(sql, args = []) {
  return linhas(await client.execute({ sql, args }));
}

/** Primeira linha da consulta, ou undefined. */
async function get(sql, args = []) {
  const res = await client.execute({ sql, args });
  return res.rows[0] ? { ...res.rows[0] } : undefined;
}

/** Executa um comando. Devolve { lastID, changes }. */
async function run(sql, args = []) {
  const res = await client.execute({ sql, args });
  return {
    lastID: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
    changes: res.rowsAffected || 0
  };
}

/**
 * Executa vários comandos numa transação: ou todos entram, ou nenhum.
 * Recebe [{ sql, args }] e devolve os resultados na mesma ordem.
 */
async function batch(comandos) {
  const res = await client.batch(comandos.map(c => ({ sql: c.sql, args: c.args || [] })), 'write');
  return res.map(r => ({
    lastID: r.lastInsertRowid !== undefined ? Number(r.lastInsertRowid) : 0,
    changes: r.rowsAffected || 0,
    rows: linhas(r)
  }));
}

module.exports = { all, get, run, batch };
