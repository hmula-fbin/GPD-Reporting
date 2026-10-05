/* ============================================================
   Ask questions about your data. Each page provides:
     window.gpdData()     -> { rows:[...projects], scope:"text", threshold:review months }
     window.gpdSuggest    -> [ {q:"question", icon:"sum|list|clock|bars"} ]
   Answers are calculated here, in the browser, from those rows.
   ============================================================ */
(function(){
  var M365 = "https://m365.cloud.microsoft/chat";
  /* ICON: to show your organization's approved Copilot icon, put its address here
     (for example an image in the site's Site Assets library). Leave "" for the built-in mark. */
  var ICON_URL = "{{asset:copilot-icon.png}}";
  var ICON = {sum:"<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 3.5h10M3 6.5h10M3 9.5h6M3 12.5h4\"/></svg>",list:"<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6 4h7.5M6 8h7.5M6 12h7.5\"/><circle cx=\"3\" cy=\"4\" r=\".9\"/><circle cx=\"3\" cy=\"8\" r=\".9\"/><circle cx=\"3\" cy=\"12\" r=\".9\"/></svg>",clock:"<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"8\" cy=\"8\" r=\"5.8\"/><path d=\"M8 4.8V8l2.2 1.4\"/></svg>",bars:"<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 13V8.5M6.3 13V4M9.6 13V6.5M12.9 13V2.8\"/></svg>"};
  var $ = function(id){ return document.getElementById(id); };
  var NPD = ["Grow the Core","Refresh & Sustain","Create & Transform"];
  var STAGES = ["Discovery","Ideate","Converge","Develop","Validate","Launch"];
  var REVIEW = 30;
  var log = [];

  /* ---------- formatting ---------- */
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
  function money(v){ if(v==null||!isFinite(v)) return "\u2014"; var a=Math.abs(v);
    var s = a>=1e9 ? "$"+(v/1e9).toFixed(2)+"B" : a>=1e6 ? "$"+(v/1e6).toFixed(1)+"M" : a>=1e3 ? "$"+(v/1e3).toFixed(0)+"K" : "$"+Math.round(v);
    return s.replace("$-","-$"); }
  function mo(v){ return v==null||!isFinite(v) ? "\u2014" : v.toFixed(1)+" mo"; }
  function pct(a,b){ return b ? Math.round(a/b*100)+"%" : "\u2014"; }
  function ymd(d){ if(!d) return null; var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(d)); var x = m ? new Date(+m[1],+m[2]-1,+m[3]) : new Date(d); return isNaN(x)?null:x; }
  function dstr(d){ if(!d) return "\u2014"; var x=ymd(d)||new Date(NaN); return isNaN(x)?"\u2014":x.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }
  function plural(n,w){ return n+" "+w+(n===1?"":"s"); }
  function sum(rs,k){ return rs.reduce(function(t,r){ return t+(r[k]||0); },0); }
  function avg(rs,k){ var v=rs.filter(function(r){ return r[k]!=null && isFinite(r[k]); }); return v.length ? sum(v,k)/v.length : null; }
  function stageOf(r){ var s=String(r.stage||"").toLowerCase(); for(var i=0;i<STAGES.length;i++) if(s.indexOf(STAGES[i].toLowerCase())>-1) return STAGES[i]; return r.stage ? String(r.stage).replace(/^[\d\s]+/,"") : ""; }
  function cap(l){ return /^total/.test(l) ? l.charAt(0).toUpperCase()+l.slice(1) : "Total "+l; }
  function strip(v){ return String(v||"").replace(/^[\d\s]+/,"").trim(); }

  /* ---------- data ---------- */
  function data(){ var d=null; try{ d = window.gpdData ? window.gpdData() : null; }catch(e){}
    if(!d || !d.rows) return null;
    d.rows.forEach(function(r){ if(r._st===undefined){ r._st=stageOf(r); r._npd = NPD.indexOf(r.bucket)>-1; } });
    return d; }

  /* ---------- understanding the question ---------- */
  var METRICS = [
    {k:"ins", label:"annualized incremental net sales", money:true, re:/incremental (ns|net sales|sales|revenue)|incr(emental)? ns/},
    {k:"icm", label:"annualized incremental CM", money:true, re:/incremental (cm|margin|contribution)|incr(emental)? cm/},
    {k:"inv", label:"total investment", money:true, re:/invest|capex|opex|spend|budget|\bcost\b/},
    {k:"cm",  label:"annualized CM", money:true, re:/\bcm\b|margin|contribution|saving/},
    {k:"ns",  label:"annualized net sales", money:true, re:/\bns\b|net sales|\bsales\b|revenue|\bvalue\b|\bworth\b/},
    {k:"tgt", label:"target execution time", money:false, re:/target (time|months|execution|duration)/},
    {k:"fc",  label:"forecast execution time", money:false, re:/time to market|execution|duration|\bmonths\b|how long|longest|slowest|fastest|shortest|forecast/}
  ];
  var DIMS = [
    {k:"bucket", label:"bucket",        plural:"buckets",        re:/\bbuckets?\b|\bcategor(y|ies)\b/},
    {k:"_st",    label:"stage",         plural:"stages",         re:/\bstages?\b|\bfunnel\b|\bphases?\b/},
    {k:"bu",     label:"business unit", plural:"business units", re:/business units?|\bbus?\b/},
    {k:"biz",    label:"business",      plural:"businesses",     re:/\bbusiness(es)?\b/},
    {k:"brand",  label:"brand",         plural:"brands",         re:/\bbrands?\b/},
    {k:"mkt",    label:"market",        plural:"markets",        re:/\bmarkets?\b|\bregions?\b/},
    {k:"owner",  label:"owner",         plural:"owners",         re:/\bowners?\b|\bwho\b|\bpeople\b|\bperson\b|\bmanagers?\b|\bleads?\b/},
    {k:"status", label:"status",        plural:"statuses",       re:/\bstatus(es)?\b/},
    {k:"fy",     label:"finish year",   plural:"finish years",   re:/finish years?|\byears?\b/}
  ];
  var MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  var STOP = {"check":1,"the":1,"and":1,"for":1,"all":1,"none":1,"other":1,"total":1,"top":1,"new":1,"core":1,"line":1};
  function reEsc(w){ return w.replace(/[.*+?^${}()|[\]\\&]/g,"\\$&").replace(/\s+/g,"\\s+"); }
  function wordAt(q,w){ w=String(w).toLowerCase().trim(); if(w.length<3 || STOP[w]) return -1;
    var m = new RegExp("(^|[^a-z0-9])"+reEsc(w)+"($|[^a-z0-9])").exec(q); return m ? m.index : -1; }
  function dimOf(q){ for(var j=0;j<DIMS.length;j++) if(DIMS[j].re.test(q)) return DIMS[j]; return null; }
  function moneyOf(n,unit){ unit=(unit||"").toLowerCase(); var x=parseFloat(n);
    if(/^(k|thousand)$/.test(unit)) x*=1e3; else if(/^(m|mm|mn|million)$/.test(unit)) x*=1e6; else if(/^(b|bn|billion)$/.test(unit)) x*=1e9; return x; }

  function parse(qRaw, rows){
    var q = " "+String(qRaw).toLowerCase().replace(/[\u2019']/g,"'").replace(/&/g," and ").replace(/[?!.,;:]+/g," ").replace(/\s+/g," ")+" ";
    var f = [], used = {};
    function add(k,v,label,pos){ if(pos<0) return; if(!f.some(function(x){ return x.k===k && x.v===v; })) f.push({k:k,v:v,label:label,pos:pos}); }
    function at(re){ var m=re.exec(q); return m ? m.index : -1; }
    /* buckets */
    add("_npd",true,"NPD", at(/\bnpd\b|new product/));
    add("bucket","CI","CI", at(/\bci\b|continuous improvement/));
    add("bucket","CRQ","CRQ", at(/\bcrq\b|compliance|regulatory/));
    add("bucket","Grow the Core","Grow the Core", at(/grow the core/));
    add("bucket","Refresh & Sustain","Refresh & Sustain", at(/refresh (and )?sustain/));
    add("bucket","Create & Transform","Create & Transform", at(/create (and )?transform/));
    /* stages */
    STAGES.forEach(function(s){ add("_st",s,s, wordAt(q,s)); });
    /* values that exist in the data */
    ["bu","biz","brand","mkt","status"].forEach(function(k){
      var seen={}; rows.forEach(function(r){ if(r[k]) seen[r[k]]=1; });
      Object.keys(seen).sort(function(a,b){ return strip(b).length-strip(a).length; }).forEach(function(v){
        var w=(strip(v)||v).toLowerCase(); if(used[w]) return;
        var p=wordAt(q,w); if(p>-1){ add(k,v,strip(v)||v,p); used[w]=1; } }); });
    /* owners: "Zhang", "Will Zhang", "Zhang, Will" */
    var owners={}; rows.forEach(function(r){ if(r.owner) owners[r.owner]=1; });
    Object.keys(owners).forEach(function(o){ var parts=o.split(",").map(function(s){ return s.trim(); }), last=parts[0], first=(parts[1]||"").split(" ")[0];
      var p = Math.max(wordAt(q,o), first ? wordAt(q,first+" "+last) : -1, used[(last||"").toLowerCase()] ? -1 : wordAt(q,last));
      add("owner",o,o,p); });
    /* time */
    var yr = /\b(20\d\d)\b/.exec(q); if (yr && rows.some(function(r){ return String(r.fy)===yr[1]; })) add("fy",yr[1],"finishing "+yr[1],yr.index);
    var qq = /\bq([1-4])\b/.exec(q); if (qq) add("_q",+qq[1],"Q"+qq[1],qq.index);
    var mm = /\b(finish\w*|due|end\w*|complet\w*|deliver\w*|launch\w*|wrap\w*|clos\w*)\s+(in|by|during)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/.exec(q);
    if (mm){ var mi=MONTHS.indexOf(mm[3].slice(0,3)); add("_m",mi,"finishing in "+mm[3].charAt(0).toUpperCase()+mm[3].slice(1,3),mm.index); }
    /* metric */
    var metric=null; for(var i=0;i<METRICS.length;i++) if(METRICS[i].re.test(q)){ metric=METRICS[i]; break; }
    /* numeric comparisons: "over 30 months", "net sales above $10M", "less than 5m in CM" */
    var cm = /\b(over|more than|greater than|above|at least|exceeding|higher than|longer than|under|less than|below|at most|lower than|shorter than|fewer than)\s+\$?\s*(\d+(?:\.\d+)?)\s*(k|thousand|m|mm|mn|million|b|bn|billion)?\b\s*(months?|mos?)?/.exec(q);
    if (cm){
      var gt = /over|more|greater|above|least|exceed|higher|longer/.test(cm[1]);
      var isMonths = !!cm[4] || (!cm[3] && !/\$/.test(cm[0]) && (!metric || !metric.money));
      var key = isMonths ? (metric && metric.k==="tgt" ? "tgt" : "fc") : (metric && metric.money ? metric.k : "ns");
      var val = isMonths ? parseFloat(cm[2]) : moneyOf(cm[2],cm[3]);
      var lab = (isMonths ? (key==="tgt"?"target ":"forecast ")+(gt?"over ":"under ")+cm[2]+" months" : (METRICS.filter(function(m){return m.k===key;})[0].label)+(gt?" over ":" under ")+money(val));
      f.push({k:"_cmp",key:key,gt:gt,v:val,label:lab,pos:cm.index});
      if (isMonths && (!metric || metric.money)) metric = METRICS.filter(function(m){ return m.k===key; })[0];
    }
    /* data gaps: "missing net sales", "without a target" */
    var gp = /\b(missing|without|no|blank|empty|zero)\s+(an?\s+)?(annualized\s+)?(ns|net sales|sales|cm|margin|investment|target|forecast|owner|stage|brand)\b/.exec(q);
    if (gp){ var gk = {ns:"ns","net sales":"ns",sales:"ns",cm:"cm",margin:"cm",investment:"inv",target:"tgt",forecast:"fc",owner:"owner",stage:"stage",brand:"brand"}[gp[4]];
      f.push({k:"_gap",key:gk,label:"missing "+gp[4],pos:gp.index}); }
    /* grouping */
    var by=null, bm=/\b(by|per|each|every|across|split|breakdown|broken down|mix|distribution|which|what|top|bottom|most|fewest|highest|lowest|largest|biggest|smallest|rank)\b(.*)/.exec(q);
    if (bm){ var tail=" "+bm[2]+" ";
      /* "which projects ... by stage" is still a grouping; "which projects are in Develop" is not */
      var cand=null, best=1e9;
      DIMS.forEach(function(d){ var m=d.re.exec(tail); if(m && m.index<best){ best=m.index; cand=d; } });
      if (cand){
        var groupy = /\b(by|per|each|every|across|split|breakdown|broken down|mix|distribution)\b/.test(bm[1]+" "+tail) ||
                     new RegExp("\\b(which|what|top|bottom|most|fewest|highest|lowest|largest|biggest|smallest|rank)\\b(\\s+\\d+)?\\s+(of the\\s+)?("+cand.re.source+")").test(q) ||
                     new RegExp("("+cand.re.source+")\\s+(has|have|had|with|own|owns|is|are)\\b").test(tail);
        /* a dimension value that is also a filter ("in Develop") is not a grouping on the same dimension */
        if (groupy && !(cand.k==="owner" && /\bwho\b/.test(q) && !/most|fewest|highest|lowest|largest|biggest/.test(q))) by=cand;
      }
    }
    if (!by && /\bfunnel\b|stage mix/.test(q)) by=DIMS[1];
    if (!by && /\bwho\b/.test(q) && /\b(most|fewest|highest|lowest|largest|biggest|leads?|leading)\b/.test(q)) by=DIMS[6];
    var nm = /\b(top|bottom|first|last|largest|biggest|smallest|highest|lowest|longest|shortest)\s+(\d{1,3})\b/.exec(q) || /\b(\d{1,3})\s+(largest|biggest|smallest|top|longest|projects|owners|brands|businesses)\b/.exec(q);
    var n = nm ? +(/\d/.test(nm[2]) ? nm[2] : nm[1]) : null;
    if (!n && /\b(the )?(largest|biggest|highest|smallest|lowest|longest|shortest|fastest|slowest) (project|one)\b/.test(q)) n=1;
    var asc = /\b(smallest|lowest|least|bottom|shortest|fastest|fewest|minimum|min)\b/.test(q);
    return {q:q, filters:f, metric:metric, by:by, n:n, asc:asc};
  }
  function applyF(rows,f){ return rows.filter(function(r){ return f.every(function(x){
    if(x.k==="_npd") return r._npd;
    if(x.k==="_q"){ var d=ymd(r.finish); return !!d && Math.floor(d.getMonth()/3)+1===x.v; }
    if(x.k==="_m"){ var d2=ymd(r.finish); return !!d2 && d2.getMonth()===x.v; }
    if(x.k==="_cmp"){ var v=r[x.key]; return v!=null && isFinite(v) && (x.gt ? v>x.v : v<x.v); }
    if(x.k==="_gap"){ var g=r[x.key]; return g==null || g==="" || g===0; }
    return String(r[x.k])===String(x.v); }); }); }
  function findProject(q, rows){
    var id = /\b([1-9]\d{3})\b/.exec(q);
    if (id && !/\b20\d\d\b/.test(id[1])){ var hit=rows.filter(function(r){ return String(r.name).indexOf(id[1])===0; }); if(hit.length) return hit[0]; }
    if (id && /\b20\d\d\b/.test(id[1])){ var hit2=rows.filter(function(r){ return String(r.name).indexOf(id[1]+" ")===0; }); if(hit2.length===1 && /about|detail|tell/.test(q)) return hit2[0]; }
    var SKIP=["project","projects","about","tell","what","show","which","status","details","detail","over","line","review","with","from","that","this","have","there","give","info","information","more"];
    var words=q.replace(/[^a-z0-9 ]/g," ").split(" ").filter(function(w){ return w.length>3 && !STOP[w] && SKIP.indexOf(w)<0; });
    if (!words.length) return null;
    var full = rows.filter(function(r){ var n=String(r.name).toLowerCase(); return words.every(function(w){ return n.indexOf(w)>-1; }); });
    if (full.length===1) return full[0];
    var best=null, bs=0;
    rows.forEach(function(r){ var n=String(r.name).toLowerCase(), s=0; words.forEach(function(w){ if(n.indexOf(w)>-1) s++; });
      var sc=s/words.length; if(s>=2 && sc>bs){ bs=sc; best=r; } });
    return bs>=0.6 ? best : null;
  }

  /* ---------- answers ---------- */
  function scopeTxt(f){ return f.map(function(x){ return x.label; }).join(" \u00b7 "); }
  function src(d,rs,f){ return '<div class="src">Based on '+plural(rs.length,"project")+(f.length?" ("+esc(scopeTxt(f))+")":"")+" in "+esc(d.scope)+'.</div>'; }
  function table(head, rows, numCols){
    return '<table><thead><tr>'+head.map(function(h,i){ return '<th'+(numCols.indexOf(i)>-1?' class="n"':'')+'>'+esc(h)+'</th>'; }).join("")+'</tr></thead><tbody>'
      + rows.map(function(r){ return '<tr>'+r.map(function(c,i){ return '<td'+(numCols.indexOf(i)>-1?' class="n"':'')+'>'+esc(c)+'</td>'; }).join("")+'</tr>'; }).join("")+'</tbody></table>'; }
  function fmtM(m,v){ return m && !m.money ? mo(v) : money(v); }
  function review(d){ return d.threshold || REVIEW; }
  function summary(d,rs,f){
    var R=review(d), npd=rs.filter(function(r){ return r._npd; }), ci=rs.filter(function(r){ return r.bucket==="CI"; }), crq=rs.filter(function(r){ return r.bucket==="CRQ"; });
    var lateN=rs.filter(function(r){ return r.fc!=null && r.fc>R; }).length, fc=avg(rs,"fc"), tg=avg(rs,"tgt");
    var top=rs.filter(function(r){ return r.ns; }).sort(function(a,b){ return b.ns-a.ns; })[0];
    var bk={}; npd.forEach(function(r){ bk[r.bucket]=(bk[r.bucket]||0)+(r.ns||0); }); var tb=Object.keys(bk).sort(function(a,b){ return bk[b]-bk[a]; })[0];
    var h='<p><b>'+plural(rs.length,"project")+'</b>'+(f.length?' match '+esc(scopeTxt(f)):' in view')+'.</p><ul>'
      +'<li>NPD: <b>'+npd.length+'</b> projects, <b>'+money(sum(npd,"ns"))+'</b> annualized net sales'+(tb?' (largest bucket: '+esc(tb)+', '+money(bk[tb])+')':'')+'</li>'
      +'<li>CI: <b>'+ci.length+'</b> projects, <b>'+money(sum(ci,"cm"))+'</b> annualized CM (savings)</li>'
      +(crq.length?'<li>CRQ: <b>'+crq.length+'</b> compliance / regulatory projects</li>':'')
      +'<li>Average forecast time to market <b>'+mo(fc)+'</b> against a <b>'+mo(tg)+'</b> target'+(fc!=null&&tg!=null&&fc>tg?' \u2014 running '+(fc-tg).toFixed(1)+' months long':'')+'</li>'
      +'<li><b>'+lateN+'</b> '+(lateN===1?'project is':'projects are')+' over the '+R+'-month review line</li>'
      +(top?'<li>Largest by annualized net sales: <b>'+esc(top.name)+'</b> ('+money(top.ns)+')</li>':'')+'</ul>';
    return {html:h+src(d,rs,f), val:rs.length, follow:["Which projects are over the review line?","Top 5 projects by net sales","Projects by stage"]};
  }
  function project(d,r){
    var behind = r.fc!=null && r.tgt!=null && r.fc>r.tgt;
    var h='<p><b>'+esc(r.name)+'</b></p><ul>'
      +'<li>'+esc(r.bucket||"No bucket")+' \u00b7 '+esc(r._st||"No stage")+(r.status?' \u00b7 '+esc(r.status):'')+'</li>'
      +(r.owner?'<li>Owner: <b>'+esc(r.owner)+'</b></li>':'')
      +'<li>'+esc([strip(r.bu),strip(r.biz),r.brand,r.mkt].filter(Boolean).join(" \u00b7 "))+'</li>'
      +'<li>Finish <b>'+dstr(r.finish)+'</b>; forecast <b>'+mo(r.fc)+'</b> vs target '+mo(r.tgt)+(behind?' \u2014 <b>'+(r.fc-r.tgt).toFixed(1)+' months over</b>':'')+'</li>'
      +'<li>Annualized net sales <b>'+money(r.ns)+'</b>, CM <b>'+money(r.cm)+'</b>, incremental net sales '+money(r.ins)+'</li>'
      +(r.inv!=null?'<li>Total investment '+money(r.inv)+'</li>':'')+'</ul>';
    return {html:h, val:r.name, follow:[(r.owner?"Projects owned by "+r.owner.split(",")[0]:"Projects by owner"),"Summarize "+(r.bucket||"the portfolio")+" projects"]};
  }
  function groupBy(rs,k){ var g={}; rs.forEach(function(r){ var v=r[k]||"(Not set)"; (g[v]=g[v]||[]).push(r); }); return g; }
  function breakdown(d,rs,f,by,P){
    var g=groupBy(rs,by.k), keys=Object.keys(g), m=P.metric;
    var byCount = !m || /most projects|fewest projects|how many|number of|\bcount\b/.test(P.q) || (/\b(most|fewest)\b/.test(P.q) && !m);
    var val=function(k){ return byCount ? g[k].length : (m.money ? sum(g[k],m.k) : avg(g[k],m.k)); };
    var ranking = /\b(which|top|bottom|most|fewest|highest|lowest|largest|biggest|smallest|rank)\b/.test(P.q);
    if (by.k==="_st" && !ranking) keys.sort(function(a,b){ return STAGES.indexOf(a)-STAGES.indexOf(b); });
    else keys.sort(function(a,b){ var x=val(a), y=val(b); x=x==null?-Infinity:x; y=y==null?-Infinity:y; return P.asc ? (x-y) : (y-x); });
    var N = P.n || (ranking && /\b(which|what)\b/.test(P.q) && !P.n ? Math.min(keys.length,10) : Math.min(keys.length,12));
    if (ranking){ var ns=keys.indexOf("(Not set)"); if(ns>-1){ keys.splice(ns,1); keys.push("(Not set)"); } }
    var shown=keys.slice(0,N), lead=keys[0]==="(Not set)" && keys.length>1 ? keys[1] : keys[0];
    var mlab = byCount ? "projects" : (m.money ? m.label : "average "+m.label);
    var head=[by.label.charAt(0).toUpperCase()+by.label.slice(1),"Projects"].concat(byCount?["Annualized NS"]:[m.money?("Annualized "+(m.k==="inv"?"investment":m.k==="ns"?"NS":m.k==="cm"?"CM":m.k==="ins"?"incr NS":"incr CM")).replace("Annualized investment","Investment"):"Avg "+(m.k==="fc"?"forecast":"target")]);
    var rowsOut=shown.map(function(k){ return [strip(k)||k, String(g[k].length), byCount ? money(sum(g[k],"ns")) : fmtM(m,val(k))]; });
    var leadTxt = lead ? (ranking
        ? '<b>'+esc(strip(lead)||lead)+'</b> has the '+(P.asc?(byCount?'fewest':'lowest '+mlab):(byCount?'most projects':'highest '+mlab))+' ('+(byCount?g[lead].length:fmtM(m,val(lead)))+').'
        : plural(rs.length,"project")+' across '+plural(keys.length,by.label)+'.') : '';
    var h='<p>'+leadTxt+'</p>'+table(head,rowsOut,[1,2])+(keys.length>N?'<p class="src">Showing '+N+' of '+keys.length+'.</p>':'');
    return {html:h+src(d,rs,f), val: lead ? (strip(lead)||lead) : null, follow:["Summarize the portfolio","Which projects are over the review line?"]};
  }
  function distinct(d,rs,f,by){
    var g=groupBy(rs.filter(function(r){ return r[by.k]; }),by.k), keys=Object.keys(g).sort(function(a,b){ return g[b].length-g[a].length; });
    var h='<p>There are <b>'+keys.length+'</b> '+(keys.length===1?by.label:by.plural)+(f.length?' among '+esc(scopeTxt(f))+' projects':'')+'.</p>'
      +table([by.label.charAt(0).toUpperCase()+by.label.slice(1),"Projects","Annualized NS"], keys.slice(0,8).map(function(k){ return [strip(k)||k,String(g[k].length),money(sum(g[k],"ns"))]; }),[1,2])
      +(keys.length>8?'<p class="src">Top 8 of '+keys.length+' by number of projects.</p>':'');
    return {html:h+src(d,rs,f), val:keys.length, follow:["Projects by "+by.label]};
  }
  function ranked(d,rs,f,P){
    var m=P.metric||METRICS[4], k=m.k, n=P.n||5, asc=P.asc;
    var list=rs.filter(function(r){ return r[k]!=null && isFinite(r[k]) && (!m.money || r[k]!==0); })
               .sort(function(a,b){ return asc ? a[k]-b[k] : b[k]-a[k]; }).slice(0,n);
    if(!list.length) return {html:'<p>None of the '+plural(rs.length,"project")+' here have '+esc(m.label)+' filled in.</p>'+src(d,rs,f), val:0};
    var h='<p>'+(n===1?(asc?'Lowest':'Highest')+' '+esc(m.label)+': <b>'+esc(list[0].name)+'</b> ('+fmtM(m,list[0][k])+').':(asc?'Lowest':'Top')+' '+list.length+' by <b>'+esc(m.label)+'</b>:')+'</p>'
      + table(["#","Project","Bucket",m.money?"Value":"Months"], list.map(function(r,i){ return [String(i+1), r.name, r.bucket||"\u2014", fmtM(m,r[k])]; }), [0,3]);
    return {html:h+src(d,rs,f), val:list[0].name, follow:["Tell me about "+String(list[0].name).split(" ")[0],"Projects by business unit"]};
  }
  function late(d,rs,f,P){
    var R=review(d);
    var over=rs.filter(function(r){ return r.fc!=null && r.fc>R; }).sort(function(a,b){ return b.fc-a.fc; });
    var behind=rs.filter(function(r){ return r.fc!=null && r.tgt!=null && r.fc>r.tgt; }).sort(function(a,b){ return (b.fc-b.tgt)-(a.fc-a.tgt); });
    var wantBehind = /behind|over (the |their )?target|late|delay|slip/.test(P.q) && !/review/.test(P.q);
    var main = wantBehind ? behind : over;
    var h = wantBehind
      ? '<p><b>'+behind.length+'</b> '+(behind.length===1?'project is':'projects are')+' forecast to take longer than their target ('+over.length+' of them are also over the '+R+'-month review line). Biggest overruns:</p>'
      : '<p><b>'+over.length+'</b> '+(over.length===1?'project is':'projects are')+' over the '+R+'-month review line (forecast execution time above '+R+' months). Longest first:</p>';
    var list=main.slice(0,P.n||10);
    h += list.length ? table(["Project","Stage","Forecast","Target"], list.map(function(r){ return [r.name, r._st||"\u2014", mo(r.fc), mo(r.tgt)]; }), [2,3]) : '';
    if (main.length>list.length) h+='<p class="src">Showing '+list.length+' of '+main.length+'.</p>';
    return {html:h+src(d,rs,f), val:main.length, follow:[wantBehind?"Which projects are over the review line?":"How many projects are behind target?","Review candidates by bucket"]};
  }
  function listOf(d,rs,f,P){
    var m=P.metric && P.metric.money ? P.metric : METRICS[4];
    var list=rs.slice().sort(function(a,b){ return (b[m.k]||0)-(a[m.k]||0); }).slice(0,P.n||10);
    var h='<p><b>'+plural(rs.length,"project")+'</b>'+(f.length?' match '+esc(scopeTxt(f)):'')+(rs.length>list.length?'; the '+list.length+' largest by '+esc(m.label)+':':':')+'</p>'
      + table(["Project","Stage","Owner",m.k==="ns"?"Annualized NS":"Value"], list.map(function(r){ return [r.name, r._st||"\u2014", r.owner||"\u2014", money(r[m.k])]; }), [3]);
    return {html:h+src(d,rs,f), val:rs.length, follow:["Summarize these projects","Which of these are over the review line?"]};
  }
  function share(d,rows,P){
    var f=P.filters.slice().sort(function(a,b){ return a.pos-b.pos; });
    if(!f.length) return null;
    var subj=f[f.length-1], baseF=f.slice(0,-1), base=applyF(rows,baseF), part=applyF(base,[subj]), m=P.metric;
    var useM = m && m.money && !/projects/.test(P.q.split(/percent|share|proportion|fraction|%/)[1]||"");
    var a = useM ? sum(part,m.k) : part.length, b = useM ? sum(base,m.k) : base.length;
    var pc = b ? a/b*100 : null;
    var h='<p><b>'+(pc==null?"\u2014":pc.toFixed(1)+'%')+'</b> '+(useM?'of '+esc(m.label):'of projects')+(baseF.length?' among '+esc(scopeTxt(baseF)):'')+' '+(useM?'comes from ':'are ')+'<b>'+esc(subj.label)+'</b> \u2014 '
      +(useM?money(a)+' of '+money(b):a+' of '+b)+'.</p>';
    return {html:h+src(d,base,baseF), val:pc==null?null:Math.round(pc*10)/10};
  }
  function help(){
    return {html:'<p>I answer from the numbers on this page. Try:</p><ul><li>Summarize the portfolio</li><li>How many CI projects are in Develop?</li>'
      +'<li>Top 5 NPD projects by net sales</li><li>Which business unit has the most projects?</li><li>Which projects are over the review line?</li>'
      +'<li>How many projects are behind target?</li><li>Projects over 40 months</li><li>What percentage of projects are CI?</li>'
      +'<li>Projects owned by Zhang</li><li>Tell me about 7715</li></ul>',
      follow:["Summarize the portfolio","Projects by stage"]};
  }
  function answer(qRaw){
    var d=data();
    if(!d) return {html:'<p>The page is still loading its data. Try again in a moment.</p>'};
    var P=parse(qRaw,d.rows), q=P.q, f=P.filters, rs=applyF(d.rows,f);
    if (/^\s*(help|hi|hello|hey)\b/.test(q) || /what can (you|i) (do|ask)|how do i use/.test(q)) return help();
    /* "what is Grow the Core?" -> the Project Bucket reference */
    var bf=f.filter(function(x){ return x.k==="bucket"; });
    if (window.BUCKET_REF && bf.length===1 && f.length===1 && /\b(what is|what's|what are|define|definition|meaning|explain|which project types|types? (go|map|fall))\b/.test(q) && !/how many|total|count|average|top/.test(q)){
      var bk=bf[0].v, ref=window.BUCKET_REF.filter(function(r){ return r[1]===bk; });
      return {html:'<p><b>'+esc(bk)+'</b> \u2014 '+esc((window.BUCKET_ABOUT||{})[bk]||"")+'</p>'
        +(ref.length?table(["SG Project Type","Platform","Target (mo)"],ref.map(function(r){ return [r[0],r[2],String(r[3])]; }),[2]):'<p>No SG Project Types map to this bucket in the reference.</p>')
        +'<div class="src">'+plural(rs.length,"project")+' in the data are in '+esc(bk)+'.</div>', val:ref.length, follow:["How many "+bk+" projects are there?","Top 5 "+bk+" projects by net sales"]};
    }
    /* a specific project, named or numbered */
    var named = /\b(tell me about|about|details?|info|status of|who owns|owner of|when (does|will)|what is|what's|show me|look up|lookup)\b/.test(q) || /\b[1-9]\d{3}\b/.test(q);
    var pr = named && !P.by ? findProject(q, d.rows) : null;
    if (pr && !/how many|count|total|average|percent|share/.test(q)) return project(d,pr);
    /* how many distinct owners / brands / ... */
    var dm = /how many (different |unique |distinct )?(owners|brands|businesses|business units|markets|regions|buckets|stages|statuses|people|managers)\b/.exec(q);
    if (dm){ var dd=dimOf(" "+dm[2]+" "); if(dd) return distinct(d,rs,f,dd); }
    if (/percent|percentage|share of|proportion|what fraction|\bratio\b|%/.test(q)){ var sh=share(d,d.rows,P); if(sh) return sh; }
    if (!rs.length) return {html:'<p>No projects match '+esc(scopeTxt(f)||"that")+' in '+esc(d.scope)+'.</p>', val:0, follow:["Summarize the portfolio","Projects by business unit"]};
    if (/\blate\b|delay|behind|slip|at risk|\brisk|review line|review candidates|over (the |their )?target|overdue|too long|over the line/.test(q) && !f.some(function(x){ return x.k==="_cmp"; })) return late(d,rs,f,P);
    if (P.by) return breakdown(d,rs,f,P.by,P);
    if (/how many|number of|\bcount\b|how much projects/.test(q)){
      var npdN=rs.filter(function(r){ return r._npd; }).length, isB=f.some(function(x){ return x.k==="bucket"||x.k==="_npd"; });
      return {html:'<p><b>'+plural(rs.length,"project")+'</b>'+(f.length?' match '+esc(scopeTxt(f)):' in view')+'.</p>'
        +(isB?'':'<p>'+npdN+' NPD, '+rs.filter(function(r){ return r.bucket==="CI"; }).length+' CI, '+rs.filter(function(r){ return r.bucket==="CRQ"; }).length+' CRQ.</p>')+src(d,rs,f),
        val:rs.length, follow:["List them","Break them down by stage"]};
    }
    if (/average|\bavg\b|\bmean\b|typical|per project/.test(q)){
      var m=P.metric||METRICS[6];
      if(!m.money) return {html:'<p>Average forecast time to market is <b>'+mo(avg(rs,"fc"))+'</b> against an average target of <b>'+mo(avg(rs,"tgt"))+'</b>.</p>'+src(d,rs,f), val:avg(rs,"fc")};
      return {html:'<p>Average '+esc(m.label)+' is <b>'+money(avg(rs,m.k))+'</b> per project (projects with a value filled in).</p>'+src(d,rs,f), val:avg(rs,m.k)};
    }
    if (/\b(top|largest|biggest|highest|most|best|smallest|lowest|least|longest|shortest|fastest|slowest|bottom|maximum|minimum|max|min)\b/.test(q)) return ranked(d,rs,f,P);
    if (/\btotal|\bsum\b|how much|what is|what's|what are|overall|combined|pipeline value|\bworth\b/.test(q) && P.metric){
      var mm=P.metric;
      if(!mm.money) return {html:'<p>Average '+esc(mm.label)+' is <b>'+mo(avg(rs,mm.k))+'</b>.</p>'+src(d,rs,f), val:avg(rs,mm.k)};
      return {html:'<p>'+esc(cap(mm.label))+' is <b>'+money(sum(rs,mm.k))+'</b>.</p>'+src(d,rs,f), val:sum(rs,mm.k), follow:["Break it down by business unit","Top 5 by "+mm.label]};
    }
    if (/\b(list|show|which|what|who|give|projects?)\b/.test(q) && (f.length || /\b(list|show)\b/.test(q))) return listOf(d,rs,f,P);
    if (/summar|overview|highlight|how (are|is) .* doing|health|status|tell me about|snapshot|portfolio/.test(q)) return summary(d,rs,f);
    if (P.metric){ var m2=P.metric; return m2.money ? {html:'<p>'+esc(cap(m2.label))+' is <b>'+money(sum(rs,m2.k))+'</b>.</p>'+src(d,rs,f), val:sum(rs,m2.k)} : {html:'<p>Average '+esc(m2.label)+' is <b>'+mo(avg(rs,m2.k))+'</b>.</p>'+src(d,rs,f), val:avg(rs,m2.k)}; }
    if (f.length) return summary(d,rs,f);
    var pr2 = findProject(q, d.rows); if (pr2) return project(d,pr2);
    return {html:'<p>I couldn\u2019t match that to the data on this page. I can count, total, average, rank, break down, compare and look up projects \u2014 for example \u201ctop 5 CI projects by CM\u201d, \u201cnet sales by stage\u201d or \u201cprojects over 40 months\u201d.</p>',
      val:null, follow:["Summarize the portfolio","What can I ask?"]};
  }

  /* ---------- UI ---------- */
  var fab=$("askFab"), pop=$("askPop"), chat=$("askChat"), logEl=$("askLog"), toast=$("askToast"), tt;
  function say(m){ toast.textContent=m; toast.classList.add("on"); clearTimeout(tt); tt=setTimeout(function(){ toast.classList.remove("on"); },3600); }
  function suggestions(){ return (window.gpdSuggest && window.gpdSuggest.length) ? window.gpdSuggest :
    [{q:"Summarize this page",icon:"sum"},{q:"Which projects are over the review line?",icon:"clock"},{q:"Top 5 projects by net sales",icon:"list"},{q:"Projects by business unit",icon:"bars"}]; }
  function drawSug(){ $("askSug").innerHTML=suggestions().map(function(s,i){ return '<button class="askitem" type="button" data-i="'+i+'">'+(ICON[s.icon]||ICON.sum)+'<span>'+esc(s.q)+'</span></button>'; }).join("");
    Array.prototype.forEach.call($("askSug").querySelectorAll(".askitem"),function(b){ b.onclick=function(){ ask(suggestions()[+b.dataset.i].q); }; }); }
  function setScope(){ var d=data(); $("askScope").textContent = d ? "Answers from "+d.scope : "Answers from your portfolio data"; $("askScope").title=$("askScope").textContent; }
  function popOpen(){ drawSug(); document.body.classList.add("ask-pop"); fab.setAttribute("aria-expanded","true"); setTimeout(function(){ $("askQ1").focus(); },40); }
  function popClose(){ document.body.classList.remove("ask-pop"); fab.setAttribute("aria-expanded","false"); }
  function chatOpen(){ popClose(); setScope(); document.body.classList.add("ask-chat"); chat.setAttribute("aria-hidden","false");
    if(!logEl.children.length) greet(); setTimeout(function(){ $("askQ2").focus(); },60); }
  function chatClose(){ document.body.classList.remove("ask-chat"); chat.setAttribute("aria-hidden","true"); fab.focus(); }
  function bubble(cls,html){ var el=document.createElement("div"); el.className="amsg "+cls; el.innerHTML=html; logEl.appendChild(el); logEl.scrollTop=logEl.scrollHeight; return el; }
  function follow(list){ if(!list||!list.length) return; var w=document.createElement("div"); w.className="afollow";
    list.forEach(function(q){ var b=document.createElement("button"); b.type="button"; b.textContent=q; b.onclick=function(){ ask(q); }; w.appendChild(b); });
    logEl.appendChild(w); logEl.scrollTop=logEl.scrollHeight; }
  function greet(){ var d=data(); bubble("bot",'<p>Hi! Ask questions about your data'+(d?' \u2014 '+esc(d.scope):'')+'.</p>'); follow(suggestions().map(function(s){ return s.q; }).slice(0,3)); }
  function ask(q){
    q=String(q||"").trim(); if(!q) return;
    if(!document.body.classList.contains("ask-chat")) chatOpen();
    Array.prototype.forEach.call(logEl.querySelectorAll(".afollow"),function(x){ x.remove(); });
    bubble("me",esc(q)); var t=bubble("bot typing","<i></i><i></i><i></i>");
    setTimeout(function(){ var a; try{ a=answer(q); }catch(e){ console.error(e); a={html:"<p>Something went wrong working that out. Try rephrasing.</p>"}; }
      t.remove(); bubble("bot",a.html); follow(a.follow); log.push({q:q, a:a.html.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}); }, 260);
  }
  function copy(text){
    function fb(){ var ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta); ta.select(); var ok=false; try{ ok=document.execCommand("copy"); }catch(e){} ta.remove(); return ok; }
    if(navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function(){ return true; },function(){ return fb(); });
    return Promise.resolve(fb());
  }
  function context(){ var d=data(); if(!d) return ""; var rs=d.rows, s=summary(d,rs,[]).html.replace(/<li>/g,"\n- ").replace(/<[^>]+>/g,"").replace(/[ \t]+/g," ");
    var top=rs.filter(function(r){ return r.ns; }).sort(function(a,b){ return b.ns-a.ns; }).slice(0,15).map(function(r){ return "- "+r.name+" | "+(r.bucket||"-")+" | "+(r._st||"-")+" | owner "+(r.owner||"-")+" | NS "+money(r.ns)+" | CM "+money(r.cm)+" | forecast "+mo(r.fc)+" vs target "+mo(r.tgt); });
    return "Data from our FBIN R&D Portfolio Hub page ("+d.scope+"):\n"+s.trim()+"\n\nLargest projects by annualized net sales:\n"+top.join("\n"); }
  $("askM365").onclick=function(){
    var convo = log.length ? "\n\nOur conversation so far:\n"+log.map(function(x){ return "Q: "+x.q+"\nA: "+x.a; }).join("\n") : "";
    var p=copy(context()+convo+"\n\nPlease help me with follow-up questions about this data.");
    window.open(M365,"_blank","noopener");
    p.then(function(ok){ say(ok?"Page data copied \u2014 paste it into Microsoft 365 Copilot (Ctrl+V).":"Opened Microsoft 365 Copilot. Your browser blocked copying the data."); });
  };
  fab.onclick=function(){ document.body.classList.contains("ask-pop") ? popClose() : popOpen(); };
  $("askOpenChat").onclick=chatOpen;
  $("askForm1").onsubmit=function(e){ e.preventDefault(); var v=$("askQ1").value; $("askQ1").value=""; ask(v); };
  $("askForm2").onsubmit=function(e){ e.preventDefault(); var v=$("askQ2").value; $("askQ2").value=""; ask(v); };
  $("askClose").onclick=chatClose;
  $("askNew").onclick=function(){ logEl.innerHTML=""; log=[]; greet(); $("askQ2").focus(); };
  document.addEventListener("click",function(e){ if(document.body.classList.contains("ask-pop") && !pop.contains(e.target) && !fab.contains(e.target)) popClose(); });
  document.addEventListener("keydown",function(e){
    if(e.key!=="Escape") return;
    if(document.body.classList.contains("ask-chat")){ e.preventDefault(); e.stopImmediatePropagation(); chatClose(); }
    else if(document.body.classList.contains("ask-pop")){ e.preventDefault(); e.stopImmediatePropagation(); popClose(); fab.focus(); }
  }, true);
  if (ICON_URL) Array.prototype.forEach.call(document.querySelectorAll(".askfab .mk,.achead .mk"),function(el){
    var img=document.createElement("img"); img.className="mk"; img.alt=""; img.src=ICON_URL; el.parentNode.replaceChild(img,el); });
  window.gpdAsk={ ask:ask, answer:answer, open:chatOpen, parse:function(q){ var d=data(); return d?parse(q,d.rows):null; } };
})();
