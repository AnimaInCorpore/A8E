(function () {
  "use strict";

  const AtariSupport = window.A8EAtariSupport;
  if (!AtariSupport) throw new Error("A8EAtariSupport is not loaded");

  const bytesToHexFallback = AtariSupport.bytesToHex;
  const captureScreenshotFallback = AtariSupport.captureScreenshot;
  const cloneVideoStateFallback = AtariSupport.cloneVideoState;
  const normalizeArtifactRangeFallback = AtariSupport.normalizeArtifactRange;
  const alignSnapshotToFrameBoundaryFallback =
    AtariSupport.alignSnapshotToFrameBoundary;
  const restoreVideoStateFallback = AtariSupport.restoreVideoState;

  function normalizeKeyboardMappingMode(value) {
    return value === "original" ? "original" : "translated";
  }

  function createApi(deps) {
    const config = deps && typeof deps === "object" ? deps : {};
    const machine = config.machine && typeof config.machine === "object" ? config.machine : null;
    const video = config.video && typeof config.video === "object" ? config.video : null;
    const CPU = config.CPU || null;
    const snapshotCodec =
      config.snapshotCodec && typeof config.snapshotCodec === "object"
        ? config.snapshotCodec
        : null;
    const getSnapshotConfig =
      typeof config.getSnapshotConfig === "function" ? config.getSnapshotConfig : null;
    const setSnapshotConfig =
      typeof config.setSnapshotConfig === "function" ? config.setSnapshotConfig : null;
    const cloneVideoState =
      typeof config.cloneVideoState === "function"
        ? config.cloneVideoState
        : cloneVideoStateFallback;
    const restoreVideoState =
      typeof config.restoreVideoState === "function"
        ? config.restoreVideoState
        : restoreVideoStateFallback;
    const alignSnapshotToFrameBoundary =
      typeof config.alignSnapshotToFrameBoundary === "function"
        ? config.alignSnapshotToFrameBoundary
        : alignSnapshotToFrameBoundaryFallback;
    const captureScreenshotRuntime =
      typeof config.captureScreenshotRuntime === "function"
        ? config.captureScreenshotRuntime
        : captureScreenshotFallback;
    const blitViewportToImageData =
      typeof config.blitViewportToImageData === "function"
        ? config.blitViewportToImageData
        : null;
    const VIEW_W = config.VIEW_W | 0;
    const VIEW_H = config.VIEW_H | 0;
    const normalizeArtifactRange =
      typeof config.normalizeArtifactRange === "function"
        ? config.normalizeArtifactRange
        : normalizeArtifactRangeFallback;
    const bytesToHex =
      typeof config.bytesToHex === "function"
        ? config.bytesToHex
        : bytesToHexFallback;
    const readRangeRuntime =
      typeof config.readRangeRuntime === "function" ? config.readRangeRuntime : null;
    const memoryRuntime =
      config.memoryRuntime && typeof config.memoryRuntime === "object"
        ? config.memoryRuntime
        : null;
    const debugRuntime =
      config.debugRuntime && typeof config.debugRuntime === "object"
        ? config.debugRuntime
        : null;
    const inputRuntime =
      config.inputRuntime && typeof config.inputRuntime === "object"
        ? config.inputRuntime
        : null;
    const hDevice = config.hDevice && typeof config.hDevice === "object" ? config.hDevice : null;
    const pauseInternal =
      typeof config.pauseInternal === "function" ? config.pauseInternal : null;
    const start = typeof config.start === "function" ? config.start : null;
    const stopAudio = typeof config.stopAudio === "function" ? config.stopAudio : null;
    const cycleTimedEventUpdate =
      typeof config.cycleTimedEventUpdate === "function"
        ? config.cycleTimedEventUpdate
        : null;
    const installHDeviceCioHooks =
      typeof config.installHDeviceCioHooks === "function"
        ? config.installHDeviceCioHooks
        : null;
    const getDebugState =
      typeof config.getDebugState === "function"
        ? config.getDebugState
        : function () {
            return null;
          };
    const getCounters =
      typeof config.getCounters === "function"
        ? config.getCounters
        : function () {
            return null;
          };
    const getBankState =
      typeof config.getBankState === "function"
        ? config.getBankState
        : function () {
            return null;
          };
    const getTraceTail =
      typeof config.getTraceTail === "function"
        ? config.getTraceTail
        : function () {
            return [];
          };
    const getRendererBackend =
      typeof config.getRendererBackend === "function"
        ? config.getRendererBackend
        : function () {
            return "unknown";
          };
    const publishVideoFrame =
      typeof config.publishVideoFrame === "function"
        ? config.publishVideoFrame
        : function () {};
    const paint = typeof config.paint === "function" ? config.paint : function () {};
    const updateDebug =
      typeof config.updateDebug === "function" ? config.updateDebug : function () {};

    if (!machine) {
      throw new Error("A8EAtariSnapshot requires a machine dependency");
    }
    if (!video) {
      throw new Error("A8EAtariSnapshot requires a video dependency");
    }
    if (!CPU) {
      throw new Error("A8EAtariSnapshot requires a CPU dependency");
    }
    if (!snapshotCodec) {
      throw new Error("A8EAtariSnapshot requires a snapshotCodec dependency");
    }
    if (!getSnapshotConfig) {
      throw new Error("A8EAtariSnapshot requires a getSnapshotConfig dependency");
    }
    if (!setSnapshotConfig) {
      throw new Error("A8EAtariSnapshot requires a setSnapshotConfig dependency");
    }
    if (!memoryRuntime || typeof memoryRuntime.exportSnapshotState !== "function") {
      throw new Error("A8EAtariSnapshot requires a memoryRuntime dependency");
    }
    if (!debugRuntime || typeof debugRuntime.exportSnapshotState !== "function") {
      throw new Error("A8EAtariSnapshot requires a debugRuntime dependency");
    }
    if (!inputRuntime || typeof inputRuntime.exportSnapshotState !== "function") {
      throw new Error("A8EAtariSnapshot requires an inputRuntime dependency");
    }
    if (!pauseInternal) {
      throw new Error("A8EAtariSnapshot requires a pauseInternal dependency");
    }
    if (!start) {
      throw new Error("A8EAtariSnapshot requires a start dependency");
    }
    if (!cycleTimedEventUpdate) {
      throw new Error("A8EAtariSnapshot requires a cycleTimedEventUpdate dependency");
    }
    if (!installHDeviceCioHooks) {
      throw new Error("A8EAtariSnapshot requires an installHDeviceCioHooks dependency");
    }
    if (!blitViewportToImageData) {
      throw new Error("A8EAtariSnapshot requires a blitViewportToImageData dependency");
    }
    if (!readRangeRuntime) {
      throw new Error("A8EAtariSnapshot requires a readRangeRuntime dependency");
    }

    function buildCoreSnapshot(savedRunning) {
      const snapshotConfig = getSnapshotConfig();
      return {
        type: "a8e.snapshot",
        version: snapshotCodec.formatVersion | 0,
        savedAt: Date.now(),
        savedRunning: !!savedRunning,
        config: {
          audioEnabled: !!(snapshotConfig && snapshotConfig.audioEnabled),
          turbo: !!(snapshotConfig && snapshotConfig.turbo),
          sioTurbo: !!(snapshotConfig && snapshotConfig.sioTurbo),
          optionOnStart: !!(snapshotConfig && snapshotConfig.optionOnStart),
          keyboardMappingMode:
            snapshotConfig && snapshotConfig.keyboardMappingMode === "original"
              ? "original"
              : "translated",
        },
        machine: {
          cpu: {
            a: machine.ctx.cpu.a & 0xff,
            x: machine.ctx.cpu.x & 0xff,
            y: machine.ctx.cpu.y & 0xff,
            sp: machine.ctx.cpu.sp & 0xff,
            pc: machine.ctx.cpu.pc & 0xffff,
            ps: CPU.getPs(machine.ctx) & 0xff,
          },
          cycleCounter: machine.ctx.cycleCounter,
          stallCycleCounter: machine.ctx.stallCycleCounter,
          ioCycleTimedEventCycle: machine.ctx.ioCycleTimedEventCycle,
          nmiPending: machine.ctx.nmiPending | 0,
          nmiActive: machine.ctx.nmiActive | 0,
          irqPending: machine.ctx.irqPending | 0,
          instructionCounter: machine.ctx.instructionCounter >>> 0,
          cycleAccum: +machine.cycleAccum || 0,
          frameCycleAccum: machine.frameCycleAccum | 0,
          video: cloneVideoState(video),
          memory: memoryRuntime.exportSnapshotState(),
          debug: debugRuntime.exportSnapshotState(),
          input: inputRuntime.exportSnapshotState(),
          hDevice:
            hDevice && typeof hDevice.exportSnapshotState === "function"
              ? hDevice.exportSnapshotState()
              : null,
        },
      };
    }

    function applySnapshotConfig(payloadConfig, options) {
      const opts = options && typeof options === "object" ? options : {};
      const nextConfig = {};

      if (typeof opts.audioEnabled === "boolean") {
        nextConfig.audioEnabled = !!opts.audioEnabled;
      } else if (payloadConfig && typeof payloadConfig.audioEnabled === "boolean") {
        nextConfig.audioEnabled = !!payloadConfig.audioEnabled;
      }
      if (payloadConfig && typeof payloadConfig.turbo === "boolean") {
        nextConfig.turbo = !!payloadConfig.turbo;
      }
      if (payloadConfig && typeof payloadConfig.sioTurbo === "boolean") {
        nextConfig.sioTurbo = !!payloadConfig.sioTurbo;
      }
      if (payloadConfig && typeof payloadConfig.optionOnStart === "boolean") {
        nextConfig.optionOnStart = !!payloadConfig.optionOnStart;
      }
      if (payloadConfig && payloadConfig.keyboardMappingMode) {
        nextConfig.keyboardMappingMode = normalizeKeyboardMappingMode(
          payloadConfig.keyboardMappingMode,
        );
      }
      setSnapshotConfig(nextConfig);
    }

    function saveSnapshot(options) {
      if (machine.running) {
        throw new Error("A8E snapshot save requires paused emulation");
      }
      const opts = options && typeof options === "object" ? options : {};
      const alignment = alignSnapshotToFrameBoundary(
        {
          machine: machine,
          CPU: CPU,
          CYCLES_PER_FRAME: config.CYCLES_PER_FRAME | 0,
          debugRuntime: debugRuntime || null,
          publishVideoFrame: publishVideoFrame,
          paint: paint,
          updateDebug: updateDebug,
        },
        opts,
      );
      const snapshot = buildCoreSnapshot(
        opts.savedRunning !== undefined ? !!opts.savedRunning : false,
      );
      const buffer = snapshotCodec.encodeSnapshot(snapshot);
      return {
        type: "a8e.snapshot",
        version: snapshot.version | 0,
        savedAt: snapshot.savedAt,
        savedRunning: snapshot.savedRunning,
        mimeType: "application/x-a8e-snapshot",
        byteLength: buffer.byteLength | 0,
        buffer: buffer,
        timing: alignment.timing,
      };
    }

    function loadSnapshot(arrayBuffer, options) {
      const bytes = snapshotCodec.toUint8Array(arrayBuffer);
      const payload = snapshotCodec.decodeSnapshot(bytes);
      if (!payload || payload.type !== "a8e.snapshot") {
        throw new Error("A8E snapshot is invalid");
      }
      const snapshot = payload.machine || {};
      const opts = options && typeof options === "object" ? options : {};
      pauseInternal("pause");
      if (debugRuntime && typeof debugRuntime.removeStepOverHook === "function") {
        debugRuntime.removeStepOverHook();
      }
      applySnapshotConfig(payload.config, opts);
      machine.cycleAccum =
        typeof snapshot.cycleAccum === "number" ? +snapshot.cycleAccum : 0;
      machine.frameCycleAccum = snapshot.frameCycleAccum | 0;
      machine.ctx.cpu.a =
        snapshot.cpu && typeof snapshot.cpu.a === "number"
          ? snapshot.cpu.a & 0xff
          : 0;
      machine.ctx.cpu.x =
        snapshot.cpu && typeof snapshot.cpu.x === "number"
          ? snapshot.cpu.x & 0xff
          : 0;
      machine.ctx.cpu.y =
        snapshot.cpu && typeof snapshot.cpu.y === "number"
          ? snapshot.cpu.y & 0xff
          : 0;
      machine.ctx.cpu.sp =
        snapshot.cpu && typeof snapshot.cpu.sp === "number"
          ? snapshot.cpu.sp & 0xff
          : 0;
      machine.ctx.cpu.pc =
        snapshot.cpu && typeof snapshot.cpu.pc === "number"
          ? snapshot.cpu.pc & 0xffff
          : 0;
      CPU.setPs(
        machine.ctx,
        snapshot.cpu && typeof snapshot.cpu.ps === "number"
          ? snapshot.cpu.ps & 0xff
          : 0,
      );
      machine.ctx.cycleCounter =
        typeof snapshot.cycleCounter === "number" ? snapshot.cycleCounter : 0;
      machine.ctx.stallCycleCounter =
        typeof snapshot.stallCycleCounter === "number"
          ? snapshot.stallCycleCounter
          : 0;
      machine.ctx.ioCycleTimedEventCycle = snapshot.ioCycleTimedEventCycle;
      machine.ctx.ioMasterTimedEventCycle = Infinity;
      machine.ctx.ioBeamTimedEventCycle = Infinity;
      machine.ctx.nmiPending = snapshot.nmiPending ? 1 : 0;
      machine.ctx.nmiActive = snapshot.nmiActive ? 1 : 0;
      machine.ctx.irqPending = snapshot.irqPending | 0;
      machine.ctx.instructionCounter = snapshot.instructionCounter >>> 0;
      machine.ctx.breakRun = false;
      machine.ctx.pcHooks = Object.create(null);
      memoryRuntime.importSnapshotState(snapshot.memory);
      restoreVideoState(video, snapshot.video);
      cycleTimedEventUpdate(machine.ctx);
      if (hDevice && typeof hDevice.importSnapshotState === "function") {
        hDevice.importSnapshotState(snapshot.hDevice);
      }
      installHDeviceCioHooks();
      if (typeof inputRuntime.importSnapshotState === "function") {
        inputRuntime.importSnapshotState(snapshot.input);
      }
      if (typeof debugRuntime.importSnapshotState === "function") {
        debugRuntime.importSnapshotState(snapshot.debug);
      }
      if (machine.audioCtx && stopAudio) {
        stopAudio();
      }
      publishVideoFrame();
      paint();
      updateDebug("snapshot_load");
      const resume =
        opts.resume === true ||
        (opts.resume !== false && payload.savedRunning === true);
      if (resume) start();
      return {
        command: "loadSnapshot",
        snapshotVersion: payload.version | 0,
        savedAt: payload.savedAt || 0,
        savedRunning: !!payload.savedRunning,
        resumed: !!resume,
        state: {
          running: !!machine.running,
          debug: getDebugState(),
        },
        debugState: getDebugState(),
      };
    }

    function captureScreenshot() {
      return captureScreenshotRuntime(video, blitViewportToImageData, VIEW_W, VIEW_H);
    }

    function collectArtifacts(options) {
      const config = options || {};
      const ranges = Array.isArray(config.ranges) ? config.ranges : [];
      const labels = Array.isArray(config.labels) ? config.labels : [];
      const memoryRanges = [];
      for (let i = 0; i < ranges.length; i++) {
        const normalized = normalizeArtifactRange(ranges[i], labels[i]);
        if (!normalized) continue;
        const bytes = readRangeRuntime(normalized.start, normalized.length);
        memoryRanges.push({
          label: normalized.label,
          start: normalized.start,
          end: normalized.end,
          length: bytes.length | 0,
          hex: bytesToHex(bytes),
        });
      }

      const debugState = getDebugState();
      return {
        rendererBackend: getRendererBackend(),
        debugState: debugState,
        counters: getCounters(),
        bankState: getBankState(),
        breakpointHit:
          debugState && typeof debugState.breakpointHit === "number"
            ? debugState.breakpointHit & 0xffff
            : null,
        traceTail: getTraceTail(config.traceTailLimit || 32),
        memoryRanges: memoryRanges,
      };
    }

    return {
      buildCoreSnapshot: buildCoreSnapshot,
      saveSnapshot: saveSnapshot,
      loadSnapshot: loadSnapshot,
      captureScreenshot: captureScreenshot,
      collectArtifacts: collectArtifacts,
    };
  }

  window.A8EAtariSnapshot = {
    createApi: createApi,
  };
})();
