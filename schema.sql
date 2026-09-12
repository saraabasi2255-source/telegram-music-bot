-- اسکیمای دیتابیس آهنگ‌ها روی Cloudflare D1

CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER,                     -- آیدی عددی چنل آرشیو (برای کپی/فوروارد کردن پیام لازمه)
  message_id INTEGER NOT NULL UNIQUE,  -- شماره پیام در چنل تلگرام
  title TEXT,                          -- عنوان آهنگ (از تگ فایل)
  performer TEXT,                      -- نام خواننده (از تگ فایل)
  file_name TEXT,                      -- نام فایل اصلی
  caption TEXT,                        -- کپشن پیام (اگر بود)
  duration INTEGER,                    -- مدت زمان (ثانیه)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_performer ON songs(performer);
CREATE INDEX IF NOT EXISTS idx_songs_filename ON songs(file_name);

-- ============================================================
-- جستجوی متنی سریع (FTS5 + trigram tokenizer)
-- به‌جای اسکن کل جدول با LIKE '%...%'، از یه ایندکس مخصوص استفاده
-- می‌کنه که خیلی کمتر ردیف می‌خونه (مهم برای سقف روزانه‌ی D1)
-- ============================================================
CREATE VIRTUAL TABLE IF NOT EXISTS songs_fts USING fts5(
  title,
  performer,
  file_name,
  caption,
  content='songs',
  content_rowid='id',
  tokenize='trigram'
);

-- این تریگرها خودشون ایندکس رو هماهنگ نگه می‌دارن؛
-- لازم نیست جای دیگه‌ای دستی چیزی توی songs_fts بنویسی
CREATE TRIGGER IF NOT EXISTS songs_ai AFTER INSERT ON songs BEGIN
  INSERT INTO songs_fts(rowid, title, performer, file_name, caption)
  VALUES (new.id, new.title, new.performer, new.file_name, new.caption);
END;

CREATE TRIGGER IF NOT EXISTS songs_ad AFTER DELETE ON songs BEGIN
  DELETE FROM songs_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS songs_au AFTER UPDATE ON songs BEGIN
  UPDATE songs_fts
  SET title = new.title,
      performer = new.performer,
      file_name = new.file_name,
      caption = new.caption
  WHERE rowid = old.id;
END;
