/* global __dirname, console, process, require */

const assert = require("node:assert/strict");
const path = require("node:path");

const { createHeadlessAutomation } = require("../headless");

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function main() {
  const runtime = await createHeadlessAutomation({
    roms: {
      os: path.resolve(__dirname, "..", "..", "ATARIXL.ROM"),
      basic: path.resolve(__dirname, "..", "..", "ATARIBAS.ROM"),
    },
    turbo: true,
    frameDelayMs: 0,
  });

  try {
    const api = runtime.api;
    const readyApi = await api.whenReady();
    assert.equal(readyApi, api);

    const capabilities = await api.getCapabilities();
    assert.equal(capabilities.worker, false);
    assert.equal(capabilities.hostfs, true);
    assert.equal(capabilities.assembler, true);
    assert.equal(capabilities.snapshots, true);
    assert.equal(capabilities.screenshot, true);

    const initialState = await api.getSystemState();
    assert.equal(initialState.ready, true);
    assert.equal(initialState.rendererBackend, "2d");
    assert.equal(initialState.roms.osLoaded, true);
    assert.equal(initialState.roms.basicLoaded, true);

    await api.dev.writeHostFile("HELLO.TXT", { text: "HEADLESS OK" });
    const hostFile = await api.dev.readHostFile("HELLO.TXT", {
      encoding: "text",
    });
    assert.equal(hostFile.text, "HEADLESS OK");

    const build = await api.dev.assembleSource({
      name: "LOOP.ASM",
      text: ".ORG $2000\nSTART: JMP START\n.RUN START\n",
    });
    assert.equal(build.ok, true);
    assert.equal(build.runAddr, 0x2000);
    assert.ok(build.byteLength > 0);

    await api.system.start();
    const cycleWait = await api.system.waitForCycles({
      count: 20000,
      timeoutMs: 5000,
    });
    assert.equal(cycleWait.ok, true);
    assert.ok(cycleWait.delta >= 20000);

    const screenshot = await api.artifacts.captureScreenshot({
      encoding: "bytes",
    });
    assert.equal(screenshot.mimeType, "image/png");
    assert.ok(screenshot.bytes.length > PNG_SIGNATURE.length);
    assert.deepEqual(
      Array.from(screenshot.bytes.slice(0, PNG_SIGNATURE.length)),
      PNG_SIGNATURE,
    );

    await api.system.pause();
    const snapshot = await api.system.saveSnapshot();
    assert.equal(snapshot.savedRunning, false);
    assert.ok(snapshot.byteLength > 0);

    const restored = await api.system.loadSnapshot(snapshot.bytes, {
      resume: "saved",
    });
    assert.equal(restored.resumed, false);
    assert.equal(restored.debugState.running, false);

    const finalState = await api.getSystemState();
    assert.equal(finalState.running, false);

    console.log("headless_automation.test.js passed");
  } finally {
    await runtime.dispose();
  }
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
