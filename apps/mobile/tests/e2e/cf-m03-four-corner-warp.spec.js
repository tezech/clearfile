// CF-M03: 4-Corner Warp
// Drag all 4 pins to page edges; apply "Magic Color" or "Crisp B&W";
// click "Warp Perspective". Expected: perspective transform executes;
// filter enhances contrast; straight image renders in inspection studio.
const { test, expect, APP_ID } = require("../support/android-app");
const { grantCameraPermission, openScannerAndCapture, dragCornersToEdges } = require("../support/scan-flow");

test.beforeEach(async ({ device }) => {
  await grantCameraPermission(device, APP_ID);
});

test("CF-M03: warping with corners at the edges produces a straightened preview", async ({ appPage: page }) => {
  await openScannerAndCapture(page);
  await dragCornersToEdges(page);

  await page.getByText("Crisp B&W", { exact: true }).click();
  await page.getByText("Warp Perspective & Preview", { exact: false }).click();

  await expect(page.getByText("Inspection Studio", { exact: false })).toBeVisible({ timeout: 10_000 });
  const warpedImg = page.locator('img[alt="Warped"]');
  await expect(warpedImg).toBeVisible();
  const srcLength = await warpedImg.evaluate((img) => img.getAttribute("src")?.length || 0);
  expect(srcLength, "warped preview should contain rendered image data").toBeGreaterThan(1000);

  await expect(page.getByRole("button", { name: /Accept Page/ })).toBeVisible();
});

test("CF-M03: Magic Color and Crisp B&W produce visibly different output", async ({ appPage: page }) => {
  await openScannerAndCapture(page);
  await dragCornersToEdges(page);

  await page.getByText("Magic Color", { exact: true }).click();
  await page.getByText("Warp Perspective & Preview", { exact: false }).click();
  await expect(page.locator('img[alt="Warped"]')).toBeVisible({ timeout: 10_000 });
  const magicSrc = await page.locator('img[alt="Warped"]').getAttribute("src");

  await page.getByRole("button", { name: /Re-Adjust Corners/ }).click();
  await page.getByText("Crisp B&W", { exact: true }).click();
  await page.getByText("Warp Perspective & Preview", { exact: false }).click();
  await expect(page.locator('img[alt="Warped"]')).toBeVisible({ timeout: 10_000 });
  const bwSrc = await page.locator('img[alt="Warped"]').getAttribute("src");

  expect(bwSrc).not.toBe(magicSrc);
});
