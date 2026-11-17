"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadCpuApi() {
  const cpuTablesSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "cpu_tables.js"),
    "utf8",
  );
  const cpuSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "cpu.js"),
    "utf8",
  );
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
  vm.runInContext(cpuTablesSource, context, { filename: "cpu_tables.js" });
  vm.runInContext(cpuSource, context, { filename: "cpu.js" });
  return context.window.A8E6502;
}

function makeContext() {
  const cpuApi = loadCpuApi();
  const ctx = cpuApi.makeContext();

  ctx.cpu.pc = 0x2000;
  ctx.cpu.sp = 0xff;
  ctx.cpu.ps = 0x00;
  ctx.ram[0x2000] = 0xea;

  return {
    cpuApi: cpuApi,
    ctx: ctx,
  };
}

function testPendingNmiConsumesOnlyInterruptEntryStep() {
  const { cpuApi, ctx } = makeContext();

  ctx.ram[0xfffa] = 0x34;
  ctx.ram[0xfffb] = 0x12;
  ctx.ram[0x1234] = 0xea;

  cpuApi.nmi(ctx);
  cpuApi.executeOne(ctx);

  assert.equal(ctx.cpu.pc, 0x1234, "NMI step should stop at the handler vector");
  assert.equal(ctx.cpu.sp, 0xfc, "NMI step should push PC/P onto the stack");
  assert.equal(ctx.cycleCounter, 7, "NMI entry should cost 7 cycles");
  assert.equal(ctx.nmiPending, 0, "NMI step should clear the pending edge");

  cpuApi.executeOne(ctx);
  assert.equal(ctx.cpu.pc, 0x1235, "handler opcode should execute on the next CPU step");
  assert.equal(ctx.cycleCounter, 9, "handler NOP should add its own 2 cycles");
}

// AHRM 3.4: the NMI is an edge-triggered one-time event independent of I, so a
// second NMI (a VBI during a long DLI) interrupts the running NMI handler.
function testNmiNestsInsideNmiHandler() {
  const { cpuApi, ctx } = makeContext();

  ctx.ram[0xfffa] = 0x00;
  ctx.ram[0xfffb] = 0x30;
  ctx.ram[0x3000] = 0xea;
  ctx.ram[0x3001] = 0xea;

  cpuApi.nmi(ctx);
  cpuApi.executeOne(ctx);
  cpuApi.executeOne(ctx);
  assert.equal(ctx.cpu.pc, 0x3001, "first NMI handler should be running");

  cpuApi.nmi(ctx);
  cpuApi.executeOne(ctx);
  assert.equal(ctx.cpu.pc, 0x3000, "second NMI should enter the handler again before RTI");
  assert.equal(ctx.cpu.sp, 0xf9, "nested NMI should push a second frame");
  assert.equal(ctx.ram[0x01fb], 0x01, "nested NMI should push the interrupted handler PC");
  assert.equal(ctx.nmiPending, 0, "nested NMI should consume its edge");

  // One edge is one NMI: the next step runs the handler, not a third entry.
  cpuApi.executeOne(ctx);
  assert.equal(ctx.cpu.pc, 0x3001, "a single edge must not be serviced twice");
}

// A handler that leaves without RTI (e.g. JMP back to the main loop) must not
// block later NMIs.
function testNmiHandlerWithoutRtiDoesNotBlockLaterNmis() {
  const { cpuApi, ctx } = makeContext();

  ctx.ram[0xfffa] = 0x00;
  ctx.ram[0xfffb] = 0x30;
  ctx.ram[0x3000] = 0x4c; // JMP $2000
  ctx.ram[0x3001] = 0x00;
  ctx.ram[0x3002] = 0x20;

  cpuApi.nmi(ctx);
  cpuApi.executeOne(ctx);
  cpuApi.executeOne(ctx);
  assert.equal(ctx.cpu.pc, 0x2000, "handler should jump back to the main loop");

  cpuApi.nmi(ctx);
  cpuApi.executeOne(ctx);
  assert.equal(ctx.cpu.pc, 0x3000, "a later NMI should still be serviced");
}

// AHRM 3.1: reset sets I but does not clear D on the NMOS 6502.
function testResetKeepsDecimalFlag() {
  const { cpuApi, ctx } = makeContext();

  ctx.ram[0xfffc] = 0x00;
  ctx.ram[0xfffd] = 0x40;
  ctx.cpu.ps = 0x08;
  cpuApi.reset(ctx);
  assert.equal(ctx.cpu.pc, 0x4000, "reset should load the reset vector");
  assert.equal(ctx.cpu.ps & 0x04, 0x04, "reset should set I");
  assert.equal(ctx.cpu.ps & 0x08, 0x08, "reset should leave D set");

  ctx.cpu.ps = 0x00;
  cpuApi.reset(ctx);
  assert.equal(ctx.cpu.ps & 0x08, 0x00, "reset should leave D clear");
}

function testPendingIrqConsumesOnlyInterruptEntryStep() {
  const { cpuApi, ctx } = makeContext();

  ctx.ram[0xfffe] = 0x78;
  ctx.ram[0xffff] = 0x56;
  ctx.ram[0x5678] = 0xea;
  ctx.irqPending = 1;

  cpuApi.executeOne(ctx);

  assert.equal(ctx.cpu.pc, 0x5678, "IRQ step should stop at the handler vector");
  assert.equal(ctx.cpu.sp, 0xfc, "IRQ step should push PC/P onto the stack");
  assert.equal(ctx.cycleCounter, 7, "IRQ entry should cost 7 cycles");
  // The IRQ line is a level (AHRM 5.7): it stays asserted until POKEY clears
  // the source, and the I flag keeps the handler from re-entering.
  assert.equal(ctx.irqPending, 1, "IRQ entry should leave the IRQ line level alone");

  cpuApi.executeOne(ctx);
  assert.equal(ctx.cpu.pc, 0x5679, "IRQ handler opcode should execute on the next CPU step");
  assert.equal(ctx.cycleCounter, 9, "IRQ handler NOP should add its own 2 cycles");
}

testPendingNmiConsumesOnlyInterruptEntryStep();
testPendingIrqConsumesOnlyInterruptEntryStep();
testNmiNestsInsideNmiHandler();
testNmiHandlerWithoutRtiDoesNotBlockLaterNmis();
testResetKeepsDecimalFlag();
