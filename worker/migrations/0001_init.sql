-- Initial schema for Reserve Agent user store.
-- One row per user; project + chat state are stored as JSON blobs.

CREATE TABLE IF NOT EXISTS users (
  uid                TEXT PRIMARY KEY,
  email              TEXT NOT NULL,
  plan               TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  plan_selected_at   INTEGER,           -- NULL until user explicitly picks a plan
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS user_state (
  uid          TEXT PRIMARY KEY,
  project_json TEXT,
  chat_json    TEXT,
  version      INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL,
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);
