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
  const mediaSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "app", "automation", "media.js"),
    "utf8",
  );
  const artifactsSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "app", "automation", "artifacts.js"),
    "utf8",
  );
  const xexSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "app", "automation", "xex.js"),
    "utf8",
  );
  const buildSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "app", "automation", "build.js"),
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
  vm.runInContext(utilSource, context, {
    filename: "automation/utils.js",
  });
  vm.runInContext(mediaSource, context, {
    filename: "automation/media.js",
  });
  vm.runInContext(artifactsSource, context, {
    filename: "automation/artifacts.js",
  });
  vm.runInContext(xexSource, context, {
    filename: "automation/xex.js",
  });
  vm.runInContext(buildSource, context, {
    filename: "automation/build.js",
  });
  vm.runInContext(source, context, {
    filename: "automation_api.js",
  });
  return context.window.A8EAutomation;
}

async function main() {
  const api = loadAutomationApi();
  const debugState = {
    running: false,
    reason: "reset",
    pc: 0x2000,
    a: 0,
    x: 0,
    y: 0,
    sp: 0xff,
    p: 0x34,
    cycleCounter: 17,
    instructionCounter: 3,
  };
  let startResolved = false;
  let pauseResolved = false;
  let resetResolved = false;
  const app = {
    isReady: function () { return true; },
    isRunning: function () { return !!debugState.running; },
    isWorkerBackend: function () { return true; },
    getRendererBackend: function () { return "worker"; },
    hasOsRom: function () { return true; },
    hasBasicRom: function () { return true; },
    onDebugStateChange: function () {
      return function () {};
    },
    getDebugState: function () {
      return Object.assign({}, debugState);
    },
    start: function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          startResolved = true;
          debugState.running = true;
          debugState.reason = "start";
          resolve();
        }, 20);
      });
    },
    pause: function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          pauseResolved = true;
          debugState.running = false;
          debugState.reason = "pause";
          resolve();
        }, 20);
      });
    },
    reset: function () {
      return new Promise(function (resolve) {
        setTimeout(function () {
          resetResolved = true;
          debugState.running = false;
          debugState.reason = "reset";
          debugState.cycleCounter = 0;
          debugState.instructionCounter = 0;
          resolve();
        }, 20);
      });
    },
    getCounters: function () {
      return {
        running: !!debugState.running,
        cycleCounter: debugState.cycleCounter >>> 0,
        instructionCounter: debugState.instructionCounter >>> 0,
      };
    },
    getMountedDiskForDeviceSlot: function (slot) {
      if ((slot | 0) === 0) {
        return new Promise(function () {});
      }
      if ((slot | 0) === 1) {
        return Promise.resolve({
          deviceSlot: 1,
          imageIndex: 7,
          name: "BOOT.ATR",
          size: 4096,
          writable: false,
        });
      }
      return null;
    },
    hasMountedDiskForDeviceSlot: function (slot) {
      return (slot | 0) === 1;
    },
    getConsoleKeyState: function () {
      return {
        raw: 0x07,
      };
    },
    getBankState: function () {
      return new Promise(function () {});
    },
  };

  api.attach({ app: app });

  const started = await api.system.start();
  assert.equal(startResolved, true);
  assert.equal(started.running, true);
  assert.equal(started.reason, "start");

  const paused = await api.system.pause();
  assert.equal(pauseResolved, true);
  assert.equal(paused.running, false);
  assert.equal(paused.reason, "pause");

  const reset = await api.system.reset({ portB: 0xff });
  assert.equal(resetResolved, true);
  assert.equal(reset.debugState.reason, "reset");

  const state = await api.getSystemState({ timeoutMs: 10 });
  assert.equal(state.ready, true);
  assert.equal(state.worker, true);
  assert.equal(state.media.deviceSlots[1].mounted, true);
  assert.equal(state.media.deviceSlots[1].name, "BOOT.ATR");
  assert.equal(state.media.deviceSlots[0].mounted, false);
  assert.equal(state.consoleKeys.raw, 0x07);
  assert.equal(state.bankState, null);
  assert.equal(state.error.code, "system_state_partial");
  assert.equal(state.error.details.parts.media.code, "system_state_media_partial");
  assert.equal(
    state.error.details.parts.media.details.slots["0"].code,
    "system_state_timeout",
  );
  assert.equal(state.error.details.parts.bankState.code, "system_state_timeout");

  console.log("automation_system_state_resilience.test.js passed");
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
