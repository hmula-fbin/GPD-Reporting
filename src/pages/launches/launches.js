/* =====================================================================
   Upcoming Launches
   Every project whose Ship-Trans Date falls between today and six months from today, read live from the
   project file (as the person viewing). Multi-select filters on the left (each value shows how many
   projects it would give with the other filters), a table that sorts on a heading click, columns that
   move by dragging a heading and resize by dragging its edge (shared/tables.js), and an Excel download.
   ===================================================================== */

/* Column names in the project file. A list means "the first of these that exists". */
const LCOLS = {
  name: "ProjectName", n: "Project Number", pm: "ProjectOwnerName",
  /* Project Description shows the Project Scope Statement (ProjectDescription is empty in the extract), or the description when a project has no scope statement */
  scope: "Project Scope Statement", desc: "ProjectDescription",
  d: ["Ship-Trans Date", "Ship/Trans Date", "Ship Trans Date"],
  type: ["Stage Gate Project Type", "ProjectType"], stage: ["CurrentStage", "StageName"], brand: "Brand",
  ch: ["DistributionChannel", "Distribution Channel"], cust: ["Customer", "Primary Customer"],
  sp: "Sponsor Organization", ex: "Executing Organization", sb: "Strategic Bucket", st: "Project Status",
  room: "Room", mpm: "Primary Mktg Product Mgr", ph: ["PhaseName", "CurrentPhase"]
};
/* The table, in its default order. */
const COLS = [
  {k:"n", t:"Project Number"}, {k:"name", t:"Project Name"}, {k:"d", t:"Ship-Trans Date"}, {k:"ml", t:"Month of Launch"},
  {k:"desc", t:"Project Description"}, {k:"pm", t:"Project Manager"}, {k:"type", t:"Project Type"}, {k:"stage", t:"Current Stage"},
  {k:"brand", t:"Brand"}, {k:"ch", t:"Distribution Channel"}, {k:"cust", t:"Primary Customer"}
];
/* The filters on the left (Project search sits above them). */
const FILTERS = [
  {k:"ml", t:"Month of launch"}, {k:"sp", t:"Sponsor organization"}, {k:"ex", t:"Executing organization"},
  {k:"sb", t:"Strategic bucket"}, {k:"st", t:"Project status"}, {k:"room", t:"Room"}, {k:"type", t:"Project type"},
  {k:"pm", t:"Project owner"}, {k:"mpm", t:"Mktg product manager"}, {k:"ph", t:"Current phase"},
  {k:"stage", t:"Current stage"}, {k:"brand", t:"Brand"}
];
/* Default view: In Progress, Active Phase, and these brands (those present in the data). */
const DEFAULT_BRANDS = /^(moen|rohl|riobel|perrin\s*&\s*rowe)$/i;
const STAGES = ["Discovery", "Ideate", "Converge", "Develop", "Validate", "Launch", "Complete"];
const WINDOW_MONTHS = 6;
const BLANK = "(Blank)";
const LS_ORDER = "fbin_launch_cols_v1";
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const S = { P:[], rows:[], f:null, q:"", sort:"d", dir:1, missing:[], loadedAt:null, start:"", end:"", order:COLS.map(c => c.k) };
const $ = id => document.getElementById(id);

/* ---------- helpers ---------- */
const nk = s => String(s == null ? "" : s).replace(/ /g, " ").replace(/\s+/g, " ").trim();
const lk = s => nk(s).toLowerCase();
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
const fmtN = v => Number(v || 0).toLocaleString("en-US");
const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const usDate = s => s ? s.slice(5, 7) + "/" + s.slice(8, 10) + "/" + s.slice(0, 4) : "";
const monthOf = s => MON[+s.slice(5, 7) - 1] + " " + s.slice(0, 4);
const when = d => new Date(d).toLocaleString("en-US", {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"});
/* "03 02 Converge" -> "Converge", "03 Active Phase" -> "Active Phase" */
const plain = s => nk(s).replace(/^\d+(?:\s+\d+)*\s+(?=\D)/, "");
function lsGet(k){ try{ const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; }catch(e){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function spPath(p){ return encodeURIComponent(p.replace(/'/g, "''")); }
/* A date cell as YYYY-MM-DD: a real date, an Excel day number, or text such as 2026-10-12 or 10/12/2026. */
function dateKey(v){
  if (v instanceof Date && !isNaN(v)) return iso(new Date(v.getTime() + 30000));
  if (typeof v === "number" && isFinite(v) && v > 20000 && v < 80000){ const p = XLSX.SSF.parse_date_code(v); return p ? p.y + "-" + pad(p.m) + "-" + pad(p.d) : null; }
  const s = nk(v); let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return m[1] + "-" + pad(+m[2]) + "-" + pad(+m[3]);
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s))) return m[3] + "-" + pad(+m[1]) + "-" + pad(+m[2]);
  return null;
}

/* ---------- reading the project file ---------- */
function findTable(buf, mustHave){
  const wb = gpdReadBook(buf), want = lk(mustHave);
  for (const n of wb.SheetNames){
    const g = XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, blankrows:false, defval:null});
    for (let i = 0; i < Math.min(g.length, 30); i++)
      if ((g[i] || []).map(lk).indexOf(want) > -1) return {grid:g, hdr:i, head:(g[i] || []).map(lk)};
  }
  return null;
}
function parseProjects(buf){
  const t = findTable(buf, LCOLS.name);
  if (!t) throw new Error("no project header");
  const col = {}, missing = [];
  Object.keys(LCOLS).forEach(k => {
    const i = [].concat(LCOLS[k]).map(n => t.head.indexOf(lk(n))).find(x => x > -1);
    if (i === undefined) missing.push(k); else col[k] = i;
  });
  const P = [];
  for (let r = t.hdr + 1; r < t.grid.length; r++){
    const g = t.grid[r] || [], name = nk(g[col.name]);
    if (!name) continue;
    const p = {};
    Object.keys(LCOLS).forEach(k => { p[k] = col[k] === undefined ? "" : (k === "d" ? dateKey(g[col.d]) : nk(g[col[k]]).replace(/\.0$/, "")); });
    p.desc = p.scope || p.desc; p.stage = plain(p.stage); p.ph = plain(p.ph);
    if (p.d) p.ml = monthOf(p.d);
    P.push(p);
  }
  /* the description column needs only one of its two sources */
  const both = missing.indexOf("scope") > -1 && missing.indexOf("desc") > -1;
  return {P, missing: missing.filter(k => k !== "scope" && (k !== "desc" || both))};
}

/* ---------- the window: today to six months from today ---------- */
function setWindow(){
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setMonth(end.getMonth() + WINDOW_MONTHS);
  S.start = iso(now); S.end = iso(end);
}
const inWindow = p => p.d && p.d >= S.start && p.d <= S.end;

/* ---------- filters ---------- */
const val = (p, k) => p[k] || BLANK;
function options(k){
  const v = Array.from(new Set(S.P.map(p => val(p, k))));
  const by = {}; S.P.forEach(p => { if (p.ml) by[p.ml] = p.d.slice(0, 7); });
  return v.sort((a, b) => a === BLANK ? 1 : b === BLANK ? -1
    : k === "ml" ? (by[a] < by[b] ? -1 : by[a] > by[b] ? 1 : 0)
    : k === "stage" ? ((STAGES.indexOf(a) + 1 || 99) - (STAGES.indexOf(b) + 1 || 99)) || a.localeCompare(b)
    : a.localeCompare(b, "en", {numeric:true}));
}
function defaults(){
  const f = {}; FILTERS.forEach(x => { f[x.k] = []; });
  f.st = options("st").filter(v => /^in progress$/i.test(v));
  f.ph = options("ph").filter(v => /\bactive\b/i.test(v));
  f.brand = options("brand").filter(v => DEFAULT_BRANDS.test(v));
  return f;
}
function terms(){ return S.q.toLowerCase().split(/\s+/).filter(Boolean); }
function passes(p, skip, tm){
  for (const x of FILTERS){ const sel = S.f[x.k]; if (x.k !== skip && sel.length && sel.indexOf(val(p, x.k)) < 0) return false; }
  if (tm.length){
    const h = [p.n, p.name, p.desc, p.pm, p.mpm, p.type, p.stage, p.brand, p.ch, p.cust, usDate(p.d), p.ml].join(" ").toLowerCase();
    for (const w of tm) if (h.indexOf(w) < 0) return false;
  }
  return true;
}
function countsFor(k, tm){ const c = {}; S.P.forEach(p => { if (passes(p, k, tm)){ const v = val(p, k); c[v] = (c[v] || 0) + 1; } }); return c; }

function buildFilters(){
  $("filterFields").innerHTML = FILTERS.map(x => {
    const opts = options(x.k);
    return '<div class="fld ms" id="fld_' + x.k + '" data-key="' + x.k + '"><label id="lab_' + x.k + '">' + esc(x.t) + '</label>'
      + '<button class="msbtn" type="button" aria-haspopup="true" aria-expanded="false" aria-labelledby="lab_' + x.k + '"><span class="mslab"></span><span class="mscaret">▾</span></button>'
      + '<div class="mspanel" hidden>'
      + (opts.length > 8 ? '<input class="mssearch" type="search" placeholder="Search ' + esc(x.t.toLowerCase()) + '" aria-label="Search ' + esc(x.t) + '">' : "")
      + '<div class="msacts"><button type="button" data-act="all">Select all</button><button type="button" data-act="none">Clear</button></div>'
      + '<div class="msopts">' + opts.map(v => '<label class="msopt"><input type="checkbox" value="' + esc(v) + '"><span class="msname">' + esc(v) + '</span><span class="mscount"></span></label>').join("")
      + '</div></div></div>';
  }).join("");
  document.querySelectorAll("#filterFields .ms").forEach(el => {
    const k = el.dataset.key, btn = el.querySelector(".msbtn"), panel = el.querySelector(".mspanel"), search = el.querySelector(".mssearch");
    btn.onclick = e => {
      e.stopPropagation();
      const open = panel.hidden; closePanels(el); panel.hidden = !open; btn.setAttribute("aria-expanded", String(open));
      if (open && search){ search.value = ""; filterOpts(el, ""); search.focus(); }
    };
    panel.onclick = e => e.stopPropagation();
    if (search) search.oninput = () => filterOpts(el, search.value);
    el.querySelectorAll(".msacts button").forEach(b => b.onclick = () => {
      const vis = Array.from(el.querySelectorAll(".msopt")).filter(o => o.style.display !== "none").map(o => o.querySelector("input").value);
      S.f[k] = b.dataset.act === "all" ? Array.from(new Set(S.f[k].concat(vis))) : S.f[k].filter(v => vis.indexOf(v) < 0);
      refresh();
    });
    el.querySelectorAll(".msopt input").forEach(cb => cb.onchange = () => {
      const set = new Set(S.f[k]); if (cb.checked) set.add(cb.value); else set.delete(cb.value);
      S.f[k] = Array.from(set); refresh();
    });
  });
}
function closePanels(except){
  document.querySelectorAll("#filterFields .ms").forEach(el => {
    if (el === except) return;
    el.querySelector(".mspanel").hidden = true; el.querySelector(".msbtn").setAttribute("aria-expanded", "false");
  });
}
function filterOpts(el, q){
  const t = q.trim().toLowerCase();
  el.querySelectorAll(".msopt").forEach(o => { o.style.display = !t || o.querySelector(".msname").textContent.toLowerCase().indexOf(t) > -1 ? "" : "none"; });
}
document.addEventListener("click", () => closePanels(null));
document.addEventListener("keydown", e => { if (e.key === "Escape") closePanels(null); });
const msText = k => { const sel = S.f[k]; return !sel.length ? "All" : sel.length === 1 ? sel[0] : sel.length + " selected"; };
function fillFilters(tm){
  FILTERS.forEach(x => {
    const el = $("fld_" + x.k), cnt = countsFor(x.k, tm), sel = S.f[x.k];
    el.querySelectorAll(".msopt").forEach(o => {
      const cb = o.querySelector("input"), n = cnt[cb.value] || 0;
      cb.checked = sel.indexOf(cb.value) > -1;
      o.querySelector(".mscount").textContent = fmtN(n);
      o.classList.toggle("zero", !n);
    });
    el.querySelector(".mslab").textContent = msText(x.k);
    el.querySelector(".msbtn").classList.toggle("active", sel.length > 0);
    el.classList.toggle("active", sel.length > 0);
  });
  $("fld_q").classList.toggle("active", !!S.q);
}

/* ---------- the table ---------- */
const colOf = k => COLS.find(c => c.k === k);
function sortKey(p, k){
  if (k === "d" || k === "ml") return p.d || "";
  if (k === "stage"){ const i = STAGES.indexOf(p.stage); return i < 0 ? 99 : i; }
  if (k === "n"){ const n = parseFloat(p.n); return isFinite(n) ? n : null; }
  return (p[k] || "").toLowerCase();
}
function sortRows(){
  const k = S.sort, d = S.dir;
  S.rows.sort((a, b) => {
    const x = sortKey(a, k), y = sortKey(b, k), bx = x === "" || x === null, by = y === "" || y === null;
    if (bx !== by) return bx ? 1 : -1;                                   /* blanks always last */
    const c = x < y ? -1 : x > y ? 1 : 0;
    return (c || (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)) * d;
  });
}
function renderHead(){
  $("headRow").innerHTML = S.order.map(k => '<th data-k="' + k + '" title="Click to sort · drag to move">' + esc(colOf(k).t)
    + (S.sort === k ? '<span class="ar">' + (S.dir > 0 ? "▲" : "▼") + '</span>' : "") + '</th>').join("");
}
function cell(p, k){
  const v = k === "d" ? usDate(p.d) : p[k] || "";
  return '<td' + (k === "d" ? ' class="d"' : "") + ' title="' + esc(v) + '">' + esc(v) + '</td>';
}
function drawRows(){
  $("gridBody").innerHTML = S.rows.map(p => '<tr>' + S.order.map(k => cell(p, k)).join("") + '</tr>').join("");
  $("noRows").hidden = S.rows.length > 0;
}
function refresh(){
  const tm = terms();
  S.rows = S.P.filter(p => passes(p, null, tm));
  sortRows(); fillFilters(tm); drawRows();
  $("inviewN").textContent = fmtN(S.rows.length);
  $("inwinN").textContent = "of " + fmtN(S.P.length) + " launching in the window";
  renderFoot();
}

/* sort on a heading click (not right after a drag) */
let justDragged = false;
$("headRow").addEventListener("click", e => {
  if (justDragged || e.target.closest(".colgrip")) return;
  const th = e.target.closest("th"); if (!th) return;
  const k = th.dataset.k;
  if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = 1; }
  renderHead(); refresh();
});
/* drag a heading to move its column; the order is remembered in this browser */
(function(){
  const hr = $("headRow"), wrap = $("gridwrap");
  let st = null, ghost = null, line = null;
  hr.addEventListener("pointerdown", e => {
    if (e.button > 0 || e.target.closest(".colgrip")) return;
    const th = e.target.closest("th"); if (!th) return;
    st = {k:th.dataset.k, x:e.clientX, y:e.clientY, th, active:false, to:-1};
  });
  window.addEventListener("pointermove", e => {
    if (!st) return;
    if (!st.active){
      if (Math.abs(e.clientX - st.x) < 6 && Math.abs(e.clientY - st.y) < 6) return;
      st.active = true; document.body.classList.add("reordering"); st.th.classList.add("dragging");
      ghost = document.createElement("div"); ghost.className = "dragghost"; ghost.textContent = colOf(st.k).t; document.body.appendChild(ghost);
      line = document.createElement("div"); line.className = "dropline"; document.body.appendChild(line);
    }
    ghost.style.left = (e.clientX + 12) + "px"; ghost.style.top = (e.clientY + 10) + "px";
    const wr = wrap.getBoundingClientRect();
    if (e.clientX > wr.right - 50) wrap.scrollLeft += 18; else if (e.clientX < wr.left + 50) wrap.scrollLeft -= 18;
    const ths = Array.from(hr.children); let to = ths.length;
    for (let i = 0; i < ths.length; i++){ const r = ths[i].getBoundingClientRect(); if (e.clientX < r.left + r.width / 2){ to = i; break; } }
    st.to = to;
    const x = to < ths.length ? ths[to].getBoundingClientRect().left : ths[ths.length - 1].getBoundingClientRect().right;
    line.style.left = (x - 1) + "px"; line.style.top = wr.top + "px"; line.style.height = wr.height + "px";
  });
  function end(e){
    if (!st) return;
    const s0 = st; st = null;
    if (!s0.active) return;
    document.body.classList.remove("reordering"); s0.th.classList.remove("dragging");
    if (ghost){ ghost.remove(); ghost = null; } if (line){ line.remove(); line = null; }
    justDragged = true; setTimeout(() => { justDragged = false; }, 0);
    if (e.type === "pointercancel") return;
    const from = S.order.indexOf(s0.k); let to = s0.to;
    if (from < 0 || to < 0) return;
    S.order.splice(from, 1); if (to > from) to--; S.order.splice(to, 0, s0.k);
    lsSet(LS_ORDER, S.order); renderHead(); drawRows();
  }
  window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
})();
function loadOrder(){
  const o = lsGet(LS_ORDER), all = COLS.map(c => c.k);
  S.order = Array.isArray(o) && o.length === all.length && all.every(k => o.indexOf(k) > -1) ? o : all;
}

/* ---------- Excel ---------- */
function saveXlsx(filename, sheets){
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => {
    const ws = XLSX.utils.aoa_to_sheet(s.rows.map(r => r.map(v => v === null || v === undefined ? "" : v)));
    const w = []; s.rows.forEach(r => r.forEach((c, i) => { w[i] = Math.max(w[i] || 8, Math.min(58, String(c == null ? "" : c).length + 2)); }));
    ws["!cols"] = w.map(x => ({wch:x}));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename, {compression:true});
}
function exportView(){
  const head = S.order.map(k => colOf(k).t);
  const rows = S.rows.map(p => S.order.map(k => k === "d" ? usDate(p.d) : p[k] || ""));
  const filt = [["Launch window", usDate(S.start) + " to " + usDate(S.end)], ["Project search", S.q || "(none)"]]
    .concat(FILTERS.map(x => [x.t, S.f[x.k].length ? S.f[x.k].join(" | ") : "All"]));
  saveXlsx("Upcoming_Launches_" + S.start + ".xlsx", [{name:"Upcoming launches", rows:[head].concat(rows)}, {name:"Filters applied", rows:[["Filter", "Value"]].concat(filt)}]);
}
$("xlBtn").onclick = () => {
  if (!S.P.length) return;
  exportView();
  const b = $("xlBtn"), html = b.innerHTML;
  b.classList.add("done"); b.textContent = "Downloaded"; setTimeout(() => { b.classList.remove("done"); b.innerHTML = html; }, 1800);
};

/* ---------- loading ---------- */
async function fetchFile(file){
  const base = GPD_CONFIG.sitePath + "/_api/web/GetFileByServerRelativePath(decodedurl='" + spPath(file) + "')";
  const [info, bin] = await Promise.all([
    fetch(base + "?$select=TimeLastModified", {credentials:"include", cache:"no-store", headers:{Accept:"application/json;odata=nometadata"}}).catch(() => null),
    fetch(base + "/$value", {credentials:"include", cache:"no-store"})
  ]);
  if (bin.status === 401 || bin.status === 403) throw new Error("You don’t have access to the project data. Ask the FBIN R&D PPM team for access.");
  if (!bin.ok) throw new Error("Please try again in a minute. If it keeps happening, contact the FBIN R&D PPM team.");
  let modified = "";
  if (info && info.ok){ try{ modified = (await info.json()).TimeLastModified || ""; }catch(e){} }
  return {buf: await bin.arrayBuffer(), modified};
}
const NAMES = {d:"Ship-Trans Date", n:"Project Number", desc:"Project Scope Statement", pm:"Project Owner", type:"Project Type", stage:"Current Stage",
  brand:"Brand", ch:"Distribution Channel", cust:"Customer", sp:"Sponsor Organization", ex:"Executing Organization", sb:"Strategic Bucket",
  st:"Project Status", room:"Room", mpm:"Mktg Product Manager", ph:"Phase"};
function warn(){
  const bar = $("warnbar"), m = S.missing.filter(k => NAMES[k]);
  bar.hidden = !m.length; bar.className = "warnbar";
  bar.innerHTML = !m.length ? "" : "<span>" + (m.indexOf("d") > -1
    ? "<b>No launch dates:</b> the project data has no “Ship-Trans Date” column, so no project can be placed in the window."
    : "<b>" + m.map(k => "“" + NAMES[k] + "”").join(", ") + (m.length > 1 ? " are" : " is") + " empty:</b> the project data has no such column.") + "</span>";
}
async function reloadData(){
  const btn = $("reloadBtn");
  btn.disabled = true; btn.classList.add("busy"); btn.querySelector("span").textContent = "Refreshing…";
  try{
    const pr = await fetchFile(GPD_CONFIG.projectFile);
    let parsed;
    try{ parsed = parseProjects(pr.buf); }
    catch(pe){ console.error(pe); throw new Error("The project data couldn’t be read. Contact the FBIN R&D PPM team."); }
    setWindow();
    S.P = parsed.P.filter(inWindow); S.missing = parsed.missing; S.loadedAt = new Date();
    if (!S.f) S.f = defaults();
    else FILTERS.forEach(x => { const o = options(x.k); S.f[x.k] = S.f[x.k].filter(v => o.indexOf(v) > -1); });   /* drop values that left the window */
    const asAt = pr.modified ? new Date(pr.modified) : S.loadedAt;
    $("subline").textContent = "Projects with a Ship-Trans Date in the next 6 months (" + usDate(S.start) + " – " + usDate(S.end) + ") · Data as at "
      + asAt.toLocaleDateString("en-GB", {day:"numeric", month:"short", year:"numeric"});
    $("subline").title = "Last refreshed " + when(S.loadedAt);
    $("winSub").textContent = "Ship-Trans Date " + usDate(S.start) + " – " + usDate(S.end);
    $("emptyState").hidden = true; $("viewList").hidden = false;
    buildFilters(); warn(); renderHead(); refresh();
    window.gpdLaunchReady = true;
  }catch(err){
    console.error(err);
    const m = err && err.message ? err.message : String(err);
    if (!S.loadedAt){ $("emptyTitle").textContent = "Couldn’t load the project data"; $("emptyMsg").textContent = m; }
    else { const bar = $("warnbar"); bar.hidden = false; bar.className = "warnbar bad";
      bar.innerHTML = "<span><b>Couldn’t load the latest data.</b> Showing the figures from " + esc(S.loadedAt.toLocaleString("en-US")) + ". " + esc(m) + "</span>"; }
  }finally{
    btn.disabled = false; btn.classList.remove("busy"); btn.querySelector("span").textContent = "Refresh now";
  }
}
function renderFoot(){
  const f = $("foot"); f.hidden = false;
  f.innerHTML = '<span>Last refresh: ' + (S.loadedAt ? S.loadedAt.toLocaleString("en-US") : "—") + '</span>'
    + '<span>' + fmtN(S.P.length) + ' projects launching between ' + usDate(S.start) + ' and ' + usDate(S.end) + '</span>'
    + '<span>' + fmtN(S.rows.length) + ' shown</span>';
}

/* ---------- wiring ---------- */
let qt; $("fQ").oninput = () => { clearTimeout(qt); qt = setTimeout(() => { S.q = $("fQ").value.trim(); refresh(); }, 140); };
$("resetBtn").onclick = () => {
  if (!S.loadedAt) return;
  S.f = defaults(); S.q = ""; $("fQ").value = ""; S.sort = "d"; S.dir = 1;
  renderHead(); refresh();
};
$("layoutBtn").onclick = () => {
  S.order = COLS.map(c => c.k);
  try{ localStorage.removeItem(LS_ORDER); }catch(e){}
  if (window.gpdTables && gpdTables.resetPage) gpdTables.resetPage();
  renderHead(); drawRows();
};
$("reloadBtn").onclick = () => reloadData();

/* Suggestions for the Copilot on this page: it answers from every data file. */
window.gpdSuggest = [{q:"How many projects where Brand is Moen?", icon:"sum"}, {q:"How many projects by Project Status?", icon:"bars"},
  {q:"Top 10 projects by Total Net Sales", icon:"list"}];

/* For the tests: the window, every project in it, and what is in view. */
window.gpdLaunch = () => ({ start:S.start, end:S.end, missing:S.missing.slice(), filters:JSON.parse(JSON.stringify(S.f)), order:S.order.slice(),
  projects:S.P.map(p => ({name:p.name, d:p.d, ml:p.ml, st:p.st, ph:p.ph, brand:p.brand, stage:p.stage, pm:p.pm})),
  view:S.rows.map(p => p.name) });

(function theme(){
  const root = document.documentElement, b = $("themeBtn");
  try{ const saved = localStorage.getItem("fbin_theme"); if (saved) root.setAttribute("data-theme", saved); }catch(e){}
  const isDark = () => { const t = root.getAttribute("data-theme"); return t === "dark" || (!t && matchMedia("(prefers-color-scheme:dark)").matches); };
  const label = () => { b.innerHTML = isDark()
    ? "<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"8\" cy=\"8\" r=\"2.8\"/><path d=\"M8 1.6v1.3M8 13.1v1.3M1.6 8h1.3M13.1 8h1.3M3.5 3.5l.9.9M11.6 11.6l.9.9M3.5 12.5l.9-.9M11.6 4.4l.9-.9\"/></svg><span>Light</span>"
    : "<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z\"/></svg><span>Dark</span>"; };
  label();
  b.onclick = () => { const next = isDark() ? "light" : "dark"; root.setAttribute("data-theme", next); try{ localStorage.setItem("fbin_theme", next); }catch(e){} label(); };
})();

(function boot(){
  loadOrder();
  reloadData();
  setInterval(reloadData, Math.max(5, GPD_CONFIG.reloadMinutes) * 60000);
})();
