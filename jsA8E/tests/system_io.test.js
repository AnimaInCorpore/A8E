/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PROGRAM_ADDRESS = 0x2000;

// Loads the CPU, register defaults, and the I/O dispatcher without ROMs.
function loadSystem() {
  const context = {
    console: console,
    Math: Math,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Boolean: Boolean,
    JSON: JSON,
    Infinity: Infinity,
    Uint8Array: Uint8Array,
    Uint16Array: Uint16Array,
    Uint32Array: Uint32Array,
    Int16Array: Int16Array,
    Int32Array: Int32Array,
    Float32Array: Float32Array,
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["hw.js", "cpu_tables.js", "cpu.js", "state.js", "io.js"]) {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "js", "core", file),
      "utf8",
    );
    vm.runInContext(source, context, { filename: file });
  }

  const hw = context.window.A8EHw.createApi();
  const CPU = context.window.A8E6502;
  const state = context.window.A8EState.createApi({
    CPU: CPU,
    CYCLES_PER_LINE: hw.CYCLES_PER_LINE,
    CYCLE_NEVER: hw.CYCLE_NEVER,
    IO_INIT_VALUES: hw.IO_INIT_VALUES,
    ioRegisterAddress: hw.ioRegisterAddress,
  });
  const noop = function () {};
  const io = context.window.A8EIo.createApi(
    Object.assign({}, hw, {
      CPU: CPU,
      pokeyAudioSync: noop,
      pokeyAudioOnRegisterWrite: noop,
      pokeyPotPrepareSkctlWrite: noop,
      pokeyPotStartScan: noop,
      pokeyRestartTimers: noop,
      pokeySyncLfsr17: noop,
      pokeySeroutWrite: noop,
      pokeySerinRead: function () {
        return 0;
      },
      pokeyPotUpdate: noop,
    }),
  );

  const ctx = CPU.makeContext();
  ctx.ioData = state.makeIoData({});
  state.initHardwareDefaults(ctx);
  state.installIoHandlers(ctx, io.ioAccess);
  return { CPU: CPU, hw: hw, ctx: ctx, io: io };
}

const FLAG_I = 0x04;

// Run one absolute-mode instruction through the CPU's normal I/O dispatch.
// IRQs are masked so a pending IRQ cannot preempt it.
function executeAbsolute(system, opcode, address) {
  const ctx = system.ctx;
  ctx.ram[PROGRAM_ADDRESS] = opcode;
  ctx.ram[PROGRAM_ADDRESS + 1] = address & 0xff;
  ctx.ram[PROGRAM_ADDRESS + 2] = (address >> 8) & 0xff;
  ctx.cpu.pc = PROGRAM_ADDRESS;
  ctx.cpu.ps |= FLAG_I;
  ctx.stallCycleCounter = 0;
  system.CPU.executeOne(ctx);
}

function cpuWrite(system, address, value) {
  system.ctx.cpu.a = value & 0xff;
  executeAbsolute(system, 0x8d, address); // STA abs
}

function cpuRead(system, address) {
  executeAbsolute(system, 0xad, address); // LDA abs
  return system.ctx.cpu.a;
}

function testPortAPowerOnState() {
  const system = loadSystem();
  const hw = system.hw;

  // AHRM 2.5/14.5: reset clears DDRA, ORA and PACTL, so PORTA starts on
  // the direction register with all bits as inputs.
  assert.equal(system.ctx.sram[hw.IO_PORTA], 0x00, "ORA should power on as $00");
  assert.equal(cpuRead(system, hw.IO_PORTA), 0x00, "DDRA should read $00 at power-on");

  cpuWrite(system, hw.IO_PACTL, 0x3c);
  assert.equal(
    cpuRead(system, hw.IO_PORTA),
    0xff,
    "all-input PORTA should read the idle joystick lines",
  );
}

function testPortAOutputBitsReadAsAndOfOraAndInput() {
  const system = loadSystem();
  const hw = system.hw;
  const ram = system.ctx.ram;

  // Caverns of Mars setup (AHRM 2.9): upper four bits as outputs driven low.
  cpuWrite(system, hw.IO_PACTL, 0x38);
  cpuWrite(system, hw.IO_PORTA, 0xf0);
  cpuWrite(system, hw.IO_PACTL, 0x3c);
  cpuWrite(system, hw.IO_PORTA, 0x00);
  assert.equal(cpuRead(system, hw.IO_PORTA), 0x0f, "DDRA=$F0 ORA=$00 should read $0F");

  // Jack 1 up (bit 0 low) still reads through the input bits.
  ram[hw.IO_PORTA] &= ~0x01;
  assert.equal(cpuRead(system, hw.IO_PORTA), 0x0e, "joystick up should read $0E");
  ram[hw.IO_PORTA] |= 0x01;

  // Output bits driven high read back the external line state.
  cpuWrite(system, hw.IO_PORTA, 0x50);
  assert.equal(cpuRead(system, hw.IO_PORTA), 0x5f, "DDRA=$F0 ORA=$50 should read $5F");

  ram[hw.IO_PORTA] &= ~0x10; // external device pulls bit 4 low
  cpuWrite(system, hw.IO_PORTA, 0xf0);
  assert.equal(
    cpuRead(system, hw.IO_PORTA),
    0xef,
    "an output bit pulled low externally should read 0",
  );
  ram[hw.IO_PORTA] |= 0x10;

  // The direction register itself still reads back as written.
  cpuWrite(system, hw.IO_PACTL, 0x38);
  assert.equal(cpuRead(system, hw.IO_PORTA), 0xf0, "DDRA should read back $F0");
}

function testRegisterMirrorsShareCanonicalRegisters() {
  const system = loadSystem();
  const hw = system.hw;
  const ctx = system.ctx;

  // Bounty Bob Strikes Back! polls VCOUNT through $D47B (AHRM 4.16).
  ctx.ram[hw.IO_VCOUNT] = 0x42;
  assert.equal(cpuRead(system, 0xd47b), 0x42, "$D47B should mirror VCOUNT");

  ctx.ram[hw.IO_STIMER_KBCODE] = 0x3f;
  assert.equal(cpuRead(system, 0xd2f9), 0x3f, "$D2F9 should mirror KBCODE");

  assert.equal(cpuRead(system, 0xd0f4), 0x01, "$D0F4 should mirror the PAL register");

  cpuWrite(system, 0xd4f4, 0x07);
  assert.equal(ctx.sram[hw.IO_HSCROL], 0x07, "a write to $D4F4 should reach HSCROL");

  // PIA registers repeat every 4 bytes.
  cpuWrite(system, 0xd3fe, 0x38); // PACTL: select DDRA
  cpuWrite(system, 0xd3fc, 0xf0); // DDRA = $F0
  assert.equal(cpuRead(system, hw.IO_PORTA), 0xf0, "PIA mirror writes should reach DDRA");
  assert.equal(
    cpuRead(system, 0xd306),
    cpuRead(system, hw.IO_PACTL),
    "$D306 should read PACTL like $D302",
  );
}

function testUnassignedAddressesReadPulledUpValues() {
  const system = loadSystem();
  const hw = system.hw;
  const ctx = system.ctx;

  // Undecoded pages and unassigned ANTIC/POKEY registers (AHRM 2.3, 4.1, 5.1).
  const pulledUp = [
    0xd100, 0xd1ff, 0xd20c, 0xd2fc, 0xd406, 0xd408, 0xd4f6, 0xd500, 0xd5ff,
    0xd600, 0xd7ff,
  ];
  for (const address of pulledUp) {
    assert.equal(
      cpuRead(system, address),
      0xff,
      "$" + address.toString(16) + " should read the pulled-up bus",
    );
  }

  // Write-only GTIA registers read $0F (AHRM 6.1, Table 13).
  for (let address = 0xd015; address <= 0xd01e; address++) {
    assert.equal(cpuRead(system, address), 0x0f, "$" + address.toString(16) + " should read $0F");
    assert.equal(
      cpuRead(system, address + 0x20),
      0x0f,
      "$" + (address + 0x20).toString(16) + " should read $0F",
    );
  }

  // NMIST bits 4-0 always read 1 (AHRM 14.6).
  assert.equal(cpuRead(system, hw.IO_NMIRES_NMIST), 0x1f, "idle NMIST should read $1F");
  ctx.ram[hw.IO_NMIRES_NMIST] |= 0x80;
  assert.equal(cpuRead(system, hw.IO_NMIRES_NMIST), 0x9f, "NMIST with DLI should read $9F");
  cpuWrite(system, hw.IO_NMIRES_NMIST, 0x00);
  assert.equal(cpuRead(system, hw.IO_NMIRES_NMIST), 0x1f, "NMIRES should leave NMIST at $1F");
}

function testResetKeyResetsAnticAndPia() {
  const system = loadSystem();
  const hw = system.hw;
  const ctx = system.ctx;
  const ram = ctx.ram;
  const sram = ctx.sram;

  // Stand-in ROM images; the FP ROM image ends with the OS reset vector.
  const io = ctx.ioData;
  io.osRom = new Uint8Array(0x1000).fill(0x11);
  io.floatingPointRom = new Uint8Array(0x2800).fill(0x22);
  io.floatingPointRom[0x27fc] = 0xaa;
  io.floatingPointRom[0x27fd] = 0xc2;
  io.basicRom = new Uint8Array(0x2000).fill(0x33);
  io.selfTestRom = new Uint8Array(0x800).fill(0x44);

  // A program banks BASIC and the OS out, leaves data under both, points
  // the RAM reset vector at itself and runs with display DMA and NMIs on.
  cpuWrite(system, hw.IO_PBCTL, 0x3c);
  cpuWrite(system, hw.IO_PORTB, 0xff); // BASIC out
  cpuWrite(system, 0xa000, 0x77);
  cpuWrite(system, hw.IO_PORTB, 0xfe); // OS out as well
  cpuWrite(system, 0xc000, 0x5a);
  cpuWrite(system, 0xfffc, 0x80);
  cpuWrite(system, 0xfffd, 0x06);
  cpuWrite(system, 0x0600, 0xa5);
  cpuWrite(system, hw.IO_NMIEN, 0xc0);
  cpuWrite(system, hw.IO_DMACTL, 0x22);
  cpuWrite(system, hw.IO_PACTL, 0x38);
  cpuWrite(system, hw.IO_PORTA, 0xf0); // DDRA
  cpuWrite(system, hw.IO_PACTL, 0x3c);
  cpuWrite(system, hw.IO_PORTA, 0x55); // ORA

  system.io.warmReset(ctx);

  // AHRM 2.4-2.6, 4.1: the PIA reset maps the OS back in, so the CPU takes
  // the OS reset vector instead of the program's RAM vector.
  assert.equal(ctx.cpu.pc, 0xc2aa, "reset should start at the OS reset vector");
  assert.equal(ram[0xc000], 0x11, "reset should map the OS ROM back in");
  assert.equal(sram[hw.IO_NMIEN], 0x00, "reset should clear NMIEN");
  assert.equal(sram[hw.IO_DMACTL], 0x00, "reset should clear DMACTL");
  assert.equal(cpuRead(system, hw.IO_PACTL), 0x00, "PACTL should read $00 after reset");
  assert.equal(cpuRead(system, hw.IO_PBCTL), 0x00, "PBCTL should read $00 after reset");
  assert.equal(cpuRead(system, hw.IO_PORTA), 0x00, "DDRA should read $00 after reset");
  assert.equal(sram[hw.IO_PORTA], 0x00, "ORA should be $00 after reset");

  // RAM survives a warm reset, including the RAM under the ROMs.
  assert.equal(ram[0x0600], 0xa5, "reset must not clear main RAM");
  assert.equal(ram[0xa000], 0x77, "reset must leave BASIC mapped out");
  cpuWrite(system, hw.IO_PBCTL, 0x3c);
  cpuWrite(system, hw.IO_PORTB, 0xfe);
  assert.equal(ram[0xc000], 0x5a, "RAM under the OS ROM should survive reset");
}

function testTrig3ReportsNoCartridge() {
  const system = loadSystem();
  // AHRM 2.8: TRIG3 is the cartridge sense line; the internal BASIC does not set it.
  assert.equal(cpuRead(system, 0xd013), 0x00, "TRIG3 should read 0 without a cartridge");
  assert.equal(cpuRead(system, 0xd033), 0x00, "TRIG3 mirror should read 0");
}

function testPokeyIrqLatchesOnlyEnabledSources() {
  const system = loadSystem();
  const hw = system.hw;
  const ctx = system.ctx;

  // AHRM 14.4: IRQST is active low; bit 3 reads 0 while serial output is idle.
  assert.equal(cpuRead(system, hw.IO_IRQEN_IRQST), 0xf7, "idle IRQST should read $F7");
  assert.equal(ctx.irqPending, 0, "the IRQ line should be released at power-on");

  // AHRM 5.7: events of a disabled source are lost. A timer that fires with
  // only the keyboard IRQ enabled must not show up in IRQST, or the OS
  // dispatcher sends the next key press to the timer vector.
  cpuWrite(system, hw.IO_IRQEN_IRQST, hw.IRQ_OTHER_KEY_PRESSED);
  system.io.raisePokeyIrq(ctx, hw.IRQ_TIMER_1);
  assert.equal(cpuRead(system, hw.IO_IRQEN_IRQST), 0xf7, "a disabled timer must not latch IRQST");
  assert.equal(ctx.irqPending, 0, "a disabled timer must not assert the IRQ line");

  system.io.raisePokeyIrq(ctx, hw.IRQ_OTHER_KEY_PRESSED);
  assert.equal(cpuRead(system, hw.IO_IRQEN_IRQST), 0xb7, "an enabled key IRQ should latch bit 6");
  assert.equal(ctx.irqPending, 1, "an enabled key IRQ should assert the IRQ line");

  // Clearing the IRQEN bit resets the status bit and releases the line.
  cpuWrite(system, hw.IO_IRQEN_IRQST, 0x00);
  assert.equal(cpuRead(system, hw.IO_IRQEN_IRQST), 0xf7, "IRQEN=0 should reset the status bits");
  assert.equal(ctx.irqPending, 0, "IRQEN=0 should release the IRQ line");
}

function testIrqLineIsALevelNotACount() {
  const system = loadSystem();
  const hw = system.hw;
  const ctx = system.ctx;
  ctx.ram[0xfffe] = 0x00; // IRQ vector -> $3000
  ctx.ram[0xffff] = 0x30;

  // Three key IRQs while I is set, acknowledged once: no stale IRQs follow.
  cpuWrite(system, hw.IO_IRQEN_IRQST, hw.IRQ_OTHER_KEY_PRESSED);
  system.io.raisePokeyIrq(ctx, hw.IRQ_OTHER_KEY_PRESSED);
  system.io.raisePokeyIrq(ctx, hw.IRQ_OTHER_KEY_PRESSED);
  system.io.raisePokeyIrq(ctx, hw.IRQ_OTHER_KEY_PRESSED);
  cpuWrite(system, hw.IO_IRQEN_IRQST, 0x00);
  cpuWrite(system, hw.IO_IRQEN_IRQST, hw.IRQ_OTHER_KEY_PRESSED);
  ctx.cpu.ps &= ~FLAG_I;
  ctx.ram[PROGRAM_ADDRESS] = 0xea; // NOP
  ctx.cpu.pc = PROGRAM_ADDRESS;
  system.CPU.executeOne(ctx);
  assert.equal(ctx.cpu.pc, PROGRAM_ADDRESS + 1, "no stale IRQ may fire after the acknowledge");

  // A pending source keeps the line asserted: the CPU enters the handler,
  // and the I flag (not the line) keeps it from re-entering.
  system.io.raisePokeyIrq(ctx, hw.IRQ_OTHER_KEY_PRESSED);
  ctx.cpu.pc = PROGRAM_ADDRESS;
  system.CPU.executeOne(ctx);
  assert.equal(ctx.cpu.pc, 0x3000, "a pending key IRQ should be taken");
  assert.equal(ctx.irqPending, 1, "taking the IRQ must not consume the line level");
  assert.notEqual(ctx.cpu.ps & FLAG_I, 0, "IRQ entry should set I");
}

function testSerialOutputCompleteIsUnlatched() {
  const system = loadSystem();
  const hw = system.hw;
  const ctx = system.ctx;

  // AHRM 14.4: enabling IRQEN bit 3 while serial output is idle fires at once.
  cpuWrite(system, hw.IO_IRQEN_IRQST, hw.IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE);
  assert.equal(ctx.irqPending, 1, "IRQEN bit 3 with idle serial output should assert the IRQ line");

  // A byte shifting out makes bit 3 read 1 and releases the line.
  cpuWrite(system, hw.IO_SEROUT_SERIN, 0x00);
  assert.equal(cpuRead(system, hw.IO_IRQEN_IRQST), 0xff, "busy serial output should read IRQST $FF");
  assert.equal(ctx.irqPending, 0, "busy serial output should release the IRQ line");

  // Bit 3 is not latched: IRQEN writes do not change it.
  system.io.setSerialOutputIdle(ctx, true);
  assert.equal(ctx.irqPending, 1, "transmission complete should assert the IRQ line");
  cpuWrite(system, hw.IO_IRQEN_IRQST, 0x00);
  assert.equal(cpuRead(system, hw.IO_IRQEN_IRQST), 0xf7, "IRQEN=0 must not change the unlatched bit 3");
  assert.equal(ctx.irqPending, 0, "IRQEN=0 should release the IRQ line");
}

testPortAPowerOnState();
testPortAOutputBitsReadAsAndOfOraAndInput();
testPokeyIrqLatchesOnlyEnabledSources();
testIrqLineIsALevelNotACount();
testSerialOutputCompleteIsUnlatched();
testResetKeyResetsAnticAndPia();
testTrig3ReportsNoCartridge();
testRegisterMirrorsShareCanonicalRegisters();
testUnassignedAddressesReadPulledUpValues();

console.log("system_io tests passed");
