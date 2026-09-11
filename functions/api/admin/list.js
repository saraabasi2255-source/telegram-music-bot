// GET /api/admin/list?key=WEBHOOK_SECRET
// لیست همه‌ی آهنگ‌های دیتابیس رو برمی‌گردونه

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!env.WEBHOOK_SECRET || key !== env.WEBHOOK_SECRET) {
    return json({ error: "forbidden" }, 403);
  }

  const { results } = await env.DB.prepare(
    `SELECT id, chat_id, message_id, title, performer, file_name, caption, duration, created_at
     FROM songs
     ORDER BY id DESC`
  ).all();

  return json({ ok: true, songs: results });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}