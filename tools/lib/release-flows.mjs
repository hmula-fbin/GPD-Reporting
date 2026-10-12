/* The two Power Automate flows as importable definitions (docs/PROD-APPROVAL-FLOW.md describes the same steps by
   hand, with the same action names): "GPD - Approval test" and "GPD - Release to Prod". Only the four Scripts
   actions use the admin connection (shared_sharepointonline_1), and their site addresses are fixed here. */

const PROD = "https://fbinportal.sharepoint.com/sites/GPDReporting";
const QA = "https://fbinportal.sharepoint.com/sites/GPDReportingQA";
const ADMIN = "https://fbinportal-admin.sharepoint.com";
const RELEASES_LIST = "6d7bbcf1-a82a-4917-ba85-ca066854cb89";     /* Prod site, list "GPD Releases" */
const APPROVERS_LIST = "573eb5b7-c5b8-479c-9444-5be2b004d720";    /* Prod site, list "Approvers" */
const QA_HOME = QA + "/Report%20Pages/Home.aspx";

/* The connections a flow can use; the import asks for one connection per entry it uses. */
export const CONNECTIONS = {
  shared_sharepointonline: { api: "shared_sharepointonline", apiName: "SharePoint", label: "SharePoint - your account" },
  shared_sharepointonline_1: { api: "shared_sharepointonline", apiName: "SharePoint", label: "SharePoint - ADMIN account (custom scripts only)" },
  shared_approvals: { api: "shared_approvals", apiName: "Approvals", label: "Approvals" },
  shared_office365: { api: "shared_office365", apiName: "Office 365 Outlook", label: "Office 365 Outlook - your account" },
  shared_flowpush: { api: "shared_flowpush", apiName: "Notifications", label: "Notifications (emails the flow's owner)" },
};

/* Sites the daily flow keeps custom scripts on for. Add a site here (or in the flow's Sites step) to include it. */
export const DAILY_SCRIPT_SITES = [
  "https://fbinportal.sharepoint.com/sites/GPDReporting",
  "https://fbinportal.sharepoint.com/sites/GPDReportingSBX",
  "https://fbinportal.sharepoint.com/sites/GPDReportingQA",
];

const NOMETA = { Accept: "application/json;odata=nometadata" };
const VERBOSE = { Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose" };
const ID = "triggerBody()?['ReleaseId']";
const RESPONDER = "first(body('Ask_for_approval')?['responses'])?['responder']?['displayName']";
const COMMENTS = "first(body('Ask_for_approval')?['responses'])?['comments']";

const op = (conn, operationId, parameters, type = "OpenApiConnection") => ({
  type,
  inputs: { host: { connectionName: conn, operationId, apiId: "/providers/Microsoft.PowerApps/apis/" + CONNECTIONS[conn].api }, parameters, authentication: "@parameters('$authentication')" },
});
const sp = (operationId, parameters) => op("shared_sharepointonline", operationId, parameters);
const http = (site, method, uri, { headers, body, admin = false } = {}) => op(admin ? "shared_sharepointonline_1" : "shared_sharepointonline", "HttpRequest", {
  dataset: site, "parameters/method": method, "parameters/uri": uri,
  ...(headers && { "parameters/headers": headers }), ...(body !== undefined && { "parameters/body": body }),
});
const email = (to, subject, body) => op("shared_office365", "SendEmailV2", { "emailMessage/To": to, "emailMessage/Subject": subject, "emailMessage/Body": body, "emailMessage/Importance": "Normal" });
const compose = (inputs) => ({ type: "Compose", inputs });
const pause = { type: "Wait", inputs: { interval: { count: 30, unit: "Second" } } };
const until = (expression, actions) => ({ type: "Until", expression, limit: { count: 20, timeout: "PT15M" }, actions });
const foreach = (items, actions) => ({ type: "Foreach", foreach: items, actions, runtimeConfiguration: { concurrency: { repetitions: 1 } } });
const ifApproved = (yes, no) => ({ type: "If", expression: { and: [{ equals: ["@body('Ask_for_approval')?['outcome']", "Approve"] }] }, actions: yes, else: { actions: no } });

/* Each action runs after the one before it; the first runs at the start of its scope. */
const seq = (...pairs) => Object.fromEntries(pairs.map(([name, a], i) => [name, { ...a, runAfter: i ? { [pairs[i - 1][0]]: ["Succeeded"] } : {} }]));

/* Same call as Set-SPOSite -DenyAddAndCustomizePages: 1 turns custom scripts on, 2 turns them off. */
export const scriptsXml = (site, value) => `<Request xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="GPD release flow">
  <Actions>
    <ObjectPath Id="2" ObjectPathId="1" />
    <ObjectPath Id="4" ObjectPathId="3" />
    <SetProperty Id="5" ObjectPathId="3" Name="DenyAddAndCustomizePages">
      <Parameter Type="Enum">${value}</Parameter>
    </SetProperty>
    <ObjectPath Id="7" ObjectPathId="6" />
  </Actions>
  <ObjectPaths>
    <Constructor Id="1" TypeId="{268004ae-ef6b-4e9b-8425-127220d84719}" />
    <Method Id="3" ParentId="1" Name="GetSitePropertiesByUrl">
      <Parameters>
        <Parameter Type="String">${site}</Parameter>
        <Parameter Type="Boolean">false</Parameter>
      </Parameters>
    </Method>
    <Method Id="6" ParentId="3" Name="Update" />
  </ObjectPaths>
</Request>`;
const scripts = (site, value) => http(ADMIN, "POST", "_vti_bin/client.svc/ProcessQuery", { headers: { "Content-Type": "text/xml" }, body: scriptsXml(site, value), admin: true });
/* 262144 = "Add and Customize Pages", which SharePoint takes away while custom scripts are off. */
const check = (site) => http(site, "GET", "_api/web/DoesUserHavePermissions(@v)?@v={'High':'0','Low':'262144'}", { headers: NOMETA });

const STAGED = (env) => "/sites/GPDReporting/Prod%20Release%20Files/GPD%20Releases/" + env + "/";
const listStaged = (env) => http(PROD, "GET", `@concat('_api/web/GetFolderByServerRelativeUrl(''${STAGED(env)}', ${ID}, ''')/Files?$select=Name')`, { headers: NOMETA });
const tidyStaged = (env) => http(PROD, "POST", `@concat('_api/web/GetFolderByServerRelativeUrl(''${STAGED(env)}', ${ID}, ''')/recycle()')`, { headers: NOMETA });

const approverSteps = [
  ["Get_approvers", sp("GetItems", { dataset: PROD, table: APPROVERS_LIST, $top: 1 })],
  ["Approver_emails", { type: "Select", inputs: { from: "@first(body('Get_approvers')?['value'])?['Approvers']", select: "@item()?['Email']" } }],
];
const askForApproval = (title, details) => op("shared_approvals", "StartAndWaitForAnApproval", {
  approvalType: "Basic",                                          /* Approve/Reject - First to respond */
  "WebhookApprovalCreationInput/title": title,
  "WebhookApprovalCreationInput/assignedTo": "@{join(body('Approver_emails'), ';')}",
  "WebhookApprovalCreationInput/details": details,
  "WebhookApprovalCreationInput/itemLink": QA_HOME,
  "WebhookApprovalCreationInput/itemLinkDescription": "Open it on QA",
  "WebhookApprovalCreationInput/enableNotifications": true,
  "WebhookApprovalCreationInput/enableReassignment": true,
}, "OpenApiConnectionWebhook");

const definition = (triggers, actions) => ({
  $schema: "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  contentVersion: "1.0.0.0",
  parameters: { $connections: { defaultValue: {}, type: "Object" }, $authentication: { defaultValue: {}, type: "SecureObject" } },
  triggers,
  actions,
});

/* Sends only the approval, to the people in the Approvers list, and emails the result to whoever ran it. */
export function approvalTestFlow() {
  const me = "@{triggerOutputs()?['headers']?['x-ms-user-email']}";
  return {
    displayName: "GPD - Approval test",
    definition: definition(
      { manual: { type: "Request", kind: "Button", inputs: { schema: { type: "object", properties: {}, required: [] } } } },
      seq(
        ...approverSteps,
        ["Ask_for_approval", askForApproval("TEST - Release GPD Portfolio Hub to Prod", "This is a test of the release approval. Nothing will be published.")],
        ["Approved", ifApproved(
          seq(["Email_approved", email(me, "TEST: approved", `<p>Approved by: @{${RESPONDER}}</p>`)]),
          seq(["Email_rejected", email(me, "TEST: rejected", `<p>Rejected by: @{${RESPONDER}}</p><p>Comments: @{${COMMENTS}}</p>`)]),
        )],
      ),
    ),
  };
}

/* Switches custom scripts on for QA and Prod with the admin connection, waits until SharePoint has applied it,
   emails the result to whoever ran it, then switches Prod's off again: the release flow's first steps, alone. */
export function customScriptsTestFlow() {
  const me = "@{triggerOutputs()?['headers']?['x-ms-user-email']}";
  const bothOn = "and(equals(body('Check_QA')?['value'], true), equals(body('Check_Prod')?['value'], true))";
  return {
    displayName: "GPD - Custom scripts test",
    definition: definition(
      { manual: { type: "Request", kind: "Button", inputs: { schema: { type: "object", properties: {}, required: [] } } } },
      {
        ...seq(
          ["Scripts_on_QA", scripts(QA, 1)],
          ["Scripts_on_Prod", scripts(PROD, 1)],
          ["Wait_for_scripts", until("@" + bothOn, seq(["Pause", pause], ["Check_QA", check(QA)], ["Check_Prod", check(PROD)]))],
          ["Scripts_ready", { type: "If", expression: { and: [{ equals: ["@" + bothOn, true] }] },
            actions: seq(["Email_scripts_on", email(me, "TEST: custom scripts are on",
              "<p>Custom scripts came on for QA and Prod. The admin connection works.</p><p>Prod's are being switched off again now; QA's stay on until SharePoint's daily reset.</p>")]),
            else: { actions: seq(["Email_scripts_failed", email(me, "TEST: custom scripts did not come on",
              "<p>Custom scripts did not come on within 10 minutes.</p><p>What SharePoint answered for QA: @{body('Scripts_on_QA')}</p><p>For Prod: @{body('Scripts_on_Prod')}</p>"
              + "<p>See \"If something goes wrong\" in docs/PROD-APPROVAL-FLOW.md.</p>")]) } }],
        ),
        Scripts_off_Prod: { ...scripts(PROD, 2), runAfter: { Scripts_ready: ["Succeeded", "Failed"] } },
      },
    ),
  };
}

/* Every day at 6:00 AM Eastern, for each site in the Sites step: custom scripts off and straight back on, which
   restarts SharePoint's 24-hour clock (re-setting a value that is already on might not, and the old clock could then
   run out just after the run). Emails the flow's owner only if a site failed. */
export function dailyCustomScriptsFlow() {
  const site = "@{items('Each_site')}";
  const note = (value) => ({ type: "AppendToArrayVariable", inputs: { name: "Failures", value } });
  const notify = (subject, body) => op("shared_flowpush", "SendEmailNotification",
    { "NotificationEmailDefinition/notificationSubject": subject, "NotificationEmailDefinition/notificationBody": body });
  return {
    displayName: "GPD - Daily custom scripts",
    definition: definition(
      { Recurrence: { type: "Recurrence", recurrence: { frequency: "Day", interval: 1, timeZone: "Eastern Standard Time", schedule: { hours: [6], minutes: [0] } } } },
      {
        Sites: { ...compose(DAILY_SCRIPT_SITES), runAfter: {} },
        Failures: { type: "InitializeVariable", inputs: { variables: [{ name: "Failures", type: "array", value: [] }] }, runAfter: { Sites: ["Succeeded"] } },
        Each_site: { ...foreach("@outputs('Sites')", {
          Scripts_off_briefly: { ...http(ADMIN, "POST", "_vti_bin/client.svc/ProcessQuery", { headers: { "Content-Type": "text/xml" }, body: scriptsXml(site, 2), admin: true }), runAfter: {} },
          Scripts_on_site: { ...http(ADMIN, "POST", "_vti_bin/client.svc/ProcessQuery", { headers: { "Content-Type": "text/xml" }, body: scriptsXml(site, 1), admin: true }),
            runAfter: { Scripts_off_briefly: ["Succeeded", "Failed"] } },
          Check_answer: { type: "If", expression: { and: [{ equals: ["@first(body('Scripts_on_site'))?['ErrorInfo']", null] }] }, actions: {},
            else: { actions: { Note_refused: { ...note("@concat(items('Each_site'), ' - ', string(first(body('Scripts_on_site'))?['ErrorInfo']?['ErrorMessage']))"), runAfter: {} } } },
            runAfter: { Scripts_on_site: ["Succeeded"] } },
          Note_failed_call: { ...note("@concat(items('Each_site'), ' - the call to SharePoint failed (', string(outputs('Scripts_on_site')?['statusCode']), ')')"),
            runAfter: { Scripts_on_site: ["Failed", "TimedOut"] } },
        }), runAfter: { Failures: ["Succeeded"] } },
        Any_failures: { type: "If", expression: { and: [{ greater: ["@length(variables('Failures'))", 0] }] },
          actions: { Email_failures: { ...notify("GPD: custom scripts did not switch on for every site",
            "Today's 6 AM run could not switch custom scripts on for:\n\n@{join(variables('Failures'), '\n')}\n\nThe other sites are fine. Open the flow's run history in Power Automate to see more."), runAfter: {} } },
          else: { actions: {} },
          runAfter: { Each_site: ["Succeeded", "Failed"] } },
      },
    ),
  };
}

/* The release: starts when a row with a ReleaseId starting "v" appears in GPD Releases. */
export function releaseFlow() {
  const patch = (fields) => sp("PatchItem", { dataset: PROD, table: RELEASES_LIST, id: "@triggerBody()?['ID']", "item/Title": "@triggerBody()?['Title']", ...fields });
  const answered = { "item/ApprovedBy": `@{${RESPONDER}}`, "item/ApproverComments": `@{${COMMENTS}}` };
  const sender = "@{outputs('Sender')}";
  const prodFile = "items('Each_Prod_file')?['Name']", qaFile = "items('Each_QA_file')?['Name']", page = "items('Each_Prod_page')?['Name']";

  const steps = seq(
    ["Scripts_on_QA", scripts(QA, 1)],
    ["Scripts_on_Prod", scripts(PROD, 1)],
    ["Wait_for_scripts", until("@and(equals(body('Check_QA')?['value'], true), equals(body('Check_Prod')?['value'], true))",
      seq(["Pause", pause], ["Check_QA", check(QA)], ["Check_Prod", check(PROD)]))],
    ["List_Prod_staged", listStaged("prod")],
    ["Each_Prod_file", foreach("@body('List_Prod_staged')?['value']", seq(["Place_Prod_page", http(PROD, "POST",
      `@concat('_api/web/GetFileByServerRelativeUrl(''${STAGED("prod")}', ${ID}, '/', ${prodFile}, ''')/MoveTo(newurl=''/sites/GPDReporting/Prod%20Release%20Files/', replace(${prodFile}, '.txt', ''), ''',flags=1)')`,
      { headers: NOMETA })]))],
    ["Tidy_Prod_staged", tidyStaged("prod")],
    ["List_QA_staged", listStaged("qa")],
    ["Each_QA_file", foreach("@body('List_QA_staged')?['value']", seq(["Place_QA_page", http(PROD, "POST",
      "_api/SP.MoveCopyUtil.CopyFileByPath(overwrite=@a1)?@a1=true",
      { headers: VERBOSE, body: `@concat('{"srcPath":{"__metadata":{"type":"SP.ResourcePath"},"DecodedUrl":"${PROD}/Prod Release Files/GPD Releases/qa/', ${ID}, '/', ${qaFile}, '"},"destPath":{"__metadata":{"type":"SP.ResourcePath"},"DecodedUrl":"${QA}/Report Pages/', replace(${qaFile}, '.txt', ''), '"},"options":{"__metadata":{"type":"SP.MoveCopyOptions"},"KeepBoth":false,"ResetAuthorAndCreatedOnCopy":true,"ShouldBypassSharedLocks":true}}')` })]))],
    ["Tidy_QA_staged", tidyStaged("qa")],
    ["Get_staged_files", http(PROD, "GET", "_api/web/GetFolderByServerRelativeUrl('/sites/GPDReporting/Prod%20Release%20Files')/Files?$select=Name", { headers: NOMETA })],
    ["Prod_pages", { type: "Query", inputs: { from: "@body('Get_staged_files')?['value']", where: "@endsWith(toLower(item()?['Name']), '.aspx')" } }],
    ["Page_names", { type: "Select", inputs: { from: "@body('Prod_pages')", select: "@item()?['Name']" } }],
    ["Mark_waiting", patch({ "item/Status/Value": "Waiting for approval" })],
    ...approverSteps,
    ["Ask_for_approval", askForApproval("Release GPD Portfolio Hub @{triggerBody()?['Title']} to Prod",
      "**Sent by:** @{triggerBody()?['Author']?['DisplayName']}\n\n**What changed:**\n\n@{triggerBody()?['WhatChanged']}\n\n"
      + "**Pages to publish:** @{join(body('Page_names'), ', ')}\n\nCheck it on QA first (link below). Approve publishes it to Prod. Reject sends your comment back to the sender.")],
    ["Approved", ifApproved(
      seq(
        ["Scripts_on_Prod_again", scripts(PROD, 1)],
        ["Wait_for_Prod_scripts", until("@equals(body('Check_Prod_again')?['value'], true)", seq(["Pause_again", pause], ["Check_Prod_again", check(PROD)]))],
        ["Each_Prod_page", foreach("@body('Prod_pages')", seq(
          ["Publish_page", http(PROD, "POST",
            `@concat('_api/web/GetFileByServerRelativeUrl(''/sites/GPDReporting/Prod%20Release%20Files/', ${page}, ''')/CopyTo(strnewurl=''/sites/GPDReporting/Report%20Pages/', ${page}, ''',boverwrite=true)')`,
            { headers: NOMETA })],
          ["Back_up_page", http(PROD, "POST",
            `@concat('_api/web/GetFileByServerRelativeUrl(''/sites/GPDReporting/Prod%20Release%20Files/', ${page}, ''')/MoveTo(newurl=''/sites/GPDReporting/Prod%20Release%20Backup/', replace(${page}, '.aspx', ''), '_', outputs('Stamp'), '.aspx'',flags=1)')`,
            { headers: NOMETA })],
        ))],
        ["Mark_live", patch({ "item/Status/Value": "Live", ...answered })],
        ["Email_live", email(sender, "GPD Portfolio Hub @{triggerBody()?['Title']} is live on Prod",
          `<p>GPD Portfolio Hub @{triggerBody()?['Title']} is live on Prod.</p><p>Approved by: @{${RESPONDER}}</p><p>Pages published: @{join(body('Page_names'), ', ')}</p>`
          + `<p><a href="${PROD}/Report%20Pages/Home.aspx">Open it</a></p><p>The released files are in Prod Release Backup, with today's date added to their names.</p>`)],
      ),
      seq(
        ["Mark_rejected", patch({ "item/Status/Value": "Rejected", ...answered })],
        ["Email_rejected", email(sender, "GPD Portfolio Hub @{triggerBody()?['Title']} was not approved",
          `<p>Your release @{triggerBody()?['Title']} was not approved, so Prod was not changed.</p><p>Rejected by: @{${RESPONDER}}</p><p>Comments: @{${COMMENTS}}</p>`
          + "<p>Fix the change, then run /approve-release again. The new release replaces these pages.</p>")],
      ),
    )],
  );

  return {
    displayName: "GPD - Release to Prod",
    definition: definition(
      { When_an_item_is_created: {
        recurrence: { interval: 1, frequency: "Minute" },
        splitOn: "@triggerOutputs()?['body/value']",
        ...op("shared_sharepointonline", "GetOnNewItems", { dataset: PROD, table: RELEASES_LIST }),
        /* only well-formed releases: a rehearsal ("rehearsal-v...") or an id with ' or / never starts it */
        conditions: [{ expression: "@and(startsWith(triggerBody()?['ReleaseId'], 'v'), not(contains(triggerBody()?['ReleaseId'], '''')), not(contains(triggerBody()?['ReleaseId'], '/')))" }],
      } },
      {
        Sender: { ...compose("@triggerBody()?['Author']?['Email']"), runAfter: {} },
        Stamp: { ...compose("@formatDateTime(convertFromUtc(utcNow(), 'Eastern Standard Time'), 'yyyy-MM-dd_HHmm')"), runAfter: { Sender: ["Succeeded"] } },
        Release_steps: { type: "Scope", actions: steps, runAfter: { Stamp: ["Succeeded"] } },
        Mark_stopped: { ...patch({ "item/Status/Value": "Stopped" }), runAfter: { Release_steps: ["Failed", "TimedOut"] } },
        Email_stopped: { ...email(sender, "GPD release @{triggerBody()?['Title']} stopped",
          "<p>The release flow for @{triggerBody()?['Title']} stopped at a step that failed, and the steps after it did not run.</p><p>Open the flow's run history in Power Automate to see which step.</p>"),
          runAfter: { Mark_stopped: ["Succeeded", "Failed"] } },
        Scripts_off_Prod: { ...scripts(PROD, 2), runAfter: { Email_stopped: ["Succeeded", "Failed", "Skipped"] } },
      },
    ),
  };
}
