#!/usr/bin/env node
/*
  GPD Portfolio Hub - build
  Turns the modular source in src/ into single-file, SharePoint-safe .aspx pages.

    node build/build.mjs --env dev        -> dist/dev/Home.aspx, dist/dev/Portfolio_Scorecard.aspx
    node build/build.mjs --env all        -> dev, test and prod

  Template directives (inside src/pages/<page>/<page>.html):
    <!-- @css a.css b.css -->                     inline the files as one <style> block
    <!-- @js path.js -->                          inline the file as a <script> block
    <!-- @include path.html crumb="Title" -->     paste a partial; crumb="" adds the breadcrumb
    <!-- @config -->                              window.GPD_CONFIG + const SOURCE for this environment

  Tokens (anywhere): {{SITE_PATH}} {{PAGES_URL}} {{DATA_FILE}} {{ENV}} {{ENV_LABEL}} {{VERSION}} {{COMMIT}}
    {{BUILD_TIME}} {{REVIEW_MONTHS}} {{ENV_BADGE}} {{CRUMB}} {{PAGE_TITLE}} {{BUCKET_REF_JSON}} {{asset:file.png}}

  Output rules SharePoint enforces (the build fails if any is broken):
    - no <%@ Page %> directive and no "<%" anywhere (safe-mode pages reject server code)
    - plain ASCII bytes (non-ASCII is escaped automatically)
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const PAGES = [
  { id: "home",      template: "pages/home/home.html",           out: "Home.aspx" },
  { id: "score",     template: "pages/scorecard/scorecard.html", out: "Portfolio_Scorecard.aspx" },
];

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf("--" + n); return i >= 0 ? args[i + 1] : d; };
const envArg = opt("env", "dev");
const outRoot = path.resolve(ROOT, opt("out", "dist"));
const envs = envArg === "all" ? ["dev", "test", "prod"] : [envArg];

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
const read = (p) => fs.readFileSync(path.join(SRC, p), "utf8");
const fail = (m) => { console.error("BUILD FAILED: " + m); process.exit(1); };

function loadConfig(env) {
  const f = path.join(ROOT, "config", env + ".json");
  if (!fs.existsSync(f)) fail("no config/" + env + ".json");
  const c = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const k of ["env", "label", "tenantUrl", "sitePath", "pagesLibrary", "dataLibrary", "dataFileName", "reloadMinutes", "reviewMonths"])
    if (c[k] === undefined || c[k] === "") fail("config/" + env + ".json is missing " + k);
  if (!/^\/sites\/[^/]+$/.test(c.sitePath) && !/^\/teams\/[^/]+$/.test(c.sitePath)) fail(env + ": sitePath must look like /sites/name");
  c.pagesUrl = c.sitePath + "/" + encodeURI(c.pagesLibrary) + "/";
  c.dataFile = c.sitePath + "/" + c.dataLibrary + "/" + c.dataFileName;
  return c;
}

function bucketRefJson() {
  const j = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "bucket-reference.json"), "utf8"));
  const rows = j.rows.map((r) => [r.sgProjectType, r.bucket, r.platform, r.targetMonths]);
  return "[\n" + rows.map((r) => "  " + JSON.stringify(r)).join(",\n") + "\n]";
}

const assetCache = {};
function asset(name) {
  if (!assetCache[name]) {
    const p = path.join(SRC, "assets", name);
    if (!fs.existsSync(p)) fail("missing asset " + name);
    const ext = path.extname(name).slice(1).toLowerCase();
    const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml", gif: "image/gif" }[ext];
    if (!mime) fail("unsupported asset type " + name);
    assetCache[name] = "data:" + mime + ";base64," + fs.readFileSync(p).toString("base64");
  }
  return assetCache[name];
}

/* A script body must not close its own tag early. */
const safeScript = (s) => s.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "\\x3C!--");

function expand(html, ctx) {
  html = html.replace(/<!--\s*@include\s+(\S+)((?:\s+\w+="[^"]*")*)\s*-->/g, (_, p, attrs) => {
    let part = read(p);
    const crumb = /crumb="([^"]*)"/.exec(attrs || "");
    if (part.includes("{{CRUMB}}"))
      part = part.replace("{{CRUMB}}", crumb ? read("partials/crumb.html").trim().replace("{{PAGE_TITLE}}", crumb[1]) : "");
    return expand(part, ctx).trimEnd();
  });
  html = html.replace(/<!--\s*@css\s+([^>]+?)\s*-->/g, (_, list) =>
    "<style>\n" + list.trim().split(/\s+/).map((p) => read(p).trimEnd()).join("\n") + "\n</style>");
  html = html.replace(/<!--\s*@js\s+(\S+)\s*-->/g, (_, p) => "<script>\n" + safeScript(read(p).trimEnd()) + "\n</script>");
  html = html.replace(/<!--\s*@config\s*-->/g, () => configScript(ctx.cfg));
  return html;
}

function configScript(c) {
  const pub = {
    env: c.env, label: c.label, version: pkg.version, commit: COMMIT, built: BUILD_TIME,
    tenantUrl: c.tenantUrl, sitePath: c.sitePath, pagesUrl: c.pagesUrl, dataFile: c.dataFile,
    reloadMinutes: c.reloadMinutes, reviewMonths: c.reviewMonths,
  };
  return "<script>\n/* Generated by build/build.mjs from config/" + c.env + ".json - edit the config, not this block. */\n"
    + "window.GPD_CONFIG = " + JSON.stringify(pub, null, 2) + ";\n"
    + "const SOURCE = { site: GPD_CONFIG.sitePath, file: GPD_CONFIG.dataFile, reloadMinutes: GPD_CONFIG.reloadMinutes };\n</script>";
}

function tokens(s, cfg) {
  const badge = cfg.showEnvBadge ? '<span class="envbadge" title="' + cfg.label + ' build ' + pkg.version + '">' + cfg.env.toUpperCase() + "</span>" : "";
  const map = {
    SITE_PATH: cfg.sitePath, PAGES_URL: cfg.pagesUrl, DATA_FILE: cfg.dataFile, ENV: cfg.env, ENV_LABEL: cfg.label,
    VERSION: pkg.version, COMMIT: COMMIT, BUILD_TIME: BUILD_TIME, REVIEW_MONTHS: String(cfg.reviewMonths), ENV_BADGE: badge,
    BUCKET_REF_JSON: bucketRefJson(),
  };
  return s.replace(/\{\{asset:([\w.-]+)\}\}/g, (_, n) => asset(n))
          .replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in map ? map[k] : m));
}

/* Escape anything outside ASCII: \uXXXX in scripts, \XXXXXX in styles, &#x..; in markup. */
function ascii(s) {
  return s.split(/(<script>[\s\S]*?<\/script>|<style>[\s\S]*?<\/style>)/).map((part) => {
    const kind = part.startsWith("<script>") ? "js" : part.startsWith("<style>") ? "css" : "html";
    return part.replace(/[^\x00-\x7f]/gu, (ch) => {
      const cp = ch.codePointAt(0);
      if (kind === "js") return cp > 0xffff ? ch.split("").map((u) => "\\u" + u.charCodeAt(0).toString(16).padStart(4, "0")).join("") : "\\u" + cp.toString(16).padStart(4, "0");
      if (kind === "css") return "\\" + cp.toString(16).padStart(6, "0");
      return "&#x" + cp.toString(16) + ";";
    });
  }).join("");
}

function check(out, name) {
  if (out.includes("<%")) fail(name + ' contains "<%" (SharePoint rejects server code)');
  if (/[^\x00-\x7f]/.test(out)) fail(name + " is not pure ASCII");
  const left = out.match(/\{\{[A-Za-z_:.-]+\}\}|<!--\s*@(css|js|include|config)\b/g);
  if (left) fail(name + " has unresolved " + [...new Set(left)].join(", "));
  if (!out.includes("window.GPD_CONFIG")) fail(name + " has no <!-- @config -->");
}

/* Which commit this build came from ("-dirty" = uncommitted changes). Prod deploys compare it with Dev. */
function gitCommit() {
  try {
    const sha = execSync("git rev-parse --short=8 HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const dirty = execSync("git status --porcelain", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    return sha + (dirty ? "-dirty" : "");
  } catch { return "nogit"; }
}
const COMMIT = gitCommit();
const BUILD_TIME = new Date().toISOString().replace(/\.\d+Z$/, "Z");
for (const env of envs) {
  const cfg = loadConfig(env);
  const dir = path.join(outRoot, env);
  fs.mkdirSync(dir, { recursive: true });
  const manifest = { env, version: pkg.version, commit: COMMIT, built: BUILD_TIME, sitePath: cfg.sitePath, pagesUrl: cfg.pagesUrl, files: [] };
  for (const pg of PAGES) {
    let out = ascii(tokens(expand(read(pg.template), { cfg }), cfg));
    check(out, env + "/" + pg.out);
    fs.writeFileSync(path.join(dir, pg.out), out, "ascii");
    manifest.files.push({ name: pg.out, bytes: Buffer.byteLength(out) });
  }
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  if (/CHANGE-ME/i.test(cfg.sitePath)) console.warn("WARNING " + env + ": config still has a CHANGE-ME site path - fill in config/" + env + ".json before deploying.");
  console.log("built " + env.padEnd(4) + " v" + pkg.version + " " + COMMIT + " -> " + path.relative(ROOT, dir) + "  (" + manifest.files.map((f) => f.name + " " + (f.bytes / 1024).toFixed(0) + " KB").join(", ") + ")");
}
