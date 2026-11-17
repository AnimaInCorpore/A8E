/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PROGRAM_ADDRESS = 0x2000;
const IDLE_ADDRESS = 0x2100;
const FLAG_I = 0x04;

const IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE = 0x08;
const IRQ_SERIAL_OUTPUT_DATA_NEEDED = 0x10;
const IRQ_SERIAL_INPUT_DATA_READY = 0x20;

// Loads the CPU, I/O dispatcher and POKEY (with SIO) without ROMs, wired as
// in atari.js. A small event dispatcher stands in for the POKEY part of
// antic.js's ioCycleTimedEvent().
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
  for (const file of [
    "hw.js",
    "cpu_tables.js",
    "cpu.js",
    "state.js",
    "io.js",
    "pokey_sio.js",
    "pokey.js",
  ]) {
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
  let io = null;
  const pokey = context.window.A8EPokeyAudio.createApi(
    Object.assign({}, hw, {
      cycleTimedEventUpdate: state.cycleTimedEventUpdate,
      raisePokeyIrq: function (ctx, mask) {
        io.raisePokeyIrq(ctx, mask);
      },
    }),
  );
  io = context.window.A8EIo.createApi(
    Object.assign({}, hw, {
      CPU: CPU,
      pokeyAudioSync: pokey.sync,
      pokeyAudioOnRegisterWrite: pokey.onRegisterWrite,
      pokeyPotPrepareSkctlWrite: pokey.potPrepareSkctlWrite,
      pokeyPotStartScan: pokey.potStartScan,
      pokeyRestartTimers: pokey.restartTimers,
      pokeySyncLfsr17: pokey.syncLfsr17,
      pokeySeroutWrite: pokey.seroutWrite,
      pokeySerinRead: pokey.serinRead,
      pokeySerialInputSync: pokey.serialInputSync,
      pokeySerialReset: pokey.serialReset,
      pokeyPotUpdate: pokey.potUpdate,
    }),
  );

  const ctx = CPU.makeContext();
  ctx.ioData = state.makeIoData({});
  state.initHardwareDefaults(ctx);
  state.installIoHandlers(ctx, io.ioAccess);

  // The serial events as antic.js runs them, with atari.js's hook that
  // delivers SIO input bytes.
  ctx.ioCycleTimedEventFunction = function (c) {
    const d = c.ioData;
    const now = c.cycleCounter;
    if (now >= d.serialOutputTransmissionDoneCycle) {
      io.setSerialOutputIdle(c, true);
      d.serialOutputTransmissionDoneCycle = hw.CYCLE_NEVER;
    }
    if (now >= d.serialOutputNeedDataCycle) {
      io.raisePokeyIrq(c, IRQ_SERIAL_OUTPUT_DATA_NEEDED);
      d.serialOutputNeedDataCycle = hw.CYCLE_NEVER;
    }
    if (now >= d.serialInputDataReadyCycle) {
      pokey.serialInputSync(c);
      d.serialInputDataReadyCycle = hw.CYCLE_NEVER;
    }
    state.cycleTimedEventUpdate(c);
  };
  state.cycleTimedEventUpdate(ctx);

  return { CPU: CPU, hw: hw, ctx: ctx, pokey: pokey };
}

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

// Run an idle loop with IRQs masked so the timed events fire.
function runCycles(system, cycles) {
  const ctx = system.ctx;
  const end = ctx.cycleCounter + cycles;
  ctx.ram[IDLE_ADDRESS] = 0x4c; // JMP IDLE_ADDRESS
  ctx.ram[IDLE_ADDRESS + 1] = IDLE_ADDRESS & 0xff;
  ctx.ram[IDLE_ADDRESS + 2] = IDLE_ADDRESS >> 8;
  ctx.cpu.pc = IDLE_ADDRESS;
  ctx.cpu.ps |= FLAG_I;
  ctx.stallCycleCounter = 0;
  system.CPU.run(ctx, end);
}

function sioChecksum(bytes) {
  let sum = 0;
  for (const b of bytes) {
    sum += b;
    sum = (sum & 0xff) + (sum >> 8);
  }
  return sum;
}

// A blank single density image (720 sectors of 128 bytes) in drive 1.
function mountBlankDisk(system) {
  const bytes = new Uint8Array(16 + 720 * 128);
  bytes[0] = 0x96;
  bytes[1] = 0x02;
  bytes[2] = (720 * 128 / 16) & 0xff;
  bytes[3] = (720 * 128 / 16) >> 8;
  bytes[4] = 128;
  system.ctx.ioData.diskImages = [{ bytes: bytes, size: bytes.length }];
  system.ctx.ioData.deviceSlots[0] = 0;
}

function waitSerialInput(system) {
  const hw = system.hw;
  for (let i = 0; i < 100; i++) {
    if ((cpuRead(system, hw.IO_IRQEN_IRQST) & IRQ_SERIAL_INPUT_DATA_READY) === 0)
      {return true;}
    runCycles(system, 100);
  }
  return false;
}

// Send a command frame at 19200 baud the way the OS does, then collect up to
// max response bytes, acknowledging each serial input IRQ.
function sioCommand(system, device, command, checksumError, max) {
  const hw = system.hw;
  const frame = [device, command, 0x01, 0x00];
  frame.push(sioChecksum(frame) ^ checksumError);

  cpuWrite(system, hw.IO_SKCTL_SKSTAT, 0x00); // reset the serial port
  cpuWrite(system, hw.IO_AUDF3_POT4, 0x28);
  cpuWrite(system, hw.IO_AUDF4_POT6, 0x00);
  cpuWrite(system, hw.IO_AUDCTL_ALLPOT, 0x28);
  cpuWrite(system, hw.IO_SKCTL_SKSTAT, 0x23);
  cpuWrite(system, hw.IO_IRQEN_IRQST, 0x00);
  for (const b of frame) {
    cpuWrite(system, hw.IO_SEROUT_SERIN, b);
    runCycles(system, 1000);
  }
  cpuWrite(system, hw.IO_SKCTL_SKSTAT, 0x13);
  cpuWrite(system, hw.IO_IRQEN_IRQST, IRQ_SERIAL_INPUT_DATA_READY);

  const response = [];
  while (response.length < (max || 140) && waitSerialInput(system)) {
    response.push(cpuRead(system, hw.IO_SEROUT_SERIN));
    cpuWrite(system, hw.IO_IRQEN_IRQST, 0x00);
    cpuWrite(system, hw.IO_IRQEN_IRQST, IRQ_SERIAL_INPUT_DATA_READY);
  }
  return response;
}

// RANDOM shifts right one bit per machine cycle (AHRM 5.5, 14.4), so two
// reads four cycles apart (back-to-back LDA abs) share four bits.
function checkRandom(withAudio) {
  const system = loadSystem();
  const hw = system.hw;
  const label = withAudio ? "with audio" : "without audio";
  if (withAudio) system.ctx.ioData.pokeyAudio = system.pokey.createState(48000);

  cpuWrite(system, hw.IO_SKCTL_SKSTAT, 0x00);
  runCycles(system, 40);
  assert.equal(cpuRead(system, hw.IO_SKREST_RANDOM), 0xff, label + ": init mode");

  cpuWrite(system, hw.IO_SKCTL_SKSTAT, 0x03);
  for (const audctl of [0x00, 0x80]) {
    // 17-bit, then 9-bit counter (AUDCTL bit 7).
    cpuWrite(system, hw.IO_AUDCTL_ALLPOT, audctl);
    runCycles(system, 1000);
    const first = cpuRead(system, hw.IO_SKREST_RANDOM);
    const second = cpuRead(system, hw.IO_SKREST_RANDOM);
    assert.ok(first !== 0xff || second !== 0xff, label + ": RANDOM stuck at $FF");
    assert.equal(second & 0x0f, first >> 4, label + ": RANDOM did not shift right (AUDCTL " + audctl + ")");
  }

  // Leaving init mode, the counter shifts zeros in from the reset state at
  // once (AHRM 5.5 gives $1F for STA SKCTL + LDA RANDOM in 9-bit mode).
  cpuWrite(system, hw.IO_SKCTL_SKSTAT, 0x00);
  runCycles(system, 40);
  cpuWrite(system, hw.IO_SKCTL_SKSTAT, 0x03);
  assert.ok(
    [0x7f, 0x3f, 0x1f, 0x0f].includes(cpuRead(system, hw.IO_SKREST_RANDOM)),
    label + ": 9-bit RANDOM right after init mode",
  );

  // The same delay after init mode reads the 17-bit counter, or the 9-bit
  // one with AUDCTL bit 7 set (AHRM 14.4).
  const readAfterInit = function (audctl) {
    cpuWrite(system, hw.IO_SKCTL_SKSTAT, 0x00);
    cpuWrite(system, hw.IO_AUDCTL_ALLPOT, audctl);
    runCycles(system, 40);
    cpuWrite(system, hw.IO_SKCTL_SKSTAT, 0x03);
    runCycles(system, 1000);
    return cpuRead(system, hw.IO_SKREST_RANDOM);
  };
  const r17 = readAfterInit(0x00);
  const r9 = readAfterInit(0x80);
  assert.notEqual(r9, r17, label + ": 9-bit mode read the 17-bit counter");
  assert.ok(randomMatchesCounters(r17, r9), label + ": $" + r17.toString(16) + "/$" + r9.toString(16));
}

// Is there a cycle count after init mode at which the 17-bit counter reads
// r17 and the 9-bit counter reads r9? Steps as in Pokey.c.
function randomMatchesCounters(r17, r9) {
  let p17 = 0x1ffff;
  let p9 = 0x1ff;
  for (let k = 0; k < 2000; k++) {
    if ((p17 & 0xff) === r17 && ((p9 >> 1) & 0xff) === r9) return true;
    const in8 = ((p17 >> 8) ^ (p17 >> 13)) & 1;
    p17 = ((((p17 >>> 1) & 0xff7f) | (in8 << 7)) & 0xffff) | ((p17 & 1) << 16);
    p9 = (p9 >>> 1) | (((p9 ^ (p9 >>> 5)) & 1) << 8);
  }
  return false;
}

function testRandomRunsWithAndWithoutAudio() {
  checkRandom(false);
  checkRandom(true);
}

function testTimerPeriodsUseAudfZeroAsDivisorOne() {
  const system = loadSystem();
  const hw = system.hw;
  const period = function (timer) {
    return system.pokey.timerPeriodCpuCycles(system.ctx, timer);
  };

  // AHRM 5.3: AUDF = $00 is a divisor of 1.
  cpuWrite(system, hw.IO_SKCTL_SKSTAT, 0x03);
  cpuWrite(system, hw.IO_AUDF1_POT0, 0x00);
  cpuWrite(system, hw.IO_AUDF2_POT2, 0x00);
  cpuWrite(system, hw.IO_AUDF3_POT4, 0x28);
  cpuWrite(system, hw.IO_AUDF4_POT6, 0x00);
  cpuWrite(system, hw.IO_AUDCTL_ALLPOT, 0x00);
  assert.equal(period(1), 28, "64 kHz AUDF1=0");
  assert.equal(period(4), 28, "64 kHz AUDF4=0");
  cpuWrite(system, hw.IO_AUDCTL_ALLPOT, 0x01);
  assert.equal(period(2), 114, "15 kHz AUDF2=0");
  cpuWrite(system, hw.IO_AUDCTL_ALLPOT, 0x40);
  assert.equal(period(1), 4, "1.79 MHz AUDF1=0");
  cpuWrite(system, hw.IO_AUDCTL_ALLPOT, 0x28);
  assert.equal(period(4), 0x28 + 7, "linked 3+4 at 1.79 MHz");

  cpuWrite(system, hw.IO_AUDCTL_ALLPOT, 0x00);
  cpuWrite(system, hw.IO_STIMER_KBCODE, 0x00);
  assert.notEqual(system.ctx.ioData.timer1Cycle, hw.CYCLE_NEVER, "STIMER with AUDF1=0");

  // AHRM 5.2: init mode stops only the 15/64 kHz clocks.
  cpuWrite(system, hw.IO_AUDCTL_ALLPOT, 0x40);
  cpuWrite(system, hw.IO_SKCTL_SKSTAT, 0x00);
  assert.equal(period(1), 4, "init mode stopped the 1.79 MHz timer 1");
  assert.equal(period(2), 0, "init mode left the 64 kHz timer 2 running");
}

// Count the square wave toggles of channel 1 over a number of cycles.
function countToggles(pokey, ctx, st, cycles) {
  let toggles = 0;
  let last = st.channels[0].output;
  const start = st.lastCycle;
  for (let c = 1; c <= cycles; c++) {
    pokey.sync(ctx, st, start + c);
    if (st.channels[0].output !== last) toggles++;
    last = st.channels[0].output;
  }
  return toggles;
}

function testAudioChannelsUseAudfZero() {
  const system = loadSystem();
  const hw = system.hw;
  const pokey = system.pokey;
  const ctx = system.ctx;
  const st = pokey.createState(48000);

  // Pure tone, AUDF1 = 0: the output toggles every timer period.
  pokey.onRegisterWrite(st, hw.IO_AUDC1_POT1, 0xa8);
  pokey.onRegisterWrite(st, hw.IO_AUDF1_POT0, 0x00);
  pokey.onRegisterWrite(st, hw.IO_SKCTL_SKSTAT, 0x03);
  pokey.onRegisterWrite(st, hw.IO_AUDCTL_ALLPOT, 0x00);
  pokey.onRegisterWrite(st, hw.IO_STIMER_KBCODE, 0x00);
  assert.equal(countToggles(pokey, ctx, st, 28 * 10), 10, "64 kHz AUDF1=0");
  pokey.onRegisterWrite(st, hw.IO_AUDCTL_ALLPOT, 0x40);
  pokey.onRegisterWrite(st, hw.IO_STIMER_KBCODE, 0x00);
  assert.equal(countToggles(pokey, ctx, st, 4 * 10), 10, "1.79 MHz AUDF1=0");

  // AHRM 5.2: init mode stops the 64 kHz clock but not 1.79 MHz channels.
  pokey.onRegisterWrite(st, hw.IO_SKCTL_SKSTAT, 0x00);
  assert.equal(countToggles(pokey, ctx, st, 4 * 10), 10, "1.79 MHz channel in init mode");
  pokey.onRegisterWrite(st, hw.IO_AUDCTL_ALLPOT, 0x00);
  assert.equal(countToggles(pokey, ctx, st, 28 * 10), 0, "64 kHz channel in init mode");
}

function testSioDriveAnswersOnlyValidD1Frames() {
  const system = loadSystem();
  mountBlankDisk(system);

  // AHRM 10.2, Table 44: ACK, Complete, drive status, inverted FDC status
  // ($FF), format timeout, unused byte, checksum.
  const status = sioCommand(system, 0x31, 0x53, 0);
  assert.deepEqual(status, [0x41, 0x43, 0x10, 0xff, 0xe0, 0x00, sioChecksum([0x10, 0xff, 0xe0, 0x00])]);

  // AHRM 9.1: no NAK for other device IDs or a bad checksum; the OS times out.
  assert.deepEqual(sioCommand(system, 0x32, 0x53, 0), [], "unmounted D2:");
  assert.deepEqual(sioCommand(system, 0x40, 0x53, 0), [], "printer ID");
  assert.deepEqual(sioCommand(system, 0x31, 0x53, 0x01), [], "bad command frame checksum");

  // An unsupported command to the drive is NAKed.
  assert.deepEqual(sioCommand(system, 0x31, 0x58, 0), [0x4e], "unsupported command");

  // AHRM 10.2: format returns a sector-sized bad sector list ended by $FFFF.
  const format = sioCommand(system, 0x31, 0x21, 0);
  const list = new Array(128).fill(0xff);
  assert.deepEqual(format, [0x41, 0x43].concat(list, [sioChecksum(list)]), "format");
}

function testSerinReadsHaveNoSideEffects() {
  const system = loadSystem();
  const hw = system.hw;
  mountBlankDisk(system);

  // AHRM 5.6: SERIN keeps the last byte; reading it changes nothing.
  assert.deepEqual(sioCommand(system, 0x31, 0x53, 0, 1), [0x41]);
  assert.equal(cpuRead(system, hw.IO_SEROUT_SERIN), 0x41);
  assert.equal(cpuRead(system, hw.IO_SEROUT_SERIN), 0x41, "second SERIN read");

  // The drive keeps sending at its own pace. Bytes that arrive while the
  // serial input IRQ is still pending overrun SERIN: SKSTAT bit 5 drops.
  assert.ok(cpuRead(system, hw.IO_SKCTL_SKSTAT) & 0x20, "overrun reported too early");
  runCycles(system, 20000);
  assert.equal(
    cpuRead(system, hw.IO_SEROUT_SERIN),
    sioChecksum([0x10, 0xff, 0xe0, 0x00]),
    "SERIN holds the last status byte",
  );
  assert.equal(cpuRead(system, hw.IO_SKCTL_SKSTAT) & 0x20, 0, "overrun bit");

  // SKRES resets SKSTAT bits 5-7 (AHRM 14.4).
  cpuWrite(system, hw.IO_SKREST_RANDOM, 0x00);
  assert.equal(cpuRead(system, hw.IO_SKCTL_SKSTAT) & 0xe0, 0xe0, "SKRES");

  // Reading SERIN with nothing to receive schedules no phantom bytes.
  cpuRead(system, hw.IO_SEROUT_SERIN);
  assert.equal(system.ctx.ioData.serialInputDataReadyCycle, hw.CYCLE_NEVER);
}

function testSerialOutputCompletesForAnyByte() {
  const system = loadSystem();
  const hw = system.hw;

  // 19200 baud: linked timers 3+4 at $0028 give 47-cycle half bits, so a
  // 10-bit byte takes 940 cycles (AHRM 5.6).
  cpuWrite(system, hw.IO_SKCTL_SKSTAT, 0x00);
  cpuWrite(system, hw.IO_AUDF3_POT4, 0x28);
  cpuWrite(system, hw.IO_AUDF4_POT6, 0x00);
  cpuWrite(system, hw.IO_AUDCTL_ALLPOT, 0x28);
  cpuWrite(system, hw.IO_SKCTL_SKSTAT, 0x23);
  cpuWrite(system, hw.IO_IRQEN_IRQST, IRQ_SERIAL_OUTPUT_DATA_NEEDED);

  // A lone byte that is no SIO frame still completes.
  cpuWrite(system, hw.IO_SEROUT_SERIN, 0x00);
  assert.ok(cpuRead(system, hw.IO_IRQEN_IRQST) & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE, "busy after SEROUT");
  runCycles(system, 200);
  assert.equal(cpuRead(system, hw.IO_IRQEN_IRQST) & IRQ_SERIAL_OUTPUT_DATA_NEEDED, 0, "output needed");
  assert.ok(cpuRead(system, hw.IO_IRQEN_IRQST) & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE, "idle too early");

  // A second byte loads when the first ends, so the output stays busy.
  cpuWrite(system, hw.IO_IRQEN_IRQST, 0x00);
  cpuWrite(system, hw.IO_SEROUT_SERIN, 0x55);
  runCycles(system, 1000);
  assert.ok(cpuRead(system, hw.IO_IRQEN_IRQST) & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE, "idle between bytes");
  runCycles(system, 1000);
  assert.equal(cpuRead(system, hw.IO_IRQEN_IRQST) & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE, 0, "busy after two bytes");
}

testRandomRunsWithAndWithoutAudio();
testTimerPeriodsUseAudfZeroAsDivisorOne();
testAudioChannelsUseAudfZero();
testSioDriveAnswersOnlyValidD1Frames();
testSerinReadsHaveNoSideEffects();
testSerialOutputCompletesForAnyByte();
console.log("pokey_sio tests passed");
