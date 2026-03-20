/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const IO_CHACTL = 0xd401;
const IO_CHBASE = 0xd409;
const IO_COLBK = 0xd01a;
const IO_COLPF1 = 0xd017;
const IO_COLPF2 = 0xd018;
const IO_PRIOR = 0xd01b;

function loadMode23Api(overrides) {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "playfield", "mode_2_3.js"),
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
  vm.runInContext(source, context, { filename: "mode_2_3.js" });

  const defaults = {
    Util: {
      fixedAdd: function (value, mask, add) {
        return (value & ~mask) | ((value + add) & mask);
      },
    },
    IO_CHACTL: IO_CHACTL,
    IO_CHBASE: IO_CHBASE,
    IO_COLBK: IO_COLBK,
    IO_COLPF1: IO_COLPF1,
    IO_COLPF2: IO_COLPF2,
    IO_PRIOR: IO_PRIOR,
    PRIO_BKG: 0,
    PRIO_PF1: 2,
    PRIO_PF2: 4,
    SCRATCH_GTIA_COLOR_TABLE: new Uint8Array(16),
    fillGtiaColorTable: function (_, colorTable) {
      for (let i = 0; i < colorTable.length; i++) {
        colorTable[i] = i & 0xff;
      }
    },
    decodeTextModeCharacter: function (ch) {
      return ch & 0xff;
    },
    stealDma: function (ctx, cycles) {
      ctx.cycleCounter += cycles | 0;
    },
    clockAction: function () {},
    fetchCharacterRow8: function () {
      return 0;
    },
    fetchCharacterRow10: function () {
      return 0;
    },
  };

  const cfg = Object.assign({}, defaults, overrides || {});
  return context.window.A8EPlayfieldMode23.createApi(cfg);
}

function createCtx() {
  return {
    cycleCounter: 0,
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {
      nextDisplayListLine: 8,
      firstRowScanline: false,
      video: {
        currentDisplayLine: 0,
        verticalScrollOffset: 0,
      },
      drawLine: {
        bytesPerLine: 1,
        destIndex: 0,
        displayMemoryAddress: 0,
      },
      videoOut: {
        pixels: new Uint8Array(64),
        priority: new Uint8Array(64),
      },
    },
  };
}

function testMode2GtiaColorTableOnlyWhenPriorMode2() {
  let fillCount = 0;
  let clockCount = 0;

  const api = loadMode23Api({
    fillGtiaColorTable: function (_, colorTable) {
      fillCount++;
      for (let i = 0; i < colorTable.length; i++) {
        colorTable[i] = i & 0xff;
      }
    },
    clockAction: function (ctx) {
      clockCount++;
      if (clockCount === 1) {
        ctx.sram[IO_PRIOR] = 0x80;
      }
    },
    fetchCharacterRow8: function () {
      return 0xf1;
    },
  });

  const ctx = createCtx();
  ctx.sram[IO_PRIOR] = 0x00;
  ctx.sram[IO_COLPF1] = 0x0f;
  ctx.sram[IO_COLPF2] = 0xa0;
  ctx.sram[IO_COLBK] = 0x20;
  ctx.ram[0] = 0x00;

  api.drawLineMode2(ctx);

  assert.equal(fillCount, 1, "Mode 2 should rebuild GTIA table only in PRIOR mode 2");
}

function testMode2AndMode3UseSameChbaseMasking() {
  let mode2ChBase = -1;
  let mode3ChBase = -1;

  const api = loadMode23Api({
    fetchCharacterRow8: function (_, chBase) {
      mode2ChBase = chBase;
      return 0;
    },
    fetchCharacterRow10: function (_, chBase) {
      mode3ChBase = chBase;
      return 0;
    },
  });

  const expected = ((0xff << 8) & 0xfc00) & 0xffff;

  const ctx2 = createCtx();
  ctx2.sram[IO_CHBASE] = 0xff;
  ctx2.sram[IO_PRIOR] = 0x00;
  ctx2.ram[0] = 0x00;
  api.drawLineMode2(ctx2);

  const ctx3 = createCtx();
  ctx3.sram[IO_CHBASE] = 0xff;
  ctx3.sram[IO_PRIOR] = 0x00;
  ctx3.ram[0] = 0x00;
  api.drawLineMode3(ctx3);

  assert.equal(mode2ChBase, expected);
  assert.equal(mode3ChBase, expected);
  assert.equal(mode2ChBase, mode3ChBase);
}

function runPriorMode0Line(api, drawFnName, inverse) {
  const ctx = createCtx();
  ctx.sram[IO_PRIOR] = 0x00;
  ctx.sram[IO_COLPF1] = 0x0b;
  ctx.sram[IO_COLPF2] = 0xa0;
  ctx.ram[0] = inverse ? 0x80 : 0x00;

  api[drawFnName](ctx);

  return {
    pixels: Array.from(ctx.ioData.videoOut.pixels.slice(0, 4)),
    priorities: Array.from(ctx.ioData.videoOut.priority.slice(0, 4)),
  };
}

function testMode2Mode3Prior0OutputParity() {
  const api = loadMode23Api({
    fetchCharacterRow8: function () {
      return 0xa0;
    },
    fetchCharacterRow10: function () {
      return 0xa0;
    },
  });

  const mode2Normal = runPriorMode0Line(api, "drawLineMode2", false);
  const mode3Normal = runPriorMode0Line(api, "drawLineMode3", false);
  assert.deepEqual(mode2Normal, mode3Normal);

  const mode2Inverse = runPriorMode0Line(api, "drawLineMode2", true);
  const mode3Inverse = runPriorMode0Line(api, "drawLineMode3", true);
  assert.deepEqual(mode2Inverse, mode3Inverse);
}

function testMode2Mode3Prior0WidthIsNotDoubled() {
  const api = loadMode23Api({
    fetchCharacterRow8: function () {
      return 0xa0;
    },
    fetchCharacterRow10: function () {
      return 0xa0;
    },
  });

  function assertLineWidth(drawFnName) {
    const ctx = createCtx();
    ctx.ioData.drawLine.bytesPerLine = 1;
    ctx.sram[IO_PRIOR] = 0x00;
    ctx.sram[IO_COLPF1] = 0x0b;
    ctx.sram[IO_COLPF2] = 0xa0;
    ctx.ram[0] = 0x00;
    ctx.ioData.videoOut.pixels.fill(0xee);
    ctx.ioData.videoOut.priority.fill(0xee);

    api[drawFnName](ctx);

    assert.equal(
      ctx.ioData.videoOut.pixels[8],
      0xee,
      drawFnName + " should not write past the expected 8 pixels",
    );
    assert.equal(
      ctx.ioData.videoOut.priority[8],
      0xee,
      drawFnName + " should not write past the expected 8 pixels",
    );
  }

  assertLineWidth("drawLineMode2");
  assertLineWidth("drawLineMode3");
}

testMode2GtiaColorTableOnlyWhenPriorMode2();
testMode2AndMode3UseSameChbaseMasking();
testMode2Mode3Prior0OutputParity();
testMode2Mode3Prior0WidthIsNotDoubled();
console.log("playfield_mode_2_3_rendering tests passed");
