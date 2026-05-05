/* global __dirname, console, process, require */

const assert = require("node:assert/strict");
const path = require("node:path");

const { createHeadlessAutomation } = require("../headless");

const CHOPLIFTER_DISK = path.resolve(__dirname, "..", "..", "disks", "choplifter.atr");
const CHOPLIFTER_DISK_COLOR = path.resolve(__dirname, "..", "..", "disks", "choplifter (color).atr");
const ATARIXL_ROM = path.resolve(__dirname, "..", "..", "ATARIXL.ROM");
// We won't load BASIC, so we won't provide ATARIBAS.ROM in roms.

async function main() {
  // Try color version first if it exists, otherwise fallback to standard
  let diskPath = CHOPLIFTER_DISK;
  try {
    // Check if color disk exists
    require('fs').accessSync(CHOPLIFTER_DISK_COLOR);
    diskPath = CHOPLIFTER_DISK_COLOR;
  } catch (e) {
    // fallback to CHOPLIFTER_DISK
  }

  const runtime = await createHeadlessAutomation({
    roms: {
      os: ATARIXL_ROM,
      // basic: path.resolve(__dirname, "..", "..", "ATARIBAS.ROM"), // Omitted to start without BASIC
    },
    disks: [diskPath], // Passing disks to be loaded
    turbo: true,
    frameDelayMs: 0,
  });

  try {
    const api = runtime.api;
    const readyApi = await api.whenReady();
    assert.equal(readyApi, api);

    console.log("Starting emulation...");
    await api.system.start();

    console.log("Waiting for 60 seconds for gameplay to settle...");
    await new Promise(resolve => setTimeout(resolve, 60000));

    console.log("Capturing screenshot...");
    const screenshot = await api.artifacts.captureScreenshot({
      encoding: "bytes",
    });

    assert.equal(screenshot.mimeType, "image/png");
    assert.ok(screenshot.bytes.length > 0);

    // Save the screenshot to the project root
    const fs = require("node:fs");
    const screenshotPath = path.resolve(__dirname, "..", "..", "choplifter_screenshot.png");
    fs.writeFileSync(screenshotPath, screenshot.bytes);
    console.log(`Screenshot saved to: ${screenshotPath}`);

    console.log("Test completed successfully.");
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  } finally {
    await runtime.dispose();
  }
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
