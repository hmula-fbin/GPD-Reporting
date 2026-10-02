# GPD Portfolio Hub

SharePoint Online pages for the GPD portfolio:

- **Home.aspx**: landing page with greeting, portfolio at a glance, and dashboard tiles.
- **Portfolio_Scorecard.aspx**: the Innovation & CI portfolio scorecard. It has filters, drill-down, a month-over-month trend view, Excel downloads, and "Ask questions about your data".

Both pages read the pipeline workbook live from SharePoint as the person viewing. There is no server, no scheduled job and no database.

```
 src/ (modules) --node build--> dist/<env>/*.aspx --Deploy-Portfolio.ps1--> SharePoint site per environment
                                     |                                       Dev -> Test -> Prod
                                     +-- npm test (Playwright against a fake SharePoint)
```

## One-time setup (Windows, VS Code)

1. Install the tools:
   - [Node.js 20 LTS or newer](https://nodejs.org)
   - [Git](https://git-scm.com)
   - PowerShell 7: `winget install Microsoft.PowerShell`
2. Unzip this folder, for example to `C:\dev\gpd-portfolio-hub`. Open it in VS Code with **File > Open Folder**.
3. Accept the recommended extensions when VS Code asks. They include **Claude Code**, Playwright and PowerShell.
4. Open the terminal (Ctrl+`) and run:
   ```powershell
   npm install
   npx playwright install chromium
   npm test
   ```
   All tests should pass.
5. Run the deployment setup once:
   ```powershell
   pwsh ./deploy/Setup-PnPApp.ps1 -Tenant fbinportal.onmicrosoft.com
   ```
   Copy the Client ID it prints into `pnpClientId` in each `config/*.json` file. Your tenant admin may need to approve the app; see docs/RELEASE.md.
6. Fill in the real Test and Prod site paths in `config/test.json` and `config/prod.json`. They currently say `CHANGE-ME`.

## Daily work

| I want to... | Run (or use Terminal > Run Task) |
|---|---|
| See my change locally | `npm run preview`, then open http://localhost:5173 |
| Preview with a real extract | Put the file in `data/` and run the task **Preview (dev, real extract)** |
| Run the tests | `npm test` (or `npm run test:ui` for the visual runner) |
| Build every environment | `npm run build:all` |
| Put it on Dev | `npm run deploy:dev` |
| Put it on Test | `npm run deploy:test` |
| Release to Prod | Follow [docs/RELEASE.md](docs/RELEASE.md) |

## Using Claude Code in VS Code

Open the Claude Code panel (the Claude icon in the sidebar, or Ctrl+Esc) and sign in with your Claude account. Claude reads `CLAUDE.md` first, so it knows the house rules, the folder layout and the commands. Two project commands are included:

- `/change <what you want>`: edits the right module, builds, runs the tests, and suggests a commit message.
- `/release-check`: gives a go / no-go for Test and Prod.

Claude is not allowed to deploy to prod or to `git push`; see `.claude/settings.json`. You do those steps yourself.

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
docs/              ARCHITECTURE.md  RELEASE.md
```
