---
description: Put the current change on the Dev SharePoint site for testing
---
Deploy the current working copy to the Dev site so the requester can test it.

1. `git status`: if there are uncommitted changes, recommend /share-change first (Dev should show a saved change). Continue only if the user agrees.
2. Run: `pwsh -NoProfile -ExecutionPolicy Bypass -File deploy/Deploy-Portfolio.ps1 -Env dev`
   It runs the tests, builds, opens a Microsoft sign-in window (tell the user to complete it), backs up what is on Dev, and uploads.
3. Report the Home and Scorecard links the script printed, and the backup id.
4. Write a short message the user can paste into Teams for the requester:
   what changed, the two Dev links, "please reply OK or tell me what to adjust".
Remind the user: Dev is shared - it now shows THIS change; tell the team before someone else deploys over it.
