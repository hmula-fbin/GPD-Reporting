// Preparing a Prod release for the release flow: the checks, the changelog lines, and staging the pages.
// Plain Node checks (no browser), so they run once, in the desktop project.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { prodGateProblem, changesFor, findReleaseFolder, releaseId, stageRelease } from "../tools/lib/release.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = (env) => path.join(ROOT, "dist", env);
const pages = (env) => JSON.parse(fs.readFileSync(path.join(dist(env), "manifest.json"), "utf8")).files.map((f) => f.name);

test.describe("Prod release", () => {
  test.beforeEach(() => test.skip(test.info().project.name !== "desktop-light", "Node-only checks run once"));

  test("anyone may release, from a committed, tagged main", () => {
    const ok = { version: "1.2.3", branch: "main", dirty: "", tags: ["v1.2.3"] };
    expect(prodGateProblem(ok)).toBe("");
    expect(prodGateProblem({ ...ok, branch: "change/x" })).toMatch(/main branch/);
    expect(prodGateProblem({ ...ok, dirty: " M src/x.js" })).toMatch(/uncommitted/);
    expect(prodGateProblem({ ...ok, tags: ["v1.2.2"] })).toMatch(/not tagged v1\.2\.3/);
    expect(JSON.parse(fs.readFileSync(path.join(ROOT, "config", "prod.json"), "utf8")).releaseOwners).toBeUndefined();
  });

  test("takes the changelog lines of exactly this version", () => {
    const log = "# Changelog\n\n## v1.7.10 - 2026-10-10\n- later\n\n## v1.7.1 - 2026-10-09\n- first\n- second\n\n## v1.7.0 - 2026-10-08\n- older\n";
    expect(changesFor(log, "1.7.1")).toBe("- first\n- second");
    expect(changesFor(log, "1.7.10")).toBe("- later");
    expect(changesFor(log, "2.0.0")).toBe("");
  });

  test("finds the GPD Releases shortcut under the name OneDrive gives it", () => {
    const od = fs.mkdtempSync(path.join(os.tmpdir(), "gpd-onedrive-"));
    try {
      expect(findReleaseFolder(od)).toBe("");
      fs.writeFileSync(path.join(od, "GPD Releases notes.txt"), "a file, not the folder");
      fs.mkdirSync(path.join(od, "GPD Support"));
      expect(findReleaseFolder(od)).toBe("");
      fs.mkdirSync(path.join(od, "GPD Releases"));
      expect(findReleaseFolder(od)).toBe(path.join(od, "GPD Releases"));
      fs.mkdirSync(path.join(od, "GPDReporting - GPD Releases"));
      expect(findReleaseFolder(od)).toBe(path.join(od, "GPDReporting - GPD Releases"));
      expect(findReleaseFolder(path.join(od, "missing"))).toBe("");
    } finally { fs.rmSync(od, { recursive: true, force: true }); }
  });

  test("release id is safe in folder names and URLs; a rehearsal id can never start the flow", () => {
    const when = new Date("2026-10-12T15:30:45Z");
    expect(releaseId("1.8.0", "abcd1234", when)).toBe("v1.8.0-abcd1234-20261012-1530");
    const rehearsal = releaseId("1.8.0", "abcd1234", when, { rehearsal: true });
    expect(rehearsal).toBe("rehearsal-v1.8.0-abcd1234-20261012-1530");
    expect(rehearsal.startsWith("v")).toBe(false);   /* the flow's trigger condition: startsWith(ReleaseId, 'v') */
  });

  test("stages Prod pages in prod/<id> and QA pages in qa/<id>, as .aspx.txt", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gpd-release-"));
    const id = "v9.9.9-abcd1234-20261012-1530";
    try {
      fs.mkdirSync(path.join(root, "prod", id), { recursive: true });
      fs.writeFileSync(path.join(root, "prod", id, "Old_Page.aspx.txt"), "left from an earlier try");
      const r = stageRelease({ root, id, version: "9.9.9", commit: "abcd1234", changes: "- one\n- two", prodDist: dist("prod"), qaDist: dist("test") });
      expect(r).toMatchObject({ id, title: "v9.9.9", version: "9.9.9", commit: "abcd1234", whatChanged: "- one\n- two" });
      expect(r.prod.folder).toBe("prod/" + id);
      expect(r.qa.folder).toBe("qa/" + id);
      expect(pages("prod")).toContain("Home.aspx");
      for (const [env, dir, site] of [["prod", "prod", "/sites/GPDReporting\""], ["qa", "test", "/sites/GPDReportingQA\""]]) {
        expect(fs.readdirSync(path.join(root, env, id)).sort()).toEqual(pages(dir).map((p) => p + ".txt").sort());
        expect(r[env].files.map((f) => f.name)).toEqual(pages(dir));
        for (const f of r[env].files) {
          const staged = fs.readFileSync(path.join(root, env, id, f.staged), "utf8");
          expect(staged).toBe(fs.readFileSync(path.join(dist(dir), f.name), "utf8"));
          expect(staged).toContain('"sitePath": "' + site);
          expect(Buffer.byteLength(staged)).toBe(f.bytes);
        }
        expect(r[env].bytes).toBe(r[env].files.reduce((n, f) => n + f.bytes, 0));
      }
      expect(stageRelease({ root, id, version: "9.9.9", commit: "abcd1234", changes: "", prodDist: dist("prod"), qaDist: dist("test") }).whatChanged).toBe("v9.9.9");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
