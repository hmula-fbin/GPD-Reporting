---
description: (Release owner) Approve a change tested on Dev and prepare it for Prod
---
Prepare a release from the approved change branch: $ARGUMENTS
(If no branch was given, list the change branches with `git branch -r` and ask which ones were approved on Dev.)

1. Run the /get-latest steps on main.
2. `git merge --no-ff origin/<branch>` for each approved branch. Resolve conflicts with the user.
3. Run `npm test`. Stop if anything fails.
4. Ask: is this a fix (patch) or a new feature (minor)? Bump `version` in package.json accordingly.
5. Add a CHANGELOG.md entry at the top for the new version (today's date, plain-English bullets of what users will notice).
6. `git commit -am "Release v<version>"` and `git tag -a v<version> -m "Release v<version>"`.
7. `git push origin main --follow-tags`.
8. Tell the release owner the next two steps, which they run themselves:
   a) VS Code task "Deploy: dev" (puts this exact release on Dev - the Prod deploy checks for it), quick look on Dev;
   b) VS Code task "Deploy: prod (asks for confirmation)" and type DEPLOY PROD.
Never run the prod deploy yourself.
