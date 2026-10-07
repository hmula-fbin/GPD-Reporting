#!/usr/bin/env node
/*
  Writes the SYNTHETIC files (CSV, like the real ones) the Data Quality page reads in the preview and the tests:
    tests/fixtures/dq-project-fixture.csv     same columns as the real project extract, invented projects
    tests/fixtures/dq-resource-fixture.csv    same columns as the real resource extract, invented people
    tests/fixtures/dq-project-prev-fixture.csv   the previous day's snapshot of the project file (served as the nightly copies)
  Real company data never goes into git. Deterministic: same file every run, so the tests are stable.

  Every "DQ <code>" project is built to break exactly the rules listed in EXPECT (tests/dq.spec.mjs
  checks the page finds those and nothing else on them). Everything else is clean filler.

    node tools/make-dq-fixture.mjs
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toCsv } from "./lib/csv.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PROJECT_HEADER = ("Total Investment|ProjectID|ProjectName|ProjectDescription|ProjectAuthorName|EnterpriseProjectTypeUID|ProjectStartDate|ProjectFinishDate|ProjectStatusDate|ProjectManagerName|ProjectOwnerName|ProjectCount|Project Departments|Brand|CER Number|Status Highlight Commentary|Stage Gate Project Type|Customer|Stage Gate Process|Critical Subsystem Level|SAP Role Sync Complete|SAP Material Last Update|Payback|IRR|NPV|Est Operating Margin RONTA Pct|Est Service Kit Count|Est SKU Count|Executing Organization|Room|PD Expense IO Complete|Launch Event|Launch Date|PD Expense IO Number|Original Plan Ship Year|Product Category|Project Number|Project Scope Statement|Project Status|Project Sub Type|Baseline Exceptions|CS Exceptions|Gate Exceptions|Consumer Differentiation|Product Style|Supply Chain Impact|Incremental Operating Income|Project Management Flag|NPSC Status Highlight Commentary|Transition|People Cost Allocation|Overhead Cost Allocation|Strategic Bucket|Project Life|Incremental Net Sales|Program|1. Re-ignite share gains in the U.S. and Canada|2. Operating Transformation|3. China Market Model|Strategic Alignment Score Total|Total Net Sales|Total OI|Annual Cost Savings|Capital Investment|CER Investment|Incremental Annual Net Sales|Incremental Units|Marcom Displays Investment|MarCom Investment|New Product Net Sales|Product Development Investment|Project Income Stream Years|Ranking Factor|ROS Pct|Total Cost Savings|Strategic Fit and Importance|Product and Competitive Advantage|Market Awareness|Synergies and Core Competencies|Technical Feasibility|Financial Reward vs. Financial Risk|Incremental Contribution Margin Dollars|Incremental Annual Contribution Margin Dollars|Contribution Margin Dollars_New|Contribution Margin Dollars_Cann|Percent Contribution Margin_New|Percent Contribution Margin_Cann|Plan Group|Strategic Fit|Financial Significance|Financial Productivity|DCF Start Point|Resource Plan Profile|Resource Plan URL|SKU Data Start Point|Segment-SFNC|Segment-NSF|Segment-RR|Primary Mktg Product Mgr|Sponsor Organization|Platform Manager|Business Function|Business Process|Project Complexity|Project Effort|Strategic Initiative_OPS|Process Improvement Type|VIA Alignment|Forecast Placeholder|CER Number Secondary|PD Cost Center by Sponsor Org with Desc|PD Expense IO Number Secondary|Material Planning Status Flag|Material Planning Status Highlight Commentary|Product Program|Strategic Objective|Project Owner|DC First Ship 1 Date|DC First Ship 2 Date|ProjectType|ProjectOwnerResourceUID|StageName|PhaseName|CurrentStage|CurrentPhase|ProjectUID").split("|");

const RESOURCE_HEADER = ["ResourceUID", "ResourceName", "ResourceEmailAddress", "ResourceNTAccount", "ResourceIsActive", "ResourceIsGeneric",
  "ResourceCount", "Resource Departments", "Resource Sub Organization", "Resource Primary Role", "Org Resource Pool", "Resource Organization",
  "Org Sub Resource Pool", "Resource Location", "Allocation Threshold", "Created", "Modified", "Created_by", "Modified_by"];

/* invented people: [uid, name as stored, active] */
const PEOPLE = [
  ["R-001", "Rivera, Ana", true], ["R-002", "Okafor, Ben", true], ["R-003", "Lindqvist; Chen", true], ["R-004", "Dara Moreau", true],
  ["R-005", "Tanaka, Eli", true], ["R-006", "Novak, Fay", false], ["R-007", "Brennan, Gus", false], ["R-008", "Haddad, Hana", true],
];

/* Which rules each named test project must raise - exactly these, no more. */
export const EXPECT = {
  "DQ U1 Reconciliation": ["U1"], "DQ U2 Percent mismatch": ["U2"], "DQ U3 Percent bounds": ["U3"], "DQ U4 Annualization": ["U4"],
  "DQ U5 Negative margin": ["U5"], "DQ U6 No product manager": ["U6"], "DQ U7 Placeholder sales": ["U7"], "DQ U8 Missing margin": ["U8"],
  "DQ IC ID No savings": ["IC", "ID"], "DQ IA Sales and savings": ["IA"], "DQ IE Ratio outlier": ["IE"],
  "DQ CA No sales": ["CA"], "DQ CB Savings": ["CB"], "DQ CC Incremental sales": ["CC"],
  "DQ ND No revenue": ["ND"], "DQ NI Incremental mismatch": ["NI"], "DQ BR No brand": ["BR"],
  "DQ OW Owner left": ["OW"], "DQ PM Manager left": ["PM"], "DQ OU Manager unknown": ["OU"],
  "DQ Clean name formats": [], "DQ U8 skip Improvement type": [], "DQ IE Blank margin": ["IE"],
  "DQ PM Manager left suffix": ["PM"],
};

/* Clean starting points, one per Strategic Bucket. Money is lifetime; percentages are whole numbers. */
const BASE = {
  incr: { type: "Product Expansion/Refresh.On Platform", bucket: "Incremental", ns: 1e6, nsInc: 8e5, cs: 0, cmNew: 4e5, cmInc: 3e5, cmCann: 1e5, cmAnn: 6e4, pctNew: 40, pctCann: 25, life: 5 },
  improve: { type: "Improvement.On Platform", bucket: "Improve", ns: 0, nsInc: 0, cs: 5e5, cmNew: 5e5, cmInc: 5e5, cmCann: 0, cmAnn: 1e5, pctNew: null, pctCann: null, life: 5 },
  crq: { type: "Compliance.On Platform", bucket: "CRQ", ns: 5e4, nsInc: 0, cs: 0, cmNew: 1e4, cmInc: 1e4, cmCann: 0, cmAnn: 2e3, pctNew: 20, pctCann: 0, life: 5 },
};
const TESTS = [
  ["DQ U1 Reconciliation", "incr", { cmCann: 1.5e5 }],
  ["DQ U2 Percent mismatch", "incr", { pctNew: 50 }],
  ["DQ U3 Percent bounds", "incr", { pctCann: 120 }],
  ["DQ U4 Annualization", "incr", { cmAnn: 9e4 }],
  ["DQ U5 Negative margin", "incr", { cmNew: -1e5, cmInc: -2e5, cmCann: 1e5, cmAnn: -4e4, pctNew: null }],
  ["DQ U6 No product manager", "incr", { ns: 1.5e6, nsInc: 1.2e6, cmNew: 6e5, cmInc: 5e5, cmCann: 1e5, cmAnn: 1e5, pm: null }],
  ["DQ U7 Placeholder sales", "incr", { ns: 150 }],
  ["DQ U8 Missing margin", "incr", { ns: 6e5, cmNew: null, cmInc: null, cmCann: null, cmAnn: null, pctNew: null }],
  ["DQ IC ID No savings", "improve", { cs: null, cmNew: 2e5, cmInc: 2e5, cmAnn: 4e4 }],
  ["DQ IA Sales and savings", "improve", { ns: 300 }],
  ["DQ IE Ratio outlier", "improve", { cs: 1e5, cmNew: 5e5, cmInc: 5e5, cmAnn: 1e5 }],
  ["DQ CA No sales", "crq", { ns: 0, pctNew: null }],
  ["DQ CB Savings", "crq", { cs: 5000 }],
  ["DQ CC Incremental sales", "crq", { nsInc: 2e4 }],
  ["DQ ND No revenue", "incr", { ns: 0, nsInc: 0, pctNew: null }],
  ["DQ NI Incremental mismatch", "incr", { cmInc: 4e5, cmCann: 0, cmAnn: 8e4, pctCann: 0 }],
  ["DQ BR No brand", "incr", { brand: null }],
  ["DQ OW Owner left", "incr", { owner: 6 }],
  ["DQ PM Manager left", "incr", { pm: "Brennan, Gus" }],
  ["DQ OU Manager unknown", "incr", { pm: "Nobody, Zed" }],
  ["DQ Clean name formats", "incr", { pm: "Chen Lindqvist", owner: 4 }],
  ["DQ U8 skip Improvement type", "incr", { type: "Improvement.On Platform", ns: 6e5, cmNew: null, cmInc: null, cmCann: null, cmAnn: null, pctNew: null }],
  ["DQ IE Blank margin", "improve", { cmNew: null, cmInc: null, cmAnn: null }],
  ["DQ PM Manager left suffix", "incr", { pm: "Novak, Fay - Inactive" }],
];

let seed = 20261005;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const SPONSORS = ["Sponsor.Water Bath", "Sponsor.Water Kitchen", "Sponsor.Outdoors", "Sponsor.Security"];
const BRANDS = ["Alpha", "Beta", "Gamma", "Delta"];
const STATUS = ["In Progress", "In Progress", "In Progress", "On Hold", "Completed"];
const PHASES = [["02 Plan Phase", "02 01 Discovery"], ["03 Active Phase", "03 02 Converge"], ["03 Active Phase", "03 03 Develop"], ["04 Launch Phase", "04 01 Launch"]];
const PMS = ["Rivera, Ana", "Okafor, Ben", "Tanaka, Eli", "Haddad, Hana", "Ana Rivera"];

const rows = [PROJECT_HEADER];
const col = (n) => { const i = PROJECT_HEADER.indexOf(n); if (i < 0) throw new Error("no column " + n); return i; };
let id = 7000;
function addProject(name, kind, over, live, into = rows) {
  const b = Object.assign({}, BASE[kind], over), r = new Array(PROJECT_HEADER.length).fill(null);
  const ph = live ? PHASES[1] : pick(PHASES), owner = PEOPLE[b.owner === undefined ? Math.floor(rnd() * 5) : b.owner];
  const set = (n, v) => { r[col(n)] = v === undefined ? null : v; };
  id++;
  set("ProjectID", id); set("ProjectName", id + " " + name); set("Stage Gate Project Type", b.type);   /* ProjectType stays blank, as in the real extract */ set("Strategic Bucket", b.bucket);
  set("Project Status", live ? "In Progress" : pick(STATUS)); set("PhaseName", ph[0]); set("CurrentPhase", ph[0]);
  set("StageName", ph[1]); set("CurrentStage", ph[1]); set("Sponsor Organization", pick(SPONSORS));
  set("Brand", "brand" in over ? over.brand : pick(BRANDS));
  set("ProjectOwnerName", owner[1]); set("ProjectOwnerResourceUID", owner[0]);
  set("Primary Mktg Product Mgr", "pm" in over ? over.pm : pick(PMS));
  set("Total Net Sales", b.ns); set("Incremental Net Sales", b.nsInc); set("Total Cost Savings", b.cs);
  set("Contribution Margin Dollars_New", b.cmNew); set("Incremental Contribution Margin Dollars", b.cmInc);
  set("Contribution Margin Dollars_Cann", b.cmCann); set("Incremental Annual Contribution Margin Dollars", b.cmAnn);
  set("Percent Contribution Margin_New", b.pctNew); set("Percent Contribution Margin_Cann", b.pctCann); set("Project Life", b.life);
  set("Total Investment", Math.round(5e4 + rnd() * 2e6)); set("ProjectUID", "P-" + id);
  set("DC First Ship 2 Date", new Date(2027, id % 12, 5)); set("DC First Ship 1 Date", new Date(2026, id % 12, 20));
  set("NPV", id * 1000); set("Project Management Flag", ["Green", "Yellow", "Red"][id % 3]);
  into.push(r);
}
for (const [name, kind, over] of TESTS) addProject(name, kind, over, true);
/* clean filler; Improve projects get savings-to-margin ratios close together so only the outlier stands out */
const RATIOS = [0.9, 1.0, 1.05, 1.1, 1.2];
for (let i = 0; i < 70; i++) {
  const kind = pick(["incr", "incr", "incr", "improve", "crq"]), k = 0.5 + rnd() * 3;
  let over = {};
  if (kind === "incr") over = { ns: 1e6 * k, nsInc: 8e5 * k, cmNew: 4e5 * k, cmInc: 3e5 * k, cmCann: 1e5 * k, cmAnn: 6e4 * k };
  if (kind === "improve") { const r = RATIOS[i % RATIOS.length], cs = 2e5 * k; over = { cs, cmNew: cs * r, cmInc: cs * r, cmAnn: cs * r / 5 }; }
  addProject(pick(["Aurora", "Basalt", "Cobalt", "Drift", "Ember", "Fjord", "Granite"]) + " " + pick(["Faucet Refresh", "Lock Platform", "Cost Down", "Valve Redesign", "Packaging Update"]), kind, over, i % 3 === 0);
}

/* The previous day's snapshot: the same projects with known differences, so the comparison has something to find.
   Compared with it, the latest file has: U5 new on "DQ U5 Negative margin", BR fixed on "DQ Clean name formats",
   the last filler project added, and "DQ Retired project" removed. */
const prevRows = rows.slice(0, -1).map((r) => r.slice());
const prevOf = (name) => prevRows.find((r) => String(r[col("ProjectName")]).endsWith(" " + name));
Object.assign(prevOf("DQ U5 Negative margin"), { [col("Contribution Margin Dollars_New")]: 4e5, [col("Incremental Contribution Margin Dollars")]: 3e5,
  [col("Contribution Margin Dollars_Cann")]: 1e5, [col("Incremental Annual Contribution Margin Dollars")]: 6e4 });
prevOf("DQ Clean name formats")[col("Brand")] = null;
addProject("DQ Retired project", "incr", {}, true, prevRows);

const people = [RESOURCE_HEADER].concat(PEOPLE.map((p) => {
  const r = new Array(RESOURCE_HEADER.length).fill(null);
  r[0] = p[0]; r[1] = p[1]; r[4] = p[2]; r[5] = false; r[6] = 1;
  return r;
}));

function write(file, aoa) {
  const out = path.join(ROOT, "tests/fixtures", file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, toCsv(aoa));
  console.log("wrote " + path.relative(ROOT, out) + " (" + (aoa.length - 1) + " synthetic rows)");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  write("dq-project-fixture.csv", rows);
  write("dq-resource-fixture.csv", people);
  write("dq-project-prev-fixture.csv", prevRows);
}
