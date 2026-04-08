/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const IO_DMACTL = 0xd400;
const IO_HSCROL = 0xd40a;
const PLAYFIELD_SCRATCH_VIEW_X = 64;

function loadPlayfieldApi() {
  const baseSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "playfield", "renderer_base.js"),
    "utf8",
  );
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "playfield", "playfield.js"),
    "utf8",
  );
  const captures = [];
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
          captures.push({
            bytesPerLine: ctx.ioData.drawLine.bytesPerLine | 0,
            playfieldStartX:
              (ctx.ioData.drawLine.destIndex | 0) - PLAYFIELD_SCRATCH_VIEW_X,
          });
          return false;
        },
      });
    },
  };
  vm.runInContext(source, context, { filename: "playfield.js" });

  const api = context.window.A8EPlayfield.createApi({
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

  return { api, captures };
}

function makeCtx() {
  return {
    cycleCounter: 0,
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {
      clock: 0,
      currentDisplayListCommand: 0x02,
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
        playfieldLineBuffer: new Uint8Array(48),
        scheduledPlayfieldDma: new Uint8Array(114),
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

function recordGeometry(dmactl, hscrol, command) {
  const { api, captures } = loadPlayfieldApi();
  const ctx = makeCtx();
  ctx.sram[IO_DMACTL] = dmactl;
  ctx.sram[IO_HSCROL] = hscrol;
  ctx.ioData.currentDisplayListCommand = command;
  api.drawLine(ctx);
  assert.equal(captures.length, 1, "drawModeLine should capture exactly one active-line geometry record");
  return captures[0];
}

function testUnscrolledWidthsUseCorrectPlayfieldStart() {
  assert.deepEqual(recordGeometry(0x21, 0x00, 0x02), {
    bytesPerLine: 32,
    playfieldStartX: 136,
  });
  assert.deepEqual(recordGeometry(0x22, 0x00, 0x02), {
    bytesPerLine: 40,
    playfieldStartX: 104,
  });
  assert.deepEqual(recordGeometry(0x23, 0x00, 0x02), {
    bytesPerLine: 48,
    playfieldStartX: 72,
  });
}

function testHscrollPromotedFetchWindowsUseCorrectStart() {
  assert.deepEqual(recordGeometry(0x21, 0x01, 0x12), {
    bytesPerLine: 40,
    playfieldStartX: 106,
  });
  assert.deepEqual(recordGeometry(0x22, 0x01, 0x12), {
    bytesPerLine: 48,
    playfieldStartX: 74,
  });
  assert.deepEqual(recordGeometry(0x23, 0x01, 0x12), {
    bytesPerLine: 48,
    playfieldStartX: 74,
  });
}

testUnscrolledWidthsUseCorrectPlayfieldStart();
testHscrollPromotedFetchWindowsUseCorrectStart();
console.log("playfield_geometry_timing tests passed");
