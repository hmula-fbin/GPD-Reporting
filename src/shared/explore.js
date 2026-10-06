/* ============================================================
   Copilot over every data file.
   Reads each spreadsheet in the site's data library (today Pipeline, Project and Resource;
   any file added later is picked up automatically), as the person viewing, and answers
   questions on ANY column with ANY filter:
     "projects where Brand is Moen and Stage is Develop"
     "total Capital Investment by Sponsor Organization"
     "how many people are active"          "top 10 projects by Total Net Sales"
     "list ProjectOwnerName and Total Net Sales where Strategic Bucket is CRQ"
   Answers are worked out here, in the browser. Nothing is sent anywhere.
   window.gpdExplore = { load(), answer(q), datasets() }
   ============================================================ */
(function(){
  var CFG = window.GPD_CONFIG || {};
  var DS = null, loading = null, results = {}, seq = 0;
  var SHOW = 25;   /* rows shown in the chat; the Excel download has them all */

  /* ---------- text helpers ---------- */
  function nk(s){ return String(s == null ? "" : s).replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim(); }
  /* "ProjectOwnerName" / "Contribution Margin Dollars_New" -> "project owner name" / "contribution margin dollars new" */
  function ord(s){ return s.replace(/\b1st\b/g, "first").replace(/\b2nd\b/g, "second").replace(/\b3rd\b/g, "third").replace(/\b(\d+)th\b/g, "$1").replace(/#/g, " number ")
    /* common short forms in column names and questions read as the full word */
    .replace(/\bmgr\b/g, "manager").replace(/\bmktg\b/g, "marketing").replace(/\bdept\b/g, "department").replace(/\bqty\b/g, "quantity")
    .replace(/\bamt\b/g, "amount").replace(/\bdesc\b/g, "description").replace(/\bpct\b/g, "percent").replace(/\bno\b(?=\s*\d|$)/g, "number"); }
  function words(s){ return ord(nk(s).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()).replace(/[^a-z0-9%$.]+/g, " ").replace(/\s+/g, " ").trim(); }
  /* the question, lower-cased, camelCase split, comparison signs kept as their own words */
  function qwords(s){ return " " + ord(nk(s).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()).replace(/(>=|<=|!=|<>|>|<|=)/g, " $1 ").replace(/[^a-z0-9%$.,<>=!]+/g, " ").replace(/,(?=\s|$)/g, " , ").replace(/\.(?=\s|$)/g, " ").replace(/\s+/g, " ").trim() + " "; }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  function num(v){ if (v === null || v === undefined || v === "") return null; if (typeof v === "number") return isFinite(v) ? v : null;
    var t = String(v).trim().toLowerCase().replace(/[$,\s]/g, ""), m = /^(-?\d+(?:\.\d+)?)(k|m|mm|b|bn|%)?$/.exec(t);
    if (!m) return null; var n = parseFloat(m[1]); return m[2] === "k" ? n * 1e3 : (m[2] === "m" || m[2] === "mm") ? n * 1e6 : (m[2] === "b" || m[2] === "bn") ? n * 1e9 : n; }
  function fmt(v, col){
    if (v === null || v === undefined || v === "") return "";
    if (v instanceof Date) return v.toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"});
    if (typeof v === "number"){
      if (col && col.money) return (v < 0 ? "-$" : "$") + Math.abs(Math.round(v)).toLocaleString("en-US");
      return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 100) / 100);
    }
    return String(v);
  }
  function plural(n, w){ return n.toLocaleString("en-US") + " " + (n === 1 ? w : w === "person" ? "people" : w + "s"); }
  var STOP = {"the":1,"and":1,"or":1,"of":1,"in":1,"on":1,"for":1,"to":1,"a":1,"an":1,"is":1,"are":1,"with":1,"by":1,"all":1,"any":1,"yes":1,"no":1,"none":1,"na":1,"n a":1,"true":1,"false":1,"other":1,"new":1,"total":1,"project":1,"projects":1};

  /* ---------- reading the files ---------- */
  function api(path){ return CFG.sitePath + "/_api/web/" + path; }
  function rel(p){ return encodeURIComponent(String(p).replace(/'/g, "''")); }
  function listFiles(){
    var folder = CFG.dataFolder || (CFG.dataFile || "").replace(/\/[^\/]*$/, "");
    return fetch(api("GetFolderByServerRelativePath(decodedurl='" + rel(folder) + "')/Files?$select=Name,ServerRelativeUrl,TimeLastModified"),
        {credentials:"include", cache:"no-store", headers:{Accept:"application/json;odata=nometadata"}})
      .then(function(r){ return r.ok ? r.json() : {value:[]}; })
      .then(function(j){ return (j.value || []).filter(function(f){ return /\.(xlsx|xlsm|xls|csv)$/i.test(f.Name) && !/^~\$/.test(f.Name); }); })
      .catch(function(){ return []; });
  }
  /* The best table in a file: the sheet with the most data, its header being the row (in the first 30)
     with the most text labels. */
  function parse(buf, file){
    var wb = XLSX.read(buf, {type:"array", cellDates:true}), best = null;
    wb.SheetNames.forEach(function(sn){
      var g = XLSX.utils.sheet_to_json(wb.Sheets[sn], {header:1, blankrows:false, defval:null});
      var hdr = -1, hn = 1;
      for (var i = 0; i < Math.min(g.length, 30); i++){
        var n = (g[i] || []).filter(function(c){ return typeof c === "string" && nk(c) && num(c) === null; }).length;
        if (n > hn){ hn = n; hdr = i; }
      }
      if (hdr < 0) return;
      var size = (g.length - hdr - 1) * hn;
      if (!best || size > best.size) best = {size:size, grid:g, hdr:hdr, sheet:sn};
    });
    if (!best) return null;
    var head = best.grid[best.hdr] || [], cols = [], seen = {};
    head.forEach(function(h, i){
      var name = nk(h); if (!name) return;
      var k = name.toLowerCase(); if (seen[k]) return; seen[k] = 1;
      cols.push({name:name, i:i, w:words(name)});
    });
    var rows = [];
    for (var r = best.hdr + 1; r < best.grid.length; r++){
      var g2 = best.grid[r] || [];
      if (!cols.some(function(c){ var v = g2[c.i]; return v !== null && v !== undefined && nk(v) !== ""; })) continue;
      rows.push(cols.map(function(c){ var v = g2[c.i]; return typeof v === "string" ? nk(v) : v; }));
    }
    cols.forEach(function(c, ci){
      var nN = 0, nT = 0, nD = 0, nB = 0, vals = new Map();
      rows.forEach(function(row){ var v = row[ci];
        if (v === null || v === undefined || v === "") return;
        if (typeof v === "boolean") nB++; else if (v instanceof Date) nD++; else if (typeof v === "number") nN++;
        else { var x = num(v); if (x !== null && /^[\s$\-\d.,%kmb]+$/i.test(v)) nN++; else nT++; }
        if (vals.size <= 2000){ var key = String(v).toLowerCase(); if (!vals.has(key)) vals.set(key, v); } });
      var tot = nN + nT + nD + nB;
      c.type = !tot ? "text" : nB / tot > 0.8 ? "bool" : nD / tot > 0.8 ? "date" : nN / tot > 0.8 ? "num" : "text";
      if (c.type === "num") rows.forEach(function(row){ if (typeof row[ci] !== "number") row[ci] = num(row[ci]); });
      c.money = c.type === "num" && /sales|cost|saving|margin|cm\b|cm\$|dollar|invest|capital|expense|\bns\b|revenue|npv|income|spend|\boi\b|price|\$/i.test(c.name) && !/percent|pct|%|count|units|score|years|life|hours|months/i.test(c.name);
      c.values = c.type === "text" && vals.size <= 2000 ? vals : null;
    });
    var label = file.Name.replace(/\.[^.]+$/, "").replace(/\s+data$/i, "").trim() || file.Name;
    var nameCol = cols.filter(function(c){ return c.type === "text" && /(^|\s)(project )?name$|title$/.test(c.w); })[0] || cols.filter(function(c){ return c.type === "text"; })[0] || cols[0];
    var noun = /resource|people|person|staff|roster|employee/i.test(label) ? "person" : /project|pipeline|portfolio/i.test(label) ? "project" : "record";
    return {label:label, key:words(label), cols:cols, rows:rows, nameCol:nameCol, noun:noun, isPipeline:!!(CFG.dataFile && CFG.dataFile.split("/").pop() === file.Name)};
  }
  function load(){
    if (DS) return Promise.resolve(DS);
    if (loading) return loading;
    loading = listFiles().then(function(files){
      return Promise.all(files.map(function(f){
        return fetch(api("GetFileByServerRelativePath(decodedurl='" + rel(f.ServerRelativeUrl) + "')/$value"), {credentials:"include", cache:"no-store"})
          .then(function(r){ return r.ok ? r.arrayBuffer() : null; })
          .then(function(b){ try{ return b ? parse(b, f) : null; }catch(e){ console.error(e); return null; } })
          .catch(function(){ return null; });
      }));
    }).then(function(list){
      VOCAB = null;
      DS = list.filter(Boolean).sort(function(a, b){ return (b.isPipeline ? 1 : 0) - (a.isPipeline ? 1 : 0); });
      return DS;
    });
    return loading;
  }

  /* ---------- understanding the question ---------- */
  var OPS = [
    ["between", /^between\s+(.+?)\s+and\s+(.+)$/],
    [">=", /^(?:>=|at least|no less than)\s*(.+)$/], ["<=", /^(?:<=|at most|no more than)\s*(.+)$/],
    [">", /^(?:>|over|above|more than|greater than|exceeds?|bigger than|higher than)\s*(.+)$/],
    ["<", /^(?:<|under|below|less than|smaller than|lower than)\s*(.+)$/],
    ["!=", /^(?:is not|isn't|!=|<>|not equal to|not|excluding|except)\s+(.+)$/],
    ["contains", /^(?:contains|containing|includes|including|like|has|with)\s+(.+)$/],
    ["starts", /^(?:starts with|starting with|begins with)\s+(.+)$/],
    ["blank", /^(?:is blank|is empty|is missing|blank|empty|missing|not set|is not set)$/],
    ["notblank", /^(?:is not blank|is not empty|not blank|not empty|is set|filled in|is filled)$/],
    ["=", /^(?:is|=|==|equals|equal to|of|in|as|for|:)?\s*(.+)$/]
  ];
  /* every place a column is named in the question, longest names first so "Total Net Sales" beats "Net Sales" */
  function findCols(ql, ds){
    var hits = [], taken = [];
    ds.cols.slice().sort(function(a, b){ return b.w.length - a.w.length; }).forEach(function(c){
      if (c.w.length < 2) return;
      var forms = [c.w, c.w + "s", c.w.replace(/ name$/, ""), c.w.replace(/ name$/, "") + "s"].filter(function(f, i, a){ return f.length > 2 && a.indexOf(f) === i && !STOP[f]; });
      forms.forEach(function(f){
        var at = -1, from = 0;
        while ((at = ql.indexOf(" " + f + " ", from)) > -1){
          var s = at + 1, e = s + f.length;
          if (!taken.some(function(t){ return s < t[1] && e > t[0]; })){ hits.push({col:c, s:s, e:e}); taken.push([s, e]); }
          from = at + 1;
        }
      });
    });
    var addSpan = function(c, s0, e0){ if (!taken.some(function(t){ return s0 < t[1] && e0 > t[0]; }) && !hits.some(function(h){ return h.col === c; })){ hits.push({col:c, s:s0, e:e0}); taken.push([s0, e0]); } };
    Object.keys(ALIAS).forEach(function(term){
      var c = ds.cols.filter(function(x){ return x.name === ALIAS[term]; })[0]; if (!c) return;
      var at = ql.indexOf(" " + term + " "); if (at > -1) addSpan(c, at + 1, at + 1 + term.length);
    });
    var acr = {};
    ds.cols.forEach(function(c){ var ws = c.w.split(" ").filter(function(x){ return /^[a-z]/.test(x); }); if (ws.length < 2) return;
      var a = ws.map(function(x){ return x[0]; }).join(""); (acr[a] = acr[a] || []).push(c); });
    Object.keys(acr).forEach(function(a){
      if (acr[a].length !== 1 || a.length < 2 || STOP[a] || COMMAND[a]) return;
      var at = ql.indexOf(" " + a + " "); if (at > -1) addSpan(acr[a][0], at + 1, at + 1 + a.length);
    });
    return hits.sort(function(a, b){ return a.s - b.s; });
  }
  /* ---------- learning: "PMF means Project Management Flag" ----------
     Terms are remembered in this browser and used in every later question. */
  var ALIAS_KEY = "fbin_copilot_terms", ALIAS = {};
  try{ ALIAS = JSON.parse(localStorage.getItem(ALIAS_KEY) || "{}") || {}; }catch(e){ ALIAS = {}; }
  function teach(q){
    var m = /^\s*(?:please\s+)?(?:remember(?: that)?|note(?: that)?|learn(?: that)?|fyi)?\s*["']?(.+?)["']?\s+(?:means|=|is short for|stands for|is the same as|refers to)\s+["']?(.+?)["']?\s*[.!]?\s*$/i.exec(q);
    if (!m || m[1].split(/\s+/).length > 5) return null;
    var term = words(m[1]), target = nk(m[2]), hit = null;
    (DS || []).forEach(function(ds){ ds.cols.forEach(function(c){ if (!hit && c.w === words(target)) hit = c.name; }); });
    if (!hit){ var best = null; (DS || []).forEach(function(ds){ fuzzyCols(" " + words(target) + " ", ds, []).forEach(function(c){ if (!best) best = c.name; }); }); hit = best; }
    if (!hit) return {html:'<p>I couldn’t find a column called “' + esc(target) + '” in any of the data.</p>', strong:true, pipeline:false};
    ALIAS[term] = hit; try{ localStorage.setItem(ALIAS_KEY, JSON.stringify(ALIAS)); }catch(e){}
    return {html:'<p>Got it — from now on <b>' + esc(m[1]) + '</b> means <b>' + esc(hit) + '</b>.</p>', strong:true, pipeline:false, learned:hit};
  }
  /* words that say what to do, or are too common to identify a column */
  var COMMAND = {"show":1,"me":1,"give":1,"list":1,"find":1,"get":1,"display":1,"what":1,"which":1,"who":1,"whose":1,"is":1,"are":1,"was":1,"were":1,"the":1,"a":1,"an":1,"for":1,"of":1,"in":1,"on":1,"by":1,"per":1,"and":1,"or":1,"with":1,"where":1,"top":1,"bottom":1,"all":1,"each":1,"how":1,"many":1,"much":1,"total":1,"sum":1,"average":1,"projects":1,"project":1,"records":1,"record":1,"please":1,"tell":1,"about":1,"to":1,"from":1,"there":1,"have":1,"has":1,"do":1,"does":1,"data":1,"file":1,"people":1,"person":1,"their":1,"its":1,"it":1,"this":1,"that":1,"these":1,"those":1,"i":1,"we":1,"my":1,"our":1,"can":1,"you":1,"value":1,"values":1};
  /* fields the page's own portfolio engine already understands; a loose match on these leaves the question to it */
  var PAGE_TERMS = / (net sales|ns|sales|revenue|margin|cm|contribution|investment|capital|capex|opex|spend|budget|cost|months|time|bucket|stage|business|brand|market|owner|status|finish) /;
  var GENERIC = {"date":1,"name":1,"total":1,"number":1,"project":1,"id":1,"code":1,"type":1,"status":1,"value":1,"amount":1,"count":1,"percent":1,"new":1,"dollars":1,"description":1};
  /* columns named loosely: "ship date", "1st ship date", "SC ship date" -> every DC First Ship N Date */
  function fuzzyCols(qs, ds, already){
    var Q = qs.trim().split(/\s+/).filter(function(t){ return t && !COMMAND[t] && !/^\d{3,}$/.test(t); });
    if (!Q.length) return [];
    var scored = [];
    ds.cols.forEach(function(c){
      if (already.indexOf(c) > -1) return;
      var W = c.w.split(" ").filter(function(x){ return x && !COMMAND[x] && x !== "name"; });   /* "ProjectOwnerName" ~ "owner" */
      if (!W.length) return;
      var hit = W.filter(function(x){ return Q.indexOf(x) > -1; });
      var distinct = hit.filter(function(x){ return !GENERIC[x] && !/^\d+$/.test(x); });
      if (!distinct.length) return;
      if (hit.length < 2 && hit.length / W.length < 0.6) return;
      scored.push({c:c, s:hit.length + hit.length / W.length});
    });
    if (!scored.length) return [];
    var top = Math.max.apply(null, scored.map(function(x){ return x.s; }));
    return scored.filter(function(x){ return x.s >= top - 1e-9; }).slice(0, 6).map(function(x){ return x.c; });
  }
  /* ---------- auto-correct: "road map" -> Roadmap, "Devlop" -> Develop ----------
     Every column name and every value in the data is the vocabulary. Words in the question are
     joined or corrected to the nearest vocabulary entry: spacing and case always, and one wrong
     letter (two in long words). Everyday words are never changed. */
  var COMMON = {"summarize":1,"summary":1,"portfolio":1,"largest":1,"biggest":1,"smallest":1,"highest":1,"lowest":1,"average":1,"between":1,
    "month":1,"months":1,"behind":1,"review":1,"target":1,"forecast":1,"compare":1,"breakdown":1,"break":1,"down":1,"above":1,"below":1,
    "under":1,"count":1,"number":1,"percent":1,"share":1,"overview":1,"status":1,"stage":1,"stages":1,"bucket":1,"buckets":1,"brand":1,
    "brands":1,"market":1,"markets":1,"owner":1,"owners":1,"business":1,"annualized":1,"incremental":1,"sales":1,"margin":1,"savings":1,
    "investment":1,"years":1,"finish":1,"launch":1,"dates":1,"names":1,"values":1,"total":1,"active":1,"inactive":1,"people":1,"manager":1,
    "managers":1,"missing":1,"blank":1,"empty":1,"filled":1,"greater":1,"smaller":1,"between":1,"number":1,"where":1,"which":1,"there":1,
    "these":1,"those":1,"their":1,"about":1,"projects":1,"project":1,"records":1,"record":1,"different":1,"unique":1,"distinct":1,"group":1,"grouped":1};
  var VOCAB = null;
  var compact = function(t){ return String(t).toLowerCase().replace(/[^a-z0-9]+/g, ""); };
  function vocab(){
    if (VOCAB) return VOCAB;
    var map = new Map();
    (DS || []).forEach(function(ds){
      ds.cols.forEach(function(c){ var k = compact(c.name); if (k.length >= 3 && !map.has(k)) map.set(k, c.name);
        if (c.values) c.values.forEach(function(v){ var t = nk(v); if (t.length < 3 || t.length > 40 || /^[\d\s.,$%-]+$/.test(t)) return; var kk = compact(t); if (kk.length >= 3 && !map.has(kk)) map.set(kk, t); }); });
    });
    /* single words inside longer names and values ("03 03 Develop" -> Develop), for typo fixes */
    Array.from(map.values()).forEach(function(t){ String(t).split(/[^A-Za-z]+/).forEach(function(w){ if (w.length >= 5){ var k = w.toLowerCase(); if (!map.has(k) && !COMMAND[k] && !STOP[k]) map.set(k, w); } }); });
    Object.keys(COMMAND).concat(Object.keys(COMMON)).forEach(function(w){ if (w.length >= 5 && !map.has(w)) map.set(w, w); });
    VOCAB = {map:map, keys:Array.from(map.keys())};
    return VOCAB;
  }
  function near(a, b, max){                      /* edit distance, stops early once it is over max */
    if (Math.abs(a.length - b.length) > max) return false;
    var prev = []; for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++){
      var cur = [i], best = i;
      for (var k = 1; k <= b.length; k++){ cur[k] = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)); if (cur[k] < best) best = cur[k]; }
      if (best > max) return false; prev = cur;
    }
    return prev[b.length] <= max;
  }
  function correct(q){
    if (!DS || !DS.length) return q;
    var V = vocab(), toks = nk(q).split(" "), out = [], i = 0, changed = false;
    var plain = function(t){ return t.toLowerCase().replace(/[^a-z0-9]+/g, ""); };
    var known = function(w){ return !w || COMMAND[w] || STOP[w] || COMMON[w] || /^\d/.test(w) || V.map.has(w); };
    while (i < toks.length){
      var done = false;
      /* join 2-3 words that are one vocabulary entry when written together: "road map" -> Roadmap */
      for (var n = 3; n >= 2 && !done; n--){
        if (i + n > toks.length) continue;
        var parts = toks.slice(i, i + n).map(plain);
        if (parts.some(function(p){ return !p || COMMAND[p] || STOP[p]; })) continue;
        var k = parts.join("");
        if (V.map.has(k) && !V.map.has(parts.join(" ")) && toks.slice(i, i + n).join(" ").toLowerCase() !== V.map.get(k).toLowerCase()){
          var tail = /[.,!?;:]+$/.exec(toks[i + n - 1]); out.push(V.map.get(k) + (tail ? tail[0] : "")); i += n; done = true; changed = true;
        }
      }
      if (done) continue;
      /* one word with a small typo: "Devlop" -> Develop */
      var w = plain(toks[i]);
      if (V.map.has(w) && / /.test(V.map.get(w)) && !COMMAND[w] && !STOP[w]){ var tj = /[.,!?;:]+$/.exec(toks[i]); out.push(V.map.get(w) + (tj ? tj[0] : "")); i++; changed = true; continue; }
      if (w.length >= 5 && !known(w)){
        var max = w.length >= 9 ? 2 : 1, hit = null;
        for (var x = 0; x < V.keys.length && !hit; x++){ var key = V.keys[x]; if (key.length >= 4 && near(w, key, max) && V.map.get(key).indexOf(" ") < 0) hit = V.map.get(key); }
        if (hit){ var tl = /[.,!?;:]+$/.exec(toks[i]); out.push(hit + (tl ? tl[0] : "")); i++; changed = true; continue; }
      }
      out.push(toks[i]); i++;
    }
    return changed ? out.join(" ") : q;
  }
  function matchValue(col, raw){
    var t = nk(raw).replace(/^["']|["']$/g, "").toLowerCase();
    if (!t) return null;
    if (col.type === "num") { var n = num(t); return n === null ? null : n; }
    if (col.type === "date"){ if (!/\d/.test(t)) return null; var d = new Date(raw); return isNaN(d) ? null : d; }
    if (col.type === "bool") return /^(yes|y|true|1|active)$/.test(t) ? true : /^(no|n|false|0|inactive)$/.test(t) ? false : null;
    if (col.values){
      if (col.values.has(t)) return col.values.get(t);
      var hit = null; col.values.forEach(function(v, k){ if (!hit && words(k) === words(t)) hit = v; });
      return hit;
    }
    return raw;
  }
  function parseQ(q, ds){
    var ql = qwords(q), low = " " + nk(q).toLowerCase() + " ";
    var hits = findCols(ql, ds), filters = [], used = {}, mentioned = [];
    hits.forEach(function(h, i){
      var next = hits[i + 1], seg = ql.slice(h.e, next ? next.s : ql.length);
      var bt = /^\s*between\s+\S+\s+and\s+\S+/.exec(seg);
      seg = bt ? bt[0].trim() : seg.replace(/\s+(,|and|or|but|sorted|order|ordered|grouped|by|per|then|where|with|which|that|whose|show|list|for each)(\s.*)?$/, "").trim();
      var f = null;
      for (var k = 0; k < OPS.length && !f; k++){
        var m = OPS[k][1].exec(seg); if (!m) continue;
        var op = OPS[k][0];
        if (op === "blank" || op === "notblank"){ f = {col:h.col, op:op}; break; }
        if (op === "between"){ var a = matchValue(h.col, m[1]), b = matchValue(h.col, m[2]); if (a !== null && b !== null) f = {col:h.col, op:op, v:a, v2:b}; break; }
        var v = matchValue(h.col, m[1]);
        if (v === null) continue;
        var strong = /^(is|=|==|equals|equal to|:)\b|^[=:]/.test(m[0]);
        if (op === "=" && !strong && (h.col.type === "date" || (h.col.type === "text" && !h.col.values))) continue;
        if (op === "=" && h.col.type === "text" && !h.col.values) op = "contains";
        if (op === "=" && h.col.type === "text" && h.col.values && !h.col.values.has(String(v).toLowerCase())) continue;
        if (op === "=" && !m[0].match(/^(is|=|==|equals|equal to|:)\b/) && h.col.type === "num") continue;   /* "by Total Net Sales 5" is not a filter */
        f = {col:h.col, op:op, v:v};
      }
      if (f){ filters.push(f); used[h.col.name] = 1; } else mentioned.push(h.col);
    });
    /* bare values: "Moen projects in Develop" -> Brand = Moen, Stage = Develop */
    ds.cols.forEach(function(c){
      if (!c.values || used[c.name] || c === ds.nameCol) return;
      c.values.forEach(function(v, k){
        var w = words(k);
        if (w.length < 3 || STOP[w] || /^\d+$/.test(w) || used[c.name]) return;
        if (ql.indexOf(" " + w + " ") < 0) return;
        if (hits.some(function(h){ return h.col.w.indexOf(w) > -1; })) return;
        filters.push({col:c, op:"=", v:v, bare:true}); used[c.name] = 1;
      });
    });
    /* a yes/no column named in the question, e.g. "active people" -> ResourceIsActive = yes */
    ds.cols.forEach(function(c){
      if (c.type !== "bool" || used[c.name]) return;
      var key = c.w.replace(/^(resource|project|is)\s+/g, "").replace(/\bis\s+/, "").split(" ").pop();
      if (!key || key.length < 4) return;
      if (ql.indexOf(" in" + key + " ") > -1 || ql.indexOf(" not " + key + " ") > -1){ filters.push({col:c, op:"=", v:false}); used[c.name] = 1; }
      else if (ql.indexOf(" " + key + " ") > -1){ filters.push({col:c, op:"=", v:true}); used[c.name] = 1; }
    });
    /* two bare matches on the same row value in different columns: keep the more specific column */
    var qs = ql; hits.forEach(function(h){ qs = qs.slice(0, h.s) + new Array(h.e - h.s + 1).join(" ") + qs.slice(h.e); });
    var idCols = ds.cols.filter(function(c){ return c.type !== "date" && /(^| )(id|number|no|identifier|num)$/.test(c.w); });
    (qs.match(/\s\d{3,8}(?=\s)/g) || []).forEach(function(m){
      var id = m.trim(), at = qs.indexOf(" " + id + " "), before = qs.slice(Math.max(0, at - 16), at);
      if (/(>|<|=|over|under|above|below|than|between|and|top|first|last|bottom|least|most)\s*$/.test(before)) return;   /* a value, not a record */
      var idc = idCols.filter(function(c){ var k = ci(ds, c); return ds.rows.some(function(r){ return String(r[k] == null ? "" : r[k]).trim() === id; }); })[0];
      if (idc && !used[idc.name]){ filters.push({col:idc, op:"id", v:id}); used[idc.name] = 1; return; }
      var nk2 = ci(ds, ds.nameCol), re = new RegExp("^" + id + "\\b");
      if (!used[ds.nameCol.name] && ds.rows.some(function(r){ return re.test(String(r[nk2] == null ? "" : r[nk2])); })){ filters.push({col:ds.nameCol, op:"idname", v:id}); used[ds.nameCol.name] = 1; }
    });
    var loose = fuzzyCols(qs, ds, hits.map(function(h){ return h.col; }).concat(filters.map(function(f){ return f.col; })));
    loose.forEach(function(c){ mentioned.push(c); });
    var byBy = /\b(?:by|per|for each|each|grouped by|broken down by|split by)\s+(.+)$/.exec(ql);
    var groupCol = null;
    if (byBy){ var gh = findCols(" " + byBy[1] + " ", ds)[0]; if (gh) groupCol = gh.col; }
    var nums = mentioned.filter(function(c){ return c.type === "num" && c !== groupCol; });
    var topM = /\b(top|largest|biggest|highest|most|best|bottom|smallest|lowest|least|fewest)\s+(\d+)?/.exec(qs);
    var lim = /\b(top|first|bottom|last)\s+(\d+)\b/.exec(qs) || /\b(\d+)\s+(largest|biggest|highest|smallest|lowest)\b/.exec(qs);
    /* "top 5 by Total Cost Savings": the "by" column is what to sort on, not what to group by */
    if (topM && groupCol && groupCol.type === "num"){ nums.unshift(groupCol); groupCol = null; }
    return {
      ql:ql, low:low, filters:filters, mentioned:mentioned, loose:loose, groupCol:groupCol, numCol:nums[0] || null,
      count:/\b(how many|number of|count|how much of)\b/.test(qs),
      sum:/\b(total|sum|combined|overall)\b/.test(qs), avg:/\b(average|avg|mean|typical)\b/.test(qs),
      max:/\b(max|maximum|highest|largest|biggest|most)\b/.test(qs) && !topM, min:/\b(min|minimum|lowest|smallest|least)\b/.test(qs) && !topM,
      top:topM ? {desc:!/bottom|smallest|lowest|least|fewest/.test(topM[1]), n:lim ? +(lim[2] && /^\d+$/.test(lim[2]) ? lim[2] : lim[1]) : 10} : null,
      list:/\b(list|show|which|what|who|give|find|display|get|names?)\b/.test(qs),
      explicit:/\b(where|whose|filter|filtered|having|column|field|=)\b/.test(low) || /[<>=]/.test(low)
    };
  }
  function test(f, v){
    switch (f.op){
      case "id": return String(v == null ? "" : v).trim() === f.v;
      case "idname": return new RegExp("^" + f.v + "\\b").test(String(v == null ? "" : v));
      case "blank": return v === null || v === undefined || v === "";
      case "notblank": return !(v === null || v === undefined || v === "");
      case "=": if (f.v instanceof Date) return v instanceof Date && v.toDateString() === f.v.toDateString();
        return f.col.type === "text" ? String(v == null ? "" : v).toLowerCase() === String(f.v).toLowerCase() : v === f.v;
      case "!=": return f.col.type === "text" ? String(v == null ? "" : v).toLowerCase() !== String(f.v).toLowerCase() : v !== f.v;
      case "contains": return String(v == null ? "" : v).toLowerCase().indexOf(String(f.v).toLowerCase()) > -1;
      case "starts": return String(v == null ? "" : v).toLowerCase().indexOf(String(f.v).toLowerCase()) === 0;
      case ">": return v !== null && v > f.v; case "<": return v !== null && v < f.v;
      case ">=": return v !== null && v >= f.v; case "<=": return v !== null && v <= f.v;
      case "between": return v !== null && v >= Math.min(f.v, f.v2) && v <= Math.max(f.v, f.v2);
    }
    return true;
  }
  function filterText(fs){
    var OPT = {"=":"is","!=":"is not","contains":"contains","starts":"starts with",">":">","<":"<",">=":"≥","<=":"≤","between":"between","blank":"is blank","notblank":"is filled in","id":"is","idname":"starts with"};
    return fs.map(function(f){
      var v = f.op === "between" ? fmt(f.v, f.col) + " and " + fmt(f.v2, f.col) : f.op === "blank" || f.op === "notblank" ? "" : typeof f.v === "boolean" ? (f.v ? "yes" : "no") : fmt(f.v, f.col);
      return f.col.name + " " + OPT[f.op] + (v ? " " + v : "");
    }).join(" and ");
  }

  /* ---------- choosing the file ---------- */
  function score(q, ds){
    var ql = " " + words(q) + " ", P = parseQ(q, ds), s = P.filters.reduce(function(t, f){ return t + (f.bare ? 1 : 4); }, 0) + (P.mentioned.length - P.loose.length) * 2 + P.loose.length * 0.5 + (P.groupCol ? 2 : 0);   /* a loosely matched column only nudges the choice */   /* a stated filter ("Brand is Alpha") outweighs a value that merely appears */
    var alias = [ds.key].concat(ds.noun === "person" ? ["people", "person", "persons", "staff", "roster", "employee", "employees", "resources", "resource", "who is active"] : []);
    if (alias.some(function(a){ return a && ql.indexOf(" " + a + " data ") > -1 || ql.indexOf(" " + a + " file ") > -1; })) s += 20;
    else if (ds.noun === "person" && alias.some(function(a){ return ql.indexOf(" " + a + " ") > -1; })) s += 8;
    if (ds.isPipeline) s += 0.5;
    return {ds:ds, P:P, s:s, named:s >= 8 && !ds.isPipeline};
  }

  /* ---------- answering ---------- */
  function table(ds, cols, rows, title){
    var id = "x" + (++seq);
    results[id] = {title:title, cols:cols, rows:rows};
    var shown = rows.slice(0, SHOW);
    var html = '<table><thead><tr>' + cols.map(function(c){ return '<th' + (c.type === "num" ? ' class="n"' : "") + '>' + esc(c.name) + '</th>'; }).join("") + '</tr></thead><tbody>'
      + shown.map(function(r){ return '<tr>' + cols.map(function(c){ return '<td' + (c.type === "num" ? ' class="n"' : "") + '>' + esc(fmt(r[c.i2 !== undefined ? c.i2 : c.ci], c)) + '</td>'; }).join("") + '</tr>'; }).join("")
      + '</tbody></table>';
    return html + '<div class="src">' + (rows.length > SHOW ? "Showing " + SHOW + " of " + rows.length.toLocaleString("en-US") + ". " : "")
      + '<button class="askxl" type="button" data-xl="' + id + '">Excel</button></div>';
  }
  function ci(ds, c){ return ds.cols.indexOf(c); }
  function answer(q){
    if (!DS || !DS.length) return {none:true};
    var t = teach(q); if (t) return t;
    var best = DS.map(function(ds){ return score(q, ds); }).sort(function(a, b){ return b.s - a.s; })[0];
    var ds = best.ds, P = best.P;
    var rows = ds.rows.filter(function(r){ return P.filters.every(function(f){ return test(f, r[ci(ds, f.col)]); }); });
    var noun = ds.noun, where = P.filters.length ? " where " + filterText(P.filters) : "";
    var from = '<div class="src">From the ' + esc(ds.label) + " records" + (where ? " (" + esc(where.slice(7)) + ")" : "") + '.</div>';
    var exact = P.filters.filter(function(f){ return !f.bare; }).map(function(f){ return f.col; }).concat(P.mentioned, P.groupCol ? [P.groupCol] : [])
      .some(function(c){ return c.w.indexOf(" ") > -1; }) || (P.loose || []).some(function(c){ return !PAGE_TERMS.test(" " + c.w + " "); });
    var out = {ds:ds.label, pipeline:ds.isPipeline, strong:P.explicit || best.named || exact, filters:P.filters.length};
    var C = function(c){ return {name:c.name, type:c.type, money:c.money, ci:ci(ds, c)}; };
    var nameC = C(ds.nameCol);
    if (!P.filters.length && !P.mentioned.length && !P.groupCol && !best.named) return {none:true};
    /* group: "total Capital Investment by Sponsor Organization" / "projects by Brand" */
    if (P.groupCol){
      var gi = ci(ds, P.groupCol), m = P.numCol, mi = m ? ci(ds, m) : -1, g = new Map();
      rows.forEach(function(r){ var k = r[gi] === null || r[gi] === undefined || r[gi] === "" ? "(not set)" : fmt(r[gi], P.groupCol);
        var e = g.get(k) || {k:k, n:0, s:0, c:0}; e.n++; if (m && r[mi] !== null){ e.s += r[mi]; e.c++; } g.set(k, e); });
      var agg = P.avg ? "Average" : "Total";
      var list = Array.from(g.values()).map(function(e){ return [e.k, e.n, m ? (P.avg ? (e.c ? e.s / e.c : null) : e.s) : null]; });
      list.sort(function(a, b){ return (m ? (b[2] || 0) - (a[2] || 0) : b[1] - a[1]); });
      var cols = [{name:P.groupCol.name, type:"text", i2:0}, {name:"Count", type:"num", i2:1}].concat(m ? [{name:agg + " " + m.name, type:"num", money:m.money, i2:2}] : []);
      out.val = list.length;
      out.html = '<p><b>' + plural(rows.length, noun) + '</b>' + esc(where) + ' by ' + esc(P.groupCol.name) + (m ? " with " + esc(agg.toLowerCase() + " " + m.name) : "") + ':</p>'
        + table(ds, cols, list, (m ? agg + " " + m.name + " by " : "Count by ") + P.groupCol.name) + from;
      return out;
    }
    /* one number */
    if (P.numCol && (P.sum || P.avg || P.max || P.min) && !P.top){
      var ni = ci(ds, P.numCol), vals = rows.map(function(r){ return r[ni]; }).filter(function(v){ return v !== null && v !== undefined; });
      var v = !vals.length ? null : P.avg ? vals.reduce(function(a, b){ return a + b; }, 0) / vals.length : P.max ? Math.max.apply(null, vals) : P.min ? Math.min.apply(null, vals) : vals.reduce(function(a, b){ return a + b; }, 0);
      var what = P.avg ? "Average" : P.max ? "Highest" : P.min ? "Lowest" : "Total";
      out.val = v;
      out.html = '<p>' + what + ' ' + esc(P.numCol.name) + where.replace(/^ where/, " for") + ' is <b>' + esc(fmt(v, P.numCol) || "—") + '</b> (' + plural(vals.length, noun) + ' with a value).</p>' + from;
      return out;
    }
    /* how many */
    if (P.count && !P.list){
      out.val = rows.length;
      out.html = '<p><b>' + plural(rows.length, noun) + '</b>' + esc(where) + '.</p>' + from;
      if (rows.length && rows.length <= 50) out.html += table(ds, [nameC].concat(P.filters.map(function(f){ return C(f.col); })), rows, "Matching " + noun + "s");
      return out;
    }
    /* top / bottom N by a number */
    if (P.top && P.numCol){
      var ti = ci(ds, P.numCol), d = P.top.desc ? -1 : 1;
      var sorted = rows.filter(function(r){ return r[ti] !== null && r[ti] !== undefined; }).sort(function(a, b){ return d * (a[ti] - b[ti]); }).slice(0, P.top.n);
      out.val = sorted.length;
      out.html = '<p>' + (P.top.desc ? "Top " : "Bottom ") + sorted.length + ' by ' + esc(P.numCol.name) + esc(where) + ':</p>'
        + table(ds, [nameC, C(P.numCol)].concat(P.mentioned.filter(function(c){ return c !== P.numCol && c !== ds.nameCol; }).map(C)), sorted, (P.top.desc ? "Top " : "Bottom ") + P.top.n + " by " + P.numCol.name) + from;
      return out;
    }
    /* "what brands are there?" -> the distinct values with counts */
    if (!P.filters.length && P.mentioned.length === 1 && P.mentioned[0].type === "text" && P.mentioned[0] !== ds.nameCol){
      P.groupCol = P.mentioned[0]; P.mentioned = []; return answer2(ds, P, rows, out, from, noun, where, C);
    }
    /* a list of the matching rows with the columns asked for (or a detail card for a single match) */
    if (rows.length === 1 && P.mentioned.length){
      var r0 = rows[0];
      out.val = 1;
      out.html = '<p><b>' + esc(r0[ci(ds, ds.nameCol)] || "1 " + noun) + '</b></p><ul>' + P.mentioned.map(function(c){
          var x = r0[ci(ds, c)];
          return '<li>' + esc(c.name) + ': <b>' + (x === null || x === undefined || x === "" ? "not filled in" : esc(fmt(x, c))) + '</b></li>'; }).join("") + '</ul>' + from;
      return out;
    }
    if (rows.length === 1){
      var r1 = rows[0], filled = ds.cols.filter(function(c){ var x = r1[ci(ds, c)]; return x !== null && x !== undefined && x !== ""; }).slice(0, 40);
      out.val = 1;
      out.html = '<p><b>' + esc(r1[ci(ds, ds.nameCol)] || "1 " + noun) + '</b></p><table><tbody>' + filled.map(function(c){ return '<tr><td>' + esc(c.name) + '</td><td>' + esc(fmt(r1[ci(ds, c)], c)) + '</td></tr>'; }).join("") + '</tbody></table>' + from;
      return out;
    }
    var show = [nameC].concat(P.mentioned.filter(function(c){ return c !== ds.nameCol; }).map(C), P.filters.map(function(f){ return C(f.col); }).filter(function(c){ return c.name !== nameC.name; }));
    var seen = {}; show = show.filter(function(c){ if (seen[c.name]) return false; seen[c.name] = 1; return true; });
    out.val = rows.length;
    out.html = '<p><b>' + plural(rows.length, noun) + '</b>' + esc(where) + (rows.length ? ":" : ".") + '</p>' + (rows.length ? table(ds, show, rows, "Matching " + noun + "s") : "") + from;
    return out;
  }
  function answer2(ds, P, rows, out, from, noun, where, C){
    var gi = ds.cols.indexOf(P.groupCol), g = new Map();
    rows.forEach(function(r){ var k = r[gi] === null || r[gi] === undefined || r[gi] === "" ? "(not set)" : fmt(r[gi], P.groupCol); g.set(k, (g.get(k) || 0) + 1); });
    var list = Array.from(g.entries()).sort(function(a, b){ return b[1] - a[1]; });
    out.val = list.length;
    out.html = '<p><b>' + list.length.toLocaleString("en-US") + '</b> different ' + esc(P.groupCol.name) + ' values across ' + plural(rows.length, noun) + ':</p>'
      + table(ds, [{name:P.groupCol.name, type:"text", i2:0}, {name:"Count", type:"num", i2:1}], list, P.groupCol.name + " values") + from;
    return out;
  }
  /* Excel for any answer table */
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("[data-xl]"); if (!b) return;
    var r = results[b.getAttribute("data-xl")]; if (!r || typeof XLSX === "undefined") return;
    var aoa = [r.cols.map(function(c){ return c.name; })].concat(r.rows.map(function(row){ return r.cols.map(function(c){ var v = row[c.i2 !== undefined ? c.i2 : c.ci]; return v === null || v === undefined ? "" : v; }); }));
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), r.title.replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31));
    XLSX.writeFile(wb, "copilot-" + r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + new Date().toISOString().slice(0, 10) + ".xlsx", {compression:true});
  });

  window.gpdExplore = {
    load: load, answer: answer, correct: correct, terms: function(){ return Object.assign({}, ALIAS); },
    datasets: function(){ return (DS || []).map(function(d){ return {label:d.label, rows:d.rows.length, cols:d.cols.map(function(c){ return c.name; })}; }); }
  };
})();
