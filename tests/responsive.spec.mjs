// Every page fits phones, tablets, laptops and desktops: no sideways page scroll, nothing in the
// app bar overlaps, and on narrow screens the filters fold into a button.
import { test, expect } from "@playwright/test";
import { HOME, SCORE, DQ, open } from "./helpers.mjs";

const SIZES = [["phone", 360, 780], ["large phone", 414, 896], ["tablet", 768, 1024], ["tablet landscape", 1024, 768],
  ["small laptop", 1280, 800], ["laptop", 1440, 900], ["desktop", 1920, 1080]];

for (const [name, url] of [["Home", HOME], ["Scorecard", SCORE], ["Data Quality", DQ]]) {
  test(name + " fits every screen size", async ({ page, isMobile }) => {
    test.skip(isMobile, "sizes are set explicitly here");
    for (const [label, w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await open(page, url, { keepFiltersFolded: true });
      const r = await page.evaluate(() => {
        const bar = document.querySelector(".appbar-in"), vw = document.documentElement.clientWidth;
        const kids = Array.from(bar.children).filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect());
        const overlap = kids.some((a, i) => kids.some((b, j) => j > i && a.right > b.left + 1 && b.right > a.left + 1));
        return { page: document.documentElement.scrollWidth - vw, bar: bar.scrollWidth - bar.clientWidth, overlap };
      });
      expect(r.page, label + " page scroll").toBeLessThanOrEqual(1);
      expect(r.bar, label + " app bar").toBeLessThanOrEqual(1);
      expect(r.overlap, label + " app bar items overlap").toBe(false);
      if (url !== HOME) {
        const folded = w < 1100;
        await expect(page.locator("#railToggle"), label).toBeVisible({ visible: folded });
        await expect(page.locator("#railInner"), label).toBeVisible({ visible: !folded });
      }
    }
  });
}

test("on a phone the filters open from the Filters button and show how many are on", async ({ page, isMobile }) => {
  test.skip(isMobile, "size set explicitly");
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, DQ, { keepFiltersFolded: true });
  await expect(page.locator("#railToggle .railcount")).toHaveText("2");   /* In Progress + Active Phase */
  await page.click("#railToggle");
  await expect(page.locator("#railInner")).toBeVisible();
  await expect(page.locator("#railToggle")).toHaveAttribute("aria-expanded", "true");
});
