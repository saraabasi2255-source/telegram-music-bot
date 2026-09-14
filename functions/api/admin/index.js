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
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Song Archive Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#0a0f1a;
    --surface:#121a2b;
    --surface-2:#182338;
    --border:#223049;
    --border-soft:#1a2438;
    --text:#eaf0fa;
    --text-dim:#9db0c9;
    --text-faint:#5f7291;
    --accent:#5b8cff;
    --accent-soft:#5b8cff26;
    --teal:#2dd4bf;
    --teal-soft:#2dd4bf22;
    --danger:#f2536a;
    --danger-soft:#f2536a20;
    --radius-lg:16px;
    --radius-md:10px;
    --radius-sm:7px;
    --font: "Inter", -apple-system, Segoe UI, sans-serif;
    --mono: ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace;
  }

  * { box-sizing: border-box; }

  body {
    font-family: var(--font);
    background:
      radial-gradient(1100px 500px at 15% -10%, #16213a 0%, transparent 60%),
      radial-gradient(900px 460px at 100% 0%, #10233a 0%, transparent 55%),
      var(--bg);
    color: var(--text);
    margin: 0;
    padding: 22px 22px 60px;
    min-height: 100vh;
  }

  .wrap { max-width: 1180px; margin: 0 auto; }

  .topbar {
    position: sticky; top: 12px; z-index: 20;
    display: flex; justify-content: space-between; align-items: center;
    flex-wrap: wrap; gap: 14px;
    background: rgba(18,26,43,.86);
    backdrop-filter: blur(10px);
    border: 1px solid var(--border-soft);
    border-radius: var(--radius-lg);
    padding: 16px 20px;
    margin-bottom: 20px;
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-icon {
    width: 38px; height: 38px; border-radius: 11px; flex-shrink: 0;
    background: linear-gradient(145deg, var(--accent), #7c5cff);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 6px 18px -6px #5b8cff88;
  }
  h1 { font-size: 16px; font-weight: 700; margin: 0; letter-spacing: -.01em; }
  .stats {
    color: var(--text-dim); font-size: 12.5px; margin-top: 3px;
    display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
  }
  .stats b { color: var(--text); font-weight: 600; }
  .stats .dot { color: var(--text-faint); }

  .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

  .search-box { position: relative; display: flex; align-items: center; }
  .search-box svg {
    position: absolute; left: 12px; width: 15px; height: 15px;
    color: var(--text-faint); pointer-events: none;
  }
  input[type="text"] {
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
    padding: 9px 14px 9px 34px; border-radius: var(--radius-md); width: 210px;
    font-family: inherit; font-size: 13.5px; transition: border-color .15s, width .2s;
  }
  input[type="text"]:focus { outline: none; border-color: var(--accent); width: 240px; }
  input[type="text"]::placeholder { color: var(--text-faint); }

  select {
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text);
    padding: 9px 12px; border-radius: var(--radius-md); font-family: inherit;
    font-size: 13px; cursor: pointer;
  }
  select:focus { outline: none; border-color: var(--accent); }

  .icon-btn {
    background: var(--surface-2); border: 1px solid var(--border); color: var(--text-dim);
    width: 34px; height: 34px; border-radius: var(--radius-md); cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: color .15s, border-color .15s, transform .15s;
  }
  .icon-btn:hover { color: var(--text); border-color: var(--accent); }
  .icon-btn:active { transform: scale(.92); }
  .icon-btn svg { width: 16px; height: 16px; }
  .icon-btn.spin svg { animation: spin .6s linear; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .btn {
    border: 0; padding: 8px 14px; border-radius: var(--radius-sm); cursor: pointer;
    font-family: inherit; font-size: 12.5px; font-weight: 600;
    transition: filter .15s, transform .15s; display: inline-flex; align-items: center; gap: 5px;
  }
  .btn:active { transform: scale(.96); }
  .btn svg { width: 13px; height: 13px; }
  .btn-danger { background: var(--danger-soft); color: var(--danger); border: 1px solid #f2536a3d; }
  .btn-danger:hover { background: var(--danger); color: #fff; }
  .btn-open { background: var(--teal-soft); color: var(--teal); border: 1px solid #2dd4bf3d; text-decoration: none; }
  .btn-open:hover { background: var(--teal); color: #06201c; }
  .btn-ghost { background: transparent; color: var(--text-dim); border: 1px solid var(--border); }
  .btn-ghost:hover { color: var(--text); border-color: var(--accent); }
  .btn-copy { background: transparent; color: var(--text-faint); border: 1px solid var(--border); padding: 8px 9px; }
  .btn-copy:hover { color: var(--accent); border-color: var(--accent); }

  .icon-btn.active { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }

  .selection-bar {
    display: none; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;
    background: var(--surface); border: 1px solid var(--border-soft); border-radius: var(--radius-lg);
    padding: 10px 16px; margin-bottom: 16px; font-size: 13px;
  }
  .selection-bar.show { display: flex; }
  .selection-bar-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .selection-bar .btn-ghost, .selection-bar .btn { padding: 7px 13px; font-size: 12.5px; }
  #selectDeleteBtn:disabled { opacity: .4; cursor: not-allowed; pointer-events: none; }

  .title-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .title-line .title-cell { min-width: 0; }
  .row-checkbox {
    width: 18px; height: 18px; border: 1.5px solid var(--border); border-radius: 5px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: background .15s, border-color .15s;
  }
  .row-checkbox svg { width: 11px; height: 11px; color: #fff; display: none; }
  .row-checkbox.checked { background: var(--accent); border-color: var(--accent); }
  .row-checkbox.checked svg { display: block; }
  tbody tr.song-row.selected { background: var(--accent-soft); }
  .is-selecting .chevron-cell .chevron-btn { visibility: hidden; pointer-events: none; }

  .table-shell {
    background: var(--surface); border: 1px solid var(--border-soft);
    border-radius: var(--radius-lg); overflow: hidden;
  }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { padding: 11px 14px; text-align: left; vertical-align: middle; }
  thead th {
    background: var(--surface-2); color: var(--text-faint); font-weight: 600;
    font-size: 11.5px; border-bottom: 1px solid var(--border);
    user-select: none; white-space: nowrap;
  }
  th.sortable { cursor: pointer; transition: color .15s; }
  th.sortable:hover { color: var(--text); }
  th.sortable .arrow { display: inline-block; margin-left: 4px; opacity: .3; font-size: 10px; }
  th.sortable.active .arrow { opacity: 1; color: var(--accent); }

  tbody tr.song-row { border-bottom: 1px solid var(--border-soft); transition: background .12s; cursor: pointer; }
  tbody tr.song-row:hover { background: var(--surface-2); }
  tbody tr.detail-row { background: #0d1524; border-bottom: 1px solid var(--border-soft); }
  tbody tr.detail-row.hidden { display: none; }

  .muted { color: var(--text-faint); font-size: 12px; }
  .empty { text-align: center; padding: 56px 20px; color: var(--text-faint); }
  .empty svg { width: 34px; height: 34px; margin-bottom: 10px; opacity: .5; }

  .title-cell { font-weight: 600; color: var(--text); }
  .artist-cell { color: var(--text-dim); display: none; }

  .dur-pill {
    display: inline-flex; align-items: center; gap: 5px;
    background: var(--surface-2); border: 1px solid var(--border);
    padding: 3px 9px; border-radius: 999px; font-size: 12px; color: var(--text-dim);
    font-family: var(--mono);
  }

  .dup-badge {
    display: inline-flex; align-items: center;
    background: var(--danger-soft); border: 1px solid var(--danger);
    color: var(--danger);
    padding: 1px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 700;
    margin-inline-start: 6px; letter-spacing: .02em;
  }

  .checkbox-label {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 13px; color: var(--text-dim); cursor: pointer; user-select: none;
    background: var(--surface); border: 1px solid var(--border);
    padding: 8px 12px; border-radius: var(--radius-sm);
  }
  .checkbox-label input { accent-color: var(--danger); width: 14px; height: 14px; cursor: pointer; }

  .chevron-cell { width: 34px; text-align: right; }
  .chevron-btn {
    background: transparent; border: 0; color: var(--text-faint); cursor: pointer;
    padding: 4px; display: flex; align-items: center; justify-content: center;
    transition: transform .18s, color .15s;
  }
  .chevron-btn svg { width: 15px; height: 15px; }
  .song-row.open .chevron-btn { transform: rotate(180deg); color: var(--accent); }

  .detail-grid {
    display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 14px;
    padding: 14px 4px 4px;
  }
  .detail-label { display: block; color: var(--text-faint); font-size: 10.5px; margin-bottom: 3px; }
  .detail-value { font-family: var(--mono); font-size: 12.5px; color: var(--text-dim); word-break: break-all; }
  .detail-actions { display: flex; gap: 6px; flex-wrap: wrap; padding: 14px 4px 4px; }

  .pager {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-top: 1px solid var(--border-soft);
    background: var(--surface-2); font-size: 12.5px; color: var(--text-dim); gap: 10px; flex-wrap: wrap;
  }
  .pager-btns { display: flex; gap: 6px; align-items: center; }
  .pager .btn-ghost { padding: 6px 12px; font-size: 12.5px; }
  .pager .btn-ghost:disabled { opacity: .4; cursor: not-allowed; }

  .toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(10px);
    background: #16a34a; color: #fff; padding: 11px 20px; border-radius: 10px;
    opacity: 0; transition: opacity .25s, transform .25s; pointer-events: none; font-size: 13.5px;
    display: flex; align-items: center; gap: 8px; box-shadow: 0 10px 30px -8px #000a; z-index: 50;
  }
  .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  .toast.error { background: var(--danger); }

  .modal-backdrop {
    position: fixed; inset: 0; background: #05070ecc; backdrop-filter: blur(3px);
    display: flex; align-items: center; justify-content: center; z-index: 60;
    opacity: 0; pointer-events: none; transition: opacity .18s;
  }
  .modal-backdrop.show { opacity: 1; pointer-events: auto; }
  .modal {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg);
    padding: 22px; width: 320px; max-width: 90vw; transform: scale(.94) translateY(6px);
    transition: transform .18s; text-align: center;
  }
  .modal-backdrop.show .modal { transform: scale(1) translateY(0); }
  .modal-icon {
    width: 42px; height: 42px; border-radius: 50%; background: var(--danger-soft);
    color: var(--danger); display: flex; align-items: center; justify-content: center;
    margin: 0 auto 14px;
  }
  .modal p { font-size: 13.5px; color: var(--text-dim); margin: 0 0 18px; line-height: 1.7; }
  .modal p b { color: var(--text); }
  .modal-btns { display: flex; gap: 8px; }
  .modal-btns .btn, .modal-btns .btn-ghost { flex: 1; justify-content: center; padding: 9px; }

  .error-banner {
    background: #7f1d1d; color: #fff; padding: 12px 16px; border-radius: 10px;
    margin-bottom: 16px; font-family: var(--mono); font-size: 12.5px;
    white-space: pre-wrap; word-break: break-all; display: none;
  }
  .error-banner.show { display: block; }

  @media (max-width: 760px) {
    body { padding: 14px 12px 50px; }
    .topbar { position: static; padding: 14px; }
    .controls { width: 100%; flex-wrap: wrap; }
    .controls select { flex: 1 1 auto; min-width: 0; }
    .search-box { flex: 1 1 100%; order: 3; }
    .search-box, input[type="text"] { width: 100%; }
    #refreshBtn { order: 4; margin-left: auto; }

    thead { display: none; }
    table, tbody, tr, td { display: block; width: 100%; }

    tbody tr.song-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 11px 10px 11px 20px; border-bottom: 1px solid var(--border-soft);
      gap: 8px;
    }
    tbody tr.song-row td { padding: 0; border: 0; width: auto; }
    td.cell-main { flex: 1; min-width: 0; }
    td.cell-artist { display: none; }
    .title-cell { display: block; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .artist-cell { display: block !important; font-size: 12px; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    td.cell-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; padding-left: 0; }
    td.cell-meta .muted { font-size: 10.5px; white-space: nowrap; }
    .dur-pill { padding: 2px 6px; font-size: 10.5px; }
    td.chevron-cell { flex-shrink: 0; width: auto; }

    tbody tr.detail-row td { padding: 0 10px 12px 20px; }
    .detail-grid { grid-template-columns: 1fr 1fr; gap: 10px 14px; }
    .detail-actions { flex-direction: column; align-items: stretch; }
    .detail-actions .btn, .detail-actions .btn-copy { justify-content: center; width: 100%; }

    .pager { flex-direction: column; align-items: stretch; text-align: center; gap: 12px; padding: 14px; }
    .pager-btns { flex-wrap: wrap; justify-content: center; gap: 8px; }
    .pager-btns label { width: 100%; justify-content: center; }
    .pager-btns #prevPage, .pager-btns #nextPage { flex: 1 1 0; min-width: 90px; }
    .pager-btns #pageIndicator { width: 100%; order: 3; }

    .selection-bar { flex-direction: column; align-items: stretch; gap: 10px; }
    .selection-bar-right { justify-content: space-between; }
    .selection-bar-right .btn-ghost, .selection-bar-right .btn { flex: 1; justify-content: center; }
  }
</style>
</head>
<body>
<div class="wrap">

  <div class="error-banner" id="errorBanner"></div>

  <div class="topbar">
    <div class="brand">
      <div class="brand-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 18V5l12-2v13" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="#fff" stroke-width="1.8"/><circle cx="18" cy="16" r="3" stroke="#fff" stroke-width="1.8"/></svg>
      </div>
      <div>
        <h1>Song Archive Admin</h1>
        <div class="stats" id="stats">Loading...</div>
      </div>
    </div>

    <div class="controls">
      <label class="checkbox-label">
        <input type="checkbox" id="duplicatesOnly" />
        Duplicates only
      </label>
      <select id="channelFilter">
        <option value="">All channels</option>
      </select>
      <select id="performerFilter">
        <option value="">All artists</option>
      </select>
      <select id="sortSelect">
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="title">Title (A-Z)</option>
        <option value="artist">Artist (A-Z)</option>
      </select>
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m21 21-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="text" id="q" placeholder="Search title or artist..." />
      </div>
      <button class="icon-btn" id="selectModeBtn" title="Select multiple">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 18h8"/></svg>
      </button>
      <button class="icon-btn" id="refreshBtn" title="Refresh list">
        <svg viewBox="0 0 24 24" fill="none"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  </div>

  <div class="selection-bar" id="selectionBar">
    <button class="btn-ghost" id="selectAllBtn">Select all</button>
    <div class="selection-bar-right">
      <span id="selectionCount" class="muted">0 selected</span>
      <button class="btn-ghost" id="selectCancelBtn">Cancel</button>
      <button class="btn btn-danger" id="selectDeleteBtn" style="background:var(--danger);color:#fff;border:0;">Delete selected</button>
    </div>
  </div>

  <div class="table-shell">
    <table>
      <thead>
        <tr>
          <th class="sortable" data-key="title">Title<span class="arrow">▲</span></th>
          <th class="sortable" data-key="performer" style="width:170px">Artist<span class="arrow">▲</span></th>
          <th class="sortable" data-key="duration" style="width:90px">Duration<span class="arrow">▲</span></th>
          <th class="sortable" data-key="created_at" style="width:110px">Date<span class="arrow">▲</span></th>
          <th style="width:34px"></th>
        </tr>
      </thead>
      <tbody id="rows">
        <tr><td colspan="5" class="empty">Loading...</td></tr>
      </tbody>
    </table>
    <div class="pager" id="pager">
      <div id="pagerInfo"></div>
      <div class="pager-btns">
        <label class="muted" style="display:flex;align-items:center;gap:6px;">
          Per page
          <select id="pageSizeSelect">
            <option value="10">10</option>
            <option value="15" selected>15</option>
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <button class="btn-ghost" id="prevPage">Previous</button>
        <span id="pageIndicator" class="muted"></span>
        <button class="btn-ghost" id="nextPage">Next</button>
      </div>
    </div>
  </div>

</div>

<div class="toast" id="toast"></div>

<div class="modal-backdrop" id="confirmModal">
  <div class="modal">
    <div class="modal-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </div>
    <p>Delete <b id="confirmTitle"></b>?<br>This action cannot be undone.</p>
    <div class="modal-btns">
      <button class="btn-ghost" id="confirmCancel">Cancel</button>
      <button class="btn" id="confirmOk" style="background:var(--danger);color:#fff;">Delete</button>
    </div>
  </div>
</div>

<script>
  // ---------- global error handlers ----------
  function showError(msg) {
    var b = document.getElementById("errorBanner");
    if (!b) return;
    b.textContent = "ERROR: " + msg;
    b.classList.add("show");
  }
  window.addEventListener("error", function (e) {
    showError(e.message + " @ " + (e.filename || "") + ":" + (e.lineno || ""));
  });
  window.addEventListener("unhandledrejection", function (e) {
    showError((e.reason && e.reason.message) || String(e.reason));
  });

  var KEY = new URLSearchParams(location.search).get("key") || "";
  var qInput = document.getElementById("q");
  var rowsEl = document.getElementById("rows");
  var statsEl = document.getElementById("stats");
  var toastEl = document.getElementById("toast");
  var performerFilter = document.getElementById("performerFilter");
  var channelFilter = document.getElementById("channelFilter");
  var duplicatesOnly = document.getElementById("duplicatesOnly");
  var sortSelect = document.getElementById("sortSelect");
  var pagerEl = document.getElementById("pager");
  var pagerInfo = document.getElementById("pagerInfo");
  var pageIndicator = document.getElementById("pageIndicator");
  var refreshBtn = document.getElementById("refreshBtn");
  var pageSizeSelect = document.getElementById("pageSizeSelect");
  var selectModeBtn = document.getElementById("selectModeBtn");
  var selectionBar = document.getElementById("selectionBar");
  var selectionCount = document.getElementById("selectionCount");
  var selectAllBtn = document.getElementById("selectAllBtn");
  var selectCancelBtn = document.getElementById("selectCancelBtn");
  var selectDeleteBtn = document.getElementById("selectDeleteBtn");

  var allSongs = [];
  var channelLabels = {};
  var duplicateTitles = new Set();
  var currentPage = 1;
  var PAGE_SIZE = 15;
  var pendingDeleteId = null;
  var pendingBulkDelete = false;
  var openDetailId = null;
  var selectionMode = false;
  var selectedIds = new Set();
  var currentPageIds = [];

  function fetchWithTimeout(url, opts, ms) {
    opts = opts || {};
    ms = ms || 12000;
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, ms);
    var merged = Object.assign({}, opts, { signal: ctrl.signal });
    return fetch(url, merged).finally(function () { clearTimeout(t); });
  }

  function toast(msg, isError) {
    toastEl.innerHTML = (isError
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#fff" stroke-width="2"/><path d="M12 8v5M12 16h.01" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>'
      : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    ) + '<span>' + esc(msg) + '</span>';
    toastEl.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toastEl.className = "toast"; }, 2500);
  }

  function fmtDuration(s) {
    if (!s) return "-";
    var m = Math.floor(s / 60);
    var sec = String(s % 60).padStart(2, "0");
    return m + ":" + sec;
  }

  function fmtTotalDuration(totalSeconds) {
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds % 3600) / 60);
    if (h > 0) return h + "h " + m + "m";
    return m + "m";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function buildTelegramLink(chatId, messageId) {
    if (!chatId || !messageId) return null;
    var s = String(chatId);
    var shortId = s.indexOf("-100") === 0 ? s.slice(4) : s.replace("-", "");
    return "https://t.me/c/" + shortId + "/" + messageId;
  }

  function splitPerformers(performer) {
    if (!performer) return [];
    return performer
      .split(/\\s*&\\s*|\\s*,\\s*|\\s*،\\s*|\\s*\\/\\s*|\\s*\\+\\s*|\\s+vs\\.?\\s+|\\s+feat\\.?\\s+|\\s+ft\\.?\\s+|\\s+featuring\\s+|\\s+و\\s+/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  function computeDuplicateTitles() {
    var counts = {};
    for (var i = 0; i < allSongs.length; i++) {
      var s = allSongs[i];
      var norm = (s.title || "").trim().toLowerCase();
      if (!norm) continue;
      counts[norm] = (counts[norm] || 0) + 1;
    }
    duplicateTitles = new Set(Object.keys(counts).filter(function (k) { return counts[k] > 1; }));
  }

  async function loadChannelLabels() {
    try {
      var res = await fetchWithTimeout("/api/channels", {}, 5000);
      if (!res.ok) throw new Error("channels " + res.status);
      var data = await res.json();
      channelLabels = {};
      var chs = data.channels || [];
      for (var i = 0; i < chs.length; i++) {
        channelLabels[String(chs[i].chat_id)] = chs[i].label;
      }
    } catch (e) {
      console.warn("channels failed:", e);
      channelLabels = {};
    }
  }

  async function load() {
    try {
      statsEl.textContent = "Loading...";
      await loadChannelLabels();

      var res = await fetchWithTimeout("/api/admin/list?key=" + encodeURIComponent(KEY), {}, 12000);
      if (!res.ok) throw new Error("Failed to load list (" + res.status + ")");
      var data = await res.json();
      allSongs = data.songs || [];
      computeDuplicateTitles();
      populatePerformerFilter();
      populateChannelFilter();
      render();
    } catch (e) {
      console.error("LOAD ERROR:", e);
      showError(e.message || String(e));
      rowsEl.innerHTML = '<tr><td colspan="5"><div class="empty">' + esc(e.message || "Load failed") + '</div></td></tr>';
      pagerEl.style.display = "none";
      statsEl.textContent = "";
    }
  }

  function populateChannelFilter() {
    var current = channelFilter.value;
    var idsSet = {};
    allSongs.forEach(function (s) { if (s.chat_id) idsSet[String(s.chat_id)] = true; });
    var ids = Object.keys(idsSet).sort();
    channelFilter.innerHTML = '<option value="">All channels</option>' +
      ids.map(function (id) { return '<option value="' + esc(id) + '">' + esc(channelLabels[id] || id) + '</option>'; }).join("");
    channelFilter.value = ids.indexOf(current) !== -1 ? current : "";
  }

  function populatePerformerFilter() {
    var current = performerFilter.value;
    var namesSet = new Set();
    allSongs.forEach(function (s) {
      splitPerformers(s.performer).forEach(function (n) { namesSet.add(n); });
    });
    var names = Array.from(namesSet).sort(function (a, b) { return a.localeCompare(b); });
    performerFilter.innerHTML = '<option value="">All artists</option>' +
      names.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join("");
    performerFilter.value = names.indexOf(current) !== -1 ? current : "";
  }

  function getSortState() {
    switch (sortSelect.value) {
      case "oldest": return { key: "created_at", dir: 1 };
      case "title":  return { key: "title", dir: 1 };
      case "artist": return { key: "performer", dir: 1 };
      default:       return { key: "created_at", dir: -1 };
    }
  }

  function getFiltered() {
    var q = qInput.value.trim().toLowerCase();
    var performer = performerFilter.value;
    var channel = channelFilter.value;
    var onlyDup = duplicatesOnly.checked;

    var list = allSongs.filter(function (s) {
      if (performer && splitPerformers(s.performer).indexOf(performer) === -1) return false;
      if (channel && String(s.chat_id) !== channel) return false;
      if (onlyDup && !duplicateTitles.has((s.title || "").trim().toLowerCase())) return false;
      if (q) {
        var t = (s.title || "").toLowerCase();
        var p = (s.performer || "").toLowerCase();
        var f = (s.file_name || "").toLowerCase();
        if (t.indexOf(q) === -1 && p.indexOf(q) === -1 && f.indexOf(q) === -1) return false;
      }
      return true;
    });

    var sort = onlyDup ? { key: "title", dir: 1 } : getSortState();
    list = list.slice().sort(function (a, b) {
      var va = a[sort.key], vb = b[sort.key];
      if (typeof va === "string") { va = va.toLowerCase(); vb = (vb || "").toLowerCase(); }
      if (va < vb) return -1 * sort.dir;
      if (va > vb) return 1 * sort.dir;
      return 0;
    });
    return list;
  }

  function updateStats(filteredCount) {
    var totalDur = 0;
    allSongs.forEach(function (s) { totalDur += (s.duration || 0); });
    var html = "<span><b>" + allSongs.length + "</b> songs total</span><span class='dot'>&middot;</span><span>Total duration: <b>" + fmtTotalDuration(totalDur) + "</b></span>";
    if (duplicateTitles.size > 0) {
      html += "<span class='dot'>&middot;</span><span style='color:var(--danger)'><b>" + duplicateTitles.size + "</b> duplicate title" + (duplicateTitles.size > 1 ? "s" : "") + "</span>";
    }
    if (filteredCount !== allSongs.length) {
      html += "<span class='dot'>&middot;</span><span><b>" + filteredCount + "</b> results found</span>";
    }
    statsEl.innerHTML = html;
  }

  function updateSortHeaders() {
    var sort = getSortState();
    document.querySelectorAll("th.sortable").forEach(function (th) {
      var arrow = th.querySelector(".arrow");
      if (th.dataset.key === sort.key) {
        th.classList.add("active");
        arrow.textContent = sort.dir === 1 ? "▲" : "▼";
      } else {
        th.classList.remove("active");
        arrow.textContent = "▲";
      }
    });
  }

  function render() {
    var filtered = getFiltered();
    updateStats(filtered.length);
    updateSortHeaders();

    if (filtered.length === 0) {
      rowsEl.innerHTML = '<tr><td colspan="5"><div class="empty">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>' +
        '<div>No songs found.</div></div></td></tr>';
      pagerEl.style.display = "none";
      return;
    }

    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    var start = (currentPage - 1) * PAGE_SIZE;
    var pageItems = filtered.slice(start, start + PAGE_SIZE);
    currentPageIds = pageItems.map(function (s) { return s.id; });

    rowsEl.classList.toggle("is-selecting", selectionMode);

    var parts = [];
    pageItems.forEach(function (s) {
      var isOpen = openDetailId === s.id;
      var isSelected = selectedIds.has(s.id);
      var tgLink = buildTelegramLink(s.chat_id, s.message_id);

      var openBtn = tgLink
        ? '<a class="btn btn-open" href="' + esc(tgLink) + '" target="_blank" rel="noopener" data-action="stop">Open in Telegram</a>'
        : "";
      var copyBtn = tgLink
        ? '<button class="btn-copy" data-action="copy" data-link="' + esc(tgLink) + '" title="Copy link"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg> Copy link</button>'
        : "";

      var checkboxHtml = selectionMode
        ? '<span class="row-checkbox' + (isSelected ? ' checked' : '') + '"><svg viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
        : "";

      var isDup = duplicateTitles.has((s.title || "").trim().toLowerCase());
      var dupBadge = isDup ? '<span class="dup-badge">DUPLICATE</span>' : "";

      var mainRow = '<tr class="song-row' + (isOpen ? ' open' : '') + (isSelected ? ' selected' : '') + '" data-id="' + s.id + '">' +
        '<td class="cell-main"><span class="title-line">' + checkboxHtml + '<span class="title-cell">' + esc(s.title) + '</span>' + dupBadge + '</span><span class="artist-cell">' + esc(s.performer) + '</span></td>' +
        '<td class="cell-artist">' + esc(s.performer) + '</td>' +
        '<td class="cell-meta"><span class="dur-pill">' + fmtDuration(s.duration) + '</span></td>' +
        '<td class="muted cell-meta">' + esc(s.created_at) + '</td>' +
        '<td class="chevron-cell"><button class="chevron-btn" aria-label="Toggle details"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button></td>' +
      '</tr>';

      var detailRow = '<tr class="detail-row' + (isOpen ? '' : ' hidden') + '" data-detail-for="' + s.id + '">' +
        '<td colspan="5">' +
          '<div class="detail-grid">' +
            '<div><span class="detail-label">File name</span><span class="detail-value">' + esc(s.file_name) + '</span></div>' +
            '<div><span class="detail-label">Chat ID</span><span class="detail-value">' + esc(s.chat_id) + '</span></div>' +
            '<div><span class="detail-label">Message ID</span><span class="detail-value">' + esc(s.message_id) + '</span></div>' +
          '</div>' +
          '<div class="detail-actions">' + openBtn + copyBtn +
            '<button class="btn btn-danger" data-action="delete" data-id="' + s.id + '" data-title="' + esc(s.title) + '">Delete</button>' +
          '</div>' +
        '</td>' +
      '</tr>';

      parts.push(mainRow + detailRow);
    });
    rowsEl.innerHTML = parts.join("");

    pagerEl.style.display = "flex";
    pagerInfo.textContent = "Showing " + (start + 1) + "\\u2013" + Math.min(start + PAGE_SIZE, filtered.length) + " of " + filtered.length;
    pageIndicator.textContent = "Page " + currentPage + " of " + totalPages;
    document.getElementById("prevPage").disabled = currentPage === 1;
    document.getElementById("nextPage").disabled = currentPage === totalPages;
  }

  function toggleDetails(id) {
    openDetailId = openDetailId === id ? null : id;
    render();
  }

  function toggleSelect(id) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    updateSelectionUI();
    render();
  }

  function updateSelectionUI() {
    selectModeBtn.classList.toggle("active", selectionMode);
    selectionBar.classList.toggle("show", selectionMode);
    selectionCount.textContent = selectedIds.size + " selected";
    selectDeleteBtn.disabled = selectedIds.size === 0;
    var allOnPageSelected = currentPageIds.length > 0 && currentPageIds.every(function (id) { return selectedIds.has(id); });
    selectAllBtn.textContent = allOnPageSelected ? "Clear all" : "Select all";
  }

  function copyLink(link) {
    if (!link) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(
        function () { toast("Link copied"); },
        function () { toast("Could not copy link", true); }
      );
    } else {
      var ta = document.createElement("textarea");
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast("Link copied"); }
      catch (e) { toast("Could not copy link", true); }
      document.body.removeChild(ta);
    }
  }

  function askDelete(id, title) {
    pendingBulkDelete = false;
    pendingDeleteId = id;
    document.getElementById("confirmTitle").textContent = title || ("#" + id);
    document.getElementById("confirmModal").classList.add("show");
  }

  function askBulkDelete() {
    if (selectedIds.size === 0) return;
    pendingBulkDelete = true;
    document.getElementById("confirmTitle").textContent =
      selectedIds.size + " selected song" + (selectedIds.size > 1 ? "s" : "");
    document.getElementById("confirmModal").classList.add("show");
  }

  function closeModal() {
    document.getElementById("confirmModal").classList.remove("show");
    pendingDeleteId = null;
    pendingBulkDelete = false;
  }

  async function deleteOne(id) {
    var res = await fetchWithTimeout("/api/admin/delete?key=" + encodeURIComponent(KEY), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id })
    }, 12000);
    var data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Delete failed");
  }

  async function del(id) {
    try {
      await deleteOne(id);
      allSongs = allSongs.filter(function (s) { return s.id !== id; });
      if (openDetailId === id) openDetailId = null;
      populatePerformerFilter();
      render();
      toast("Song deleted");
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function bulkDelete() {
    var ids = Array.from(selectedIds);
    var results = await Promise.allSettled(ids.map(deleteOne));
    var failed = 0;
    var okIds = [];
    for (var i = 0; i < results.length; i++) {
      if (results[i].status === "fulfilled") okIds.push(ids[i]);
      else failed++;
    }
    allSongs = allSongs.filter(function (s) { return okIds.indexOf(s.id) === -1; });
    selectedIds.clear();
    selectionMode = false;
    openDetailId = null;
    populatePerformerFilter();
    updateSelectionUI();
    render();
    if (failed > 0) toast(okIds.length + " deleted, " + failed + " failed", true);
    else toast(okIds.length + " song" + (okIds.length > 1 ? "s" : "") + " deleted");
  }

  rowsEl.addEventListener("click", function (e) {
    var actionEl = e.target.closest("[data-action]");
    if (actionEl) {
      var action = actionEl.dataset.action;
      if (action === "stop") return;
      e.preventDefault();
      e.stopPropagation();
      if (action === "copy") copyLink(actionEl.dataset.link);
      else if (action === "delete") askDelete(Number(actionEl.dataset.id), actionEl.dataset.title);
      return;
    }

    var chev = e.target.closest(".chevron-btn");
    if (chev) {
      var rowC = chev.closest("tr.song-row");
      if (rowC) {
        e.stopPropagation();
        toggleDetails(Number(rowC.dataset.id));
        return;
      }
    }

    var row = e.target.closest("tr.song-row");
    if (row) {
      var id = Number(row.dataset.id);
      if (selectionMode) toggleSelect(id);
      else toggleDetails(id);
    }
  });

  document.getElementById("confirmOk").addEventListener("click", function () {
    if (pendingBulkDelete) bulkDelete();
    else if (pendingDeleteId != null) del(pendingDeleteId);
    closeModal();
  });
  document.getElementById("confirmCancel").addEventListener("click", closeModal);
  document.getElementById("confirmModal").addEventListener("click", function (e) {
    if (e.target.id === "confirmModal") closeModal();
  });

  selectModeBtn.addEventListener("click", function () {
    selectionMode = !selectionMode;
    if (!selectionMode) selectedIds.clear();
    openDetailId = null;
    updateSelectionUI();
    render();
  });
  selectCancelBtn.addEventListener("click", function () {
    selectionMode = false;
    selectedIds.clear();
    updateSelectionUI();
    render();
  });
  selectAllBtn.addEventListener("click", function () {
    var allOnPageSelected = currentPageIds.length > 0 && currentPageIds.every(function (id) { return selectedIds.has(id); });
    if (allOnPageSelected) currentPageIds.forEach(function (id) { selectedIds.delete(id); });
    else currentPageIds.forEach(function (id) { selectedIds.add(id); });
    updateSelectionUI();
    render();
  });
  selectDeleteBtn.addEventListener("click", askBulkDelete);

  document.querySelectorAll("th.sortable").forEach(function (th) {
    th.addEventListener("click", function () {
      var key = th.dataset.key;
      if (key === "created_at") {
        sortSelect.value = sortSelect.value === "newest" ? "oldest" : "newest";
      } else if (key === "title") {
        sortSelect.value = "title";
      } else if (key === "performer") {
        sortSelect.value = "artist";
      }
      currentPage = 1;
      render();
    });
  });

  document.getElementById("prevPage").addEventListener("click", function () { currentPage--; render(); });
  document.getElementById("nextPage").addEventListener("click", function () { currentPage++; render(); });

  refreshBtn.addEventListener("click", function () {
    refreshBtn.classList.add("spin");
    setTimeout(function () { refreshBtn.classList.remove("spin"); }, 600);
    load();
    toast("List refreshed");
  });

  qInput.addEventListener("input", function () { currentPage = 1; render(); });
  performerFilter.addEventListener("change", function () { currentPage = 1; render(); });
  channelFilter.addEventListener("change", function () { currentPage = 1; render(); });
  duplicatesOnly.addEventListener("change", function () { currentPage = 1; render(); });
  sortSelect.addEventListener("change", function () { currentPage = 1; render(); });
  pageSizeSelect.addEventListener("change", function () {
    PAGE_SIZE = parseInt(pageSizeSelect.value, 10) || 15;
    currentPage = 1;
    render();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeModal();
  });

  load();
</script>
</body>
</html>
`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}