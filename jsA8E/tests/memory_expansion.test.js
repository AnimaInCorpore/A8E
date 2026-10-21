/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PROGRAM_ADDRESS = 0x2000;
const FLAG_I = 0x04;

// AHRM 2.7, Table 1.
const PROFILES = [
  { name: "130xe", bankMask: 0x0c, separateAnticWindow: true },
  { name: "rambo-192k", bankMask: 0x4c, separateAnticWindow: false },
  { name: "rambo-320k", bankMask: 0x6c, separateAnticWindow: false },
  { name: "compy-320k", bankMask: 0xcc, separateAnticWindow: true },
  { name: "rambo-576k", bankMask: 0x6e, separateAnticWindow: false },
  { name: "compy-576k", bankMask: 0xce, separateAnticWindow: true },
  { name: "rambo-1088k", bankMask: 0xee, separateAnticWindow: false },
];

// CPU, I/O and the memory runtime with stand-in ROMs: OS $11, self-test $44,
// floating point $22 (reset vector $C2AA), BASIC $33.
function loadMachine(profile) {
  const context = {
    console: console,
    Math: Math,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Boolean: Boolean,
    JSON: JSON,
    Date: Date,
    Error: Error,
    Infinity: Infinity,
    ArrayBuffer: ArrayBuffer,
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
  for (const file of ["hw.js", "cpu_tables.js", "cpu.js", "state.js", "io.js", "memory.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", "js", "core", file), "utf8");
    vm.runInContext(source, context, { filename: file });
  }

  const hw = context.A8EHw.createApi();
  const CPU = context.A8E6502;
  const state = context.A8EState.createApi({
    CPU: CPU,
    CYCLES_PER_LINE: hw.CYCLES_PER_LINE,
    CYCLE_NEVER: hw.CYCLE_NEVER,
    IO_INIT_VALUES: hw.IO_INIT_VALUES,
    ioRegisterAddress: hw.ioRegisterAddress,
  });
  const noop = function () {};
  const io = context.A8EIo.createApi(
    Object.assign({}, hw, {
      CPU: CPU,
      pokeyAudioSync: noop,
      pokeyAudioOnRegisterWrite: noop,
      pokeyPotPrepareSkctlWrite: noop,
      pokeyPotStartScan: noop,
      pokeyRestartTimers: noop,
      pokeyArmInactiveTimers: noop,
      pokeySyncLfsr17: noop,
      pokeySeroutWrite: noop,
      pokeySerinRead: function () {
        return 0;
      },
      pokeyPotUpdate: noop,
    }),
  );
  const machine = {
    ctx: CPU.makeContext(),
    media: {},
    audioState: null,
    audioMode: "none",
    audioNode: null,
    memoryExpansion: profile,
  };
  const runtime = context.A8EMemory.createApi({
    CPU: CPU,
    IO_PORTB: hw.IO_PORTB,
    DEFAULT_PORTB: 0xfd,
  }).createRuntime({
    machine: machine,
    video: {},
    ioCycleTimedEvent: noop,
    makeIoData: state.makeIoData,
    cycleTimedEventUpdate: noop,
    initHardwareDefaults: state.initHardwareDefaults,
    installIoHandlers: state.installIoHandlers,
    ioAccess: io.ioAccess,
    getOptionOnStart: function () {
      return false;
    },
    getSioTurbo: function () {
      return false;
    },
    getTurbo: function () {
      return false;
    },
    pokeyAudioResetState: noop,
    pokeyAudioSetTurbo: noop,
    createExtendedMemory: io.createExtendedMemory,
    basicRomMapped: io.basicRomMapped,
    selfTestRomMapped: io.selfTestRomMapped,
    refreshAnticWindow: io.refreshAnticWindow,
  });
  machine.ctx.ioData = state.makeIoData({});
  const osRom = new Uint8Array(0x4000);
  osRom.fill(0x11, 0x0000, 0x1000);
  osRom.fill(0x44, 0x1000, 0x1800);
  osRom.fill(0x22, 0x1800, 0x4000);
  osRom[0x3ffc] = 0xaa;
  osRom[0x3ffd] = 0xc2;
  runtime.loadOsRom(osRom.buffer);
  runtime.loadBasicRom(new Uint8Array(0x2000).fill(0x33).buffer);
  runtime.hardReset();
  return { CPU: CPU, hw: hw, io: io, machine: machine, runtime: runtime };
}

function executeAbsolute(system, opcode, address) {
  const ctx = system.machine.ctx;
  ctx.ram[PROGRAM_ADDRESS] = opcode;
  ctx.ram[PROGRAM_ADDRESS + 1] = address & 0xff;
  ctx.ram[PROGRAM_ADDRESS + 2] = (address >> 8) & 0xff;
  ctx.cpu.pc = PROGRAM_ADDRESS;
  ctx.cpu.ps |= FLAG_I;
  ctx.stallCycleCounter = 0;
  system.CPU.executeOne(ctx);
}

function cpuWrite(system, address, value) {
  system.machine.ctx.cpu.a = value & 0xff;
  executeAbsolute(system, 0x8d, address); // STA abs
}

function cpuRead(system, address) {
  executeAbsolute(system, 0xad, address); // LDA abs
  return system.machine.ctx.cpu.a;
}

function anticRead(system, address) {
  return system.io.anticRead(system.machine.ctx, address);
}

// Port B as the OS sets it up: ORB=$FF before DDRB=$FF, so the pins never
// leave $FF, then the output register stays selected.
function enablePortBOutputs(system) {
  const hw = system.hw;
  cpuWrite(system, hw.IO_PBCTL, 0x3c);
  cpuWrite(system, hw.IO_PORTB, 0xff);
  cpuWrite(system, hw.IO_PBCTL, 0x38);
  cpuWrite(system, hw.IO_PORTB, 0xff);
  cpuWrite(system, hw.IO_PBCTL, 0x3c);
}

// PORTB for a bank with the OS on, BASIC and self-test off unless their bits
// select the bank, and both windows on.
function portBForBank(profile, bank) {
  let portB = (0x83 & ~profile.bankMask) & 0xff;
  let rest = bank;
  for (let bit = 0x01; bit <= 0x80; bit <<= 1) {
    if (profile.bankMask & bit) {
      if (rest & 1) portB |= bit;
      rest >>= 1;
    }
  }
  return portB;
}

function bankCount(profile) {
  let banks = 1;
  for (let bit = 0x01; bit <= 0x80; bit <<= 1) {
    if (profile.bankMask & bit) banks <<= 1;
  }
  return banks;
}

function testBanksOfEveryProfile() {
  for (const profile of PROFILES) {
    const system = loadMachine(profile.name);
    const IO_PORTB = system.hw.IO_PORTB;
    enablePortBOutputs(system);
    cpuWrite(system, 0x4000, 0xa5);
    cpuWrite(system, 0x7fff, 0x5a);

    // Every bank keeps its own contents (AHRM 2.7).
    const banks = bankCount(profile);
    for (let bank = 0; bank < banks; bank++) {
      cpuWrite(system, IO_PORTB, portBForBank(profile, bank));
      cpuWrite(system, 0x4000, bank);
      cpuWrite(system, 0x7fff, ~bank & 0xff);
    }
    for (let bank = banks - 1; bank >= 0; bank--) {
      cpuWrite(system, IO_PORTB, portBForBank(profile, bank));
      assert.equal(cpuRead(system, 0x4000), bank, profile.name + " bank " + bank + " at $4000");
      assert.equal(cpuRead(system, 0x7fff), ~bank & 0xff, profile.name + " bank " + bank + " at $7FFF");
      assert.equal(anticRead(system, 0x4000), bank, profile.name + " ANTIC bank " + bank);
    }

    // Closing the CPU window brings main memory back. ANTIC keeps bank 1
    // only where bit 5 enables its own window.
    cpuWrite(system, IO_PORTB, portBForBank(profile, 1) | 0x10);
    assert.equal(cpuRead(system, 0x4000), 0xa5, profile.name + " main memory $4000");
    assert.equal(cpuRead(system, 0x7fff), 0x5a, profile.name + " main memory $7FFF");
    assert.equal(
      anticRead(system, 0x4000),
      profile.separateAnticWindow ? 0x01 : 0xa5,
      profile.name + " ANTIC view with only its own window on",
    );
  }
}

// 130XE: bit 4 opens the CPU window and bit 5 the ANTIC window (AHRM 2.7).
function testSeparateAnticWindow() {
  const system = loadMachine("130xe");
  const IO_PORTB = system.hw.IO_PORTB;
  enablePortBOutputs(system);
  cpuWrite(system, 0x6000, 0x11);
  cpuWrite(system, IO_PORTB, 0xe3); // bank 0, CPU window only
  cpuWrite(system, 0x6000, 0x22);
  assert.equal(anticRead(system, 0x6000), 0x11, "ANTIC should read main memory");
  cpuWrite(system, IO_PORTB, 0xd3); // bank 0, ANTIC window only
  assert.equal(cpuRead(system, 0x6000), 0x11, "the CPU should read main memory");
  assert.equal(anticRead(system, 0x6000), 0x22, "ANTIC should read bank 0");
}

// 1088K reuses bits 1 and 7: BASIC and self-test are off while the CPU
// window is on, and follow the bits again once it is off (AHRM 2.7).
function testReusedBitsForceRomsOffInTheWindow() {
  const system = loadMachine("rambo-1088k");
  const IO_PORTB = system.hw.IO_PORTB;
  const ram = system.machine.ctx.ram;
  enablePortBOutputs(system);
  cpuWrite(system, IO_PORTB, 0x71); // bits 1 and 7 low: BASIC and self-test on
  assert.equal(ram[0xa000], 0x33, "PORTB $71 should map BASIC");
  assert.equal(ram[0x5000], 0x44, "PORTB $71 should map the self-test ROM");
  cpuWrite(system, IO_PORTB, 0x61); // same bits, CPU window on
  cpuWrite(system, 0xa000, 0x5a);
  cpuWrite(system, 0x5000, 0x5a);
  assert.equal(ram[0xa000], 0x5a, "BASIC must be off in the window");
  assert.equal(ram[0x5000], 0x5a, "the self-test ROM must be off in the window");
  cpuWrite(system, IO_PORTB, 0x71);
  assert.equal(ram[0xa000], 0x33, "BASIC should come back");
  assert.equal(ram[0x5000], 0x44, "the self-test ROM should come back");
}

// A mapped self-test ROM wins over the window at $5000-$57FF: reads come
// from the ROM and writes leave the bank alone (AHRM 2.7).
function testSelfTestRomHasPriorityOverTheWindow() {
  const system = loadMachine("130xe");
  const IO_PORTB = system.hw.IO_PORTB;
  enablePortBOutputs(system);
  cpuWrite(system, IO_PORTB, 0xef); // bank 3, self-test off
  cpuWrite(system, 0x5000, 0x77);
  cpuWrite(system, IO_PORTB, 0x6f); // bank 3, self-test on
  assert.equal(cpuRead(system, 0x5000), 0x44, "the self-test ROM should hide the window");
  cpuWrite(system, 0x5000, 0x88);
  cpuWrite(system, IO_PORTB, 0xeb); // bank 2
  cpuWrite(system, IO_PORTB, 0xef); // bank 3, self-test off
  assert.equal(cpuRead(system, 0x5000), 0x77, "bank 3 under the self-test ROM must keep its byte");
}

// The Reset key resets the PIA: the pull-ups close the window, and the
// banks keep their contents (AHRM 2.4, 2.7).
function testResetClosesTheWindowAndKeepsTheBanks() {
  const system = loadMachine("rambo-320k");
  const IO_PORTB = system.hw.IO_PORTB;
  enablePortBOutputs(system);
  cpuWrite(system, 0x4000, 0x11);
  cpuWrite(system, IO_PORTB, 0x87); // bank 1
  cpuWrite(system, 0x4000, 0x42);
  system.io.warmReset(system.machine.ctx);
  assert.equal(cpuRead(system, 0x4000), 0x11, "reset should show main memory");
  enablePortBOutputs(system);
  cpuWrite(system, IO_PORTB, 0x87);
  assert.equal(cpuRead(system, 0x4000), 0x42, "bank 1 should survive the reset");
}

// Snapshots carry the banks, the hidden main memory and the ANTIC view, and
// the profile stays on for later power cycles.
function testSnapshotKeepsTheBanks() {
  const system = loadMachine("130xe");
  const IO_PORTB = system.hw.IO_PORTB;
  enablePortBOutputs(system);
  cpuWrite(system, 0x4000, 0x11);
  cpuWrite(system, IO_PORTB, 0xe7); // bank 1, CPU window only
  cpuWrite(system, 0x4000, 0x42);
  const snapshot = system.runtime.exportSnapshotState();

  system.machine.memoryExpansion = "none";
  system.runtime.hardReset();
  system.runtime.importSnapshotState(snapshot);
  assert.equal(system.machine.memoryExpansion, "130xe", "the snapshot's profile should stay on");
  assert.equal(cpuRead(system, 0x4000), 0x42, "the CPU should see bank 1 again");
  assert.equal(anticRead(system, 0x4000), 0x11, "ANTIC should see main memory again");
  cpuWrite(system, IO_PORTB, 0xf7); // CPU window off
  assert.equal(cpuRead(system, 0x4000), 0x11, "main memory should come back");
  cpuWrite(system, IO_PORTB, 0xe7);
  assert.equal(cpuRead(system, 0x4000), 0x42, "bank 1 should keep its byte");
}

// RAM under a banked-out ROM holds what the CPU wrote there; restoring a
// snapshot must not replace it with the stale copy from when the ROM was in.
function testSnapshotKeepsRamUnderBankedOutRoms() {
  const system = loadMachine("none");
  const IO_PORTB = system.hw.IO_PORTB;
  enablePortBOutputs(system);
  cpuWrite(system, IO_PORTB, 0xfd); // BASIC in
  cpuWrite(system, IO_PORTB, 0xfe); // BASIC and OS out
  cpuWrite(system, 0xa000, 0x5a);
  cpuWrite(system, 0xc000, 0xa5);
  const snapshot = system.runtime.exportSnapshotState();
  system.runtime.hardReset();
  system.runtime.importSnapshotState(snapshot);
  assert.equal(cpuRead(system, 0xa000), 0x5a, "RAM under BASIC should survive the snapshot");
  assert.equal(cpuRead(system, 0xc000), 0xa5, "RAM under the OS should survive the snapshot");
}

testBanksOfEveryProfile();
testSeparateAnticWindow();
testReusedBitsForceRomsOffInTheWindow();
testSelfTestRomHasPriorityOverTheWindow();
testResetClosesTheWindowAndKeepsTheBanks();
testSnapshotKeepsTheBanks();
testSnapshotKeepsRamUnderBankedOutRoms();

console.log("memory_expansion tests passed");
