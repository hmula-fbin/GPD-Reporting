---
description: (Release owner) Build the Prod pages for drag-and-drop upload
---
Prepare the approved release for manual upload to Prod. Do not upload anything yourself.

1. Check: on `main`, clean tree, HEAD tagged v<version> (package.json), and `git config user.email` is in `releaseOwners` in config/prod.json. If anything fails, say exactly what to do (usually /approve-release).
2. Ask the user to confirm that this exact version was uploaded to Dev and approved there. Read deploy/deployments.log for a dev line with the same version and commit, and mention it if it's missing.
3. Run `node tools/package.mjs --env prod` (the user approves the command).
4. Walk them through UPLOAD-STEPS.txt:
   - custom scripts must be on for the Prod site today;
   - drag both files into the library and choose Replace;
   - open both pages, press Refresh now, and ask one question.
5. Remind them how to undo: Version history > Restore in the library.
