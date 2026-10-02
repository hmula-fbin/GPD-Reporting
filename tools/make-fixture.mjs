#!/usr/bin/env node
/*
  Writes tests/fixtures/pipeline-fixture.xlsx: a SYNTHETIC workbook with the same layout as the
  real pipeline extract (header row a few rows down, same column names) but invented projects.
  Real company data never goes into git. Deterministic: same seed -> same file -> stable tests.

    node tools/make-fixture.mjs            (120 projects)
    node tools/make-fixture.mjs 300        (300 projects)
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "./lib/sheetjs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const N = Number(process.argv[2] || 120);
let seed = 20261001;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const money = (lo, hi) => Math.round(lo + rnd() * (hi - lo));

const HEADER = ["Index", "Include", "Comments/ Followup", "Project Name", "SG Project Type", "Project Bucket (NEW)", "Platform", "Owner",
  "Primary Mktg Product Mgr", "Project Status", "Sponsor Organization", "Brand", "Distribution Channel", "BU", "Business", "Market", "Phase",
  "Stage", "Start", "Finish", "Finish Year", "Target Execution Time (Months)", "Forecasted Execution Time (Months)", "Product Life",
  "Total NS (Life)", "Total NS (Annualized)", "Total CM (Life)", "Total CM (Annualized)", "Incremental NS (Life)", "Incremental NS (Annualized)",
  "Incremental CM (Life)", "Incremental CM  (Annualized)", "New CM%", "% Incremental NS", "Total Investment (OPEX+CAPEX)"];

const TYPES = [ // SG Project Type, bucket, platform, target months  (mirrors config/bucket-reference.json)
  ["Developer Custom Request.Off Platform", "Grow the Core", "Off", 12], ["Product Expansion/Refresh.Off Platform", "Grow the Core", "Off", 20],
  ["Product Expansion/Refresh.New Platform", "Grow the Core", "New", 20], ["Product Expansion/Refresh.On Platform", "Refresh & Sustain", "On", 12],
  ["New to FBIN.New Platform", "Create & Transform", "New", 20], ["Improvement.On Platform", "CI", "On", 12], ["Compliance.On Platform", "CRQ", "On", 12]];
const BUS = [["01 Water", ["01 01 Alpha Faucets", "01 02 Beta Bath"]], ["02 Outdoors", ["02 01 Gamma Doors", "02 02 Delta Decking"]],
  ["03 Security", ["03 01 Epsilon Locks"]]];
const BRANDS = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", null];
const MARKETS = ["Americas", "EMEA", "APAC", "CHECK"];
const STAGES = [["02 Plan Phase", "02 01 Discovery"], ["03 Active Phase", "03 01 Define"], ["03 Active Phase", "03 02 Converge"],
  ["03 Active Phase", "03 03 Develop"], ["03 Active Phase", "03 04 Validate"], ["04 Launch Phase", "04 01 Launch"]];
const STATUS = ["In Progress", "In Progress", "In Progress", "Roadmap", "Roadmap", "On Hold", "Complete"];
const OWNERS = ["Rivera, Ana", "Okafor, Ben", "Lindqvist, Chen", "Moreau, Dara", "Tanaka, Eli", "Novak, Fay", "Brennan, Gus", "Haddad, Hana"];
const WORDS = ["Aurora", "Basalt", "Cobalt", "Drift", "Ember", "Fjord", "Granite", "Harbor", "Indigo", "Juniper", "Kestrel", "Lumen", "Mesa", "Nimbus"];
const THINGS = ["Faucet Refresh", "Lock Platform", "Door Kit", "Cost Down", "Valve Redesign", "Smart Hub", "Packaging Update", "Supplier Shift"];

const aoa = [
  [null, null, null, "INCLUDE"], ["Synthetic test data - not real projects."], [], [null, null, null, "Legend:", "Missing in Master / lookup gap"],
  HEADER,
];
for (let i = 1; i <= N; i++) {
  const t = pick(TYPES), bu = pick(BUS), st = pick(STAGES), ci = t[1] === "CI" || t[1] === "CRQ";
  const start = new Date(2025, Math.floor(rnd() * 20), 1 + Math.floor(rnd() * 27));
  const tgt = t[3], fc = Math.round((tgt * (0.5 + rnd() * 2.2)) * 10) / 10;
  const finish = new Date(start.getFullYear(), start.getMonth() + Math.round(fc), start.getDate());
  const ns = ci ? 0 : (rnd() < 0.08 ? null : money(2e5, 2.5e7)), cm = ci ? money(5e4, 6e6) : (ns ? Math.round(ns * (0.2 + rnd() * 0.3)) : 0);
  const life = 1 + Math.floor(rnd() * 5);
  aoa.push([i, rnd() < 0.9 ? "INCLUDE" : "EXCLUDE", null, (6000 + i) + " " + pick(WORDS) + " " + pick(THINGS), t[0], t[1], t[2], pick(OWNERS),
    ci ? null : pick(OWNERS), pick(STATUS), "Sponsor." + bu[0].slice(3), pick(BRANDS), null, bu[0], rnd() < 0.15 ? null : pick(bu[1]), pick(MARKETS),
    st[0], st[1], start, finish, finish.getFullYear(), tgt, fc, life, ns === null ? null : ns * life, ns, cm * life, cm, ns ? ns * life : 0, ns ? Math.round(ns * 0.8) : 0,
    cm * life, Math.round(cm * 0.8), ns ? cm / ns : null, ns ? 0.8 : null, money(1e4, 2.5e6)]);
}
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), "PIPELINE");
const out = path.join(ROOT, "tests/fixtures/pipeline-fixture.xlsx");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellDates: true }));
console.log("wrote " + path.relative(ROOT, out) + " (" + N + " synthetic projects)");
