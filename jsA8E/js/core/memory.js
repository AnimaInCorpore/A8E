(function () {
  "use strict";

  /* XEX boot loader - same 6502 code as the C implementation.
     See A8E/AtariIo.c for the fully commented assembly listing. */
  var XEX_BOOT_LOADER = [
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

  function isXexFile(name) {
    if (!name) return false;
    var dot = name.lastIndexOf(".");
    if (dot < 0) return false;
    var ext = name.substring(dot).toLowerCase();
    return ext === ".xex";
  }

  function normalizeXex(xexBytes) {
    var i = 0;
    var total = 0;
    var foundSegment = false;

    while (i < xexBytes.length) {
      while (
        i + 1 < xexBytes.length &&
        xexBytes[i] === 0xff &&
        xexBytes[i + 1] === 0xff
      ) {
        i += 2;
      }

      if (i >= xexBytes.length) break;
      if (i + 3 >= xexBytes.length) break;

      var start = (xexBytes[i] & 0xff) | ((xexBytes[i + 1] & 0xff) << 8);
      var end = (xexBytes[i + 2] & 0xff) | ((xexBytes[i + 3] & 0xff) << 8);
      if (end < start) return null;

      var segmentSize = end - start + 1;
      i += 4;
      if (i + segmentSize > xexBytes.length) return null;

      total += 6 + segmentSize;
      i += segmentSize;
      foundSegment = true;
    }

    if (!foundSegment) return null;

    var normalized = new Uint8Array(total);
    var out = 0;
    i = 0;

    while (i < xexBytes.length) {
      while (
        i + 1 < xexBytes.length &&
        xexBytes[i] === 0xff &&
        xexBytes[i + 1] === 0xff
      ) {
        i += 2;
      }

      if (i >= xexBytes.length) break;
      if (i + 3 >= xexBytes.length) break;

      var startLo = xexBytes[i] & 0xff;
      var startHi = xexBytes[i + 1] & 0xff;
      var endLo = xexBytes[i + 2] & 0xff;
      var endHi = xexBytes[i + 3] & 0xff;
      var start2 = startLo | (startHi << 8);
      var end2 = endLo | (endHi << 8);
      if (end2 < start2) return null;

      var segmentSize2 = end2 - start2 + 1;
      i += 4;
      if (i + segmentSize2 > xexBytes.length) return null;

      normalized[out++] = 0xff;
      normalized[out++] = 0xff;
      normalized[out++] = startLo;
      normalized[out++] = startHi;
      normalized[out++] = endLo;
      normalized[out++] = endHi;
      normalized.set(xexBytes.subarray(i, i + segmentSize2), out);
      out += segmentSize2;
      i += segmentSize2;
    }

    return out === normalized.length ? normalized : null;
  }

  function xexToAtr(xexBytes) {
    var normalizedXex = normalizeXex(xexBytes);
    if (!normalizedXex) return null;

    var normalizedSize = normalizedXex.length;
    var dataSectors = ((normalizedSize + 127) / 128) | 0;
    var totalSize = 16 + 384 + dataSectors * 128;
    var paragraphs = ((totalSize - 16) / 16) | 0;
    var atr = new Uint8Array(totalSize);

    // ATR header
    atr[0] = 0x96;
    atr[1] = 0x02;
    atr[2] = paragraphs & 0xFF;
    atr[3] = (paragraphs >> 8) & 0xFF;
    atr[4] = 0x80; // sector size 128
    atr[5] = 0x00;
    atr[6] = (paragraphs >> 16) & 0xFF;
    atr[7] = (paragraphs >> 24) & 0xFF;

    // Boot loader into sectors 1-3 (offset 16, 384 bytes)
    for (var i = 0; i < XEX_BOOT_LOADER.length; i++) {
      atr[16 + i] = XEX_BOOT_LOADER[i];
    }

    // XEX data into sectors 4+ (offset 16 + 384 = 400)
    atr.set(normalizedXex, 400);

    return atr;
  }

  function createApi(cfg) {
    const CPU = cfg.CPU;
    const IO_PORTB = cfg.IO_PORTB;
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
          image.size = legacySize;
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
          machine.media.deviceSlots = makeDefaultDeviceSlots();
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
          clearLegacyDisk1Fields(machine.ctx.ioData);
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

      function hardReset() {
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
          } catch (e) {
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
        ensureMediaLayout();
        const deviceSlot = normalizeDeviceSlotIndex(deviceSlotIndex);
        const deviceImageIndex = machine.media.deviceSlots[deviceSlot] | 0;
        const preferredImageIndex = isValidImageIndex(deviceImageIndex)
          ? deviceImageIndex
          : NO_IMAGE_MOUNTED;
        let bytes = new Uint8Array(arrayBuffer);
        if (isXexFile(name)) {
          const converted = xexToAtr(bytes);
          if (!converted) {
            throw new Error("Invalid or unsupported XEX file: " + (name || ""));
          }
          bytes = converted;
        }
        const imageIndex = storeDiskImage(bytes, name, preferredImageIndex);
        machine.media.deviceSlots[deviceSlot] = imageIndex;
        copyMediaToIoData();
        return imageIndex;
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

      return {
        setupMemoryMap: setupMemoryMap,
        hardReset: hardReset,
        loadOsRom: loadOsRom,
        loadBasicRom: loadBasicRom,
        loadDiskToDeviceSlot: loadDiskToDeviceSlot,
        mountImageToDeviceSlot: mountImageToDeviceSlot,
        unmountDeviceSlot: unmountDeviceSlot,
        getMountedDiskForDeviceSlot: getMountedDiskForDeviceSlot,
        hasMountedDiskForDeviceSlot: hasMountedDiskForDeviceSlot,
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
