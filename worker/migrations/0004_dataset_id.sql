-- Multi-dataset support: add dataset_id as primary key.
-- Existing rows keep dataset_id = type_id for backwards compatibility.

CREATE TABLE user_datasets_v2 (
  uid          TEXT NOT NULL,
  period_id    TEXT NOT NULL,
  dataset_id   TEXT NOT NULL,
  type_id      TEXT NOT NULL,
  meta_json    TEXT NOT NULL,
  records_json TEXT NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (uid, period_id, dataset_id),
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

INSERT INTO user_datasets_v2 (uid, period_id, dataset_id, type_id, meta_json, records_json, updated_at)
SELECT uid, period_id, type_id, type_id, meta_json, records_json, updated_at FROM user_datasets;

DROP TABLE user_datasets;
ALTER TABLE user_datasets_v2 RENAME TO user_datasets;

CREATE INDEX IF NOT EXISTS idx_datasets_uid_period ON user_datasets(uid, period_id);
