(function () {
  "use strict";

  // Port of the repo's 6502.c core. Focuses on correctness vs cycle accuracy;
  // the original code table does not model page-cross penalties either.

  const FLAG_N = 0x80;
  const FLAG_V = 0x40;
  const FLAG_B = 0x10;
  const FLAG_D = 0x08;
  const FLAG_I = 0x04;
  const FLAG_Z = 0x02;
  const FLAG_C = 0x01;
  const CpuTables = window.A8ECpuTables;
  if (!CpuTables || !CpuTables.buildCodeTable) {
    throw new Error("A8ECpuTables is not loaded");
  }
  // BCD tables from 6502.c (kept for parity with the C code, though only small
  // parts are used after the newer decimal implementation was added upstream).
  const BCD_TO_BIN = (function () {
    const a = new Uint8Array(256);
    for (let i = 0; i < 256; i++) a[i] = 0;
    let n = 0;
    for (let tens = 0; tens < 10; tens++) {
      for (let ones = 0; ones < 10; ones++) {
        a[(tens << 4) | ones] = n++;
      }
    }
    return a;
  })();

  const BIN_TO_BCD = (function () {
    const a = new Uint8Array(100);
    for (let i = 0; i < 100; i++) {
      const tens = (i / 10) | 0;
      const ones = i % 10;
      a[i] = (tens << 4) | ones;
    }
    return a;
  })();

  function makeContext() {
    const ctx = {
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
      pageCrossed: 0,
      cycleCounter: 0,
      stallCycleCounter: 0,
      ioCycleTimedEventCycle: Infinity,
      ioCycleTimedEventFunction: null,
      irqPending: 0,
      // Set by outside modules (Atari IO).
      ioData: null,
    };

    for (let i = 0; i < 0x10000; i++) ctx.accessFunctionList[i] = ramAccess;
    return ctx;
  }

  function getPs(ctx) {
    const ps = ctx.cpu.ps;
    let cPs = 0x20;
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
    let cPs = getPs(ctx) & ~FLAG_B;
    if (breakFlag) cPs |= FLAG_B;
    return cPs & 0xff;
  }

  function setPs(ctx, cPs) {
    const ps = ctx.cpu.ps;
    ps.n = cPs & FLAG_N;
    ps.v = cPs & FLAG_V;
    // ps.b is ignored when pulling from stack
    ps.d = cPs & FLAG_D;
    ps.i = cPs & FLAG_I;
    ps.z = cPs & FLAG_Z;
    ps.c = cPs & FLAG_C;
  }

  function serviceInterrupt(ctx, vectorAddr, breakFlag, pcToPush) {
    const cpu = ctx.cpu;
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
    const target = ctx.cycleCounter + cycles;
    if (target > ctx.stallCycleCounter) ctx.stallCycleCounter = target;
  }

  function accumulatorAccess(ctx, value) {
    if (value !== null && value !== undefined) ctx.cpu.a = value & 0xff;
    return ctx.cpu.a & 0xff;
  }

  function ramAccess(ctx, value) {
    const addr = ctx.accessAddress & 0xffff;
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
    for (let a = start & 0xffff; a <= (end & 0xffff); a++)
      {ctx.accessFunctionList[a] = romAccess;}
  }

  function setRam(ctx, start, end) {
    for (let a = start & 0xffff; a <= (end & 0xffff); a++)
      {ctx.accessFunctionList[a] = ramAccess;}
  }

  function setIo(ctx, address, fn) {
    ctx.accessFunctionList[address & 0xffff] = fn;
  }

  function nmi(ctx) {
    serviceInterrupt(ctx, 0xfffa, 0, ctx.cpu.pc);
    ctx.cycleCounter += 7;
  }

  function reset(ctx) {
    const cpu = ctx.cpu;
    cpu.sp = 0xfd;
    cpu.ps.i = 1;
    cpu.ps.d = 0;
    cpu.ps.b = 0;
    ctx.irqPending = 0;
    cpu.pc = ctx.ram[0xfffc] | (ctx.ram[0xfffd] << 8);
    ctx.cycleCounter += 7;
  }

  function irq(ctx) {
    const cpu = ctx.cpu;
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
    const lo = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    const hi = ctx.ram[ctx.cpu.pc & 0xffff];
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
    const zp = (ctx.ram[ctx.cpu.pc & 0xffff] + ctx.cpu.x) & 0xff;
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = ctx.ram[zp] | (ctx.ram[(zp + 1) & 0xff] << 8);
  }
  function amIndirectIndexed(ctx) {
    const zp = ctx.ram[ctx.cpu.pc & 0xffff] & 0xff;
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    const base = ctx.ram[zp] | (ctx.ram[(zp + 1) & 0xff] << 8);
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = (base + ctx.cpu.y) & 0xffff;
    ctx.pageCrossed = (base & 0xff00) !== (ctx.accessAddress & 0xff00) ? 1 : 0;
  }
  function amZeroPageX(ctx) {
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = (ctx.ram[ctx.cpu.pc & 0xffff] + ctx.cpu.x) & 0xff;
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
  }
  function amZeroPageY(ctx) {
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = (ctx.ram[ctx.cpu.pc & 0xffff] + ctx.cpu.y) & 0xff;
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
  }
  function amAbsoluteX(ctx) {
    const lo = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    const hi = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    const base = lo | (hi << 8);
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = (base + ctx.cpu.x) & 0xffff;
    ctx.pageCrossed = (base & 0xff00) !== (ctx.accessAddress & 0xff00) ? 1 : 0;
  }
  function amAbsoluteY(ctx) {
    const lo = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    const hi = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    const base = lo | (hi << 8);
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = (base + ctx.cpu.y) & 0xffff;
    ctx.pageCrossed = (base & 0xff00) !== (ctx.accessAddress & 0xff00) ? 1 : 0;
  }
  function amRelative(ctx) {
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = ctx.cpu.pc & 0xffff;
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
  }
  function amIndirect(ctx) {
    const lo = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    const hi = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    const ptr = lo | (hi << 8);
    // 6502 page wrap bug preserved (matches C).
    const ptrHiAddr = (ptr & 0xff00) | ((ptr + 1) & 0x00ff);
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = ctx.ram[ptr] | (ctx.ram[ptrHiAddr] << 8);
  }

  const ADDRESS_FUNCS = [
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
    const ps = ctx.cpu.ps;
    value &= 0xff;
    ps.z = value === 0 ? 1 : 0;
    ps.n = value & 0x80;
  }
  function signed8(x) {
    x &= 0xff;
    return x & 0x80 ? x - 256 : x;
  }

  function adcValue(ctx, value) {
    const cpu = ctx.cpu;
    const ps = cpu.ps;
    value &= 0xff;
    if (ps.d) {
      const a = cpu.a & 0xff;
      let sum = a + value + (ps.c ? 1 : 0);
      const bin = sum & 0xff;
      ps.v = !((a ^ value) & 0x80) && (a ^ bin) & 0x80 ? 1 : 0;

      if ((a & 0x0f) + (value & 0x0f) + (ps.c ? 1 : 0) > 9) sum += 0x06;
      ps.c = sum > 0x99 ? 1 : 0;
      if (ps.c) sum += 0x60;

      cpu.a = sum & 0xff;
      setZN(ctx, bin);
    } else {
      const s = (cpu.a & 0xff) + value + (ps.c ? 1 : 0);
      ps.v =
        ((cpu.a ^ value) & 0x80) === 0 && ((cpu.a ^ s) & 0x80) !== 0 ? 1 : 0;
      cpu.a = s & 0xff;
      ps.c = (s >> 8) & 1;
      setZN(ctx, cpu.a);
    }
  }

  function sbcValue(ctx, value) {
    const cpu = ctx.cpu;
    const ps = cpu.ps;
    value &= 0xff;
    if (ps.d) {
      const a = cpu.a & 0xff;
      let diff = a - value - (ps.c ? 0 : 1);
      const bin = diff & 0xff;
      const carry = diff & 0x100 ? 0 : 1; // carry==1 means no borrow
      ps.v = ((a ^ bin) & (a ^ value) & 0x80) !== 0 ? 1 : 0;

      if ((a & 0x0f) - (ps.c ? 0 : 1) < (value & 0x0f)) diff -= 0x06;
      if (!carry) diff -= 0x60;

      cpu.a = diff & 0xff;
      ps.c = carry;
      setZN(ctx, bin);
    } else {
      const a2 = cpu.a & 0xff;
      const d2 = a2 - value - (ps.c ? 0 : 1);
      const res = d2 & 0xff;
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
    if (ctx.pageCrossed) ctx.cycleCounter++;
  }
  function opLDX(ctx) {
    ctx.cpu.x = readAccess(ctx);
    ctx.cpu.ps.z = ctx.cpu.x === 0 ? 1 : 0;
    ctx.cpu.ps.n = ctx.cpu.x & 0x80;
    if (ctx.pageCrossed) ctx.cycleCounter++;
  }
  function opLDY(ctx) {
    ctx.cpu.y = readAccess(ctx);
    ctx.cpu.ps.z = ctx.cpu.y === 0 ? 1 : 0;
    ctx.cpu.ps.n = ctx.cpu.y & 0x80;
    if (ctx.pageCrossed) ctx.cycleCounter++;
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
    if (ctx.pageCrossed) ctx.cycleCounter++;
  }
  function opAND(ctx) {
    ctx.cpu.a = ctx.cpu.a & readAccess(ctx) & 0xff;
    setZN(ctx, ctx.cpu.a);
    if (ctx.pageCrossed) ctx.cycleCounter++;
  }
  function opEOR(ctx) {
    ctx.cpu.a = (ctx.cpu.a ^ readAccess(ctx)) & 0xff;
    setZN(ctx, ctx.cpu.a);
    if (ctx.pageCrossed) ctx.cycleCounter++;
  }
  function opORA(ctx) {
    ctx.cpu.a = (ctx.cpu.a | readAccess(ctx)) & 0xff;
    setZN(ctx, ctx.cpu.a);
    if (ctx.pageCrossed) ctx.cycleCounter++;
  }
  function opSBC(ctx) {
    sbcValue(ctx, readAccess(ctx));
    if (ctx.pageCrossed) ctx.cycleCounter++;
  }
  function opDEC(ctx) {
    let v = (readAccess(ctx) - 1) & 0xff;
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
    let v = (readAccess(ctx) + 1) & 0xff;
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
    let v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x80;
    v = (v << 1) & 0xff;
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opLSR(ctx) {
    let v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x01;
    v = (v >> 1) & 0xff;
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opROL(ctx) {
    const oldCarry = ctx.cpu.ps.c ? 1 : 0;
    let v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x80;
    v = ((v << 1) & 0xff) | (oldCarry ? 1 : 0);
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opROR(ctx) {
    const oldCarry = ctx.cpu.ps.c ? 1 : 0;
    let v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x01;
    v = (v >> 1) & 0xff;
    if (oldCarry) v |= 0x80;
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opBIT(ctx) {
    const v = readAccess(ctx);
    ctx.cpu.ps.z = v & ctx.cpu.a ? 0 : 1;
    ctx.cpu.ps.v = v & 0x40;
    ctx.cpu.ps.n = v & 0x80;
  }
  function opCMP(ctx) {
    const v = readAccess(ctx);
    ctx.cpu.ps.z = (ctx.cpu.a & 0xff) === v ? 1 : 0;
    ctx.cpu.ps.n = ((ctx.cpu.a - v) & 0x80) !== 0 ? 0x80 : 0;
    ctx.cpu.ps.c = (ctx.cpu.a & 0xff) >= v ? 1 : 0;
    if (ctx.pageCrossed) ctx.cycleCounter++;
  }
  function opCPX(ctx) {
    const v = readAccess(ctx);
    ctx.cpu.ps.z = (ctx.cpu.x & 0xff) === v ? 1 : 0;
    ctx.cpu.ps.n = ((ctx.cpu.x - v) & 0x80) !== 0 ? 0x80 : 0;
    ctx.cpu.ps.c = (ctx.cpu.x & 0xff) >= v ? 1 : 0;
  }
  function opCPY(ctx) {
    const v = readAccess(ctx);
    ctx.cpu.ps.z = (ctx.cpu.y & 0xff) === v ? 1 : 0;
    ctx.cpu.ps.n = ((ctx.cpu.y - v) & 0x80) !== 0 ? 0x80 : 0;
    ctx.cpu.ps.c = (ctx.cpu.y & 0xff) >= v ? 1 : 0;
  }
  function opBCC(ctx) {
    if (!ctx.cpu.ps.c) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBCS(ctx) {
    if (ctx.cpu.ps.c) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBEQ(ctx) {
    if (ctx.cpu.ps.z) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBMI(ctx) {
    if (ctx.cpu.ps.n) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBNE(ctx) {
    if (!ctx.cpu.ps.z) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBPL(ctx) {
    if (!ctx.cpu.ps.n) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBVC(ctx) {
    if (!ctx.cpu.ps.v) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBVS(ctx) {
    if (ctx.cpu.ps.v) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBRK(ctx) {
    serviceInterrupt(ctx, 0xfffe, 1, (ctx.cpu.pc + 1) & 0xffff);
  }
  function opJMP(ctx) {
    ctx.cpu.pc = ctx.accessAddress & 0xffff;
  }
  function opJSR(ctx) {
    const cpu = ctx.cpu;
    const ret = (cpu.pc - 1) & 0xffff;
    ctx.ram[0x100 + cpu.sp] = (ret >> 8) & 0xff;
    cpu.sp = (cpu.sp - 1) & 0xff;
    ctx.ram[0x100 + cpu.sp] = ret & 0xff;
    cpu.sp = (cpu.sp - 1) & 0xff;
    cpu.pc = ctx.accessAddress & 0xffff;
  }
  function opNOP(ctx) {
    void ctx;
    // no-op
    return;
  }
  function opRTI(ctx) {
    const cpu = ctx.cpu;
    cpu.sp = (cpu.sp + 1) & 0xff;
    setPs(ctx, ctx.ram[0x100 + cpu.sp]);
    cpu.sp = (cpu.sp + 1) & 0xff;
    cpu.pc = ctx.ram[0x100 + cpu.sp] & 0xff;
    cpu.sp = (cpu.sp + 1) & 0xff;
    cpu.pc |= (ctx.ram[0x100 + cpu.sp] & 0xff) << 8;
  }
  function opRTS(ctx) {
    const cpu = ctx.cpu;
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
    const cpu = ctx.cpu;
    ctx.ram[0x100 + cpu.sp] = cpu.a & 0xff;
    cpu.sp = (cpu.sp - 1) & 0xff;
  }
  function opPHP(ctx) {
    const cpu = ctx.cpu;
    ctx.ram[0x100 + cpu.sp] = getPsWithB(ctx, 1);
    cpu.sp = (cpu.sp - 1) & 0xff;
  }
  function opPLA(ctx) {
    const cpu = ctx.cpu;
    cpu.sp = (cpu.sp + 1) & 0xff;
    cpu.a = ctx.ram[0x100 + cpu.sp] & 0xff;
    setZN(ctx, cpu.a);
  }
  function opPLP(ctx) {
    const cpu = ctx.cpu;
    cpu.sp = (cpu.sp + 1) & 0xff;
    setPs(ctx, ctx.ram[0x100 + cpu.sp] & 0xff);
  }
  function opXXX(ctx) {
    void ctx;
    // Compatibility fallback: treat unknown opcodes as NOP.
    // This avoids hard crashes on software that executes rare/unstable opcodes.
    return;
  }
  function opLAX(ctx) {
    const v = readAccess(ctx);
    ctx.cpu.a = v;
    ctx.cpu.x = v;
    setZN(ctx, v);
    if (ctx.pageCrossed) ctx.cycleCounter++;
  }
  function opSLO(ctx) {
    let v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x80;
    v = (v << 1) & 0xff;
    ctx.cpu.a = (ctx.cpu.a | writeAccess(ctx, v)) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opATX(ctx) {
    ctx.cpu.a = ctx.cpu.a & readAccess(ctx) & 0xff;
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
    ctx.cpu.a = ctx.cpu.a & readAccess(ctx) & 0xff;
    ctx.cpu.ps.c = ctx.cpu.a & 0x01;
    ctx.cpu.a = (ctx.cpu.a >> 1) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opISC(ctx) {
    let v = (readAccess(ctx) + 1) & 0xff;
    v = writeAccess(ctx, v);
    sbcValue(ctx, v);
  }
  function opSRE(ctx) {
    let v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x01;
    v = (v >> 1) & 0xff;
    ctx.cpu.a = (ctx.cpu.a ^ writeAccess(ctx, v)) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opRLA(ctx) {
    const oldCarry = ctx.cpu.ps.c ? 1 : 0;
    let v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x80;
    v = ((v << 1) & 0xff) | oldCarry;
    v = writeAccess(ctx, v);
    ctx.cpu.a = ctx.cpu.a & v & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opAAC(ctx) {
    ctx.cpu.a = ctx.cpu.a & readAccess(ctx) & 0xff;
    setZN(ctx, ctx.cpu.a);
    ctx.cpu.ps.c = ctx.cpu.ps.n ? 1 : 0;
  }
  function opXAA(ctx) {
    ctx.cpu.a = ctx.cpu.x & 0xff;
    ctx.cpu.a = ctx.cpu.a & readAccess(ctx) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opDCP(ctx) {
    let v = (readAccess(ctx) - 1) & 0xff;
    v = writeAccess(ctx, v);
    ctx.cpu.ps.z = (ctx.cpu.a & 0xff) === v ? 1 : 0;
    ctx.cpu.ps.n = ((ctx.cpu.a - v) & 0x80) !== 0 ? 0x80 : 0;
    ctx.cpu.ps.c = (ctx.cpu.a & 0xff) >= v ? 1 : 0;
  }
  function opRRA(ctx) {
    const oldCarry = ctx.cpu.ps.c ? 1 : 0;
    let v = readAccess(ctx);
    ctx.cpu.ps.c = v & 0x01;
    v = (v >> 1) & 0xff;
    if (oldCarry) v |= 0x80;
    v = writeAccess(ctx, v);
    adcValue(ctx, v);
  }
  function opSBX(ctx) {
    const base = (ctx.cpu.a & ctx.cpu.x) & 0xff;
    const imm = readAccess(ctx) & 0xff;
    const diff = base - imm;
    ctx.cpu.ps.c = diff >= 0 ? 1 : 0;
    ctx.cpu.x = diff & 0xff;
    setZN(ctx, ctx.cpu.x);
  }

  const OPCODE_FUNCS = [
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
    opRRA,
    opSBX,
  ];
  const CODE_TABLE = CpuTables.buildCodeTable();

  function run(ctx, cycleTarget) {
    const cpu = ctx.cpu;
    let cycles = ctx.cycleCounter;
    while (cycles < cycleTarget) {
      if (
        ctx.ioCycleTimedEventFunction &&
        ctx.cycleCounter >= ctx.ioCycleTimedEventCycle
      ) {
        ctx.ioCycleTimedEventFunction(ctx);
      }

      if (ctx.cycleCounter >= ctx.stallCycleCounter) {
        if (ctx.irqPending && !cpu.ps.i) irq(ctx);

        const opcode = ctx.ram[cpu.pc & 0xffff] & 0xff;
        cpu.pc = (cpu.pc + 1) & 0xffff;

        ctx.accessFunctionOverride = null;
        ctx.accessFunction = null;
        ctx.pageCrossed = 0;

        const meta = CODE_TABLE[opcode];
        ADDRESS_FUNCS[meta.addressType](ctx);

        ctx.accessFunction =
          ctx.accessFunctionOverride ||
          ctx.accessFunctionList[ctx.accessAddress & 0xffff];

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
