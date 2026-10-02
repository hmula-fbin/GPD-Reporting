(function(){
  /* ---------- theme ---------- */
  var root=document.documentElement, b=document.getElementById("themeBtn");
  try{ var saved=localStorage.getItem("fbin_theme"); if(saved) root.setAttribute("data-theme",saved); }catch(e){}
  function isDark(){ var t=root.getAttribute("data-theme"); return t==="dark" || (!t && window.matchMedia && matchMedia("(prefers-color-scheme:dark)").matches); }
  function label(){ var dark=isDark(); b.innerHTML = dark ? "<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"8\" cy=\"8\" r=\"2.8\"/><path d=\"M8 1.6v1.3M8 13.1v1.3M1.6 8h1.3M13.1 8h1.3M3.5 3.5l.9.9M11.6 11.6l.9.9M3.5 12.5l.9-.9M11.6 4.4l.9-.9\"/></svg><span>Light</span>" : "<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z\"/></svg><span>Dark</span>"; }
  label();
  b.onclick=function(){ var next=isDark()?"light":"dark"; root.setAttribute("data-theme",next); try{ localStorage.setItem("fbin_theme",next); }catch(e){} label(); };
})();

(function(){
  var $=function(id){ return document.getElementById(id); };
  var CFG=window.GPD_CONFIG, SITE=CFG.sitePath, FILE=CFG.dataFile;

  /* ---------- greeting ---------- */
  var h=new Date().getHours(), part = h<12 ? "Good morning" : h<17 ? "Good afternoon" : "Good evening";
  function greet(name){ $("greet").textContent = part + (name ? ", " + name : ""); }
  greet("");

  fetch(SITE+"/_api/web/currentuser?$select=Title",{credentials:"include",headers:{Accept:"application/json;odata=nometadata"}})
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){ if(!j||!j.Title) return; var t=j.Title, first = t.indexOf(",")>-1 ? t.split(",")[1].trim().split(" ")[0] : t.split(" ")[0];
      if(first) greet(first); })
    .catch(function(){});

  /* ---------- live headline figures (same rules as the scorecard) ---------- */
  var NPD=["Grow the Core","Refresh & Sustain","Create & Transform"], STAGES=["Ideate","Converge","Develop","Validate","Launch"];
  function nk(s){ return String(s==null?"":s).replace(/\s+/g," ").trim(); }
  function num(v){ if(v==null||v==="") return null; if(typeof v==="number") return isFinite(v)?v:null; var n=parseFloat(String(v).replace(/[$,%\s]/g,"")); return isFinite(n)?n:null; }
  function money(v){ var a=Math.abs(v); var s = a>=1e9 ? "$"+(v/1e9).toFixed(2)+"B" : a>=1e6 ? "$"+(v/1e6).toFixed(1)+"M" : a>=1e3 ? "$"+(v/1e3).toFixed(0)+"K" : "$"+Math.round(v); return s.replace("$-","-$"); }
  function when(d){ return new Date(d).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}); }
  function compute(buf){
    var wb=XLSX.read(buf,{type:"array",cellDates:true}), grid=null, hdr=-1;
    for(var s=0;s<wb.SheetNames.length && hdr<0;s++){
      var g=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[s]],{header:1,blankrows:false,defval:null});
      for(var i=0;i<Math.min(g.length,30);i++){ var row=(g[i]||[]).map(function(x){return nk(x).toLowerCase();});
        if(row.indexOf("project name")>-1 && row.indexOf("project bucket (new)")>-1){ grid=g; hdr=i; break; } }
    }
    if(hdr<0) throw new Error("no header");
    var H=grid[hdr].map(function(x){return nk(x).toLowerCase();}), col=function(n){ return H.indexOf(n); };
    var c={name:col("project name"),inc:col("include"),bucket:col("project bucket (new)"),bu:col("bu"),stage:col("stage"),
           fc:col("forecasted execution time (months)"),ns:col("total ns (annualized)"),cm:col("total cm (annualized)"),
           biz:col("business"),brand:col("brand"),mkt:col("market"),owner:col("owner"),status:col("project status"),finish:col("finish"),fy:col("finish year"),
           tgt:col("target execution time (months)"),ins:col("incremental ns (annualized)"),icm:col("incremental cm (annualized)"),inv:col("total investment (opex+capex)")};
    var T=function(g,i){ return i<0?"":nk(g[i]).replace(/\.0$/,""); }, N=function(g,i){ return i<0?null:num(g[i]); };
    var r={n:0,npdN:0,npdNs:0,ciN:0,ciCm:0,crqN:0,rev:0,st:[0,0,0,0,0],bu:{},rows:[]};
    for(var k=hdr+1;k<grid.length;k++){
      var g2=grid[k]||[]; if(!nk(g2[c.name]) || !nk(g2[c.bu])) continue;
      var bk=nk(g2[c.bucket]), fc=num(g2[c.fc]), stt=T(g2,c.status), fin=c.finish<0?null:g2[c.finish], bu=nk(g2[c.bu]);
      r.rows.push({name:nk(g2[c.name]),bucket:bk,bu:bu,biz:T(g2,c.biz),brand:T(g2,c.brand),mkt:T(g2,c.mkt),stage:T(g2,c.stage),owner:T(g2,c.owner),
        status:stt,fy:T(g2,c.fy),finish: fin instanceof Date ? (function(x){ x=new Date(x.getTime()+30000); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); })(fin) : (nk(fin)||null),
        tgt:N(g2,c.tgt),fc:fc,ns:N(g2,c.ns),cm:N(g2,c.cm),ins:N(g2,c.ins),icm:N(g2,c.icm),inv:N(g2,c.inv)});
      if(["in progress","roadmap"].indexOf(stt.toLowerCase())<0) continue;   /* headline view = In Progress + Roadmap */
      r.n++;
      if(fc!==null && fc>CFG.reviewMonths) r.rev++;
      if(NPD.indexOf(bk)>-1){ r.npdN++; r.npdNs+=num(g2[c.ns])||0;
        var st=nk(g2[c.stage]).toLowerCase(); for(var q=0;q<5;q++) if(st.indexOf(STAGES[q].toLowerCase())>-1){ r.st[q]++; break; } }
      else if(bk==="CI"){ r.ciN++; r.ciCm+=num(g2[c.cm])||0; }
      else if(bk==="CRQ") r.crqN++;
      r.bu[bu]=(r.bu[bu]||0)+1;
    }
    return r;
  }
  window.gpdData=function(){ var m=window.gpdHome; return m ? {rows:m.rows, threshold:CFG.reviewMonths, scope:"all "+m.rows.length+" projects in the portfolio data (every status)"} : null; };
  window.gpdSuggest=[{q:"Summarize the portfolio",icon:"sum"},{q:"How many projects are in each stage?",icon:"bars"},
    {q:"Top 5 NPD projects by net sales",icon:"list"},{q:"Which projects are over the review line?",icon:"clock"}];
  var base=SITE+"/_api/web/GetFileByServerRelativePath(decodedurl='"+encodeURIComponent(FILE)+"')";
  Promise.all([
    fetch(base+"?$select=TimeLastModified",{credentials:"include",cache:"no-store",headers:{Accept:"application/json;odata=nometadata"}}).then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }),
    fetch(base+"/$value",{credentials:"include",cache:"no-store"}).then(function(r){ if(!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
  ]).then(function(res){
    var m=compute(res[1]);
    /* month-over-month: the scorecard keeps one snapshot per month in this browser */
    var prev=null, cur=new Date(), ck=cur.getFullYear()+"-"+String(cur.getMonth()+1).padStart(2,"0");
    try{ var sn=JSON.parse(localStorage.getItem("fbin_scorecard_snaps_v2")||"[]").filter(function(x){ return x && x.month<ck && x.m; });
      sn.sort(function(a,b){ return a.month<b.month?-1:1; }); prev=sn.length?sn[sn.length-1]:null; }catch(e){}
    function delta(curV,prevV){ if(prev==null||prevV==null||!isFinite(prevV)) return "";
      var d=curV-prevV, lab=new Date(+prev.month.slice(0,4),+prev.month.slice(5)-1,1).toLocaleDateString("en-US",{month:"short"});
      return " \u00b7 "+(d>=0?"+":"")+money(d)+" vs "+lab; }
    $("kNpd").textContent=money(m.npdNs); $("kNpdF").textContent=m.npdN+" NPD projects"+delta(m.npdNs, prev&&prev.m.npdNs);
    $("kCi").textContent=money(m.ciCm);   $("kCiF").textContent=m.ciN+" CI projects"+delta(m.ciCm, prev&&prev.m.ciCm);
    $("kN").textContent=m.n;              $("kNF").textContent="In Progress + Roadmap \u00b7 "+m.crqN+" CRQ";
    $("kRev").textContent=m.rev;          $("kRevF").textContent=(m.rev>0?"candidates for review":"none over the line"); $("kRev").parentNode.classList.toggle("ok",m.rev===0);
    var tag=$("liveTag"); tag.querySelector("span").textContent="Live";
    var saved = res[0] && res[0].TimeLastModified ? "Data updated "+when(res[0].TimeLastModified)+" \u00b7 " : "";
    $("kWhen").textContent = saved + "loaded " + when(new Date());
    $("footWhen").textContent = saved ? saved.replace(" \u00b7 ","") : "";
    window.gpdHome=m;
    var mx=Math.max.apply(null,m.st)||1, bars=$("miniBars").children;
    for(var i=0;i<5;i++){ bars[i].style.height=Math.max(8,Math.round(m.st[i]/mx*100))+"%"; bars[i].title=STAGES[i]+": "+m.st[i]; }
  }).catch(function(e){
    var tag=$("liveTag"); tag.className="live bad"; tag.querySelector("span").textContent="Offline";
    ["kNpd","kCi","kN","kRev"].forEach(function(id){ $(id).textContent="\u2014"; });
    $("kWhen").textContent = (e && e.message==="403") ? "You don\u2019t have access to the portfolio data. Ask the GPD PPM team." : "Couldn\u2019t load the latest figures. Try again in a minute.";
  });
})();
