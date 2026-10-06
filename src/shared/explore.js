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
  function nk(s){ return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  /* "ProjectOwnerName" / "Contribution Margin Dollars_New" -> "project owner name" / "contribution margin dollars new" */
  function ord(s){ return s.replace(/\b1st\b/g, "first").replace(/\b2nd\b/g, "second").replace(/\b3rd\b/g, "third").replace(/\b(\d+)th\b/g, "$1").replace(/#/g, " number "); }
  function words(s){ return ord(nk(s).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()).replace(/[^a-z0-9%$.]+/g, " ").replace(/\s+/g, " ").trim(); }
  /* the question, lower-cased, camelCase split, comparison signs kept as their own words */
  function qwords(s){ return " " + ord(nk(s).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()).replace(/(>=|<=|!=|<>|>|<|=)/g, " $1 ").replace(/[^a-z0-9%$.,<>=!]+/g, " ").replace(/,(?=\s|$)/g, " , ").replace(/\s+/g, " ").trim() + " "; }
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
    return hits.sort(function(a, b){ return a.s - b.s; });
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
      if (/(>|<|=|over|under|above|below|than|between|and|top|first|last|bottom|least|most|of|in)\s*$/.test(before)) return;   /* a value, not a record */
      var idc = idCols.filter(function(c){ var k = ci(ds, c); return ds.rows.some(function(r){ return String(r[k] == null ? "" : r[k]).trim() === id; }); })[0];
      if (idc && !used[idc.name]){ filters.push({col:idc, op:"id", v:id}); used[idc.name] = 1; return; }
      var nk2 = ci(ds, ds.nameCol), re = new RegExp("^" + id + "\\b");
      if (!used[ds.nameCol.name] && ds.rows.some(function(r){ return re.test(String(r[nk2] == null ? "" : r[nk2])); })){ filters.push({col:ds.nameCol, op:"idname", v:id}); used[ds.nameCol.name] = 1; }
    });
    var byBy = /\b(?:by|per|for each|each|grouped by|broken down by|split by)\s+(.+)$/.exec(ql);
    var groupCol = null;
    if (byBy){ var gh = findCols(" " + byBy[1] + " ", ds)[0]; if (gh) groupCol = gh.col; }
    var nums = mentioned.filter(function(c){ return c.type === "num" && c !== groupCol; });
    var topM = /\b(top|largest|biggest|highest|most|best|bottom|smallest|lowest|least|fewest)\s+(\d+)?/.exec(qs);
    var lim = /\b(top|first|bottom|last)\s+(\d+)\b/.exec(qs) || /\b(\d+)\s+(largest|biggest|highest|smallest|lowest)\b/.exec(qs);
    /* "top 5 by Total Cost Savings": the "by" column is what to sort on, not what to group by */
    if (topM && groupCol && groupCol.type === "num"){ nums.unshift(groupCol); groupCol = null; }
    return {
      ql:ql, low:low, filters:filters, mentioned:mentioned, groupCol:groupCol, numCol:nums[0] || null,
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
    var ql = " " + words(q) + " ", P = parseQ(q, ds), s = P.filters.reduce(function(t, f){ return t + (f.bare ? 1 : 4); }, 0) + P.mentioned.length * 2 + (P.groupCol ? 2 : 0);   /* a stated filter ("Brand is Alpha") outweighs a value that merely appears */
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
    var best = DS.map(function(ds){ return score(q, ds); }).sort(function(a, b){ return b.s - a.s; })[0];
    var ds = best.ds, P = best.P;
    var rows = ds.rows.filter(function(r){ return P.filters.every(function(f){ return test(f, r[ci(ds, f.col)]); }); });
    var noun = ds.noun, where = P.filters.length ? " where " + filterText(P.filters) : "";
    var from = '<div class="src">From the ' + esc(ds.label) + " records" + (where ? " (" + esc(where.slice(7)) + ")" : "") + '.</div>';
    var exact = P.filters.filter(function(f){ return !f.bare; }).map(function(f){ return f.col; }).concat(P.mentioned, P.groupCol ? [P.groupCol] : [])
      .some(function(c){ return c.w.indexOf(" ") > -1; });
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
    load: load, answer: answer,
    datasets: function(){ return (DS || []).map(function(d){ return {label:d.label, rows:d.rows.length, cols:d.cols.map(function(c){ return c.name; })}; }); }
  };
})();
