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

  let audioBridgePort = null;
  let activeAudioNodePort = null;
  let workerAudioSampleRate = 48000;

  function toUint8(data) {
    if (!data) return new Uint8Array(0);
    if (data instanceof Uint8Array) return new Uint8Array(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      );
    }
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
      "js/core/playfield.js",
      "js/core/antic.js",
      "js/core/gtia.js",
      "js/core/hostfs.js",
      "js/core/hdevice.js",
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
    const mounted = [];
    for (let i = 0; i < 8; i++) {
      if (typeof app.hasMountedDiskForDeviceSlot === "function")
        {mounted.push(!!app.hasMountedDiskForDeviceSlot(i));}
      else mounted.push(false);
    }
    self.postMessage({
      type: "state",
      running: !!(app.isRunning && app.isRunning()),
      hasOsRom: !!(app.hasOsRom && app.hasOsRom()),
      hasBasicRom: !!(app.hasBasicRom && app.hasBasicRom()),
      mounted: mounted,
      rendererBackend: rendererBackend,
    });
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

    initDone = true;
    self.postMessage({
      type: "init-done",
      rendererBackend: rendererBackend,
    });

    while (pendingCommands.length) {
      const c = pendingCommands.shift();
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
        app.reset();
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
        app = null;
        break;
      default:
        shouldPostState = false;
        break;
    }

    if (cmd.indexOf("hostfs") === 0) postHostFsSnapshot();
    if (shouldPostState) postState();
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
    }
  };
})();
