/* global Buffer, TextDecoder, TextEncoder, URL, __dirname, clearTimeout, console, process, require, setTimeout */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadAutomationApi() {
  const utilSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "app", "automation", "utils.js"),
    "utf8",
  );
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
    SharedArrayBuffer:
      typeof SharedArrayBuffer !== "undefined" ? SharedArrayBuffer : undefined,
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
  vm.runInContext(utilSource, context, {
    filename: "automation/utils.js",
  });
  vm.runInContext(source, context, {
    filename: "automation_api.js",
  });
  return context.window.A8EAutomation;
}

async function main() {
  const api = loadAutomationApi();
  const debugState = {
    running: true,
    reason: "start",
    pc: 0x2000,
    a: 0,
    x: 0,
    y: 0,
    sp: 0xff,
    p: 0x34,
    cycleCounter: 12,
    instructionCounter: 3,
  };
  const calls = {
    pause: 0,
    saveSnapshot: 0,
    loadSnapshot: 0,
  };
  let lastSavedRunning = null;
  let lastLoadedBytes = null;
  let lastLoadOptions = null;
  const app = {
    isReady: function () { return true; },
    isRunning: function () { return !!debugState.running; },
    isWorkerBackend: function () { return false; },
    getRendererBackend: function () { return "2d"; },
    hasOsRom: function () { return true; },
    hasBasicRom: function () { return true; },
    onDebugStateChange: function () {
      return function () {};
    },
    getDebugState: function () {
      return Object.assign({}, debugState);
    },
    pause: function () {
      calls.pause++;
      debugState.running = false;
      debugState.reason = "pause";
      return Promise.resolve();
    },
    saveSnapshot: function (options) {
      calls.saveSnapshot++;
      lastSavedRunning = !!(options && options.savedRunning);
      return {
        type: "a8e.snapshot",
        version: 1,
        savedAt: 123,
        savedRunning: lastSavedRunning,
        byteLength: 3,
        mimeType: "application/x-a8e-snapshot",
        buffer: new Uint8Array([9, 8, 7]).buffer,
      };
    },
    loadSnapshot: function (buffer, options) {
      calls.loadSnapshot++;
      lastLoadedBytes = Array.from(new Uint8Array(buffer));
      lastLoadOptions = options || null;
      debugState.running = true;
      debugState.reason = "start";
      return {
        command: "loadSnapshot",
        snapshotVersion: 1,
        resumed: true,
      };
    },
  };

  api.attach({ app: app });

  const saved = await api.system.saveSnapshot();
  assert.equal(calls.pause, 1);
  assert.equal(calls.saveSnapshot, 1);
  assert.equal(lastSavedRunning, true);
  assert.deepEqual(Array.from(saved.bytes), [9, 8, 7]);
  assert.equal(saved.savedRunning, true);

  debugState.running = true;
  debugState.reason = "start";

  const loaded = await api.system.loadSnapshot(new Uint8Array([1, 2, 3]), {
    resume: "saved",
  });
  assert.equal(calls.pause, 2);
  assert.equal(calls.loadSnapshot, 1);
  assert.deepEqual(lastLoadedBytes, [1, 2, 3]);
  assert.equal(lastLoadOptions.resume, "saved");
  assert.equal(loaded.resumed, true);
  assert.equal(loaded.debugState.running, true);

  console.log("automation_snapshot_api.test.js passed");
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
