-- Dönem ve veri seti depolama.
-- Her kullanıcı birden fazla dönem ve her dönemde birden fazla veri türü saklayabilir.

CREATE TABLE IF NOT EXISTS user_periods (
  uid        TEXT NOT NULL,
  period_id  TEXT NOT NULL,
  label      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (uid, period_id),
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_periods_uid ON user_periods(uid);

CREATE TABLE IF NOT EXISTS user_datasets (
  uid        TEXT NOT NULL,
  period_id  TEXT NOT NULL,
  type_id    TEXT NOT NULL,
  meta_json  TEXT NOT NULL,
  records_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (uid, period_id, type_id),
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_datasets_uid_period ON user_datasets(uid, period_id);
