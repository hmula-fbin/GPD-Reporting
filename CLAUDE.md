# GPD Portfolio Hub - notes for Claude Code

Three SharePoint Online pages (Home.aspx, Portfolio_Scorecard.aspx, Data_Quality.aspx) built from the modular source in `src/`.
Each page reads its data live in the browser through the SharePoint REST API, as the person viewing: Home and the Scorecard read the pipeline file; Data Quality reads the project file and the resource file.

## Who you're working with
Most team members are new to VS Code and git. Explain git steps in one plain sentence each. Prefer the team commands:
- `/get-latest`, `/start-change`, `/change`, `/share-change` and `/package-dev`, for everyone;
- `/approve-release`, `/package-prod` and `/release-check`, for the release owner.

Uploading to SharePoint is manual for now: `tools/package.mjs` builds the pages and the user drags them into the library. Custom scripts must be on for the site that day, because SharePoint resets them every 24 hours. `/deploy-dev` (PnP) is only for when `pnpClientId` is set.

The full process is in docs/TEAM-GUIDE.md.

## Workflow
- **Flow:** change branch (`change/<name>`), then Dev site for testing, then the release owner merges to `main`, tags it, deploys main to Dev, then Prod.
- Never commit change work directly on `main`. Only `/approve-release` merges into main.
- The shared remote (`origin`) is a bare repo in a OneDrive folder. It will later move to GitHub. Never force-push, never `reset --hard`, never delete someone else's branch.
- Edit only `src/` and `config/`. `dist/` is generated; `src/vendor/` is third-party (don't edit it).
- Build: `node build/build.mjs --env dev` (or `--env all`). Preview: `npm run preview` (fake SharePoint plus synthetic data).
- Test: `npm test` (Playwright, desktop + mobile). Every change must leave the tests green.
- A new requirement gets a test in `tests/`.
- **Never run a prod deploy.** The release owner runs it from a VS Code task. Don't read `data/`, which holds real extracts.

## House rules (business requirements, all covered by tests)
1. **Never show where the data comes from.** No file name, "SharePoint", "workbook", network drive or library name in visible text. "Excel" appears only as the download-button label. `FORBIDDEN` in tests/helpers.mjs enforces this.
2. **Default view**: Project Status defaults to In Progress only, and the Phase filter (right above Project Status) defaults to the Active Phase. There is no Include/Exclude filter: show everything.
3. **"Ask questions about your data"** (the Copilot, bottom right, on every page) answers from the FULL data, never from the filtered view. Portfolio questions use the engine in `src/shared/ask.js` over `window.gpdData().rows`, checked against `tests/oracle.mjs`. Questions about another file, with an explicit filter ("where Brand is Moen", "> 1m"), or naming a column exactly go to `src/shared/explore.js`, which reads EVERY spreadsheet in the data library (new files are picked up automatically) and answers on any column, with an Excel download per answer.
4. **KPIs and progress bars use one colour**: `--kpi` #1C5A8A, or #7CC0E4 in dark mode. No red/amber/green.
5. **Bucket identity colours** stay as defined in `scorecard-colours.css`.
6. **Excel downloads**: one per table, plus "Download all projects" at the top. No Excel buttons on the scorecard's "Portfolio at a glance".
7. **Filters sit in the left panel.** Drill-down works on bucket, stage, KPI and project rows. Hovering a Project Bucket shows the reference sheet from `config/bucket-reference.json`.
8. **Home greeting**: time of day plus first name ("Good afternoon, Harinath"). No jokes or humour text. Home stays clean: no glance panel, intro sentence or hero button. (The exception is the Scorecard and Data Quality loading screens, which do show light time-of-day lines while data loads: `src/shared/loading.js`.)
9. Portfolio Explorer is shelved and appears as "Soon" in the menu.
10. **Scorecard header** shows "Last refreshed <date, time>" only (not "data updated" or "loaded").

## SharePoint constraints (the build enforces these)
- No `<%@ Page %>` directive and no `<%` anywhere. Safe-mode pages reject server code.
- The output must be ASCII. The build escapes any non-ASCII automatically, but prefer `&middot;`, `·` and similar in source.
- Everything is inlined (CSS, JS, images as data URIs) because pages live in a document library.
- REST calls use `credentials:"include"`, with paths from `GPD_CONFIG` (never hard-code `/sites/...`).

## Where things are
| What | File |
|---|---|
| Environment settings (site, library, data file, refresh minutes, review months) | `config/<env>.json` |
| SG Project Type -> bucket reference | `config/bucket-reference.json` |
| Page templates (`@css`, `@js`, `@include`, `@config` directives) | `src/pages/*/*.html` |
| App bar, breadcrumb, menu drawer, assistant panel | `src/partials/*.html` |
| Shared shell CSS, menu JS, assistant engine/UI | `src/shared/` |
| Scorecard logic: parse, filters, render, exports, trend snapshots | `src/pages/scorecard/scorecard.js` |
| Drill-down panel | `src/pages/scorecard/drill.js`, `drill.css`, `drill-panel.html` |
| Home logic: greeting, headline figures | `src/pages/home/home.js` |
| Copilot over every data file (any column, any filter) | `src/shared/explore.js` |
| Resizable table columns on every page (drag a heading edge; double-click resets) | `src/shared/tables.js` |
| Responsive layout: breakpoints in `src/shared/shell.css`; filters fold into a "Filters" button below 1100px | `src/shared/responsive.js` |
| Data Quality: column names, thresholds, the 21 rules, filters, exports, daily tracking | `src/pages/dq/dq.js` (+ `dq.html`, `dq.css`) |
| Build | `build/build.mjs` |
| Local preview server | `tools/serve.mjs` |
| Synthetic test data | `tools/make-fixture.mjs` -> `tests/fixtures/pipeline-fixture.csv`; `tools/make-dq-fixture.mjs` -> `tests/fixtures/dq-*-fixture.csv` (one project per rule) |
| Deploy | `deploy/Deploy-Portfolio.ps1` (PnP.PowerShell). Prod checks the build stamp live on Dev |
| Team setup scripts | `setup/1-Install-Tools.ps1`, `2-Create-Shared-Copy.ps1`, `3-Join-Project.ps1` |

## Data facts
- The data files are CSVs (`Pipeline Data.csv`, `Project Data.csv`, `Resource Data.csv` in the data library; names in `config/<env>.json`). Every page reads them through `gpdReadBook` in `src/shared/readbook.js`, which tells CSV from Excel by content, so an Excel file still reads. CSV numbers, TRUE/FALSE and dates become real values; ISO dates land on the right calendar day.
- The parser finds a sheet named PIPELINE (or one whose header row has "Project Name" and "Project Bucket (NEW)"). The header row is found within the first 30 rows.
- The columns used are in `FIELD_MAP` in `scorecard.js`. Every Scorecard table also shows Capital Investment and Product Development Investment (labelled "PD Investment"). Home has its own small parser in `home.js`; keep the two consistent.
- NPD = Grow the Core + Refresh & Sustain + Create & Transform. CI and CRQ are reported separately.
- localStorage keys: `fbin_theme`, `gpd_nav_seen`, `fbin_scorecard_data_v2`, `fbin_scorecard_snaps_v2` (monthly trend snapshots, 24 months), `fbin_dq_snapcache_v1` (Data Quality: totals of each nightly snapshot, so each is read once), `fbin_tablesizes_v2` (each person's table and column sizes), `fbin_copilot_terms` (terms each person taught the Copilot, e.g. "PMF means Project Management Flag").
- Data Quality filters are all multi-select. Status sits above Phase there (the Scorecard keeps Phase above Status).
- Data Quality reads `projectFileName` and `resourceFileName` from `config/<env>.json`. Column names are in `PROJECT_COLS` / `RESOURCE_COLS` at the top of `dq.js`; a rule whose column is missing switches itself off and the page says so. Project Type comes from "Stage Gate Project Type" (ProjectType is blank in the extract).
- Data Quality daily tracking reads the daily copies `<project file> MM-DD-YYYY.csv` (YYYY-MM-DD also works) that a Power Automate flow saves in the data library (docs/DAILY-SNAPSHOT.md): one row per copy plus Now, and the live file compared with the latest-dated copy. There is no Record now button. The Copilot ignores those copies.
