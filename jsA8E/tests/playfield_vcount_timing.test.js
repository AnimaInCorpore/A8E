/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const IO_VCOUNT = 0xd40b;

function loadRendererBaseApi() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "playfield", "renderer_base.js"),
    "utf8",
  );
  const context = {
    console: console,
    Uint8Array: Uint8Array,
    Math: Math,
    Number: Number,
    Object: Object,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "renderer_base.js" });

  return context.window.A8EPlayfieldRendererBase.createApi({
    CPU: {
      executeOne: function () {},
    },
    PIXELS_PER_LINE: 456,
    CYCLES_PER_LINE: 114,
    LINES_PER_SCREEN_PAL: 312,
    IO_COLBK: 0xd01a,
    IO_COLPM0_TRIG2: 0xd012,
    IO_PRIOR: 0xd01b,
    IO_VCOUNT: IO_VCOUNT,
    PRIO_BKG: 0,
    ioCycleTimedEvent: function () {},
    drawPlayerMissilesClock: function () {},
  });
}

function makeCtx(displayLine) {
  return {
    cycleCounter: 0,
    ioBeamTimedEventCycle: Number.POSITIVE_INFINITY,
    ioMasterTimedEventCycle: Number.POSITIVE_INFINITY,
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {
      clock: 0,
      displayListFetchCycle: 0,
      drawLine: {
        playerMissileClockActive: false,
        playfieldDmaStealCount: 0,
        refreshDmaPending: 0,
        displayListInstructionDmaPending: 0,
        displayListAddressDmaRemaining: 0,
      },
      video: {
        currentDisplayLine: displayLine,
      },
    },
  };
}

function testVcountUpdatesAtCycle100Boundary() {
  const api = loadRendererBaseApi();
  const ctx = makeCtx(11);
  ctx.ram[IO_VCOUNT] = 5;

  api.stepClockActions(ctx, 100);
  assert.equal(ctx.ram[IO_VCOUNT], 5, "VCOUNT should still be old value before cycle 100");

  api.stepClockActions(ctx, 1);
  assert.equal(ctx.ram[IO_VCOUNT], 6, "VCOUNT should switch to next line value at cycle 100");
}

function testVcountWrapsToZeroAtLastLine() {
  const api = loadRendererBaseApi();
  const ctx = makeCtx(311);
  ctx.ram[IO_VCOUNT] = 155;

  api.stepClockActions(ctx, 100);
  assert.equal(ctx.ram[IO_VCOUNT], 155);

  api.stepClockActions(ctx, 1);
  assert.equal(ctx.ram[IO_VCOUNT], 0, "VCOUNT should wrap at the end of the PAL frame");
}

testVcountUpdatesAtCycle100Boundary();
testVcountWrapsToZeroAtLastLine();
console.log("playfield_vcount_timing tests passed");
