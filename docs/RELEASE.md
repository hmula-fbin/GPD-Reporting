# Release process: Dev -> Prod

The step-by-step version, with exact Claude commands, is in [TEAM-GUIDE.md](TEAM-GUIDE.md). This page is the reference.

## Rules
- **Branches:** each change lives on its own branch, `change/<name>`, created with `/start-change`. `main` holds only approved, released work.
- **Dev:** any team member can deploy any change branch to Dev (`/deploy-dev`) so the requester can test it.
- **Prod:** anyone on the team can send a release, and it goes live only when the approver clicks **Approve** in the release flow. `/package-prod` only builds when:
  - you are on `main` with a clean tree;
  - HEAD is tagged `v<version>`;
  - the tests pass.
- **Versions** follow semver in `package.json`: patch for fixes (1.0.1), minor for features (1.1.0), major for breaking changes such as a new data layout. Every release has a tag and a `CHANGELOG.md` entry, which `/approve-release` writes.
- **Optional Test/UAT site:**
  1. Fill in `config/test.json`.
  2. Set `"promoteFrom": "test"` in `config/prod.json`.
  3. Deploy to Test with `npm run deploy:test` before Prod.

## Release flow (the usual way)
`/approve-release` ends by running the `/package-prod` steps. `node tools/package.mjs --env prod` builds the QA and Prod pages and stages them in the sender's OneDrive folder `GPD Releases` (`prod/<id>` and `qa/<id>`, as `.aspx.txt`). That folder is a shortcut to **Prod Release Files/GPD Releases**, so OneDrive uploads them to the Prod site. Claude checks with the WorkIQ-SharePoint connector that they arrived (the connector's own copies are refused by company policy), then adds the release to the **GPD Releases** list, and that starts the Power Automate flow "GPD - Release to Prod". The flow:
1. turns custom scripts on for QA and Prod (admin connection), then renames the staged files to `.aspx`: into QA's Report Pages, and into Prod Release Files;
2. sets the list item's Status as it goes (Waiting for approval, Live, Rejected, Stopped);
3. emails the approver: who sent it, what changed, the pages to publish, and a link to QA;
4. on **Approve**, copies every `.aspx` in Prod Release Files to Report Pages (replacing the one with the same name), moves each into **Prod Release Backup** with the date and time added (`Home_2026-10-12_1530.aspx`) and emails the sender;
5. on **Reject**, emails the sender the approver's comments, and Prod isn't touched;
6. turns Prod's custom scripts off again.

How to build the flow, and what to do when it fails: [PROD-APPROVAL-FLOW.md](PROD-APPROVAL-FLOW.md).

## Dev upload
`node tools/package.mjs --env dev` (or `/package-dev`) runs the tests, builds the pages, writes `UPLOAD-STEPS.txt`, and opens the folder and the Dev library to drag them into. Undo with the library's Version history.

## Release with the PnP deploy script (optional, needs `pnpClientId`)
1. Run `/approve-release change/<name>`. It merges the approved branches, runs the tests, bumps the version, updates the changelog, tags the release and shares it.
2. Run the task **Deploy: dev**. This puts that exact release on Dev; have a quick look.
3. Run the task **Deploy: prod (asks for confirmation)** and type `DEPLOY PROD`.
4. Smoke test on Prod: open Home and the Scorecard, press Refresh now, and ask one question.
5. If something is wrong, roll back:
   ```powershell
   pwsh -ExecutionPolicy Bypass -File .\deploy\Deploy-Portfolio.ps1 -Env prod -Rollback <backup id>
   ```
   Every deploy prints its backup id. Backups are kept in `backups/<env>/` on the deploying PC.

## Sign-off checklist (requester, on Dev)

- [ ] Home greets you by first name. The glance figures match the Scorecard default view.
- [ ] Project Status defaults to In Progress, and Phase to the Active Phase. Changing the filters updates every table.
- [ ] Drill-down works on a bucket, a stage, a KPI and a project.
- [ ] Each table has an Excel download, and Download all projects works. The glance section has no Excel buttons.
- [ ] Hovering a Project Bucket shows the reference sheet.
- [ ] Ask questions about your data gives correct answers for 3 questions you know the answer to.
- [ ] No data file name or source location is visible anywhere.
- [ ] Phone check: open both pages on a phone.

## One-time setup per environment

1. **Site**: create the site, or use an existing one. Ask the SharePoint admin to allow custom scripts on it:
   ```powershell
   Set-SPOSite -Identity <url> -DenyAddAndCustomizePages 0
   ```
2. **Libraries**:
   - the pages library: `Shared Documents` by default;
   - the data library: `Report Files`, containing the data file.

   For Dev and Test you can seed the data file:
   ```powershell
   pwsh ./deploy/Deploy-Portfolio.ps1 -Env test -UploadData "data/Pipeline Data.csv"
   ```
3. **Permissions**:
   - viewers need Read on both libraries;
   - whoever deploys needs Edit on the pages library.
4. **PnP app**: run `deploy/Setup-PnPApp.ps1` once per tenant and put the Client ID in each config. The app needs the delegated SharePoint permission `AllSites.Write`, and an admin may need to grant consent.
5. **Config**: set `sitePath` (and the library names if they differ) in `config/<env>.json`.
