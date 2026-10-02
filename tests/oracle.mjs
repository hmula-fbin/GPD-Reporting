/* Independent answers for the assistant tests, computed straight from the project rows.
   A question is skipped when the data has a tie for first place (no single right answer). */
export const NPD = new Set(["Grow the Core", "Refresh & Sustain", "Create & Transform"]);
const STAGES = ["Discovery", "Ideate", "Converge", "Develop", "Validate", "Launch"];
const st = (r) => STAGES.find((s) => (r.stage || "").includes(s)) || "";
const S = (rs, k) => rs.reduce((a, r) => a + (r[k] || 0), 0);
const avg = (rs, k) => { const v = rs.map((r) => r[k]).filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const TIE = Symbol("tie");
function top(rs, k, asc = false) {
  const v = rs.filter((r) => r[k] !== null && r[k] !== undefined && r[k] !== 0).sort((a, b) => (asc ? a[k] - b[k] : b[k] - a[k]));
  return v.length > 1 && v[0][k] === v[1][k] ? TIE : v[0].name;
}
function grp(rs, k, m = null, asc = false) {
  const g = new Map();
  rs.forEach((r) => { if (r[k]) g.set(r[k], (g.get(r[k]) || []).concat([r])); });
  const val = ([, list]) => (m ? S(list, m) : list.length);
  const s = [...g.entries()].sort((a, b) => (asc ? val(a) - val(b) : val(b) - val(a)));
  if (s.length > 1 && val(s[0]) === val(s[1])) return TIE;
  return s[0][0].replace(/^[\d\s]+/, "") || s[0][0];
}
const pct = (a, b) => Math.round((a / b) * 1000) / 10;
const month = (r) => (r.finish ? Number(String(r.finish).slice(5, 7)) : null);

export function questions(R) {
  const npd = R.filter((r) => NPD.has(r.bucket)), ci = R.filter((r) => r.bucket === "CI");
  const first = R.find((r) => /^\d{4}\s/.test(r.name));
  return [
    ["How many projects are there?", R.length],
    ["How many NPD projects?", npd.length],
    ["How many CI projects are in Develop?", ci.filter((r) => st(r) === "Develop").length],
    ["What is the total NPD net sales?", S(npd, "ns")],
    ["Total CI savings", S(ci, "cm")],
    ["What is the total investment for Water?", S(R.filter((r) => r.bu.includes("Water")), "inv")],
    ["Which business unit has the most projects?", grp(R, "bu")],
    ["Which business unit has the highest net sales?", grp(R, "bu", "ns")],
    ["Which owner has the most projects?", grp(R, "owner")],
    ["Which brand has the highest CM?", grp(R, "brand", "cm")],
    ["How many projects are over the review line?", R.filter((r) => r.fc && r.fc > 30).length],
    ["How many projects are behind target?", R.filter((r) => r.fc != null && r.tgt != null && r.fc > r.tgt).length],
    ["How many projects take more than 40 months?", R.filter((r) => r.fc && r.fc > 40).length],
    ["How many projects have net sales over $20M?", R.filter((r) => r.ns && r.ns > 20e6).length],
    ["How many projects have less than 10 months forecast", R.filter((r) => r.fc != null && r.fc < 10).length],
    ["What percentage of projects are CI?", pct(ci.length, R.length)],
    ["How many owners are there?", new Set(R.map((r) => r.owner).filter(Boolean)).size],
    ["How many brands?", new Set(R.map((r) => r.brand).filter(Boolean)).size],
    ["Average time to market for Outdoors", avg(R.filter((r) => r.bu.includes("Outdoors")), "fc")],
    ["What is the average net sales per project?", avg(R, "ns")],
    ["Largest project by net sales", top(R, "ns")],
    ["Which project has the highest CM?", top(R, "cm")],
    ["Longest project", top(R, "fc")],
    ["How many projects finish in Q1?", R.filter((r) => month(r) && month(r) <= 3).length],
    ["How many projects finishing in March?", R.filter((r) => month(r) === 3).length],
    ["Total incremental net sales", S(R, "ins")],
    ["How many CRQ projects?", R.filter((r) => r.bucket === "CRQ").length],
    ["How many Security projects?", R.filter((r) => r.bu.includes("Security")).length],
    ["How many projects in Discovery", R.filter((r) => st(r) === "Discovery").length],
    ["Which market has the most projects", grp(R, "mkt")],
    ["Which business has the fewest projects?", grp(R, "biz", null, true)],
    ["smallest NPD project by net sales", top(npd, "ns", true)],
    ["Which CI project has the biggest savings?", top(ci, "cm")],
    ["what share of NPD net sales is Grow the Core", pct(S(R.filter((r) => r.bucket === "Grow the Core"), "ns"), S(npd, "ns"))],
    ["How many projects have investment over $1M?", R.filter((r) => r.inv && r.inv > 1e6).length],
    ["average CM for NPD projects", avg(npd, "cm")],
    ["How many projects are missing net sales?", R.filter((r) => !r.ns).length],
    ["Total investment", S(R, "inv")],
    ["how many different businesses", new Set(R.map((r) => r.biz).filter(Boolean)).size],
    ...(first ? [["Tell me about " + first.name.slice(0, 4), first.name]] : []),
  ].filter(([, v]) => v !== TIE && v !== null);
}
