/* global TextDecoder, TextEncoder, __dirname, console, process, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadSnapshotCodec() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "snapshot_codec.js"),
    "utf8",
  );
  const context = {
    console: console,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
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
    JSON: JSON,
    Math: Math,
    Number: Number,
    String: String,
    Boolean: Boolean,
    Object: Object,
    Array: Array,
    Set: Set,
    Map: Map,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, {
    filename: "snapshot_codec.js",
  });
  return context.window.A8ESnapshotCodec;
}

function main() {
  const codec = loadSnapshotCodec();
  const payload = {
    type: "a8e.snapshot",
    version: 1,
    cycleNever: Infinity,
    bytes: new Uint8Array([1, 2, 3, 4]),
    nested: {
      buffer: new Uint16Array([0x1234, 0xabcd]),
      values: [0, -1, true, "OK"],
    },
  };
  const buffer = codec.encodeSnapshot(payload);
  assert.ok(buffer instanceof ArrayBuffer);
  const restored = codec.decodeSnapshot(buffer);
  assert.equal(restored.type, "a8e.snapshot");
  assert.equal(restored.version, 1);
  assert.equal(restored.cycleNever, Infinity);
  assert.deepEqual(Array.from(restored.bytes), [1, 2, 3, 4]);
  assert.deepEqual(Array.from(new Uint8Array(restored.nested.buffer.buffer)), [
    0x34,
    0x12,
    0xcd,
    0xab,
  ]);
  assert.deepEqual(restored.nested.values, [0, -1, true, "OK"]);
  console.log("snapshot_codec_roundtrip.test.js passed");
}

try {
  main();
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
