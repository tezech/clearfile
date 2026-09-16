/**
 * Clearfile Automated End-to-End Functional Test Agent (Diagnostic Edition)
 * Pinpoints exact missing chunk/asset URLs and executes real E2E functional tests.
 */
const { _android: android } = require("playwright");

async function runDiagnosticE2E() {
  console.log("🔍 [Agent] Scanning for connected Android devices via ADB...");
  const devices = await android.devices();

  if (devices.length === 0) {
    console.error("❌ [Agent] No Android device found! Ensure USB debugging is enabled.");
    process.exit(1);
  }

  const device = devices[0];
  console.log(`📱 [Agent] Target Hardware Connected: ${device.model()}`);

  console.log("🚀 [Agent] Launching com.tezech.clearfile...");
  await device.shell("am force-stop com.tezech.clearfile");
  await device.shell("am start -n com.tezech.clearfile/com.tezech.clearfile.MainActivity");

  console.log("⏳ [Agent] Attaching to WebView...");
  const webview = await device.webView({ pkg: "com.tezech.clearfile" });
  const page = await webview.page();

  const failedRequests = [];
  const notFound404s = [];

  // Intercept every network request made by the phone's WebView
  page.on("requestfailed", (req) => {
    const info = {
      url: req.url(),
      resourceType: req.resourceType(),
      error: req.failure()?.errorText || "Unknown",
    };
    failedRequests.push(info);
    console.error(`💥 [NETWORK FAILED]: ${info.resourceType.toUpperCase()} -> ${info.url} (${info.error})`);
  });

  page.on("response", (res) => {
    if (res.status() === 404) {
      const info = {
        url: res.url(),
        status: res.status(),
      };
      notFound404s.push(info);
      console.error(`🔴 [404 NOT FOUND]: ${res.url()}`);
    }
  });

  // Capture all runtime console messages and uncaught exceptions
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") {
      console.error(`🔴 [Phone Console Error]: ${text}`);
    } else {
      console.log(`💬 [Phone Console]: ${text}`);
    }
  });

  page.on("pageerror", (err) => {
    console.error(`💥 [Uncaught JS Exception on Device]:`, err.message);
  });

  console.log("⏳ [Agent] Waiting 3.5s for app boot and hydration...");
  await page.waitForTimeout(3500);

  console.log("\n==================================================");
  console.log("DIAGNOSTIC SUMMARY: WEBVIEW NETWORK AUDIT");
  console.log("==================================================");

  if (notFound404s.length > 0 || failedRequests.length > 0) {
    console.error(`❌ Total 404 Not Found URLs detected: ${notFound404s.length}`);
    notFound404s.forEach((item, idx) => {
      console.error(`   ${idx + 1}. [HTTP 404] -> ${item.url}`);
    });

    if (failedRequests.length > 0) {
      console.error(`❌ Total Failed/Blocked Requests: ${failedRequests.length}`);
      failedRequests.forEach((item, idx) => {
        console.error(`   ${idx + 1}. [${item.resourceType}] -> ${item.url} (${item.error})`);
      });
    }
  } else {
    console.log("✅ Zero 404s detected. All web assets loaded cleanly!");
  }

  console.log("\n==================================================");
  console.log("TEST 1: VERIFY TOOL DASHBOARD & INTERACTIVITY");
  console.log("==================================================");

  const toolLabels = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("main div"));
    return cards.map((c) => c.innerText?.trim()).filter(Boolean);
  });

  console.log(`Detected UI text elements: ${toolLabels.length} nodes`);

  // Attempt clicking the 'Doc Scanner' card
  const scanClickResult = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll("main div, footer button"));
    const target = candidates.find((el) => el.innerText?.includes("Doc Scanner"));
    if (target) {
      target.click();
      return true;
    }
    return false;
  });

  await page.waitForTimeout(1200);

  const inScanView = await page.evaluate(() => {
    return document.body.innerText.includes("Document Scanner") || document.body.innerText.includes("SNAP DOCUMENT");
  });

  console.log(`- Clicked 'Doc Scanner' card? ${scanClickResult ? "YES" : "NO"}`);
  console.log(`- Successfully navigated to Scanner workspace? ${inScanView ? "✅ PASSED" : "❌ FAILED"}`);

  // Test Back Navigation
  if (inScanView) {
    console.log("- Testing Back button navigation...");
    await page.evaluate(() => {
      const backBtn = Array.from(document.querySelectorAll("header button")).find((b) => b.innerText?.includes("Back"));
      if (backBtn) backBtn.click();
    });
    await page.waitForTimeout(800);
    const backToHome = await page.evaluate(() => document.body.innerText.includes("Core Tool Suite") || document.body.innerText.includes("System Applications"));
    console.log(`- Returned to home hub? ${backToHome ? "✅ PASSED" : "❌ FAILED"}`);
  }

  console.log("\n📸 [Agent] Taking live screenshot of device screen...");
  await page.screenshot({ path: "agent-diagnostic-screen.png" });
  console.log("   Saved screenshot to: /Users/tejonarasimhavemulapalli/clearfile/agent-diagnostic-screen.png");

  console.log("\n🏁 [Agent] Audit complete. Session closed.");
  await device.close();
}

runDiagnosticE2E().catch((err) => {
  console.error("❌ [Agent Fatal Execution Error]:", err);
  process.exit(1);
});