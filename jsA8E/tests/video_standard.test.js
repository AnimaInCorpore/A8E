/* global __dirname, console, process, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { createHeadlessAutomation } = require("../headless");

function loadCoreScripts(bootOptions, files) {
  const context = {
    console: console,
    Math: Math,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Uint8Array: Uint8Array,
    Uint16Array: Uint16Array,
    Infinity: Infinity,
  };
  context.window = context;
  if (bootOptions) context.A8E_BOOT_OPTIONS = bootOptions;
  vm.createContext(context);
  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8");
    vm.runInContext(source, context, { filename: file });
  }
  return context;
}

// AHRM 4.2, 6.1: NTSC has 262 lines at 1.789773 MHz and $D014 reads $0F.
function testHardwareConstantsFollowTheBootStandard() {
  const pal = loadCoreScripts(null, ["core/hw.js"]).A8EHw.createApi();
  const ntsc = loadCoreScripts({ videoStandard: "NTSC" }, ["core/hw.js"]).A8EHw.createApi();
  assert.equal(pal.VIDEO_STANDARD, "pal");
  assert.equal(pal.LINES_PER_SCREEN, 312);
  assert.equal(pal.ATARI_CPU_HZ, 1773447);
  assert.equal(ntsc.VIDEO_STANDARD, "ntsc");
  assert.equal(ntsc.LINES_PER_SCREEN, 262);
  assert.equal(ntsc.ATARI_CPU_HZ, 1789773);
  assert.equal(ntsc.LINES_PER_SCREEN_PAL, 312, "frame buffers keep the PAL size");

  function palRegister(hw) {
    return hw.IO_INIT_VALUES.find(function (entry) {
      return entry.addr === hw.IO_COLPM2_PAL;
    }).read;
  }
  assert.equal(palRegister(pal), 0x01);
  assert.equal(palRegister(ntsc), 0x0f);
}

// AHRM D.2: NTSC hue 1 sits on the color burst at 180 degrees (-U).
function testNtscPaletteUsesColorBurstPhase() {
  const Palette = loadCoreScripts(null, ["render/palette.js"]).A8EPalette;
  const pal = Palette.createAtariPaletteRgb("pal");
  const ntsc = Palette.createAtariPaletteRgb("ntsc");
  const hue1Lum8 = (0x18 * 3) | 0;
  assert.deepEqual(
    Array.from(ntsc.subarray(0, 16 * 3)),
    Array.from(pal.subarray(0, 16 * 3)),
    "hue 0 grays should not depend on the standard",
  );
  assert.notDeepEqual(
    Array.from(ntsc.subarray(hue1Lum8, hue1Lum8 + 3)),
    Array.from(pal.subarray(hue1Lum8, hue1Lum8 + 3)),
    "hue 1 should differ between NTSC and PAL",
  );
  const r = ntsc[hue1Lum8];
  const b = ntsc[hue1Lum8 + 2];
  assert.ok(r > b, "NTSC hue 1 (-U) should be yellow-green, not blue");
}

// The OS runs one VBI per frame, so RTCLOK counts 262-line frames on NTSC.
async function testNtscMachineRunsSixtyFramesPerSecond() {
  const runtime = await createHeadlessAutomation({
    roms: {
      os: path.resolve(__dirname, "..", "..", "ATARIXL.ROM"),
      basic: path.resolve(__dirname, "..", "..", "ATARIBAS.ROM"),
    },
    videoStandard: "ntsc",
    turbo: true,
    frameDelayMs: 0,
  });

  try {
    const api = runtime.api;
    await api.whenReady();
    await api.system.start();
    await api.system.waitForCycles({ count: 120 * 262 * 114, timeoutMs: 20000 });
    assert.equal(await api.debug.readMemory(0xd014), 0x0f, "NTSC $D014 should read $0F");

    const before = await api.debug.readMemory(0x14);
    await api.system.waitForCycles({ count: 1789773, timeoutMs: 20000 });
    const after = await api.debug.readMemory(0x14);
    const vbis = (after - before) & 0xff;
    assert.ok(vbis >= 59 && vbis <= 61, "one second should run about 60 VBIs, got " + vbis);
  } finally {
    await runtime.dispose();
  }
}

async function main() {
  testHardwareConstantsFollowTheBootStandard();
  testNtscPaletteUsesColorBurstPhase();
  await testNtscMachineRunsSixtyFramesPerSecond();
  console.log("video_standard tests passed");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
