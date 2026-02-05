(function () {
  "use strict";

  // Port of the repo's 6502.c core. Focuses on correctness vs cycle accuracy;
  // the original code table does not model page-cross penalties either.

  var Util = window.A8EUtil;

  var FLAG_N = 0x80;
  var FLAG_V = 0x40;
  var FLAG_B = 0x10;
  var FLAG_D = 0x08;
  var FLAG_I = 0x04;
  var FLAG_Z = 0x02;
  var FLAG_C = 0x01;

  // m_a6502CodeList from 6502.c, converted to compact tuples:
  // [opcodeByte, opcodeId, cycles, addressType]
  // addressType matches AT_* numeric IDs in 6502.c.
  var CODE_LIST = [
    [0xa9, 0, 2, 0],
    [0xad, 0, 4, 1],
    [0xa5, 0, 3, 2],
    [0xa1, 0, 6, 5],
    [0xb1, 0, 5, 6],
    [0xb5, 0, 4, 7],
    [0xbd, 0, 4, 9],
    [0xb9, 0, 4, 10],
    [0xa2, 1, 2, 0],
    [0xae, 1, 4, 1],
    [0xa6, 1, 3, 2],
    [0xb6, 1, 4, 8],
    [0xbe, 1, 4, 10],
    [0xa0, 2, 2, 0],
    [0xac, 2, 4, 1],
    [0xa4, 2, 3, 2],
    [0xb4, 2, 4, 7],
    [0xbc, 2, 4, 9],
    [0x8d, 3, 4, 1],
    [0x85, 3, 3, 2],
    [0x81, 3, 6, 5],
    [0x91, 3, 6, 6],
    [0x95, 3, 4, 7],
    [0x9d, 3, 5, 9],
    [0x99, 3, 5, 10],
    [0x8e, 4, 4, 1],
    [0x86, 4, 3, 2],
    [0x96, 4, 4, 8],
    [0x8c, 5, 4, 1],
    [0x84, 5, 3, 2],
    [0x94, 5, 4, 7],
    [0xaa, 6, 2, 4],
    [0xa8, 7, 2, 4],
    [0xba, 8, 2, 4],
    [0x8a, 9, 2, 4],
    [0x9a, 10, 2, 4],
    [0x98, 11, 2, 4],
    [0x69, 12, 2, 0],
    [0x6d, 12, 4, 1],
    [0x65, 12, 3, 2],
    [0x61, 12, 6, 5],
    [0x71, 12, 5, 6],
    [0x75, 12, 4, 7],
    [0x7d, 12, 4, 9],
    [0x79, 12, 4, 10],
    [0x29, 13, 2, 0],
    [0x2d, 13, 4, 1],
    [0x25, 13, 3, 2],
    [0x21, 13, 6, 5],
    [0x31, 13, 5, 6],
    [0x35, 13, 4, 7],
    [0x3d, 13, 4, 9],
    [0x39, 13, 4, 10],
    [0x49, 14, 2, 0],
    [0x4d, 14, 4, 1],
    [0x45, 14, 3, 2],
    [0x41, 14, 6, 5],
    [0x51, 14, 5, 6],
    [0x55, 14, 4, 7],
    [0x5d, 14, 4, 9],
    [0x59, 14, 4, 10],
    [0x09, 15, 2, 0],
    [0x0d, 15, 4, 1],
    [0x05, 15, 3, 2],
    [0x01, 15, 6, 5],
    [0x11, 15, 5, 6],
    [0x15, 15, 4, 7],
    [0x1d, 15, 4, 9],
    [0x19, 15, 4, 10],
    [0xe9, 16, 2, 0],
    [0xed, 16, 4, 1],
    [0xe5, 16, 3, 2],
    [0xe1, 16, 6, 5],
    [0xf1, 16, 5, 6],
    [0xf5, 16, 4, 7],
    [0xfd, 16, 4, 9],
    [0xf9, 16, 4, 10],
    [0xce, 17, 6, 1],
    [0xc6, 17, 5, 2],
    [0xd6, 17, 6, 7],
    [0xde, 17, 7, 9],
    [0xca, 18, 2, 4],
    [0x88, 19, 2, 4],
    [0xee, 20, 6, 1],
    [0xe6, 20, 5, 2],
    [0xf6, 20, 6, 7],
    [0xfe, 20, 7, 9],
    [0xe8, 21, 2, 4],
    [0xc8, 22, 2, 4],
    [0x0e, 23, 6, 1],
    [0x06, 23, 5, 2],
    [0x0a, 23, 2, 3],
    [0x16, 23, 6, 7],
    [0x1e, 23, 7, 9],
    [0x4e, 24, 6, 1],
    [0x46, 24, 5, 2],
    [0x4a, 24, 2, 3],
    [0x56, 24, 6, 7],
    [0x5e, 24, 7, 9],
    [0x2e, 25, 6, 1],
    [0x26, 25, 5, 2],
    [0x2a, 25, 2, 3],
    [0x36, 25, 6, 7],
    [0x3e, 25, 7, 9],
    [0x6e, 26, 6, 1],
    [0x66, 26, 5, 2],
    [0x6a, 26, 2, 3],
    [0x76, 26, 6, 7],
    [0x7e, 26, 7, 9],
    [0x2c, 27, 4, 1],
    [0x24, 27, 3, 2],
    [0xc9, 28, 2, 0],
    [0xcd, 28, 4, 1],
    [0xc5, 28, 3, 2],
    [0xc1, 28, 6, 5],
    [0xd1, 28, 5, 6],
    [0xd5, 28, 4, 7],
    [0xdd, 28, 4, 9],
    [0xd9, 28, 4, 10],
    [0xe0, 29, 2, 0],
    [0xec, 29, 4, 1],
    [0xe4, 29, 3, 2],
    [0xc0, 30, 2, 0],
    [0xcc, 30, 4, 1],
    [0xc4, 30, 3, 2],
    [0x90, 31, 2, 11],
    [0xb0, 32, 2, 11],
    [0xf0, 33, 2, 11],
    [0x30, 34, 2, 11],
    [0xd0, 35, 2, 11],
    [0x10, 36, 2, 11],
    [0x50, 37, 2, 11],
    [0x70, 38, 2, 11],
    [0x00, 39, 7, 4],
    [0x4c, 40, 3, 1],
    [0x6c, 40, 5, 12],
    [0x20, 41, 6, 1],
    [0xea, 42, 2, 4],
    [0x40, 43, 6, 4],
    [0x60, 44, 6, 4],
    [0x18, 45, 2, 4],
    [0xd8, 46, 2, 4],
    [0x58, 47, 2, 4],
    [0xb8, 48, 2, 4],
    [0x38, 49, 2, 4],
    [0xf8, 50, 2, 4],
    [0x78, 51, 2, 4],
    [0x48, 52, 3, 4],
    [0x08, 53, 3, 4],
    [0x68, 54, 4, 4],
    [0x28, 55, 4, 4],
    [0xa7, 57, 3, 2],
    [0xb7, 57, 4, 8],
    [0xaf, 57, 4, 1],
    [0xbf, 57, 4, 10],
    [0xa3, 57, 6, 5],
    [0xb3, 57, 5, 6],
    [0x07, 58, 5, 2],
    [0x17, 58, 6, 7],
    [0x0f, 58, 6, 1],
    [0x1f, 58, 7, 9],
    [0x1b, 58, 7, 10],
    [0x03, 58, 8, 5],
    [0x13, 58, 8, 6],
    [0x1a, 42, 2, 4],
    [0x3a, 42, 2, 4],
    [0x5a, 42, 2, 4],
    [0x7a, 42, 2, 4],
    [0xda, 42, 2, 4],
    [0xfa, 42, 2, 4],
    [0xab, 59, 2, 0],
    [0x87, 60, 3, 2],
    [0x97, 60, 4, 8],
    [0x83, 60, 6, 5],
    [0x8f, 60, 4, 1],
    [0x04, 61, 3, 2],
    [0x14, 61, 4, 7],
    [0x34, 61, 4, 7],
    [0x44, 61, 3, 2],
    [0x54, 61, 4, 7],
    [0x64, 61, 3, 2],
    [0x74, 61, 4, 7],
    [0x80, 61, 2, 0],
    [0x82, 61, 2, 0],
    [0x89, 61, 2, 0],
    [0xc2, 61, 2, 0],
    [0xd4, 61, 4, 7],
    [0xe2, 61, 2, 0],
    [0xf4, 61, 4, 7],
    [0x0c, 62, 4, 1],
    [0x1c, 62, 4, 9],
    [0x3c, 62, 4, 9],
    [0x5c, 62, 4, 9],
    [0x7c, 62, 4, 9],
    [0xdc, 62, 4, 9],
    [0xfc, 62, 4, 9],
    [0x4b, 63, 2, 0],
    [0xe7, 64, 5, 2],
    [0xf7, 64, 6, 7],
    [0xef, 64, 6, 1],
    [0xff, 64, 7, 9],
    [0xfb, 64, 7, 10],
    [0xe3, 64, 8, 5],
    [0xf3, 64, 8, 6],
    [0x47, 65, 5, 2],
    [0x57, 65, 6, 7],
    [0x4f, 65, 6, 1],
    [0x5f, 65, 7, 9],
    [0x5b, 65, 7, 10],
    [0x43, 65, 8, 5],
    [0x53, 65, 8, 6],
    [0x27, 66, 5, 2],
    [0x37, 66, 6, 7],
    [0x2f, 66, 6, 1],
    [0x3f, 66, 7, 9],
    [0x3b, 66, 7, 10],
    [0x23, 66, 8, 5],
    [0x33, 66, 8, 6],
    [0x0b, 67, 2, 0],
    [0x2b, 67, 2, 0],
    [0x8b, 68, 2, 0],
    [0xc7, 69, 5, 2],
    [0xd7, 69, 6, 7],
    [0xcf, 69, 6, 1],
    [0xdf, 69, 7, 9],
    [0xdb, 69, 7, 10],
    [0xc3, 69, 8, 5],
    [0xd3, 69, 8, 6],
  ];

  // BCD tables from 6502.c (kept for parity with the C code, though only small
  // parts are used after the newer decimal implementation was added upstream).
  var BCD_TO_BIN = (function () {
    var a = new Uint8Array(256);
    for (var i = 0; i < 256; i++) a[i] = 0;
    var n = 0;
    for (var tens = 0; tens < 10; tens++) {
      for (var ones = 0; ones < 10; ones++) {
        a[(tens << 4) | ones] = n++;
      }
    }
    return a;
  })();

  var BIN_TO_BCD = (function () {
    var a = new Uint8Array(100);
    for (var i = 0; i < 100; i++) {
      var tens = (i / 10) | 0;
      var ones = i % 10;
      a[i] = (tens << 4) | ones;
    }
    return a;
  })();

  function makeContext() {
    var ctx = {
      cpu: {
        a: 0,
        x: 0,
        y: 0,
        sp: 0,
        pc: 0,
        ps: { n: 0, v: 0, b: 0, d: 0, i: 0, z: 0, c: 0 },
      },
      ram: new Uint8Array(0x10000),
      sram: new Uint8Array(0x10000),
      accessFunctionList: new Array(0x10000),
      accessFunctionOverride: null,
      accessFunction: null,
      accessAddress: 0,
      cycleCounter: 0,
      stallCycleCounter: 0,
      ioCycleTimedEventCycle: 0xffffffffffffffff,
      ioCycleTimedEventFunction: null,
      irqPending: 0,
      // Set by outside modules (Atari IO).
      ioData: null,
    };

    for (var i = 0; i < 0x10000; i++) ctx.accessFunctionList[i] = ramAccess;
    return ctx;
  }

  function getPs(ctx) {
    var ps = ctx.cpu.ps;
    var cPs = 0x20;
    if (ps.n) cPs |= FLAG_N;
    if (ps.v) cPs |= FLAG_V;
    if (ps.b) cPs |= FLAG_B;
    if (ps.d) cPs |= FLAG_D;
    if (ps.i) cPs |= FLAG_I;
    if (ps.z) cPs |= FLAG_Z;
    if (ps.c) cPs |= FLAG_C;
    return cPs & 0xff;
  }

  function getPsWithB(ctx, breakFlag) {
    var cPs = getPs(ctx) & ~FLAG_B;
    if (breakFlag) cPs |= FLAG_B;
    return cPs & 0xff;
  }

  function setPs(ctx, cPs) {
    var ps = ctx.cpu.ps;
    ps.n = cPs & FLAG_N;
    ps.v = cPs & FLAG_V;
    ps.b = cPs & FLAG_B;
    ps.d = cPs & FLAG_D;
    ps.i = cPs & FLAG_I;
    ps.z = cPs & FLAG_Z;
    ps.c = cPs & FLAG_C;
  }

  function serviceInterrupt(ctx, vectorAddr, breakFlag, pcToPush) {
    var cpu = ctx.cpu;
    // Stack always in RAM ($0100-$01FF).
    ctx.ram[0x100 + cpu.sp] = (pcToPush >> 8) & 0xff;
    cpu.sp = (cpu.sp - 1) & 0xff;
    ctx.ram[0x100 + cpu.sp] = pcToPush & 0xff;
    cpu.sp = (cpu.sp - 1) & 0xff;
    ctx.ram[0x100 + cpu.sp] = getPsWithB(ctx, breakFlag);
    cpu.sp = (cpu.sp - 1) & 0xff;

    cpu.ps.i = 1;
    cpu.pc = ctx.ram[vectorAddr] | (ctx.ram[(vectorAddr + 1) & 0xffff] << 8);
  }

  function stall(ctx, cycles) {
    var target = ctx.cycleCounter + cycles;
    if (target > ctx.stallCycleCounter) ctx.stallCycleCounter = target;
  }

  function accumulatorAccess(ctx, value) {
    if (value !== null && value !== undefined) ctx.cpu.a = value & 0xff;
    return ctx.cpu.a & 0xff;
  }

  function ramAccess(ctx, value) {
    var addr = ctx.accessAddress & 0xffff;
    if (value !== null && value !== undefined) ctx.ram[addr] = value & 0xff;
    return ctx.ram[addr] & 0xff;
  }

  function romAccess(ctx, value) {
    // Read-only access; ignore writes.
    if (value !== null && value !== undefined) {
      // ignore
    }
    return ctx.ram[ctx.accessAddress & 0xffff] & 0xff;
  }

  function setRom(ctx, start, end) {
    for (var a = start & 0xffff; a <= (end & 0xffff); a++)
      ctx.accessFunctionList[a] = romAccess;
  }

  function setRam(ctx, start, end) {
    for (var a = start & 0xffff; a <= (end & 0xffff); a++)
      ctx.accessFunctionList[a] = ramAccess;
  }

  function setIo(ctx, address, fn) {
    ctx.accessFunctionList[address & 0xffff] = fn;
  }

  function nmi(ctx) {
    serviceInterrupt(ctx, 0xfffa, 0, ctx.cpu.pc);
    ctx.cycleCounter += 7;
  }

  function reset(ctx) {
    var cpu = ctx.cpu;
    cpu.sp = 0xfd;
    cpu.ps.i = 1;
    cpu.ps.d = 0;
    cpu.ps.b = 0;
    ctx.irqPending = 0;
    cpu.pc = ctx.ram[0xfffc] | (ctx.ram[0xfffd] << 8);
    ctx.cycleCounter += 7;
  }

  function irq(ctx) {
    var cpu = ctx.cpu;
    if (cpu.ps.i) {
      ctx.irqPending = (ctx.irqPending + 1) & 0xff;
    } else {
      if (ctx.irqPending) ctx.irqPending = (ctx.irqPending - 1) & 0xff;
      serviceInterrupt(ctx, 0xfffe, 0, cpu.pc);
      ctx.cycleCounter += 7;
    }
  }

  // Addressing modes
  function amImplicit(ctx) {
    ctx.accessFunctionOverride = ramAccess;
    ctx.accessAddress = 0;
  }
  function amImmediate(ctx) {
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = ctx.cpu.pc & 0xffff;
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
  }
  function amAbsolute(ctx) {
    var lo = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    var hi = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = lo | (hi << 8);
  }
  function amZeroPage(ctx) {
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
  }
  function amAccumulator(ctx) {
    ctx.accessFunctionOverride = accumulatorAccess;
    ctx.accessAddress = 0;
  }
  function amIndexedIndirect(ctx) {
    var zp = (ctx.ram[ctx.cpu.pc & 0xffff] + ctx.cpu.x) & 0xff;
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = ctx.ram[zp] | (ctx.ram[(zp + 1) & 0xff] << 8);
  }
  function amIndirectIndexed(ctx) {
    var zp = ctx.ram[ctx.cpu.pc & 0xffff] & 0xff;
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    ctx.accessFunctionOverride = null;
    ctx.accessAddress =
      ((ctx.ram[zp] | (ctx.ram[(zp + 1) & 0xff] << 8)) + ctx.cpu.y) & 0xffff;
  }
  function amZeroPageX(ctx) {
    ctx.accessFunctionOverride = null;
    ctx.accessAddress =
      (ctx.ram[ctx.cpu.pc & 0xffff] + ctx.cpu.x) & 0xff;
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
  }
  function amZeroPageY(ctx) {
    ctx.accessFunctionOverride = null;
    ctx.accessAddress =
      (ctx.ram[ctx.cpu.pc & 0xffff] + ctx.cpu.y) & 0xff;
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
  }
  function amAbsoluteX(ctx) {
    var lo = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    var hi = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = ((lo | (hi << 8)) + ctx.cpu.x) & 0xffff;
  }
  function amAbsoluteY(ctx) {
    var lo = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    var hi = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = ((lo | (hi << 8)) + ctx.cpu.y) & 0xffff;
  }
  function amRelative(ctx) {
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = ctx.cpu.pc & 0xffff;
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
  }
  function amIndirect(ctx) {
    var lo = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    var hi = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    var ptr = lo | (hi << 8);
    // 6502 page wrap bug preserved (matches C).
    var ptrHiAddr = (ptr & 0xff00) | ((ptr + 1) & 0x00ff);
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = ctx.ram[ptr] | (ctx.ram[ptrHiAddr] << 8);
  }

  var ADDRESS_FUNCS = [
    amImmediate,
    amAbsolute,
    amZeroPage,
    amAccumulator,
    amImplicit,
    amIndexedIndirect,
    amIndirectIndexed,
    amZeroPageX,
    amZeroPageY,
    amAbsoluteX,
    amAbsoluteY,
    amRelative,
    amIndirect,
  ];

  // Helpers for operations
  function readAccess(ctx) {
    return ctx.accessFunction(ctx, null) & 0xff;
  }
  function writeAccess(ctx, value) {
    return ctx.accessFunction(ctx, value & 0xff) & 0xff;
  }
  function setZN(ctx, value) {
    var ps = ctx.cpu.ps;
    value &= 0xff;
    ps.z = value === 0 ? 1 : 0;
    ps.n = value & 0x80;
  }
  function signed8(x) {
    x &= 0xff;
    return x & 0x80 ? x - 256 : x;
  }

  function adcValue(ctx, value) {
    var cpu = ctx.cpu;
    var ps = cpu.ps;
    value &= 0xff;
    if (ps.d) {
      var a = cpu.a & 0xff;
      var sum = a + value + (ps.c ? 1 : 0);
      var bin = sum & 0xff;
      ps.v = !((a ^ value) & 0x80) && ((a ^ bin) & 0x80) ? 1 : 0;

      if (((a & 0x0f) + (value & 0x0f) + (ps.c ? 1 : 0)) > 9) sum += 0x06;
      ps.c = sum > 0x99 ? 1 : 0;
      if (ps.c) sum += 0x60;

      cpu.a = sum & 0xff;
      setZN(ctx, cpu.a);
    } else {
      var s = (cpu.a & 0xff) + value + (ps.c ? 1 : 0);
      ps.v = ((cpu.a ^ value) & 0x80) === 0 && ((cpu.a ^ s) & 0x80) !== 0 ? 1 : 0;
      cpu.a = s & 0xff;
      ps.c = (s >> 8) & 1;
      setZN(ctx, cpu.a);
    }
  }

  function sbcValue(ctx, value) {
    var cpu = ctx.cpu;
    var ps = cpu.ps;
    value &= 0xff;
    if (ps.d) {
      var a = cpu.a & 0xff;
      var diff = a - value - (ps.c ? 0 : 1);
      var bin = diff & 0xff;
      var carry = diff & 0x100 ? 0 : 1; // carry==1 means no borrow
      ps.v = ((a ^ bin) & (a ^ value) & 0x80) !== 0 ? 1 : 0;

      if (((a & 0x0f) - (ps.c ? 0 : 1)) < (value & 0x0f)) diff -= 0x06;
      if (!carry) diff -= 0x60;

      cpu.a = diff & 0xff;
      ps.c = carry;
      setZN(ctx, cpu.a);
    } else {
      var a2 = cpu.a & 0xff;
      var d2 = a2 - value - (ps.c ? 0 : 1);
      var res = d2 & 0xff;
      ps.v = ((a2 ^ res) & (a2 ^ value) & 0x80) !== 0 ? 1 : 0;
      cpu.a = res;
      ps.c = d2 & 0x100 ? 0 : 1;
      setZN(ctx, cpu.a);
    }
  }

  // Opcode implementations (order matches 6502.c m_a6502OpcodeFunctionList)
  function opLDA(ctx) {
    ctx.cpu.a = readAccess(ctx);
    setZN(ctx, ctx.cpu.a);
  }
  function opLDX(ctx) {
    ctx.cpu.x = readAccess(ctx);
    ctx.cpu.ps.z = ctx.cpu.x === 0 ? 1 : 0;
    ctx.cpu.ps.n = ctx.cpu.x & 0x80;
  }
  function opLDY(ctx) {
    ctx.cpu.y = readAccess(ctx);
    ctx.cpu.ps.z = ctx.cpu.y === 0 ? 1 : 0;
    ctx.cpu.ps.n = ctx.cpu.y & 0x80;
  }
  function opSTA(ctx) {
    writeAccess(ctx, ctx.cpu.a);
  }
  function opSTX(ctx) {
    writeAccess(ctx, ctx.cpu.x);
  }
  function opSTY(ctx) {
    writeAccess(ctx, ctx.cpu.y);
  }
  function opTAX(ctx) {
    ctx.cpu.x = ctx.cpu.a & 0xff;
    setZN(ctx, ctx.cpu.x);
  }
  function opTAY(ctx) {
    ctx.cpu.y = ctx.cpu.a & 0xff;
    setZN(ctx, ctx.cpu.y);
  }
  function opTSX(ctx) {
    ctx.cpu.x = ctx.cpu.sp & 0xff;
    setZN(ctx, ctx.cpu.x);
  }
  function opTXA(ctx) {
    ctx.cpu.a = ctx.cpu.x & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opTXS(ctx) {
    ctx.cpu.sp = ctx.cpu.x & 0xff;
  }
  function opTYA(ctx) {
    ctx.cpu.a = ctx.cpu.y & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opADC(ctx) {
    adcValue(ctx, readAccess(ctx));
  }
  function opAND(ctx) {
    ctx.cpu.a = (ctx.cpu.a & readAccess(ctx)) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opEOR(ctx) {
    ctx.cpu.a = (ctx.cpu.a ^ readAccess(ctx)) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opORA(ctx) {
    ctx.cpu.a = (ctx.cpu.a | readAccess(ctx)) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opSBC(ctx) {
    sbcValue(ctx, readAccess(ctx));
  }
  function opDEC(ctx) {
    var v = (readAccess(ctx) - 1) & 0xff;
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opDEX(ctx) {
    ctx.cpu.x = (ctx.cpu.x - 1) & 0xff;
    setZN(ctx, ctx.cpu.x);
  }
  function opDEY(ctx) {
    ctx.cpu.y = (ctx.cpu.y - 1) & 0xff;
    setZN(ctx, ctx.cpu.y);
  }
  function opINC(ctx) {
    var v = (readAccess(ctx) + 1) & 0xff;
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opINX(ctx) {
    ctx.cpu.x = (ctx.cpu.x + 1) & 0xff;
    setZN(ctx, ctx.cpu.x);
  }
  function opINY(ctx) {
    ctx.cpu.y = (ctx.cpu.y + 1) & 0xff;
    setZN(ctx, ctx.cpu.y);
  }
  function opASL(ctx) {
    var v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x80;
    v = (v << 1) & 0xff;
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opLSR(ctx) {
    var v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x01;
    v = (v >> 1) & 0xff;
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opROL(ctx) {
    var oldCarry = ctx.cpu.ps.c ? 1 : 0;
    var v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x80;
    v = ((v << 1) & 0xff) | (oldCarry ? 1 : 0);
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opROR(ctx) {
    var oldCarry = ctx.cpu.ps.c ? 1 : 0;
    var v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x01;
    v = (v >> 1) & 0xff;
    if (oldCarry) v |= 0x80;
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opBIT(ctx) {
    var v = readAccess(ctx);
    ctx.cpu.ps.z = (v & ctx.cpu.a) ? 0 : 1;
    ctx.cpu.ps.v = v & 0x40;
    ctx.cpu.ps.n = v & 0x80;
  }
  function opCMP(ctx) {
    var v = readAccess(ctx);
    ctx.cpu.ps.z = (ctx.cpu.a & 0xff) === v ? 1 : 0;
    ctx.cpu.ps.n = ((ctx.cpu.a - v) & 0x80) !== 0 ? 0x80 : 0;
    ctx.cpu.ps.c = (ctx.cpu.a & 0xff) >= v ? 1 : 0;
  }
  function opCPX(ctx) {
    var v = readAccess(ctx);
    ctx.cpu.ps.z = (ctx.cpu.x & 0xff) === v ? 1 : 0;
    ctx.cpu.ps.n = ((ctx.cpu.x - v) & 0x80) !== 0 ? 0x80 : 0;
    ctx.cpu.ps.c = (ctx.cpu.x & 0xff) >= v ? 1 : 0;
  }
  function opCPY(ctx) {
    var v = readAccess(ctx);
    ctx.cpu.ps.z = (ctx.cpu.y & 0xff) === v ? 1 : 0;
    ctx.cpu.ps.n = ((ctx.cpu.y - v) & 0x80) !== 0 ? 0x80 : 0;
    ctx.cpu.ps.c = (ctx.cpu.y & 0xff) >= v ? 1 : 0;
  }
  function opBCC(ctx) {
    if (!ctx.cpu.ps.c) ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
  }
  function opBCS(ctx) {
    if (ctx.cpu.ps.c) ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
  }
  function opBEQ(ctx) {
    if (ctx.cpu.ps.z) ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
  }
  function opBMI(ctx) {
    if (ctx.cpu.ps.n) ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
  }
  function opBNE(ctx) {
    if (!ctx.cpu.ps.z) ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
  }
  function opBPL(ctx) {
    if (!ctx.cpu.ps.n) ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
  }
  function opBVC(ctx) {
    if (!ctx.cpu.ps.v) ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
  }
  function opBVS(ctx) {
    if (ctx.cpu.ps.v) ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
  }
  function opBRK(ctx) {
    serviceInterrupt(ctx, 0xfffe, 1, (ctx.cpu.pc + 1) & 0xffff);
  }
  function opJMP(ctx) {
    ctx.cpu.pc = ctx.accessAddress & 0xffff;
  }
  function opJSR(ctx) {
    var cpu = ctx.cpu;
    var ret = (cpu.pc - 1) & 0xffff;
    ctx.ram[0x100 + cpu.sp] = (ret >> 8) & 0xff;
    cpu.sp = (cpu.sp - 1) & 0xff;
    ctx.ram[0x100 + cpu.sp] = ret & 0xff;
    cpu.sp = (cpu.sp - 1) & 0xff;
    cpu.pc = ctx.accessAddress & 0xffff;
  }
  function opNOP(ctx) {
    // no-op
    return;
  }
  function opRTI(ctx) {
    var cpu = ctx.cpu;
    cpu.sp = (cpu.sp + 1) & 0xff;
    setPs(ctx, ctx.ram[0x100 + cpu.sp]);
    cpu.sp = (cpu.sp + 1) & 0xff;
    cpu.pc = ctx.ram[0x100 + cpu.sp] & 0xff;
    cpu.sp = (cpu.sp + 1) & 0xff;
    cpu.pc |= (ctx.ram[0x100 + cpu.sp] & 0xff) << 8;
  }
  function opRTS(ctx) {
    var cpu = ctx.cpu;
    cpu.sp = (cpu.sp + 1) & 0xff;
    cpu.pc = ctx.ram[0x100 + cpu.sp] & 0xff;
    cpu.sp = (cpu.sp + 1) & 0xff;
    cpu.pc |= (ctx.ram[0x100 + cpu.sp] & 0xff) << 8;
    cpu.pc = (cpu.pc + 1) & 0xffff;
  }
  function opCLC(ctx) {
    ctx.cpu.ps.c = 0;
  }
  function opCLD(ctx) {
    ctx.cpu.ps.d = 0;
  }
  function opCLI(ctx) {
    ctx.cpu.ps.i = 0;
  }
  function opCLV(ctx) {
    ctx.cpu.ps.v = 0;
  }
  function opSEC(ctx) {
    ctx.cpu.ps.c = 1;
  }
  function opSED(ctx) {
    ctx.cpu.ps.d = 1;
  }
  function opSEI(ctx) {
    ctx.cpu.ps.i = 1;
  }
  function opPHA(ctx) {
    var cpu = ctx.cpu;
    ctx.ram[0x100 + cpu.sp] = cpu.a & 0xff;
    cpu.sp = (cpu.sp - 1) & 0xff;
  }
  function opPHP(ctx) {
    var cpu = ctx.cpu;
    ctx.ram[0x100 + cpu.sp] = getPsWithB(ctx, 1);
    cpu.sp = (cpu.sp - 1) & 0xff;
  }
  function opPLA(ctx) {
    var cpu = ctx.cpu;
    cpu.sp = (cpu.sp + 1) & 0xff;
    cpu.a = ctx.ram[0x100 + cpu.sp] & 0xff;
    setZN(ctx, cpu.a);
  }
  function opPLP(ctx) {
    var cpu = ctx.cpu;
    cpu.sp = (cpu.sp + 1) & 0xff;
    setPs(ctx, ctx.ram[0x100 + cpu.sp] & 0xff);
  }
  function opXXX(ctx) {
    var cpu = ctx.cpu;
    throw new Error(
      "Illegal/unhandled opcode at PC=$" +
        Util.toHex4((cpu.pc - 1) & 0xffff) +
        " A=$" +
        Util.toHex2(cpu.a) +
        " X=$" +
        Util.toHex2(cpu.x) +
        " Y=$" +
        Util.toHex2(cpu.y)
    );
  }
  function opLAX(ctx) {
    var v = readAccess(ctx);
    ctx.cpu.a = v;
    ctx.cpu.x = v;
    setZN(ctx, v);
  }
  function opSLO(ctx) {
    var v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x80;
    v = (v << 1) & 0xff;
    ctx.cpu.a = (ctx.cpu.a | writeAccess(ctx, v)) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opATX(ctx) {
    ctx.cpu.a = (ctx.cpu.a & readAccess(ctx)) & 0xff;
    ctx.cpu.x = ctx.cpu.a;
    setZN(ctx, ctx.cpu.a);
  }
  function opAAX(ctx) {
    writeAccess(ctx, ctx.cpu.x & ctx.cpu.a);
  }
  function opDOP(ctx) {
    readAccess(ctx);
  }
  function opTOP(ctx) {
    readAccess(ctx);
  }
  function opASR(ctx) {
    ctx.cpu.a = (ctx.cpu.a & readAccess(ctx)) & 0xff;
    ctx.cpu.ps.c = ctx.cpu.a & 0x01;
    ctx.cpu.a = (ctx.cpu.a >> 1) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opISC(ctx) {
    var v = (readAccess(ctx) + 1) & 0xff;
    v = writeAccess(ctx, v);
    sbcValue(ctx, v);
  }
  function opSRE(ctx) {
    var v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x01;
    v = (v >> 1) & 0xff;
    ctx.cpu.a = (ctx.cpu.a ^ writeAccess(ctx, v)) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opRLA(ctx) {
    var oldCarry = ctx.cpu.ps.c ? 1 : 0;
    var v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x80;
    v = ((v << 1) & 0xff) | oldCarry;
    v = writeAccess(ctx, v);
    ctx.cpu.a = (ctx.cpu.a & v) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opAAC(ctx) {
    ctx.cpu.a = (ctx.cpu.a & readAccess(ctx)) & 0xff;
    setZN(ctx, ctx.cpu.a);
    ctx.cpu.ps.c = ctx.cpu.ps.n ? 1 : 0;
  }
  function opXAA(ctx) {
    ctx.cpu.a = ctx.cpu.x & 0xff;
    ctx.cpu.a = (ctx.cpu.a & readAccess(ctx)) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opDCP(ctx) {
    var v = (readAccess(ctx) - 1) & 0xff;
    v = writeAccess(ctx, v);
    ctx.cpu.ps.z = (ctx.cpu.a & 0xff) === v ? 1 : 0;
    ctx.cpu.ps.n = ((ctx.cpu.a - v) & 0x80) !== 0 ? 0x80 : 0;
    ctx.cpu.ps.c = (ctx.cpu.a & 0xff) >= v ? 1 : 0;
  }

  var OPCODE_FUNCS = [
    opLDA,
    opLDX,
    opLDY,
    opSTA,
    opSTX,
    opSTY,
    opTAX,
    opTAY,
    opTSX,
    opTXA,
    opTXS,
    opTYA,
    opADC,
    opAND,
    opEOR,
    opORA,
    opSBC,
    opDEC,
    opDEX,
    opDEY,
    opINC,
    opINX,
    opINY,
    opASL,
    opLSR,
    opROL,
    opROR,
    opBIT,
    opCMP,
    opCPX,
    opCPY,
    opBCC,
    opBCS,
    opBEQ,
    opBMI,
    opBNE,
    opBPL,
    opBVC,
    opBVS,
    opBRK,
    opJMP,
    opJSR,
    opNOP,
    opRTI,
    opRTS,
    opCLC,
    opCLD,
    opCLI,
    opCLV,
    opSEC,
    opSED,
    opSEI,
    opPHA,
    opPHP,
    opPLA,
    opPLP,
    opXXX,
    opLAX,
    opSLO,
    opATX,
    opAAX,
    opDOP,
    opTOP,
    opASR,
    opISC,
    opSRE,
    opRLA,
    opAAC,
    opXAA,
    opDCP,
  ];

  function buildCodeTable() {
    var table = new Array(256);
    for (var i = 0; i < 256; i++) {
      table[i] = { opcodeId: 56, addressType: 4, cycles: 2 };
    }
    for (var j = 0; j < CODE_LIST.length; j++) {
      var e = CODE_LIST[j];
      table[e[0]] = { opcodeId: e[1], addressType: e[3], cycles: e[2] };
    }
    return table;
  }

  var CODE_TABLE = buildCodeTable();

  function run(ctx, cycleTarget) {
    var cpu = ctx.cpu;
    var cycles = ctx.cycleCounter;
    while (cycles < cycleTarget) {
      if (ctx.ioCycleTimedEventFunction && ctx.cycleCounter >= ctx.ioCycleTimedEventCycle) {
        ctx.ioCycleTimedEventFunction(ctx);
      }

      if (ctx.cycleCounter >= ctx.stallCycleCounter) {
        if (ctx.irqPending && !cpu.ps.i) irq(ctx);

        var opcode = ctx.ram[cpu.pc & 0xffff] & 0xff;
        cpu.pc = (cpu.pc + 1) & 0xffff;

        ctx.accessFunctionOverride = null;
        ctx.accessFunction = null;

        var meta = CODE_TABLE[opcode];
        ADDRESS_FUNCS[meta.addressType](ctx);

        ctx.accessFunction =
          ctx.accessFunctionOverride || ctx.accessFunctionList[ctx.accessAddress & 0xffff];

        OPCODE_FUNCS[meta.opcodeId](ctx);

        ctx.cycleCounter += meta.cycles;
        cycles = ctx.cycleCounter;
      } else {
        ctx.cycleCounter += 1;
        cycles = ctx.cycleCounter;
      }
    }
    return ctx.cycleCounter;
  }

  window.A8E6502 = {
    makeContext: makeContext,
    setRom: setRom,
    setRam: setRam,
    setIo: setIo,
    nmi: nmi,
    reset: reset,
    irq: irq,
    run: run,
    stall: stall,
    // exposed for debugging/tests
    getPs: getPs,
    setPs: setPs,
    BCD_TO_BIN: BCD_TO_BIN,
    BIN_TO_BCD: BIN_TO_BCD,
  };
})();
