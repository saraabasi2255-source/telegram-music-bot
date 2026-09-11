// GET /api/admin?key=WEBHOOK_SECRET
// صفحه‌ی پنل ادمین: لیست آهنگ‌ها + لینک مستقیم به پیام چنل + حذف

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!env.WEBHOOK_SECRET || key !== env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>پنل مدیریت آهنگ‌ها</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: Tahoma, sans-serif;
    background: #0f1720;
    color: #e8eef5;
    margin: 0;
    padding: 20px;
  }
  h1 { font-size: 20px; margin: 0 0 16px; }
  .topbar {
    display: flex; justify-content: space-between; align-items: center;
    flex-wrap: wrap; gap: 10px; margin-bottom: 16px;
  }
  .stats { color: #8aa0b4; font-size: 14px; }
  input[type="text"] {
    background: #1b2531; border: 1px solid #2b3a4a; color: #e8eef5;
    padding: 8px 12px; border-radius: 8px; width: 260px; font-family: inherit;
  }
  .btn {
    background: #2563eb; color: #fff; border: 0; padding: 8px 14px;
    border-radius: 8px; cursor: pointer; font-family: inherit; font-size: 14px;
  }
  .btn:hover { opacity: .9; }
  .btn-danger { background: #dc2626; }
  .btn-open { background: #0ea5e9; }
  table {
    width: 100%; border-collapse: collapse; background: #131b25;
    border-radius: 10px; overflow: hidden; font-size: 14px;
  }
  th, td {
    padding: 10px 12px; text-align: right; border-bottom: 1px solid #1f2a38;
    vertical-align: top;
  }
  th { background: #1b2531; color: #9fb3c8; font-weight: normal; font-size: 13px; }
  tr:hover td { background: #172230; }
  .muted { color: #7b8ea3; font-size: 12px; }
  .empty { text-align: center; padding: 40px; color: #7b8ea3; }
  .toast {
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: #16a34a; color: #fff; padding: 10px 18px; border-radius: 8px;
    opacity: 0; transition: .3s; pointer-events: none; font-size: 14px;
  }
  .toast.show { opacity: 1; }
  .toast.error { background: #dc2626; }
  a { color: #60a5fa; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .key-cell { font-family: monospace; font-size: 12px; color: #7b8ea3; word-break: break-all; }
  .title-link {
    color: #e8eef5; font-weight: bold; text-decoration: none;
    display: inline-flex; align-items: center; gap: 6px;
  }
  .title-link:hover { color: #60a5fa; text-decoration: underline; }
  .title-link .arr { opacity: .5; font-size: 12px; }
  .actions { display: flex; gap: 6px; flex-wrap: wrap; }
</style>
</head>
<body>
  <div class="topbar">
    <div>
      <h1>🎵 پنل مدیریت آهنگ‌های آرشیو</h1>
      <div class="stats" id="stats">در حال بارگذاری...</div>
    </div>
    <div>
      <input type="text" id="q" placeholder="جستجو در لیست..." />
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:50px">#</th>
        <th>عنوان</th>
        <th>خواننده</th>
        <th>نام فایل</th>
        <th style="width:70px">مدت</th>
        <th style="width:120px">چت آیدی</th>
        <th style="width:90px">پیام</th>
        <th style="width:160px">تاریخ</th>
        <th style="width:200px">عملیات</th>
      </tr>
    </thead>
    <tbody id="rows">
      <tr><td colspan="9" class="empty">در حال بارگذاری...</td></tr>
    </tbody>
  </table>

  <div class="toast" id="toast"></div>

<script>
  const KEY = new URLSearchParams(location.search).get("key") || "";
  const qInput = document.getElementById("q");
  const rowsEl = document.getElementById("rows");
  const statsEl = document.getElementById("stats");
  const toastEl = document.getElementById("toast");

  let allSongs = [];

  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.className = "toast show" + (isError ? " error" : "");
    setTimeout(() => { toastEl.className = "toast"; }, 2500);
  }

  function fmtDuration(s) {
    if (!s) return "-";
    const m = Math.floor(s / 60);
    const sec = String(s % 60).padStart(2, "0");
    return m + ":" + sec;
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
  }

  // ساخت لینک مستقیم به پیام توی چنل خصوصی تلگرام
  // chat_id مثل -1004458074153 → لینک: https://t.me/c/4458074153/<message_id>
  function buildTelegramLink(chatId, messageId) {
    if (!chatId || !messageId) return null;
    const s = String(chatId);
    // حذف پیشوند -100 برای چنل‌های خصوصی
    const shortId = s.startsWith("-100") ? s.slice(4) : s.replace("-", "");
    return "https://t.me/c/" + shortId + "/" + messageId;
  }

  async function load() {
    try {
      const res = await fetch("/api/admin/list?key=" + encodeURIComponent(KEY));
      if (!res.ok) throw new Error("خطا در دریافت لیست (" + res.status + ")");
      const data = await res.json();
      allSongs = data.songs || [];
      statsEl.textContent = "تعداد کل: " + allSongs.length + " آهنگ";
      render();
    } catch (e) {
      rowsEl.innerHTML = '<tr><td colspan="9" class="empty">' + esc(e.message) + '</td></tr>';
      statsEl.textContent = "";
    }
  }

  function render() {
    const q = qInput.value.trim().toLowerCase();
    const list = q
      ? allSongs.filter(s =>
          (s.title || "").toLowerCase().includes(q) ||
          (s.performer || "").toLowerCase().includes(q) ||
          (s.file_name || "").toLowerCase().includes(q) ||
          (s.caption || "").toLowerCase().includes(q)
        )
      : allSongs;

    if (list.length === 0) {
      rowsEl.innerHTML = '<tr><td colspan="9" class="empty">چیزی پیدا نشد.</td></tr>';
      return;
    }

    rowsEl.innerHTML = list.map(s => {
      const tgLink = buildTelegramLink(s.chat_id, s.message_id);
      const titleInner = esc(s.title) || "<span class='muted'>—</span>";
      const titleHtml = tgLink
        ? \`<a class="title-link" href="\${tgLink}" target="_blank" rel="noopener" title="باز کردن در تلگرام">\${titleInner} <span class="arr">↗</span></a>\`
        : titleInner;

      const openBtn = tgLink
        ? \`<a class="btn btn-open" href="\${tgLink}" target="_blank" rel="noopener">باز کردن ↗</a>\`
        : "";

      return \`
      <tr data-id="\${s.id}">
        <td class="muted">\${s.id}</td>
        <td>\${titleHtml}</td>
        <td>\${esc(s.performer) || "<span class='muted'>—</span>"}</td>
        <td class="key-cell">\${esc(s.file_name) || "—"}</td>
        <td>\${fmtDuration(s.duration)}</td>
        <td class="key-cell">\${esc(s.chat_id)}</td>
        <td class="key-cell">\${esc(s.message_id)}</td>
        <td class="muted">\${esc(s.created_at)}</td>
        <td>
          <div class="actions">
            \${openBtn}
            <button class="btn btn-danger" onclick="del(\${s.id})">حذف</button>
          </div>
        </td>
      </tr>\`;
    }).join("");
  }

  async function del(id) {
    if (!confirm("مطمئنی می‌خوای آهنگ #" + id + " رو از دیتابیس حذف کنی؟\\n(پیام توی چنل آرشیو دست نمی‌خوره)")) return;
    try {
      const res = await fetch("/api/admin/delete?key=" + encodeURIComponent(KEY), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "حذف نشد");
      allSongs = allSongs.filter(s => s.id !== id);
      statsEl.textContent = "تعداد کل: " + allSongs.length + " آهنگ";
      render();
      toast("حذف شد ✅");
    } catch (e) {
      toast(e.message, true);
    }
  }

  qInput.addEventListener("input", render);
  load();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
