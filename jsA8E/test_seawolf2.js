/* global __dirname, console, process, require */

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const { createHeadlessAutomation } = require("./headless");

async function main() {
  const seawolf2AtrPath = path.resolve(__dirname, "..", "seawolf2.atr");
  const osRomPath = path.resolve(__dirname, "..", "ATARIXL.ROM");
  const basicRomPath = path.resolve(__dirname, "..", "ATARIBAS.ROM");

  if (!fs.existsSync(seawolf2AtrPath)) {
    console.error(`Missing seawolf2.atr at ${seawolf2AtrPath}`);
    process.exit(1);
  }

  const runtime = await createHeadlessAutomation({
    roms: {
      os: osRomPath,
      basic: basicRomPath,
    },
    turbo: true,
    frameDelayMs: 0,
    optionOnStart: true,
  });

  try {
    const api = runtime.api;
    await api.whenReady();

    console.log("Mounting seawolf2.atr...");
    const atrData = fs.readFileSync(seawolf2AtrPath);
    await api.media.mountDisk(atrData, { slot: 0, name: "seawolf2.atr" });

    console.log("Booting seawolf2.atr (with BASIC disabled)...");
    // Cold reset and start
    // Disabling BASIC: portB bit 1 must be 1 (e.g. 0xFB or 0xFD)
    await api.system.boot({ portB: 0xFB });

    console.log("Waiting for Sea Wolf II to boot...");
    const waitResult = await api.system.waitForFrames({ count: 1000, timeoutMs: 10000 });
    if (!waitResult.ok) {
        console.warn("Wait for frames timed out or failed, system state:", await api.getSystemState());
    }

    const state = await api.getSystemState();
    console.log("System state after boot:", {
        running: state.running,
        pc: state.debugState.pc.toString(16),
        instructionCounter: state.debugState.instructionCounter
    });

    console.log("Capturing screenshot...");
    const screenshot = await api.artifacts.captureScreenshot({
      encoding: "bytes",
    });

    const screenshotPath = path.resolve(__dirname, "seawolf2_boot.png");
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.bytes));
    console.log(`Screenshot saved to ${screenshotPath}`);

    // Check for obvious crashes or illegal opcodes if the API supports it
    if (state.debugState.fault) {
        console.error("EMULATION FAULT DETECTED:", state.debugState.fault);
        process.exit(1);
    }

    console.log("Sea Wolf II test completed successfully.");
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
