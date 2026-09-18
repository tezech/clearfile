// CF-W08: Sign Document (new feature)
// Upload a PDF or image, draw a signature, tap the document to place it,
// then sign and download. Expected: the preview matches the real
// document's aspect ratio exactly (no letterboxing, so a tap lands where
// it visually appears to), and the exported file retains the signature.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { createSmallImageFile } = require("../support/fixtures");

async function createTallPdf(name) {
  const { ensureTmpDir } = require("../support/fixtures");
  const path = require("path");
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  // Deliberately unusual (tall/narrow) aspect ratio to stress-test the
  // letterbox fix — a squarish fixture wouldn't catch a regression there.
  const page = pdfDoc.addPage([300, 650]);
  page.drawText("SIGN TEST PAGE 1", { x: 20, y: 600, size: 16, font, color: rgb(1, 0, 0) });
  const bytes = await pdfDoc.save();
  const filePath = path.join(ensureTmpDir(), name);
  fs.writeFileSync(filePath, bytes);
  return { filePath, width: 300, height: 650 };
}

async function drawSignature(page) {
  await page.locator("canvas").scrollIntoViewIfNeeded();
  const canvasBox = await page.locator("canvas").boundingBox();
  await page.mouse.move(canvasBox.x + 20, canvasBox.y + canvasBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvasBox.x + canvasBox.width - 20, canvasBox.y + canvasBox.height / 2, { steps: 5 });
  await page.mouse.up();
}

test("CF-W08: PDF preview matches the real page's aspect ratio with no letterboxing", async ({ page }) => {
  const { filePath, width, height } = await createTallPdf("sign-aspect.pdf");

  await page.goto("/sign-document");
  await page.locator('input[type="file"]').setInputFiles(filePath);

  const previewLocator = page.locator('img[alt="Document preview"]').locator("xpath=..");
  await previewLocator.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => document.querySelector('img[alt="Document preview"]')?.naturalWidth > 0,
    { timeout: 15_000 }
  );
  // Give the previewSize layout effect a moment to commit its re-render.
  await page.waitForTimeout(300);

  const box = await previewLocator.boundingBox();
  const measuredRatio = box.width / box.height;
  const expectedRatio = width / height;
  expect(Math.abs(measuredRatio - expectedRatio), `preview ratio ${measuredRatio} should match page ratio ${expectedRatio}`).toBeLessThan(0.02);
});

test("CF-W08: draw a signature, place it, sign, and download a valid PDF", async ({ page }) => {
  const { filePath } = await createTallPdf("sign-flow.pdf");

  await page.goto("/sign-document");
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.waitForFunction(
    () => document.querySelector('img[alt="Document preview"]')?.naturalWidth > 0,
    { timeout: 15_000 }
  );

  await drawSignature(page);
  await expect(page.locator('img[alt="Signature"]')).toBeVisible();

  const previewLocator = page.locator('img[alt="Document preview"]').locator("xpath=..");
  await previewLocator.scrollIntoViewIfNeeded();
  const box = await previewLocator.boundingBox();
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.8);

  const signButton = page.getByRole("button", { name: "Sign document" });
  await signButton.scrollIntoViewIfNeeded();
  await signButton.click();
  await expect(page.getByText(/Your signed file is ready/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Get Signed File" }).click();
  await page.waitForTimeout(3200);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Now" }).click(),
  ]);

  const downloadedPath = await download.path();
  const bytes = fs.readFileSync(downloadedPath);
  expect(bytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  const resultDoc = await PDFDocument.load(bytes);
  expect(resultDoc.getPageCount()).toBe(1);
});

test("CF-W08: signing an image document produces a downloadable signed image", async ({ page }) => {
  const imagePath = createSmallImageFile("sign-doc-image.png");

  await page.goto("/sign-document");
  await page.locator('input[type="file"]').setInputFiles(imagePath);
  await page.waitForFunction(
    () => document.querySelector('img[alt="Document preview"]')?.naturalWidth > 0,
    { timeout: 15_000 }
  );

  await drawSignature(page);
  await expect(page.locator('img[alt="Signature"]')).toBeVisible();

  await page.getByRole("button", { name: "Sign document" }).click();
  await expect(page.getByText(/Your signed file is ready/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Get Signed File" }).click();
  await page.waitForTimeout(3200);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Now" }).click(),
  ]);

  const downloadedPath = await download.path();
  const bytes = fs.readFileSync(downloadedPath);
  // JPEG magic bytes — signed image output is re-encoded as JPEG.
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]).toBe(0xd8);
});

test("CF-W08: 'Sign document' stays disabled until a signature is drawn", async ({ page }) => {
  const { filePath } = await createTallPdf("sign-disabled.pdf");

  await page.goto("/sign-document");
  await page.locator('input[type="file"]').setInputFiles(filePath);
  await page.waitForFunction(
    () => document.querySelector('img[alt="Document preview"]')?.naturalWidth > 0,
    { timeout: 15_000 }
  );

  await expect(page.getByRole("button", { name: "Sign document" })).toBeDisabled();
});
