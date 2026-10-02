/* Data for "Ask about this page": exactly the projects the scorecard is showing */
window.gpdData = function(){
  var c = S.last; if(!c) return null;
  var f = S.filters, on = [];
  ["bu","biz","brand","mkt","stage","fy"].forEach(function(k){ if((f[k]||[]).length) on.push(FLABEL[k]+" = "+f[k].map(optText).join(" | ")); });
  /* answers come from every project in the data, not from the filtered page */
  var all = tracked(S.rows);
  return { rows: all, threshold: S.threshold, scope: "all " + all.length + " projects in the portfolio data (every status)" };
};
window.gpdSuggest = [{q:"Summarize this scorecard",icon:"sum"},{q:"Which projects are over the review line?",icon:"clock"},
  {q:"Top 5 NPD projects by net sales",icon:"list"},{q:"CI savings by business unit",icon:"bars"}];
