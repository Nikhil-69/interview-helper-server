-- Interview Helper — database schema
-- Run against MySQL 8.x. Creates database, app user, and all tables.

CREATE DATABASE IF NOT EXISTS interview_helper
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'interview_helper'@'%' IDENTIFIED BY 'interview_helper_password';
GRANT ALL PRIVILEGES ON interview_helper.* TO 'interview_helper'@'%';
FLUSH PRIVILEGES;

USE interview_helper;

CREATE TABLE IF NOT EXISTS users (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  name            VARCHAR(120) NOT NULL DEFAULT '',
  role            ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  status          ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
  credits_balance INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_status (status)
) ENGINE=InnoDB;

-- Every credit movement, signed. balance_after is the user's balance after this row.
CREATE TABLE IF NOT EXISTS credit_transactions (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  type          ENUM('signup_bonus', 'purchase', 'usage', 'admin_adjustment') NOT NULL,
  amount        INT NOT NULL,
  balance_after INT NOT NULL,
  reference_id  BIGINT UNSIGNED NULL,
  description   VARCHAR(255) NOT NULL DEFAULT '',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ct_user (user_id, created_at),
  CONSTRAINT fk_ct_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS credit_packages (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  credits    INT NOT NULL,
  price      DECIMAL(10, 2) NOT NULL,
  currency   CHAR(3) NOT NULL DEFAULT 'INR',
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id          BIGINT UNSIGNED NOT NULL,
  package_id       BIGINT UNSIGNED NULL,
  credits          INT NOT NULL,
  amount           DECIMAL(10, 2) NOT NULL,
  currency         CHAR(3) NOT NULL DEFAULT 'INR',
  gateway          VARCHAR(40) NOT NULL DEFAULT 'mock',
  gateway_order_id VARCHAR(120) NULL,
  status           ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at          TIMESTAMP NULL,
  INDEX idx_orders_user (user_id, created_at),
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_package FOREIGN KEY (package_id) REFERENCES credit_packages(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ai_requests (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT UNSIGNED NOT NULL,
  request_type      ENUM('text', 'vision') NOT NULL,
  model             VARCHAR(80) NOT NULL,
  credits_charged   INT NOT NULL DEFAULT 0,
  status            ENUM('success', 'failed') NOT NULL,
  error_message     VARCHAR(500) NULL,
  prompt_tokens     INT NULL,
  completion_tokens INT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ai_user (user_id, created_at),
  CONSTRAINT fk_ai_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  `key`      VARCHAR(80) PRIMARY KEY,
  `value`    VARCHAR(500) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO settings (`key`, `value`) VALUES
  ('credit_cost_text', '1'),
  ('credit_cost_vision', '2'),
  ('signup_bonus_credits', '10'),
  ('ai_model', 'gpt-4o'),
  ('ai_max_tokens', '1000');
