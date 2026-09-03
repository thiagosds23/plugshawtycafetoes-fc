const { createClient } = require('@libsql/client');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const TURSO_URL = process.env.TURSO_DATABASE_URL || 'libsql://futebol-thiagosds23.aws-us-east-1.turso.io';
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODg0NDQ0MzUsImlkIjoiMDFhMDY3OTYtY2MwMS03NGE4LWE2NWEtNDYzZTY3OTJlN2I4Iiwia2lkIjoiYmdIeGpkOUlnUEk2bVVEYjBORlNzSGtiXzNMWlRQZWlCZlR5cnVGc1FQOCIsInJpZCI6ImRhZGVlMzQ4LWVkNjgtNGIzNy05MTAzLTJmMjU5YTZmZDQ4MSJ9.hcPstpnIAQiUe4yL78PBloIT1PPLVCNtBTGXoEbOVMZzU9AFfjwyO9734PpizyU7B4vR-7gXAA6s6rU0wlt-BQ';

let db;

if (TURSO_URL && TURSO_TOKEN) {
  console.log('⚡ Conectando ao banco de dados Turso na nuvem:', TURSO_URL);
  const client = createClient({
    url: TURSO_URL,
    authToken: TURSO_TOKEN
  });

  db = {
    get: function(sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      client.execute({ sql, args: params || [] })
        .then(res => {
          const row = res.rows[0] ? { ...res.rows[0] } : undefined;
          if (cb) cb(null, row);
        })
        .catch(err => {
          console.error('Turso get error:', err.message, 'SQL:', sql);
          if (cb) cb(err);
        });
    },
    all: function(sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      client.execute({ sql, args: params || [] })
        .then(res => {
          const rows = res.rows.map(r => ({ ...r }));
          if (cb) cb(null, rows);
        })
        .catch(err => {
          console.error('Turso all error:', err.message, 'SQL:', sql);
          if (cb) cb(err, []);
        });
    },
    run: function(sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      client.execute({ sql, args: params || [] })
        .then(res => {
          if (cb) {
            const ctx = {
              lastID: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
              changes: res.rowsAffected || 0
            };
            cb.call(ctx, null);
          }
        })
        .catch(err => {
          console.error('Turso run error:', err.message, 'SQL:', sql);
          if (cb) cb(err);
        });
    },
    serialize: function(fn) {
      if (fn) fn();
    },
    prepare: function(sql) {
      const ops = [];
      const stmt = {
        run: function(...args) {
          let runArgs = [];
          if (Array.isArray(args[0])) {
            runArgs = args[0];
          } else {
            runArgs = args.filter(a => typeof a !== 'function');
          }
          ops.push({ sql, args: runArgs });
          return stmt;
        },
        finalize: function(cb) {
          if (ops.length === 0) {
            if (cb) cb();
            return;
          }
          client.batch(ops, 'write')
            .then(() => { if (cb) cb(); })
            .catch(err => {
              console.error('Turso batch error in stmt.finalize:', err);
              if (cb) cb(err);
            });
        }
      };
      return stmt;
    }
  };
} else {
  console.log('📁 Conectando ao SQLite local...');
  const dbPath = path.resolve(__dirname, 'database.sqlite');
  db = new sqlite3.Database(dbPath);
}

module.exports = db;
