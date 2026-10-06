/* ===================== Resizable table columns (every page) =====================
   Drag the right edge of any column heading to make that column wider or narrower; double-click
   the edge to go back to automatic widths. Widths are remembered in this browser, per table, so
   each person can set the tables up for their own screen. Chat tables are left alone. */
(function(){
  var KEY = "fbin_colwidths", saved = {};
  try{ saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }catch(e){ saved = {}; }
  function store(){ try{ localStorage.setItem(KEY, JSON.stringify(saved)); }catch(e){} }
  var page = document.body.getAttribute("data-page") || "";
  function heads(t){ var tr = t.tHead && t.tHead.rows[0]; return tr ? Array.prototype.slice.call(tr.cells) : []; }
  /* a table is known by its page and its column headings */
  function keyOf(t){ return page + "|" + heads(t).map(function(th){ return th.textContent.replace(/[▲▼▴▾]/g, "").trim(); }).join("|"); }
  function fix(t, widths){
    var tot = 0;
    t.classList.add("rz-fixed"); t.style.tableLayout = "fixed";
    heads(t).forEach(function(th, i){ var w = widths[i] || th.getBoundingClientRect().width; th.style.width = w + "px"; tot += w; });
    t.style.width = tot + "px"; t.style.minWidth = "0";
  }
  function auto(t){
    t.classList.remove("rz-fixed"); t.style.tableLayout = ""; t.style.width = ""; t.style.minWidth = "";
    heads(t).forEach(function(th){ th.style.width = ""; });
  }
  function prep(t){
    if (t.closest(".askchat")) return;
    var cells = heads(t); if (!cells.length) return;
    var k = keyOf(t);
    if (t._rzKey === k && cells[0].querySelector(".colgrip")) return;
    t._rzKey = k;
    cells.forEach(function(th, i){
      if (th.querySelector(".colgrip")) return;
      if (getComputedStyle(th).position === "static") th.style.position = "relative";
      var g = document.createElement("span");
      g.className = "colgrip"; g.setAttribute("aria-hidden", "true"); g.title = "Drag to resize · double-click to fit";
      g.addEventListener("click", function(e){ e.stopPropagation(); e.preventDefault(); });          /* not a sort click */
      g.addEventListener("dblclick", function(e){ e.stopPropagation(); e.preventDefault(); delete saved[t._rzKey]; store(); auto(t); });
      g.addEventListener("pointerdown", function(e){
        e.preventDefault(); e.stopPropagation();
        var ws = heads(t).map(function(c){ return c.getBoundingClientRect().width; }), x0 = e.clientX, w0 = ws[i];
        fix(t, ws);
        try{ g.setPointerCapture(e.pointerId); }catch(x){}
        function move(ev){ ws[i] = Math.max(40, Math.round(w0 + ev.clientX - x0)); fix(t, ws); }
        function up(){ g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
          saved[t._rzKey] = ws.map(Math.round); store(); }
        g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
      });
      th.appendChild(g);
    });
    if (saved[k] && saved[k].length === cells.length) fix(t, saved[k]);
  }
  /* The whole table box: drag the handle at its bottom-right corner to make it taller, shorter, wider
     or narrower; double-click the handle to go back to the automatic size. The handle sits next to the
     box (not inside it), so it stays in the corner while the table scrolls. */
  var boxes = [];
  function boxKey(w){ var t = w.querySelector("table"); return t ? "box|" + keyOf(t) : null; }
  function place(w){
    var g = w._rzGrip; if (!g) return;
    if (!w.isConnected || !w.offsetParent){ g.style.display = "none"; return; }
    g.style.display = "";
    g.style.left = (w.offsetLeft + w.offsetWidth - 16) + "px";
    g.style.top = (w.offsetTop + w.offsetHeight - 16) + "px";
  }
  var ro = window.ResizeObserver ? new ResizeObserver(function(es){ es.forEach(function(e){ place(e.target); }); }) : null;
  function prepBox(w){
    var k = boxKey(w);
    if (w._rzGrip && w._rzGrip.isConnected){ if (k !== w._rzKey2){ w._rzKey2 = k; applyBox(w, k); } place(w); return; }
    var par = w.parentNode; if (!par) return;
    if (getComputedStyle(par).position === "static") par.style.position = "relative";
    var g = document.createElement("span");
    g.className = "boxgrip"; g.setAttribute("aria-hidden", "true"); g.title = "Drag to resize this table · double-click to reset";
    w.insertAdjacentElement("afterend", g);
    w._rzGrip = g; w._rzKey2 = k; w.classList.add("rz-box");
    g.addEventListener("pointerdown", function(e){
      e.preventDefault();
      var r = w.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, w0 = r.width, h0 = r.height;
      var maxW = par.clientWidth - w.offsetLeft;
      w.style.maxHeight = "none";
      try{ g.setPointerCapture(e.pointerId); }catch(x){}
      function move(ev){
        w.style.width = Math.max(260, Math.min(maxW, Math.round(w0 + ev.clientX - x0))) + "px";
        w.style.height = Math.max(90, Math.round(h0 + ev.clientY - y0)) + "px";
        place(w);
      }
      function up(){ g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
        var kk = boxKey(w); if (kk){ saved[kk] = [parseInt(w.style.width, 10), parseInt(w.style.height, 10)]; store(); } }
      g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
    });
    g.addEventListener("dblclick", function(e){
      e.preventDefault();
      var kk = boxKey(w); if (kk){ delete saved[kk]; store(); }
      w.style.width = ""; w.style.height = ""; w.style.maxHeight = ""; place(w);
    });
    if (ro) ro.observe(w);
    boxes.push(w);
    applyBox(w, k); place(w);
  }
  function applyBox(w, k){
    var s = k && saved[k];
    if (s){ w.style.width = Math.min(s[0], (w.parentNode ? w.parentNode.clientWidth : s[0])) + "px"; w.style.height = s[1] + "px"; w.style.maxHeight = "none"; }
  }
  window.addEventListener("resize", function(){ boxes = boxes.filter(function(w){ return w.isConnected; }); boxes.forEach(place); });
  function scan(){
    Array.prototype.forEach.call(document.querySelectorAll("table"), prep);
    Array.prototype.forEach.call(document.querySelectorAll(".tblwrap, .gridwrap"), function(w){ if (!w.closest(".askchat")) prepBox(w); });
  }
  var queued = false;
  new MutationObserver(function(){ if (queued) return; queued = true; requestAnimationFrame(function(){ queued = false; scan(); }); })
    .observe(document.body, {childList:true, subtree:true});
  scan();
  window.gpdTables = { reset: function(){ saved = {}; store(); Array.prototype.forEach.call(document.querySelectorAll("table.rz-fixed"), auto); } };
})();
