/* =====================================================================
   Data Quality Dashboard
   Reads the project file and the resource file live (as the person viewing), runs the 21
   data-quality rules on every project, and shows the exceptions.
   The rule engine (between ENGINE START and ENGINE END) touches no page elements, so the
   same code can be checked offline.
   ===================================================================== */

/* ENGINE START */
/* Column names in the project file. If a header changes in the extract, change it here.
   A list means "the first of these that exists". */
const PROJECT_COLS = {
  id: "ProjectID", name: "ProjectName", status: "Project Status", phase: "PhaseName", stage: ["CurrentStage", "StageName"],
  sponsor: "Sponsor Organization", ptype: "ProjectType", bucket: "Strategic Bucket", brand: "Brand",
  owner: "ProjectOwnerName", ownerUid: "ProjectOwnerResourceUID", pm: "Primary Mktg Product Mgr",
  ns: "Total Net Sales", nsInc: "Incremental Net Sales", cs: "Total Cost Savings",
  cmNew: "Contribution Margin Dollars_New", cmInc: "Incremental Contribution Margin Dollars",
  cmCann: "Contribution Margin Dollars_Cann", cmAnn: "Incremental Annual Contribution Margin Dollars",
  pctNew: "Percent Contribution Margin_New", pctCann: "Percent Contribution Margin_Cann", life: "Project Life"
};
const NUMERIC = ["ns", "nsInc", "cs", "cmNew", "cmInc", "cmCann", "cmAnn", "pctNew", "pctCann", "life"];
/* Column names in the resource file. */
const RESOURCE_COLS = { uid: "ResourceUID", name: "ResourceName", active: "ResourceIsActive" };

/* Thresholds (rule set v2.1). */
const T = { recon: 1, pctCm: 2, annual: 1000, material: 500000, placeholder: 200, pctUpper: 100, pctLower: 0,
  pctCannLower: -1, ratioGap: 2.5, crqSavings: 1000, crqIncrNs: 10000 };

/* Which rules apply depends on the project's group. Improve = Strategic Bucket "Improve" or a project type
   starting "Improvement" (whatever the bucket); CRQ and Incremental / Innovation come from the bucket.
   As in the original rule set, a test on a blank field is never met, so a project with no bucket or
   no project type is not treated as "not Improve". */
const has = v => v !== null && v !== undefined && v !== "";
const isImproveBucket = p => /^improve$/i.test(p.bucket);
const isImprove = p => isImproveBucket(p) || /^improvement/i.test(p.ptype);
/* cost-out: an Improve-bucket project with savings and no revenue at all (both sales figures exactly 0) */
const isCostOut = p => isImproveBucket(p) && p.ns === 0 && p.nsInc === 0 && z(p.cs) > 0;
const isCRQ = p => /^crq$/i.test(p.bucket);
const isGrowth = p => /^(incremental|innovation)$/i.test(p.bucket);
const notImproveOrCRQ = p => has(p.bucket) && has(p.ptype) && !isImprove(p) && !isCRQ(p);
const notImprove = p => has(p.bucket) && has(p.ptype) && !isImprove(p);

const SEVS = ["Critical", "High", "Medium", "Low"];
const z = v => v === null || v === undefined ? 0 : v;              /* a blank counts as zero */
const nz = v => z(v) !== 0;
const usd = v => "$" + Math.round(z(v)).toLocaleString("en-US");          /* "$-1,234" as in the original wording */
const usd2 = v => "$" + z(v).toFixed(2);
const pc1 = v => z(v).toFixed(1) + "%";

/* The 21 rules. sev: 0 Critical, 1 High, 2 Medium, 3 Low. cols: grid cells the rule points at.
   needs: fields the rule reads; the rule switches itself off if the file has no such column. */
const RULES = [
  {code:"U1", name:"CM reconciliation", scope:"All projects", test:"|(IncrCM + CannCM) − CM$| > $1", sev:1,
   cols:["cmNew","cmInc","cmCann"], needs:["cmNew","cmInc","cmCann"],
   fn:p => has(p.cmInc) && has(p.cmCann) && has(p.cmNew) && Math.abs(p.cmInc + p.cmCann - p.cmNew) > T.recon,
   desc:p => "The CM$ total (" + usd(p.cmNew) + ") does not equal the sum of Incremental CM$ (" + usd(p.cmInc) + ") and Cannibalization CM$ (" + usd(p.cmCann) + "). The headline total and its components are out of sync."},
  {code:"U2", name:"%CM vs CM$/NS mismatch", scope:"NS > $200", test:"|CM$ ÷ NS × 100 − %CM| > 2 pts", sev:2,
   cols:["pctNew","cmNew","ns"], needs:["pctNew","cmNew","ns"],
   fn:p => z(p.ns) > T.placeholder && has(p.cmNew) && has(p.pctNew) && Math.abs(p.cmNew / p.ns * 100 - p.pctNew) > T.pctCm,
   desc:p => "The %CM field shows " + pc1(p.pctNew) + ", but dividing CM$ by Net Sales gives " + pc1(z(p.cmNew) / p.ns * 100) + ". One of these values is stale, overridden, or computed against a different base."},
  {code:"U3", name:"%CM out of bounds", scope:"All projects", test:"%CM_New > 100 or < 0; %CM_Cann > 100 or < −1", sev:1,
   cols:["pctNew","pctCann"], needs:["pctNew","pctCann"],
   fn:p => z(p.pctNew) > T.pctUpper || z(p.pctNew) < T.pctLower || z(p.pctCann) > T.pctUpper || z(p.pctCann) < T.pctCannLower,
   desc:p => "The %CM field shows " + pc1(p.pctNew) + ". A percentage this far outside a normal range usually indicates a decimal or scaling error upstream."},
  {code:"U4", name:"Annualization mismatch", scope:"Life > 0, IncrCM ≠ 0", test:"|IncrCM ÷ Life − AnnualCM| > $1,000", sev:2,
   cols:["cmAnn","cmInc","life"], needs:["cmAnn","cmInc","life"],
   fn:p => z(p.life) > 0 && nz(p.cmInc) && Math.abs(p.cmInc / p.life - z(p.cmAnn)) > T.annual,
   desc:p => "Incremental CM$ (" + usd(p.cmInc) + ") over a " + p.life + "-year project life is " + usd(p.cmInc / p.life) + " a year, but Annual CM$ shows " + usd(p.cmAnn) + ". The annualized figure is out of step with the total."},
  {code:"U5", name:"Negative contribution margin", scope:"All projects", test:"CM$ < 0", sev:3,
   cols:["cmNew"], needs:["cmNew"], fn:p => z(p.cmNew) < 0,
   desc:p => "This project shows a negative Contribution Margin (" + usd(p.cmNew) + "). Confirm this is intentional (e.g. an exit/divestiture project) rather than an entry error."},
  {code:"U6", name:"Missing product manager", scope:"excl. CRQ & Improve", test:"no PM and (CM$ or Savings) > $500,000", sev:3,
   cols:["pm"], needs:["pm"], fn:p => notImproveOrCRQ(p) && !p.pm && (z(p.cmNew) > T.material || z(p.cs) > T.material),
   desc:p => "This project has a material financial value (" + usd(Math.max(z(p.cmNew), z(p.cs))) + ") but no named Product Manager. Please assign an owner."},
  {code:"U7", name:"Placeholder net sales", scope:"All projects", test:"0 < NS < $200", sev:3,
   cols:["ns"], needs:["ns"], fn:p => z(p.ns) > 0 && p.ns < T.placeholder,
   desc:p => "Net Sales shows " + usd2(p.ns) + ", which looks like a system placeholder rather than a real revenue figure. Please update to the actual amount or set to $0."},
  {code:"U8", name:"Missing contribution margin", scope:"excl. Improve / Improvement*", test:"CM$ blank and NS > $500,000", sev:2,
   cols:["cmNew","ns"], needs:["cmNew","ns"], fn:p => notImprove(p) && p.cmNew === null && z(p.ns) > T.material,
   desc:p => "The contribution margin field has never been filled in (it is blank, not zero). This project has " + usd(p.ns) + " in Net Sales, so a CM figure is expected. Please enter the contribution margin in the project record."},
  {code:"IC", name:"Missing cost savings", scope:"Improve only", test:"Savings blank or 0 while CM$ ≠ 0", sev:2,
   cols:["cs"], needs:["cs","cmNew"], fn:p => isImprove(p) && !nz(p.cs) && nz(p.cmNew),
   desc:() => "This is an Improve project but the Total Cost Savings field is blank or zero. For a project of this type, Cost Savings is the primary benefit metric. Please enter the expected Cost Savings figure in the project record."},
  {code:"IA", name:"Net sales and savings both present", scope:"Improve only", test:"NS > $200 and Savings > $200", sev:3,
   cols:["ns","cs"], needs:["ns","cs"], fn:p => isImprove(p) && z(p.ns) > T.placeholder && z(p.cs) > T.placeholder,
   desc:p => "This Improve project has both Net Sales (" + usd(p.ns) + ") and Cost Savings (" + usd(p.cs) + ") entered. Improve projects typically benefit from one source only. Please confirm these figures are not double-counting the same benefit."},
  {code:"ID", name:"Orphaned contribution margin", scope:"Improve only", test:"CM$ ≠ 0, NS = 0, IncrNS = 0, no Savings", sev:0,
   cols:["cmNew","ns","cs"], needs:["cmNew","ns","nsInc","cs"], fn:p => isImproveBucket(p) && nz(p.cmNew) && !nz(p.ns) && !nz(p.nsInc) && !nz(p.cs),
   desc:p => "The project is claiming " + usd(p.cmNew) + " in contribution margin, but there is no Net Sales figure and no Cost Savings entered to explain where that benefit comes from."},
  {code:"IE", name:"CM$ / savings ratio outlier", scope:"Improve cost-out", test:"nearest-neighbour ratio gap > 2.5×", sev:2,
   cols:["cmNew","cs"], needs:["cmNew","cs","ns","nsInc"], fn:p => !!p._ie,
   desc:p => "This project's CM$/Cost Savings ratio (" + (isFinite(p._ratio) ? p._ratio.toFixed(2) : "") + "x) is a statistical outlier relative to comparable Improve projects. Please verify both figures."},
  {code:"CA", name:"No net sales identified", scope:"CRQ only", test:"CM$ ≠ 0 and NS = 0", sev:0,
   cols:["ns","cmNew"], needs:["ns","cmNew"], fn:p => isCRQ(p) && nz(p.cmNew) && !nz(p.ns),
   desc:p => "This is a compliance project claiming a " + usd(p.cmNew) + " CM benefit, but Net Sales shows $0. Please enter the revenue figure this project protects."},
  {code:"CB", name:"Unexpected cost savings", scope:"CRQ only", test:"Savings > $1,000", sev:2,
   cols:["cs"], needs:["cs"], fn:p => isCRQ(p) && z(p.cs) > T.crqSavings,
   desc:p => "This CRQ project shows " + usd(p.cs) + " in Cost Savings. CRQ projects are compliance/protection work and should not carry meaningful Cost Savings — check for misclassification."},
  {code:"CC", name:"Unexpected incremental sales", scope:"CRQ only", test:"IncrNS > $10,000", sev:1,
   cols:["nsInc"], needs:["nsInc"], fn:p => isCRQ(p) && z(p.nsInc) > T.crqIncrNs,
   desc:p => "This CRQ project shows " + usd(p.nsInc) + " of Incremental Net Sales. CRQ projects protect existing revenue, not new growth — confirm this is not the full protected figure miscoded as incremental."},
  {code:"ND", name:"No revenue basis", scope:"Incremental / Innovation", test:"CM$ ≠ 0, NS = 0, IncrNS = 0", sev:0,
   cols:["cmNew","ns","nsInc"], needs:["cmNew","ns","nsInc"], fn:p => isGrowth(p) && nz(p.cmNew) && !nz(p.ns) && !nz(p.nsInc),
   desc:p => "This growth-type project claims a " + usd(p.cmNew) + " CM benefit with no Net Sales or Incremental Net Sales behind it at all."},
  {code:"NI", name:"Incremental NS ≠ total NS", scope:"Incremental / Innovation", test:"%CM_Cann = 0, NS > $200, |IncrNS − NS| > $1", sev:2,
   cols:["nsInc","ns","pctCann"], needs:["nsInc","ns","pctCann"],
   fn:p => isGrowth(p) && p.pctCann === 0 && has(p.nsInc) && z(p.ns) > T.placeholder && Math.abs(p.nsInc - p.ns) > T.recon,
   desc:p => "Cannibalization is " + Math.round(z(p.pctCann)) + "%, so every dollar of Net Sales (" + usd(p.ns) + ") should be incremental, but Incremental Net Sales shows " + usd(p.nsInc) + " — a " + usd(Math.abs(z(p.nsInc) - p.ns)) + " gap."},
  {code:"BR", name:"Missing brand", scope:"All projects", test:"no Brand but NS, CM$ or Savings > 0", sev:3,
   cols:["brand"], needs:["brand"], fn:p => !p.brand && (z(p.ns) > 0 || z(p.cmNew) > 0 || z(p.cs) > 0),
   desc:p => "This project has no Brand assigned but carries financial value (" + usd(Math.max(z(p.ns), z(p.cmNew), z(p.cs))) + "). Brand is required for portfolio roll-up and reporting. Please select a Brand."},
  {code:"OW", name:"Project owner has left", scope:"All projects", test:"owner inactive in resource roster", sev:1,
   cols:["owner"], needs:["owner","@roster"], fn:p => p.ownerState === "inactive",
   desc:p => "The Project Owner (" + p.owner + ") is marked inactive in the resource roster and appears to have left the organization. Please assign a current Project Owner."},
  {code:"PM", name:"Product manager has left", scope:"All projects", test:"PM inactive in resource roster", sev:1,
   cols:["pm"], needs:["pm","@roster"], fn:p => p.pmState === "inactive",
   desc:p => "The Product Manager (" + p.pm + ") is marked inactive in the resource roster and appears to have left the organization. Please assign a current Product Manager."},
  {code:"OU", name:"Product manager not in roster", scope:"All projects", test:"PM name matches no roster record", sev:3,
   cols:["pm"], needs:["pm","@roster"], fn:p => p.pmState === "unknown",
   desc:p => "The Product Manager (" + p.pm + ") does not match any record in the resource roster, so their employment status cannot be confirmed. This is usually a name-format or spelling difference."}
];
const RULE = {}; RULES.forEach((r, i) => { r.i = i; RULE[r.code] = r; });

/* Roster names come as "Last; First", "Last, First" or "First Last", sometimes with a suffix such as
   " - Inactive" or " - Terminated": drop the suffix, then compare word by word, in any order, ignoring case. */
const nkE = s => String(s == null ? "" : s).replace(/ /g, " ").replace(/\s+/g, " ").trim();
const nameKey = s => nkE(s).replace(/\s+[-–—]\s+.*$/, "").toLowerCase().replace(/[;,.()]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
function personState(name, uid, ro){
  if (!ro || (!name && !uid)) return "";
  let a;
  if (uid && ro.byUid.has(nkE(uid).toLowerCase())) a = ro.byUid.get(nkE(uid).toLowerCase());
  else if (name && ro.byName.has(nameKey(name))) a = ro.byName.get(nameKey(name));
  else return name ? "unknown" : "";
  return a ? "ok" : "inactive";
}

/* IE: among cost-out projects, compare each CM$-to-savings ratio with its nearest neighbour by value.
   More than 2.5 times apart (same sign, neither zero) is an outlier; a blank CM$ gives no ratio at all,
   which is also flagged. */
function markRatioOutliers(P){
  P.forEach(p => { p._ie = false; p._ratio = NaN; });
  const pool = P.filter(isCostOut);
  pool.forEach(p => { if (p.cmNew === null) p._ie = true; else p._ratio = p.cmNew / p.cs; });
  const rs = pool.filter(p => p.cmNew !== null).sort((a, b) => a._ratio - b._ratio);
  rs.forEach((p, i) => {
    const a = rs[i - 1], b = rs[i + 1], r = p._ratio;
    const nb = !a ? b : !b ? a : (Math.abs(r - a._ratio) <= Math.abs(b._ratio - r) ? a : b);
    if (!nb) return;
    const n = nb._ratio;
    if (r === 0 || n === 0 || (r < 0) !== (n < 0)) return;
    p._ie = Math.max(Math.abs(r), Math.abs(n)) / Math.min(Math.abs(r), Math.abs(n)) > T.ratioGap;
  });
}

/* Run every rule on every project. missing: fields the file lacks. Returns {off: {code: why}}. */
function runRules(P, roster, missing){
  const off = {};
  RULES.forEach(r => r.needs.forEach(n => {
    if (n === "@roster" ? !roster : missing.indexOf(n) > -1) off[r.code] = n === "@roster" ? "resource roster" : [].concat(PROJECT_COLS[n])[0];
  }));
  P.forEach(p => { p.ownerState = personState(p.owner, p.ownerUid, roster); p.pmState = personState(p.pm, "", roster); });
  markRatioOutliers(P);
  P.forEach(p => {
    p.ex = RULES.filter(r => !off[r.code] && r.fn(p)).map(r => ({code:r.code, sev:r.sev, text:r.desc(p)}))
      .sort((a, b) => a.sev - b.sev || RULE[a.code].i - RULE[b.code].i);
    p.n = p.ex.length; p.top = p.n ? p.ex[0].sev : 9;
    p.cells = {}; p.why = {};
    p.ex.forEach(e => RULE[e.code].cols.forEach(k => {
      if (p.cells[k] === undefined || e.sev < p.cells[k]) p.cells[k] = e.sev;
      (p.why[k] = p.why[k] || []).push(e.code + " · " + SEVS[e.sev] + " — " + RULE[e.code].name);
    }));
  });
  return {off};
}
/* ENGINE END */

/* ---------- state ---------- */
const DIMS = [
  {key:"status",  label:"Project status"},
  {key:"phase",   label:"Phase"},
  {key:"bucket",  label:"Strategic bucket"},
  {key:"ptype",   label:"Project type"},
  {key:"stage",   label:"Stage"},
  {key:"brand",   label:"Brand"},
  {key:"sponsor", label:"Sponsor organization"}
];
const NOT_SET = "(not set)";
const LS_SNAP = "fbin_dq_snaps_v1", SNAP_DAYS = 400, ROWH = 30;
const S = { P:[], roster:null, off:{}, missing:[], loadedAt:null, fp:"", tab:"check",
  f:null, q:"", scope:"all", ns:0, hl:true, fin:true, sort:"n", dir:-1, rows:[], snaps:[], series:"exceptions" };
const $ = id => document.getElementById(id);

/* ---------- helpers ---------- */
const nk = s => nkE(s).replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const lk = s => nk(s).toLowerCase();
function num(v){ if (v === null || v === undefined || v === "") return null; if (typeof v === "number") return isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(/[$,%\s]/g, "")); return isFinite(n) ? n : null; }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
const fmtN = v => Number(v || 0).toLocaleString("en-US");
const money = v => v === null || v === undefined ? "" : usd(v);
const pctv = v => v === null || v === undefined ? "" : v.toFixed(1) + "%";
function big(v){ const a = Math.abs(v); return a >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B" : a >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : usd(v); }
const when = d => new Date(d).toLocaleString("en-US", {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"});
const todayKey = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
function lsGet(k){ try{ const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; }catch(e){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
const isActive = v => v === true || /^(true|yes|y|1|active)$/i.test(nk(v));
const dimVal = (p, k) => p[k] || NOT_SET;

/* ---------- reading the files ---------- */
/* The first sheet whose header row (within the first 30 rows) has the given column. */
function findTable(buf, mustHave){
  const wb = XLSX.read(buf, {type:"array", cellDates:true}), want = lk(mustHave);
  for (const n of wb.SheetNames){
    const g = XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, blankrows:false, defval:null});
    for (let i = 0; i < Math.min(g.length, 30); i++)
      if ((g[i] || []).map(lk).indexOf(want) > -1) return {grid:g, hdr:i, head:(g[i] || []).map(lk)};
  }
  return null;
}
function parseProjects(buf){
  const t = findTable(buf, PROJECT_COLS.name);
  if (!t) throw new Error("no project header");
  const col = {}, missing = [];
  Object.keys(PROJECT_COLS).forEach(k => {
    const i = [].concat(PROJECT_COLS[k]).map(n => t.head.indexOf(lk(n))).find(x => x > -1);
    if (i === undefined) missing.push(k); else col[k] = i;
  });
  const P = [];
  for (let r = t.hdr + 1; r < t.grid.length; r++){
    const g = t.grid[r] || [], name = nk(g[col.name]);
    if (!name) continue;
    const p = {};
    Object.keys(PROJECT_COLS).forEach(k => {
      const v = col[k] === undefined ? null : g[col[k]];
      p[k] = NUMERIC.indexOf(k) > -1 ? num(v) : nk(v).replace(/\.0$/, "");
    });
    P.push(p);
  }
  /* percentages may arrive as fractions (0.4) or whole numbers (40); the rules use whole numbers */
  ["pctNew", "pctCann"].forEach(k => {
    const v = P.map(p => p[k]).filter(x => x !== null);
    if (v.length && v.some(x => x !== 0) && v.every(x => Math.abs(x) <= 1.5)) P.forEach(p => { if (p[k] !== null) p[k] *= 100; });
  });
  return {P, missing};
}
function parseRoster(buf){
  const t = findTable(buf, RESOURCE_COLS.name);
  if (!t) throw new Error("no resource header");
  const ci = k => t.head.indexOf(lk(RESOURCE_COLS[k]));
  const cu = ci("uid"), cn = ci("name"), ca = ci("active");
  if (ca < 0) throw new Error("no active column");
  const byUid = new Map(), byName = new Map(); let people = 0, active = 0;
  for (let r = t.hdr + 1; r < t.grid.length; r++){
    const g = t.grid[r] || [], nm = nk(g[cn]); if (!nm) continue;
    const a = isActive(g[ca]); people++; if (a) active++;
    if (cu > -1 && nk(g[cu])) byUid.set(lk(g[cu]), a);
    const key = nameKey(nm); byName.set(key, byName.get(key) || a);   /* a name on several records counts as active if any is */
  }
  return {byUid, byName, people, active};
}

/* ---------- filters ----------
   Every filter is a multi-select: tick any number of values; nothing ticked means All. */
const FKEYS = DIMS.map(d => d.key).concat(["sev", "rule"]);
const FLABEL = {sev:"Severity", rule:"Rule code"}; DIMS.forEach(d => { FLABEL[d.key] = d.label; });
function values(key){
  return Array.from(new Set(S.P.map(p => dimVal(p, key))))
    .sort((a, b) => a === NOT_SET ? 1 : b === NOT_SET ? -1 : a.localeCompare(b, "en", {numeric:true}));
}
function defaults(){
  const f = {}; FKEYS.forEach(k => { f[k] = []; });
  f.status = values("status").filter(v => /^in progress$/i.test(v));
  f.phase = values("phase").filter(v => /\bactive\b/i.test(v));
  return f;
}
const optionsFor = key => key === "sev" ? ["0", "1", "2", "3"] : key === "rule" ? RULES.map(r => r.code) : values(key);
const optLabel = (key, v) => key === "sev" ? SEVS[+v] : key === "rule" ? v + " – " + RULE[v].name : v;
const inSel = (sel, v) => !sel.length || sel.indexOf(v) > -1;
const exOk = (e, skip) => (skip === "sev" || inSel(S.f.sev, String(e.sev))) && (skip === "rule" || inSel(S.f.rule, e.code));
function passes(p, skip){
  if (S.scope === "flagged" && !p.n) return false;
  if (S.ns > 0 && !(z(p.ns) > S.ns)) return false;
  if (S.q && (p.name + " " + p.owner + " " + p.pm + " " + p.brand + " " + p.sponsor + " " + p.id).toLowerCase().indexOf(S.q) < 0) return false;
  for (const d of DIMS){ const v = S.f[d.key]; if (v.length && skip !== d.key && v.indexOf(dimVal(p, d.key)) < 0) return false; }
  if ((S.f.sev.length && skip !== "sev") || (S.f.rule.length && skip !== "rule")) return p.ex.some(e => exOk(e, skip));
  return true;
}
/* How many projects (or exceptions, for Severity and Rule) each value would bring in, given the OTHER filters. */
function countsFor(key){
  const c = {};
  S.P.forEach(p => {
    if (!passes(p, key)) return;
    if (key === "sev" || key === "rule") p.ex.forEach(e => { if (exOk(e, key)){ const v = key === "sev" ? String(e.sev) : e.code; c[v] = (c[v] || 0) + 1; } });
    else { const v = dimVal(p, key); c[v] = (c[v] || 0) + 1; }
  });
  return c;
}
function buildFilters(){
  FKEYS.forEach(k => { const o = optionsFor(k); S.f[k] = S.f[k].filter(v => o.indexOf(v) > -1); });   /* drop values no longer in the data */
  $("filterFields").innerHTML = FKEYS.map(k => {
    const opts = optionsFor(k);
    return '<div class="fld ms" id="fld_' + k + '" data-key="' + k + '"><label id="lab_' + k + '">' + esc(FLABEL[k]) + '</label>'
      + '<button class="msbtn" type="button" aria-haspopup="true" aria-expanded="false" aria-labelledby="lab_' + k + '"><span class="mslab"></span><span class="mscaret">▾</span></button>'
      + '<div class="mspanel" hidden>'
      + (opts.length > 8 ? '<input class="mssearch" type="search" placeholder="Search ' + esc(FLABEL[k].toLowerCase()) + '" aria-label="Search ' + esc(FLABEL[k]) + '">' : "")
      + '<div class="msacts"><button type="button" data-act="all">Select all</button><button type="button" data-act="none">Clear</button></div>'
      + '<div class="msopts">' + opts.map(v => '<label class="msopt"><input type="checkbox" value="' + esc(v) + '"><span class="msname">' + esc(optLabel(k, v)) + '</span><span class="mscount"></span></label>').join("")
      + '</div></div></div>';
  }).join("");
  document.querySelectorAll("#filterFields .ms").forEach(el => {
    const k = el.dataset.key, btn = el.querySelector(".msbtn"), panel = el.querySelector(".mspanel"), search = el.querySelector(".mssearch");
    btn.onclick = e => {
      e.stopPropagation();
      const open = panel.hidden; closePanels(el); panel.hidden = !open; btn.setAttribute("aria-expanded", String(open));
      if (open && search){ search.value = ""; filterOpts(el, ""); search.focus(); }
    };
    panel.onclick = e => e.stopPropagation();
    if (search) search.oninput = () => filterOpts(el, search.value);
    el.querySelectorAll(".msacts button").forEach(b => b.onclick = () => {
      const vis = Array.from(el.querySelectorAll(".msopt")).filter(o => o.style.display !== "none").map(o => o.querySelector("input").value);
      S.f[k] = b.dataset.act === "all" ? Array.from(new Set(S.f[k].concat(vis))) : S.f[k].filter(v => vis.indexOf(v) < 0);
      refresh();
    });
    el.querySelectorAll(".msopt input").forEach(cb => cb.onchange = () => {
      const set = new Set(S.f[k]); if (cb.checked) set.add(cb.value); else set.delete(cb.value);
      S.f[k] = Array.from(set); refresh();
    });
  });
}
function closePanels(except){
  document.querySelectorAll("#filterFields .ms").forEach(el => {
    if (el === except) return;
    el.querySelector(".mspanel").hidden = true; el.querySelector(".msbtn").setAttribute("aria-expanded", "false");
  });
}
function filterOpts(el, q){
  const t = q.trim().toLowerCase();
  el.querySelectorAll(".msopt").forEach(o => { o.style.display = !t || o.querySelector(".msname").textContent.toLowerCase().indexOf(t) > -1 ? "" : "none"; });
}
document.addEventListener("click", () => closePanels(null));
document.addEventListener("keydown", e => { if (e.key === "Escape") closePanels(null); });
const listText = k => S.f[k].map(v => optLabel(k, v)).join(" | ");
function msText(k){ const sel = S.f[k]; return !sel.length ? "All" : sel.length === 1 ? optLabel(k, sel[0]) : sel.length + " selected"; }
/* Ticks, counts and labels refresh in place, so an open list keeps its scroll and search text. */
function fillFilters(){
  if (!$("filterFields").children.length) buildFilters();
  FKEYS.forEach(k => {
    const el = $("fld_" + k), cnt = countsFor(k), sel = S.f[k];
    el.querySelectorAll(".msopt").forEach(o => {
      const cb = o.querySelector("input"), n = cnt[cb.value] || 0;
      cb.checked = sel.indexOf(cb.value) > -1;
      o.querySelector(".mscount").textContent = fmtN(n);
      o.classList.toggle("zero", !n);
    });
    el.querySelector(".mslab").textContent = msText(k);
    el.querySelector(".msbtn").classList.toggle("active", sel.length > 0);
    el.classList.toggle("active", sel.length > 0);
  });
  [["fld_q", !!S.q], ["fld_scope", S.scope !== "all"], ["fld_ns", S.ns > 0]].forEach(x => $(x[0]).classList.toggle("active", x[1]));
}
function filterBits(){
  const b = [];
  if (S.scope === "flagged") b.push("Flagged only");
  if (S.f.status.length) b.push("Status = " + listText("status"));
  if (S.f.phase.length) b.push("Phase = " + listText("phase"));
  ["bucket", "ptype", "stage", "brand", "sponsor"].forEach(k => { if (S.f[k].length) b.push(listText(k)); });
  if (S.f.sev.length) b.push("Severity = " + listText("sev"));
  if (S.f.rule.length) b.push("Rule = " + S.f.rule.join(", "));
  if (S.ns > 0) b.push("NS > " + usd(S.ns));
  if (S.q) b.push("Search “" + S.q + "”");
  return b;
}

/* ---------- scorecard view ---------- */
function refresh(){
  S.rows = S.P.filter(p => passes(p));
  sortRows();
  fillFilters();
  if (S.tab === "check"){ renderKpis(); drawRows(true); } else renderTrack();
  $("inviewN").textContent = fmtN(S.rows.length);
  $("tabTrackN").textContent = S.snaps.length;
  renderFoot();
}
function stats(){
  const st = {n:S.rows.length, flagged:0, exc:0, sev:[0, 0, 0, 0], ns:0};
  S.rows.forEach(p => { if (p.n) st.flagged++; st.exc += p.n; st.ns += z(p.ns); p.ex.forEach(e => st.sev[e.sev]++); });
  return st;
}
function renderKpis(){
  const st = stats(), total = S.P.reduce((t, p) => t + p.n, 0);
  const kb = (k, v, sub, cls) => '<div class="kb' + (cls || "") + '"><div class="k">' + k + '</div><div class="v">' + v + (sub ? "<small>" + sub + "</small>" : "") + '</div></div>';
  const bits = filterBits();
  $("kpis").innerHTML = kb("Projects", fmtN(st.n), "of " + fmtN(S.P.length))
    + kb("Needing review", fmtN(st.flagged), st.n ? Math.round(st.flagged / st.n * 100) + "%" : "")
    + kb("Exceptions", fmtN(st.exc), "of " + fmtN(total))
    + kb("Critical", fmtN(st.sev[0]), "", " sev c") + kb("High", fmtN(st.sev[1]), "", " sev h")
    + kb("Medium", fmtN(st.sev[2]), "", " sev m") + kb("Low", fmtN(st.sev[3]), "", " sev l")
    + kb("Net sales", big(st.ns), "")
    + '<div class="kctx">' + esc(bits.length ? bits.join(" · ") : "Full portfolio · no filters applied") + '</div>';
}
const COLS_FULL = [
  {k:"name", t:"Project name"}, {k:"iss", t:"Issues"},
  {k:"sponsor", t:"Sponsor organization", dim:1}, {k:"ptype", t:"Project type", dim:1},
  {k:"bucket", t:"Strategic bucket", dim:1}, {k:"stage", t:"Current stage", dim:1},
  {k:"brand", t:"Brand", dim:1}, {k:"owner", t:"Project owner"}, {k:"pm", t:"Product manager"},
  {k:"ns", t:"Total net sales", n:1}, {k:"cs", t:"Cost savings", n:1}, {k:"nsInc", t:"Incremental NS", n:1},
  {k:"life", t:"Project life", n:1}, {k:"cmInc", t:"Incremental CM$", n:1}, {k:"cmAnn", t:"Annual CM$", n:1},
  {k:"cmNew", t:"CM$_New", n:1}, {k:"cmCann", t:"CM$_Cann", n:1}, {k:"pctNew", t:"%CM_New", n:1}, {k:"pctCann", t:"%CM_Cann", n:1}
];
const COLS_COMPACT = COLS_FULL.filter(c => !c.n && c.k !== "brand");
const cols = () => S.fin ? COLS_FULL : COLS_COMPACT;
function sortVal(p, k){
  if (k === "n" || k === "iss") return p.n;
  const v = p[k];
  if (NUMERIC.indexOf(k) > -1) return v === null ? -Infinity : v;
  return String(v || "").toLowerCase();
}
function sortRows(){
  const k = S.sort, d = S.dir;
  S.rows.sort((a, b) => { const x = sortVal(a, k), y = sortVal(b, k);
    if (x < y) return -d; if (x > y) return d;
    return a.top - b.top || (a.name < b.name ? -1 : 1); });
}
function renderHead(){
  $("headRow").innerHTML = cols().map(c => {
    const key = c.k === "iss" ? "n" : c.k, on = S.sort === key;
    return '<th class="' + (c.n ? "n" : "") + '" data-sort="' + key + '" aria-sort="' + (on ? (S.dir > 0 ? "ascending" : "descending") : "none") + '">'
      + esc(c.t) + (on ? '<span class="ar">' + (S.dir > 0 ? "▲" : "▼") + '</span>' : "") + '</th>';
  }).join("");
  $("headRow").querySelectorAll("th").forEach(th => th.onclick = () => {
    const k = th.dataset.sort;
    if (S.sort === k) S.dir = -S.dir; else { S.sort = k; S.dir = (k === "n" || NUMERIC.indexOf(k) > -1) ? -1 : 1; }
    sortRows(); renderHead(); drawRows(true);
  });
}
function cellHtml(p, c, ci){
  const cls = [], s = S.hl ? p.cells[c.k] : undefined;
  let title = "", txt = "", inner = null;
  if (c.n) cls.push("n");
  if (S.hl && ci === 0 && p.n) cls.push("stripe", "e" + p.top);
  if (s !== undefined){ cls.push("err", "e" + s); title = p.why[c.k].join("\n"); }
  if (c.dim){ cls.push("dim"); if (S.f[c.k].indexOf(dimVal(p, c.k)) > -1) cls.push("sel"); }
  switch (c.k){
    case "iss":
      if (p.n){
        const seen = {};
        inner = '<span class="dots">' + p.ex.filter(e => !seen[e.sev] && (seen[e.sev] = 1)).map(e => '<i class="dot s' + e.sev + '"></i>').join("") + '</span>'
          + '<button class="lnk" type="button" data-iss="1">View ' + p.n + ' issue' + (p.n > 1 ? "s" : "") + '</button>';
        title = p.ex.map(e => SEVS[e.sev] + " · " + e.code + "\n" + e.text).join("\n\n");
      } else inner = '<span class="pass">Pass</span>';
      break;
    case "ns": case "cs": case "nsInc": case "cmInc": case "cmAnn": case "cmNew": case "cmCann": txt = money(p[c.k]); break;
    case "pctNew": case "pctCann": txt = pctv(p[c.k]); break;
    case "life": txt = p.life === null ? "" : fmtN(p.life); break;
    case "name": txt = p.name; if (!title) title = p.name; break;
    default: txt = p[c.k] || "";
  }
  if (s !== undefined && inner === null && txt === ""){ cls.push("blank"); txt = "missing"; }
  return '<td' + (cls.length ? ' class="' + cls.join(" ") + '"' : "") + (title ? ' title="' + esc(title) + '"' : "") + (c.dim ? ' data-dim="' + c.k + '"' : "") + '>'
    + (inner !== null ? inner : esc(txt)) + '</td>';
}
function drawRows(reset){
  const st = stats();
  $("rowCount").textContent = fmtN(st.n); $("flagCount").textContent = fmtN(st.flagged); $("exCount").textContent = fmtN(st.exc);
  $("noRows").hidden = st.n > 0; $("st").hidden = !st.n;
  if (reset) $("gridwrap").scrollTop = 0;
  paint();
}
/* Only the rows on screen are drawn, so thousands of projects scroll smoothly. */
function paint(){
  const wrap = $("gridwrap"), body = $("gridBody"), n = S.rows.length, cs = cols();
  const start = Math.max(0, Math.floor((wrap.scrollTop - 34) / ROWH) - 6), end = Math.min(n, start + Math.ceil((wrap.clientHeight || 440) / ROWH) + 14);
  const spacer = h => '<tr class="sp"><td colspan="' + cs.length + '" style="height:' + h + 'px;padding:0;border:0;background:transparent"></td></tr>';
  let h = start > 0 ? spacer(start * ROWH) : "";
  for (let i = start; i < end; i++) h += '<tr data-i="' + i + '">' + cs.map((c, ci) => cellHtml(S.rows[i], c, ci)).join("") + '</tr>';
  if (end < n) h += spacer((n - end) * ROWH);
  body.innerHTML = h;
}
$("gridwrap").addEventListener("scroll", () => paint(), {passive:true});
$("gridBody").addEventListener("click", e => {
  const tr = e.target.closest("tr[data-i]"); if (!tr) return;
  const p = S.rows[+tr.dataset.i];
  if (e.target.closest("[data-iss]")) return openIssues(p);
  const td = e.target.closest("td[data-dim]");
  if (td){ const k = td.dataset.dim, v = dimVal(p, k); S.f[k] = S.f[k].length === 1 && S.f[k][0] === v ? [] : [v]; refresh(); }
});
function renderHlKey(){
  const el = $("hlKey");
  if (!S.hl){ el.innerHTML = "Error highlighting is off."; return; }
  el.innerHTML = '<span>Tinted cells are the fields that tripped a rule — hover one to see which. A hatched cell marked “— missing” has no value at all, and that is the finding:</span>'
    + SEVS.map((s, i) => '<span class="k"><i style="--kw:var(--sev' + i + '-w);--kc:var(--sev' + i + ')"></i>' + s + '</span>').join("")
    + '<span class="rt">Row stripe shows the project’s highest severity.</span>';
}

/* ---------- issues pop-up ---------- */
function openIssues(p){
  const sub = [p.bucket, p.ptype, p.stage, p.brand].filter(Boolean).join("  ·  ") + "   |   Owner: " + (p.owner || "—") + "   |   PM: " + (p.pm || "—");
  const fin = [["Total net sales", money(p.ns)], ["Cost savings", money(p.cs)], ["Incremental NS", money(p.nsInc)], ["CM$_New", money(p.cmNew)],
    ["Incremental CM$", money(p.cmInc)], ["Annual CM$", money(p.cmAnn)], ["CM$_Cann", money(p.cmCann)], ["%CM_New", pctv(p.pctNew)],
    ["%CM_Cann", pctv(p.pctCann)], ["Project life", p.life === null ? "" : fmtN(p.life)]];
  $("issBody").innerHTML = '<header><div style="min-width:0"><h3 id="issTitle">' + esc(p.name) + '</h3><div class="sub">' + esc(sub) + '</div></div>'
    + '<button class="btn" type="button" id="issClose">Close</button></header><div class="bd">'
    + '<div class="fin">' + fin.map(x => '<div><div class="k">' + x[0] + '</div><div class="v">' + esc(x[1] || "—") + '</div></div>').join("") + '</div>'
    + (p.n ? p.ex.map(e => '<div class="iss i' + e.sev + '"><div class="top"><span class="sevpill s' + e.sev + '">' + SEVS[e.sev] + '</span><span class="cd">' + e.code + '</span><span class="rn">' + esc(RULE[e.code].name) + '</span></div><p>' + esc(e.text) + '</p></div>').join("")
           : '<div class="pass">No issues found.</div>')
    + '</div>';
  $("issClose").onclick = () => $("issDlg").close();
  $("issDlg").showModal();
}

/* ---------- notes & rule summary ---------- */
function openNotes(){
  const cnt = {}, projs = {}; RULES.forEach(r => { cnt[r.code] = 0; projs[r.code] = new Set(); });
  let tot = 0;
  S.P.forEach((p, i) => p.ex.forEach(e => { cnt[e.code]++; projs[e.code].add(i); tot++; }));
  const order = RULES.slice().sort((a, b) => cnt[b.code] - cnt[a.code] || a.i - b.i), mx = Math.max(1, cnt[order[0].code]);
  const st = stats(), ro = S.roster, pa = t => "<p>" + t + "</p>";
  let h = '<header><div style="min-width:0"><h3 id="notesTitle">Notes &amp; rule summary</h3><div class="sub">How the dashboard is built, what each rule tests, and how many exceptions each one is raising.</div></div>'
    + '<button class="btn" type="button" id="notesClose">Close</button></header><div class="bd">';
  h += '<h4>What this dashboard measures</h4>'
    + pa("Every project record in the portfolio is tested against " + RULES.length + " financial and ownership data-quality rules (rule set v2.1). A rule that fires raises one exception on that project, so a project can hold several exceptions at once. “Projects needing review” counts projects with at least one exception; “Open exceptions” counts the exceptions themselves — the second number is always the larger of the two.")
    + pa("Project figures come from the project data (" + fmtN(S.P.length) + " projects) and the ownership rules from the resource roster"
      + (ro ? " (" + fmtN(ro.people) + " people, " + fmtN(ro.active) + " active)." : ", which could not be read just now, so OW, PM and OU are off."));
  h += '<h4>Default view</h4>' + pa("The dashboard opens on Project status = In Progress and Phase = Active Phase, matching the Innovation &amp; CI Portfolio Scorecard, so what you see first is live work rather than completed or cancelled records. Those filters can be set to All; Reset returns them to these defaults. With the current filters the view holds "
    + fmtN(st.n) + " projects, " + fmtN(st.flagged) + " of them flagged, carrying " + fmtN(st.exc) + " exceptions.");
  h += '<h4>Severity scale</h4><div class="sevkey">' + [
    "A figure is being claimed with nothing behind it — margin with no revenue or savings to explain it.",
    "The headline numbers disagree with each other, or a material project has no active owner.",
    "A field is missing, stale or inconsistent where a value is expected.",
    "Worth confirming, but not wrong on its face — placeholders, blank brand, unmatched names."
  ].map((t, i) => '<div><span class="sevpill s' + i + '">' + SEVS[i] + '</span><div>' + esc(t) + '</div></div>').join("") + '</div>';
  h += '<h4>Exception summary by rule<span class="hint">whole portfolio · click a row to filter the grid to that rule</span></h4>'
    + '<div class="tblwrap"><table class="sum"><thead><tr><th>Rule</th><th>Severity</th><th>Scope</th><th>Test</th><th class="n">Exceptions</th><th class="n">Projects</th><th class="n">% of exceptions</th><th></th></tr></thead><tbody>'
    + order.map(r => '<tr data-rule="' + r.code + '" tabindex="0" class="' + (S.f.rule.indexOf(r.code) > -1 ? "on" : "") + '">'
      + '<td><span class="bullet s' + r.sev + '"></span><span class="rname">' + r.code + " – " + esc(r.name) + '</span>' + (S.off[r.code] ? ' <span class="muted">(off: no ' + esc(S.off[r.code]) + ')</span>' : "") + '</td>'
      + '<td><span class="sevpill s' + r.sev + '">' + SEVS[r.sev] + '</span></td><td>' + esc(r.scope) + '</td><td>' + esc(r.test) + '</td>'
      + '<td class="n">' + fmtN(cnt[r.code]) + '</td><td class="n">' + fmtN(projs[r.code].size) + '</td>'
      + '<td class="n">' + (tot ? (cnt[r.code] / tot * 100).toFixed(1) : "0.0") + '%</td><td><span class="bar"><i style="width:' + (cnt[r.code] / mx * 100).toFixed(1) + '%"></i></span></td></tr>').join("")
    + '</tbody></table></div>';
  h += '<div class="params">' + [["vTOL_RECON", "$1"], ["vTOL_PCT_CM", "2 pts"], ["vTOL_ANNUAL", "$1,000"], ["vMATERIALITY", "$500,000"], ["vPLACEHOLDER_MAX", "$200"],
    ["vPCT_CM_UPPER / LOWER", "100 / 0"], ["vRATIO_GAP_THRESHOLD", "2.5×"], ["vCRQ_COST_SAVINGS_MAX", "$1,000"], ["vCRQ_INCR_NS_MAX", "$10,000"]]
    .map(x => '<span class="param">' + x[0] + ' = <b>' + x[1] + '</b></span>').join("") + '</div>';
  const zero = RULES.filter(r => !cnt[r.code] && !S.off[r.code]).map(r => r.code);
  h += '<h4>Worth knowing</h4><ul>' + [
    (zero.length ? zero.join(" and ") + (zero.length > 1 ? " raise" : " raises") + " no exceptions in this data. They are live rules, not retired ones — they are shown at zero rather than hidden." : "Every rule raises at least one exception in this data."),
    "OU flags a product manager whose name matches no record in the resource roster. The roster holds three name formats (Last; First, Last, First and First Last) which the matching key normalises, so an OU is usually a spelling difference rather than a missing person — which is why it is scored Low.",
    "U6 and U8 deliberately skip CRQ and Improve projects, and IC, IA, ID and IE apply to Improve projects only — a blank contribution margin is not an error for a cost-out project. Which group a project is in comes from its Strategic Bucket.",
    "Rule counts in this panel are for the whole portfolio. The summary bar and grid reflect the filters you have applied.",
    "Daily tracking stores one row per calendar date holding that day’s totals, so the trend moves when the project data changes."
  ].map(t => '<li>' + esc(t) + '</li>').join("") + '</ul></div>';
  $("notesBody").innerHTML = h;
  $("notesClose").onclick = () => $("notesDlg").close();
  $("notesBody").querySelectorAll("tr[data-rule]").forEach(tr => {
    const go = () => { const r = tr.dataset.rule; S.f.rule = S.f.rule.length === 1 && S.f.rule[0] === r ? [] : [r]; $("notesDlg").close(); setTab("check"); refresh(); };
    tr.onclick = go; tr.onkeydown = e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); go(); } };
  });
  $("notesDlg").showModal();
}
["issDlg", "notesDlg"].forEach(id => $(id).addEventListener("click", e => { if (e.target === $(id)) $(id).close(); }));

/* ---------- daily tracking ---------- */
/* Tracking always measures the default view (In Progress, Active Phase) so days compare like for like.
   Rows are kept in this browser. The first view of a day logs it; a newer extract replaces it. */
function trackNow(){
  const d = defaults(), t = {date:todayKey(), projects:0, flagged:0, exceptions:0, critical:0, high:0, medium:0, low:0, rules:{}, fp:S.fp};
  const keys = ["critical", "high", "medium", "low"];
  S.P.forEach(p => {
    if (d.status.length && d.status.indexOf(p.status) < 0) return;
    if (d.phase.length && d.phase.indexOf(p.phase) < 0) return;
    t.projects++; if (p.n) t.flagged++; t.exceptions += p.n;
    p.ex.forEach(e => { t[keys[e.sev]]++; t.rules[e.code] = (t.rules[e.code] || 0) + 1; });
  });
  return t;
}
function trackScope(){ const d = defaults(); return "Project status = " + (d.status.join(" + ") || "All") + ", Phase = " + (d.phase.join(" + ") || "All"); }
const todayRow = () => S.snaps.find(r => r.date === todayKey()) || null;
function record(){
  if (!S.P.length) return;
  const t = trackNow();
  S.snaps = S.snaps.filter(s => s.date !== t.date).concat([t]).sort((a, b) => a.date < b.date ? -1 : 1).slice(-SNAP_DAYS);
  lsSet(LS_SNAP, S.snaps);
}
function autoRecord(){ const r = todayRow(); if (!r || r.fp !== S.fp) record(); }
function snapMsg(){
  const r = todayRow();
  return r && r.fp === S.fp ? "Logged automatically for " + r.date + ". Recording again just refreshes that row."
    : r ? "Today’s row holds an earlier extract — it will be replaced automatically." : "Today has not been logged yet.";
}
function renderTrack(){
  const key = $("seriesSel").value, svg = $("trendChart"), H = S.snaps;
  $("tabTrackN").textContent = H.length;
  $("snapMsg").textContent = snapMsg();
  $("emptyChart").hidden = H.length > 0;
  $("lgBarTxt").textContent = $("seriesSel").selectedOptions[0].textContent;
  if (!H.length){ svg.innerHTML = ""; $("logTable").innerHTML = ""; return; }
  const W = 560, Ht = 220, L = 50, R = 14, Tp = 18, B = 36, data = H.slice(-60), vals = data.map(r => r[key] || 0);
  const step = Math.max(1, Math.ceil(Math.max(1, ...vals) / 4)), top = step * 4, pw = W - L - R, ph = Ht - Tp - B, n = data.length;
  const cx = i => n === 1 ? L + pw / 2 : L + i * pw / (n - 1), cy = v => Tp + ph - v / top * ph;
  let g = "";
  for (let i = 0; i <= 4; i++){ const y = Tp + ph - i / 4 * ph;
    g += '<line x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y + '" style="stroke:var(--rule-2)"/><text x="' + (L - 8) + '" y="' + (y + 3.8) + '" text-anchor="end">' + fmtN(step * i) + '</text>'; }
  const every = Math.max(1, Math.ceil(n / 8));
  data.forEach((r, i) => { if (i % every === 0 || i === n - 1) g += '<text x="' + cx(i) + '" y="' + (Ht - B + 15) + '" text-anchor="middle">' + r.date.slice(5) + '</text>'; });
  if (n > 1) g += '<polyline points="' + data.map((r, i) => cx(i) + "," + cy(vals[i])).join(" ") + '" fill="none" style="stroke:var(--kpi)" stroke-width="2.2" stroke-linejoin="round"/>';
  data.forEach((r, i) => { const same = i > 0 && r.fp && data[i - 1].fp === r.fp;
    g += '<circle cx="' + cx(i) + '" cy="' + cy(vals[i]) + '" r="3.4" style="' + (same ? "fill:var(--panel)" : "fill:var(--kpi)") + ';stroke:var(--kpi)" stroke-width="1.6"><title>' + r.date + ": " + fmtN(vals[i]) + (same ? " (same data as the day before)" : "") + '</title></circle>';
    if (n <= 12) g += '<text x="' + cx(i) + '" y="' + (cy(vals[i]) - 8) + '" text-anchor="middle" style="fill:var(--kpi);font-weight:700">' + fmtN(vals[i]) + '</text>'; });
  svg.innerHTML = g;
  const rev = H.slice().reverse();
  $("logTable").innerHTML = '<thead><tr><th>Date</th><th>Extract</th><th>Projects</th><th>Flagged</th><th>Exceptions</th><th>Change vs previous</th><th>Critical</th><th>High</th><th>Medium</th><th>Low</th></tr></thead><tbody>'
    + rev.map((r, i) => { const prev = rev[i + 1], same = prev && r.fp && prev.fp === r.fp, d = prev ? r.exceptions - prev.exceptions : null;
      return '<tr><td>' + r.date + '</td><td class="' + (same ? "flat" : "") + '" title="' + (same ? "Same project data as the previous row: re-logged, not re-measured." : "Different project data from the previous row.") + '">' + (same ? "same" : "new") + '</td>'
        + '<td>' + fmtN(r.projects) + '</td><td>' + fmtN(r.flagged) + '</td><td>' + fmtN(r.exceptions) + '</td>'
        + '<td class="flat">' + (d === null ? "—" : (d > 0 ? "+" : "") + fmtN(d)) + '</td><td>' + fmtN(r.critical) + '</td><td>' + fmtN(r.high) + '</td><td>' + fmtN(r.medium) + '</td><td>' + fmtN(r.low) + '</td></tr>'; }).join("") + '</tbody>';
}
$("seriesSel").onchange = renderTrack;

/* ---------- Excel downloads ---------- */
const DL_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="14" height="14" rx="3" fill="#1D6F42"/><path d="M4 5.2h8M4 8h8M4 10.8h8M7.2 3.6v8.8" stroke="#fff" stroke-width="1.15" stroke-linecap="round" fill="none"/></svg>';
function saveXlsx(filename, sheets){
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => {
    const ws = XLSX.utils.aoa_to_sheet(s.rows.map(r => r.map(v => v === null || v === undefined ? "" : v)));
    const w = []; s.rows.forEach(r => r.forEach((c, i) => { w[i] = Math.max(w[i] || 8, Math.min(58, String(c == null ? "" : c).length + 2)); }));
    ws["!cols"] = w.map(x => ({wch:x}));
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\\/\?\*\[\]:]/g, " ").slice(0, 31));
  });
  XLSX.writeFile(wb, filename, {compression:true});
}
const PROJ_HEAD = ["Project name", "Project ID", "Project status", "Phase", "Sponsor organization", "Project type", "Strategic bucket", "Stage", "Brand",
  "Project owner", "Product manager", "Total net sales", "Cost savings", "Incremental NS", "Project life", "Incremental CM$", "Annual CM$",
  "CM$_New", "CM$_Cann", "%CM_New", "%CM_Cann", "Exceptions", "Rules", "Status"];
function projectSheets(list){
  const pr = [PROJ_HEAD], ex = [["Project name", "Rule code", "Rule", "Severity", "Description"]];
  list.forEach(p => {
    pr.push([p.name, p.id, p.status, p.phase, p.sponsor, p.ptype, p.bucket, p.stage, p.brand, p.owner, p.pm, p.ns, p.cs, p.nsInc, p.life,
      p.cmInc, p.cmAnn, p.cmNew, p.cmCann, p.pctNew, p.pctCann, p.n, p.ex.map(e => e.code).join(" "), p.n ? "Review" : "Pass"]);
    p.ex.forEach(e => ex.push([p.name, e.code, RULE[e.code].name, SEVS[e.sev], e.text]));
  });
  const cnt = {}; S.P.forEach(p => p.ex.forEach(e => cnt[e.code] = (cnt[e.code] || 0) + 1));
  const rl = [["Code", "Rule", "Severity", "Scope", "Test", "Exceptions (portfolio)"]].concat(RULES.map(r => [r.code, r.name, SEVS[r.sev], r.scope, r.test, cnt[r.code] || 0]));
  return [{name:"Projects", rows:pr}, {name:"Exceptions", rows:ex}, {name:"Rule reference", rows:rl}, filterSheet()];
}
function filterSheet(){
  const st = stats(), all = k => listText(k) || "All";
  return {name:"Filters applied", rows:[["Filter", "Value"], ["Project status", all("status")], ["Phase", all("phase")],
    ["Show", S.scope === "flagged" ? "Flagged only" : "All projects"], ["Strategic bucket", all("bucket")], ["Project type", all("ptype")],
    ["Stage", all("stage")], ["Brand", all("brand")], ["Sponsor organization", all("sponsor")], ["Severity", all("sev")],
    ["Rule code", S.f.rule.join(", ") || "All"], ["Net sales greater than", S.ns || 0], ["Project search", S.q || "(none)"], [],
    ["Projects in view", st.n], ["Projects needing review", st.flagged], ["Open exceptions", st.exc], ["Critical", st.sev[0]], ["High", st.sev[1]],
    ["Medium", st.sev[2]], ["Low", st.sev[3]], [], ["Last refreshed", S.loadedAt ? S.loadedAt.toLocaleString("en-US") : ""],
    ["Rule set", "v2.1 — 21 checks"], ["Downloaded", new Date().toLocaleString("en-US")]]};
}
function exportAll(){ saveXlsx("Data_Quality_All_Projects_" + todayKey() + ".xlsx", projectSheets(S.P)); }
function exportView(){ saveXlsx("Data_Quality_Dashboard_" + todayKey() + ".xlsx", projectSheets(S.rows)); }
function exportLog(){
  const rows = [["Date", "Extract", "Projects", "Projects needing review", "Open exceptions", "Change vs previous", "Critical", "High", "Medium", "Low"]];
  S.snaps.forEach((r, i) => { const prev = S.snaps[i - 1];
    rows.push([r.date, prev && r.fp && prev.fp === r.fp ? "same" : "new", r.projects, r.flagged, r.exceptions, prev ? r.exceptions - prev.exceptions : "", r.critical, r.high, r.medium, r.low]); });
  saveXlsx("Data_Quality_Daily_Tracking_" + todayKey() + ".xlsx", [{name:"Daily tracking", rows}, {name:"About", rows:[["Tracking scope", trackScope()], ["Downloaded", new Date().toLocaleString("en-US")]]}]);
}
function flash(btn, label){
  const was = btn.innerHTML; btn.classList.add("done"); btn.innerHTML = label;
  setTimeout(() => { btn.classList.remove("done"); btn.innerHTML = was; }, 1800);
}

/* ---------- loading ---------- */
function spPath(p){ return encodeURIComponent(p.replace(/'/g, "''")); }
async function fetchFile(file){
  const base = GPD_CONFIG.sitePath + "/_api/web/GetFileByServerRelativePath(decodedurl='" + spPath(file) + "')";
  const [info, bin] = await Promise.all([
    fetch(base + "?$select=TimeLastModified", {credentials:"include", cache:"no-store", headers:{Accept:"application/json;odata=nometadata"}}).catch(() => null),
    fetch(base + "/$value", {credentials:"include", cache:"no-store"})
  ]);
  if (bin.status === 401 || bin.status === 403) throw new Error("You don’t have access to the project data. Ask the FBIN R&D PPM team for access.");
  if (!bin.ok) throw new Error("Please try again in a minute. If it keeps happening, contact the FBIN R&D PPM team.");
  let modified = "";
  if (info && info.ok){ try{ modified = (await info.json()).TimeLastModified || ""; }catch(e){} }
  return {buf: await bin.arrayBuffer(), modified};
}
function warn(){
  const bar = $("warnbar"), by = {};
  Object.keys(S.off).forEach(c => (by[S.off[c]] = by[S.off[c]] || []).push(c));
  const msgs = Object.keys(by).map(k => k === "resource roster"
    ? "<b>Ownership checks are off</b> (" + by[k].join(", ") + "): the resource roster couldn’t be read just now."
    : "<b>" + by[k].join(", ") + " " + (by[k].length > 1 ? "are" : "is") + " off:</b> the project data has no “" + esc(k) + "” column.");
  bar.hidden = !msgs.length; bar.className = "warnbar";
  bar.innerHTML = msgs.map(m => "<span>" + m + "</span>").join("");
}
async function reloadData(){
  const btn = $("reloadBtn");
  btn.disabled = true; btn.classList.add("busy"); btn.querySelector("span").textContent = "Refreshing…";
  try{
    const [pr, rs] = await Promise.all([fetchFile(GPD_CONFIG.projectFile), fetchFile(GPD_CONFIG.resourceFile).catch(e => ({err:e}))]);
    let parsed;
    try{ parsed = parseProjects(pr.buf); }
    catch(pe){ console.error(pe); throw new Error("The project data couldn’t be read. Contact the FBIN R&D PPM team."); }
    let roster = null;
    if (!rs.err){ try{ roster = parseRoster(rs.buf); }catch(re){ console.error(re); } } else console.error(rs.err);
    S.P = parsed.P; S.missing = parsed.missing; S.roster = roster; S.loadedAt = new Date();
    S.fp = [pr.modified, rs.modified || "", S.P.length].join("|");          /* identifies this extract for the tracking */
    S.off = runRules(S.P, roster, S.missing).off;
    if (!S.f) S.f = defaults();
    $("filterFields").innerHTML = "";
    autoRecord();
    const asAt = pr.modified ? new Date(pr.modified) : S.loadedAt;
    $("subline").textContent = "Project & resource data quality checks · Data as at " + asAt.toLocaleDateString("en-GB", {day:"numeric", month:"short", year:"numeric"});
    $("subline").title = "Last refreshed " + when(S.loadedAt);
    $("emptyState").hidden = true; $("tabsrow").hidden = false;
    showTab();
    warn(); renderHead(); renderHlKey(); refresh();
    window.gpdDQReady = true;
  }catch(err){
    console.error(err);
    const m = err && err.message ? err.message : String(err);
    if (!S.P.length){ $("emptyTitle").textContent = "Couldn’t load the project data"; $("emptyMsg").textContent = m; }
    else { const bar = $("warnbar"); bar.hidden = false; bar.className = "warnbar bad";
      bar.innerHTML = "<span><b>Couldn’t load the latest data.</b> Showing the figures from " + esc(S.loadedAt.toLocaleString("en-US")) + ". " + esc(m) + "</span>"; }
  }finally{
    btn.disabled = false; btn.classList.remove("busy"); btn.querySelector("span").textContent = "Refresh now";
  }
}
function renderFoot(){
  const f = $("foot"); f.hidden = false;
  f.innerHTML = '<span>Last refresh: ' + (S.loadedAt ? S.loadedAt.toLocaleString("en-US") : "—") + '</span>'
    + '<span>' + fmtN(S.P.length) + ' projects checked against ' + RULES.length + ' rules</span>'
    + '<span>' + S.snaps.length + ' daily snapshot' + (S.snaps.length === 1 ? "" : "s") + ' stored in this browser</span>';
  const ro = S.roster, t = trackNow();
  $("checkFoot").textContent = "Project and exception figures are built from the project data (" + fmtN(S.P.length) + " projects)"
    + (ro ? " and the resource roster (" + fmtN(ro.people) + " people, " + fmtN(ro.active) + " active)" : "")
    + ", scored against the " + RULES.length + " rules of rule set v2.1. Which rules apply to a project depends on its Strategic Bucket (Improve, CRQ, Incremental, Innovation).";
  $("trackScope").textContent = "logged automatically · one row per calendar date · " + trackScope();
  $("trackFoot").textContent = "The row for each date is written automatically: the first view of the day logs it, and a view carrying newer project data replaces it. "
    + "Tracking is fixed to the dashboard’s default scope (" + trackScope() + ") so the series stays comparable — changing the filters on the Scorecard tab does not change what is logged. "
    + "At this extract that scope holds " + fmtN(t.projects) + " projects, " + fmtN(t.flagged) + " of them flagged, carrying " + fmtN(t.exceptions) + " exceptions. "
    + "A day marked “same” in the log, drawn as a hollow point, re-recorded the previous day’s data rather than measuring new data. Rows are kept in this browser.";
}

/* Suggestions for the Copilot on this page: it answers from every data file. */
window.gpdSuggest = [{q:"How many projects where Strategic Bucket is CRQ?", icon:"sum"}, {q:"Total Capital Investment by Sponsor Organization", icon:"bars"},
  {q:"How many people are active?", icon:"list"}, {q:"Top 10 projects by Total Net Sales", icon:"list"}];

/* For the tests: every project with the rules it breaks, and the tracking totals. */
window.gpdDQ = () => ({
  projects: S.P.map(p => ({name:p.name, status:p.status, phase:p.phase, codes:p.ex.map(e => e.code), texts:p.ex.map(e => e.text)})),
  rules: RULES.map(r => ({code:r.code, sev:SEVS[r.sev], off:!!S.off[r.code]})),
  view: S.rows.length, filters: Object.assign({}, S.f), track: trackNow(), snaps: S.snaps.slice()
});

/* ---------- wiring ---------- */
function showTab(){
  const c = S.tab === "check";
  $("viewCheck").hidden = !c; $("viewTrack").hidden = c;
  $("tab_check").classList.toggle("on", c); $("tab_check").setAttribute("aria-selected", String(c));
  $("tab_track").classList.toggle("on", !c); $("tab_track").setAttribute("aria-selected", String(!c));
}
function setTab(t){ if (S.tab === t) return; S.tab = t; showTab(); if (S.P.length) refresh(); }
$("tab_check").onclick = () => setTab("check");
$("tab_track").onclick = () => setTab("track");
$("reloadBtn").onclick = () => reloadData();
$("notesBtn").onclick = () => { if (S.P.length) openNotes(); };
$("dlAllBtn").onclick = () => { if (S.P.length){ exportAll(); flash($("dlAllBtn"), '<svg class="xl" viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="14" height="14" rx="3" fill="#1D6F42"/></svg><span>Downloaded</span>'); } };
$("xlGridBtn").onclick = () => { if (S.P.length){ exportView(); flash($("xlGridBtn"), DL_ICON + "Downloaded"); } };
$("xlLogBtn").onclick = () => { exportLog(); flash($("xlLogBtn"), DL_ICON + "Downloaded"); };
function recordNow(btn){ if (!S.P.length) return; record(); setTab("track"); renderTrack(); renderFoot(); flash(btn, "<span>Recorded</span>"); }
$("snapTopBtn").onclick = () => recordNow($("snapTopBtn"));
$("snapBtn").onclick = () => recordNow($("snapBtn"));
$("hlBtn").onclick = () => { S.hl = !S.hl; $("hlBtn").setAttribute("aria-pressed", String(S.hl)); $("hlBtn").textContent = S.hl ? "Highlight errors" : "Highlighting off"; renderHlKey(); drawRows(false); };
$("finBtn").onclick = () => { S.fin = !S.fin; $("finBtn").setAttribute("aria-pressed", String(S.fin)); $("finBtn").textContent = S.fin ? "Financials on" : "Financials off"; renderHead(); drawRows(false); };
let qt; $("fQ").oninput = () => { clearTimeout(qt); qt = setTimeout(() => { S.q = $("fQ").value.trim().toLowerCase(); refresh(); }, 140); };
let nt; $("fNs").oninput = () => { clearTimeout(nt); nt = setTimeout(() => { const v = parseFloat($("fNs").value); S.ns = isFinite(v) && v > 0 ? v : 0; refresh(); }, 200); };
$("fScope").onchange = () => { S.scope = $("fScope").value; refresh(); };
$("resetBtn").onclick = () => {
  if (!S.P.length) return;
  S.f = defaults(); S.q = ""; S.ns = 0; S.scope = "all"; S.sort = "n"; S.dir = -1;
  $("fQ").value = ""; $("fNs").value = "0"; $("fScope").value = "all";
  renderHead(); refresh();
};

(function theme(){
  const root = document.documentElement, b = $("themeBtn");
  try{ const saved = localStorage.getItem("fbin_theme"); if (saved) root.setAttribute("data-theme", saved); }catch(e){}
  const isDark = () => { const t = root.getAttribute("data-theme"); return t === "dark" || (!t && matchMedia("(prefers-color-scheme:dark)").matches); };
  const label = () => { b.innerHTML = isDark()
    ? "<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"8\" cy=\"8\" r=\"2.8\"/><path d=\"M8 1.6v1.3M8 13.1v1.3M1.6 8h1.3M13.1 8h1.3M3.5 3.5l.9.9M11.6 11.6l.9.9M3.5 12.5l.9-.9M11.6 4.4l.9-.9\"/></svg><span>Light</span>"
    : "<svg class=\"i\" viewBox=\"0 0 16 16\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z\"/></svg><span>Dark</span>"; };
  label();
  b.onclick = () => { const next = isDark() ? "light" : "dark"; root.setAttribute("data-theme", next); try{ localStorage.setItem("fbin_theme", next); }catch(e){} label(); };
})();

(function boot(){
  S.snaps = lsGet(LS_SNAP) || [];
  reloadData();
  setInterval(reloadData, Math.max(5, GPD_CONFIG.reloadMinutes) * 60000);
})();
