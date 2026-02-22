import Database from "better-sqlite3";

const db = new Database("exports.db");

db.exec(`
CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  status TEXT,
  file_path TEXT,
  created_at TEXT,
  finished_at TEXT
)
`);

export default db;
