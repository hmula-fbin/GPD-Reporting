// Both pages: load cleanly, greet the viewer, navigate, theme, and never reveal where the data comes from.
import { test, expect } from "@playwright/test";
import { HOME, SCORE, DQ, FORBIDDEN, open } from "./helpers.mjs";

for (const [name, url] of [["Home", HOME], ["Scorecard", SCORE], ["Data Quality", DQ]]) {
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
  for (const url of [HOME, SCORE, DQ]) {
    await open(page, url);
    const text = await page.locator("body").innerText();
    expect(text).not.toMatch(/\bGPD\b/);
    await expect(page.locator(".appbrand .nm")).toHaveText("FBIN R&D Portfolio Hub");
    expect(await page.title()).not.toMatch(/\bGPD\b/);
  }
  await open(page, SCORE);
  await expect(page.locator("h1").first()).toHaveText("Innovation & CI Portfolio Scorecard");
});

test("every page shows the report icon in the browser tab", async ({ page }) => {
  for (const url of [HOME, SCORE, DQ]) {
    await open(page, url);
    const href = await page.locator('link[rel="icon"]').getAttribute("href");
    expect(href).toMatch(/^data:image\/svg\+xml;base64,/);
  }
});

for (const [name, url, sel] of [["Scorecard", SCORE, "#content .tblwrap table"], ["Data Quality", DQ, "#st"]]) {
  test(name + ": table columns can be resized, are remembered, and double-click resets them", async ({ page, isMobile }) => {
    test.skip(isMobile, "drag-to-resize is a mouse action");
    await open(page, url);
    const th = page.locator(sel).first().locator("thead th").nth(1);
    const before = (await th.boundingBox()).width;
    const g = (await th.locator(".colgrip").boundingBox());
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2 + 90, g.y + g.height / 2, { steps: 5 });
    await page.mouse.up();
    const after = (await th.boundingBox()).width;
    expect(after).toBeGreaterThan(before + 60);
    await open(page, url);
    expect((await page.locator(sel).first().locator("thead th").nth(1).boundingBox()).width).toBeGreaterThan(before + 60);
    await page.locator(sel).first().locator("thead th").nth(1).locator(".colgrip").dblclick();
    await expect(page.locator(sel).first()).not.toHaveClass(/rz-fixed/);
  });
}

test("a table box can be dragged taller and wider from its corner, and is remembered", async ({ page, isMobile }) => {
  test.skip(isMobile, "dragging is a mouse action");
  await open(page, SCORE);
  const w = page.locator("#content .tblwrap").first();
  await w.evaluate((el) => { el.style.width = "700px"; });   /* start narrower than the card so there is room to widen */
  const b = await w.boundingBox();
  await expect.poll(async () => Math.round((await page.locator("#content .boxgrip").first().boundingBox()).x)).toBe(Math.round(b.x + b.width - 16));
  await page.locator("#content .boxgrip").first().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));
  const b2 = await w.boundingBox();
  const g = await page.locator("#content .boxgrip").first().boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 + 120, g.y + g.height / 2 + 160, { steps: 6 });
  await page.mouse.up();
  const a = await w.boundingBox();
  expect(a.height).toBeGreaterThan(b.height + 100);
  expect(a.width).toBeGreaterThan(b.width + 80);
  await open(page, SCORE);
  expect((await page.locator("#content .tblwrap").first().boundingBox()).height).toBeGreaterThan(b.height + 100);
});

test("resized tables scale with the screen instead of keeping a fixed pixel size", async ({ page, isMobile }) => {
  test.skip(isMobile, "dragging is a mouse action");
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, SCORE);
  const w = page.locator("#content .tblwrap").first();
  const share = () => w.evaluate((el) => el.getBoundingClientRect().width / el.parentElement.clientWidth);
  expect(await share()).toBeGreaterThan(0.99);                       /* untouched: fills its card */
  await page.locator("#content .boxgrip").first().scrollIntoViewIfNeeded();
  const g = await page.locator("#content .boxgrip").first().boundingBox();
  await page.mouse.move(g.x + 8, g.y + 8); await page.mouse.down();
  await page.mouse.move(g.x + 8 - 300, g.y + 8, { steps: 6 }); await page.mouse.up();
  const s1 = await share();
  expect(s1).toBeLessThan(0.85);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(200);
  expect(Math.abs((await share()) - s1)).toBeLessThan(0.02);       /* same share of the wider screen */
  await page.locator("#content .boxgrip").first().dblclick();
  expect(await share()).toBeGreaterThan(0.99);
});

test("scrollable tables keep their heading row and first column in place (freeze panes)", async ({ page, isMobile }) => {
  test.skip(isMobile, "measured on desktop");
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, DQ);
  const wrap = page.locator("#gridwrap");
  const where = () => page.evaluate(() => {
    const w = document.getElementById("gridwrap").getBoundingClientRect();
    const th = document.querySelector("#st thead th").getBoundingClientRect();
    const td = document.querySelector("#gridBody tr[data-i] td").getBoundingClientRect();
    return { wl: w.left, wt: w.top, thTop: th.top, tdLeft: td.left };
  });
  const before = await where();
  await wrap.evaluate((el) => { el.scrollLeft = 500; el.scrollTop = 200; });
  await page.waitForTimeout(100);
  const after = await where();
  expect(Math.abs(after.tdLeft - before.tdLeft)).toBeLessThan(2);     /* first column did not move sideways */
  expect(Math.abs(after.thTop - before.thTop)).toBeLessThan(2);       /* heading row did not move up */
});

test("wide tables have left/right arrows that stay in view and scroll the table", async ({ page, isMobile }) => {
  test.skip(isMobile, "measured on desktop");
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, DQ);
  const wrap = page.locator("#gridwrap"), left = page.locator(".tblarrow.left").first(), right = page.locator(".tblarrow.right").first();
  await wrap.scrollIntoViewIfNeeded();
  await expect(right).toBeVisible();
  await expect(left).toBeHidden();                                         /* already at the far left */
  const vb = await right.boundingBox();
  expect(vb.y).toBeGreaterThan(0); expect(vb.y + vb.height).toBeLessThan(800);   /* in view, not at the bottom of the page */
  const tb = await wrap.boundingBox();
  expect(vb.x).toBeGreaterThanOrEqual(tb.x + tb.width - 1);                    /* beside the table, not over its cells */
  await right.click();
  await expect.poll(() => wrap.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  await expect(left).toBeVisible();
  const far = await wrap.evaluate((el) => el.scrollLeft);
  await left.click();
  await expect.poll(() => wrap.evaluate((el) => el.scrollLeft)).toBeLessThan(far - 100);
});
