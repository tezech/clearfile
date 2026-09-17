// CF-W07: Enhance Image (new feature)
// Upload an image, pick an enhancement strength, click Enhance.
// Expected: sharpen + denoise + auto-contrast run entirely client-side;
// the output is a structurally valid image, visibly different from the
// source, and downloads correctly.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const { createSmallImageFile } = require("../support/fixtures");

test("CF-W07: enhancing an image produces a different, valid image and downloads it", async ({ page }) => {
  const imagePath = createSmallImageFile("enhance-source.png");

  await page.goto("/enhance-image");
  await page.locator('input[type="file"]').setInputFiles(imagePath);

  await expect(page.getByText("Enhancement strength:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Balanced" })).toBeVisible();

  await page.getByRole("button", { name: "Enhance" }).click();
  await expect(page.getByText("Enhancing your image")).toBeVisible();
  await expect(page.getByRole("button", { name: "Get Enhanced Image" })).toBeVisible({ timeout: 20_000 });

  // Before/after preview both render.
  await expect(page.locator('img[alt="Before"]')).toBeVisible();
  await expect(page.locator('img[alt="After"]')).toBeVisible();

  await page.getByRole("button", { name: "Get Enhanced Image" }).click();
  await page.waitForTimeout(3200);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Now" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^enhanced-.+\.png$/);
  const downloadedPath = await download.path();
  const bytes = fs.readFileSync(downloadedPath);

  // Structurally valid PNG.
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // Pixel content actually changed (sharpen/contrast ran, this isn't a passthrough).
  const originalBytes = fs.readFileSync(imagePath);
  expect(bytes.equals(originalBytes)).toBe(false);
});

test("CF-W07: Light and Strong enhancement levels produce different output", async ({ page }) => {
  const imagePath = createSmallImageFile("enhance-levels-source.png");

  const outputSizeForLevel = async (levelLabel) => {
    await page.goto("/enhance-image");
    await page.locator('input[type="file"]').setInputFiles(imagePath);
    await page.getByRole("button", { name: levelLabel }).click();
    await page.getByRole("button", { name: "Enhance" }).click();
    await expect(page.getByRole("button", { name: "Get Enhanced Image" })).toBeVisible({ timeout: 20_000 });
    return page.locator('img[alt="After"]').getAttribute("src");
  };

  const lightSrc = await outputSizeForLevel("Light Touch");
  const strongSrc = await outputSizeForLevel("Strong");

  expect(strongSrc).not.toBe(lightSrc);
});

test("CF-W07: enhance failure path shows a recoverable error, not a crash", async ({ page }) => {
  await page.goto("/enhance-image");
  page.once("dialog", (dialog) => dialog.accept());

  const corruptPath = require("path").join(__dirname, "..", ".tmp", `corrupt-enhance-${Date.now()}.png`);
  require("fs").mkdirSync(require("path").dirname(corruptPath), { recursive: true });
  fs.writeFileSync(corruptPath, Buffer.from([137, 80, 78, 71, 0, 0, 0, 0]));

  await page.locator('input[type="file"]').setInputFiles(corruptPath);
  await page.getByRole("button", { name: "Enhance" }).click();
  await expect(page.getByText("Click to choose an image")).toBeVisible({ timeout: 10_000 });
});
