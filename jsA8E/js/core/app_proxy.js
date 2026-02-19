(function () {
  "use strict";

  const legacyCreate =
    window.A8EApp && typeof window.A8EApp.create === "function"
      ? window.A8EApp.create
      : null;

  function supportsWorker() {
    if (typeof window.Worker === "undefined") return false;
    if (typeof window.OffscreenCanvas === "undefined") return false;
    if (typeof window.MessageChannel === "undefined") return false;
    if (
      !window.HTMLCanvasElement ||
      !window.HTMLCanvasElement.prototype ||
      typeof window.HTMLCanvasElement.prototype.transferControlToOffscreen !==
        "function"
    )
      {return false;}
    return true;
  }

  function toArrayBuffer(data) {
    if (!data) return new ArrayBuffer(0);
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) {
      const view = data;
      if (
        view.byteOffset === 0 &&
        view.byteLength === view.buffer.byteLength &&
        view.buffer instanceof ArrayBuffer
      ) {
        return view.buffer;
      }
      const copy = new Uint8Array(view.byteLength | 0);
      copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
      return copy.buffer;
    }
    if (Array.isArray(data)) return new Uint8Array(data).buffer;
    return new ArrayBuffer(0);
  }

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

  function normalizeName(raw) {
    if (!raw) return null;
    let s = String(raw);
    const colon = s.indexOf(":");
    if (colon >= 0) s = s.substring(colon + 1);
    while (s.length && (s[0] === ">" || s[0] === "/" || s[0] === "\\"))
      {s = s.substring(1);}
    s = s.toUpperCase().trim();
    if (!s.length) return null;
    const dot = s.indexOf(".");
    let name;
    let ext;
    if (dot >= 0) {
      name = s.substring(0, dot);
      ext = s.substring(dot + 1);
    } else {
      name = s;
      ext = "";
    }
    if (name.length > 8) name = name.substring(0, 8);
    if (ext.length > 3) ext = ext.substring(0, 3);
    return ext.length ? name + "." + ext : name;
  }

  function matchesWildcard(name, pattern) {
    if (!pattern || pattern === "*.*" || pattern === "*") return true;
    const nName = normalizeName(name);
    const nPat = normalizeName(pattern);
    if (!nName || !nPat) return false;
    return wcMatch(nName, nPat);
  }

  function wcMatch(str, pat) {
    let si = 0;
    let pi = 0;
    let starSi = -1;
    let starPi = -1;
    while (si < str.length) {
      if (pi < pat.length && (pat[pi] === "?" || pat[pi] === str[si])) {
        si++;
        pi++;
      } else if (pi < pat.length && pat[pi] === "*") {
        starPi = pi;
        starSi = si;
        pi++;
      } else if (starPi >= 0) {
        pi = starPi + 1;
        starSi++;
        si = starSi;
      } else {
        return false;
      }
    }
    while (pi < pat.length && pat[pi] === "*") pi++;
    return pi === pat.length;
  }

  function createAudioBridge(port) {
    const AC = window.AudioContext || window.webkitAudioContext;
    let audioCtx = null;
    let workletNode = null;
    let nodePromise = null;
    let scriptNode = null;
    const scriptQueue = [];
    let scriptQueueIndex = 0;
    let scriptLastSample = 0.0;
    let scriptMaxQueuedSamples = 6144;
    let scriptStatusBlockCounter = 0;
    let scriptUnderrunBlocks = 0;
    let disposed = false;
    let sampleRateHint = 48000;

    function countScriptQueuedSamples() {
      if (!scriptQueue.length) return 0;
      let total = ((scriptQueue[0].length | 0) - (scriptQueueIndex | 0)) | 0;
      if (total < 0) total = 0;
      for (let i = 1; i < scriptQueue.length; i++)
        {total = (total + (scriptQueue[i].length | 0)) | 0;}
      return total | 0;
    }

    function clampScriptQueue() {
      const maxSamples = scriptMaxQueuedSamples | 0;
      if (!maxSamples || !scriptQueue.length) return;
      const total = countScriptQueuedSamples();
      if (total <= maxSamples) return;
      let toDrop = (total - maxSamples) | 0;
      while (scriptQueue.length && toDrop > 0) {
        const head = scriptQueue[0];
        const start = scriptQueueIndex | 0;
        const avail = ((head.length | 0) - start) | 0;
        if (avail <= 0) {
          scriptQueue.shift();
          scriptQueueIndex = 0;
          continue;
        }
        if (avail <= toDrop) {
          scriptQueue.shift();
          scriptQueueIndex = 0;
          toDrop -= avail;
          continue;
        }
        scriptQueueIndex = (start + toDrop) | 0;
        toDrop = 0;
      }
      if (!scriptQueue.length) scriptQueueIndex = 0;
    }

    function clearScriptQueue() {
      scriptQueue.length = 0;
      scriptQueueIndex = 0;
      scriptLastSample = 0.0;
      scriptStatusBlockCounter = 0;
      scriptUnderrunBlocks = 0;
    }

    function postStatusToWorker(queuedSamples) {
      try {
        port.postMessage({
          type: "status",
          msg: {
            type: "status",
            queuedSamples: queuedSamples | 0,
            underrunBlocks: scriptUnderrunBlocks | 0,
          },
        });
      } catch {
        // ignore
      }
    }

    function setupScriptNode() {
      if (scriptNode || disposed) return;
      const ctx = ensureContext();
      if (!ctx || typeof ctx.createScriptProcessor !== "function") return;
      const n = ctx.createScriptProcessor(512, 0, 1);
      n.onaudioprocess = function (e) {
        const out = e.outputBuffer.getChannelData(0);
        let i = 0;
        let underrun = false;
        while (i < out.length) {
          if (!scriptQueue.length) {
            out[i++] = scriptLastSample;
            underrun = true;
            continue;
          }
          const buf = scriptQueue[0];
          if (!buf || typeof buf.length !== "number") {
            scriptQueue.shift();
            scriptQueueIndex = 0;
            continue;
          }
          const avail = ((buf.length | 0) - (scriptQueueIndex | 0)) | 0;
          if (avail <= 0) {
            scriptQueue.shift();
            scriptQueueIndex = 0;
            continue;
          }
          let toCopy = out.length - i;
          if (toCopy > avail) toCopy = avail;
          const start = scriptQueueIndex | 0;
          const end = (start + toCopy) | 0;
          out.set(buf.subarray(start, end), i);
          i += toCopy;
          scriptQueueIndex = end;
          if ((scriptQueueIndex | 0) >= (buf.length | 0)) {
            scriptQueue.shift();
            scriptQueueIndex = 0;
          }
        }

        if (underrun) scriptUnderrunBlocks = (scriptUnderrunBlocks + 1) | 0;
        scriptStatusBlockCounter = (scriptStatusBlockCounter + 1) | 0;
        if (underrun || scriptStatusBlockCounter >= 8) {
          scriptStatusBlockCounter = 0;
          postStatusToWorker(countScriptQueuedSamples());
        }
        scriptLastSample = out[out.length - 1] || 0.0;
      };
      n.connect(ctx.destination);
      scriptNode = n;
    }

    function pushScriptSamples(samples) {
      if (!samples || !samples.length) return;
      let chunk = samples;
      if (!(chunk instanceof Float32Array)) {
        if (ArrayBuffer.isView(chunk) && chunk.buffer) {
          chunk = new Float32Array(
            chunk.buffer,
            chunk.byteOffset | 0,
            chunk.length | 0,
          );
        } else if (Array.isArray(chunk)) {
          chunk = new Float32Array(chunk);
        } else {
          return;
        }
      }
      scriptQueue.push(chunk);
      clampScriptQueue();
    }

    function relayToScriptFallback(msg) {
      const ctx = ensureContext();
      if (!ctx) return;
      setupScriptNode();
      if (!msg || !msg.type) return;
      if (msg.type === "config") {
        let maxQueued = msg.maxQueuedSamples | 0;
        if (maxQueued > 0) {
          if (maxQueued < 256) maxQueued = 256;
          scriptMaxQueuedSamples = maxQueued;
          clampScriptQueue();
          postStatusToWorker(countScriptQueuedSamples());
        }
        return;
      }
      if (msg.type === "clear") {
        clearScriptQueue();
        postStatusToWorker(0);
        return;
      }
      if (msg.type === "samples" && msg.samples && msg.samples.length) {
        pushScriptSamples(msg.samples);
      }
    }

    function ensureContext() {
      if (!AC || disposed) return null;
      if (!audioCtx) {
        audioCtx = new AC();
        sampleRateHint = audioCtx.sampleRate || 48000;
      }
      return audioCtx;
    }

    function ensureNode() {
      if (disposed) return Promise.resolve(null);
      if (workletNode) return Promise.resolve(workletNode);
      if (nodePromise) return nodePromise;
      const ctx = ensureContext();
      if (!ctx) return Promise.resolve(null);
      if (!(ctx.audioWorklet && window.AudioWorkletNode)) {
        setupScriptNode();
        nodePromise = Promise.resolve(null);
        return nodePromise;
      }
      nodePromise = ctx.audioWorklet
        .addModule("js/audio/worklet.js")
        .then(function () {
          if (disposed) return null;
          if (workletNode) return workletNode;
          const n = new window.AudioWorkletNode(ctx, "a8e-sample-queue", {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [1],
          });
          n.port.onmessage = function (e) {
            try {
              port.postMessage({ type: "status", msg: e.data || null });
            } catch {
              // ignore
            }
          };
          n.connect(ctx.destination);
          workletNode = n;
          return n;
        })
        .catch(function () {
          setupScriptNode();
          nodePromise = Promise.resolve(null);
          return null;
        });
      return nodePromise;
    }

    function relayWorkletMessage(msg) {
      ensureNode().then(function (n) {
        if (!msg) return;
        if (!n) {
          relayToScriptFallback(msg);
          return;
        }
        try {
          if (
            msg.type === "samples" &&
            msg.samples &&
            msg.samples.buffer instanceof ArrayBuffer
          ) {
            n.port.postMessage(msg, [msg.samples.buffer]);
            return;
          }
          n.port.postMessage(msg);
        } catch {
          // ignore malformed payloads
        }
      });
    }

    function resumeFromGesture() {
      const ctx = ensureContext();
      if (!ctx) return;
      ensureNode().then(function (n) {
        if (!n) setupScriptNode();
        if (!ctx || typeof ctx.resume !== "function") return;
        ctx.resume().catch(function () {});
      });
    }

    function closeContext() {
      try {
        if (workletNode) workletNode.disconnect();
      } catch {
        // ignore
      }
      workletNode = null;
      try {
        if (scriptNode) scriptNode.disconnect();
      } catch {
        // ignore
      }
      scriptNode = null;
      clearScriptQueue();
      nodePromise = null;
      if (audioCtx && typeof audioCtx.close === "function") {
        try {
          audioCtx.close();
        } catch {
          // ignore
        }
      }
      audioCtx = null;
    }

    function dispose() {
      disposed = true;
      closeContext();
    }

    port.onmessage = function (e) {
      if (disposed) return;
      const data = e && e.data ? e.data : null;
      if (!data) return;
      if (data.type === "worklet") {
        relayWorkletMessage(data.msg || null);
        return;
      }
      if (data.type === "context" && data.op === "resume") {
        const ctx = ensureContext();
        if (ctx && typeof ctx.resume === "function")
          {ctx.resume().catch(function () {});}
        return;
      }
      if (data.type === "context" && data.op === "close") {
        closeContext();
      }
    };
    if (typeof port.start === "function") {
      try {
        port.start();
      } catch {
        // ignore
      }
    }

    ensureContext();

    return {
      getSampleRateHint: function () {
        return sampleRateHint | 0;
      },
      resumeFromGesture: resumeFromGesture,
      dispose: dispose,
    };
  }

  function createHostFsProxy(sendHostFsCommand) {
    const files = new Map();
    const listeners = new Set();

    function emitChange() {
      listeners.forEach(function (fn) {
        try {
          fn();
        } catch {
          // ignore listener errors
        }
      });
    }

    function snapshotFromWire(items) {
      files.clear();
      if (items && items.length) {
        for (let i = 0; i < items.length; i++) {
          const it = items[i] || null;
          if (!it || !it.name) continue;
          const key = normalizeName(it.name);
          if (!key) continue;
          const data = toUint8(it.data);
          files.set(key, {
            name: key,
            locked: !!it.locked,
            data: data,
            size: data.length | 0,
          });
        }
      }
      emitChange();
    }

    function listFiles(pattern) {
      const out = [];
      files.forEach(function (entry) {
        if (!pattern || matchesWildcard(entry.name, pattern)) {
          out.push({
            name: entry.name,
            size: entry.size | 0,
            locked: !!entry.locked,
          });
        }
      });
      out.sort(function (a, b) {
        return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
      });
      return out;
    }

    function readFile(rawName) {
      const key = normalizeName(rawName);
      if (!key) return null;
      const entry = files.get(key);
      if (!entry) return null;
      return new Uint8Array(entry.data);
    }

    function writeFile(rawName, data) {
      const key = normalizeName(rawName);
      if (!key) return false;
      const existing = files.get(key);
      if (existing && existing.locked) return false;
      const localCopy = toUint8(data);
      files.set(key, {
        name: key,
        locked: existing ? !!existing.locked : false,
        data: localCopy,
        size: localCopy.length | 0,
      });
      emitChange();
      const sendCopy = new Uint8Array(localCopy);
      sendHostFsCommand(
        "hostfsWrite",
        { name: key, data: sendCopy },
        [sendCopy.buffer],
      );
      return true;
    }

    function deleteFile(rawName) {
      const key = normalizeName(rawName);
      if (!key) return false;
      const existing = files.get(key);
      if (!existing || existing.locked) return false;
      files.delete(key);
      emitChange();
      sendHostFsCommand("hostfsDelete", { name: key });
      return true;
    }

    function renameFile(rawOld, rawNew) {
      const oldKey = normalizeName(rawOld);
      const newKey = normalizeName(rawNew);
      if (!oldKey || !newKey) return false;
      const existing = files.get(oldKey);
      if (!existing) return false;
      if (existing.locked) return false;
      if (files.has(newKey)) return false;
      files.delete(oldKey);
      files.set(newKey, {
        name: newKey,
        locked: !!existing.locked,
        data: new Uint8Array(existing.data),
        size: existing.size | 0,
      });
      emitChange();
      sendHostFsCommand("hostfsRename", { oldName: oldKey, newName: newKey });
      return true;
    }

    function lockFile(rawName) {
      const key = normalizeName(rawName);
      if (!key) return false;
      const existing = files.get(key);
      if (!existing) return false;
      existing.locked = true;
      emitChange();
      sendHostFsCommand("hostfsLock", { name: key });
      return true;
    }

    function unlockFile(rawName) {
      const key = normalizeName(rawName);
      if (!key) return false;
      const existing = files.get(key);
      if (!existing) return false;
      existing.locked = false;
      emitChange();
      sendHostFsCommand("hostfsUnlock", { name: key });
      return true;
    }

    function getStatus(rawName) {
      const key = normalizeName(rawName);
      if (!key) return null;
      const entry = files.get(key);
      if (!entry) return null;
      return {
        name: entry.name,
        size: entry.size | 0,
        locked: !!entry.locked,
      };
    }

    function fileExists(rawName) {
      const key = normalizeName(rawName);
      return !!key && files.has(key);
    }

    function onChange(fn) {
      if (typeof fn !== "function") return function () {};
      listeners.add(fn);
      return function () {
        listeners.delete(fn);
      };
    }

    return {
      snapshotFromWire: snapshotFromWire,
      api: {
        listFiles: listFiles,
        readFile: readFile,
        writeFile: writeFile,
        deleteFile: deleteFile,
        renameFile: renameFile,
        lockFile: lockFile,
        unlockFile: unlockFile,
        getStatus: getStatus,
        fileExists: fileExists,
        onChange: onChange,
        normalizeName: normalizeName,
        matchesWildcard: matchesWildcard,
      },
    };
  }

  function createWorkerApp(opts) {
    const canvas = opts.canvas;
    const worker = new Worker("emulator_worker.js");
    const audioChannel = new MessageChannel();
    const audioBridge = createAudioBridge(audioChannel.port1);
    const hostFsProxy = createHostFsProxy(sendHostFsCommand);
    let disposed = false;
    let ready = false;
    const pending = [];
    let keyboardMappingMode =
      opts && opts.keyboardMappingMode === "original"
        ? "original"
        : "translated";

    const state = {
      running: false,
      ready: false,
      hasOsRom: false,
      hasBasicRom: false,
      mounted: [false, false, false, false, false, false, false, false],
      rendererBackend: "unknown",
    };

    function syncReadyFlag() {
      state.ready = !!(state.hasOsRom && state.hasBasicRom);
    }

    function postRaw(msg, transfer) {
      if (disposed) return;
      if (transfer && transfer.length) worker.postMessage(msg, transfer);
      else worker.postMessage(msg);
    }

    function sendCommand(cmd, payload, transfer) {
      if (disposed) return;
      const msg = {
        type: "cmd",
        cmd: cmd,
        payload: payload || null,
      };
      if (!ready) {
        pending.push({ msg: msg, transfer: transfer || null });
        return;
      }
      postRaw(msg, transfer || null);
    }

    function sendHostFsCommand(cmd, payload, transfer) {
      sendCommand(cmd, payload, transfer || null);
    }

    worker.onmessage = function (e) {
      if (disposed) return;
      const data = e && e.data ? e.data : null;
      if (!data || !data.type) return;

      if (data.type === "init-done") {
        ready = true;
        state.rendererBackend =
          typeof data.rendererBackend === "string"
            ? data.rendererBackend
            : "unknown";
        while (pending.length) {
          const next = pending.shift();
          postRaw(next.msg, next.transfer);
        }
        return;
      }

      if (data.type === "state") {
        state.running = !!data.running;
        state.hasOsRom = !!data.hasOsRom;
        state.hasBasicRom = !!data.hasBasicRom;
        if (Array.isArray(data.mounted)) {
          for (let i = 0; i < state.mounted.length; i++) {
            state.mounted[i] = !!data.mounted[i];
          }
        }
        syncReadyFlag();
        return;
      }

      if (data.type === "hostfsSnapshot") {
        hostFsProxy.snapshotFromWire(data.files || []);
        return;
      }

      if (data.type === "error") {
        console.error("A8E worker error:", data.message || "unknown error");
      }
    };

    worker.onerror = function (err) {
      if (disposed) return;
      console.error("A8E worker failed:", err);
    };

    const offscreen = canvas.transferControlToOffscreen();

    postRaw(
      {
        type: "init",
        canvas: offscreen,
        audioPort: audioChannel.port2,
        width: canvas.width | 0,
        height: canvas.height | 0,
        audioSampleRate: audioBridge.getSampleRateHint(),
        audioEnabled: !!opts.audioEnabled,
        turbo: !!opts.turbo,
        sioTurbo: opts.sioTurbo !== false,
        optionOnStart: !!opts.optionOnStart,
        keyboardMappingMode: keyboardMappingMode,
      },
      [offscreen, audioChannel.port2],
    );

    const hDeviceProxy = {
      getHostFs: function () {
        return hostFsProxy.api;
      },
    };

    return {
      start: function () {
        state.running = true;
        audioBridge.resumeFromGesture();
        sendCommand("start");
      },
      pause: function () {
        state.running = false;
        sendCommand("pause");
      },
      reset: function () {
        sendCommand("reset");
      },
      setTurbo: function (v) {
        sendCommand("setTurbo", { value: !!v });
      },
      setSioTurbo: function (v) {
        sendCommand("setSioTurbo", { value: !!v });
      },
      setAudioEnabled: function (v) {
        if (v) audioBridge.resumeFromGesture();
        sendCommand("setAudioEnabled", { value: !!v });
      },
      setOptionOnStart: function (v) {
        sendCommand("setOptionOnStart", { value: !!v });
      },
      setKeyboardMappingMode: function (mode) {
        keyboardMappingMode = mode === "original" ? "original" : "translated";
        sendCommand("setKeyboardMappingMode", { mode: keyboardMappingMode });
      },
      loadOsRom: function (arrayBuffer) {
        state.hasOsRom = true;
        syncReadyFlag();
        const buf = toArrayBuffer(arrayBuffer);
        sendCommand("loadOsRom", { buffer: buf }, [buf]);
      },
      loadBasicRom: function (arrayBuffer) {
        state.hasBasicRom = true;
        syncReadyFlag();
        const buf = toArrayBuffer(arrayBuffer);
        sendCommand("loadBasicRom", { buffer: buf }, [buf]);
      },
      loadDiskToDeviceSlot: function (arrayBuffer, name, slot) {
        const idx = slot | 0;
        if (idx >= 0 && idx < state.mounted.length) state.mounted[idx] = true;
        const buf = toArrayBuffer(arrayBuffer);
        sendCommand(
          "loadDiskToDeviceSlot",
          { buffer: buf, name: name || "", slot: idx },
          [buf],
        );
      },
      mountImageToDeviceSlot: function (image, slot) {
        const idx = slot | 0;
        if (idx >= 0 && idx < state.mounted.length) state.mounted[idx] = true;
        sendCommand("mountImageToDeviceSlot", {
          image: image || null,
          slot: idx,
        });
      },
      unmountDeviceSlot: function (slot) {
        const idx = slot | 0;
        if (idx >= 0 && idx < state.mounted.length) state.mounted[idx] = false;
        sendCommand("unmountDeviceSlot", { slot: idx });
      },
      getMountedDiskForDeviceSlot: function () {
        return null;
      },
      hasMountedDiskForDeviceSlot: function (slot) {
        const idx = slot | 0;
        if (idx < 0 || idx >= state.mounted.length) return false;
        return !!state.mounted[idx];
      },
      hDevice: hDeviceProxy,
      hasOsRom: function () {
        return !!state.hasOsRom;
      },
      hasBasicRom: function () {
        return !!state.hasBasicRom;
      },
      isReady: function () {
        return !!state.ready;
      },
      isRunning: function () {
        return !!state.running;
      },
      setRenderSize: function (w, h) {
        sendCommand("setRenderSize", {
          width: w | 0,
          height: h | 0,
        });
      },
      getRendererBackend: function () {
        return state.rendererBackend;
      },
      dispose: function () {
        if (disposed) return;
        disposed = true;
        try {
          sendCommand("dispose");
        } catch {
          // ignore
        }
        try {
          worker.terminate();
        } catch {
          // ignore
        }
        audioBridge.dispose();
      },
      onKeyDown: function (ev) {
        sendCommand("onKeyDown", { event: ev || null });
        return true;
      },
      onKeyUp: function (ev) {
        sendCommand("onKeyUp", { event: ev || null });
        return true;
      },
      releaseAllKeys: function () {
        sendCommand("releaseAllKeys");
      },
    };
  }

  function createLegacyApp(opts) {
    if (!legacyCreate) throw new Error("A8EApp: no available backend");
    const legacyOpts = Object.assign({}, opts);
    if (!legacyOpts.gl && !legacyOpts.ctx2d && legacyOpts.canvas) {
      try {
        legacyOpts.ctx2d = legacyOpts.canvas.getContext("2d", { alpha: false });
      } catch {
        legacyOpts.ctx2d = null;
      }
    }
    const app = legacyCreate(legacyOpts);
    if (app && typeof app.setRenderSize !== "function")
      {app.setRenderSize = function () {};}
    if (app && typeof app.setKeyboardMappingMode !== "function")
      {app.setKeyboardMappingMode = function () {};}
    return app;
  }

  function create(opts) {
    if (!supportsWorker()) {
      return createLegacyApp(opts);
    }

    try {
      return createWorkerApp(opts);
    } catch {
      return createLegacyApp(opts);
    }
  }

  window.A8EApp = {
    create: create,
    supportsWorker: supportsWorker,
  };
})();
