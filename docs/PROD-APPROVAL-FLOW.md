# One-click Prod release (approval flow)

Once this is set up, a release to Prod takes one command from you and one click from the approver:

```
 You (release owner)                      Power Automate flow "GPD - release to Prod"
 /approve-release   (merge, version, tag)
 /send-for-approval ───▶ OneDrive folder "GPD Releases"
                           │  the flow starts within about 5 minutes
                           ▼
                         custom scripts on for Dev, the 3 pages uploaded to Dev
                           ▼
 Approver (Priya) ◀───── Approve / Reject button, in Outlook and in Teams (Approvals)
   │ Approve                                   │ Reject
   ▼                                           ▼
 custom scripts on for Prod                    email to you with the comment;
 the 3 pages uploaded to Prod:                 Prod is not touched
   missing ones added, existing ones replaced
 size of every page checked
 custom scripts off again for Prod
 email to you and the approver: "live on Prod"
```

The flow signs in with two accounts, once each, when you create its connections:

- **Your account** does everything on the sites: it reads the pages from your OneDrive, uploads them, sends the approval and the emails.
- **The admin account** does only the three "Scripts" steps, which switch custom scripts on and off. Its password is typed only into Microsoft's sign-in window when you create that connection. It never goes in the project, a script, the flow's text or a chat.

All the connectors used (OneDrive for Business, SharePoint, Approvals, Office 365 Outlook) are standard, so no premium licence is needed.

## Before you start

- [ ] **IT/security agree** that the admin account may be used by a flow. If its admin role has to be activated each time (Privileged Identity Management), the flow can't use it: ask for a permanent SharePoint Administrator assignment, or a dedicated account that has one.
- [ ] **Your account** can upload the pages to both libraries today (the rights you use to drag the files).
- [ ] **OneDrive is syncing** on your PC. In File Explorer, open *OneDrive - Fortune Brands Innovations* and create a folder named **GPD Releases**.
- [ ] **The approver's address** is in `config/prod.json`, `"releaseApprovers": ["name@moen.com"]`. Ask Claude to set it. `/send-for-approval` refuses to run until it's there.

## Build the flow (once, about 40 minutes)

The steps refer to each other by name, so **rename every action exactly as shown** in bold. To rename one, click it and edit the name at the top of its panel. Wherever this guide says *fx*, click in the field, choose the expression button (fx), paste the text, and select **Add**.

### 1. The trigger

1. Go to https://make.powerautomate.com, then **Create**, then **Automated cloud flow**.
2. **Flow name:** `GPD - release to Prod`. Search for and choose **When a file is created (properties only)** from **OneDrive for Business**. Select **Create**.
3. In the trigger:
   - **Folder:** `/GPD Releases`
   - **Include subfolders:** No (if the option is shown).
4. Open the trigger's **Settings**. Under **Trigger conditions**, add:
   ```
   @endsWith(triggerBody()?['Name'], '.json')
   ```

### 2. Read the release request

| Add | Name it | Fields |
|---|---|---|
| OneDrive for Business, **Get file content** | **Get release request** | **File:** fx `triggerBody()?['Id']` |
| **Compose** (Data Operation) | **Release** | **Inputs:** fx `json(string(body('Get_release_request')))` |

### 3. The Release steps scope

Add a **Scope** and name it **Release steps**. Everything in this section goes **inside** it, in this order.

**3a. Give OneDrive a moment.** Add a **Delay**, named **Wait for OneDrive**, with Count `2` and Unit `Minute`.

**3b. Custom scripts on for Dev.** Add SharePoint, **Send an HTTP request to SharePoint**, named **Scripts on Dev**.
- **Connection:** the admin account. At the bottom of the action's panel, select **Change connection**, then **Add new**, and sign in as the admin account. This is the only time you type its password.
- **Site Address:** choose *Enter custom value*, then `https://fbinportal-admin.sharepoint.com`
- **Method:** `POST`
- **Uri:** `_vti_bin/client.svc/ProcessQuery`
- **Headers:** `Content-Type` = `text/xml`
- **Body:** the XML below, with `SITE` = `https://fbinportal.sharepoint.com/sites/GPDReportingsbx` and `VALUE` = `1`

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

This is the same call as `Set-SPOSite -DenyAddAndCustomizePages`. `VALUE` `1` turns custom scripts **on**, and `2` turns them **off**. The site address is typed into the flow on purpose: the admin connection can only ever touch these two sites.

**3c. Wait until SharePoint applies it.** Add a **Do until**, named **Wait for scripts Dev**. Inside it, add:

| Add | Name it | Fields |
|---|---|---|
| **Delay** | **Pause Dev** | Count `30`, Unit `Second` |
| SharePoint, **Send an HTTP request to SharePoint** (your own connection) | **Check scripts Dev** | **Site Address:** `https://fbinportal.sharepoint.com/sites/GPDReportingsbx`. **Method:** `GET`. **Uri:** `_api/web/DoesUserHavePermissions(@v)?@v={'High':'0','Low':'262144'}`. **Headers:** `Accept` = `application/json;odata=nometadata` |

Set the loop's condition:
- **Loop until:** fx `body('Check_scripts_Dev')?['value']`, then **is equal to**, then fx `true`.
- Under **Change limits**: **Count** `20`, **Timeout** `PT15M`.

`262144` is the "Add and Customize Pages" permission, which SharePoint takes away while custom scripts are off. The check turns true once they're on.

**3d. Upload the Dev pages.** Add an **Apply to each**, named **Each Dev page**, over fx `outputs('Release')?['dev']?['files']`. Inside it, add:

| Add | Name it | Fields |
|---|---|---|
| OneDrive for Business, **Get file content using path** | **Get Dev page** | **File Path:** fx `items('Each_Dev_page')?['source']` |
| SharePoint, **Send an HTTP request to SharePoint** (your own connection) | **Upload Dev page** | **Site Address:** *Enter custom value*, fx `outputs('Release')?['dev']?['siteUrl']`. **Method:** `POST`. **Uri:** fx `items('Each_Dev_page')?['uploadUri']`. **Headers:** `Accept` = `application/json;odata=nometadata`. **Body:** fx `body('Get_Dev_page')` |
| **Condition** | **Dev size OK** | fx `int(string(body('Upload_Dev_page')?['Length']))`, **is equal to**, fx `items('Each_Dev_page')?['bytes']` |

The upload address ends in `overwrite=true`, so a page that isn't in the library yet is added, and one that is gets replaced, which also saves a new version in its history.

In the **False** branch of **Dev size OK**, add:
- Office 365 Outlook, **Send an email (V2)**, named **Dev size email**. **To:** fx `outputs('Release')?['submittedBy']`. **Subject:** fx `outputs('Release')?['failedSubject']`. **Body:** fx `outputs('Release')?['failedHtml']`.
- **Terminate**, named **Stop Dev**. **Status:** Failed. **Message:** `A Dev page did not upload in full.`

**3e. Ask for approval.** After **Each Dev page** (still inside the scope), add Approvals, **Start and wait for an approval**, named **Ask for approval**:
- **Approval type:** Approve/Reject - First to respond
- **Title:** fx `outputs('Release')?['approvalTitle']`
- **Assigned to:** fx `outputs('Release')?['approvers']`
- **Details:** fx `outputs('Release')?['approvalDetails']`
- **Item link:** fx `outputs('Release')?['devHomeUrl']`
- **Item link description:** `Open it on Dev`

The approver gets an email with Approve and Reject buttons, and the same request in Teams (Approvals). Either one works.

**3f. Approved?** Add a **Condition**, named **Approved**: fx `body('Ask_for_approval')?['outcome']`, then **is equal to**, then `Approve`.

In the **True** branch, add the Prod half. It's the Dev steps again, with Prod names:

| Add | Name it | Fields |
|---|---|---|
| SharePoint HTTP (**admin** connection) | **Scripts on Prod** | As **Scripts on Dev**, with `SITE` = `https://fbinportal.sharepoint.com/sites/GPDReporting` and `VALUE` = `1` |
| **Do until** | **Wait for scripts Prod** | Inside it: **Pause Prod** (Delay 30 seconds), then **Check scripts Prod** (as **Check scripts Dev**, with Site Address `https://fbinportal.sharepoint.com/sites/GPDReporting`). Loop until fx `body('Check_scripts_Prod')?['value']` is equal to fx `true`. Count `20`, Timeout `PT15M` |
| **Apply to each** | **Each Prod page** | Over fx `outputs('Release')?['prod']?['files']`. Inside it: **Get Prod page** (path fx `items('Each_Prod_page')?['source']`), then **Upload Prod page** (Site Address fx `outputs('Release')?['prod']?['siteUrl']`, Uri fx `items('Each_Prod_page')?['uploadUri']`, Body fx `body('Get_Prod_page')`, same Method and header as Dev), then **Prod size OK** (fx `int(string(body('Upload_Prod_page')?['Length']))` is equal to fx `items('Each_Prod_page')?['bytes']`). In its False branch: **Prod size email** and **Stop Prod**, as for Dev |
| SharePoint HTTP (**admin** connection) | **Scripts off Prod** | As **Scripts on Prod**, with `VALUE` = `2` |
| Office 365 Outlook, **Send an email (V2)** | **Email live** | **To:** fx `outputs('Release')?['notify']`. **Subject:** fx `outputs('Release')?['doneSubject']`. **Body:** fx `outputs('Release')?['doneHtml']` |

In the **False** branch (rejected), add Office 365 Outlook, **Send an email (V2)**, named **Email rejected**:
- **To:** fx `outputs('Release')?['submittedBy']`
- **Subject:** fx `outputs('Release')?['rejectedSubject']`
- **Body:** fx `concat(outputs('Release')?['rejectedHtml'], '<p>Comment: ', coalesce(first(body('Ask_for_approval')?['responses'])?['comments'], 'none'), '</p>')`

Dev's custom scripts are left on for the rest of the day, so the team can still upload to Dev. SharePoint switches them off within 24 hours.

### 4. Tell you if a step fails

**After** the scope (not inside it), add Office 365 Outlook, **Send an email (V2)**, named **Email stopped**:
- **To:** fx `outputs('Release')?['submittedBy']`
- **Subject:** fx `outputs('Release')?['failedSubject']`
- **Body:** fx `outputs('Release')?['failedHtml']`
- In its **Settings**, under **Run after**, select **Release steps**. Tick **Has failed** and **Has timed out**, and untick **Is successful**.

**Save** the flow.

**Tip:** the Prod half is the Dev half with new names. You can copy an action (its **...** menu, **Copy**) and paste it with **+**, then **Paste an action**. Rename every pasted action, and change `Dev` to `Prod` in its expressions.

## First run

`/send-for-approval` needs main, clean and tagged, like `/package-prod`. The first release after this change is merged is a safe trial: the pages only differ by their version number.

1. Run `/send-for-approval`.
2. In Power Automate, open the flow, then **Run history**, and watch the run:
   - **Scripts on Dev**: its output body contains `"ErrorInfo":null`. If it shows an error, see the table below.
   - **Each Dev page**: every **Dev size OK** is True.
3. Open the Dev pages from the approval email and check them.
4. Let the approver click **Approve**, then check that the email "is live on Prod" arrives and the Prod pages open.

## Every release after that

1. `/approve-release change/<name>`: merges, versions, tags and shares the release (as before).
2. `/send-for-approval`: runs the tests, builds Dev and Prod, and puts them in OneDrive. You can also use **Run Task**, then **Release: send for approval (release owner)**.
3. The approver clicks **Approve**, and you get the "live on Prod" email. That's it.

You can delete the old `GPD Releases/v...` folders and `.json` files whenever you like. The flow only reads the one it was started for.

## If something goes wrong

To re-run a failed run, open it in **Run history** and choose **Resubmit**. It starts again from the top and sends a new approval.

| What you see | What to do |
|---|---|
| No approval request 15 minutes after `/send-for-approval` | Check that OneDrive has finished syncing (green ticks in *GPD Releases*). Then check **Run history**. If there's no run at all, check the trigger's folder and trigger condition. |
| **Release** shows `$content`, or later steps say a property can't be found | In **Release**, change the expression to `json(base64ToString(body('Get_release_request')?['$content']))`. |
| **Get Dev page** says the file was not found | OneDrive hadn't finished uploading the pages. Resubmit the run. |
| **Scripts on Dev / Prod** output shows `ErrorInfo` with "Access denied" or "unauthorized" | The admin connection isn't a SharePoint administrator, or its role isn't active. In Power Automate, go to **Data**, then **Connections**. Fix or re-sign the admin SharePoint connection. |
| A connection says it expired, or needs you to sign in again | **Data**, then **Connections**, then **Fix connection**. This happens after a password change or a company sign-in policy. |
| **Upload ... page** fails with "blocked", "access denied" or 403 after the wait loop ran 20 times | Custom scripts didn't come on within 10 minutes. Resubmit later, or check the site in the SharePoint admin center. |
| A "size" email arrives | A page didn't upload in full. Open **Upload ... page** in the run to see what SharePoint returned, then Resubmit. If it repeats, tell Claude what that step shows. |
| Prod looks wrong after a release | In the Prod library, select **...** next to each page, then **Version history**, then restore the previous version. The manual route (`/package-prod` and drag) still works too. |

## Keep it safe

- Only the three **Scripts** actions use the admin connection. Their site addresses are typed into the flow, so the release file can't point them anywhere else.
- Don't share the flow or add co-owners unless they may use the admin account. Anyone who can edit the flow can use its connections.
- The trigger watches a folder in **your** OneDrive, and `/send-for-approval` only runs for a release owner, on a tagged main. So only you can start a release.
