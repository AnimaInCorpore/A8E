(function () {
  "use strict";

  function createApi(cfg) {
    var CPU = cfg.CPU;
    var IO_PORTB = cfg.IO_PORTB;

    function createRuntime(opts) {
      var machine = opts.machine;
      var video = opts.video;
      var ioCycleTimedEvent = opts.ioCycleTimedEvent;
      var makeIoData = opts.makeIoData;
      var cycleTimedEventUpdate = opts.cycleTimedEventUpdate;
      var initHardwareDefaults = opts.initHardwareDefaults;
      var installIoHandlers = opts.installIoHandlers;
      var ioAccess = opts.ioAccess;
      var getOptionOnStart = opts.getOptionOnStart;
      var getSioTurbo = opts.getSioTurbo;
      var getTurbo = opts.getTurbo;
      var pokeyAudioResetState = opts.pokeyAudioResetState;
      var pokeyAudioSetTurbo = opts.pokeyAudioSetTurbo;

      function setupMemoryMap() {
        var ctx = machine.ctx;
        var ram = ctx.ram;
        var sram = ctx.sram;
        var io = ctx.ioData;
        var portB = sram[IO_PORTB] & 0xff;

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
        machine.ctx.cycleCounter = 0;
        machine.ctx.stallCycleCounter = 0;
        machine.ctx.irqPending = 0;
        machine.ctx.ioData = makeIoData(video);
        machine.ctx.ioData.optionOnStart = !!getOptionOnStart();
        machine.ctx.ioData.sioTurbo = !!getSioTurbo();
        machine.ctx.ioData.disk1 = machine.media.disk1;
        machine.ctx.ioData.disk1Size = machine.media.disk1Size | 0;
        machine.ctx.ioData.disk1Name = machine.media.disk1Name;
        machine.ctx.ioData.basicRom = machine.media.basicRom;
        machine.ctx.ioData.osRom = machine.media.osRom;
        machine.ctx.ioData.selfTestRom = machine.media.selfTestRom;
        machine.ctx.ioData.floatingPointRom = machine.media.floatingPointRom;
        machine.ctx.ioData.pokeyAudio = machine.audioState;
        machine.ctx.ioCycleTimedEventFunction = ioCycleTimedEvent;
        cycleTimedEventUpdate(machine.ctx);
        initHardwareDefaults(machine.ctx);
        installIoHandlers(machine.ctx, ioAccess);
        setupMemoryMap();
        CPU.reset(machine.ctx);
        if (machine.audioState) {
          var turbo = !!getTurbo();
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
        var bytes = new Uint8Array(arrayBuffer);
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
        var bytes = new Uint8Array(arrayBuffer);
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
        var bytes = new Uint8Array(arrayBuffer);
        machine.media.disk1 = bytes;
        machine.media.disk1Size = bytes.length | 0;
        machine.media.disk1Name = name || "disk.atr";
        machine.ctx.ioData.disk1 = machine.media.disk1;
        machine.ctx.ioData.disk1Size = machine.media.disk1Size | 0;
        machine.ctx.ioData.disk1Name = machine.media.disk1Name;
      }

      return {
        setupMemoryMap: setupMemoryMap,
        hardReset: hardReset,
        loadOsRom: loadOsRom,
        loadBasicRom: loadBasicRom,
        loadDisk1: loadDisk1,
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
