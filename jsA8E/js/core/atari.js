(function () {
  "use strict";

  var Util = window.A8EUtil;
  var CPU = window.A8E6502;
  var Palette = window.A8EPalette;

  // --- Constants (from AtariIo.h / Antic.h / Gtia.h / Pokey.h / Pia.h) ---
  var PIXELS_PER_LINE = 456;
  var LINES_PER_SCREEN_PAL = 312;
  var COLOR_CLOCKS_PER_LINE = PIXELS_PER_LINE / 2;
  var CYCLES_PER_LINE = COLOR_CLOCKS_PER_LINE / 2; // 114
  var ATARI_CPU_HZ_PAL = 1773447;
  var CYCLE_NEVER = Infinity;

  var FIRST_VISIBLE_LINE = 8;
  var LAST_VISIBLE_LINE = 247;

  var SERIAL_OUTPUT_DATA_NEEDED_CYCLES = 900;
  var SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES = 1500;
  var SERIAL_INPUT_FIRST_DATA_READY_CYCLES = 3000;
  var SERIAL_INPUT_DATA_READY_CYCLES = 900;
  var SIO_TURBO_EMU_MULTIPLIER = 4.0;
  // Keep enough history to survive slow frames without dropping audible state.
  var POKEY_AUDIO_MAX_CATCHUP_CYCLES = 200000;

  var NMI_DLI = 0x80;
  var NMI_VBI = 0x40;
  var NMI_RESET = 0x20;

  // PIA
  var IO_PORTA = 0xd300;
  var IO_PORTB = 0xd301;
  var IO_PACTL = 0xd302;
  var IO_PBCTL = 0xd303;

  // GTIA
  var IO_HPOSP0_M0PF = 0xd000;
  var IO_HPOSP1_M1PF = 0xd001;
  var IO_HPOSP2_M2PF = 0xd002;
  var IO_HPOSP3_M3PF = 0xd003;
  var IO_HPOSM0_P0PF = 0xd004;
  var IO_HPOSM1_P1PF = 0xd005;
  var IO_HPOSM2_P2PF = 0xd006;
  var IO_HPOSM3_P3PF = 0xd007;
  var IO_SIZEP0_M0PL = 0xd008;
  var IO_SIZEP1_M1PL = 0xd009;
  var IO_SIZEP2_M2PL = 0xd00a;
  var IO_SIZEP3_M3PL = 0xd00b;
  var IO_SIZEM_P0PL = 0xd00c;
  var IO_GRAFP0_P1PL = 0xd00d;
  var IO_GRAFP1_P2PL = 0xd00e;
  var IO_GRAFP2_P3PL = 0xd00f;
  var IO_GRAFP3_TRIG0 = 0xd010;
  var IO_GRAFM_TRIG1 = 0xd011;
  var IO_COLPM0_TRIG2 = 0xd012;
  var IO_COLPM1_TRIG3 = 0xd013;
  var IO_COLPM2_PAL = 0xd014;
  var IO_COLPM3 = 0xd015;
  var IO_COLPF0 = 0xd016;
  var IO_COLPF1 = 0xd017;
  var IO_COLPF2 = 0xd018;
  var IO_COLPF3 = 0xd019;
  var IO_COLBK = 0xd01a;
  var IO_PRIOR = 0xd01b;
  var IO_VDELAY = 0xd01c;
  var IO_GRACTL = 0xd01d;
  var IO_HITCLR = 0xd01e;
  var IO_CONSOL = 0xd01f;

  // POKEY
  var IO_AUDF1_POT0 = 0xd200;
  var IO_AUDC1_POT1 = 0xd201;
  var IO_AUDF2_POT2 = 0xd202;
  var IO_AUDC2_POT3 = 0xd203;
  var IO_AUDF3_POT4 = 0xd204;
  var IO_AUDC3_POT5 = 0xd205;
  var IO_AUDF4_POT6 = 0xd206;
  var IO_AUDC4_POT7 = 0xd207;
  var IO_AUDCTL_ALLPOT = 0xd208;
  // combined read/write addresses:
  var IO_STIMER_KBCODE = 0xd209; // write STIMER / read KBCODE
  var IO_SKREST_RANDOM = 0xd20a; // write SKREST / read RANDOM
  var IO_POTGO = 0xd20b;
  var IO_SEROUT_SERIN = 0xd20d; // write SEROUT / read SERIN
  var IO_IRQEN_IRQST = 0xd20e; // write IRQEN / read IRQST
  var IO_SKCTL_SKSTAT = 0xd20f; // write SKCTL / read SKSTAT

  var IRQ_TIMER_1 = 0x01;
  var IRQ_TIMER_2 = 0x02;
  var IRQ_TIMER_4 = 0x04;
  var IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE = 0x08;
  var IRQ_SERIAL_OUTPUT_DATA_NEEDED = 0x10;
  var IRQ_SERIAL_INPUT_DATA_READY = 0x20;
  var IRQ_OTHER_KEY_PRESSED = 0x40;
  var IRQ_BREAK_KEY_PRESSED = 0x80;

  // ANTIC
  var IO_DMACTL = 0xd400;
  var IO_CHACTL = 0xd401;
  var IO_DLISTL = 0xd402;
  var IO_DLISTH = 0xd403;
  var IO_HSCROL = 0xd404;
  var IO_VSCROL = 0xd405;
  var IO_PMBASE = 0xd407;
  var IO_CHBASE = 0xd409;
  var IO_WSYNC = 0xd40a;
  var IO_VCOUNT = 0xd40b;
  var IO_PENH = 0xd40c;
  var IO_PENV = 0xd40d;
  var IO_NMIEN = 0xd40e;
  var IO_NMIRES_NMIST = 0xd40f;

  // Viewport from A8E.c
  var VIEW_W = 336;
  var VIEW_H = 240;
  var VIEW_X = (16 + 12 + 6 + 10 + 4) * 2 + 160 - VIEW_W / 2; // 88
  var VIEW_Y = 8;

  // Priority bits (from Antic.c)
  var PRIO_BKG = 0x00;
  var PRIO_PF0 = 0x01;
  var PRIO_PF1 = 0x02;
  var PRIO_PF2 = 0x04;
  var PRIO_PF3 = 0x08;
  var PRIO_PM0 = 0x10;
  var PRIO_PM1 = 0x20;
  var PRIO_PM2 = 0x40;
  var PRIO_PM3 = 0x80;
  var PRIORITY_TABLE_BKG_PF012 = new Uint8Array([PRIO_BKG, PRIO_PF0, PRIO_PF1, PRIO_PF2]);
  var PRIORITY_TABLE_BKG_PF013 = new Uint8Array([PRIO_BKG, PRIO_PF0, PRIO_PF1, PRIO_PF3]);
  var PRIORITY_TABLE_PF0123 = new Uint8Array([PRIO_PF0, PRIO_PF1, PRIO_PF2, PRIO_PF3]);
  var SCRATCH_GTIA_COLOR_TABLE = new Uint8Array(16);
  var SCRATCH_COLOR_TABLE_A = new Uint8Array(4);
  var SCRATCH_COLOR_TABLE_B = new Uint8Array(4);
  var SCRATCH_BACKGROUND_TABLE = new Uint8Array(4);

  function fillGtiaColorTable(sram, out) {
    out[0] = sram[IO_COLPM0_TRIG2] & 0xff;
    out[1] = sram[IO_COLPM1_TRIG3] & 0xff;
    out[2] = sram[IO_COLPM2_PAL] & 0xff;
    out[3] = sram[IO_COLPM3] & 0xff;
    out[4] = sram[IO_COLPF0] & 0xff;
    out[5] = sram[IO_COLPF1] & 0xff;
    out[6] = sram[IO_COLPF2] & 0xff;
    out[7] = sram[IO_COLPF3] & 0xff;
    out[8] = sram[IO_COLBK] & 0xff;
    out[9] = sram[IO_COLBK] & 0xff;
    out[10] = sram[IO_COLBK] & 0xff;
    out[11] = sram[IO_COLBK] & 0xff;
    out[12] = sram[IO_COLPF0] & 0xff;
    out[13] = sram[IO_COLPF1] & 0xff;
    out[14] = sram[IO_COLPF2] & 0xff;
    out[15] = sram[IO_COLPF3] & 0xff;
  }

  function fillBkgPf012ColorTable(sram, out) {
    out[0] = sram[IO_COLBK] & 0xff;
    out[1] = sram[IO_COLPF0] & 0xff;
    out[2] = sram[IO_COLPF1] & 0xff;
    out[3] = sram[IO_COLPF2] & 0xff;
  }

  function decodeTextModeCharacter(ch, chactl) {
    ch &= 0xff;
    if (!(ch & 0x80)) return ch;
    if (chactl & 0x01) return 0x00; // blank/space for high-bit characters
    ch &= 0x7f;
    return (chactl & 0x02) ? (ch | 0x100) : ch;
  }

  // --- Minimal ANTIC mode info (ported from AtariIo.c) ---
  var ANTIC_MODE_INFO = [
    { lines: 0, ppb: 0 }, // 0
    { lines: 0, ppb: 0 }, // 1 (JMP)
    { lines: 8, ppb: 8 }, // 2
    { lines: 10, ppb: 8 }, // 3
    { lines: 8, ppb: 8 }, // 4
    { lines: 16, ppb: 8 }, // 5
    { lines: 8, ppb: 16 }, // 6
    { lines: 16, ppb: 16 }, // 7
    { lines: 8, ppb: 32 }, // 8
    { lines: 4, ppb: 32 }, // 9
    { lines: 4, ppb: 16 }, // A
    { lines: 2, ppb: 16 }, // B
    { lines: 1, ppb: 16 }, // C
    { lines: 2, ppb: 8 }, // D
    { lines: 1, ppb: 8 }, // E
    { lines: 1, ppb: 8 }, // F
  ];

  // IO register defaults (write-shadow vs read-side RAM) from AtariIo.c.
  var IO_INIT_VALUES = [
    // GTIA
    { addr: IO_HPOSP0_M0PF, write: 0x00, read: 0x00 },
    { addr: IO_HPOSP1_M1PF, write: 0x00, read: 0x00 },
    { addr: IO_HPOSP2_M2PF, write: 0x00, read: 0x00 },
    { addr: IO_HPOSP3_M3PF, write: 0x00, read: 0x00 },
    { addr: IO_HPOSM0_P0PF, write: 0x00, read: 0x00 },
    { addr: IO_HPOSM1_P1PF, write: 0x00, read: 0x00 },
    { addr: IO_HPOSM2_P2PF, write: 0x00, read: 0x00 },
    { addr: IO_HPOSM3_P3PF, write: 0x00, read: 0x00 },
    { addr: IO_SIZEP0_M0PL, write: 0x00, read: 0x00 },
    { addr: IO_SIZEP1_M1PL, write: 0x00, read: 0x00 },
    { addr: IO_SIZEP2_M2PL, write: 0x00, read: 0x00 },
    { addr: IO_SIZEP3_M3PL, write: 0x00, read: 0x00 },
    { addr: IO_SIZEM_P0PL, write: 0x00, read: 0x00 },
    { addr: IO_GRAFP0_P1PL, write: 0x00, read: 0x00 },
    { addr: IO_GRAFP1_P2PL, write: 0x00, read: 0x00 },
    { addr: IO_GRAFP2_P3PL, write: 0x00, read: 0x00 },
    { addr: IO_GRAFP3_TRIG0, write: 0x00, read: 0x01 },
    { addr: IO_GRAFM_TRIG1, write: 0x00, read: 0x01 },
    { addr: IO_COLPM0_TRIG2, write: 0x00, read: 0x01 },
    { addr: IO_COLPM1_TRIG3, write: 0x00, read: 0x01 },
    { addr: IO_COLPM2_PAL, write: 0x00, read: 0x01 },
    { addr: IO_COLPM3, write: 0x00, read: 0x0f },
    { addr: IO_COLPF0, write: 0x00, read: 0x0f },
    { addr: IO_COLPF1, write: 0x00, read: 0x0f },
    { addr: IO_COLPF2, write: 0x00, read: 0x0f },
    { addr: IO_COLPF3, write: 0x00, read: 0x0f },
    { addr: IO_COLBK, write: 0x00, read: 0x0f },
    { addr: IO_PRIOR, write: 0x00, read: 0xff },
    { addr: IO_VDELAY, write: 0x00, read: 0xff },
    { addr: IO_GRACTL, write: 0x00, read: 0xff },
    { addr: IO_HITCLR, write: 0x00, read: 0xff },
    { addr: IO_CONSOL, write: 0x00, read: 0x07 },

    // POKEY
    { addr: IO_AUDF1_POT0, write: 0x00, read: 0xff },
    { addr: IO_AUDC1_POT1, write: 0x00, read: 0xff },
    { addr: IO_AUDF2_POT2, write: 0x00, read: 0xff },
    { addr: IO_AUDC2_POT3, write: 0x00, read: 0xff },
    { addr: IO_AUDF3_POT4, write: 0x00, read: 0xff },
    { addr: IO_AUDC3_POT5, write: 0x00, read: 0xff },
    { addr: IO_AUDF4_POT6, write: 0x00, read: 0xff },
    { addr: IO_AUDC4_POT7, write: 0x00, read: 0xff },
    { addr: IO_AUDCTL_ALLPOT, write: 0x00, read: 0xff },
    { addr: IO_STIMER_KBCODE, write: 0x00, read: 0xff },
    { addr: IO_SKREST_RANDOM, write: 0x00, read: 0xff },
    { addr: IO_POTGO, write: 0x00, read: 0xff },
    { addr: IO_SEROUT_SERIN, write: 0x00, read: 0xff },
    { addr: IO_IRQEN_IRQST, write: 0x00, read: 0xff },
    { addr: IO_SKCTL_SKSTAT, write: 0x00, read: 0xff },

    // PIA
    { addr: IO_PORTA, write: 0xff, read: 0xff },
    { addr: IO_PORTB, write: 0xfd, read: 0xfd },
    { addr: IO_PACTL, write: 0x00, read: 0x3c },
    { addr: IO_PBCTL, write: 0x00, read: 0x3c },

    // ANTIC
    { addr: IO_DMACTL, write: 0x00, read: 0xff },
    { addr: IO_CHACTL, write: 0x00, read: 0xff },
    { addr: IO_DLISTL, write: 0x00, read: 0xff },
    { addr: IO_DLISTH, write: 0x00, read: 0xff },
    { addr: IO_HSCROL, write: 0x00, read: 0xff },
    { addr: IO_VSCROL, write: 0x00, read: 0xff },
    { addr: IO_PMBASE, write: 0x00, read: 0xff },
    { addr: IO_CHBASE, write: 0x00, read: 0xff },
    { addr: IO_WSYNC, write: 0x00, read: 0xff },
    { addr: IO_VCOUNT, write: 0x00, read: 0x00 },
    { addr: IO_PENH, write: 0x00, read: 0xff },
    { addr: IO_PENV, write: 0x00, read: 0xff },
    { addr: IO_NMIEN, write: 0x00, read: 0xff },
    { addr: IO_NMIRES_NMIST, write: 0x00, read: 0x00 },
  ];

  var keysApi =
    window.A8EKeys && window.A8EKeys.createApi
      ? window.A8EKeys.createApi()
      : null;
  if (!keysApi) throw new Error("A8EKeys is not loaded");
  var KEY_CODE_TABLE = keysApi.KEY_CODE_TABLE;
  var browserKeyToSdlSym = keysApi.browserKeyToSdlSym;
  // --- Video helpers ---
  function makeVideo() {
    var palette = Palette.createAtariPaletteRgb();
    return {
      pixels: new Uint8Array(PIXELS_PER_LINE * LINES_PER_SCREEN_PAL),
      priority: new Uint8Array(PIXELS_PER_LINE * LINES_PER_SCREEN_PAL),
      paletteRgb: palette,
    };
  }

  function blitViewportToImageData(video, imageData) {
    var dst = imageData.data;
    var pal = video.paletteRgb;
    var srcPixels = video.pixels;

    var dstIdx = 0;
    for (var y = 0; y < VIEW_H; y++) {
      var srcRow = (VIEW_Y + y) * PIXELS_PER_LINE + VIEW_X;
      for (var x = 0; x < VIEW_W; x++) {
        var c = srcPixels[srcRow + x] & 0xff;
        var pi = c * 3;
        dst[dstIdx++] = pal[pi + 0];
        dst[dstIdx++] = pal[pi + 1];
        dst[dstIdx++] = pal[pi + 2];
        dst[dstIdx++] = 255;
      }
    }
  }

  function fillLine(video, y, x, w, color, priority) {
    var base = y * PIXELS_PER_LINE + x;
    var pixels = video.pixels;
    var c = color & 0xff;
    if (priority === null || priority === undefined) {
      for (var i = 0; i < w; i++) pixels[base + i] = c;
      return;
    }
    var pr = video.priority;
    var p = priority & 0xff;
    for (var j = 0; j < w; j++) {
      pixels[base + j] = c;
      pr[base + j] = p;
    }
  }

  // --- Minimal Atari IO / timing ---
  function makeIoData(video) {
    var potValues = new Uint8Array(8);
    for (var p = 0; p < 8; p++) potValues[p] = 228;
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
      disk1: null,
      disk1Size: 0,
      disk1Name: null,
      basicRom: null,
      osRom: null,
      selfTestRom: null,
      floatingPointRom: null,
      pokeyAudio: null,
      videoOut: video,
    };
  }

  function cycleTimedEventUpdate(ctx) {
    var io = ctx.ioData;
    var next = CYCLE_NEVER;
    if (io.drawLineCycle < next) next = io.drawLineCycle;
    if (io.displayListFetchCycle < next) next = io.displayListFetchCycle;
    if (io.dliCycle < next) next = io.dliCycle;
    if (io.serialOutputTransmissionDoneCycle < next) next = io.serialOutputTransmissionDoneCycle;
    if (io.serialOutputNeedDataCycle < next) next = io.serialOutputNeedDataCycle;
    if (io.serialInputDataReadyCycle < next) next = io.serialInputDataReadyCycle;
    if (io.timer1Cycle < next) next = io.timer1Cycle;
    if (io.timer2Cycle < next) next = io.timer2Cycle;
    if (io.timer4Cycle < next) next = io.timer4Cycle;
    ctx.ioCycleTimedEventCycle = next;
  }

  // --- POKEY audio (split into core/pokey.js) ---
  var pokeyAudioApi =
    window.A8EPokeyAudio && window.A8EPokeyAudio.createApi
      ? window.A8EPokeyAudio.createApi({
          ATARI_CPU_HZ_PAL: ATARI_CPU_HZ_PAL,
          CYCLES_PER_LINE: CYCLES_PER_LINE,
          POKEY_AUDIO_MAX_CATCHUP_CYCLES: POKEY_AUDIO_MAX_CATCHUP_CYCLES,
          CYCLE_NEVER: CYCLE_NEVER,
          SERIAL_OUTPUT_DATA_NEEDED_CYCLES: SERIAL_OUTPUT_DATA_NEEDED_CYCLES,
          SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES: SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES,
          SERIAL_INPUT_FIRST_DATA_READY_CYCLES: SERIAL_INPUT_FIRST_DATA_READY_CYCLES,
          SERIAL_INPUT_DATA_READY_CYCLES: SERIAL_INPUT_DATA_READY_CYCLES,
          IO_AUDF1_POT0: IO_AUDF1_POT0,
          IO_AUDC1_POT1: IO_AUDC1_POT1,
          IO_AUDF2_POT2: IO_AUDF2_POT2,
          IO_AUDC2_POT3: IO_AUDC2_POT3,
          IO_AUDF3_POT4: IO_AUDF3_POT4,
          IO_AUDC3_POT5: IO_AUDC3_POT5,
          IO_AUDF4_POT6: IO_AUDF4_POT6,
          IO_AUDC4_POT7: IO_AUDC4_POT7,
          IO_AUDCTL_ALLPOT: IO_AUDCTL_ALLPOT,
          IO_STIMER_KBCODE: IO_STIMER_KBCODE,
          IO_SKCTL_SKSTAT: IO_SKCTL_SKSTAT,
          IO_SEROUT_SERIN: IO_SEROUT_SERIN,
          cycleTimedEventUpdate: cycleTimedEventUpdate,
        })
      : null;
  if (!pokeyAudioApi) throw new Error("A8EPokeyAudio is not loaded");

  var pokeyAudioCreateState = pokeyAudioApi.createState;
  var pokeyAudioSetTargetBufferSamples = pokeyAudioApi.setTargetBufferSamples;
  var pokeyAudioSetTurbo = pokeyAudioApi.setTurbo;
  var pokeyAudioDrain = pokeyAudioApi.drain;
  var pokeyAudioClear = pokeyAudioApi.clear;
  var pokeyAudioResetState = pokeyAudioApi.resetState;
  var pokeyAudioOnRegisterWrite = pokeyAudioApi.onRegisterWrite;
  var pokeyAudioSync = pokeyAudioApi.sync;
  var pokeyAudioConsume = pokeyAudioApi.consume;
  var pokeySyncLfsr17 = pokeyAudioApi.syncLfsr17;
  var pokeyPotStartScan = pokeyAudioApi.potStartScan;
  var pokeyPotUpdate = pokeyAudioApi.potUpdate;
  var pokeyTimerPeriodCpuCycles = pokeyAudioApi.timerPeriodCpuCycles;
  var pokeyRestartTimers = pokeyAudioApi.restartTimers;
  var pokeySeroutWrite = pokeyAudioApi.seroutWrite;
  var pokeySerinRead = pokeyAudioApi.serinRead;

  var ioApi =
    window.A8EIo && window.A8EIo.createApi
      ? window.A8EIo.createApi({
          CPU: CPU,
          CYCLES_PER_LINE: CYCLES_PER_LINE,
          NMI_DLI: NMI_DLI,
          NMI_VBI: NMI_VBI,
          NMI_RESET: NMI_RESET,
          IO_AUDC1_POT1: IO_AUDC1_POT1,
          IO_AUDC2_POT3: IO_AUDC2_POT3,
          IO_AUDC3_POT5: IO_AUDC3_POT5,
          IO_AUDC4_POT7: IO_AUDC4_POT7,
          IO_AUDCTL_ALLPOT: IO_AUDCTL_ALLPOT,
          IO_AUDF1_POT0: IO_AUDF1_POT0,
          IO_AUDF2_POT2: IO_AUDF2_POT2,
          IO_AUDF3_POT4: IO_AUDF3_POT4,
          IO_AUDF4_POT6: IO_AUDF4_POT6,
          IO_CHACTL: IO_CHACTL,
          IO_CHBASE: IO_CHBASE,
          IO_COLBK: IO_COLBK,
          IO_COLPF0: IO_COLPF0,
          IO_COLPF1: IO_COLPF1,
          IO_COLPF2: IO_COLPF2,
          IO_COLPF3: IO_COLPF3,
          IO_COLPM0_TRIG2: IO_COLPM0_TRIG2,
          IO_COLPM1_TRIG3: IO_COLPM1_TRIG3,
          IO_COLPM2_PAL: IO_COLPM2_PAL,
          IO_COLPM3: IO_COLPM3,
          IO_CONSOL: IO_CONSOL,
          IO_DLISTH: IO_DLISTH,
          IO_DLISTL: IO_DLISTL,
          IO_DMACTL: IO_DMACTL,
          IO_GRACTL: IO_GRACTL,
          IO_GRAFM_TRIG1: IO_GRAFM_TRIG1,
          IO_GRAFP0_P1PL: IO_GRAFP0_P1PL,
          IO_GRAFP1_P2PL: IO_GRAFP1_P2PL,
          IO_GRAFP2_P3PL: IO_GRAFP2_P3PL,
          IO_GRAFP3_TRIG0: IO_GRAFP3_TRIG0,
          IO_HITCLR: IO_HITCLR,
          IO_HPOSM0_P0PF: IO_HPOSM0_P0PF,
          IO_HPOSM1_P1PF: IO_HPOSM1_P1PF,
          IO_HPOSM2_P2PF: IO_HPOSM2_P2PF,
          IO_HPOSM3_P3PF: IO_HPOSM3_P3PF,
          IO_HPOSP0_M0PF: IO_HPOSP0_M0PF,
          IO_HPOSP1_M1PF: IO_HPOSP1_M1PF,
          IO_HPOSP2_M2PF: IO_HPOSP2_M2PF,
          IO_HPOSP3_M3PF: IO_HPOSP3_M3PF,
          IO_HSCROL: IO_HSCROL,
          IO_IRQEN_IRQST: IO_IRQEN_IRQST,
          IO_NMIEN: IO_NMIEN,
          IO_NMIRES_NMIST: IO_NMIRES_NMIST,
          IO_PACTL: IO_PACTL,
          IO_PBCTL: IO_PBCTL,
          IO_PENH: IO_PENH,
          IO_PENV: IO_PENV,
          IO_PMBASE: IO_PMBASE,
          IO_PORTA: IO_PORTA,
          IO_PORTB: IO_PORTB,
          IO_POTGO: IO_POTGO,
          IO_PRIOR: IO_PRIOR,
          IO_SEROUT_SERIN: IO_SEROUT_SERIN,
          IO_SIZEM_P0PL: IO_SIZEM_P0PL,
          IO_SIZEP0_M0PL: IO_SIZEP0_M0PL,
          IO_SIZEP1_M1PL: IO_SIZEP1_M1PL,
          IO_SIZEP2_M2PL: IO_SIZEP2_M2PL,
          IO_SIZEP3_M3PL: IO_SIZEP3_M3PL,
          IO_SKCTL_SKSTAT: IO_SKCTL_SKSTAT,
          IO_SKREST_RANDOM: IO_SKREST_RANDOM,
          IO_STIMER_KBCODE: IO_STIMER_KBCODE,
          IO_VCOUNT: IO_VCOUNT,
          IO_VDELAY: IO_VDELAY,
          IO_VSCROL: IO_VSCROL,
          IO_WSYNC: IO_WSYNC,
          pokeyAudioSync: pokeyAudioSync,
          pokeyAudioOnRegisterWrite: pokeyAudioOnRegisterWrite,
          pokeyPotStartScan: pokeyPotStartScan,
          pokeyRestartTimers: pokeyRestartTimers,
          pokeySyncLfsr17: pokeySyncLfsr17,
          pokeySeroutWrite: pokeySeroutWrite,
          pokeySerinRead: pokeySerinRead,
          pokeyPotUpdate: pokeyPotUpdate,
        })
      : null;
  if (!ioApi) throw new Error("A8EIo is not loaded");
  var ioAccess = ioApi.ioAccess;
  var gtiaApi =
    window.A8EGtia && window.A8EGtia.createApi
      ? window.A8EGtia.createApi({
          PIXELS_PER_LINE: PIXELS_PER_LINE,
          IO_COLPF3: IO_COLPF3,
          IO_COLPM0_TRIG2: IO_COLPM0_TRIG2,
          IO_COLPM1_TRIG3: IO_COLPM1_TRIG3,
          IO_COLPM2_PAL: IO_COLPM2_PAL,
          IO_COLPM3: IO_COLPM3,
          IO_DMACTL: IO_DMACTL,
          IO_GRACTL: IO_GRACTL,
          IO_GRAFM_TRIG1: IO_GRAFM_TRIG1,
          IO_GRAFP0_P1PL: IO_GRAFP0_P1PL,
          IO_GRAFP1_P2PL: IO_GRAFP1_P2PL,
          IO_GRAFP2_P3PL: IO_GRAFP2_P3PL,
          IO_GRAFP3_TRIG0: IO_GRAFP3_TRIG0,
          IO_HPOSM0_P0PF: IO_HPOSM0_P0PF,
          IO_HPOSM1_P1PF: IO_HPOSM1_P1PF,
          IO_HPOSM2_P2PF: IO_HPOSM2_P2PF,
          IO_HPOSM3_P3PF: IO_HPOSM3_P3PF,
          IO_HPOSP0_M0PF: IO_HPOSP0_M0PF,
          IO_HPOSP1_M1PF: IO_HPOSP1_M1PF,
          IO_HPOSP2_M2PF: IO_HPOSP2_M2PF,
          IO_HPOSP3_M3PF: IO_HPOSP3_M3PF,
          IO_PMBASE: IO_PMBASE,
          IO_PRIOR: IO_PRIOR,
          IO_SIZEM_P0PL: IO_SIZEM_P0PL,
          IO_SIZEP0_M0PL: IO_SIZEP0_M0PL,
          IO_SIZEP1_M1PL: IO_SIZEP1_M1PL,
          IO_SIZEP2_M2PL: IO_SIZEP2_M2PL,
          IO_SIZEP3_M3PL: IO_SIZEP3_M3PL,
          IO_VDELAY: IO_VDELAY,
          PRIO_PF0: PRIO_PF0,
          PRIO_PF1: PRIO_PF1,
          PRIO_PF2: PRIO_PF2,
          PRIO_PF3: PRIO_PF3,
          PRIO_PM0: PRIO_PM0,
          PRIO_PM1: PRIO_PM1,
          PRIO_PM2: PRIO_PM2,
          PRIO_PM3: PRIO_PM3,
        })
      : null;
  if (!gtiaApi) throw new Error("A8EGtia is not loaded");
  var drawPlayerMissiles = gtiaApi.drawPlayerMissiles;

  var anticApi =
    window.A8EAntic && window.A8EAntic.createApi
      ? window.A8EAntic.createApi({
          CPU: CPU,
          Util: Util,
          PIXELS_PER_LINE: PIXELS_PER_LINE,
          CYCLES_PER_LINE: CYCLES_PER_LINE,
          LINES_PER_SCREEN_PAL: LINES_PER_SCREEN_PAL,
          CYCLE_NEVER: CYCLE_NEVER,
          FIRST_VISIBLE_LINE: FIRST_VISIBLE_LINE,
          LAST_VISIBLE_LINE: LAST_VISIBLE_LINE,
          NMI_DLI: NMI_DLI,
          NMI_VBI: NMI_VBI,
          IRQ_TIMER_1: IRQ_TIMER_1,
          IRQ_TIMER_2: IRQ_TIMER_2,
          IRQ_TIMER_4: IRQ_TIMER_4,
          IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE: IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE,
          IRQ_SERIAL_OUTPUT_DATA_NEEDED: IRQ_SERIAL_OUTPUT_DATA_NEEDED,
          IRQ_SERIAL_INPUT_DATA_READY: IRQ_SERIAL_INPUT_DATA_READY,
          IO_VCOUNT: IO_VCOUNT,
          IO_NMIEN: IO_NMIEN,
          IO_NMIRES_NMIST: IO_NMIRES_NMIST,
          IO_IRQEN_IRQST: IO_IRQEN_IRQST,
          IO_DMACTL: IO_DMACTL,
          IO_VSCROL: IO_VSCROL,
          IO_CHACTL: IO_CHACTL,
          IO_CHBASE: IO_CHBASE,
          IO_COLBK: IO_COLBK,
          IO_COLPF0: IO_COLPF0,
          IO_COLPF1: IO_COLPF1,
          IO_COLPF2: IO_COLPF2,
          IO_COLPF3: IO_COLPF3,
          IO_COLPM0_TRIG2: IO_COLPM0_TRIG2,
          IO_PRIOR: IO_PRIOR,
          IO_HSCROL: IO_HSCROL,
          ANTIC_MODE_INFO: ANTIC_MODE_INFO,
          drawPlayerMissiles: drawPlayerMissiles,
          pokeyTimerPeriodCpuCycles: pokeyTimerPeriodCpuCycles,
          cycleTimedEventUpdate: cycleTimedEventUpdate,
          PRIO_BKG: PRIO_BKG,
          PRIO_PF0: PRIO_PF0,
          PRIO_PF1: PRIO_PF1,
          PRIO_PF2: PRIO_PF2,
          PRIORITY_TABLE_BKG_PF012: PRIORITY_TABLE_BKG_PF012,
          PRIORITY_TABLE_BKG_PF013: PRIORITY_TABLE_BKG_PF013,
          PRIORITY_TABLE_PF0123: PRIORITY_TABLE_PF0123,
          SCRATCH_GTIA_COLOR_TABLE: SCRATCH_GTIA_COLOR_TABLE,
          SCRATCH_COLOR_TABLE_A: SCRATCH_COLOR_TABLE_A,
          SCRATCH_COLOR_TABLE_B: SCRATCH_COLOR_TABLE_B,
          SCRATCH_BACKGROUND_TABLE: SCRATCH_BACKGROUND_TABLE,
          fillGtiaColorTable: fillGtiaColorTable,
          fillBkgPf012ColorTable: fillBkgPf012ColorTable,
          decodeTextModeCharacter: decodeTextModeCharacter,
          fillLine: fillLine,
        })
      : null;
  if (!anticApi) throw new Error("A8EAntic is not loaded");

  var ioCycleTimedEvent = anticApi.ioCycleTimedEvent;

  function initHardwareDefaults(ctx) {
    for (var i = 0; i < IO_INIT_VALUES.length; i++) {
      var e = IO_INIT_VALUES[i];
      ctx.sram[e.addr] = e.write & 0xff;
      ctx.ram[e.addr] = e.read & 0xff;
    }
  }

  function installIoHandlers(ctx) {
    for (var i = 0; i < IO_INIT_VALUES.length; i++) {
      CPU.setIo(ctx, IO_INIT_VALUES[i].addr, ioAccess);
    }
  }

  // --- UI-facing App ---
  function createApp(opts) {
    var canvas = opts.canvas;
    var ctx2d = opts.ctx2d;
    var gl = opts.gl;
    var debugEl = opts.debugEl;

    var audioEnabled = !!opts.audioEnabled;
    var turbo = !!opts.turbo;
    var sioTurbo = opts.sioTurbo !== false;
    var optionOnStart = !!opts.optionOnStart;

    var video = makeVideo();
    var renderer = null;
    var imageData = null;
    if (gl && window.A8EGlRenderer && window.A8EGlRenderer.create) {
      renderer = window.A8EGlRenderer.create({
        gl: gl,
        canvas: canvas,
        textureW: PIXELS_PER_LINE,
        textureH: LINES_PER_SCREEN_PAL,
        viewX: VIEW_X,
        viewY: VIEW_Y,
        viewW: VIEW_W,
        viewH: VIEW_H,
        sceneScaleX: 2,
        sceneScaleY: 1,
        paletteRgb: video.paletteRgb,
      });
    } else {
      if (!ctx2d) throw new Error("Missing 2D canvas context");
      imageData = ctx2d.createImageData(VIEW_W, VIEW_H);
      renderer = {
        paint: function () {
          blitViewportToImageData(video, imageData);
          ctx2d.putImageData(imageData, 0, 0);
        },
        dispose: function () {},
        backend: "2d",
      };
    }

    var machine = {
      ctx: CPU.makeContext(),
      video: video,
      osRomLoaded: false,
      basicRomLoaded: false,
      media: {
        disk1: null,
        disk1Size: 0,
        disk1Name: null,
        basicRom: null,
        osRom: null,
        selfTestRom: null,
        floatingPointRom: null,
      },
      running: false,
      rafId: 0,
      lastTs: 0,
      audioCtx: null,
      audioNode: null,
      audioState: null,
      audioTurbo: false,
      audioMode: "none", // "none" | "worklet" | "script" | "loading"
    };

    machine.ctx.ioData = makeIoData(video);
    machine.ctx.ioData.optionOnStart = optionOnStart;
    machine.ctx.ioData.sioTurbo = sioTurbo;
    machine.ctx.ioCycleTimedEventFunction = ioCycleTimedEvent;
    cycleTimedEventUpdate(machine.ctx);

    initHardwareDefaults(machine.ctx);
    installIoHandlers(machine.ctx);

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
      installIoHandlers(ctx);
    }

    function hardReset() {
      machine.ctx.cycleCounter = 0;
      machine.ctx.stallCycleCounter = 0;
      machine.ctx.irqPending = 0;
      machine.ctx.ioData = makeIoData(video);
      machine.ctx.ioData.optionOnStart = optionOnStart;
      machine.ctx.ioData.sioTurbo = sioTurbo;
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
      installIoHandlers(machine.ctx);
      setupMemoryMap();
      CPU.reset(machine.ctx);
      if (machine.audioState) {
        pokeyAudioResetState(machine.audioState);
        pokeyAudioSetTurbo(machine.audioState, turbo);
        machine.audioTurbo = !!turbo;
      }
      if (machine.audioMode === "worklet" && machine.audioNode && machine.audioNode.port) {
        try {
          machine.audioNode.port.postMessage({ type: "clear" });
        } catch (e) {
          // ignore
        }
      }
    }

    function ensureAudio() {
      if (!audioEnabled) return;
      if (machine.audioCtx) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      machine.audioCtx = new AC();
      machine.audioState = pokeyAudioCreateState(machine.audioCtx.sampleRate);
      pokeyAudioResetState(machine.audioState);
      pokeyAudioSetTurbo(machine.audioState, turbo);
      machine.audioTurbo = !!turbo;
      // Initialize audio regs from current POKEY write-shadow.
      {
        var sram = machine.ctx.sram;
        pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDF1_POT0, sram[IO_AUDF1_POT0] & 0xff);
        pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDC1_POT1, sram[IO_AUDC1_POT1] & 0xff);
        pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDF2_POT2, sram[IO_AUDF2_POT2] & 0xff);
        pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDC2_POT3, sram[IO_AUDC2_POT3] & 0xff);
        pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDF3_POT4, sram[IO_AUDF3_POT4] & 0xff);
        pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDC3_POT5, sram[IO_AUDC3_POT5] & 0xff);
        pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDF4_POT6, sram[IO_AUDF4_POT6] & 0xff);
        pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDC4_POT7, sram[IO_AUDC4_POT7] & 0xff);
        pokeyAudioOnRegisterWrite(machine.audioState, IO_SKCTL_SKSTAT, sram[IO_SKCTL_SKSTAT] & 0xff);
        pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDCTL_ALLPOT, sram[IO_AUDCTL_ALLPOT] & 0xff);
        machine.audioState.lastCycle = machine.ctx.cycleCounter;
      }
      machine.ctx.ioData.pokeyAudio = machine.audioState;

      function setupScriptProcessor() {
        if (!machine.audioCtx) return;
        // ScriptProcessorNode fallback for older browsers.
        var node = machine.audioCtx.createScriptProcessor(1024, 0, 1);
        if (machine.audioState) pokeyAudioSetTargetBufferSamples(machine.audioState, ((node.bufferSize | 0) * 2) | 0);
        node.onaudioprocess = function (e) {
          var out = e.outputBuffer.getChannelData(0);
          try {
            if (!machine.running || !machine.audioState) {
              out.fill(0.0);
              return;
            }
            pokeyAudioSync(machine.ctx, machine.audioState, machine.ctx.cycleCounter);
            pokeyAudioConsume(machine.audioState, out);
          } catch (err) {
            out.fill(0.0);
          }
        };
        node.connect(machine.audioCtx.destination);
        machine.audioNode = node;
        machine.audioMode = "script";
      }

      // Prefer AudioWorklet when available.
      if (machine.audioCtx.audioWorklet && window.AudioWorkletNode) {
        machine.audioMode = "loading";
        machine.audioCtx.audioWorklet
          .addModule("js/audio/worklet.js")
          .then(function () {
            if (!machine.audioCtx || !audioEnabled) return;
            var node = new window.AudioWorkletNode(machine.audioCtx, "a8e-sample-queue", {
              numberOfInputs: 0,
              numberOfOutputs: 1,
              outputChannelCount: [1],
            });
            if (machine.audioState)
              pokeyAudioSetTargetBufferSamples(machine.audioState, ((machine.audioCtx.sampleRate / 20) | 0) || 2048);
            node.connect(machine.audioCtx.destination);
            machine.audioNode = node;
            machine.audioMode = "worklet";
            try {
              node.port.postMessage({ type: "clear" });
            } catch (e) {
              // ignore
            }
          })
          .catch(function () {
            setupScriptProcessor();
          });
      } else {
        setupScriptProcessor();
      }
    }

    function stopAudio() {
      if (!machine.audioCtx) return;
      try {
        if (machine.audioMode === "worklet" && machine.audioNode && machine.audioNode.port) {
          try {
            machine.audioNode.port.postMessage({ type: "clear" });
          } catch (e) {
            // ignore
          }
        }
        if (machine.audioNode) machine.audioNode.disconnect();
        machine.audioNode = null;
        machine.audioCtx.close();
      } catch (e) {
        // ignore
      }
      machine.audioMode = "none";
      machine.audioCtx = null;
      machine.audioState = null;
      machine.audioTurbo = false;
      machine.ctx.ioData.pokeyAudio = null;
    }

    function isReady() {
      return machine.osRomLoaded && machine.basicRomLoaded;
    }

    function paint() {
      renderer.paint(video);
    }

    function isSioActive(io) {
      if (!io) return false;
      if ((io.sioOutIndex | 0) !== 0) return true;
      if ((io.sioOutPhase | 0) !== 0) return true;
      if ((io.sioInSize | 0) > 0) return true;
      if (io.serialOutputNeedDataCycle !== CYCLE_NEVER) return true;
      if (io.serialOutputTransmissionDoneCycle !== CYCLE_NEVER) return true;
      if (io.serialInputDataReadyCycle !== CYCLE_NEVER) return true;
      return false;
    }

    function syncAudioTurboMode(nextTurbo) {
      if (!machine.audioState) return;
      var next = !!nextTurbo;
      if (next === machine.audioTurbo) return;
      pokeyAudioSync(machine.ctx, machine.audioState, machine.ctx.cycleCounter);
      pokeyAudioSetTurbo(machine.audioState, next);
      machine.audioTurbo = next;
    }

    function updateDebug() {
      if (!debugEl) return;
      var c = machine.ctx.cpu;
      debugEl.textContent =
        "PC=$" +
        Util.toHex4(c.pc) +
        "  A=$" +
        Util.toHex2(c.a) +
        " X=$" +
        Util.toHex2(c.x) +
        " Y=$" +
        Util.toHex2(c.y) +
        " SP=$" +
        Util.toHex2(c.sp) +
        "  P=$" +
        Util.toHex2(CPU.getPs(machine.ctx));
    }

    function frame(ts) {
      if (!machine.running) return;

      if (!machine.lastTs) machine.lastTs = ts;
      var dtMs = ts - machine.lastTs;
      machine.lastTs = ts;

      // Clamp big pauses (tab background etc).
      if (dtMs > 100) dtMs = 100;

      var sioFast = !turbo && sioTurbo && isSioActive(machine.ctx.ioData);
      var emuTurbo = turbo || sioFast;
      syncAudioTurboMode(emuTurbo);

      var mult = turbo ? 4.0 : 1.0;
      if (!turbo && sioFast) mult = SIO_TURBO_EMU_MULTIPLIER;
      var cyclesToRun = ((dtMs / 1000) * ATARI_CPU_HZ_PAL * mult) | 0;
      if (cyclesToRun < 1) cyclesToRun = 1;

      CPU.run(machine.ctx, machine.ctx.cycleCounter + cyclesToRun);

      if (machine.audioState) {
        pokeyAudioSync(machine.ctx, machine.audioState, machine.ctx.cycleCounter);
        if (machine.audioMode === "worklet" && machine.audioNode && machine.audioNode.port) {
          while (true) {
            var chunk = pokeyAudioDrain(machine.audioState, 4096);
            if (!chunk) break;
            try {
              machine.audioNode.port.postMessage({ type: "samples", samples: chunk }, [chunk.buffer]);
            } catch (e) {
              break;
            }
          }
        }
      }

      paint();
      updateDebug();

      machine.rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (!isReady()) return;
      if (machine.running) return;
      ensureAudio();
      if (machine.audioCtx && machine.audioCtx.state === "suspended") {
        machine.audioCtx.resume().catch(function () {});
      }
      if (!machine.ctx.cpu.pc) hardReset();
      machine.running = true;
      machine.lastTs = 0;
      machine.rafId = requestAnimationFrame(frame);
    }

    function pause() {
      machine.running = false;
      if (machine.rafId) cancelAnimationFrame(machine.rafId);
      machine.rafId = 0;
      if (machine.audioState) pokeyAudioClear(machine.audioState);
      if (machine.audioMode === "worklet" && machine.audioNode && machine.audioNode.port) {
        try {
          machine.audioNode.port.postMessage({ type: "clear" });
        } catch (e) {
          // ignore
        }
      }
    }

    function reset() {
      if (!isReady()) return;
      hardReset();
      paint();
      updateDebug();
    }

    function setTurbo(v) {
      var next = !!v;
      if (next === turbo) return;
      turbo = next;
      syncAudioTurboMode(turbo || (!turbo && sioTurbo && isSioActive(machine.ctx.ioData)));
    }

    function setAudioEnabled(v) {
      audioEnabled = !!v;
      if (!audioEnabled) stopAudio();
      else if (machine.running) {
        ensureAudio();
        if (machine.audioCtx && machine.audioCtx.state === "suspended") {
          machine.audioCtx.resume().catch(function () {});
        }
      }
    }

    function setSioTurbo(v) {
      sioTurbo = !!v;
      if (machine.ctx && machine.ctx.ioData) machine.ctx.ioData.sioTurbo = sioTurbo;
      syncAudioTurboMode(turbo || (!turbo && sioTurbo && isSioActive(machine.ctx.ioData)));
    }

    function setOptionOnStart(v) {
      optionOnStart = !!v;
      if (machine.ctx && machine.ctx.ioData) machine.ctx.ioData.optionOnStart = optionOnStart;
    }

    function dispose() {
      pause();
      stopAudio();
      if (renderer && renderer.dispose) renderer.dispose();
    }

    function loadOsRom(arrayBuffer) {
      var bytes = new Uint8Array(arrayBuffer);
      if (bytes.length !== 0x4000) {
        throw new Error("ATARIXL.ROM must be 16KB (0x4000), got " + bytes.length);
      }
      // Layout matches AtariIoOpen():
      // 0x0000-0x0FFF => $C000-$CFFF
      // 0x1000-0x17FF => self-test => $5000-$57FF (if enabled)
      // 0x1800-0x3FFF => floating point => $D800-$FFFF
      machine.media.osRom = new Uint8Array(bytes.subarray(0x0000, 0x1000));
      machine.media.selfTestRom = new Uint8Array(bytes.subarray(0x1000, 0x1800));
      machine.media.floatingPointRom = new Uint8Array(bytes.subarray(0x1800, 0x4000));
      machine.ctx.ioData.osRom = machine.media.osRom;
      machine.ctx.ioData.selfTestRom = machine.media.selfTestRom;
      machine.ctx.ioData.floatingPointRom = machine.media.floatingPointRom;
      machine.osRomLoaded = true;
      setupMemoryMap();
    }

    function loadBasicRom(arrayBuffer) {
      var bytes = new Uint8Array(arrayBuffer);
      if (bytes.length !== 0x2000) {
        throw new Error("ATARIBAS.ROM must be 8KB (0x2000), got " + bytes.length);
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

    function hasOsRom() {
      return machine.osRomLoaded;
    }
    function hasBasicRom() {
      return machine.basicRomLoaded;
    }
    function hasDisk1() {
      return !!machine.ctx.ioData.disk1;
    }

    function onKeyDown(e) {
      if (!isReady()) return false;
      var sym = browserKeyToSdlSym(e);
      if (sym === null) return false;

      // Joystick / console / reset/break follow C behavior.
      if (sym === 273) {
        machine.ctx.ram[IO_PORTA] &= ~0x01;
        return true;
      }
      if (sym === 274) {
        machine.ctx.ram[IO_PORTA] &= ~0x02;
        return true;
      }
      if (sym === 276) {
        machine.ctx.ram[IO_PORTA] &= ~0x04;
        return true;
      }
      if (sym === 275) {
        machine.ctx.ram[IO_PORTA] &= ~0x08;
        return true;
      }

      if (sym === 308) {
        machine.ctx.ram[IO_GRAFP3_TRIG0] = 0;
        return true;
      }
      if (sym === 306) {
        machine.ctx.ram[IO_GRAFM_TRIG1] = 0;
        return true;
      }
      if (sym === 307) {
        machine.ctx.ram[IO_COLPM0_TRIG2] = 0;
        return true;
      }
      if (sym === 309 || sym === 310) {
        machine.ctx.ram[IO_COLPM1_TRIG3] = 0;
        return true;
      }

      if (sym === 283) {
        machine.ctx.ram[IO_CONSOL] &= ~0x4;
        return true;
      }
      if (sym === 284) {
        machine.ctx.ram[IO_CONSOL] &= ~0x2;
        return true;
      }
      if (sym === 285) {
        machine.ctx.ram[IO_CONSOL] &= ~0x1;
        return true;
      }
      if (sym === 286) {
        CPU.reset(machine.ctx);
        return true;
      }
      if (sym === 289) {
        machine.ctx.ram[IO_IRQEN_IRQST] &= ~IRQ_BREAK_KEY_PRESSED;
        if (machine.ctx.sram[IO_IRQEN_IRQST] & IRQ_BREAK_KEY_PRESSED) CPU.irq(machine.ctx);
        return true;
      }

      if (sym === 303 || sym === 304) {
        machine.ctx.ram[IO_SKCTL_SKSTAT] &= ~0x08;
        return true;
      }

      var kc = KEY_CODE_TABLE[sym] !== undefined ? KEY_CODE_TABLE[sym] : 255;
      if (kc === 255) return false;

      if (e.ctrlKey) kc |= 0x80;
      if (e.shiftKey) kc |= 0x40;

      machine.ctx.ram[IO_STIMER_KBCODE] = kc & 0xff;

      machine.ctx.ram[IO_IRQEN_IRQST] &= ~IRQ_OTHER_KEY_PRESSED;
      if (machine.ctx.sram[IO_IRQEN_IRQST] & IRQ_OTHER_KEY_PRESSED) CPU.irq(machine.ctx);

      machine.ctx.ioData.keyPressCounter++;
      machine.ctx.ram[IO_SKCTL_SKSTAT] &= ~0x04;
      return true;
    }

    function onKeyUp(e) {
      if (!isReady()) return false;
      var sym = browserKeyToSdlSym(e);
      if (sym === null) return false;

      if (sym === 273) {
        machine.ctx.ram[IO_PORTA] |= 0x01;
        return true;
      }
      if (sym === 274) {
        machine.ctx.ram[IO_PORTA] |= 0x02;
        return true;
      }
      if (sym === 276) {
        machine.ctx.ram[IO_PORTA] |= 0x04;
        return true;
      }
      if (sym === 275) {
        machine.ctx.ram[IO_PORTA] |= 0x08;
        return true;
      }
      if (sym === 308) {
        machine.ctx.ram[IO_GRAFP3_TRIG0] = 1;
        return true;
      }
      if (sym === 306) {
        machine.ctx.ram[IO_GRAFM_TRIG1] = 1;
        return true;
      }
      if (sym === 307) {
        machine.ctx.ram[IO_COLPM0_TRIG2] = 1;
        return true;
      }
      if (sym === 309 || sym === 310) {
        machine.ctx.ram[IO_COLPM1_TRIG3] = 1;
        return true;
      }
      if (sym === 283) {
        machine.ctx.ram[IO_CONSOL] |= 0x4;
        return true;
      }
      if (sym === 284) {
        machine.ctx.ram[IO_CONSOL] |= 0x2;
        return true;
      }
      if (sym === 285) {
        machine.ctx.ram[IO_CONSOL] |= 0x1;
        return true;
      }
      if (sym === 303 || sym === 304) {
        machine.ctx.ram[IO_SKCTL_SKSTAT] |= 0x08;
        return true;
      }

      var kc = KEY_CODE_TABLE[sym] !== undefined ? KEY_CODE_TABLE[sym] : 255;
      if (kc === 255) return false;

      if (machine.ctx.ioData.keyPressCounter > 0) machine.ctx.ioData.keyPressCounter--;
      if (machine.ctx.ioData.keyPressCounter === 0) machine.ctx.ram[IO_SKCTL_SKSTAT] |= 0x04;
      return true;
    }

    // Initial paint (black).
    paint();
    updateDebug();

    return {
      start: start,
      pause: pause,
      reset: reset,
      setTurbo: setTurbo,
      setSioTurbo: setSioTurbo,
      setAudioEnabled: setAudioEnabled,
      setOptionOnStart: setOptionOnStart,
      loadOsRom: loadOsRom,
      loadBasicRom: loadBasicRom,
      loadDisk1: loadDisk1,
      hasOsRom: hasOsRom,
      hasBasicRom: hasBasicRom,
      hasDisk1: hasDisk1,
      isReady: isReady,
      isRunning: function () {
        return machine.running;
      },
      dispose: dispose,
      onKeyDown: onKeyDown,
      onKeyUp: onKeyUp,
    };
  }

  window.A8EApp = { create: createApp };
})();
