/** Shared steps for tests that need to reach the scanner's crop screen. */
const { expect } = require("@playwright/test");

async function grantCameraPermission(device, appId) {
  await device.shell(`pm grant ${appId} android.permission.CAMERA`);
}

/**
 * Opens Doc Scanner, starts the viewfinder, waits for a live frame, and
 * snaps it. Safe to call repeatedly in a loop (e.g. CF-M04's 3-page
 * capture): after the first call you're already inside the scan tool with
 * no "Doc Scanner" dashboard card to click, so this only clicks it when
 * still on the home dashboard.
 */
async function openScannerAndCapture(page) {
  const dashboardEntry = page.locator("main").getByText("Doc Scanner");
  if (await dashboardEntry.count()) {
    await dashboardEntry.click();
  }
  await page.getByText("Open Camera Viewfinder").click();
  await expect(page.getByText("SNAP DOCUMENT")).toBeVisible({ timeout: 10_000 });

  await page.waitForFunction(
    () => {
      const video = document.querySelector("video");
      return !!video && !!video.srcObject && video.readyState >= 2 && video.videoWidth > 0;
    },
    { timeout: 10_000 }
  );

  await page.getByText("SNAP DOCUMENT").click();
  await expect(page.getByText(/Magic Color/)).toBeVisible({ timeout: 5000 });
}

/** Drags all 4 corner handles of the crop screen out to the container's edges. */
async function dragCornersToEdges(page) {
  const container = page.locator('div[style*="touch-action: none"]').first();
  const containerBox = await container.boundingBox();
  const pins = page.locator('div[style*="cursor: grab"]');
  await expect(pins).toHaveCount(4);

  const margin = 6;
  const targets = [
    { x: containerBox.x + margin, y: containerBox.y + margin },
    { x: containerBox.x + containerBox.width - margin, y: containerBox.y + margin },
    { x: containerBox.x + containerBox.width - margin, y: containerBox.y + containerBox.height - margin },
    { x: containerBox.x + margin, y: containerBox.y + containerBox.height - margin },
  ];

  for (let i = 0; i < 4; i++) {
    const pinBox = await pins.nth(i).boundingBox();
    await page.mouse.move(pinBox.x + pinBox.width / 2, pinBox.y + pinBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targets[i].x, targets[i].y, { steps: 10 });
    await page.mouse.up();
  }
}

module.exports = { grantCameraPermission, openScannerAndCapture, dragCornersToEdges };
