/* Preparing a Prod release for the release flow (docs/PROD-APPROVAL-FLOW.md): the checks, the changelog lines for
   a version, and staging the pages in OneDrive's GPD Releases, a shortcut to Prod Release Files/GPD Releases. */
import fs from "node:fs";
import path from "node:path";

/* Why this commit can't go to Prod yet, or "" when it can. Anyone on the team may release. */
export function prodGateProblem({ version, branch, dirty, tags }) {
  if (branch !== "main") return "Prod pages come from the main branch. You are on '" + branch + "'. Run /approve-release first.";
  if (dirty) return "You have uncommitted changes. Commit them (or ask Claude) first.";
  if (!tags.includes("v" + version)) return "This commit is not tagged v" + version + ". Run /approve-release first.";
  return "";
}

/* The bullet lines under "## v<version>" in CHANGELOG.md, or "" if there is no entry. */
export function changesFor(changelog, version) {
  const out = [];
  let on = false;
  for (const line of changelog.split(/\r?\n/)) {
    if (line.startsWith("## ")) { if (on) break; on = line === "## v" + version || line.startsWith("## v" + version + " "); continue; }
    if (on && line.trim()) out.push(line.trim());
  }
  return out.join("\n");
}

/* The OneDrive shortcut to Prod Release Files/GPD Releases. OneDrive names a shortcut "<site> - <folder>"
   ("GPDReporting - GPD Releases"); someone may have renamed it to plain "GPD Releases". Returns its path, or "". */
export function findReleaseFolder(oneDrive) {
  let names = [];
  try { names = fs.readdirSync(oneDrive).filter((n) => { try { return fs.statSync(path.join(oneDrive, n)).isDirectory(); } catch { return false; } }); } catch { /* no OneDrive */ }
  const hit = names.find((n) => / - GPD Releases$/.test(n)) || names.find((n) => n === "GPD Releases");
  return hit ? path.join(oneDrive, hit) : "";
}

/* A release id that is safe in folder names and URLs, e.g. v1.8.0-abcd1234-20261012-1530. A rehearsal id starts with
   "rehearsal-" instead of "v", and the release flow's trigger only accepts ids starting with "v", so a rehearsal can
   never start a release. */
export const releaseId = (version, commit, when, { rehearsal = false } = {}) =>
  (rehearsal ? "rehearsal-" : "") + "v" + version + "-" + commit + "-" + when.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 13);

/* Copies the pages into <root>/prod/<id>/ and <root>/qa/<id>/ as <page>.aspx.txt. The .txt lets OneDrive and SharePoint
   take them while custom scripts are off; the release flow renames them to .aspx. The <id> folder name tells the flow
   where to look. Returns what Claude needs to check they arrived and start the flow. */
export function stageRelease({ root, id, version, commit, changes, prodDist, qaDist }) {
  const side = (env, dist) => {
    const dir = path.join(root, env, id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const files = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8")).files.map((f) => {
      fs.copyFileSync(path.join(dist, f.name), path.join(dir, f.name + ".txt"));
      return { name: f.name, staged: f.name + ".txt", bytes: f.bytes };
    });
    return { folder: env + "/" + id, files, bytes: files.reduce((n, f) => n + f.bytes, 0) };
  };
  return { id, title: "v" + version, version, commit, whatChanged: changes || "v" + version, prod: side("prod", prodDist), qa: side("qa", qaDist) };
}
