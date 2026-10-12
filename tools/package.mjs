#!/usr/bin/env node
/*
  Builds the pages for upload (no PnP sign-in app needed). Runs the tests and builds strictly.
  - dev: writes UPLOAD-STEPS.txt and opens dist/dev/ and the Dev library so you can drag the pages across.
  - prod: anyone on the team, from a clean, tagged main. Builds the QA and Prod pages and stages them in OneDrive
    GPD Releases/prod/<id> and GPD Releases/qa/<id> (as .aspx.txt). That folder is a shortcut to Prod Release Files/
    GPD Releases, so OneDrive uploads them to the Prod site. Writes dist/release.json; /package-prod then checks they
    arrived and starts the release flow (docs/PROD-APPROVAL-FLOW.md).

    node tools/package.mjs --env dev
    node tools/package.mjs --env prod
    node tools/package.mjs --env prod --rehearsal   (any branch: rehearses the hand-off; the flow never starts on it)
    node tools/package.mjs --env dev --skip-tests
*/
import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prodGateProblem, changesFor, findReleaseFolder, releaseId, stageRelease } from "./lib/release.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const env = opt("env", "dev");
const sh = (c) => { try { return execSync(c, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const stop = (m) => { console.error("\nSTOPPED: " + m + "\n"); process.exit(1); };
const json = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), "utf8"));
const build = (e) => { try { execSync("node build/build.mjs --strict --env " + e, { cwd: ROOT, stdio: "inherit" }); } catch { process.exit(1); } };
const open = (folder, url) => {
  if (process.platform !== "win32" || args.includes("--no-open")) return console.log("\nFiles are in: " + folder);
  spawn("explorer", [folder], { detached: true, stdio: "ignore" }).unref();
  spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
  console.log("\n(Opened the folder and the SharePoint library for you.)");
};
const log = (manifest, what) => fs.appendFileSync(path.join(ROOT, "deploy", "deployments.log"),
  [new Date().toISOString(), env, manifest.version, manifest.commit, what, sh("git config user.email") || "unknown"].join("\t") + "\n");

const cfg = json("config", env + ".json");
const pkg = json("package.json");
const rehearsal = env === "prod" && args.includes("--rehearsal");   /* stages from any branch; the flow never starts on it */

if (env === "prod" && !rehearsal) {
  const problem = prodGateProblem({ version: pkg.version, branch: sh("git rev-parse --abbrev-ref HEAD"),
    dirty: sh("git status --porcelain"), tags: sh("git tag --points-at HEAD").split(/\s+/) });
  if (problem) stop(problem);
}

if (!args.includes("--skip-tests")) {
  console.log("== Running the tests (a few minutes)...");
  try { execSync("npm test", { cwd: ROOT, stdio: "inherit" }); } catch { stop("Tests failed - nothing to upload. Ask Claude to fix them."); }
}

if (env === "prod") {
  const oneDrive = process.env.OneDriveCommercial || process.env.OneDrive;
  if (!oneDrive || !fs.existsSync(oneDrive)) stop("Can't find your work OneDrive folder. Check that OneDrive is signed in and syncing.");
  const qa = json("config", "test.json");
  console.log("\n== Building the " + qa.label + " and Prod pages");
  build("test");
  build("prod");
  const manifest = json("dist", "prod", "manifest.json");
  const root = findReleaseFolder(oneDrive);                 /* the shortcut to Prod Release Files/GPD Releases */
  if (!root) stop("There's no GPD Releases shortcut in your OneDrive. Add it once: open Prod Release Files on the Prod site,\n"
    + "         select the GPD Releases folder, then 'Add shortcut to My files' (docs/PROD-APPROVAL-FLOW.md, Before you start).");
  const request = stageRelease({
    root, id: releaseId(pkg.version, manifest.commit, new Date(), { rehearsal }), version: pkg.version, commit: manifest.commit,
    changes: changesFor(fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8"), pkg.version),
    prodDist: path.join(ROOT, "dist", "prod"), qaDist: path.join(ROOT, "dist", "test"),
  });
  if (rehearsal) request.title = "Rehearsal " + request.title;
  fs.writeFileSync(path.join(ROOT, "dist", "release.json"), JSON.stringify(request, null, 2) + "\n");
  log(manifest, (rehearsal ? "staged-for-rehearsal:" : "staged-for-release:") + request.id);
  console.log("\n== Staged " + request.title + " in GPD Releases (release " + request.id + "); OneDrive is uploading it to Prod Release Files");
  console.log("  prod/" + request.id + ": " + request.prod.files.map((f) => f.staged).join(", "));
  console.log("  qa/" + request.id + ":   " + request.qa.files.map((f) => f.staged).join(", "));
  console.log("\n  Next (Claude does this in /package-prod): check the files arrived, then add " + request.title + " to the GPD Releases list.");
  console.log(rehearsal ? "  This is a rehearsal: the release flow ignores it." : "  That starts the release flow. Details: dist/release.json");
} else {
  console.log("\n== Building " + cfg.label + " pages");
  build(env);
  const dist = path.join(ROOT, "dist", env);
  const manifest = json("dist", env, "manifest.json");
  const libUrl = cfg.tenantUrl.replace(/\/$/, "") + manifest.pagesUrl.replace(/\/$/, "");
  const steps = [
    "GPD Portfolio Hub - upload to " + cfg.label + "  (v" + manifest.version + ", commit " + manifest.commit + ", built " + manifest.built + ")",
    "",
    "1. Make sure custom scripts are ON for this site today (SharePoint switches it off every 24 hours).",
    "   Ask your SharePoint admin, or check: if step 3 is refused or the page downloads instead of opening, it is off.",
    "2. Open the library:  " + libUrl,
    "3. Drag these " + manifest.files.length + " files from this folder into the library. Choose REPLACE when asked:",
    ...manifest.files.map((f) => "     " + f.name),
    "4. Open each page and check it loads:",
    ...manifest.files.map((f) => "     " + libUrl + "/" + f.name),
    "5. Send the links to the requester to test.",
    "",
    "To undo: in the library, click ... next to a file > Version history > Restore the previous version.",
  ];
  fs.writeFileSync(path.join(dist, "UPLOAD-STEPS.txt"), steps.join("\r\n") + "\r\n");
  log(manifest, "packaged-for-manual-upload");
  console.log("\n" + steps.join("\n"));
  open(dist, libUrl);
}
