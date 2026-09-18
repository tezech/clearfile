// CF-M03: 4-Corner Warp
// Drag all 4 pins to page edges; apply "Enhance" or "Black & White";
// click "Straighten & preview". Expected: perspective transform executes;
// filter enhances contrast; straight image renders in the review screen.
const { test, expect, APP_ID } = require("../support/android-app");
const { grantCameraPermission, openScannerAndCapture, dragCornersToEdges } = require("../support/scan-flow");

test.beforeEach(async ({ device }) => {
  await grantCameraPermission(device, APP_ID);
});

test("CF-M03: warping with corners at the edges produces a straightened preview", async ({ appPage: page }) => {
  await openScannerAndCapture(page);
  await dragCornersToEdges(page);

  await page.getByText("Black & White", { exact: true }).click();
  await page.getByText("Straighten & preview", { exact: true }).click();

  await expect(page.getByText("Review your scan", { exact: true })).toBeVisible({ timeout: 10_000 });
  const warpedImg = page.locator('img[alt="Warped"]');
  await expect(warpedImg).toBeVisible();
  const srcLength = await warpedImg.evaluate((img) => img.getAttribute("src")?.length || 0);
  expect(srcLength, "warped preview should contain rendered image data").toBeGreaterThan(1000);

  await expect(page.getByRole("button", { name: "Use this page" })).toBeVisible();
});

test("CF-M03: Enhance and Black & White filters produce visibly different output", async ({ appPage: page }) => {
  await openScannerAndCapture(page);
  await dragCornersToEdges(page);

  await page.locator("main").getByText("Enhance", { exact: true }).click();
  await page.getByText("Straighten & preview", { exact: true }).click();
  await expect(page.locator('img[alt="Warped"]')).toBeVisible({ timeout: 10_000 });
  const enhanceSrc = await page.locator('img[alt="Warped"]').getAttribute("src");

  await page.getByRole("button", { name: "Adjust corners" }).click();
  await page.getByText("Black & White", { exact: true }).click();
  await page.getByText("Straighten & preview", { exact: true }).click();
  await expect(page.locator('img[alt="Warped"]')).toBeVisible({ timeout: 10_000 });
  const bwSrc = await page.locator('img[alt="Warped"]').getAttribute("src");

  expect(bwSrc).not.toBe(enhanceSrc);
});
