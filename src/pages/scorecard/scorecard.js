/* ============================================================
   Innovation & CI Portfolio Scorecard
   Source of truth: the PIPELINE tab of the uploaded workbook.
   Metric logic mirrors the Summary 1 sheet exactly:
     in-view  = BU is text  AND  Include matches the filter  AND  all dimension filters pass
     NPD      = Project Bucket (NEW) in {Grow the Core, Refresh & Sustain, Create & Transform}
     CI       = bucket "CI"        CRQ = bucket "CRQ"
   ============================================================ */

const NPD_BUCKETS = ["Grow the Core","Refresh & Sustain","Create & Transform"];
const BUCKET_ORDER = ["Refresh & Sustain","Grow the Core","Create & Transform"];
const STAGES = ["Ideate","Converge","Develop","Validate","Launch"];
const BCOLOR = {
  "Refresh & Sustain":"var(--b-rs)","Grow the Core":"var(--b-gc)","Create & Transform":"var(--b-ct)",
  "CI":"var(--b-ci)","CRQ":"var(--b-crq)"
};
/* Header -> internal field. Keys are whitespace-collapsed, case-insensitive. */
const FIELD_MAP = {
  "project name":"name","include":"inc","project bucket (new)":"bucket","bu":"bu","business":"biz",
  "brand":"brand","market":"mkt","phase":"phase","stage":"stage","finish":"finish","finish year":"fy",
  "target execution time (months)":"tgt","forecasted execution time (months)":"fc",
  "total ns (annualized)":"ns","total cm (annualized)":"cm",
  "incremental ns (annualized)":"ins","incremental cm (annualized)":"icm",
  "total investment (opex+capex)":"inv","project status":"status","owner":"owner","sg project type":"ptype","platform":"platform"
};
/* Columns Summary 1 tracks \u2014 used by the data integrity check. */
const TRACKED = [
  ["Project Bucket (NEW)","bucket"],["BU","bu"],["Business","biz"],["Brand","brand"],["Market","mkt"],
  ["Stage","stage"],["Finish Year","fy"],["Target Execution Time (Months)","tgt"],
  ["Forecasted Execution Time (Months)","fc"],["Total NS (Annualized)","ns"],
  ["Total CM (Annualized)","cm"],["Incremental NS (Annualized)","ins"],
  ["Incremental CM (Annualized)","icm"],["Total Investment (OPEX+CAPEX)","inv"]
];

/* ---------- state ---------- */
const S = { rows:[], meta:null, present:{}, snaps:[], filters:null, threshold:GPD_CONFIG.reviewMonths, tab:"score", exp:{}, expSeq:0, origin:null, originErr:null, db:null, user:null, canWrite:null };
const $ = id => document.getElementById(id);

/* ---------- helpers ---------- */
const ENT = {"&nbsp;":" ","&amp;":"&","&lt;":"<","&gt;":">","&quot;":'"',"&#39;":"'","&apos;":"'"};
const nk = s => String(s==null?"":s)
  .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, m => ENT[m])
  .replace(/\u00a0/g," ").replace(/\s+/g," ").trim();
const lk = s => nk(s).toLowerCase();
function num(v){ if(v===null||v===undefined||v==="") return null; if(typeof v==="number") return isFinite(v)?v:null;
  const n=parseFloat(String(v).replace(/[$,%\s,]/g,"")); return isFinite(n)?n:null; }
function money(v){ if(v===null||v===undefined) return "\u2014"; const a=Math.abs(v);
  const s = a>=1e9 ? "$"+(v/1e9).toFixed(2)+"B" : a>=1e6 ? "$"+(v/1e6).toFixed(1)+"M" : a>=1e3 ? "$"+(v/1e3).toFixed(0)+"K" : "$"+Math.round(v);
  return s.replace("$-","-$"); }
function moneyFull(v){ return v===null||v===undefined ? "" : (v<0?"-$":"$")+Math.abs(Math.round(v)).toLocaleString("en-US"); }
function pct(v,d){ return v===null||v===undefined||!isFinite(v) ? "\u2014" : (v*100).toFixed(d===undefined?1:d)+"%"; }
function mo(v){ return v===null||v===undefined||!isFinite(v) ? "\u2014" : v.toFixed(1); }
function dstr(d){ if(!d) return "\u2014";
  let x;
  if (d instanceof Date) x = d;
  else { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d));
         x = m ? new Date(+m[1], +m[2]-1, +m[3]) : new Date(d); }
  return isNaN(x) ? "\u2014" : x.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function monthKey(d){ const x=d||new Date(); return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0"); }
function monthLabel(k){ const [y,m]=k.split("-").map(Number);
  return new Date(y,m-1,1).toLocaleDateString("en-US",{month:"short",year:"2-digit"}); }
const sum = (a,f) => a.reduce((t,r)=>t+(f(r)||0),0);
function mean(a,f){ const v=a.map(f).filter(x=>x!==null&&x!==undefined&&isFinite(x)); return v.length? v.reduce((x,y)=>x+y,0)/v.length : null; }

/* ---------- workbook parsing ---------- */
function pickSheet(wb){
  const names = wb.SheetNames;
  const exact = names.find(n => nk(n).toUpperCase() === "PIPELINE");
  if (exact) return exact;
  const partial = names.filter(n => nk(n).toUpperCase().indexOf("PIPELINE") === 0)
                       .sort((a,b)=>a.length-b.length);
  if (partial.length) return partial[0];
  for (const n of names){
    const g = XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,blankrows:false,defval:null});
    for (let i=0;i<Math.min(g.length,25);i++){
      const row = (g[i]||[]).map(lk);
      if (row.indexOf("project name")>-1 && row.indexOf("project bucket (new)")>-1) return n;
    }
  }
  return null;
}
function parseWorkbook(buf, fileName){
  const wb = XLSX.read(buf,{type:"array",cellDates:true});
  const sheetName = pickSheet(wb);
  if (!sheetName) throw new Error("No PIPELINE tab found in this workbook. Check the file and try again.");
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,blankrows:false,defval:null});

  let hdrIdx = -1;
  for (let i=0;i<Math.min(grid.length,30);i++){
    const row = (grid[i]||[]).map(lk);
    if (row.indexOf("project name")>-1 && (row.indexOf("project bucket (new)")>-1 || row.indexOf("bu")>-1)){ hdrIdx=i; break; }
  }
  if (hdrIdx<0) throw new Error("Could not find the header row on the " + sheetName + " tab (looking for \u201CProject Name\u201D).");

  const header = grid[hdrIdx]||[];
  const col = {}, present = {};
  header.forEach((h,i)=>{ const f = FIELD_MAP[lk(h)]; if (f && col[f]===undefined){ col[f]=i; present[f]=nk(h); } });
  if (col.name===undefined) throw new Error("The " + sheetName + " tab has no \u201CProject Name\u201D column.");

  const rows = [];
  for (let i=hdrIdx+1;i<grid.length;i++){
    const g = grid[i]||[]; const name = nk(g[col.name]);
    if (!name) continue;
    const get = f => col[f]===undefined ? null : g[col[f]];
    const fin = get("finish");
    rows.push({
      name, inc: nk(get("inc")).toUpperCase(), bucket: nk(get("bucket")),
      bu: nk(get("bu")), biz: nk(get("biz")), brand: nk(get("brand")), mkt: nk(get("mkt")), phase: nk(get("phase")),
      stage: nk(get("stage")), fy: nk(get("fy")).replace(/\.0$/,""),
      finish: fin instanceof Date ? (function(x){ x=new Date(x.getTime()+30000); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); })(fin) : (nk(fin)||null),
      tgt:num(get("tgt")), fc:num(get("fc")), ns:num(get("ns")), cm:num(get("cm")),
      ins:num(get("ins")), icm:num(get("icm")), inv:num(get("inv")),
      status:nk(get("status")), owner:nk(get("owner")), ptype:nk(get("ptype")), platform:nk(get("platform"))
    });
  }
  if (!rows.length) throw new Error("The " + sheetName + " tab has no project rows below the header.");
  return { rows, present, meta:{ fileName, sheetName, rowCount:rows.length, uploadedAt:new Date().toISOString() } };
}

/* ---------- metric engine (mirrors Summary 1) ---------- */
function stageOf(r){
  const s = lk(r.stage);
  for (const st of STAGES) if (s.indexOf(st.toLowerCase())>-1) return st;
  return null;                                   // Discovery / pre-stage \u2014 outside the funnel
}
function tracked(rows){ return rows.filter(r => !!r.bu); }   // Summary 1: ISTEXT(BU)

const FKEYS = ["status","phase","bu","biz","brand","mkt","stage","fy"];
/* An empty selection means no restriction on that field; otherwise the
   row's value must be one of the chosen ones. Fields are ANDed together,
   values within a field are ORed. */
function hit(sel, v){ return !sel || !sel.length || sel.indexOf(v) > -1; }
function inView(rows, f, skipKey){
  return tracked(rows).filter(r =>
    FKEYS.every(k => k===skipKey || hit(f[k], r[k]))
  );
}
function agg(set){
  return { n:set.length, fc:mean(set,r=>r.fc), tgt:mean(set,r=>r.tgt),
           ns:sum(set,r=>r.ns), ins:sum(set,r=>r.ins), cm:sum(set,r=>r.cm), icm:sum(set,r=>r.icm),
           inv:sum(set,r=>r.inv) };
}
function compute(rows, f, threshold){
  const view = inView(rows,f);
  const npd = view.filter(r=>NPD_BUCKETS.indexOf(r.bucket)>-1);
  const ci  = view.filter(r=>r.bucket==="CI");
  const crq = view.filter(r=>r.bucket==="CRQ");
  const denom = npd.length + ci.length + crq.length;

  const buckets = BUCKET_ORDER.map(b => Object.assign({label:b}, agg(view.filter(r=>r.bucket===b))));
  const npdTotal = Object.assign({label:"Total NPD pipeline"}, agg(npd));
  const ciTotal  = Object.assign({label:"CI track (savings \u2014 not in NPD total)"}, agg(ci));
  const crqTotal = Object.assign({label:"CRQ track (compliance/regulatory \u2014 not in NPD total)"}, agg(crq));

  const funnel = set => {
    const rowsOut = STAGES.map(st => Object.assign({label:st}, agg(set.filter(r=>stageOf(r)===st))));
    const inFunnel = set.filter(r=>stageOf(r));
    return { rows:rowsOut, total:Object.assign({label:"Subtotal"}, agg(inFunnel)), outside:set.length-inFunnel.length };
  };

  const byDesc = (a,key) => a.filter(r=>r[key]!==null&&r[key]!==undefined&&r[key]!==0)
                             .sort((x,y)=>y[key]-x[key]).slice(0,10);
  const review = view.filter(r=>r.fc!==null && r.fc>threshold).sort((a,b)=>b.fc-a.fc);

  return {
    view, denom, buckets, npdTotal, ciTotal, crqTotal,
    kpi:{
      inView:view.length, npdNs:npdTotal.ns, npdN:npd.length, ciCm:ciTotal.cm, ciN:ci.length,
      crqN:crq.length, avgFc:mean(view,r=>r.fc), avgTgt:mean(view,r=>r.tgt),
      review:review.length, missingNs:npd.filter(r=>r.ns===null).length, inv:sum(view,r=>r.inv)
    },
    npdFunnel:funnel(npd), ciFunnel:funnel(ci),
    topNpd:byDesc(npd,"ns"), topCi:byDesc(ci,"icm"), review
  };
}
/* Unfiltered portfolio state, stored monthly for the trend. */
function filtersActive(){
  const norm = f => FKEYS.map(k => k+":"+((f[k]||[]).slice().sort().join(","))).join("|");
  return norm(S.filters) !== norm(defaultFilters());
}
function snapshotMetrics(rows, filters){
  const c = compute(rows, filters || defaultFilters(), 30);
  const out = { projects:c.kpi.inView, npdN:c.kpi.npdN, npdNs:c.npdTotal.ns, npdIns:c.npdTotal.ins,
    npdCm:c.npdTotal.cm, npdIcm:c.npdTotal.icm, ciN:c.kpi.ciN, ciCm:c.ciTotal.cm, ciIcm:c.ciTotal.icm,
    crqN:c.kpi.crqN, avgFc:c.kpi.avgFc, avgTgt:c.kpi.avgTgt, review:c.kpi.review, inv:c.kpi.inv, buckets:{}, stages:{} };
  c.buckets.forEach(b=>{ out.buckets[b.label]={n:b.n,ns:b.ns}; });
  c.npdFunnel.rows.forEach(s=>{ out.stages[s.label]={n:s.n,ns:s.ns}; });
  return out;
}

/* ---------- small inline SVG charts ---------- */
function sparkline(vals,color,w,h){
  w=w||132; h=h||44;
  const v = vals.filter(x=>x!==null&&isFinite(x));
  if (v.length<2) return '<svg width="'+w+'" height="'+h+'" role="presentation"></svg>';
  const mn=Math.min.apply(null,v), mx=Math.max.apply(null,v), rg=(mx-mn)||Math.abs(mx)||1;
  const pad=4, iw=w-pad*2, ih=h-pad*2;
  const pts = v.map((y,i)=>[pad+(v.length===1?iw/2:i*iw/(v.length-1)), pad+ih-((y-mn)/rg)*ih]);
  const line = pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const area = line+" L"+pts[pts.length-1][0].toFixed(1)+" "+(h-pad)+" L"+pts[0][0].toFixed(1)+" "+(h-pad)+" Z";
  const last = pts[pts.length-1];
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="trend over the last '+v.length+' months">'
    +'<path d="'+area+'" fill="'+color+'" opacity=".12"/>'
    +'<path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'
    +'<circle cx="'+last[0].toFixed(1)+'" cy="'+last[1].toFixed(1)+'" r="4" fill="'+color+'"/></svg>';
}
function trendChart(snaps,key,color,fmt){
  const w=300, h=108, pad={t:10,r:10,b:20,l:10};
  const v = snaps.map(s=>s.m[key]).map(x=> (x===null||x===undefined||!isFinite(x))?null:x);
  const ok = v.filter(x=>x!==null);
  if (!ok.length) return '<div class="muted" style="font-size:11.5px;padding:10px 0">No history yet.</div>';
  // pad the domain around the data so a small movement is still readable
  let mn=Math.min.apply(null,ok), mx=Math.max.apply(null,ok);
  if (mx===mn){ const b=Math.abs(mx)*0.1||1; mn-=b; mx+=b; }
  else { const b=(mx-mn)*0.18; mn-=b; mx+=b; }
  const rg=mx-mn, iw=w-pad.l-pad.r, ih=h-pad.t-pad.b, n=v.length;
  const X=i=> n===1 ? pad.l+iw/2 : pad.l+i*iw/(n-1);
  const Y=y=> pad.t+ih-((y-mn)/rg)*ih;
  // thin the axis labels so they never collide
  const step = Math.max(1, Math.ceil(n/4));
  let labels="", line="", area="", dots="";
  v.forEach((y,i)=>{
    const x=X(i);
    if (i%step===0 || i===n-1){
      const anchor = i===0 ? "start" : i===n-1 ? "end" : "middle";
      const lx = i===0 ? pad.l : i===n-1 ? w-pad.r : x;
      labels+='<text x="'+lx.toFixed(1)+'" y="'+(h-6)+'" text-anchor="'+anchor+'" font-size="8.5" fill="var(--ink-3)">'+esc(monthLabel(snaps[i].month))+'</text>';
    }
    if(y===null) return;
    line+=(line?"L":"M")+x.toFixed(1)+" "+Y(y).toFixed(1)+" ";
    dots+='<circle cx="'+x.toFixed(1)+'" cy="'+Y(y).toFixed(1)+'" r="3.6" fill="'+color+'"><title>'+esc(monthLabel(snaps[i].month))+": "+esc(fmt(y))+'</title></circle>';
  });
  if (line){
    const first=X(v.findIndex(y=>y!==null)), last=X(n-1);
    area = line+" L"+last.toFixed(1)+" "+(pad.t+ih)+" L"+first.toFixed(1)+" "+(pad.t+ih)+" Z";
  }
  return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" role="img" aria-label="monthly trend" style="display:block;margin-top:6px;overflow:visible">'
    +'<line x1="'+pad.l+'" x2="'+(w-pad.r)+'" y1="'+(pad.t+ih)+'" y2="'+(pad.t+ih)+'" stroke="var(--rule)" stroke-width="1"/>'
    +'<path d="'+area+'" fill="'+color+'" opacity=".10"/>'
    +'<path d="'+line+'" fill="none" stroke="'+color+'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'
    +dots+labels+'</svg>';
}

/* ---------- rendering ---------- */
function deltaHTML(cur,prev,fmt){
  if (prev===null||prev===undefined||!isFinite(prev)||cur===null||!isFinite(cur))
    return '<div class="delta flat">No prior month to compare</div>';
  const d=cur-prev, p = prev!==0 ? d/Math.abs(prev) : null;
  const cls = Math.abs(d)<1e-9 ? "flat" : d>0 ? "up" : "down";
  const sign = d>0?"+":"";
  return '<div class="delta '+cls+'">'+sign+fmt(d)+(p!==null?" ("+sign+(p*100).toFixed(1)+"%)":"")+" vs last month</div>";
}
function bucketRow(b,denom,alt){
  const share = denom? b.n/denom : 0;
  return '<tr class="'+(alt?"alt":"")+'"><td><span class="chip" data-bucket="'+esc(b.label)+'"><i class="dot" style="background:'+(BCOLOR[b.label]||"var(--ink-3)")+'"></i>'+esc(b.label)+'</span></td>'
    +'<td>'+b.n+'</td>'
    +'<td><div class="pctcell"><span>'+pct(share,1)+'</span><span class="bar"><i style="width:'+(share*100).toFixed(1)+'%;background:'+(BCOLOR[b.label]||"var(--ink-3)")+'"></i></span></div></td>'
    +'<td>'+mo(b.fc)+'</td><td title="'+moneyFull(b.ns)+'">'+money(b.ns)+'</td><td title="'+moneyFull(b.ins)+'">'+money(b.ins)+'</td>'
    +'<td title="'+moneyFull(b.cm)+'">'+money(b.cm)+'</td><td title="'+moneyFull(b.icm)+'">'+money(b.icm)+'</td>'
    +'<td>'+(b.ns?pct(b.cm/b.ns,1):"\u2014")+'</td></tr>';
}
function totalRow(b,denom,label){
  const share = denom? b.n/denom : 0;
  return '<tr class="sub"><td><span data-bucket="'+esc(b.label)+'">'+esc(label||b.label)+'</span></td><td>'+b.n+'</td><td>'+pct(share,1)+'</td><td>'+mo(b.fc)+'</td>'
    +'<td title="'+moneyFull(b.ns)+'">'+money(b.ns)+'</td><td title="'+moneyFull(b.ins)+'">'+money(b.ins)+'</td>'
    +'<td title="'+moneyFull(b.cm)+'">'+money(b.cm)+'</td><td title="'+moneyFull(b.icm)+'">'+money(b.icm)+'</td>'
    +'<td>'+(b.ns?pct(b.cm/b.ns,1):"\u2014")+'</td></tr>';
}
const TBL_HEAD = '<thead><tr><th>Bucket</th><th># Projects</th><th>% of pipeline</th><th>Execution time (mo)</th>'
  +'<th>Annualized NS</th><th>Annualized incr NS</th><th>Annualized CM</th><th>Annualized incr CM</th><th>CM %</th></tr></thead>';
const FUNNEL_HEAD = '<thead><tr><th>Stage</th><th># Projects</th><th>% of track</th><th>Exec (mo)</th><th>Annualized NS</th><th>Annualized CM</th><th>CM %</th></tr></thead>';

function funnelTable(f,color,caption){
  const tot=f.total.n||1;
  let body="";
  f.rows.forEach((s,i)=>{
    const share=s.n/tot;
    body+='<tr class="'+(i%2?"alt":"")+'"><td><span class="chip"><i class="dot" style="background:'+color+';opacity:'+(0.35+0.16*i).toFixed(2)+'"></i>'+esc(s.label)+'</span></td>'
      +'<td>'+s.n+'</td><td><div class="pctcell"><span>'+pct(share,0)+'</span><span class="bar"><i style="width:'+(share*100).toFixed(1)+'%;background:'+color+';opacity:'+(0.35+0.16*i).toFixed(2)+'"></i></span></div></td>'
      +'<td>'+mo(s.fc)+'</td><td title="'+moneyFull(s.ns)+'">'+money(s.ns)+'</td><td title="'+moneyFull(s.cm)+'">'+money(s.cm)+'</td>'
      +'<td>'+(s.ns?pct(s.cm/s.ns,1):"\u2014")+'</td></tr>';
  });
  body+='<tr class="sub"><td>Subtotal</td><td>'+f.total.n+'</td><td>100.0%</td><td>'+mo(f.total.fc)+'</td>'
    +'<td title="'+moneyFull(f.total.ns)+'">'+money(f.total.ns)+'</td><td title="'+moneyFull(f.total.cm)+'">'+money(f.total.cm)+'</td>'
    +'<td>'+(f.total.ns?pct(f.total.cm/f.total.ns,1):"\u2014")+'</td></tr>';
  const e=f.rows[0].n+f.rows[1].n, l=f.rows[3].n+f.rows[4].n, t=f.total.n||1;
  const note='<div class="fnote">'+Math.round(e/t*100)+'% early (Ideate + Converge) \u00b7 '+Math.round(l/t*100)+'% late (Validate + Launch)'
    +(f.outside? ' \u00b7 '+f.outside+' project'+(f.outside>1?"s":"")+' in Discovery, outside the funnel':'')+'</div>';
  const id = expId(caption||"Stage funnel","table");
  return expBar(caption||"Stage funnel", id)
    + '<div class="tblwrap" data-exp-id="'+id+'"><table>'+FUNNEL_HEAD+'<tbody>'+body+'</tbody></table>'+note+'</div>';
}
function slipClass(r){
  if (r.fc===null||r.tgt===null||!r.tgt) return "";
  const ratio = r.fc/r.tgt;
  return ratio>1.25 ? "over" : ratio>1 ? "slip" : "under";
}
function projectTable(list,valueLabel,id){
  let body="";
  list.forEach((r,i)=>{
    body+='<tr class="'+(i%2?"alt":"")+'"><td><span class="rank">'+(i+1)+'</span>'+esc(r.name)+'</td>'
      +'<td><span class="chip" style="justify-content:flex-end" data-bucket="'+esc(r.bucket||"")+'" data-proj="'+esc(r.name)+'"><i class="dot" style="background:'+(BCOLOR[r.bucket]||"var(--ink-3)")+'"></i>'+esc(r.bucket||"\u2014")+'</span></td>'
      +'<td>'+dstr(r.finish)+'</td>'
      +'<td class="'+slipClass(r)+'" title="'+(r.tgt!==null?"target "+mo(r.tgt)+" mo":"")+'">'+mo(r.fc)+'</td>'
      +'<td title="'+moneyFull(r.ns)+'">'+money(r.ns)+'</td><td title="'+moneyFull(r.ins)+'">'+money(r.ins)+'</td>'
      +'<td title="'+moneyFull(r.cm)+'">'+money(r.cm)+'</td><td title="'+moneyFull(r.icm)+'">'+money(r.icm)+'</td>'
      +'<td>'+(r.ns?pct(r.cm/r.ns,1):"\u2014")+'</td></tr>';
  });
  if(!list.length) body='<tr><td colspan="9" class="muted">No projects match the current filters.</td></tr>';
  return expTable(id, '<table><thead><tr><th>Project</th><th>Bucket</th><th>End date</th><th>Exec (mo)</th>'
    +'<th>'+esc(valueLabel)+'</th><th>Annualized incr NS</th><th>Annualized CM</th><th>Annualized incr CM</th><th>CM %</th></tr></thead>'
    +'<tbody>'+body+'</tbody></table>');
}
function reviewTable(list,threshold,id){
  let body="";
  list.slice(0,25).forEach((r,i)=>{
    const over = r.tgt!==null ? r.fc-r.tgt : null;
    body+='<tr class="'+(i%2?"alt":"")+'"><td>'+esc(r.name)+'</td>'
      +'<td><span class="chip" style="justify-content:flex-end" data-bucket="'+esc(r.bucket||"")+'" data-proj="'+esc(r.name)+'"><i class="dot" style="background:'+(BCOLOR[r.bucket]||"var(--ink-3)")+'"></i>'+esc(r.bucket||"\u2014")+'</span></td>'
      +'<td>'+esc(r.stage||"\u2014")+'</td><td class="over">'+mo(r.fc)+'</td><td>'+mo(r.tgt)+'</td>'
      +'<td class="over">'+(over===null?"\u2014":"+"+over.toFixed(1))+'</td>'
      +'<td title="'+moneyFull(r.ns)+'">'+money(r.ns)+'</td><td>'+dstr(r.finish)+'</td></tr>';
  });
  if(!list.length) body='<tr><td colspan="8" class="muted">Nothing over '+threshold+' months. </td></tr>';
  const more = list.length>25 ? '<div class="fnote">Showing the 25 longest of '+list.length+' projects over the threshold.</div>' : "";
  return expTable(id, '<table><thead><tr><th>Project (longest first)</th><th>Bucket</th><th>Stage</th>'
    +'<th>Forecast (mo)</th><th>Target (mo)</th><th>Over target</th><th>Annualized NS</th><th>End date</th></tr></thead>'
    +'<tbody>'+body+'</tbody></table>'+more);
}


/* ============================================================
   Export. Every table and chart carries its own button; the
   masthead button writes whatever the current view is showing.
   ============================================================ */
const DL_ICON = '<svg class="xl" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="14" height="14" rx="3" fill="#1D6F42"/><path d="M4 5.2h8M4 8h8M4 10.8h8M7.2 3.6v8.8" stroke="#fff" stroke-width="1.15" stroke-linecap="round" fill="none"/></svg>';

/* Registry of everything exportable in the view Claude just rendered.
   Tables are read back out of the DOM at click time, so an export can
   never drift from what the reader is looking at. Charts keep their
   series here because an SVG has no rows to read. */
function expReset(){ S.exp = {}; S.expSeq = 0; }
function expId(name, kind, payload){
  const id = "x"+(++S.expSeq);
  S.exp[id] = Object.assign({name, kind}, payload||{});
  return id;
}
function expBtn(id, label){
  return '<button class="expbtn" data-exp="'+id+'" title="Download '+esc(label||"this")+' to Excel" '
    + 'aria-label="Download '+esc(label||"this")+' to Excel">'+DL_ICON+'Excel</button>';
}
/* Wrap a table so it owns an id the exporter can find. */
function expTable(id, inner){ return '<div class="tblwrap" data-exp-id="'+id+'">'+inner+'</div>'; }
/* A labelled bar above a table: caption on the left, export on the right. */
function expBar(label, id){
  return '<div class="blockbar"><span class="blocklab">'+esc(label)+'</span>'+expBtn(id,label)+'</div>';
}

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,48);
const csvCell = v => '"'+String(v==null?"":v).replace(/"/g,'""')+'"';
const csvLine = a => a.map(csvCell).join(",");

/* Pull a rendered table back out as rows. Money cells carry the exact
   figure in their title attribute, so the CSV keeps full precision
   even though the screen shows $1.01B. */
function tableRows(wrap){
  const tbl = wrap.querySelector("table");
  if (!tbl) return [];
  return Array.from(tbl.querySelectorAll("tr")).map(tr =>
    Array.from(tr.children).map(td => {
      const t = (td.getAttribute("title")||"").trim();
      if (/^-?\$[\d,]+$/.test(t)) return t.replace(/[$,]/g,"");
      return td.textContent.replace(/\s+/g," ").trim().replace(/^\d+\s/,"");
    })
  );
}
function expRows(id){
  const e = S.exp[id]; if (!e) return [];
  if (e.kind === "chart") return [e.headers].concat(e.rows);
  const wrap = document.querySelector('[data-exp-id="'+id+'"]');
  return wrap ? tableRows(wrap) : [];
}
/* Context rows so a downloaded file explains itself weeks later. */
function expContext(){
  const f = S.filters, on = [];
  ["bu","biz","brand","mkt","stage","fy","phase","status"].forEach(k => {
    if ((f[k]||[]).length) on.push(FLABEL[k]+" = "+f[k].map(optText).join(" | "));
  });
  return [
    ["Innovation & CI Portfolio Scorecard"],
    ["View", S.tab==="trend" ? "Month-over-month trend" : "Scorecard"],
    ["Data updated", S.meta && S.meta.sourceModified ? new Date(S.meta.sourceModified).toLocaleString("en-US") : ""],
    ["Downloaded", new Date().toLocaleString("en-US")],
    ["Filters", on.length ? on.join("; ") : "none"],
    ["Review threshold (months)", S.threshold],
    ["Projects in view", S.last ? S.last.kpi.inView : ""]
  ];
}
/* numbers stay numbers in Excel; percentages become real percentages */
function xlCell(v){
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v;
  const t = String(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (/^-?\d+(\.\d+)?%$/.test(t)) return { v: Number(t.slice(0,-1))/100, t: "n", z: "0.0%" };
  if (t === "\u2014") return "";
  return t;
}
function xlSheet(rows){
  const aoa = rows.map(r => r.map(xlCell));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const widths = [];
  aoa.forEach(r => r.forEach((c,i) => { const n = String(c && c.v !== undefined ? c.v : c).length; widths[i] = Math.min(60, Math.max(widths[i]||8, n+2)); }));
  ws["!cols"] = widths.map(w => ({wch:w}));
  return ws;
}
function saveXlsx(filename, sheets){
  const wb = XLSX.utils.book_new(), used = {};
  sheets.forEach(sh => {
    let nm = String(sh.name||"Sheet").replace(/[\\\/\?\*\[\]:]/g," ").slice(0,31).trim() || "Sheet", k = 2;
    while (used[nm.toLowerCase()]) nm = nm.slice(0,28)+" "+(k++);
    used[nm.toLowerCase()] = 1;
    XLSX.utils.book_append_sheet(wb, xlSheet(sh.rows), nm);
  });
  XLSX.writeFile(wb, filename, {compression:true});
}
window.saveXlsx = saveXlsx;
const stamp = () => new Date().toISOString().slice(0,10);
/* One table or chart. */
function exportOne(id){
  const e = S.exp[id]; if (!e) return;
  const rows = expRows(id); if (!rows.length) return;
  saveXlsx(slug(e.name)+"-"+stamp()+".xlsx", [{name:e.name, rows: rows}, {name:"About", rows: expContext()}]);
}
/* Every table on screen, one sheet each. */
function exportView(){
  const sheets = [];
  document.querySelectorAll("#content [data-exp-id]").forEach(el => {
    const id = el.getAttribute("data-exp-id"), e = S.exp[id], rows = expRows(id);
    if (e && rows.length) sheets.push({name:e.name, rows:rows});
  });
  sheets.push({name:"About", rows: expContext()});
  saveXlsx((S.tab==="trend"?"portfolio-trend-":"portfolio-scorecard-")+stamp()+".xlsx", sheets);
}
/* Every project in the data, plus the ones in the current view. */
const PROJECT_COLS = [["Project","name"],["Status","status"],["Bucket","bucket"],["Stage","stage"],["Owner","owner"],
  ["Business unit","bu"],["Business","biz"],["Brand","brand"],["Market","mkt"],["Finish","finish"],["Finish year","fy"],
  ["Target execution (months)","tgt"],["Forecast execution (months)","fc"],["Annualized net sales","ns"],["Annualized CM","cm"],
  ["Annualized incremental NS","ins"],["Annualized incremental CM","icm"],["Total investment (OPEX+CAPEX)","inv"]];
function projectRows(list){
  return [PROJECT_COLS.map(c=>c[0])].concat(list.map(r => PROJECT_COLS.map(c => {
    const v = r[c[1]]; return v === null || v === undefined ? "" : v; })));
}
window.projectRows = projectRows;
function exportAllProjects(){
  const all = tracked(S.rows), view = (S.last && S.last.view) || [];
  saveXlsx("portfolio-projects-"+stamp()+".xlsx", [
    {name:"All projects ("+all.length+")", rows: projectRows(all)},
    {name:"Current view ("+view.length+")", rows: projectRows(view)},
    {name:"About", rows: expContext()}
  ]);
}

function render(){
  const c = compute(S.rows, S.filters, S.threshold);
  S.last = c;
  $("inviewN").textContent = c.kpi.inView;

  const hist = S.snaps.slice().sort((a,b)=>a.month<b.month?-1:1);
  const curKey = monthKey();
  const prior = hist.filter(s=>s.month!==curKey);
  const prev = prior.length ? prior[prior.length-1] : null;
  const norm = f => FKEYS.map(k => k+":"+((f[k]||[]).slice().sort().join(","))).join("|");
  const filtered = norm(S.filters) !== norm(defaultFilters());
  expReset();

  /* tab chrome */
  $("tabsrow").hidden = false;
  $("tabTrendN").textContent = hist.length;
  $("tab_score").classList.toggle("on", S.tab!=="trend");
  $("tab_trend").classList.toggle("on", S.tab==="trend");
  $("tab_score").setAttribute("aria-selected", S.tab!=="trend");
  $("tab_trend").setAttribute("aria-selected", S.tab==="trend");
  document.querySelector(".rail").hidden = false;

  $("content").innerHTML = S.tab==="trend" ? trendView(hist) : scorecardView(c,hist,prev,filtered);
  $("content").hidden = false;
  $("emptyState").hidden = true;
  const sb = $("snapBtn"); if (sb) sb.onclick = () => captureSnapshot(true);
  $("content").querySelectorAll("[data-del]").forEach(b =>
    b.onclick = () => deleteSnapshot(b.getAttribute("data-del")));
  $("content").querySelectorAll("[data-moveto]").forEach(b => b.onclick = () => {
    const from = b.getAttribute("data-moveto");
    const inp = $("content").querySelector('[data-move="'+from+'"]');
    if (inp) moveSnapshot(from, inp.value);
  });
  const ga = $("glanceAct");

  $("content").querySelectorAll(".expbtn").forEach(btn => {
    btn.onclick = () => { exportOne(btn.getAttribute("data-exp")); flashBtn(btn); };
  });
  renderFoot();
}

function scorecardView(c,hist,prev,filtered){
  let h = "";

  /* hero */
  const glanceAct = '<span class="act" id="glanceAct"></span>';
  h += '<section><div class="shead"><h2>Portfolio at a glance</h2><span class="sub">'
    + (filtered ? "Filtered view" : "Full portfolio")
    + (S.present.phase ? " \u00b7 Phase = " + esc(phaseText()) : "") + " \u00b7 Project Status = " + esc(statusText()) + '</span>'
    + glanceAct + '</div>';
  h += '<div class="hero">';
  const heroNpdId = expId("NPD annualized NS by month","chart",
    {headers:["Month","NPD annualized NS"], rows:hist.map(s=>[s.month, s.m.npdNs])});
  const heroCiId = expId("CI annualized CM by month","chart",
    {headers:["Month","CI annualized CM"], rows:hist.map(s=>[s.month, s.m.ciCm])});
  h += '<div class="heroCard npd" data-exp-id="'+heroNpdId+'"><div class="txt">'
    + '<div class="labrow"><div class="lab">Total NPD pipeline \u2014 annualized net sales</div>'
    + '</div>'
    + '<div class="val" title="'+moneyFull(c.npdTotal.ns)+'">'+money(c.npdTotal.ns)+'</div>'
    + '<div class="meta">'+c.kpi.npdN+' projects across Refresh &amp; Sustain, Grow the Core and Create &amp; Transform</div>'
    + (filtered ? '<div class="delta flat">Month-over-month compares the full portfolio</div>' : deltaHTML(c.npdTotal.ns, prev?prev.m.npdNs:null, money))
    + '</div><div class="spark">'+sparkline(hist.map(s=>s.m.npdNs),"var(--kpi)")+'</div></div>';
  h += '<div class="heroCard ci" data-exp-id="'+heroCiId+'"><div class="txt">'
    + '<div class="labrow"><div class="lab">CI track \u2014 annualized CM (savings)</div>'
    + '</div>'
    + '<div class="val" title="'+moneyFull(c.ciTotal.cm)+'">'+money(c.ciTotal.cm)+'</div>'
    + '<div class="meta">'+c.kpi.ciN+' continuous improvement projects, held outside the NPD total</div>'
    + (filtered ? '<div class="delta flat">Month-over-month compares the full portfolio</div>' : deltaHTML(c.ciTotal.cm, prev?prev.m.ciCm:null, money))
    + '</div><div class="spark">'+sparkline(hist.map(s=>s.m.ciCm),"var(--kpi)")+'</div></div>';
  h += '</div>';

  /* kpi strip */
  const kp = [
    ["Projects in view", c.kpi.inView,
      (c.kpi.inView>c.denom ? (c.kpi.inView-c.denom)+" with no bucket assigned" : "tracked rows after filters"),
      c.kpi.inView>c.denom],
    ["NPD projects", c.kpi.npdN, "of "+c.denom+" NPD + CI + CRQ", false],
    ["CI projects", c.kpi.ciN, c.kpi.crqN+" CRQ alongside", false],
    ["Avg time to market \u2014 forecast", mo(c.kpi.avgFc)+" mo", "target "+mo(c.kpi.avgTgt)+" mo", c.kpi.avgFc>c.kpi.avgTgt],
    ["Over the "+S.threshold+"-month review line", c.kpi.review, "candidates for review", c.kpi.review>0],
    ["NPD rows missing annualized NS", c.kpi.missingNs, "data gaps to close", c.kpi.missingNs>0]
  ];
  S.lastKpiId = null;
  const kpiId = expId("Portfolio at a glance","chart",
    {headers:["Metric","Value","Note"], rows:kp.map(k=>[k[0], k[1], k[2]])});
  S.lastKpiId = kpiId;
  h += '<div class="kpis" data-exp-id="'+kpiId+'">' + kp.map(k =>
    '<div class="kpi'+(k[3]?" flag":"")+'"><div class="k">'+esc(k[0])+'</div><div class="v">'+esc(String(k[1]))+'</div><div class="f">'+esc(k[2])+'</div></div>'
  ).join("") + '</div></section>';

  /* bucket summary */
  const bucketId = expId("NPD bucket summary","table");
  h += '<section><div class="shead"><h2>NPD bucket summary</h2><span class="sub">CI and CRQ are reported separately and excluded from the NPD total \u00b7 click any row to see its projects</span>'
    + '<span class="act">'+expBtn(bucketId,"the bucket summary")+'</span></div>';
  let rows = c.buckets.map((b,i)=>bucketRow(b,c.denom,i%2)).join("");
  rows += totalRow(c.npdTotal,c.denom) + totalRow(c.ciTotal,c.denom) + totalRow(c.crqTotal,c.denom);
  h += expTable(bucketId, '<table>'+TBL_HEAD+'<tbody>'+rows+'</tbody></table>') + '</section>';

  /* funnels */
  h += '<section><div class="shead"><h2>Stage funnel</h2><span class="sub">Ideate through Launch</span></div><div class="funnels">'
    + '<div>'+funnelTable(c.npdFunnel,"var(--kpi)","NPD pipeline funnel")+'</div>'
    + '<div>'+funnelTable(c.ciFunnel,"var(--kpi)","CI track funnel")+'</div>'
    + '</div></section>';

  /* top tables */
  const topNpdId = expId("Top 10 NPD projects by annualized net sales","table");
  const topCiId  = expId("Top 10 CI projects by annualized incremental CM","table");
  h += '<section><div class="shead"><h2>Top 10 NPD projects</h2><span class="sub">by annualized net sales</span>'
    + '<span class="act">'+expBtn(topNpdId,"the top 10 NPD projects")+'</span></div>'
    + projectTable(c.topNpd,"Annualized NS",topNpdId)+'</section>';
  h += '<section><div class="shead"><h2>Top 10 CI projects</h2><span class="sub">by annualized incremental CM</span>'
    + '<span class="act">'+expBtn(topCiId,"the top 10 CI projects")+'</span></div>'
    + projectTable(c.topCi,"Annualized NS",topCiId)+'</section>';

  /* review */
  const reviewId = expId("Candidates for review over "+S.threshold+" months","table");
  h += '<section><div class="shead"><h2>Candidates for review</h2><span class="sub">forecast execution time over '+S.threshold+' months</span>'
    + '<span class="act">'+expBtn(reviewId,"the review candidates")+'</span></div>'
    + reviewTable(c.review,S.threshold,reviewId)+'</section>';

  /* integrity */
  h += '<section><div class="shead"><h2>Data check</h2><span class="sub">fields the scorecard needs for every project</span></div><div class="integrity">'
    + TRACKED.map(t => '<span class="ipill '+(S.present[t[1]]?"good":"bad")+'">'+esc(t[0])+(S.present[t[1]]?"":" \u2014 missing")+'</span>').join("")
    + '</div></section>';

  return h;
}

function trendView(histAll){
  const active = filtersActive();
  const dropped = [];
  const usable = histAll.filter(sn => {
    if (storedOk(sn)) return true;
    const cov = coverage(sn);
    if (!cov.ok){ dropped.push({month:sn.month, why:cov.why}); return false; }
    return true;
  });
  const hist = usable.map(sn => ({month:sn.month, capturedAt:sn.capturedAt, fileName:sn.fileName,
                                  m: metricsFor(sn)}));

  let h = '<div class="tnote"><span>' + (active
      ? 'Showing the <strong>filtered</strong> view \u2014 every month below is recalculated against the filters you set above.'
      : 'Every figure on this tab covers the <strong>In Progress</strong> projects in the <strong>Active Phase</strong>.')
    + '</span><span class="act"><button class="btn sm" id="snapBtn">Snapshot this month now</button></span></div>';

  if (S.trendLoading)
    h += '<div class="warnbar"><span>Recalculating earlier months against the filters\u2026</span></div>';
  if (dropped.length && !S.trendLoading){
    const lines = dropped.map(d => esc(monthLabel(d.month)) + " \u2014 " + esc(d.why));
    h += '<div class="warnbar"><span><b>'
       + dropped.length + ' month' + (dropped.length>1?"s are":" is") + ' not comparable under this view</b>'
       + ' and ' + (dropped.length>1?"have":"has") + ' been left out, rather than plotted as zero:<br>'
       + lines.join('<br>')
       + '<br><span class="muted">A month that never covered what you are filtering on would otherwise draw a line up from $0 and read as growth.</span>'
       + '</span></div>';
  }
  if (!hist.length)
    return h + '<div class="empty"><b>No month covers this selection</b>'
      + 'None of the stored snapshots contain projects matching these filters, so there is nothing to compare. '
      + 'Clear or widen the filters to see the trend.</div>';

  h += '<section><div class="shead"><h2>Headline movement</h2>'
    + '<span class="sub">' + (hist.length ? hist.length + ' month' + (hist.length===1?"":"s") + ' of history \u00b7 newest ' + esc(monthLabel(hist[hist.length-1].month)) : 'no history yet') + '</span></div>'
    + trendSection(hist) + '</section>';

  if (hist.length){
    h += movementTable(hist, "Movement by bucket", "buckets",
      BUCKET_ORDER, "Projects and annualized net sales in each NPD bucket");
    h += movementTable(hist, "Movement by stage", "stages",
      STAGES, "How the NPD funnel has shifted between Ideate and Launch");
  }
  return h;
}

/* One table per grouped dimension: a column per month, plus the change across the window. */
function movementTable(hist, title, key, labels, sub){
  const months = hist.slice(-6);                       // keep the grid readable
  const cell = (s,lab,f) => { const g = s.m[key]||{}; const o = g[lab]; return o ? o[f] : null; };
  const rowFor = (lab,f,fmt,i) => {
    const vals = months.map(s=>cell(s,lab,f));
    const first = vals.find(v=>v!==null&&v!==undefined);
    const last = vals[vals.length-1];
    let d = '<td class="muted">\u2014</td>';
    if (first!==undefined && first!==null && last!==null && last!==undefined){
      const diff = last-first, cls = Math.abs(diff)<1e-9 ? "" : diff>0 ? "under" : "over";
      d = '<td class="'+cls+'">'+(diff>0?"+":"")+fmt(diff)+'</td>';
    }
    const dot = BCOLOR[lab]
      ? 'background:'+BCOLOR[lab]
      : 'background:var(--steel);opacity:'+(0.35+0.16*i).toFixed(2);   // stage ramp, matching the funnel
    return '<tr class="'+(i%2?"alt":"")+'"><td><span class="chip"><i class="dot" style="'+dot+'"></i>'+esc(lab)+'</span></td>'
      + months.map(s=>{ const v=cell(s,lab,f); return '<td>'+(v===null||v===undefined?"\u2014":fmt(v))+'</td>'; }).join("")
      + d + '</tr>';
  };
  const head = '<thead><tr><th>'+(key==="buckets"?"Bucket":"Stage")+'</th>'
    + months.map(s=>'<th>'+esc(monthLabel(s.month))+'</th>').join("")
    + '<th>Change</th></tr></thead>';
  const count = labels.map((l,i)=>rowFor(l,"n",v=>String(Math.round(v)),i)).join("");
  const value = labels.map((l,i)=>rowFor(l,"ns",money,i)).join("");

  const cId = expId(title+" \u2014 project count","table");
  const vId = expId(title+" \u2014 annualized net sales","table");
  return '<section><div class="shead"><h2>'+esc(title)+'</h2><span class="sub">'+esc(sub)+'</span></div>'
    + expBar("Project count", cId)
    + expTable(cId, '<table style="min-width:640px">'+head+'<tbody>'+count+'</tbody></table>')
    + '<div style="height:16px"></div>'
    + expBar("Annualized net sales", vId)
    + expTable(vId, '<table style="min-width:640px">'+head+'<tbody>'+value+'</tbody></table>')
    + '</section>';
}


function trendSection(hist){
  if (!hist.length) return '<div class="empty"><b>The trend starts building this month</b>'
    + 'Each month the dashboard keeps one snapshot of the full portfolio. Next month adds the second point and the comparison appears here.</div>';
  const cur = hist[hist.length-1], prv = hist.length>1 ? hist[hist.length-2] : null;
  const card = (label,key,fmt,color) => {
    const v=cur.m[key], p=prv?prv.m[key]:null;
    let d='<span class="muted" style="font-size:11px">first month</span>';
    if (p!==null&&p!==undefined&&isFinite(p)&&isFinite(v)){
      const diff=v-p, cls=Math.abs(diff)<1e-9?"flat":diff>0?"up":"down";
      d='<span class="delta '+cls+'" style="font-size:11.5px;margin:0">'+(diff>0?"+":"")+fmt(diff)+'</span>';
    }
    const id = expId(label+" by month","chart",
      {headers:["Month",label], rows:hist.map(sn=>[sn.month, sn.m[key]])});
    return '<div class="tcard" data-exp-id="'+id+'">'
      + '<div class="tcardhead"><div class="k">'+esc(label)+'</div>'+expBtn(id,label)+'</div>'
      + '<div class="v" style="color:'+color+'">'+fmt(v)+'</div>'
      + '<div style="margin-top:3px">'+d+'</div>' + trendChart(hist,key,color,fmt) + '</div>';
  };
  let h = '<div class="trendgrid">'
    + card("NPD annualized NS","npdNs",money,"var(--kpi)")
    + card("CI annualized CM","ciCm",money,"var(--kpi)")
    + card("Projects in the portfolio","projects",v=>String(Math.round(v)),"var(--kpi)")
    + card("Avg forecast execution","avgFc",v=>mo(v)+" mo","var(--kpi)")
    + '</div>';

  let body="";
  hist.slice().reverse().forEach((s,i)=>{
    const older = hist[hist.length-1-i-1];
    const d = older ? s.m.npdNs-older.m.npdNs : null;
    /* A portfolio rarely changes size by a quarter in a month. When it does,
       the file's scope almost certainly changed, and the delta above is not
       a real movement \u2014 so say so rather than let it read as growth. */
    const jump = older && older.m.projects
      ? Math.abs(s.m.projects-older.m.projects)/older.m.projects > 0.25 : false;
    body += '<tr class="'+(i%2?"alt":"")+'"><td>'+esc(monthLabel(s.month))+(i===0?' <span class="muted">\u00b7 current</span>':'')+'</td>'
      + '<td>'+Math.round(s.m.projects)+'</td><td>'+Math.round(s.m.npdN)+'</td>'
      + '<td title="'+moneyFull(s.m.npdNs)+'">'+money(s.m.npdNs)+'</td>'
      + '<td class="'+(d===null?"":d>=0?"under":"over")+'">'+(d===null?"\u2014":(d>0?"+":"")+money(d))+'</td>'
      + '<td>'+Math.round(s.m.ciN)+'</td><td title="'+moneyFull(s.m.ciCm)+'">'+money(s.m.ciCm)+'</td>'
      + '<td>'+mo(s.m.avgFc)+'</td><td>'+Math.round(s.m.review)+'</td>'
      + '<td class="muted" style="font-size:11px">'
      + (jump?' <span class="over" title="The number of projects moved more than 25% from the prior month. Check the scope is the same before reading the change as growth.">scope change?</span>':'')
      + '</td></tr>';
  });
  const manage = '<details class="manage"><summary>Manage snapshots ('+hist.length+')</summary>'
    + hist.slice().reverse().map(sn =>
        '<div class="mgrow"><span class="mgm">'+esc(monthLabel(sn.month))+'</span>'
        + '<span class="mgf">'+Math.round(sn.m.projects)+' projects</span>'
        + '<input type="month" value="'+esc(sn.month)+'" data-move="'+esc(sn.month)+'" aria-label="Move '+esc(monthLabel(sn.month))+' to another month">'
        + '<button class="btn sm" data-moveto="'+esc(sn.month)+'">Move</button>'
        + '<button class="btn sm danger" data-del="'+esc(sn.month)+'">Delete</button></div>').join("")
    + '</details>';
  const histId = expId("Monthly snapshot history","table");
  h += expBar("Monthly snapshot history", histId)
    + expTable(histId, '<table><thead><tr><th>Month</th><th>Projects</th><th>NPD count</th><th>NPD annualized NS</th>'
    + '<th>Change vs prior</th><th>CI count</th><th>CI annualized CM</th><th>Avg forecast (mo)</th><th>Over review line</th><th>Note</th></tr></thead>'
    + '<tbody>'+body+'</tbody></table>') + manage;
  return h;
}

function renderFoot(){
  const f=$("foot"); f.hidden=false;
  const m=S.meta;
  f.innerHTML = '<span>Last refresh: '+(m?new Date(m.uploadedAt).toLocaleString("en-US"):"\u2014")+'</span>'
    + '<span>'+S.snaps.length+' monthly snapshot'+(S.snaps.length===1?"":"s")+' stored</span>'
    + '<span>NPD = Refresh &amp; Sustain + Grow the Core + Create &amp; Transform. CI and CRQ reported separately.</span>';
}

/* ---------- filters ---------- */
/* Default view: In Progress projects in the Active Phase. Every row in the file counts;
   there is no Include/Exclude filter. A file with no Phase column opens on status alone. */
const DEFAULT_STATUS = ["In Progress"];
const DEFAULT_PHASE = /\bactive\b/i;
/* Bumped whenever the default view changes, so stored monthly totals taken under an
   older default are recalculated instead of compared like for like. */
const DEFAULT_VIEW = "v3:in-progress+active-phase";
function defaultFilters(){
  const vals = k => (S && S.rows && S.rows.length) ? Array.from(new Set(S.rows.map(r=>r[k]).filter(Boolean))) : [];
  const st = vals("status").filter(v => DEFAULT_STATUS.some(d => d.toLowerCase()===String(v).toLowerCase()));
  return {status: st.length ? st : DEFAULT_STATUS.slice(), phase: vals("phase").filter(v => DEFAULT_PHASE.test(v)),
          bu:[],biz:[],brand:[],mkt:[],stage:[],fy:[]};
}
function isDefault(key){ const a=(S.filters[key]||[]).slice().sort().join("|"), b=defaultFilters()[key].slice().sort().join("|"); return a===b; }
function isDefaultStatus(){ return isDefault("status"); }
function statusText(){ const s=S.filters.status||[]; return s.length ? s.map(optText).join(" + ") : "all statuses"; }
function phaseText(){ const s=S.filters.phase||[]; return s.length ? s.map(optText).join(" + ") : "all phases"; }
const FILTER_DEFS = [
  {key:"bu",    label:"Business unit"},
  {key:"biz",   label:"Business"},
  {key:"brand", label:"Brand"},
  {key:"mkt",   label:"Market"},
  {key:"stage", label:"Stage"},
  {key:"fy",    label:"Finish year"},
  {key:"phase", label:"Phase"},
  {key:"status", label:"Project Status"}
];
const FLABEL = {}; FILTER_DEFS.forEach(d=>FLABEL[d.key]=d.label);

/* Every distinct value a field takes across the tracked rows. The option
   list never changes with filtering \u2014 only the counts beside it do \u2014 so a
   reader can always see what else is out there. */
const BLANK = "(not set)";
const optText = v => v === "" ? BLANK : v;
function optionsFor(key){
  const rows = tracked(S.rows);
  const vals = Array.from(new Set(rows.map(r=>r[key]||"").filter(v=>v)))
    .sort((a,b)=>a.localeCompare(b,"en",{numeric:true}));
  /* rows with nothing in this field are selectable too, so the counts
     reconcile with the total and data gaps can be isolated */
  if (rows.some(r => !r[key])) vals.push("");
  return vals;
}
/* How many projects each option would bring in, given the OTHER filters.
   Counting with this field excluded is what makes the numbers add up when
   several values are ticked. */
function countsFor(key){
  const rows = inView(S.rows, S.filters, key), out = {};
  rows.forEach(r => { const v = r[key]||""; out[v] = (out[v]||0)+1; });
  return out;
}
function msLabelText(key, opts){
  const sel = S.filters[key] || [];
  if (!sel.length) return "All";
  if (sel.length === 1) return optText(sel[0]);
  if (sel.length === opts.length) return sel.length <= 2 ? sel.map(optText).join(", ") : "All (" + sel.length + ")";
  return sel.length + " selected";
}
function buildFilterOptions(){
  const host = $("filterFields");
  /* The Active Phase default can only be picked once the file's phases are known. */
  const dp = defaultFilters().phase;
  if (!S.phaseInit && dp.length){ S.phaseInit = true; if (!(S.filters.phase||[]).length) S.filters.phase = dp; }
  host.innerHTML = FILTER_DEFS.map(d => {
    const opts = optionsFor(d.key);
    /* drop selections that no longer exist in the new data */
    S.filters[d.key] = (S.filters[d.key]||[]).filter(v => opts.indexOf(v) > -1);
    const search = opts.length > 8
      ? '<input class="mssearch" type="search" placeholder="Search '+esc(d.label.toLowerCase())+'" aria-label="Search '+esc(d.label)+'">' : "";
    return '<div class="fld ms" data-key="'+d.key+'">'
      + '<label id="lab_'+d.key+'">'+esc(d.label)+'</label>'
      + '<button class="msbtn" type="button" aria-haspopup="true" aria-expanded="false" aria-labelledby="lab_'+d.key+'">'
        + '<span class="mslab"></span><span class="mscaret">\u25BE</span></button>'
      + '<div class="mspanel" hidden>' + search
        + '<div class="msacts"><button type="button" data-act="all">Select all</button>'
          + '<button type="button" data-act="none">Clear</button></div>'
        + '<div class="msopts">' + opts.map(v =>
            '<label class="msopt"><input type="checkbox" value="'+esc(v)+'">'
            + '<span class="msname'+(v===""?" muted":"")+'">'+esc(optText(v))+'</span>'
            + '<span class="mscount"></span></label>').join("")
        + (opts.length?"":'<div class="msnone">No values in this file.</div>') + '</div>'
      + '</div></div>';
  }).join("");
  wireFilters();
  syncFilterUI();
}
/* Counts and labels refresh in place so an open dropdown keeps its
   position, scroll and search text while the reader ticks boxes. */
function syncFilterUI(){
  FILTER_DEFS.forEach(d => {
    const el = document.querySelector('.ms[data-key="'+d.key+'"]');
    if (!el) return;
    const sel = S.filters[d.key] || [], counts = countsFor(d.key), opts = [];
    el.querySelectorAll(".msopt").forEach(o => {
      const cb = o.querySelector("input"), v = cb.value;
      opts.push(v);
      cb.checked = sel.indexOf(v) > -1;
      const n = counts[v] || 0;
      o.querySelector(".mscount").textContent = n;
      o.classList.toggle("zero", n === 0);
    });
    el.querySelector(".mslab").textContent = msLabelText(d.key, opts);
    el.querySelector(".msbtn").classList.toggle("active", sel.length > 0);
  });
  renderChips();
}
function renderChips(){
  const box = $("filterChips");
  const on = FILTER_DEFS.filter(d => (S.filters[d.key]||[]).length)
    .filter(d => !((d.key==="status" || d.key==="phase") && isDefault(d.key)));
  if (!on.length){ box.innerHTML = ""; return; }
  box.innerHTML = on.map(d => {
    const v = S.filters[d.key];
    const txt = v.length > 3 ? v.length + " selected" : v.map(optText).join(", ");
    return '<span class="chip-f"><span><b>'+esc(d.label)+':</b> '+esc(txt)+'</span>'
      + '<button type="button" data-clear="'+d.key+'" aria-label="Clear '+esc(d.label)+' filter">\u00D7</button></span>';
  }).join("") + '<button class="chipclear" id="chipClearAll">Clear all filters</button>';

  box.querySelectorAll("[data-clear]").forEach(b => b.onclick = () => {
    S.filters[b.getAttribute("data-clear")] = [];
    syncFilterUI(); render(); prepareTrend();
  });
  const ca = $("chipClearAll");
  if (ca) ca.onclick = () => { S.filters = defaultFilters(); syncFilterUI(); render(); prepareTrend(); };
}
function closeAllPanels(except){
  document.querySelectorAll(".ms").forEach(el => {
    if (el === except) return;
    el.querySelector(".mspanel").hidden = true;
    el.querySelector(".msbtn").setAttribute("aria-expanded","false");
  });
}
function wireFilters(){
  document.querySelectorAll(".ms").forEach(el => {
    const key = el.getAttribute("data-key");
    const btn = el.querySelector(".msbtn"), panel = el.querySelector(".mspanel");
    const search = el.querySelector(".mssearch");

    btn.onclick = e => {
      e.stopPropagation();
      const open = panel.hidden;
      closeAllPanels(el);
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      if (open && search){ search.value=""; filterOpts(el,""); search.focus(); }
    };
    panel.onclick = e => e.stopPropagation();
    if (search) search.oninput = () => filterOpts(el, search.value);

    el.querySelectorAll(".msacts button").forEach(b => b.onclick = () => {
      const visible = Array.from(el.querySelectorAll(".msopt"))
        .filter(o => o.style.display !== "none").map(o => o.querySelector("input").value);
      if (b.getAttribute("data-act") === "all"){
        const set = new Set(S.filters[key] || []); visible.forEach(v => set.add(v));
        S.filters[key] = Array.from(set);
      } else {
        S.filters[key] = (S.filters[key]||[]).filter(v => visible.indexOf(v) === -1);
      }
      syncFilterUI(); render(); prepareTrend();
    });

    el.querySelectorAll(".msopt input").forEach(cb => cb.onchange = () => {
      const set = new Set(S.filters[key] || []);
      cb.checked ? set.add(cb.value) : set.delete(cb.value);
      S.filters[key] = Array.from(set);
      syncFilterUI(); render(); prepareTrend();
    });
  });
}
function filterOpts(el, q){
  const t = q.trim().toLowerCase();
  el.querySelectorAll(".msopt").forEach(o => {
    o.style.display = !t || o.querySelector(".msname").textContent.toLowerCase().indexOf(t) > -1 ? "" : "none";
  });
}
document.addEventListener("click", () => closeAllPanels(null));
document.addEventListener("keydown", e => { if (e.key === "Escape") closeAllPanels(null); });

function readFilters(){
  const t = parseInt($("f_thr").value,10); S.threshold = isFinite(t)&&t>0 ? t : 30;
}

/* ---------- persistence: db, with a localStorage fallback ---------- */
const CHUNK = 110;
const LS_DATA="fbin_scorecard_data_v2", LS_SNAP="fbin_scorecard_snaps_v2";

function lsSet(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }
/* localStorage is small, so the mirror stores snapshot metrics only and
   leaves the per-month project rows to the shared store. */
function saveSnapsLocal(){
  /* rows are kept for the latest 24 months so the trend can be re-filtered;
     older months keep their totals only */
  const keepRows = S.snaps.slice(-24).map(s=>s.month);
  const pack = s => ({month:s.month, capturedAt:s.capturedAt, fileName:s.fileName, m:s.m, dv:s.dv,
                      rowCount:s.rowCount||0, chunkCount: (s.rows && keepRows.indexOf(s.month)>-1) ? 1 : 0,
                      rows: keepRows.indexOf(s.month)>-1 ? (s.rows||null) : null});
  try{ localStorage.setItem(LS_SNAP, JSON.stringify(S.snaps.map(pack))); }
  catch(e){ lsSet(LS_SNAP, S.snaps.map(s => Object.assign(pack(s),{rows:null,chunkCount:0}))); }
}
function lsGet(k){ try{ const s=localStorage.getItem(k); return s?JSON.parse(s):null; }catch(e){ return null; } }

async function saveDataset(){
  lsSet(LS_DATA,{meta:S.meta,present:S.present,rows:S.rows});
  if (!S.db) return {stored:"this browser"};
  const chunks=[]; for(let i=0;i<S.rows.length;i+=CHUNK) chunks.push(S.rows.slice(i,i+CHUNK));
  const prev = S.meta.chunkCount||0;
  await S.db.doc("dataset/current").set({
    fileName:S.meta.fileName, sheetName:S.meta.sheetName, rowCount:S.rows.length,
    uploadedAt:S.meta.uploadedAt, uploadedBy:S.meta.uploadedBy||null,
    present:S.present, chunkCount:chunks.length
  });
  for (let i=0;i<chunks.length;i++) await S.db.doc("dataset/current/parts/p"+i).set({rows:chunks[i]});
  for (let i=chunks.length;i<prev;i++){ try{ await S.db.doc("dataset/current/parts/p"+i).delete(); }catch(e){} }
  S.meta.chunkCount = chunks.length;
  return {stored:"shared with the team"};
}
/* Returns where the data came from, so the page can say so out loud
   rather than quietly showing a stale local copy. */
async function loadDataset(){
  if (S.db){
    try{
      const snap = await S.db.doc("dataset/current").get();
      if (snap.exists){
        const d = snap.data(); let rows=[], missing=0;
        for (let i=0;i<(d.chunkCount||0);i++){
          const p = await S.db.doc("dataset/current/parts/p"+i).get();
          if (p.exists) rows = rows.concat(p.data().rows||[]); else missing++;
        }
        if (rows.length){
          S.rows=rows; S.present=d.present||{};
          S.meta={fileName:d.fileName,sheetName:d.sheetName,rowCount:d.rowCount,
                  uploadedAt:d.uploadedAt,uploadedBy:d.uploadedBy,chunkCount:d.chunkCount};
          /* keep the local mirror in step so the next load does not flash stale data */
          lsSet(LS_DATA,{meta:S.meta,present:S.present,rows:S.rows});
          S.origin = missing ? "shared-partial" : "shared";
          return S.origin;
        }
        S.origin = "shared-empty";
      } else { S.origin = "shared-empty"; }
    }catch(e){
      console.warn("db read failed",e);
      S.origin = "error"; S.originErr = (e && e.message) ? e.message : String(e);
    }
  } else if (S.origin !== "error") { S.origin = "no-db"; }

  const ls = lsGet(LS_DATA);
  if (ls && ls.rows && ls.rows.length){
    S.rows=ls.rows; S.meta=ls.meta; S.present=ls.present||{};
    return S.origin === "shared-empty" ? "local-only" : (S.origin || "local-only");
  }
  return null;
}
async function loadSnapshots(){
  if (S.db){
    try{
      const q = await S.db.collection("snapshots").limit(240).get();
      S.snaps = q.docs.map(d=>{ const v=d.data(); return {month:d.id, capturedAt:v.capturedAt, fileName:v.fileName,
                                 m:v.m||{}, dv:v.dv, rowCount:v.rowCount||0, chunkCount:v.chunkCount||0}; })
                      .sort((a,b)=>a.month<b.month?-1:1);
      if (S.snaps.length) return;
    }catch(e){ console.warn("db snapshots failed",e); }
  }
  S.snaps = lsGet(LS_SNAP) || [];
}
async function captureSnapshot(manual, monthArg){
  if (!S.rows.length) return;
  const month = /^\d{4}-\d{2}$/.test(monthArg||"") ? monthArg : monthKey();
  const rows = S.rows.slice();
  const chunks = []; for(let i=0;i<rows.length;i+=CHUNK) chunks.push(rows.slice(i,i+CHUNK));
  const rec = { month, capturedAt:new Date().toISOString(), fileName:S.meta?S.meta.fileName:null,
                m:snapshotMetrics(rows), dv:DEFAULT_VIEW, rowCount:rows.length, chunkCount:chunks.length, rows:rows };
  const prevRec = S.snaps.find(s=>s.month===month);
  const prevChunks = prevRec ? (prevRec.chunkCount||0) : 0;
  const i = S.snaps.findIndex(s=>s.month===month);
  if (i>-1) S.snaps[i]=rec; else S.snaps.push(rec);
  S.snaps.sort((a,b)=>a.month<b.month?-1:1);
  saveSnapsLocal();
  if (S.db){
    try{
      await S.db.doc("snapshots/"+month).set({capturedAt:rec.capturedAt, fileName:rec.fileName, m:rec.m, dv:rec.dv,
                                              rowCount:rec.rowCount, chunkCount:chunks.length});
      /* the month's own copy of the projects, so any filter can be applied to it later */
      for (let k=0;k<chunks.length;k++) await S.db.doc("snapshots/"+month+"/parts/p"+k).set({rows:chunks[k]});
      for (let k=chunks.length;k<prevChunks;k++){ try{ await S.db.doc("snapshots/"+month+"/parts/p"+k).delete(); }catch(e){} }
    }catch(e){ console.warn("snapshot write failed",e); }
  }
  if (manual){ render(); flash($("snapBtn"), "Saved for "+monthLabel(month)); }
}
function flash(btn,msg){
  if (!btn) return;
  const old = btn.textContent;
  btn.textContent = msg; btn.disabled = true;
  setTimeout(()=>{ btn.textContent = old; btn.disabled = false; }, 2200);
}

async function loadSnapRows(sn){
  if (sn.rows) return sn.rows;
  if (!S.db || !sn.chunkCount) return null;
  try{
    let rows=[];
    for (let i=0;i<sn.chunkCount;i++){
      const p = await S.db.doc("snapshots/"+sn.month+"/parts/p"+i).get();
      if (p.exists) rows = rows.concat(p.data().rows||[]);
    }
    sn.rows = rows.length ? rows : null;
    return sn.rows;
  }catch(e){ console.warn("snapshot rows failed",e); return null; }
}
/* A month's stored totals stand only for the current default view; anything else is recalculated. */
const storedOk = sn => !filtersActive() && sn.dv === DEFAULT_VIEW;
/* Only needed when a month cannot use its stored totals. */
async function prepareTrend(){
  if (S.tab !== "trend" || S.snaps.every(storedOk)) return;
  const need = S.snaps.filter(sn => sn.chunkCount && !sn.rows);
  if (!need.length) return;
  S.trendLoading = true; render();
  for (const sn of need) await loadSnapRows(sn);
  S.trendLoading = false; render();
}
/* The figures a month contributes to the trend under the current filters. */
function metricsFor(sn){
  if (storedOk(sn)) return sn.m;
  if (sn.rows) return snapshotMetrics(sn.rows, S.filters);
  return null;                       // this month predates per-month row storage
}
/* Whether a month can be compared at all under the current filters.
   A file that never covered 2028 must not contribute a $0 point for 2028 \u2014
   that reads as growth from nothing instead of absence of data. So a month
   counts only if every value being filtered on actually appears in it. */
function coverage(sn){
  if (!sn.chunkCount) return {ok:false, why:"totals only"};
  if (!sn.rows) return {ok:false, why:"loading"};
  const gaps = [];
  FKEYS.forEach(k => {
    const sel = S.filters[k] || [];
    if (!sel.length) return;
    const absent = sel.filter(v => !sn.rows.some(r => (r[k]||"") === v));
    if (absent.length) gaps.push(FLABEL[k] + " " + absent.map(optText).join(", "));
  });
  return gaps.length ? {ok:false, why:"no " + gaps.join("; ") + " projects"} : {ok:true};
}

async function deleteSnapshot(month){
  S.snaps = S.snaps.filter(x => x.month !== month);
  saveSnapsLocal();
  if (S.db){
    try{
      const gone = await S.db.doc("snapshots/"+month).get();
      const n = gone.exists ? (gone.data().chunkCount||0) : 0;
      for (let i=0;i<n;i++){ try{ await S.db.doc("snapshots/"+month+"/parts/p"+i).delete(); }catch(e){} }
      await S.db.doc("snapshots/"+month).delete();
    }catch(e){ console.warn(e); }
  }
  render();
}
async function moveSnapshot(from, to){
  if (!/^\d{4}-\d{2}$/.test(to||"") || to === from) return;
  const rec = S.snaps.find(x => x.month === from);
  if (!rec) return;
  S.snaps = S.snaps.filter(x => x.month !== from && x.month !== to);
  rec.month = to;
  S.snaps.push(rec);
  S.snaps.sort((a,b)=>a.month<b.month?-1:1);
  saveSnapsLocal();
  if (S.db){
    try{
      await S.db.doc("snapshots/"+to).set({capturedAt:rec.capturedAt, fileName:rec.fileName, m:rec.m, dv:rec.dv||null});
      await S.db.doc("snapshots/"+from).delete();
    }catch(e){ console.warn(e); }
  }
  render();
}

/* ---------- ingest ---------- */
async function ingest(file){
  const st=$("dlgStatus");
  st.className="status show info"; st.textContent="Reading "+file.name+"\u2026";
  try{
    const buf = await file.arrayBuffer();
    const parsed = parseWorkbook(buf,file.name);
    S.rows=parsed.rows; S.present=parsed.present; S.meta=parsed.meta;
    if (S.user){ try{ S.meta.uploadedBy = await S.user.id(); }catch(e){} }

    buildFilterOptions();
    S.tab = "score";
    const where = await saveDataset();
    S.origin = "manual"; S.originErr = null; S.meta.live = false;
    const wantMonth = ($("snapMonth").value||"").trim();
    await captureSnapshot(false, wantMonth);
    render(); refreshSourcePill(); showOrigin();

    const inv = inView(S.rows,S.filters).length;
    st.className="status show ok";
    const usedMonth = /^\d{4}-\d{2}$/.test(wantMonth) ? wantMonth : monthKey();
    st.textContent = "Loaded "+parsed.meta.rowCount+" rows from the "+parsed.meta.sheetName+" tab \u2014 "+inv
      +" projects in view. Snapshot saved for "+monthLabel(usedMonth)+". Stored: "+where.stored+".";
  }catch(err){
    st.className="status show err";
    st.textContent = err && err.message ? err.message : "Could not read that file.";
    console.error(err);
  }
}
function refreshSourcePill(){
  if (!S.meta) return;
  const fmt = d => new Date(d).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
  $("subline").textContent = "Live portfolio figures \u00b7 Last refreshed " + fmt(S.meta.uploadedAt);
}

/* ---------- CSV export ---------- */
/* Button feedback so a silent save still reads as a success. */
function flashBtn(btn){
  if (!btn) return;
  const html = btn.innerHTML;
  btn.classList.add("done"); btn.innerHTML = DL_ICON + "Downloaded";
  setTimeout(()=>{ btn.classList.remove("done"); btn.innerHTML = html; }, 1800);
}

/* ---------- capability bootstrap ---------- */
async function claudeUse(name){
  try{ return window.claude && window.claude.use ? await window.claude.use(name) : null; }
  catch(e){ return null; }
}

/* ---------- wiring ---------- */
S.filters = defaultFilters();

function setTab(t){
  if (S.tab===t) return;
  S.tab = t;
  if (S.rows.length) render();
  window.scrollTo({top:0, behavior:"instant"});
  prepareTrend();
}
$("tab_score").onclick = ()=>setTab("score");
$("tab_trend").onclick = ()=>setTab("trend");

$("reloadBtn").onclick = () => reloadData();
$("dlAllBtn").onclick = () => { if (S.rows.length){ exportAllProjects(); flashBtn($("dlAllBtn")); } };
$("resetBtn").onclick = ()=>{ S.filters=defaultFilters(); $("f_thr").value=GPD_CONFIG.reviewMonths; S.threshold=GPD_CONFIG.reviewMonths; syncFilterUI(); render(); prepareTrend(); };
$("f_thr").oninput = ()=>{ readFilters(); render(); };


(function theme(){
  const b=$("themeBtn");
  let saved=null; try{ saved=localStorage.getItem("fbin_theme"); }catch(e){}
  if (saved) document.documentElement.setAttribute("data-theme",saved);
  const label=()=>{ const dark = document.documentElement.getAttribute("data-theme")==="dark"
      || (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme:dark)").matches);
    b.innerHTML = dark ? "<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"8\" cy=\"8\" r=\"2.8\"/><path d=\"M8 1.6v1.3M8 13.1v1.3M1.6 8h1.3M13.1 8h1.3M3.5 3.5l.9.9M11.6 11.6l.9.9M3.5 12.5l.9-.9M11.6 4.4l.9-.9\"/></svg><span>Light</span>" : "<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z\"/></svg><span>Dark</span>"; };
  label();
  b.onclick = ()=>{ const dark = document.documentElement.getAttribute("data-theme")==="dark"
      || (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme:dark)").matches);
    const next = dark?"light":"dark";
    document.documentElement.setAttribute("data-theme",next);
    try{ localStorage.setItem("fbin_theme",next); }catch(e){}
    label(); if (S.rows.length) render(); };
})();

/* Paint whatever this browser already has, so the page is never blank
   while the shared store is still resolving. */
function showOrigin(){
  const bar = $("warnbar"), o = S.origin;
  const when = S.meta && S.meta.uploadedAt ? new Date(S.meta.uploadedAt).toLocaleString("en-US") : "";
  if (!o || o === "shared"){ bar.hidden = true; return; }
  bar.hidden = false; bar.className = "warnbar";
  if (o === "pending"){
    bar.innerHTML = '<span>Loading the latest data\u2026</span>';
  } else if (o === "manual"){
    bar.innerHTML = '<span><b>Showing figures loaded by hand.</b></span>'
      + '<button class="btn sm" onclick="reloadData()">Load the latest figures</button>';
  } else {
    bar.className = "warnbar bad";
    bar.innerHTML = '<span><b>Couldn\u2019t load the latest data.</b> '
      + (S.rows.length ? 'Showing the figures from ' + esc(when) + '. ' : '') + esc(S.originErr||"") + '</span>'
      + '<button class="btn sm" onclick="reloadData()">Try again</button>';
  }
}
function spPath(p){ return encodeURIComponent(p.replace(/'/g,"''")); }
async function reloadData(){
  const name = SOURCE.file.split("/").pop();
  const base = SOURCE.site + "/_api/web/GetFileByServerRelativePath(decodedurl='" + spPath(SOURCE.file) + "')";
  const btn = $("reloadBtn");
  btn.disabled = true; btn.classList.add("busy"); btn.querySelector("span").textContent = "Refreshing\u2026";
  if (!S.rows.length){ S.origin = "pending"; showOrigin(); }
  try{
    const [info, bin] = await Promise.all([
      fetch(base + "?$select=TimeLastModified", {credentials:"include", cache:"no-store", headers:{Accept:"application/json;odata=nometadata"}}).catch(()=>null),
      fetch(base + "/$value", {credentials:"include", cache:"no-store"})
    ]);
    if (bin.status===401 || bin.status===403) throw new Error("You don\u2019t have access to the portfolio data. Ask the FBIN R&D PPM team for access.");
    if (!bin.ok) throw new Error("Please try again in a minute. If it keeps happening, contact the FBIN R&D PPM team.");
    let parsed;
    try{ parsed = parseWorkbook(await bin.arrayBuffer(), name); }
    catch(pe){ console.error(pe); throw new Error("The portfolio data couldn\u2019t be read. Contact the FBIN R&D PPM team."); }
    let modified = null;
    if (info && info.ok){ try{ modified = (await info.json()).TimeLastModified; }catch(e){} }
    S.rows = parsed.rows; S.present = parsed.present; S.meta = parsed.meta;
    S.meta.uploadedAt = new Date().toISOString(); S.meta.sourceModified = modified; S.meta.live = true;
    buildFilterOptions();
    lsSet(LS_DATA, {meta:S.meta, present:S.present, rows:S.rows});
    await captureSnapshot(false);                 /* this month's snapshot always reflects the latest workbook */
    S.origin = "shared"; S.originErr = null;
    render(); refreshSourcePill(); showOrigin(); prepareTrend();
  }catch(err){
    console.error(err);
    S.origin = "error"; S.originErr = err && err.message ? err.message : String(err);
    if (!S.rows.length){
      $("emptyTitle").textContent = "Couldn\u2019t load the portfolio";
      $("emptyMsg").textContent = S.originErr;
    }
    showOrigin();
  }finally{
    btn.disabled = false; btn.classList.remove("busy"); btn.querySelector("span").textContent = "Refresh now";
  }
}
window.reloadData = reloadData;

/* Paint the last copy this browser saw while the live read is in flight. */
(function boot(){
  S.snaps = lsGet(LS_SNAP) || [];
  const ls = lsGet(LS_DATA);
  if (ls && ls.rows && ls.rows.length && ls.meta){
    S.rows = ls.rows; S.meta = ls.meta; S.present = ls.present || {};
    S.origin = "pending";
    buildFilterOptions(); render(); refreshSourcePill(); showOrigin();
  }
  reloadData();
  setInterval(reloadData, Math.max(5, SOURCE.reloadMinutes) * 60000);
})();
