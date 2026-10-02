# GPD Portfolio Hub: team guide

This guide assumes you have never used VS Code, git or Claude Code before.

## The big picture

```
 Requester            Team member (VS Code + Claude)            Release owner
 "change X"  ───────▶ 1. ask Claude to make the change
                      2. preview it on own PC
                      3. share it + put it on DEV  ───────────▶ (Dev site)
 tests on Dev ◀──────  sends Dev link
   │  not OK → back to step 1 (same change)
   └─ OK ─────────────────────────────────────────────────────▶ 4. approve the change
                                                                5. deploy to PROD
```

- **Dev site**: where changes are tried out. Anyone on the team can deploy to it. Today this is `/sites/gpdsbx`.
- **Prod site**: what everyone uses. Only the release owner (Harinath) can deploy to it, and only a version that is already live on Dev.
- **Shared copy**: one folder in OneDrive holds the team's shared project history. Everyone works in their own copy on their own PC (`C:\dev\gpd-portfolio-hub`) and sends changes to and from the shared copy. You don't move these files around yourself; Claude does it when you type `/share-change` or `/get-latest`.

### Do I need to create a Project in Claude?
No. **Claude Projects** on claude.ai are for chat and play no part here. Claude Code inside VS Code works directly on the project folder. It reads the rules in `CLAUDE.md` and the team commands in `.claude/commands/`, and both come with the project. Each person who makes changes needs:

- a Claude seat that includes Claude Code (on a Team plan every seat does; on Enterprise, ask your Claude admin);
- to sign in once from VS Code.

Requesters who only test on Dev need nothing but a browser.

### Who needs what

| Role | Needs |
|---|---|
| Requester (tests on Dev) | Read access to the Dev site |
| Team member | A Claude seat with Claude Code, VS Code, the OneDrive shared folder (Can edit), and Edit on the Dev site's `Shared Documents` |
| Release owner | All of the above, plus Edit on the Prod site, and being listed in `releaseOwners` in `config/prod.json` |

Everyone who opens the pages also needs Read on the `Report Files` library of that site.

---

## Part A: release owner setup (once)

**A1. Install the tools.**

1. Download and unzip `gpd-portfolio-hub.zip` to `C:\dev\`, so that you have `C:\dev\gpd-portfolio-hub`. Do not put it in OneDrive, Desktop or Downloads.
2. Open the Start menu, type **PowerShell** and open **Windows PowerShell**.
3. Run:
   ```powershell
   cd C:\dev\gpd-portfolio-hub
   powershell -ExecutionPolicy Bypass -File .\setup\1-Install-Tools.ps1
   ```
   This installs Git, Node.js, PowerShell 7, the SharePoint deploy module and the Claude Code extension.
4. Close the window when it finishes. If your laptop blocks installs, ask IT for **Git for Windows**, **Node.js LTS** and **PowerShell 7**.

**A2. Open the project in VS Code.**

1. Open VS Code, choose **File → Open Folder…**, and pick `C:\dev\gpd-portfolio-hub`.
2. If it asks "Do you trust the authors?", click **Yes, I trust the authors**.
3. A pop-up offers the recommended extensions. Click **Install**.

**A3. Sign in to Claude.**

1. Click the **Spark icon** in the left bar, or **✻ Claude Code** at the bottom-right of the window.
2. Click **Sign in**, finish in the browser, and choose the Fortune Brands organisation.

**A4. Check everything works.**

1. Open the terminal with **Terminal → New Terminal**, or press Ctrl+`.
2. Run:
   ```powershell
   npm install
   npx playwright install chromium
   npm test
   ```
   You should see "passed" and no "failed".

**A5. Connect to SharePoint (IT may be needed).**

1. In the terminal, run:
   ```powershell
   pwsh -ExecutionPolicy Bypass -File .\deploy\Setup-PnPApp.ps1 -Tenant fbinportal.onmicrosoft.com
   ```
2. It prints a **Client ID**. If it says admin consent is required, send the message to IT.
3. Tell Claude: *"Put client ID xxxx in all three config files. Set the prod sitePath to /sites/<prod site name>."*

**A6. Ask the SharePoint admin for these:**

- Allow custom scripts on the Dev and Prod sites. Without this, `.aspx` pages download instead of opening.
- Give team members **Edit** on Dev's `Shared Documents`.
- Give only yourself **Edit** on Prod's `Shared Documents`.
- Give everyone **Read** on the pages and on `Report Files`.

**A7. Save the setup.** Tell Claude: *"Commit the config changes with message 'Team setup'."*

**A8. Create the team's shared copy in OneDrive.**

1. In File Explorer, open your OneDrive (*OneDrive – Fortune Brands*) and create a folder called `GPD Portfolio Hub (Team)`.
2. In the VS Code terminal, run:
   ```powershell
   pwsh -ExecutionPolicy Bypass -File .\setup\2-Create-Shared-Copy.ps1 -SharedFolder "$env:OneDriveCommercial\GPD Portfolio Hub (Team)"
   ```
3. Right-click the folder and choose **OneDrive → Always keep on this device**.
4. Share the folder with the team. Right-click it, choose **Share**, and pick **Can edit**.

---

## Part B: team member setup (once per person)

1. **Confirm your Claude seat includes Claude Code.** Ask your Claude admin if you're not sure.
2. **Add the shared folder to your OneDrive.**
   1. Open the share link you were sent and click **Add shortcut to My files**.
   2. In File Explorer, wait for the green tick on `GPD Portfolio Hub (Team)`.
   3. Right-click the folder and choose **Always keep on this device**.
3. **Install the tools.**
   1. Open **Windows PowerShell** from the Start menu.
   2. Run:
      ```powershell
      cd "$env:OneDriveCommercial\GPD Portfolio Hub (Team)"
      powershell -ExecutionPolicy Bypass -File .\1-Install-Tools.ps1
      ```
   3. Close the window when it finishes.
4. **Join the project.**
   1. Open **PowerShell 7**: Start menu, type *pwsh*.
   2. Run:
      ```powershell
      cd "$env:OneDriveCommercial\GPD Portfolio Hub (Team)"
      pwsh -ExecutionPolicy Bypass -File .\3-Join-Project.ps1 -SharedFolder "$env:OneDriveCommercial\GPD Portfolio Hub (Team)"
      ```
   3. It asks for your name and email, copies the project to `C:\dev\gpd-portfolio-hub`, runs the tests and opens VS Code.
5. **In VS Code, finish setting up.**
   1. Trust the folder and install the recommended extensions.
   2. Click the **Spark icon** and **Sign in**.

From now on, open the project with **File → Open Recent → gpd-portfolio-hub**.

---

## Part C: making a change (every time)

Type these into the **Claude panel** (Spark icon). Text in *italics* is an example of what you'd write.

| # | You do | Type to Claude / click |
|---|---|---|
| 1 | Start the day with the team's latest work | `/get-latest` |
| 2 | Start a new change | `/start-change greeting wording on Home` |
| 3 | Describe what you want in plain English | *On the Home page, change "Portfolio insight for GPD" to "GPD portfolio, live". Keep everything else.* |
| 4 | Claude shows each edit side by side. Click **Accept**, or tell it what to do differently | (click) |
| 5 | Look at it on your own PC | **Terminal → Run Task… → Preview (dev, fixture data)**, then open http://localhost:5173 |
| 6 | Not happy? Say what to adjust and repeat 4–5 | *Make the heading smaller and put it on one line on phones* |
| 7 | Happy: save and share it | `/share-change` |
| 8 | Put it on Dev for the requester | `/deploy-dev`. A Microsoft sign-in window opens; complete it. Claude gives you the Dev links and a Teams message to send |
| 9a | Requester says it needs changes | Go back to step 3. You are still on the same change |
| 9b | Requester says OK | Message the release owner: *"change/greeting-wording is approved on Dev"* |

Notes:

- The preview uses made-up sample data, so the numbers are not real. To preview with a real extract, put the file in the project's `data` folder and run the task **Preview (dev, real extract in data/)**. That folder is never shared.
- Claude will not deploy to Prod, force-push or delete work. It asks before it commits, pushes or deploys to Dev.
- If you get lost, ask Claude in plain words: *"What state is my project in? What should I do next?"*

---

## Part D: releasing to Prod (release owner)

| # | Do | How |
|---|---|---|
| 1 | Get the approved change into the main version | `/approve-release change/greeting-wording`. Claude merges it, runs the tests, asks if it's a fix or a feature, updates the version and changelog, and shares it |
| 2 | Put that exact release on Dev | **Terminal → Run Task… → Deploy: dev**. Have a quick look |
| 3 | Check it's ready | `/release-check` (optional) |
| 4 | Publish | **Run Task… → Deploy: prod (asks for confirmation)**, then type `DEPLOY PROD` |
| 5 | Smoke test on Prod | Open Home and the Scorecard, press Refresh now, and ask one question |

The Prod deploy **refuses** unless all of these are true:

- you're a release owner;
- you're on the main branch with everything saved;
- the version is tagged;
- the *same* version is live on Dev;
- all tests pass.

It also backs up what was on Prod first. If something is wrong, roll back:

```powershell
pwsh -ExecutionPolicy Bypass -File .\deploy\Deploy-Portfolio.ps1 -Env prod -Rollback <backup id printed by the deploy>
```

---

## Part E: team rules (important while we use OneDrive)

1. **Never open, edit or move anything inside the shared OneDrive folder.** Work only in `C:\dev\gpd-portfolio-hub`.
2. **Wait for the OneDrive green tick** before `/share-change` and before `/get-latest`.
3. **One person shares at a time.** Post "sharing now" in the team chat, and "done" after.
4. **Dev shows one change at a time.** Say in the chat before you `/deploy-dev`, so you don't overwrite someone's test.
5. Run `/get-latest` every morning, and one change per `/start-change`. Small changes are easier to test and approve.
6. Never put real data files in git. They stay in `data/`, which is ignored.

---

## Part F: moving to GitHub later

When GitHub access arrives:

1. Create an empty **private** repository, for example `gpd-portfolio-hub`, with no README.
2. Release owner, tell Claude: *"Switch our shared copy to https://github.com/<org>/gpd-portfolio-hub.git and push all branches and tags."* Claude runs:
   ```powershell
   git remote set-url origin https://github.com/<org>/gpd-portfolio-hub.git
   git push -u origin --all
   git push origin --tags
   ```
3. Everyone else tells Claude: *"Switch origin to https://github.com/<org>/gpd-portfolio-hub.git and get the latest."*
4. Retire the OneDrive folder once everyone has switched, and make it read-only first.

After the move, "approved" becomes a **pull request** on GitHub. The requester or release owner clicks *Approve*, and GitHub can run the tests automatically. Ask Claude to set that up when you get there.

---

## Troubleshooting

| You see | Do |
|---|---|
| `git` / `node` / `pwsh` "not recognized" | Close all terminals and VS Code, then reopen them. If it still fails, re-run `1-Install-Tools.ps1` |
| The Claude panel asks you to sign in again | Click **Sign in**. If it says no access, ask your Claude admin about a Claude Code seat |
| "Tests failed – nothing was deployed" | Tell Claude: *"The tests failed, please fix them"* |
| "Can't find the shared copy" | The OneDrive shortcut is missing or not synced. Check for the green tick and *Always keep on this device* |
| "rejected – non-fast-forward" when sharing | Someone shared first. Run `/get-latest`, then `/share-change` again |
| `.aspx` page downloads instead of opening | The site doesn't allow custom scripts. Ask the SharePoint admin (Part A, A6) |
| Prod deploy says Dev has a different version | Run **Deploy: dev** from main first (Part D, step 2) |
| The page shows an error instead of figures | You don't have Read on `Report Files`, or the data file has moved |

## Words you'll see

| Word | Meaning |
|---|---|
| **Repository (repo)** | The project plus its full history |
| **Commit** | A saved snapshot with a message |
| **Branch** | Your own line of work, so your edits don't disturb anyone until approved |
| **main** | The approved version, the only one that goes to Prod |
| **Push / pull** | Send your commits to the shared copy / get everyone else's |
| **Merge conflict** | Two people changed the same lines. Claude helps you pick the right result |
| **Build** | Turns the source files into the two `.aspx` pages |
| **Deploy** | Uploads the pages to a SharePoint site |
