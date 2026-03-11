/* global Buffer, TextDecoder, TextEncoder, URL, __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadAutomationApi(fetchImpl) {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "app", "automation_api.js"),
    "utf8",
  );
  const context = {
    console: console,
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
    fetch: fetchImpl,
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
  const fetchCalls = [];
  const responses = [
    {
      url: "https://cdn.example/roms/os.rom?v=20260311",
      bytes: [1, 2, 3, 4],
      contentType: "application/octet-stream",
    },
    {
      url: "https://cdn.example/roms/basic.rom?slot=main&_a8e_cb=tag-77",
      bytes: [9, 8, 7],
      contentType: "application/octet-stream",
    },
  ];
  const api = loadAutomationApi(async function (url, init) {
    fetchCalls.push({
      url: String(url),
      init: Object.assign({}, init || {}),
    });
    const next = responses.shift();
    assert.ok(next, "unexpected fetch call");
    return {
      ok: true,
      status: 200,
      url: next.url,
      headers: {
        get: function (name) {
          return String(name || "").toLowerCase() === "content-type"
            ? next.contentType
            : null;
        },
      },
      arrayBuffer: async function () {
        return Uint8Array.from(next.bytes).buffer;
      },
    };
  });

  let osBytes = null;
  let basicBytes = null;
  const app = {
    isReady: function () { return true; },
    onDebugStateChange: function () {
      return function () {};
    },
    loadDiskToDeviceSlot: function () {},
    loadOsRom: function (buffer) {
      osBytes = Array.from(new Uint8Array(buffer));
    },
    loadBasicRom: function (buffer) {
      basicBytes = Array.from(new Uint8Array(buffer));
    },
    reset: function () {},
    start: function () {},
  };

  api.attach({ app: app });

  const capabilities = await api.getCapabilities();
  assert.equal(capabilities.urlMediaLoad, true);
  assert.equal(capabilities.urlRomLoad, true);
  assert.equal(capabilities.urlDiskLoad, true);
  assert.equal(capabilities.urlXexLoad, true);

  const osResult = await api.media.loadOsRomFromUrl(
    "https://assets.example/roms/os.rom",
    {
      cacheBust: "20260311",
      cacheBustParam: "v",
      cache: "reload",
      credentials: "include",
      mode: "cors",
    },
  );
  assert.deepEqual(osBytes, [1, 2, 3, 4]);
  assert.equal(fetchCalls[0].url, "https://assets.example/roms/os.rom?v=20260311");
  assert.deepEqual(fetchCalls[0].init, {
    cache: "reload",
    credentials: "include",
    mode: "cors",
  });
  assert.equal(osResult.kind, "os");
  assert.equal(osResult.ready, true);
  assert.equal(osResult.sourceUrl, "https://cdn.example/roms/os.rom?v=20260311");
  assert.equal(osResult.byteLength, 4);
  assert.equal(osResult.contentType, "application/octet-stream");

  const basicResult = await api.media.loadRomFromUrl({
    kind: "basic",
    url: "https://assets.example/roms/basic.rom?slot=main",
    cacheBust: "tag-77",
    fetch: {
      cache: "no-store",
      credentials: "same-origin",
      mode: "same-origin",
    },
  });
  assert.deepEqual(basicBytes, [9, 8, 7]);
  assert.equal(
    fetchCalls[1].url,
    "https://assets.example/roms/basic.rom?slot=main&_a8e_cb=tag-77",
  );
  assert.deepEqual(fetchCalls[1].init, {
    cache: "no-store",
    credentials: "same-origin",
    mode: "same-origin",
  });
  assert.equal(basicResult.kind, "basic");
  assert.equal(basicResult.ready, true);
  assert.equal(
    basicResult.sourceUrl,
    "https://cdn.example/roms/basic.rom?slot=main&_a8e_cb=tag-77",
  );
  assert.equal(basicResult.byteLength, 3);
  assert.equal(basicResult.contentType, "application/octet-stream");

  console.log("automation_url_media_loading: ok");
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exitCode = 1;
});
