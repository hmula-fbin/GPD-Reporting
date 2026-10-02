# GPD Portfolio Hub - notes for Claude Code

Two SharePoint Online pages (Home.aspx, Portfolio_Scorecard.aspx) built from the modular source in `src/`.
Each page reads the pipeline workbook live in the browser through the SharePoint REST API, as the person viewing.

## Who you're working with
Most team members are new to VS Code and git. Explain git steps in one plain sentence each. Prefer the team commands:
- `/get-latest`, `/start-change`, `/change`, `/share-change` and `/deploy-dev`, for everyone;
- `/approve-release` and `/release-check`, for the release owner.

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
2. **Project Status filter** defaults to In Progress + Roadmap. There is no Include/Exclude filter: show everything.
3. **"Ask questions about your data"** answers from the FULL data file (`window.gpdData().rows`), never from the filtered view. Engine is in `src/shared/ask.js`; answers are checked against `tests/oracle.mjs`.
4. **KPIs and progress bars use one colour**: `--kpi` #1C5A8A, or #7CC0E4 in dark mode. No red/amber/green.
5. **Bucket identity colours** stay as defined in `scorecard-colours.css`.
6. **Excel downloads**: one per table, plus "Download all projects" at the top. No Excel buttons on "Portfolio at a glance".
7. **Filters sit in the left panel.** Drill-down works on bucket, stage, KPI and project rows. Hovering a Project Bucket shows the reference sheet from `config/bucket-reference.json`.
8. **Home greeting**: time of day plus first name ("Good afternoon, Harinath"). No jokes or humour text.
9. Portfolio Explorer is shelved and appears as "Soon" in the menu.

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
| Build | `build/build.mjs` |
| Local preview server | `tools/serve.mjs` |
| Synthetic test data | `tools/make-fixture.mjs` -> `tests/fixtures/pipeline-fixture.xlsx` |
| Deploy | `deploy/Deploy-Portfolio.ps1` (PnP.PowerShell). Prod checks the build stamp live on Dev |
| Team setup scripts | `setup/1-Install-Tools.ps1`, `2-Create-Shared-Copy.ps1`, `3-Join-Project.ps1` |

## Data facts
- The parser finds a sheet named PIPELINE (or one whose header row has "Project Name" and "Project Bucket (NEW)"). The header row is found within the first 30 rows.
- The columns used are in `FIELD_MAP` in `scorecard.js`. Home has its own small parser in `home.js`; keep the two consistent.
- NPD = Grow the Core + Refresh & Sustain + Create & Transform. CI and CRQ are reported separately.
- localStorage keys: `fbin_theme`, `gpd_nav_seen`, `fbin_scorecard_data_v2`, `fbin_scorecard_snaps_v2` (monthly trend snapshots, 24 months).
