/* ===== Site navigation. To add a page: add one line to NAV on every page. ===== */
(function(){
  var NAV = [
    {section:"Hub"},
    {id:"home",  label:"Home",                 desc:"Overview and headline figures",                     icon:"home",    c:"var(--steel)", href:"{{PAGES_URL}}Home.aspx"},
    {section:"Dashboards"},
    {id:"score", label:"Portfolio Score Card", desc:"NPD pipeline, CI savings, funnel, longer than forecasted", icon:"chart",   c:"var(--steel)",      href:"{{PAGES_URL}}Portfolio_Scorecard.aspx"},
    /* switched off per environment in config ("dataQuality": false): shown as Soon, not linked */
    (window.GPD_CONFIG || {}).dataQuality === false
      ? {id:"dq", label:"Data Quality",         desc:"21 data checks, flagged projects, daily tracking", icon:"check", c:"var(--steel)",      href:null, tag:"Soon"}
      : {id:"dq", label:"Data Quality",         desc:"21 data checks, flagged projects, daily tracking", icon:"check", c:"var(--steel)",      href:"{{PAGES_URL}}Data_Quality.aspx"},
    {id:"explore",label:"Portfolio Explorer",  desc:"Project-level search and drill-down",          icon:"explore", c:"var(--slate)",      href:null, tag:"Soon"}
  ];
  var CURRENT = document.body.getAttribute("data-page") || "";
  var ICON = {home:"<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M2.5 7.2 8 2.8l5.5 4.4V13a.6.6 0 0 1-.6.6H10V9.8H6v3.8H3.1a.6.6 0 0 1-.6-.6z\"/></svg>",chart:"<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"2.5\" y=\"2.5\" width=\"11\" height=\"11\" rx=\"2\"/><path d=\"M5.5 10.5v-2.5M8 10.5V5.5M10.5 10.5V7\"/></svg>",explore:"<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"7.2\" cy=\"7.2\" r=\"4.4\"/><path d=\"M13.5 13.5l-3.1-3.1M5.6 7.2h3.2M7.2 5.6v3.2\"/></svg>",check:"<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M8 1.8 13 3.6v4.1c0 3-2.1 5.4-5 6.5-2.9-1.1-5-3.5-5-6.5V3.6z\"/><path d=\"m5.6 8 1.7 1.7 3.2-3.3\"/></svg>",excel:"<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"2.5\" y=\"2.5\" width=\"11\" height=\"11\" rx=\"1.6\"/><path d=\"M2.5 6h11M2.5 9.5h11M6.2 2.5v11\"/></svg>",folder:"<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M2 4.6a1.1 1.1 0 0 1 1.1-1.1h3l1.4 1.6h5.4A1.1 1.1 0 0 1 14 6.2v5.7a1.1 1.1 0 0 1-1.1 1.1H3.1A1.1 1.1 0 0 1 2 11.9z\"/></svg>",site:"<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"8\" cy=\"8\" r=\"5.6\"/><path d=\"M2.4 8h11.2M8 2.4c1.6 1.7 2.3 3.6 2.3 5.6S9.6 11.9 8 13.6C6.4 11.9 5.7 10 5.7 8S6.4 4.1 8 2.4z\"/></svg>",chev:"<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6 3.8 10.2 8 6 12.2\"/></svg>",ext:"<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M9.5 2.5h4v4M13.5 2.5 8 8M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3\"/></svg>"};
  var $ = function(id){ return document.getElementById(id); };
  var btn=$("navBtn"), drawer=$("navDrawer"), scrim=$("navScrim"), list=$("navList"), find=$("navFind");
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  function draw(q){
    q=(q||"").toLowerCase().trim(); var out=[], pend=null, hits=0;
    NAV.forEach(function(n){
      if(n.section){ pend=n.section; return; }
      if(q && (n.label+" "+n.desc).toLowerCase().indexOf(q)<0) return;
      if(pend){ out.push('<li class="navsec">'+esc(pend)+'</li>'); pend=null; }
      hits++;
      var on=n.id===CURRENT, tag = on ? '<span class="navtag here">Here</span>' : (n.tag ? '<span class="navtag">'+esc(n.tag)+'</span>' : '');
      var inner='<span class="ic">'+ICON[n.icon]+'</span><span class="tx"><b>'+esc(n.label)+'</b><span>'+esc(n.desc)+'</span></span>'+tag;
      if(!n.href){ out.push('<li><span class="navitem off" style="--c:'+n.c+'" aria-disabled="true">'+inner+'</span></li>'); return; }
      out.push('<li><a class="navitem'+(on?' on':'')+'" style="--c:'+n.c+'" href="'+n.href+'"'+(on?' aria-current="page"':'')
        +(n.ext?' target="_blank" rel="noopener"':'')+'>'+inner+(on?'':(n.ext?ICON.ext:ICON.chev))+'</a></li>');
    });
    list.innerHTML = hits ? out.join("") : '<li class="navempty">No pages match \u201c'+esc(q)+'\u201d.</li>';
  }
  draw();
  function focusables(){ return Array.prototype.filter.call(drawer.querySelectorAll("a[href],button,input"),function(e){return e.offsetParent!==null;}); }
  function open(){
    document.body.classList.add("nav-open"); drawer.setAttribute("aria-hidden","false"); btn.setAttribute("aria-expanded","true");
    btn.classList.remove("pulse"); try{ localStorage.setItem("gpd_nav_seen","1"); }catch(e){}
    setTimeout(function(){ var a=drawer.querySelector("a.navitem.on")||find; a.focus(); },80);
  }
  function close(){
    document.body.classList.remove("nav-open"); drawer.setAttribute("aria-hidden","true"); btn.setAttribute("aria-expanded","false");
    find.value=""; draw(); btn.focus();
  }
  var isOpen=function(){ return document.body.classList.contains("nav-open"); };
  btn.onclick=function(){ isOpen()?close():open(); };
  scrim.onclick=close; $("navClose").onclick=close;
  find.oninput=function(){ draw(find.value); };
  find.onkeydown=function(e){ if(e.key==="Enter"){ var a=list.querySelector("a.navitem"); if(a){ e.preventDefault(); a.click(); } } };
  document.addEventListener("keydown",function(e){
    if(isOpen()){
      if(e.key==="Escape"){ e.preventDefault(); close(); return; }
      if(e.key==="Tab"){ var f=focusables(); if(!f.length) return; var first=f[0], last=f[f.length-1];
        if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); } }
      return;
    }
    var t=e.target, typing=t && (t.tagName==="INPUT"||t.tagName==="SELECT"||t.tagName==="TEXTAREA"||t.isContentEditable);
    if(!typing && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key==="m"||e.key==="M") && !document.querySelector("dialog[open]")){ e.preventDefault(); open(); }
  });
  try{ if(!localStorage.getItem("gpd_nav_seen")) btn.classList.add("pulse"); }catch(e){}
})();
