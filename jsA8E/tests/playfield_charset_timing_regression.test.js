/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const IO_CHACTL = 0xd401;
const IO_CHBASE = 0xd409;
const IO_COLBK = 0xd01a;
const IO_COLPF0 = 0xd016;
const IO_COLPF1 = 0xd017;
const IO_COLPF2 = 0xd018;
const IO_COLPF3 = 0xd019;
const IO_PRIOR = 0xd01b;

function createContext() {
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
  return context;
}

function loadScript(context, filename) {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "playfield", filename),
    "utf8",
  );
  vm.runInContext(source, context, { filename: filename });
}

function createBaseApi(context) {
  loadScript(context, "renderer_base.js");
  return context.window.A8EPlayfieldRendererBase.createApi({
    CPU: {
      executeOne: function () {},
    },
    PIXELS_PER_LINE: 456,
    CYCLES_PER_LINE: 114,
    LINES_PER_SCREEN_PAL: 312,
    IO_COLBK: IO_COLBK,
    IO_COLPM0_TRIG2: 0xd012,
    IO_CHBASE: IO_CHBASE,
    IO_DMACTL: 0xd400,
    IO_HSCROL: 0xd404,
    IO_PRIOR: IO_PRIOR,
    IO_VCOUNT: 0xd40b,
    PRIO_BKG: 0x00,
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

function makeCtx(bytesPerLine) {
  return {
    cycleCounter: 0,
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {
      clock: 0,
      nextDisplayListLine: 8,
      firstRowScanline: false,
      video: {
        currentDisplayLine: 0,
        verticalScrollOffset: 0,
      },
      drawLine: {
        bytesPerLine: bytesPerLine,
        destIndex: 0,
        displayMemoryAddress: 0,
      },
      videoOut: {
        pixels: new Uint8Array(512),
        priority: new Uint16Array(512),
      },
    },
  };
}

function createModeApi(context, fileName, baseApi, overrides) {
  loadScript(context, fileName);

  const defaults = {
    Util: {
      fixedAdd: function (value, mask, add) {
        return (value & ~mask) | ((value + add) & mask);
      },
    },
    IO_CHACTL: IO_CHACTL,
    IO_CHBASE: IO_CHBASE,
    IO_COLBK: IO_COLBK,
    IO_COLPF0: IO_COLPF0,
    IO_COLPF1: IO_COLPF1,
    IO_COLPF2: IO_COLPF2,
    IO_COLPF3: IO_COLPF3,
    IO_PRIOR: IO_PRIOR,
    PRIO_BKG: 0x00,
    PRIO_PF1: 0x02,
    PRIO_PF2: 0x04,
    SCRATCH_GTIA_COLOR_TABLE: new Uint8Array(16),
    SCRATCH_COLOR_TABLE_A: new Uint8Array(4),
    SCRATCH_COLOR_TABLE_B: new Uint8Array(4),
    PRIORITY_TABLE_BKG_PF012: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
    PRIORITY_TABLE_BKG_PF013: new Uint8Array([0x00, 0x01, 0x02, 0x03]),
    PRIORITY_TABLE_PF0123: new Uint8Array([0x01, 0x02, 0x04, 0x08]),
    fillGtiaColorTable: function () {},
    fillBkgPf012ColorTable: function () {},
    decodeTextModeCharacter: function (ch) {
      return ch & 0xff;
    },
    currentCharacterBaseRegister: baseApi.currentCharacterBaseRegister,
    clockAction: function (ctx) {
      ctx.ioData.clock = (ctx.ioData.clock | 0) + 1;
    },
    fetchCharacterRow8: function () {
      return 0;
    },
    fetchCharacterRow10: function () {
      return 0;
    },
    fetchCharacterRow16: function () {
      return 0;
    },
    stealDma: function (ctx, cycles) {
      ctx.cycleCounter += cycles | 0;
    },
  };

  return context.window[fileName === "mode_2_3.js"
    ? "A8EPlayfieldMode23"
    : fileName === "mode_4_5.js"
      ? "A8EPlayfieldMode45"
      : "A8EPlayfieldMode67"
  ].createApi(Object.assign({}, defaults, overrides || {}));
}

function testCharacterRowReflectsVertically() {
  const context = createContext();
  const baseApi = createBaseApi(context);
  const ram = new Uint8Array(0x10000);
  const chBase = 0x2000;

  for (let row = 0; row < 8; row++) {
    ram[chBase + row] = 0x10 + row;
  }

  assert.equal(baseApi.fetchCharacterRow8(ram, chBase, 0, 2, 0x00), 0x12);
  assert.equal(baseApi.fetchCharacterRow8(ram, chBase, 0, 2, 0x04), 0x15);
  assert.equal(baseApi.fetchCharacterRow16(ram, chBase, 0, 6, 0x00), 0x13);
  assert.equal(baseApi.fetchCharacterRow16(ram, chBase, 0, 6, 0x04), 0x14);
}

function testMode23UsesDelayedChbaseAndChactlBit2() {
  const context = createContext();
  const baseApi = createBaseApi(context);
  const captures = {
    mode2: [],
    mode3: [],
  };

  const mode23 = createModeApi(context, "mode_2_3.js", baseApi, {
    clockAction: function (ctx) {
      if (ctx.ioData.clock === 1) {
        ctx.sram[IO_CHBASE] = 0x20;
        ctx.sram[IO_CHACTL] = 0x04;
      }
      ctx.ioData.clock = (ctx.ioData.clock | 0) + 1;
    },
    fetchCharacterRow8: function (ram, chBase, ch, row, chactl) {
      captures.mode2.push({ chBase: chBase, chactl: chactl });
      return 0;
    },
    fetchCharacterRow10: function (ram, chBase, ch, row, chactl) {
      captures.mode3.push({ chBase: chBase, chactl: chactl });
      return 0;
    },
  });

  const ctx2 = makeCtx(4);
  ctx2.sram[IO_CHBASE] = 0x10;
  ctx2.sram[IO_CHACTL] = 0x00;
  ctx2.sram[IO_PRIOR] = 0x00;
  ctx2.ram[0] = 0x00;
  ctx2.ram[1] = 0x00;
  ctx2.ram[2] = 0x00;
  ctx2.ram[3] = 0x00;

  mode23.drawLineMode2(ctx2);

  assert.deepEqual(
    captures.mode2.map(function (entry) {
      return entry.chBase;
    }),
    [0x1000, 0x1000, 0x2000, 0x2000],
  );
  assert.deepEqual(
    captures.mode2.map(function (entry) {
      return entry.chactl & 0x04;
    }),
    [0x00, 0x04, 0x04, 0x04],
  );

  const ctx3 = makeCtx(4);
  ctx3.sram[IO_CHBASE] = 0x10;
  ctx3.sram[IO_CHACTL] = 0x00;
  ctx3.sram[IO_PRIOR] = 0x00;
  ctx3.ram[0] = 0x00;
  ctx3.ram[1] = 0x00;
  ctx3.ram[2] = 0x00;
  ctx3.ram[3] = 0x00;

  mode23.drawLineMode3(ctx3);

  assert.deepEqual(
    captures.mode3.map(function (entry) {
      return entry.chBase;
    }),
    [0x1000, 0x1000, 0x2000, 0x2000],
  );
  assert.deepEqual(
    captures.mode3.map(function (entry) {
      return entry.chactl & 0x04;
    }),
    [0x00, 0x04, 0x04, 0x04],
  );
}

function testMode45MasksChbaseTo1kAndPassesReflectBit() {
  const context = createContext();
  const baseApi = createBaseApi(context);
  const captures = {
    mode4: [],
    mode5: [],
  };

  const mode45 = createModeApi(context, "mode_4_5.js", baseApi, {
    fetchCharacterRow8: function (ram, chBase, ch, row, chactl) {
      captures.mode4.push({ chBase: chBase, chactl: chactl });
      return 0;
    },
    fetchCharacterRow16: function (ram, chBase, ch, row, chactl) {
      captures.mode5.push({ chBase: chBase, chactl: chactl });
      return 0;
    },
  });

  const ctx4 = makeCtx(1);
  ctx4.sram[IO_CHBASE] = 0xff;
  ctx4.sram[IO_CHACTL] = 0x04;
  ctx4.ram[0] = 0x00;

  mode45.drawLineMode4(ctx4);
  assert.deepEqual(captures.mode4, [{ chBase: 0xfc00, chactl: 0x04 }]);

  const ctx5 = makeCtx(1);
  ctx5.sram[IO_CHBASE] = 0xff;
  ctx5.sram[IO_CHACTL] = 0x04;
  ctx5.ram[0] = 0x00;

  mode45.drawLineMode5(ctx5);
  assert.deepEqual(captures.mode5, [{ chBase: 0xfc00, chactl: 0x04 }]);
}

function testMode67MasksChbaseTo512AndPassesReflectBit() {
  const context = createContext();
  const baseApi = createBaseApi(context);
  const captures = {
    mode6: [],
    mode7: [],
  };

  const mode67 = createModeApi(context, "mode_6_7.js", baseApi, {
    fetchCharacterRow8: function (ram, chBase, ch, row, chactl) {
      captures.mode6.push({ chBase: chBase, chactl: chactl });
      return 0;
    },
    fetchCharacterRow16: function (ram, chBase, ch, row, chactl) {
      captures.mode7.push({ chBase: chBase, chactl: chactl });
      return 0;
    },
  });

  const ctx6 = makeCtx(1);
  ctx6.sram[IO_CHBASE] = 0xff;
  ctx6.sram[IO_CHACTL] = 0x04;
  ctx6.ram[0] = 0x00;

  mode67.drawLineMode6(ctx6);
  assert.deepEqual(captures.mode6, [{ chBase: 0xfe00, chactl: 0x04 }]);

  const ctx7 = makeCtx(1);
  ctx7.sram[IO_CHBASE] = 0xff;
  ctx7.sram[IO_CHACTL] = 0x04;
  ctx7.ram[0] = 0x00;

  mode67.drawLineMode7(ctx7);
  assert.deepEqual(captures.mode7, [{ chBase: 0xfe00, chactl: 0x04 }]);
}

testCharacterRowReflectsVertically();
testMode23UsesDelayedChbaseAndChactlBit2();
testMode45MasksChbaseTo1kAndPassesReflectBit();
testMode67MasksChbaseTo512AndPassesReflectBit();
console.log("playfield_charset_timing_regression tests passed");
