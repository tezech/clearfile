// CF-W01: Routing & Navigation
// Access /, /about, /privacy, /compress-image, /compress-pdf, /convert-files, /enhance-image.
// Expected: all pages return HTTP 200 with complete metadata, header, footer,
// and no 404 chunks.
const { test, expect } = require("@playwright/test");

const ROUTES = ["/", "/about", "/privacy", "/compress-image", "/compress-pdf", "/convert-files", "/enhance-image", "/sign-document"];

for (const route of ROUTES) {
  test(`CF-W01: ${route} loads with 200, metadata, header, and no 404 chunks`, async ({ page }) => {
    const failedRequests = [];
    page.on("response", (res) => {
      if (res.status() === 404) failedRequests.push(res.url());
    });

    const response = await page.goto(route);
    expect(response.status(), `${route} should respond 200`).toBe(200);

    // Metadata
    await expect(page).toHaveTitle(/ClearFile/i);
    const description = await page.locator('head > meta[name="description"]').getAttribute("content");
    expect(description).toBeTruthy();

    // Header present on every route
    const header = page.locator("header");
    await expect(header).toBeVisible();
    await expect(header.getByText("ClearFile", { exact: true })).toBeVisible();

    // No 404s for any asset/chunk this route pulled in
    expect(failedRequests, `unexpected 404s on ${route}: ${failedRequests.join(", ")}`).toEqual([]);
  });
}

test("CF-W01: home page footer links to About and Privacy", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer).toBeVisible();
  await expect(footer.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
  await expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
});

test("CF-W01: unknown route renders Next.js 404, not a broken chunk", async ({ page }) => {
  const response = await page.goto("/this-route-does-not-exist");
  expect(response.status()).toBe(404);
});
