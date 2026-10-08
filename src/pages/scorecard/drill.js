/* ============================================================
   Drill-down: click any bucket, track, stage, headline tile or
   project on the scorecard to see the projects behind the number.
   Always works on the projects currently in view (filters apply).
   ============================================================ */
(function(){
  const $ = id => document.getElementById(id);
  const mo2 = v => (v==null||!isFinite(v)) ? "\u2014" : mo(v)+" mo";
  const D = { list:[], title:"", sort:{k:"ns",d:-1}, q:"", proj:null, back:null };

  /* ---------- what each clickable thing means ---------- */
  const BUCKETS = ["Refresh & Sustain","Grow the Core","Create & Transform","CI","CRQ"];
  function view(){ return (S.last && S.last.view) || []; }
  function npd(){ return view().filter(r => NPD_BUCKETS.indexOf(r.bucket) > -1); }
  function bucketSet(label){
    if (label.indexOf("Total NPD pipeline")===0) return {t:"NPD pipeline", rows:npd()};
    if (label.indexOf("CI track")===0) return {t:"CI track", rows:view().filter(r=>r.bucket==="CI")};
    if (label.indexOf("CRQ track")===0) return {t:"CRQ track", rows:view().filter(r=>r.bucket==="CRQ")};
    if (BUCKETS.indexOf(label)>-1) return {t:label, rows:view().filter(r=>r.bucket===label)};
    return null;
  }
  function trackRows(track){ return track==="CI" ? view().filter(r=>r.bucket==="CI") : npd(); }
  function stageSet(track, label){
    const base = trackRows(track), tname = track==="CI" ? "CI track" : "NPD pipeline";
    if (label==="Subtotal") return {t:tname+" \u00b7 Ideate to Launch", rows:base.filter(r=>stageOf(r))};
    return {t:tname+" \u00b7 "+label, rows:base.filter(r=>stageOf(r)===label)};
  }
  function kpiSet(label){
    const v=view(), R=S.threshold;
    if (/^Projects in view/.test(label)) return {t:"All projects in view", rows:v};
    if (/^NPD projects/.test(label)) return {t:"NPD projects", rows:npd()};
    if (/^CI projects/.test(label)) return {t:"CI projects", rows:v.filter(r=>r.bucket==="CI")};
    if (/time to market/i.test(label)) return {t:"Time to market \u00b7 longest forecast first", rows:v.filter(r=>r.fc!=null), sort:{k:"fc",d:-1}};
    if (/review line/.test(label)) return {t:"Over the "+R+"-month review line", rows:v.filter(r=>r.fc!=null && r.fc>R), sort:{k:"fc",d:-1}};
    if (/missing annualized NS/.test(label)) return {t:"NPD projects missing annualized NS", rows:npd().filter(r=>r.ns===null)};
    return null;
  }
  function byName(name){ return view().find(r=>r.name===name) || S.rows.find(r=>r.name===name); }

  /* ---------- make the scorecard clickable after every render ---------- */
  function mark(el, fn, label){
    el.classList.add("drillable"); el.tabIndex = 0; el.setAttribute("role","button");
    el.setAttribute("aria-label", label);
    el.onclick = e => { if (e.target.closest("button,a,input,select")) return; fn(); };
    el.onkeydown = e => { if (e.key==="Enter"||e.key===" "){ e.preventDefault(); fn(); } };
  }
  function firstCellText(tr){ const td=tr.querySelector("td"); if(!td) return ""; const c=td.cloneNode(true); c.querySelectorAll(".rank,.muted").forEach(x=>x.remove()); return c.textContent.replace(/\s+/g," ").trim(); }
  function decorate(){
    const root=$("content"); if(!root || root.hidden) return;
    /* tables: decide by their caption / section heading */
    root.querySelectorAll(".tblwrap").forEach(w=>{
      const sec=w.closest("section"), h=(sec && sec.querySelector(".shead h2")) ? sec.querySelector(".shead h2").textContent : "";
      const prev=w.previousElementSibling, cap=prev && prev.classList.contains("blockbar") ? prev.textContent : "";
      w.querySelectorAll("tbody tr").forEach(tr=>{
        const name=firstCellText(tr); if(!name || tr.querySelector("td[colspan]")) return;
        let fn=null, label="";
        if (/NPD bucket summary/.test(h) || /Movement by bucket/.test(h)){ const s=bucketSet(name); if(s){ fn=()=>open(s); label="Show the "+s.rows.length+" projects in "+s.t; } }
        else if (/Stage funnel/.test(h)){ const track=/CI track/.test(cap)?"CI":"NPD"; const s=stageSet(track,name); fn=()=>open(s); label="Show the "+s.rows.length+" projects in "+s.t; }
        else if (/Movement by stage/.test(h)){ const s=stageSet("NPD",name); fn=()=>open(s); label="Show the projects in "+s.t; }
        else if (/Top 10|longer execution time than forecasted/.test(h)){ const r=byName(name); if(r){ fn=()=>openProject(r,null); label="Show details for "+name; } }
        if (fn) mark(tr, fn, label);
      });
    });
    /* headline tiles */
    root.querySelectorAll(".kpi").forEach(k=>{ const lab=(k.querySelector(".k")||{}).textContent||""; const s=kpiSet(lab); if(s) mark(k,()=>open(s),"Show the "+s.rows.length+" projects: "+s.t); });
    root.querySelectorAll(".heroCard.npd").forEach(c=>mark(c,()=>open({t:"NPD pipeline",rows:npd()}),"Show the NPD pipeline projects"));
    root.querySelectorAll(".heroCard.ci").forEach(c=>mark(c,()=>open({t:"CI track",rows:view().filter(r=>r.bucket==="CI")}),"Show the CI projects"));
    root.querySelectorAll(".fnote").forEach(n=>{ if(!/Discovery/.test(n.textContent)) return;
      const cap=(n.closest(".tblwrap").previousElementSibling||{}).textContent||"", track=/CI track/.test(cap)?"CI":"NPD";
      const a=document.createElement("button"); a.type="button"; a.className="drilllink"; a.textContent="See them";
      a.onclick=()=>open({t:(track==="CI"?"CI track":"NPD pipeline")+" \u00b7 outside the funnel (Discovery)", rows:trackRows(track).filter(r=>!stageOf(r))});
      n.appendChild(document.createTextNode(" ")); n.appendChild(a); });
  }
  const _render = render;
  render = function(){ _render.apply(this, arguments); try{ decorate(); }catch(e){ console.error(e); } if (document.body.classList.contains("dr-open") && !D.proj) draw(); };

  /* ---------- drawer ---------- */
  function scopeText(){
    const f=S.filters, on=[];
    ["bu","biz","brand","mkt","stage","fy"].forEach(k=>{ if((f[k]||[]).length) on.push(FLABEL[k]+": "+f[k].map(optText).join(", ")); });
    if (!isDefault("phase")) on.push("Phase: "+phaseText());
    if (!isDefaultStatus()) on.push("Project Status: "+statusText());
    return on.length ? "Filtered view \u00b7 "+on.join(" \u00b7 ") : "In Progress projects in the Active Phase";
  }
  function open(s){
    D.title=s.t; D.base=s.rows.slice(); D.sort=s.sort||{k:"ns",d:-1}; D.q=""; D.proj=null; D.key=s;
    $("drFind").value=""; draw(); show();
  }
  function show(){ document.body.classList.add("dr-open"); $("drPanel").setAttribute("aria-hidden","false"); setTimeout(()=>$("drClose").focus(),60); }
  function hide(){ document.body.classList.remove("dr-open"); $("drPanel").setAttribute("aria-hidden","true"); }
  const COLS=[["name","Project",1],["_st","Stage",1],["owner","Owner",1],["finish","Ship-Trans Date",0],["fc","Forecast",0],["ns","Annualized NS",0],["cm","Annualized CM",0],["capex","Capital Investment",0],["pdinv","PD Expense",0]];
  function val(r,k){ return k==="_st" ? (stageOf(r)||strip(r.stage)) : r[k]; }
  function strip(v){ return String(v||"").replace(/^[\d\s]+/,""); }
  function rows(){
    const q=D.q.toLowerCase(), {k,d}=D.sort;
    return D.base.filter(r=>!q || [r.name,r.owner,r.brand,r.biz,r.stage].join(" ").toLowerCase().indexOf(q)>-1)
      .sort((a,b)=>{ let x=val(a,k), y=val(b,k); if(x==null||x==="") return 1; if(y==null||y==="") return -1;
        return typeof x==="string" ? d*x.localeCompare(y,"en",{numeric:true}) : d*(x-y); });
  }
  function draw(){
    $("drList").hidden=false; $("drProj").hidden=true; $("drBack").hidden=true; $("drTools").hidden=false;
    const list=rows(), all=D.base, R=S.threshold;
    const sum=k=>all.reduce((t,r)=>t+(r[k]||0),0), fcs=all.filter(r=>r.fc!=null), avg=fcs.length?fcs.reduce((t,r)=>t+r.fc,0)/fcs.length:null;
    $("drTitle").textContent=D.title;
    $("drSub").textContent=all.length+" project"+(all.length===1?"":"s")+" \u00b7 "+scopeText();
    $("drStats").innerHTML=[["Annualized NS",money(sum("ns"))],["Annualized CM",money(sum("cm"))],["Avg forecast",mo2(avg)],["Over "+R+" mo",String(all.filter(r=>r.fc!=null&&r.fc>R).length)]]
      .map(x=>'<div><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join("");
    const head='<tr>'+COLS.map(c=>{ const on=D.sort.k===c[0];
      return '<th class="'+(c[2]?'l':'')+'" aria-sort="'+(on?(D.sort.d>0?'ascending':'descending'):'none')+'"><button type="button" data-k="'+c[0]+'">'+esc(c[1])+(on?' <span class="ar">'+(D.sort.d>0?'\u25b2':'\u25bc')+'</span>':'')+'</button></th>'; }).join("")+'</tr>';
    const body=list.map((r,i)=>{ const slip = r.fc!=null && r.tgt ? (r.fc/r.tgt>1.25?"over":r.fc/r.tgt>1?"slip":"under") : "";
      return '<tr tabindex="0" data-i="'+i+'"><td class="l">'+esc(r.name)+'<small data-bucket="'+esc(r.bucket||"")+'" data-proj="'+esc(r.name)+'">'+esc(r.bucket||"")+'</small></td><td class="l">'+esc(val(r,"_st")||"\u2014")+'</td><td class="l">'+esc(r.owner||"\u2014")+'</td>'
        +'<td>'+dstr(r.finish)+'</td><td class="'+slip+'" title="target '+mo2(r.tgt)+'">'+mo2(r.fc)+'</td><td title="'+moneyFull(r.ns)+'">'+money(r.ns)+'</td><td title="'+moneyFull(r.cm)+'">'+money(r.cm)+'</td><td title="'+moneyFull(r.capex)+'">'+money(r.capex)+'</td><td title="'+moneyFull(r.pdinv)+'">'+money(r.pdinv)+'</td></tr>'; }).join("");
    $("drTable").innerHTML='<thead>'+head+'</thead><tbody>'+(body||'<tr><td colspan="9" class="muted" style="text-align:left">No projects match.</td></tr>')+'</tbody>';
    $("drCount").textContent = D.q ? list.length+" of "+all.length+" shown" : "";
    $("drTable").querySelectorAll("th button").forEach(b=>b.onclick=()=>{ const k=b.dataset.k; D.sort = D.sort.k===k ? {k,d:-D.sort.d} : {k,d:(["name","_st","owner","finish"].indexOf(k)>-1?1:-1)}; draw(); });
    $("drTable").querySelectorAll("tbody tr[data-i]").forEach(tr=>{ const go=()=>openProject(list[+tr.dataset.i], true);
      tr.onclick=go; tr.onkeydown=e=>{ if(e.key==="Enter"){ e.preventDefault(); go(); } }; });
  }
  function openProject(r, fromList){
    if(!r) return;
    D.proj=r; if(!fromList){ D.title=r.name; D.base=[r]; }
    $("drList").hidden=true; $("drTools").hidden=true; $("drProj").hidden=false; $("drBack").hidden=!fromList;
    $("drTitle").textContent=r.name;
    $("drSub").textContent=[r.bucket, stageOf(r)||strip(r.stage), r.status].filter(Boolean).join(" \u00b7 ");
    const R=S.threshold, behind=r.fc!=null&&r.tgt!=null&&r.fc>r.tgt, mx=Math.max(r.fc||0,r.tgt||0,1);
    const st = !behind ? 'good' : (r.fc>R || (r.tgt && r.fc/r.tgt>1.25)) ? 'bad' : 'caution';
    $("drStats").innerHTML=[["Annualized NS",money(r.ns)],["Annualized CM",money(r.cm)],["Incremental NS",money(r.ins)],["Investment",money(r.inv)]]
      .map(x=>'<div><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></div>').join("");
    const dl=p=>'<dl class="drdl">'+p.map(x=>'<div><dt>'+esc(x[0])+'</dt><dd>'+esc(x[1]||"\u2014")+'</dd></div>').join("")+'</dl>';
    $("drProj").innerHTML='<h3>Timeline</h3>'+dl([["Ship-Trans Date",dstr(r.finish)],["Finish year",r.fy],["Status",r.status]])
      +'<div class="drtl"><div><span>Target</span><i><b style="width:'+((r.tgt||0)/mx*100).toFixed(1)+'%"></b></i><em>'+mo2(r.tgt)+'</em></div>'
      +'<div class="'+st+'"><span>Forecast</span><i><b style="width:'+((r.fc||0)/mx*100).toFixed(1)+'%"></b></i><em>'+mo2(r.fc)+'</em></div></div>'
      +(behind?'<p class="drnote">Forecast is '+(r.fc-r.tgt).toFixed(1)+' months over target'+(r.fc>R?' and over the '+R+'-month review line':'')+'.</p>':(r.fc!=null&&r.tgt!=null?'<p class="drnote">Forecast is on or under target.</p>':''))
      +'<h3>Financials (annualized)</h3>'+dl([["Net sales",money(r.ns)],["Contribution margin",money(r.cm)],["CM %",r.ns?((r.cm/r.ns)*100).toFixed(1)+"%":"\u2014"],
          ["Incremental net sales",money(r.ins)],["Incremental CM",money(r.icm)],["Total investment",money(r.inv)],["Capital Investment",money(r.capex)],["PD Expense",money(r.pdinv)]])
      +'<h3>Ownership &amp; scope</h3>'+dl([["Owner",r.owner],["Business unit",strip(r.bu)],["Business",strip(r.biz)],["Brand",r.brand],["Market",r.mkt],["Bucket",r.bucket]]);
    $("drPanel").querySelector(".drbody").scrollTop=0;
    show();
  }
  $("drClose").onclick=hide; $("drScrim").onclick=hide;
  $("drXl").onclick=()=>{ const list=rows(); if(!list.length) return;
    const nm=D.title.replace(/[^A-Za-z0-9&+ -]/g," ").replace(/\s+/g," ").trim();
    saveXlsx(nm.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+new Date().toISOString().slice(0,10)+".xlsx",
      [{name:nm||"Projects", rows:projectRows(list)}, {name:"About", rows:[["Selection",D.title],["Scope",scopeText()],["Projects",list.length],["Downloaded",new Date().toLocaleString("en-US")]]}]); };
  $("drBack").onclick=()=>{ D.proj=null; draw(); };
  let tq; $("drFind").oninput=e=>{ clearTimeout(tq); tq=setTimeout(()=>{ D.q=e.target.value.trim(); draw(); },120); };
  document.addEventListener("keydown",e=>{ if(e.key==="Escape" && document.body.classList.contains("dr-open") && !document.body.classList.contains("ask-chat")){
    e.preventDefault(); if(D.proj && !$("drBack").hidden){ D.proj=null; draw(); } else hide(); } });
  if (S.last) decorate();
})();
