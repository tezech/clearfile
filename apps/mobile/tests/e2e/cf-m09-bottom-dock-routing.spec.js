// CF-M09: Bottom Dock Routing
// Tap each dock icon (Scanner, Sign, Compress, Enhance, Convert, QR).
// Expected: active tab indicator updates; previous media streams stop;
// view renders without frozen DOM states.
const { test, expect } = require("../support/android-app");
const { mockCameraFeedWithImage } = require("../support/camera-mock");

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const DOCK_TABS = [
  { label: "Doc Scanner", badge: "SCAN", contentText: "Homography Perspective Document Scanner" },
  { label: "Sign Document", badge: "SIGN", contentText: "Transparent Signature on Live Document" },
  { label: "Compress Files", badge: "COMPRESS", contentText: "Target File Compression Engine" },
  { label: "Enhance Photo", badge: "ENHANCE", contentText: "Sharpen, Denoise & Auto-Color Correct" },
  { label: "Convert Formats", badge: "CONVERT", contentText: "Universal Any-to-Any Converter" },
  { label: "QR Utility", badge: "QR", contentText: "Continuous QR Scanner & Creator" },
];

test("CF-M09: each dock tab updates the active indicator and renders its own view", async ({ appPage: page }) => {
  const footer = page.locator("footer");
  const header = page.locator("header");

  for (const tab of DOCK_TABS) {
    await footer.getByText(tab.label).click();

    // Header badge reflects the active tool.
    await expect(header.getByText(tab.badge, { exact: true })).toBeVisible();

    // The tapped tab's label is the only one painted the active cyan.
    const activeLabel = footer.getByText(tab.label, { exact: true });
    await expect(activeLabel).toHaveCSS("color", "rgb(0, 229, 255)");

    for (const other of DOCK_TABS) {
      if (other.label === tab.label) continue;
      await expect(footer.getByText(other.label, { exact: true })).toHaveCSS("color", "rgb(132, 146, 166)");
    }

    await expect(page.getByText(tab.contentText)).toBeVisible();
  }
});

test("CF-M09: switching away from Doc Scanner stops its camera stream", async ({ appPage: page }) => {
  await mockCameraFeedWithImage(page, TINY_PNG_DATA_URL);
  await page.reload();

  const footer = page.locator("footer");
  await footer.getByText("Doc Scanner").click();
  await page.getByText("Open Camera Viewfinder").click();
  await expect(page.getByText("SNAP DOCUMENT")).toBeVisible({ timeout: 10_000 });

  const streamLiveBefore = await page.evaluate(
    () => window.__mockedStreams?.some((s) => s.getTracks().every((t) => t.readyState === "live")) ?? false
  );
  expect(streamLiveBefore).toBe(true);

  await footer.getByText("Sign Document").click();
  await expect(page.getByText("Transparent Signature on Live Document")).toBeVisible();

  const streamStoppedAfter = await page.evaluate(
    () => window.__mockedStreams?.every((s) => s.getTracks().every((t) => t.readyState === "ended")) ?? false
  );
  expect(streamStoppedAfter, "previous tool's camera tracks should stop once you navigate away").toBe(true);
});
