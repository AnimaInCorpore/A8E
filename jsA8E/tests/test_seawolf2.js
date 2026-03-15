/* global __dirname, console, process, require */

const path = require("node:path");
const fs = require("node:fs");

const { createRuntime, resolveDiskPath } = require("./script_runtime");

const DISK_CANDIDATES = [
  "archon2.atr",
  "archon 2.atr",
  "seawolf2.atr",
];

async function main() {
  const diskPath = resolveDiskPath(DISK_CANDIDATES, 2);
  const diskName = path.basename(diskPath);
  if (!fs.existsSync(diskPath)) {
    console.error(`Missing disk image at ${diskPath}`);
    process.exit(1);
  }

  const runtime = await createRuntime({
    turbo: true,
    frameDelayMs: 0,
    optionOnStart: true,
  });

  try {
    const api = runtime.api;
    await api.whenReady();

    console.log(`Mounting ${diskName}...`);
    const atrData = fs.readFileSync(diskPath);
    await api.media.mountDisk(atrData, { slot: 0, name: diskName });

    console.log(`Booting ${diskName} (with BASIC disabled)...`);
    // Cold reset and start
    // Disabling BASIC: portB bit 1 must be 1 (e.g. 0xFB or 0xFD)
    await api.system.boot({ portB: 0xFB });

    console.log("Waiting for disk to boot...");
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

    const screenshotPath = path.resolve(__dirname, "disk_boot.png");
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
