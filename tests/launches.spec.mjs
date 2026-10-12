// Upcoming Launches: projects with a Ship-Trans Date in the next 6 months, read live from the project file.
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import XLSX from "../tools/lib/sheetjs.mjs";
import { HOME, LAUNCH, open } from "./helpers.mjs";

/* The synthetic project file, as text (no date conversion), one object per project. */
function projects() {
  const wb = XLSX.read(fs.readFileSync("tests/fixtures/dq-project-fixture.csv", "utf8"), { type: "string", raw: true });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
}
const shown = async (page) => Number((await page.locator("#inviewN").textContent()).replace(/,/g, ""));

test("lists every project with a Ship-Trans Date from today to six months from today, and no other", async ({ page }) => {
  await open(page, LAUNCH);
  const L = await page.evaluate(() => window.gpdLaunch());
  const today = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); });
  expect(L.start).toBe(today);
  const end = new Date(today + "T12:00:00"); end.setMonth(end.getMonth() + 6);
  expect(L.end).toBe(end.toISOString().slice(0, 10));
  const want = projects().filter((p) => p["Ship-Trans Date"] >= L.start && p["Ship-Trans Date"] <= L.end).map((p) => p.ProjectName).sort();
  expect(want.length).toBeGreaterThan(0);
  expect(L.projects.map((p) => p.name).sort()).toEqual(want);
  await expect(page.locator("#inwinN")).toContainText("of " + want.length);
  await expect(page.locator("#subline")).toContainText(/next 6 months \(\d\d\/\d\d\/\d{4} . \d\d\/\d\d\/\d{4}\) · Data as at/);
});

test("opens on In Progress and the Active Phase, sorted by Ship-Trans Date", async ({ page }) => {
  await open(page, LAUNCH);
  const L = await page.evaluate(() => window.gpdLaunch());
  expect(L.filters.st).toEqual(["In Progress"]);
  for (const ph of L.filters.ph) expect(ph).toMatch(/\bactive\b/i);
  const live = L.projects.filter((p) => p.st === "In Progress" && /\bactive\b/i.test(p.ph));
  await expect.poll(() => shown(page)).toBe(live.length);
  const dates = await page.locator("#gridBody tr td.d").allTextContents();
  const iso = dates.map((d) => d.slice(6) + "-" + d.slice(0, 2) + "-" + d.slice(3, 5));
  expect(iso).toEqual(iso.slice().sort());
  await expect(page.locator("#headRow th").first()).toHaveText("Project Number");
});

test("the table has the eleven columns, dates as MM/DD/YYYY and the month of launch", async ({ page }) => {
  await open(page, LAUNCH);
  const heads = (await page.locator("#headRow th").allTextContents()).map((t) => t.replace(/[▲▼]/g, "").trim());
  expect(heads).toEqual(["Project Number", "Project Name", "Ship-Trans Date", "Month of Launch", "Project Description", "Project Manager",
    "Project Type", "Current Stage", "Brand", "Distribution Channel", "Primary Customer"]);
  const row = page.locator("#gridBody tr").first().locator("td");
  await expect(row.nth(2)).toHaveText(/^\d\d\/\d\d\/\d{4}$/);
  await expect(row.nth(3)).toHaveText(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}$/);
  await expect(row.nth(4)).toHaveText(/^Scope statement for test project \d+\.$/);   // Project Description, from the Project Scope Statement
  await expect(row.nth(9)).toHaveText(/^(Retail|Wholesale|E-Commerce, Retail)$/);   // Distribution Channel, from the DistributionChannel field
  await expect(row.nth(7)).not.toHaveText(/^\d/);                         // stage without its "03 02" code
});

test("the twelve filters are multi-select with counts, and Reset goes back to the default view", async ({ page }) => {
  await open(page, LAUNCH);
  const keys = await page.locator("#filterFields .ms").evaluateAll((els) => els.map((e) => e.dataset.key));
  expect(keys).toEqual(["ml", "sp", "ex", "sb", "st", "room", "type", "pm", "mpm", "ph", "stage", "brand"]);
  await expect(page.locator("#lab_pm")).toHaveText("Project owner");
  const before = await shown(page);
  await page.click("#fld_st .msbtn");
  await page.locator("#fld_st .msacts button[data-act=none]").click();       // every status
  await page.keyboard.press("Escape");
  const all = await page.evaluate(() => window.gpdLaunch());
  const allPh = all.projects.filter((p) => /\bactive\b/i.test(p.ph)).length;
  await expect.poll(() => shown(page)).toBe(allPh);
  const month = all.projects[0].ml;
  await page.click("#fld_ml .msbtn");
  await page.locator("#fld_ml .msopt", { hasText: month }).locator("input").check();
  await page.keyboard.press("Escape");
  await expect(page.locator("#fld_ml .mslab")).toHaveText(month);
  const inMonth = await page.evaluate(() => window.gpdLaunch().view.length);
  await expect.poll(() => shown(page)).toBe(inMonth);
  for (const t of await page.locator("#gridBody tr td:nth-child(4)").allTextContents()) expect(t).toBe(month);
  await page.click("#resetBtn");
  await expect.poll(() => shown(page)).toBe(before);
});

test("project search finds a project by its name", async ({ page }) => {
  await open(page, LAUNCH);
  const name = await page.locator("#gridBody tr").first().locator("td").nth(1).textContent();
  await page.fill("#fQ", name);
  await expect.poll(() => shown(page)).toBe(1);
});

test("clicking a heading sorts; dragging a heading moves the column, is remembered, and Reset layout restores it", async ({ page, isMobile }) => {
  test.skip(isMobile, "dragging is a mouse action");
  await open(page, LAUNCH);
  await page.click("#headRow th[data-k=name]");
  const names = await page.locator("#gridBody tr td:nth-child(2)").allTextContents();
  expect(names).toEqual(names.slice().sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  const from = await page.locator("#headRow th[data-k=ml]").boundingBox();    // Month of Launch, moved in front of Project Name
  const to = await page.locator("#headRow th[data-k=name]").boundingBox();
  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 5, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  const order = () => page.locator("#headRow th").evaluateAll((els) => els.slice(0, 3).map((e) => e.dataset.k));
  await expect.poll(order).toEqual(["n", "ml", "name"]);
  await open(page, LAUNCH);
  await expect.poll(order).toEqual(["n", "ml", "name"]);
  await page.click("#layoutBtn");
  await expect.poll(order).toEqual(["n", "name", "d"]);
});

test("the Excel button downloads the projects in view", async ({ page }) => {
  await open(page, LAUNCH);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#xlBtn")]);
  expect(dl.suggestedFilename()).toMatch(/^Upcoming_Launches_\d{4}-\d\d-\d\d\.xlsx$/);
});

test("Home has an Upcoming Launches tile and the menu lists the page", async ({ page }) => {
  await open(page, HOME);
  await expect(page.locator('.card[href$="Upcoming_Launches.aspx"]')).toBeVisible();
  await page.click("#navBtn");
  await expect(page.locator('#navDrawer a[href$="Upcoming_Launches.aspx"]')).toBeVisible();
});

test("Prod: Upcoming Launches is switched off: no page, Coming soon on Home and Soon in the menu", async ({ page }) => {
  const files = JSON.parse(fs.readFileSync("dist/prod/manifest.json", "utf8")).files.map((f) => f.name);
  expect(files).not.toContain("Upcoming_Launches.aspx");
  expect(fs.existsSync("dist/prod/Upcoming_Launches.aspx")).toBe(false);
  await page.setContent(fs.readFileSync("dist/prod/Home.aspx", "ascii"));
  await expect(page.locator("#launchSoon")).toContainText("Coming soon");
  await expect(page.locator('a[href$="Upcoming_Launches.aspx"]')).toHaveCount(0);
  await page.click("#navBtn");
  await expect(page.locator("#navDrawer .navitem.off", { hasText: "Upcoming Launches" })).toContainText("Soon");
});
