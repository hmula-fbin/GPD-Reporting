#!/usr/bin/env node
/*
  Local preview: serves dist/<env>/ at the same URL path SharePoint uses and fakes the three
  SharePoint REST calls the pages make, so you can develop without deploying.

    node tools/serve.mjs --env dev                     -> http://localhost:5173/  (opens Home)
    node tools/serve.mjs --env dev --data data/Pipeline.xlsx --port 5180

  --data  workbook to serve as the data file (default: tests/fixtures/pipeline-fixture.xlsx).
          Put real extracts in data/ - that folder is git-ignored.
  --project / --resource  the two Data Quality files (default: tests/fixtures/dq-*-fixture.xlsx).
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
// Data Quality page: its two files (synthetic by default; real extracts go in data/)
const projectFile = path.resolve(ROOT, opt("project", "tests/fixtures/dq-project-fixture.xlsx"));
const resourceFile = path.resolve(ROOT, opt("resource", "tests/fixtures/dq-resource-fixture.xlsx"));
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
  // the data library's file list (the Copilot reads every spreadsheet in it)
  if (url.includes("/_api/web/GetFolderByServerRelativePath") && url.includes("/Files")) {
    const folder = (/decodedurl='([^']*)'/.exec(url) || [])[1] || "";
    const files = manifest.dataFiles || {};
    const list = [[files.pipeline, dataFile], [files.project, projectFile], [files.resource, resourceFile]]
      .filter(([name, f]) => name && fs.existsSync(f))
      .map(([name, f]) => ({ Name: name, ServerRelativeUrl: folder + "/" + name, TimeLastModified: fs.statSync(f).mtime.toISOString() }));
    return json(res, { value: list });
  }
  if (url.includes("/_api/web/GetFileByServerRelativePath")) {
    const files = manifest.dataFiles || {};
    const file = files.project && url.includes("/" + files.project + "'") ? projectFile
               : files.resource && url.includes("/" + files.resource + "'") ? resourceFile : dataFile;
    if (!fs.existsSync(file)) return json(res, { error: "no fixture " + path.relative(ROOT, file) + " - run: npm run fixture" }, 404);
    if (url.includes("/$value")) {
      res.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" });
      return fs.createReadStream(file).pipe(res);
    }
    return json(res, { TimeLastModified: fs.statSync(file).mtime.toISOString() });
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
  console.log("  Quality    http://localhost:" + port + pagesUrl + "Data_Quality.aspx");
  console.log("  Data       " + path.relative(ROOT, dataFile) + "   (Ctrl+C to stop)");
});
