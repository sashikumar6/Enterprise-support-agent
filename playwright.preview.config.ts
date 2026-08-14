import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.SCOUT_RELEASE_URL ?? process.env.SCOUT_PREVIEW_URL;

if (!baseURL) {
  throw new Error(
    "SCOUT_RELEASE_URL is required for deployed release smoke tests",
  );
}

export default defineConfig({
  testDir: "./test/release",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "release-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "release-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
