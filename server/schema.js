module.exports = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_verified INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS user_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    service_name TEXT NOT NULL,
    credentials_json TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, service_name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS dashboard_widgets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    service_name TEXT NOT NULL,
    widget_name TEXT NOT NULL,
    configuration_json TEXT NOT NULL DEFAULT '{}',
    refresh_rate INTEGER NOT NULL DEFAULT 60 CHECK(refresh_rate >= 10),
    position_x INTEGER NOT NULL DEFAULT 0,
    position_y INTEGER NOT NULL DEFAULT 0,
    width INTEGER NOT NULL DEFAULT 1,
    height INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS dashboard_widgets_user_id_index
  ON dashboard_widgets(user_id);
`;