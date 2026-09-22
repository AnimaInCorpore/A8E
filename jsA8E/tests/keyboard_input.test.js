/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SDLK_UP = 273;
const SDLK_DOWN = 274;
const SDLK_RIGHT = 275;
const SDLK_LEFT = 276;
const SDLK_A = 97;
const SDLK_F5 = 286;

// Loads the keyboard/joystick glue with a minimal machine and CPU stub.
function loadInput() {
  const context = {
    console: console,
    Math: Math,
    Object: Object,
    Array: Array,
    Number: Number,
    String: String,
    Boolean: Boolean,
    JSON: JSON,
    Infinity: Infinity,
    Set: Set,
    Uint8Array: Uint8Array,
    Uint16Array: Uint16Array,
    Uint32Array: Uint32Array,
    Int16Array: Int16Array,
    Int32Array: Int32Array,
    Float32Array: Float32Array,
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["hw.js", "keys.js", "input.js"]) {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "js", "core", file),
      "utf8",
    );
    vm.runInContext(source, context, { filename: file });
  }

  const hw = context.window.A8EHw.createApi();
  const keys = context.window.A8EKeys.createApi();
  const cpu = {
    irqCount: 0,
    irq: function () {
      cpu.irqCount++;
    },
    reset: function () {},
  };
  const machine = {
    ctx: {
      ram: new Uint8Array(0x10000),
      sram: new Uint8Array(0x10000),
      ioData: { keyPressCounter: 0 },
    },
  };
  machine.ctx.ram[hw.IO_PORTA] = 0xff;
  machine.ctx.ram[hw.IO_SKCTL_SKSTAT] = 0xff;
  machine.ctx.ram[hw.IO_IRQEN_IRQST] = 0xff;

  const system = { hw: hw, ram: machine.ctx.ram, warmResets: 0, raisedIrqs: [] };
  system.input = context.window.A8EInput.createApi(
    Object.assign({}, hw, {
      CPU: cpu,
      KEY_CODE_TABLE: keys.KEY_CODE_TABLE,
      browserKeyToSdlSym: keys.browserKeyToSdlSym,
    }),
  ).createRuntime({
    machine: machine,
    isReady: function () {
      return true;
    },
    warmReset: function () {
      system.warmResets++;
    },
    raisePokeyIrq: function (mask) {
      system.raisedIrqs.push(mask);
    },
  });
  machine.ctx.ioData.trigPhysical = new Uint8Array([1, 1, 1, 0]);
  machine.ctx.ioData.trigLatched = new Uint8Array([1, 1, 1, 0]);
  machine.ctx.ram[hw.IO_GRAFP3_TRIG0] = 1;
  return system;
}

function keyDown(system, sym, shiftKey) {
  return system.input.onKeyDown({ sdlSym: sym, shiftKey: !!shiftKey });
}

function keyUp(system, sym, shiftKey) {
  return system.input.onKeyUp({ sdlSym: sym, shiftKey: !!shiftKey });
}

function keyHeld(system) {
  return (system.ram[system.hw.IO_SKCTL_SKSTAT] & 0x04) === 0;
}

function testShiftArrowSendsCursorKeysAndReleases() {
  const system = loadInput();
  const hw = system.hw;
  // AHRM 5.8 Table 11: Ctrl + - = + * are the Atari cursor keys.
  const cases = [
    [SDLK_UP, 0x8e],
    [SDLK_DOWN, 0x8f],
    [SDLK_LEFT, 0x86],
    [SDLK_RIGHT, 0x87],
  ];
  for (const [sym, code] of cases) {
    system.raisedIrqs.length = 0;
    keyDown(system, sym, true);
    assert.equal(system.ram[hw.IO_STIMER_KBCODE], code, "Shift+arrow " + sym + " key code");
    assert.deepEqual(system.raisedIrqs, [hw.IRQ_OTHER_KEY_PRESSED], "a key press should raise the keyboard IRQ");
    assert.equal(keyHeld(system), true, "Shift+arrow " + sym + " should hold SKSTAT bit 2 low");
    assert.equal(system.ram[hw.IO_PORTA], 0xff, "Shift+arrow " + sym + " must not move the joystick");

    // Shift may already be up when the arrow is released.
    keyUp(system, sym, false);
    assert.equal(keyHeld(system), false, "releasing Shift+arrow " + sym + " should set SKSTAT bit 2");
  }

  // A plain arrow is the joystick and must not touch the keyboard.
  keyDown(system, SDLK_UP, false);
  assert.equal(system.ram[hw.IO_PORTA], 0xfe, "Up should move joystick 1 up");
  assert.equal(keyHeld(system), false, "Up must not report a held key");
  keyUp(system, SDLK_UP, false);
  assert.equal(system.ram[hw.IO_PORTA], 0xff, "releasing Up should center the joystick");

  // A cursor key released while another key is held keeps bit 2 low.
  keyDown(system, SDLK_A, false);
  keyDown(system, SDLK_DOWN, true);
  keyUp(system, SDLK_DOWN, true);
  assert.equal(keyHeld(system), true, "A is still held after Shift+Down is released");
  keyUp(system, SDLK_A, false);
  assert.equal(keyHeld(system), false, "releasing the last key should set SKSTAT bit 2");
}

function testResetKeyUsesWarmReset() {
  const system = loadInput();
  keyDown(system, SDLK_UP, false);
  keyDown(system, SDLK_F5, false);
  assert.equal(system.warmResets, 1, "F5 should run the XL warm reset");
  assert.equal(system.ram[system.hw.IO_PORTA], 0xff, "F5 should center the joystick");
}

function testReleaseAllKeepsCartridgeSense() {
  const system = loadInput();
  system.input.releaseAll();
  // TRIG3 is the cartridge sense line (AHRM 2.8), not a joystick trigger.
  assert.equal(system.ram[system.hw.IO_COLPM1_TRIG3], 0x00, "releaseAll must not set TRIG3");
  assert.equal(system.ram[system.hw.IO_GRAFP3_TRIG0], 0x01, "releaseAll should release TRIG0");
}

testShiftArrowSendsCursorKeysAndReleases();
testResetKeyUsesWarmReset();
testReleaseAllKeepsCartridgeSense();

console.log("keyboard_input tests passed");
