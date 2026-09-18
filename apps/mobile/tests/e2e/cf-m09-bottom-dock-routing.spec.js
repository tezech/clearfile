// CF-M09: Bottom Dock Routing
// Tap each dock icon (Scan, Sign, Compress, Enhance, Convert, Scan QR,
// Create QR). Expected: active tab indicator updates; previous media
// streams stop; view renders without frozen DOM states.
//
// The dock holds 7 tools (QR was split into separate Scan/Create tiles)
// and is horizontally scrollable; each tool uses its own accent color for
// its active state, and the footer shows a short dockLabel while the
// dashboard above shows the full label — e.g. "Scan" in the dock vs.
// "Doc Scanner" on the dashboard card.
const { test, expect } = require("../support/android-app");
const { mockCameraFeedWithImage } = require("../support/camera-mock");

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const INACTIVE_RGB = "rgb(147, 160, 184)"; // --color-ink-muted: #93a0b8

const DOCK_TABS = [
  { dockLabel: "Scan", badge: "SCAN", accentRgb: "rgb(0, 229, 255)", contentText: "Document Scanner" },
  { dockLabel: "Sign", badge: "SIGN", accentRgb: "rgb(124, 92, 255)", contentText: "Sign Document" },
  { dockLabel: "Compress", badge: "COMPRESS", accentRgb: "rgb(16, 185, 129)", contentText: "Compress Files" },
  { dockLabel: "Enhance", badge: "ENHANCE", accentRgb: "rgb(245, 158, 11)", contentText: "Enhance Photo" },
  { dockLabel: "Convert", badge: "CONVERT", accentRgb: "rgb(79, 184, 255)", contentText: "Convert Files" },
  { dockLabel: "Scan QR", badge: "QR SCAN", accentRgb: "rgb(0, 229, 255)", contentText: "Scan QR Code" },
  { dockLabel: "Create QR", badge: "QR CREATE", accentRgb: "rgb(244, 114, 182)", contentText: "Create QR Code" },
];

test("CF-M09: each dock tab updates the active indicator and renders its own view", async ({ appPage: page }) => {
  const footer = page.locator("footer");
  const header = page.locator("header");

  for (const tab of DOCK_TABS) {
    await footer.getByText(tab.dockLabel, { exact: true }).click();

    // Header badge reflects the active tool.
    await expect(header.getByText(tab.badge, { exact: true })).toBeVisible();

    // The tapped tab's label is painted in that tool's own accent color.
    const activeLabel = footer.getByText(tab.dockLabel, { exact: true });
    await expect(activeLabel).toHaveCSS("color", tab.accentRgb);

    for (const other of DOCK_TABS) {
      if (other.dockLabel === tab.dockLabel) continue;
      await expect(footer.getByText(other.dockLabel, { exact: true })).toHaveCSS("color", INACTIVE_RGB);
    }

    await expect(page.getByText(tab.contentText, { exact: true })).toBeVisible();
  }
});

test("CF-M09: switching away from Doc Scanner stops its camera stream", async ({ appPage: page }) => {
  await mockCameraFeedWithImage(page, TINY_PNG_DATA_URL);
  await page.reload();

  const footer = page.locator("footer");
  await footer.getByText("Scan", { exact: true }).click();
  await page.getByText("Open camera", { exact: true }).click();
  await expect(page.getByText("Capture", { exact: true })).toBeVisible({ timeout: 10_000 });

  const streamLiveBefore = await page.evaluate(
    () => window.__mockedStreams?.some((s) => s.getTracks().every((t) => t.readyState === "live")) ?? false
  );
  expect(streamLiveBefore).toBe(true);

  await footer.getByText("Sign", { exact: true }).click();
  await expect(page.getByText("Sign Document", { exact: true })).toBeVisible();

  const streamStoppedAfter = await page.evaluate(
    () => window.__mockedStreams?.every((s) => s.getTracks().every((t) => t.readyState === "ended")) ?? false
  );
  expect(streamStoppedAfter, "previous tool's camera tracks should stop once you navigate away").toBe(true);
});
