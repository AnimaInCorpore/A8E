/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const CYCLES_PER_LINE = 114;
const CYCLE_NEVER = Number.POSITIVE_INFINITY;
const IO_AUDF1_POT0 = 0xd200;
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
    ATARI_CPU_HZ_PAL: 1773447,
    CYCLES_PER_LINE: CYCLES_PER_LINE,
    POKEY_AUDIO_MAX_CATCHUP_CYCLES: 0,
    IO_AUDF1_POT0: IO_AUDF1_POT0,
    IO_AUDC1_POT1: 0xd201,
    IO_AUDF2_POT2: 0xd202,
    IO_AUDC2_POT3: 0xd203,
    IO_AUDF3_POT4: 0xd204,
    IO_AUDC3_POT5: 0xd205,
    IO_AUDF4_POT6: 0xd206,
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
    ioData: {
      pokeyPotValues: new Uint8Array([229, 229, 229, 229, 229, 229, 229, 229]),
      pokeyPotLatched: new Uint8Array(8),
      pokeyPotScanLastCycle: 0,
      pokeyPotScanTerminalCycle: CYCLE_NEVER,
      pokeyPotCounter: 0,
      pokeyPotScanActive: false,
    },
  };
}

function testSlowScanUsesScanlineRateAndRunsToCompletion() {
  const api = loadPokeyApi();
  const ctx = makeContext();

  ctx.sram[IO_SKCTL_SKSTAT] = 0x03;
  ctx.ioData.pokeyPotValues.fill(1);
  api.potStartScan(ctx);

  ctx.cycleCounter = CYCLES_PER_LINE - 1;
  api.potUpdate(ctx);
  assert.equal(ctx.ram[IO_AUDF1_POT0], 0);
  assert.equal(ctx.ram[IO_AUDCTL_ALLPOT], 0xff);

  ctx.cycleCounter = CYCLES_PER_LINE;
  api.potUpdate(ctx);
  assert.equal(ctx.ram[IO_AUDF1_POT0], 1);
  assert.equal(ctx.ram[IO_AUDCTL_ALLPOT], 0x00);
  assert.equal(ctx.ioData.pokeyPotScanActive, true);

  ctx.cycleCounter = CYCLES_PER_LINE * 228;
  api.potUpdate(ctx);
  assert.equal(ctx.ioData.pokeyPotCounter, 228);
  assert.equal(ctx.ioData.pokeyPotScanActive, true);

  ctx.cycleCounter = CYCLES_PER_LINE * 228 + 1;
  api.potUpdate(ctx);
  assert.equal(ctx.ioData.pokeyPotScanActive, false);
  assert.equal(ctx.ram[IO_AUDCTL_ALLPOT], 0x00);
}

function testFastScanUsesMachineClockAndEndsAt229() {
  const api = loadPokeyApi();
  const ctx = makeContext();

  ctx.sram[IO_SKCTL_SKSTAT] = 0x07;
  api.potStartScan(ctx);

  ctx.cycleCounter = 228;
  api.potUpdate(ctx);
  assert.equal(ctx.ram[IO_AUDF1_POT0], 228);
  assert.equal(ctx.ram[IO_AUDCTL_ALLPOT], 0xff);
  assert.equal(ctx.ioData.pokeyPotScanActive, true);

  ctx.cycleCounter = 229;
  api.potUpdate(ctx);
  assert.equal(ctx.ram[IO_AUDF1_POT0], 229);
  assert.equal(ctx.ram[IO_AUDCTL_ALLPOT], 0xff);
  assert.equal(ctx.ioData.pokeyPotScanActive, true);

  ctx.cycleCounter = 230;
  api.potUpdate(ctx);
  assert.equal(ctx.ram[IO_AUDF1_POT0], 229);
  assert.equal(ctx.ram[IO_AUDCTL_ALLPOT], 0x00);
  assert.equal(ctx.ioData.pokeyPotScanActive, false);
}

function testSkctlModeChangesDoNotRetroactivelyRescaleElapsedTime() {
  const api = loadPokeyApi();
  const ctx = makeContext();

  ctx.sram[IO_SKCTL_SKSTAT] = 0x03;
  api.potStartScan(ctx);

  ctx.cycleCounter = 57;
  api.potPrepareSkctlWrite(ctx);
  ctx.sram[IO_SKCTL_SKSTAT] = 0x07;

  ctx.cycleCounter = 58;
  api.potUpdate(ctx);
  assert.equal(ctx.ioData.pokeyPotCounter, 1);
  assert.equal(ctx.ram[IO_AUDF1_POT0], 1);
  assert.equal(ctx.ram[IO_AUDCTL_ALLPOT], 0xff);
}

function main() {
  testSlowScanUsesScanlineRateAndRunsToCompletion();
  testFastScanUsesMachineClockAndEndsAt229();
  testSkctlModeChangesDoNotRetroactivelyRescaleElapsedTime();
  console.log("pokey_pot_scan.test.js passed");
}

try {
  main();
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
