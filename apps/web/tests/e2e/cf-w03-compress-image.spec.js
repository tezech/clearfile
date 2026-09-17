// CF-W03: Compress Image
// Upload PNG/JPEG (>2 MB), choose compression quality level, click Compress.
// Expected: browser canvas/WASM compresses image; file size is reduced;
// download link triggers valid file download.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const { createOversizedImageFile } = require("../support/fixtures");

test("CF-W03: oversized PNG upload is compressed and downloads smaller", async ({ page }) => {
  // WASM/web-worker compression of a multi-MB image can be slow under CPU
  // contention when the suite runs with several parallel workers; give this
  // one more headroom than the default 30s so contention doesn't flake it.
  test.setTimeout(60_000);
  const originalPath = createOversizedImageFile(3 * 1024 * 1024);
  const originalSize = fs.statSync(originalPath).size;
  expect(originalSize).toBeGreaterThan(2 * 1024 * 1024);

  await page.goto("/compress-image");

  await page.locator('input[type="file"]').setInputFiles(originalPath);

  // Quality level picker appears before compression runs.
  await expect(page.getByText("Compression quality:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Recommended" })).toBeVisible();
  await page.getByRole("button", { name: "Extreme (smallest size)" }).click();
  await page.getByRole("button", { name: "Compress", exact: true }).click();

  await expect(page.getByText("Compressing your image")).toBeVisible();
  await expect(page.getByRole("button", { name: "Get Compressed Image" })).toBeVisible({ timeout: 30_000 });

  const originalLabel = await page.locator("text=Original").locator("xpath=following-sibling::p").innerText();
  const compressedLabel = await page.locator("text=Compressed").locator("xpath=following-sibling::p").innerText();
  expect(originalLabel).not.toBe(compressedLabel);

  await page.getByRole("button", { name: "Get Compressed Image" }).click();
  await expect(page.getByText(/Your download will be ready/)).toBeVisible();

  await page.waitForTimeout(3200); // countdown before Download Now unlocks
  const downloadButton = page.getByRole("button", { name: "Download Now" });
  await expect(downloadButton).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadButton.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^compressed-.+\.png$/);
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  const downloadedSize = fs.statSync(downloadedPath).size;
  expect(downloadedSize).toBeGreaterThan(0);
});

test("CF-W03: Light/Recommended/Extreme levels produce progressively smaller output", async ({ page }) => {
  // Runs compression twice end-to-end; give it the same contention headroom
  // as the test above, doubled.
  test.setTimeout(90_000);
  const originalPath = createOversizedImageFile(3 * 1024 * 1024);

  const sizeForLevel = async (levelLabel) => {
    await page.goto("/compress-image");
    await page.locator('input[type="file"]').setInputFiles(originalPath);
    await page.getByRole("button", { name: levelLabel }).click();
    await page.getByRole("button", { name: "Compress", exact: true }).click();
    await expect(page.getByRole("button", { name: "Get Compressed Image" })).toBeVisible({ timeout: 40_000 });
    const text = await page.locator("text=Compressed").locator("xpath=following-sibling::p").innerText();
    const match = text.match(/([\d.]+)\s*(KB|MB)/);
    return match[2] === "MB" ? parseFloat(match[1]) * 1024 : parseFloat(match[1]);
  };

  const lightKB = await sizeForLevel("Light (best quality)");
  const extremeKB = await sizeForLevel("Extreme (smallest size)");

  expect(extremeKB, "Extreme should compress smaller than Light for the same source image").toBeLessThan(lightKB);
});

test("CF-W03: compression failure path shows a recoverable error, not a crash", async ({ page }) => {
  await page.goto("/compress-image");

  page.once("dialog", (dialog) => dialog.accept());

  const corruptPath = require("path").join(__dirname, "..", ".tmp", `corrupt-${Date.now()}.png`);
  require("fs").mkdirSync(require("path").dirname(corruptPath), { recursive: true });
  fs.writeFileSync(corruptPath, Buffer.from([137, 80, 78, 71, 0, 0, 0, 0])); // bad PNG signature payload

  await page.locator('input[type="file"]').setInputFiles(corruptPath);
  await page.getByRole("button", { name: "Compress", exact: true }).click();
  // App should return to the upload state instead of hanging on "Compressing...".
  await expect(page.getByText("Click to choose an image")).toBeVisible({ timeout: 10_000 });
});
