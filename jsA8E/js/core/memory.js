(function () {
  "use strict";

  /* XEX boot loader - same 6502 code as the C implementation.
     See A8E/AtariIo.c for the fully commented assembly listing. */
  const XEX_BOOT_LOADER = [
    /* boot header */
    0x00, 0x03, 0x00, 0x07, 0x07, 0x07, 0x60,
    /* entry: clear RUNAD/INITAD, init state */
    0xA9, 0x00, 0x8D, 0xE0, 0x02, 0x8D, 0xE1, 0x02,
    0x8D, 0xE2, 0x02, 0x8D, 0xE3, 0x02, 0x85, 0x48,
    0xA9, 0x04, 0x85, 0x49, 0xA9, 0x00, 0x85, 0x4A,
    /* parse_header */
    0x20, 0x81, 0x07, 0xC9, 0xFF, 0xD0, 0x4F,
    0x20, 0x81, 0x07, 0xC9, 0xFF, 0xD0, 0x48,
    0x20, 0x81, 0x07, 0x85, 0x43,
    0x20, 0x81, 0x07, 0x85, 0x44,
    0x20, 0x81, 0x07, 0x85, 0x45,
    0x20, 0x81, 0x07, 0x85, 0x46,
    /* copy_loop */
    0x20, 0x81, 0x07, 0xA0, 0x00, 0x91, 0x43,
    0xE6, 0x43, 0xD0, 0x02, 0xE6, 0x44,
    /* check_end */
    0xA5, 0x44, 0xC5, 0x46, 0x90, 0xED, 0xD0, 0x06,
    0xA5, 0x45, 0xC5, 0x43, 0xB0, 0xE5,
    /* check_init: call INITAD if set */
    0xAD, 0xE3, 0x02, 0xF0, 0xBE,
    0xA9, 0x07, 0x48, 0xA9, 0x69, 0x48, 0x6C, 0xE2, 0x02,
    /* return from INIT: clear INITAD, loop */
    0xA9, 0x00, 0x8D, 0xE2, 0x02, 0x8D, 0xE3, 0x02,
    0x4C, 0x1F, 0x07,
    /* run_addr */
    0xAD, 0xE0, 0x02, 0x0D, 0xE1, 0x02, 0xF0, 0x03, 0x6C, 0xE0, 0x02,
    /* done */
    0x60,
    /* get_byte */
    0xA5, 0x48, 0xD0, 0x03, 0x20, 0x92, 0x07,
    0xA6, 0x47, 0xBD, 0x00, 0x06, 0xE6, 0x47, 0xC6, 0x48, 0x60,
    /* read_sector */
    0xA9, 0x31, 0x8D, 0x00, 0x03,
    0xA9, 0x01, 0x8D, 0x01, 0x03,
    0xA9, 0x52, 0x8D, 0x02, 0x03,
    0xA9, 0x40, 0x8D, 0x03, 0x03,
    0xA9, 0x00, 0x8D, 0x04, 0x03,
    0xA9, 0x06, 0x8D, 0x05, 0x03,
    0xA9, 0x07, 0x8D, 0x06, 0x03,
    0xA9, 0x80, 0x8D, 0x08, 0x03,
    0xA9, 0x00, 0x8D, 0x09, 0x03,
    0xA5, 0x49, 0x8D, 0x0A, 0x03,
    0xA5, 0x4A, 0x8D, 0x0B, 0x03,
    0x20, 0x59, 0xE4,
    0xE6, 0x49, 0xD0, 0x02, 0xE6, 0x4A,
    0xA9, 0x00, 0x85, 0x47,
    0xA9, 0x80, 0x85, 0x48,
    0x60
  ];
  const XEX_BOOT_LOADER_BASE = 0x0700;
  const XEX_BOOT_PATCH_GETBYTE_BUF_LO = 0x078b - XEX_BOOT_LOADER_BASE;
  const XEX_BOOT_PATCH_GETBYTE_BUF_HI = 0x078c - XEX_BOOT_LOADER_BASE;
  const XEX_BOOT_PATCH_DBUF_LO = 0x07a7 - XEX_BOOT_LOADER_BASE;
  const XEX_BOOT_PATCH_DBUF_HI = 0x07ac - XEX_BOOT_LOADER_BASE;
  const XEX_BOOT_LOADER_RESERVED_START = 0x0700;
  const XEX_BOOT_LOADER_RESERVED_END = 0x087f;
  const XEX_SEGMENT_MARKER = 0xff;

  const ATR_HEADER_SIZE = 16;
  const ATR_SECTOR_SIZE = 128;
  const ATR_BOOT_SECTOR_COUNT = 3;
  const ATR_BOOT_LOADER_SIZE = ATR_BOOT_SECTOR_COUNT * ATR_SECTOR_SIZE;
  const ATR_DATA_OFFSET = ATR_HEADER_SIZE + ATR_BOOT_LOADER_SIZE;

  function sanitizePortB(value) {
    return value & 0xff;
  }

  const MEMORY_EXPANSION_SPECS = {
    none: {
      key: "none",
      label: "64K",
      enabled: false,
    },
    "130xe-128k": {
      key: "130xe-128k",
      label: "128K (130XE)",
      enabled: true,
      extendedBytes: 0x10000,
      bankBits: [2, 3],
      cpuEnableBit: 4,
      anticEnableBit: 5,
      sharedWindow: false,
      forceBasicOffWhenExpanded: false,
      forceSelfTestOffWhenExpanded: false,
    },
    "rambo-192k": {
      key: "rambo-192k",
      label: "192K (RAMBO)",
      enabled: true,
      extendedBytes: 0x20000,
      bankBits: [2, 3, 6],
      cpuEnableBit: 4,
      anticEnableBit: 4,
      sharedWindow: true,
      forceBasicOffWhenExpanded: false,
      forceSelfTestOffWhenExpanded: false,
    },
    "rambo-320k": {
      key: "rambo-320k",
      label: "320K (RAMBO)",
      enabled: true,
      extendedBytes: 0x40000,
      bankBits: [2, 3, 5, 6],
      cpuEnableBit: 4,
      anticEnableBit: 4,
      sharedWindow: true,
      forceBasicOffWhenExpanded: false,
      forceSelfTestOffWhenExpanded: false,
    },
    "compy-320k": {
      key: "compy-320k",
      label: "320K (COMPY)",
      enabled: true,
      extendedBytes: 0x40000,
      bankBits: [2, 3, 6, 7],
      cpuEnableBit: 4,
      anticEnableBit: 5,
      sharedWindow: false,
      forceBasicOffWhenExpanded: false,
      forceSelfTestOffWhenExpanded: true,
    },
    "rambo-576k": {
      key: "rambo-576k",
      label: "576K (RAMBO)",
      enabled: true,
      extendedBytes: 0x80000,
      bankBits: [1, 2, 3, 5, 6],
      cpuEnableBit: 4,
      anticEnableBit: 4,
      sharedWindow: true,
      forceBasicOffWhenExpanded: true,
      forceSelfTestOffWhenExpanded: false,
    },
    "compy-576k": {
      key: "compy-576k",
      label: "576K (COMPY)",
      enabled: true,
      extendedBytes: 0x80000,
      bankBits: [1, 2, 3, 6, 7],
      cpuEnableBit: 4,
      anticEnableBit: 5,
      sharedWindow: false,
      forceBasicOffWhenExpanded: true,
      forceSelfTestOffWhenExpanded: true,
    },
    "rambo-1088k": {
      key: "rambo-1088k",
      label: "1088K (RAMBO)",
      enabled: true,
      extendedBytes: 0x100000,
      bankBits: [1, 2, 3, 5, 6, 7],
      cpuEnableBit: 4,
      anticEnableBit: 4,
      sharedWindow: true,
      forceBasicOffWhenExpanded: true,
      forceSelfTestOffWhenExpanded: true,
    },
    "ultimate1mb": {
      key: "ultimate1mb",
      label: "Ultimate1MB (1MB)",
      enabled: true,
      extendedBytes: 0x100000,
      // U1MB defaults to its 1088K-compatible memory configuration.
      bankBits: [1, 2, 3, 5, 6, 7],
      cpuEnableBit: 4,
      anticEnableBit: 4,
      sharedWindow: true,
      forceBasicOffWhenExpanded: true,
      forceSelfTestOffWhenExpanded: true,
      ultimate1mb: true,
    },
  };

  function normalizeMemoryExpansionProfile(value) {
    if (value === undefined || value === null) return "none";
    const text = String(value).trim().toLowerCase();
    if (
      text === "" ||
      text === "none" ||
      text === "64k" ||
      text === "64kb" ||
      text === "no-expansion"
    ) {
      return "none";
    }
    if (
      text === "130xe" ||
      text === "128k" ||
      text === "128kb" ||
      text === "130xe-128k"
    ) {
      return "130xe-128k";
    }
    if (text === "192k" || text === "192kb" || text === "rambo-192k") {
      return "rambo-192k";
    }
    if (text === "320k" || text === "320kb" || text === "rambo-320k") {
      return "rambo-320k";
    }
    if (text === "compy-320k" || text === "320k-compy") {
      return "compy-320k";
    }
    if (text === "576k" || text === "576kb" || text === "rambo-576k") {
      return "rambo-576k";
    }
    if (text === "compy-576k" || text === "576k-compy") {
      return "compy-576k";
    }
    if (text === "1088k" || text === "1088kb" || text === "rambo-1088k") {
      return "rambo-1088k";
    }
    if (text === "ultimate1mb" || text === "ultimate-1mb" || text === "1mb" || text === "1088k-u1mb") {
      return "ultimate1mb";
    }
    return null;
  }

  function getMemoryExpansionSpec(profileKey) {
    const key = normalizeMemoryExpansionProfile(profileKey);
    return MEMORY_EXPANSION_SPECS[key] || MEMORY_EXPANSION_SPECS.none;
  }

  function createMemoryExpansionState(profileKey) {
    const spec = getMemoryExpansionSpec(profileKey);
    const state = {
      profile: spec.key,
      label: spec.label,
      enabled: !!spec.enabled,
      extendedBytes: spec.extendedBytes | 0,
      bankBits: new Uint8Array(spec.bankBits || []),
      bankCount: spec.bankBits ? 1 << spec.bankBits.length : 0,
      cpuEnableBit: spec.cpuEnableBit | 0,
      anticEnableBit: spec.anticEnableBit | 0,
      sharedWindow: !!spec.sharedWindow,
      forceBasicOffWhenExpanded: !!spec.forceBasicOffWhenExpanded,
      forceSelfTestOffWhenExpanded: !!spec.forceSelfTestOffWhenExpanded,
      ultimate1mb: !!spec.ultimate1mb,
      ultimateUctl: spec.ultimate1mb ? 0x03 : 0,
      ultimateUaux: 0,
      ultimateColdReset: spec.ultimate1mb ? 0x80 : 0,
      ultimateConfigLocked: false,
      bankStorage: new Uint8Array(spec.extendedBytes || 0),
      mainWindowShadow: new Uint8Array(0x4000),
      currentBank: 0,
      cpuWindowEnabled: false,
      anticWindowEnabled: false,
      basicEnabled: false,
      selfTestEnabled: false,
      initialized: false,
    };
    return state;
  }

  function cloneMemoryExpansionState(state) {
    const source = state && typeof state === "object" ? state : null;
    if (!source) return createMemoryExpansionState("none");
    return {
      profile: normalizeMemoryExpansionProfile(source.profile),
      label: source.label ? String(source.label) : getMemoryExpansionSpec(source.profile).label,
      enabled: !!source.enabled,
      extendedBytes: source.extendedBytes | 0,
      bankBits: new Uint8Array(source.bankBits || 0),
      bankCount: source.bankCount | 0,
      cpuEnableBit: source.cpuEnableBit | 0,
      anticEnableBit: source.anticEnableBit | 0,
      sharedWindow: !!source.sharedWindow,
      forceBasicOffWhenExpanded: !!source.forceBasicOffWhenExpanded,
      forceSelfTestOffWhenExpanded: !!source.forceSelfTestOffWhenExpanded,
      ultimate1mb: !!source.ultimate1mb,
      ultimateUctl: source.ultimateUctl & 0xff,
      ultimateUaux: source.ultimateUaux & 0xff,
      ultimateColdReset: source.ultimateColdReset & 0x80,
      ultimateConfigLocked: !!source.ultimateConfigLocked,
      bankStorage: new Uint8Array(source.bankStorage || 0),
      mainWindowShadow: new Uint8Array(source.mainWindowShadow || 0),
      currentBank: source.currentBank | 0,
      cpuWindowEnabled: !!source.cpuWindowEnabled,
      anticWindowEnabled: !!source.anticWindowEnabled,
      basicEnabled: !!source.basicEnabled,
      selfTestEnabled: !!source.selfTestEnabled,
      initialized: !!source.initialized,
    };
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

  function makeXexError(report, name) {
    const err = new Error(
      (report && report.message ? String(report.message) : "XEX preflight failed") +
        (name ? ": " + String(name) : ""),
    );
    err.code = report && report.code ? String(report.code) : "xex_preflight_failed";
    err.phase = "xex_preflight_failed";
    err.details = {
      name: name ? String(name) : "",
      xexPreflight: cloneXexPreflightReport(report),
    };
    return err;
  }

  function skipXexSegmentMarkers(bytes, startIndex) {
    let i = startIndex | 0;
    while (
      i + 1 < bytes.length &&
      bytes[i] === XEX_SEGMENT_MARKER &&
      bytes[i + 1] === XEX_SEGMENT_MARKER
    ) {
      i += 2;
    }
    return i;
  }

  function isXexFile(name) {
    if (!name) return false;
    const dot = name.lastIndexOf(".");
    if (dot < 0) return false;
    const ext = name.substring(dot).toLowerCase();
    return ext === ".xex";
  }

  function normalizeXex(xexBytes) {
    let i = 0;
    let total = 0;
    let foundSegment = false;

    while (i < xexBytes.length) {
      i = skipXexSegmentMarkers(xexBytes, i);

      if (i >= xexBytes.length) break;
      if (i + 3 >= xexBytes.length) {
        return {
          ok: false,
          code: "xex_truncated_header",
          message: "XEX segment header is truncated",
        };
      }

      const start = (xexBytes[i] & 0xff) | ((xexBytes[i + 1] & 0xff) << 8);
      const end = (xexBytes[i + 2] & 0xff) | ((xexBytes[i + 3] & 0xff) << 8);
      if (end < start) {
        return {
          ok: false,
          code: "xex_invalid_segment_range",
          message: "XEX segment end address precedes the start address",
        };
      }

      const segmentSize = end - start + 1;
      i += 4;
      if (i + segmentSize > xexBytes.length) {
        return {
          ok: false,
          code: "xex_truncated_segment",
          message: "XEX segment data is truncated",
        };
      }

      total += 6 + segmentSize;
      i += segmentSize;
      foundSegment = true;
    }

    if (!foundSegment) {
      return {
        ok: false,
        code: "xex_no_segments",
        message: "XEX file does not contain any loadable segments",
      };
    }

    const normalized = new Uint8Array(total);
    const segments = [];
    const vectorBytes = Object.create(null);
    let out = 0;
    i = 0;

    while (i < xexBytes.length) {
      i = skipXexSegmentMarkers(xexBytes, i);

      if (i >= xexBytes.length) break;
      if (i + 3 >= xexBytes.length) {
        return {
          ok: false,
          code: "xex_truncated_header",
          message: "XEX segment header is truncated",
        };
      }

      const startLo = xexBytes[i] & 0xff;
      const startHi = xexBytes[i + 1] & 0xff;
      const endLo = xexBytes[i + 2] & 0xff;
      const endHi = xexBytes[i + 3] & 0xff;
      const start2 = startLo | (startHi << 8);
      const end2 = endLo | (endHi << 8);
      if (end2 < start2) {
        return {
          ok: false,
          code: "xex_invalid_segment_range",
          message: "XEX segment end address precedes the start address",
        };
      }

      const segmentSize2 = end2 - start2 + 1;
      i += 4;
      if (i + segmentSize2 > xexBytes.length) {
        return {
          ok: false,
          code: "xex_truncated_segment",
          message: "XEX segment data is truncated",
        };
      }

      normalized[out++] = XEX_SEGMENT_MARKER;
      normalized[out++] = XEX_SEGMENT_MARKER;
      normalized[out++] = startLo;
      normalized[out++] = startHi;
      normalized[out++] = endLo;
      normalized[out++] = endHi;
      normalized.set(xexBytes.subarray(i, i + segmentSize2), out);
      segments.push({
        index: segments.length | 0,
        start: start2,
        end: end2,
        length: segmentSize2,
        data: xexBytes.slice(i, i + segmentSize2),
      });
      for (let offset = 0; offset < segmentSize2; offset++) {
        const addr = (start2 + offset) & 0xffff;
        if (addr >= 0x02e0 && addr <= 0x02e3) {
          vectorBytes[addr] = xexBytes[i + offset] & 0xff;
        }
      }
      out += segmentSize2;
      i += segmentSize2;
    }

    if (out !== normalized.length) {
      return {
        ok: false,
        code: "xex_normalization_failed",
        message: "XEX normalization produced an unexpected byte count",
      };
    }

    return {
      ok: true,
      normalizedXex: normalized,
      segments: segments,
      runAddress:
        vectorBytes[0x02e0] !== undefined && vectorBytes[0x02e1] !== undefined
          ? (vectorBytes[0x02e0] & 0xff) | ((vectorBytes[0x02e1] & 0xff) << 8)
          : null,
      initAddress:
        vectorBytes[0x02e2] !== undefined && vectorBytes[0x02e3] !== undefined
          ? (vectorBytes[0x02e2] & 0xff) | ((vectorBytes[0x02e3] & 0xff) << 8)
          : null,
    };
  }

  function xexSegmentOverlapsRange(normalizedXex, rangeStart, rangeEnd) {
    let i = 0;

    while (i + 5 < normalizedXex.length) {
      if (
        normalizedXex[i] !== XEX_SEGMENT_MARKER ||
        normalizedXex[i + 1] !== XEX_SEGMENT_MARKER
      )
        {return true;}

      const start = (normalizedXex[i + 2] & 0xff) | ((normalizedXex[i + 3] & 0xff) << 8);
      const end = (normalizedXex[i + 4] & 0xff) | ((normalizedXex[i + 5] & 0xff) << 8);
      if (end < start) return true;
      const segmentSize = end - start + 1;

      if (!(end < rangeStart || start > rangeEnd)) return true;
      if (i + 6 + segmentSize > normalizedXex.length) return true;

      i += 6 + segmentSize;
    }

    return false;
  }

  function chooseXexBootBuffer(normalizedXex) {
    let candidate;

    if (!xexSegmentOverlapsRange(normalizedXex, 0x0600, 0x067f)) return 0x0600;

    for (candidate = 0x0880; candidate <= 0x4f80; candidate += 0x80) {
      if (!xexSegmentOverlapsRange(normalizedXex, candidate, candidate + 0x7f))
        {return candidate;}
    }

    for (candidate = 0x5800; candidate <= 0x9f80; candidate += 0x80) {
      if (!xexSegmentOverlapsRange(normalizedXex, candidate, candidate + 0x7f))
        {return candidate;}
    }

    return -1;
  }

  function buildXexBootLoader(bufferAddr) {
    const loader = XEX_BOOT_LOADER.slice();
    loader[XEX_BOOT_PATCH_GETBYTE_BUF_LO] = bufferAddr & 0xff;
    loader[XEX_BOOT_PATCH_GETBYTE_BUF_HI] = (bufferAddr >> 8) & 0xff;
    loader[XEX_BOOT_PATCH_DBUF_LO] = bufferAddr & 0xff;
    loader[XEX_BOOT_PATCH_DBUF_HI] = (bufferAddr >> 8) & 0xff;
    return loader;
  }

  function createPredictedBankState(mediaState, portB) {
    const effectivePortB = sanitizePortB(portB | 0);
    return {
      portB: effectivePortB,
      basicEnabled: (effectivePortB & 0x02) === 0,
      osEnabled: (effectivePortB & 0x01) !== 0,
      floatingPointEnabled: (effectivePortB & 0x01) !== 0,
      selfTestEnabled: (effectivePortB & 0x80) === 0,
      basicRomLoaded: !!mediaState.basicRomLoaded,
      osRomLoaded: !!mediaState.osRomLoaded,
      floatingPointRomLoaded: !!mediaState.floatingPointRomLoaded,
      selfTestRomLoaded: !!mediaState.selfTestRomLoaded,
    };
  }

  function getProtectedXexRegions(mediaState, portB) {
    const bankState = createPredictedBankState(mediaState, portB | 0);
    const regions = [
      {
        kind: "boot_loader_reserved",
        name: "XEX boot loader",
        start: XEX_BOOT_LOADER_RESERVED_START,
        end: XEX_BOOT_LOADER_RESERVED_END,
        length: XEX_BOOT_LOADER_RESERVED_END - XEX_BOOT_LOADER_RESERVED_START + 1,
        protected: true,
      },
    ];
    if (bankState.selfTestEnabled && bankState.selfTestRomLoaded) {
      regions.push({
        kind: "self_test_rom",
        name: "Self-test ROM",
        start: 0x5000,
        end: 0x57ff,
        length: 0x0800,
        romBacked: true,
      });
    }
    if (bankState.basicEnabled && bankState.basicRomLoaded) {
      regions.push({
        kind: "basic_rom",
        name: "BASIC ROM",
        start: 0xa000,
        end: 0xbfff,
        length: 0x2000,
        romBacked: true,
      });
    }
    if (bankState.osEnabled && bankState.osRomLoaded) {
      regions.push({
        kind: "os_rom",
        name: "OS ROM",
        start: 0xc000,
        end: 0xcfff,
        length: 0x1000,
        romBacked: true,
      });
    }
    if (bankState.floatingPointEnabled && bankState.floatingPointRomLoaded) {
      regions.push({
        kind: "floating_point_rom",
        name: "Floating-point ROM",
        start: 0xd800,
        end: 0xffff,
        length: 0x2800,
        romBacked: true,
      });
    }
    return {
      portB: bankState.portB,
      bankState: bankState,
      regions: regions,
    };
  }

  function getBlockedXexWriteRegion(mediaState, portB, address) {
    const addr = address & 0xffff;
    const effectivePortB = sanitizePortB(portB | 0);

    if (
      addr >= XEX_BOOT_LOADER_RESERVED_START &&
      addr <= XEX_BOOT_LOADER_RESERVED_END
    ) {
      return {
        kind: "boot_loader_reserved",
        name: "XEX boot loader",
        start: XEX_BOOT_LOADER_RESERVED_START,
        end: XEX_BOOT_LOADER_RESERVED_END,
        length:
          XEX_BOOT_LOADER_RESERVED_END - XEX_BOOT_LOADER_RESERVED_START + 1,
        protected: true,
      };
    }

    if (
      addr >= 0x5000 &&
      addr <= 0x57ff &&
      (effectivePortB & 0x80) === 0 &&
      mediaState.selfTestRomLoaded
    ) {
      return {
        kind: "self_test_rom",
        name: "Self-test ROM",
        start: 0x5000,
        end: 0x57ff,
        length: 0x0800,
        romBacked: true,
      };
    }

    if (
      addr >= 0xa000 &&
      addr <= 0xbfff &&
      (effectivePortB & 0x02) === 0 &&
      mediaState.basicRomLoaded
    ) {
      return {
        kind: "basic_rom",
        name: "BASIC ROM",
        start: 0xa000,
        end: 0xbfff,
        length: 0x2000,
        romBacked: true,
      };
    }

    if (
      addr >= 0xc000 &&
      addr <= 0xcfff &&
      (effectivePortB & 0x01) !== 0 &&
      mediaState.osRomLoaded
    ) {
      return {
        kind: "os_rom",
        name: "OS ROM",
        start: 0xc000,
        end: 0xcfff,
        length: 0x1000,
        romBacked: true,
      };
    }

    if (
      addr >= 0xd800 &&
      addr <= 0xffff &&
      (effectivePortB & 0x01) !== 0 &&
      mediaState.floatingPointRomLoaded
    ) {
      return {
        kind: "floating_point_rom",
        name: "Floating-point ROM",
        start: 0xd800,
        end: 0xffff,
        length: 0x2800,
        romBacked: true,
      };
    }

    return null;
  }

  // Trace loaded INIT code for STA $D301 preceded by LDA #imm.
  // Uses only bytes already loaded so future segments cannot affect preflight.
  // Returns the immediate value (future portB) if found, or null if not determinable.
  function tracePortBFromInitCode(loadedRam, loadedMask, initAddr) {
    if (typeof initAddr !== "number" || initAddr <= 0 || initAddr > 0xffff) return null;
    if (!loadedRam || !loadedMask) return null;

    const scanLimit = 256;
    for (let k = 0; k < scanLimit; k++) {
      const pc = (initAddr + k) & 0xffff;
      const pc1 = (pc + 1) & 0xffff;
      const pc2 = (pc + 2) & 0xffff;
      if (!loadedMask[pc] || !loadedMask[pc1] || !loadedMask[pc2]) return null;
      if (
        loadedRam[pc] === 0x8d &&
        loadedRam[pc1] === 0x01 &&
        loadedRam[pc2] === 0xd3
      ) {
        // STA $D301 stores register A, so only LDA #imm is a valid source.
        for (let back = 1; back <= 16; back++) {
          const prev = (pc - back) & 0xffff;
          const prev1 = (prev + 1) & 0xffff;
          if (!loadedMask[prev] || !loadedMask[prev1]) continue;
          if (loadedRam[prev] === 0xa9) {
            return loadedRam[prev1] & 0xff;
          }
        }
        return null;
      }
    }
    return null;
  }

  function collectBlockedXexWrites(segments, mediaState, initialPortB) {
    const overlaps = [];
    let currentPortB = sanitizePortB(initialPortB | 0);
    let currentInitAddrLo = 0;
    let currentInitAddrHi = 0;
    const loadedRam = new Uint8Array(0x10000);
    const loadedMask = new Uint8Array(0x10000);

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const bytes = segment && segment.data instanceof Uint8Array ? segment.data : null;
      let activeOverlap = null;
      let initAddrChanged = false;

      for (let offset = 0; offset < segment.length; offset++) {
        const addr = (segment.start + offset) & 0xffff;
        const region = getBlockedXexWriteRegion(mediaState, currentPortB, addr);

        if (region) {
          if (
            activeOverlap &&
            activeOverlap.regionKind === String(region.kind || "") &&
            activeOverlap.overlapEnd + 1 === addr
          ) {
            activeOverlap.overlapEnd = addr;
            activeOverlap.overlapLength =
              ((activeOverlap.overlapEnd - activeOverlap.overlapStart + 1) | 0) >>> 0;
          } else {
            activeOverlap = {
              segmentIndex: segment.index | 0,
              segmentStart: segment.start & 0xffff,
              segmentEnd: segment.end & 0xffff,
              regionKind: String(region.kind || ""),
              regionName: String(region.name || ""),
              regionStart: region.start & 0xffff,
              regionEnd: region.end & 0xffff,
              overlapStart: addr & 0xffff,
              overlapEnd: addr & 0xffff,
              overlapLength: 1,
              protected: !!region.protected,
              romBacked: !!region.romBacked,
            };
            overlaps.push(activeOverlap);
          }
        } else {
          activeOverlap = null;
        }

        if (addr === 0xd301 && bytes && offset < bytes.length) {
          currentPortB = sanitizePortB(bytes[offset] | 0);
        }
        if (bytes && offset < bytes.length) {
          loadedRam[addr] = bytes[offset] & 0xff;
          loadedMask[addr] = 1;
        }
        if (addr === 0x02e2 && bytes && offset < bytes.length) {
          currentInitAddrLo = bytes[offset] & 0xff;
          initAddrChanged = true;
        }
        if (addr === 0x02e3 && bytes && offset < bytes.length) {
          currentInitAddrHi = bytes[offset] & 0xff;
          initAddrChanged = true;
        }
      }

      // Simulate INITAD call after the segment loads, as the XEX boot loader does.
      // This allows INIT code (e.g., disabling BASIC via STA $D301) to affect
      // portB for subsequent segment overlap checks.
      if (initAddrChanged) {
        const initAddr = (currentInitAddrLo & 0xff) | ((currentInitAddrHi & 0xff) << 8);
        if (initAddr > 0) {
          const newPortB = tracePortBFromInitCode(loadedRam, loadedMask, initAddr);
          if (newPortB !== null) currentPortB = sanitizePortB(newPortB);
        }
        // Boot loader clears INITAD after calling it.
        currentInitAddrLo = 0;
        currentInitAddrHi = 0;
      }
    }

    return overlaps;
  }

  function preflightXex(xexBytes, options) {
    const opts = options || {};
    const normalized = normalizeXex(xexBytes);
    const portBInfo = getProtectedXexRegions(
      opts.mediaState || {},
      opts.portB !== undefined && opts.portB !== null ? opts.portB : 0xff,
    );
    const report = {
      ok: false,
      phase: "xex_preflight_failed",
      code: "",
      message: "",
      byteLength: xexBytes.length | 0,
      normalizedByteLength: 0,
      segmentCount: 0,
      segments: [],
      loaderRange: {
        start: XEX_BOOT_LOADER_RESERVED_START,
        end: XEX_BOOT_LOADER_RESERVED_END,
        length: XEX_BOOT_LOADER_RESERVED_END - XEX_BOOT_LOADER_RESERVED_START + 1,
      },
      bufferAddress: null,
      bufferRange: null,
      protectedRegions: portBInfo.regions.map(cloneRange),
      overlaps: [],
      runAddress: null,
      initAddress: null,
      portB: portBInfo.portB & 0xff,
      bankState: portBInfo.bankState,
    };

    if (!normalized.ok) {
      report.code = normalized.code;
      report.message = normalized.message;
      return report;
    }

    report.normalizedByteLength = normalized.normalizedXex.length | 0;
    report.segmentCount = normalized.segments.length | 0;
    report.segments = normalized.segments.map(function (segment) {
      return {
        index: segment.index | 0,
        start: segment.start & 0xffff,
        end: segment.end & 0xffff,
        length: segment.length >>> 0,
      };
    });
    report.runAddress =
      typeof normalized.runAddress === "number" ? normalized.runAddress & 0xffff : null;
    report.initAddress =
      typeof normalized.initAddress === "number" ? normalized.initAddress & 0xffff : null;
    report.overlaps = collectBlockedXexWrites(
      normalized.segments,
      opts.mediaState || {},
      portBInfo.portB,
    );
    if (report.overlaps.length) {
      const firstOverlap = report.overlaps[0];
      report.code =
        firstOverlap.regionKind === "boot_loader_reserved"
          ? "xex_loader_overlap"
          : "xex_protected_memory_overlap";
      report.message =
        "XEX segment $" +
        firstOverlap.segmentStart.toString(16).toUpperCase().padStart(4, "0") +
        "-$" +
        firstOverlap.segmentEnd.toString(16).toUpperCase().padStart(4, "0") +
        " overlaps " +
        firstOverlap.regionName;
      return report;
    }

    const bufferAddress = chooseXexBootBuffer(normalized.normalizedXex);
    if (bufferAddress < 0) {
      report.code = "xex_boot_buffer_unavailable";
      report.message = "XEX boot loader could not reserve a safe boot buffer";
      return report;
    }

    report.ok = true;
    report.phase = "xex_preflight_passed";
    report.code = "xex_preflight_passed";
    report.message = "XEX preflight passed";
    report.bufferAddress = bufferAddress & 0xffff;
    report.bufferRange = {
      start: bufferAddress & 0xffff,
      end: (bufferAddress + 0x7f) & 0xffff,
      length: 0x80,
    };
    report.normalizedXex = normalized.normalizedXex;
    return report;
  }

  function xexToAtr(preflight) {
    if (!preflight || !preflight.ok || !(preflight.normalizedXex instanceof Uint8Array))
      {return null;}
    const normalizedXex = preflight.normalizedXex;
    const bootLoader = buildXexBootLoader(preflight.bufferAddress | 0);

    const normalizedSize = normalizedXex.length;
    const dataSectors = ((normalizedSize + (ATR_SECTOR_SIZE - 1)) / ATR_SECTOR_SIZE) | 0;
    const totalSize = ATR_HEADER_SIZE + ATR_BOOT_LOADER_SIZE + dataSectors * ATR_SECTOR_SIZE;
    const paragraphs = ((totalSize - ATR_HEADER_SIZE) / 16) | 0;
    const atr = new Uint8Array(totalSize);

    // ATR header
    atr[0] = 0x96;
    atr[1] = 0x02;
    atr[2] = paragraphs & 0xff;
    atr[3] = (paragraphs >> 8) & 0xff;
    atr[4] = ATR_SECTOR_SIZE; // sector size 128
    atr[5] = 0x00;
    atr[6] = (paragraphs >> 16) & 0xff;
    atr[7] = (paragraphs >> 24) & 0xff;

    // Boot loader into sectors 1-3.
    for (let i = 0; i < bootLoader.length; i++) {
      atr[ATR_HEADER_SIZE + i] = bootLoader[i];
    }

    // XEX data into sectors 4+.
    atr.set(normalizedXex, ATR_DATA_OFFSET);

    return atr;
  }

  function createApi(cfg) {
    const CPU = cfg.CPU;
    const CYCLE_NEVER = cfg.CYCLE_NEVER;
    const IO_PORTB = cfg.IO_PORTB;
    const DEFAULT_PORTB =
      typeof cfg.DEFAULT_PORTB === "number" ? sanitizePortB(cfg.DEFAULT_PORTB) : 0xff;
    const DEVICE_SLOT_COUNT = 8;
    const NO_IMAGE_MOUNTED = -1;

    function createRuntime(opts) {
      const machine = opts.machine;
      const video = opts.video;
      const ioCycleTimedEvent = opts.ioCycleTimedEvent;
      const makeIoData = opts.makeIoData;
      const cycleTimedEventUpdate = opts.cycleTimedEventUpdate;
      const initHardwareDefaults = opts.initHardwareDefaults;
      const installIoHandlers = opts.installIoHandlers;
      const ioAccess = opts.ioAccess;
      const getOptionOnStart = opts.getOptionOnStart;
      const getSioTurbo = opts.getSioTurbo;
      const getTurbo = opts.getTurbo;
      const pokeyAudioResetState = opts.pokeyAudioResetState;
      const pokeyAudioSetTurbo = opts.pokeyAudioSetTurbo;
      const diskMediaChangeObserver =
        typeof opts.onDiskMediaChanged === "function"
          ? opts.onDiskMediaChanged
          : null;
      const diskActivityObserver =
        typeof opts.onDiskActivity === "function" ? opts.onDiskActivity : null;
      let memoryWriteHook = null;
      machine.memoryExpansion = createMemoryExpansionState(
        opts && opts.memoryExpansion !== undefined ? opts.memoryExpansion : "none",
      );
      applyUltimate1mbMemoryMode(machine.memoryExpansion);

      function makeDefaultDeviceSlots() {
        const slots = new Int16Array(DEVICE_SLOT_COUNT);
        for (let i = 0; i < DEVICE_SLOT_COUNT; i++) slots[i] = NO_IMAGE_MOUNTED;
        return slots;
      }

      function normalizeDeviceSlotIndex(deviceSlotIndex) {
        const deviceSlot = deviceSlotIndex | 0;
        if (deviceSlot < 0 || deviceSlot >= DEVICE_SLOT_COUNT) {
          throw new Error("Device slot out of range: " + deviceSlot);
        }
        return deviceSlot;
      }

      function clearLegacyDisk1Fields(target) {
        if (!target) return;
        delete target.disk1;
        delete target.disk1Size;
        delete target.disk1Name;
      }

      function migrateLegacyDisk1(source, media) {
        if (!source || !source.disk1 || !source.disk1.length) return false;
        if (media.diskImages.length > 0) return false;
        const legacyBytes = source.disk1;
        const image = createDiskImage(legacyBytes, source.disk1Name || "disk.atr");
        const legacySize = source.disk1Size | 0;
        if (legacySize > 0 && legacySize <= legacyBytes.length)
          {image.size = legacySize;}
        const imageIndex = media.diskImages.length | 0;
        media.diskImages.push(image);
        if ((media.deviceSlots[0] | 0) === NO_IMAGE_MOUNTED) {
          media.deviceSlots[0] = imageIndex;
        }
        return true;
      }

      function getMediaState() {
        const media = machine.media || (machine.media = {});
        if (
          !(media.deviceSlots instanceof Int16Array) ||
          media.deviceSlots.length !== DEVICE_SLOT_COUNT
        )
          {media.deviceSlots = makeDefaultDeviceSlots();}
        if (!Array.isArray(media.diskImages)) media.diskImages = [];

        // One-time compatibility migration from legacy disk1 fields.
        let migrated = migrateLegacyDisk1(media, media);
        if (
          !migrated &&
          machine.ctx &&
          machine.ctx.ioData &&
          machine.ctx.ioData !== media
        ) {
          migrated = migrateLegacyDisk1(machine.ctx.ioData, media);
        }
        // Always drop legacy fields after optional migration to avoid stale state.
        clearLegacyDisk1Fields(media);
        if (machine.ctx && machine.ctx.ioData)
          {clearLegacyDisk1Fields(machine.ctx.ioData);}
        return media;
      }

      function getDiskImageByIndex(imageIndex) {
        const media = getMediaState();
        const idx = imageIndex | 0;
        if (idx < 0 || idx >= media.diskImages.length) return null;
        const image = media.diskImages[idx];
        if (!image || !image.bytes) return null;
        return image;
      }

      function isValidImageIndex(imageIndex) {
        if (imageIndex === null || imageIndex === undefined) return false;
        return !!getDiskImageByIndex(imageIndex);
      }

      function storeDiskImage(media, bytes, name, preferredIndex, options) {
        const image = createDiskImage(bytes, name || "disk.atr", options || null);
        if (isValidImageIndex(preferredIndex)) {
          const preferred = preferredIndex | 0;
          media.diskImages[preferred] = image;
          return preferred;
        }
        const imageIndex = media.diskImages.length | 0;
        media.diskImages.push(image);
        return imageIndex;
      }

      function copyMediaToIoData() {
        const io = machine.ctx.ioData;
        const media = getMediaState();
        io.deviceSlots = media.deviceSlots;
        io.diskImages = media.diskImages;
        io.basicRom = media.basicRom;
        io.osRom = media.osRom;
        io.selfTestRom = media.selfTestRom;
        io.floatingPointRom = media.floatingPointRom;
        io.memoryExpansion = machine.memoryExpansion;
        io.diskMediaChangeObserver = diskMediaChangeObserver;
        io.diskActivityObserver = diskActivityObserver;
      }

      function getMemoryExpansionState() {
        return machine.memoryExpansion || createMemoryExpansionState("none");
      }

      // U1MB UCTL memory modes follow the AHRM UCTL D1:D0 definitions.
      function applyUltimate1mbMemoryMode(state) {
        const mem = state;
        if (!mem || !mem.ultimate1mb) return;
        const mode = mem.ultimateUctl & 0x03;
        const modes = [
          { bits: [], cpu: -1, antic: -1, shared: true, basic: false, selfTest: false },
          { bits: [2, 3, 5, 6], cpu: 4, antic: 4, shared: true, basic: false, selfTest: false },
          // AHRM: U1MB ROM enables follow PORTB bit changes only while the
          // CPU window is disabled in the 576K/1088K modes. They must not be
          // forcibly cleared merely because the extended window is active.
          { bits: [1, 2, 3, 6, 7], cpu: 4, antic: 5, shared: false, basic: false, selfTest: false },
          { bits: [1, 2, 3, 5, 6, 7], cpu: 4, antic: 4, shared: true, basic: false, selfTest: false },
        ][mode];
        mem.enabled = mode !== 0;
        mem.bankBits = new Uint8Array(modes.bits);
        mem.bankCount = modes.bits.length ? 1 << modes.bits.length : 0;
        mem.cpuEnableBit = modes.cpu;
        mem.anticEnableBit = modes.antic;
        mem.sharedWindow = modes.shared;
        mem.forceBasicOffWhenExpanded = modes.basic;
        mem.forceSelfTestOffWhenExpanded = modes.selfTest;
      }

      function getPortBMemoryBankIndex(portB, state) {
        const mem = state || getMemoryExpansionState();
        const bits = mem.bankBits || new Uint8Array(0);
        if (!mem.enabled || !bits.length) return 0;
        let bank = 0;
        for (let i = 0; i < bits.length; i++) {
          if (portB & (1 << (bits[i] | 0))) bank |= 1 << i;
        }
        if (mem.bankCount > 0) bank &= mem.bankCount - 1;
        return bank >>> 0;
      }

      function getMemoryWindowEnabled(portB, state, isAntic) {
        const mem = state || getMemoryExpansionState();
        if (!mem.enabled) return false;
        const bit = isAntic && !mem.sharedWindow ? mem.anticEnableBit : mem.cpuEnableBit;
        if (bit < 0) return false;
        return (portB & (1 << bit)) === 0;
      }

      function getMemoryStorageOffset(bankIndex, state) {
        const mem = state || getMemoryExpansionState();
        if (!mem.enabled || !mem.bankStorage || mem.bankCount <= 0) return -1;
        const bank = bankIndex | 0;
        if (bank < 0 || bank >= mem.bankCount) return -1;
        return bank << 14;
      }

      function copyWindowFromStorage(ctx, state, bankIndex) {
        const mem = state || getMemoryExpansionState();
        const offset = getMemoryStorageOffset(bankIndex, mem);
        if (offset < 0) return false;
        ctx.ram.set(mem.bankStorage.subarray(offset, offset + 0x4000), 0x4000);
        return true;
      }

      function storeWindowToStorage(ctx, state, bankIndex) {
        const mem = state || getMemoryExpansionState();
        const offset = getMemoryStorageOffset(bankIndex, mem);
        if (offset < 0) return false;
        mem.bankStorage.set(ctx.ram.subarray(0x4000, 0x8000), offset);
        return true;
      }

      function syncMemoryExpansionWindow(ctx, oldPortB, newPortB) {
        const mem = getMemoryExpansionState();
        if (!mem.enabled) {
          // U1MB mode 00 disables the extended window and exposes motherboard RAM.
          if (mem.initialized && mem.cpuWindowEnabled) {
            const oldBank = getPortBMemoryBankIndex(oldPortB, mem);
            storeWindowToStorage(ctx, mem, oldBank);
            ctx.ram.set(mem.mainWindowShadow.subarray(0, 0x4000), 0x4000);
          }
          mem.cpuWindowEnabled = false;
          mem.anticWindowEnabled = false;
          mem.currentBank = 0;
          mem.initialized = true;
          return;
        }

        const oldCpuEnabled = getMemoryWindowEnabled(oldPortB, mem, false);
        const nextCpuEnabled = getMemoryWindowEnabled(newPortB, mem, false);
        const nextAnticEnabled = getMemoryWindowEnabled(newPortB, mem, true);
        const oldBank = getPortBMemoryBankIndex(oldPortB, mem);
        const nextBank = getPortBMemoryBankIndex(newPortB, mem);
        const reuseBasicBit = (mem.bankBits || []).indexOf(1) >= 0;
        const reuseSelfTestBit = (mem.bankBits || []).indexOf(7) >= 0;

        if (!mem.initialized) {
          mem.mainWindowShadow.set(ctx.ram.subarray(0x4000, 0x8000), 0);
          mem.currentBank = nextBank;
          mem.cpuWindowEnabled = nextCpuEnabled;
          mem.anticWindowEnabled = nextAnticEnabled;
          mem.basicEnabled =
            (newPortB & 0x02) === 0 &&
            !(mem.forceBasicOffWhenExpanded && (mem.bankBits || []).indexOf(1) >= 0 && nextCpuEnabled);
          mem.selfTestEnabled =
            (newPortB & 0x80) === 0 &&
            !(mem.forceSelfTestOffWhenExpanded && (mem.bankBits || []).indexOf(7) >= 0 && nextCpuEnabled);
          if (nextCpuEnabled) {
            copyWindowFromStorage(ctx, mem, nextBank);
          }
          mem.initialized = true;
          return;
        }

        if (oldCpuEnabled && !nextCpuEnabled) {
          storeWindowToStorage(ctx, mem, oldBank);
          ctx.ram.set(mem.mainWindowShadow.subarray(0, 0x4000), 0x4000);
        } else if (!oldCpuEnabled && nextCpuEnabled) {
          mem.mainWindowShadow.set(ctx.ram.subarray(0x4000, 0x8000), 0);
          mem.currentBank = nextBank;
          copyWindowFromStorage(ctx, mem, nextBank);
        } else if (oldCpuEnabled && nextCpuEnabled && oldBank !== nextBank) {
          storeWindowToStorage(ctx, mem, oldBank);
          mem.currentBank = nextBank;
          copyWindowFromStorage(ctx, mem, nextBank);
        }

        mem.cpuWindowEnabled = nextCpuEnabled;
        mem.anticWindowEnabled = nextAnticEnabled;
        mem.currentBank = nextBank;

        if (!reuseBasicBit || !nextCpuEnabled) {
          mem.basicEnabled = (newPortB & 0x02) === 0;
        }
        if (!reuseSelfTestBit || !nextCpuEnabled) {
          mem.selfTestEnabled = (newPortB & 0x80) === 0;
        }
        if (nextCpuEnabled && mem.forceBasicOffWhenExpanded && reuseBasicBit) {
          mem.basicEnabled = false;
        }
        if (nextCpuEnabled && mem.forceSelfTestOffWhenExpanded && reuseSelfTestBit) {
          mem.selfTestEnabled = false;
        }
      }

      function readExpansionMemoryByte(ctx, address, isAnticRead) {
        const addr = address & 0xffff;
        const mem = getMemoryExpansionState();
        if (!mem.enabled || addr < 0x4000 || addr > 0x7fff) {
          return ctx.ram[addr] & 0xff;
        }
        if (!isAnticRead) {
          return ctx.ram[addr] & 0xff;
        }

        const anticEnabled = mem.sharedWindow
          ? mem.cpuWindowEnabled
          : mem.anticWindowEnabled;
        if (!anticEnabled) {
          // AHRM 2.7: 130XE/COMPY CPU and ANTIC windows are independent.
          // When only the CPU window is active, ctx.ram holds the selected
          // extended bank, while ANTIC must still see motherboard RAM.
          if (mem.cpuWindowEnabled && !mem.sharedWindow) {
            return mem.mainWindowShadow[addr - 0x4000] & 0xff;
          }
          return ctx.ram[addr] & 0xff;
        }

        // With a shared window, or with both 130XE windows enabled, ctx.ram
        // is the live selected bank and therefore includes CPU writes that
        // have not yet been committed to bankStorage.
        if (mem.cpuWindowEnabled) return ctx.ram[addr] & 0xff;

        const bank = getPortBMemoryBankIndex(ctx.sram[IO_PORTB] & 0xff, mem);
        const offset = getMemoryStorageOffset(bank, mem);
        if (offset < 0) return ctx.ram[addr] & 0xff;
        return mem.bankStorage[offset + (addr - 0x4000)] & 0xff;
      }

      function reconfigureUltimate1mb(ctx) {
        const mem = getMemoryExpansionState();
        if (!mem.ultimate1mb) return;
        if (mem.initialized && mem.cpuWindowEnabled) {
          storeWindowToStorage(ctx, mem, mem.currentBank);
          ctx.ram.set(mem.mainWindowShadow.subarray(0, 0x4000), 0x4000);
        }
        mem.cpuWindowEnabled = false;
        mem.anticWindowEnabled = false;
        mem.currentBank = 0;
        mem.initialized = false;
        applyUltimate1mbMemoryMode(mem);
        syncMemoryExpansionWindow(ctx, ctx.sram[IO_PORTB] & 0xff, ctx.sram[IO_PORTB] & 0xff);
      }

      // Initial U1MB register model. BIOS/flash/RTC/PBI behavior remains separate.
      function ultimate1mbRead(ctx, address) {
        const mem = getMemoryExpansionState();
        if (!mem.ultimate1mb) return null;
        const addr = address & 0xffff;
        if (addr === 0xd383) return mem.ultimateColdReset & 0x80;
        if (addr >= 0xd380 && addr <= 0xd3ff) return 0xff;
        return null;
      }

      function ultimate1mbWrite(ctx, address, value) {
        const mem = getMemoryExpansionState();
        if (!mem.ultimate1mb) return false;
        const addr = address & 0xffff;
        const v = value & 0xff;
        if (addr < 0xd380 || addr > 0xd3ff) return false;
        if (!mem.ultimateConfigLocked) {
          if (addr === 0xd380) {
            mem.ultimateUctl = v;
            reconfigureUltimate1mb(ctx);
          } else if (addr === 0xd381) {
            mem.ultimateUaux = v;
          } else if (addr === 0xd383) {
            mem.ultimateColdReset = v & 0x80;
          }
          if (addr === 0xd380 && (v & 0x80)) mem.ultimateConfigLocked = true;
        }
        return true;
      }

      function setMemoryExpansion(profileKey) {
        const previous = machine.memoryExpansion;
        // The CPU window may currently contain an expanded bank. Restore the
        // motherboard RAM hidden underneath before replacing the profile;
        // otherwise the next profile can mistake that bank for base RAM.
        if (
          previous &&
          previous.enabled &&
          previous.initialized &&
          previous.cpuWindowEnabled &&
          previous.mainWindowShadow &&
          previous.mainWindowShadow.length >= 0x4000
        ) {
          machine.ctx.ram.set(previous.mainWindowShadow.subarray(0, 0x4000), 0x4000);
        }
        machine.memoryExpansion = createMemoryExpansionState(profileKey);
        applyUltimate1mbMemoryMode(machine.memoryExpansion);
        if (machine.ctx && machine.ctx.ioData) {
          machine.ctx.ioData.memoryExpansion = machine.memoryExpansion;
        }
        return machine.memoryExpansion;
      }

      function createDiskImage(bytes, name, options) {
        const image = {
          id: Date.now() + ":" + Math.random().toString(16).slice(2),
          name: name || "disk.atr",
          bytes: bytes,
          size: bytes.length | 0,
          writable: true,
        };
        if (options && options.diskLibraryId) {
          image.libraryId = String(options.diskLibraryId);
        }
        return image;
      }

      function getMediaStateForXex() {
        const media = getMediaState();
        return {
          basicRomLoaded: !!media.basicRom,
          osRomLoaded: !!media.osRom,
          floatingPointRomLoaded: !!media.floatingPointRom,
          selfTestRomLoaded: !!media.selfTestRom,
        };
      }

      function normalizeXexPortBOverride(options) {
        const optionOnStart = !!getOptionOnStart();
        if (!options || typeof options !== "object") {
          return optionOnStart
            ? sanitizePortB(DEFAULT_PORTB | 0x02)
            : DEFAULT_PORTB;
        }
        if (options.portB !== undefined && options.portB !== null) {
          return sanitizePortB(options.portB | 0);
        }
        if (
          options.resetOptions &&
          typeof options.resetOptions === "object" &&
          options.resetOptions.portB !== undefined &&
          options.resetOptions.portB !== null
        ) {
          return sanitizePortB(options.resetOptions.portB | 0);
        }
        return optionOnStart
          ? sanitizePortB(DEFAULT_PORTB | 0x02)
          : DEFAULT_PORTB;
      }

      function prepareDiskBytesForMount(bytes, name, options) {
        const result = {
          format: isXexFile(name) ? "xex" : "atr",
          sourceByteLength: bytes.length | 0,
          mountedByteLength: bytes.length | 0,
          bytes: bytes,
          xexPreflight: null,
        };
        if (!isXexFile(name)) return result;
        const preflight = preflightXex(bytes, {
          mediaState: getMediaStateForXex(),
          portB: normalizeXexPortBOverride(options),
        });
        result.xexPreflight = cloneXexPreflightReport(preflight);
        if (!preflight.ok) throw makeXexError(preflight, name || "");
        const converted = xexToAtr(preflight);
        if (!converted) throw makeXexError(preflight, name || "");
        result.bytes = converted;
        result.mountedByteLength = converted.length | 0;
        return result;
      }

      function loadDiskToDeviceSlotDetailed(
        arrayBuffer,
        name,
        deviceSlotIndex,
        options,
      ) {
        const media = getMediaState();
        const deviceSlot = normalizeDeviceSlotIndex(deviceSlotIndex);
        const deviceImageIndex = media.deviceSlots[deviceSlot] | 0;
        const preferredImageIndex = isValidImageIndex(deviceImageIndex)
          ? deviceImageIndex
          : NO_IMAGE_MOUNTED;
        const prepared = prepareDiskBytesForMount(
          new Uint8Array(arrayBuffer),
          name,
          options || null,
        );
        const imageIndex = storeDiskImage(
          media,
          prepared.bytes,
          name,
          preferredImageIndex,
          options || null,
        );
        media.deviceSlots[deviceSlot] = imageIndex;
        copyMediaToIoData();
        return {
          imageIndex: imageIndex,
          deviceSlot: deviceSlot,
          format: prepared.format,
          sourceByteLength: prepared.sourceByteLength | 0,
          mountedByteLength: prepared.mountedByteLength | 0,
          xexPreflight: prepared.xexPreflight,
        };
      }

      function setupMemoryMap() {
        const ctx = machine.ctx;
        const ram = ctx.ram;
        const sram = ctx.sram;
        const io = ctx.ioData;
        const portB = sram[IO_PORTB] & 0xff;
        const mem = getMemoryExpansionState();
        const basicEnabled = mem.enabled ? !!mem.basicEnabled : (portB & 0x02) === 0;
        const selfTestEnabled = mem.enabled ? !!mem.selfTestEnabled : (portB & 0x80) === 0;

        function traceCopy(startAddr, source) {
          if (!ctx || typeof ctx.memoryWriteHook !== "function") return;
          const bytes = source instanceof Uint8Array ? source : new Uint8Array(source || 0);
          for (let i = 0; i < bytes.length; i++) {
            const addr = (startAddr + i) & 0xffff;
            try {
              ctx.memoryWriteHook(
                addr,
                bytes[i] & 0xff,
                ctx.cycleCounter >>> 0,
                ctx.instructionCounter >>> 0,
                ctx.currentInstructionPc & 0xffff,
                ctx.currentOpcode & 0xff,
                ctx,
              );
            } catch {
              // ignore hook errors
            }
          }
        }

        // Mirror the C setup: I/O is ROM-mapped and overridden per-register.
        CPU.setRom(ctx, 0xd000, 0xd7ff);

        // BASIC: bit1=0 => enabled (ROM), bit1=1 => disabled (RAM)
        if (!basicEnabled) {
          const basicRamVisible = sram.subarray(0xa000, 0xc000);
          ram.set(basicRamVisible, 0xa000);
          traceCopy(0xa000, basicRamVisible);
          CPU.setRam(ctx, 0xa000, 0xbfff);
        } else {
          CPU.setRom(ctx, 0xa000, 0xbfff);
          if (io.basicRom) {
            ram.set(io.basicRom, 0xa000);
            traceCopy(0xa000, io.basicRom);
          }
        }

        // OS/FP ROM: bit0=1 => enabled (ROM), bit0=0 => disabled (RAM)
        if (portB & 0x01) {
          CPU.setRom(ctx, 0xc000, 0xcfff);
          if (io.osRom) {
            ram.set(io.osRom, 0xc000);
            traceCopy(0xc000, io.osRom);
          }
          CPU.setRom(ctx, 0xd800, 0xffff);
          if (io.floatingPointRom) {
            ram.set(io.floatingPointRom, 0xd800);
            traceCopy(0xd800, io.floatingPointRom);
          }
        } else {
          const osRamVisible = sram.subarray(0xc000, 0xd000);
          ram.set(osRamVisible, 0xc000);
          traceCopy(0xc000, osRamVisible);
          CPU.setRam(ctx, 0xc000, 0xcfff);
          const fpRamVisible = sram.subarray(0xd800, 0x10000);
          ram.set(fpRamVisible, 0xd800);
          traceCopy(0xd800, fpRamVisible);
          CPU.setRam(ctx, 0xd800, 0xffff);
        }

        // Self-test: bit7=0 => enabled (ROM), bit7=1 => disabled (RAM)
        if (!selfTestEnabled) {
          const selfTestRamVisible = sram.subarray(0x5000, 0x5800);
          ram.set(selfTestRamVisible, 0x5000);
          traceCopy(0x5000, selfTestRamVisible);
          CPU.setRam(ctx, 0x5000, 0x57ff);
        } else {
          CPU.setRom(ctx, 0x5000, 0x57ff);
          if (io.selfTestRom) {
            ram.set(io.selfTestRom, 0x5000);
            traceCopy(0x5000, io.selfTestRom);
          }
        }

        // I/O overrides must come after ROM mapping.
        installIoHandlers(ctx, ioAccess);
        syncMemoryExpansionWindow(ctx, portB, portB);
      }

      function applyResetOverrides(options) {
        if (!options || typeof options !== "object") return;
        if (options.memoryExpansion !== undefined && options.memoryExpansion !== null) {
          setMemoryExpansion(options.memoryExpansion);
        }
        if (options.portB !== undefined && options.portB !== null) {
          const portB = sanitizePortB(options.portB | 0);
          machine.ctx.ram[IO_PORTB] = portB;
          machine.ctx.sram[IO_PORTB] = portB;
          machine.ctx.ioData.valuePortB = 0xff;
          machine.ctx.ioData.outputPortB = portB;
        }
      }

      function hardReset(options) {
        getMediaState();
        if (machine.memoryExpansion && machine.memoryExpansion.ultimate1mb) {
          machine.memoryExpansion.ultimateUctl = 0x03;
          machine.memoryExpansion.ultimateUaux = 0;
          machine.memoryExpansion.ultimateColdReset = 0x80;
          machine.memoryExpansion.ultimateConfigLocked = false;
          applyUltimate1mbMemoryMode(machine.memoryExpansion);
          machine.memoryExpansion.initialized = false;
        }
        machine.ctx.cycleCounter = 0;
        machine.ctx.stallCycleCounter = 0;
        machine.ctx.nmiPending = 0;
        machine.ctx.nmiActive = 0;
        machine.ctx.irqPending = 0;
        machine.ctx.ioData = makeIoData(video);
        machine.ctx.ioData.optionOnStart = !!getOptionOnStart();
        machine.ctx.ioData.sioTurbo = !!getSioTurbo();
        copyMediaToIoData();
        machine.ctx.ioData.memoryExpansionRead = readExpansionMemoryByte;
        machine.ctx.ioData.memoryExpansionSync = syncMemoryExpansionWindow;
        machine.ctx.ioData.ultimate1mbRead = ultimate1mbRead;
        machine.ctx.ioData.ultimate1mbWrite = ultimate1mbWrite;
        machine.ctx.ioData.pokeyAudio = machine.audioState;
        machine.ctx.ioCycleTimedEventFunction = ioCycleTimedEvent;
        cycleTimedEventUpdate(machine.ctx);
        initHardwareDefaults(machine.ctx);
        applyResetOverrides(options);
        installIoHandlers(machine.ctx, ioAccess);
        setupMemoryMap();
        CPU.reset(machine.ctx);
        if (machine.audioState) {
          const turbo = !!getTurbo();
          pokeyAudioResetState(machine.audioState);
          pokeyAudioSetTurbo(machine.audioState, turbo);
          machine.audioTurbo = turbo;
        }
        if (
          machine.audioMode === "worklet" &&
          machine.audioNode &&
          machine.audioNode.port
        ) {
          try {
            machine.audioNode.port.postMessage({ type: "clear" });
          } catch {
            // ignore
          }
        }
      }

      // A power-cycle starts from a fresh volatile machine state while
      // keeping externally owned media (ROMs, disks, and H: files) attached.
      // The ordinary hard reset intentionally does not discard RAM or the
      // active expansion-bank contents because it models the XL/XE RESET line.
      function powerCycle(options) {
        const resetOptions =
          options && typeof options === "object" ? Object.assign({}, options) : {};
        let profile = getMemoryExpansionState().profile;
        if (resetOptions.memoryExpansion !== undefined && resetOptions.memoryExpansion !== null) {
          profile = normalizeMemoryExpansionProfile(resetOptions.memoryExpansion) || profile;
        }

        // RAM contents are undefined after a real power cycle. The emulator
        // uses a deterministic blank volatile state so startup is repeatable.
        machine.ctx.ram.fill(0);
        machine.ctx.sram.fill(0);

        // Recreate the expansion state itself, rather than only resetting its
        // control flags. This drops stale 130XE/COMPY/RAMBO bank contents and
        // the previous CPU/ANTIC window bookkeeping.
        machine.memoryExpansion = createMemoryExpansionState(profile);
        applyUltimate1mbMemoryMode(machine.memoryExpansion);
        delete resetOptions.memoryExpansion;
        hardReset(resetOptions);
      }

      function loadOsRom(arrayBuffer) {
        const media = getMediaState();
        const bytes = new Uint8Array(arrayBuffer);
        if (bytes.length !== 0x4000) {
          throw new Error(
            "ATARIXL.ROM must be 16KB (0x4000), got " + bytes.length,
          );
        }
        // Layout matches AtariIoOpen():
        // 0x0000-0x0FFF => $C000-$CFFF
        // 0x1000-0x17FF => self-test => $5000-$57FF (if enabled)
        // 0x1800-0x3FFF => floating point => $D800-$FFFF
        media.osRom = new Uint8Array(bytes.subarray(0x0000, 0x1000));
        media.selfTestRom = new Uint8Array(
          bytes.subarray(0x1000, 0x1800),
        );
        media.floatingPointRom = new Uint8Array(
          bytes.subarray(0x1800, 0x4000),
        );
        machine.ctx.ioData.osRom = media.osRom;
        machine.ctx.ioData.selfTestRom = media.selfTestRom;
        machine.ctx.ioData.floatingPointRom = media.floatingPointRom;
        machine.osRomLoaded = true;
        setupMemoryMap();
      }

      function loadBasicRom(arrayBuffer) {
        const media = getMediaState();
        const bytes = new Uint8Array(arrayBuffer);
        if (bytes.length !== 0x2000) {
          throw new Error(
            "ATARIBAS.ROM must be 8KB (0x2000), got " + bytes.length,
          );
        }
        media.basicRom = new Uint8Array(bytes);
        machine.ctx.ioData.basicRom = media.basicRom;
        machine.basicRomLoaded = true;
        setupMemoryMap();
      }

      function loadDiskToDeviceSlot(arrayBuffer, name, deviceSlotIndex) {
        return loadDiskToDeviceSlotDetailed(
          arrayBuffer,
          name,
          deviceSlotIndex,
          null,
        ).imageIndex;
      }

      function mountImageToDeviceSlot(imageIndex, deviceSlotIndex) {
        const media = getMediaState();
        const deviceSlot = normalizeDeviceSlotIndex(deviceSlotIndex);
        const idx = imageIndex | 0;
        if (idx === NO_IMAGE_MOUNTED) {
          media.deviceSlots[deviceSlot] = NO_IMAGE_MOUNTED;
          copyMediaToIoData();
          return;
        }
        const image = getDiskImageByIndex(idx);
        if (!image) throw new Error("Disk image index out of range: " + idx);
        media.deviceSlots[deviceSlot] = idx;
        copyMediaToIoData();
      }

      function unmountDeviceSlot(deviceSlotIndex) {
        const media = getMediaState();
        const deviceSlot = normalizeDeviceSlotIndex(deviceSlotIndex);
        media.deviceSlots[deviceSlot] = NO_IMAGE_MOUNTED;
        copyMediaToIoData();
      }

      function getMountedDiskForDeviceSlot(deviceSlotIndex) {
        const media = getMediaState();
        const deviceSlot = normalizeDeviceSlotIndex(deviceSlotIndex);
        const imageIndex = media.deviceSlots[deviceSlot] | 0;
        if (imageIndex === NO_IMAGE_MOUNTED) return null;
        const image = getDiskImageByIndex(imageIndex);
        if (!image) return null;
        return {
          deviceSlot: deviceSlot,
          imageIndex: imageIndex,
          name: image.name || "disk.atr",
          size: image.size | 0 || image.bytes.length | 0,
          writable: image.writable !== false,
          libraryId: image.libraryId ? String(image.libraryId) : "",
        };
      }

      function getDiskImageBytesByIndex(imageIndex) {
        const image = getDiskImageByIndex(imageIndex);
        return image ? image.bytes : null;
      }

      function getDiskImageInfoByIndex(imageIndex) {
        const image = getDiskImageByIndex(imageIndex);
        if (!image) return null;
        return {
          imageIndex: imageIndex | 0,
          name: image.name || "disk.atr",
          size: image.size | 0 || image.bytes.length | 0,
          libraryId: image.libraryId ? String(image.libraryId) : "",
        };
      }

      function hasMountedDiskForDeviceSlot(deviceSlotIndex) {
        return !!getMountedDiskForDeviceSlot(deviceSlotIndex);
      }

      function readMemory(address) {
        const addr = (address | 0) & 0xffff;
        return machine.ctx.ram[addr] & 0xff;
      }

      function readRange(startAddress, length) {
        const start = (startAddress | 0) & 0xffff;
        const size = length | 0;
        if (size <= 0) return new Uint8Array(0);
        const out = new Uint8Array(size);
        const ram = machine.ctx.ram;
        for (let i = 0; i < size; i++) {
          out[i] = ram[(start + i) & 0xffff] & 0xff;
        }
        return out;
      }

      function writeMemory(address, value) {
        const addr = (address | 0) & 0xffff;
        const next = value & 0xff;
        machine.ctx.ram[addr] = next;
        if (memoryWriteHook) {
          try {
            memoryWriteHook(
              addr,
              next,
              machine.ctx.cycleCounter >>> 0,
              machine.ctx.instructionCounter >>> 0,
            );
          } catch {
            // ignore hook errors
          }
        }
        return next;
      }

      function setMemoryWriteHook(fn) {
        memoryWriteHook = typeof fn === "function" ? fn : null;
      }

      function writeRange(startAddress, data) {
        const start = (startAddress | 0) & 0xffff;
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data || 0);
        const size = bytes.length | 0;
        const ram = machine.ctx.ram;
        for (let i = 0; i < size; i++) {
          ram[(start + i) & 0xffff] = bytes[i] & 0xff;
        }
        return size;
      }

      function getBankState() {
        const media = getMediaState();
        const portB = machine.ctx.sram[IO_PORTB] & 0xff;
        const mem = getMemoryExpansionState();
        return {
          portB: portB,
          basicEnabled: mem.enabled ? !!mem.basicEnabled : (portB & 0x02) === 0,
          osEnabled: (portB & 0x01) !== 0,
          floatingPointEnabled: (portB & 0x01) !== 0,
          selfTestEnabled: mem.enabled ? !!mem.selfTestEnabled : (portB & 0x80) === 0,
          basicRomLoaded: !!media.basicRom,
          osRomLoaded: !!media.osRom,
          floatingPointRomLoaded: !!media.floatingPointRom,
          selfTestRomLoaded: !!media.selfTestRom,
          memoryExpansion: {
            profile: mem.profile,
            label: mem.label,
            enabled: !!mem.enabled,
            bankCount: mem.bankCount | 0,
            currentBank: mem.currentBank | 0,
            cpuWindowEnabled: !!mem.cpuWindowEnabled,
            anticWindowEnabled: !!mem.anticWindowEnabled,
            ultimateUctl: mem.ultimate1mb ? mem.ultimateUctl & 0xff : null,
            ultimateUaux: mem.ultimate1mb ? mem.ultimateUaux & 0xff : null,
            ultimateColdReset: mem.ultimate1mb ? mem.ultimateColdReset & 0x80 : null,
            ultimateConfigLocked: mem.ultimate1mb ? !!mem.ultimateConfigLocked : null,
          },
        };
      }

      function copyBytesTo(target, source) {
        target.fill(0);
        if (!source) return;
        const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
        target.set(bytes.subarray(0, target.length), 0);
      }

      function cloneIoDataState(io) {
        return {
          video: io && io.video
            ? {
                currentDisplayLine: io.video.currentDisplayLine | 0,
              }
            : null,
          displayListFetchCycle: io.displayListFetchCycle,
          clock: io.clock,
          inDrawLine: !!io.inDrawLine,
          dliCycle: io.dliCycle,
          vbiCycle: io.vbiCycle,
          serialOutputNeedDataCycle: io.serialOutputNeedDataCycle,
          serialOutputTransmissionDoneCycle: io.serialOutputTransmissionDoneCycle,
          serialInputDataReadyCycle: io.serialInputDataReadyCycle,
          timer1Cycle: io.timer1Cycle,
          timer2Cycle: io.timer2Cycle,
          timer4Cycle: io.timer4Cycle,
          valuePortA: io.valuePortA | 0,
          valuePortB: io.valuePortB | 0,
          outputPortB: io.outputPortB | 0,
          sioBuffer: new Uint8Array(io.sioBuffer || 0),
          sioOutIndex: io.sioOutIndex | 0,
          sioOutPhase: io.sioOutPhase | 0,
          sioDataIndex: io.sioDataIndex | 0,
          sioPendingDevice: io.sioPendingDevice | 0,
          sioPendingCmd: io.sioPendingCmd | 0,
          sioPendingSector: io.sioPendingSector | 0,
          sioPendingBytes: io.sioPendingBytes | 0,
          sioInIndex: io.sioInIndex | 0,
          sioInSize: io.sioInSize | 0,
          sioPendingReadSize: io.sioPendingReadSize | 0,
          pokeyLfsr17: io.pokeyLfsr17 | 0,
          pokeyLfsr17LastCycle: io.pokeyLfsr17LastCycle,
          pokeyPotValues: new Uint8Array(io.pokeyPotValues || 0),
          pokeyPotLatched: new Uint8Array(io.pokeyPotLatched || 0),
          pokeyPotScanLastCycle: io.pokeyPotScanLastCycle,
          pokeyPotScanTerminalCycle: io.pokeyPotScanTerminalCycle,
          pokeyPotCounter: io.pokeyPotCounter | 0,
          pokeyPotScanActive: !!io.pokeyPotScanActive,
          trigPhysical: new Uint8Array(io.trigPhysical || 0),
          trigLatched: new Uint8Array(io.trigLatched || 0),
          currentDisplayListCommand: io.currentDisplayListCommand | 0,
          nextDisplayListLine: io.nextDisplayListLine | 0,
          displayListAddress: io.displayListAddress | 0,
          rowDisplayMemoryAddress: io.rowDisplayMemoryAddress | 0,
          displayMemoryAddress: io.displayMemoryAddress | 0,
          firstRowScanline: !!io.firstRowScanline,
          modeLineRowCounter: io.modeLineRowCounter | 0,
          modeLineEndRow: io.modeLineEndRow | 0,
          modeLineScrollExit: !!io.modeLineScrollExit,
          modeLineExitDli: !!io.modeLineExitDli,
          modeLineEndsThisLine: !!io.modeLineEndsThisLine,
          nmiTiming: io.nmiTiming
            ? {
                enabledByCycle7: io.nmiTiming.enabledByCycle7 | 0,
                enabledByCycle8: io.nmiTiming.enabledByCycle8 | 0,
                enabledOnCycle7Mask: io.nmiTiming.enabledOnCycle7Mask | 0,
              }
            : null,
          chbaseTiming: io.chbaseTiming
            ? {
                rawValue: io.chbaseTiming.rawValue | 0,
                activeValue: io.chbaseTiming.activeValue | 0,
                pendingValue: io.chbaseTiming.pendingValue | 0,
                pendingClock: io.chbaseTiming.pendingClock | 0,
                initialized: !!io.chbaseTiming.initialized,
              }
            : null,
          drawLine: io.drawLine
            ? {
                displayMemoryAddress: io.drawLine.displayMemoryAddress | 0,
                bytesPerLine: io.drawLine.bytesPerLine | 0,
                destIndex: io.drawLine.destIndex | 0,
                playfieldDmaStealCount: io.drawLine.playfieldDmaStealCount | 0,
                refreshDmaPending: io.drawLine.refreshDmaPending | 0,
                displayListInstructionDmaPending:
                  io.drawLine.displayListInstructionDmaPending | 0,
                displayListAddressDmaRemaining:
                  io.drawLine.displayListAddressDmaRemaining | 0,
                playerMissileClockActive: !!io.drawLine.playerMissileClockActive,
                playerMissileInterleaved: !!io.drawLine.playerMissileInterleaved,
                pmgFirstVisibleSpan: !!io.drawLine.pmgFirstVisibleSpan,
                playerPmgShift: new Uint8Array(io.drawLine.playerPmgShift || 0),
                playerPmgState: new Uint8Array(io.drawLine.playerPmgState || 0),
                missilePmgShift: new Uint8Array(io.drawLine.missilePmgShift || 0),
                missilePmgState: new Uint8Array(io.drawLine.missilePmgState || 0),
                playfieldLineBuffer: new Uint8Array(io.drawLine.playfieldLineBuffer || 0),
                scheduledPlayfieldDma: new Uint8Array(io.drawLine.scheduledPlayfieldDma || 0),
              }
            : null,
          keyPressCounter: io.keyPressCounter | 0,
          optionOnStart: !!io.optionOnStart,
          sioTurbo: !!io.sioTurbo,
          memoryExpansion: cloneMemoryExpansionState(io.memoryExpansion),
        };
      }

      function createIoDataFromSnapshot(snapshot) {
        const state = snapshot && typeof snapshot === "object" ? snapshot : {};
        const io = makeIoData(video);
        if (state.video && typeof state.video === "object") {
          io.video.currentDisplayLine = state.video.currentDisplayLine | 0;
        }
        io.displayListFetchCycle = state.displayListFetchCycle;
        io.clock = state.clock;
        io.inDrawLine = !!state.inDrawLine;
        io.dliCycle = state.dliCycle;
        // Older snapshots predate vbiCycle; keep the makeIoData default then.
        if (state.vbiCycle !== undefined) io.vbiCycle = state.vbiCycle;
        io.serialOutputNeedDataCycle = state.serialOutputNeedDataCycle;
        io.serialOutputTransmissionDoneCycle = state.serialOutputTransmissionDoneCycle;
        io.serialInputDataReadyCycle = state.serialInputDataReadyCycle;
        io.timer1Cycle = state.timer1Cycle;
        io.timer2Cycle = state.timer2Cycle;
        io.timer4Cycle = state.timer4Cycle;
        io.valuePortA = state.valuePortA | 0;
        io.valuePortB = state.valuePortB | 0;
        io.outputPortB =
          state.outputPortB !== undefined ? state.outputPortB | 0 : 0xff;
        copyBytesTo(io.sioBuffer, state.sioBuffer);
        io.sioOutIndex = state.sioOutIndex | 0;
        io.sioOutPhase = state.sioOutPhase | 0;
        io.sioDataIndex = state.sioDataIndex | 0;
        io.sioPendingDevice = state.sioPendingDevice | 0;
        io.sioPendingCmd = state.sioPendingCmd | 0;
        io.sioPendingSector = state.sioPendingSector | 0;
        io.sioPendingBytes = state.sioPendingBytes | 0;
        io.sioInIndex = state.sioInIndex | 0;
        io.sioInSize = state.sioInSize | 0;
        io.sioPendingReadSize = state.sioPendingReadSize | 0;
        io.pokeyLfsr17 = state.pokeyLfsr17 | 0;
        io.pokeyLfsr17LastCycle = state.pokeyLfsr17LastCycle;
        copyBytesTo(io.pokeyPotValues, state.pokeyPotValues);
        copyBytesTo(io.pokeyPotLatched, state.pokeyPotLatched);
        const legacyPokeyPotScanStartCycle =
          typeof state.pokeyPotScanStartCycle === "number"
            ? state.pokeyPotScanStartCycle
            : 0;
        io.pokeyPotScanLastCycle =
          typeof state.pokeyPotScanLastCycle === "number"
            ? state.pokeyPotScanLastCycle
            : legacyPokeyPotScanStartCycle;
        io.pokeyPotScanTerminalCycle =
          typeof state.pokeyPotScanTerminalCycle === "number"
            ? state.pokeyPotScanTerminalCycle
            : CYCLE_NEVER;
        io.pokeyPotCounter = state.pokeyPotCounter | 0;
        io.pokeyPotScanActive = !!state.pokeyPotScanActive;
        copyBytesTo(io.trigPhysical, state.trigPhysical);
        copyBytesTo(io.trigLatched, state.trigLatched);
        io.currentDisplayListCommand = state.currentDisplayListCommand | 0;
        io.nextDisplayListLine = state.nextDisplayListLine | 0;
        io.displayListAddress = state.displayListAddress | 0;
        io.rowDisplayMemoryAddress = state.rowDisplayMemoryAddress | 0;
        io.displayMemoryAddress = state.displayMemoryAddress | 0;
        io.firstRowScanline = !!state.firstRowScanline;
        // Older snapshots predate the row-counter state; keep defaults then.
        if (state.modeLineRowCounter !== undefined) {
          io.modeLineRowCounter = state.modeLineRowCounter | 0;
          io.modeLineEndRow = state.modeLineEndRow | 0;
          io.modeLineScrollExit = !!state.modeLineScrollExit;
          io.modeLineExitDli = !!state.modeLineExitDli;
          io.modeLineEndsThisLine = !!state.modeLineEndsThisLine;
        }
        if (state.nmiTiming && typeof state.nmiTiming === "object") {
          io.nmiTiming.enabledByCycle7 = state.nmiTiming.enabledByCycle7 | 0;
          io.nmiTiming.enabledByCycle8 = state.nmiTiming.enabledByCycle8 | 0;
          io.nmiTiming.enabledOnCycle7Mask =
            state.nmiTiming.enabledOnCycle7Mask | 0;
        }
        if (state.chbaseTiming && typeof state.chbaseTiming === "object") {
          io.chbaseTiming.rawValue = state.chbaseTiming.rawValue | 0;
          io.chbaseTiming.activeValue = state.chbaseTiming.activeValue | 0;
          io.chbaseTiming.pendingValue = state.chbaseTiming.pendingValue | 0;
          io.chbaseTiming.pendingClock = state.chbaseTiming.pendingClock | 0;
          io.chbaseTiming.initialized = !!state.chbaseTiming.initialized;
        }
        if (state.drawLine && typeof state.drawLine === "object") {
          io.drawLine.displayMemoryAddress = state.drawLine.displayMemoryAddress | 0;
          io.drawLine.bytesPerLine = state.drawLine.bytesPerLine | 0;
          io.drawLine.destIndex = state.drawLine.destIndex | 0;
          io.drawLine.playfieldDmaStealCount =
            state.drawLine.playfieldDmaStealCount | 0;
          io.drawLine.refreshDmaPending =
            state.drawLine.refreshDmaPending | 0;
          io.drawLine.displayListInstructionDmaPending =
            state.drawLine.displayListInstructionDmaPending | 0;
          io.drawLine.displayListAddressDmaRemaining =
            state.drawLine.displayListAddressDmaRemaining | 0;
          io.drawLine.playerMissileClockActive = !!state.drawLine.playerMissileClockActive;
          io.drawLine.playerMissileInterleaved = !!state.drawLine.playerMissileInterleaved;
          io.drawLine.pmgFirstVisibleSpan = !!state.drawLine.pmgFirstVisibleSpan;
          if (state.drawLine.playerPmgShift) {
            io.drawLine.playerPmgShift = new Uint8Array(state.drawLine.playerPmgShift);
          }
          if (state.drawLine.playerPmgState) {
            io.drawLine.playerPmgState = new Uint8Array(state.drawLine.playerPmgState);
          }
          if (state.drawLine.missilePmgShift) {
            io.drawLine.missilePmgShift = new Uint8Array(state.drawLine.missilePmgShift);
          }
          if (state.drawLine.missilePmgState) {
            io.drawLine.missilePmgState = new Uint8Array(state.drawLine.missilePmgState);
          }
          copyBytesTo(io.drawLine.playfieldLineBuffer, state.drawLine.playfieldLineBuffer);
          copyBytesTo(io.drawLine.scheduledPlayfieldDma, state.drawLine.scheduledPlayfieldDma);
        }
        io.keyPressCounter = state.keyPressCounter | 0;
        io.optionOnStart = !!state.optionOnStart;
        io.sioTurbo = !!state.sioTurbo;
        io.memoryExpansion = cloneMemoryExpansionState(state.memoryExpansion);
        return io;
      }

      function cloneMediaState() {
        const media = getMediaState();
        return {
          deviceSlots: Array.from(media.deviceSlots || []),
          diskImages: media.diskImages.map(function (image) {
            return {
              id: image.id ? String(image.id) : "",
              name: image.name ? String(image.name) : "disk.atr",
              size: image.size | 0,
              writable: image.writable !== false,
              libraryId: image.libraryId ? String(image.libraryId) : "",
              bytes: new Uint8Array(image.bytes || 0),
            };
          }),
          basicRom: media.basicRom ? new Uint8Array(media.basicRom) : null,
          osRom: media.osRom ? new Uint8Array(media.osRom) : null,
          selfTestRom: media.selfTestRom
            ? new Uint8Array(media.selfTestRom)
            : null,
          floatingPointRom: media.floatingPointRom
            ? new Uint8Array(media.floatingPointRom)
            : null,
        };
      }

      function restoreMediaState(snapshot) {
        const state = snapshot && typeof snapshot === "object" ? snapshot : {};
        const deviceSlots = makeDefaultDeviceSlots();
        const rawSlots = Array.isArray(state.deviceSlots) ? state.deviceSlots : [];
        for (let i = 0; i < deviceSlots.length && i < rawSlots.length; i++) {
          deviceSlots[i] = rawSlots[i] | 0;
        }
        const diskImages = [];
        const rawImages = Array.isArray(state.diskImages) ? state.diskImages : [];
        for (let i = 0; i < rawImages.length; i++) {
          const image = rawImages[i];
          if (!image || typeof image !== "object") continue;
          const bytes = image.bytes ? new Uint8Array(image.bytes) : new Uint8Array(0);
          diskImages.push({
            id: image.id ? String(image.id) : Date.now() + ":" + i,
            name: image.name ? String(image.name) : "disk.atr",
            bytes: bytes,
            size: image.size | 0 || bytes.length | 0,
            writable: image.writable !== false,
            libraryId: image.libraryId ? String(image.libraryId) : "",
          });
        }
        machine.media = {
          deviceSlots: deviceSlots,
          diskImages: diskImages,
          basicRom: state.basicRom ? new Uint8Array(state.basicRom) : null,
          osRom: state.osRom ? new Uint8Array(state.osRom) : null,
          selfTestRom: state.selfTestRom ? new Uint8Array(state.selfTestRom) : null,
          floatingPointRom: state.floatingPointRom
            ? new Uint8Array(state.floatingPointRom)
            : null,
        };
      }

      function exportSnapshotState() {
        getMediaState();
        return {
          ram: new Uint8Array(machine.ctx.ram),
          sram: new Uint8Array(machine.ctx.sram),
          ioData: cloneIoDataState(machine.ctx.ioData),
          media: cloneMediaState(),
          osRomLoaded: !!machine.osRomLoaded,
          basicRomLoaded: !!machine.basicRomLoaded,
        };
      }

      function importSnapshotState(snapshot) {
        const state = snapshot && typeof snapshot === "object" ? snapshot : {};
        restoreMediaState(state.media);
        machine.osRomLoaded = !!state.osRomLoaded;
        machine.basicRomLoaded = !!state.basicRomLoaded;
        copyBytesTo(machine.ctx.ram, state.ram);
        copyBytesTo(machine.ctx.sram, state.sram);
        machine.ctx.ioData = createIoDataFromSnapshot(state.ioData);
        machine.memoryExpansion =
          machine.ctx.ioData.memoryExpansion || createMemoryExpansionState("none");
        machine.ctx.ioData.memoryExpansion = machine.memoryExpansion;
        machine.ctx.ioData.memoryExpansionRead = readExpansionMemoryByte;
        machine.ctx.ioData.memoryExpansionSync = syncMemoryExpansionWindow;
        machine.ctx.ioData.ultimate1mbRead = ultimate1mbRead;
        machine.ctx.ioData.ultimate1mbWrite = ultimate1mbWrite;
        copyMediaToIoData();
        machine.ctx.ioCycleTimedEventFunction = ioCycleTimedEvent;
        machine.ctx.ioData.pokeyAudio = null;
        machine.ctx.accessFunctionOverride = null;
        machine.ctx.accessFunction = null;
        machine.ctx.accessAddress = 0;
        machine.ctx.accessMode = 0;
        machine.ctx.pageCrossed = 0;
        machine.ctx.breakRun = false;
        installIoHandlers(machine.ctx, ioAccess);
        setupMemoryMap();
        cycleTimedEventUpdate(machine.ctx);
      }

      return {
        setupMemoryMap: setupMemoryMap,
        hardReset: hardReset,
        powerCycle: powerCycle,
        loadOsRom: loadOsRom,
        loadBasicRom: loadBasicRom,
        loadDiskToDeviceSlot: loadDiskToDeviceSlot,
        loadDiskToDeviceSlotDetailed: loadDiskToDeviceSlotDetailed,
        mountImageToDeviceSlot: mountImageToDeviceSlot,
        unmountDeviceSlot: unmountDeviceSlot,
        getMountedDiskForDeviceSlot: getMountedDiskForDeviceSlot,
        hasMountedDiskForDeviceSlot: hasMountedDiskForDeviceSlot,
        getDiskImageBytesByIndex: getDiskImageBytesByIndex,
        getDiskImageInfoByIndex: getDiskImageInfoByIndex,
        readMemory: readMemory,
        readRange: readRange,
        writeMemory: writeMemory,
        writeRange: writeRange,
        setMemoryWriteHook: setMemoryWriteHook,
        getBankState: getBankState,
        exportSnapshotState: exportSnapshotState,
        importSnapshotState: importSnapshotState,
      };
    }

    return {
      createRuntime: createRuntime,
    };
  }

  window.A8EMemory = {
    createApi: createApi,
  };
})();
