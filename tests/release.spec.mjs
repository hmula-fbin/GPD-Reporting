// Sending a release for approval: the Prod gates, the changelog lines, and the request file the release flow reads.
// Plain Node checks (no browser), so they run once, in the desktop project.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { prodGateProblem, approverProblem, changesFor, buildRequest, stageRelease } from "../tools/lib/release.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (...p) => JSON.parse(fs.readFileSync(path.join(ROOT, ...p), "utf8"));
const prodCfg = json("config", "prod.json"), devCfg = json("config", "dev.json");
const devManifest = json("dist", "dev", "manifest.json"), prodManifest = json("dist", "prod", "manifest.json");

const request = (over = {}) => buildRequest({
  id: "v9.9.9-abcd1234-20261012-153000", version: "9.9.9", commit: "abcd1234", submittedBy: "owner@moen.com",
  submitted: "2026-10-12T15:30:00.000Z", approvers: ["approver@moen.com"], changes: "- Scorecard: one thing.\n- Home: <another> & more.",
  folder: "/GPD Releases/v9.9.9-abcd1234-20261012-153000",
  dev: { cfg: devCfg, manifest: devManifest }, prod: { cfg: prodCfg, manifest: prodManifest }, ...over,
});

test.describe("Send for approval", () => {
  test.beforeEach(() => test.skip(test.info().project.name !== "desktop-light", "Node-only checks run once"));

  test("Prod gates: release owner, main, committed, tagged", () => {
    const ok = { cfg: { releaseOwners: ["owner@moen.com"] }, version: "1.2.3", branch: "main", dirty: "", tags: ["v1.2.3"], me: "owner@moen.com" };
    expect(prodGateProblem(ok)).toBe("");
    expect(prodGateProblem({ ...ok, me: "someone@moen.com" })).toMatch(/release owners/);
    expect(prodGateProblem({ ...ok, branch: "change/x" })).toMatch(/main branch/);
    expect(prodGateProblem({ ...ok, dirty: " M src/x.js" })).toMatch(/uncommitted/);
    expect(prodGateProblem({ ...ok, tags: ["v1.2.2"] })).toMatch(/not tagged v1\.2\.3/);
  });

  test("refuses to send until a real approver address is set", () => {
    expect(approverProblem({})).toMatch(/releaseApprovers/);
    expect(approverProblem({ releaseApprovers: ["CHANGE-ME@moen.com"] })).toMatch(/releaseApprovers/);
    expect(approverProblem({ releaseApprovers: ["not an address"] })).toMatch(/releaseApprovers/);
    expect(approverProblem({ releaseApprovers: ["approver@moen.com"] })).toBe("");
  });

  test("takes the changelog lines of exactly this version", () => {
    const log = "# Changelog\n\n## v1.7.10 - 2026-10-10\n- later\n\n## v1.7.1 - 2026-10-09\n- first\n- second\n\n## v1.7.0 - 2026-10-08\n- older\n";
    expect(changesFor(log, "1.7.1")).toBe("- first\n- second");
    expect(changesFor(log, "1.7.10")).toBe("- later");
    expect(changesFor(log, "2.0.0")).toBe("");
  });

  test("request lists every built page with its upload address, size and OneDrive source", () => {
    const r = request();
    for (const [env, cfg, man] of [["dev", devCfg, devManifest], ["prod", prodCfg, prodManifest]]) {
      expect(r[env].siteUrl).toBe(cfg.tenantUrl + cfg.sitePath);
      expect(r[env].files.map((f) => f.name)).toEqual(man.files.map((f) => f.name));
      expect(r[env].files.map((f) => f.bytes)).toEqual(man.files.map((f) => f.bytes));
      expect(r[env].stamp).toBe(man.version + " " + man.commit + " " + env);
      const lib = cfg.sitePath + "/" + encodeURI(cfg.pagesLibrary);
      for (const f of r[env].files) {
        expect(f.uploadUri).toBe("_api/web/GetFolderByServerRelativeUrl('" + lib + "')/Files/add(url='" + f.name + "',overwrite=true)");
        expect(f.url).toBe(cfg.tenantUrl + lib + "/" + f.name);
        expect(f.source).toBe("/GPD Releases/v9.9.9-abcd1234-20261012-153000/" + env + "/" + f.name + ".txt");
      }
    }
    expect(r.prod.siteUrl).toBe("https://fbinportal.sharepoint.com/sites/GPDReporting");
    expect(r.prod.files.map((f) => f.name)).toContain("Home.aspx");
    expect(r.devHomeUrl).toBe(r.dev.files.find((f) => f.name === "Home.aspx").url);
  });

  test("request carries the approval and email texts", () => {
    const r = request({ approvers: ["approver@moen.com", "owner@moen.com"] });
    expect(r.approvers).toBe("approver@moen.com;owner@moen.com");
    expect(r.notify).toBe("owner@moen.com;approver@moen.com");
    expect(r.approvalTitle).toBe("Release GPD Portfolio Hub v9.9.9 to Prod");
    expect(r.approvalDetails).toContain("- Scorecard: one thing.");
    for (const f of r.dev.files) expect(r.approvalDetails).toContain("(" + f.url + ")");
    for (const f of r.prod.files) expect(r.doneHtml).toContain('href="' + f.url + '"');
    expect(r.doneHtml).toContain("<li>Home: &lt;another&gt; &amp; more.</li>");
    expect(r.doneSubject).toBe("GPD Portfolio Hub v9.9.9 is live on Prod");
    expect(r.rejectedSubject + r.failedSubject).toMatch(/not approved.*stopped/);
  });

  test("stages the pages as .txt and writes the request file last", () => {
    const dropDir = fs.mkdtempSync(path.join(os.tmpdir(), "gpd-release-"));
    try {
      const r = request();
      const file = stageRelease({ dropDir, request: r, dists: { dev: path.join(ROOT, "dist", "dev"), prod: path.join(ROOT, "dist", "prod") } });
      expect(path.basename(file)).toBe(r.id + ".json");
      expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(r);
      const jsonTime = fs.statSync(file).mtimeMs;
      for (const env of ["dev", "prod"]) for (const f of r[env].files) {
        const staged = path.join(dropDir, r.id, env, f.name + ".txt");
        expect(fs.readFileSync(staged).equals(fs.readFileSync(path.join(ROOT, "dist", env, f.name)))).toBe(true);
        expect(fs.statSync(staged).size).toBe(f.bytes);
        expect(fs.statSync(staged).mtimeMs).toBeLessThanOrEqual(jsonTime);
      }
      expect(fs.readdirSync(dropDir).sort()).toEqual([r.id, r.id + ".json"]);
    } finally { fs.rmSync(dropDir, { recursive: true, force: true }); }
  });
});
