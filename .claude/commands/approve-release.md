---
description: Approve a change tested on Dev and prepare it for Prod (anyone on the team)
---
Prepare a release from the approved change branch: $ARGUMENTS
(If no branch was given, list the change branches with `git branch -r` and ask which ones were approved on Dev.)

1. Run the /get-latest steps on main.
2. `git merge --no-ff origin/<branch>` for each approved branch. Resolve conflicts with the user.
3. Run `npm test`. Stop if anything fails.
4. Ask: is this a fix (patch) or a new feature (minor)? Bump `version` in package.json accordingly.
5. Add a CHANGELOG.md entry at the top for the new version (today's date, plain-English bullets of what users will notice).
6. `git commit -am "Release v<version>"` and `git tag -a v<version> -m "Release v<version>"`.
7. If there is an `origin`, run `git push origin main --follow-tags`.
8. Carry straight on with the /package-prod steps (.claude/commands/package-prod.md): build, stage in OneDrive (synced to Prod Release Files/GPD Releases), check the files arrived and add the release to the GPD Releases list. That starts the release flow, which puts it on QA, emails the approver and, on Approve, publishes to Prod (docs/PROD-APPROVAL-FLOW.md). Finish with the plain-words summary from its step 6.
Never run the prod deploy yourself: Prod changes only when the approver clicks Approve.
