import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "dist/dev/manifest.json"), "utf8"));
export const HOME = MANIFEST.pagesUrl + "Home.aspx";
export const SCORE = MANIFEST.pagesUrl + "Portfolio_Scorecard.aspx";

/* Words that must never be visible: the data file name or where the data lives. */
export const FORBIDDEN = /pipeline data|report files|sharepoint|\.xlsx|network drive|workbook|upload|import/i;

/* Open a page, collect script errors, wait for the data to land. */
export async function open(page, url) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url);
  if (url.endsWith("Portfolio_Scorecard.aspx")) await expect(page.locator("#content")).toBeVisible({ timeout: 15_000 });
  else await expect(page.locator("#kN .sk")).toHaveCount(0, { timeout: 15_000 });
  return errors;
}

/* Every project the assistant can see (the full data file, not the filtered page). */
export const allRows = (page) => page.evaluate(() => window.gpdData().rows);
