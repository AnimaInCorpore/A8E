/* global __dirname, console, process, require */

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");
const context = vm.createContext({});
context.window = context;
context.self = context;
context.globalThis = context;

[
  "js/core/cpu_tables.js",
  "js/core/assembler/shared.js",
  "js/core/assembler/lexer.js",
  "js/core/assembler/preprocessor.js",
  "js/core/assembler/parser.js",
  "js/core/assembler/object_writer.js",
  "js/core/assembler/assembler.js",
  "js/core/assembler_core.js",
].forEach(function (relativePath) {
  const source = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
  vm.runInContext(source, context, { filename: relativePath });
});

const assembly = fs.readFileSync(path.join(rootDir, "assets/standby.asm"), "utf8");
const assembled = context.A8EAssemblerCore.assembleToXex(assembly);
assert.equal(assembled.ok, true, assembled.error || "standby assembly failed");

const xex = fs.readFileSync(path.join(rootDir, "assets/standby.xex"));
assert.deepEqual(Buffer.from(assembled.bytes), xex);

let index = 0;
const segments = [];
while (index < xex.length) {
  while (index + 1 < xex.length && xex[index] === 0xff && xex[index + 1] === 0xff) {
    index += 2;
  }
  if (index >= xex.length) break;
  const start = xex[index] | (xex[index + 1] << 8);
  const end = xex[index + 2] | (xex[index + 3] << 8);
  index += 4;
  const data = xex.subarray(index, index + end - start + 1);
  assert.equal(data.length, end - start + 1, "standby segment is complete");
  segments.push({ start: start, end: end, data: data });
  index += data.length;
}

const runVector = segments.find(function (segment) {
  return segment.start <= 0x02e0 && segment.end >= 0x02e1;
});
assert.ok(runVector, "standby XEX contains RUNAD");
const runAddress =
  runVector.data[0x02e0 - runVector.start] |
  (runVector.data[0x02e1 - runVector.start] << 8);
assert.equal(runAddress, assembled.runAddr);
assert.ok(segments.some(function (segment) {
  return segment.start <= runAddress && segment.end >= runAddress;
}), "RUNAD points to loaded code");
assert.ok(xex.includes(Buffer.from("INSERT A DISK")));
assert.ok(xex.includes(Buffer.from("DROP A DISK OR OPEN DISK")));
assert.ok(xex.includes(Buffer.from("MOUNT SIDE 2 IN D1 WHEN ASKED")));
assert.ok(xex.includes(Buffer.from("FULL RESET TO BOOT FROM D1")));

const displayList = segments.find(function (segment) {
  return segment.start === 0x2400;
});
assert.ok(displayList, "standby XEX contains its custom display list");
assert.deepEqual(
  Array.from(displayList.data.subarray(0, 6)),
  [0x70, 0x70, 0x70, 0x42, 0x00, 0x30],
  "display list starts with three blank rows and LMS to screen RAM",
);
assert.equal(displayList.data.length, 29, "display list covers 21 text rows and loops");
assert.deepEqual(
  Array.from(displayList.data.subarray(-3)),
  [0x41, 0x00, 0x24],
  "display list jumps back to its start",
);

const screenBuffer = segments.find(function (segment) {
  return segment.start === 0x3000;
});
assert.ok(screenBuffer, "standby XEX contains a dedicated screen buffer");
assert.equal(screenBuffer.data.length, 840, "screen buffer holds 21 40-column rows");

console.log("startup_standby.test.js passed");
