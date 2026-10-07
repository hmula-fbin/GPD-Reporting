// Playwright runs the built dev pages against the local preview server (fake SharePoint REST + fixture data).
import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;
export default defineConfig({
  testDir: "tests",
  testMatch: /.*\.spec\.mjs/,
  timeout: 60_000,
  fullyParallel: true,
  workers: 4, // more than this overloads a laptop and slow pages time out
  reporter: [["list"], ["html", { open: "never", outputFolder: "test-results/report" }]],
  outputDir: "test-results/artifacts",
  use: {
    baseURL: "http://localhost:" + PORT,
    timezoneId: "America/New_York",
    acceptDownloads: true,
    trace: "retain-on-failure",
    // Use a pre-installed Chromium if one is configured, otherwise Playwright's own.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: "desktop-light", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, colorScheme: "light" } },
    { name: "mobile-dark", use: { ...devices["Pixel 7"], browserName: "chromium", colorScheme: "dark" } },
  ],
  webServer: {
    command: "node tools/serve.mjs --env dev --port " + PORT + ' --user "Preview, Alex"',
    url: "http://localhost:" + PORT + "/",
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
