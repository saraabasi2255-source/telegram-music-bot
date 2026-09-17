// GET /api/search?q=عبارت جستجو
// سرچ سریع روی عنوان، خواننده، نام فایل و کپشن با استفاده از ایندکس FTS5
// (به‌جای اسکن کامل جدول با LIKE '%...%')
// این نسخه هر دو دیتابیس آرشیو (فانک + انگلیسی) رو می‌خونه و نتایج رو
// با هم ترکیب می‌کنه.

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q) {
    return json({ results: [] });
  }

  // کل عبارت رو به‌صورت یه "phrase" واحد به FTS5 میدیم تا:
  // ۱) رفتارش شبیه LIKE '%q%' (ساب‌استرینگ) بمونه
  // ۲) کاراکترهای خاص FTS5 (مثل AND/OR/*) به‌عنوان متن خام در نظر گرفته بشن، نه سینتکس
  const phrase = '"' + q.replace(/"/g, '""') + '"';

  // برای اینکه بشه لینک «ارسال از ربات» (song_<src>_<id>) رو ساخت، لازمه
  // بدونیم هر نتیجه از کدوم دیتابیس اومده ("f" = فانک/env.DB، "e" = انگلیسی/env.DB_EN)
  const dbs = [
    { db: env.DB, src: "f" },
    { db: env.DB_EN, src: "e" },
  ].filter((e) => e.db);

  try {
    const perDb = await Promise.all(
      dbs.map(async ({ db, src }) => {
        const stmt = db.prepare(
          `SELECT s.id, s.message_id, s.title, s.performer, s.file_name
           FROM songs_fts
           JOIN songs s ON s.id = songs_fts.rowid
           WHERE songs_fts MATCH ?1
           ORDER BY bm25(songs_fts, 10.0, 5.0, 3.0, 1.0)
           LIMIT 30`
        ).bind(phrase);

        const { results } = await stmt.all();
        return results.map((r) => ({ ...r, src }));
      })
    );

    const merged = perDb.flat().slice(0, 30);

    const channelUsername = env.CHANNEL_USERNAME;
    const botUsername = env.BOT_USERNAME; // یوزرنیمِ بات، بدون @ (مثلا NivaroMusic_bot)
    const withLinks = merged.map((r) => ({
      title: r.title || r.file_name || "بدون عنوان",
      performer: r.performer || "",
      link: channelUsername ? `https://t.me/${channelUsername}/${r.message_id}` : null,
      // کلیک روی این لینک بات رو با /start song_<src>_<id> باز می‌کنه و بات
      // خودش مستقیم فایل آهنگ رو (با copyMessage) برای کاربر می‌فرسته
      botLink: botUsername ? `https://t.me/${botUsername}?start=song_${r.src}_${r.id}` : null,
    }));

    return json({ results: withLinks });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
