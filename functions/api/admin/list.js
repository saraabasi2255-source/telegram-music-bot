// GET /api/admin/list?key=WEBHOOK_SECRET
// لیست همه‌ی آهنگ‌های هر دو دیتابیس (فانک + انگلیسی) رو برمی‌گردونه.
// چون هر دو دیتابیس id از عدد ۱ شروع می‌شه، اینجا id رو با یه پیشوند
// ("f:" یا "e:") تگ می‌کنیم تا موقع حذف قاطی نشه. پنل ادمین (index.js)
// نیازی به تغییر نداره چون همه‌جا id رو به‌صورت رشته‌ی خام دست‌به‌دست می‌کنه.

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!env.WEBHOOK_SECRET || key !== env.WEBHOOK_SECRET) {
    return json({ error: "forbidden" }, 403);
  }

  const dbs = [
    { db: env.DB, src: "f" },
    { db: env.DB_EN, src: "e" },
  ].filter((e) => e.db);

  const perDb = await Promise.all(
    dbs.map(async ({ db, src }) => {
      const { results } = await db.prepare(
        `SELECT id, chat_id, message_id, title, performer, file_name, caption, duration, created_at
         FROM songs
         ORDER BY id DESC`
      ).all();
      return results.map((r) => ({ ...r, id: `${src}:${r.id}` }));
    })
  );

  return json({ ok: true, songs: perDb.flat(), botUsername: env.BOT_USERNAME || null });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
