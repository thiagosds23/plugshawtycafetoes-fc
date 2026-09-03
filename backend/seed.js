const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

const players = [
  'thiago silva', 'wellington', 'Calebe', 'Stocco', 'Neguinho', 
  'Wesley', 'Bnd', 'Hagen', 'Jho', 'Rafão', 'Pedro', 'icarus'
];

db.serialize(() => {
  players.forEach(p => {
    db.run("INSERT OR IGNORE INTO users (username) VALUES (?)", [p], (err) => {
      if (err) console.log(err.message);
      else console.log(`Inserted ${p}`);
    });
  });
});
