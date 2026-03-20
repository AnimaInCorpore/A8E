/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const IO_COLBK = 0xd01a;
const IO_COLPF0 = 0xd016;
const IO_COLPF1 = 0xd017;
const IO_COLPF2 = 0xd018;
const IO_PRIOR = 0xd01b;

function loadMode8FApi(overrides) {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "playfield", "mode_8_f.js"),
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
  vm.runInContext(source, context, { filename: "mode_8_f.js" });

  const defaults = {
    Util: {
      fixedAdd: function (value, mask, add) {
        return (value & ~mask) | ((value + add) & mask);
      },
    },
    IO_COLBK: IO_COLBK,
    IO_COLPF0: IO_COLPF0,
    IO_COLPF1: IO_COLPF1,
    IO_COLPF2: IO_COLPF2,
    IO_PRIOR: IO_PRIOR,
    PRIO_BKG: 0x00,
    PRIO_PF0: 0x01,
    PRIO_PF1: 0x02,
    PRIO_PF2: 0x04,
    PRIO_PF3: 0x08,
    PRIO_M10_PM0: 0x100,
    PRIO_M10_PM1: 0x200,
    PRIO_M10_PM2: 0x400,
    PRIO_M10_PM3: 0x800,
    SCRATCH_GTIA_COLOR_TABLE: new Uint8Array(16),
    SCRATCH_COLOR_TABLE_A: new Uint8Array(4),
    fillBkgPf012ColorTable: function () {},
    fillGtiaColorTable: function () {},
    PRIORITY_TABLE_BKG_PF012: new Uint8Array([0x00, 0x01, 0x02, 0x04]),
    clockAction: function () {},
    stealDma: function (ctx, cycles) {
      ctx.cycleCounter += cycles | 0;
    },
  };

  const cfg = Object.assign({}, defaults, overrides || {});
  return context.window.A8EPlayfieldMode8F.createApi(cfg);
}

function createCtx() {
  return {
    cycleCounter: 0,
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {
      drawLine: {
        bytesPerLine: 1,
        destIndex: 0,
        displayMemoryAddress: 0,
      },
      videoOut: {
        pixels: new Uint8Array(64),
        priority: new Uint16Array(64),
      },
    },
  };
}

function testModeFPriorMode0WidthIsNotDoubled() {
  const api = loadMode8FApi();
  const ctx = createCtx();

  ctx.sram[IO_PRIOR] = 0x00;
  ctx.sram[IO_COLPF1] = 0x0b;
  ctx.sram[IO_COLPF2] = 0xa0;
  ctx.ram[0] = 0x00;
  ctx.ioData.videoOut.pixels.fill(0xee);
  ctx.ioData.videoOut.priority.fill(0xeeee);

  api.drawLineModeF(ctx);

  assert.equal(ctx.ioData.videoOut.pixels[8], 0xee);
  assert.equal(ctx.ioData.videoOut.priority[8], 0xeeee);
}

testModeFPriorMode0WidthIsNotDoubled();
console.log("playfield_mode_8_f_rendering tests passed");
