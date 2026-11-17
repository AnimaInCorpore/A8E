/* global __dirname, console, require */

// AHRM 4.6 display list fetch:
// - only LMS on modes 2-F and jumps fetch an address (blank lines $40-$70
//   use bit 6 as part of the line count),
// - a jump is one blank line regardless of bits 4-5,
// - jump address bytes wrap within the 1K display list block,
// - only IR bit 6 is cleared across vertical blank.

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

function fetchAt100(api, ctx, previousCommand) {
  ctx.sram[IO_DMACTL] = 0x22;
  ctx.ioData.currentDisplayListCommand = previousCommand;
  ctx.ioData.video.currentDisplayLine = 100;
  ctx.ioData.nextDisplayListLine = 100;
  ctx.ioData.displayListAddress = 0x0600;
  api.fetchLine(ctx);
}

function testBlankLinesSkipAddressDma() {
  const cases = [
    [0x40, 0],
    [0x50, 0],
    [0x60, 0],
    [0x70, 0],
    [0x42, 2],
    [0x01, 2],
  ];
  for (const [command, expected] of cases) {
    const api = loadAnticApi();
    const ctx = makeContext();
    ctx.ram[0x0600] = command;
    fetchAt100(api, ctx, 0x02);
    assert.equal(
      ctx.ioData.drawLine.displayListAddressDmaRemaining,
      expected,
      "$" + command.toString(16) + " address DMA cycles",
    );
  }
  const api = loadAnticApi();
  const ctx = makeContext();
  ctx.ram[0x0600] = 0x70;
  fetchAt100(api, ctx, 0x02);
  assert.equal(ctx.ioData.nextDisplayListLine, 108, "$70 is 8 blank lines");
}

function testJumpIsOneBlankLine() {
  for (const command of [0x01, 0x11, 0x21, 0x31]) {
    const api = loadAnticApi();
    const ctx = makeContext();
    ctx.ram[0x0600] = command;
    ctx.ram[0x0601] = 0x00;
    ctx.ram[0x0602] = 0x07;
    fetchAt100(api, ctx, 0x02);
    assert.equal(
      ctx.ioData.nextDisplayListLine,
      101,
      "jump $" + command.toString(16) + " lasts one line",
    );
    assert.equal(ctx.ioData.displayListAddress, 0x0700);
  }
}

function testJumpAddressWrapsWithin1K() {
  const api = loadAnticApi();
  const ctx = makeContext();
  ctx.sram[IO_DMACTL] = 0x22;
  ctx.ioData.video.currentDisplayLine = 100;
  ctx.ioData.nextDisplayListLine = 100;
  ctx.ioData.displayListAddress = 0x07fe;
  ctx.ram[0x07fe] = 0x01;
  ctx.ram[0x07ff] = 0x34;
  ctx.ram[0x0400] = 0x12; // wrapped high byte
  ctx.ram[0x0800] = 0x99; // unwrapped high byte
  api.fetchLine(ctx);
  assert.equal(ctx.ioData.displayListAddress, 0x1234);
}

function testIrBit6ClearedAcrossVbl() {
  const api = loadAnticApi();
  const ctx = makeContext();
  ctx.sram[IO_DMACTL] = 0x22;
  ctx.sram[IO_VSCROL] = 5;
  ctx.ioData.currentDisplayListCommand = 0xe2; // VS line before VBL
  ctx.ioData.video.currentDisplayLine = 311;
  ctx.ioData.nextDisplayListLine = 8;
  ctx.ioData.displayListAddress = 0x0600;
  ctx.ram[0x0600] = 0x22; // first line of the frame is VS too
  runOneScanline(api, ctx);
  assert.equal(ctx.ioData.currentDisplayListCommand, 0xa2);
  while (ctx.ioData.video.currentDisplayLine <= 8) runOneScanline(api, ctx);
  // No region entry: a full 8-row mode 2 line.
  assert.equal(ctx.ioData.nextDisplayListLine, 16);
}

testBlankLinesSkipAddressDma();
testJumpIsOneBlankLine();
testJumpAddressWrapsWithin1K();
testIrBit6ClearedAcrossVbl();
console.log("antic_display_list_fetch tests passed");
