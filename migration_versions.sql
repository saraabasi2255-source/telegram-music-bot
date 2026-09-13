-- مهاجرت: افزودن قابلیت «نسخه‌های دیگه‌ی یک آهنگ» + بات دستیار پست‌گذاری
--
-- این فایل رو فقط اگه از قبل دیتابیس داری (schema.sql رو قبلا اجرا کرده بودی)
-- یک‌بار اجرا کن. اگه تازه داری از صفر نصب می‌کنی، لازم نیست؛ همه‌چی از قبل
-- توی schema.sql هست.
--
--   wrangler d1 execute song_search_db --remote --file=./migration_versions.sql

CREATE TABLE IF NOT EXISTS song_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  performer TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

ALTER TABLE songs ADD COLUMN group_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_songs_group ON songs(group_id);

CREATE TABLE IF NOT EXISTS pending_posts (
  admin_id INTEGER PRIMARY KEY,
  file_id TEXT,
  file_name TEXT,
  title TEXT,
  performer TEXT,
  duration INTEGER,
  awaiting_field TEXT,
  status TEXT DEFAULT 'awaiting_confirm',
  created_at TEXT DEFAULT (datetime('now'))
);
