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
