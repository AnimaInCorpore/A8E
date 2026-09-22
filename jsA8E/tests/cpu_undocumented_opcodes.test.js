"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const FLAG_C = 0x01;
const FLAG_Z = 0x02;
const FLAG_D = 0x08;
const FLAG_N = 0x80;
const FLAG_V = 0x40;

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
  vm.runInContext(cpuTablesSource, context, {
    filename: "cpu_tables.js",
  });
  vm.runInContext(cpuSource, context, {
    filename: "cpu.js",
  });
  return context.window.A8E6502;
}

function runProgram(bytes, init, setup) {
  const cpuApi = loadCpuApi();
  const ctx = cpuApi.makeContext();
  const cpu = ctx.cpu;
  const state = init || {};

  cpu.pc = 0x2000;
  cpu.a = state.a != null ? state.a & 0xff : 0x00;
  cpu.x = state.x != null ? state.x & 0xff : 0x00;
  cpu.y = state.y != null ? state.y & 0xff : 0x00;
  cpu.sp = state.sp != null ? state.sp & 0xff : 0xfd;
  cpu.ps = state.ps != null ? state.ps & 0xff : 0x00;

  for (let i = 0; i < bytes.length; i++) {
    ctx.ram[0x2000 + i] = bytes[i] & 0xff;
  }

  if (typeof setup === "function") {
    setup(ctx);
  }

  cpuApi.executeOne(ctx);
  return ctx;
}

function runOpcode(opcode, operand, init) {
  return runProgram([opcode, operand], init);
}

function assertFlag(ps, flag, expected, message) {
  assert.equal(((ps & flag) !== 0), expected, message);
}

function testAne() {
  const ctx = runOpcode(0x8b, 0xff, {
    a: 0x00,
    x: 0x10,
  });

  assert.equal(ctx.cpu.a, 0x00, "ANE should clear A with the fake6502 form");
  assert.equal(ctx.cpu.x, 0x10, "ANE should not modify X");
  assert.equal(ctx.cpu.pc, 0x2002, "ANE should consume its immediate operand");
  assert.equal(ctx.cycleCounter, 2, "ANE should keep its 2-cycle timing");
  assertFlag(ctx.cpu.ps, FLAG_Z, true, "ANE should set Z when the result is zero");
  assertFlag(ctx.cpu.ps, FLAG_N, false, "ANE should clear N when bit 7 is clear");
}

function testLxa() {
  const ctx = runOpcode(0xab, 0xff, {
    a: 0x00,
    x: 0x33,
  });

  assert.equal(ctx.cpu.a, 0xee, "LXA should use the fake6502 magic constant");
  assert.equal(ctx.cpu.x, 0xee, "LXA should copy the result into X");
  assert.equal(ctx.cpu.pc, 0x2002, "LXA should consume its immediate operand");
  assert.equal(ctx.cycleCounter, 2, "LXA should keep its 2-cycle timing");
  assertFlag(ctx.cpu.ps, FLAG_Z, false, "LXA should clear Z when the result is non-zero");
  assertFlag(ctx.cpu.ps, FLAG_N, true, "LXA should set N when bit 7 is set");
}

function testArrBinary() {
  const ctx = runOpcode(0x6b, 0xff, {
    a: 0x40,
  });

  assert.equal(ctx.cpu.a, 0x20, "ARR should rotate and mask in binary mode");
  assert.equal(ctx.cpu.pc, 0x2002, "ARR should consume its immediate operand");
  assert.equal(ctx.cycleCounter, 2, "ARR should keep its immediate timing");
  assertFlag(ctx.cpu.ps, FLAG_C, false, "ARR should clear carry when bit 6 is clear");
  assertFlag(ctx.cpu.ps, FLAG_V, true, "ARR should set overflow when bits 5 and 6 differ");
  assertFlag(ctx.cpu.ps, FLAG_Z, false, "ARR should leave Z clear when the result is non-zero");
  assertFlag(ctx.cpu.ps, FLAG_N, false, "ARR should clear N when bit 7 is clear");
}

function testArrDecimal() {
  const ctx = runOpcode(0x6b, 0xff, {
    a: 0x75,
    ps: FLAG_D | FLAG_C,
  });

  assert.equal(ctx.cpu.a, 0x10, "ARR decimal mode should apply the fake6502 BCD adjust");
  assert.equal(ctx.cpu.pc, 0x2002, "ARR should consume its immediate operand");
  assert.equal(ctx.cycleCounter, 2, "ARR should not add any decimal-mode cycle");
  assertFlag(ctx.cpu.ps, FLAG_C, true, "ARR decimal mode should set carry for the adjusted high nibble");
  assertFlag(ctx.cpu.ps, FLAG_V, true, "ARR decimal mode should keep the fake6502 overflow form");
  assertFlag(ctx.cpu.ps, FLAG_Z, false, "ARR decimal mode should leave Z clear when the result is non-zero");
  assertFlag(ctx.cpu.ps, FLAG_N, true, "ARR decimal mode should keep N from the shifted result");
}

function testLas() {
  const ctx = runProgram([0xbb, 0xff, 0x01], {
    sp: 0xf0,
    y: 0x01,
  }, (cpuCtx) => {
    cpuCtx.ram[0x0200] = 0xaa;
  });

  assert.equal(ctx.cpu.a, 0xa0, "LAS should load A from memory masked by SP");
  assert.equal(ctx.cpu.x, 0xa0, "LAS should copy the masked value into X");
  assert.equal(ctx.cpu.sp, 0xa0, "LAS should copy the masked value into SP");
  assert.equal(ctx.cpu.pc, 0x2003, "LAS should consume its absolute,Y operand");
  assert.equal(ctx.cycleCounter, 5, "LAS should add the page-cross cycle");
  assertFlag(ctx.cpu.ps, FLAG_Z, false, "LAS should clear Z when the masked value is non-zero");
  assertFlag(ctx.cpu.ps, FLAG_N, true, "LAS should set N when bit 7 is set");
}

function testRra() {
  const ctx = runProgram([0x7f, 0xff, 0x01], {
    a: 0x10,
    x: 0x01,
    ps: FLAG_C,
  }, (cpuCtx) => {
    cpuCtx.ram[0x0200] = 0x01;
  });

  assert.equal(ctx.cpu.a, 0x91, "RRA should ROR the memory byte and add it to A");
  assert.equal(ctx.ram[0x0200], 0x80, "RRA should write the rotated memory byte back");
  assert.equal(ctx.cpu.pc, 0x2003, "RRA should consume its absolute,X operand");
  assert.equal(ctx.cycleCounter, 7, "RRA should not add a page-cross penalty");
  assertFlag(ctx.cpu.ps, FLAG_C, false, "RRA should clear carry when the ADC does not overflow");
  assertFlag(ctx.cpu.ps, FLAG_V, false, "RRA should clear overflow for this ADC case");
  assertFlag(ctx.cpu.ps, FLAG_N, true, "RRA should set N when the ADC result is negative");
  assertFlag(ctx.cpu.ps, FLAG_Z, false, "RRA should leave Z clear when the ADC result is non-zero");
}

function testIscDecimal() {
  const ctx = runProgram([0xe7, 0x40], {
    a: 0x00,
    ps: FLAG_D | FLAG_C,
  }, (cpuCtx) => {
    cpuCtx.ram[0x0040] = 0x00;
  });

  assert.equal(ctx.cpu.a, 0x99, "ISC decimal mode should store the adjusted SBC result");
  assert.equal(ctx.ram[0x0040], 0x01, "ISC should increment memory before subtracting");
  assert.equal(ctx.cpu.pc, 0x2002, "ISC should consume its zero-page operand");
  assert.equal(ctx.cycleCounter, 5, "ISC should keep its 5-cycle zero-page timing in decimal mode");
  assertFlag(ctx.cpu.ps, FLAG_C, false, "ISC decimal mode should clear carry when the subtraction borrows");
  assertFlag(ctx.cpu.ps, FLAG_Z, false, "ISC decimal mode should keep Z from the binary result");
  assertFlag(ctx.cpu.ps, FLAG_N, true, "ISC decimal mode should keep N from the binary result");
}

function testSbx() {
  const ctx = runOpcode(0xcb, 0x10, {
    a: 0x0f,
    x: 0x0f,
  });

  assert.equal(ctx.cpu.x, 0xff, "SBX should subtract the immediate value from A & X");
  assert.equal(ctx.cpu.pc, 0x2002, "SBX should consume its immediate operand");
  assert.equal(ctx.cycleCounter, 2, "SBX should keep its immediate timing");
  assertFlag(ctx.cpu.ps, FLAG_C, false, "SBX should clear carry when the subtraction borrows");
  assertFlag(ctx.cpu.ps, FLAG_Z, false, "SBX should leave Z clear when the result is non-zero");
  assertFlag(ctx.cpu.ps, FLAG_N, true, "SBX should set N when the result is negative");
}

function testSha() {
  let ctx = runProgram([0x93, 0x40], {
    a: 0xff,
    x: 0x03,
    y: 0x01,
  }, (cpuCtx) => {
    cpuCtx.ram[0x0040] = 0xff;
    cpuCtx.ram[0x0041] = 0x01;
    cpuCtx.ram[0x0200] = 0xaa;
  });

  assert.equal(ctx.ram[0x0200], 0x03, "SHA indirect indexed should store the masked high-byte value");
  assert.equal(ctx.cpu.pc, 0x2002, "SHA indirect indexed should consume its zero-page operand");
  assert.equal(ctx.cycleCounter, 6, "SHA indirect indexed should keep its base timing");

  ctx = runProgram([0x9f, 0xff, 0x01], {
    a: 0xff,
    x: 0x03,
    y: 0x01,
  }, (cpuCtx) => {
    cpuCtx.ram[0x0200] = 0xaa;
  });

  assert.equal(ctx.ram[0x0200], 0x03, "SHA absolute,Y should store the masked high-byte value");
  assert.equal(ctx.cpu.pc, 0x2003, "SHA absolute,Y should consume its absolute operand");
  assert.equal(ctx.cycleCounter, 5, "SHA absolute,Y should keep its base timing");
}

function testShx() {
  const ctx = runProgram([0x9e, 0xff, 0x01], {
    x: 0x01,
    y: 0x01,
  }, (cpuCtx) => {
    cpuCtx.ram[0x0000] = 0xaa;
    cpuCtx.ram[0x0200] = 0xbb;
  });

  assert.equal(ctx.ram[0x0000], 0x00, "SHX should write the glitch value into the page-cross target");
  assert.equal(ctx.ram[0x0200], 0xbb, "SHX should not touch the natural effective address when the page-cross glitch fires");
  assert.equal(ctx.cpu.pc, 0x2003, "SHX should consume its absolute,Y operand");
  assert.equal(ctx.cycleCounter, 5, "SHX should keep its base timing");
}

function testShy() {
  const ctx = runProgram([0x9c, 0xff, 0x01], {
    x: 0x01,
    y: 0x01,
  }, (cpuCtx) => {
    cpuCtx.ram[0x0000] = 0xaa;
    cpuCtx.ram[0x0200] = 0xbb;
  });

  assert.equal(ctx.ram[0x0000], 0x00, "SHY should write the glitch value into the page-cross target");
  assert.equal(ctx.ram[0x0200], 0xbb, "SHY should not touch the natural effective address when the page-cross glitch fires");
  assert.equal(ctx.cpu.pc, 0x2003, "SHY should consume its absolute,X operand");
  assert.equal(ctx.cycleCounter, 4, "SHY should keep its base timing");
}

function testTas() {
  const ctx = runProgram([0x9b, 0xff, 0x01], {
    a: 0xf3,
    x: 0x0f,
    sp: 0xfd,
    y: 0x01,
  }, (cpuCtx) => {
    cpuCtx.ram[0x0200] = 0xaa;
  });

  assert.equal(ctx.cpu.sp, 0x03, "TAS should copy A & X into SP");
  assert.equal(ctx.ram[0x0200], 0x03, "TAS should store the masked stack value");
  assert.equal(ctx.cpu.pc, 0x2003, "TAS should consume its absolute,Y operand");
  assert.equal(ctx.cycleCounter, 5, "TAS should keep its base timing");
}

function testDecimalAdc() {
  const ctx = runOpcode(0x69, 0x01, {
    a: 0x99,
    ps: FLAG_D,
  });

  assert.equal(ctx.cpu.a, 0x00, "ADC decimal mode should store the adjusted result");
  assert.equal(ctx.cycleCounter, 2, "ADC decimal mode should not take an extra cycle on the NMOS 6502");
  assertFlag(ctx.cpu.ps, FLAG_C, true, "ADC decimal mode should set carry for 0x99 + 0x01");
  assertFlag(ctx.cpu.ps, FLAG_Z, false, "ADC decimal mode should keep Z from the binary result");
  assertFlag(ctx.cpu.ps, FLAG_N, true, "ADC decimal mode should take N from the intermediate sum ($A0)");
  assertFlag(ctx.cpu.ps, FLAG_V, false, "ADC decimal mode should leave V clear for 0x99 + 0x01");
}

function testDecimalSbc() {
  const ctx = runOpcode(0xe9, 0x01, {
    a: 0x00,
    ps: FLAG_D | FLAG_C,
  });

  assert.equal(ctx.cpu.a, 0x99, "SBC decimal mode should store the adjusted result");
  assert.equal(ctx.cycleCounter, 2, "SBC decimal mode should not take an extra cycle on the NMOS 6502");
  assertFlag(ctx.cpu.ps, FLAG_C, false, "SBC decimal mode should clear carry when the subtraction borrows");
  assertFlag(ctx.cpu.ps, FLAG_Z, false, "SBC decimal mode should keep Z from the intermediate binary result");
  assertFlag(ctx.cpu.ps, FLAG_N, true, "SBC decimal mode should keep N from the intermediate binary result");
  assertFlag(ctx.cpu.ps, FLAG_V, false, "SBC decimal mode should leave V clear for 0x00 - 0x01");
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

// Reference NMOS 6502 decimal ADC (Bruce Clark, "Decimal Mode", Appendix A; AHRM 3.2).
function referenceDecimalAdc(a, b, carry) {
  let low = (a & 0x0f) + (b & 0x0f) + carry;
  if (low >= 0x0a) low = ((low + 0x06) & 0x0f) + 0x10;
  let sum = (a & 0xf0) + (b & 0xf0) + low;
  const signedSum = signed8(a & 0xf0) + signed8(b & 0xf0) + low;
  const n = (sum & 0x80) !== 0;
  const v = signedSum < -128 || signedSum > 127;
  const z = ((a + b + carry) & 0xff) === 0;
  if (sum >= 0xa0) sum += 0x60;
  return { a: sum & 0xff, c: sum >= 0x100, n: n, v: v, z: z };
}

// Reference NMOS 6502 decimal SBC: binary flags, nibble-wise corrected result.
function referenceDecimalSbc(a, b, carry) {
  const binary = a - b - (1 - carry);
  const bin = binary & 0xff;
  let low = (a & 0x0f) - (b & 0x0f) + carry - 1;
  if (low < 0) low = ((low - 0x06) & 0x0f) - 0x10;
  let diff = (a & 0xf0) - (b & 0xf0) + low;
  if (diff < 0) diff -= 0x60;
  return {
    a: diff & 0xff,
    c: binary >= 0,
    n: (bin & 0x80) !== 0,
    v: ((a ^ bin) & (a ^ b) & 0x80) !== 0,
    z: bin === 0,
  };
}

function checkDecimalOpcodeAgainstReference(opcode, reference) {
  const cpuApi = loadCpuApi();
  const ctx = cpuApi.makeContext();
  const cpu = ctx.cpu;
  for (let a = 0; a < 256; a++) {
    for (let b = 0; b < 256; b++) {
      for (let carry = 0; carry < 2; carry++) {
        cpu.pc = 0x2000;
        cpu.a = a;
        cpu.ps = FLAG_D | (carry ? FLAG_C : 0);
        ctx.ram[0x2000] = opcode;
        ctx.ram[0x2001] = b;
        ctx.cycleCounter = 0;
        cpuApi.executeOne(ctx);
        const expected = reference(a, b, carry);
        const label = "$" + opcode.toString(16) + " A=" + a + " B=" + b + " C=" + carry;
        assert.equal(cpu.a, expected.a, label + ": result");
        assertFlag(cpu.ps, FLAG_C, expected.c, label + ": C");
        assertFlag(cpu.ps, FLAG_N, expected.n, label + ": N");
        assertFlag(cpu.ps, FLAG_V, expected.v, label + ": V");
        assertFlag(cpu.ps, FLAG_Z, expected.z, label + ": Z");
        assert.equal(ctx.cycleCounter, 2, label + ": cycles");
      }
    }
  }
}

function testDecimalMatchesNmosReference() {
  checkDecimalOpcodeAgainstReference(0x69, referenceDecimalAdc);
  checkDecimalOpcodeAgainstReference(0xe9, referenceDecimalSbc);
  checkDecimalOpcodeAgainstReference(0xeb, referenceDecimalSbc);
}

function testAhrmDecimalExamples() {
  // AHRM 3.2: $0F + $0F -> intermediate $1E, corrected to $14 (no double carry).
  let ctx = runOpcode(0x69, 0x0f, { a: 0x0f, ps: FLAG_D });
  assert.equal(ctx.cpu.a, 0x14, "$0F + $0F should correct to $14");

  // AHRM 3.2: $FF + $01 = $66 with Z set.
  ctx = runOpcode(0x69, 0x01, { a: 0xff, ps: FLAG_D });
  assert.equal(ctx.cpu.a, 0x66, "$FF + $01 should give $66");
  assertFlag(ctx.cpu.ps, FLAG_Z, true, "$FF + $01 should set Z from the binary sum");

  // N and V come from the intermediate sum: $79 + $01 = $80 sets both.
  ctx = runOpcode(0x69, 0x01, { a: 0x79, ps: FLAG_D });
  assert.equal(ctx.cpu.a, 0x80, "$79 + $01 should give $80");
  assertFlag(ctx.cpu.ps, FLAG_N, true, "$79 + $01 should set N");
  assertFlag(ctx.cpu.ps, FLAG_V, true, "$79 + $01 should set V");
}

function testUndocumentedSbcImmediate() {
  const ctx = runOpcode(0xeb, 0x11, { a: 0x50, ps: FLAG_C });
  assert.equal(ctx.cpu.a, 0x3f, "$EB should subtract like SBC #imm");
  assertFlag(ctx.cpu.ps, FLAG_C, true, "$EB should leave carry set without a borrow");
  assert.equal(ctx.cpu.pc, 0x2002, "$EB should consume its immediate operand");
  assert.equal(ctx.cycleCounter, 2, "$EB should take 2 cycles");
}

function testKilJamsUntilReset() {
  const kilOpcodes = [0x02, 0x12, 0x22, 0x32, 0x42, 0x52, 0x62, 0x72, 0x92, 0xb2, 0xd2, 0xf2];
  const cpuApi = loadCpuApi();
  for (const opcode of kilOpcodes) {
    const ctx = cpuApi.makeContext();
    ctx.cpu.pc = 0x2000;
    ctx.ram[0x2000] = opcode;
    ctx.ram[0x2001] = 0xea;
    ctx.ram[0xfffa] = 0x00; // NMI vector -> $3000
    ctx.ram[0xfffb] = 0x30;
    ctx.ram[0xfffc] = 0x00; // reset vector -> $4000
    ctx.ram[0xfffd] = 0x40;
    cpuApi.executeOne(ctx);
    const label = "KIL $" + opcode.toString(16);
    assert.equal(ctx.halted, 1, label + " should jam the CPU");
    assert.equal(ctx.cpu.pc, 0x2000, label + " should leave PC on the opcode");

    // The jammed CPU ignores NMIs while the clock keeps running.
    cpuApi.nmi(ctx);
    ctx.cycleCounter = 100;
    cpuApi.executeOne(ctx);
    cpuApi.executeOne(ctx);
    assert.equal(ctx.cpu.pc, 0x2000, label + ": jammed CPU must not execute or take an NMI");
    assert.equal(ctx.cycleCounter, 102, label + ": jammed CPU should still advance the clock");
    assert.equal(ctx.nmiPending, 1, label + ": NMI should stay pending while jammed");
    ctx.cycleCounter = 200;
    cpuApi.run(ctx, 300);
    assert.equal(ctx.cpu.pc, 0x2000, label + ": run() must not execute while jammed");
    assert.equal(ctx.cycleCounter, 300, label + ": run() should advance the clock while jammed");

    cpuApi.reset(ctx);
    assert.equal(ctx.halted, 0, label + ": reset should clear the jam");
    assert.equal(ctx.cpu.pc, 0x4000, label + ": reset should restart at the reset vector");
  }
}

testAne();
testLxa();
testArrBinary();
testArrDecimal();
testLas();
testRra();
testIscDecimal();
testSbx();
testSha();
testShx();
testShy();
testTas();
testDecimalAdc();
testDecimalSbc();
testDecimalMatchesNmosReference();
testAhrmDecimalExamples();
testUndocumentedSbcImmediate();
testKilJamsUntilReset();

console.log("cpu undocumented opcode tests passed");
