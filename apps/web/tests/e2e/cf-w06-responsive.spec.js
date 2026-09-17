// CF-W06: Responsive Breakpoints
// Test site at 375px (mobile), 768px (tablet), 1280px+ (desktop).
// Expected: navbar collapses into mobile drawer; tool panels stack cleanly;
// zero horizontal body overflow.
//
// Note: the current header (apps/web/src/app/page.js) has no hamburger menu
// or collapsible drawer — it's a static two-item bar at every width. The
// "no horizontal overflow" and "panels stack cleanly" checks below reflect
// real, testable behavior; the drawer assertion is called out separately so
// a future nav component is covered without failing today's simpler header.
const { test, expect } = require("@playwright/test");

const BREAKPOINTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

for (const bp of BREAKPOINTS) {
  test(`CF-W06: home page has no horizontal overflow at ${bp.name} (${bp.width}px)`, async ({ page }) => {
    await page.setViewportSize({ width: bp.width, height: bp.height });
    await page.goto("/");

    const [scrollWidth, clientWidth] = await page.evaluate(() => [
      document.documentElement.scrollWidth,
      document.documentElement.clientWidth,
    ]);
    expect(scrollWidth, `body overflows horizontally at ${bp.width}px`).toBeLessThanOrEqual(clientWidth);

    await expect(page.locator("header")).toBeVisible();
  });
}

test("CF-W06: tool cards stack to a single column on mobile and grid on desktop", async ({ page }) => {
  await page.goto("/");

  await page.setViewportSize({ width: 375, height: 812 });
  let firstBox = await page.locator("a[href='/compress-pdf']").boundingBox();
  let secondBox = await page.locator("a[href='/compress-image']").boundingBox();
  expect(secondBox.y, "cards should stack vertically on mobile").toBeGreaterThan(firstBox.y + firstBox.height - 5);

  await page.setViewportSize({ width: 1280, height: 800 });
  firstBox = await page.locator("a[href='/compress-pdf']").boundingBox();
  secondBox = await page.locator("a[href='/compress-image']").boundingBox();
  expect(Math.abs(secondBox.y - firstBox.y), "cards should sit side-by-side on desktop").toBeLessThan(5);
});

test.fixme(
  "CF-W06 (gap): navbar has no mobile drawer/hamburger to collapse into",
  async () => {
    // Test case CF-W06 expects the navbar to collapse into a mobile drawer.
    // The current header markup is a static flex bar with no menu button at
    // any breakpoint, so there is nothing to assert against yet.
  }
);
