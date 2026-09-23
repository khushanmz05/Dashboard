const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");
const schema = require("./schema");

const dataDirectory = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDirectory, { recursive: true });

const database = new Database(path.join(dataDirectory, "dashboard.sqlite"));

database.pragma("foreign_keys = ON");
database.pragma("journal_mode = WAL");
database.exec(schema);

const columns = database.prepare("PRAGMA table_info(users)").all().map((column) => column.name);

if (!columns.includes("verification_token")) {
  database.exec("ALTER TABLE users ADD COLUMN verification_token TEXT");
}

if (!columns.includes("verification_token_expires_at")) {
  database.exec("ALTER TABLE users ADD COLUMN verification_token_expires_at INTEGER");
}

database.exec(`
  INSERT OR IGNORE INTO user_services (user_id, service_name)
  SELECT id, 'weather' FROM users
`);

module.exports = database;
