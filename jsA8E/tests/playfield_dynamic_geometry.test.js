/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const IO_DMACTL = 0xd400;
const IO_HSCROL = 0xd404;
const IO_COLBK = 0xd01a;

function loadPlayfieldApi(stepperFactory) {
  const baseSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "playfield", "renderer_base.js"),
    "utf8",
  );
  const playfieldSource = fs.readFileSync(
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
        createModeStepper: function (mode, ctx) {
          return stepperFactory(base, mode, ctx);
        },
      });
    },
  };
  vm.runInContext(playfieldSource, context, { filename: "playfield.js" });

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
    IO_COLBK: IO_COLBK,
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

function makeCtx(command) {
  return {
    cycleCounter: 0,
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {
      clock: 0,
      currentDisplayListCommand: command,
      displayListFetchCycle: 0,
      firstRowScanline: false,
      rowDisplayMemoryAddress: 0,
      drawLine: {
        bytesPerLine: 0,
        bytesConsumed: 0,
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
        playfieldScratchWidth: 640,
        playfieldScratchPixels: new Uint8Array(640),
        playfieldScratchPriority: new Uint16Array(640),
      },
    },
  };
}

function testHscrollBit0ShiftMovesFollowingPixelsImmediately() {
  const api = loadPlayfieldApi(function (base, mode, ctx) {
    assert.equal(mode, 2);
    return {
      cycleCount: 0,
      renderCycle: function (dst, prio, dstIndex) {
        const color = this.cycleCount === 0 ? 0x55 : 0x66;
        for (let i = 0; i < 4; i++) {
          dst[dstIndex + i] = color;
          prio[dstIndex + i] = 0x02;
        }
        if (this.cycleCount === 0) {
          ctx.sram[IO_HSCROL] = 0x01;
        }
        this.cycleCount++;
        base.clockAction(ctx);
        return dstIndex + 4;
      },
      finalize: function () {
        ctx.ioData.drawLine.bytesConsumed = this.cycleCount;
      },
    };
  });

  const ctx = makeCtx(0x12);
  ctx.sram[IO_DMACTL] = 0x23;
  ctx.sram[IO_HSCROL] = 0x00;
  ctx.sram[IO_COLBK] = 0x33;

  api.drawLine(ctx);

  assert.deepEqual(Array.from(ctx.ioData.videoOut.pixels.slice(64, 68)), [
    0x55,
    0x55,
    0x55,
    0x55,
  ]);
  assert.deepEqual(Array.from(ctx.ioData.videoOut.pixels.slice(68, 70)), [
    0x33,
    0x33,
  ]);
  assert.deepEqual(Array.from(ctx.ioData.videoOut.pixels.slice(70, 74)), [
    0x66,
    0x66,
    0x66,
    0x66,
  ]);
}

function testDmactlDisableAndReenableAffectsActiveDisplayImmediately() {
  const api = loadPlayfieldApi(function (base, mode, ctx) {
    assert.equal(mode, 2);
    return {
      cycleCount: 0,
      renderCycle: function (dst, prio, dstIndex) {
        const colors = [0x44, 0x55, 0x66];
        const color = colors[Math.min(this.cycleCount, colors.length - 1)];
        for (let i = 0; i < 4; i++) {
          dst[dstIndex + i] = color;
          prio[dstIndex + i] = 0x02;
        }
        if (this.cycleCount === 0) {
          ctx.sram[IO_DMACTL] = 0x20;
        } else if (this.cycleCount === 1) {
          ctx.sram[IO_DMACTL] = 0x23;
        }
        this.cycleCount++;
        base.clockAction(ctx);
        return dstIndex + 4;
      },
      finalize: function () {
        ctx.ioData.drawLine.bytesConsumed = this.cycleCount;
      },
    };
  });

  const ctx = makeCtx(0x02);
  ctx.sram[IO_DMACTL] = 0x23;
  ctx.sram[IO_HSCROL] = 0x00;
  ctx.sram[IO_COLBK] = 0x22;

  api.drawLine(ctx);

  assert.deepEqual(Array.from(ctx.ioData.videoOut.pixels.slice(64, 68)), [
    0x44,
    0x44,
    0x44,
    0x44,
  ]);
  assert.deepEqual(Array.from(ctx.ioData.videoOut.pixels.slice(68, 72)), [
    0x22,
    0x22,
    0x22,
    0x22,
  ]);
  assert.deepEqual(Array.from(ctx.ioData.videoOut.pixels.slice(72, 76)), [
    0x66,
    0x66,
    0x66,
    0x66,
  ]);
}

testHscrollBit0ShiftMovesFollowingPixelsImmediately();
testDmactlDisableAndReenableAffectsActiveDisplayImmediately();
console.log("playfield_dynamic_geometry tests passed");
