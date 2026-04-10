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
  assert.equal(ctx.nmiActive, 1, "NMI step should leave the active guard set");

  cpuApi.executeOne(ctx);
  assert.equal(ctx.cpu.pc, 0x1235, "handler opcode should execute on the next CPU step");
  assert.equal(ctx.cycleCounter, 9, "handler NOP should add its own 2 cycles");
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
  assert.equal(ctx.irqPending, 0, "IRQ step should consume the pending request");

  cpuApi.executeOne(ctx);
  assert.equal(ctx.cpu.pc, 0x5679, "IRQ handler opcode should execute on the next CPU step");
  assert.equal(ctx.cycleCounter, 9, "IRQ handler NOP should add its own 2 cycles");
}

testPendingNmiConsumesOnlyInterruptEntryStep();
testPendingIrqConsumesOnlyInterruptEntryStep();
