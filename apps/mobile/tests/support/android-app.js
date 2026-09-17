/**
 * Shared Playwright-for-Android fixture for the Clearfile mobile E2E suite.
 *
 * These specs drive the *installed APK's* live WebView over ADB (the same
 * approach already used by run-agent-qa.js), not a browser tab. That's the
 * only way to exercise Capacitor-native behavior (camera permission grants,
 * Filesystem writes, the Android share sheet) rather than a desktop stand-in.
 *
 * Prerequisites before running `npm run test:e2e` in apps/mobile:
 *   1. `adb devices` shows exactly one connected device or running emulator.
 *   2. The debug build of com.tezech.clearfile is installed on it
 *      (`npx cap run android` or `adb install` the debug APK).
 *   3. The device is unlocked; camera/storage permissions can be
 *      pre-granted with, e.g.:
 *        adb shell pm grant com.tezech.clearfile android.permission.CAMERA
 *
 * Each test gets a fresh cold launch (force-stop + am start) via the
 * `appPage` fixture, so tests are independent and CF-M01's "cold launch"
 * scenario reflects how every other test also starts.
 */
const base = require("@playwright/test");
const { _android: android } = require("playwright");

const APP_ID = "com.tezech.clearfile";
const MAIN_ACTIVITY = `${APP_ID}/${APP_ID}.MainActivity`;

// Fixture callbacks are named `provide` rather than Playwright's usual `use`
// because eslint-plugin-react-hooks treats any `use*`-named function as a
// React Hook call and flags it (react-hooks/rules-of-hooks) — Playwright
// doesn't care what the parameter is called, so this sidesteps the false
// positive without disabling the rule.
const test = base.test.extend({
  device: async ({}, provide) => {
    const devices = await android.devices();
    if (devices.length === 0) {
      throw new Error(
        "No Android device/emulator found via ADB. Connect a device with USB " +
          "debugging enabled (or start an emulator) with the Clearfile debug " +
          "build installed, then re-run the suite."
      );
    }
    if (devices.length > 1) {
      throw new Error(
        `Found ${devices.length} ADB devices; this suite assumes exactly one. ` +
          "Disconnect extras or set ANDROID_SERIAL."
      );
    }

    const device = devices[0];
    await provide(device);
    await device.close();
  },

  appPage: async ({ device }, provide) => {
    await device.shell(`am force-stop ${APP_ID}`);
    await device.shell(`am start -n ${MAIN_ACTIVITY}`);

    const webview = await device.webView({ pkg: APP_ID, timeout: 30_000 });
    const page = await webview.page();

    await provide(page);
  },
});

module.exports = { test, expect: base.expect, APP_ID, MAIN_ACTIVITY };
