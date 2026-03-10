(function () {
  "use strict";

  const API_VERSION = "1";
  const ARTIFACT_SCHEMA_VERSION = "2";
  const SDLK_UP = 273;
  const SDLK_DOWN = 274;
  const SDLK_RIGHT = 275;
  const SDLK_LEFT = 276;
  const SDLK_OPTION = 283;
  const SDLK_SELECT = 284;
  const SDLK_START = 285;
  const SDLK_TRIGGER_0 = 308;
  const hwApi =
    window.A8EHw && typeof window.A8EHw.createApi === "function"
      ? window.A8EHw.createApi()
      : null;
  const ATARI_CPU_HZ_PAL =
    hwApi && typeof hwApi.ATARI_CPU_HZ_PAL === "number"
      ? hwApi.ATARI_CPU_HZ_PAL
      : 1773447;
  const CYCLES_PER_FRAME =
    hwApi &&
    typeof hwApi.CYCLES_PER_LINE === "number" &&
    typeof hwApi.LINES_PER_SCREEN_PAL === "number"
      ? (hwApi.CYCLES_PER_LINE | 0) * (hwApi.LINES_PER_SCREEN_PAL | 0)
      : 35568;
  const CODE_TABLE =
    window.A8ECpuTables && typeof window.A8ECpuTables.buildCodeTable === "function"
      ? window.A8ECpuTables.buildCodeTable()
      : null;
  const OPCODE_ID_TO_MNEMONIC = [
    "LDA", "LDX", "LDY", "STA", "STX", "STY", "TAX", "TAY", "TSX", "TXA",
    "TXS", "TYA", "ADC", "AND", "EOR", "ORA", "SBC", "DEC", "DEX", "DEY",
    "INC", "INX", "INY", "ASL", "LSR", "ROL", "ROR", "BIT", "CMP", "CPX",
    "CPY", "BCC", "BCS", "BEQ", "BMI", "BNE", "BPL", "BVC", "BVS", "BRK",
    "JMP", "JSR", "NOP", "RTI", "RTS", "CLC", "CLD", "CLI", "CLV", "SEC",
    "SED", "SEI", "PHA", "PHP", "PLA", "PLP", "XXX", "LAX", "SLO", "ATX",
    "AAX", "DOP", "TOP", "ASR", "ISC", "SRE", "RLA", "AAC", "XAA", "DCP",
    "RRA", "SBX",
  ];
  const ADDRESS_TYPE_TO_MODE = {
    0: "IMM",
    1: "ABS",
    2: "ZP",
    3: "ACC",
    4: "IMP",
    5: "INDX",
    6: "INDY",
    7: "ZPX",
    8: "ZPY",
    9: "ABSX",
    10: "ABSY",
    11: "REL",
    12: "IND",
  };
  const MODE_SIZE = {
    IMP: 1,
    ACC: 1,
    IMM: 2,
    ZP: 2,
    ZPX: 2,
    ZPY: 2,
    INDX: 2,
    INDY: 2,
    REL: 2,
    ABS: 3,
    ABSX: 3,
    ABSY: 3,
    IND: 3,
  };
  const PAUSE_REASONS = new Set([
    "pause",
    "breakpoint",
    "step",
    "stepOver",
    "pc",
    "pauseAddress",
    "instructionLimit",
    "cycleLimit",
    "fault_illegal_opcode",
    "fault_execution_error",
    "reset",
  ]);

  let currentApp = null;
  let currentCanvas = null;
  let currentFocusCanvas = null;
  let currentUpdateStatus = null;
  let readyResolve = null;
  let readyPromise = null;
  let debugUnsubscribe = null;
  let hostFsUnsubscribe = null;
  let lastDebugState = null;
  let lastPauseSignature = "";
  let lastBuildRecord = null;
  let nextSubscriptionId = 1;
  const eventSubscriptions = new Map();
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

  function resetReadyPromise() {
    readyPromise = new Promise(function (resolve) {
      readyResolve = resolve;
    });
  }

  resetReadyPromise();

  function getObjectTag(value) {
    return OBJECT_TO_STRING.call(value);
  }

  function isArrayBufferLike(value) {
    const tag = getObjectTag(value);
    return tag === "[object ArrayBuffer]" || tag === "[object SharedArrayBuffer]";
  }

  function isDataViewLike(value) {
    return getObjectTag(value) === "[object DataView]";
  }

  function isBinaryView(value) {
    if (!value) return false;
    if (typeof ArrayBuffer !== "undefined" && typeof ArrayBuffer.isView === "function") {
      return ArrayBuffer.isView(value) && !isDataViewLike(value);
    }
    return TYPED_ARRAY_TAGS.has(getObjectTag(value));
  }

  function copyBufferLike(data, byteOffset, byteLength) {
    if (!isArrayBufferLike(data)) return new Uint8Array(0);
    const offset = Math.max(0, byteOffset | 0);
    const length = Math.max(0, byteLength | 0);
    const view = new Uint8Array(data, offset, length);
    const out = new Uint8Array(length);
    out.set(view);
    return out;
  }

  function copyBinaryView(view) {
    if (!view || !isArrayBufferLike(view.buffer)) return new Uint8Array(0);
    return copyBufferLike(view.buffer, view.byteOffset | 0, view.byteLength | 0);
  }

  function clamp16(value) {
    return (value | 0) & 0xffff;
  }

  function clamp8(value) {
    return (value | 0) & 0xff;
  }

  function normalizeResetOptions(options) {
    if (!options || typeof options !== "object") return null;
    const out = {};
    if (options.portB !== undefined && options.portB !== null) {
      out.portB = clamp8(options.portB);
    }
    return Object.keys(out).length ? out : null;
  }

  function decodeBase64(base64) {
    if (typeof base64 !== "string") return new Uint8Array(0);
    const text = base64.trim();
    if (!text.length) return new Uint8Array(0);
    const binary = atob(text);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 0xff;
    return out;
  }

  function toUint8Array(data) {
    if (!data) return new Uint8Array(0);
    if (getObjectTag(data) === "[object Uint8Array]") return new Uint8Array(data);
    if (isArrayBufferLike(data)) {
      return copyBufferLike(data, 0, data.byteLength | 0);
    }
    if (isBinaryView(data) || isDataViewLike(data)) {
      return copyBinaryView(data);
    }
    if (Array.isArray(data)) return new Uint8Array(data);
    if (typeof data === "string") return decodeBase64(data);
    if (typeof data === "object") {
      if (data.base64) return decodeBase64(String(data.base64));
      if (data.bytes) return toUint8Array(data.bytes);
      if (data.buffer) return toUint8Array(data.buffer);
      if (data.data) return toUint8Array(data.data);
      if (data.text !== undefined) return encodeText(String(data.text));
    }
    return new Uint8Array(0);
  }

  function toArrayBuffer(data) {
    const bytes = toUint8Array(data);
    const out = new Uint8Array(bytes.length);
    out.set(bytes);
    return out.buffer;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i] & 0xff);
    }
    return btoa(binary);
  }

  function bytesToHex(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += (bytes[i] & 0xff).toString(16).toUpperCase().padStart(2, "0");
    }
    return out;
  }

  function encodeText(text) {
    if (typeof TextEncoder !== "undefined") {
      try {
        return new TextEncoder().encode(text);
      } catch {
        // fallback below
      }
    }
    const raw = String(text || "");
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i) & 0xff;
    return out;
  }

  function serializeAutomationError(err) {
    if (!err) return null;
    const out = {
      name: err.name ? String(err.name) : "Error",
      message: err.message ? String(err.message) : String(err),
    };
    if (err.operation) out.operation = String(err.operation);
    if (err.phase) out.phase = String(err.phase);
    if (err.code) out.code = String(err.code);
    if (err.url) out.url = String(err.url);
    if (typeof err.status === "number") out.status = err.status | 0;
    if (err.details !== undefined) out.details = err.details;
    if (err.cause) {
      out.cause =
        err.cause && typeof err.cause === "object"
          ? {
              name: err.cause.name ? String(err.cause.name) : "Error",
              message: err.cause.message
                ? String(err.cause.message)
                : String(err.cause),
            }
          : { message: String(err.cause) };
    }
    return out;
  }

  function createAutomationError(details) {
    const info = details && typeof details === "object" ? details : {};
    const err = new Error(info.message ? String(info.message) : "A8E automation error");
    err.name = "A8EAutomationError";
    if (info.operation) err.operation = String(info.operation);
    if (info.phase) err.phase = String(info.phase);
    if (info.code) err.code = String(info.code);
    if (info.url) err.url = String(info.url);
    if (typeof info.status === "number") err.status = info.status | 0;
    if (info.details !== undefined) err.details = info.details;
    if (info.cause !== undefined) err.cause = info.cause;
    err.toJSON = function () {
      return serializeAutomationError(err);
    };
    return err;
  }

  function buildUrlWithCacheControl(url, options) {
    const rawUrl = String(url || "");
    const opts = options || {};
    if (!rawUrl.length) return rawUrl;
    const cacheBust =
      opts.cacheBust !== undefined && opts.cacheBust !== null ? opts.cacheBust : null;
    if (!cacheBust) return rawUrl;
    const token =
      cacheBust === true
        ? String(Date.now()) + "-" + Math.random().toString(16).slice(2)
        : String(cacheBust);
    try {
      const resolved = new URL(rawUrl, window.location.href);
      const key =
        opts.cacheBustParam !== undefined && opts.cacheBustParam !== null
          ? String(opts.cacheBustParam)
          : "_a8e_cb";
      resolved.searchParams.set(key, token);
      return resolved.toString();
    } catch {
      const separator = rawUrl.indexOf("?") >= 0 ? "&" : "?";
      return rawUrl + separator + "_a8e_cb=" + encodeURIComponent(token);
    }
  }

  function buildFetchInit(options) {
    const opts = options || {};
    const base =
      opts.fetch && typeof opts.fetch === "object"
        ? Object.assign({}, opts.fetch)
        : opts.requestInit && typeof opts.requestInit === "object"
          ? Object.assign({}, opts.requestInit)
          : {};
    if (opts.cache !== undefined && opts.cache !== null && base.cache === undefined) {
      base.cache = String(opts.cache);
    }
    if (
      opts.credentials !== undefined &&
      opts.credentials !== null &&
      base.credentials === undefined
    ) {
      base.credentials = String(opts.credentials);
    }
    if (opts.mode !== undefined && opts.mode !== null && base.mode === undefined) {
      base.mode = String(opts.mode);
    }
    return base;
  }

  function decodeText(bytes) {
    if (typeof TextDecoder !== "undefined") {
      try {
        return new TextDecoder().decode(bytes);
      } catch {
        // fallback below
      }
    }
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i] & 0xff);
    return out;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, ms | 0));
    });
  }

  function counterDelta(startValue, endValue) {
    return ((endValue >>> 0) - (startValue >>> 0)) >>> 0;
  }

  async function getApp() {
    if (currentApp) return currentApp;
    await readyPromise;
    if (!currentApp) {
      throw new Error("A8EAutomation is not attached to a running emulator");
    }
    return currentApp;
  }

  async function readAppDebugState(app) {
    if (!app) return null;
    if (typeof app.getDebugStateAsync === "function") {
      return Promise.resolve(app.getDebugStateAsync());
    }
    if (typeof app.getDebugState === "function") {
      return Promise.resolve(app.getDebugState());
    }
    return null;
  }

  function getCurrentHostFs() {
    if (
      !currentApp ||
      !currentApp.hDevice ||
      typeof currentApp.hDevice.getHostFs !== "function"
    ) {
      return null;
    }
    return currentApp.hDevice.getHostFs();
  }

  function notifyStatus() {
    if (typeof currentUpdateStatus === "function") currentUpdateStatus();
  }

  async function fetchBinaryResource(url, options) {
    const opts = options || {};
    const operation = opts.operation ? String(opts.operation) : "fetchBinaryResource";
    const originalUrl = String(url || "");
    const requestUrl = buildUrlWithCacheControl(originalUrl, opts);
    emitProgress(operation, "resource_fetch_started", {
      url: requestUrl,
      originalUrl: originalUrl,
    });

    let response = null;
    try {
      response = await fetch(requestUrl, buildFetchInit(opts));
    } catch (err) {
      emitProgress(operation, "resource_fetch_failed", {
        url: requestUrl,
        originalUrl: originalUrl,
      });
      throw createAutomationError({
        operation: operation,
        phase: "resource_fetch",
        message: "Failed to fetch automation resource",
        url: requestUrl,
        cause: err,
      });
    }

    if (!response || !response.ok) {
      emitProgress(operation, "resource_fetch_failed", {
        url: requestUrl,
        originalUrl: originalUrl,
        status: response ? response.status | 0 : 0,
      });
      throw createAutomationError({
        operation: operation,
        phase: "resource_fetch",
        message:
          "Automation resource fetch failed with HTTP " +
          (response ? response.status | 0 : 0),
        url: requestUrl,
        status: response ? response.status | 0 : 0,
        details: {
          statusText: response && response.statusText ? String(response.statusText) : "",
        },
      });
    }

    let buffer = null;
    try {
      buffer = await response.arrayBuffer();
    } catch (err) {
      emitProgress(operation, "resource_read_failed", {
        url: requestUrl,
        originalUrl: originalUrl,
        status: response.status | 0,
      });
      throw createAutomationError({
        operation: operation,
        phase: "resource_fetch",
        message: "Fetched automation resource could not be read as binary data",
        url: requestUrl,
        status: response.status | 0,
        cause: err,
      });
    }

    const bytes = toUint8Array(buffer);
    emitProgress(operation, "resource_fetch_completed", {
      url: requestUrl,
      originalUrl: originalUrl,
      responseUrl: response.url ? String(response.url) : requestUrl,
      status: response.status | 0,
      byteLength: bytes.length | 0,
      contentType:
        response.headers && typeof response.headers.get === "function"
          ? response.headers.get("content-type") || ""
          : "",
    });
    return {
      url: requestUrl,
      originalUrl: originalUrl,
      responseUrl: response.url ? String(response.url) : requestUrl,
      status: response.status | 0,
      contentType:
        response.headers && typeof response.headers.get === "function"
          ? response.headers.get("content-type") || ""
          : "",
      bytes: bytes,
    };
  }

  function cloneDebugState(raw) {
    if (!raw || typeof raw !== "object") return null;
    const out = {
      reason: raw.reason ? String(raw.reason) : "update",
      running: !!raw.running,
      pc: clamp16(raw.pc),
      a: clamp8(raw.a),
      x: clamp8(raw.x),
      y: clamp8(raw.y),
      sp: clamp8(raw.sp),
      p: clamp8(raw.p),
      cycleCounter: raw.cycleCounter >>> 0,
      instructionCounter: raw.instructionCounter >>> 0,
    };
    if (typeof raw.breakpointHit === "number")
      {out.breakpointHit = clamp16(raw.breakpointHit);}
    if (typeof raw.stopAddress === "number")
      {out.stopAddress = clamp16(raw.stopAddress);}
    if (typeof raw.faultAddress === "number")
      {out.faultAddress = clamp16(raw.faultAddress);}
    if (typeof raw.opcode === "number") out.opcode = clamp8(raw.opcode);
    if (raw.faultType) out.faultType = String(raw.faultType);
    if (raw.faultMessage) out.faultMessage = String(raw.faultMessage);
    return out;
  }

  function makePauseSignature(state) {
    if (!state || state.running || !PAUSE_REASONS.has(state.reason || "")) return "";
    return [
      state.reason || "",
      state.pc & 0xffff,
      state.cycleCounter >>> 0,
      state.instructionCounter >>> 0,
      typeof state.breakpointHit === "number" ? state.breakpointHit & 0xffff : -1,
      typeof state.faultAddress === "number" ? state.faultAddress & 0xffff : -1,
      typeof state.opcode === "number" ? state.opcode & 0xff : -1,
    ].join(":");
  }

  function emitEvent(type, payload) {
    const envelope = Object.assign(
      {
        type: String(type || "event"),
        timestamp: Date.now(),
      },
      payload || {},
    );
    eventSubscriptions.forEach(function (sub) {
      if (!sub) return;
      if (sub.type !== "*" && sub.type !== envelope.type) return;
      try {
        sub.handler(envelope);
      } catch {
        // ignore subscriber errors
      }
    });
    return envelope;
  }

  function emitProgress(operation, phase, payload) {
    return emitEvent(
      "progress",
      Object.assign(
        {
          operation: String(operation || "automation"),
          phase: String(phase || "progress"),
        },
        payload || {},
      ),
    );
  }

  function subscribeEvent(type, handler) {
    const fn = typeof type === "function" ? type : handler;
    if (typeof fn !== "function") {
      throw new Error("A8EAutomation.events.subscribe requires a handler");
    }
    const id = nextSubscriptionId++;
    eventSubscriptions.set(id, {
      type: typeof type === "string" && type.length ? type : "*",
      handler: fn,
    });
    return id;
  }

  function unsubscribeEvent(id) {
    return eventSubscriptions.delete(id | 0);
  }

  function clearBindings() {
    if (debugUnsubscribe) {
      try {
        debugUnsubscribe();
      } catch {
        // ignore
      }
      debugUnsubscribe = null;
    }
    if (hostFsUnsubscribe) {
      try {
        hostFsUnsubscribe();
      } catch {
        // ignore
      }
      hostFsUnsubscribe = null;
    }
  }

  function onDebugStateUpdate(rawState) {
    const state = cloneDebugState(rawState);
    if (!state) return;
    lastDebugState = state;
    emitEvent("debugState", {
      debugState: cloneDebugState(state),
    });
    const signature = makePauseSignature(state);
    if (signature && signature !== lastPauseSignature) {
      lastPauseSignature = signature;
      const pauseEvent = {
        reason: state.reason,
        debugState: cloneDebugState(state),
      };
      if (typeof state.breakpointHit === "number")
        {pauseEvent.breakpointHit = state.breakpointHit & 0xffff;}
      if (typeof state.stopAddress === "number")
        {pauseEvent.stopAddress = state.stopAddress & 0xffff;}
      if (typeof state.faultAddress === "number")
        {pauseEvent.faultAddress = state.faultAddress & 0xffff;}
      if (state.faultType) pauseEvent.faultType = state.faultType;
      if (state.faultMessage) pauseEvent.faultMessage = state.faultMessage;
      if (typeof state.opcode === "number") pauseEvent.opcode = state.opcode & 0xff;
      emitEvent("pause", pauseEvent);
      if (state.reason.indexOf("fault_") === 0) emitEvent("fault", pauseEvent);
    } else if (state.running) {
      lastPauseSignature = "";
    }
  }

  function bindAppListeners() {
    clearBindings();
    if (!currentApp) return;
    if (typeof currentApp.onDebugStateChange === "function") {
      debugUnsubscribe = currentApp.onDebugStateChange(onDebugStateUpdate);
    }
    const hostFs = getCurrentHostFs();
    if (hostFs && typeof hostFs.onChange === "function") {
      hostFsUnsubscribe = hostFs.onChange(function () {
        emitEvent("hostfs", {
          files:
            typeof hostFs.listFiles === "function"
              ? hostFs.listFiles().map(function (entry) {
                  return {
                    name: String(entry.name || ""),
                    size: entry.size | 0,
                    locked: !!entry.locked,
                  };
                })
              : [],
        });
      });
    }
    if (typeof currentApp.getDebugState === "function") {
      onDebugStateUpdate(currentApp.getDebugState());
    } else {
      lastDebugState = null;
      lastPauseSignature = "";
    }
  }

  function normalizeRomRequest(kind, data) {
    let nextKind = kind;
    let nextData = data;
    if (kind && typeof kind === "object" && !isBinaryView(kind)) {
      nextKind = kind.kind || kind.type || kind.rom || "";
      nextData =
        kind.data !== undefined
          ? kind.data
          : kind.buffer !== undefined
            ? kind.buffer
            : kind.base64 !== undefined
              ? { base64: kind.base64 }
              : kind.bytes;
    }
    const normalizedKind = String(nextKind || "").toLowerCase();
    if (normalizedKind !== "os" && normalizedKind !== "basic") {
      throw new Error("A8EAutomation.loadRom kind must be 'os' or 'basic'");
    }
    return {
      kind: normalizedKind,
      buffer: toArrayBuffer(nextData),
    };
  }

  function normalizeDiskRequest(data, nameOrOpts, slot) {
    let name = "disk.atr";
    let targetSlot = 0;
    if (nameOrOpts && typeof nameOrOpts === "object" && !isBinaryView(nameOrOpts)) {
      name = String(nameOrOpts.name || name);
      targetSlot =
        nameOrOpts.slot !== undefined && nameOrOpts.slot !== null
          ? nameOrOpts.slot | 0
          : 0;
    } else {
      if (nameOrOpts) name = String(nameOrOpts);
      if (slot !== undefined && slot !== null) targetSlot = slot | 0;
    }
    return {
      name: name,
      slot: targetSlot,
      buffer: toArrayBuffer(data),
    };
  }

  function normalizeKeyEvent(eventLike) {
    const raw =
      typeof eventLike === "string"
        ? { key: eventLike }
        : eventLike && typeof eventLike === "object"
          ? eventLike
          : {};
    const key = raw.key !== undefined && raw.key !== null ? String(raw.key) : "";
    const code =
      raw.code !== undefined && raw.code !== null ? String(raw.code) : "";
    const out = {
      key: key,
      code: code,
      ctrlKey: !!raw.ctrlKey,
      shiftKey: !!raw.shiftKey,
      altGraph: !!raw.altGraph,
      virtualCtrlKey: !!raw.virtualCtrlKey,
      virtualShiftKey: !!raw.virtualShiftKey,
      sourceToken:
        raw.sourceToken !== undefined && raw.sourceToken !== null
          ? String(raw.sourceToken)
          : "automation:" + key + ":" + code,
    };
    if (typeof raw.sdlSym === "number" && isFinite(raw.sdlSym)) {
      out.sdlSym = raw.sdlSym | 0;
    }
    return out;
  }

  function guessCodeFromChar(ch) {
    if (/^[a-z]$/i.test(ch)) return "Key" + ch.toUpperCase();
    if (/^[0-9]$/.test(ch)) return "Digit" + ch;
    if (ch === " ") return "Space";
    if (ch === "\n" || ch === "\r") return "Enter";
    return "";
  }

  function normalizePauseReasonFilter(raw) {
    if (!raw) return null;
    if (Array.isArray(raw)) {
      return new Set(
        raw
          .map(function (value) {
            return String(value || "");
          })
          .filter(Boolean),
      );
    }
    return new Set([String(raw)]);
  }

  function matchesPauseReason(state, reasonFilter) {
    if (!state || state.running || !PAUSE_REASONS.has(state.reason || "")) {
      return false;
    }
    if (!reasonFilter || !reasonFilter.size) return true;
    return reasonFilter.has(String(state.reason || ""));
  }

  function getImmediatePauseEvent(options) {
    const reasonFilter = normalizePauseReasonFilter(options && options.reason);
    if (!matchesPauseReason(lastDebugState, reasonFilter)) return null;
    return {
      type: "pause",
      timestamp: Date.now(),
      reason: lastDebugState.reason,
      debugState: cloneDebugState(lastDebugState),
      breakpointHit:
        typeof lastDebugState.breakpointHit === "number"
          ? lastDebugState.breakpointHit & 0xffff
          : undefined,
      stopAddress:
        typeof lastDebugState.stopAddress === "number"
          ? lastDebugState.stopAddress & 0xffff
          : undefined,
      faultAddress:
        typeof lastDebugState.faultAddress === "number"
          ? lastDebugState.faultAddress & 0xffff
          : undefined,
      faultType: lastDebugState.faultType || undefined,
      faultMessage: lastDebugState.faultMessage || undefined,
      opcode:
        typeof lastDebugState.opcode === "number"
          ? lastDebugState.opcode & 0xff
          : undefined,
    };
  }

  function waitForEvent(type, predicate, options) {
    const opts = options || {};
    const timeoutMs = opts.timeoutMs | 0;
    return new Promise(function (resolve, reject) {
      let timerId = 0;
      let token = 0;

      function cleanup() {
        if (timerId) clearTimeout(timerId);
        timerId = 0;
        if (token) unsubscribeEvent(token);
        token = 0;
      }

      function onEvent(event) {
        let matches = false;
        try {
          matches = predicate ? !!predicate(event) : true;
        } catch (err) {
          cleanup();
          reject(err);
          return;
        }
        if (!matches) return;
        cleanup();
        resolve(event);
      }

      token = subscribeEvent(type, onEvent);
      if (timeoutMs > 0) {
        timerId = setTimeout(function () {
          cleanup();
          if (typeof opts.onTimeout === "function") {
            Promise.resolve(opts.onTimeout())
              .then(resolve)
              .catch(reject);
            return;
          }
          reject(
            createAutomationError({
              operation: "waitForEvent",
              phase: "wait_timeout",
              message: "A8EAutomation wait timed out",
            }),
          );
        }, timeoutMs);
      }
    });
  }

  async function waitForPause(options) {
    const opts = options || {};
    if (opts.immediate !== false) {
      const immediate = getImmediatePauseEvent(opts);
      if (immediate) return immediate;
    }
    const reasonFilter = normalizePauseReasonFilter(opts.reason);
    return waitForEvent(
      "pause",
      function (event) {
        if (!event || !event.debugState) return false;
        if (!reasonFilter || !reasonFilter.size) return true;
        return reasonFilter.has(String(event.reason || ""));
      },
      Object.assign({}, opts, {
        onTimeout: function () {
          return buildWaitFailureSnapshot("waitForPause", opts, {
            reason: "timeout",
            message: "Pause wait timed out",
            timedOut: true,
            timeoutMs: opts.timeoutMs | 0,
          });
        },
      }),
    );
  }

  async function waitForRealTime(ms, options) {
    const opts = options || {};
    const waitMs = Math.max(0, ms | 0);
    const app = await getApp();
    if (!app.isRunning || !app.isRunning() || opts.stopOnPause === false) {
      await sleep(waitMs);
      return {
        ok: true,
        reason: "time",
        clock: "real",
        elapsedMs: waitMs,
        debugState: await api.getDebugState(),
      };
    }

    return new Promise(function (resolve) {
      let resolved = false;
      let timerId = 0;
      let token = 0;

      function cleanup() {
        if (timerId) clearTimeout(timerId);
        if (token) unsubscribeEvent(token);
      }

      function finish(payload) {
        if (resolved) return;
        resolved = true;
        cleanup();
        resolve(payload);
      }

      token = subscribeEvent("pause", function (event) {
        finish({
          ok: false,
          reason: event.reason || "pause",
          clock: "real",
          elapsedMs: waitMs,
          pause: event,
          debugState: event.debugState || null,
        });
      });
      timerId = setTimeout(async function () {
        finish({
          ok: true,
          reason: "time",
          clock: "real",
          elapsedMs: waitMs,
          debugState: await api.getDebugState(),
        });
      }, waitMs);
    });
  }

  async function waitForCounterDelta(counterKey, count, options) {
    const opts = options || {};
    const targetCount = Math.max(0, count | 0);
    const intervalMs = Math.max(10, opts.pollIntervalMs | 0 || 20);
    const timeoutMs = opts.timeoutMs | 0;
    const startedAt = Date.now();
    const initial = await api.getCounters();
    if (!initial) {
      return {
        ok: false,
        reason: "unsupported",
        debugState: await api.getDebugState(),
      };
    }
    if (!targetCount) {
      return {
        ok: true,
        reason: counterKey,
        delta: 0,
        counters: initial,
        debugState: await api.getDebugState(),
      };
    }
    const app = await getApp();
    if (!app.isRunning || !app.isRunning()) {
      return {
        ok: false,
        reason: "paused",
        delta: 0,
        counters: initial,
        debugState: await api.getDebugState(),
      };
    }

    while (true) {
      const counters = await api.getCounters();
      const delta = counterDelta(initial[counterKey] >>> 0, counters[counterKey] >>> 0);
      if (delta >= targetCount) {
        return {
          ok: true,
          reason: counterKey,
          delta: delta >>> 0,
          counters: counters,
          debugState: await api.getDebugState(),
        };
      }
      const state = await api.getDebugState();
      if (state && !state.running) {
        return {
          ok: false,
          reason: state.reason || "pause",
          delta: delta >>> 0,
          counters: counters,
          debugState: state,
        };
      }
      if (timeoutMs > 0 && Date.now() - startedAt >= timeoutMs) {
        return buildWaitFailureSnapshot("waitForCounterDelta", opts, {
          reason: "timeout",
          message: "Counter wait timed out",
          timedOut: true,
          timeoutMs: timeoutMs,
          counterKey: counterKey,
          targetCount: targetCount,
          currentDelta: delta >>> 0,
        });
      }
      await sleep(intervalMs);
    }
  }

  async function buildWaitFailureSnapshot(operation, options, failure) {
    const opts = options || {};
    const rawFailure = failure && typeof failure === "object" ? failure : {};
    const runConfiguration = Object.assign({}, normalizeRunConfiguration(opts.runConfiguration) || {});
    if (rawFailure.counterKey) {
      runConfiguration.counterKey = rawFailure.counterKey;
      runConfiguration.targetCount = rawFailure.targetCount;
    }
    if (rawFailure.targetPc !== undefined && rawFailure.targetPc !== null) {
      runConfiguration.targetPc = clamp16(rawFailure.targetPc);
    }
    const snapshot = await captureFailureState(
      Object.assign({}, opts, {
        operation: operation,
        runConfiguration: runConfiguration,
        failure: Object.assign({}, rawFailure, {
          operation: operation,
        }),
      }),
    );
    snapshot.ok = false;
    snapshot.reason =
      rawFailure.reason !== undefined && rawFailure.reason !== null
        ? String(rawFailure.reason)
        : "timeout";
    if (typeof rawFailure.executedInstructions === "number") {
      snapshot.executedInstructions = rawFailure.executedInstructions >>> 0;
    }
    if (typeof rawFailure.executedCycles === "number") {
      snapshot.executedCycles = rawFailure.executedCycles >>> 0;
    }
    if (typeof rawFailure.targetPc === "number") {
      snapshot.targetPc = clamp16(rawFailure.targetPc);
    }
    if (typeof rawFailure.currentDelta === "number") {
      snapshot.currentDelta = rawFailure.currentDelta >>> 0;
    }
    emitProgress(operation, snapshot.phase || "wait_timeout", {
      reason: snapshot.reason,
      targetPc:
        typeof snapshot.targetPc === "number" ? snapshot.targetPc & 0xffff : undefined,
      timeoutMs:
        snapshot.failure && typeof snapshot.failure.timeoutMs === "number"
          ? snapshot.failure.timeoutMs | 0
          : undefined,
    });
    return snapshot;
  }

  async function finalizeWaitForPcResult(targetPc, result, options, operation) {
    const normalizedTarget = clamp16(targetPc);
    if (didReachTargetPc(result, normalizedTarget)) {
      emitProgress(operation, "entry_pc_reached", {
        targetPc: normalizedTarget,
      });
      return result;
    }
    return buildWaitFailureSnapshot(operation, options || {}, {
      reason:
        result && result.reason !== undefined && result.reason !== null
          ? String(result.reason)
          : "timeout",
      message:
        result && result.reason === "breakpoint"
          ? "Execution stopped at a different breakpoint before reaching target PC"
          : "Execution did not reach the requested PC",
      targetPc: normalizedTarget,
      executedInstructions:
        result && typeof result.executedInstructions === "number"
          ? result.executedInstructions >>> 0
          : undefined,
      executedCycles:
        result && typeof result.executedCycles === "number"
          ? result.executedCycles >>> 0
          : undefined,
    });
  }

  async function readRangeBytes(start, length) {
    const app = await getApp();
    const addr = clamp16(start);
    const size = length | 0;
    if (size <= 0) return new Uint8Array(0);
    if (typeof app.readRange === "function") {
      if (addr + size <= 0x10000) {
        return toUint8Array(await Promise.resolve(app.readRange(addr, size)));
      }
      const head = 0x10000 - addr;
      const tail = size - head;
      const headBytes = toUint8Array(await Promise.resolve(app.readRange(addr, head)));
      const tailBytes = toUint8Array(await Promise.resolve(app.readRange(0, tail)));
      const out = new Uint8Array(size);
      out.set(headBytes, 0);
      out.set(tailBytes, head);
      return out;
    }
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      out[i] = clamp8(await Promise.resolve(app.readMemory((addr + i) & 0xffff)));
    }
    return out;
  }

  function getOpcodeMeta(opcode) {
    if (!CODE_TABLE) return null;
    return CODE_TABLE[opcode & 0xff] || null;
  }

  function formatOperand(mode, address, bytes) {
    const lo = bytes.length > 1 ? bytes[1] & 0xff : 0;
    const hi = bytes.length > 2 ? bytes[2] & 0xff : 0;
    const word = lo | (hi << 8);
    switch (mode) {
      case "IMM":
        return { text: "#$" + lo.toString(16).toUpperCase().padStart(2, "0") };
      case "ZP":
        return { text: "$" + lo.toString(16).toUpperCase().padStart(2, "0") };
      case "ZPX":
        return { text: "$" + lo.toString(16).toUpperCase().padStart(2, "0") + ",X" };
      case "ZPY":
        return { text: "$" + lo.toString(16).toUpperCase().padStart(2, "0") + ",Y" };
      case "INDX":
        return { text: "($" + lo.toString(16).toUpperCase().padStart(2, "0") + ",X)" };
      case "INDY":
        return { text: "($" + lo.toString(16).toUpperCase().padStart(2, "0") + "),Y" };
      case "ABS":
        return { text: "$" + word.toString(16).toUpperCase().padStart(4, "0") };
      case "ABSX":
        return { text: "$" + word.toString(16).toUpperCase().padStart(4, "0") + ",X" };
      case "ABSY":
        return { text: "$" + word.toString(16).toUpperCase().padStart(4, "0") + ",Y" };
      case "IND":
        return { text: "($" + word.toString(16).toUpperCase().padStart(4, "0") + ")" };
      case "REL": {
        const offset = lo >= 0x80 ? lo - 0x100 : lo;
        const target = (address + 2 + offset) & 0xffff;
        return {
          text: "$" + target.toString(16).toUpperCase().padStart(4, "0"),
          target: target,
        };
      }
      case "ACC":
        return { text: "A" };
      default:
        return { text: "" };
    }
  }

  function decodeInstructionAt(address, readByte) {
    const addr = clamp16(address);
    const opcode = readByte(addr) & 0xff;
    const meta = getOpcodeMeta(opcode);
    const mnemonic = meta ? OPCODE_ID_TO_MNEMONIC[meta.opcodeId | 0] || "???" : "???";
    const mode = meta ? ADDRESS_TYPE_TO_MODE[meta.addressType | 0] || "IMP" : "IMP";
    const size = MODE_SIZE[mode] || 1;
    const bytes = [];
    for (let i = 0; i < size; i++) bytes.push(readByte((addr + i) & 0xffff) & 0xff);
    const operand = formatOperand(mode, addr, bytes);
    const unsupported = mnemonic === "XXX";
    return {
      address: addr,
      opcode: opcode,
      mnemonic: unsupported ? ".BYTE" : mnemonic,
      mode: mode,
      size: size,
      cycles: meta ? meta.cycles & 0xff : 0,
      bytes: bytes,
      operand: operand.text,
      target: operand.target,
      unsupported: unsupported,
      text: unsupported
        ? ".BYTE $" + opcode.toString(16).toUpperCase().padStart(2, "0")
        : mnemonic + (operand.text ? " " + operand.text : ""),
    };
  }

  function findSequenceEndingAt(pc, beforeInstructions, readByte) {
    const limit = Math.max(0, beforeInstructions | 0);
    if (!limit) return [];
    let best = [];
    const searchStart = Math.max(0, (pc | 0) - limit * 3 - 12);
    for (let start = searchStart; start <= (pc | 0); start++) {
      const sequence = [];
      let cursor = start;
      while (cursor < (pc | 0) && sequence.length < limit + 8) {
        const instruction = decodeInstructionAt(cursor, readByte);
        sequence.push(instruction);
        cursor += instruction.size;
        if (cursor === (pc | 0)) {
          if (sequence.length > best.length) best = sequence.slice(0);
          break;
        }
        if (cursor > (pc | 0)) break;
      }
    }
    if (!best.length) return [];
    return best.slice(-limit);
  }

  function serializeInstruction(entry, currentPc, lineLookup) {
    const out = {
      address: clamp16(entry.address),
      opcode: clamp8(entry.opcode),
      mnemonic: String(entry.mnemonic || ""),
      mode: String(entry.mode || ""),
      size: entry.size | 0,
      cycles: entry.cycles | 0,
      bytes: entry.bytes.slice(0),
      operand: String(entry.operand || ""),
      text: String(entry.text || ""),
      current: clamp16(entry.address) === clamp16(currentPc),
      unsupported: !!entry.unsupported,
    };
    if (typeof entry.target === "number") out.target = clamp16(entry.target);
    if (lineLookup) {
      const lineNo = lineLookup(clamp16(entry.address));
      if (lineNo > 0) out.sourceLine = lineNo;
    }
    return out;
  }

  function getLineLookup(record) {
    if (
      !record ||
      !record.ok ||
      !record.result ||
      !record.result.addressLineMap
    ) {
      return null;
    }
    const addressLineMap = record.result.addressLineMap;
    return function (pc) {
      const key = String(clamp16(pc));
      if (Object.prototype.hasOwnProperty.call(addressLineMap, key))
        {return addressLineMap[key] | 0;}
      for (let delta = 1; delta <= 2; delta++) {
        const prevKey = String(clamp16(pc - delta));
        if (Object.prototype.hasOwnProperty.call(addressLineMap, prevKey))
          {return addressLineMap[prevKey] | 0;}
      }
      return 0;
    };
  }

  function normalizeBuildResult(record, options) {
    if (!record) return null;
    const opts = options || {};
    const result = record.result || {};
    const out = {
      ok: !!record.ok,
      format: record.format,
      sourceName: record.sourceName,
      timestamp: record.timestamp,
    };
    if (!record.ok) {
      out.error = result.error || record.error || "";
      out.errors = Array.isArray(result.errors) ? result.errors.slice(0) : [];
      return out;
    }

    const rawBytes = toUint8Array(result.bytes || []);
    out.byteLength = rawBytes.length | 0;
    out.runAddr =
      result.runAddr === null || result.runAddr === undefined
        ? null
        : clamp16(result.runAddr);
    out.symbols = result.symbols || {};
    out.importedSymbols = Array.isArray(result.importedSymbols)
      ? result.importedSymbols.slice(0)
      : [];
    out.globalSymbols = Array.isArray(result.globalSymbols)
      ? result.globalSymbols.slice(0)
      : [];
    out.lineAddressMap = result.lineAddressMap || {};
    out.addressLineMap = result.addressLineMap || {};
    out.lineBytesMap = result.lineBytesMap || {};
    if (result.object) out.object = result.object;
    if (opts.byteEncoding === "base64") out.base64 = bytesToBase64(rawBytes);
    else out.bytes = Array.from(rawBytes);
    return out;
  }

  function normalizeBuildSpec(spec) {
    if (typeof spec === "string") {
      return {
        name: "SOURCE.ASM",
        text: spec,
        format: "xex",
      };
    }
    const raw = spec && typeof spec === "object" ? spec : {};
    return {
      name: String(raw.name || raw.sourceName || "SOURCE.ASM"),
      text: raw.text !== undefined ? String(raw.text) : "",
      format: raw.format === "object" ? "object" : "xex",
      includeResolver: raw.includeResolver,
      byteEncoding: raw.byteEncoding,
      defines: raw.defines,
      preprocessorDefines: raw.preprocessorDefines,
      initialDefines: raw.initialDefines,
      importValues: raw.importValues,
      imports: raw.imports,
      externals: raw.externals,
      deferAsserts: raw.deferAsserts,
    };
  }

  function resolveIncludeFromHostFs(hostFs, includePath) {
    if (!hostFs || typeof hostFs.readFile !== "function") return null;
    const rawPath = String(includePath || "").trim();
    if (!rawPath.length) return null;
    const candidates = [];
    const seen = new Set();

    function addCandidate(name) {
      if (!name) return;
      const normalized =
        typeof hostFs.normalizeName === "function"
          ? hostFs.normalizeName(name)
          : String(name || "").toUpperCase();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push(normalized);
    }

    addCandidate(rawPath);
    const slashNorm = rawPath.replace(/\\/g, "/");
    const lastSlash = slashNorm.lastIndexOf("/");
    if (lastSlash >= 0 && lastSlash + 1 < slashNorm.length) {
      addCandidate(slashNorm.substring(lastSlash + 1));
    }
    const base = slashNorm.substring(lastSlash + 1);
    if (base.indexOf(".") < 0) {
      addCandidate(base + ".INC");
      addCandidate(base + ".ASM");
    }

    for (let i = 0; i < candidates.length; i++) {
      const data = hostFs.readFile(candidates[i]);
      if (data && data.length >= 0) return decodeText(toUint8Array(data));
    }
    return null;
  }

  function buildAssembleOptions(spec, hostFs) {
    const out = {
      sourceName: spec.name || "SOURCE.ASM",
    };
    if (typeof spec.includeResolver === "function") {
      out.includeResolver = spec.includeResolver;
    } else if (hostFs) {
      out.includeResolver = function (includePath) {
        return resolveIncludeFromHostFs(hostFs, includePath);
      };
    }
    if (spec.defines !== undefined) out.defines = spec.defines;
    if (spec.preprocessorDefines !== undefined)
      {out.preprocessorDefines = spec.preprocessorDefines;}
    if (spec.initialDefines !== undefined) out.initialDefines = spec.initialDefines;
    if (spec.importValues !== undefined) out.importValues = spec.importValues;
    if (spec.imports !== undefined) out.imports = spec.imports;
    if (spec.externals !== undefined) out.externals = spec.externals;
    if (spec.deferAsserts !== undefined) out.deferAsserts = !!spec.deferAsserts;
    return out;
  }

  async function getMountedMedia() {
    const app = await getApp();
    const slots = [];
    for (let i = 0; i < 8; i++) {
      let info = null;
      if (typeof app.getMountedDiskForDeviceSlot === "function") {
        info = await Promise.resolve(app.getMountedDiskForDeviceSlot(i));
      }
      if (info) {
        slots.push({
          slot: i,
          mounted: true,
          deviceSlot: typeof info.deviceSlot === "number" ? info.deviceSlot | 0 : i,
          imageIndex:
            typeof info.imageIndex === "number" ? info.imageIndex | 0 : null,
          name: info.name ? String(info.name) : "disk.atr",
          size: typeof info.size === "number" ? info.size | 0 : 0,
          writable: info.writable !== false,
        });
        continue;
      }
      const mounted =
        typeof app.hasMountedDiskForDeviceSlot === "function"
          ? !!app.hasMountedDiskForDeviceSlot(i)
          : false;
      slots.push({
        slot: i,
        mounted: mounted,
      });
    }
    return slots;
  }

  function guessNameFromUrl(url, fallbackName) {
    const fallback = String(fallbackName || "resource.bin");
    const rawUrl = String(url || "");
    if (!rawUrl.length) return fallback;
    try {
      const resolved = new URL(rawUrl, window.location.href);
      const path = resolved.pathname || "";
      const slash = path.lastIndexOf("/");
      const name = slash >= 0 ? path.substring(slash + 1) : path;
      return name || fallback;
    } catch {
      const clean = rawUrl.split(/[?#]/)[0];
      const slash = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
      const name = slash >= 0 ? clean.substring(slash + 1) : clean;
      return name || fallback;
    }
  }

  function cloneTraceEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries.map(function (entry) {
      return entry && typeof entry === "object" ? Object.assign({}, entry) : entry;
    });
  }

  function normalizeConsoleKeyState(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    let register = 0x07;
    if (typeof source.raw === "number") register = source.raw & 0x07;
    else {
      register = 0x07;
      if (source.option) register &= ~0x04;
      if (source.select) register &= ~0x02;
      if (source.start) register &= ~0x01;
    }
    return {
      raw: register & 0x07,
      option: (register & 0x04) === 0,
      select: (register & 0x02) === 0,
      start: (register & 0x01) === 0,
    };
  }

  function normalizeRunConfiguration(config) {
    if (!config || typeof config !== "object") return null;
    return Object.assign({}, config);
  }

  function isTimeoutLikeReason(reason) {
    const value = String(reason || "");
    return (
      value === "timeout" ||
      value === "instructionLimit" ||
      value === "cycleLimit"
    );
  }

  function didReachTargetPc(result, targetPc) {
    if (!result || targetPc === null || targetPc === undefined) return false;
    const normalizedTarget = clamp16(targetPc);
    if (result.debugState && clamp16(result.debugState.pc) === normalizedTarget) {
      return true;
    }
    if (typeof result.stopAddress === "number" && clamp16(result.stopAddress) === normalizedTarget) {
      return true;
    }
    return false;
  }

  function getCurrentDisassemblyInstruction(disassemblyResult) {
    if (
      !disassemblyResult ||
      !Array.isArray(disassemblyResult.instructions) ||
      !disassemblyResult.instructions.length
    ) {
      return null;
    }
    for (let i = 0; i < disassemblyResult.instructions.length; i++) {
      const entry = disassemblyResult.instructions[i];
      if (entry && entry.current) return entry;
    }
    return disassemblyResult.instructions[0] || null;
  }

  function isConsolePollInstruction(disassemblyResult) {
    const current = getCurrentDisassemblyInstruction(disassemblyResult);
    if (!current) return false;
    const text = String(current.text || "");
    const operand = String(current.operand || "");
    return text.indexOf("$D01F") >= 0 || operand.indexOf("$D01F") >= 0;
  }

  function inferFailurePhase(failure, bundle) {
    if (failure && failure.phase) return String(failure.phase);
    const reason =
      failure && failure.reason
        ? String(failure.reason)
        : bundle && bundle.debugState && bundle.debugState.reason
          ? String(bundle.debugState.reason)
          : "";
    if (reason.indexOf("fault_") === 0) return "cpu_fault";
    if (
      reason === "breakpoint" &&
      failure &&
      typeof failure.targetPc === "number" &&
      bundle &&
      bundle.debugState &&
      clamp16(bundle.debugState.pc) !== clamp16(failure.targetPc)
    ) {
      return "breakpoint_mismatch";
    }
    if (reason === "pc") return "entry_pc_reached";
    if (isTimeoutLikeReason(reason)) {
      if (
        bundle &&
        bundle.disassembly &&
        bundle.consoleKeys &&
        !bundle.consoleKeys.option &&
        !bundle.consoleKeys.select &&
        !bundle.consoleKeys.start &&
        isConsolePollInstruction(bundle.disassembly)
      ) {
        return "waiting_for_console_input";
      }
      return "wait_timeout";
    }
    return failure && failure.operation ? String(failure.operation) : "automation_failure";
  }

  function buildFailureDescriptor(options, bundle) {
    const opts = options || {};
    const raw = opts.failure && typeof opts.failure === "object" ? opts.failure : {};
    const out = {
      operation:
        raw.operation !== undefined && raw.operation !== null
          ? String(raw.operation)
          : opts.operation
            ? String(opts.operation)
            : null,
      reason:
        raw.reason !== undefined && raw.reason !== null
          ? String(raw.reason)
          : bundle && bundle.debugState && bundle.debugState.reason
            ? String(bundle.debugState.reason)
            : null,
      message:
        raw.message !== undefined && raw.message !== null ? String(raw.message) : null,
      timedOut: raw.timedOut === true || isTimeoutLikeReason(raw.reason),
      timeoutMs:
        raw.timeoutMs !== undefined && raw.timeoutMs !== null
          ? Math.max(0, raw.timeoutMs | 0)
          : opts.timeoutMs !== undefined && opts.timeoutMs !== null
            ? Math.max(0, opts.timeoutMs | 0)
            : undefined,
      targetPc:
        raw.targetPc !== undefined && raw.targetPc !== null
          ? clamp16(raw.targetPc)
          : opts.targetPc !== undefined && opts.targetPc !== null
            ? clamp16(opts.targetPc)
            : undefined,
    };
    if (raw.error) out.error = serializeAutomationError(raw.error);
    out.phase = inferFailurePhase(out, bundle);
    return out;
  }

  async function buildArtifactBundle(options) {
    const opts = options || {};
    const traceTailLimit = Math.max(1, opts.traceTailLimit | 0 || 32);
    const artifactRequest = {
      ranges: Array.isArray(opts.ranges)
        ? opts.ranges
        : Array.isArray(opts.memoryRanges)
          ? opts.memoryRanges
          : [],
      labels: Array.isArray(opts.labels) ? opts.labels : [],
      traceTailLimit: traceTailLimit,
    };
    const app = await getApp();
    let base = null;
    if (typeof app.collectArtifacts === "function") {
      base = await Promise.resolve(app.collectArtifacts(artifactRequest));
    }
    const debugState =
      base && base.debugState ? cloneDebugState(base.debugState) : await api.getDebugState();
    const pc =
      opts.pc !== undefined && opts.pc !== null
        ? clamp16(opts.pc)
        : debugState
          ? clamp16(debugState.pc)
          : 0;
    let disassemblyResult = null;
    if (opts.disassembly !== false && CODE_TABLE && debugState) {
      try {
        disassemblyResult = await disassemble({
          pc: pc,
          beforeInstructions: Math.max(0, opts.beforeInstructions | 0 || 8),
          afterInstructions: Math.max(0, opts.afterInstructions | 0 || 8),
        });
      } catch {
        disassemblyResult = null;
      }
    }
    let sourceContext = null;
    if (opts.sourceContext !== false) {
      try {
        sourceContext = await getSourceContext({
          pc: pc,
          beforeLines: Math.max(0, opts.beforeLines | 0 || 8),
          afterLines: Math.max(0, opts.afterLines | 0 || 8),
        });
      } catch {
        sourceContext = null;
      }
    }
    let screenshot = null;
    if (opts.screenshot) {
      try {
        screenshot = await api.captureScreenshot({
          encoding: opts.screenshotEncoding === "bytes" ? "bytes" : "base64",
        });
      } catch (err) {
        screenshot = {
          error: serializeAutomationError(err),
        };
      }
    }
    return {
      type: "a8e.artifactBundle",
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
      apiVersion: API_VERSION,
      capturedAt: new Date().toISOString(),
      capturedAtMs: Date.now(),
      operation: opts.operation ? String(opts.operation) : null,
      rendererBackend:
        base && base.rendererBackend ? String(base.rendererBackend) : null,
      capabilities: await getCapabilities(),
      runConfiguration: normalizeRunConfiguration(opts.runConfiguration),
      debugState: debugState,
      counters:
        base && base.counters !== undefined ? base.counters : await api.getCounters(),
      bankState:
        base && base.bankState !== undefined ? base.bankState : await api.getBankState(),
      breakpointHit:
        base && base.breakpointHit !== undefined
          ? base.breakpointHit
          : debugState && typeof debugState.breakpointHit === "number"
            ? debugState.breakpointHit & 0xffff
            : null,
      traceTail:
        base && Array.isArray(base.traceTail)
          ? cloneTraceEntries(base.traceTail)
          : cloneTraceEntries(await api.getTraceTail(traceTailLimit)),
      disassembly: disassemblyResult,
      sourceContext: sourceContext,
      mountedMedia: await getMountedMedia(),
      consoleKeys: await api.getConsoleKeyState(),
      memoryRanges:
        base && Array.isArray(base.memoryRanges)
          ? base.memoryRanges.map(function (entry) {
              return entry && typeof entry === "object"
                ? Object.assign({}, entry)
                : entry;
            })
          : [],
      scenarioMarkers:
        opts.scenarioMarkers && typeof opts.scenarioMarkers === "object"
          ? Object.assign({}, opts.scenarioMarkers)
          : opts.markers && typeof opts.markers === "object"
            ? Object.assign({}, opts.markers)
            : null,
      screenshot: screenshot,
    };
  }

  async function captureFailureState(options) {
    const bundle = await buildArtifactBundle(options || {});
    const failure = buildFailureDescriptor(options || {}, bundle);
    bundle.type = "a8e.failureArtifact";
    bundle.phase = failure.phase;
    bundle.failure = failure;
    return bundle;
  }

  async function getCapabilities() {
    const app = await getApp();
    const hostFs = getCurrentHostFs();
    return {
      apiVersion: API_VERSION,
      artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
      worker:
        typeof app.isWorkerBackend === "function"
          ? !!app.isWorkerBackend()
          : false,
      hostfs: !!hostFs,
      assembler:
        !!window.A8EAssemblerCore &&
        typeof window.A8EAssemblerCore.assembleToXex === "function",
      disk: typeof app.loadDiskToDeviceSlot === "function",
      romLoad:
        typeof app.loadOsRom === "function" &&
        typeof app.loadBasicRom === "function",
      screenshot: typeof app.captureScreenshot === "function",
      artifacts: true,
      trace: typeof app.getTraceTail === "function",
      breakpoints: typeof app.setBreakpoints === "function",
      stepping:
        typeof app.stepInstructionAsync === "function" ||
        typeof app.stepInstruction === "function",
      runUntilPc: typeof app.runUntilPc === "function",
      sourceContext: true,
      disassembly: !!CODE_TABLE,
      joystick: true,
      consoleKeys: true,
      consoleKeyState: typeof app.getConsoleKeyState === "function",
      urlMediaLoad: true,
      failureSnapshots: true,
      progressEvents: true,
      cacheControl: true,
      waitPrimitives: true,
      groupedApi: true,
      events: true,
      faultReporting: true,
      resetPortBOverride: typeof app.reset === "function",
    };
  }

  async function getSystemState() {
    const app = await getApp();
    const hostFs = getCurrentHostFs();
    const mountedMedia = await getMountedMedia();
    const counters = await api.getCounters();
    const debugState = await api.getDebugState();
    return {
      apiVersion: API_VERSION,
      artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
      ready: typeof app.isReady === "function" ? !!app.isReady() : false,
      running: typeof app.isRunning === "function" ? !!app.isRunning() : false,
      worker:
        typeof app.isWorkerBackend === "function"
          ? !!app.isWorkerBackend()
          : false,
      rendererBackend:
        typeof app.getRendererBackend === "function"
          ? app.getRendererBackend()
          : "unknown",
      roms: {
        osLoaded: typeof app.hasOsRom === "function" ? !!app.hasOsRom() : false,
        basicLoaded:
          typeof app.hasBasicRom === "function" ? !!app.hasBasicRom() : false,
      },
      media: {
        deviceSlots: mountedMedia,
      },
      hostfs: {
        available: !!hostFs,
        fileCount:
          hostFs && typeof hostFs.listFiles === "function"
            ? hostFs.listFiles().length | 0
            : 0,
      },
      consoleKeys: await api.getConsoleKeyState(),
      counters: counters,
      debugState: debugState,
      bankState: await api.getBankState(),
      lastBuild: lastBuildRecord ? normalizeBuildResult(lastBuildRecord) : null,
    };
  }

  async function assembleSource(spec) {
    const buildSpec = normalizeBuildSpec(spec);
    if (
      !window.A8EAssemblerCore ||
      typeof window.A8EAssemblerCore.assembleToXex !== "function"
    ) {
      throw new Error("A8EAssemblerCore is unavailable");
    }
    const hostFs = getCurrentHostFs();
    const options = buildAssembleOptions(buildSpec, hostFs);
    const result =
      buildSpec.format === "object" &&
      typeof window.A8EAssemblerCore.assembleToObject === "function"
        ? window.A8EAssemblerCore.assembleToObject(buildSpec.text, options)
        : window.A8EAssemblerCore.assembleToXex(buildSpec.text, options);
    lastBuildRecord = {
      ok: !!(result && result.ok),
      format: buildSpec.format,
      sourceName: options.sourceName,
      sourceText: buildSpec.text,
      sourceLines: buildSpec.text.replace(/\r\n?/g, "\n").split("\n"),
      result: result || null,
      timestamp: Date.now(),
      error: result && result.error ? String(result.error) : "",
    };
    emitEvent("build", {
      build: normalizeBuildResult(lastBuildRecord, {
        byteEncoding: buildSpec.byteEncoding,
      }),
    });
    return normalizeBuildResult(lastBuildRecord, {
      byteEncoding: buildSpec.byteEncoding,
    });
  }

  async function assembleHostFile(name, options) {
    const hostFs = getCurrentHostFs();
    if (!hostFs || typeof hostFs.readFile !== "function") {
      throw new Error("A8EAutomation HostFS is unavailable");
    }
    const normalized =
      typeof hostFs.normalizeName === "function"
        ? hostFs.normalizeName(name)
        : String(name || "").toUpperCase();
    const bytes = hostFs.readFile(normalized);
    if (!bytes) throw new Error("HostFS source file not found: " + normalized);
    const spec = Object.assign({}, options || {}, {
      name: normalized,
      text: decodeText(toUint8Array(bytes)),
    });
    return assembleSource(spec);
  }

  async function runXex(spec) {
    const app = await getApp();
    const hostFs = getCurrentHostFs();
    const raw = spec && typeof spec === "object" ? spec : {};
    const operation = raw.operation ? String(raw.operation) : "runXex";
    const resetOptions = normalizeResetOptions(
      raw.resetOptions && typeof raw.resetOptions === "object"
        ? raw.resetOptions
        : raw,
    );
    let bytes = null;
    let name = raw.name ? String(raw.name) : "PROGRAM.XEX";
    let runAddr = null;

    if (raw.hostFile) {
      if (!hostFs || typeof hostFs.readFile !== "function") {
        throw new Error("A8EAutomation HostFS is unavailable");
      }
      const normalized =
        typeof hostFs.normalizeName === "function"
          ? hostFs.normalizeName(raw.hostFile)
          : String(raw.hostFile || "").toUpperCase();
      bytes = toUint8Array(hostFs.readFile(normalized));
      if (!bytes.length) throw new Error("HostFS file not found: " + normalized);
      name = normalized;
    } else if (raw.build && raw.build.bytes) {
      bytes = toUint8Array(raw.build.bytes);
      if (raw.build.name) name = String(raw.build.name);
      if (raw.build.runAddr !== undefined && raw.build.runAddr !== null) {
        runAddr = clamp16(raw.build.runAddr);
      }
    } else if (raw.bytes || raw.base64 || raw.buffer || raw.data) {
      bytes = toUint8Array(raw);
    } else if (
      lastBuildRecord &&
      lastBuildRecord.ok &&
      lastBuildRecord.result &&
      lastBuildRecord.result.bytes
    ) {
      bytes = toUint8Array(lastBuildRecord.result.bytes);
      if (lastBuildRecord.sourceName) {
        name = lastBuildRecord.sourceName.replace(/\.[^.]+$/, ".XEX");
      }
      if (
        lastBuildRecord.result.runAddr !== undefined &&
        lastBuildRecord.result.runAddr !== null
      ) {
        runAddr = clamp16(lastBuildRecord.result.runAddr);
      }
    }

    if (!bytes || !bytes.length) {
      throw createAutomationError({
        operation: operation,
        phase: "xex_loader_start",
        message: "A8EAutomation.dev.runXex requires XEX bytes or a HostFS file",
      });
    }

    if (raw.saveHostFile && hostFs && typeof hostFs.writeFile === "function") {
      hostFs.writeFile(name, bytes);
    }

    const slotIndex = raw.slot !== undefined ? raw.slot | 0 : 0;
    emitProgress(operation, "media_accepted", {
      name: name,
      slot: slotIndex,
      byteLength: bytes.length | 0,
    });
    try {
      app.loadDiskToDeviceSlot(toArrayBuffer(bytes), name, slotIndex);
    } catch (err) {
      emitProgress(operation, "xex_loader_failed", {
        name: name,
        slot: slotIndex,
      });
      throw createAutomationError({
        operation: operation,
        phase: "xex_loader_start",
        message: "Failed to hand XEX bytes to the loader path",
        details: {
          name: name,
          slot: slotIndex,
        },
        cause: err,
      });
    }
    emitProgress(operation, "loader_installed", {
      name: name,
      slot: slotIndex,
    });
    if (raw.reset !== false && typeof app.reset === "function") {
      try {
        app.reset(resetOptions);
      } catch (err) {
        throw createAutomationError({
          operation: operation,
          phase: "system_reset",
          message: "Failed to reset emulator after installing XEX loader media",
          cause: err,
        });
      }
      emitProgress(operation, "boot_reset", {
        name: name,
        slot: slotIndex,
      });
    }
    let started = false;
    if (raw.start !== false && typeof app.start === "function") {
      try {
        app.start();
        started = true;
      } catch (err) {
        throw createAutomationError({
          operation: operation,
          phase: "xex_loader_start",
          message: "Failed to start emulator after installing XEX loader media",
          cause: err,
        });
      }
      emitProgress(operation, "loader_running", {
        name: name,
        slot: slotIndex,
      });
    }
    notifyStatus();
    return {
        name: name,
        slot: slotIndex,
        byteLength: bytes.length | 0,
        reset: raw.reset !== false,
        started: started,
        resetOptions: resetOptions,
        runAddr: runAddr,
        sourceUrl: raw.sourceUrl ? String(raw.sourceUrl) : null,
      };
  }

  async function mountDiskFromUrl(url, options) {
    const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
    const resource = await fetchBinaryResource(url, Object.assign({}, opts, {
      operation: "mountDiskFromUrl",
    }));
    const name = opts.name ? String(opts.name) : guessNameFromUrl(url, "disk.atr");
    const slotIndex = opts.slot !== undefined ? opts.slot | 0 : 0;
    const result = await api.mountDisk(resource.bytes, {
      name: name,
      slot: slotIndex,
    });
    return Object.assign({}, result, {
      sourceUrl: resource.responseUrl || resource.url,
      byteLength: resource.bytes.length | 0,
      contentType: resource.contentType || "",
    });
  }

  async function runXexFromUrl(url, options) {
    const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
    const resource = await fetchBinaryResource(url, Object.assign({}, opts, {
      operation: "runXexFromUrl",
    }));
    return runXex(Object.assign({}, opts, {
      bytes: resource.bytes,
      name: opts.name ? String(opts.name) : guessNameFromUrl(url, "PROGRAM.XEX"),
      sourceUrl: resource.responseUrl || resource.url,
      operation: "runXexFromUrl",
    }));
  }

  async function getSourceContext(options) {
    const record = lastBuildRecord;
    if (
      !record ||
      !record.ok ||
      !record.result ||
      !record.result.addressLineMap ||
      !record.sourceLines
    ) {
      return null;
    }
    const opts = options || {};
    let pc = opts.pc;
    if (pc === undefined || pc === null) {
      const state = await api.getDebugState();
      if (!state) return null;
      pc = state.pc;
    }
    const lineLookup = getLineLookup(record);
    const lineNo = lineLookup ? lineLookup(clamp16(pc)) : 0;
    if (!lineNo) return null;
    const beforeLines = Math.max(0, opts.beforeLines | 0 || 5);
    const afterLines = Math.max(0, opts.afterLines | 0 || 5);
    const startLine = Math.max(1, lineNo - beforeLines);
    const endLine = Math.min(record.sourceLines.length, lineNo + afterLines);
    const outLines = [];
    for (let line = startLine; line <= endLine; line++) {
      const key = String(line);
      outLines.push({
        lineNo: line,
        text: record.sourceLines[line - 1],
        current: line === lineNo,
        address:
          record.result.lineAddressMap &&
          Object.prototype.hasOwnProperty.call(record.result.lineAddressMap, key)
            ? clamp16(record.result.lineAddressMap[key])
            : undefined,
        bytes:
          record.result.lineBytesMap &&
          Object.prototype.hasOwnProperty.call(record.result.lineBytesMap, key)
            ? record.result.lineBytesMap[key].slice(0)
            : undefined,
      });
    }
    return {
      sourceName: record.sourceName,
      pc: clamp16(pc),
      lineNo: lineNo,
      startLine: startLine,
      endLine: endLine,
      lines: outLines,
    };
  }

  async function disassemble(options) {
    if (!CODE_TABLE) {
      throw new Error("A8EAutomation disassembly requires CPU opcode tables");
    }
    const opts = options || {};
    let pc = opts.pc;
    if (pc === undefined || pc === null) {
      const state = await api.getDebugState();
      if (!state) return null;
      pc = state.pc;
    }
    pc = clamp16(pc);
    const beforeInstructions = Math.max(0, opts.beforeInstructions | 0 || 8);
    const afterInstructions = Math.max(0, opts.afterInstructions | 0 || 8);
    const start = Math.max(0, pc - beforeInstructions * 3 - 16);
    const end = Math.min(0xffff, pc + (afterInstructions + 1) * 3 + 16);
    const bytes = await readRangeBytes(start, end - start + 1);

    function readByte(addr) {
      const index = (addr | 0) - start;
      if (index < 0 || index >= bytes.length) return 0;
      return bytes[index] & 0xff;
    }

    const before = findSequenceEndingAt(pc, beforeInstructions, readByte);
    const current = decodeInstructionAt(pc, readByte);
    const after = [];
    let cursor = (pc + current.size) & 0xffff;
    for (let i = 0; i < afterInstructions && cursor <= end; i++) {
      const next = decodeInstructionAt(cursor, readByte);
      after.push(next);
      cursor += next.size;
    }
    const lineLookup = getLineLookup(lastBuildRecord);
    return {
      pc: pc,
      instructions: before
        .concat([current], after)
        .map(function (entry) {
          return serializeInstruction(entry, pc, lineLookup);
        }),
    };
  }

  async function listHostFiles(pattern) {
    const hostFs = getCurrentHostFs();
    if (!hostFs || typeof hostFs.listFiles !== "function") return [];
    return hostFs.listFiles(pattern).map(function (entry) {
      return {
        name: String(entry.name || ""),
        size: entry.size | 0,
        locked: !!entry.locked,
      };
    });
  }

  async function setHostFile(name, data, options) {
    const hostFs = getCurrentHostFs();
    if (!hostFs || typeof hostFs.writeFile !== "function") {
      throw new Error("A8EAutomation HostFS is unavailable");
    }
    const opts = options || {};
    const normalized =
      typeof hostFs.normalizeName === "function"
        ? hostFs.normalizeName(name)
        : String(name || "").toUpperCase();
    if (!normalized) throw new Error("A8EAutomation HostFS name is invalid");
    const bytes =
      data && typeof data === "object" && data.text !== undefined
        ? encodeText(String(data.text))
        : toUint8Array(data);
    if (!hostFs.writeFile(normalized, bytes)) {
      throw new Error("A8EAutomation failed to write HostFS file: " + normalized);
    }
    if (opts.lock && typeof hostFs.lockFile === "function") hostFs.lockFile(normalized);
    return {
      name: normalized,
      size: bytes.length | 0,
      locked:
        opts.lock && typeof hostFs.getStatus === "function"
          ? !!(hostFs.getStatus(normalized) || {}).locked
          : false,
    };
  }

  async function readHostFile(name, options) {
    const hostFs = getCurrentHostFs();
    if (!hostFs || typeof hostFs.readFile !== "function") {
      throw new Error("A8EAutomation HostFS is unavailable");
    }
    const opts = options || {};
    const normalized =
      typeof hostFs.normalizeName === "function"
        ? hostFs.normalizeName(name)
        : String(name || "").toUpperCase();
    const data = toUint8Array(hostFs.readFile(normalized));
    if (!data.length && !hostFs.fileExists(normalized)) return null;
    if (opts.encoding === "base64") {
      return {
        name: normalized,
        base64: bytesToBase64(data),
        size: data.length | 0,
      };
    }
    if (opts.encoding === "text") {
      return {
        name: normalized,
        text: decodeText(data),
        size: data.length | 0,
      };
    }
    return {
      name: normalized,
      bytes: Array.from(data),
      size: data.length | 0,
    };
  }

  async function waitForHostFsFile(name, options) {
    const hostFs = getCurrentHostFs();
    if (!hostFs || typeof hostFs.fileExists !== "function") {
      throw new Error("A8EAutomation HostFS is unavailable");
    }
    const normalized =
      typeof hostFs.normalizeName === "function"
        ? hostFs.normalizeName(name)
        : String(name || "").toUpperCase();
    if (hostFs.fileExists(normalized)) {
      return {
        type: "hostfs",
        timestamp: Date.now(),
        name: normalized,
      };
    }
    const opts = options || {};
    return waitForEvent(
      "hostfs",
      function () {
        return hostFs.fileExists(normalized);
      },
      opts,
    ).then(function (event) {
      return Object.assign({}, event, { name: normalized });
    });
  }

  const api = {
    apiVersion: API_VERSION,
    artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
    attach: function (opts) {
      currentApp = opts && opts.app ? opts.app : null;
      currentCanvas = opts && opts.canvas ? opts.canvas : null;
      currentFocusCanvas =
        opts && typeof opts.focusCanvas === "function" ? opts.focusCanvas : null;
      currentUpdateStatus =
        opts && typeof opts.updateStatus === "function" ? opts.updateStatus : null;
      lastDebugState = null;
      lastPauseSignature = "";
      bindAppListeners();
      if (currentApp) {
        if (readyResolve) readyResolve(api);
        readyResolve = null;
        readyPromise = Promise.resolve(api);
        emitEvent("attached", {
          worker:
            typeof currentApp.isWorkerBackend === "function"
              ? !!currentApp.isWorkerBackend()
              : false,
        });
      }
      return api;
    },
    detach: function () {
      clearBindings();
      currentApp = null;
      currentCanvas = null;
      currentFocusCanvas = null;
      currentUpdateStatus = null;
      lastDebugState = null;
      lastPauseSignature = "";
      resetReadyPromise();
    },
    whenReady: function () {
      if (currentApp) return Promise.resolve(api);
      return readyPromise;
    },
    getApp: function () {
      return currentApp;
    },
    getCapabilities: getCapabilities,
    getSystemState: getSystemState,
    focusDisplay: function () {
      if (typeof currentFocusCanvas === "function") {
        currentFocusCanvas(true);
        return true;
      }
      if (currentCanvas && typeof currentCanvas.focus === "function") {
        try {
          currentCanvas.focus({ preventScroll: true });
        } catch {
          currentCanvas.focus();
        }
        return true;
      }
      return false;
    },
    loadRom: async function (kind, data) {
      const request = normalizeRomRequest(kind, data);
      const app = await getApp();
      try {
        if (request.kind === "os") app.loadOsRom(request.buffer);
        else app.loadBasicRom(request.buffer);
      } catch (err) {
        throw createAutomationError({
          operation: "loadRom",
          phase: "rom_load",
          message: "Failed to load " + request.kind + " ROM",
          details: {
            kind: request.kind,
          },
          cause: err,
        });
      }
      notifyStatus();
      return {
        kind: request.kind,
        ready: typeof app.isReady === "function" ? !!app.isReady() : true,
      };
    },
    loadOsRom: function (data) {
      return api.loadRom("os", data);
    },
    loadBasicRom: function (data) {
      return api.loadRom("basic", data);
    },
    mountDisk: async function (data, nameOrOpts, slot) {
      const request = normalizeDiskRequest(data, nameOrOpts, slot);
      const app = await getApp();
      emitProgress("mountDisk", "media_accepted", {
        name: request.name,
        slot: request.slot,
      });
      try {
        app.loadDiskToDeviceSlot(request.buffer, request.name, request.slot);
      } catch (err) {
        throw createAutomationError({
          operation: "mountDisk",
          phase: "disk_mount",
          message: "Failed to mount disk image",
          details: {
            name: request.name,
            slot: request.slot,
          },
          cause: err,
        });
      }
      emitProgress("mountDisk", "disk_mounted", {
        name: request.name,
        slot: request.slot,
      });
      notifyStatus();
      return {
        name: request.name,
        slot: request.slot,
      };
    },
    mountDiskFromUrl: mountDiskFromUrl,
    loadDisk: function (data, nameOrOpts, slot) {
      return api.mountDisk(data, nameOrOpts, slot);
    },
    unmountDisk: async function (slot) {
      const app = await getApp();
      if (typeof app.unmountDeviceSlot !== "function") {
        throw new Error("A8EAutomation.unmountDisk is unavailable");
      }
      app.unmountDeviceSlot(slot | 0);
      notifyStatus();
      return {
        slot: slot | 0,
      };
    },
    getMountedMedia: getMountedMedia,
    start: async function () {
      const app = await getApp();
      if (typeof currentFocusCanvas === "function") currentFocusCanvas(false);
      app.start();
      return readAppDebugState(app);
    },
    pause: async function () {
      const app = await getApp();
      app.pause();
      return readAppDebugState(app);
    },
    reset: async function (options) {
      const app = await getApp();
      const opts = options && typeof options === "object" ? options : {};
      const resetOptions = normalizeResetOptions(opts);
      app.reset(resetOptions);
      notifyStatus();
      const state = await readAppDebugState(app);
      if (opts.kind || resetOptions) {
        return {
          requestedKind: opts.kind ? String(opts.kind) : "cold",
          actualKind: "cold",
          resetOptions: resetOptions,
          debugState: state,
        };
      }
      return state;
    },
    boot: async function (options) {
      const opts = options || {};
      if (opts.reset !== false) {
        await api.reset(Object.assign({}, opts, {
          kind: opts.kind || "cold",
        }));
      }
      if (opts.start !== false) await api.start();
      return api.getSystemState();
    },
    reload: async function (options) {
      const targetUrl = buildUrlWithCacheControl(window.location.href, options || {});
      setTimeout(function () {
        window.location.assign(targetUrl);
      }, 0);
      return {
        reloading: true,
        url: targetUrl,
      };
    },
    dispose: async function () {
      const app = await getApp();
      if (typeof app.dispose === "function") app.dispose();
      api.detach();
      return true;
    },
    waitForPause: waitForPause,
    waitForTime: async function (options) {
      const opts = options || {};
      const ms = Math.max(0, opts.ms | 0);
      const clock = opts.clock === "emulated" ? "emulated" : "real";
      if (clock === "real") return waitForRealTime(ms, opts);
      const cycles = Math.max(0, Math.round((ms / 1000) * ATARI_CPU_HZ_PAL));
      const result = await waitForCounterDelta("cycleCounter", cycles, opts);
      result.clock = "emulated";
      result.elapsedMs = ms;
      return result;
    },
    waitForFrames: async function (options) {
      const opts = options || {};
      const frames = Math.max(0, opts.count | 0);
      const result = await waitForCounterDelta(
        "cycleCounter",
        frames * CYCLES_PER_FRAME,
        opts,
      );
      result.frames = frames;
      return result;
    },
    waitForCycles: function (options) {
      const opts = options || {};
      return waitForCounterDelta("cycleCounter", opts.count | 0, opts);
    },
    setBreakpoints: async function (addresses) {
      const app = await getApp();
      const list = Array.isArray(addresses) ? addresses.slice(0) : [];
      const result =
        typeof app.setBreakpoints === "function" ? app.setBreakpoints(list) : 0;
      return typeof result === "number" ? result : list.length;
    },
    stepInstruction: async function () {
      const app = await getApp();
      if (typeof app.stepInstructionAsync === "function") {
        return app.stepInstructionAsync();
      }
      return {
        ok: !!(app.stepInstruction && app.stepInstruction()),
        debugState: await readAppDebugState(app),
        counters: typeof app.getCounters === "function" ? app.getCounters() : null,
        traceTail: typeof app.getTraceTail === "function" ? app.getTraceTail(32) : [],
      };
    },
    stepOver: async function () {
      const app = await getApp();
      if (typeof app.stepOverAsync === "function") {
        return app.stepOverAsync();
      }
      return {
        ok: !!(app.stepOver && app.stepOver()),
        debugState: await readAppDebugState(app),
        counters: typeof app.getCounters === "function" ? app.getCounters() : null,
        traceTail: typeof app.getTraceTail === "function" ? app.getTraceTail(32) : [],
      };
    },
    runUntilPc: async function (targetPc, opts) {
      const app = await getApp();
      if (typeof app.runUntilPc !== "function") {
        throw new Error("A8EAutomation.runUntilPc is unavailable");
      }
      return app.runUntilPc(targetPc, opts || null);
    },
    runUntilPcOrSnapshot: async function (targetPc, opts) {
      const options = opts || {};
      const app = await getApp();
      const normalizedPc = clamp16(targetPc);
      const state = await api.getDebugState();
      emitProgress("runUntilPcOrSnapshot", "wait_started", {
        targetPc: normalizedPc,
      });
      if (state && state.running && options.pauseRunning !== false) {
        await api.pause();
      }
      if (typeof app.runUntilPc !== "function") {
        return buildWaitFailureSnapshot("runUntilPcOrSnapshot", options, {
          reason: "unsupported",
          message: "Paused-mode PC execution is unavailable",
          targetPc: normalizedPc,
        });
      }
      const result = await Promise.resolve(app.runUntilPc(normalizedPc, options || null));
      return finalizeWaitForPcResult(
        normalizedPc,
        result,
        options,
        "runUntilPcOrSnapshot",
      );
    },
    waitForPc: async function (targetPc, options) {
      const app = await getApp();
      const normalizedPc = clamp16(targetPc);
      const state = await api.getDebugState();
      if (state && !state.running && typeof app.runUntilPc === "function") {
        const result = await Promise.resolve(app.runUntilPc(normalizedPc, options || null));
        return finalizeWaitForPcResult(normalizedPc, result, options || {}, "waitForPc");
      }
      return waitForEvent(
        "pause",
        function (event) {
          return !!(
            event &&
            event.debugState &&
            clamp16(event.debugState.pc) === normalizedPc
          );
        },
        Object.assign({}, options || {}, {
          onTimeout: function () {
            return buildWaitFailureSnapshot("waitForPc", options || {}, {
              reason: "timeout",
              message: "PC wait timed out",
              timedOut: true,
              timeoutMs: options && options.timeoutMs ? options.timeoutMs | 0 : 0,
              targetPc: normalizedPc,
            });
          },
        }),
      );
    },
    waitForBreakpoint: function (options) {
      return waitForPause(Object.assign({}, options || {}, { reason: "breakpoint" }));
    },
    getDebugState: async function () {
      const app = await getApp();
      const state = await readAppDebugState(app);
      const cloned = cloneDebugState(state);
      if (cloned) lastDebugState = cloned;
      return cloned;
    },
    getCounters: async function () {
      const app = await getApp();
      if (typeof app.getCounters === "function") return app.getCounters();
      return null;
    },
    getBankState: async function () {
      const app = await getApp();
      if (typeof app.getBankState === "function") return app.getBankState();
      return null;
    },
    getConsoleKeyState: async function () {
      const app = await getApp();
      if (typeof app.getConsoleKeyState === "function") {
        return normalizeConsoleKeyState(await Promise.resolve(app.getConsoleKeyState()));
      }
      return normalizeConsoleKeyState(null);
    },
    getTraceTail: async function (limit) {
      const app = await getApp();
      if (typeof app.getTraceTail === "function") return app.getTraceTail(limit | 0);
      return [];
    },
    readMemory: async function (address) {
      const app = await getApp();
      if (typeof app.readMemory === "function") {
        return (await Promise.resolve(app.readMemory(address | 0))) & 0xff;
      }
      return 0;
    },
    readRange: async function (start, length, options) {
      const bytes = await readRangeBytes(start, length);
      if (options && options.format === "hex") return bytesToHex(bytes);
      return Array.from(bytes);
    },
    getSourceContext: getSourceContext,
    disassemble: disassemble,
    captureScreenshot: async function (options) {
      const app = await getApp();
      if (typeof app.captureScreenshot !== "function") {
        throw new Error("A8EAutomation.captureScreenshot is unavailable");
      }
      const raw = await Promise.resolve(app.captureScreenshot());
      const bytes = toUint8Array(
        raw && raw.bytes !== undefined ? raw.bytes : raw && raw.buffer,
      );
      const encoding = options && options.encoding === "bytes" ? "bytes" : "base64";
      const out = {
        mimeType: raw && raw.mimeType ? String(raw.mimeType) : "image/png",
        width: raw && raw.width ? raw.width | 0 : 0,
        height: raw && raw.height ? raw.height | 0 : 0,
      };
      if (encoding === "bytes") out.bytes = Array.from(bytes);
      else out.base64 = bytesToBase64(bytes);
      return out;
    },
    collectArtifacts: async function (options) {
      return buildArtifactBundle(options || {});
    },
    captureFailureState: async function (options) {
      return captureFailureState(options || {});
    },
    keyDown: async function (eventLike) {
      const app = await getApp();
      const ev = normalizeKeyEvent(eventLike);
      if (typeof app.onKeyDown !== "function") return false;
      return !!app.onKeyDown(ev);
    },
    keyUp: async function (eventLike) {
      const app = await getApp();
      const ev = normalizeKeyEvent(eventLike);
      if (typeof app.onKeyUp !== "function") return false;
      return !!app.onKeyUp(ev);
    },
    tapKey: async function (eventLike, options) {
      const opts = options || {};
      await api.keyDown(eventLike);
      if (opts.holdMs) await sleep(opts.holdMs | 0);
      await api.keyUp(eventLike);
      if (opts.afterMs) await sleep(opts.afterMs | 0);
      return true;
    },
    typeText: async function (text, options) {
      const opts = options || {};
      const interKeyDelayMs = opts.interKeyDelayMs | 0;
      const rawText = String(text || "");
      for (let i = 0; i < rawText.length; i++) {
        const ch = rawText[i];
        await api.tapKey({
          key: ch === "\n" ? "Enter" : ch,
          code: guessCodeFromChar(ch),
          shiftKey: ch.toUpperCase() === ch && ch.toLowerCase() !== ch,
        });
        if (interKeyDelayMs > 0) await sleep(interKeyDelayMs);
      }
      return true;
    },
    setJoystick: async function (state) {
      const next = state && typeof state === "object" ? state : {};
      const operations = [
        ["up", !!next.up, { key: "ArrowUp", code: "ArrowUp", sdlSym: SDLK_UP }],
        ["down", !!next.down, { key: "ArrowDown", code: "ArrowDown", sdlSym: SDLK_DOWN }],
        ["left", !!next.left, { key: "ArrowLeft", code: "ArrowLeft", sdlSym: SDLK_LEFT }],
        ["right", !!next.right, { key: "ArrowRight", code: "ArrowRight", sdlSym: SDLK_RIGHT }],
        ["trigger", !!next.trigger, { key: "Alt", code: "AltLeft", sdlSym: SDLK_TRIGGER_0 }],
      ];
      for (let i = 0; i < operations.length; i++) {
        const entry = operations[i];
        const event = Object.assign(
          { sourceToken: "automation:joystick:" + entry[0] },
          entry[2],
        );
        if (entry[1]) await api.keyDown(event);
        else await api.keyUp(event);
      }
      return {
        up: !!next.up,
        down: !!next.down,
        left: !!next.left,
        right: !!next.right,
        trigger: !!next.trigger,
      };
    },
    setConsoleKeys: async function (state) {
      const next = state && typeof state === "object" ? state : {};
      const operations = [
        ["option", !!next.option, { key: "F2", code: "F2", sdlSym: SDLK_OPTION }],
        ["select", !!next.select, { key: "F3", code: "F3", sdlSym: SDLK_SELECT }],
        ["start", !!next.start, { key: "F4", code: "F4", sdlSym: SDLK_START }],
      ];
      for (let i = 0; i < operations.length; i++) {
        const entry = operations[i];
        const event = Object.assign(
          { sourceToken: "automation:console:" + entry[0] },
          entry[2],
        );
        if (entry[1]) await api.keyDown(event);
        else await api.keyUp(event);
      }
      return api.getConsoleKeyState();
    },
    pressConsoleKey: async function (key, options) {
      const opts = options || {};
      const normalized = String(key || "").toLowerCase();
      if (normalized !== "option" && normalized !== "select" && normalized !== "start") {
        throw createAutomationError({
          operation: "pressConsoleKey",
          phase: "console_input",
          message: "Console key must be 'option', 'select', or 'start'",
        });
      }
      const downState = {};
      downState[normalized] = true;
      await api.setConsoleKeys(downState);
      if (opts.holdMs) await sleep(opts.holdMs | 0);
      if (opts.release !== false) {
        const upState = {};
        upState[normalized] = false;
        await api.setConsoleKeys(upState);
      }
      if (opts.afterMs) await sleep(opts.afterMs | 0);
      return api.getConsoleKeyState();
    },
    releaseAllKeys: async function () {
      const app = await getApp();
      if (typeof app.releaseAllKeys === "function") app.releaseAllKeys();
      return true;
    },
    releaseAllInputs: async function () {
      return api.releaseAllKeys();
    },
    listHostFiles: listHostFiles,
    readHostFile: readHostFile,
    writeHostFile: function (name, data, options) {
      return setHostFile(name, data, options);
    },
    deleteHostFile: async function (name) {
      const hostFs = getCurrentHostFs();
      if (!hostFs || typeof hostFs.deleteFile !== "function") {
        throw new Error("A8EAutomation HostFS is unavailable");
      }
      const normalized =
        typeof hostFs.normalizeName === "function"
          ? hostFs.normalizeName(name)
          : String(name || "").toUpperCase();
      const ok = hostFs.deleteFile(normalized);
      if (!ok) throw new Error("Unable to delete HostFS file: " + normalized);
      return {
        name: normalized,
      };
    },
    renameHostFile: async function (oldName, newName) {
      const hostFs = getCurrentHostFs();
      if (!hostFs || typeof hostFs.renameFile !== "function") {
        throw new Error("A8EAutomation HostFS is unavailable");
      }
      const oldKey =
        typeof hostFs.normalizeName === "function"
          ? hostFs.normalizeName(oldName)
          : String(oldName || "").toUpperCase();
      const newKey =
        typeof hostFs.normalizeName === "function"
          ? hostFs.normalizeName(newName)
          : String(newName || "").toUpperCase();
      const ok = hostFs.renameFile(oldKey, newKey);
      if (!ok) {
        throw new Error("Unable to rename HostFS file: " + oldKey + " -> " + newKey);
      }
      return {
        oldName: oldKey,
        newName: newKey,
      };
    },
    lockHostFile: async function (name) {
      const hostFs = getCurrentHostFs();
      if (!hostFs || typeof hostFs.lockFile !== "function") {
        throw new Error("A8EAutomation HostFS is unavailable");
      }
      const normalized =
        typeof hostFs.normalizeName === "function"
          ? hostFs.normalizeName(name)
          : String(name || "").toUpperCase();
      if (!hostFs.lockFile(normalized)) {
        throw new Error("Unable to lock HostFS file: " + normalized);
      }
      return {
        name: normalized,
        locked: true,
      };
    },
    unlockHostFile: async function (name) {
      const hostFs = getCurrentHostFs();
      if (!hostFs || typeof hostFs.unlockFile !== "function") {
        throw new Error("A8EAutomation HostFS is unavailable");
      }
      const normalized =
        typeof hostFs.normalizeName === "function"
          ? hostFs.normalizeName(name)
          : String(name || "").toUpperCase();
      if (!hostFs.unlockFile(normalized)) {
        throw new Error("Unable to unlock HostFS file: " + normalized);
      }
      return {
        name: normalized,
        locked: false,
      };
    },
    getHostFileStatus: async function (name) {
      const hostFs = getCurrentHostFs();
      if (!hostFs || typeof hostFs.getStatus !== "function") return null;
      const normalized =
        typeof hostFs.normalizeName === "function"
          ? hostFs.normalizeName(name)
          : String(name || "").toUpperCase();
      return hostFs.getStatus(normalized);
    },
    waitForHostFsFile: waitForHostFsFile,
    assembleSource: assembleSource,
    assembleHostFile: assembleHostFile,
    getLastBuildResult: async function (options) {
      if (!lastBuildRecord) return null;
      return normalizeBuildResult(lastBuildRecord, options || {});
    },
    runXexFromUrl: runXexFromUrl,
    runXex: runXex,
    events: {
      subscribe: subscribeEvent,
      unsubscribe: unsubscribeEvent,
    },
  };

  api.system = {
    start: api.start,
    pause: api.pause,
    reset: api.reset,
    boot: api.boot,
    reload: api.reload,
    dispose: api.dispose,
    waitForPause: api.waitForPause,
    waitForTime: api.waitForTime,
    waitForFrames: api.waitForFrames,
    waitForCycles: api.waitForCycles,
    getSystemState: api.getSystemState,
  };

  api.media = {
    loadRom: api.loadRom,
    loadOsRom: api.loadOsRom,
    loadBasicRom: api.loadBasicRom,
    mountDisk: api.mountDisk,
    mountDiskFromUrl: api.mountDiskFromUrl,
    loadDisk: api.loadDisk,
    unmountDisk: api.unmountDisk,
    getMountedMedia: api.getMountedMedia,
  };

  api.input = {
    focusDisplay: api.focusDisplay,
    keyDown: api.keyDown,
    keyUp: api.keyUp,
    tapKey: api.tapKey,
    typeText: api.typeText,
    setJoystick: api.setJoystick,
    getConsoleKeyState: api.getConsoleKeyState,
    setConsoleKeys: api.setConsoleKeys,
    pressConsoleKey: api.pressConsoleKey,
    releaseAllInputs: api.releaseAllInputs,
  };

  api.debug = {
    setBreakpoints: api.setBreakpoints,
    stepInstruction: api.stepInstruction,
    stepOver: api.stepOver,
    runUntilPc: api.runUntilPc,
    runUntilPcOrSnapshot: api.runUntilPcOrSnapshot,
    waitForPc: api.waitForPc,
    waitForBreakpoint: api.waitForBreakpoint,
    getDebugState: api.getDebugState,
    getCounters: api.getCounters,
    getBankState: api.getBankState,
    getConsoleKeyState: api.getConsoleKeyState,
    getTraceTail: api.getTraceTail,
    readMemory: api.readMemory,
    readRange: api.readRange,
    getSourceContext: api.getSourceContext,
    disassemble: api.disassemble,
  };

  api.dev = {
    listHostFiles: api.listHostFiles,
    readHostFile: api.readHostFile,
    writeHostFile: api.writeHostFile,
    deleteHostFile: api.deleteHostFile,
    renameHostFile: api.renameHostFile,
    lockHostFile: api.lockHostFile,
    unlockHostFile: api.unlockHostFile,
    getHostFileStatus: api.getHostFileStatus,
    waitForHostFsFile: api.waitForHostFsFile,
    assembleSource: api.assembleSource,
    assembleHostFile: api.assembleHostFile,
    getLastBuildResult: api.getLastBuildResult,
    runXexFromUrl: api.runXexFromUrl,
    runXex: api.runXex,
  };

  api.artifacts = {
    captureScreenshot: api.captureScreenshot,
    collectArtifacts: api.collectArtifacts,
    captureFailureState: api.captureFailureState,
  };

  window.A8EAutomation = api;
})();
