// POST /api/admin/delete?key=WEBHOOK_SECRET
// body: { id: "f:123" یا "e:45" }
// فقط رکورد رو از دیتابیس مربوطه حذف می‌کنه - پیام چنل آرشیو دست نمی‌خوره

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

  const raw = String(body?.id || "");
  const sep = raw.indexOf(":");
  if (sep === -1) {
    return json({ error: "invalid id" }, 400);
  }
  const src = raw.slice(0, sep);
  const numId = Number(raw.slice(sep + 1));
  if (!Number.isInteger(numId) || numId <= 0) {
    return json({ error: "invalid id" }, 400);
  }

  const db = src === "e" ? env.DB_EN : env.DB;
  if (!db) {
    return json({ error: "db not configured" }, 500);
  }

  const result = await db.prepare(`DELETE FROM songs WHERE id = ?1`).bind(numId).run();

  return json({ ok: true, changes: result.meta?.changes ?? 0 });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
