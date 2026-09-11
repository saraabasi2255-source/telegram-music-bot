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
    const a = document.createElement("a");
    a.className = "song-item";
    a.href = item.link;
    a.target = "_blank";
    a.rel = "noopener";

    a.innerHTML = `
      <div class="song-note">♪</div>
      <div class="song-text">
        <div class="song-title">${escapeHtml(item.title)}</div>
        ${item.performer ? `<div class="song-performer">${escapeHtml(item.performer)}</div>` : ""}
      </div>
    `;

    a.addEventListener("click", (e) => {
      if (tg) {
        e.preventDefault();
        tg.openTelegramLink(item.link);
      }
      // اگه بیرون از تلگرام باز شده، لینک معمولی خودش کار می‌کنه
    });

    resultsEl.appendChild(a);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
