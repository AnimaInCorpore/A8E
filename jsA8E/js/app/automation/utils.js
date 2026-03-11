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

  window.A8EAutomationUtil = {
    buildFetchInit: buildFetchInit,
    buildUrlWithCacheControl: buildUrlWithCacheControl,
    bytesToBase64: bytesToBase64,
    bytesToHex: bytesToHex,
    clamp16: clamp16,
    clamp8: clamp8,
    createAutomationError: createAutomationError,
    decodeBase64: decodeBase64,
    decodeText: decodeText,
    encodeText: encodeText,
    getObjectTag: getObjectTag,
    isArrayBufferLike: isArrayBufferLike,
    isBinaryView: isBinaryView,
    isDataViewLike: isDataViewLike,
    normalizeResetOptions: normalizeResetOptions,
    serializeAutomationError: serializeAutomationError,
    toArrayBuffer: toArrayBuffer,
    toUint8Array: toUint8Array,
  };
})();
