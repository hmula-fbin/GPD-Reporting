# Release process: Dev -> Test -> Prod

## Branches and versions

- `main` is always releasable. Work happens on short branches such as `feature/drill-export` or `fix/greeting`, which merge into `main` once the tests pass.
- Versions follow semver in `package.json`:
  - patch for fixes (1.0.1);
  - minor for new features (1.1.0);
  - major for breaking changes, such as a data layout change (2.0.0).
- Every production release is a git tag, `v<version>`. The deploy script checks for it.
- Record each release in `CHANGELOG.md`.

## Every change

1. `git switch -c feature/<name>`
2. Make the change in `src/` or `config/`. In VS Code you can ask Claude: `/change <what you want>`.
3. Run `npm test` and wait for green.
4. Run `npm run deploy:dev` and check it on the Dev site. Use your real login and a copy of the real data.
5. Commit, then merge to `main`:
   ```powershell
   git switch main
   git merge --no-ff feature/<name>
   ```

## Release to Test (UAT)

1. On `main`, bump the version in `package.json` and add a `CHANGELOG.md` entry.
2. Commit:
   ```powershell
   git commit -am "Release v1.1.0"
   ```
3. Tag:
   ```powershell
   git tag -a v1.1.0 -m "Release v1.1.0"
   ```
4. Run `npm run deploy:test`.
5. Business sign-off on the Test site. Use the checklist below.

## Release to Prod

1. In Claude Code, run `/release-check`. You can also check by hand: clean tree, tag on HEAD, tests green, and the same commit already on Test.
2. Run:
   ```powershell
   pwsh ./deploy/Deploy-Portfolio.ps1 -Env prod
   ```
   The script refuses if:
   - the tree is dirty;
   - HEAD is not tagged `v<version>`;
   - that commit was not deployed to Test from this machine.

   It then asks you to type `DEPLOY PROD`.
3. Smoke test on Prod: open Home, open the Scorecard, press Refresh now, and ask one question.
4. If something is wrong, roll back. The deploy printed a backup id:
   ```powershell
   pwsh ./deploy/Deploy-Portfolio.ps1 -Env prod -Rollback 20261002-141500
   ```

## UAT checklist (Test site)

- [ ] Home greets you by first name. The glance figures match the Scorecard default view.
- [ ] Project Status defaults to In Progress + Roadmap. Changing the filters updates every table.
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
   pwsh ./deploy/Deploy-Portfolio.ps1 -Env test -UploadData "data/Pipeline Data.xlsx"
   ```
3. **Permissions**:
   - viewers need Read on both libraries;
   - whoever deploys needs Edit on the pages library.
4. **PnP app**: run `deploy/Setup-PnPApp.ps1` once per tenant and put the Client ID in each config. The app needs the delegated SharePoint permission `AllSites.Write`, and an admin may need to grant consent.
5. **Config**: set `sitePath` (and the library names if they differ) in `config/<env>.json`.
