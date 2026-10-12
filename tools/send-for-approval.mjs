#!/usr/bin/env node
/*
  Send the tagged release for approval (release owner). Runs the tests, builds the Dev and Prod pages and puts
  them in the "GPD Releases" folder of your OneDrive. The Power Automate release flow (docs/PROD-APPROVAL-FLOW.md)
  then puts the release on Dev, sends the approver an Approve button by email and in Teams, and on Approve turns
  custom scripts on for Prod and uploads the pages there (adding missing ones, replacing the rest).

    node tools/send-for-approval.mjs
    node tools/send-for-approval.mjs --skip-tests
*/
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prodGateProblem, changesFor, buildRequest, stageRelease } from "./lib/release.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const sh = (c) => { try { return execSync(c, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const stop = (m) => { console.error("\nSTOPPED: " + m + "\n"); process.exit(1); };
const json = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), "utf8"));

const pkg = json("package.json"), prodCfg = json("config", "prod.json"), devCfg = json("config", "dev.json");
const me = sh("git config user.email");
const problem = prodGateProblem({ cfg: prodCfg, version: pkg.version, branch: sh("git rev-parse --abbrev-ref HEAD"),
  dirty: sh("git status --porcelain"), tags: sh("git tag --points-at HEAD").split(/\s+/), me });
if (problem) stop(problem);

const oneDrive = process.env.OneDriveCommercial || process.env.OneDrive;
if (!oneDrive || !fs.existsSync(oneDrive)) stop("Can't find your work OneDrive folder. Check that OneDrive is signed in and syncing.");
const dropName = "GPD Releases";                                  /* the folder the release flow watches */
const dropDir = path.join(oneDrive, dropName);

if (!args.includes("--skip-tests")) {
  console.log("== Running the tests (about a minute)...");
  try { execSync("npm test", { cwd: ROOT, stdio: "inherit" }); } catch { stop("Tests failed - nothing was sent. Ask Claude to fix them."); }
}
for (const env of ["dev", "prod"]) {
  console.log("\n== Building " + env);
  try { execSync("node build/build.mjs --strict --env " + env, { cwd: ROOT, stdio: "inherit" }); } catch { process.exit(1); }
}
const devManifest = json("dist", "dev", "manifest.json"), prodManifest = json("dist", "prod", "manifest.json");
if (devManifest.commit !== prodManifest.commit || /dirty/.test(prodManifest.commit) || prodManifest.version !== pkg.version)
  stop("The Dev and Prod builds don't match this tagged commit. Build again from a clean main.");

const now = new Date();
const id = "v" + pkg.version + "-" + prodManifest.commit + "-" + now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const request = buildRequest({
  id, version: pkg.version, commit: prodManifest.commit, submittedBy: me, submitted: now.toISOString(),
  changes: changesFor(fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8"), pkg.version),
  folder: "/" + dropName + "/" + id,
  dev: { cfg: devCfg, manifest: devManifest }, prod: { cfg: prodCfg, manifest: prodManifest },
});
stageRelease({ dropDir, request, dists: { dev: path.join(ROOT, "dist", "dev"), prod: path.join(ROOT, "dist", "prod") } });
fs.appendFileSync(path.join(ROOT, "deploy", "deployments.log"),
  [now.toISOString(), "prod", pkg.version, prodManifest.commit, "sent-for-approval", me || "unknown"].join("\t") + "\n");

console.log("\n== Sent v" + pkg.version + " for approval (" + id + ")");
console.log("  1. Within about 5 minutes the release flow puts it on Dev:");
for (const f of request.dev.files) console.log("       " + f.url);
console.log("  2. Then it sends you (" + me + ") an Approve button, by email and in Teams.");
console.log("  3. On Approve it turns custom scripts on for Prod, uploads the pages and emails you when it's live.");
console.log("\n  Nothing within 15 minutes? Check the flow's run history (docs/PROD-APPROVAL-FLOW.md, \"If something goes wrong\").");
console.log("  Staged in: " + dropDir);
