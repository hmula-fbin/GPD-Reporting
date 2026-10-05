// Both pages: load cleanly, greet the viewer, navigate, theme, and never reveal where the data comes from.
import { test, expect } from "@playwright/test";
import { HOME, SCORE, FORBIDDEN, open } from "./helpers.mjs";

for (const [name, url] of [["Home", HOME], ["Scorecard", SCORE]]) {
  test.describe(name, () => {
    test("loads with no script errors and no horizontal scroll", async ({ page }) => {
      const errors = await open(page, url);
      const sw = await page.evaluate(() => document.documentElement.scrollWidth);
      const vw = page.viewportSize().width;
      expect(sw).toBeLessThanOrEqual(vw + 1);
      expect(errors).toEqual([]);
    });

    test("does not show the data file name or source location", async ({ page }) => {
      await open(page, url);
      const text = await page.locator("body").innerText();
      expect(text).not.toMatch(FORBIDDEN);
    });

    test("menu opens and links to the other page", async ({ page }) => {
      await open(page, url);
      await page.click("#navBtn");
      await expect(page.locator("#navDrawer")).toBeVisible();
      const other = name === "Home" ? "Portfolio_Scorecard.aspx" : "Home.aspx";
      await expect(page.locator('#navDrawer a[href$="' + other + '"]').first()).toBeVisible();
      await page.keyboard.press("Escape");
    });

    test("theme toggle switches and remembers", async ({ page }) => {
      await open(page, url);
      const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      await page.click("#themeBtn");
      const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      expect(after).not.toBe(before);
      expect(await page.evaluate(() => localStorage.getItem("fbin_theme"))).toBe(after);
    });

    test("shows the DEV environment badge", async ({ page }) => {
      await open(page, url);
      await expect(page.locator(".envbadge")).toHaveText("DEV");
    });
  });
}

test("Home greets the viewer by first name, by time of day", async ({ page }) => {
  await open(page, HOME);
  await expect(page.locator("#greet")).toHaveText(/^Good (morning|afternoon|evening), Alex$/);
});

test("Home is clean: no glance panel, no intro text, no scorecard button in the hero", async ({ page }) => {
  await open(page, HOME);
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/Portfolio at a glance/i);
  expect(text).not.toMatch(/Track the innovation pipeline/i);
  expect(text).not.toMatch(/Open Portfolio Score Card/i);
  await expect(page.locator(".hero a")).toHaveCount(0);
  await expect(page.locator('.card[href$="Portfolio_Scorecard.aspx"]')).toBeVisible();
});

test("pages say FBIN R&D, never GPD, and the scorecard title is in title case", async ({ page }) => {
  for (const url of [HOME, SCORE]) {
    await open(page, url);
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/\bGPD\b/);
    await expect(page.locator(".appbrand .nm")).toHaveText("FBIN R&D Portfolio Hub");
    expect(await page.title()).not.toMatch(/\bGPD\b/);
  }
  await expect(page.locator("h1").first()).toHaveText("Innovation & CI Portfolio Scorecard");
});

test("both pages show the report icon in the browser tab", async ({ page }) => {
  for (const url of [HOME, SCORE]) {
    await open(page, url);
    const href = await page.locator('link[rel="icon"]').getAttribute("href");
    expect(href).toMatch(/^data:image\/svg\+xml;base64,/);
  }
});
