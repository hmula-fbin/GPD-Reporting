# Changelog

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
