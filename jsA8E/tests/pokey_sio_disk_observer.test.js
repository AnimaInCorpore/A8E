/* global __dirname, console, process, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function checksum(bytes) {
  let value = 0;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] & 0xff;
    value = (value + (((value + byte) >> 8) & 0xff) + byte) & 0xff;
  }
  return value & 0xff;
}

function loadApi() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "pokey_sio.js"),
    "utf8",
  );
  const context = {
    console: console,
    Uint8Array: Uint8Array,
    Int16Array: Int16Array,
    Number: Number,
    Object: Object,
    Math: Math,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "pokey_sio.js" });
  return context.window.A8EPokeySio.createApi({
    IO_SEROUT_SERIN: 0xd20d,
    SERIAL_OUTPUT_DATA_NEEDED_CYCLES: 1,
    SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES: 1,
    SERIAL_INPUT_FIRST_DATA_READY_CYCLES: 1,
    SERIAL_INPUT_DATA_READY_CYCLES: 1,
    cycleTimedEventUpdate: function () {},
  });
}

function makeContext(observer, activityObserver) {
  const bytes = new Uint8Array(16 + 3 * 128 + 128);
  bytes[4] = 128;
  const ioData = {
    sioBuffer: new Uint8Array(4096),
    sioOutIndex: 0,
    sioOutPhase: 0,
    sioDataIndex: 0,
    sioPendingDevice: 0,
    sioPendingCmd: 0,
    sioPendingSector: 0,
    sioPendingBytes: 0,
    sioInIndex: 0,
    sioInSize: 0,
    sioPendingReadSize: 0,
    serialOutputNeedDataCycle: 0,
    serialOutputTransmissionDoneCycle: 0,
    serialInputDataReadyCycle: 0,
    sioDiagnostics: { eventCount: 0, events: [] },
    deviceSlots: new Int16Array([3, -1, -1, -1, -1, -1, -1, -1]),
    diskImages: [{ bytes: new Uint8Array(1) }, { bytes: new Uint8Array(1) }, { bytes: new Uint8Array(1) }, { bytes: bytes, size: bytes.length }],
    diskMediaChangeObserver: observer,
    diskActivityObserver: activityObserver,
  };
  return {
    cycleCounter: 0,
    ram: new Uint8Array(0x10000),
    ioData: ioData,
  };
}

function main() {
  const observed = [];
  const activities = [];
  const api = loadApi();
  const ctx = makeContext(
    function (imageIndex) { observed.push(imageIndex); },
    function (activity) { activities.push(activity); },
  );
  const command = [0x31, 0x57, 0x01, 0x00];
  command.push(checksum(command));
  command.forEach(function (value) { api.seroutWrite(ctx, value); });

  const payload = new Uint8Array(128);
  payload.fill(0xa5);
  for (let i = 0; i < payload.length; i++) api.seroutWrite(ctx, payload[i]);
  api.seroutWrite(ctx, checksum(payload));

  assert.deepEqual(Array.from(ctx.ioData.diskImages[3].bytes.subarray(16, 144)), Array.from(payload));
  assert.deepEqual(observed, [3]);
  assert.equal(activities.length, 1);
  assert.equal(activities[0].imageIndex, 3);
  assert.equal(activities[0].deviceSlot, 0);
  assert.equal(activities[0].operation, "write");
  assert.equal(ctx.ioData.sioBuffer[0], "A".charCodeAt(0));
  assert.equal(ctx.ioData.sioBuffer[1], "C".charCodeAt(0));
  console.log("pokey_sio_disk_observer.test.js passed");
}

try {
  main();
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
