(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const ns = root.A8EAssemblerModules || (root.A8EAssemblerModules = {});

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
})();
