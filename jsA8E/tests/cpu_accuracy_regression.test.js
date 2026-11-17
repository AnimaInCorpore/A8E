"use strict";

// 6502 accuracy regressions: read-modify-write flags on ROM/I-O, cycle table
// entries, and the SHA/SHX/SHY/TAS high-byte AND (AHRM 3.5).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const FLAG_C = 0x01;
const FLAG_Z = 0x02;
const FLAG_N = 0x80;

function loadCpuApi() {
  const context = {
    console: console,
    Math: Math,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Boolean: Boolean,
    JSON: JSON,
    Uint8Array: Uint8Array,
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const name of ["cpu_tables.js", "cpu.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "core", name), "utf8");
    vm.runInContext(source, context, { filename: name });
  }
  return context.window.A8E6502;
}

const cpuApi = loadCpuApi();

// Runs one instruction at $2000 and returns the context.
function runOne(bytes, init, setup) {
  const ctx = cpuApi.makeContext();
  const state = init || {};
  ctx.cpu.pc = 0x2000;
  ctx.cpu.a = state.a | 0;
  ctx.cpu.x = state.x | 0;
  ctx.cpu.y = state.y | 0;
  ctx.cpu.sp = state.sp != null ? state.sp : 0xfd;
  ctx.cpu.ps = state.ps | 0;
  bytes.forEach(function (b, i) {
    ctx.ram[0x2000 + i] = b;
  });
  if (setup) setup(ctx);
  cpuApi.executeOne(ctx);
  return ctx;
}

function romAt(addr, value) {
  return function (ctx) {
    ctx.ram[addr] = value;
    cpuApi.setRom(ctx, addr, addr);
  };
}

function testRmwFlagsOnRomUseComputedValue() {
  // INC $E000 with ROM $00: computed $01 -> Z and N clear, ROM unchanged.
  let ctx = runOne([0xee, 0x00, 0xe0], { ps: FLAG_Z }, romAt(0xe000, 0x00));
  assert.equal(ctx.ram[0xe000], 0x00, "INC must not change ROM");
  assert.equal(ctx.cpu.ps & (FLAG_Z | FLAG_N), 0, "INC ROM $00 should clear Z and N");

  // DEC $E000 with ROM $00: computed $FF -> N set, Z clear.
  ctx = runOne([0xce, 0x00, 0xe0], {}, romAt(0xe000, 0x00));
  assert.equal(ctx.cpu.ps & (FLAG_Z | FLAG_N), FLAG_N, "DEC ROM $00 should set N only");

  // ASL $E000 with ROM $40: computed $80 -> N set.
  ctx = runOne([0x0e, 0x00, 0xe0], {}, romAt(0xe000, 0x40));
  assert.equal(ctx.cpu.ps & (FLAG_Z | FLAG_N | FLAG_C), FLAG_N, "ASL ROM $40 flags");
}

function testUndocumentedRmwOnRomUseComputedValue() {
  // SLO: ROM $40 -> $80, A = $00 | $80.
  let ctx = runOne([0x0f, 0x00, 0xe0], { a: 0x00 }, romAt(0xe000, 0x40));
  assert.equal(ctx.cpu.a, 0x80, "SLO should OR the shifted value");

  // RLA: ROM $40 -> $80, A = $FF & $80.
  ctx = runOne([0x2f, 0x00, 0xe0], { a: 0xff }, romAt(0xe000, 0x40));
  assert.equal(ctx.cpu.a, 0x80, "RLA should AND the rotated value");

  // SRE: ROM $02 -> $01, A = $00 ^ $01.
  ctx = runOne([0x4f, 0x00, 0xe0], { a: 0x00 }, romAt(0xe000, 0x02));
  assert.equal(ctx.cpu.a, 0x01, "SRE should EOR the shifted value");

  // RRA: ROM $02 -> $01, A = $10 + $01.
  ctx = runOne([0x6f, 0x00, 0xe0], { a: 0x10 }, romAt(0xe000, 0x02));
  assert.equal(ctx.cpu.a, 0x11, "RRA should add the rotated value");

  // ISC: ROM $FF -> $00, A = $10 - $00 (carry set).
  ctx = runOne([0xef, 0x00, 0xe0], { a: 0x10, ps: FLAG_C }, romAt(0xe000, 0xff));
  assert.equal(ctx.cpu.a, 0x10, "ISC should subtract the incremented value");

  // DCP: ROM $01 -> $00, CMP $00 with A = $00 -> Z and C set.
  ctx = runOne([0xcf, 0x00, 0xe0], { a: 0x00 }, romAt(0xe000, 0x01));
  assert.equal(ctx.cpu.ps & (FLAG_Z | FLAG_C), FLAG_Z | FLAG_C, "DCP should compare the decremented value");
}

function testRmwOnIoUsesComputedValue() {
  // A register that always reads $FF (e.g. a status register under a
  // write-only control register): flags must come from the written $00.
  const writes = [];
  const ctx = runOne([0xee, 0x00, 0xd2], {}, function (c) {
    cpuApi.setIo(c, 0xd200, function (cc, value) {
      if (value != null) writes.push(value);
      return 0xff;
    });
  });
  assert.deepEqual(writes, [0x00], "INC should write the incremented read value");
  assert.equal(ctx.cpu.ps & (FLAG_Z | FLAG_N), FLAG_Z, "INC flags should come from $00");
}

function cyclesOf(bytes, init) {
  return runOne(bytes, init).cycleCounter;
}

function testCycleTable() {
  assert.equal(cyclesOf([0x9c, 0x00, 0x30], { x: 0x01 }), 5, "SHY abs,X should take 5 cycles");
  assert.equal(cyclesOf([0x0c, 0xff, 0x30]), 4, "NOP abs should take 4 cycles");
  for (const opcode of [0x1c, 0x3c, 0x5c, 0x7c, 0xdc, 0xfc]) {
    assert.equal(cyclesOf([opcode, 0x10, 0x30], { x: 0x01 }), 4, "NOP abs,X $" + opcode.toString(16));
    assert.equal(
      cyclesOf([opcode, 0xff, 0x30], { x: 0x01 }),
      5,
      "NOP abs,X $" + opcode.toString(16) + " should add the page-cross cycle",
    );
  }
}

function testShaTasUseBaseHighByte() {
  // SHA abs,Y without page crossing: value = A & X & ($30 + 1).
  let ctx = runOne([0x9f, 0x00, 0x30], { a: 0xff, x: 0xff, y: 0x05 });
  assert.equal(ctx.ram[0x3005], 0x31, "SHA abs,Y should AND with base high + 1");

  // SHA abs,Y crossing a page: base $30F0 + $20, value $0F & $31 = $01
  // replaces the high byte -> stored at $0110.
  ctx = runOne([0x9f, 0xf0, 0x30], { a: 0x0f, x: 0xff, y: 0x20 });
  assert.equal(ctx.ram[0x0110], 0x01, "SHA abs,Y page cross should store at the ANDed high byte");
  assert.equal(ctx.ram[0x3110], 0x00, "SHA abs,Y page cross must not store at the indexed address");

  // SHA (zp),Y uses the pointer's high byte, not the indexed one.
  ctx = runOne([0x93, 0x80], { a: 0x0f, x: 0x0f, y: 0x20 }, function (c) {
    c.ram[0x80] = 0xf0;
    c.ram[0x81] = 0x30;
  });
  assert.equal(ctx.ram[0x0110], 0x01, "SHA (zp),Y should AND with the pointer high + 1");

  // TAS/SHS: S = A & X, then the same store.
  ctx = runOne([0x9b, 0xf0, 0x30], { a: 0x0f, x: 0xff, y: 0x20 });
  assert.equal(ctx.cpu.sp, 0x0f, "TAS should set S = A & X");
  assert.equal(ctx.ram[0x0110], 0x01, "TAS page cross should store at the ANDed high byte");
}

function testGlitchedStoreDispatchesOnFinalAddress() {
  // SHX abs,Y: base $E0F0 + $20 = $E110 (RAM), value $C1 & $E1 = $C1 moves
  // the store to $C110, which is an I/O register here.
  const writes = [];
  let ctx = runOne([0x9e, 0xf0, 0xe0], { x: 0xc1, y: 0x20 }, function (c) {
    cpuApi.setIo(c, 0xc110, function (cc, value) {
      if (value != null) writes.push([cc.accessAddress, value]);
      return 0;
    });
  });
  assert.deepEqual(writes, [[0xc110, 0xc1]], "SHX should reach the I/O handler at the glitched address");
  assert.equal(ctx.ram[0xe110], 0x00, "SHX must not store at the indexed address");

  // Same for ROM: the glitched store into ROM is ignored.
  ctx = runOne([0x9c, 0xf0, 0xe0], { y: 0xc1, x: 0x20 }, romAt(0xc110, 0x55));
  assert.equal(ctx.ram[0xc110], 0x55, "SHY into ROM at the glitched address must be ignored");
}

testRmwFlagsOnRomUseComputedValue();
testUndocumentedRmwOnRomUseComputedValue();
testRmwOnIoUsesComputedValue();
testCycleTable();
testShaTasUseBaseHighByte();
testGlitchedStoreDispatchesOnFinalAddress();
