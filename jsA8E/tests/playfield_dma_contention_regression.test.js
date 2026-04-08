/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const IO_COLBK = 0xd01a;
const IO_COLPM0_TRIG2 = 0xd012;
const IO_DMACTL = 0xd400;
const IO_PRIOR = 0xd01b;
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
    IO_COLBK: IO_COLBK,
    IO_COLPM0_TRIG2: IO_COLPM0_TRIG2,
    IO_DMACTL: IO_DMACTL,
    IO_PRIOR: IO_PRIOR,
    IO_VCOUNT: IO_VCOUNT,
    PRIO_BKG: 0,
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

function makeCtx(clock, firstRowScanline) {
  return {
    cycleCounter: 0,
    accessAddress: 0x4321,
    accessFunction: null,
    accessMode: 1,
    cpu: {
      pc: 0x2000,
    },
    ioBeamTimedEventCycle: Number.POSITIVE_INFINITY,
    ioMasterTimedEventCycle: Number.POSITIVE_INFINITY,
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {
      clock: clock | 0,
      displayListFetchCycle: 0,
      firstRowScanline: !!firstRowScanline,
      drawLine: {
        playfieldDmaStealCount: 0,
        refreshDmaPending: 0,
        displayListInstructionDmaPending: 0,
        displayListAddressDmaRemaining: 0,
        playerMissileClockActive: false,
        playerMissileInterleaved: false,
        playfieldLineBuffer: new Uint8Array(48),
        scheduledPlayfieldDma: new Uint8Array(114),
      },
      video: {
        currentDisplayLine: 0,
      },
    },
  };
}

function enablePlayfieldDma(ctx) {
  ctx.sram[IO_DMACTL] = 0x23;
}

function scheduledDmaAt(ctx, cycle) {
  const scheduled = ctx.ioData.drawLine.scheduledPlayfieldDma;
  return scheduled ? (scheduled[cycle] | 0) : 0;
}

function testScheduledCharacterDmaStealsOnCycle105() {
  const api = loadRendererBaseApi();
  const ctx = makeCtx(102, true);
  enablePlayfieldDma(ctx);
  ctx.ram[0x2000] = 0xa5;

  const value = api.fetchUnbufferedDisplayByte(ctx, 0x2000, 3);
  assert.equal(value, 0xa5);
  assert.equal(scheduledDmaAt(ctx, 105), 1);
  assert.equal(ctx.cycleCounter, 0);

  api.stepClockActions(ctx, 4);
  assert.equal(
    ctx.cycleCounter,
    1,
    "scheduled playfield DMA should stall the CPU when cycle 105 is executed",
  );
}

function testVirtualCharacterFetchUsesCpuBusWithoutSchedulingDma() {
  const api = loadRendererBaseApi();
  const ctx = makeCtx(103, true);
  enablePlayfieldDma(ctx);
  ctx.ram[0x2000] = 0xa5;
  ctx.ram[ctx.accessAddress] = 0x5a;

  const value = api.fetchUnbufferedDisplayByte(ctx, 0x2000, 3);
  assert.equal(value, 0x5a);
  assert.equal(scheduledDmaAt(ctx, 106), 0);
  assert.equal(ctx.cycleCounter, 0);
}

function testVirtualCharacterFetchUsesZeroPageCpuBusAddress() {
  const api = loadRendererBaseApi();
  const ctx = makeCtx(103, true);
  enablePlayfieldDma(ctx);
  ctx.accessAddress = 0x0000;
  ctx.cpu.pc = 0x4321;
  ctx.ram[0x0000] = 0x7c;
  ctx.ram[0x4321] = 0x5a;

  const value = api.fetchUnbufferedDisplayByte(ctx, 0x2000, 3);
  assert.equal(
    value,
    0x7c,
    "late virtual fetches must honor an active $0000 CPU bus address",
  );
  assert.equal(scheduledDmaAt(ctx, 106), 0);
  assert.equal(ctx.cycleCounter, 0);
}

function testVirtualDisplayFetchLatchesRefreshDropArtifactIntoLineBuffer() {
  const api = loadRendererBaseApi();
  const ctx = makeCtx(106, true);
  enablePlayfieldDma(ctx);
  ctx.ioData.drawLine.refreshDmaPending = 1;
  ctx.ram[0x2000] = 0x11;
  ctx.ram[ctx.accessAddress] = 0x33;

  const firstRowValue = api.fetchBufferedDisplayByte(ctx, 0, 0x2000, 0);
  assert.equal(firstRowValue, 0xff);
  assert.equal(scheduledDmaAt(ctx, 106), 0);

  ctx.ioData.firstRowScanline = false;
  ctx.ioData.drawLine.refreshDmaPending = 0;
  ctx.ram[0x2000] = 0x44;
  ctx.ram[ctx.accessAddress] = 0x55;

  const repeatedValue = api.fetchBufferedDisplayByte(ctx, 0, 0x2000, 0);
  assert.equal(
    repeatedValue,
    0xff,
    "later scanlines should reuse the virtual fetch artifact latched on the first row",
  );
}

testScheduledCharacterDmaStealsOnCycle105();
testVirtualCharacterFetchUsesCpuBusWithoutSchedulingDma();
testVirtualCharacterFetchUsesZeroPageCpuBusAddress();
testVirtualDisplayFetchLatchesRefreshDropArtifactIntoLineBuffer();
console.log("playfield_dma_contention_regression tests passed");
