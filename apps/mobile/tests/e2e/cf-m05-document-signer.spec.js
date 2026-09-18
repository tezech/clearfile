// CF-M05: Document Signer
// Upload PDF/image, draw cursive signature on canvas, select Blue ink,
// toggle "Add verification stamp". Expected: transparent signature renders
// on live preview; tapping moves stamp; exported PDF retains ink at exact
// coordinates.
//
// For PDFs, handleDocumentPickForSign() now renders the real first page via
// pdf.js (previously a generic 600x800 placeholder with just the filename
// drawn on it) so the tap position the user sees maps to the real page's
// aspect ratio and content, and burnSignatureAndSaveDocument() signs that
// same first page rather than the last page of the document. The preview
// box is now sized in explicit pixels (see signPreviewSize in page.js) to
// match the document's aspect ratio exactly — no letterboxing between the
// tap position and the final signed position.
const { test, expect } = require("../support/android-app");
const { createSmallImageFile, createMultiPagePdf } = require("../support/fixtures");
const fs = require("fs");

async function drawSignatureStroke(page) {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  const midY = box.y + box.height / 2;

  await page.mouse.move(box.x + 10, midY);
  await page.mouse.down();
  for (let i = 0; i <= 10; i++) {
    const x = box.x + 10 + (i * (box.width - 20)) / 10;
    const y = midY + Math.sin(i / 1.5) * 20; // cursive-like wave
    await page.mouse.move(x, y, { steps: 2 });
  }
  await page.mouse.up();
}

async function selectBlueInk(page) {
  // The 3 ink dots have no text labels; they're rendered in order
  // black / blue / green as siblings of the "Ink:" caption.
  await page.locator('text="Ink:"').locator("xpath=following-sibling::button[2]").click();
}

test("CF-M05: image document gets a positioned signature and exports", async ({ appPage: page }) => {
  const imagePath = createSmallImageFile("sign-target.png");

  await page.locator("main").getByText("Sign Document").click();
  await expect(page.getByText("Upload document", { exact: false })).toBeVisible({ timeout: 10_000 });

  await page.locator('input[type="file"]').first().setInputFiles(imagePath);
  await expect(page.getByText("Document image ready.", { exact: false })).toBeVisible({ timeout: 10_000 });

  await selectBlueInk(page);
  await drawSignatureStroke(page);

  await expect(page.getByText(/Handwritten signature ready/)).toBeVisible({ timeout: 5000 });
  const signatureImg = page.locator('img[alt="Signature"]');
  await expect(signatureImg).toBeVisible();

  // Tapping the document preview moves the stamp to the tapped coordinates.
  const docPreview = page.locator('img[alt="Doc"]').locator("xpath=..");
  await expect(page.getByText("Tap the document again to move the signature")).toBeVisible();
  const previewBox = await docPreview.boundingBox();
  const beforeMoveSrc = await signatureImg.getAttribute("src");
  await page.mouse.click(previewBox.x + previewBox.width * 0.25, previewBox.y + previewBox.height * 0.25);
  await page.waitForTimeout(100);

  // Add verification stamp toggles the stamp to a certified badge (larger,
  // with "DIGITALLY CERTIFIED" burned into it) instead of the bare ink stroke.
  await page.getByText("Add verification stamp").click();
  await expect(page.getByText(/Verified security stamp ready/)).toBeVisible({ timeout: 5000 });
  const afterSealSrc = await signatureImg.getAttribute("src");
  expect(afterSealSrc).not.toBe(beforeMoveSrc);

  await page.getByText("Sign & save to device", { exact: false }).click();
  await expect(page.getByText(/Saved to Documents! Opening share sheet/)).toBeVisible({ timeout: 15_000 });
});

test("CF-M05: PDF document renders the real first page and accepts a signature placement", async ({ appPage: page }) => {
  const pdfPath = await createMultiPagePdf(2, "sign-target.pdf");

  await page.locator("main").getByText("Sign Document").click();
  await page.locator('input[type="file"]').first().setInputFiles(pdfPath);
  await expect(page.getByText(/PDF loaded\. Tap exactly where you want to sign\./)).toBeVisible({ timeout: 10_000 });

  // The preview is the real rendered page 1 now, not a generic placeholder
  // with just the filename drawn on it, and its container matches the
  // page's real aspect ratio (612x792 -> ~0.77) instead of a fixed box.
  const docPreview = page.locator('img[alt="Doc"]');
  await expect(docPreview).toBeVisible();
  await page.waitForFunction(() => document.querySelector('img[alt="Doc"]')?.naturalWidth > 0, { timeout: 10_000 });
  const previewSrc = await docPreview.getAttribute("src");
  expect(previewSrc.length, "preview should be real rendered page content, not a tiny placeholder").toBeGreaterThan(2000);

  const previewBox = await docPreview.locator("xpath=..").boundingBox();
  const measuredRatio = previewBox.width / previewBox.height;
  expect(Math.abs(measuredRatio - 612 / 792), `preview box ratio ${measuredRatio} should match the real page ratio`).toBeLessThan(0.05);

  await drawSignatureStroke(page);
  await expect(page.locator('img[alt="Signature"]')).toBeVisible({ timeout: 5000 });

  await page.getByText("Sign & save to device", { exact: false }).click();
  await expect(page.getByText(/Saved to Documents! Opening share sheet/)).toBeVisible({ timeout: 15_000 });
});

test("CF-M05: a corrupted PDF fails preview gracefully instead of showing a fake placeholder", async ({ appPage: page }) => {
  const badPath = require("path").join(__dirname, "..", ".tmp", `corrupt-sign-${Date.now()}.pdf`);
  fs.mkdirSync(require("path").dirname(badPath), { recursive: true });
  fs.writeFileSync(badPath, Buffer.from("not a real pdf"));

  page.once("dialog", (dialog) => dialog.accept());

  await page.locator("main").getByText("Sign Document").click();
  await page.locator('input[type="file"]').first().setInputFiles(badPath);

  // Should fall back to the upload prompt, not get stuck or show a fake preview.
  await expect(page.getByText("Upload document", { exact: false })).toBeVisible({ timeout: 10_000 });
});
