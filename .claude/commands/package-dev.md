---
description: Build the Dev pages for drag-and-drop upload to the Dev SharePoint site
---
Prepare the current change for manual upload to the Dev site.

1. `git status`: if there are uncommitted changes, recommend /share-change first so Dev shows a saved change. Continue only if the user agrees.
2. Run `node tools/package.mjs --env dev`. It runs the tests, builds dist/dev and writes UPLOAD-STEPS.txt. On Windows it opens the folder and the SharePoint library.
3. Repeat the upload steps to the user in plain words:
   - custom scripts must be on for the site today;
   - drag Home.aspx and Portfolio_Scorecard.aspx into the library and choose Replace;
   - open both links to check.
4. Write a short Teams message for the requester with the two Dev links and "please reply OK or tell me what to adjust".
Remind them: Dev is shared, so say in the team chat before uploading.
