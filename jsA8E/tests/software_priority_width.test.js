/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadSoftwareApi() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "render", "software.js"),
    "utf8",
  );
  const context = {
    console: console,
    Uint8Array: Uint8Array,
    Uint16Array: Uint16Array,
    Uint32Array: Uint32Array,
    Math: Math,
    Number: Number,
    Object: Object,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "software.js" });

  return context.window.A8ESoftware.createApi({
    Palette: {
      createAtariPaletteRgb: function () {
        return new Uint8Array(768);
      },
    },
    PIXELS_PER_LINE: 456,
    LINES_PER_SCREEN_PAL: 312,
    VIEW_W: 336,
    VIEW_H: 240,
    VIEW_X: 0,
    VIEW_Y: 0,
  });
}

function testPriorityBuffersUse16Bits() {
  const api = loadSoftwareApi();
  const video = api.makeVideo();

  assert.ok(video.priority instanceof Uint16Array);
  assert.ok(video.playfieldScratchPriority instanceof Uint16Array);

  api.fillLine(video, 0, 0, 1, 0x12, 0x1234);

  assert.equal(video.pixels[0], 0x12);
  assert.equal(video.priority[0], 0x1234);
}

testPriorityBuffersUse16Bits();
console.log("software_priority_width tests passed");
