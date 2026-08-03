/* global __dirname, console, require */

// AHRM 4.7 / 4.8 vertical-scrolling timing:
// - the 4-bit mode-line row counter wraps, so region entries with VSCROL
//   above the natural end row extend the mode line (GTIA 9++),
// - the line ending a scrolled region follows the live VSCROL value
//   (deadline cycle 108),
// - a VSCROL write affects the exit-line DLI only through cycle 5.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const IO_DMACTL = 0xd400;
const IO_VSCROL = 0xd405;
const IO_VCOUNT = 0xd40b;
const IO_NMIEN = 0xd40e;
const IO_NMIRES_NMIST = 0xd40f;
const IO_IRQEN_IRQST = 0xd20e;
const IO_CHACTL = 0xd401;
const IO_CHBASE = 0xd409;
const IO_COLBK = 0xd01a;
const IO_COLPF0 = 0xd016;
const IO_COLPF1 = 0xd017;
const IO_COLPF2 = 0xd018;
const IO_COLPF3 = 0xd019;
const IO_COLPM0_TRIG2 = 0xd012;
const IO_PRIOR = 0xd01b;
const IO_HSCROL = 0xd404;

const NMI_DLI = 0x80;
const NMI_VBI = 0x40;
const CYCLE_NEVER = Number.POSITIVE_INFINITY;
const CYCLES_PER_LINE = 114;

function loadAnticApi() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "antic.js"),
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
  context.A8EPlayfield = {
    createApi: function () {
      return {
        drawLine: function () {},
      };
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "antic.js" });
  const api = context.window.A8EAntic.createApi({
    CPU: {
      stall: function () {},
      nmi: function () {},
      irq: function () {},
      executeOne: function () {},
    },
    Util: {
      fixedAdd: function (value, mask, add) {
        return (value & ~mask) | ((value + add) & mask);
      },
    },
    PIXELS_PER_LINE: 456,
    CYCLES_PER_LINE: CYCLES_PER_LINE,
    LINES_PER_SCREEN_PAL: 312,
    CYCLE_NEVER: CYCLE_NEVER,
    FIRST_VISIBLE_LINE: 8,
    LAST_VISIBLE_LINE: 247,
    NMI_DLI: NMI_DLI,
    NMI_VBI: NMI_VBI,
    IRQ_TIMER_1: 0x01,
    IRQ_TIMER_2: 0x02,
    IRQ_TIMER_4: 0x04,
    IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE: 0x08,
    IRQ_SERIAL_OUTPUT_DATA_NEEDED: 0x10,
    IRQ_SERIAL_INPUT_DATA_READY: 0x20,
    IO_VCOUNT: IO_VCOUNT,
    IO_NMIEN: IO_NMIEN,
    IO_NMIRES_NMIST: IO_NMIRES_NMIST,
    IO_IRQEN_IRQST: IO_IRQEN_IRQST,
    IO_DMACTL: IO_DMACTL,
    IO_VSCROL: IO_VSCROL,
    IO_CHACTL: IO_CHACTL,
    IO_CHBASE: IO_CHBASE,
    IO_COLBK: IO_COLBK,
    IO_COLPF0: IO_COLPF0,
    IO_COLPF1: IO_COLPF1,
    IO_COLPF2: IO_COLPF2,
    IO_COLPF3: IO_COLPF3,
    IO_COLPM0_TRIG2: IO_COLPM0_TRIG2,
    IO_PRIOR: IO_PRIOR,
    IO_HSCROL: IO_HSCROL,
    ANTIC_MODE_INFO: [
      { lines: 1, ppb: 8 },
      { lines: 1, ppb: 8 },
      { lines: 8, ppb: 8 },
      { lines: 10, ppb: 8 },
      { lines: 8, ppb: 8 },
      { lines: 16, ppb: 8 },
      { lines: 8, ppb: 16 },
      { lines: 16, ppb: 16 },
      { lines: 8, ppb: 32 },
      { lines: 4, ppb: 8 },
      { lines: 4, ppb: 16 },
      { lines: 2, ppb: 16 },
      { lines: 1, ppb: 16 },
      { lines: 2, ppb: 8 },
      { lines: 1, ppb: 8 },
      { lines: 1, ppb: 8 },
    ],
    drawPlayerMissilesClock: function () {},
    drawPlayerMissiles: function () {},
    pokeyTimerPeriodCpuCycles: function () {
      return 0;
    },
    cycleTimedEventUpdate: function () {},
    PRIO_BKG: 0,
    PRIO_PF0: 1,
    PRIO_PF1: 2,
    PRIO_PF2: 4,
    PRIORITY_TABLE_BKG_PF012: new Uint8Array(4),
    PRIORITY_TABLE_BKG_PF013: new Uint8Array(4),
    PRIORITY_TABLE_PF0123: new Uint8Array(4),
    SCRATCH_GTIA_COLOR_TABLE: new Uint8Array(16),
    SCRATCH_COLOR_TABLE_A: new Uint8Array(4),
    SCRATCH_COLOR_TABLE_B: new Uint8Array(4),
    SCRATCH_BACKGROUND_TABLE: new Uint8Array(4),
    fillGtiaColorTable: function () {},
    fillBkgPf012ColorTable: function () {},
    decodeTextModeCharacter: function (ch) {
      return ch & 0xff;
    },
    fillLine: function () {},
  });
  return api;
}

function makeContext() {
  return {
    cycleCounter: 0,
    ioCycleTimedEventCycle: CYCLE_NEVER,
    ioMasterTimedEventCycle: CYCLE_NEVER,
    ioBeamTimedEventCycle: CYCLE_NEVER,
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {
      video: {
        currentDisplayLine: 0,
      },
      displayListFetchCycle: 0,
      clock: 0,
      inDrawLine: false,
      dliCycle: CYCLE_NEVER,
      vbiCycle: CYCLE_NEVER,
      serialOutputTransmissionDoneCycle: CYCLE_NEVER,
      serialOutputNeedDataCycle: CYCLE_NEVER,
      serialInputDataReadyCycle: CYCLE_NEVER,
      timer1Cycle: CYCLE_NEVER,
      timer2Cycle: CYCLE_NEVER,
      timer4Cycle: CYCLE_NEVER,
      currentDisplayListCommand: 0,
      nextDisplayListLine: 8,
      displayListAddress: 0x0400,
      rowDisplayMemoryAddress: 0,
      displayMemoryAddress: 0,
      firstRowScanline: false,
      modeLineRowCounter: 0,
      modeLineEndRow: 0,
      modeLineScrollExit: false,
      modeLineExitDli: false,
      modeLineEndsThisLine: false,
      nmiTiming: {
        enabledByCycle7: 0,
        enabledByCycle8: 0,
        enabledOnCycle7Mask: 0,
      },
      drawLine: {
        playfieldDmaStealCount: 0,
        refreshDmaPending: 0,
        displayListInstructionDmaPending: 0,
        displayListAddressDmaRemaining: 0,
        playerMissileInterleaved: false,
        playerMissileClockActive: false,
        pmgFirstVisibleSpan: true,
        playerPmgShift: new Uint8Array(4),
        playerPmgState: new Uint8Array(4),
        missilePmgShift: new Uint8Array(4),
        missilePmgState: new Uint8Array(4),
        playfieldLineBuffer: new Uint8Array(48),
        scheduledPlayfieldDma: new Uint8Array(CYCLES_PER_LINE),
      },
      videoOut: {
        priority: new Uint8Array(456 * 312),
      },
    },
  };
}

function runOneScanline(api, ctx) {
  ctx.cycleCounter = ctx.ioData.displayListFetchCycle;
  api.ioCycleTimedEvent(ctx);
}

function testVscrolEntryWrapExtendsModeLine() {
  const api = loadAnticApi();
  const ctx = makeContext();

  ctx.sram[IO_DMACTL] = 0x22;
  ctx.sram[IO_VSCROL] = 13;
  ctx.ioData.currentDisplayListCommand = 0x02; // previous line: no VSCROL
  ctx.ioData.video.currentDisplayLine = 100;
  ctx.ioData.nextDisplayListLine = 100;
  ctx.ioData.displayListAddress = 0x0600;
  ctx.ram[0x0600] = 0x2f; // mode F with the VSCROL bit set

  runOneScanline(api, ctx);

  assert.equal(
    ctx.ioData.nextDisplayListLine,
    104,
    "mode F entered with VSCROL=13 must span 4 scanlines (rows 13,14,15,0)",
  );
  assert.equal(ctx.ioData.modeLineRowCounter, 14);

  runOneScanline(api, ctx); // row 14 -> 15
  runOneScanline(api, ctx); // row 15 -> 0
  runOneScanline(api, ctx); // row 0 matches the end row

  assert.equal(ctx.ioData.nextDisplayListLine, 104);
  assert.equal(ctx.ioData.video.currentDisplayLine, 104);
}

function testVscrolExitLineFollowsLiveVscrol() {
  const api = loadAnticApi();
  const ctx = makeContext();

  ctx.sram[IO_DMACTL] = 0x22;
  ctx.sram[IO_VSCROL] = 2;
  ctx.ioData.currentDisplayListCommand = 0x22; // previous line: VSCROL set
  ctx.ioData.video.currentDisplayLine = 100;
  ctx.ioData.nextDisplayListLine = 100;
  ctx.ioData.displayListAddress = 0x0600;
  ctx.ram[0x0600] = 0x02; // mode 2 without the VSCROL bit

  runOneScanline(api, ctx);

  assert.equal(ctx.ioData.modeLineScrollExit, true);
  assert.equal(
    ctx.ioData.nextDisplayListLine,
    103,
    "exit line with VSCROL=2 should predict 3 rows",
  );
  assert.equal(ctx.ioData.modeLineRowCounter, 1);

  // Simulate the cycle-109 comparison latch matching the live VSCROL.
  ctx.ioData.modeLineEndsThisLine = true;
  runOneScanline(api, ctx);

  assert.equal(
    ctx.ioData.nextDisplayListLine,
    102,
    "latched VSCROL match must end the exit line after this scanline",
  );
}

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
    IO_PRIOR: IO_PRIOR,
    IO_VCOUNT: IO_VCOUNT,
    IO_VSCROL: IO_VSCROL,
    PRIO_BKG: 0,
    ioCycleTimedEvent: function () {},
    drawPlayerMissilesClock: function () {},
  });
}

function makeClockCtx() {
  return {
    cycleCounter: 1000,
    ioBeamTimedEventCycle: CYCLE_NEVER,
    ioMasterTimedEventCycle: CYCLE_NEVER,
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {
      clock: 0,
      displayListFetchCycle: 0,
      dliCycle: CYCLE_NEVER,
      modeLineRowCounter: 0,
      modeLineScrollExit: false,
      modeLineExitDli: false,
      modeLineEndsThisLine: false,
      drawLine: {
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
        currentDisplayLine: 50,
      },
    },
  };
}

function testExitDliArmedAtCycle6OnMatchingRow() {
  const api = loadRendererBaseApi();
  const ctx = makeClockCtx();

  ctx.ioData.modeLineScrollExit = true;
  ctx.ioData.modeLineExitDli = true;
  ctx.ioData.modeLineRowCounter = 3;
  ctx.sram[IO_VSCROL] = 3;

  api.stepClockActions(ctx, 6); // cycles 0-5
  assert.equal(
    ctx.ioData.dliCycle,
    CYCLE_NEVER,
    "exit DLI must not be armed before cycle 6",
  );

  api.stepClockActions(ctx, 1); // cycle 6
  assert.equal(
    ctx.ioData.dliCycle,
    7,
    "matching VSCROL should arm the exit-line DLI for cycle 7",
  );
}

function testExitDliIgnoresVscrolWrittenAfterCycle5() {
  const api = loadRendererBaseApi();
  const ctx = makeClockCtx();

  ctx.ioData.modeLineScrollExit = true;
  ctx.ioData.modeLineExitDli = true;
  ctx.ioData.modeLineRowCounter = 3;
  ctx.sram[IO_VSCROL] = 0; // mismatched through the cycle-5 deadline

  api.stepClockActions(ctx, 7); // cycles 0-6
  assert.equal(ctx.ioData.dliCycle, CYCLE_NEVER);

  ctx.sram[IO_VSCROL] = 3; // too late for the DLI...
  api.stepClockActions(ctx, 103); // ...but before the cycle-108 deadline

  assert.equal(
    ctx.ioData.dliCycle,
    CYCLE_NEVER,
    "a VSCROL write after cycle 5 must not arm the exit-line DLI",
  );
  assert.equal(
    ctx.ioData.modeLineEndsThisLine,
    true,
    "a VSCROL write before cycle 108 must still end the exit line",
  );
}

function testExitEndLatchIgnoresVscrolWrittenAfterCycle108() {
  const api = loadRendererBaseApi();
  const ctx = makeClockCtx();

  ctx.ioData.modeLineScrollExit = true;
  ctx.ioData.modeLineRowCounter = 3;
  ctx.sram[IO_VSCROL] = 0;

  // The comparison latches at the top of the cycle-109 action, so a write
  // during the cycle-108 CPU slot still counts; step past the latch first.
  api.stepClockActions(ctx, 110); // cycles 0-109 (latch sees VSCROL=0)
  ctx.sram[IO_VSCROL] = 3; // past the cycle-108 deadline
  api.stepClockActions(ctx, 4); // through end of line

  assert.equal(
    ctx.ioData.modeLineEndsThisLine,
    false,
    "a VSCROL write after cycle 108 must not end the current scanline",
  );
}

testVscrolEntryWrapExtendsModeLine();
testVscrolExitLineFollowsLiveVscrol();
testExitDliArmedAtCycle6OnMatchingRow();
testExitDliIgnoresVscrolWrittenAfterCycle5();
testExitEndLatchIgnoresVscrolWrittenAfterCycle108();
console.log("antic_vscrol_timing tests passed");
