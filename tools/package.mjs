#!/usr/bin/env node
/*
  Manual-upload route (no PnP sign-in app needed):
  runs the tests, builds dist/<env>/ strictly, writes UPLOAD-STEPS.txt, and on Windows opens
  the folder and the SharePoint library so you can drag the two .aspx files across.

    node tools/package.mjs --env dev
    node tools/package.mjs --env prod        (release owner; main branch, clean, tagged)
    node tools/package.mjs --env dev --skip-tests
*/
import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const env = opt("env", "dev");
const sh = (c) => { try { return execSync(c, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const stop = (m) => { console.error("\nSTOPPED: " + m + "\n"); process.exit(1); };

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config", env + ".json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

if (env === "prod") {
  const branch = sh("git rev-parse --abbrev-ref HEAD"), dirty = sh("git status --porcelain"), tags = sh("git tag --points-at HEAD").split(/\s+/);
  const me = sh("git config user.email");
  if (cfg.releaseOwners && cfg.releaseOwners.length && !cfg.releaseOwners.includes(me)) stop("Only release owners package Prod (" + cfg.releaseOwners.join(", ") + "). You are '" + me + "'.");
  if (branch !== "main") stop("Prod pages come from the main branch. You are on '" + branch + "'. Run /approve-release first.");
  if (dirty) stop("You have uncommitted changes. Commit them (or ask Claude) first.");
  if (!tags.includes("v" + pkg.version)) stop("This commit is not tagged v" + pkg.version + ". Run /approve-release first.");
}

if (!args.includes("--skip-tests")) {
  console.log("== Running the tests (about a minute)...");
  try { execSync("npm test", { cwd: ROOT, stdio: "inherit" }); } catch { stop("Tests failed - nothing to upload. Ask Claude to fix them."); }
}
console.log("\n== Building " + cfg.label + " pages");
try { execSync("node build/build.mjs --strict --env " + env, { cwd: ROOT, stdio: "inherit" }); } catch { process.exit(1); }

const dist = path.join(ROOT, "dist", env);
const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8"));
const libUrl = cfg.tenantUrl.replace(/\/$/, "") + manifest.pagesUrl.replace(/\/$/, "");
const steps = [
  "GPD Portfolio Hub - upload to " + cfg.label + "  (v" + manifest.version + ", commit " + manifest.commit + ", built " + manifest.built + ")",
  "",
  "1. Make sure custom scripts are ON for this site today (SharePoint switches it off every 24 hours).",
  "   Ask your SharePoint admin, or check: if step 3 is refused or the page downloads instead of opening, it is off.",
  "2. Open the library:  " + libUrl,
  "3. Drag these two files from this folder into the library. Choose REPLACE when asked:",
  "     Home.aspx",
  "     Portfolio_Scorecard.aspx",
  "4. Open " + libUrl + "/Home.aspx and " + libUrl + "/Portfolio_Scorecard.aspx and check they load.",
  env === "prod" ? "5. Smoke test: press Refresh now on the Scorecard and ask one question. Then tell the team." :
                   "5. Send the two links to the requester to test.",
  "",
  "To undo: in the library, click ... next to a file > Version history > Restore the previous version.",
];
fs.writeFileSync(path.join(dist, "UPLOAD-STEPS.txt"), steps.join("\r\n") + "\r\n");
fs.appendFileSync(path.join(ROOT, "deploy", "deployments.log"),
  [new Date().toISOString(), env, manifest.version, manifest.commit, "packaged-for-manual-upload", sh("git config user.email") || "unknown"].join("\t") + "\n");

console.log("\n" + steps.join("\n"));
if (process.platform === "win32" && !args.includes("--no-open")) {
  spawn("explorer", [dist], { detached: true, stdio: "ignore" }).unref();
  spawn("cmd", ["/c", "start", "", libUrl], { detached: true, stdio: "ignore" }).unref();
  console.log("\n(Opened the folder and the SharePoint library for you.)");
} else console.log("\nFiles are in: " + dist);
