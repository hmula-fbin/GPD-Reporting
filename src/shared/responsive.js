/* ===================== Responsive filter panel (Scorecard, Data Quality) =====================
   On phones, tablets and small laptops (narrower than 1100px) the filters fold into a "Filters"
   button that shows how many are switched on, so the figures come first. Wider screens keep the
   filters open in the left panel. */
(function(){
  var rail = document.getElementById("rail"), inner = document.getElementById("railInner");
  if (!rail || !inner) return;
  var btn = document.createElement("button");
  btn.type = "button"; btn.className = "railtoggle"; btn.id = "railToggle";
  btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "railInner");
  btn.innerHTML = '<svg class="i" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h11M4.5 8h7M6.5 12h3"/></svg>'
    + '<span>Filters</span><b class="railcount" hidden></b><span class="railview"></span>'
    + '<svg class="i chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
  rail.insertBefore(btn, inner);
  btn.onclick = function(){ var open = !rail.classList.contains("open"); rail.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); };
  /* how many filters differ from "All", and how many projects are in view */
  function sync(){
    var n = inner.querySelectorAll(".msbtn.active, .fld.active:not(.ms) select, .fld.active:not(.ms) input, select.active").length;
    var c = btn.querySelector(".railcount"); c.hidden = !n; c.textContent = n;
    var iv = document.getElementById("inviewN");
    btn.querySelector(".railview").textContent = iv && /\d/.test(iv.textContent) ? iv.textContent + " in view" : "";
  }
  new MutationObserver(function(){ requestAnimationFrame(sync); }).observe(inner, {subtree:true, childList:true, attributes:true, attributeFilter:["class"], characterData:true});
  sync();
})();
