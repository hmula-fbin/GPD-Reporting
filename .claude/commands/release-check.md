---
description: Check whether the current commit is ready to go to Test or Prod
---
Check release readiness for the GPD Portfolio Hub. Do not deploy anything.

1. `git status` - is the tree clean? Which branch?
2. Version in package.json, and whether HEAD is tagged v<version>.
3. `node build/build.mjs --env all` - any warnings (CHANGE-ME site paths, missing pnpClientId)?
4. `npm test` - pass/fail summary.
5. Read deploy/deployments.log (if present): what version is on dev/test/prod now?
6. Summarise CHANGELOG.md entries since the last tag.
Report a short go / no-go table for Test and for Prod, with the exact commands the user should run next.
