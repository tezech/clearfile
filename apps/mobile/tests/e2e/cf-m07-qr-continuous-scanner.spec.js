// CF-M07: QR Continuous Scanner
// Launch QR camera, point at a web URL. Expected: continuous canvas stream
// detects the QR code and decodes it. A clean link (HTTPS, ordinary
// domain, no spoofing red flags) redirects right away — scanning is meant
// to be one tap, and interrupting every single scan would just train
// people to tap "Open" without reading it. The confirmation panel only
// appears when the safety check actually finds something worth a second
// look (plain HTTP, a raw IP, a link shortener, a spoofing trick, etc),
// and only then can the link be opened or cancelled.
//
// A physical camera can't be pointed at a real-world QR code in CI, so the
// live feed is swapped for a canvas that continuously redraws a generated
// QR image (see support/camera-mock.js) — this still exercises the real
// requestAnimationFrame + jsQR detection loop against a <video> element,
// only the frame source is synthetic.
const { test, expect } = require("../support/android-app");
const { generateQrDataUrl } = require("../support/fixtures");
const { mockCameraFeedWithImage } = require("../support/camera-mock");

const SAFE_URL = "https://clearfile.app/qa-target";
const RISKY_URL = "http://example.com/not-encrypted";

test("CF-M07: a clean HTTPS link is decoded and opened without an extra tap", async ({ appPage: page }) => {
  const qrDataUrl = await generateQrDataUrl(SAFE_URL);
  await mockCameraFeedWithImage(page, qrDataUrl);
  await page.reload();

  await page.locator("main").getByText("Scan QR").click();
  await expect(page.getByText("Scan QR Code", { exact: true })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Start camera" }).click();

  await expect(page.getByText("Scanned content")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(SAFE_URL)).toBeVisible();
  await expect(page.getByText(/QR Code Found! Opening link/)).toBeVisible();

  // No confirmation panel for a clean link — nothing to cancel or confirm.
  await expect(page.getByRole("button", { name: "Cancel" })).not.toBeVisible();
  await expect(page.getByRole("button", { name: /Open link/ })).not.toBeVisible();
});

test("CF-M07: a plain-HTTP link is flagged with a caution warning and held for confirmation", async ({ appPage: page }) => {
  const qrDataUrl = await generateQrDataUrl(RISKY_URL);
  await mockCameraFeedWithImage(page, qrDataUrl);
  await page.reload();

  await page.locator("main").getByText("Scan QR").click();
  await page.getByRole("button", { name: "Start camera" }).click();

  await expect(page.getByText(RISKY_URL)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/QR Code Found! Review before opening/)).toBeVisible();
  await expect(page.getByText(/Use caution before opening|Potentially harmful link/)).toBeVisible();
  await expect(page.getByText(/HTTPS/)).toBeVisible();

  // Detection auto-stops the live feed and surfaces the confirmation panel
  // instead of opening the link right away.
  await expect(page.getByRole("button", { name: "Start camera" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open link/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
});

test("CF-M07: Cancel dismisses a flagged link without opening it", async ({ appPage: page }) => {
  const qrDataUrl = await generateQrDataUrl(RISKY_URL);
  await mockCameraFeedWithImage(page, qrDataUrl);
  await page.reload();

  await page.locator("main").getByText("Scan QR").click();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).not.toBeVisible();
  // The decoded value stays visible for reference even after dismissing.
  await expect(page.getByText(RISKY_URL)).toBeVisible();
});

test("CF-M07: Scan screenshot fallback decodes an uploaded QR image the same way", async ({ appPage: page }) => {
  const fs = require("fs");
  const path = require("path");
  const { ensureTmpDir } = require("../support/fixtures");

  const qrDataUrl = await generateQrDataUrl(RISKY_URL);
  const qrPath = path.join(ensureTmpDir(), "qr-target.png");
  fs.writeFileSync(qrPath, Buffer.from(qrDataUrl.split(",")[1], "base64"));

  await page.locator("main").getByText("Scan QR").click();
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles(qrPath);

  await expect(page.getByText(/QR detected! Review before opening/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(RISKY_URL)).toBeVisible();
  await expect(page.getByRole("button", { name: /Open link/ })).toBeVisible();
});
