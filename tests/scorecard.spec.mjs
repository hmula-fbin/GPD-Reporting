// Scorecard behaviour that the business asked for. If one of these fails, a requirement broke.
import { test, expect } from "@playwright/test";
import { SCORE, open, allRows, inDefaultView } from "./helpers.mjs";

const NPD = ["Grow the Core", "Refresh & Sustain", "Create & Transform"];

test("Project Status defaults to In Progress only, and Phase to the Active Phase", async ({ page }) => {
  await open(page, SCORE);
  expect(await page.evaluate(() => S.filters.status)).toEqual(["In Progress"]);
  const phases = await page.evaluate(() => S.filters.phase);
  expect(phases.length).toBeGreaterThan(0);
  for (const p of phases) expect(p).toMatch(/\bactive\b/i);
  const rows = await allRows(page);
  const expected = rows.filter((r) => r.bu && inDefaultView(r)).length;
  await expect(page.locator("#inviewN")).toHaveText(String(expected));
});

test("Phase filter sits right above the Project Status filter", async ({ page }) => {
  await open(page, SCORE);
  const keys = await page.locator("#filterFields .ms").evaluateAll((els) => els.map((e) => e.getAttribute("data-key")));
  expect(keys.indexOf("phase")).toBe(keys.indexOf("status") - 1);
  await expect(page.locator("#lab_phase")).toHaveText("Phase");
});

test("header shows the last refreshed date and time, not data updated / loaded", async ({ page }) => {
  await open(page, SCORE);
  const sub = page.locator("#subline");
  await expect(sub).toContainText(/Last refreshed [A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}\s?[AP]M/);
  await expect(sub).not.toContainText(/data updated|loaded/i);
});

test("filters sit in the left panel on desktop", async ({ page, isMobile }) => {
  test.skip(isMobile, "stacked on phones");
  await open(page, SCORE);
  const rail = await page.locator("#rail").boundingBox();
  const main = await page.locator("#main").boundingBox();
  expect(rail.x).toBeLessThan(main.x);
});

test("no Excel buttons on Portfolio at a glance; one per table elsewhere", async ({ page }) => {
  await open(page, SCORE);
  const glance = page.locator(".shead", { hasText: "Portfolio at a glance" }).locator("xpath=..");
  await expect(glance.locator(".expbtn")).toHaveCount(0);
  expect(await page.locator(".expbtn").count()).toBeGreaterThan(2);
});

test("Download all projects gives an .xlsx", async ({ page }) => {
  await open(page, SCORE);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dlAllBtn")]);
  expect(dl.suggestedFilename()).toMatch(/^portfolio-projects-\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test("drill-down: bucket -> projects -> one project -> back", async ({ page }) => {
  await open(page, SCORE);
  const rows = await allRows(page);
  const bucket = NPD.find((b) => rows.some((r) => r.bucket === b && inDefaultView(r)));
  await page.click("tr.drillable >> text=" + bucket);
  await expect(page.locator("#drTitle")).toContainText(bucket);
  const n = await page.locator("#drTable tbody tr[data-i]").count();
  expect(n).toBeGreaterThan(0);
  await page.click("#drTable tbody tr[data-i] >> nth=0");
  await expect(page.locator("#drBack")).toBeVisible();
  await page.click("#drBack");
  await expect(page.locator("#drTable tbody tr[data-i]")).toHaveCount(n);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#drXl")]);
  expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
  await page.keyboard.press("Escape");
});

test("hovering a Project Bucket shows the reference sheet", async ({ page, isMobile }) => {
  test.skip(isMobile, "hover only");
  await open(page, SCORE);
  await page.hover('[data-bucket="Grow the Core"] >> nth=0');
  const tip = page.locator(".bktip");
  await expect(tip).toHaveClass(/on/);
  await expect(tip).toContainText("SG PROJECT TYPE", { ignoreCase: true });
  await expect(tip).toContainText("Product Expansion/Refresh");
});

test("KPIs and progress bars use one colour (no red / amber / green)", async ({ page }) => {
  await open(page, SCORE);
  const colours = await page.evaluate(() => {
    const out = new Set();
    document.querySelectorAll(".kpi .v, .kpi .bar i, .prog i, .bar > i").forEach((el) => {
      const cs = getComputedStyle(el); out.add(cs.color); if (cs.backgroundColor !== "rgba(0, 0, 0, 0)") out.add(cs.backgroundColor);
    });
    return [...out];
  });
  const rag = colours.filter((c) => {
    const m = c.match(/\d+/g); if (!m) return false; const [r, g, b] = m.map(Number);
    return (r > 180 && g < 90 && b < 90) || (g > 150 && r < 90 && b < 110) || (r > 200 && g > 150 && b < 60);
  });
  expect(rag).toEqual([]);
});

test("Refresh now reloads the data", async ({ page }) => {
  await open(page, SCORE);
  const before = await page.locator("#inviewN").innerText();
  await page.click("#reloadBtn");
  await expect(page.locator("#inviewN")).toHaveText(before);
});
