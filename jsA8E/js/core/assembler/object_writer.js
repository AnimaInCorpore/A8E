(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const ns = root.A8EAssemblerModules || (root.A8EAssemblerModules = {});

  function encodeUtf8(text) {
    const source = String(text || "");
    if (typeof TextEncoder !== "undefined") {
      try {
        return new TextEncoder().encode(source);
      } catch {
        // Fallback below.
      }
    }
    const out = [];
    for (let i = 0; i < source.length; i++) {
      const cp = source.charCodeAt(i);
      if (cp <= 0x7f) {
        out.push(cp);
      } else if (cp <= 0x7ff) {
        out.push(0xc0 | (cp >> 6));
        out.push(0x80 | (cp & 0x3f));
      } else {
        out.push(0xe0 | (cp >> 12));
        out.push(0x80 | ((cp >> 6) & 0x3f));
        out.push(0x80 | (cp & 0x3f));
      }
    }
    return new Uint8Array(out);
  }

  function decodeUtf8(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (typeof TextDecoder !== "undefined") {
      try {
        return new TextDecoder().decode(data);
      } catch {
        // Fallback below.
      }
    }
    let out = "";
    for (let i = 0; i < data.length; i++) out += String.fromCharCode(data[i] & 0xff);
    return out;
  }

  ns.buildXex = function buildXex(segments) {
    let total = 0;
    for (let i = 0; i < segments.length; i++) {
      total += 6 + segments[i].data.length;
    }
    const out = new Uint8Array(total);
    let p = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const start = seg.start & 0xffff;
      const end = start + seg.data.length - 1;
      if (end > 0xffff) {
        throw new Error("Segment out of 16-bit address range.");
      }
      out[p++] = 0xff;
      out[p++] = 0xff;
      out[p++] = start & 0xff;
      out[p++] = (start >> 8) & 0xff;
      out[p++] = end & 0xff;
      out[p++] = (end >> 8) & 0xff;
      out.set(seg.data, p);
      p += seg.data.length;
    }
    return out;
  };

  ns.segmentHasRunAddress = function segmentHasRunAddress(segments) {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const start = seg.start | 0;
      const end = start + seg.data.length - 1;
      if (start <= 0x02e0 && end >= 0x02e1) return true;
    }
    return false;
  };

  ns.buildA8Object = function buildA8Object(payload) {
    const jsonText = JSON.stringify(payload || {});
    const jsonBytes = encodeUtf8(jsonText);
    const out = new Uint8Array(9 + jsonBytes.length);
    out[0] = 0x41; // A
    out[1] = 0x38; // 8
    out[2] = 0x4f; // O
    out[3] = 0x42; // B
    out[4] = 0x01; // format version
    const length = jsonBytes.length >>> 0;
    out[5] = length & 0xff;
    out[6] = (length >> 8) & 0xff;
    out[7] = (length >> 16) & 0xff;
    out[8] = (length >> 24) & 0xff;
    out.set(jsonBytes, 9);
    return out;
  };

  ns.parseA8Object = function parseA8Object(bytes) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (data.length < 9) throw new Error("Invalid A8OBJ payload.");
    if (data[0] !== 0x41 || data[1] !== 0x38 || data[2] !== 0x4f || data[3] !== 0x42) {
      throw new Error("Invalid A8OBJ magic.");
    }
    if (data[4] !== 0x01) {
      throw new Error("Unsupported A8OBJ version: " + (data[4] & 0xff) + ".");
    }
    const length = (data[5] | (data[6] << 8) | (data[7] << 16) | (data[8] << 24)) >>> 0;
    if (9 + length > data.length) {
      throw new Error("Truncated A8OBJ payload.");
    }
    const jsonBytes = data.subarray(9, 9 + length);
    const jsonText = decodeUtf8(jsonBytes);
    let parsed = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      throw new Error("Invalid A8OBJ JSON: " + message);
    }
    return parsed;
  };
})();
