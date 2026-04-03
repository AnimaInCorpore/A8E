/* global __dirname, console, require */

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
  const cpuLog = {
    nmiCalls: 0,
  };
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
      nmi: function () {
        cpuLog.nmiCalls++;
      },
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
    ANTIC_MODE_INFO: new Array(16).fill(null).map(function () {
      return { lines: 1, ppb: 8 };
    }),
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
  return {
    api: api,
    cpuLog: cpuLog,
  };
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
        verticalScrollOffset: 0,
      },
      displayListFetchCycle: 0,
      clock: 0,
      inDrawLine: false,
      dliCycle: CYCLE_NEVER,
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
      nmiTiming: {
        enabledByCycle7: 0,
        enabledByCycle8: 0,
        enabledOnCycle7Mask: 0,
      },
      drawLine: {
        playerMissileInterleaved: false,
        playerMissileClockActive: false,
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

function testJvbWithDliUsesWaitForVblSemantics() {
  const { api } = loadAnticApi();
  const ctx = makeContext();

  ctx.sram[IO_DMACTL] = 0x20;
  ctx.ioData.video.currentDisplayLine = 20;
  ctx.ioData.nextDisplayListLine = 20;
  ctx.ioData.displayListAddress = 0x0400;
  ctx.ram[0x0400] = 0xc1;
  ctx.ram[0x0401] = 0x34;
  ctx.ram[0x0402] = 0x12;

  runOneScanline(api, ctx);

  assert.equal(ctx.ioData.currentDisplayListCommand, 0xc1);
  assert.equal(ctx.ioData.displayListAddress, 0x1234);
  assert.equal(ctx.ioData.nextDisplayListLine, 8);
  assert.equal(ctx.ioData.displayListFetchCycle, CYCLES_PER_LINE);
  assert.equal(ctx.ioData.dliCycle, CYCLES_PER_LINE + 8);
}

function testNmistDliPersistsOutsideVblank() {
  const { api } = loadAnticApi();
  const ctx = makeContext();

  ctx.sram[IO_DMACTL] = 0x20;
  ctx.ioData.video.currentDisplayLine = 100;
  ctx.ioData.nextDisplayListLine = 100;
  ctx.ioData.displayListAddress = 0x0500;
  ctx.ram[0x0500] = 0x01;
  ctx.ram[0x0501] = 0x00;
  ctx.ram[0x0502] = 0x04;
  ctx.ram[IO_NMIRES_NMIST] = NMI_DLI;

  runOneScanline(api, ctx);

  assert.equal(ctx.ioData.video.currentDisplayLine, 101);
  assert.notEqual(ctx.ram[IO_NMIRES_NMIST] & NMI_DLI, 0);
}

function testNmistDliClearsAtVblankStart() {
  const { api } = loadAnticApi();
  const ctx = makeContext();

  ctx.sram[IO_DMACTL] = 0x20;
  ctx.ioData.video.currentDisplayLine = 247;
  ctx.ioData.nextDisplayListLine = 247;
  ctx.ioData.displayListAddress = 0x0600;
  ctx.ram[0x0600] = 0x01;
  ctx.ram[0x0601] = 0x00;
  ctx.ram[0x0602] = 0x04;
  ctx.ram[IO_NMIRES_NMIST] = NMI_DLI;

  runOneScanline(api, ctx);

  assert.equal(ctx.ioData.video.currentDisplayLine, 248);
  assert.equal(ctx.ram[IO_NMIRES_NMIST] & NMI_DLI, 0);
}

function testDliTriggersAtCycle8() {
  const { api, cpuLog } = loadAnticApi();
  const ctx = makeContext();

  ctx.ioData.displayListFetchCycle = CYCLE_NEVER;
  ctx.ioData.clock = 7;
  ctx.ioData.dliCycle = 8;
  ctx.sram[IO_NMIEN] = NMI_DLI;
  ctx.ioData.nmiTiming.enabledByCycle7 = NMI_DLI;
  ctx.ioData.nmiTiming.enabledByCycle8 = NMI_DLI;

  api.ioCycleTimedEvent(ctx);
  assert.equal(cpuLog.nmiCalls, 0, "DLI should not trigger before cycle 8");

  ctx.ioData.clock = 8;
  api.ioCycleTimedEvent(ctx);
  assert.equal(cpuLog.nmiCalls, 1, "DLI should trigger on cycle 8");
  assert.equal(ctx.ioData.dliCycle, CYCLE_NEVER);
  assert.notEqual(ctx.ram[IO_NMIRES_NMIST] & NMI_DLI, 0);
}

function testVbiTriggersAtLine248() {
  const { api, cpuLog } = loadAnticApi();
  const ctx = makeContext();

  ctx.sram[IO_DMACTL] = 0x20;
  ctx.sram[IO_NMIEN] = NMI_VBI;
  ctx.ioData.video.currentDisplayLine = 247;
  ctx.ioData.nextDisplayListLine = 247;
  ctx.ioData.displayListAddress = 0x0700;
  ctx.ram[0x0700] = 0x01;
  ctx.ram[0x0701] = 0x00;
  ctx.ram[0x0702] = 0x04;

  runOneScanline(api, ctx);

  assert.equal(ctx.ioData.video.currentDisplayLine, 248);
  assert.equal(cpuLog.nmiCalls, 1, "VBI should trigger at the start of line 248");
  assert.notEqual(ctx.ram[IO_NMIRES_NMIST] & NMI_VBI, 0);
}

function testCycle7EnableDelaysDliByOneCycle() {
  const { api, cpuLog } = loadAnticApi();
  const ctx = makeContext();

  ctx.ioData.displayListFetchCycle = CYCLE_NEVER;
  ctx.ioData.clock = 8;
  ctx.ioData.dliCycle = 8;
  ctx.ioData.nmiTiming.enabledByCycle7 = NMI_DLI;
  ctx.ioData.nmiTiming.enabledByCycle8 = NMI_DLI;
  ctx.ioData.nmiTiming.enabledOnCycle7Mask = NMI_DLI;

  api.ioCycleTimedEvent(ctx);
  assert.equal(cpuLog.nmiCalls, 0, "cycle-7 enable should delay DLI by one cycle");
  assert.equal(ctx.ioData.dliCycle, 9, "DLI should be rescheduled to cycle 9");
  assert.notEqual(ctx.ram[IO_NMIRES_NMIST] & NMI_DLI, 0);

  ctx.ioData.clock = 9;
  api.ioCycleTimedEvent(ctx);
  assert.equal(cpuLog.nmiCalls, 1, "delayed DLI should trigger on cycle 9");
  assert.equal(ctx.ioData.dliCycle, CYCLE_NEVER);
}

function testCycle8EnableIsTooLateForCurrentDli() {
  const { api, cpuLog } = loadAnticApi();
  const ctx = makeContext();

  ctx.ioData.displayListFetchCycle = CYCLE_NEVER;
  ctx.ioData.clock = 8;
  ctx.ioData.dliCycle = 8;
  ctx.ioData.nmiTiming.enabledByCycle7 = 0;
  ctx.ioData.nmiTiming.enabledByCycle8 = NMI_DLI;
  ctx.ioData.nmiTiming.enabledOnCycle7Mask = 0;

  api.ioCycleTimedEvent(ctx);
  assert.equal(cpuLog.nmiCalls, 0, "cycle-8 enable should not trigger current-line DLI");
  assert.equal(ctx.ioData.dliCycle, CYCLE_NEVER);
  assert.notEqual(ctx.ram[IO_NMIRES_NMIST] & NMI_DLI, 0);
}

function testCycle8DisableSuppressesCurrentDli() {
  const { api, cpuLog } = loadAnticApi();
  const ctx = makeContext();

  ctx.ioData.displayListFetchCycle = CYCLE_NEVER;
  ctx.ioData.clock = 8;
  ctx.ioData.dliCycle = 8;
  ctx.ioData.nmiTiming.enabledByCycle7 = NMI_DLI;
  ctx.ioData.nmiTiming.enabledByCycle8 = 0;
  ctx.ioData.nmiTiming.enabledOnCycle7Mask = 0;

  api.ioCycleTimedEvent(ctx);
  assert.equal(cpuLog.nmiCalls, 0, "cycle-8 disable should suppress current-line DLI");
  assert.equal(ctx.ioData.dliCycle, CYCLE_NEVER);
  assert.notEqual(ctx.ram[IO_NMIRES_NMIST] & NMI_DLI, 0);
}

testJvbWithDliUsesWaitForVblSemantics();
testNmistDliPersistsOutsideVblank();
testNmistDliClearsAtVblankStart();
testDliTriggersAtCycle8();
testVbiTriggersAtLine248();
testCycle7EnableDelaysDliByOneCycle();
testCycle8EnableIsTooLateForCurrentDli();
testCycle8DisableSuppressesCurrentDli();
console.log("antic_display_list_nmi tests passed");
