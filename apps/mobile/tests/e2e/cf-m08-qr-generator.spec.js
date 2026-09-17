// CF-M08: QR Generator
// Input text string, observe preview generation, click "Save QR Image".
// Expected: QR code renders with branded dark/cyan palette; saves directly
// to device storage.
const { test, expect } = require("../support/android-app");

test("CF-M08: typed text regenerates a branded QR preview and saves it", async ({ appPage: page }) => {
  await page.locator("main").getByText("QR Utility").click();
  await expect(page.getByText("Generate QR Code:")).toBeVisible({ timeout: 10_000 });

  const previewImg = page.locator('img[alt="QR"]');
  await expect(previewImg).toBeVisible({ timeout: 10_000 }); // default text already renders one
  const defaultSrc = await previewImg.getAttribute("src");

  const genInput = page.locator("text=Generate QR Code:").locator("xpath=following-sibling::input[1]");
  await genInput.fill("");
  await genInput.fill("https://clearfile.app/cf-m08-qa");

  await expect(async () => {
    const src = await previewImg.getAttribute("src");
    expect(src).not.toBe(defaultSrc);
  }).toPass({ timeout: 5000 });

  // Branded dark/cyan palette: generated via QRCode.toDataURL({ color: { dark: '#00e5ff', light: '#050608' } }).
  const paletteOk = await page.evaluate(async () => {
    const img = document.querySelector('img[alt="QR"]');
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let sawCyan = false;
    let sawDarkBg = false;
    for (let i = 0; i < data.length; i += 4 * 97) {
      // roughly sample rather than scan every pixel
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (r < 20 && g > 200 && b > 200) sawCyan = true;
      if (r < 20 && g < 20 && b < 20) sawDarkBg = true;
    }
    return sawCyan && sawDarkBg;
  });
  expect(paletteOk, "QR preview should use the #00e5ff cyan / #050608 dark palette").toBe(true);

  await page.getByText("Save QR Image to Phone", { exact: false }).click();
  await expect(page.getByText(/Saved to Documents! Opening share sheet/)).toBeVisible({ timeout: 15_000 });
});
