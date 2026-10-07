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
7. If there is an `origin`, run `git push origin main --follow-tags`.
8. Tell the release owner the next two steps, which they run themselves:
   a) /package-dev, then drag all three page files into the Dev library. This puts this exact release on Dev; take a quick look;
   b) /package-prod, then drag all three page files into the Prod library (custom scripts must be on that day).
   If the automatic deploy is set up (pnpClientId filled in), the tasks "Deploy: dev" and "Deploy: prod" do the uploads instead.
Never run the prod deploy yourself.
