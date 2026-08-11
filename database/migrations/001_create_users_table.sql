-- The one table this example uses. It serves double duty: it's the login table AND the
-- resource the CRUD screens manage, which is exactly how most real admin panels start.
--
-- A note on `password`: it stores a bcrypt HASH, never plaintext. The column is named
-- `password` (rather than `password_hash`) because that's the convention the request asked
-- for and what Laravel/Rails use — but nothing plaintext ever reaches it. See
-- core/helpers/hash.js and app/models/User.js.
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
