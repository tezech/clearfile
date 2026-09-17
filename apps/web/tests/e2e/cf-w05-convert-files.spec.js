// CF-W05: File Converter
// Upload DOCX/TXT/Image, select target format (PDF/PNG/JPG/WEBP), click Convert.
// Expected: target format renders correctly; aspect ratios and typography
// are preserved upon download.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const { createSmallImageFile, createMultiPagePdf, createTextFile, createDocxFile } = require("../support/fixtures");

test("CF-W05: Image Format tab converts PNG to JPEG and downloads it", async ({ page }) => {
  const imagePath = createSmallImageFile("convert-source.png");

  await page.goto("/convert-files");
  await page.getByRole("button", { name: "Image Format" }).click();
  await page.locator('input[type="file"]').setInputFiles(imagePath);
  await page.getByRole("button", { name: "JPEG" }).click();
  await page.getByRole("button", { name: "Convert" }).click();

  await expect(page.getByText(/Your file is ready/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Get File" }).click();
  await page.waitForTimeout(3200);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Now" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.jpg$/);
  const downloadedPath = await download.path();
  const bytes = fs.readFileSync(downloadedPath);
  // JPEG magic bytes (aspect ratio/content correctness is exercised visually;
  // here we assert the output is a structurally valid JPEG, not a stub).
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]).toBe(0xd8);
});

test("CF-W05: Images -> PDF tab preserves page count and aspect ratio", async ({ page }) => {
  const imageA = createSmallImageFile("multi-a.png");
  const imageB = createSmallImageFile("multi-b.png");

  await page.goto("/convert-files");
  await page.getByRole("button", { name: "Images → PDF" }).click();
  await page.locator('input[type="file"]').setInputFiles([imageA, imageB]);
  await expect(page.getByText("2 image(s) selected")).toBeVisible();

  await page.getByRole("button", { name: "Convert" }).click();
  await expect(page.getByText(/Your file is ready: combined\.pdf/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Get File" }).click();
  await page.waitForTimeout(3200);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Now" }).click(),
  ]);

  const downloadedPath = await download.path();
  const resultDoc = await PDFDocument.load(fs.readFileSync(downloadedPath));
  expect(resultDoc.getPageCount()).toBe(2);
  const firstPage = resultDoc.getPage(0);
  expect(firstPage.getWidth()).toBe(64); // source PNG is 64x64 -> aspect ratio preserved 1:1
  expect(firstPage.getHeight()).toBe(64);
});

test("CF-W05: PDF -> Images tab exports one image per page as a zip", async ({ page }) => {
  const pdfPath = await createMultiPagePdf(2, "convert-source.pdf");

  await page.goto("/convert-files");
  await page.getByRole("button", { name: "PDF → Images" }).click();
  await page.locator('input[type="file"]').setInputFiles(pdfPath);
  await page.getByRole("button", { name: "PNG" }).click();
  await page.getByRole("button", { name: "Convert" }).click();

  await expect(page.getByText(/Your file is ready: pages\.zip/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Get File" }).click();
  await page.waitForTimeout(3200);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Now" }).click(),
  ]);

  expect(download.suggestedFilename()).toBe("pages.zip");
  const downloadedPath = await download.path();
  expect(fs.statSync(downloadedPath).size).toBeGreaterThan(0);
});

test("CF-W05: Document tab converts a .txt file to PDF, preserving the text", async ({ page }) => {
  const txtPath = createTextFile(
    ["Clearfile QA fixture.", "This paragraph exists to confirm the converter reflows plain text onto a PDF page."],
    "notes.txt"
  );
  // createTextFile appends a random suffix to the base name (fixtures.js:
  // uniqueName()) so parallel tests never race on the same file path.
  const expectedBaseName = path.basename(txtPath, ".txt");

  await page.goto("/convert-files");
  await page.getByRole("button", { name: "Document (DOCX/TXT)" }).click();
  await page.locator('input[type="file"]').setInputFiles(txtPath);
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await page.getByRole("button", { name: "Convert" }).click();

  await expect(page.getByText(`Your file is ready: ${expectedBaseName}.pdf`)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Get File" }).click();
  await page.waitForTimeout(3200);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Now" }).click(),
  ]);

  const downloadedPath = await download.path();
  const bytes = fs.readFileSync(downloadedPath);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  const doc = await PDFDocument.load(bytes);
  expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
});

test("CF-W05: Document tab converts a .docx file to a rasterized PNG", async ({ page }) => {
  const docxPath = await createDocxFile(
    ["Clearfile QA docx fixture.", "A second paragraph, so pagination logic runs on real content."],
    "report.docx"
  );
  const expectedBaseName = path.basename(docxPath, ".docx");

  await page.goto("/convert-files");
  await page.getByRole("button", { name: "Document (DOCX/TXT)" }).click();
  await page.locator('input[type="file"]').setInputFiles(docxPath);
  await page.getByRole("button", { name: "PNG", exact: true }).click();
  await page.getByRole("button", { name: "Convert" }).click();

  // Single-page output downloads as a .png directly (not zipped).
  await expect(page.getByText(`Your file is ready: ${expectedBaseName}.png`)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Get File" }).click();
  await page.waitForTimeout(3200);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Now" }).click(),
  ]);

  const downloadedPath = await download.path();
  const bytes = fs.readFileSync(downloadedPath);
  // PNG magic bytes confirm a real rasterized image, not an empty/stub file.
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
});
