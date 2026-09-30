-- Veri setlerini parçalı saklama.
--
-- D1 satır başına en fazla 2.000.000 bayt kabul ediyor. Veri seti tek satırda
-- (user_datasets.records_json) duruyordu; gerçek bir çeyreklik hasar dosyası
-- (~5.000 satır) JSON'da ~3 MB tutuyor ve yazma SQLITE_TOOBIG ile düşüyordu.
--
-- Büyük veri setlerinin kayıtları bu tabloya ~1,5 MB'lık parçalar halinde
-- yazılır. Küçük veri setleri eskisi gibi satırın içinde kalır (chunk_count = 0),
-- böylece mevcut kayıtlar migration gerektirmeden okunmaya devam eder.
CREATE TABLE IF NOT EXISTS user_dataset_chunks (
  uid          TEXT NOT NULL,
  period_id    TEXT NOT NULL,
  dataset_id   TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  records_json TEXT NOT NULL,
  PRIMARY KEY (uid, period_id, dataset_id, seq),
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

ALTER TABLE user_datasets ADD COLUMN chunk_count INTEGER NOT NULL DEFAULT 0;

-- Proje/sohbet durumu için aynı sorun: tüm proje (her branşın dosya bazlı
-- verisiyle) tek satırdaydı ve 900 KB'ta 413 dönüyordu. Tek branşlı gerçek
-- veriyle bir çeyrek ~180 KB; birkaç branşlı bir müşteri ilk dönemde aşar.
CREATE TABLE IF NOT EXISTS user_state_chunks (
  uid   TEXT NOT NULL,
  kind  TEXT NOT NULL CHECK (kind IN ('project', 'chat')),
  seq   INTEGER NOT NULL,
  part  TEXT NOT NULL,
  PRIMARY KEY (uid, kind, seq),
  FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE
);

ALTER TABLE user_state ADD COLUMN project_chunks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_state ADD COLUMN chat_chunks INTEGER NOT NULL DEFAULT 0;
-- Her yazımın kimliği. Parça yazımları "satır hâlâ bu yazıma mı ait" koşuluna
-- bağlı: sürüm çakışmasını kaybeden yazım, kazananın parçalarını ezemez.
ALTER TABLE user_state ADD COLUMN write_id TEXT;

-- Ekip daveti (çoklu kullanıcı) Enterprise özelliği — fiyat sayfası da böyle
-- satıyor. Web'de plan sütunu yalnız free/pro olduğu için ayrı bir bayrak:
-- Enterprise anlaşmasında operatör açar.
--   UPDATE users SET team_enabled = 1 WHERE email = 'musteri@firma.com';
ALTER TABLE users ADD COLUMN team_enabled INTEGER NOT NULL DEFAULT 0;
-- Bu migration'dan önce üye davet etmiş sahipler mevcut ekiplerini korur.
UPDATE users SET team_enabled = 1 WHERE uid IN (SELECT DISTINCT workspace_id FROM workspace_members);
