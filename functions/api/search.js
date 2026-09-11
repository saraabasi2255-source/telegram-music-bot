// GET /api/search?q=عبارت جستجو
// یه سرچ ساده و "فازی" روی عنوان، خواننده، نام فایل و کپشن

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();

  if (!q) {
    return json({ results: [] });
  }

  const like = `%${q}%`;
  const startsWith = `${q}%`;

  try {
    const stmt = env.DB.prepare(
      `SELECT message_id, title, performer, file_name, caption
       FROM songs
       WHERE title LIKE ?1 OR performer LIKE ?1 OR file_name LIKE ?1 OR caption LIKE ?1
       ORDER BY
         CASE
           WHEN title LIKE ?2 THEN 0
           WHEN performer LIKE ?2 THEN 1
           WHEN file_name LIKE ?2 THEN 2
           ELSE 3
         END,
         length(COALESCE(title, file_name, '')) ASC
       LIMIT 30`
    ).bind(like, startsWith);

    const { results } = await stmt.all();

    const channelUsername = env.CHANNEL_USERNAME;
    const withLinks = results.map((r) => ({
      title: r.title || r.file_name || "بدون عنوان",
      performer: r.performer || "",
      link: `https://t.me/${channelUsername}/${r.message_id}`,
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
