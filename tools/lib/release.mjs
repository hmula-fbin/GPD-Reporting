/* Sending a release for approval: the Prod gates, the changelog lines for a version, and the request file the
   Power Automate release flow reads (docs/PROD-APPROVAL-FLOW.md). The flow uploads what this request lists, so
   everything it needs (site, upload address, sizes, the approval and email texts) is worked out here, where the
   tests can check it, instead of in hand-typed flow expressions. */
import fs from "node:fs";
import path from "node:path";

const TITLES = { "Home.aspx": "Home", "Portfolio_Scorecard.aspx": "Portfolio Scorecard", "Data_Quality.aspx": "Data Quality" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* Why this commit can't go to Prod yet, or "" when it can. */
export function prodGateProblem({ cfg, version, branch, dirty, tags, me }) {
  if (cfg.releaseOwners && cfg.releaseOwners.length && !cfg.releaseOwners.includes(me))
    return "Only release owners can release to Prod (" + cfg.releaseOwners.join(", ") + "). You are '" + me + "'.";
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

/* One environment's half of the request: where its pages go and where the flow finds them in OneDrive. */
function side(env, { cfg, manifest }, folder) {
  const base = cfg.tenantUrl.replace(/\/$/, "");
  const lib = manifest.pagesUrl.replace(/\/$/, "");                  /* /sites/X/Report%20Pages */
  return {
    label: cfg.label,
    siteUrl: base + cfg.sitePath,
    stamp: manifest.version + " " + manifest.commit + " " + manifest.env,
    files: manifest.files.map((f) => ({
      name: f.name,
      title: TITLES[f.name] || f.name,
      bytes: f.bytes,
      source: folder + "/" + env + "/" + f.name + ".txt",
      uploadUri: "_api/web/GetFolderByServerRelativeUrl('" + lib + "')/Files/add(url='" + f.name + "',overwrite=true)",
      url: base + lib + "/" + f.name,
    })),
  };
}

/* The request file. `folder` is the OneDrive path the flow reads the pages from, e.g. "/GPD Releases/v1.8.0-...".
   The Approve button and the emails go to the release owner who sent it (submittedBy). */
export function buildRequest({ id, version, commit, submittedBy, submitted, changes, folder, dev, prod }) {
  const d = side("dev", dev, folder), p = side("prod", prod, folder);
  const app = "GPD Portfolio Hub v" + version;
  const links = (s) => s.files.map((f) => '<li><a href="' + esc(f.url) + '">' + esc(f.title) + "</a></li>").join("");
  const bullets = changes ? "<ul>" + changes.split("\n").map((l) => "<li>" + esc(l.replace(/^[-*]\s*/, "")) + "</li>").join("") + "</ul>" : "";
  return {
    id, app: "GPD Portfolio Hub", version, commit, submittedBy, submitted,
    approvers: submittedBy,
    notify: submittedBy,
    approvalTitle: "Release " + app + " to Prod",
    approvalDetails: [
      app + " is on the Dev site now. Have a look, then choose **Approve** to publish it to Prod, or **Reject** with a comment.",
      "",
      "**What changed**",
      changes || "- (no changelog entry)",
      "",
      "**Open it on Dev**",
      ...d.files.map((f) => "- [" + f.title + "](" + f.url + ")"),
    ].join("\n"),
    devHomeUrl: d.files[0].url,
    doneSubject: app + " is live on Prod",
    doneHtml: "<p>" + esc(app) + " is live on Prod.</p><ul>" + links(p) + "</ul>" + bullets
      + "<p>To undo: in the library, select ... next to a page, then Version history, then Restore the previous version.</p>",
    rejectedSubject: app + " was not approved",
    rejectedHtml: "<p>" + esc(app) + " was rejected, so Prod was not changed. It is still on Dev.</p>",
    failedSubject: app + " release stopped",
    failedHtml: "<p>The release flow for " + esc(app) + " stopped at a step that failed. Nothing after that step ran.</p>"
      + "<p>Open the flow's run history in Power Automate to see which step, then see \"If something goes wrong\" in docs/PROD-APPROVAL-FLOW.md.</p>",
    dev: d,
    prod: p,
  };
}

/* Copies the pages into <dropDir>/<id>/<env>/<page>.txt, then writes <dropDir>/<id>.json LAST: the json is what
   starts the flow, so the pages are already on their way to OneDrive when it does. (.txt because OneDrive refuses
   .aspx files.) Returns the json path. */
export function stageRelease({ dropDir, request, dists }) {
  for (const env of ["prod", "dev"]) {
    const dir = path.join(dropDir, request.id, env);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of request[env].files) fs.copyFileSync(path.join(dists[env], f.name), path.join(dir, f.name + ".txt"));
  }
  const file = path.join(dropDir, request.id + ".json");
  fs.writeFileSync(file, JSON.stringify(request, null, 2) + "\n");
  return file;
}
