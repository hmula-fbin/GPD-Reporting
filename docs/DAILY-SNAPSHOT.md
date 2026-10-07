# Nightly snapshot of the project file

The Data Quality Dashboard's **Daily tracking** tab is built from dated copies of the project file. Every night at 11 PM Eastern, a scheduled Power Automate flow saves a copy next to the original, in the same **Report Files** library:

```
Report Files/
  Project Data.xlsx              <- the live file (refreshed every day at 5 PM Eastern)
  Project Data 2026-10-06.xlsx   <- tonight's snapshot
  Project Data 2026-10-05.xlsx   <- last night's snapshot
  ...
```

The page finds the copies by their names (`<project file name> YYYY-MM-DD.xlsx`), so new copies are picked up automatically.
- **Tracking:** one row per snapshot, plus a **Now** row from the live file.
- **Changes since the previous day:** compares the live file with the latest snapshot from an earlier day, project by project. It lists new exceptions, fixed exceptions, and projects added or removed.
- **Copilot:** ignores the copies, so it doesn't count projects once per day.

The page can't make the copies itself, because it only runs while someone has it open. That's why a flow does it.

## Set up the flow (once per site, about 10 minutes)

Do this for the Dev site (`/sites/GPDReportingsbx`) first, then for Prod (`/sites/GPDReporting`) at release time.

1. Go to https://make.powerautomate.com, then **Create**, then **Scheduled cloud flow**.
   - **Name:** `GPD - nightly project snapshot (Dev)`
   - **Starting:** today, at 11:00 PM
   - **Repeat every:** 1 Day
   - Select **Create**.
2. Open the **Recurrence** trigger, then **Show advanced options**:
   - **Time zone:** `(UTC-05:00) Eastern Time (US & Canada)`. This follows daylight saving, so the flow always runs at 11 PM local Eastern time.
   - **At these hours:** `23`
   - **At these minutes:** `0`
3. Add the action **SharePoint, Get file content using path**:
   - **Site Address:** the site, for example `https://fbinportal.sharepoint.com/sites/GPDReportingsbx`
   - **File Path:** `/Report Files/Project Data.xlsx`
4. Add the action **SharePoint, Create file**:
   - **Site Address:** the same site
   - **Folder Path:** `/Report Files`
   - **File Name:** switch to the expression editor (fx) and paste:
     ```
     concat('Project Data ', formatDateTime(convertFromUtc(utcNow(), 'Eastern Standard Time'), 'yyyy-MM-dd'), '.xlsx')
     ```
   - **File Content:** pick **File Content** from step 3.
   - In the action's **Settings**, set **Allow chunking** on, because the file is over 2 MB.
5. **Save**, then **Test**, **Manually**, **Run flow**. This is the test run.
   - Check that **Project Data <today's date>.xlsx** appears in Report Files.
   - Open the Data Quality Dashboard and go to **Daily tracking**. Today's snapshot appears as a row. From tomorrow, "Changes since the previous day" fills in.

A test run made during the day overwrites nothing. The 11 PM run creates the same name again and replaces it with the evening copy. If Create file complains that the file exists, open the action's **Settings** and turn **Allow overwrite** on, or add a **Delete file** step for the same path before it.

## Good to know

- **Run as:** the flow runs as the person who owns it. Use the same service account as the 5 PM refresh flow, so it doesn't stop when someone leaves.
- **Keeping copies:** the page reads the latest 60 copies. Older copies can be deleted, or moved into a sub-folder, which the page and the Copilot ignore.
- **Renaming the project file:** if `projectFileName` in `config/<env>.json` changes, change the file names in steps 3 and 4 to match.
