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
  vm.runInContext(mediaSource, context, {
    filename: "automation/media.js",
  });
  vm.runInContext(artifactsSource, context, {
    filename: "automation/artifacts.js",
  });
  vm.runInContext(xexSource, context, {
    filename: "automation/xex.js",
  });
  vm.runInContext(source, context, {
    filename: "automation_api.js",
  });
  return context.window.A8EAutomation;
}

async function main() {
  const api = loadAutomationApi();
  const memory = new Uint8Array(0x10000);
  memory[0x1000] = 0x34;
  memory[0x1001] = 0x12;
  memory[0x2000] = 0x00;
  memory[0x2001] = 0x80;
  memory[0x2002] = 0x80;
  memory[0x2003] = 0x00;
  memory[0xffff] = 0x78;
  memory[0x0000] = 0x56;

  const app = {
    isReady: function () { return true; },
    onDebugStateChange: function () {
      return function () {};
    },
    readMemory: function (address) {
      return memory[address & 0xffff];
    },
    writeMemory: function (address, value) {
      const addr = address & 0xffff;
      const next = value & 0xff;
      memory[addr] = next;
      return next;
    },
    writeRange: function (start, data) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data || 0);
      const addr = start & 0xffff;
      for (let i = 0; i < bytes.length; i++) {
        memory[(addr + i) & 0xffff] = bytes[i] & 0xff;
      }
      return bytes.length | 0;
    },
  };

  api.attach({ app: app });
  const capabilities = await api.getCapabilities();
  assert.equal(capabilities.memoryWrite, true);
  assert.equal(capabilities.memoryWait, true);

  assert.equal(await api.debug.readWord(0x1000), 0x1234);
  assert.equal(await api.debug.readWord(0x1000, { littleEndian: false }), 0x3412);
  assert.equal(await api.debug.readWordSigned(0x2000), -32768);
  assert.equal(
    await api.debug.readWordSigned(0x2002, { littleEndian: false }),
    -32768,
  );
  assert.equal(await api.debug.readWord(0xffff), 0x5678);

  assert.equal(await api.debug.writeMemory(0x3000, 0xab), 0xab);
  assert.equal(memory[0x3000], 0xab);

  const writeRangeResult = await api.debug.writeRange(
    0xfffe,
    new Uint8Array([0x11, 0x22, 0x33]),
  );
  assert.equal(writeRangeResult.start, 0xfffe);
  assert.equal(writeRangeResult.length, 3);
  assert.equal(memory[0xfffe], 0x11);
  assert.equal(memory[0xffff], 0x22);
  assert.equal(memory[0x0000], 0x33);

  const writeWordResult = await api.debug.writeWord(0x3fff, 0x89ab);
  assert.equal(writeWordResult.value, 0x89ab);
  assert.equal(memory[0x3fff], 0xab);
  assert.equal(memory[0x4000], 0x89);

  setTimeout(function () {
    memory[0x4100] = 0x5a;
  }, 10);
  const waitByte = await api.debug.waitForMemory({
    address: 0x4100,
    value: 0x5a,
    timeoutMs: 1000,
  });
  assert.equal(waitByte.ok, true);
  assert.equal(waitByte.value, 0x5a);

  setTimeout(function () {
    memory[0x4200] = 0xcd;
    memory[0x4201] = 0xab;
  }, 10);
  const waitWord = await api.debug.waitForMemory({
    address: 0x4200,
    size: 2,
    value: 0xabcd,
    timeoutMs: 1000,
  });
  assert.equal(waitWord.ok, true);
  assert.equal(waitWord.value, 0xabcd);

  console.log("automation_memory_helpers.test.js passed");
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
