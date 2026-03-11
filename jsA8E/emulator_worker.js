/* global self, importScripts, setTimeout, clearTimeout */

(function () {
  "use strict";

  self.window = self;

  if (typeof self.requestAnimationFrame !== "function") {
    let rafSeq = 1;
    const rafTimers = Object.create(null);
    self.requestAnimationFrame = function (cb) {
      const id = rafSeq++;
      rafTimers[id] = setTimeout(function () {
        delete rafTimers[id];
        try {
          cb(Date.now());
        } catch {
          // ignore
        }
      }, 16);
      return id;
    };
    self.cancelAnimationFrame = function (id) {
      const t = rafTimers[id];
      if (t) clearTimeout(t);
      delete rafTimers[id];
    };
  }

  let coreLoaded = false;
  let app = null;
  let screenCanvas = null;
  let rendererBackend = "unknown";
  let initDone = false;
  let hostFsUnsubscribe = null;
  const pendingCommands = [];
  const DEBUG_STATE_MIN_INTERVAL_MS = 80;
  let debugFlushTimer = 0;
  let pendingDebugState = null;
  let lastDebugStatePostTs = 0;

  let audioBridgePort = null;
  let activeAudioNodePort = null;
  let workerAudioSampleRate = 48000;
  const OBJECT_TO_STRING = Object.prototype.toString;
  const TYPED_ARRAY_TAGS = new Set([
    "[object Int8Array]",
    "[object Uint8Array]",
    "[object Uint8ClampedArray]",
    "[object Int16Array]",
    "[object Uint16Array]",
    "[object Int32Array]",
    "[object Uint32Array]",
    "[object Float32Array]",
    "[object Float64Array]",
    "[object BigInt64Array]",
    "[object BigUint64Array]",
  ]);

  function getObjectTag(value) {
    return OBJECT_TO_STRING.call(value);
  }

  function isArrayBufferLike(value) {
    const tag = getObjectTag(value);
    return tag === "[object ArrayBuffer]" || tag === "[object SharedArrayBuffer]";
  }

  function isViewLike(value) {
    if (!value) return false;
    if (typeof ArrayBuffer !== "undefined" && typeof ArrayBuffer.isView === "function") {
      return ArrayBuffer.isView(value);
    }
    return getObjectTag(value) === "[object DataView]" || TYPED_ARRAY_TAGS.has(getObjectTag(value));
  }

  function copyBufferLike(data, byteOffset, byteLength) {
    if (!isArrayBufferLike(data)) return new Uint8Array(0);
    const offset = Math.max(0, byteOffset | 0);
    const length = Math.max(0, byteLength | 0);
    const source = new Uint8Array(data, offset, length);
    const out = new Uint8Array(length);
    out.set(source);
    return out;
  }

  function toUint8(data) {
    if (!data) return new Uint8Array(0);
    if (getObjectTag(data) === "[object Uint8Array]") return new Uint8Array(data);
    if (isArrayBufferLike(data)) return copyBufferLike(data, 0, data.byteLength | 0);
    if (isViewLike(data))
      {return copyBufferLike(data.buffer, data.byteOffset | 0, data.byteLength | 0);}
    if (Array.isArray(data)) return new Uint8Array(data);
    return new Uint8Array(0);
  }

  function notifyError(err) {
    const message =
      err && err.message ? String(err.message) : String(err || "unknown error");
    try {
      self.postMessage({
        type: "error",
        message: message,
      });
    } catch {
      // ignore
    }
  }

  function serializeError(err) {
    if (!err || typeof err !== "object") {
      return {
        name: "Error",
        message: String(err || "unknown error"),
      };
    }
    const out = {
      name: err.name ? String(err.name) : "Error",
      message: err.message ? String(err.message) : String(err),
    };
    if (err.code) out.code = String(err.code);
    if (err.phase) out.phase = String(err.phase);
    if (err.details !== undefined) out.details = err.details;
    if (err.cause && typeof err.cause === "object") {
      out.cause = {
        name: err.cause.name ? String(err.cause.name) : "Error",
        message: err.cause.message ? String(err.cause.message) : String(err.cause),
      };
    }
    return out;
  }

  function postResponse(id, ok, result, error, transfer) {
    const msg = {
      type: "response",
      id: id | 0,
      ok: !!ok,
    };
    if (ok) msg.result = result === undefined ? null : result;
    else msg.error = serializeError(error);
    if (transfer && transfer.length) {
      self.postMessage(msg, transfer);
      return;
    }
    self.postMessage(msg);
  }

  function cloneDebugState(raw) {
    if (!raw || typeof raw !== "object") return null;
    const out = {
      reason: raw.reason || "update",
      running: !!raw.running,
      pc: (raw.pc | 0) & 0xffff,
      a: (raw.a | 0) & 0xff,
      x: (raw.x | 0) & 0xff,
      y: (raw.y | 0) & 0xff,
      sp: (raw.sp | 0) & 0xff,
      p: (raw.p | 0) & 0xff,
      cycleCounter: raw.cycleCounter >>> 0,
      instructionCounter: raw.instructionCounter >>> 0,
      breakpointHit:
        typeof raw.breakpointHit === "number"
          ? (raw.breakpointHit | 0) & 0xffff
          : undefined,
    };
    if (typeof raw.stopAddress === "number")
      {out.stopAddress = (raw.stopAddress | 0) & 0xffff;}
    if (typeof raw.faultAddress === "number")
      {out.faultAddress = (raw.faultAddress | 0) & 0xffff;}
    if (typeof raw.opcode === "number") out.opcode = (raw.opcode | 0) & 0xff;
    if (raw.faultType) out.faultType = String(raw.faultType);
    if (raw.faultMessage) out.faultMessage = String(raw.faultMessage);
    return out;
  }

  function postDebugState(snapshot) {
    if (!snapshot) return;
    lastDebugStatePostTs = Date.now();
    try {
      self.postMessage({
        type: "debugState",
        debug: snapshot,
      });
    } catch {
      // ignore
    }
  }

  function flushPendingDebugState(force) {
    if (!pendingDebugState) return;
    const now = Date.now();
    const elapsed = now - lastDebugStatePostTs;
    if (!force && elapsed < DEBUG_STATE_MIN_INTERVAL_MS) {
      if (!debugFlushTimer) {
        const delay = Math.max(1, DEBUG_STATE_MIN_INTERVAL_MS - elapsed);
        debugFlushTimer = setTimeout(function () {
          debugFlushTimer = 0;
          flushPendingDebugState(true);
        }, delay);
      }
      return;
    }
    postDebugState(pendingDebugState);
    pendingDebugState = null;
  }

  function queueDebugState(raw, force) {
    pendingDebugState = cloneDebugState(raw);
    if (!pendingDebugState) return;
    flushPendingDebugState(!!force);
  }

  function WorkerNodePort() {
    this.onmessage = null;
  }

  WorkerNodePort.prototype.postMessage = function (msg, transfer) {
    if (!audioBridgePort) return;
    try {
      if (transfer && transfer.length) {
        audioBridgePort.postMessage({ type: "worklet", msg: msg }, transfer);
      } else {
        audioBridgePort.postMessage({ type: "worklet", msg: msg });
      }
    } catch {
      // ignore
    }
  };

  function WorkerAudioWorkletNode() {
    this.port = new WorkerNodePort();
    activeAudioNodePort = this.port;
  }

  WorkerAudioWorkletNode.prototype.connect = function () {
    return this;
  };

  WorkerAudioWorkletNode.prototype.disconnect = function () {};

  function WorkerAudioContext() {
    this.sampleRate = workerAudioSampleRate | 0;
    if (!this.sampleRate) this.sampleRate = 48000;
    this.state = "suspended";
    this.destination = {};
    this.audioWorklet = {
      addModule: function () {
        return Promise.resolve();
      },
    };
  }

  WorkerAudioContext.prototype.resume = function () {
    this.state = "running";
    if (audioBridgePort) {
      try {
        audioBridgePort.postMessage({ type: "context", op: "resume" });
      } catch {
        // ignore
      }
    }
    return Promise.resolve();
  };

  WorkerAudioContext.prototype.close = function () {
    this.state = "closed";
    if (audioBridgePort) {
      try {
        audioBridgePort.postMessage({ type: "context", op: "close" });
      } catch {
        // ignore
      }
    }
    return Promise.resolve();
  };

  self.AudioContext = WorkerAudioContext;
  self.webkitAudioContext = WorkerAudioContext;
  self.AudioWorkletNode = WorkerAudioWorkletNode;

  function setupAudioBridgePort(port) {
    audioBridgePort = port || null;
    if (!audioBridgePort) return;
    audioBridgePort.onmessage = function (e) {
      const data = e && e.data ? e.data : null;
      if (!data) return;
      if (
        data.type === "status" &&
        activeAudioNodePort &&
        typeof activeAudioNodePort.onmessage === "function"
      ) {
        try {
          activeAudioNodePort.onmessage({ data: data.msg || null });
        } catch {
          // ignore
        }
      }
    };
    if (typeof audioBridgePort.start === "function") {
      try {
        audioBridgePort.start();
      } catch {
        // ignore
      }
    }
  }

  function ensureCoreLoaded() {
    if (coreLoaded) return;
    importScripts(
      "js/shared/util.js",
      "js/render/palette.js",
      "js/render/software.js",
      "js/core/cpu_tables.js",
      "js/core/cpu.js",
      "js/render/gl.js",
      "js/core/pokey_sio.js",
      "js/core/pokey.js",
      "js/audio/runtime.js",
      "js/core/keys.js",
      "js/core/input.js",
      "js/core/hw.js",
      "js/core/state.js",
      "js/core/memory.js",
      "js/core/io.js",
      "js/core/playfield_renderer.js",
      "js/core/playfield.js",
      "js/core/antic.js",
      "js/core/gtia.js",
      "js/core/hostfs.js",
      "js/core/hdevice.js",
      "js/core/debugger.js",
      "js/core/atari.js",
    );
    coreLoaded = true;
  }

  function getHostFs() {
    if (!app || !app.hDevice || typeof app.hDevice.getHostFs !== "function")
      {return null;}
    return app.hDevice.getHostFs();
  }

  function postHostFsSnapshot() {
    const hostFs = getHostFs();
    if (!hostFs || typeof hostFs.listFiles !== "function") {
      self.postMessage({ type: "hostfsSnapshot", files: [] });
      return;
    }

    const infos = hostFs.listFiles();
    const files = [];
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i];
      const rawData =
        typeof hostFs.readFile === "function" ? hostFs.readFile(info.name) : null;
      const data = toUint8(rawData);
      files.push({
        name: info.name,
        size: data.length | 0,
        locked: !!info.locked,
        data: data,
      });
    }

    self.postMessage({
      type: "hostfsSnapshot",
      files: files,
    });
  }

  function attachHostFsListener() {
    if (hostFsUnsubscribe) {
      hostFsUnsubscribe();
      hostFsUnsubscribe = null;
    }
    const hostFs = getHostFs();
    if (!hostFs || typeof hostFs.onChange !== "function") return;
    hostFsUnsubscribe = hostFs.onChange(function () {
      try {
        postHostFsSnapshot();
      } catch {
        // ignore
      }
    });
  }

  function postState() {
    if (!app) return;
    self.postMessage(buildStateSnapshot());
  }

  function buildStateSnapshot() {
    const mounted = [];
    for (let i = 0; i < 8; i++) {
      if (typeof app.hasMountedDiskForDeviceSlot === "function")
        {mounted.push(!!app.hasMountedDiskForDeviceSlot(i));}
      else mounted.push(false);
    }
    return {
      type: "state",
      running: !!(app && app.isRunning && app.isRunning()),
      hasOsRom: !!(app && app.hasOsRom && app.hasOsRom()),
      hasBasicRom: !!(app && app.hasBasicRom && app.hasBasicRom()),
      mounted: mounted,
      rendererBackend: rendererBackend,
      debug:
        app && typeof app.getDebugState === "function" ? app.getDebugState() : null,
    };
  }

  function buildControlAck(command) {
    const snapshot = buildStateSnapshot();
    return {
      command: String(command || ""),
      state: snapshot,
      debugState: snapshot.debug ? cloneDebugState(snapshot.debug) : null,
    };
  }

  async function initApp(msg) {
    ensureCoreLoaded();

    setupAudioBridgePort(msg.audioPort || null);
    const sr = msg.audioSampleRate | 0;
    if (sr > 0) workerAudioSampleRate = sr;

    screenCanvas = msg.canvas || null;
    if (!screenCanvas) throw new Error("Missing OffscreenCanvas");

    const initW = msg.width | 0;
    const initH = msg.height | 0;
    if (initW > 0) screenCanvas.width = initW;
    if (initH > 0) screenCanvas.height = initH;

    let gl = null;
    try {
      gl =
        screenCanvas.getContext("webgl2", {
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
          powerPreference: "high-performance",
          desynchronized: true,
        }) ||
        screenCanvas.getContext("webgl", {
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
          powerPreference: "high-performance",
          desynchronized: true,
        }) ||
        screenCanvas.getContext("experimental-webgl", {
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
          desynchronized: true,
        });
    } catch {
      gl = null;
    }

    let ctx2d = null;
    if (gl && self.A8EGlRenderer && self.A8EGlRenderer.loadShaderSources) {
      try {
        await self.A8EGlRenderer.loadShaderSources();
      } catch {
        // create() fallback handles this path
      }
    }

    try {
      app = self.A8EApp.create({
        canvas: screenCanvas,
        gl: gl,
        ctx2d: ctx2d,
        debugEl: null,
        audioEnabled: !!msg.audioEnabled,
        turbo: !!msg.turbo,
        sioTurbo: msg.sioTurbo !== false,
        optionOnStart: !!msg.optionOnStart,
        onDebugState: function (state) {
          const force = !state || state.reason !== "frame";
          queueDebugState(state, force);
        },
        keyboardMappingMode:
          msg.keyboardMappingMode === "original" ? "original" : "translated",
      });
    } catch (err) {
      if (!gl) throw err;
      gl = null;
      ctx2d = screenCanvas.getContext("2d", { alpha: false });
      app = self.A8EApp.create({
        canvas: screenCanvas,
        gl: null,
        ctx2d: ctx2d,
        debugEl: null,
        audioEnabled: !!msg.audioEnabled,
        turbo: !!msg.turbo,
        sioTurbo: msg.sioTurbo !== false,
        optionOnStart: !!msg.optionOnStart,
        onDebugState: function (state) {
          const force = !state || state.reason !== "frame";
          queueDebugState(state, force);
        },
        keyboardMappingMode:
          msg.keyboardMappingMode === "original" ? "original" : "translated",
      });
    }

    if (gl) {
      const gl2 =
        typeof self.WebGL2RenderingContext !== "undefined" &&
        gl instanceof self.WebGL2RenderingContext;
      rendererBackend = gl2 ? "webgl2" : "webgl";
    } else {
      rendererBackend = "2d";
    }

    attachHostFsListener();
    postHostFsSnapshot();
    postState();
    if (typeof app.getDebugState === "function") {
      queueDebugState(app.getDebugState(), true);
    }

    initDone = true;
    self.postMessage({
      type: "init-done",
      rendererBackend: rendererBackend,
    });

    while (pendingCommands.length) {
      const c = pendingCommands.shift();
      if (!c) continue;
      if (c.type === "req") {
        handleRequest(c.cmd, c.payload)
          .then(function (result) {
            const transfer = [];
            if (result && result.buffer && isArrayBufferLike(result.buffer)) {
              transfer.push(result.buffer);
            }
            postResponse(c.id | 0, true, result, null, transfer);
          })
          .catch(function (err2) {
            postResponse(c.id | 0, false, null, err2, null);
          });
        continue;
      }
      try {
        handleCommand(c.cmd, c.payload);
      } catch (err2) {
        notifyError(err2);
      }
    }
  }

  function hostFsWrite(name, data) {
    const hostFs = getHostFs();
    if (!hostFs || typeof hostFs.writeFile !== "function") return;
    hostFs.writeFile(name, toUint8(data));
  }

  function hostFsDelete(name) {
    const hostFs = getHostFs();
    if (!hostFs || typeof hostFs.deleteFile !== "function") return;
    hostFs.deleteFile(name);
  }

  function hostFsRename(oldName, newName) {
    const hostFs = getHostFs();
    if (!hostFs || typeof hostFs.renameFile !== "function") return;
    hostFs.renameFile(oldName, newName);
  }

  function hostFsLock(name) {
    const hostFs = getHostFs();
    if (!hostFs || typeof hostFs.lockFile !== "function") return;
    hostFs.lockFile(name);
  }

  function hostFsUnlock(name) {
    const hostFs = getHostFs();
    if (!hostFs || typeof hostFs.unlockFile !== "function") return;
    hostFs.unlockFile(name);
  }

  function handleCommand(cmd, payload) {
    if (!app) return;
    const data = payload || {};
    let shouldPostState = true;

    switch (cmd) {
      case "start":
        app.start();
        break;
      case "pause":
        app.pause();
        break;
      case "reset":
        app.reset(data);
        break;
      case "setTurbo":
        app.setTurbo(!!data.value);
        break;
      case "setSioTurbo":
        app.setSioTurbo(!!data.value);
        break;
      case "setAudioEnabled":
        app.setAudioEnabled(!!data.value);
        break;
      case "setOptionOnStart":
        app.setOptionOnStart(!!data.value);
        break;
      case "setKeyboardMappingMode":
        if (app.setKeyboardMappingMode) {
          app.setKeyboardMappingMode(
            data.mode === "original" ? "original" : "translated",
          );
        }
        shouldPostState = false;
        break;
      case "setBreakpoints":
        if (app.setBreakpoints) {
          app.setBreakpoints(
            Array.isArray(data.addresses) ? data.addresses : [],
          );
        }
        shouldPostState = false;
        break;
      case "stepInstruction":
        if (app.stepInstruction) app.stepInstruction();
        shouldPostState = false;
        break;
      case "stepOver":
        if (app.stepOver) app.stepOver();
        shouldPostState = false;
        break;
      case "loadOsRom":
        app.loadOsRom(data.buffer || new ArrayBuffer(0));
        break;
      case "loadBasicRom":
        app.loadBasicRom(data.buffer || new ArrayBuffer(0));
        break;
      case "loadDiskToDeviceSlot":
        app.loadDiskToDeviceSlot(
          data.buffer || new ArrayBuffer(0),
          data.name || "",
          data.slot | 0,
        );
        break;
      case "mountImageToDeviceSlot":
        app.mountImageToDeviceSlot(data.image || null, data.slot | 0);
        break;
      case "unmountDeviceSlot":
        app.unmountDeviceSlot(data.slot | 0);
        break;
      case "onKeyDown":
        app.onKeyDown(data.event || null);
        shouldPostState = false;
        break;
      case "onKeyUp":
        app.onKeyUp(data.event || null);
        shouldPostState = false;
        break;
      case "releaseAllKeys":
        if (app.releaseAllKeys) app.releaseAllKeys();
        shouldPostState = false;
        break;
      case "setRenderSize": {
        shouldPostState = false;
        if (!screenCanvas) break;
        const w = data.width | 0;
        const h = data.height | 0;
        if (w > 0 && h > 0) {
          screenCanvas.width = w;
          screenCanvas.height = h;
        }
        break;
      }
      case "hostfsWrite":
        hostFsWrite(data.name || "", data.data || null);
        break;
      case "hostfsDelete":
        hostFsDelete(data.name || "");
        break;
      case "hostfsRename":
        hostFsRename(data.oldName || "", data.newName || "");
        break;
      case "hostfsLock":
        hostFsLock(data.name || "");
        break;
      case "hostfsUnlock":
        hostFsUnlock(data.name || "");
        break;
      case "dispose":
        if (app.dispose) app.dispose();
        if (hostFsUnsubscribe) {
          hostFsUnsubscribe();
          hostFsUnsubscribe = null;
        }
        if (debugFlushTimer) {
          clearTimeout(debugFlushTimer);
          debugFlushTimer = 0;
        }
        pendingDebugState = null;
        app = null;
        break;
      default:
        shouldPostState = false;
        break;
    }

    if (cmd.indexOf("hostfs") === 0) postHostFsSnapshot();
    if (shouldPostState) postState();
  }

  async function handleRequest(cmd, payload) {
    if (!app) throw new Error("A8E worker app is not initialized");
    const data = payload || {};
    switch (cmd) {
      case "start":
        app.start();
        postState();
        return buildControlAck("start");
      case "pause":
        app.pause();
        postState();
        return buildControlAck("pause");
      case "reset":
        app.reset(data);
        postState();
        return buildControlAck("reset");
      case "stepInstruction":
        if (typeof app.stepInstructionAsync === "function") {
          return app.stepInstructionAsync();
        }
        return {
          ok: !!(app.stepInstruction && app.stepInstruction()),
          debugState:
            typeof app.getDebugState === "function" ? app.getDebugState() : null,
        };
      case "stepOver":
        if (typeof app.stepOverAsync === "function") {
          return app.stepOverAsync();
        }
        return {
          ok: !!(app.stepOver && app.stepOver()),
          debugState:
            typeof app.getDebugState === "function" ? app.getDebugState() : null,
        };
      case "getCounters":
        if (typeof app.getCounters === "function") return app.getCounters();
        return null;
      case "getDebugState":
        if (typeof app.getDebugState === "function") return app.getDebugState();
        return null;
      case "getTraceTail":
        if (typeof app.getTraceTail === "function") {
          return app.getTraceTail(data.limit | 0);
        }
        return [];
      case "runUntilPc":
        if (typeof app.runUntilPc === "function") {
          const hasTarget =
            data.targetPc !== null && data.targetPc !== undefined;
          return app.runUntilPc(hasTarget ? data.targetPc | 0 : null, data);
        }
        return { ok: false, reason: "unsupported" };
      case "loadDiskToDeviceSlot":
        if (typeof app.loadDiskToDeviceSlotDetailed === "function") {
          return app.loadDiskToDeviceSlotDetailed(
            data.buffer || new ArrayBuffer(0),
            data.name || "",
            data.slot | 0,
            data.options || null,
          );
        }
        if (typeof app.loadDiskToDeviceSlot === "function") {
          return {
            imageIndex: app.loadDiskToDeviceSlot(
              data.buffer || new ArrayBuffer(0),
              data.name || "",
              data.slot | 0,
            ),
            deviceSlot: data.slot | 0,
            format: /\.xex$/i.test(String(data.name || "")) ? "xex" : "atr",
            sourceByteLength:
              data.buffer && typeof data.buffer.byteLength === "number"
                ? data.buffer.byteLength | 0
                : 0,
            mountedByteLength:
              data.buffer && typeof data.buffer.byteLength === "number"
                ? data.buffer.byteLength | 0
                : 0,
            xexPreflight: null,
          };
        }
        throw new Error("A8E worker loadDiskToDeviceSlot is unavailable");
      case "readMemory":
        if (typeof app.readMemory === "function") {
          return {
            value: app.readMemory(data.address | 0),
          };
        }
        return { value: 0 };
      case "readRange":
        if (typeof app.readRange === "function") {
          const bytes = app.readRange(data.start | 0, data.length | 0);
          return {
            buffer: bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ),
          };
        }
        return {
          buffer: new ArrayBuffer(0),
        };
      case "getBankState":
        if (typeof app.getBankState === "function") return app.getBankState();
        return null;
      case "getMountedDiskForDeviceSlot":
        if (typeof app.getMountedDiskForDeviceSlot === "function") {
          return app.getMountedDiskForDeviceSlot(data.slot | 0);
        }
        return null;
      case "getConsoleKeyState":
        if (typeof app.getConsoleKeyState === "function") {
          return app.getConsoleKeyState();
        }
        return null;
      case "captureScreenshot":
        if (typeof app.captureScreenshot === "function") {
          return app.captureScreenshot();
        }
        return null;
      case "collectArtifacts":
        if (typeof app.collectArtifacts === "function") {
          return app.collectArtifacts(data);
        }
        return null;
      default:
        throw new Error("Unknown worker request: " + cmd);
    }
  }

  self.onmessage = function (e) {
    const msg = e && e.data ? e.data : null;
    if (!msg || !msg.type) return;

    if (msg.type === "init") {
      initApp(msg).catch(function (err) {
        notifyError(err);
      });
      return;
    }

    if (msg.type === "cmd") {
      if (!initDone) {
        pendingCommands.push(msg);
        return;
      }
      try {
        handleCommand(msg.cmd, msg.payload);
      } catch (err2) {
        notifyError(err2);
      }
      return;
    }

    if (msg.type === "req") {
      if (!initDone) {
        pendingCommands.push({
          type: "req",
          id: msg.id | 0,
          cmd: msg.cmd || "",
          payload: msg.payload || null,
        });
        return;
      }
      handleRequest(msg.cmd || "", msg.payload || null)
        .then(function (result) {
          const transfer = [];
          if (result && result.buffer && isArrayBufferLike(result.buffer)) {
            transfer.push(result.buffer);
          }
          postResponse(msg.id | 0, true, result, null, transfer);
        })
        .catch(function (err2) {
          postResponse(msg.id | 0, false, null, err2, null);
        });
    }
  };
})();
