(function () {
  "use strict";

  function createApi(cfg) {
    const CPU = cfg.CPU;
    const CYCLE_NEVER = cfg.CYCLE_NEVER;
    const CYCLES_PER_LINE = cfg.CYCLES_PER_LINE;
    const IO_INIT_VALUES = cfg.IO_INIT_VALUES;

    function makeIoData(video) {
      const potValues = new Uint8Array(8);
      for (let p = 0; p < 8; p++) potValues[p] = 229;
      return {
        video: {
          verticalScrollOffset: 0,
          currentDisplayLine: 0,
        },
        displayListFetchCycle: 0,
        clock: 0,
        inDrawLine: false,
        dliCycle: CYCLE_NEVER,
        serialOutputNeedDataCycle: CYCLE_NEVER,
        serialOutputTransmissionDoneCycle: CYCLE_NEVER,
        serialInputDataReadyCycle: CYCLE_NEVER,
        timer1Cycle: CYCLE_NEVER,
        timer2Cycle: CYCLE_NEVER,
        timer4Cycle: CYCLE_NEVER,
        // PIA shadow ports (for output mode)
        valuePortA: 0,
        valuePortB: 0,
        // SIO state (ported from Pokey.c)
        sioBuffer: new Uint8Array(1024),
        sioOutIndex: 0,
        sioOutPhase: 0, // 0=command frame, 1=data frame (write/put/verify)
        sioDataIndex: 0,
        sioPendingDevice: 0,
        sioPendingCmd: 0,
        sioPendingSector: 0,
        sioPendingBytes: 0,
        sioInIndex: 0,
        sioInSize: 0,
        // POKEY-ish randomness state (LFSR)
        pokeyLfsr17: 0x1ffff,
        pokeyLfsr17LastCycle: 0,
        // POKEY pot scan (POT0..POT7 / ALLPOT).
        pokeyPotValues: potValues,
        pokeyPotLatched: new Uint8Array(8),
        pokeyPotScanLastCycle: 0,
        pokeyPotScanTerminalCycle: CYCLE_NEVER,
        pokeyPotCounter: 0,
        pokeyPotScanActive: false,
        // Raw trigger inputs (1=released, 0=pressed) and GTIA-latched view.
        trigPhysical: new Uint8Array([1, 1, 1, 1]),
        trigLatched: new Uint8Array([1, 1, 1, 1]),
        currentDisplayListCommand: 0,
        nextDisplayListLine: 8,
        displayListAddress: 0,
        rowDisplayMemoryAddress: 0,
        displayMemoryAddress: 0,
        firstRowScanline: false,
        nmiTiming: {
          enabledByCycle7: 0,
          enabledByCycle8: 0,
          enabledOnCycle7Mask: 0,
        },
        chbaseTiming: {
          rawValue: 0,
          activeValue: 0,
          pendingValue: 0,
          pendingClock: -1,
          initialized: false,
        },
        drawLine: {
          displayMemoryAddress: 0,
          bytesPerLine: 0,
          destIndex: 0,
          playfieldDmaStealCount: 0,
          refreshDmaPending: 0,
          displayListInstructionDmaPending: 0,
          displayListAddressDmaRemaining: 0,
          playerMissileClockActive: false,
          playerMissileInterleaved: false,
          playfieldLineBuffer: new Uint8Array(48),
          scheduledPlayfieldDma: new Uint8Array(CYCLES_PER_LINE),
        },
        keyPressCounter: 0,
        // Shim from the C version: optionally force OPTION held during the OS boot check
        // (disables BASIC without requiring a key press timing window).
        optionOnStart: false,
        sioTurbo: true,
        deviceSlots: new Int16Array([-1, -1, -1, -1, -1, -1, -1, -1]),
        diskImages: [],
        basicRom: null,
        osRom: null,
        selfTestRom: null,
        floatingPointRom: null,
        pokeyAudio: null,
        videoOut: video,
      };
    }

    function cycleTimedEventUpdate(ctx) {
      const io = ctx.ioData;
      let beamNext = CYCLE_NEVER;
      let masterNext = CYCLE_NEVER;

      if (!io.inDrawLine && io.displayListFetchCycle < masterNext) {
        masterNext = io.displayListFetchCycle;
      }
      if (io.dliCycle < beamNext) beamNext = io.dliCycle;

      if (io.serialOutputTransmissionDoneCycle < masterNext) {
        masterNext = io.serialOutputTransmissionDoneCycle;
      }
      if (io.serialOutputNeedDataCycle < masterNext) {
        masterNext = io.serialOutputNeedDataCycle;
      }
      if (io.serialInputDataReadyCycle < masterNext) {
        masterNext = io.serialInputDataReadyCycle;
      }
      if (io.timer1Cycle < masterNext) masterNext = io.timer1Cycle;
      if (io.timer2Cycle < masterNext) masterNext = io.timer2Cycle;
      if (io.timer4Cycle < masterNext) masterNext = io.timer4Cycle;

      ctx.ioBeamTimedEventCycle = beamNext;
      ctx.ioMasterTimedEventCycle = masterNext;
      ctx.ioCycleTimedEventCycle = masterNext;
    }

    function initHardwareDefaults(ctx) {
      for (let i = 0; i < IO_INIT_VALUES.length; i++) {
        const e = IO_INIT_VALUES[i];
        ctx.sram[e.addr] = e.write & 0xff;
        ctx.ram[e.addr] = e.read & 0xff;
      }
    }

    function installIoHandlers(ctx, ioAccess) {
      if (!ioAccess) throw new Error("A8EState: missing ioAccess");
      for (let i = 0; i < IO_INIT_VALUES.length; i++) {
        CPU.setIo(ctx, IO_INIT_VALUES[i].addr, ioAccess);
      }
    }

    return {
      makeIoData: makeIoData,
      cycleTimedEventUpdate: cycleTimedEventUpdate,
      initHardwareDefaults: initHardwareDefaults,
      installIoHandlers: installIoHandlers,
    };
  }

  window.A8EState = {
    createApi: createApi,
  };
})();
