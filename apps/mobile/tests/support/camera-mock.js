/**
 * Stubs navigator.mediaDevices.getUserMedia() to hand back a MediaStream
 * captured from a <canvas> that continuously redraws a given image, instead
 * of the real camera. This lets specs deterministically test the "live"
 * scanning/capture code paths (which read frames off a <video> element)
 * without needing a physical camera pointed at a physical target.
 *
 * Must be called before the app script runs, so callers should follow it
 * with page.reload() (the appPage fixture already did one navigation before
 * a spec gets the page).
 */
async function mockCameraFeedWithImage(page, imageDataUrl) {
  await page.addInitScript((dataUrl) => {
    if (!navigator.mediaDevices) return;
    navigator.mediaDevices.getUserMedia = async () => {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 640;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const draw = () => {
        ctx.drawImage(img, 40, 40, 560, 560);
        requestAnimationFrame(draw);
      };
      draw();

      const stream = canvas.captureStream(15);
      window.__mockedStreams = window.__mockedStreams || [];
      window.__mockedStreams.push(stream);
      return stream;
    };
  }, imageDataUrl);
}

module.exports = { mockCameraFeedWithImage };
