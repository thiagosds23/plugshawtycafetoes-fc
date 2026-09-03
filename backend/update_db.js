const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run("ALTER TABLE users ADD COLUMN nickname TEXT", (err) => { if(err) console.log(err.message); else console.log("Added nickname"); });
  db.run("ALTER TABLE users ADD COLUMN height TEXT", (err) => { if(err) console.log(err.message); else console.log("Added height"); });
  db.run("ALTER TABLE users ADD COLUMN weight TEXT", (err) => { if(err) console.log(err.message); else console.log("Added weight"); });
});
