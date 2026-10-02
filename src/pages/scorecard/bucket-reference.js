/* ============================================================
   PROJECT BUCKET REFERENCE - how an SG Project Type maps to a
   Project Bucket, its platform and the target execution time.
   Update this list if the reference sheet changes.
   ============================================================ */
const BUCKET_REF = {{BUCKET_REF_JSON}};
const BUCKET_ABOUT = {
  "Refresh & Sustain":"NPD bucket \u00b7 refreshes and extensions on existing platforms; counted in the NPD pipeline.",
  "Grow the Core":"NPD bucket \u00b7 product expansion and custom work that grows the core business; counted in the NPD pipeline.",
  "Create & Transform":"NPD bucket \u00b7 new-to-FBIN / new-to-world, distribution expansion and technology development; counted in the NPD pipeline.",
  "CI":"Continuous improvement \u00b7 valued at annualized CM (savings) and kept out of the NPD total.",
  "CRQ":"Compliance / regulatory work \u00b7 reported on its own and kept out of the NPD total. Not part of the SG Project Type reference."
};
window.BUCKET_REF = BUCKET_REF; window.BUCKET_ABOUT = BUCKET_ABOUT;
(function(){
  const tip = document.createElement("div"); tip.className = "bktip"; tip.setAttribute("role","tooltip"); document.body.appendChild(tip);
  function norm(s){ return String(s||"").toLowerCase().replace(/\s+/g," ").trim(); }
  function bucketKey(label){
    if (/^total npd/i.test(label)) return "NPD";
    if (/^ci track/i.test(label)) return "CI";
    if (/^crq track/i.test(label)) return "CRQ";
    return label;
  }
  function html(bucket, projName){
    const key = bucketKey(bucket);
    const list = key==="NPD" ? BUCKET_REF.filter(r=>NPD_BUCKETS.indexOf(r[1])>-1) : BUCKET_REF.filter(r=>r[1]===key);
    const p = projName ? (S.rows||[]).find(r=>r.name===projName) : null;
    const mine = p && p.ptype ? norm(p.ptype) : null;
    let h = '<h4><i style="background:'+(BCOLOR[key]||"var(--kpi)")+'"></i>'+esc(key==="NPD"?"NPD pipeline (all three NPD buckets)":key)+'</h4>'
      + '<p>'+esc(key==="NPD" ? "Refresh & Sustain + Grow the Core + Create & Transform." : (BUCKET_ABOUT[key]||""))+'</p>';
    if (list.length){
      h += '<table><thead><tr><th>SG Project Type</th>'+(key==="NPD"?'<th>Bucket</th>':'')+'<th>Platform</th><th class="n">Target (mo)</th></tr></thead><tbody>'
        + list.map(r => '<tr'+(mine && norm(r[0])===mine ? ' class="me"' : '')+'><td>'+esc(r[0])+'</td>'+(key==="NPD"?'<td>'+esc(r[1])+'</td>':'')+'<td>'+esc(r[2])+'</td><td class="n">'+r[3]+'</td></tr>').join("")
        + '</tbody></table>';
    }
    if (p){
      const ref = BUCKET_REF.find(r=>norm(r[0])===mine);
      h += '<div class="proj"><b>'+esc(p.name)+'</b><br>SG Project Type: <b>'+esc(p.ptype||"not set")+'</b>'
        + (p.platform ? ' \u00b7 Platform: <b>'+esc(p.platform)+'</b>' : '')
        + (ref ? '<br>Reference target: <b>'+ref[3]+' mo</b>'+(p.tgt!=null?' \u00b7 project target: <b>'+mo(p.tgt)+' mo</b>':'')
               + (norm(ref[1])!==norm(p.bucket) ? '<br>Note: the reference maps this type to <b>'+esc(ref[1])+'</b>.' : '')
             : (p.ptype ? '<br>This project type is not in the reference list.' : ''))
        + '</div>';
    }
    return h;
  }
  let cur = null;
  function place(e){
    const pad = 14, w = tip.offsetWidth, hgt = tip.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > innerWidth - 8) x = Math.max(8, e.clientX - w - pad);
    if (y + hgt > innerHeight - 8) y = Math.max(8, e.clientY - hgt - pad);
    tip.style.left = x+"px"; tip.style.top = y+"px";
  }
  function show(el, e){
    const b = el.getAttribute("data-bucket"); if (!b) return;
    cur = el; tip.innerHTML = html(b, el.getAttribute("data-proj")); tip.classList.add("on");
    if (e && e.clientX!=null) place(e); else { const r = el.getBoundingClientRect(); place({clientX:r.left, clientY:r.bottom}); }
  }
  function hide(){ cur = null; tip.classList.remove("on"); }
  document.addEventListener("mouseover", e => { const el = e.target.closest && e.target.closest("[data-bucket]"); if (el && el !== cur) show(el, e); else if (!el && cur) hide(); });
  document.addEventListener("mousemove", e => { if (cur) place(e); });
  document.addEventListener("focusin", e => { const el = e.target.closest && e.target.closest("[data-bucket]"); if (el) show(el); });
  document.addEventListener("focusout", hide);
  document.addEventListener("scroll", hide, true);
  document.addEventListener("keydown", e => { if (e.key==="Escape") hide(); });
})();
