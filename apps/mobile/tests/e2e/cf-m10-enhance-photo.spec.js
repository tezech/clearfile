// CF-M10: Enhance Photo (new feature)
// Select a photo, pick an enhancement strength, run the enhancer.
// Expected: sharpen + denoise + auto-contrast run entirely client-side;
// the preview updates in place; result saves to device Documents and opens
// the native share sheet, matching every other export in the app.
const { test, expect } = require("../support/android-app");
const { createSizedImageFile } = require("../support/fixtures");

test("CF-M10: enhancing a photo updates the preview and exports it", async ({ appPage: page }) => {
  const sourcePath = createSizedImageFile(300 * 1024, "enhance-source.png");

  await page.locator("main").getByText("Enhance Photo").click();
  await expect(page.getByText("Sharpen, Denoise & Auto-Color Correct")).toBeVisible({ timeout: 10_000 });

  await page.locator('input[type="file"]').first().setInputFiles(sourcePath);
  await expect(page.getByText("Enhancement strength:")).toBeVisible();

  const preview = page.locator('img[alt="Enhance preview"]');
  const srcBefore = await preview.getAttribute("src");

  await page.getByRole("button", { name: "Balanced" }).click();
  await page.getByRole("button", { name: "Enhance Photo", exact: true }).click();

  await expect(page.getByText(/Enhanced! Sharpened, denoised/)).toBeVisible({ timeout: 15_000 });
  const srcAfter = await preview.getAttribute("src");
  expect(srcAfter, "preview should update to the enhanced output").not.toBe(srcBefore);

  await page.getByText("Save Enhanced Photo to Phone", { exact: false }).click();
  await expect(page.getByText(/Saved to Documents! Opening share sheet/)).toBeVisible({ timeout: 15_000 });
});

test("CF-M10: Light and Strong strengths produce different output", async ({ appPage: page }) => {
  const sourcePath = createSizedImageFile(300 * 1024, "enhance-levels-source.png");

  await page.locator("main").getByText("Enhance Photo").click();
  await page.locator('input[type="file"]').first().setInputFiles(sourcePath);

  const preview = page.locator('img[alt="Enhance preview"]');

  await page.getByRole("button", { name: "Light" }).click();
  await page.getByRole("button", { name: "Enhance Photo", exact: true }).click();
  await expect(page.getByText(/Enhanced! Sharpened, denoised/)).toBeVisible({ timeout: 15_000 });
  const lightSrc = await preview.getAttribute("src");

  await page.getByText("Change Photo").click();
  await page.locator('input[type="file"]').first().setInputFiles(sourcePath);
  await page.getByRole("button", { name: "Strong" }).click();
  await page.getByRole("button", { name: "Enhance Photo", exact: true }).click();
  await expect(page.getByText(/Enhanced! Sharpened, denoised/)).toBeVisible({ timeout: 15_000 });
  const strongSrc = await preview.getAttribute("src");

  expect(strongSrc).not.toBe(lightSrc);
});

test("CF-M10: switching dock tabs away from Enhance and back leaves no frozen state", async ({ appPage: page }) => {
  const sourcePath = createSizedImageFile(300 * 1024, "enhance-frozen-check.png");

  await page.locator("main").getByText("Enhance Photo").click();
  await page.locator('input[type="file"]').first().setInputFiles(sourcePath);
  await page.getByRole("button", { name: "Enhance Photo", exact: true }).click();
  await expect(page.getByText(/Enhanced! Sharpened, denoised/)).toBeVisible({ timeout: 15_000 });

  await page.locator("footer").getByText("Scan QR", { exact: true }).click();
  await expect(page.getByText("Continuous QR Scanner")).toBeVisible();

  await page.locator("footer").getByText("Enhance", { exact: true }).click();
  // Tool state persists across dock switches everywhere in this app (by
  // design — e.g. Compress Files behaves the same way), so re-entering
  // shows the last result rather than resetting. What matters is that it's
  // not stuck on the "Enhancing..." spinner and is fully interactive again.
  await expect(page.getByText(/Enhanced! Sharpened, denoised/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Enhance Photo", exact: true })).toBeEnabled();
  await expect(page.getByText("Change Photo")).toBeVisible();
});
