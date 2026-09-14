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

  // 👇 فقط از چنل(های) آرشیو ذخیره کن، نه از چنل اصلی/پابلیک
  // هم اسم ARCHIVE_CHAT_ID / ARCHIVE_CHAT_ID_2 رو قبول می‌کنه، هم
  // ARCHIVE_CHANNEL1 / ARCHIVE_CHANNEL2 (هر کدوم توی تنظیمات Cloudflare
  // ست کرده باشی کار می‌کنه)
  const archiveIds = [
    env.ARCHIVE_CHAT_ID,
    env.ARCHIVE_CHAT_ID_2,
    env.ARCHIVE_CHANNEL1,
    env.ARCHIVE_CHANNEL2,
  ]
    .filter(Boolean)
    .map(String);

  if (archiveIds.length === 0) {
    console.warn("هیچ چنل آرشیوی تنظیم نشده - هیچ آهنگی ذخیره نمی‌شه");
    return;
  }
  if (!archiveIds.includes(String(msg.chat.id))) {
    // پیام از چنل اصلی یا هر جای دیگه ⇒ نادیده بگیر
    return;
  }

  const chatId = msg.chat.id;
  const title = audio.title || null;
  const performer = audio.performer || null;
  const fileName = audio.file_name || null;
  const caption = msg.caption || null;
  const duration = audio.duration || null;

  // نکته: group_id رو اینجا دست نمی‌زنیم (null می‌فرستیم) چون این تابع
  // فقط ایندکس‌کردنِ خودکارِ پیام‌های چنله؛ اگه بات دستیار (webhook-poster.js)
  // قبلا group_id این پیام رو ست کرده باشه، با COALESCE دست‌نخورده می‌مونه
  await env.DB.prepare(
    `INSERT INTO songs (chat_id, message_id, title, performer, file_name, caption, duration, group_id)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)
     ON CONFLICT(message_id) DO UPDATE SET
       chat_id = excluded.chat_id,
       title = excluded.title,
       performer = excluded.performer,
       file_name = excluded.file_name,
       caption = excluded.caption,
       duration = excluded.duration,
       group_id = COALESCE(songs.group_id, excluded.group_id)`
  )
    .bind(chatId, msg.message_id, title, performer, fileName, caption, duration)
    .run();
}

// ── پیام‌های متنی کاربر (جستجو) ──────────────────────────────

async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text = (msg.text || "").trim();

  // ── جوین اجباری: قبل از هر چیزی (حتی /start) عضویت رو چک کن ──
  if (userId && !(await isMember(env, userId))) {
    await sendJoinPrompt(env, chatId);
    return;
  }

  if (text.startsWith("/start")) {
    // لینک شیشه‌ای «نسخه‌های دیگه‌ی این آهنگ» به شکل زیر بات رو باز می‌کنه:
    // https://t.me/<bot_username>?start=ver_<groupId>
    // که تلگرام خودش به‌صورت پیام «/start ver_<groupId>» برامون می‌فرسته
    const payload = text.slice("/start".length).trim();
    if (payload.startsWith("ver_")) {
      const groupId = Number(payload.slice("ver_".length));
      if (Number.isInteger(groupId) && groupId > 0) {
        await deliverGroupVersions(env, chatId, groupId, msg.message_id);
        return;
      }
    }

    await sendMessage(
      env,
      chatId,
      "سلام، به بات NivaroMusic خوش اومدی🎉\n\nکافیه اسم آهنگ یا نام خواننده رو بفرستی تا پیدا کنم و برات بفرستم 🎧"
    );
    return;
  }

  if (!text) return;

  // همه‌ی نتایج (سقف ۱۰۰) رو می‌گیریم تا صفحه‌بندی درست کار کنه
  const results = await searchSongs(env, text, 100);

  if (results.length === 0) {
    await sendNoResultsMessage(env, chatId, msg.message_id, text);
    return;
  }

  if (results.length === 1) {
    await deliverSong(env, chatId, results[0], msg.message_id);
    return;
  }

  // لیست صفحه‌بندی‌شده (صفحه ۰)
  await sendResultsPage(env, chatId, results, 0, text, msg.message_id);
}

// ── وقتی کاربر روی یکی از دکمه‌های لیست می‌زنه ────────────────

async function handleCallbackQuery(cq, env) {
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const userId = cq.from?.id;
  const data = cq.data || "";

  if (!chatId) {
    await answerCallbackQuery(env, cq.id);
    return;
  }

  // ⓪ دکمه‌ی «بررسی مجدد» عضویت
  if (data === "check_join") {
    if (userId && (await isMember(env, userId))) {
      await answerCallbackQuery(env, cq.id, "عضویت تایید شد ✅");
      if (messageId) await deleteMessage(env, chatId, messageId);
      await sendMessage(
        env,
        chatId,
        "خوش اومدی 🎉\nاسم آهنگ یا خواننده رو برام بفرست تا برات پیداش کنم 🎧"
      );
    } else {
      await answerCallbackQuery(env, cq.id, "هنوز عضو چنل نشدی 🙁");
    }
    return;
  }

  // بقیه‌ی دکمه‌ها (انتخاب آهنگ، صفحه‌بندی) هم نیاز به عضویت دارن
  if (userId && !(await isMember(env, userId))) {
    await answerCallbackQuery(env, cq.id, "اول باید عضو چنل بشی 🙁");
    await sendJoinPrompt(env, chatId);
    return;
  }

  // ① انتخاب یک آهنگ از لیست
  if (data.startsWith("song:")) {
    const id = Number(data.slice("song:".length));
    const song = await env.DB.prepare(
      `SELECT id, chat_id, message_id, title, performer, caption, group_id FROM songs WHERE id = ?1`
    )
      .bind(id)
      .first();

    if (song) {
      await deliverSong(env, chatId, song, 0);
    } else {
      await answerCallbackQuery(env, cq.id, "این آهنگ دیگه پیدا نشد.");
      return;
    }
  }

  // ② رفتن به صفحه‌ی بعد/قبل
  // فرمت callback_data: page:<pageNumber>:<userMessageId>:<query>
  else if (data.startsWith("page:")) {
    const rest = data.slice("page:".length);
    const firstColon = rest.indexOf(":");
    const secondColon = rest.indexOf(":", firstColon + 1);
    const page = Number(rest.slice(0, firstColon));
    const userMessageId = Number(rest.slice(firstColon + 1, secondColon));
    const q = rest.slice(secondColon + 1);

    if (!Number.isInteger(page) || page < 0) {
      await answerCallbackQuery(env, cq.id);
      return;
    }

    const results = await searchSongs(env, q, 100);
    if (results.length === 0) {
      await answerCallbackQuery(env, cq.id, "دیگه چیزی نمونده.");
      return;
    }

    await editResultsPage(env, chatId, messageId, results, page, q, userMessageId);
    await answerCallbackQuery(env, cq.id);
    return;
  }

  // ③ بستن لیست — هم خودِ لیست و هم پیام سرچِ کاربر پاک بشه
  else if (data.startsWith("close_list:")) {
    const userMessageId = Number(data.slice("close_list:".length));
    if (messageId) {
      await deleteMessage(env, chatId, messageId);
    }
    if (Number.isInteger(userMessageId) && userMessageId > 0) {
      await deleteMessage(env, chatId, userMessageId);
    }
    await answerCallbackQuery(env, cq.id);
    return;
  }

  // ③.۰ (قدیمی) بستن ساده بدون پاک کردن پیام کاربر — برای سازگاری نگه داشته شده
  else if (data === "close") {
    if (messageId) {
      await deleteMessage(env, chatId, messageId);
    }
    await answerCallbackQuery(env, cq.id);
    return;
  }

  // ③.۱ بستن پیام «نتیجه‌ای پیدا نشد» — هم پیام بات و هم پیام خودِ کاربر (سرچش) پاک بشه
  else if (data.startsWith("close_nores:")) {
    const userMessageId = Number(data.slice("close_nores:".length));
    if (messageId) {
      await deleteMessage(env, chatId, messageId);
    }
    if (Number.isInteger(userMessageId) && userMessageId > 0) {
      await deleteMessage(env, chatId, userMessageId);
    }
    await answerCallbackQuery(env, cq.id);
    return;
  }

  // ③.۲ بستن آهنگِ ارسال‌شده — هم پیام آهنگ و هم پیام سرچِ کاربر پاک بشه
  else if (data.startsWith("close_song:")) {
    const userMessageId = Number(data.slice("close_song:".length));
    if (messageId) {
      await deleteMessage(env, chatId, messageId);
    }
    if (Number.isInteger(userMessageId) && userMessageId > 0) {
      await deleteMessage(env, chatId, userMessageId);
    }
    await answerCallbackQuery(env, cq.id);
    return;
  }

  // ④ دکمه‌ی غیرفعال (شماره صفحه) — فقط برای نمایش
  else if (data === "noop") {
    await answerCallbackQuery(env, cq.id);
    return;
  }

  // ⑤ «نسخه‌های دیگه‌ی این آهنگ» — زیر آهنگی که همین‌جا (با سرچ) تحویل داده شده
  else if (data.startsWith("showver:")) {
    const groupId = Number(data.slice("showver:".length));
    await answerCallbackQuery(env, cq.id);
    if (Number.isInteger(groupId) && groupId > 0) {
      await deliverGroupVersions(env, chatId, groupId, 0);
    }
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
    `SELECT id, chat_id, message_id, title, performer, caption, group_id
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

// پیام «نتیجه‌ای پیدا نشد» با ظاهر مورد نظر (شبیه اسکرین‌شات):
// متن پیام = عبارتی که کاربر سرچ کرده، و دکمه‌ها: «No results»، سه پلتفرم، و «Close»
// userMessageId رو داخل callback_data دکمه‌ی Close می‌ذاریم تا موقع بستن،
// هم پیام خودمون و هم پیام سرچِ کاربر پاک بشه
async function sendNoResultsMessage(env, chatId, userMessageId, queryText) {
  const text = `${queryText}:`;
  const reply_markup = {
    inline_keyboard: [
      [{ text: "No results", callback_data: "noop" }],
      [{ text: "Close", callback_data: `close_nores:${userMessageId}` }],
    ],
  };
  await sendMessage(env, chatId, text, reply_markup);
}

// ساخت متن و دکمه‌های یک صفحه
function buildResultsKeyboard(results, page, q, userMessageId) {
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
    nav.push({
      text: "◀ قبلی",
      callback_data: `page:${safePage - 1}:${userMessageId || 0}:${q}`,
    });
  }
  nav.push({
    text: `${safePage + 1}/${totalPages}`,
    callback_data: "noop",
  });
  if (safePage < totalPages - 1) {
    nav.push({
      text: "بعدی ▶",
      callback_data: `page:${safePage + 1}:${userMessageId || 0}:${q}`,
    });
  }
  if (nav.length) rows.push(nav);

  // ردیف بستن — هم لیست و هم پیام سرچِ کاربر پاک بشه
  rows.push([{ text: "Close", callback_data: `close_list:${userMessageId || 0}` }]);

  const text =
    `${results.length} نتیجه پیدا شد — صفحه ${safePage + 1} از ${totalPages}\n` +
    `کدومو می‌خوای؟ 👇`;

  return { text, reply_markup: { inline_keyboard: rows } };
}

// ارسال صفحه‌ی جدید (پیام تازه)
async function sendResultsPage(env, chatId, results, page, q, userMessageId) {
  const { text, reply_markup } = buildResultsKeyboard(results, page, q, userMessageId);
  await sendMessage(env, chatId, text, reply_markup);
}

// ویرایش پیام فعلی برای نمایش صفحه‌ی جدید
async function editResultsPage(env, chatId, messageId, results, page, q, userMessageId) {
  if (!messageId) {
    await sendResultsPage(env, chatId, results, page, q, userMessageId);
    return;
  }
  const { text, reply_markup } = buildResultsKeyboard(results, page, q, userMessageId);
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
// userMessageId (اختیاری): پیامی که کاربر باهاش سرچ کرده؛ وقتی دکمه‌ی Close
// روی آهنگِ ارسال‌شده زده بشه، هم خودِ آهنگ و هم این پیام پاک می‌شن
async function deliverSong(env, toChatId, song, userMessageId) {
  if (!song.chat_id) {
    await sendMessage(
      env,
      toChatId,
      "این آهنگ قبل از راه‌اندازی کامل سیستم ذخیره شده و قابل ارسال نیست."
    );
    return;
  }

  const rows = [];
  if (song.group_id) {
    rows.push([
      { text: "🎧 نسخه‌های دیگه‌ی این آهنگ", callback_data: `showver:${song.group_id}` },
    ]);
  }
  rows.push([{ text: "Close", callback_data: `close_song:${userMessageId || 0}` }]);
  const reply_markup = { inline_keyboard: rows };

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
        reply_markup,
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

// ── ارسال «نسخه‌های دیگه‌ی یک آهنگ» پشت سر هم ─────────────────
// groupId توسط بات دستیارِ پست‌گذاری (webhook-poster.js) موقع پست کردن
// هر آهنگ توی کانال ساخته/استفاده می‌شه (جدول song_groups)
async function deliverGroupVersions(env, chatId, groupId, userMessageId) {
  const { results } = await env.DB.prepare(
    `SELECT id, chat_id, message_id, title, performer, caption, group_id
     FROM songs
     WHERE group_id = ?1
     ORDER BY id ASC`
  )
    .bind(groupId)
    .all();

  if (!results || results.length === 0) {
    await sendMessage(env, chatId, "نسخه‌ی دیگه‌ای از این آهنگ پیدا نشد 🙁");
    return;
  }

  await sendMessage(
    env,
    chatId,
    `🎧 ${results.length} نسخه از این آهنگ پیدا شد، دارم پشت سر هم برات می‌فرستم...`
  );

  // پشت سر هم و به ترتیب (نه موازی) می‌فرستیم تا توی چت به هم نریزن
  for (const song of results) {
    await deliverSong(env, chatId, song, userMessageId);
  }
}

// ── جوین اجباری ──────────────────────────────────────────────

// چک می‌کنه کاربر عضو چنل اصلی (REQUIRED_CHANNEL_ID) هست یا نه
// نکته: بات باید ادمین همون چنل باشه وگرنه getChatMember خطا می‌ده
async function isMember(env, userId) {
  const channelId = env.REQUIRED_CHANNEL_ID;
  if (!channelId) return true; // اگه ست نشده بود، جوین اجباری غیرفعاله

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.BOT_TOKEN}/getChatMember?chat_id=${encodeURIComponent(
        channelId
      )}&user_id=${userId}`
    );
    const data = await res.json();

    if (!data.ok) {
      // اگه بات ادمین نباشه یا چنل پیدا نشه، به‌جای بلاک کردن همه، اجازه بده
      console.error("getChatMember failed:", data.description);
      return true;
    }

    const status = data.result?.status;
    // left = ترک کرده, kicked = بن شده ⇒ عضو نیست. بقیه‌ی حالت‌ها یعنی عضوه
    return status !== "left" && status !== "kicked";
  } catch (e) {
    console.error("isMember error:", e);
    return true; // در صورت خطای شبکه، کاربر رو بلاک نکن
  }
}

// پیام + دکمه‌ی عضویت و بررسی مجدد رو می‌فرسته
async function sendJoinPrompt(env, chatId) {
  const joinUrl = env.REQUIRED_CHANNEL_URL || "https://t.me/NivaroMusic";

  await sendMessage(
    env,
    chatId,
    "برای استفاده از بات، اول باید عضو چنل ما بشی 👇",
    {
      inline_keyboard: [
        [
          { text: "📢 عضویت در چنل", url: joinUrl },
          { text: "✅ بررسی مجدد", callback_data: "check_join" },
        ],
      ],
    }
  );
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
