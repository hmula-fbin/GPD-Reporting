---
description: Send the tagged release to the Prod release flow (QA first, then Prod on the approver's click)
---
Send the approved release to the release flow (docs/PROD-APPROVAL-FLOW.md). You stage files and create the release request; the flow and the approver do the rest. Never upload to Report Pages yourself, never run a prod deploy, never ask for or handle the admin password.

**SharePoint targets** (WorkIQ-SharePoint connector). If an id stops working, look it up again by name.

| What | Id |
|---|---|
| Prod site (/sites/GPDReporting) | `fbinportal.sharepoint.com,8bbe9dc9-2b31-462e-bbec-58d48c8ddb81,5ccc1df4-c77e-40a3-9110-f8c1e0d55828` |
| QA site (/sites/GPDReportingQA) | `fbinportal.sharepoint.com,d51d4042-1c9f-4ed2-add5-a0d4138db0d7,9fe2ce25-ef9d-47de-add3-ce0b26c657ec` |
| Prod site, library "Prod Release Files" | `b!yZ2-izErLka77FjUjI3bgfQdzFx-x6NAkRD4weDVWCiKI7rkhVkMSLDu88lBBoGk`; releases arrive in its folder "GPD Releases" `01BXSQ44NCPY5IIQDUNJGJ7O6NZSXRJFE4` |
| Prod site, list "GPD Releases" | `6d7bbcf1-a82a-4917-ba85-ca066854cb89` |
| Prod site, list "Approvers" (read only: people column `Approvers`) | `573eb5b7-c5b8-479c-9444-5be2b004d720` |

1. Check: on `main`, clean tree, HEAD tagged v<version> (package.json). If not, say exactly what to do (usually /approve-release).
2. Run `node tools/package.mjs --env prod` (the user approves the command). It runs the tests, builds the QA and Prod pages, and saves them in the user's OneDrive folder `GPD Releases` as `prod/<id>/<page>.aspx.txt` and `qa/<id>/<page>.aspx.txt`. That folder is a shortcut to Prod Release Files/GPD Releases, so OneDrive uploads them to the Prod site. It also writes `dist/release.json` (id, title, whatChanged, and for prod and qa: folder, files with bytes). If it stops because there's no GPD Releases folder, tell the user how to add the shortcut (docs/PROD-APPROVAL-FLOW.md, Before you start).
3. Read `dist/release.json`.
4. Wait until the files have arrived on the site (the connector can't copy them itself: its copies are refused). Browse with `getFolderChildren` on the Prod Release Files library: the GPD Releases folder id lists `prod` and `qa`, each of those lists the `<id>` folder, and that lists the files. (`getFileOrFolderMetadataByUrl` is refused with 403 on site addresses, so don't use it.) They're ready when every file in release.json is there with the same `size` as its `bytes` (folder sizes read 0, so check the files). Until then, wait about 30 seconds and check again. After 10 minutes, stop: the user's GPD Releases is probably a folder of their own rather than the shortcut, or OneDrive isn't syncing.
5. Create the release request with `createListItem` (Prod site, list "GPD Releases"), fields: `Title` = title, `ReleaseId` = id, `WhatChanged` = whatChanged, `Status` = `Requested`. This starts the flow.
6. Read the Approvers list (`listListItems`) to name who will be asked. Never edit that list. Tell the user, in plain words: release <title> is sent. Within a few minutes the flow switches custom scripts on and puts it on QA (https://fbinportal.sharepoint.com/sites/GPDReportingQA/Report%20Pages/Home.aspx), then emails the approvers (name them). On Approve it goes live on Prod; on Reject they get the approver's comments by email. Progress: the GPD Releases list (https://fbinportal.sharepoint.com/sites/GPDReporting/Lists/GPD%20Releases), Status column.

**Rehearsal** (when the user asks to test or rehearse the hand-off, from any branch): skip step 1 and run `node tools/package.mjs --env prod --rehearsal --skip-tests` in step 2. Its id starts with `rehearsal-` and its title with "Rehearsal", and the flow's trigger only accepts ids starting with `v`, so nothing is published. In step 5, leave Status empty. In step 6, say it was a rehearsal: the files are in Prod Release Files/GPD Releases (prod/<id>, qa/<id>) and the row is in GPD Releases, all safe to delete.

If the WorkIQ-SharePoint tools aren't available, or a step is refused, do steps 1–3, then ask the user to check that Prod Release Files/GPD Releases has prod/<id> and qa/<id>, and to add the row themselves: in the GPD Releases list, **New**, with Title <title>, ReleaseId <id>, WhatChanged (paste it), Status Requested.
