---
description: (Release owner) Send the tagged release to the approver; it goes to Prod when they click Approve
---
Send the approved release for sign-off through the release flow (docs/PROD-APPROVAL-FLOW.md). Do not upload anything yourself.

1. Check: on `main`, clean tree, HEAD tagged v<version> (package.json), `git config user.email` is in `releaseOwners`, and `releaseApprovers` in config/prod.json holds a real address (not CHANGE-ME). If anything fails, say exactly what to do (usually /approve-release, or ask for the approver's address and set it on a change branch).
2. Run `node tools/send-for-approval.mjs` (the user approves the command). It runs the tests, builds the Dev and Prod pages and puts them in the "GPD Releases" folder of the user's OneDrive, which starts the flow.
3. Tell the user, in plain words:
   - within about 5 minutes the flow puts this version on Dev and sends the approver an Approve button, by email and in Teams;
   - on Approve, it turns custom scripts on for Prod, uploads the pages (adding missing ones, replacing the rest), checks their sizes, turns custom scripts off again and emails them both;
   - on Reject, they get the approver's comment by email, and Prod is not touched.
4. If no approval request arrives within 15 minutes, point them to "If something goes wrong" in docs/PROD-APPROVAL-FLOW.md.
Never run a prod deploy yourself, and never ask for or handle the admin account's password: it is typed only into Microsoft's sign-in window when the flow's connection is created.
