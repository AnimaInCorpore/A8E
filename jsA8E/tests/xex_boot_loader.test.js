/* global __dirname, console, process, require */

const assert = require("node:assert/strict");
const path = require("node:path");

const { createHeadlessAutomation } = require("../headless");

function segment(start, bytes) {
  const end = start + bytes.length - 1;
  return [
    start & 0xff,
    start >> 8,
    end & 0xff,
    end >> 8,
  ].concat(bytes);
}

// INIT and RUN entry points in zero page have a zero high byte. The boot
// loader must test both vector bytes before deciding a vector is unset.
function buildZeroPageEntryXex() {
  const initCode = [0xa9, 0xa5, 0x8d, 0x01, 0x30, 0x60]; // LDA #$A5 / STA $3001 / RTS
  const runCode = [0xa9, 0x5a, 0x8d, 0x00, 0x30, 0x4c, 0x85, 0x00]; // LDA #$5A / STA $3000 / JMP *
  return new Uint8Array(
    [0xff, 0xff].concat(
      segment(0x0090, initCode),
      segment(0x02e2, [0x90, 0x00]),
      segment(0x0080, runCode),
      segment(0x02e0, [0x80, 0x00]),
    ),
  );
}

async function main() {
  const runtime = await createHeadlessAutomation({
    roms: {
      os: path.resolve(__dirname, "..", "..", "ATARIXL.ROM"),
      basic: path.resolve(__dirname, "..", "..", "ATARIBAS.ROM"),
    },
    turbo: true,
    sioTurbo: false,
    frameDelayMs: 0,
  });

  try {
    const api = runtime.api;
    await api.whenReady();
    await api.dev.runXex({
      bytes: buildZeroPageEntryXex(),
      name: "ZPENTRY.XEX",
      awaitEntry: false,
    });
    const wait = await api.system.waitForCycles({
      count: 400 * 114 * 312,
      timeoutMs: 20000,
    });
    assert.equal(wait.ok, true);

    const initMarker = await api.debug.readMemory(0x3001);
    const runMarker = await api.debug.readMemory(0x3000);
    assert.equal(initMarker, 0xa5, "INITAD $0090 should run");
    assert.equal(runMarker, 0x5a, "RUNAD $0080 should run");
  } finally {
    await runtime.dispose();
  }

  console.log("xex_boot_loader tests passed");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
