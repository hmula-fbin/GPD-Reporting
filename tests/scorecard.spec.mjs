// Scorecard behaviour that the business asked for. If one of these fails, a requirement broke.
import { test, expect } from "@playwright/test";
import { SCORE, open, allRows, inDefaultView, FORBIDDEN } from "./helpers.mjs";

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

test("projects with longer execution time than forecasted have their own tab", async ({ page }) => {
  await open(page, SCORE);
  await expect(page.locator("#content h2", { hasText: /longer execution time than forecasted/i })).toHaveCount(0);
  const n = await page.evaluate(() => S.last.review.length);
  await expect(page.locator("#tabReviewN")).toHaveText(String(n));
  await page.click("#tab_review");
  await expect(page.locator("#tab_review")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#content h2")).toHaveText("Projects that have longer execution time than forecasted");
  await expect(page.locator("#content .expbtn")).toHaveCount(1);
  if (n) {
    await page.click("#content tbody tr.drillable >> nth=0");
    await expect(page.locator("#drTitle")).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.click("#tab_score");
  await expect(page.locator("#content h2", { hasText: "Portfolio at a glance" })).toBeVisible();
});

test("month-over-month trend compares last month's month-end copy with today's data", async ({ page }) => {
  await open(page, SCORE);
  await page.waitForFunction(() => window.gpdTrendReady === true);
  // last month comes from its month-end copy, not the mid-month one; this month is the live data.
  // The month before is a copy named by hand ("Pipeline Data_8.31.2026.csv"), which counts too.
  const t = await page.evaluate(async () => {
    const d = new Date(), c = S.copies[S.copies.length - 1];
    return { cur: monthLabel(monthKey()), last: monthLabel(monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1))),
      before: monthLabel(monthKey(new Date(d.getFullYear(), d.getMonth() - 2, 1))),
      day: c.capturedAt.slice(8, 10), endDay: String(new Date(d.getFullYear(), d.getMonth(), 0).getDate()),
      lastN: snapshotMetrics(await readCopy(c)).projects, nowN: S.last.kpi.inView };
  });
  expect(t.day).toBe(t.endDay);
  expect(t.lastN).not.toBe(t.nowN);
  await page.click("#tab_trend");
  await expect(page.locator("#tabTrendN")).toHaveText("3");
  const rows = page.locator("#content table:has(th:text-is('Change vs prior')) tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2).locator("td").nth(0)).toHaveText(t.before);
  await expect(rows.nth(0).locator("td").nth(0)).toContainText(t.cur);
  await expect(rows.nth(0).locator("td").nth(1)).toHaveText(String(t.nowN));
  await expect(rows.nth(1).locator("td").nth(0)).toHaveText(t.last);
  await expect(rows.nth(1).locator("td").nth(1)).toHaveText(String(t.lastN));
  await expect(rows.nth(0).locator("td").nth(4)).not.toHaveText("—");   // a change vs last month is shown
  await expect(page.locator("#content .warnbar")).toHaveCount(0);       // every copy was read
  expect(await page.locator("body").innerText()).not.toMatch(FORBIDDEN);
});

test("the two headline cards show the figure only: no trend line, no change vs last month", async ({ page }) => {
  await open(page, SCORE);
  await page.waitForFunction(() => window.gpdTrendReady === true);   // last month is known, so a change could show
  await expect(page.locator(".heroCard")).toHaveCount(2);
  await expect(page.locator(".heroCard svg, .heroCard .spark")).toHaveCount(0);
  await expect(page.locator(".heroCard .delta")).toHaveCount(0);
  await expect(page.locator(".heroCard", { hasText: /last month|month-over-month/i })).toHaveCount(0);
});

test("the date column is called Ship-Trans Date everywhere on the scorecard", async ({ page }) => {
  await open(page, SCORE);
  const text = await page.locator("#content").innerText();
  expect(text).toContain("Ship-Trans Date");
  expect(text).not.toMatch(/End date/i);
  const rows = await allRows(page);
  const bucket = NPD.find((b) => rows.some((r) => r.bucket === b && inDefaultView(r)));
  await page.click("tr.drillable >> text=" + bucket);
  await expect(page.locator("#drTable th", { hasText: "Ship-Trans Date" })).toHaveCount(1);
  await page.click("#drTable tbody tr[data-i] >> nth=0");
  await expect(page.locator("#drProj")).toContainText("Ship-Trans Date");
  await expect(page.locator("#drProj")).not.toContainText(/^Finish$/m);
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

test("every scorecard table shows Capital Investment and PD Investment from the data file", async ({ page }) => {
  await open(page, SCORE);
  const heads = await page.locator("#content .tblwrap table").evaluateAll((ts) => ts.map((t) => Array.from(t.querySelectorAll("thead th")).map((th) => th.textContent.trim())));
  expect(heads.length).toBeGreaterThan(4);
  for (const h of heads) { expect(h).toContain("Capital Investment"); expect(h).toContain("PD Investment"); }
  const t = await page.evaluate(() => {
    const npd = S.last.view.filter((r) => ["Grow the Core", "Refresh & Sustain", "Create & Transform"].includes(r.bucket));
    return { capex: S.last.npdTotal.capex, pdinv: S.last.npdTotal.pdinv, sumCapex: npd.reduce((a, r) => a + (r.capex || 0), 0), sumPd: npd.reduce((a, r) => a + (r.pdinv || 0), 0) };
  });
  expect(t.sumPd).toBeGreaterThan(0);
  expect(t.capex).toBe(t.sumCapex);
  expect(t.pdinv).toBe(t.sumPd);
});

test("summary tables fit their card on a desktop screen (no sideways scroll)", async ({ page, isMobile }) => {
  test.skip(isMobile, "phones scroll wide tables sideways");
  await open(page, SCORE);
  const wide = await page.locator("#content .tblwrap").evaluateAll((ws) => ws.filter((w) => w.scrollWidth > w.clientWidth + 1).map((w) => w.querySelector("th") && w.querySelector("th").textContent));
  expect(wide).toEqual([]);
});
