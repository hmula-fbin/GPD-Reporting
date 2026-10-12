#!/usr/bin/env node
/*
  Builds the Power Automate import packages for the release flows into dist/flows/:
    GPD - Approval test.zip     sends a TEST approval to the Approvers list, nothing else
    GPD - Custom scripts test.zip   switches custom scripts on for QA and Prod (admin connection), checks, emails you
    GPD - Daily custom scripts.zip  every day at 6 AM Eastern, keeps custom scripts on for the sites in its Sites step
    GPD - Release to Prod.zip   the release flow (docs/PROD-APPROVAL-FLOW.md)
  Import each one: https://make.powerautomate.com > My flows > Import > Import Package (Legacy).

    node tools/make-flow-packages.mjs
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONNECTIONS, approvalTestFlow, customScriptsTestFlow, dailyCustomScriptsFlow, releaseFlow } from "./lib/release-flows.mjs";
import { connectionRefs, flowPackage } from "./lib/flow-package.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(ROOT, "dist", "flows");
fs.mkdirSync(out, { recursive: true });

for (const flow of [approvalTestFlow(), customScriptsTestFlow(), dailyCustomScriptsFlow(), releaseFlow()]) {
  const file = path.join(out, flow.displayName + ".zip");
  fs.writeFileSync(file, flowPackage(flow, CONNECTIONS));
  console.log("built " + path.relative(ROOT, file));
  console.log("  connections to choose when importing: " + connectionRefs(flow.definition).map((r) => CONNECTIONS[r].label).join("; "));
}
console.log("\nImport: https://make.powerautomate.com > My flows > Import > Import Package (Legacy). Steps: docs/PROD-APPROVAL-FLOW.md");
