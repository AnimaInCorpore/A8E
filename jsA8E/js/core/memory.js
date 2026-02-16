(function () {
  "use strict";

  function createApi(cfg) {
    const CPU = cfg.CPU;
    const IO_PORTB = cfg.IO_PORTB;
    const HOST_SLOT_COUNT = 8;
    const DEVICE_SLOT_COUNT = 8;

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
        for (let i = 0; i < DEVICE_SLOT_COUNT; i++) slots[i] = i;
        return slots;
      }

      function ensureMediaLayout() {
        if (!machine.media) machine.media = {};
        if (!Array.isArray(machine.media.hostSlots))
          machine.media.hostSlots = new Array(HOST_SLOT_COUNT).fill(null);
        if (!(machine.media.deviceSlots instanceof Int16Array))
          machine.media.deviceSlots = makeDefaultDeviceSlots();
        if (!Array.isArray(machine.media.diskImages)) machine.media.diskImages = [];
      }

      function syncLegacyDisk1MirrorFromSlots() {
        ensureMediaLayout();
        const d1Index = machine.media.deviceSlots[0] | 0;
        const image =
          d1Index >= 0 && d1Index < machine.media.diskImages.length
            ? machine.media.diskImages[d1Index]
            : null;
        if (!image || !image.bytes) {
          machine.media.disk1 = null;
          machine.media.disk1Size = 0;
          machine.media.disk1Name = null;
          return;
        }
        machine.media.disk1 = image.bytes;
        machine.media.disk1Size = image.size | 0;
        machine.media.disk1Name = image.name || "disk.atr";
      }

      function copyMediaToIoData() {
        const io = machine.ctx.ioData;
        ensureMediaLayout();
        syncLegacyDisk1MirrorFromSlots();
        io.hostSlots = machine.media.hostSlots;
        io.deviceSlots = machine.media.deviceSlots;
        io.diskImages = machine.media.diskImages;
        io.disk1 = machine.media.disk1;
        io.disk1Size = machine.media.disk1Size | 0;
        io.disk1Name = machine.media.disk1Name;
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
        syncLegacyDisk1MirrorFromSlots();
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

      function loadDisk1(arrayBuffer, name) {
        ensureMediaLayout();
        const bytes = new Uint8Array(arrayBuffer);
        machine.media.diskImages[0] = createDiskImage(bytes, name || "disk.atr");
        machine.media.hostSlots[0] = 0;
        machine.media.deviceSlots[0] = 0;
        copyMediaToIoData();
      }

      function loadDiskToHostSlot(arrayBuffer, name, hostSlotIndex) {
        ensureMediaLayout();
        const slot = hostSlotIndex | 0;
        if (slot < 0 || slot >= HOST_SLOT_COUNT) {
          throw new Error("Host slot out of range: " + slot);
        }
        const bytes = new Uint8Array(arrayBuffer);
        const image = createDiskImage(bytes, name || "disk.atr");
        const imageIndex = machine.media.diskImages.length | 0;
        machine.media.diskImages.push(image);
        machine.media.hostSlots[slot] = imageIndex;
        copyMediaToIoData();
        return imageIndex;
      }

      function mountHostSlotToDeviceSlot(hostSlotIndex, deviceSlotIndex) {
        ensureMediaLayout();
        const hostSlot = hostSlotIndex | 0;
        const deviceSlot = deviceSlotIndex | 0;
        if (hostSlot < 0 || hostSlot >= HOST_SLOT_COUNT) {
          throw new Error("Host slot out of range: " + hostSlot);
        }
        if (deviceSlot < 0 || deviceSlot >= DEVICE_SLOT_COUNT) {
          throw new Error("Device slot out of range: " + deviceSlot);
        }
        const imageIndex = machine.media.hostSlots[hostSlot];
        machine.media.deviceSlots[deviceSlot] =
          imageIndex === null || imageIndex === undefined ? -1 : imageIndex | 0;
        copyMediaToIoData();
      }

      return {
        setupMemoryMap: setupMemoryMap,
        hardReset: hardReset,
        loadOsRom: loadOsRom,
        loadBasicRom: loadBasicRom,
        loadDisk1: loadDisk1,
        loadDiskToHostSlot: loadDiskToHostSlot,
        mountHostSlotToDeviceSlot: mountHostSlotToDeviceSlot,
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
