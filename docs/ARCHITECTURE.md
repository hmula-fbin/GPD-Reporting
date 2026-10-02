# Architecture

## Runtime: what happens when someone opens a page

```
Browser (signed in to Microsoft 365)
  |  GET  /sites/<site>/<pages library>/Portfolio_Scorecard.aspx        (static file, all CSS/JS/images inlined)
  |  GET  /sites/<site>/_api/web/currentuser?$select=Title              (first name for the greeting)
  |  GET  /sites/<site>/_api/web/GetFileByServerRelativePath(...)?$select=TimeLastModified
  |  GET  /sites/<site>/_api/web/GetFileByServerRelativePath(...)/$value (the workbook bytes)
  v
SheetJS parses the PIPELINE sheet in the browser -> rows -> filters / KPIs / drill-down / trend / assistant
```

- **Security**: every request runs as the viewer, using their existing SharePoint session. A user who can't read the data file sees a friendly error, not the data. There are no stored credentials, no service account and no server.
- **Freshness**: the data loads on open, every `reloadMinutes` while the page stays open, and on **Refresh now**. When the data owners replace the file, everyone sees the new figures.
- **Trend**: the page keeps one snapshot per month in the viewer's browser (localStorage, 24 months). It is per browser by design.
- **Assistant**: "Ask questions about your data" is a deterministic engine that runs in the page (`src/shared/ask.js`). It answers from every project in the file, whatever filters are on. No data leaves the browser.

## Build time: how the modules become a page

`build/build.mjs` reads a page template (`src/pages/<page>/<page>.html`) and resolves its directives:

| Directive | Result |
|---|---|
| `<!-- @css a.css b.css -->` | One `<style>` block, files concatenated in order |
| `<!-- @js file.js -->` | One `<script>` block (with `</script` and `<!--` neutralised) |
| `<!-- @include partial.html crumb="Title" -->` | The partial pasted in. `crumb` adds the breadcrumb |
| `<!-- @config -->` | `window.GPD_CONFIG` plus `const SOURCE`, from `config/<env>.json` |
| `{{asset:x.png}}` | A base64 data URI from `src/assets/` |
| `{{PAGES_URL}}`, `{{SITE_PATH}}`, `{{DATA_FILE}}`, `{{REVIEW_MONTHS}}`, `{{ENV_BADGE}}`, `{{VERSION}}`, ... | Environment values |
| `{{BUCKET_REF_JSON}}` | `config/bucket-reference.json` |

The build then escapes non-ASCII and **fails** if any of these is true:

- `<%` is present;
- the output is not ASCII;
- a token or directive is left unresolved;
- the config block is missing.

Its output goes to `dist/<env>/` with a `manifest.json` (version, build time, sizes).

Script order matters. Scripts are plain classic scripts that share globals: `S`, `render`, `tracked` and so on in the scorecard, and `GPD_CONFIG` everywhere. The order is set in each template:

- **Scorecard**: config, scorecard, bucket-reference, drill, ask-data, nav, ask.
- **Home**: config, vendor, home, nav, ask.

## Environments: separate sites

| | Dev | Test | Prod |
|---|---|---|---|
| Config | `config/dev.json` | `config/test.json` | `config/prod.json` |
| Site | `/sites/gpdsbx` (current sandbox) | your test site | your production site |
| Data | a copy of the extract (seed with `-UploadData`) | a copy of the extract | the real file, maintained by its owners |
| Badge | DEV | TEST | none |
| Who deploys | any developer | developer, after tests pass | release owner, after Test sign-off |

Each site needs:

- the pages library (default `Shared Documents`);
- the data library (default `Report Files`) containing the data file;
- **custom scripts allowed**, which a SharePoint admin sets per site. Without it, .aspx files download instead of rendering.

## Testing

- `tools/serve.mjs` serves `dist/dev/` at the same URL path SharePoint uses and fakes the three REST calls. Data comes from `tests/fixtures/pipeline-fixture.xlsx`, which is synthetic, deterministic and safe to commit.
- `tests/*.spec.mjs` run in Playwright on desktop/light and mobile/dark:
  - page health (errors, overflow, menu, theme, env badge, no data-source words);
  - scorecard requirements (status default, left filters, exports, drill-down, bucket hover, one KPI colour, refresh);
  - assistant answers checked against `tests/oracle.mjs`, an independent calculation over the same rows.

## Known follow-ups

- **SheetJS** in `src/vendor` is 0.18.5, the last npm release. It has published advisories (prototype pollution and ReDoS) that matter mainly for untrusted files. Upgrade to 0.20.x from https://cdn.sheetjs.com when you can download it: replace `src/vendor/xlsx.full.min.js`, run `npm test`, and release.
- Portfolio Explorer is shelved and appears in the menu as "Soon". Add it as `src/pages/explorer/` and as a new entry in `PAGES` in `build/build.mjs`.
