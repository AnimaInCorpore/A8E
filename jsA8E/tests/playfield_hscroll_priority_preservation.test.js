/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const IO_DMACTL = 0xd400;
const IO_HSCROL = 0xd40a;

function loadPlayfieldApi() {
  const baseSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "playfield", "renderer_base.js"),
    "utf8",
  );
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "playfield", "playfield.js"),
    "utf8",
  );
  const context = {
    console: console,
    Uint8Array: Uint8Array,
    Uint16Array: Uint16Array,
    Math: Math,
    Number: Number,
    Object: Object,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(baseSource, context, { filename: "renderer_base.js" });
  context.A8EPlayfieldRenderer = {
    createApi: function (cfg) {
      const base = context.window.A8EPlayfieldRendererBase.createApi(cfg);
      return Object.assign({}, base, {
        drawModeLine: function (_, ctx) {
          const scratchPixels = ctx.ioData.videoOut.playfieldScratchPixels;
          const scratchPriority = ctx.ioData.videoOut.playfieldScratchPriority;
          const start = ctx.ioData.drawLine.destIndex | 0;

          scratchPixels[start + 12] = 0x7e;
          scratchPriority[start + 12] = 0x10;
          scratchPixels[start + 13] = 0x55;
          scratchPriority[start + 13] = 0x00;

          scratchPixels[start + 328] = 0x7d;
          scratchPriority[start + 328] = 0x10;
          scratchPixels[start + 329] = 0x54;
          scratchPriority[start + 329] = 0x00;
          return true;
        },
      });
    },
  };
  vm.runInContext(source, context, { filename: "playfield.js" });

  return context.window.A8EPlayfield.createApi({
    Util: {
      fixedAdd: function (value, mask, add) {
        return (value & ~mask) | ((value + add) & mask);
      },
    },
    PIXELS_PER_LINE: 456,
    CYCLES_PER_LINE: 114,
    LINES_PER_SCREEN_PAL: 312,
    FIRST_VISIBLE_LINE: 0,
    LAST_VISIBLE_LINE: 239,
    IO_COLBK: 0xd01a,
    IO_COLPM0_TRIG2: 0xd012,
    IO_DMACTL: IO_DMACTL,
    IO_HSCROL: IO_HSCROL,
    IO_PRIOR: 0xd01b,
    IO_VCOUNT: 0xd40b,
    ANTIC_MODE_INFO: {
      2: { ppb: 8 },
    },
    CPU: {
      executeOne: function () {},
    },
    PRIO_BKG: 0x01,
    PRIO_PM0: 0x10,
    PRIO_PM1: 0x20,
    PRIO_PM2: 0x40,
    PRIO_PM3: 0x80,
    PRIO_M10_PM0: 0x100,
    PRIO_M10_PM1: 0x200,
    PRIO_M10_PM2: 0x400,
    PRIO_M10_PM3: 0x800,
    ioCycleTimedEvent: function () {},
    drawPlayerMissilesClock: function () {},
    fetchPmgDmaCycle: function () {},
  });
}

function makeCtx() {
  return {
    cycleCounter: 0,
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {
      clock: 0,
      currentDisplayListCommand: 0x12,
      displayListFetchCycle: 0,
      firstRowScanline: false,
      rowDisplayMemoryAddress: 0,
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
      },
      video: {
        currentDisplayLine: 0,
      },
      videoOut: {
        pixels: new Uint8Array(456),
        priority: new Uint16Array(456),
        playfieldScratchWidth: 520,
        playfieldScratchPixels: new Uint8Array(520),
        playfieldScratchPriority: new Uint16Array(520),
      },
    },
  };
}

function testHscrollClipPreservesPmgPixels() {
  const api = loadPlayfieldApi();
  const ctx = makeCtx();

  ctx.sram[IO_DMACTL] = 0x21;
  ctx.sram[IO_HSCROL] = 0x01;
  ctx.sram[0xd01a] = 0x33;
  ctx.sram[0xd01b] = 0x00;

  api.drawLine(ctx);

  assert.equal(ctx.ioData.videoOut.pixels[110], 0x7e);
  assert.equal(ctx.ioData.videoOut.priority[110], 0x10);
  assert.equal(ctx.ioData.videoOut.pixels[111], 0x33);
  assert.equal(ctx.ioData.videoOut.priority[111], 0x01);
  assert.equal(ctx.ioData.videoOut.pixels[426], 0x7d);
  assert.equal(ctx.ioData.videoOut.priority[426], 0x10);
  assert.equal(ctx.ioData.videoOut.pixels[427], 0x33);
  assert.equal(ctx.ioData.videoOut.priority[427], 0x01);
}

testHscrollClipPreservesPmgPixels();
console.log("playfield_hscroll_priority_preservation tests passed");
