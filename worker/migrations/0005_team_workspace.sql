-- Ekip çalışma alanı: masaüstü (enterprise-v2) ile aynı paylaşımlı model.
--
-- Her kullanıcının kendi çalışma alanı vardır ve kimliği kendi uid'idir; bu yüzden
-- mevcut user_state / user_periods / user_datasets satırları hiç taşınmaz — `uid`
-- sütunu artık "çalışma alanı kimliği" anlamına gelir. Bir yönetici başka birini
-- e-postayla eklediğinde o kişi giriş yapınca yöneticinin çalışma alanına bağlanır.

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,           -- sahibin uid'i
  email        TEXT NOT NULL,           -- küçük harf
  uid          TEXT,                    -- üye ilk girişte bağlanır
  role         TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active    INTEGER NOT NULL DEFAULT 1,
  invited_at   INTEGER NOT NULL,
  joined_at    INTEGER,
  PRIMARY KEY (workspace_id, email),
  FOREIGN KEY (workspace_id) REFERENCES users(uid) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_members_email ON workspace_members(email);

-- Durumu en son kimin yazdığı (masaüstündeki updated_by_name).
ALTER TABLE user_state ADD COLUMN updated_by_name TEXT;

-- Değiştirilemez denetim günlüğü. Aynı event_id ikinci kez yazılamaz; hiçbir
-- durum güncellemesinde silinmez.
CREATE TABLE IF NOT EXISTS audit_events (
  workspace_id TEXT NOT NULL,
  event_id     TEXT NOT NULL,
  occurred_at  INTEGER NOT NULL,
  actor_uid    TEXT NOT NULL,
  actor_name   TEXT NOT NULL,
  source       TEXT NOT NULL,
  action       TEXT NOT NULL,
  branch_id    TEXT,
  details_json TEXT,
  PRIMARY KEY (workspace_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_audit_ws_time ON audit_events(workspace_id, occurred_at);

-- Model kilitleri (eşzamanlı düzenlemeyi önler).
CREATE TABLE IF NOT EXISTS model_locks (
  workspace_id   TEXT NOT NULL,
  lock_key       TEXT NOT NULL,
  locked_by_uid  TEXT NOT NULL,
  locked_by_name TEXT NOT NULL,
  locked_at      INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, lock_key)
);
