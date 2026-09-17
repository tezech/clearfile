// This suite drives a real installed APK's WebView over ADB (see
// tests/support/android-app.js), not a launched browser, so there's a
// single physical/emulated device to share — tests run one at a time.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: [["list"]],
});
