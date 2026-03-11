/* global ArrayBuffer, Int16Array, Uint8Array */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadMemoryApi() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "memory.js"),
    "utf8",
  );
  const context = {
    console: console,
    Math: Math,
    Date: Date,
    JSON: JSON,
    Object: Object,
    Number: Number,
    String: String,
    Boolean: Boolean,
    ArrayBuffer: ArrayBuffer,
    Uint8Array: Uint8Array,
    Int16Array: Int16Array,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "memory.js" });
  return context.window.A8EMemory.createApi({
    CPU: {
      setRom: function () {},
      setRam: function () {},
      reset: function () {},
    },
    IO_PORTB: 0xd301,
    DEFAULT_PORTB: 0xfd,
  });
}

function createRuntime(options) {
  const opts = options || {};
  const api = loadMemoryApi();
  const machine = {
    media: {},
    ctx: {
      ram: new Uint8Array(0x10000),
      sram: new Uint8Array(0x10000),
      ioData: {},
    },
    audioState: null,
    audioMode: "none",
    audioNode: null,
  };

  machine.ctx.ram[0xd301] = 0xfd;
  machine.ctx.sram[0xd301] = 0xfd;
  machine.ctx.ioData.valuePortB = 0xfd;

  const runtime = api.createRuntime({
    machine: machine,
    video: {},
    ioCycleTimedEvent: function () {},
    makeIoData: function () { return {}; },
    cycleTimedEventUpdate: function () {},
    initHardwareDefaults: function () {},
    installIoHandlers: function () {},
    ioAccess: function () {},
    getOptionOnStart: function () { return !!opts.optionOnStart; },
    getSioTurbo: function () { return false; },
    getTurbo: function () { return false; },
    pokeyAudioResetState: function () {},
    pokeyAudioSetTurbo: function () {},
  });

  runtime.loadOsRom(new Uint8Array(0x4000).buffer);
  runtime.loadBasicRom(new Uint8Array(0x2000).buffer);
  return runtime;
}

function buildXex(segments) {
  let total = 0;
  for (const segment of segments) {
    total += 6 + segment.data.length;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const segment of segments) {
    const start = segment.start & 0xffff;
    const end = (start + segment.data.length - 1) & 0xffff;
    out[offset++] = 0xff;
    out[offset++] = 0xff;
    out[offset++] = start & 0xff;
    out[offset++] = (start >> 8) & 0xff;
    out[offset++] = end & 0xff;
    out[offset++] = (end >> 8) & 0xff;
    out.set(segment.data, offset);
    offset += segment.data.length;
  }
  return out;
}

function testPortBWriteSegmentIsAllowed() {
  const runtime = createRuntime();
  const xex = buildXex([
    { start: 0xd301, data: Uint8Array.from([0xff]) },
  ]);
  const result = runtime.loadDiskToDeviceSlotDetailed(
    xex.buffer,
    "PORTB.XEX",
    0,
    null,
  );

  assert.equal(result.format, "xex");
  assert.equal(result.xexPreflight.code, "xex_preflight_passed");
  assert.equal(result.xexPreflight.overlaps.length, 0);
}

function testPortBSwitchCanOpenSelfTestRam() {
  const runtime = createRuntime();
  const xex = buildXex([
    { start: 0xd301, data: Uint8Array.from([0xfd]) },
    { start: 0x5000, data: Uint8Array.from([0x12, 0x34]) },
  ]);
  const result = runtime.loadDiskToDeviceSlotDetailed(
    xex.buffer,
    "SELFTEST.XEX",
    0,
    { portB: 0x7d },
  );

  assert.equal(result.xexPreflight.code, "xex_preflight_passed");
  assert.equal(result.xexPreflight.overlaps.length, 0);
}

function testPortBSwitchCanOpenBasicRam() {
  const runtime = createRuntime();
  const xex = buildXex([
    { start: 0xd301, data: Uint8Array.from([0xff]) },
    { start: 0xa000, data: Uint8Array.from([0x99]) },
  ]);
  const result = runtime.loadDiskToDeviceSlotDetailed(
    xex.buffer,
    "BASICOFF.XEX",
    0,
    null,
  );

  assert.equal(result.xexPreflight.code, "xex_preflight_passed");
  assert.equal(result.xexPreflight.overlaps.length, 0);
}

function testOptionOnStartDisablesBasicForPreflight() {
  const runtime = createRuntime({ optionOnStart: true });
  const xex = buildXex([
    { start: 0xb534, data: Uint8Array.from([0x01, 0x02, 0x03]) },
  ]);
  const result = runtime.loadDiskToDeviceSlotDetailed(
    xex.buffer,
    "OPTIONBASICOFF.XEX",
    0,
    null,
  );

  assert.equal(result.xexPreflight.code, "xex_preflight_passed");
  assert.equal(result.xexPreflight.overlaps.length, 0);
  assert.equal(result.xexPreflight.portB, 0xff);
  assert.equal(result.xexPreflight.bankState.basicEnabled, false);
}

function testSelfTestWriteStillFailsWithoutBankSwitch() {
  const runtime = createRuntime();
  const xex = buildXex([
    { start: 0x5000, data: Uint8Array.from([0x12, 0x34]) },
  ]);

  assert.throws(
    function () {
      runtime.loadDiskToDeviceSlotDetailed(xex.buffer, "FAIL.XEX", 0, {
        portB: 0x7d,
      });
    },
    function (err) {
      assert.equal(err.code, "xex_protected_memory_overlap");
      assert.match(err.message, /Self-test ROM/);
      assert.equal(err.details.xexPreflight.overlaps.length, 1);
      assert.equal(err.details.xexPreflight.overlaps[0].overlapStart, 0x5000);
      assert.equal(err.details.xexPreflight.overlaps[0].overlapEnd, 0x5001);
      return true;
    },
  );
}

testPortBWriteSegmentIsAllowed();
testPortBSwitchCanOpenSelfTestRam();
testPortBSwitchCanOpenBasicRam();
testOptionOnStartDisablesBasicForPreflight();
testSelfTestWriteStillFailsWithoutBankSwitch();

console.log("memory_xex_preflight_bank_switch.test.js passed");
