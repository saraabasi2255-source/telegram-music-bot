// GET /api/set-webhook?key=WEBHOOK_SECRET
// این فایل فقط یه بار برای وصل کردن وبهوک لازمه. بعد از اینکه جواب گرفتی
// و مطمئن شدی وبهوک وصل شده، بهتره این فایل رو حذف کنی (یا حداقل غیرفعالش کنی)
// چون هر کسی که آدرسش رو بدونه می‌تونه وبهوک بات رو دوباره ست کنه.

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!env.WEBHOOK_SECRET || key !== env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  if (!env.BOT_TOKEN) {
    return new Response("BOT_TOKEN تنظیم نشده", { status: 500 });
  }

  const webhookUrl = `${url.origin}/webhook`;

  const telegramRes = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ["message", "channel_post"],
      }),
    }
  );

  const result = await telegramRes.json();

  return new Response(JSON.stringify({ webhookUrl, telegram: result }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
