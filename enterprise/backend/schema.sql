-- Oracle 19c Schema — Reserve Agent Enterprise
-- Çalıştır: sqlplus kullanici/sifre@dsn @schema.sql

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

-- Proje state (project JSON + chat geçmişi, kullanıcı başına)
CREATE TABLE user_state (
    user_id      NUMBER        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    project_json CLOB,
    chat_json    CLOB,
    version      NUMBER        DEFAULT 0 NOT NULL,
    updated_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- Veri dönemleri
CREATE TABLE periods (
    user_id    NUMBER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_id  VARCHAR2(36)   NOT NULL,
    label      VARCHAR2(255)  NOT NULL,
    created_at VARCHAR2(30)   NOT NULL,
    PRIMARY KEY (user_id, period_id)
);

-- Dataset'ler (meta + records JSON olarak)
CREATE TABLE datasets (
    user_id      NUMBER        NOT NULL,
    period_id    VARCHAR2(36)  NOT NULL,
    dataset_id   VARCHAR2(36)  NOT NULL,
    type_id      VARCHAR2(50)  NOT NULL,
    meta_json    CLOB,
    records_json CLOB,
    PRIMARY KEY (user_id, period_id, dataset_id),
    FOREIGN KEY (user_id, period_id) REFERENCES periods(user_id, period_id) ON DELETE CASCADE
);
