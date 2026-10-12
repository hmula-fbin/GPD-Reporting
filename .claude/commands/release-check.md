---
description: Check whether the current commit is ready to go to Prod
---
Check release readiness for the GPD Portfolio Hub. Do not deploy anything.

1. `git status` and branch: Prod needs `main` with a clean tree.
2. Version in package.json, and whether HEAD is tagged v<version>.
3. `node build/build.mjs --env all`: any warnings (CHANGE-ME site paths, missing pnpClientId)?
4. `npm test`: pass/fail.
5. Anyone on the team may release; Prod changes only when the approver clicks Approve in the release flow.
6. Read deploy/deployments.log (if present): last deploys per environment from this machine.
7. Summarise CHANGELOG.md entries since the previous tag.
Report a short go / no-go table, and the exact next steps. The next steps are /package-prod and the flow "GPD - Release to Prod" (docs/PROD-APPROVAL-FLOW.md).
