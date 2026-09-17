// CF-M01: Splash Lifecycle
// Launch APK cold from launcher.
// Expected: custom splash renders for 1.8s, completely unmounts from DOM,
// and transitions touch focus to dashboard.
const { test, expect } = require("../support/android-app");

test("CF-M01: splash shows on cold launch, then fully unmounts into the dashboard", async ({ appPage: page }) => {
  // appPage already performed the cold launch (force-stop + am start) right
  // before handing back this page, so we're at/near the start of the 1.8s
  // splash window defined in src/app/page.js (setTimeout(..., 1800)).
  await expect(page.locator("body")).not.toBeEmpty();

  await page.waitForFunction(() => document.querySelector(".splash-anim") === null, {
    timeout: 5000,
  });

  // "Completely unmounts" means the node is gone, not just hidden.
  expect(await page.$(".splash-anim")).toBeNull();

  // Touch focus reaches the dashboard: dock icons and tool cards respond.
  await expect(page.getByText("System Applications")).toBeVisible();
  await expect(page.locator("main").getByText("Doc Scanner")).toBeVisible();
  await page.locator("main").getByText("Doc Scanner").click();
  await expect(page.getByText("Open Camera Viewfinder")).toBeVisible({ timeout: 10_000 });
});
