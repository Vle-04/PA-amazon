-- 002: email verification. Columns on users, so the schema keeps its ten tables.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1));
ALTER TABLE users ADD COLUMN verify_code_hash TEXT;
ALTER TABLE users ADD COLUMN verify_expires_at TEXT;
ALTER TABLE users ADD COLUMN verify_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN verify_sent_at TEXT;
-- Accounts created before this migration keep working.
UPDATE users SET email_verified = 1;
