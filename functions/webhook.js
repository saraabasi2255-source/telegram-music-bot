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
     ON CONFLICT(chat_id, message_id) DO UPDATE SET
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
  const userId = msg.from?.id;
  const text = (msg.text || "").trim();

  // ── جوین اجباری: قبل از هر چیزی (حتی /start) عضویت رو چک کن ──
  if (userId && !(await isMember(env, userId))) {
    await sendJoinPrompt(env, chatId);
    return;
  }

  if (text.startsWith("/start")) {
    const payload = text.slice("/start".length).trim();

    // اومده از دکمه‌ی «جستجوی این آهنگ» ⇒ فرمت: /start q_<linkId>
    // (بات دستیارِ پست‌گذاری وقتی پست می‌سازه، اسمِ آهنگ رو توی جدول
    // search_links ذخیره می‌کنه و فقط شماره‌ش رو توی لینک می‌ذاره، چون
    // لینک‌های تلگرام کاراکترهای فارسی رو قبول نمی‌کنن)
    if (payload.startsWith("q_")) {
      const linkId = Number(payload.slice("q_".length));
      if (Number.isInteger(linkId) && linkId > 0) {
        const link = await env.DB.prepare(`SELECT query FROM search_links WHERE id = ?1`)
          .bind(linkId)
          .first();
        if (link && link.query) {
          const results = await searchSongs(env, link.query, 100);
          if (results.length === 0) {
            await sendNoResultsMessage(env, chatId, null, link.query);
          } else if (results.length === 1) {
            await deliverSong(env, chatId, results[0], null);
          } else {
            await sendResultsPage(env, chatId, results, 0, link.query, null);
          }
          return;
        }
      }
    }

    // اومده از دکمه‌ی قدیمی‌تر «نسخه‌های دیگه‌ی این آهنگ» ⇒ فرمت: /start ver_<groupId>
    if (payload.startsWith("ver_")) {
      const groupId = Number(payload.slice("ver_".length));
      if (Number.isInteger(groupId) && groupId > 0) {
        await sendGroupVersions(env, chatId, groupId);
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
      `SELECT id, chat_id, message_id, title, performer, caption FROM songs WHERE id = ?1`
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

  await answerCallbackQuery(env, cq.id);
}

// ── نرمال‌سازی متن فارسی/عربی ──────────────────────────────────
// خیلی از «پیدا نشدن»ها به‌خاطر اینه که کاربر یا فایل از یه شکلِ دیگه‌ی
// همون حرف استفاده کرده (ی عربی به‌جای ی فارسی، ك عربی به‌جای ک فارسی،
// اعراب، نیم‌فاصله، اعداد عربی/فارسی و ...) که از نظر ظاهری فرقی ندارن
// ولی از نظر کدِ کامپیوتری کاملا متفاوتن. این تابع همه‌شونو یکی می‌کنه.
function normalizeText(s) {
  if (!s) return "";
  return s
    .toString()
    .replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED\u0670]/g, "") // اعراب/تشکیل
    .replace(/[إأآا]/g, "ا")
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ی")
    .replace(/[\u200c\u200e\u200f]/g, " ") // نیم‌فاصله و کاراکترهای جهت‌دار
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // علائم نگارشی حذف بشه، فقط حرف/عدد/فاصله بمونه
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s) {
  return normalizeText(s).split(" ").filter(Boolean);
}

// فاصله‌ی ویرایشیِ دو رشته (چند حرف باید عوض/اضافه/کم بشه تا یکی بشن) —
// برای تحمل اشتباه تایپیِ جزئی استفاده می‌شه
function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prevDiag = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1));
      prevDiag = temp;
    }
  }
  return dp[n];
}

// دو کلمه رو «تقریبا یکی» حساب می‌کنه اگه فرقشون فقط یکی-دو حرفِ جزئی
// باشه (اشتباه تایپی)، نه یه کلمه‌ی کاملا متفاوت
function wordsAreClose(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true; // مثلا جمع/مفرد یا زیرمجموعه
  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 3) return false; // کلمه‌های خیلی کوتاه رو fuzzy نکن، اشتباه تشخیص می‌ده
  const dist = levenshtein(a, b);
  return dist <= Math.max(1, Math.floor(maxLen * 0.2));
}

// تعداد آیتم در هر صفحه
const PAGE_SIZE = 7;

// جستجو در دیتابیس (تا سقف limit)
//
// روش کار: به‌جای LIKE ساده (که به فونت حساسه و فقط یه ستون رو چک می‌کنه)،
// عبارتِ جستجو رو کلمه‌کلمه می‌کنیم و برای هر آهنگ چک می‌کنیم که همه‌ی
// کلمه‌های جستجو (چه از اسم آهنگ باشن چه خواننده، به هر ترتیبی که نوشته
// شده باشن) یه‌جایی توی عنوان/خواننده/نام‌فایل/کپشنِ اون آهنگ پیدا بشن —
// با تحمل نسبت به تفاوت حروف عربی/فارسی و اشتباه تایپیِ جزئی.
async function searchSongs(env, q, limit = 100) {
  const queryTokens = tokenize(q);
  if (queryTokens.length === 0) return [];

  const { results } = await env.DB.prepare(
    `SELECT id, chat_id, message_id, title, performer, caption, file_name FROM songs`
  ).all();

  const scored = [];
  for (const row of results) {
    const rowTokens = tokenize(
      [row.title, row.performer, row.file_name, row.caption].filter(Boolean).join(" ")
    );
    if (rowTokens.length === 0) continue;

    let allMatched = true;
    let exactCount = 0;
    for (const qt of queryTokens) {
      const hit = rowTokens.some((rt) => {
        if (rt === qt || rt.includes(qt) || qt.includes(rt)) {
          exactCount++;
          return true;
        }
        return wordsAreClose(rt, qt);
      });
      if (!hit) {
        allMatched = false;
        break;
      }
    }
    if (!allMatched) continue;

    scored.push({ row, exactCount, len: (row.title || row.file_name || "").length });
  }

  // اول اونایی که دقیق‌تر مطابقت داشتن، بعد اسم‌های کوتاه‌تر (احتمالا دقیق‌تر)
  scored.sort((a, b) => b.exactCount - a.exactCount || a.len - b.len);

  return scored.slice(0, limit).map((s) => s.row);
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

// همه‌ی نسخه‌های ثبت‌شده‌ی یه گروه آهنگ (مثلا نرمال + اسپید + اسلو) رو
// پشت‌سرهم برای کاربر می‌فرسته — از دکمه‌ی «نسخه‌های دیگه‌ی این آهنگ»
// (که بات دستیارِ پست‌گذاری می‌سازه) صدا زده می‌شه: /start ver_<groupId>
async function sendGroupVersions(env, chatId, groupId) {
  const { results } = await env.DB.prepare(
    `SELECT id, chat_id, message_id, title, performer, caption
     FROM songs
     WHERE group_id = ?1
     ORDER BY id ASC`
  )
    .bind(groupId)
    .all();

  if (!results || results.length === 0) {
    await sendMessage(env, chatId, "نسخه‌ای برای این آهنگ پیدا نشد 🙁");
    return;
  }

  await sendMessage(env, chatId, `🎧 ${results.length} نسخه از این آهنگ پیدا شد:`);

  for (const song of results) {
    await deliverSong(env, chatId, song, 0);
  }
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

  const reply_markup = {
    inline_keyboard: [
      [{ text: "Close", callback_data: `close_song:${userMessageId || 0}` }],
    ],
  };

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
