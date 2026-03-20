(function () {
  "use strict";

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

  function parseCycleDuration(value) {
    if (typeof value === "number") return Math.max(0, Math.round(value));
    if (typeof value !== "string") return 0;
    const m = value.trim().match(
      /^([0-9]*\.?[0-9]+)\s*(s|sec|secs|second|seconds|ms|millisecond|milliseconds|us|µs|microsecond|microseconds|frames?|cycles?)?$/i,
    );
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const unit = (m[2] || "").toLowerCase();
    if (!unit || unit === "cycle" || unit === "cycles") return Math.max(0, Math.round(n));
    if (
      unit === "s" ||
      unit === "sec" ||
      unit === "secs" ||
      unit === "second" ||
      unit === "seconds"
    ) {
      return Math.max(0, Math.round(n * ATARI_CPU_HZ_PAL));
    }
    if (unit === "ms" || unit === "millisecond" || unit === "milliseconds") {
      return Math.max(0, Math.round((n * ATARI_CPU_HZ_PAL) / 1000));
    }
    if (
      unit === "us" ||
      unit === "µs" ||
      unit === "microsecond" ||
      unit === "microseconds"
    ) {
      return Math.max(0, Math.round((n * ATARI_CPU_HZ_PAL) / 1000000));
    }
    if (unit === "frame" || unit === "frames") {
      return Math.max(0, Math.round(n * CYCLES_PER_FRAME));
    }
    return 0;
  }

  function parseMs(value) {
    if (typeof value === "number") return Math.max(0, Math.round(value));
    if (typeof value !== "string") return 0;
    const m = value.trim().match(
      /^([0-9]*\.?[0-9]+)\s*(s|sec|secs|second|seconds|ms|millisecond|milliseconds|us|µs|microsecond|microseconds)?$/i,
    );
    if (!m) return 0;
    const n = parseFloat(m[1]);
    const unit = (m[2] || "ms").toLowerCase();
    if (
      unit === "s" ||
      unit === "sec" ||
      unit === "secs" ||
      unit === "second" ||
      unit === "seconds"
    ) {
      return Math.max(0, Math.round(n * 1000));
    }
    if (
      unit === "us" ||
      unit === "µs" ||
      unit === "microsecond" ||
      unit === "microseconds"
    ) {
      return Math.max(0, Math.round(n / 1000));
    }
    return Math.max(0, Math.round(n));
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, Math.max(0, ms | 0));
    });
  }

  function normalizeTimeoutMs(value, fallbackMs) {
    if (value === undefined || value === null) return fallbackMs | 0;
    const timeoutMs = value | 0;
    if (timeoutMs <= 0) return 0;
    return timeoutMs;
  }

  function withTimeout(promise, timeoutMs, onTimeout) {
    const limit = normalizeTimeoutMs(timeoutMs, 0);
    if (limit <= 0) return Promise.resolve(promise);
    return new Promise(function (resolve, reject) {
      let settled = false;
      const timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try {
          reject(onTimeout());
        } catch (err) {
          reject(err);
        }
      }, limit);
      Promise.resolve(promise)
        .then(function (result) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        })
        .catch(function (err) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  function counterDelta(startValue, endValue) {
    return ((endValue >>> 0) - (startValue >>> 0)) >>> 0;
  }

  function didReachTargetPc(result, targetPc) {
    if (!result || targetPc === null || targetPc === undefined) return false;
    const normalizedTarget = clamp16(targetPc);
    if (result.debugState && clamp16(result.debugState.pc) === normalizedTarget) {
      return true;
    }
    if (
      typeof result.stopAddress === "number" &&
      clamp16(result.stopAddress) === normalizedTarget
    ) {
      return true;
    }
    return false;
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
    if (typeof raw.breakpointHit === "number") {
      out.breakpointHit = clamp16(raw.breakpointHit);
    }
    if (typeof raw.stopAddress === "number") {
      out.stopAddress = clamp16(raw.stopAddress);
    }
    if (typeof raw.faultAddress === "number") {
      out.faultAddress = clamp16(raw.faultAddress);
    }
    if (typeof raw.opcode === "number") out.opcode = clamp8(raw.opcode);
    if (raw.faultType) out.faultType = String(raw.faultType);
    if (raw.faultMessage) out.faultMessage = String(raw.faultMessage);
    return out;
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
    return value === "timeout" || value === "instructionLimit" || value === "cycleLimit";
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
      phase:
        raw.phase !== undefined && raw.phase !== null ? String(raw.phase) : null,
      code:
        raw.code !== undefined && raw.code !== null ? String(raw.code) : null,
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

  function cloneMountedMediaState(entries) {
    if (!Array.isArray(entries)) return [];
    return entries.map(function (entry) {
      return entry && typeof entry === "object" ? Object.assign({}, entry) : entry;
    });
  }

  function cloneRange(range) {
    if (!range || typeof range !== "object") return null;
    const out = {
      start: range.start & 0xffff,
      end: range.end & 0xffff,
      length:
        typeof range.length === "number"
          ? Math.max(0, range.length | 0)
          : ((range.end - range.start + 1) | 0),
    };
    if (range.kind) out.kind = String(range.kind);
    if (range.name) out.name = String(range.name);
    if (range.protected) out.protected = true;
    if (range.romBacked) out.romBacked = true;
    return out;
  }

  function cloneXexPreflightReport(report) {
    if (!report || typeof report !== "object") return null;
    return {
      ok: !!report.ok,
      phase: report.phase ? String(report.phase) : null,
      code: report.code ? String(report.code) : null,
      message: report.message ? String(report.message) : null,
      byteLength: report.byteLength >>> 0,
      normalizedByteLength: report.normalizedByteLength >>> 0,
      segmentCount: report.segmentCount >>> 0,
      segments: Array.isArray(report.segments)
        ? report.segments.map(function (segment) {
            return {
              index: segment.index | 0,
              start: segment.start & 0xffff,
              end: segment.end & 0xffff,
              length: segment.length >>> 0,
            };
          })
        : [],
      loaderRange: cloneRange(report.loaderRange),
      bufferAddress:
        typeof report.bufferAddress === "number"
          ? report.bufferAddress & 0xffff
          : null,
      bufferRange: cloneRange(report.bufferRange),
      protectedRegions: Array.isArray(report.protectedRegions)
        ? report.protectedRegions.map(cloneRange).filter(Boolean)
        : [],
      overlaps: Array.isArray(report.overlaps)
        ? report.overlaps.map(function (entry) {
            return {
              segmentIndex: entry.segmentIndex | 0,
              segmentStart: entry.segmentStart & 0xffff,
              segmentEnd: entry.segmentEnd & 0xffff,
              regionKind: String(entry.regionKind || ""),
              regionName: String(entry.regionName || ""),
              regionStart: entry.regionStart & 0xffff,
              regionEnd: entry.regionEnd & 0xffff,
              overlapStart: entry.overlapStart & 0xffff,
              overlapEnd: entry.overlapEnd & 0xffff,
              overlapLength: entry.overlapLength >>> 0,
              protected: !!entry.protected,
              romBacked: !!entry.romBacked,
            };
          })
        : [],
      runAddress:
        typeof report.runAddress === "number" ? report.runAddress & 0xffff : null,
      initAddress:
        typeof report.initAddress === "number" ? report.initAddress & 0xffff : null,
      portB: typeof report.portB === "number" ? report.portB & 0xff : null,
      bankState: report.bankState
        ? {
            portB: report.bankState.portB & 0xff,
            basicEnabled: !!report.bankState.basicEnabled,
            osEnabled: !!report.bankState.osEnabled,
            floatingPointEnabled: !!report.bankState.floatingPointEnabled,
            selfTestEnabled: !!report.bankState.selfTestEnabled,
            basicRomLoaded: !!report.bankState.basicRomLoaded,
            osRomLoaded: !!report.bankState.osRomLoaded,
            floatingPointRomLoaded: !!report.bankState.floatingPointRomLoaded,
            selfTestRomLoaded: !!report.bankState.selfTestRomLoaded,
          }
        : null,
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
      suppressRunAddress: raw.suppressRunAddress,
    };
  }

  function buildXexLaunchSummary(context) {
    return {
      name: String(context.name || "PROGRAM.XEX"),
      slot: context.slot | 0,
      byteLength: context.byteLength >>> 0,
      mountedByteLength: context.mountedByteLength >>> 0,
      reset: context.reset !== false,
      started: !!context.started,
      resetOptions: context.resetOptions || null,
      runAddr:
        typeof context.runAddr === "number" ? clamp16(context.runAddr) : null,
      entryPc:
        typeof context.entryPc === "number" ? clamp16(context.entryPc) : null,
      sourceUrl: context.sourceUrl ? String(context.sourceUrl) : null,
      format: context.format ? String(context.format) : "xex",
    };
  }

  function buildXexRunConfiguration(context, options) {
    const opts = options || {};
    const out = {
      slot: context.slot | 0,
      xexName: String(context.name || "PROGRAM.XEX"),
      byteLength: context.byteLength >>> 0,
      mountedByteLength: context.mountedByteLength >>> 0,
      reset: context.reset !== false,
    };
    if (context.resetOptions) out.resetOptions = context.resetOptions;
    if (typeof context.entryPc === "number") out.targetPc = clamp16(context.entryPc);
    if (typeof context.runAddr === "number") out.runAddr = clamp16(context.runAddr);
    if (typeof opts.maxInstructions === "number") out.maxInstructions = opts.maxInstructions;
    if (typeof opts.maxCycles === "number") out.maxCycles = opts.maxCycles;
    if (opts.detectTightLoop) out.detectTightLoop = true;
    return out;
  }

  function resolveXexEntryPc(raw, runAddr, xexPreflight) {
    if (raw.entryPc !== undefined && raw.entryPc !== null) return clamp16(raw.entryPc);
    if (raw.expectedEntryPc !== undefined && raw.expectedEntryPc !== null) {
      return clamp16(raw.expectedEntryPc);
    }
    if (typeof runAddr === "number") return clamp16(runAddr);
    if (
      xexPreflight &&
      typeof xexPreflight.runAddress === "number" &&
      isFinite(xexPreflight.runAddress)
    ) {
      return clamp16(xexPreflight.runAddress);
    }
    return null;
  }

  function describeXexBootFailure(result, entryPc) {
    const targetPc = typeof entryPc === "number" ? clamp16(entryPc) : null;
    const reason =
      result && result.reason !== undefined && result.reason !== null
        ? String(result.reason)
        : "xex_boot_failed";
    const failure = {
      phase: "xex_boot_failed",
      reason: reason,
      code: "xex_boot_failed",
      message: "XEX boot failed before reaching the entry point",
    };
    if (targetPc !== null) failure.targetPc = targetPc;
    if (result && typeof result.executedInstructions === "number") {
      failure.executedInstructions = result.executedInstructions >>> 0;
    }
    if (result && typeof result.executedCycles === "number") {
      failure.executedCycles = result.executedCycles >>> 0;
    }
    if (result && result.tightLoop) {
      failure.reason = "tight_loop";
      failure.code = "xex_boot_tight_loop";
      failure.message = "XEX boot got stuck in a tight loop before reaching the entry point";
      failure.tightLoop = result.tightLoop;
      return failure;
    }
    if (reason === "instructionLimit" || reason === "cycleLimit") {
      failure.code = "xex_boot_entry_not_reached";
      failure.message = "XEX boot did not reach the entry point before execution limits";
      return failure;
    }
    if (reason === "fault_illegal_opcode" || reason === "fault_execution_error") {
      failure.code = reason === "fault_illegal_opcode"
        ? "xex_boot_fault_illegal_opcode"
        : "xex_boot_fault_execution_error";
      failure.message = "XEX boot stopped on a CPU fault before reaching the entry point";
      return failure;
    }
    if (reason === "breakpoint") {
      failure.code = "xex_boot_breakpoint_mismatch";
      failure.message = "XEX boot stopped at a different breakpoint before reaching the entry point";
      return failure;
    }
    if (reason === "unsupported") {
      failure.code = "xex_boot_unsupported";
      failure.message = "Paused-mode XEX boot execution is unavailable";
      return failure;
    }
    return failure;
  }

  window.A8EAutomationUtil = {
    buildFetchInit: buildFetchInit,
    buildFailureDescriptor: buildFailureDescriptor,
    buildXexLaunchSummary: buildXexLaunchSummary,
    buildXexRunConfiguration: buildXexRunConfiguration,
    buildUrlWithCacheControl: buildUrlWithCacheControl,
    bytesToBase64: bytesToBase64,
    bytesToHex: bytesToHex,
    clamp16: clamp16,
    clamp8: clamp8,
    cloneDebugState: cloneDebugState,
    cloneMountedMediaState: cloneMountedMediaState,
    cloneRange: cloneRange,
    cloneTraceEntries: cloneTraceEntries,
    cloneXexPreflightReport: cloneXexPreflightReport,
    createAutomationError: createAutomationError,
    decodeBase64: decodeBase64,
    decodeText: decodeText,
    encodeText: encodeText,
    describeXexBootFailure: describeXexBootFailure,
    counterDelta: counterDelta,
    didReachTargetPc: didReachTargetPc,
    getObjectTag: getObjectTag,
    getCurrentDisassemblyInstruction: getCurrentDisassemblyInstruction,
    inferFailurePhase: inferFailurePhase,
    isArrayBufferLike: isArrayBufferLike,
    isBinaryView: isBinaryView,
    isDataViewLike: isDataViewLike,
    isConsolePollInstruction: isConsolePollInstruction,
    isTimeoutLikeReason: isTimeoutLikeReason,
    normalizeBuildResult: normalizeBuildResult,
    normalizeBuildSpec: normalizeBuildSpec,
    normalizeConsoleKeyState: normalizeConsoleKeyState,
    normalizeResetOptions: normalizeResetOptions,
    normalizeRunConfiguration: normalizeRunConfiguration,
    normalizeTimeoutMs: normalizeTimeoutMs,
    parseCycleDuration: parseCycleDuration,
    parseMs: parseMs,
    resolveXexEntryPc: resolveXexEntryPc,
    serializeAutomationError: serializeAutomationError,
    sleep: sleep,
    toArrayBuffer: toArrayBuffer,
    toUint8Array: toUint8Array,
    withTimeout: withTimeout,
  };
})();
