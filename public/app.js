const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const input = document.getElementById("search-input");
const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");

let debounceTimer = null;

input.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  const q = input.value.trim();

  if (!q) {
    resultsEl.innerHTML = "";
    statusEl.textContent = "";
    return;
  }

  statusEl.textContent = "در حال جستجو...";
  debounceTimer = setTimeout(() => runSearch(q), 300);
});

async function runSearch(q) {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    renderResults(data.results || []);
  } catch (e) {
    statusEl.textContent = "خطا در جستجو، دوباره امتحان کن";
  }
}

function renderResults(items) {
  resultsEl.innerHTML = "";

  if (items.length === 0) {
    statusEl.textContent = "";
    resultsEl.innerHTML = `<div class="empty-state">چیزی پیدا نشد 🎧</div>`;
    return;
  }

  statusEl.textContent = `${items.length} نتیجه`;

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "song-item";

    // بخش اصلی (آیکون + عنوان/خواننده) — کلیکش مثل قبل، از کانال آرشیو باز می‌کنه
    const main = document.createElement(item.link ? "a" : "div");
    main.className = "song-main";
    if (item.link) {
      main.href = item.link;
      main.target = "_blank";
      main.rel = "noopener";
    }
    main.innerHTML = `
      <div class="song-note">♪</div>
      <div class="song-text">
        <div class="song-title">${escapeHtml(item.title)}</div>
        ${item.performer ? `<div class="song-performer">${escapeHtml(item.performer)}</div>` : ""}
      </div>
    `;
    if (item.link) {
      main.addEventListener("click", (e) => {
        openLink(e, item.link);
      });
    }
    li.appendChild(main);

    // دکمه‌ی «ارسال از ربات» — به‌جای باز کردن از کانال آرشیو، همین آهنگ
    // رو مستقیم توی چتِ بات برای کاربر می‌فرسته (لینک song_<src>_<id>)
    if (item.botLink) {
      const botBtn = document.createElement("button");
      botBtn.type = "button";
      botBtn.className = "song-bot-btn";
      botBtn.title = "دریافت از ربات";
      botBtn.setAttribute("aria-label", "دریافت از ربات");
      botBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M21 3 3 10.5l6.5 2.5M21 3l-6 18-4.5-8M21 3 9.5 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      `;
      botBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLink(e, item.botLink);
      });
      li.appendChild(botBtn);
    }

    resultsEl.appendChild(li);
  }
}

// وقتی داخل مینی‌اپ تلگرام باز شده باشیم، لینک‌های t.me رو با
// openTelegramLink باز می‌کنیم (تجربه‌ی روان‌تر)؛ بیرون از تلگرام، لینک
// معمولی خودش کار می‌کنه.
function openLink(e, url) {
  if (!url) return;
  if (tg) {
    e.preventDefault();
    tg.openTelegramLink(url);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
