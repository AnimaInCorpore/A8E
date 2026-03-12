/* global __dirname, console, process, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadApis() {
  const hostFsSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "hostfs.js"),
    "utf8",
  );
  const hDeviceSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "hdevice.js"),
    "utf8",
  );
  const context = {
    console: console,
    Uint8Array: Uint8Array,
    ArrayBuffer: ArrayBuffer,
    Date: Date,
    Math: Math,
    Object: Object,
    String: String,
    Number: Number,
    Boolean: Boolean,
    JSON: JSON,
    Set: Set,
    Map: Map,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(hostFsSource, context, {
    filename: "hostfs.js",
  });
  vm.runInContext(hDeviceSource, context, {
    filename: "hdevice.js",
  });
  return {
    hostFsApi: context.window.A8EHostFs.createApi(),
    hDeviceApi: context.window.A8EHDevice.createApi({
      hostFsApi: context.window.A8EHostFs.createApi(),
    }),
  };
}

function normalizeSnapshotFiles(files) {
  return (Array.isArray(files) ? files : [])
    .map(function (file) {
      return {
        name: file.name,
        locked: !!file.locked,
        created: file.created | 0,
        modified: file.modified | 0,
        data: Array.from(new Uint8Array(file.data || 0)),
      };
    })
    .sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
}

function main() {
  const apis = loadApis();
  const hostFs = apis.hostFsApi.create();
  const hDevice = apis.hDeviceApi.create(hostFs);

  hostFs.writeFile("foo.txt", new Uint8Array([1, 2, 3]));
  hostFs.writeFile("bar.bin", new Uint8Array([4, 5]));
  hostFs.lockFile("bar.bin");

  const snapshot = hDevice.exportSnapshotState();
  const expectedFiles = normalizeSnapshotFiles(snapshot.files);
  assert.deepEqual(expectedFiles.map(function (file) { return file.name; }), [
    "BAR.BIN",
    "FOO.TXT",
  ]);

  hostFs.deleteFile("foo.txt");
  hostFs.unlockFile("bar.bin");
  hostFs.writeFile("new.dat", new Uint8Array([9]));

  hDevice.importSnapshotState(snapshot);

  const restored = hDevice.exportSnapshotState();
  assert.deepEqual(normalizeSnapshotFiles(restored.files), expectedFiles);
  assert.deepEqual(Array.from(hostFs.readFile("foo.txt") || []), [1, 2, 3]);
  assert.deepEqual(Array.from(hostFs.readFile("bar.bin") || []), [4, 5]);
  assert.equal(hostFs.getStatus("bar.bin").locked, true);
  assert.equal(hostFs.readFile("new.dat"), null);

  console.log("hdevice_snapshot_state.test.js passed");
}

try {
  main();
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
