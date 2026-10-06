// Data Quality page: the 21 rules fire exactly where they should, plus the house rules every page follows.
import { test, expect } from "@playwright/test";
import { HOME, DQ, open } from "./helpers.mjs";
import { EXPECT } from "../tools/make-dq-fixture.mjs";

/* Tick (or untick) one value in a multi-select filter, then close the list. */
async function tick(page, key, label) {
  await page.click("#fld_" + key + " .msbtn");
  await page.locator("#fld_" + key + " .msopt", { hasText: label }).first().locator("input").click();
  await page.keyboard.press("Escape");
}

const ALL_RULES = ["U1", "U2", "U3", "U4", "U5", "U6", "U7", "U8", "IC", "IA", "ID", "IE", "CA", "CB", "CC", "ND", "NI", "BR", "OW", "PM", "OU"];

test("each test project raises exactly the rules it was built to break", async ({ page }) => {
  await open(page, DQ);
  const d = await page.evaluate(() => window.gpdDQ());
  expect(d.rules.map((r) => r.code)).toEqual(ALL_RULES);
  expect(d.rules.filter((r) => r.off)).toEqual([]);
  for (const [name, codes] of Object.entries(EXPECT)) {
    const p = d.projects.find((x) => x.name.endsWith(" " + name));
    expect(p, name).toBeTruthy();
    expect(p.codes.slice().sort(), name).toEqual(codes.slice().sort());
  }
  // every rule fires somewhere, and nothing fires on the clean filler
  const fired = new Set(d.projects.flatMap((p) => p.codes));
  for (const c of ALL_RULES) expect(fired.has(c), c).toBe(true);
  const filler = d.projects.filter((p) => !Object.keys(EXPECT).some((n) => p.name.endsWith(" " + n)));
  expect(filler.filter((p) => p.codes.length).map((p) => p.name + ": " + p.codes)).toEqual([]);
});

test("opens on Project status = In Progress and Phase = Active Phase, status sitting right above Phase", async ({ page }) => {
  await open(page, DQ);
  const d = await page.evaluate(() => window.gpdDQ());
  expect(d.filters.status).toEqual(["In Progress"]);
  expect(d.filters.phase.length).toBeGreaterThan(0);
  for (const ph of d.filters.phase) expect(ph).toMatch(/\bactive\b/i);
  const live = d.projects.filter((p) => p.status === "In Progress" && /\bactive\b/i.test(p.phase)).length;
  await expect(page.locator("#inviewN")).toHaveText(String(live));
  const keys = await page.locator("#filterFields .ms").evaluateAll((els) => els.map((e) => e.dataset.key));
  expect(keys).toEqual(["status", "phase", "bucket", "ptype", "stage", "brand", "sponsor", "sev", "rule"]);
  await expect(page.locator("#fld_status .mslab")).toHaveText("In Progress");
});

test("header shows the date the data is as at", async ({ page }) => {
  await open(page, DQ);
  await expect(page.locator("#subline")).toContainText(/Project & resource data quality checks · Data as at \d{1,2} [A-Z][a-z]{2} \d{4}/);
  await expect(page.locator("h1")).toHaveText("Data Quality Dashboard");
});

test("filters sit in the left panel on desktop", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop layout only");
  await open(page, DQ);
  const rail = await page.locator("#rail").boundingBox(), main = await page.locator("#main").boundingBox();
  expect(rail.x + rail.width).toBeLessThanOrEqual(main.x + 1);
});

test("a rule picked in Notes, or a severity, narrows the project grid", async ({ page }) => {
  await open(page, DQ);
  await page.click("#notesBtn");
  await page.locator('table.sum tr[data-rule="U1"]').click();
  await expect(page.locator("#notesDlg")).toBeHidden();
  await expect(page.locator("#gridBody tr[data-i]")).toHaveCount(1);
  await expect(page.locator("#gridBody tr[data-i] td").first()).toContainText("DQ U1 Reconciliation");
  await page.click("#resetBtn");
  await tick(page, "sev", "Critical");
  const crit = Object.values(EXPECT).filter((c) => c.some((x) => ["ID", "CA", "ND"].includes(x))).length;
  await expect(page.locator("#gridBody tr[data-i]")).toHaveCount(crit);
  await page.click("#resetBtn");
  await expect(page.locator(".kctx")).toHaveText(/Status = In Progress .* Phase = 03 Active Phase/);
});

test("clicking a bucket cell filters to it; clicking again clears it", async ({ page }) => {
  await open(page, DQ);
  await page.locator('#gridBody td[data-dim="bucket"]', { hasText: "CRQ" }).first().click();
  await expect(page.locator("#fld_bucket .mslab")).toHaveText("CRQ");
  await page.locator('#gridBody td[data-dim="bucket"]').first().click();
  await expect(page.locator("#fld_bucket .mslab")).toHaveText("All");
});

test("problem cells are tinted, explain themselves, and a blank one reads missing", async ({ page }) => {
  await open(page, DQ);
  await page.fill("#fQ", "dq br no brand");
  await expect(page.locator("#gridBody tr[data-i]")).toHaveCount(1);
  const cell = page.locator("#gridBody td.err.blank").first();
  await expect(cell).toHaveText("missing");
  await expect(cell).toHaveAttribute("title", /BR .* Missing brand/);
});

test("View issues opens the full text for that project", async ({ page }) => {
  await open(page, DQ);
  await page.fill("#fQ", "dq ic id no savings");
  await expect(page.locator("#gridBody tr[data-i]")).toHaveCount(1);
  await page.locator("#gridBody button.lnk").click();
  await expect(page.locator("#issDlg")).toBeVisible();
  await expect(page.locator("#issDlg .iss")).toHaveCount(2);
  await expect(page.locator("#issDlg .iss").first()).toContainText("no Net Sales figure and no Cost Savings");
  await page.click("#issClose");
  await expect(page.locator("#issDlg")).toBeHidden();
});

test("KPI figures use one colour (no red / amber / green)", async ({ page }) => {
  await open(page, DQ);
  const cols = await page.evaluate(() => ({
    kpi: getComputedStyle(document.documentElement).getPropertyValue("--kpi").trim(),
    vals: Array.from(document.querySelectorAll(".kb .v")).map((e) => getComputedStyle(e).color) }));
  const n = parseInt(cols.kpi.slice(1), 16), rgb = "rgb(" + (n >> 16) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ")";
  expect(cols.vals.length).toBe(8);
  for (const v of cols.vals) expect(v).toBe(rgb);
});

test("Excel downloads: the grid, Download all projects, and the daily tracking", async ({ page }) => {
  await open(page, DQ);
  for (const sel of ["#xlGridBtn", "#dlAllBtn"]) {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click(sel)]);
    expect(dl.suggestedFilename()).toMatch(/.xlsx$/);
  }
  await page.click("#tab_track");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#xlLogBtn")]);
  expect(dl.suggestedFilename()).toMatch(/.xlsx$/);
});

test("today is logged automatically, one row per day, for the default view", async ({ page }) => {
  await open(page, DQ);
  let d = await page.evaluate(() => window.gpdDQ());
  expect(d.snaps.length).toBe(1);
  expect(d.snaps[0].exceptions).toBe(d.track.exceptions);
  await page.click("#snapTopBtn");
  await expect(page.locator("#viewTrack")).toBeVisible();
  d = await page.evaluate(() => window.gpdDQ());
  expect(d.snaps.length).toBe(1);
  await expect(page.locator("#logTable tbody tr")).toHaveCount(1);
  await expect(page.locator("#trendChart circle")).toHaveCount(1);
});

test("notes explain every rule", async ({ page }) => {
  await open(page, DQ);
  await page.click("#notesBtn");
  await expect(page.locator("#notesDlg")).toBeVisible();
  await expect(page.locator("#notesDlg table.sum tbody tr")).toHaveCount(21);
  await page.click("#notesClose");
  await expect(page.locator("#notesDlg")).toBeHidden();
});

test("Home has a Data Quality tile and the menu lists the page", async ({ page }) => {
  await open(page, HOME);
  await expect(page.locator('.card[href$="Data_Quality.aspx"]')).toBeVisible();
  await page.click("#navBtn");
  await expect(page.locator('#navDrawer a[href$="Data_Quality.aspx"]')).toBeVisible();
});


test("filters are multi-select: ticking two buckets shows both", async ({ page }) => {
  await open(page, DQ);
  const before = Number((await page.locator("#inviewN").textContent()).replace(/,/g, ""));
  await tick(page, "bucket", "CRQ");
  const crq = Number((await page.locator("#inviewN").textContent()).replace(/,/g, ""));
  await tick(page, "bucket", "Improve");
  await expect(page.locator("#fld_bucket .mslab")).toHaveText("2 selected");
  const both = Number((await page.locator("#inviewN").textContent()).replace(/,/g, ""));
  expect(crq).toBeGreaterThan(0);
  expect(both).toBeGreaterThan(crq);
  expect(both).toBeLessThan(before);
  await tick(page, "sev", "Critical");
  await tick(page, "sev", "High");
  await expect(page.locator("#fld_sev .mslab")).toHaveText("2 selected");
});
