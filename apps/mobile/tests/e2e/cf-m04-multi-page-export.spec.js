// CF-M04: Multi-Page Export
// Accept 3 consecutive scanned pages; click "Save as PDF".
// Expected: Capacitor Filesystem saves PDF to device Documents, and the
// native Android share sheet opens.
//
// The native share sheet itself renders outside the WebView, so it can't be
// asserted on through the page object. Instead this test asserts the two
// in-DOM signals that prove the handoff happened (the "Saved to Documents"
// toast, driven by Filesystem.writeFile resolving, followed by the
// "Opening share sheet" text right before Share.share() is called), then
// dismisses the native sheet with the Android BACK key so the suite doesn't
// hang waiting on it.
const { test, expect, APP_ID } = require("../support/android-app");
const { grantCameraPermission, openScannerAndCapture } = require("../support/scan-flow");

test.beforeEach(async ({ device }) => {
  await grantCameraPermission(device, APP_ID);
});

test("CF-M04: 3 accepted pages export as one multi-page PDF via the native share sheet", async ({ appPage: page, device }) => {
  for (let i = 1; i <= 3; i++) {
    await openScannerAndCapture(page);
    await page.getByText("Straighten & preview", { exact: true }).click();
    await expect(page.locator('img[alt="Warped"]')).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Use this page" }).click();
    await expect(page.getByText(`Page ${i} added!`)).toBeVisible({ timeout: 5000 });
  }

  await expect(page.getByText("Pages captured (3)")).toBeVisible();
  await expect(page.locator('img[alt="Pg"]')).toHaveCount(3);

  await page.getByRole("button", { name: "Save as PDF" }).click();

  await expect(page.getByText(/Saved to Documents! Opening share sheet/)).toBeVisible({ timeout: 15_000 });

  // Dismiss the native share sheet (outside the WebView) so it doesn't block
  // the next test.
  await device.shell("input keyevent 4"); // KEYCODE_BACK
});
