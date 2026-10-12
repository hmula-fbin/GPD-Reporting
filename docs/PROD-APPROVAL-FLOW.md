# Prod release flow

After a change is approved on Dev, a team member runs **`/approve-release`** and nothing else. Claude versions and tags the release, builds the QA and Prod pages, and hands them to SharePoint. The flow then puts the release on QA and emails the approver. Prod changes only when the approver clicks **Approve**.

```
 Team member: /approve-release
   Claude ─ merge, test, version, changelog, tag, push
          ─ build QA + Prod pages into OneDrive\GPD Releases (prod/<id>, qa/<id>, as .aspx.txt)
            That folder is a shortcut to Prod Release Files/GPD Releases, so OneDrive uploads them there
          ─ check that they arrived, then add the release to the GPD Releases list
            (Title, ReleaseId, WhatChanged, Status = Requested)
                                   │
 Power Automate "GPD - Release to Prod"  (starts when the list item appears)
   custom scripts on for QA and Prod, wait until SharePoint has applied it
   Prod: GPD Releases/prod/<id>/*.aspx.txt  →  Prod Release Files/*.aspx
   QA:   GPD Releases/qa/<id>/*.aspx.txt    →  QA Report Pages/*.aspx  (replacing)
   Status = Waiting for approval
   Approver ◀── email / Teams: who sent it, what changed, the pages, a link to QA
      │
      ├── Approve: custom scripts on for Prod (again); each .aspx in Prod Release Files →
      │            copied to Report Pages (replacing the one there), then moved to
      │            Prod Release Backup as Home_2026-10-12_1530.aspx
      │            Status = Live; email to the sender
      └── Reject:  Status = Rejected, with the comments; email to the sender with the comments
   custom scripts off again for Prod
```

## What's where

| Place | What's in it |
|---|---|
| **Prod Release Files** (Prod site) | Folder **GPD Releases**: releases arriving, in `prod/<id>` and `qa/<id>`. Each release owner has it in their OneDrive as a shortcut. At the top of the library: the release waiting for approval, as `.aspx`. Every `.aspx` at the top is published, so a new page is picked up automatically |
| **Report Pages** (Prod site) | The live pages. An approved page replaces the one with the same name, and Version history keeps the old one |
| **Report Pages** (QA site) | The QA copy for the approver to check |
| **Prod Release Backup** (Prod site) | Every released page, with the date and time added: `Home_2026-10-12_1530.aspx` |
| **Approvers** list (Prod site) | Who gets the Approve email: the people in the **Approvers** column of its row. Add or remove people there, no flow change needed. The first one to respond decides |
| **GPD Releases** list (Prod site) | One row per release: version, what changed, who sent it, Status (Requested, Waiting for approval, Live, Rejected, Stopped), approver and comments |

## Before you start

Already done: the **GPD Releases** list with its columns and the **Approvers** list.

- [ ] **The GPD Releases folder:** in **Prod Release Files**, rename the folder **Incoming** to **GPD Releases**. (The **Incoming** folder in the QA site's Report Pages isn't used any more; delete it if you like.)
- [ ] **Everyone who releases adds it to their OneDrive, once:**
  1. If there's already a folder called **GPD Releases** in your own OneDrive, delete it first.
  2. Open Prod Release Files, select the **GPD Releases** folder, then **Add shortcut to My files**.
  3. It appears in File Explorer under *OneDrive - Fortune Brands Innovations* as **GPDReporting - GPD Releases**, and that's where `/package-prod` saves the release. Claude can't copy files into the sites itself (the company blocks that for its connector), so OneDrive's own sync does the upload.

- [ ] **IT/security agree** that the admin account may be used by a flow. If its admin role has to be activated each time (Privileged Identity Management), the flow can't use it: ask for a permanent SharePoint Administrator assignment, or a dedicated account that has one.
- [ ] **Limit Prod Release Files, Prod Release Backup and the GPD Releases list to the team** (Settings, Permissions, Stop inheriting). An `.aspx` in those libraries opens as a working page.
- [ ] **Make the Approvers list editable only by you** (or the people who decide who approves): Settings, Permissions, Stop inheriting, then give the team Read. Anyone who can edit it can make themselves an approver.
- [ ] **Team members** (anyone who may release) have Edit on Prod Release Files and on the GPD Releases list. In Claude, they connect the WorkIQ-SharePoint connector.
- [ ] **You, the flow's owner**, are an owner of the Prod and QA sites. The flow moves, copies and checks the files as you.

## Import the flows (the quick way, about 10 minutes)

Both flows come ready-made as import packages, so you don't have to build them step by step.

1. Build the packages: ask Claude, or run `node tools/make-flow-packages.mjs`. They're saved in `dist/flows/`:
   - **GPD - Approval test.zip** only sends a TEST approval to the Approvers list (see the next section);
   - **GPD - Custom scripts test.zip** only switches custom scripts on and checks they took effect (see *Test custom scripts* below);
   - **GPD - Daily custom scripts.zip** keeps custom scripts on, every day at 6 AM Eastern, for a list of sites (see *Daily custom scripts* below);
   - **GPD - Release to Prod.zip** is the release flow.
2. Go to https://make.powerautomate.com, then **My flows**, then **Import**, then **Import Package (Legacy)**. Choose **Upload**, pick a .zip, then **Import** at the bottom.
3. Under **Related resources**, each connection says *Select during import*. Click each one and pick, or **+ Create new**, the connection named in its row:

   | Row in the import | Pick |
   |---|---|
   | SharePoint - your account | your own SharePoint connection |
   | SharePoint - ADMIN account (custom scripts only) | **+ Create new**, then sign in **as the admin account**. This is the only time anyone types its password |
   | Approvals | your Approvals connection |
   | Office 365 Outlook - your account | your own Outlook connection |
   | Notifications (emails the flow's owner) | your Notifications connection (only the daily flow asks for it) |

   The Approval test has no admin row; the Custom scripts test has no Approvals row.
4. Select **Import**. When it says it's done, open the flow (**My flows**) and select **Turn on** if it's off.
5. Open **GPD - Release to Prod** in the editor once and check that the four **Scripts** steps show the admin account's connection, and every other SharePoint step shows yours.

The imported flows are exactly the steps described below, with the same names, so the hand-built instructions double as a map of what's inside. If an import fails, tell Claude the error message, or build the flow by hand from the steps below.

## Test the approval emails first (optional, about 10 minutes)

A small separate flow that only sends the approval, so you can see what the approvers receive in Outlook and Teams. Nothing is published, and nothing on the sites changes. Import **GPD - Approval test.zip** (above), then go straight to *Run it twice* below. Or build it by hand:

1. Go to https://make.powerautomate.com, then **Create**, then **Instant cloud flow**. **Flow name:** `GPD - Approval test`. Choose **Manually trigger a flow**, then **Create**.
2. Add these, renaming each as shown:

| Add | Name it | Fields |
|---|---|---|
| SharePoint, **Get items** | **Get approvers** | **Site Address:** `https://fbinportal.sharepoint.com/sites/GPDReporting`. **List Name:** Approvers. **Top Count:** `1` |
| **Select** | **Approver emails** | **From:** fx `first(body('Get_approvers')?['value'])?['Approvers']`. Switch **Map** to text mode, then fx `item()?['Email']` |
| Approvals, **Start and wait for an approval** | **Ask for approval** | **Approval type:** Approve/Reject - First to respond. **Title:** `TEST - Release GPD Portfolio Hub to Prod`. **Assigned to:** fx `join(body('Approver_emails'), ';')`. **Details:** `This is a test of the release approval. Nothing will be published.` **Item link:** `https://fbinportal.sharepoint.com/sites/GPDReportingQA/Report%20Pages/Home.aspx`. **Item link description:** `Open it on QA` |
| **Condition** | **Approved** | fx `body('Ask_for_approval')?['outcome']`, **is equal to**, `Approve` |

3. In the **True** branch, add Office 365 Outlook, **Send an email (V2)**:
   - **To:** fx `triggerOutputs()?['headers']?['x-ms-user-email']`
   - **Subject:** `TEST: approved`
   - **Body:** `Approved by` then fx `first(body('Ask_for_approval')?['responses'])?['responder']?['displayName']`
4. In the **False** branch, add the same, with **Subject** `TEST: rejected` and **Body** `Rejected by` [the same fx] `Comments:` then fx `first(body('Ask_for_approval')?['responses'])?['comments']`.
5. **Save**, then **Test**, **Manually**, **Run flow**.

Run it twice:

| Run | Approve from | Choose | You should get |
|---|---|---|---|
| 1 | **Teams**: Activity, or the **Approvals** app on the left | **Approve** | The email "TEST: approved" |
| 2 | **Outlook**: the email "TEST - Release GPD Portfolio Hub to Prod" | **Reject**, with a comment | The email "TEST: rejected", with your comment |

Each approver gets the request both by email and in Teams. Whoever responds first decides, and the other copy then shows it as completed. If the Outlook email has no buttons, use its **Respond** link instead. If nothing appears in Teams, the Approvals app may need to be allowed for you: ask IT. After the test, turn the test flow off or delete it. The real flow below uses the same three approval steps.

## Test custom scripts first (optional, 5 minutes)

The one step that needs the admin account, alone. Import **GPD - Custom scripts test.zip**, then **Run** it. It does what the release flow does first:

- **Scripts on QA** and **Scripts on Prod** switch custom scripts on, as the admin account;
- **Wait for scripts** checks every 30 seconds until SharePoint has applied it, for up to 10 minutes;
- **Scripts ready** then emails you: **Email scripts on** ("TEST: custom scripts are on") if it worked, or **Email scripts failed** ("TEST: custom scripts did not come on"), with what SharePoint answered;
- **Scripts off Prod** switches Prod's off again. QA's stay on until SharePoint's daily reset.

If it worked, the admin connection and the custom-scripts call are fine, and you can drag an .aspx into QA's Report Pages for the rest of the day without asking anyone.

## Daily custom scripts (6 AM Eastern)

Import **GPD - Daily custom scripts.zip** and turn it on. From then on, custom scripts are on every day for the sites in its list, so anyone can drag `.aspx` pages into those sites without asking for them, and the release flow's own Scripts steps find them already on.

- **When:** every day at 6:00 AM Eastern. The schedule's time zone is "Eastern Standard Time", which follows daylight saving.
- **Sites:** the **Sites** step holds the list, for now GPDReporting, GPDReportingSBX and GPDReportingQA. **To add a site**, open the flow, open **Sites**, add a line such as `"https://fbinportal.sharepoint.com/sites/NewSite",` (no `/` at the end), and **Save**. Or ask Claude to add it to `DAILY_SCRIPT_SITES` in `tools/lib/release-flows.mjs` and re-import. The list is kept inside the flow on purpose: only the flow's owners can change where the admin account switches custom scripts on.
- **What it does for each site** (**Each site**):
  - **Scripts off briefly**, then **Scripts on site**, both as the admin account. Switching off and straight back on restarts SharePoint's 24-hour clock at 6 AM. Re-setting a value that's already on might not restart it, and the old clock could then run out just after the run.
  - **Check answer**, then **Note refused** if SharePoint refused it, or **Note failed call** if the call itself failed. Either one adds the site to **Failures**.
- **Any failures** emails you (**Email failures**, through Power Automate's *Send me an email notification*) only when a site failed. No email means every site is on.

**Check with IT/security first.** Microsoft's daily reset exists so that custom scripts are on only when needed, and this flow keeps them on permanently for these sites. Limit the list to the sites that need it.

## Build the flow by hand (instead of importing, about 45 minutes)

The steps refer to each other by name, so **rename every action exactly as shown** in bold. To rename one, click it and edit the name at the top of its panel. Wherever this guide says *fx*, click in the field, choose the expression button (fx), paste the text, and select **Add**.

**Connections.** The flow uses your account for everything except the four **Scripts** steps, which use the admin account. The first time you add a Scripts step, select **Change connection** at the bottom of its panel, then **Add new**, and sign in as the admin account. That's the only time anyone types its password. Its password never goes in the project, a script, the flow's text or a chat.

### 1. Start

1. Go to https://make.powerautomate.com, then **Create**, then **Automated cloud flow**.
2. **Flow name:** `GPD - Release to Prod`. Choose the SharePoint trigger **When an item is created**, then **Create**.
3. In the trigger: **Site Address** = `https://fbinportal.sharepoint.com/sites/GPDReporting`, **List Name** = `GPD Releases`.
4. In the trigger's **Settings**, under **Trigger conditions**, add this, so only a well-formed release starts the flow. (Leave Concurrency control off: Power Automate doesn't allow it on this trigger.)
     ```
     @and(startsWith(triggerBody()?['ReleaseId'], 'v'), not(contains(triggerBody()?['ReleaseId'], '''')), not(contains(triggerBody()?['ReleaseId'], '/')))
     ```

| Add | Name it | Fields |
|---|---|---|
| **Compose** | **Sender** | **Inputs:** fx `triggerBody()?['Author']?['Email']` |
| **Compose** | **Stamp** | **Inputs:** fx `formatDateTime(convertFromUtc(utcNow(), 'Eastern Standard Time'), 'yyyy-MM-dd_HHmm')` |

### 2. The Release steps scope

Add a **Scope** and name it **Release steps**. Everything in this section goes **inside** it.

**2a. Custom scripts on.** Add SharePoint, **Send an HTTP request to SharePoint**, named **Scripts on QA**, using the **admin** connection:
- **Site Address:** *Enter custom value*, then `https://fbinportal-admin.sharepoint.com`
- **Method:** `POST`
- **Uri:** `_vti_bin/client.svc/ProcessQuery`
- **Headers:** `Content-Type` = `text/xml`
- **Body:** the XML below, with `SITE` = `https://fbinportal.sharepoint.com/sites/GPDReportingQA` and `VALUE` = `1`

```xml
<Request xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="GPD release flow">
  <Actions>
    <ObjectPath Id="2" ObjectPathId="1" />
    <ObjectPath Id="4" ObjectPathId="3" />
    <SetProperty Id="5" ObjectPathId="3" Name="DenyAddAndCustomizePages">
      <Parameter Type="Enum">VALUE</Parameter>
    </SetProperty>
    <ObjectPath Id="7" ObjectPathId="6" />
  </Actions>
  <ObjectPaths>
    <Constructor Id="1" TypeId="{268004ae-ef6b-4e9b-8425-127220d84719}" />
    <Method Id="3" ParentId="1" Name="GetSitePropertiesByUrl">
      <Parameters>
        <Parameter Type="String">SITE</Parameter>
        <Parameter Type="Boolean">false</Parameter>
      </Parameters>
    </Method>
    <Method Id="6" ParentId="3" Name="Update" />
  </ObjectPaths>
</Request>
```

This is the same call as `Set-SPOSite -DenyAddAndCustomizePages`. `VALUE` `1` turns custom scripts **on**, and `2` turns them **off**. The site address is typed into the flow on purpose, so the admin connection only ever touches these two sites.

Add a second one, **Scripts on Prod**: the same, with `SITE` = `https://fbinportal.sharepoint.com/sites/GPDReporting`. (Use the action's **...** menu, **Copy**, then **+**, **Paste an action**, and rename it.)

**2b. Wait until SharePoint applies it.** Add a **Do until**, named **Wait for scripts**. Inside it, add:

| Add | Name it | Fields |
|---|---|---|
| **Delay** | **Pause** | Count `30`, Unit `Second` |
| SharePoint, **Send an HTTP request to SharePoint** (your connection) | **Check QA** | **Site Address:** `https://fbinportal.sharepoint.com/sites/GPDReportingQA`. **Method:** `GET`. **Uri:** `_api/web/DoesUserHavePermissions(@v)?@v={'High':'0','Low':'262144'}`. **Headers:** `Accept` = `application/json;odata=nometadata` |
| The same (your connection) | **Check Prod** | As **Check QA**, with Site Address `https://fbinportal.sharepoint.com/sites/GPDReporting` |

**Loop until:** fx `and(equals(body('Check_QA')?['value'], true), equals(body('Check_Prod')?['value'], true))`, then **is equal to**, then fx `true`. Under **Change limits**, set **Count** `20` and **Timeout** `PT15M`.

`262144` is SharePoint's "Add and Customize Pages" permission, which it takes away while custom scripts are off. The check turns true once they're on.

**2c. Put the Prod pages in Prod Release Files.** All three actions use your connection, with **Site Address** `https://fbinportal.sharepoint.com/sites/GPDReporting` and **Headers** `Accept` = `application/json;odata=nometadata`.

| Add | Name it | Method | Uri (fx) |
|---|---|---|---|
| SharePoint HTTP | **List Prod staged** | `GET` | `concat('_api/web/GetFolderByServerRelativeUrl(''/sites/GPDReporting/Prod%20Release%20Files/GPD%20Releases/prod/', triggerBody()?['ReleaseId'], ''')/Files?$select=Name')` |
| **Apply to each**, named **Each Prod file**, over fx `body('List_Prod_staged')?['value']`. Inside it: SharePoint HTTP | **Place Prod page** | `POST` | `concat('_api/web/GetFileByServerRelativeUrl(''/sites/GPDReporting/Prod%20Release%20Files/GPD%20Releases/prod/', triggerBody()?['ReleaseId'], '/', items('Each_Prod_file')?['Name'], ''')/MoveTo(newurl=''/sites/GPDReporting/Prod%20Release%20Files/', replace(items('Each_Prod_file')?['Name'], '.txt', ''), ''',flags=1)')` |
| After the loop: SharePoint HTTP | **Tidy Prod staged** | `POST` | `concat('_api/web/GetFolderByServerRelativeUrl(''/sites/GPDReporting/Prod%20Release%20Files/GPD%20Releases/prod/', triggerBody()?['ReleaseId'], ''')/recycle()')` |

**Place Prod page** moves `Home.aspx.txt` to the top of Prod Release Files as `Home.aspx`, replacing any left from a rejected release (`flags=1`). **Tidy Prod staged** sends the empty folder to the recycle bin.

**2d. Put the QA pages on QA.** The QA pages are on the Prod site too, so this one copies across sites. Same **Site Address** (the Prod site).

| Add | Name it | Method | Uri (fx) |
|---|---|---|---|
| SharePoint HTTP, with header `Accept` = `application/json;odata=nometadata` | **List QA staged** | `GET` | As **List Prod staged**, with `/prod/` changed to `/qa/` |
| **Apply to each**, named **Each QA file**, over fx `body('List_QA_staged')?['value']`. Inside it: SharePoint HTTP | **Place QA page** | `POST` | `_api/SP.MoveCopyUtil.CopyFileByPath(overwrite=@a1)?@a1=true` (type it as it is, no fx) |
| After the loop: SharePoint HTTP, with header `Accept` = `application/json;odata=nometadata` | **Tidy QA staged** | `POST` | As **Tidy Prod staged**, with `/prod/` changed to `/qa/` |

**Place QA page** needs two headers, `Accept` = `application/json;odata=verbose` and `Content-Type` = `application/json;odata=verbose`, and this **Body** (fx):
```
concat('{"srcPath":{"__metadata":{"type":"SP.ResourcePath"},"DecodedUrl":"https://fbinportal.sharepoint.com/sites/GPDReporting/Prod Release Files/GPD Releases/qa/', triggerBody()?['ReleaseId'], '/', items('Each_QA_file')?['Name'], '"},"destPath":{"__metadata":{"type":"SP.ResourcePath"},"DecodedUrl":"https://fbinportal.sharepoint.com/sites/GPDReportingQA/Report Pages/', replace(items('Each_QA_file')?['Name'], '.txt', ''), '"},"options":{"__metadata":{"type":"SP.MoveCopyOptions"},"KeepBoth":false,"ResetAuthorAndCreatedOnCopy":true,"ShouldBypassSharedLocks":true}}')
```
It copies `Home.aspx.txt` to the QA site's Report Pages as `Home.aspx`, replacing the QA page that's there.

**2e. List the pages to publish.**

| Add | Name it | Fields |
|---|---|---|
| SharePoint HTTP (your connection) | **Get staged files** | **Site Address:** the Prod site. **Method:** `GET`. **Uri:** `_api/web/GetFolderByServerRelativeUrl('/sites/GPDReporting/Prod%20Release%20Files')/Files?$select=Name` (only the files at the top, not the GPD Releases folder). **Headers:** `Accept` = `application/json;odata=nometadata` |
| **Filter array** | **Prod pages** | **From:** fx `body('Get_staged_files')?['value']`. Condition: fx `endsWith(toLower(item()?['Name']), '.aspx')`, then **is equal to**, then fx `true` |
| **Select** | **Page names** | **From:** fx `body('Prod_pages')`. Switch **Map** to text mode, then fx `item()?['Name']` |
| SharePoint, **Update item** | **Mark waiting** | **Site Address:** the Prod site. **List Name:** GPD Releases. **Id:** fx `triggerBody()?['ID']`. **Title:** fx `triggerBody()?['Title']`. **Status Value:** `Waiting for approval` |

**2f. Ask for approval.** First read who approves:

| Add | Name it | Fields |
|---|---|---|
| SharePoint, **Get items** | **Get approvers** | **Site Address:** the Prod site. **List Name:** Approvers. **Top Count:** `1` |
| **Select** | **Approver emails** | **From:** fx `first(body('Get_approvers')?['value'])?['Approvers']`. Switch **Map** to text mode, then fx `item()?['Email']` |

Then add Approvals, **Start and wait for an approval**, named **Ask for approval**:
- **Approval type:** Approve/Reject - First to respond
- **Title:** fx `concat('Release GPD Portfolio Hub ', triggerBody()?['Title'], ' to Prod')`
- **Assigned to:** fx `join(body('Approver_emails'), ';')`. Everyone in the Approvers list gets it, and the first one to respond decides.
- **Details:** type the text below. Where it says *[fx ...]*, insert that expression with the fx button. Leave the empty lines in.
  ```
  **Sent by:** [fx triggerBody()?['Author']?['DisplayName']]

  **What changed:**

  [fx triggerBody()?['WhatChanged']]

  **Pages to publish:** [fx join(body('Page_names'), ', ')]

  Check it on QA first (link below). Approve publishes it to Prod. Reject sends your comment back to the sender.
  ```
- **Item link:** `https://fbinportal.sharepoint.com/sites/GPDReportingQA/Report%20Pages/Home.aspx`
- **Item link description:** `Open it on QA`
- Optional: in **Settings**, set **Timeout** to `P7D`.

**2g. Approved?** Add a **Condition**, named **Approved**: fx `body('Ask_for_approval')?['outcome']`, then **is equal to**, then `Approve`.

In the **True** branch:

| Add | Name it | Fields |
|---|---|---|
| Copy of **Scripts on Prod** (admin) | **Scripts on Prod again** | Unchanged. The approval may come after SharePoint's daily reset |
| **Do until** | **Wait for Prod scripts** | Inside it: **Pause again** (Delay 30 seconds), then **Check Prod again** (as **Check Prod**). Loop until fx `body('Check_Prod_again')?['value']` is equal to fx `true`. Count `20`, Timeout `PT15M` |
| **Apply to each** | **Each Prod page** | Over fx `body('Prod_pages')` |
| inside it: SharePoint HTTP (your connection) | **Publish page** | **Site Address:** the Prod site. **Method:** `POST`. **Headers:** `Accept` = `application/json;odata=nometadata`. **Uri:** fx `concat('_api/web/GetFileByServerRelativeUrl(''/sites/GPDReporting/Prod%20Release%20Files/', items('Each_Prod_page')?['Name'], ''')/CopyTo(strnewurl=''/sites/GPDReporting/Report%20Pages/', items('Each_Prod_page')?['Name'], ''',boverwrite=true)')` |
| inside it, after **Publish page**: SharePoint HTTP (your connection) | **Back up page** | **Site Address:** the Prod site. **Method:** `POST`. **Uri:** fx `concat('_api/web/GetFileByServerRelativeUrl(''/sites/GPDReporting/Prod%20Release%20Files/', items('Each_Prod_page')?['Name'], ''')/MoveTo(newurl=''/sites/GPDReporting/Prod%20Release%20Backup/', replace(items('Each_Prod_page')?['Name'], '.aspx', ''), '_', outputs('Stamp'), '.aspx'',flags=1)')` |
| SharePoint, **Update item** | **Mark live** | As **Mark waiting**, with **Status Value** `Live`, **ApprovedBy** fx `first(body('Ask_for_approval')?['responses'])?['responder']?['displayName']`, **ApproverComments** fx `first(body('Ask_for_approval')?['responses'])?['comments']` |
| Office 365 Outlook, **Send an email (V2)** | **Email live** | **To:** fx `outputs('Sender')`. **Subject:** fx `concat('GPD Portfolio Hub ', triggerBody()?['Title'], ' is live on Prod')`. **Body:** see below |

**Email live** body. Type it, inserting the *[fx ...]* parts with the fx button:
```
GPD Portfolio Hub [fx triggerBody()?['Title']] is live on Prod.
Approved by: [fx first(body('Ask_for_approval')?['responses'])?['responder']?['displayName']]
Pages published: [fx join(body('Page_names'), ', ')]
Open it: https://fbinportal.sharepoint.com/sites/GPDReporting/Report%20Pages/Home.aspx
The released files are in Prod Release Backup, with today's date added to their names.
```

In the **False** branch (rejected):

| Add | Name it | Fields |
|---|---|---|
| SharePoint, **Update item** | **Mark rejected** | As **Mark live**, with **Status Value** `Rejected` |
| Office 365 Outlook, **Send an email (V2)** | **Email rejected** | **To:** fx `outputs('Sender')`. **Subject:** fx `concat('GPD Portfolio Hub ', triggerBody()?['Title'], ' was not approved')`. **Body:** see below |

```
Your release [fx triggerBody()?['Title']] was not approved, so Prod was not changed.
Rejected by: [fx first(body('Ask_for_approval')?['responses'])?['responder']?['displayName']]
Comments: [fx first(body('Ask_for_approval')?['responses'])?['comments']]
Fix the change, then run /approve-release again. The new release replaces these pages.
```

### 3. After the scope

Add these three **after** the scope (not inside it), in this order:

| Add | Name it | Fields | Settings, Run after |
|---|---|---|---|
| SharePoint, **Update item** | **Mark stopped** | As **Mark waiting**, with **Status Value** `Stopped` | **Release steps**: tick **Has failed** and **Has timed out** only |
| Office 365 Outlook, **Send an email (V2)** | **Email stopped** | **To:** fx `outputs('Sender')`. **Subject:** fx `concat('GPD release ', triggerBody()?['Title'], ' stopped')`. **Body:** `The release flow stopped at a step that failed, and the steps after it did not run. Open the flow's run history in Power Automate to see which step.` | **Mark stopped**: tick **Is successful** and **Has failed** |
| Copy of **Scripts on Prod** (admin) | **Scripts off Prod** | `VALUE` = `2` | **Email stopped**: tick **Is successful**, **Has failed** and **Is skipped** |

So the sender always hears about a failure, the list shows it, and Prod's custom scripts are switched off at the end whatever happened. QA's are left on for the rest of the day, and SharePoint switches them off within 24 hours.

**Save** the flow. Nobody else needs access to it, because it starts from the list.

## First run

The first release after this change is merged is a safe trial: the pages only differ by their version number. Watch it in **Run history**:
- **Scripts on QA / Prod**: the output body contains `"ErrorInfo":null`.
- **Wait for scripts**: it stops after a few rounds, not after 20.
- **Place QA page** / **Place Prod page**: the pages appear on QA and at the top of Prod Release Files.
- After you approve: **Publish page** and **Back up page** succeed, and the GPD Releases row says Live.

## If something goes wrong

To re-send a release after fixing the cause, ask Claude to run `/package-prod` again (main must still be on the tagged release). It stages a fresh copy with a new id.

| What you see | What to do |
|---|---|
| **Ask for approval** fails, saying Assigned to is empty | The Approvers row has nobody in its **Approvers** column. Add someone, then re-send. |
| No approval email, and the GPD Releases row stays at Requested | Check **Run history**. If there's no run, the trigger condition didn't match: the ReleaseId must start with `v`. |
| **Scripts on QA / Prod** output shows `ErrorInfo` with "Access denied" or "unauthorized" | The admin connection isn't a SharePoint administrator, or its role isn't active. In Power Automate, go to **Data**, then **Connections**. Fix or re-sign the admin SharePoint connection. |
| A connection says it expired, or needs you to sign in again | **Data**, then **Connections**, then **Fix connection**. This happens after a password change or a company sign-in policy. |
| **Wait for scripts** ran 20 times | Custom scripts didn't come on within 10 minutes. Re-send later, or check the site in the SharePoint admin center. |
| **List ... staged** returns no files, or "file not found" | The files never reached Prod Release Files/GPD Releases. Check the sender's **GPD Releases** in OneDrive is the shortcut (not a folder of their own) and has synced, then re-send. |
| **Place QA page** fails | Check its output. If the cross-site copy is refused, replace it with two actions: SharePoint **Copy file** (to the QA site, folder `/Report Pages`, If another file is already there: Replace), then a QA-site HTTP `MoveTo` that renames `Home.aspx.txt` to `Home.aspx`. |
| **Place**, **Publish page** or **Back up page** fails with "blocked" or 403 | Custom scripts switched off in between. Re-send. |
| Prod looks wrong after a release | In Report Pages, select **...** next to each page, then **Version history**, then restore the previous version. The released files are also in Prod Release Backup. |

## Keep it safe

- Who approves comes from the Approvers list, so keep that list editable only by you. A release sender can't choose their approver.
- Only the four **Scripts** actions use the admin connection. Their site addresses are typed into the flow, so nothing in the list or the files can point them anywhere else.
- The trigger condition refuses a ReleaseId containing `'` or `/`, so a list entry can't redirect the file moves. Keep the list limited to the team.
- Only add co-owners who may use the admin account. Co-owners can edit the flow and use all its connections.
- The flow acts as its owner. If the owner leaves the company, move it to a service account, or another owner, first.
