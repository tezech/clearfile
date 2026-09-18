// CF-M02: Hardware Scanner
// Tap "Doc Scanner", grant camera permission, frame page, click "Capture".
// Expected: camera viewfinder opens without freezing; captures frame;
// transitions directly to crop screen.
const { test, expect, APP_ID } = require("../support/android-app");

test.beforeEach(async ({ device }) => {
  // Pre-grant so getUserMedia() resolves immediately instead of blocking on
  // a native OS permission dialog, which lives outside the WebView's DOM and
  // can't be driven through the page object.
  await device.shell(`pm grant ${APP_ID} android.permission.CAMERA`);
});

test("CF-M02: camera opens, captures a frame, and lands on the crop screen", async ({ appPage: page }) => {
  await page.locator("main").getByText("Doc Scanner").click();
  await page.getByText("Open camera", { exact: true }).click();
  await expect(page.getByText("Capture", { exact: true })).toBeVisible({ timeout: 10_000 });

  // Viewfinder is live: the <video> element has an active MediaStream and is
  // actually decoding frames (readyState/videoWidth are 0 until it is).
  await page.waitForFunction(
    () => {
      const video = document.querySelector("video");
      return !!video && !!video.srcObject && video.readyState >= 2 && video.videoWidth > 0;
    },
    { timeout: 10_000 }
  );

  await page.getByText("Capture", { exact: true }).click();

  // Direct transition to the crop / 4-corner screen — no intermediate spinner
  // stuck on the viewfinder, and the camera stream is torn down.
  await expect(page.locator("main").getByText("Enhance", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Black & White", { exact: true })).toBeVisible();

  const streamActive = await page.evaluate(() => {
    const video = document.querySelector("video");
    return !!video && !!video.srcObject;
  });
  expect(streamActive, "camera stream should stop once a frame is captured").toBe(false);
});

test("CF-M02: camera failure falls back to a gallery-photo prompt instead of freezing", async ({ appPage: page }) => {
  // Simulate a device with no usable camera by stubbing getUserMedia to reject,
  // exercising the try/catch fallback in startScanCamera().
  await page.addInitScript(() => {
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("NotFoundError"));
    }
  });
  await page.reload();
  await page.locator("main").getByText("Doc Scanner").click();
  await page.getByText("Open camera", { exact: true }).click();

  await expect(page.getByText(/Camera unavailable\. Select document photo from gallery\./)).toBeVisible({
    timeout: 10_000,
  });
});
