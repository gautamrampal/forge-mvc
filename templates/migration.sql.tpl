-- __name__
-- MySQL/PostgreSQL only — Mongo collections are created implicitly on first insert, no migration needed.

CREATE TABLE IF NOT EXISTS __table__ (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  -- add your columns here
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Postgres note: swap AUTO_INCREMENT for GENERATED ALWAYS AS IDENTITY, drop ENGINE/CHARSET,
-- and DATETIME -> TIMESTAMP. See database/migrations/001_create_posts.sql for a worked example.
