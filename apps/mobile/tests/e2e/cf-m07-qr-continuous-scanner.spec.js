// CF-M07: QR Continuous Scanner
// Launch QR camera, point at live web URL (https://...).
// Expected: continuous canvas stream detects QR bounding box; opens link
// via Capacitor Browser / system browser.
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

test("CF-M07: live scanner detects a QR code and opens its link", async ({ appPage: page }) => {
  const qrDataUrl = await generateQrDataUrl(TARGET_URL);
  await mockCameraFeedWithImage(page, qrDataUrl);
  await page.reload();

  await page.locator("main").getByText("QR Utility").click();
  await expect(page.getByText("Continuous QR Scanner & Creator")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Start Live Camera" }).click();

  await expect(page.getByText("Detected Output:")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(TARGET_URL)).toBeVisible();
  await expect(page.getByText(/QR Code Found! Opening link/)).toBeVisible();

  // Detection auto-stops the live feed and surfaces the manual re-open action.
  await expect(page.getByRole("button", { name: "Start Live Camera" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Link in Browser ↗" })).toBeVisible();
});

test("CF-M07: Scan Screenshot fallback decodes an uploaded QR image", async ({ appPage: page }) => {
  const fs = require("fs");
  const path = require("path");
  const { ensureTmpDir } = require("../support/fixtures");

  const qrDataUrl = await generateQrDataUrl(TARGET_URL);
  const qrPath = path.join(ensureTmpDir(), "qr-target.png");
  fs.writeFileSync(qrPath, Buffer.from(qrDataUrl.split(",")[1], "base64"));

  await page.locator("main").getByText("QR Utility").click();
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles(qrPath);

  await expect(page.getByText(/QR detected! Opening link/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(TARGET_URL)).toBeVisible();
});
