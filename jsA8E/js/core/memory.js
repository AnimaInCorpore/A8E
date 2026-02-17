(function () {
  "use strict";

  function createApi(cfg) {
    const CPU = cfg.CPU;
    const IO_PORTB = cfg.IO_PORTB;
    const HOST_SLOT_COUNT = 8;
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

      function normalizeHostSlotIndex(hostSlotIndex) {
        const hostSlot = hostSlotIndex | 0;
        if (hostSlot < 0 || hostSlot >= HOST_SLOT_COUNT) {
          throw new Error("Host slot out of range: " + hostSlot);
        }
        return hostSlot;
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
        if (
          machine.media.hostSlots[0] === null ||
          machine.media.hostSlots[0] === undefined
        ) {
          machine.media.hostSlots[0] = imageIndex;
        }
        if ((machine.media.deviceSlots[0] | 0) === NO_IMAGE_MOUNTED) {
          machine.media.deviceSlots[0] = imageIndex;
        }
        return true;
      }

      function ensureMediaLayout() {
        if (!machine.media) machine.media = {};
        if (!Array.isArray(machine.media.hostSlots))
          machine.media.hostSlots = new Array(HOST_SLOT_COUNT).fill(null);
        else if (machine.media.hostSlots.length !== HOST_SLOT_COUNT)
          machine.media.hostSlots = new Array(HOST_SLOT_COUNT).fill(null);
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
        io.hostSlots = machine.media.hostSlots;
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

      function loadDiskToHostSlot(arrayBuffer, name, hostSlotIndex) {
        ensureMediaLayout();
        const hostSlot = normalizeHostSlotIndex(hostSlotIndex);
        const bytes = new Uint8Array(arrayBuffer);
        const hostImageIndex = machine.media.hostSlots[hostSlot];
        const imageIndex = storeDiskImage(bytes, name, hostImageIndex);
        machine.media.hostSlots[hostSlot] = imageIndex;
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

      function mountHostSlotToDeviceSlot(hostSlotIndex, deviceSlotIndex) {
        ensureMediaLayout();
        const hostSlot = normalizeHostSlotIndex(hostSlotIndex);
        const deviceSlot = normalizeDeviceSlotIndex(deviceSlotIndex);
        const imageIndex = machine.media.hostSlots[hostSlot];
        machine.media.deviceSlots[deviceSlot] =
          imageIndex === null || imageIndex === undefined
            ? NO_IMAGE_MOUNTED
            : imageIndex | 0;
        copyMediaToIoData();
      }

      function loadDiskToDeviceSlot(
        arrayBuffer,
        name,
        deviceSlotIndex,
        hostSlotIndex,
      ) {
        ensureMediaLayout();
        const deviceSlot = normalizeDeviceSlotIndex(deviceSlotIndex);
        // hostSlotIndex is optional. When omitted, this call only mounts to the
        // target device slot and leaves host slot bindings unchanged.
        const hasHostSlot =
          hostSlotIndex !== undefined && hostSlotIndex !== null;
        const hostSlot = hasHostSlot ? normalizeHostSlotIndex(hostSlotIndex) : -1;
        const hostImageIndex = hasHostSlot
          ? machine.media.hostSlots[hostSlot]
          : NO_IMAGE_MOUNTED;
        const deviceImageIndex = machine.media.deviceSlots[deviceSlot] | 0;
        const preferredImageIndex = isValidImageIndex(hostImageIndex)
          ? hostImageIndex
          : isValidImageIndex(deviceImageIndex)
            ? deviceImageIndex
            : NO_IMAGE_MOUNTED;
        const bytes = new Uint8Array(arrayBuffer);
        const imageIndex = storeDiskImage(bytes, name, preferredImageIndex);
        if (hasHostSlot) {
          machine.media.hostSlots[hostSlot] = imageIndex;
        }
        machine.media.deviceSlots[deviceSlot] = imageIndex;
        copyMediaToIoData();
        return imageIndex;
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
        loadDiskToHostSlot: loadDiskToHostSlot,
        loadDiskToDeviceSlot: loadDiskToDeviceSlot,
        mountHostSlotToDeviceSlot: mountHostSlotToDeviceSlot,
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
