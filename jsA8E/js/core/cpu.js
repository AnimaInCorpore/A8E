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
  const FLAG_STACK_MASK = FLAG_N | FLAG_V | FLAG_D | FLAG_I | FLAG_Z | FLAG_C;
  const FLAG_NZ_MASK = FLAG_N | FLAG_Z;
  const ACCESS_MODE_FN = 0;
  const ACCESS_MODE_RAM = 1;
  const ACCESS_MODE_ROM = 2;
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
        ps: 0,
      },
      ram: new Uint8Array(0x10000),
      sram: new Uint8Array(0x10000),
      accessFunctionList: new Array(0x10000),
      accessFunctionOverride: null,
      accessFunction: null,
      accessAddress: 0,
      accessMode: ACCESS_MODE_FN,
      pageCrossed: 0,
      cycleCounter: 0,
      stallCycleCounter: 0,
      ioCycleTimedEventCycle: Infinity,
      ioCycleTimedEventFunction: null,
      irqPending: 0,
      // Set by outside modules (Atari IO).
      ioData: null,
      // PC hooks: address -> function(ctx).  Return true to skip normal execution.
      pcHooks: Object.create(null),
    };

    for (let i = 0; i < 0x10000; i++) ctx.accessFunctionList[i] = ramAccess;
    return ctx;
  }

  function getPs(ctx) {
    return (ctx.cpu.ps | 0x20) & 0xff;
  }

  function getPsWithB(ctx, breakFlag) {
    let cPs = getPs(ctx) & ~FLAG_B;
    if (breakFlag) cPs |= FLAG_B;
    return cPs & 0xff;
  }

  function setPs(ctx, cPs) {
    // B is ignored when pulling from stack.
    ctx.cpu.ps = (ctx.cpu.ps & FLAG_B) | (cPs & FLAG_STACK_MASK);
  }

  function hasFlag(ps, flag) {
    return (ps & flag) !== 0;
  }

  function setFlag(ps, flag, enabled) {
    return enabled ? ps | flag : ps & ~flag;
  }

  function setZNBits(ps, value) {
    const v = value & 0xff;
    ps &= ~FLAG_NZ_MASK;
    ps |= v & FLAG_N;
    if (v === 0) ps |= FLAG_Z;
    return ps;
  }

  function setCompare(ps, left, right) {
    const lhs = left & 0xff;
    const rhs = right & 0xff;
    const diff = (lhs - rhs) & 0xff;
    ps = setFlag(ps, FLAG_C, lhs >= rhs);
    ps = setFlag(ps, FLAG_Z, diff === 0);
    ps = (ps & ~FLAG_N) | (diff & FLAG_N);
    return ps;
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

    cpu.ps |= FLAG_I;
    cpu.pc = ctx.ram[vectorAddr] | (ctx.ram[(vectorAddr + 1) & 0xffff] << 8);
  }

  function stall(ctx, cycles) {
    const target = ctx.cycleCounter + cycles;
    if (target > ctx.stallCycleCounter) ctx.stallCycleCounter = target;
  }

  function accumulatorAccess(ctx, value) {
    if (value != null) ctx.cpu.a = value & 0xff;
    return ctx.cpu.a & 0xff;
  }

  function ramAccess(ctx, value) {
    const addr = ctx.accessAddress & 0xffff;
    if (value != null) ctx.ram[addr] = value & 0xff;
    return ctx.ram[addr] & 0xff;
  }

  function romAccess(ctx, value) {
    void value;
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
    cpu.ps = (cpu.ps | FLAG_I) & ~(FLAG_D | FLAG_B);
    ctx.irqPending = 0;
    cpu.pc = ctx.ram[0xfffc] | (ctx.ram[0xfffd] << 8);
    ctx.cycleCounter += 7;
  }

  function irq(ctx) {
    const cpu = ctx.cpu;
    if (hasFlag(cpu.ps, FLAG_I)) {
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
    ctx.pageCrossed = ~~((base & 0xff00) !== (ctx.accessAddress & 0xff00));
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
    ctx.pageCrossed = ~~((base & 0xff00) !== (ctx.accessAddress & 0xff00));
  }
  function amAbsoluteY(ctx) {
    const lo = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    const hi = ctx.ram[ctx.cpu.pc & 0xffff];
    ctx.cpu.pc = (ctx.cpu.pc + 1) & 0xffff;
    const base = lo | (hi << 8);
    ctx.accessFunctionOverride = null;
    ctx.accessAddress = (base + ctx.cpu.y) & 0xffff;
    ctx.pageCrossed = ~~((base & 0xff00) !== (ctx.accessAddress & 0xff00));
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
    const addr = ctx.accessAddress & 0xffff;
    if (ctx.accessMode === ACCESS_MODE_RAM || ctx.accessMode === ACCESS_MODE_ROM) {
      return ctx.ram[addr] & 0xff;
    }
    return ctx.accessFunction(ctx, null) & 0xff;
  }
  function writeAccess(ctx, value) {
    const addr = ctx.accessAddress & 0xffff;
    const v = value & 0xff;
    if (ctx.accessMode === ACCESS_MODE_RAM) {
      ctx.ram[addr] = v;
      return v;
    }
    if (ctx.accessMode === ACCESS_MODE_ROM) {
      return ctx.ram[addr] & 0xff;
    }
    return ctx.accessFunction(ctx, v) & 0xff;
  }
  function setZN(ctx, value) {
    ctx.cpu.ps = setZNBits(ctx.cpu.ps, value);
  }
  function signed8(x) {
    x &= 0xff;
    return x & 0x80 ? x - 256 : x;
  }

  function adcValue(ctx, value) {
    const cpu = ctx.cpu;
    let ps = cpu.ps;
    value &= 0xff;
    if (hasFlag(ps, FLAG_D)) {
      const a = cpu.a & 0xff;
      const carryIn = ~~hasFlag(ps, FLAG_C);
      let sum = a + value + carryIn;
      const bin = sum & 0xff;
      ps = setFlag(ps, FLAG_V, !((a ^ value) & 0x80) && ((a ^ bin) & 0x80));

      if ((a & 0x0f) + (value & 0x0f) + carryIn > 9) sum += 0x06;
      const carryOut = sum > 0x99;
      ps = setFlag(ps, FLAG_C, carryOut);
      if (carryOut) sum += 0x60;

      cpu.a = sum & 0xff;
      ps = setZNBits(ps, bin);
    } else {
      const s = (cpu.a & 0xff) + value + ~~hasFlag(ps, FLAG_C);
      ps = setFlag(
        ps,
        FLAG_V,
        ((cpu.a ^ value) & 0x80) === 0 && ((cpu.a ^ s) & 0x80) !== 0,
      );
      cpu.a = s & 0xff;
      ps = setFlag(ps, FLAG_C, (s & 0x100) !== 0);
      ps = setZNBits(ps, cpu.a);
    }
    cpu.ps = ps;
  }

  function sbcValue(ctx, value) {
    const cpu = ctx.cpu;
    let ps = cpu.ps;
    value &= 0xff;
    if (hasFlag(ps, FLAG_D)) {
      const a = cpu.a & 0xff;
      const borrowIn = 1 ^ ~~hasFlag(ps, FLAG_C);
      let diff = a - value - borrowIn;
      const bin = diff & 0xff;
      const carry = (diff & 0x100) === 0; // carry==1 means no borrow
      ps = setFlag(ps, FLAG_V, ((a ^ bin) & (a ^ value) & 0x80) !== 0);

      if ((a & 0x0f) - borrowIn < (value & 0x0f)) diff -= 0x06;
      if (!carry) diff -= 0x60;

      cpu.a = diff & 0xff;
      ps = setFlag(ps, FLAG_C, carry);
      ps = setZNBits(ps, bin);
    } else {
      const a2 = cpu.a & 0xff;
      const d2 = a2 - value - (1 ^ ~~hasFlag(ps, FLAG_C));
      const res = d2 & 0xff;
      ps = setFlag(ps, FLAG_V, ((a2 ^ res) & (a2 ^ value) & 0x80) !== 0);
      cpu.a = res;
      ps = setFlag(ps, FLAG_C, (d2 & 0x100) === 0);
      ps = setZNBits(ps, cpu.a);
    }
    cpu.ps = ps;
  }

  // Opcode implementations (order matches 6502.c m_a6502OpcodeFunctionList)
  function opLDA(ctx) {
    ctx.cpu.a = readAccess(ctx);
    setZN(ctx, ctx.cpu.a);
    if (ctx.pageCrossed) ctx.cycleCounter++;
  }
  function opLDX(ctx) {
    ctx.cpu.x = readAccess(ctx);
    setZN(ctx, ctx.cpu.x);
    if (ctx.pageCrossed) ctx.cycleCounter++;
  }
  function opLDY(ctx) {
    ctx.cpu.y = readAccess(ctx);
    setZN(ctx, ctx.cpu.y);
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
    ctx.cpu.ps = setFlag(ctx.cpu.ps, FLAG_C, v & 0x80);
    v = (v << 1) & 0xff;
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opLSR(ctx) {
    let v = readAccess(ctx);
    ctx.cpu.ps = setFlag(ctx.cpu.ps, FLAG_C, v & 0x01);
    v = (v >> 1) & 0xff;
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opROL(ctx) {
    const oldCarry = ~~hasFlag(ctx.cpu.ps, FLAG_C);
    let v = readAccess(ctx);
    ctx.cpu.ps = setFlag(ctx.cpu.ps, FLAG_C, v & 0x80);
    v = ((v << 1) & 0xff) | oldCarry;
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opROR(ctx) {
    const oldCarry = ~~hasFlag(ctx.cpu.ps, FLAG_C);
    let v = readAccess(ctx);
    ctx.cpu.ps = setFlag(ctx.cpu.ps, FLAG_C, v & 0x01);
    v = (v >> 1) & 0xff;
    if (oldCarry) v |= 0x80;
    v = writeAccess(ctx, v);
    setZN(ctx, v);
  }
  function opBIT(ctx) {
    const cpu = ctx.cpu;
    const v = readAccess(ctx);
    let ps = cpu.ps;
    ps = setFlag(ps, FLAG_Z, (v & cpu.a) === 0);
    ps = (ps & ~(FLAG_V | FLAG_N)) | (v & (FLAG_V | FLAG_N));
    cpu.ps = ps;
  }
  function opCMP(ctx) {
    const cpu = ctx.cpu;
    const v = readAccess(ctx);
    cpu.ps = setCompare(cpu.ps, cpu.a, v);
    if (ctx.pageCrossed) ctx.cycleCounter++;
  }
  function opCPX(ctx) {
    const cpu = ctx.cpu;
    const v = readAccess(ctx);
    cpu.ps = setCompare(cpu.ps, cpu.x, v);
  }
  function opCPY(ctx) {
    const cpu = ctx.cpu;
    const v = readAccess(ctx);
    cpu.ps = setCompare(cpu.ps, cpu.y, v);
  }
  function opBCC(ctx) {
    if (!hasFlag(ctx.cpu.ps, FLAG_C)) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBCS(ctx) {
    if (hasFlag(ctx.cpu.ps, FLAG_C)) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBEQ(ctx) {
    if (hasFlag(ctx.cpu.ps, FLAG_Z)) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBMI(ctx) {
    if (hasFlag(ctx.cpu.ps, FLAG_N)) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBNE(ctx) {
    if (!hasFlag(ctx.cpu.ps, FLAG_Z)) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBPL(ctx) {
    if (!hasFlag(ctx.cpu.ps, FLAG_N)) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBVC(ctx) {
    if (!hasFlag(ctx.cpu.ps, FLAG_V)) {
      const oldPc = ctx.cpu.pc;
      ctx.cpu.pc = (ctx.cpu.pc + signed8(readAccess(ctx))) & 0xffff;
      ctx.cycleCounter++;
      if ((oldPc & 0xff00) !== (ctx.cpu.pc & 0xff00)) ctx.cycleCounter++;
    }
  }
  function opBVS(ctx) {
    if (hasFlag(ctx.cpu.ps, FLAG_V)) {
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
    ctx.cpu.ps &= ~FLAG_C;
  }
  function opCLD(ctx) {
    ctx.cpu.ps &= ~FLAG_D;
  }
  function opCLI(ctx) {
    ctx.cpu.ps &= ~FLAG_I;
  }
  function opCLV(ctx) {
    ctx.cpu.ps &= ~FLAG_V;
  }
  function opSEC(ctx) {
    ctx.cpu.ps |= FLAG_C;
  }
  function opSED(ctx) {
    ctx.cpu.ps |= FLAG_D;
  }
  function opSEI(ctx) {
    ctx.cpu.ps |= FLAG_I;
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
    ctx.cpu.ps = setFlag(ctx.cpu.ps, FLAG_C, v & 0x80);
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
    ctx.cpu.ps = setFlag(ctx.cpu.ps, FLAG_C, ctx.cpu.a & 0x01);
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
    ctx.cpu.ps = setFlag(ctx.cpu.ps, FLAG_C, v & 0x01);
    v = (v >> 1) & 0xff;
    ctx.cpu.a = (ctx.cpu.a ^ writeAccess(ctx, v)) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opRLA(ctx) {
    const oldCarry = ~~hasFlag(ctx.cpu.ps, FLAG_C);
    let v = readAccess(ctx);
    ctx.cpu.ps = setFlag(ctx.cpu.ps, FLAG_C, v & 0x80);
    v = ((v << 1) & 0xff) | oldCarry;
    v = writeAccess(ctx, v);
    ctx.cpu.a = ctx.cpu.a & v & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opAAC(ctx) {
    ctx.cpu.a = ctx.cpu.a & readAccess(ctx) & 0xff;
    setZN(ctx, ctx.cpu.a);
    ctx.cpu.ps = setFlag(ctx.cpu.ps, FLAG_C, hasFlag(ctx.cpu.ps, FLAG_N));
  }
  function opXAA(ctx) {
    ctx.cpu.a = ctx.cpu.x & 0xff;
    ctx.cpu.a = ctx.cpu.a & readAccess(ctx) & 0xff;
    setZN(ctx, ctx.cpu.a);
  }
  function opDCP(ctx) {
    const cpu = ctx.cpu;
    let v = (readAccess(ctx) - 1) & 0xff;
    v = writeAccess(ctx, v);
    cpu.ps = setCompare(cpu.ps, cpu.a, v);
  }
  function opRRA(ctx) {
    const oldCarry = ~~hasFlag(ctx.cpu.ps, FLAG_C);
    let v = readAccess(ctx);
    ctx.cpu.ps = setFlag(ctx.cpu.ps, FLAG_C, v & 0x01);
    v = (v >> 1) & 0xff;
    if (oldCarry) v |= 0x80;
    v = writeAccess(ctx, v);
    adcValue(ctx, v);
  }
  function opSBX(ctx) {
    const cpu = ctx.cpu;
    const base = (cpu.a & cpu.x) & 0xff;
    const imm = readAccess(ctx) & 0xff;
    const diff = base - imm;
    cpu.ps = setFlag(cpu.ps, FLAG_C, diff >= 0);
    cpu.x = diff & 0xff;
    setZN(ctx, cpu.x);
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
  const OPCODE_ADDRESS_FUNCS = new Array(256);
  const OPCODE_EXEC_FUNCS = new Array(256);
  const OPCODE_BASE_CYCLES = new Uint8Array(256);

  for (let i = 0; i < 256; i++) {
    const meta = CODE_TABLE[i];
    OPCODE_ADDRESS_FUNCS[i] = ADDRESS_FUNCS[meta.addressType];
    OPCODE_EXEC_FUNCS[i] = OPCODE_FUNCS[meta.opcodeId];
    OPCODE_BASE_CYCLES[i] = meta.cycles & 0xff;
  }

  function run(ctx, cycleTarget) {
    const cpu = ctx.cpu;
    const ram = ctx.ram;
    const accessFunctionList = ctx.accessFunctionList;
    const pcHooks = ctx.pcHooks;
    let cycles = ctx.cycleCounter;
    while (cycles < cycleTarget) {
      if (
        ctx.ioCycleTimedEventFunction &&
        ctx.cycleCounter >= ctx.ioCycleTimedEventCycle
      ) {
        ctx.ioCycleTimedEventFunction(ctx);
      }

      if (ctx.cycleCounter >= ctx.stallCycleCounter) {
        if (ctx.irqPending && !hasFlag(cpu.ps, FLAG_I)) irq(ctx);

        const hook = pcHooks[cpu.pc];
        if (hook && hook(ctx)) { cycles = ctx.cycleCounter; continue; }

        const opcode = ram[cpu.pc & 0xffff] & 0xff;
        cpu.pc = (cpu.pc + 1) & 0xffff;

        ctx.accessFunctionOverride = null;
        ctx.accessFunction = null;
        ctx.accessMode = ACCESS_MODE_FN;
        ctx.pageCrossed = 0;

        OPCODE_ADDRESS_FUNCS[opcode](ctx);

        if (ctx.accessFunctionOverride) {
          ctx.accessFunction = ctx.accessFunctionOverride;
        } else {
          const addr = ctx.accessAddress & 0xffff;
          const accessFn = accessFunctionList[addr];
          if (accessFn === ramAccess) {
            ctx.accessMode = ACCESS_MODE_RAM;
          } else if (accessFn === romAccess) {
            ctx.accessMode = ACCESS_MODE_ROM;
          } else {
            ctx.accessFunction = accessFn;
          }
        }

        OPCODE_EXEC_FUNCS[opcode](ctx);

        ctx.cycleCounter += OPCODE_BASE_CYCLES[opcode];
        cycles = ctx.cycleCounter;
      } else {
        let stallTarget = ctx.stallCycleCounter;
        if (stallTarget > cycleTarget) stallTarget = cycleTarget;
        if (
          ctx.ioCycleTimedEventFunction &&
          ctx.ioCycleTimedEventCycle < stallTarget
        ) {
          stallTarget = ctx.ioCycleTimedEventCycle;
        }
        if (stallTarget <= ctx.cycleCounter) stallTarget = ctx.cycleCounter + 1;
        ctx.cycleCounter = stallTarget;
        cycles = stallTarget;
      }
    }
    return ctx.cycleCounter;
  }

  function setPcHook(ctx, addr, fn) {
    ctx.pcHooks[addr & 0xffff] = fn;
  }

  function clearPcHook(ctx, addr) {
    delete ctx.pcHooks[addr & 0xffff];
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
    setPcHook: setPcHook,
    clearPcHook: clearPcHook,
    // exposed for debugging/tests
    getPs: getPs,
    setPs: setPs,
    BCD_TO_BIN: BCD_TO_BIN,
    BIN_TO_BCD: BIN_TO_BCD,
  };
})();
