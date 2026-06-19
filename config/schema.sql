-- ============================================================
--  VoteNova — Database Schema
--  Engine: MySQL 8+ / MariaDB 10.4+
--  Run this ONCE in phpMyAdmin (SQL tab) to set up everything.
--  IMPORTANT: Create the "votenova" database first in phpMyAdmin
--             before running this file (Databases tab → type
--             "votenova" → collation utf8mb4_unicode_ci → Create).
-- ============================================================

USE votenova;

-- ── Admins ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(60)  NOT NULL UNIQUE,
    password    VARCHAR(255) NOT NULL,          -- bcrypt hash
    email       VARCHAR(120) NOT NULL UNIQUE,
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Voters ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS voters (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    first_name      VARCHAR(80)  NOT NULL,
    last_name       VARCHAR(80)  NOT NULL,
    email           VARCHAR(120) NOT NULL UNIQUE,
    password        VARCHAR(255) NOT NULL,       -- bcrypt hash
    is_verified     TINYINT(1)   DEFAULT 0,
    verify_token    VARCHAR(64)  DEFAULT NULL,
    reset_token     VARCHAR(64)  DEFAULT NULL,
    reset_expires   DATETIME     DEFAULT NULL,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Elections ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elections (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    opens_at        DATETIME     NOT NULL,
    closes_at       DATETIME     NOT NULL,
    is_open         TINYINT(1)   DEFAULT 0,      -- admin toggle
    results_public  TINYINT(1)   DEFAULT 0,      -- show results after close
    created_by      INT UNSIGNED NOT NULL,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES admins(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Candidates ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidates (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    election_id INT UNSIGNED NOT NULL,
    full_name   VARCHAR(120) NOT NULL,
    party       VARCHAR(120) DEFAULT NULL,
    tagline     VARCHAR(300) DEFAULT NULL,
    bio         TEXT         DEFAULT NULL,
    photo       VARCHAR(255) DEFAULT NULL,       -- stored filename in uploads/candidates/
    platform    TEXT         DEFAULT NULL,       -- JSON array of platform points
    status      ENUM('pending','approved','rejected') DEFAULT 'pending',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id) REFERENCES elections(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Votes ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS votes (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    election_id  INT UNSIGNED NOT NULL,
    candidate_id INT UNSIGNED NOT NULL,
    voter_id     INT UNSIGNED NOT NULL,
    receipt      VARCHAR(32)  NOT NULL UNIQUE,   -- random hex for voter verification
    voted_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (election_id)  REFERENCES elections(id)  ON DELETE CASCADE,
    FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
    FOREIGN KEY (voter_id)     REFERENCES voters(id)     ON DELETE CASCADE,
    -- one vote per voter per election — enforced at database level
    UNIQUE KEY unique_vote (election_id, voter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Audit log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    actor_type  ENUM('admin','voter','system') NOT NULL,
    actor_id    INT UNSIGNED DEFAULT NULL,
    action      VARCHAR(100) NOT NULL,
    detail      TEXT         DEFAULT NULL,
    ip_address  VARCHAR(45)  DEFAULT NULL,
    logged_at   DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Seed: default admin (password: Admin@1234 — CHANGE IMMEDIATELY) ──────
-- This bcrypt hash corresponds to the plaintext password: Admin@1234
INSERT INTO admins (username, password, email)
SELECT 'admin',
       '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
       'admin@votenova.io'
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE username = 'admin');
