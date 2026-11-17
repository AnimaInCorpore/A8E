/* global __dirname, console, require */

// AHRM 4.12/4.14: mapped (bitmap) modes fetch on the bitmap tap of the DMA
// clock, two cycles after the character-name slot: normal width starts on
// cycle 20 and wide on cycle 12, where the 48th wide fetch falls on cycle
// 106 and becomes a virtual DMA cycle. Character names still start on 18.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const MODE_INFO = [
  { lines: 0, ppb: 0 }, { lines: 0, ppb: 0 }, { lines: 8, ppb: 8 }, { lines: 10, ppb: 8 },
  { lines: 8, ppb: 8 }, { lines: 16, ppb: 8 }, { lines: 8, ppb: 16 }, { lines: 16, ppb: 16 },
  { lines: 8, ppb: 32 }, { lines: 4, ppb: 32 }, { lines: 4, ppb: 16 }, { lines: 2, ppb: 16 },
  { lines: 1, ppb: 16 }, { lines: 2, ppb: 8 }, { lines: 1, ppb: 8 }, { lines: 1, ppb: 8 },
];

function loadPlayfieldApi() {
  const context = { console, Uint8Array, Uint16Array, Math, Number, Object };
  context.window = context;
  vm.createContext(context);
  for (const file of [
    "renderer_base.js",
    "mode_2_3.js",
    "mode_4_5.js",
    "mode_6_7.js",
    "mode_8_f.js",
    "renderer.js",
    "playfield.js",
  ]) {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "js", "core", "playfield", file),
      "utf8",
    );
    vm.runInContext(source, context, { filename: file });
  }
  const noop = function () {};
  return context.window.A8EPlayfield.createApi({
    Util: { fixedAdd: (v, m, a) => (v & ~m) | ((v + a) & m) },
    PIXELS_PER_LINE: 456,
    CYCLES_PER_LINE: 114,
    LINES_PER_SCREEN_PAL: 312,
    FIRST_VISIBLE_LINE: 0,
    LAST_VISIBLE_LINE: 239,
    IO_COLBK: 0xd01a,
    IO_COLPM0_TRIG2: 0xd012,
    IO_DMACTL: 0xd400,
    IO_HSCROL: 0xd404,
    IO_PRIOR: 0xd01b,
    IO_VCOUNT: 0xd40b,
    IO_VSCROL: 0xd405,
    IO_CHACTL: 0xd401,
    IO_CHBASE: 0xd409,
    IO_COLPF0: 0xd016,
    IO_COLPF1: 0xd017,
    IO_COLPF2: 0xd018,
    IO_COLPF3: 0xd019,
    ANTIC_MODE_INFO: MODE_INFO,
    CPU: { executeOne: noop },
    PRIO_BKG: 0,
    PRIO_PF0: 1,
    PRIO_PF1: 2,
    PRIO_PF2: 4,
    PRIO_PF3: 8,
    PRIO_PM0: 0x10,
    PRIO_PM1: 0x20,
    PRIO_PM2: 0x40,
    PRIO_PM3: 0x80,
    PRIO_M10_PM0: 0x100,
    PRIO_M10_PM1: 0x200,
    PRIO_M10_PM2: 0x400,
    PRIO_M10_PM3: 0x800,
    PRIORITY_TABLE_BKG_PF012: new Uint8Array(4),
    PRIORITY_TABLE_BKG_PF013: new Uint8Array(4),
    PRIORITY_TABLE_PF0123: new Uint8Array(4),
    SCRATCH_GTIA_COLOR_TABLE: new Uint8Array(16),
    SCRATCH_COLOR_TABLE_A: new Uint8Array(4),
    SCRATCH_COLOR_TABLE_B: new Uint8Array(4),
    SCRATCH_BACKGROUND_TABLE: new Uint8Array(4),
    fillGtiaColorTable: noop,
    fillBkgPf012ColorTable: noop,
    decodeTextModeCharacter: (c) => c & 0x7f,
    ioCycleTimedEvent: noop,
    drawPlayerMissilesClock: noop,
    fetchPmgDmaCycle: () => 0,
  });
}

// Draws the first scan line of a mode line and returns the cycles that got
// playfield DMA.
function playfieldDmaCycles(command, dmactl) {
  const api = loadPlayfieldApi();
  const ctx = {
    cycleCounter: 0,
    ioBeamTimedEventCycle: Infinity,
    ioMasterTimedEventCycle: Infinity,
    accessMode: 0,
    accessFunction: null,
    accessAddress: 0,
    cpu: { pc: 0 },
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {
      clock: 0,
      currentDisplayListCommand: command,
      displayListFetchCycle: 0,
      firstRowScanline: true,
      rowDisplayMemoryAddress: 0x2000,
      displayMemoryAddress: 0x2000,
      modeLineRowCounter: 0,
      chbaseTiming: { initialized: false },
      drawLine: {
        bytesPerLine: 0,
        destIndex: 0,
        displayMemoryAddress: 0,
        playerMissileClockActive: false,
        playerMissileInterleaved: false,
        playfieldDmaStealCount: 0,
        refreshDmaPending: 0,
        displayListInstructionDmaPending: 0,
        displayListAddressDmaRemaining: 0,
        playfieldLineBuffer: new Uint8Array(48),
        scheduledPlayfieldDma: new Uint8Array(114),
      },
      video: { currentDisplayLine: 10 },
      videoOut: {
        pixels: new Uint8Array(456 * 312),
        priority: new Uint16Array(456 * 312),
        playfieldScratchWidth: 520,
        playfieldScratchPixels: new Uint8Array(520 * 312),
        playfieldScratchPriority: new Uint16Array(520 * 312),
      },
    },
  };
  ctx.sram[0xd400] = dmactl;
  api.drawLine(ctx);
  const cycles = [];
  const scheduled = ctx.ioData.drawLine.scheduledPlayfieldDma;
  for (let i = 0; i < 114; i++) if (scheduled[i]) cycles.push(i);
  return cycles;
}

function every(first, step, count) {
  return Array.from({ length: count }, (_, i) => first + i * step);
}

function testBitmapModesFetchOnTheBitmapSlot() {
  assert.deepEqual(playfieldDmaCycles(0x0e, 0x22), every(20, 2, 40), "mode E normal");
  assert.deepEqual(playfieldDmaCycles(0x0a, 0x22), every(20, 4, 20), "mode A normal");
  assert.deepEqual(playfieldDmaCycles(0x08, 0x22), every(20, 8, 10), "mode 8 normal");
  assert.deepEqual(playfieldDmaCycles(0x0e, 0x21), every(28, 2, 32), "mode E narrow");
  // Wide: 12..104, the 48th fetch on cycle 106 is virtual.
  assert.deepEqual(playfieldDmaCycles(0x0f, 0x23), every(12, 2, 47), "mode F wide");
}

function testCharacterNamesStillStartOnCycle18() {
  const cycles = playfieldDmaCycles(0x02, 0x22);
  assert.equal(cycles[0], 18, "mode 2 normal name fetch");
}

testBitmapModesFetchOnTheBitmapSlot();
testCharacterNamesStillStartOnCycle18();
console.log("playfield_bitmap_dma_timing tests passed");
