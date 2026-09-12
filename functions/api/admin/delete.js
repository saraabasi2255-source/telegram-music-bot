// POST /api/admin/delete?key=WEBHOOK_SECRET
// body: { id: number }
// فقط رکورد رو از دیتابیس حذف می‌کنه - پیام چنل آرشیو دست نمی‌خوره

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!env.WEBHOOK_SECRET || key !== env.WEBHOOK_SECRET) {
    return json({ error: "forbidden" }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad request" }, 400);
  }

  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return json({ error: "invalid id" }, 400);
  }

  const result = await env.DB.prepare(`DELETE FROM songs WHERE id = ?1`).bind(id).run();

  return json({ ok: true, changes: result.meta?.changes ?? 0 });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}