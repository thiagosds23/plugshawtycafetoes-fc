const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      photo TEXT,
      original_photo TEXT,
      position TEXT,
      nickname TEXT,
      height TEXT,
      weight TEXT,
      pace INTEGER DEFAULT 50,
      shooting INTEGER DEFAULT 50,
      passing INTEGER DEFAULT 50,
      dribbling INTEGER DEFAULT 50,
      defending INTEGER DEFAULT 50,
      physical INTEGER DEFAULT 50,
      phone TEXT,
      email TEXT
    )`);

    // Ensure columns exist for existing database
    db.run("ALTER TABLE users ADD COLUMN phone TEXT", () => {});
    db.run("ALTER TABLE users ADD COLUMN email TEXT", () => {});
    db.run("ALTER TABLE users ADD COLUMN original_photo TEXT", () => {});
    db.run("ALTER TABLE users ADD COLUMN pin TEXT", () => {});
    db.run("ALTER TABLE users ADD COLUMN pin_prompted INTEGER DEFAULT 0", () => {});
    db.run("ALTER TABLE teams ADD COLUMN manual_score INTEGER", () => {});

    db.run(`CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      status TEXT DEFAULT 'scheduled'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER,
      name TEXT,
      FOREIGN KEY (match_id) REFERENCES matches (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS team_players (
      team_id INTEGER,
      user_id INTEGER,
      FOREIGN KEY (team_id) REFERENCES teams (id),
      FOREIGN KEY (user_id) REFERENCES users (id),
      PRIMARY KEY (team_id, user_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER,
      user_id INTEGER,
      FOREIGN KEY (match_id) REFERENCES matches (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS assists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER,
      user_id INTEGER,
      FOREIGN KEY (match_id) REFERENCES matches (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER,
      rater_id INTEGER,
      rated_id INTEGER,
      score INTEGER,
      FOREIGN KEY (match_id) REFERENCES matches (id),
      FOREIGN KEY (rater_id) REFERENCES users (id),
      FOREIGN KEY (rated_id) REFERENCES users (id)
    )`);
  }
});

module.exports = db;
