/* global __dirname, console, process, require, setTimeout, clearTimeout */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadApi() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "disk_library.js"),
    "utf8",
  );
  const context = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Promise: Promise,
    Uint8Array: Uint8Array,
    ArrayBuffer: ArrayBuffer,
    Date: Date,
    Math: Math,
    Object: Object,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Map: Map,
    Set: Set,
    Error: Error,
  };
  context.window = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "disk_library.js" });
  return context.window.A8EDiskLibrary.createApi();
}

async function main() {
  const mounted = new Map();
  const unmounted = [];
  let nextImageIndex = 0;
  const api = loadApi();
  const library = api.create({
    mountDisk: function (bytes, name, slot) {
      const imageIndex = nextImageIndex++;
      mounted.set(slot, { imageIndex: imageIndex, bytes: new Uint8Array(bytes), name: name });
      return { imageIndex: imageIndex, deviceSlot: slot };
    },
    unmountDisk: function (slot) {
      unmounted.push(slot);
      mounted.delete(slot);
    },
    getDiskImageBytes: function (imageIndex) {
      for (const item of mounted.values()) {
        if (item.imageIndex === imageIndex) return item.bytes;
      }
      return null;
    },
  });

  await library.init();
  assert.equal(library.isReady(), true);
  const atr = await library.addFile("GAME.ATR", new Uint8Array([1, 2, 3]));
  assert.equal(atr.name, "GAME.ATR");
  assert.equal(library.listFiles()[0].mountedSlot, -1);

  await library.mountFile(atr.id, 0);
  assert.equal(library.listFiles()[0].mountedSlot, 0);
  const firstMount = mounted.get(0);
  firstMount.bytes[1] = 9;
  library.onDiskMediaChanged(firstMount.imageIndex);

  const downloaded = await library.downloadFile(atr.id);
  assert.equal(downloaded.name, "GAME.ATR");
  assert.deepEqual(Array.from(new Uint8Array(downloaded.buffer)), [1, 9, 3]);
  assert.equal(library.listFiles()[0].dirty, false);

  const second = await library.addFile("SECOND.ATR", new Uint8Array([4]));
  await library.mountFile(second.id, 0);
  const files = library.listFiles();
  assert.equal(files.find(function (file) { return file.id === atr.id; }).mountedSlot, -1);
  assert.equal(files.find(function (file) { return file.id === second.id; }).mountedSlot, 0);
  assert.deepEqual(unmounted, [0]);

  await library.deleteFile(second.id);
  assert.equal(library.listFiles().length, 1);
  console.log("disk_library.test.js passed");
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
