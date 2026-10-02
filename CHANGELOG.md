# Changelog

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
