/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const CYCLE_NEVER = Number.POSITIVE_INFINITY;
const IO_AUDF1_POT0 = 0xd200;
const IO_AUDF4_POT6 = 0xd206;
const IO_AUDCTL_ALLPOT = 0xd208;
const IO_SKCTL_SKSTAT = 0xd20f;

function loadPokeyApi() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "pokey.js"),
    "utf8",
  );
  const context = {
    console: console,
    Uint8Array: Uint8Array,
    Int16Array: Int16Array,
    Math: Math,
    Number: Number,
    Object: Object,
  };
  context.window = context;
  context.A8EPokeySio = {
    createApi: function () {
      return {
        seroutWrite: function () {},
        serinRead: function () {
          return 0;
        },
      };
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "pokey.js" });
  return context.window.A8EPokeyAudio.createApi({
    ATARI_CPU_HZ: 1773447,
    CYCLES_PER_LINE: 114,
    POKEY_AUDIO_MAX_CATCHUP_CYCLES: 0,
    IO_AUDF1_POT0: IO_AUDF1_POT0,
    IO_AUDC1_POT1: 0xd201,
    IO_AUDF2_POT2: 0xd202,
    IO_AUDC2_POT3: 0xd203,
    IO_AUDF3_POT4: 0xd204,
    IO_AUDC3_POT5: 0xd205,
    IO_AUDF4_POT6: IO_AUDF4_POT6,
    IO_AUDC4_POT7: 0xd207,
    IO_AUDCTL_ALLPOT: IO_AUDCTL_ALLPOT,
    IO_STIMER_KBCODE: 0xd209,
    IO_SKCTL_SKSTAT: IO_SKCTL_SKSTAT,
    IO_SEROUT_SERIN: 0xd20d,
    SERIAL_OUTPUT_DATA_NEEDED_CYCLES: 1,
    SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES: 1,
    SERIAL_INPUT_FIRST_DATA_READY_CYCLES: 1,
    SERIAL_INPUT_DATA_READY_CYCLES: 1,
    CYCLE_NEVER: CYCLE_NEVER,
    cycleTimedEventUpdate: function () {},
  });
}

function makeContext() {
  return {
    cycleCounter: 0,
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {},
  };
}

// AHRM 5.3: the counters always run, so a timer whose period was 0 when
// STIMER was written must start once AUDF gives it a period.
function testParkedTimerStartsWhenAudfArrives() {
  const api = loadPokeyApi();
  const ctx = makeContext();
  ctx.sram[IO_SKCTL_SKSTAT] = 0x03;
  ctx.sram[IO_AUDF4_POT6] = 0x20;
  ctx.cycleCounter = 1000;
  api.restartTimers(ctx);
  assert.equal(ctx.ioData.timer1Cycle, CYCLE_NEVER, "AUDF1=0 parks timer 1");
  const timer4 = ctx.ioData.timer4Cycle;
  assert.equal(timer4, 1000 + 0x21 * 28, "timer 4 runs with the 64 kHz clock");

  ctx.cycleCounter = 5000;
  ctx.sram[IO_AUDF1_POT0] = 0x10;
  api.armInactiveTimers(ctx);
  assert.equal(ctx.ioData.timer1Cycle, 5000 + 0x11 * 28, "AUDF1 should start the parked timer 1");
  assert.equal(ctx.ioData.timer4Cycle, timer4, "a running timer keeps its phase");
}

function testLeavingInitializationModeStartsTimers() {
  const api = loadPokeyApi();
  const ctx = makeContext();
  ctx.sram[IO_SKCTL_SKSTAT] = 0x00;
  ctx.sram[IO_AUDF1_POT0] = 0x04;
  api.restartTimers(ctx);
  assert.equal(ctx.ioData.timer1Cycle, CYCLE_NEVER, "initialization mode holds timer 1");

  ctx.cycleCounter = 200;
  ctx.sram[IO_SKCTL_SKSTAT] = 0x03;
  api.armInactiveTimers(ctx);
  assert.equal(ctx.ioData.timer1Cycle, 200 + 0x05 * 28, "leaving initialization mode starts timer 1");
}

testParkedTimerStartsWhenAudfArrives();
testLeavingInitializationModeStartsTimers();

console.log("pokey_timers tests passed");
