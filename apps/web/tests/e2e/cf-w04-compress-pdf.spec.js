// CF-W04: Compress PDF
// Upload standard multi-page PDF, execute compression.
// Expected: client/worker streams PDF structure; output file downloads
// without corrupted headers or missing pages.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const { PDFDocument } = require("pdf-lib");
const { createMultiPagePdf } = require("../support/fixtures");

test("CF-W04: multi-page PDF compresses and downloads with all pages intact", async ({ page }) => {
  const pageCount = 4;
  const originalPath = await createMultiPagePdf(pageCount);

  await page.goto("/compress-pdf");
  await page.locator('input[type="file"]').setInputFiles(originalPath);

  await expect(page.getByRole("button", { name: "Get Compressed PDF" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Couldn't process this PDF/)).toHaveCount(0);

  await page.getByRole("button", { name: "Get Compressed PDF" }).click();
  await page.waitForTimeout(3200);
  const downloadButton = page.getByRole("button", { name: "Download Now" });
  await expect(downloadButton).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    downloadButton.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^compressed-.+\.pdf$/);
  const downloadedPath = await download.path();
  const bytes = fs.readFileSync(downloadedPath);

  // Header integrity: a valid PDF starts with the %PDF- magic bytes.
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");

  // No missing pages after compression.
  const resultDoc = await PDFDocument.load(bytes);
  expect(resultDoc.getPageCount()).toBe(pageCount);
});

test("CF-W04: Deep Compress level buttons re-process the file without losing pages", async ({ page }) => {
  const pageCount = 3;
  const originalPath = await createMultiPagePdf(pageCount);

  await page.goto("/compress-pdf");
  await page.locator('input[type="file"]').setInputFiles(originalPath);
  await expect(page.getByRole("button", { name: "Recommended" })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Recommended" }).click();
  await expect(page.getByText("Deep compressing")).toBeVisible();
  await expect(page.getByRole("button", { name: "Get Compressed PDF" })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Get Compressed PDF" }).click();
  await page.waitForTimeout(3200);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Now" }).click(),
  ]);

  const downloadedPath = await download.path();
  const resultDoc = await PDFDocument.load(fs.readFileSync(downloadedPath));
  expect(resultDoc.getPageCount()).toBe(pageCount);
});

test("CF-W04: corrupted PDF upload shows an inline error, not a silent failure", async ({ page }) => {
  const fs2 = require("fs");
  const path = require("path");
  const badPath = path.join(__dirname, "..", ".tmp", "corrupt.pdf");
  fs2.mkdirSync(path.dirname(badPath), { recursive: true });
  fs2.writeFileSync(badPath, Buffer.from("not a real pdf"));

  await page.goto("/compress-pdf");
  await page.locator('input[type="file"]').setInputFiles(badPath);

  await expect(page.getByText(/Couldn't process this PDF/)).toBeVisible({ timeout: 10_000 });
});
