// CF-M07: QR Continuous Scanner
// Launch QR camera, point at live web URL (https://...).
// Expected: continuous canvas stream detects QR bounding box; shows the
// decoded link and a safety assessment; only opens it after the user
// explicitly confirms (previously it auto-opened immediately, with no
// chance to catch a malicious/misleading link before it launched).
//
// A physical camera can't be pointed at a real-world QR code in CI, so the
// live feed is swapped for a canvas that continuously redraws a generated
// QR image (see support/camera-mock.js) — this still exercises the real
// requestAnimationFrame + jsQR detection loop against a <video> element,
// only the frame source is synthetic.
const { test, expect } = require("../support/android-app");
const { generateQrDataUrl } = require("../support/fixtures");
const { mockCameraFeedWithImage } = require("../support/camera-mock");

const TARGET_URL = "https://clearfile.app/qa-target";

test("CF-M07: live scanner detects a QR code and requires confirmation before opening", async ({ appPage: page }) => {
  const qrDataUrl = await generateQrDataUrl(TARGET_URL);
  await mockCameraFeedWithImage(page, qrDataUrl);
  await page.reload();

  await page.locator("main").getByText("Scan QR").click();
  await expect(page.getByText("Continuous QR Scanner")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Start Live Camera" }).click();

  await expect(page.getByText("Detected Output:")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(TARGET_URL)).toBeVisible();
  await expect(page.getByText(/QR Code Found! Review before opening/)).toBeVisible();

  // Detection auto-stops the live feed and surfaces the confirmation panel
  // instead of opening the link right away.
  await expect(page.getByRole("button", { name: "Start Live Camera" })).toBeVisible();
  await expect(page.getByText(TARGET_URL)).toBeVisible();
  await expect(page.getByRole("button", { name: /Open Link/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
});

test("CF-M07: Cancel dismisses the pending link without opening it", async ({ appPage: page }) => {
  const qrDataUrl = await generateQrDataUrl(TARGET_URL);
  await mockCameraFeedWithImage(page, qrDataUrl);
  await page.reload();

  await page.locator("main").getByText("Scan QR").click();
  await page.getByRole("button", { name: "Start Live Camera" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).not.toBeVisible();
  // The decoded value stays visible for reference even after dismissing.
  await expect(page.getByText(TARGET_URL)).toBeVisible();
});

test("CF-M07: a plain-HTTP link is flagged with a caution warning, not opened silently", async ({ appPage: page }) => {
  const riskyUrl = "http://example.com/not-encrypted";
  const qrDataUrl = await generateQrDataUrl(riskyUrl);
  await mockCameraFeedWithImage(page, qrDataUrl);
  await page.reload();

  await page.locator("main").getByText("Scan QR").click();
  await page.getByRole("button", { name: "Start Live Camera" }).click();

  await expect(page.getByText(riskyUrl)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Use caution before opening|Potentially harmful link/)).toBeVisible();
  await expect(page.getByText(/HTTPS/)).toBeVisible();
});

test("CF-M07: Scan Screenshot fallback decodes an uploaded QR image and still asks for confirmation", async ({ appPage: page }) => {
  const fs = require("fs");
  const path = require("path");
  const { ensureTmpDir } = require("../support/fixtures");

  const qrDataUrl = await generateQrDataUrl(TARGET_URL);
  const qrPath = path.join(ensureTmpDir(), "qr-target.png");
  fs.writeFileSync(qrPath, Buffer.from(qrDataUrl.split(",")[1], "base64"));

  await page.locator("main").getByText("Scan QR").click();
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles(qrPath);

  await expect(page.getByText(/QR detected! Review before opening/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(TARGET_URL)).toBeVisible();
  await expect(page.getByRole("button", { name: /Open Link/ })).toBeVisible();
});
