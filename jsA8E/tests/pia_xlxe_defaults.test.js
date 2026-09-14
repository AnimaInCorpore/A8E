/* global __dirname, console, require */

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadScript(context, relativePath) {
  const filename = path.join(__dirname, "..", relativePath);
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename: filename });
}

function makeContext() {
  const context = {
    console: console,
    Uint8Array: Uint8Array,
    Uint16Array: Uint16Array,
    Uint32Array: Uint32Array,
    Int16Array: Int16Array,
    Number: Number,
    Math: Math,
    Object: Object,
  };
  context.window = context;
  vm.createContext(context);
  return context;
}

function testXlXeCartridgeSenseDefault() {
  const context = makeContext();
  loadScript(context, "js/core/hw.js");
  loadScript(context, "js/core/state.js");
  const hw = context.A8EHw.createApi();
  const state = context.A8EState.createApi({
    CPU: {},
    CYCLE_NEVER: Number.POSITIVE_INFINITY,
    CYCLES_PER_LINE: hw.CYCLES_PER_LINE,
    CYCLES_PER_FRAME: hw.CYCLES_PER_LINE * hw.LINES_PER_SCREEN_PAL,
    IO_INIT_VALUES: hw.IO_INIT_VALUES,
  });
  const trig3Default = hw.IO_INIT_VALUES.find(function (entry) {
    return entry.addr === hw.IO_COLPM1_TRIG3;
  });
  const io = state.makeIoData({});

  assert.equal(trig3Default.read, 0);
  assert.equal(io.trigPhysical[2], 1);
  assert.equal(io.trigPhysical[3], 0);
  assert.equal(io.trigLatched[3], 0);
}

function testPortBDirectionAndPullupsDriveMmuValue() {
  const context = makeContext();
  loadScript(context, "js/core/io.js");
  const IO_PORTB = 0xd301;
  const IO_PBCTL = 0xd303;
  const mapChanges = [];
  const CPU = {
    setRam: function () {},
    setRom: function () {},
  };
  const ioAccess = context.A8EIo.createApi({
    CPU: CPU,
    CYCLE_NEVER: Number.POSITIVE_INFINITY,
    CYCLES_PER_LINE: 114,
    IO_PORTB: IO_PORTB,
    IO_PBCTL: IO_PBCTL,
  }).ioAccess;
  const ctx = {
    accessAddress: IO_PORTB,
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {
      valuePortB: 0,
      outputPortB: 0,
      memoryExpansion: null,
      memoryExpansionSync: function (_ctx, oldValue, newValue) {
        mapChanges.push([oldValue, newValue]);
      },
    },
  };
  ctx.ram[IO_PORTB] = 0xff;
  ctx.sram[IO_PORTB] = 0xff;

  // DDRB mode: changing the output latch is impossible and all input bits
  // remain high through the XL/XE pull-ups.
  ioAccess(ctx, 0x00);
  assert.equal(ctx.sram[IO_PORTB], 0xff);

  // ORB mode: a low latch still cannot pull down bits configured as inputs.
  ctx.accessAddress = IO_PBCTL;
  ioAccess(ctx, 0x3c);
  ctx.accessAddress = IO_PORTB;
  ioAccess(ctx, 0x00);
  assert.equal(ctx.sram[IO_PORTB], 0xff);

  // Return to DDRB mode and enable bits 0-1 as outputs. Their low ORB values
  // now take effect immediately; the remaining input bits stay pulled high.
  ctx.accessAddress = IO_PBCTL;
  ioAccess(ctx, 0x38);
  ctx.accessAddress = IO_PORTB;
  ioAccess(ctx, 0x03);
  assert.equal(ctx.sram[IO_PORTB], 0xfc);
  assert.deepEqual(mapChanges.at(-1), [0xff, 0xfc]);
}

testXlXeCartridgeSenseDefault();
testPortBDirectionAndPullupsDriveMmuValue();
console.log("pia_xlxe_defaults.test.js passed");
