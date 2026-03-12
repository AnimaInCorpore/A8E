(function () {
  "use strict";

  const MAGIC_TEXT = "A8ESNP1";
  const FORMAT_VERSION = 1;
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
  const MAGIC_BYTES = (function () {
    const out = new Uint8Array(MAGIC_TEXT.length);
    for (let i = 0; i < MAGIC_TEXT.length; i++) {
      out[i] = MAGIC_TEXT.charCodeAt(i) & 0xff;
    }
    return out;
  })();

  function getObjectTag(value) {
    return OBJECT_TO_STRING.call(value);
  }

  function isArrayBufferLike(value) {
    const tag = getObjectTag(value);
    return tag === "[object ArrayBuffer]" || tag === "[object SharedArrayBuffer]";
  }

  function isBinaryView(value) {
    if (!value) return false;
    if (typeof ArrayBuffer !== "undefined" && typeof ArrayBuffer.isView === "function") {
      return ArrayBuffer.isView(value);
    }
    return TYPED_ARRAY_TAGS.has(getObjectTag(value)) || getObjectTag(value) === "[object DataView]";
  }

  function toUint8Array(data) {
    if (!data) return new Uint8Array(0);
    if (getObjectTag(data) === "[object Uint8Array]") return new Uint8Array(data);
    if (isArrayBufferLike(data)) {
      const src = new Uint8Array(data);
      const out = new Uint8Array(src.length);
      out.set(src);
      return out;
    }
    if (isBinaryView(data)) {
      const src = new Uint8Array(
        data.buffer,
        data.byteOffset | 0,
        data.byteLength | 0,
      );
      const out = new Uint8Array(src.length);
      out.set(src);
      return out;
    }
    if (Array.isArray(data)) return new Uint8Array(data);
    return new Uint8Array(0);
  }

  function encodeText(text) {
    const raw = String(text || "");
    if (typeof TextEncoder !== "undefined") {
      try {
        return new TextEncoder().encode(raw);
      } catch {
        // fallback below
      }
    }
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
    for (let i = 0; i < bytes.length; i++) {
      out += String.fromCharCode(bytes[i] & 0xff);
    }
    return out;
  }

  function writeUint32LE(target, offset, value) {
    const out = target;
    const pos = offset | 0;
    const n = value >>> 0;
    out[pos] = n & 0xff;
    out[pos + 1] = (n >>> 8) & 0xff;
    out[pos + 2] = (n >>> 16) & 0xff;
    out[pos + 3] = (n >>> 24) & 0xff;
  }

  function readUint32LE(source, offset) {
    const pos = offset | 0;
    return (
      (source[pos] & 0xff) |
      ((source[pos + 1] & 0xff) << 8) |
      ((source[pos + 2] & 0xff) << 16) |
      ((source[pos + 3] & 0xff) << 24)
    ) >>> 0;
  }

  function encodeSnapshot(root) {
    const chunks = [];

    function encodeValue(value) {
      if (value === null || value === undefined) return null;
      const valueType = typeof value;
      if (
        valueType === "string" ||
        valueType === "boolean"
      ) {
        return value;
      }
      if (valueType === "number") {
        if (Number.isFinite(value)) return value;
        if (value === Infinity) return { $a8eNumber: "Infinity" };
        if (value === -Infinity) return { $a8eNumber: "-Infinity" };
        return { $a8eNumber: "NaN" };
      }
      if (isArrayBufferLike(value) || isBinaryView(value)) {
        const bytes = toUint8Array(value);
        const index = chunks.length | 0;
        chunks.push(bytes);
        return { $a8eBinary: index };
      }
      if (Array.isArray(value)) {
        return value.map(encodeValue);
      }
      if (valueType === "object") {
        const out = {};
        const keys = Object.keys(value);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          out[key] = encodeValue(value[key]);
        }
        return out;
      }
      throw new Error("A8ESnapshotCodec: unsupported value type");
    }

    const encodedRoot = encodeValue(root);
    const headerBytes = encodeText(
      JSON.stringify({
        formatVersion: FORMAT_VERSION,
        chunkLengths: chunks.map(function (chunk) {
          return chunk.length >>> 0;
        }),
        root: encodedRoot,
      }),
    );
    let totalLength = MAGIC_BYTES.length + 4 + headerBytes.length;
    for (let i = 0; i < chunks.length; i++) {
      totalLength += chunks[i].length;
    }
    const out = new Uint8Array(totalLength);
    let offset = 0;
    out.set(MAGIC_BYTES, offset);
    offset += MAGIC_BYTES.length;
    writeUint32LE(out, offset, headerBytes.length);
    offset += 4;
    out.set(headerBytes, offset);
    offset += headerBytes.length;
    for (let i = 0; i < chunks.length; i++) {
      out.set(chunks[i], offset);
      offset += chunks[i].length;
    }
    return out.buffer;
  }

  function decodeSnapshot(data) {
    const bytes = toUint8Array(data);
    if (bytes.length < MAGIC_BYTES.length + 4) {
      throw new Error("A8ESnapshotCodec: snapshot is truncated");
    }
    for (let i = 0; i < MAGIC_BYTES.length; i++) {
      if (bytes[i] !== MAGIC_BYTES[i]) {
        throw new Error("A8ESnapshotCodec: invalid snapshot header");
      }
    }
    let offset = MAGIC_BYTES.length;
    const headerLength = readUint32LE(bytes, offset);
    offset += 4;
    if (offset + headerLength > bytes.length) {
      throw new Error("A8ESnapshotCodec: snapshot header is truncated");
    }
    const header = JSON.parse(
      decodeText(bytes.subarray(offset, offset + headerLength)),
    );
    offset += headerLength;
    if (!header || header.formatVersion !== FORMAT_VERSION) {
      throw new Error("A8ESnapshotCodec: unsupported snapshot version");
    }
    const lengths = Array.isArray(header.chunkLengths) ? header.chunkLengths : [];
    const chunks = new Array(lengths.length);
    for (let i = 0; i < lengths.length; i++) {
      const chunkLength = Math.max(0, lengths[i] | 0);
      if (offset + chunkLength > bytes.length) {
        throw new Error("A8ESnapshotCodec: snapshot payload is truncated");
      }
      chunks[i] = new Uint8Array(chunkLength);
      chunks[i].set(bytes.subarray(offset, offset + chunkLength));
      offset += chunkLength;
    }
    if (offset !== bytes.length) {
      throw new Error("A8ESnapshotCodec: snapshot has trailing bytes");
    }

    function decodeValue(value) {
      if (value === null || value === undefined) return null;
      if (Array.isArray(value)) return value.map(decodeValue);
      if (typeof value !== "object") return value;
      if (
        Object.prototype.hasOwnProperty.call(value, "$a8eBinary") &&
        typeof value.$a8eBinary === "number"
      ) {
        const index = value.$a8eBinary | 0;
        if (index < 0 || index >= chunks.length) {
          throw new Error("A8ESnapshotCodec: invalid binary reference");
        }
        return chunks[index];
      }
      if (Object.prototype.hasOwnProperty.call(value, "$a8eNumber")) {
        if (value.$a8eNumber === "Infinity") return Infinity;
        if (value.$a8eNumber === "-Infinity") return -Infinity;
        return NaN;
      }
      const out = {};
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        out[key] = decodeValue(value[key]);
      }
      return out;
    }

    return decodeValue(header.root);
  }

  window.A8ESnapshotCodec = {
    encodeSnapshot: encodeSnapshot,
    decodeSnapshot: decodeSnapshot,
    formatVersion: FORMAT_VERSION,
    magic: MAGIC_TEXT,
    toUint8Array: toUint8Array,
  };
})();
