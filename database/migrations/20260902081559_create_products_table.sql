-- create_products_table
-- MySQL/PostgreSQL only — Mongo collections are created implicitly on first insert.
--
-- Note `price_paise INT UNSIGNED`: money is stored as an integer count of minor units, never a
-- FLOAT/DOUBLE. 0.1 + 0.2 !== 0.3 in binary floating point, so a float column turns a few
-- thousand order lines into a total nobody can reconcile. See TUTORIAL-JS-ADVANCED.md section 14.

CREATE TABLE IF NOT EXISTS products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  price_paise INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Index every column you filter or sort on. The composite serves
  -- `WHERE status = ? ORDER BY created_at DESC` from one index, left to right.
  KEY idx_products_status_created (status, created_at),
  KEY idx_products_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Postgres: swap AUTO_INCREMENT for GENERATED ALWAYS AS IDENTITY, drop ENGINE/CHARSET,
-- DATETIME -> TIMESTAMPTZ, and ENUM -> a CHECK constraint or a real CREATE TYPE.
