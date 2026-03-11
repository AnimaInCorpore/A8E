/* global Buffer, TextDecoder, TextEncoder, URL, __dirname, clearTimeout, console, process, require, setTimeout */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadAutomationApi() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "app", "automation_api.js"),
    "utf8",
  );
  const context = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    URL: URL,
    Date: Date,
    Math: Math,
    ArrayBuffer: ArrayBuffer,
    SharedArrayBuffer: typeof SharedArrayBuffer !== "undefined" ? SharedArrayBuffer : undefined,
    Uint8Array: Uint8Array,
    Uint8ClampedArray: Uint8ClampedArray,
    Int8Array: Int8Array,
    Uint16Array: Uint16Array,
    Int16Array: Int16Array,
    Uint32Array: Uint32Array,
    Int32Array: Int32Array,
    Float32Array: Float32Array,
    Float64Array: Float64Array,
    DataView: DataView,
    Promise: Promise,
    Object: Object,
    Number: Number,
    String: String,
    Boolean: Boolean,
    RegExp: RegExp,
    JSON: JSON,
    Map: Map,
    Set: Set,
    WeakMap: WeakMap,
    WeakSet: WeakSet,
    atob: function (value) {
      return Buffer.from(String(value), "base64").toString("binary");
    },
    btoa: function (value) {
      return Buffer.from(String(value), "binary").toString("base64");
    },
    fetch: async function () {
      throw new Error("fetch should not be used in this test");
    },
  };
  context.window = context;
  context.location = { href: "http://localhost/" };
  context.A8EHw = {
    createApi: function () {
      return {
        ATARI_CPU_HZ_PAL: 1773447,
        CYCLES_PER_LINE: 114,
        LINES_PER_SCREEN_PAL: 312,
      };
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context, {
    filename: "automation_api.js",
  });
  return context.window.A8EAutomation;
}

async function main() {
  const api = loadAutomationApi();
  let resetCalled = false;
  let startCalled = false;
  const debugState = {
    running: false,
    reason: "reset",
    pc: 0xc000,
    a: 0,
    x: 0,
    y: 0,
    sp: 0xff,
    p: 0x34,
    cycleCounter: 0,
    instructionCounter: 0,
  };
  const bankState = {
    portB: 0xfd,
    basicEnabled: true,
    osEnabled: true,
    floatingPointEnabled: true,
    selfTestEnabled: false,
    basicRomLoaded: true,
    osRomLoaded: true,
    floatingPointRomLoaded: true,
    selfTestRomLoaded: true,
  };
  const traceTail = [
    {
      pc: 0xc000,
      a: 0,
      x: 0,
      y: 0,
      sp: 0xff,
      p: 0x34,
      cycles: 0,
    },
  ];
  const preflight = {
    ok: false,
    phase: "xex_preflight_failed",
    code: "xex_protected_memory_overlap",
    message: "XEX segment $A000-$A0FF overlaps BASIC ROM",
    byteLength: 260,
    normalizedByteLength: 262,
    segmentCount: 1,
    segments: [
      {
        index: 0,
        start: 0xa000,
        end: 0xa0ff,
        length: 0x100,
      },
    ],
    loaderRange: {
      start: 0x0700,
      end: 0x087f,
      length: 0x180,
    },
    bufferAddress: null,
    bufferRange: null,
    protectedRegions: [
      {
        kind: "basic_rom",
        name: "BASIC ROM",
        start: 0xa000,
        end: 0xbfff,
        length: 0x2000,
        romBacked: true,
      },
    ],
    overlaps: [
      {
        segmentIndex: 0,
        segmentStart: 0xa000,
        segmentEnd: 0xa0ff,
        regionKind: "basic_rom",
        regionName: "BASIC ROM",
        regionStart: 0xa000,
        regionEnd: 0xbfff,
        overlapStart: 0xa000,
        overlapEnd: 0xa0ff,
        overlapLength: 0x100,
        protected: false,
        romBacked: true,
      },
    ],
    runAddress: 0x2000,
    initAddress: null,
    portB: 0xfd,
    bankState: bankState,
  };
  const app = {
    isReady: function () { return true; },
    isRunning: function () { return false; },
    isWorkerBackend: function () { return false; },
    getRendererBackend: function () { return "2d"; },
    onDebugStateChange: function () {
      return function () {};
    },
    getDebugState: function () {
      return Object.assign({}, debugState);
    },
    getCounters: function () {
      return {
        running: false,
        cycleCounter: 0,
        instructionCounter: 0,
      };
    },
    getTraceTail: function () {
      return traceTail.slice(0);
    },
    getBankState: function () {
      return Object.assign({}, bankState);
    },
    getMountedDiskForDeviceSlot: function () {
      return null;
    },
    getConsoleKeyState: function () {
      return {
        raw: 0x07,
      };
    },
    collectArtifacts: function () {
      return {
        rendererBackend: "2d",
        debugState: Object.assign({}, debugState),
        counters: {
          running: false,
          cycleCounter: 0,
          instructionCounter: 0,
        },
        bankState: Object.assign({}, bankState),
        traceTail: traceTail.slice(0),
        memoryRanges: [],
      };
    },
    loadDiskToDeviceSlotDetailed: function () {
      const err = new Error("XEX segment $A000-$A0FF overlaps BASIC ROM");
      err.code = "xex_protected_memory_overlap";
      err.phase = "xex_preflight_failed";
      err.details = {
        xexPreflight: preflight,
      };
      throw err;
    },
    reset: function () {
      resetCalled = true;
    },
    start: function () {
      startCalled = true;
    },
  };

  api.attach({ app: app });
  const progress = [];
  const token = api.events.subscribe("progress", function (event) {
    progress.push(String(event.phase || ""));
  });

  const result = await api.dev.runXex({
    bytes: new Uint8Array([0xff, 0xff, 0x00, 0x20, 0x01, 0x20, 0x4c, 0x00, 0x20]),
    name: "BROKEN.XEX",
    expectedEntryPc: 0x2000,
  });

  api.events.unsubscribe(token);

  assert.equal(result.ok, false);
  assert.equal(result.type, "a8e.xexBootFailure");
  assert.equal(result.phase, "xex_boot_failed");
  assert.equal(result.failure.phase, "xex_preflight_failed");
  assert.equal(result.failure.code, "xex_protected_memory_overlap");
  assert.match(result.failure.error.message, /overlaps BASIC ROM/);
  assert.equal(result.phase === "wait_timeout", false);
  assert.equal(result.xexPreflight.code, "xex_protected_memory_overlap");
  assert.equal(result.xexPreflight.overlaps.length, 1);
  assert.equal(result.bootDiagnostics.currentPc, 0xc000);
  assert.equal(Array.isArray(result.bootDiagnostics.mountedMedia), true);
  assert.equal(Array.isArray(result.bootDiagnostics.traceTail), true);
  assert.deepEqual(progress, ["xex_preflight_failed", "boot_failed"]);
  assert.equal(resetCalled, false);
  assert.equal(startCalled, false);

  console.log("automation_xex_boot_failure.test.js passed");
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
