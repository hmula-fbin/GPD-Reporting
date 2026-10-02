# GPD Portfolio Hub

SharePoint Online pages for the GPD portfolio:

- **Home.aspx**: landing page with greeting, portfolio at a glance, and dashboard tiles.
- **Portfolio_Scorecard.aspx**: the Innovation & CI portfolio scorecard. It has filters, drill-down, a month-over-month trend view, Excel downloads, and "Ask questions about your data".

Both pages read the pipeline workbook live from SharePoint as the person viewing. There is no server, no scheduled job and no database.

```
 src/ (modules) --node build--> dist/<env>/*.aspx --Deploy-Portfolio.ps1--> SharePoint site per environment
                                     |                                       Dev (testing) -> Prod
                                     +-- npm test (Playwright against a fake SharePoint)
```

## Start here

**New to VS Code or joining the team? Follow [docs/TEAM-GUIDE.md](docs/TEAM-GUIDE.md).** It covers setup for the release owner and for team members, making a change with Claude, testing on Dev, and releasing to Prod.

Quick reference:

| I want to... | Type in the Claude panel / run |
|---|---|
| Get the team's latest work | `/get-latest` |
| Start a change | `/start-change <short description>` |
| Make the change | Describe it in plain English, or `/change <description>` |
| See it on my PC | Task **Preview (dev, fixture data)**, then open http://localhost:5173 |
| Save and share it | `/share-change` |
| Put it on Dev for testing | `/deploy-dev` |
| (Release owner) approve it | `/approve-release change/<name>` |
| (Release owner) release to Prod | Task **Deploy: dev**, then task **Deploy: prod (asks for confirmation)** |

## Layout

```
config/            dev.json  test.json  prod.json  bucket-reference.json
src/
  pages/home/      home.html (template)  home.css  home.js
  pages/scorecard/ scorecard.html  scorecard.js  *.css  drill.*  bucket-reference.js  ask-data.js
  partials/        appbar  crumb  drawer  ask
  shared/          shell.css  nav.js  ask.css  ask.js (assistant engine + UI)
  assets/          logo-dark.png  copilot-icon.png
  vendor/          xlsx.full.min.js (SheetJS)
build/build.mjs    modules -> dist/<env>/*.aspx (SharePoint-safe, ASCII, checked)
tools/             serve.mjs (local fake SharePoint)  make-fixture.mjs (synthetic data)
tests/             Playwright specs + oracle + fixture
deploy/            Deploy-Portfolio.ps1  Setup-PnPApp.ps1
setup/             1-Install-Tools  2-Create-Shared-Copy  3-Join-Project
.claude/           settings.json (what Claude may do)  commands/ (team slash commands)
docs/              TEAM-GUIDE.md  ARCHITECTURE.md  RELEASE.md
```
