-- Oracle 19c Schema — Reserve Agent Enterprise
-- Çalıştır: python init_db.py

-- Kullanıcılar
CREATE TABLE users (
    id            NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      VARCHAR2(100)  NOT NULL,
    password_hash VARCHAR2(255)  NOT NULL,
    role          VARCHAR2(20)   DEFAULT 'user' NOT NULL,
    is_active     NUMBER(1)      DEFAULT 1 NOT NULL,
    created_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_users_username ON users (username);

-- Paylaşımlı ekip state (tüm kullanıcılar aynı proje üzerinde çalışır)
CREATE TABLE team_state (
    id                NUMBER         DEFAULT 1 NOT NULL PRIMARY KEY,
    project_json      CLOB,
    chat_json         CLOB,
    version           NUMBER         DEFAULT 0 NOT NULL,
    updated_at        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    updated_by_id     NUMBER         REFERENCES users(id) ON DELETE SET NULL,
    updated_by_name   VARCHAR2(100)
);

-- Veri dönemleri (paylaşımlı)
CREATE TABLE periods (
    period_id  VARCHAR2(36)   NOT NULL PRIMARY KEY,
    label      VARCHAR2(255)  NOT NULL,
    created_at VARCHAR2(30)   NOT NULL
);

-- Dataset'ler (paylaşımlı)
CREATE TABLE datasets (
    period_id    VARCHAR2(36)  NOT NULL,
    dataset_id   VARCHAR2(36)  NOT NULL,
    type_id      VARCHAR2(50)  NOT NULL,
    meta_json    CLOB,
    records_json CLOB,
    PRIMARY KEY (period_id, dataset_id),
    FOREIGN KEY (period_id) REFERENCES periods(period_id) ON DELETE CASCADE
);

-- Model kilitleri (concurrent editing önleme)
CREATE TABLE model_locks (
    lock_key         VARCHAR2(200)  NOT NULL PRIMARY KEY,
    locked_by_id     NUMBER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    locked_by_name   VARCHAR2(100)  NOT NULL,
    locked_at        TIMESTAMP      DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at       TIMESTAMP      NOT NULL
);
