// CF-M05: Document Signer
// Upload PDF/image, draw cursive signature on canvas, select Blue ink,
// toggle "Cryptographic Seal". Expected: transparent signature renders on
// live preview; tapping moves stamp; exported PDF retains ink at exact
// coordinates.
//
// For PDFs, handleDocumentPickForSign() now renders the real first page via
// pdf.js (previously a generic 600x800 placeholder with just the filename
// drawn on it) so the tap position the user sees maps to the real page's
// aspect ratio and content, and burnSignatureAndSaveDocument() signs that
// same first page rather than the last page of the document.
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
  // black / blue / green as siblings of the "Pen Ink:" caption.
  await page.locator('text="Pen Ink:"').locator("xpath=following-sibling::div[2]").click();
}

test("CF-M05: image document gets a positioned signature and exports", async ({ appPage: page }) => {
  const imagePath = createSmallImageFile("sign-target.png");

  await page.locator("main").getByText("Sign Document").click();
  await expect(page.getByText("Upload Document")).toBeVisible({ timeout: 10_000 });

  await page.locator('input[type="file"]').first().setInputFiles(imagePath);
  await expect(page.getByText("Document image ready.")).toBeVisible({ timeout: 10_000 });

  await selectBlueInk(page);
  await drawSignatureStroke(page);

  await expect(page.getByText(/Handwritten signature ready/)).toBeVisible({ timeout: 5000 });
  const signatureImg = page.locator('img[alt="Signature"]');
  await expect(signatureImg).toBeVisible();

  // Tapping the document preview moves the stamp to the tapped coordinates.
  const docPreview = page.locator('img[alt="Doc"]').locator("xpath=..");
  const previewBox = await docPreview.boundingBox();
  await page.mouse.click(previewBox.x + previewBox.width * 0.25, previewBox.y + previewBox.height * 0.25);
  await expect(page.getByText(/Placed at X: 2[0-9]%/)).toBeVisible();

  // Cryptographic Seal toggles the stamp to a certified badge (larger, with
  // "DIGITALLY CERTIFIED" burned into it) instead of the bare ink stroke.
  const beforeSealSrc = await signatureImg.getAttribute("src");
  await page.getByText("Cryptographic Seal").click();
  await expect(page.getByText(/Verified security stamp ready/)).toBeVisible({ timeout: 5000 });
  const afterSealSrc = await signatureImg.getAttribute("src");
  expect(afterSealSrc).not.toBe(beforeSealSrc);

  await page.getByText("Sign & Save Document to Phone", { exact: false }).click();
  await expect(page.getByText(/Saved to Documents! Opening share sheet/)).toBeVisible({ timeout: 15_000 });
});

test("CF-M05: PDF document renders the real first page and accepts a signature placement", async ({ appPage: page }) => {
  const pdfPath = await createMultiPagePdf(2, "sign-target.pdf");

  await page.locator("main").getByText("Sign Document").click();
  await page.locator('input[type="file"]').first().setInputFiles(pdfPath);
  await expect(page.getByText(/PDF loaded\. Tap exactly where you want to sign\./)).toBeVisible({ timeout: 10_000 });

  // The preview is the real rendered page 1 now, not a generic placeholder
  // with just the filename drawn on it.
  const docPreview = page.locator('img[alt="Doc"]');
  await expect(docPreview).toBeVisible();
  const previewSrc = await docPreview.getAttribute("src");
  expect(previewSrc.length, "preview should be real rendered page content, not a tiny placeholder").toBeGreaterThan(2000);

  await drawSignatureStroke(page);
  await expect(page.locator('img[alt="Signature"]')).toBeVisible({ timeout: 5000 });

  await page.getByText("Sign & Save Document to Phone", { exact: false }).click();
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
  await expect(page.getByText("Upload Document")).toBeVisible({ timeout: 10_000 });
});
