const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  const attrs = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'];
  attrs.forEach(attr => {
    db.run(`ALTER TABLE users ADD COLUMN ${attr} INTEGER DEFAULT 50`, (err) => {
      if(err) console.log(err.message); 
      else console.log(`Added ${attr}`);
    });
  });
});
