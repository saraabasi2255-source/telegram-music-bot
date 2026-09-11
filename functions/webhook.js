// POST /webhook  -> آدرسی که به تلگرام معرفی می‌کنیم (setWebhook)

export async function onRequestPost(context) {
  const { request, env } = context;

  // اعتبارسنجی ساده با هدر مخفی تلگرام (secret_token در setWebhook)
  if (env.WEBHOOK_SECRET) {
    const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (secret !== env.WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  try {
    if (update.channel_post) {
      await handleChannelPost(update.channel_post, env);
    } else if (update.message) {
      await handleMessage(update.message, env);
    }
  } catch (e) {
    console.error("webhook error:", e);
  }

  return new Response("ok");
}

async function handleChannelPost(msg, env) {
  const audio = msg.audio;
  if (!audio) return; // فقط فایل‌های صوتی (audio) رو ثبت می‌کنیم

  const title = audio.title || null;
  const performer = audio.performer || null;
  const fileName = audio.file_name || null;
  const caption = msg.caption || null;
  const duration = audio.duration || null;

  await env.DB.prepare(
    `INSERT INTO songs (message_id, title, performer, file_name, caption, duration)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(message_id) DO UPDATE SET
       title = excluded.title,
       performer = excluded.performer,
       file_name = excluded.file_name,
       caption = excluded.caption,
       duration = excluded.duration`
  )
    .bind(msg.message_id, title, performer, fileName, caption, duration)
    .run();
}

async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  const text = msg.text || "";

  if (text.startsWith("/start")) {
    await sendMessage(env, chatId, "برای جستجوی آهنگ‌ها روی دکمه زیر بزن 👇", {
      inline_keyboard: [
        [{ text: "🔍 جستجوی آهنگ", web_app: { url: env.MINIAPP_URL } }],
      ],
    });
  }
}

async function sendMessage(env, chatId, text, reply_markup) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup }),
  });
}
