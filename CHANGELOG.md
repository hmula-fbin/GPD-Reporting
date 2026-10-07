# Changelog

## v1.3.2 - 2026-10-07
- Scorecard tables work like frozen panes in Excel: the heading row and the first column stay in place while you scroll. Long tables scroll inside their own box.
- Wide tables have left and right arrows beside them, so you can scroll sideways without hunting for the scroll bar.
- Every Scorecard table also shows Capital Investment and PD Investment.
- Table columns can be resized by dragging a heading edge (double-click resets), and table boxes from their corner. Each person's sizes are remembered and scale with the screen.
- The pages fit phones, tablets, laptops and large screens. Below laptop width the filters fold into a "Filters" button.
- While a page loads, the line under "Loading..." changes every few seconds with a light remark for the viewer's time of day.
- "Ask questions about your data" understands abbreviations, loosely named columns and small typos, and can be taught new terms. It can answer from every data file, with an Excel download per answer. The "Continue in Microsoft 365 Copilot" link is hidden.
- The browser tab shows the report icon.
- The pages read the data from CSV files (same names, same place).
- Data Quality Dashboard: shown as "Coming soon" on Home and in the menu while it is finished (it is live on Dev only).

## v1.3.1 - 2026-10-05
- The hub is now called "FBIN R&D Portfolio Hub" (it was "GPD Portfolio Hub"), in the app bar, menu and browser tab.
- Home and the scorecard say "FBIN R&D" where they said "GPD", including "Contact the FBIN R&D PPM team" in the footer and help messages, and in the assistant's answers.
- The scorecard heading reads "Innovation & CI Portfolio Scorecard" (title case), on the page and in the Excel export.

## v1.3.0 - 2026-10-02
- Home is cleaner: the "Portfolio at a glance" panel, the intro sentence and the "Open Portfolio Score Card" button are gone. The footer shows when the data was last refreshed.
- Scorecard: new Phase filter, right above Project Status, opening on the Active Phase.
- Scorecard: Project Status now opens on In Progress only (it was In Progress + Roadmap), so the opening figures are smaller.
- Scorecard header shows "Last refreshed" with the date and time, in place of "data updated" and "loaded".
- Month-over-month trend: earlier months are recalculated for the new default view; months saved before the Phase filter existed are left out, with a note, rather than compared like for like.
- The pages point at the real Dev (GPDReportingSBX), QA (GPDReportingQA) and Prod (GPDReporting) sites and their Report Pages libraries. The Test site is labelled QA.

## v1.2.0 - 2026-10-02
- Manual-upload route: `/package-dev` and `/package-prod` (tests, strict build, `UPLOAD-STEPS.txt`, opens the folder and the library). The automatic PnP deploy is now optional.
- The build refuses `CHANGE-ME` site paths when packaging.
- Team commands work for one person before the OneDrive shared copy exists.
- Guide covers the 24-hour custom-scripts reset.

## v1.1.0 - 2026-10-02
Team workflow (no change to what users see on the pages).

- Team setup scripts: install the tools, create the shared OneDrive copy, and join the project.
- Claude Code team commands:
  - `/get-latest`, `/start-change`, `/change`, `/share-change` and `/deploy-dev`, for everyone;
  - `/approve-release` and `/release-check`, for the release owner.
- Flow is now Dev (testing) then Prod. A Prod deploy needs the same commit live on Dev, a release owner, the main branch and a tag.
- Every page carries a build stamp (version, commit, environment, time). Deploys run the tests first.
- New guide: docs/TEAM-GUIDE.md.

## v1.0.0 - 2026-10-02
First structured release. It moves the proof of concept into a modular repo.

- Home: greeting by time of day and first name, portfolio at a glance, dashboard tiles, menu.
- Portfolio Scorecard:
  - left filter panel, with Project Status defaulting to In Progress + Roadmap;
  - KPIs and progress in one colour;
  - drill-down (bucket, stage, KPI, project);
  - Project Bucket reference on hover;
  - Excel download per table and Download all projects;
  - month-over-month trend.
- "Ask questions about your data" on both pages. It answers from the full data file.
- Build per environment (Dev, Test, Prod), local preview with fake SharePoint, Playwright tests, and a PnP deploy script with prod gates, backup and rollback.
