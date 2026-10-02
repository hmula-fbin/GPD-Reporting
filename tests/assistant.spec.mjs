// "Ask questions about your data": every answer is checked against an independent calculation
// over the FULL data file (not the filtered page).
import { test, expect } from "@playwright/test";
import { HOME, SCORE, open, allRows } from "./helpers.mjs";
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
});
