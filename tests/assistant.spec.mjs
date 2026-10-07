// "Ask questions about your data": every answer is checked against an independent calculation
// over the FULL data file (not the filtered page).
import { test, expect } from "@playwright/test";
import { HOME, SCORE, DQ, open, allRows } from "./helpers.mjs";
import { questions } from "./oracle.mjs";

for (const [name, url] of [["Home", HOME], ["Scorecard", SCORE]]) {
  test(name + ": assistant answers match the data", async ({ page }) => {
    await open(page, url);
    const rows = await allRows(page);
    const wrong = [];
    for (const [q, exp] of questions(rows)) {
      const a = await page.evaluate((q) => { const r = window.gpdAsk.answer(q); return { val: r.val }; }, q);
      const v = a.val;
      const ok = typeof exp === "number" ? typeof v === "number" && Math.abs(v - exp) <= Math.max(0.051, Math.abs(exp) * 1e-6) : v === exp;
      if (!ok) wrong.push(q + "  expected " + exp + "  got " + v);
    }
    expect(wrong).toEqual([]);
  });
}

test("assistant ignores the page filters", async ({ page }) => {
  await open(page, SCORE);
  const total = (await allRows(page)).length;
  await page.click('.ms[data-key="status"] .msbtn');
  await page.click('.ms[data-key="status"] .msopt >> text=In Progress');
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.gpdAsk.answer("how many projects").val)).toBe(total);
});

test("assistant panel opens with suggestions", async ({ page }) => {
  await open(page, SCORE);
  await page.click(".askfab");
  await expect(page.getByText("Ask questions about your data").first()).toBeVisible();
  await expect(page.getByText("Continue in Microsoft 365 Copilot")).toBeHidden();   /* hand-off link is switched off */
});

/* ---------- Copilot over every data file (checked against the synthetic files read independently here) ---------- */
import XLSX from "../tools/lib/sheetjs.mjs";
import fs from "node:fs";
function sheetRows(file, mustHave) {
  const wb = XLSX.read(fs.readFileSync(file), { cellDates: true });
  for (const n of wb.SheetNames) {
    const g = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: null });
    const h = g.findIndex((r) => (r || []).includes(mustHave));
    if (h > -1) return g.slice(h + 1).filter((r) => r && r.some((v) => v !== null)).map((r) => Object.fromEntries(g[h].map((k, i) => [k, r[i]])));
  }
  return [];
}
const PROJ = sheetRows("tests/fixtures/dq-project-fixture.csv", "ProjectName");
const PEOPLE = sheetRows("tests/fixtures/dq-resource-fixture.csv", "ResourceName");
const PIPE = sheetRows("tests/fixtures/pipeline-fixture.csv", "Project Name");
const ask = (page, q) => page.evaluate((q) => window.gpdAsk.answerAll(q).then((a) => ({ val: a.val, html: a.html, ds: a.ds })), q);

test("Copilot filters any column of another data file", async ({ page }) => {
  await open(page, HOME);
  const exp = PROJ.filter((r) => r["Strategic Bucket"] === "CRQ" && r.Brand === "Alpha").length;
  const a = await ask(page, "How many projects where Strategic Bucket is CRQ and Brand is Alpha?");
  expect(a.ds).toBe("Project");
  expect(a.val).toBe(exp);
});

test("Copilot answers from the people list", async ({ page }) => {
  await open(page, HOME);
  const a = await ask(page, "How many people are active?");
  expect(a.ds).toBe("Resource");
  expect(a.val).toBe(PEOPLE.filter((r) => r.ResourceIsActive === -1).length);   // -1 means active in the extract
});

test("Copilot totals any column by any column, and the answer downloads to Excel", async ({ page }) => {
  await open(page, SCORE);
  const by = {};
  for (const r of PIPE) { const k = r.Business || "(not set)"; by[k] = (by[k] || 0) + (r["Capital Investment"] || 0); }
  const a = await ask(page, "Total Capital Investment by Business");
  expect(a.val).toBe(Object.keys(by).length);
  const topBiz = Object.entries(by).sort((x, y) => y[1] - x[1])[0];
  expect(a.html).toContain("$" + Math.round(topBiz[1]).toLocaleString("en-US"));
  await page.click(".askfab");
  await page.fill("#askQ1", "Total Capital Investment by Business");
  await page.press("#askQ1", "Enter");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("#askLog .askxl").last().click()]);
  expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
});

test("portfolio questions still use the scorecard rules", async ({ page }) => {
  await open(page, HOME);
  const [plain, all] = await page.evaluate(async () => [window.gpdAsk.answer("Top 5 NPD projects by net sales").html, (await window.gpdAsk.answerAll("Top 5 NPD projects by net sales")).html]);
  expect(all).toBe(plain);
});

test("the Data Quality page has the Copilot too", async ({ page }) => {
  await open(page, DQ);
  const a = await ask(page, "How many projects where Strategic Bucket is Improve?");
  expect(a.val).toBe(PROJ.filter((r) => r["Strategic Bucket"] === "Improve").length);
  /* the nightly dated copies of the project file are history, not extra data: only the three files are read */
  expect(await page.evaluate(() => window.gpdExplore.datasets().length)).toBe(3);
});

test("Copilot pulls any column for one project by its number, even written as 1st / 2nd", async ({ page }) => {
  await open(page, HOME);
  const p = PROJ.find((r) => r.ProjectID === 7001);
  const when = new Date(2027, 7001 % 12, 5).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const a = await ask(page, "Show me DC 1st Ship 2 date for 7001 Project");
  expect(a.ds).toBe("Project");
  expect(a.html).toContain(p.ProjectName);
  expect(a.html).toContain("DC First Ship 2 Date");
  expect(a.html).toContain(when);
});

test("Copilot understands abbreviations and loosely named columns, and learns new terms", async ({ page }) => {
  await open(page, HOME);
  const top = PROJ.slice().sort((a, b) => (b.NPV || 0) - (a.NPV || 0))[0];
  let a = await ask(page, "Show me PMF for top 10 Projects in NPV");
  expect(a.ds).toBe("Project");
  expect(a.html).toContain("Project Management Flag");
  expect(a.html).toContain(top.ProjectName);
  a = await ask(page, "Show me DC First Ship 1 Date for the Project 7001.");
  expect(a.html).toContain(PROJ.find((r) => r.ProjectID === 7001).ProjectName);
  expect(a.html).toContain("DC First Ship 1 Date");
  a = await ask(page, "what is the ship date for project 7001");
  expect(a.html).toContain("DC First Ship 1 Date");
  expect(a.html).toContain("DC First Ship 2 Date");
  a = await ask(page, "XQV means NPV");
  expect(a.html).toContain("Got it");
  a = await ask(page, "top 3 projects by XQV");
  expect(a.html).toContain(top.ProjectName);
});

test("Copilot auto-corrects spacing and small typos against the words in the data", async ({ page }) => {
  await open(page, HOME);
  const right = await page.evaluate(() => window.gpdAsk.answerAll("Give me roadmap projects").then((a) => a.val));
  const spaced = await page.evaluate(() => window.gpdAsk.answerAll("Give me road map projects.").then((a) => ({ val: a.val, c: a.corrected, html: a.html })));
  expect(spaced.c).toMatch(/Roadmap/);
  expect(spaced.val).toBe(right);
  expect(spaced.html).toContain("Showing results for");
  const typo = await page.evaluate(() => window.gpdAsk.answerAll("how many projects in Devlop").then((a) => ({ val: a.val, c: a.corrected })));
  const exact = await page.evaluate(() => window.gpdAsk.answerAll("how many projects in Develop").then((a) => a.val));
  expect(typo.c).toMatch(/Develop/);
  expect(typo.val).toBe(exact);
  const plain = await page.evaluate(() => window.gpdAsk.answerAll("Summarize the portfolio").then((a) => a.corrected || null));
  expect(plain).toBe(null);
});

test("Copilot splits joined words and fixes misspelt column names", async ({ page }) => {
  await open(page, HOME);
  const a = await page.evaluate(() => window.gpdAsk.answerAll("projects onhold").then((a) => a.corrected));
  expect(a).toMatch(/On Hold/);
  const b = await page.evaluate(() => window.gpdAsk.answerAll("Projct Managment Flag for 7001").then((a) => ({ c: a.corrected, html: a.html })));
  expect(b.c).toMatch(/Management Flag/);
  expect(b.html).toContain("Project Management Flag:");
});
