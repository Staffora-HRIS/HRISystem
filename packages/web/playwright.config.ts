import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Test Configuration for Staffora HRIS Web Frontend
 *
 * Run E2E tests:
 *   bunx playwright test
 *   bunx playwright test --ui          # interactive mode
 *   bunx playwright test auth.spec.ts  # single file
 *
 * Prerequisites:
 *   - Web dev server running on http://localhost:5173
 *   - API server running on http://localhost:3000
 *   - Database seeded with test data (bun run db:seed)
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",

  /* Maximum time one test can run */
  timeout: 30_000,

  /* Expect timeout for assertions */
  expect: {
    timeout: 10_000,
  },

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if test.only is accidentally left in source */
  forbidOnly: !!process.env.CI,

  /* Retry failed tests once on CI, none locally */
  retries: process.env.CI ? 1 : 0,

  /* Limit parallel workers on CI to avoid flakiness */
  workers: process.env.CI ? 2 : undefined,

  /* Reporter configuration */
  reporter: process.env.CI
    ? [["html", { outputFolder: "./e2e/playwright-report" }], ["github"]]
    : [["html", { outputFolder: "./e2e/playwright-report", open: "never" }]],

  /* Shared settings for all projects */
  use: {
    baseURL: "http://localhost:5173",

    /* Collect trace on first retry to help debug CI failures */
    trace: "on-first-retry",

    /* Screenshot on failure for every test */
    screenshot: "only-on-failure",

    /* Record video on first retry */
    video: "on-first-retry",

    /* Extra HTTP headers sent with every request */
    extraHTTPHeaders: {
      "Accept-Language": "en-GB",
    },

    /* Default navigation timeout */
    navigationTimeout: 15_000,

    /* Default action timeout */
    actionTimeout: 10_000,
  },

  /* Test projects for different viewports */
  projects: [
    {
      name: "Desktop Chrome",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "Mobile Chrome",
      use: {
        ...devices["Pixel 5"],
      },
    },
    {
      name: "Mobile Safari",
      use: {
        ...devices["iPhone 13"],
      },
    },
  ],

  /* Start the web dev server before running tests (optional, disable if running separately) */
  webServer: process.env.CI
    ? {
        command: "bun run dev:web",
        url: "http://localhost:5173",
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : undefined,
});
