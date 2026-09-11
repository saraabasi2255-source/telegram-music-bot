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
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query, env);
    }
  } catch (e) {
    console.error("webhook error:", e);
  }

  return new Response("ok");
}

// ── ذخیره‌ی آهنگ‌های جدید چنل آرشیو ──────────────────────────

async function handleChannelPost(msg, env) {
  const audio = msg.audio;
  if (!audio) return; // فقط فایل‌های صوتی (audio) رو ثبت می‌کنیم

  // 👇 فقط از چنل آرشیو ذخیره کن، نه از چنل اصلی
  const archiveChatId = env.ARCHIVE_CHAT_ID ? String(env.ARCHIVE_CHAT_ID) : null;
  if (!archiveChatId) {
    console.warn("ARCHIVE_CHAT_ID تنظیم نشده - هیچ آهنگی ذخیره نمی‌شه");
    return;
  }
  if (String(msg.chat.id) !== archiveChatId) {
    // پیام از چنل اصلی یا هر جای دیگه ⇒ نادیده بگیر
    return;
  }

  const chatId = msg.chat.id;
  const title = audio.title || null;
  const performer = audio.performer || null;
  const fileName = audio.file_name || null;
  const caption = msg.caption || null;
  const duration = audio.duration || null;

  await env.DB.prepare(
    `INSERT INTO songs (chat_id, message_id, title, performer, file_name, caption, duration)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(message_id) DO UPDATE SET
       chat_id = excluded.chat_id,
       title = excluded.title,
       performer = excluded.performer,
       file_name = excluded.file_name,
       caption = excluded.caption,
       duration = excluded.duration`
  )
    .bind(chatId, msg.message_id, title, performer, fileName, caption, duration)
    .run();
}

// ── پیام‌های متنی کاربر (جستجو) ──────────────────────────────

async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();

  if (text.startsWith("/start")) {
    await sendMessage(
      env,
      chatId,
      "سلام 👋\nاسم آهنگ یا خواننده رو برام بفرست تا برات پیداش کنم 🎧"
    );
    return;
  }

  if (!text) return;

  // همه‌ی نتایج (سقف ۱۰۰) رو می‌گیریم تا صفحه‌بندی درست کار کنه
  const results = await searchSongs(env, text, 100);

  if (results.length === 0) {
    await sendMessage(env, chatId, "چیزی با این اسم پیدا نکردم 😕 یه کلمه دیگه امتحان کن.");
    return;
  }

  if (results.length === 1) {
    await deliverSong(env, chatId, results[0]);
    return;
  }

  // لیست صفحه‌بندی‌شده (صفحه ۰)
  await sendResultsPage(env, chatId, results, 0, text);
}

// ── وقتی کاربر روی یکی از دکمه‌های لیست می‌زنه ────────────────

async function handleCallbackQuery(cq, env) {
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const data = cq.data || "";

  if (!chatId) {
    await answerCallbackQuery(env, cq.id);
    return;
  }

  // ① انتخاب یک آهنگ از لیست
  if (data.startsWith("song:")) {
    const id = Number(data.slice("song:".length));
    const song = await env.DB.prepare(
      `SELECT id, chat_id, message_id, title, performer, caption FROM songs WHERE id = ?1`
    )
      .bind(id)
      .first();

    if (song) {
      await deliverSong(env, chatId, song);
    } else {
      await answerCallbackQuery(env, cq.id, "این آهنگ دیگه پیدا نشد.");
      return;
    }
  }

  // ② رفتن به صفحه‌ی بعد/قبل
  // فرمت callback_data: page:<pageNumber>:<query>
  else if (data.startsWith("page:")) {
    const rest = data.slice("page:".length);
    const firstColon = rest.indexOf(":");
    const page = Number(rest.slice(0, firstColon));
    const q = rest.slice(firstColon + 1);

    if (!Number.isInteger(page) || page < 0) {
      await answerCallbackQuery(env, cq.id);
      return;
    }

    const results = await searchSongs(env, q, 100);
    if (results.length === 0) {
      await answerCallbackQuery(env, cq.id, "دیگه چیزی نمونده.");
      return;
    }

    await editResultsPage(env, chatId, messageId, results, page, q);
    await answerCallbackQuery(env, cq.id);
    return;
  }

  // ③ بستن لیست (حذف پیام)
  else if (data === "close") {
    if (messageId) {
      await deleteMessage(env, chatId, messageId);
    }
    await answerCallbackQuery(env, cq.id);
    return;
  }

  // ④ دکمه‌ی غیرفعال (شماره صفحه) — فقط برای نمایش
  else if (data === "noop") {
    await answerCallbackQuery(env, cq.id);
    return;
  }

  await answerCallbackQuery(env, cq.id);
}

// ── توابع کمکی ────────────────────────────────────────────────

// تعداد آیتم در هر صفحه
const PAGE_SIZE = 7;

// جستجو در دیتابیس (تا سقف limit)
async function searchSongs(env, q, limit = 100) {
  const like = `%${q}%`;
  const startsWith = `${q}%`;

  const stmt = env.DB.prepare(
    `SELECT id, chat_id, message_id, title, performer, caption
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
     LIMIT ?3`
  ).bind(like, startsWith, limit);

  const { results } = await stmt.all();
  return results;
}

// ساخت متن و دکمه‌های یک صفحه
function buildResultsKeyboard(results, page, q) {
  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const slice = results.slice(start, start + PAGE_SIZE);

  const rows = slice.map((r) => [
    { text: buildLabel(r), callback_data: `song:${r.id}` },
  ]);

  // ردیف ناوبری: قبلی / شماره صفحه / بعدی
  const nav = [];
  if (safePage > 0) {
    nav.push({ text: "◀ قبلی", callback_data: `page:${safePage - 1}:${q}` });
  }
  nav.push({
    text: `${safePage + 1}/${totalPages}`,
    callback_data: "noop",
  });
  if (safePage < totalPages - 1) {
    nav.push({ text: "بعدی ▶", callback_data: `page:${safePage + 1}:${q}` });
  }
  if (nav.length) rows.push(nav);

  // ردیف بستن
  rows.push([{ text: "✖ بستن", callback_data: "close" }]);

  const text =
    `${results.length} نتیجه پیدا شد — صفحه ${safePage + 1} از ${totalPages}\n` +
    `کدومو می‌خوای؟ 👇`;

  return { text, reply_markup: { inline_keyboard: rows } };
}

// ارسال صفحه‌ی جدید (پیام تازه)
async function sendResultsPage(env, chatId, results, page, q) {
  const { text, reply_markup } = buildResultsKeyboard(results, page, q);
  await sendMessage(env, chatId, text, reply_markup);
}

// ویرایش پیام فعلی برای نمایش صفحه‌ی جدید
async function editResultsPage(env, chatId, messageId, results, page, q) {
  if (!messageId) {
    await sendResultsPage(env, chatId, results, page, q);
    return;
  }
  const { text, reply_markup } = buildResultsKeyboard(results, page, q);
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup,
    }),
  });
}

// ساخت برچسب دکمه‌ی هر آهنگ
function buildLabel(song) {
  const title = song.title || "بدون عنوان";
  const performer = song.performer ? ` - ${song.performer}` : "";
  const label = `🎵 ${title}${performer}`;
  return label.length > 64 ? label.slice(0, 61) + "..." : label;
}

// آهنگ رو دقیقاً با همون کپشن اصلی‌اش برای کاربر کپی می‌کنه
// اگه پیام اصلی تو چنل آرشیو پاک شده باشه، رکورد رو از دیتابیس هم حذف می‌کنه
async function deliverSong(env, toChatId, song) {
  if (!song.chat_id) {
    await sendMessage(
      env,
      toChatId,
      "این آهنگ قبل از راه‌اندازی کامل سیستم ذخیره شده و قابل ارسال نیست."
    );
    return;
  }

  const res = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/copyMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: toChatId,
        from_chat_id: song.chat_id,
        message_id: song.message_id,
        // caption رو عمداً ست نمی‌کنیم تا کپشن اصلی پیام حفظ بشه
      }),
    }
  );

  const data = await res.json();

  if (!data.ok) {
    const desc = (data.description || "").toLowerCase();
    // اگه پیام اصلی تو چنل آرشیو پاک شده باشه ⇒ از دیتابیس هم پاک کن
    if (
      desc.includes("message to copy not found") ||
      desc.includes("message not found") ||
      desc.includes("message_id_invalid")
    ) {
      if (song.id) {
        await env.DB.prepare(`DELETE FROM songs WHERE id = ?1`).bind(song.id).run();
      }
      await sendMessage(
        env,
        toChatId,
        "این آهنگ از چنل آرشیو حذف شده و دیگه در دسترس نیست 🗑"
      );
      return;
    }
    await sendMessage(env, toChatId, "ارسال آهنگ با خطا مواجه شد.");
  }
}

// ── توابع پایه‌ی تلگرام ──────────────────────────────────────

async function sendMessage(env, chatId, text, reply_markup) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup }),
  });
}

async function answerCallbackQuery(env, callbackQueryId, text) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

async function deleteMessage(env, chatId, messageId) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}
