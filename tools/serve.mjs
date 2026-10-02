#!/usr/bin/env node
/*
  Local preview: serves dist/<env>/ at the same URL path SharePoint uses and fakes the three
  SharePoint REST calls the pages make, so you can develop without deploying.

    node tools/serve.mjs --env dev                     -> http://localhost:5173/  (opens Home)
    node tools/serve.mjs --env dev --data data/Pipeline.xlsx --port 5180

  --data  workbook to serve as the data file (default: tests/fixtures/pipeline-fixture.xlsx).
          Put real extracts in data/ - that folder is git-ignored.
  --user  display name returned by /_api/web/currentuser (default "Preview, Alex").
*/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const env = opt("env", "dev");
const port = Number(opt("port", process.env.PORT || 5173));
const dataFile = path.resolve(ROOT, opt("data", "tests/fixtures/pipeline-fixture.xlsx"));
const user = opt("user", "Preview, Alex");
const dist = path.join(ROOT, "dist", env);

if (!fs.existsSync(path.join(dist, "manifest.json"))) { console.error("Run the build first: node build/build.mjs --env " + env); process.exit(1); }
if (!fs.existsSync(dataFile)) { console.error("No data file at " + dataFile + " - run: node tools/make-fixture.mjs"); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8"));
const pagesUrl = manifest.pagesUrl; // e.g. /sites/gpdsbx/Shared%20Documents/

const json = (res, obj, code = 200) => { res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url);
  if (url === "/" || url === "") { res.writeHead(302, { Location: pagesUrl + "Home.aspx" }); return res.end(); }

  // SharePoint REST fakes
  if (url.includes("/_api/web/currentuser")) return json(res, { Title: user });
  if (url.includes("/_api/web/GetFileByServerRelativePath")) {
    if (url.includes("/$value")) {
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" });
      return fs.createReadStream(dataFile).pipe(res);
    }
    return json(res, { TimeLastModified: fs.statSync(dataFile).mtime.toISOString() });
  }
  if (url.includes("/_api/")) return json(res, {});

  // pages
  const name = path.basename(url.split("?")[0].split("#")[0]);
  const f = path.join(dist, name);
  if (url.startsWith(decodeURIComponent(pagesUrl)) && name.endsWith(".aspx") && fs.existsSync(f)) {
    res.writeHead(200, { "Content-Type": "text/html; charset=us-ascii", "Cache-Control": "no-store" });
    return fs.createReadStream(f).pipe(res);
  }
  res.writeHead(404, { "Content-Type": "text/plain" }); res.end("Not found in local preview: " + url);
}).listen(port, () => {
  console.log("GPD Portfolio Hub preview (" + env + ", build " + manifest.version + ")");
  console.log("  Home       http://localhost:" + port + pagesUrl + "Home.aspx");
  console.log("  Scorecard  http://localhost:" + port + pagesUrl + "Portfolio_Scorecard.aspx");
  console.log("  Data       " + path.relative(ROOT, dataFile) + "   (Ctrl+C to stop)");
});
