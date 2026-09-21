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

module.exports = database;