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
    0x20, 0x7E, 0x07, 0xC9, 0xFF, 0xD0, 0x4F,
    0x20, 0x7E, 0x07, 0xC9, 0xFF, 0xD0, 0x48,
    0x20, 0x7E, 0x07, 0x85, 0x43,
    0x20, 0x7E, 0x07, 0x85, 0x44,
    0x20, 0x7E, 0x07, 0x85, 0x45,
    0x20, 0x7E, 0x07, 0x85, 0x46,
    /* copy_loop */
    0x20, 0x7E, 0x07, 0xA0, 0x00, 0x91, 0x43,
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
    0xAD, 0xE1, 0x02, 0xF0, 0x03, 0x6C, 0xE0, 0x02,
    /* done */
    0x60,
    /* get_byte */
    0xA5, 0x48, 0xD0, 0x03, 0x20, 0x8F, 0x07,
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
  const XEX_BOOT_PATCH_GETBYTE_BUF_LO = 0x0788 - XEX_BOOT_LOADER_BASE;
  const XEX_BOOT_PATCH_GETBYTE_BUF_HI = 0x0789 - XEX_BOOT_LOADER_BASE;
  const XEX_BOOT_PATCH_DBUF_LO = 0x07a4 - XEX_BOOT_LOADER_BASE;
  const XEX_BOOT_PATCH_DBUF_HI = 0x07a9 - XEX_BOOT_LOADER_BASE;
  const XEX_BOOT_LOADER_RESERVED_START = 0x0700;
  const XEX_BOOT_LOADER_RESERVED_END = 0x087f;
  const XEX_SEGMENT_MARKER = 0xff;

  const ATR_HEADER_SIZE = 16;
  const ATR_SECTOR_SIZE = 128;
  const ATR_BOOT_SECTOR_COUNT = 3;
  const ATR_BOOT_LOADER_SIZE = ATR_BOOT_SECTOR_COUNT * ATR_SECTOR_SIZE;
  const ATR_DATA_OFFSET = ATR_HEADER_SIZE + ATR_BOOT_LOADER_SIZE;

  function sanitizePortB(value) {
    return ((value & 0x83) | 0x7c) & 0xff;
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
      {
        kind: "io_registers",
        name: "I/O registers",
        start: 0xd000,
        end: 0xd7ff,
        length: 0x0800,
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

  function computeXexRangeOverlap(startA, endA, startB, endB) {
    const overlapStart = Math.max(startA | 0, startB | 0) | 0;
    const overlapEnd = Math.min(endA | 0, endB | 0) | 0;
    if (overlapStart > overlapEnd) return null;
    return {
      start: overlapStart & 0xffff,
      end: overlapEnd & 0xffff,
      length: (overlapEnd - overlapStart + 1) >>> 0,
    };
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
    for (let i = 0; i < normalized.segments.length; i++) {
      const segment = normalized.segments[i];
      for (let j = 0; j < portBInfo.regions.length; j++) {
        const region = portBInfo.regions[j];
        const overlap = computeXexRangeOverlap(
          segment.start,
          segment.end,
          region.start,
          region.end,
        );
        if (!overlap) continue;
        report.overlaps.push({
          segmentIndex: segment.index | 0,
          segmentStart: segment.start & 0xffff,
          segmentEnd: segment.end & 0xffff,
          regionKind: String(region.kind || ""),
          regionName: String(region.name || ""),
          regionStart: region.start & 0xffff,
          regionEnd: region.end & 0xffff,
          overlapStart: overlap.start & 0xffff,
          overlapEnd: overlap.end & 0xffff,
          overlapLength: overlap.length >>> 0,
          protected: !!region.protected,
          romBacked: !!region.romBacked,
        });
      }
    }
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

      function migrateLegacyDisk1(source) {
        if (!source || !source.disk1 || !source.disk1.length) return false;
        if (machine.media.diskImages.length > 0) return false;
        const legacyBytes = source.disk1;
        const image = createDiskImage(legacyBytes, source.disk1Name || "disk.atr");
        const legacySize = source.disk1Size | 0;
        if (legacySize > 0 && legacySize <= legacyBytes.length)
          {image.size = legacySize;}
        const imageIndex = machine.media.diskImages.length | 0;
        machine.media.diskImages.push(image);
        if ((machine.media.deviceSlots[0] | 0) === NO_IMAGE_MOUNTED) {
          machine.media.deviceSlots[0] = imageIndex;
        }
        return true;
      }

      function ensureMediaLayout() {
        if (!machine.media) machine.media = {};
        if (
          !(machine.media.deviceSlots instanceof Int16Array) ||
          machine.media.deviceSlots.length !== DEVICE_SLOT_COUNT
        )
          {machine.media.deviceSlots = makeDefaultDeviceSlots();}
        if (!Array.isArray(machine.media.diskImages)) machine.media.diskImages = [];

        // One-time compatibility migration from legacy disk1 fields.
        let migrated = migrateLegacyDisk1(machine.media);
        if (
          !migrated &&
          machine.ctx &&
          machine.ctx.ioData &&
          machine.ctx.ioData !== machine.media
        ) {
          migrated = migrateLegacyDisk1(machine.ctx.ioData);
        }
        // Always drop legacy fields after optional migration to avoid stale state.
        clearLegacyDisk1Fields(machine.media);
        if (machine.ctx && machine.ctx.ioData)
          {clearLegacyDisk1Fields(machine.ctx.ioData);}
      }

      function getDiskImageByIndex(imageIndex) {
        const idx = imageIndex | 0;
        if (idx < 0 || idx >= machine.media.diskImages.length) return null;
        const image = machine.media.diskImages[idx];
        if (!image || !image.bytes) return null;
        return image;
      }

      function isValidImageIndex(imageIndex) {
        if (imageIndex === null || imageIndex === undefined) return false;
        return !!getDiskImageByIndex(imageIndex);
      }

      function storeDiskImage(bytes, name, preferredIndex) {
        const image = createDiskImage(bytes, name || "disk.atr");
        if (isValidImageIndex(preferredIndex)) {
          const preferred = preferredIndex | 0;
          machine.media.diskImages[preferred] = image;
          return preferred;
        }
        const imageIndex = machine.media.diskImages.length | 0;
        machine.media.diskImages.push(image);
        return imageIndex;
      }

      function copyMediaToIoData() {
        const io = machine.ctx.ioData;
        ensureMediaLayout();
        io.deviceSlots = machine.media.deviceSlots;
        io.diskImages = machine.media.diskImages;
        io.basicRom = machine.media.basicRom;
        io.osRom = machine.media.osRom;
        io.selfTestRom = machine.media.selfTestRom;
        io.floatingPointRom = machine.media.floatingPointRom;
      }

      function createDiskImage(bytes, name) {
        return {
          id: Date.now() + ":" + Math.random().toString(16).slice(2),
          name: name || "disk.atr",
          bytes: bytes,
          size: bytes.length | 0,
          writable: true,
        };
      }

      function getMediaStateForXex() {
        return {
          basicRomLoaded: !!machine.media.basicRom,
          osRomLoaded: !!machine.media.osRom,
          floatingPointRomLoaded: !!machine.media.floatingPointRom,
          selfTestRomLoaded: !!machine.media.selfTestRom,
        };
      }

      function normalizeXexPortBOverride(options) {
        if (!options || typeof options !== "object") return DEFAULT_PORTB;
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
        return DEFAULT_PORTB;
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
        ensureMediaLayout();
        const deviceSlot = normalizeDeviceSlotIndex(deviceSlotIndex);
        const deviceImageIndex = machine.media.deviceSlots[deviceSlot] | 0;
        const preferredImageIndex = isValidImageIndex(deviceImageIndex)
          ? deviceImageIndex
          : NO_IMAGE_MOUNTED;
        const prepared = prepareDiskBytesForMount(
          new Uint8Array(arrayBuffer),
          name,
          options || null,
        );
        const imageIndex = storeDiskImage(
          prepared.bytes,
          name,
          preferredImageIndex,
        );
        machine.media.deviceSlots[deviceSlot] = imageIndex;
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

        // Mirror the C setup: I/O is ROM-mapped and overridden per-register.
        CPU.setRom(ctx, 0xd000, 0xd7ff);

        // BASIC: bit1=0 => enabled (ROM), bit1=1 => disabled (RAM)
        if (portB & 0x02) {
          ram.set(sram.subarray(0xa000, 0xc000), 0xa000);
          CPU.setRam(ctx, 0xa000, 0xbfff);
        } else {
          CPU.setRom(ctx, 0xa000, 0xbfff);
          if (io.basicRom) ram.set(io.basicRom, 0xa000);
        }

        // OS/FP ROM: bit0=1 => enabled (ROM), bit0=0 => disabled (RAM)
        if (portB & 0x01) {
          CPU.setRom(ctx, 0xc000, 0xcfff);
          if (io.osRom) ram.set(io.osRom, 0xc000);
          CPU.setRom(ctx, 0xd800, 0xffff);
          if (io.floatingPointRom) ram.set(io.floatingPointRom, 0xd800);
        } else {
          ram.set(sram.subarray(0xc000, 0xd000), 0xc000);
          CPU.setRam(ctx, 0xc000, 0xcfff);
          ram.set(sram.subarray(0xd800, 0x10000), 0xd800);
          CPU.setRam(ctx, 0xd800, 0xffff);
        }

        // Self-test: bit7=0 => enabled (ROM), bit7=1 => disabled (RAM)
        if (portB & 0x80) {
          ram.set(sram.subarray(0x5000, 0x5800), 0x5000);
          CPU.setRam(ctx, 0x5000, 0x57ff);
        } else {
          CPU.setRom(ctx, 0x5000, 0x57ff);
          if (io.selfTestRom) ram.set(io.selfTestRom, 0x5000);
        }

        // I/O overrides must come after ROM mapping.
        installIoHandlers(ctx, ioAccess);
      }

      function applyResetOverrides(options) {
        if (!options || typeof options !== "object") return;
        if (options.portB !== undefined && options.portB !== null) {
          const portB = sanitizePortB(options.portB | 0);
          machine.ctx.ram[IO_PORTB] = portB;
          machine.ctx.sram[IO_PORTB] = portB;
          machine.ctx.ioData.valuePortB = portB;
        }
      }

      function hardReset(options) {
        ensureMediaLayout();
        machine.ctx.cycleCounter = 0;
        machine.ctx.stallCycleCounter = 0;
        machine.ctx.irqPending = 0;
        machine.ctx.ioData = makeIoData(video);
        machine.ctx.ioData.optionOnStart = !!getOptionOnStart();
        machine.ctx.ioData.sioTurbo = !!getSioTurbo();
        copyMediaToIoData();
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

      function loadOsRom(arrayBuffer) {
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
        machine.media.osRom = new Uint8Array(bytes.subarray(0x0000, 0x1000));
        machine.media.selfTestRom = new Uint8Array(
          bytes.subarray(0x1000, 0x1800),
        );
        machine.media.floatingPointRom = new Uint8Array(
          bytes.subarray(0x1800, 0x4000),
        );
        machine.ctx.ioData.osRom = machine.media.osRom;
        machine.ctx.ioData.selfTestRom = machine.media.selfTestRom;
        machine.ctx.ioData.floatingPointRom = machine.media.floatingPointRom;
        machine.osRomLoaded = true;
        setupMemoryMap();
      }

      function loadBasicRom(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        if (bytes.length !== 0x2000) {
          throw new Error(
            "ATARIBAS.ROM must be 8KB (0x2000), got " + bytes.length,
          );
        }
        machine.media.basicRom = new Uint8Array(bytes);
        machine.ctx.ioData.basicRom = machine.media.basicRom;
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
        ensureMediaLayout();
        const deviceSlot = normalizeDeviceSlotIndex(deviceSlotIndex);
        const idx = imageIndex | 0;
        if (idx === NO_IMAGE_MOUNTED) {
          machine.media.deviceSlots[deviceSlot] = NO_IMAGE_MOUNTED;
          copyMediaToIoData();
          return;
        }
        const image = getDiskImageByIndex(idx);
        if (!image) throw new Error("Disk image index out of range: " + idx);
        machine.media.deviceSlots[deviceSlot] = idx;
        copyMediaToIoData();
      }

      function unmountDeviceSlot(deviceSlotIndex) {
        ensureMediaLayout();
        const deviceSlot = normalizeDeviceSlotIndex(deviceSlotIndex);
        machine.media.deviceSlots[deviceSlot] = NO_IMAGE_MOUNTED;
        copyMediaToIoData();
      }

      function getMountedDiskForDeviceSlot(deviceSlotIndex) {
        ensureMediaLayout();
        const deviceSlot = normalizeDeviceSlotIndex(deviceSlotIndex);
        const imageIndex = machine.media.deviceSlots[deviceSlot] | 0;
        if (imageIndex === NO_IMAGE_MOUNTED) return null;
        const image = getDiskImageByIndex(imageIndex);
        if (!image) return null;
        return {
          deviceSlot: deviceSlot,
          imageIndex: imageIndex,
          name: image.name || "disk.atr",
          size: image.size | 0 || image.bytes.length | 0,
          writable: image.writable !== false,
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

      function getBankState() {
        const portB = machine.ctx.sram[IO_PORTB] & 0xff;
        return {
          portB: portB,
          basicEnabled: (portB & 0x02) === 0,
          osEnabled: (portB & 0x01) !== 0,
          floatingPointEnabled: (portB & 0x01) !== 0,
          selfTestEnabled: (portB & 0x80) === 0,
          basicRomLoaded: !!machine.media.basicRom,
          osRomLoaded: !!machine.media.osRom,
          floatingPointRomLoaded: !!machine.media.floatingPointRom,
          selfTestRomLoaded: !!machine.media.selfTestRom,
        };
      }

      return {
        setupMemoryMap: setupMemoryMap,
        hardReset: hardReset,
        loadOsRom: loadOsRom,
        loadBasicRom: loadBasicRom,
        loadDiskToDeviceSlot: loadDiskToDeviceSlot,
        loadDiskToDeviceSlotDetailed: loadDiskToDeviceSlotDetailed,
        mountImageToDeviceSlot: mountImageToDeviceSlot,
        unmountDeviceSlot: unmountDeviceSlot,
        getMountedDiskForDeviceSlot: getMountedDiskForDeviceSlot,
        hasMountedDiskForDeviceSlot: hasMountedDiskForDeviceSlot,
        readMemory: readMemory,
        readRange: readRange,
        getBankState: getBankState,
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
