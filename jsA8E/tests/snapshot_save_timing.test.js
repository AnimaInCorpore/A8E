/* global __dirname, console, process, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadAppHarness() {
  const supportSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "atari_support.js"),
    "utf8",
  );
  const snapshotSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "atari_snapshot.js"),
    "utf8",
  );
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "atari.js"),
    "utf8",
  );

  const runCalls = [];
  let encodedSnapshot = null;
  let nextDecodedSnapshot = null;
  let suspendCount = 0;
  let restoreCount = 0;

  const hwBase = {
    PIXELS_PER_LINE: 8,
    LINES_PER_SCREEN_PAL: 4,
    CYCLES_PER_LINE: 5,
    ATARI_CPU_HZ_PAL: 1000,
    CYCLE_NEVER: Infinity,
    FIRST_VISIBLE_LINE: 0,
    LAST_VISIBLE_LINE: 1,
    VIEW_W: 8,
    VIEW_H: 4,
    VIEW_X: 0,
    VIEW_Y: 0,
    SERIAL_OUTPUT_DATA_NEEDED_CYCLES: 1,
    SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES: 1,
    SERIAL_INPUT_FIRST_DATA_READY_CYCLES: 1,
    SERIAL_INPUT_DATA_READY_CYCLES: 1,
    SIO_TURBO_EMU_MULTIPLIER: 2,
    POKEY_AUDIO_MAX_CATCHUP_CYCLES: 0,
    NMI_DLI: 0x80,
    NMI_VBI: 0x40,
    NMI_RESET: 0x20,
    ANTIC_MODE_INFO: new Array(16).fill(null).map(function () {
      return { lines: 1, ppb: 8 };
    }),
    PRIORITY_TABLE_BKG_PF012: new Uint8Array(4),
    PRIORITY_TABLE_BKG_PF013: new Uint8Array(4),
    PRIORITY_TABLE_PF0123: new Uint8Array(4),
    SCRATCH_GTIA_COLOR_TABLE: new Uint8Array(16),
    SCRATCH_COLOR_TABLE_A: new Uint8Array(4),
    SCRATCH_COLOR_TABLE_B: new Uint8Array(4),
    SCRATCH_BACKGROUND_TABLE: new Uint8Array(4),
    IO_INIT_VALUES: [],
  };
  const hwApi = new Proxy(hwBase, {
    get: function (target, prop) {
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      return 0;
    },
  });

  const context = {
    console: console,
    Uint8Array: Uint8Array,
    Uint8ClampedArray: Uint8ClampedArray,
    Int16Array: Int16Array,
    ArrayBuffer: ArrayBuffer,
    DataView: DataView,
    Math: Math,
    Date: Date,
    Object: Object,
    Number: Number,
    String: String,
    Boolean: Boolean,
    JSON: JSON,
    Promise: Promise,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    requestAnimationFrame: function () {
      return 1;
    },
    cancelAnimationFrame: function () {},
  };
  context.window = context;
  context.A8EUtil = {
    fixedAdd: function (value, mask, add) {
      void mask;
      return (value + add) & 0xffff;
    },
    toHex2: function (value) {
      return ((value | 0) & 0xff).toString(16).toUpperCase().padStart(2, "0");
    },
    toHex4: function (value) {
      return ((value | 0) & 0xffff).toString(16).toUpperCase().padStart(4, "0");
    },
  };
  context.A8E6502 = {
    makeContext: function () {
      return {
        cpu: { a: 0, x: 0, y: 0, sp: 0, pc: 0, ps: 0 },
        ram: new Uint8Array(0x10000),
        sram: new Uint8Array(0x10000),
        accessFunctionList: new Array(0x10000),
        accessFunctionOverride: null,
        accessFunction: null,
        accessAddress: 0,
        accessMode: 0,
        pageCrossed: 0,
        cycleCounter: 0,
        stallCycleCounter: 0,
        ioCycleTimedEventCycle: Infinity,
        ioCycleTimedEventFunction: null,
        irqPending: 0,
        breakRun: false,
        instructionCounter: 0,
        instructionTraceHook: null,
        illegalOpcodeHook: null,
        ioData: null,
        pcHooks: Object.create(null),
      };
    },
    getPs: function (ctx) {
      return ctx.cpu.ps & 0xff;
    },
    setPs: function (ctx, value) {
      ctx.cpu.ps = value & 0xff;
    },
    run: function (ctx, targetCycle) {
      runCalls.push(targetCycle | 0);
      ctx.cycleCounter = targetCycle | 0;
      return ctx.cycleCounter | 0;
    },
    setPcHook: function (ctx, addr, fn) {
      ctx.pcHooks[addr & 0xffff] = fn;
    },
    clearPcHook: function (ctx, addr) {
      delete ctx.pcHooks[addr & 0xffff];
    },
    setIo: function () {},
    setRom: function () {},
    setRam: function () {},
    reset: function (ctx) {
      ctx.cpu.pc = 0x1000;
    },
    nmi: function () {},
    irq: function () {},
    stall: function () {},
    executeOne: function () {},
  };
  context.A8EPalette = {};
  context.A8EHw = {
    createApi: function () {
      return hwApi;
    },
  };
  context.A8ESoftware = {
    createApi: function (cfg) {
      return {
        makeVideo: function () {
          const scratchWidth = cfg.PIXELS_PER_LINE + 128;
          const lineCount = cfg.LINES_PER_SCREEN_PAL;
          return {
            pixels: new Uint8Array(cfg.PIXELS_PER_LINE * lineCount),
            priority: new Uint8Array(cfg.PIXELS_PER_LINE * lineCount),
            playfieldScratchWidth: scratchWidth,
            playfieldScratchPixels: new Uint8Array(scratchWidth * lineCount),
            playfieldScratchPriority: new Uint8Array(scratchWidth * lineCount),
            paletteRgb: new Uint8Array(768),
          };
        },
        blitViewportToImageData: function () {},
        fillLine: function () {},
      };
    },
  };
  context.A8EKeys = {
    createApi: function () {
      return {
        KEY_CODE_TABLE: {},
        browserKeyToSdlSym: function () {
          return 0;
        },
        setKeyboardMappingMode: function () {},
      };
    },
  };
  context.A8EInput = {
    createApi: function () {
      return {
        createRuntime: function () {
          return {
            onKeyDown: function () {},
            onKeyUp: function () {},
            releaseAll: function () {},
            getConsoleKeyState: function () {
              return { raw: 0x07, option: false, select: false, start: false };
            },
            exportSnapshotState: function () {
              return {};
            },
            importSnapshotState: function () {},
          };
        },
      };
    },
  };
  context.A8EState = {
    createApi: function (cfg) {
      return {
        makeIoData: function (video) {
          return {
            video: { verticalScrollOffset: 0, currentDisplayLine: 0 },
            displayListFetchCycle: cfg.CYCLES_PER_LINE,
            clock: 0,
            inDrawLine: false,
            dliCycle: Infinity,
            serialOutputNeedDataCycle: Infinity,
            serialOutputTransmissionDoneCycle: Infinity,
            serialInputDataReadyCycle: Infinity,
            timer1Cycle: Infinity,
            timer2Cycle: Infinity,
            timer4Cycle: Infinity,
            valuePortA: 0,
            valuePortB: 0,
            sioBuffer: new Uint8Array(16),
            sioOutIndex: 0,
            sioOutPhase: 0,
            sioDataIndex: 0,
            sioPendingDevice: 0,
            sioPendingCmd: 0,
            sioPendingSector: 0,
            sioPendingBytes: 0,
            sioInIndex: 0,
            sioInSize: 0,
            pokeyLfsr17: 0,
            pokeyLfsr17LastCycle: 0,
            pokeyPotValues: new Uint8Array(8),
            pokeyPotLatched: new Uint8Array(8),
            pokeyPotAllPot: 0,
            pokeyPotScanStartCycle: 0,
            pokeyPotScanActive: false,
            trigPhysical: new Uint8Array(4),
            trigLatched: new Uint8Array(4),
            currentDisplayListCommand: 0,
            nextDisplayListLine: 0,
            displayListAddress: 0,
            rowDisplayMemoryAddress: 0,
            displayMemoryAddress: 0,
            firstRowScanline: false,
            drawLine: {
              displayMemoryAddress: 0,
              bytesPerLine: 0,
              destIndex: 0,
            },
            keyPressCounter: 0,
            optionOnStart: false,
            sioTurbo: true,
            deviceSlots: new Int16Array(8),
            diskImages: [],
            basicRom: null,
            osRom: null,
            selfTestRom: null,
            floatingPointRom: null,
            pokeyAudio: null,
            videoOut: video,
          };
        },
        cycleTimedEventUpdate: function (ctx) {
          ctx.ioCycleTimedEventCycle = Infinity;
        },
        initHardwareDefaults: function () {},
        installIoHandlers: function () {},
      };
    },
  };
  context.A8ESnapshotCodec = {
    formatVersion: 1,
    encodeSnapshot: function (snapshot) {
      encodedSnapshot = snapshot;
      return new ArrayBuffer(4);
    },
    decodeSnapshot: function () {
      return nextDecodedSnapshot;
    },
    toUint8Array: function (value) {
      if (value instanceof Uint8Array) return value;
      return new Uint8Array(value || 0);
    },
  };
  context.A8EMemory = {
    createApi: function () {
      return {
        createRuntime: function (opts) {
          return {
            setupMemoryMap: function () {},
            hardReset: function () {},
            loadOsRom: function () {
              opts.machine.osRomLoaded = true;
            },
            loadBasicRom: function () {
              opts.machine.basicRomLoaded = true;
            },
            loadDiskToDeviceSlot: function () {
              return 0;
            },
            loadDiskToDeviceSlotDetailed: function () {
              return {
                imageIndex: 0,
                deviceSlot: 0,
                format: "atr",
                sourceByteLength: 0,
                mountedByteLength: 0,
                xexPreflight: null,
              };
            },
            mountImageToDeviceSlot: function () {},
            unmountDeviceSlot: function () {},
            getMountedDiskForDeviceSlot: function () {
              return null;
            },
            hasMountedDiskForDeviceSlot: function () {
              return false;
            },
            readMemory: function () {
              return 0;
            },
            readRange: function (start, length) {
              void start;
              return new Uint8Array(length | 0);
            },
            getBankState: function () {
              return null;
            },
            exportSnapshotState: function () {
              return { ok: true };
            },
            importSnapshotState: function () {},
          };
        },
      };
    },
  };
  context.A8EAudioRuntime = {
    createApi: function () {
      return {
        createRuntime: function () {
          return {
            ensureAudio: function () {},
            stopAudio: function () {},
            isSioActive: function () {
              return false;
            },
            syncAudioTurboMode: function () {},
          };
        },
      };
    },
  };
  context.A8EPokeyAudio = {
    createApi: function () {
      return {
        createState: function () {
          return {};
        },
        setTargetBufferSamples: function () {},
        setFillLevelHint: function () {},
        setTurbo: function () {},
        drain: function () {
          return null;
        },
        clear: function () {},
        resetState: function () {},
        onRegisterWrite: function () {},
        sync: function () {},
        consume: function () {
          return 0;
        },
        syncLfsr17: function () {},
        potStartScan: function () {},
        potUpdate: function () {},
        timerPeriodCpuCycles: function () {
          return 0;
        },
        restartTimers: function () {},
        seroutWrite: function () {},
        serinRead: function () {
          return 0;
        },
      };
    },
  };
  context.A8EIo = {
    createApi: function () {
      return {
        ioAccess: function () {
          return 0;
        },
      };
    },
  };
  context.A8EGtia = {
    createApi: function () {
      return {
        drawPlayerMissilesClock: function () {},
        drawPlayerMissiles: function () {},
      };
    },
  };
  context.A8EAntic = {
    createApi: function () {
      return {
        ioCycleTimedEvent: function () {},
      };
    },
  };
  context.A8EDebugger = {
    createApi: function () {
      return {
        createRuntime: function () {
          return {
            emitDebugState: function () {},
            getDebugState: function () {
              return {
                reason: "pause",
                running: false,
                pc: 0,
                a: 0,
                x: 0,
                y: 0,
                sp: 0,
                p: 0,
                cycleCounter: 0,
                instructionCounter: 0,
              };
            },
            getCounters: function () {
              return {
                running: false,
                cycleCounter: 0,
                instructionCounter: 0,
              };
            },
            getTraceTail: function () {
              return [];
            },
            onDebugStateChange: function () {
              return function () {};
            },
            onPause: function () {},
            setBreakpoints: function () {},
            rebindBreakpointHooks: function () {},
            suspendBreakpoints: function () {
              suspendCount++;
              return {};
            },
            restoreBreakpoints: function () {
              restoreCount++;
            },
            removeStepOverHook: function () {},
            resetExecutionState: function () {},
            onStart: function () {},
            stepInstruction: function () {
              return false;
            },
            stepInstructionAsync: function () {
              return {};
            },
            stepOver: function () {
              return false;
            },
            stepOverAsync: function () {
              return {};
            },
            runUntilPc: function () {
              return {};
            },
            onExecutionError: function () {},
            exportSnapshotState: function () {
              return {};
            },
            importSnapshotState: function () {},
          };
        },
      };
    },
  };

  vm.createContext(context);
  vm.runInContext(supportSource, context, {
    filename: "atari_support.js",
  });
  vm.runInContext(snapshotSource, context, {
    filename: "atari_snapshot.js",
  });
  vm.runInContext(source, context, {
    filename: "atari.js",
  });

  const app = context.window.A8EApp.create({
    ctx2d: {
      createImageData: function (width, height) {
        return {
          width: width,
          height: height,
          data: new Uint8ClampedArray(width * height * 4),
        };
      },
      putImageData: function () {},
    },
    debugEl: null,
    audioEnabled: false,
    turbo: false,
    sioTurbo: true,
    optionOnStart: false,
  });

  return {
    app: app,
    runCalls: runCalls,
    getEncodedSnapshot: function () {
      return encodedSnapshot;
    },
    setDecodedSnapshot: function (snapshot) {
      nextDecodedSnapshot = snapshot;
    },
    getSuspendCount: function () {
      return suspendCount;
    },
    getRestoreCount: function () {
      return restoreCount;
    },
    frameBudget: hwApi.LINES_PER_SCREEN_PAL * hwApi.CYCLES_PER_LINE,
  };
}

function makeDecodedSnapshot(frameCycleAccum, cycleCounter) {
  return {
    type: "a8e.snapshot",
    version: 1,
    savedAt: 1,
    savedRunning: false,
    config: {},
    machine: {
      cpu: {
        a: 0x11,
        x: 0x22,
        y: 0x33,
        sp: 0x44,
        pc: 0x1234,
        ps: 0x20,
      },
      cycleCounter: cycleCounter,
      stallCycleCounter: 0,
      ioCycleTimedEventCycle: Infinity,
      irqPending: 0,
      instructionCounter: 0,
      cycleAccum: 0,
      frameCycleAccum: frameCycleAccum,
      video: {
        pixels: new Uint8Array(32),
        priority: new Uint8Array(32),
        playfieldScratchPixels: new Uint8Array(544),
        playfieldScratchPriority: new Uint8Array(544),
      },
      memory: {},
      debug: {},
      input: {},
      hDevice: null,
    },
  };
}

function main() {
  const harness = loadAppHarness();
  const app = harness.app;

  harness.setDecodedSnapshot(makeDecodedSnapshot(3, 100));
  app.loadSnapshot(new Uint8Array([1]).buffer, { resume: false });
  harness.runCalls.length = 0;

  const saved = app.saveSnapshot();
  assert.equal(saved.timing, "frame");
  assert.deepEqual(harness.runCalls, [117]);
  assert.equal(harness.getSuspendCount(), 1);
  assert.equal(harness.getRestoreCount(), 1);
  assert.equal(harness.getEncodedSnapshot().machine.frameCycleAccum, 0);
  assert.equal(harness.getEncodedSnapshot().machine.cycleCounter, 117);

  harness.setDecodedSnapshot(makeDecodedSnapshot(3, 100));
  app.loadSnapshot(new Uint8Array([1]).buffer, { resume: false });
  harness.runCalls.length = 0;

  const exact = app.saveSnapshot({ timing: "exact" });
  assert.equal(exact.timing, "exact");
  assert.deepEqual(harness.runCalls, []);
  assert.equal(harness.getEncodedSnapshot().machine.frameCycleAccum, 3);
  assert.equal(harness.getEncodedSnapshot().machine.cycleCounter, 100);

  console.log("snapshot_save_timing.test.js passed");
}

try {
  main();
} catch (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
}
