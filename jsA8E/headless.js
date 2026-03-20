/* global __dirname, clearInterval, clearTimeout, console, fetch, module, process, queueMicrotask, require, setInterval, setTimeout */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { Blob, Buffer } = require("node:buffer");
const { TextEncoder, TextDecoder } = require("node:util");
const { URL, URLSearchParams } = require("node:url");

const SCRIPT_PATHS = [
  "js/shared/util.js",
  "js/render/palette.js",
  "js/render/software.js",
  "js/core/cpu_tables.js",
  "js/core/assembler/shared.js",
  "js/core/assembler/lexer.js",
  "js/core/assembler/preprocessor.js",
  "js/core/assembler/parser.js",
  "js/core/assembler/object_writer.js",
  "js/core/assembler/assembler.js",
  "js/core/assembler_core.js",
  "js/core/cpu.js",
  "js/core/pokey_sio.js",
  "js/core/pokey.js",
  "js/audio/runtime.js",
  "js/core/keys.js",
  "js/core/input.js",
  "js/core/hw.js",
  "js/core/state.js",
  "js/core/snapshot_codec.js",
  "js/core/memory.js",
  "js/core/io.js",
  "js/core/playfield/renderer_base.js",
  "js/core/playfield/mode_2_3.js",
  "js/core/playfield/mode_4_5.js",
  "js/core/playfield/mode_6_7.js",
  "js/core/playfield/mode_8_f.js",
  "js/core/playfield/renderer.js",
  "js/core/playfield/playfield.js",
  "js/core/antic.js",
  "js/core/gtia.js",
  "js/core/hostfs.js",
  "js/core/hdevice.js",
  "js/core/debugger.js",
  "js/core/atari_support.js",
  "js/core/atari.js",
  "js/app/automation/utils.js",
  "js/app/automation/media.js",
  "js/app/automation/artifacts.js",
  "js/app/automation/xex.js",
  "js/app/automation/build.js",
  "js/app/automation_api.js",
];

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47,
  0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC32_TABLE = (function () {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i >>> 0;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 1) {
        crc = (0xedb88320 ^ (crc >>> 1)) >>> 0;
      } else {
        crc = crc >>> 1;
      }
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function getSharedArrayBufferCtor() {
  return typeof SharedArrayBuffer !== "undefined" ? SharedArrayBuffer : undefined;
}

function getFetch(options) {
  if (options && typeof options.fetch === "function") return options.fetch;
  if (typeof fetch === "function") return fetch.bind(globalThis);
  return async function () {
    throw new Error(
      "jsA8E headless automation requires a fetch implementation for URL-based media loading",
    );
  };
}

function toArrayBufferCopy(value) {
  if (value === null || value === undefined) return new ArrayBuffer(0);
  if (Buffer.isBuffer(value)) {
    const out = new Uint8Array(value.length);
    out.set(value);
    return out.buffer;
  }
  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }
  if (
    typeof SharedArrayBuffer !== "undefined" &&
    value instanceof SharedArrayBuffer
  ) {
    const bytes = new Uint8Array(value);
    const out = new Uint8Array(bytes.length);
    out.set(bytes);
    return out.buffer;
  }
  if (ArrayBuffer.isView(value)) {
    const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const out = new Uint8Array(view.length);
    out.set(view);
    return out.buffer;
  }
  if (Array.isArray(value)) {
    return new Uint8Array(value).buffer;
  }
  throw new TypeError("Unsupported binary input");
}

function resolveBinaryInput(input, cwd) {
  if (input === null || input === undefined) return null;
  if (typeof input === "string") {
    const filename = path.isAbsolute(input)
      ? input
      : path.resolve(cwd || process.cwd(), input);
    return toArrayBufferCopy(fs.readFileSync(filename));
  }
  return toArrayBufferCopy(input);
}

function makeLocation(initialHref, onAssign) {
  let current = new URL(
    initialHref || "http://localhost/jsA8E/index.html",
  );
  return {
    get href() {
      return current.href;
    },
    set href(value) {
      current = new URL(String(value), current.href);
    },
    get search() {
      return current.search;
    },
    get origin() {
      return current.origin;
    },
    get pathname() {
      return current.pathname;
    },
    assign: function (value) {
      current = new URL(String(value), current.href);
      if (typeof onAssign === "function") onAssign(current.href);
    },
    toString: function () {
      return current.href;
    },
  };
}

function createAnimationHost(options) {
  const frameDelayMs =
    options && Number.isFinite(options.frameDelayMs)
      ? Math.max(0, options.frameDelayMs)
      : 0;
  const frameTimeMs =
    options && Number.isFinite(options.frameTimeMs) && options.frameTimeMs > 0
      ? options.frameTimeMs
      : 1000 / 60;
  let nextFrameId = 1;
  let syntheticClock = 0;
  const pending = new Map();

  function requestAnimationFrame(callback) {
    if (typeof callback !== "function") {
      throw new TypeError("requestAnimationFrame callback must be a function");
    }
    const id = nextFrameId++;
    const timer = setTimeout(function () {
      pending.delete(id);
      syntheticClock += frameTimeMs;
      callback(syntheticClock);
    }, frameDelayMs);
    pending.set(id, timer);
    return id;
  }

  function cancelAnimationFrame(id) {
    const timer = pending.get(id);
    if (!timer) return;
    clearTimeout(timer);
    pending.delete(id);
  }

  function dispose() {
    pending.forEach(function (timer) {
      clearTimeout(timer);
    });
    pending.clear();
  }

  return {
    requestAnimationFrame: requestAnimationFrame,
    cancelAnimationFrame: cancelAnimationFrame,
    dispose: dispose,
  };
}

function createDisplay2dContext() {
  return {
    createImageData: function (width, height) {
      const w = Math.max(0, width | 0);
      const h = Math.max(0, height | 0);
      return {
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      };
    },
    putImageData: function () {},
  };
}

function cloneImageData(imageData, width, height) {
  const w = Math.max(0, width | 0);
  const h = Math.max(0, height | 0);
  if (!imageData || !imageData.data) {
    return {
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    };
  }
  const view = imageData.data;
  const out = new Uint8ClampedArray(view.length);
  out.set(view);
  return {
    width: imageData.width | 0,
    height: imageData.height | 0,
    data: out,
  };
}

function makePngChunk(type, data) {
  const chunkType = Buffer.from(String(type || "IEND"), "ascii");
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data || []);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length >>> 0, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(chunkType, payload), 0);
  return Buffer.concat([length, chunkType, payload, crc]);
}

function crc32(type, payload) {
  let crc = 0xffffffff;
  for (let i = 0; i < type.length; i++) {
    crc = CRC32_TABLE[(crc ^ type[i]) & 0xff] ^ (crc >>> 8);
  }
  for (let i = 0; i < payload.length; i++) {
    crc = CRC32_TABLE[(crc ^ payload[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeImageDataToPng(imageData, width, height) {
  const w = Math.max(0, width | 0);
  const h = Math.max(0, height | 0);
  const rgba = imageData && imageData.data ? imageData.data : new Uint8ClampedArray(w * h * 4);
  const stride = w * 4;
  const scanlines = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const srcOffset = y * stride;
    const dstOffset = y * (stride + 1);
    scanlines[dstOffset] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + srcOffset, stride).copy(
      scanlines,
      dstOffset + 1,
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w >>> 0, 0);
  ihdr.writeUInt32BE(h >>> 0, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(scanlines);

  return Buffer.concat([
    PNG_SIGNATURE,
    makePngChunk("IHDR", ihdr),
    makePngChunk("IDAT", idat),
    makePngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function createHeadlessOffscreenCanvasClass() {
  function HeadlessCanvas2DContext(canvas) {
    this.canvas = canvas;
    this._imageData = null;
  }

  HeadlessCanvas2DContext.prototype.createImageData = function (width, height) {
    return cloneImageData(null, width, height);
  };

  HeadlessCanvas2DContext.prototype.putImageData = function (imageData) {
    this._imageData = cloneImageData(imageData);
  };

  HeadlessCanvas2DContext.prototype._getImageData = function () {
    return cloneImageData(this._imageData, this.canvas.width, this.canvas.height);
  };

  function HeadlessOffscreenCanvas(width, height) {
    this.width = Math.max(0, width | 0);
    this.height = Math.max(0, height | 0);
    this._ctx2d = null;
  }

  HeadlessOffscreenCanvas.prototype.getContext = function (kind) {
    if (String(kind || "") !== "2d") return null;
    if (!this._ctx2d) this._ctx2d = new HeadlessCanvas2DContext(this);
    return this._ctx2d;
  };

  HeadlessOffscreenCanvas.prototype.convertToBlob = async function (options) {
    const type =
      options && typeof options.type === "string" && options.type.length
        ? options.type
        : "image/png";
    if (type !== "image/png") {
      throw new Error("Headless OffscreenCanvas only supports image/png");
    }
    const ctx = this.getContext("2d");
    const png = encodeImageDataToPng(
      ctx ? ctx._getImageData() : null,
      this.width,
      this.height,
    );
    const blob = new Blob([png], { type: type });
    return {
      type: type,
      size: png.length,
      arrayBuffer: function () {
        return blob.arrayBuffer();
      },
    };
  };

  return HeadlessOffscreenCanvas;
}

function loadScripts(context, rootDir) {
  for (let i = 0; i < SCRIPT_PATHS.length; i++) {
    const relPath = SCRIPT_PATHS[i];
    const filename = path.join(rootDir, relPath);
    const source = fs.readFileSync(filename, "utf8");
    vm.runInContext(source, context, { filename: relPath });
  }
}

async function waitForHostFsReady(app, options) {
  if (!app || !app.hDevice || typeof app.hDevice.getHostFs !== "function") return;
  const hostFs = app.hDevice.getHostFs();
  if (!hostFs || typeof hostFs.isReady !== "function") return;
  const timeoutMs =
    options && Number.isFinite(options.hostFsTimeoutMs)
      ? Math.max(0, options.hostFsTimeoutMs)
      : 2000;
  const startedAt = Date.now();
  while (!hostFs.isReady()) {
    if (timeoutMs > 0 && Date.now() - startedAt >= timeoutMs) {
      throw new Error("Timed out while waiting for headless HostFS initialization");
    }
    await new Promise(function (resolve) {
      setTimeout(resolve, 5);
    });
  }
}

function buildContext(options, animationHost) {
  const location = makeLocation(
    options && options.locationHref ? options.locationHref : null,
    options && typeof options.onReload === "function" ? options.onReload : null,
  );
  const context = {
    console: options && options.console ? options.console : console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    queueMicrotask:
      typeof queueMicrotask === "function"
        ? queueMicrotask
        : function (fn) {
            Promise.resolve().then(fn);
          },
    requestAnimationFrame: animationHost.requestAnimationFrame,
    cancelAnimationFrame: animationHost.cancelAnimationFrame,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    URL: URL,
    URLSearchParams: URLSearchParams,
    Date: Date,
    Math: Math,
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
    Array: Array,
    ArrayBuffer: ArrayBuffer,
    SharedArrayBuffer: getSharedArrayBufferCtor(),
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
    Buffer: Buffer,
    Blob: Blob,
    fetch: getFetch(options),
    location: location,
    navigator: {
      userAgent:
        options && options.userAgent
          ? String(options.userAgent)
          : "jsA8E-headless",
    },
    atob: function (value) {
      return Buffer.from(String(value), "base64").toString("binary");
    },
    btoa: function (value) {
      return Buffer.from(String(value), "binary").toString("base64");
    },
    OffscreenCanvas: createHeadlessOffscreenCanvasClass(),
    performance: {
      now: function () {
        return Date.now();
      },
    },
  };
  if (options && options.globals && typeof options.globals === "object") {
    Object.assign(context, options.globals);
  }
  context.window = context;
  context.self = context;
  context.globalThis = context;
  return context;
}

async function createHeadlessAutomation(options) {
  const opts = options && typeof options === "object" ? options : {};
  const animationHost = createAnimationHost(opts);
  const context = buildContext(opts, animationHost);
  vm.createContext(context);

  try {
    loadScripts(context, __dirname);

    const app = context.A8EApp.create({
      ctx2d: createDisplay2dContext(),
      debugEl: null,
      audioEnabled: !!opts.audioEnabled,
      turbo: !!opts.turbo,
      sioTurbo: opts.sioTurbo !== false,
      skipRendering: opts.skipRendering !== false,
      optionOnStart: !!opts.optionOnStart,
      keyboardMappingMode:
        opts.keyboardMappingMode === "original" ? "original" : "translated",
    });

    const roms = opts.roms && typeof opts.roms === "object" ? opts.roms : null;
    if (roms && roms.os !== undefined && roms.os !== null) {
      app.loadOsRom(resolveBinaryInput(roms.os, opts.cwd));
    }
    if (roms && roms.basic !== undefined && roms.basic !== null) {
      app.loadBasicRom(resolveBinaryInput(roms.basic, opts.cwd));
    }

    const api = context.A8EAutomation.attach({ app: app });
    await waitForHostFsReady(app, opts);

    let disposed = false;
    async function dispose() {
      if (disposed) return;
      disposed = true;
      try {
        if (api && typeof api.dispose === "function") {
          await api.dispose();
        } else if (app && typeof app.dispose === "function") {
          app.dispose();
        }
      } finally {
        animationHost.dispose();
      }
    }

    return {
      api: api,
      app: app,
      context: context,
      dispose: dispose,
    };
  } catch (err) {
    animationHost.dispose();
    throw err;
  }
}

module.exports = {
  createHeadlessAutomation: createHeadlessAutomation,
};
