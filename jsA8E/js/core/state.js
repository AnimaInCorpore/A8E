(function () {
  "use strict";

  function createApi(cfg) {
    let CPU = cfg.CPU;
    let CYCLES_PER_LINE = cfg.CYCLES_PER_LINE;
    let CYCLE_NEVER = cfg.CYCLE_NEVER;
    let IO_INIT_VALUES = cfg.IO_INIT_VALUES;

    function makeIoData(video) {
      let potValues = new Uint8Array(8);
      for (let p = 0; p < 8; p++) potValues[p] = 228;
      return {
        video: {
          verticalScrollOffset: 0,
          currentDisplayLine: 0,
        },
        drawLineCycle: CYCLES_PER_LINE + 16,
        displayListFetchCycle: CYCLES_PER_LINE,
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
        // POKEY pot scan (POT0..POT7 / ALLPOT) -- minimal but time-based.
        pokeyPotValues: potValues,
        pokeyPotLatched: new Uint8Array(8),
        pokeyPotAllPot: 0xff,
        pokeyPotScanStartCycle: 0,
        pokeyPotScanActive: false,
        // Raw trigger inputs (1=released, 0=pressed) and GTIA-latched view.
        trigPhysical: new Uint8Array([1, 1, 1, 1]),
        trigLatched: new Uint8Array([1, 1, 1, 1]),
        currentDisplayListCommand: 0,
        nextDisplayListLine: 8,
        displayListAddress: 0,
        displayMemoryAddress: 0,
        drawLine: {
          displayMemoryAddress: 0,
          bytesPerLine: 0,
          destIndex: 0,
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
      let io = ctx.ioData;
      let next = CYCLE_NEVER;
      if (io.drawLineCycle < next) next = io.drawLineCycle;
      if (io.displayListFetchCycle < next) next = io.displayListFetchCycle;
      if (io.dliCycle < next) next = io.dliCycle;
      if (io.serialOutputTransmissionDoneCycle < next)
        next = io.serialOutputTransmissionDoneCycle;
      if (io.serialOutputNeedDataCycle < next)
        next = io.serialOutputNeedDataCycle;
      if (io.serialInputDataReadyCycle < next)
        next = io.serialInputDataReadyCycle;
      if (io.timer1Cycle < next) next = io.timer1Cycle;
      if (io.timer2Cycle < next) next = io.timer2Cycle;
      if (io.timer4Cycle < next) next = io.timer4Cycle;
      ctx.ioCycleTimedEventCycle = next;
    }

    function initHardwareDefaults(ctx) {
      for (let i = 0; i < IO_INIT_VALUES.length; i++) {
        let e = IO_INIT_VALUES[i];
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
