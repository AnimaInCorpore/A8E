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

  // Key mapping table from AtariIo.c (indexed by SDL 1.2 keysym.sym).
  // Values are Atari POKEY KBCODE codes; 255 => unmapped.
  var KEY_CODE_TABLE = [
    255,255,255,255,255,255,255,255, 52, 44,255,255,255, 12,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
     33,255,255,255,255,255,255,  6,255,255,255,255, 32, 54, 34, 38,
     50, 31, 30, 26, 24, 29, 27, 51, 53, 48,255,  2,255, 55,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255, 14,  7, 15,255,255,
     28, 63, 21, 18, 58, 42, 56, 61, 57, 13,  1,  5,  0, 37, 35,  8,
     10, 47, 40, 62, 45, 11, 16, 46, 22, 43, 23,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255, 17,255,255,255,255, 60,
     39,255,255,255,255,255,255,255,255,255,255,255,255, 60,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
    255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,255,
  ];

  function browserKeyToSdlSym(e) {
    // SDL 1.2 keysyms mostly follow ASCII for printable keys.
    var k = e.key;
    if (k && k.length === 1) return k.toLowerCase().charCodeAt(0) & 0x1ff;
    switch (k) {
      case "Enter":
        return 13;
      case "Backspace":
        return 8;
      case "Tab":
        return 9;
      case "Escape":
        return 27;
      case " ":
      case "Spacebar":
      case "Space":
        return 32;
      case "ArrowUp":
        return 273;
      case "ArrowDown":
        return 274;
      case "ArrowRight":
        return 275;
      case "ArrowLeft":
        return 276;
      case "F2":
        return 283;
      case "F3":
        return 284;
      case "F4":
        return 285;
      case "F5":
        return 286;
      case "F8":
        return 289;
      case "F11":
        return 292;
      case "Shift":
        // Prefer location-aware below; fall back to LSHIFT.
        return 304;
      case "Alt":
        return 308;
      case "Control":
        return 306; // SDLK_LCTRL (approx; unused for table)
      case "Meta":
        return 310; // SDLK_LMETA (approx; unused for table)
      default:
        break;
    }

    // Handle by code/location for modifiers.
    if (e.code === "ShiftRight") return 303;
    if (e.code === "ShiftLeft") return 304;
    if (e.code === "AltRight") return 307;
    if (e.code === "AltLeft") return 308;
    if (e.code === "MetaRight") return 309;
    if (e.code === "MetaLeft") return 310;

    return null;
  }

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

  function sioChecksum(buf, size) {
    var checksum = 0;
    for (var i = 0; i < size; i++) {
      var b = buf[i] & 0xff;
      checksum = (checksum + (((checksum + b) >> 8) & 0xff) + b) & 0xff;
    }
    return checksum & 0xff;
  }

  function pokeyStepLfsr17(io) {
    // Matches the poly17 step used in PokeyAudio_PolyStep() (Pokey.c).
    var l17 = io.pokeyLfsr17 & 0x1ffff;
    var in8 = ((l17 >> 8) ^ (l17 >> 13)) & 1;
    var in0 = l17 & 1;
    l17 = l17 >>> 1;
    l17 = (l17 & 0xff7f) | (in8 << 7);
    l17 = (l17 & 0xffff) | (in0 << 16);
    io.pokeyLfsr17 = l17 & 0x1ffff;
    return io.pokeyLfsr17 & 0xff;
  }

  // --- POKEY pot scan (POT0..POT7 / ALLPOT) ---
  var POKEY_POT_MAX = 228;
  var POKEY_POT_CYCLES_PER_COUNT = 28; // ~64kHz at PAL CPU clock.

  function pokeyPotStartScan(ctx) {
    var io = ctx.ioData;
    if (!io) return;
    io.pokeyPotScanActive = true;
    io.pokeyPotScanStartCycle = ctx.cycleCounter;
    io.pokeyPotAllPot = 0xff;
    io.pokeyPotLatched.fill(0);

    // Reset visible pot counters (read-side).
    for (var i = 0; i < 8; i++) ctx.ram[(IO_AUDF1_POT0 + i) & 0xffff] = 0x00;
    ctx.ram[IO_AUDCTL_ALLPOT] = 0xff;
  }

  function pokeyPotUpdate(ctx) {
    var io = ctx.ioData;
    if (!io || !io.pokeyPotScanActive) return;

    var elapsed = ctx.cycleCounter - io.pokeyPotScanStartCycle;
    if (elapsed < 0) elapsed = 0;
    var count = Math.floor(elapsed / POKEY_POT_CYCLES_PER_COUNT);
    if (count > 255) count = 255;

    var allpot = io.pokeyPotAllPot & 0xff;
    var anyPending = 0;

    for (var p = 0; p < 8; p++) {
      if (io.pokeyPotLatched[p]) continue;
      anyPending = 1;

      var target = io.pokeyPotValues[p] & 0xff;
      if (target > POKEY_POT_MAX) target = POKEY_POT_MAX;

      if (count >= target) {
        io.pokeyPotLatched[p] = 1;
        ctx.ram[(IO_AUDF1_POT0 + p) & 0xffff] = target & 0xff;
        allpot &= ~(1 << p);
      } else {
        var cur = count;
        if (cur > POKEY_POT_MAX) cur = POKEY_POT_MAX;
        ctx.ram[(IO_AUDF1_POT0 + p) & 0xffff] = cur & 0xff;
      }
    }

    io.pokeyPotAllPot = allpot & 0xff;
    ctx.ram[IO_AUDCTL_ALLPOT] = io.pokeyPotAllPot;

    if (!anyPending || (io.pokeyPotAllPot & 0xff) === 0) io.pokeyPotScanActive = false;
  }

  function pokeyTimerPeriodCpuCycles(ctx, timer) {
    var sram = ctx.sram;
    // Hold timers when POKEY clocks are in reset (SKCTL bits0..1 = 0).
    if ((sram[IO_SKCTL_SKSTAT] & 0x03) === 0) return 0;

    var audctl = sram[IO_AUDCTL_ALLPOT] & 0xff;
    var base = audctl & 0x01 ? CYCLES_PER_LINE : 28;

    var div, reload;
    if (timer === 1) {
      // In 16-bit mode (ch1+ch2), timer1 has no independent divider output.
      if (audctl & 0x10) return 0;
      if ((sram[IO_AUDF1_POT0] & 0xff) === 0) return 0;
      div = audctl & 0x40 ? 1 : base;
      reload = (sram[IO_AUDF1_POT0] & 0xff) + (audctl & 0x40 ? 4 : 1);
      return (reload * div) >>> 0;
    }

    if (timer === 2) {
      if ((sram[IO_AUDF2_POT2] & 0xff) === 0) return 0;
      if (audctl & 0x10) {
        var period12 = ((sram[IO_AUDF2_POT2] & 0xff) << 8) | (sram[IO_AUDF1_POT0] & 0xff);
        div = audctl & 0x40 ? 1 : base;
        reload = period12 + (audctl & 0x40 ? 7 : 1);
        return reload * div;
      }
      div = base;
      reload = (sram[IO_AUDF2_POT2] & 0xff) + 1;
      return (reload * div) >>> 0;
    }

    if (timer === 4) {
      if ((sram[IO_AUDF4_POT6] & 0xff) === 0) return 0;
      if (audctl & 0x08) {
        var period34 = ((sram[IO_AUDF4_POT6] & 0xff) << 8) | (sram[IO_AUDF3_POT4] & 0xff);
        div = audctl & 0x20 ? 1 : base;
        reload = period34 + (audctl & 0x20 ? 7 : 1);
        return reload * div;
      }
      div = base;
      reload = (sram[IO_AUDF4_POT6] & 0xff) + 1;
      return (reload * div) >>> 0;
    }

    return 0;
  }

  function pokeyRestartTimers(ctx) {
    var io = ctx.ioData;
    var now = ctx.cycleCounter;

    var p1 = pokeyTimerPeriodCpuCycles(ctx, 1);
    io.timer1Cycle = p1 ? now + p1 : CYCLE_NEVER;

    var p2 = pokeyTimerPeriodCpuCycles(ctx, 2);
    io.timer2Cycle = p2 ? now + p2 : CYCLE_NEVER;

    var p4 = pokeyTimerPeriodCpuCycles(ctx, 4);
    io.timer4Cycle = p4 ? now + p4 : CYCLE_NEVER;

    cycleTimedEventUpdate(ctx);
  }

  // --- POKEY audio (ported from Pokey.c; still simplified, but cycle-based) ---
  var POKEY_FP_ONE = 4294967296; // 1<<32 as an exact integer.

  function pokeyAudioCreateState(sampleRate) {
    var ringSize = 16384; // power-of-two
    var st = {
      sampleRate: sampleRate || 48000,
      cpuHzBase: ATARI_CPU_HZ_PAL,
      cpuHz: ATARI_CPU_HZ_PAL,
      cyclesPerSampleFp: 0,
      lastCycle: 0,
      samplePhaseFp: 0,

      lfsr17: 0x1ffff,
      lfsr9: 0x01ff,
      lfsr5: 0x00,
      lfsr4: 0x00,
      hp1Latch: 0,
      hp2Latch: 0,

      audctl: 0x00,
      skctl: 0x00,

      channels: [
        { audf: 0, audc: 0, counter: 1, output: 0, clkDivCycles: 28, clkAccCycles: 0 },
        { audf: 0, audc: 0, counter: 1, output: 0, clkDivCycles: 28, clkAccCycles: 0 },
        { audf: 0, audc: 0, counter: 1, output: 0, clkDivCycles: 28, clkAccCycles: 0 },
        { audf: 0, audc: 0, counter: 1, output: 0, clkDivCycles: 28, clkAccCycles: 0 },
      ],

      ring: new Float32Array(ringSize),
      ringSize: ringSize,
      ringMask: ringSize - 1,
      ringRead: 0,
      ringWrite: 0,
      ringCount: 0,
      lastSample: 0.0,
    };

    pokeyAudioRecomputeCyclesPerSample(st);
    pokeyAudioRecomputeClocks(st.channels, st.audctl);
    return st;
  }

  function pokeyAudioRecomputeCyclesPerSample(st) {
    if (!st) return;
    var sr = st.sampleRate || 48000;
    var hz = st.cpuHz || ATARI_CPU_HZ_PAL;
    var cps = Math.floor((hz * POKEY_FP_ONE) / sr);
    if (cps < 1) cps = 1;
    st.cyclesPerSampleFp = cps;
  }

  function pokeyAudioSetTurbo(st, turbo) {
    if (!st) return;
    st.cpuHz = (st.cpuHzBase || ATARI_CPU_HZ_PAL) * (turbo ? 4 : 1);
    pokeyAudioRecomputeCyclesPerSample(st);
  }

  function pokeyAudioRingWrite(st, samples, count) {
    if (!st || !samples || !count) return;
    var ring = st.ring;
    if (!ring || !ring.length) return;
    var ringSize = st.ringSize | 0;
    var ringMask = st.ringMask | 0;

    if (count >= ringSize) {
      ring.set(samples.subarray(count - ringSize, count), 0);
      st.ringRead = 0;
      st.ringWrite = 0;
      st.ringCount = ringSize;
      return;
    }

    var freeSpace = ringSize - (st.ringCount | 0);
    var drop = count > freeSpace ? count - freeSpace : 0;
    if (drop) {
      st.ringRead = (st.ringRead + drop) & ringMask;
      st.ringCount = (st.ringCount - drop) | 0;
    }

    var first = count;
    var toEnd = ringSize - (st.ringWrite | 0);
    if (first > toEnd) first = toEnd;
    ring.set(samples.subarray(0, first), st.ringWrite | 0);
    var second = count - first;
    if (second) ring.set(samples.subarray(first, first + second), 0);

    st.ringWrite = ((st.ringWrite + count) & ringMask) | 0;
    st.ringCount = (st.ringCount + count) | 0;
  }

  function pokeyAudioRingRead(st, out, count) {
    if (!st || !out || !count) return 0;
    var ring = st.ring;
    if (!ring || !ring.length) return 0;

    var ringSize = st.ringSize | 0;
    var ringMask = st.ringMask | 0;
    var avail = st.ringCount | 0;
    var toRead = count < avail ? count : avail;

    var first = toRead;
    var toEnd = ringSize - (st.ringRead | 0);
    if (first > toEnd) first = toEnd;
    out.set(ring.subarray(st.ringRead | 0, (st.ringRead + first) | 0), 0);
    var second = toRead - first;
    if (second) out.set(ring.subarray(0, second), first);

    st.ringRead = ((st.ringRead + toRead) & ringMask) | 0;
    st.ringCount = (st.ringCount - toRead) | 0;
    return toRead | 0;
  }

  function pokeyAudioDrain(st, maxSamples) {
    if (!st) return null;
    var n = st.ringCount | 0;
    if (n <= 0) return null;
    if (maxSamples && n > maxSamples) n = maxSamples | 0;
    var out = new Float32Array(n);
    var got = pokeyAudioRingRead(st, out, n);
    if (got !== n) out = out.subarray(0, got);
    return out;
  }

  function pokeyAudioClear(st) {
    if (!st) return;
    st.ringRead = 0;
    st.ringWrite = 0;
    st.ringCount = 0;
    st.lastSample = 0.0;
  }

  function pokeyAudioResetState(st) {
    if (!st) return;
    st.lastCycle = 0;
    st.samplePhaseFp = 0;
    st.lfsr17 = 0x1ffff;
    st.lfsr9 = 0x01ff;
    st.lfsr5 = 0x00;
    st.lfsr4 = 0x00;
    st.hp1Latch = 0;
    st.hp2Latch = 0;
    st.audctl = 0x00;
    st.skctl = 0x00;
    for (var i = 0; i < 4; i++) {
      var ch = st.channels[i];
      ch.audf = 0;
      ch.audc = 0;
      ch.counter = 1;
      ch.output = 0;
      ch.clkDivCycles = 28;
      ch.clkAccCycles = 0;
    }
    pokeyAudioRecomputeClocks(st.channels, st.audctl);
    pokeyAudioClear(st);
  }

  function pokeyAudioRecomputeClocks(channels, audctl) {
    var base = audctl & 0x01 ? CYCLES_PER_LINE : 28;
    channels[0].clkDivCycles = audctl & 0x40 ? 1 : base;
    channels[1].clkDivCycles = base;
    channels[2].clkDivCycles = audctl & 0x20 ? 1 : base;
    channels[3].clkDivCycles = base;
  }

  function pokeyAudioPolyStep(st) {
    // Matches PokeyAudio_PolyStep() in Pokey.c.
    var l4 = st.lfsr4 & 0x0f;
    var l5 = st.lfsr5 & 0x1f;
    var new4 = (~(((l4 >>> 2) ^ (l4 >>> 3)) & 1)) & 1;
    var new5 = (~(((l5 >>> 2) ^ (l5 >>> 4)) & 1)) & 1;
    st.lfsr4 = ((l4 << 1) | new4) & 0x0f;
    st.lfsr5 = ((l5 << 1) | new5) & 0x1f;

    var l9 = st.lfsr9 & 0x1ff;
    var in9 = ((l9 >>> 0) ^ (l9 >>> 5)) & 1;
    st.lfsr9 = ((l9 >>> 1) | (in9 << 8)) & 0x1ff;

    var l17 = st.lfsr17 & 0x1ffff;
    var in8 = ((l17 >>> 8) ^ (l17 >>> 13)) & 1;
    var in0 = l17 & 1;
    l17 = l17 >>> 1;
    l17 = (l17 & 0xff7f) | (in8 << 7);
    l17 = (l17 & 0xffff) | (in0 << 16);
    st.lfsr17 = l17 & 0x1ffff;
  }

  function pokeyAudioPoly17Bit(st, audctl) {
    return ((audctl & 0x80 ? st.lfsr9 : st.lfsr17) & 1) & 1;
  }

  function pokeyAudioChannelClockOut(st, ch, audctl) {
    var audc = ch.audc & 0xff;
    var volOnly = (audc & 0x10) !== 0;
    if (volOnly) {
      ch.output = 1;
      return;
    }

    var dist = (audc >>> 5) & 0x07;
    if (dist <= 3) {
      if ((st.lfsr5 & 1) === 0) return;
    }

    switch (dist) {
      case 0:
      case 4:
        ch.output = pokeyAudioPoly17Bit(st, audctl) & 1;
        break;
      case 2:
      case 6:
        ch.output = st.lfsr4 & 1;
        break;
      default:
        ch.output = (ch.output ^ 1) & 1;
        break;
    }
  }

  function pokeyAudioChannelTick(st, ch, audctl) {
    if (ch.counter > 0) ch.counter = (ch.counter - 1) | 0;
    if (ch.counter !== 0) return 0;

    var reload = ((ch.audf & 0xff) + 1) | 0;
    if (ch === st.channels[0] && (audctl & 0x40)) reload = ((ch.audf & 0xff) + 4) | 0;
    if (ch === st.channels[2] && (audctl & 0x20)) reload = ((ch.audf & 0xff) + 4) | 0;
    if (!reload) reload = 1;
    ch.counter = reload;

    pokeyAudioChannelClockOut(st, ch, audctl);
    return 1;
  }

  function pokeyAudioPairTick(st, chLow, chHigh, audctl) {
    var period = (((chHigh.audf & 0xff) << 8) | (chLow.audf & 0xff)) >>> 0;

    if (chHigh.counter > 0) chHigh.counter = (chHigh.counter - 1) | 0;
    if (chHigh.counter !== 0) return 0;

    var reload = (period + 1) >>> 0;
    if (chLow === st.channels[0] && (audctl & 0x40)) reload = (period + 7) >>> 0;
    if (chLow === st.channels[2] && (audctl & 0x20)) reload = (period + 7) >>> 0;
    if (!reload) reload = 1;
    chHigh.counter = reload | 0;

    pokeyAudioChannelClockOut(st, chHigh, audctl);
    return 1;
  }

  function pokeyAudioStepCpuCycle(st) {
    if ((st.skctl & 0x03) === 0) return;

    var audctl = st.audctl & 0xff;
    var pair12 = (audctl & 0x10) !== 0;
    var pair34 = (audctl & 0x08) !== 0;
    var pulse2 = 0;
    var pulse3 = 0;

    pokeyAudioPolyStep(st);

    if (pair12) {
      if (st.channels[0].clkDivCycles === 1) {
        pokeyAudioPairTick(st, st.channels[0], st.channels[1], audctl);
      } else {
        st.channels[0].clkAccCycles = (st.channels[0].clkAccCycles + 1) | 0;
        if (st.channels[0].clkAccCycles >= st.channels[0].clkDivCycles) {
          st.channels[0].clkAccCycles = (st.channels[0].clkAccCycles - st.channels[0].clkDivCycles) | 0;
          pokeyAudioPairTick(st, st.channels[0], st.channels[1], audctl);
        }
      }
    } else {
      for (var i = 0; i < 2; i++) {
        var ch = st.channels[i];
        if (ch.clkDivCycles === 1) {
          pokeyAudioChannelTick(st, ch, audctl);
          continue;
        }
        ch.clkAccCycles = (ch.clkAccCycles + 1) | 0;
        if (ch.clkAccCycles >= ch.clkDivCycles) {
          ch.clkAccCycles = (ch.clkAccCycles - ch.clkDivCycles) | 0;
          pokeyAudioChannelTick(st, ch, audctl);
        }
      }
    }

    if (pair34) {
      if (st.channels[2].clkDivCycles === 1) {
        pulse3 = pokeyAudioPairTick(st, st.channels[2], st.channels[3], audctl);
        pulse2 = pulse3;
      } else {
        st.channels[2].clkAccCycles = (st.channels[2].clkAccCycles + 1) | 0;
        if (st.channels[2].clkAccCycles >= st.channels[2].clkDivCycles) {
          st.channels[2].clkAccCycles = (st.channels[2].clkAccCycles - st.channels[2].clkDivCycles) | 0;
          pulse3 = pokeyAudioPairTick(st, st.channels[2], st.channels[3], audctl);
          pulse2 = pulse3;
        }
      }
    } else {
      for (var j = 2; j < 4; j++) {
        var ch2 = st.channels[j];
        if (ch2.clkDivCycles === 1) {
          var pulse = pokeyAudioChannelTick(st, ch2, audctl);
          if (j === 2) pulse2 = pulse;
          else pulse3 = pulse;
          continue;
        }
        ch2.clkAccCycles = (ch2.clkAccCycles + 1) | 0;
        if (ch2.clkAccCycles >= ch2.clkDivCycles) {
          ch2.clkAccCycles = (ch2.clkAccCycles - ch2.clkDivCycles) | 0;
          var pulseOut = pokeyAudioChannelTick(st, ch2, audctl);
          if (j === 2) pulse2 = pulseOut;
          else pulse3 = pulseOut;
        }
      }
    }

    if (pulse2 && (audctl & 0x04)) st.hp1Latch = st.channels[0].output & 1;
    if (pulse3 && (audctl & 0x02)) st.hp2Latch = st.channels[1].output & 1;
  }

  function pokeyAudioMixCycleSample(st) {
    var audctl = st.audctl & 0xff;
    var pair12 = (audctl & 0x10) !== 0;
    var pair34 = (audctl & 0x08) !== 0;
    var sum = 0;

    for (var i = 0; i < 4; i++) {
      if (i === 0 && pair12) continue;
      if (i === 2 && pair34) continue;

      var ch = st.channels[i];
      var audc = ch.audc & 0xff;
      var vol = audc & 0x0f;
      if (!vol) continue;

      var volOnly = (audc & 0x10) !== 0;
      var bit = volOnly ? 1 : ch.output & 1;

      if (!volOnly) {
        if (i === 0 && (audctl & 0x04)) bit ^= st.hp1Latch & 1;
        if (i === 1 && (audctl & 0x02)) bit ^= st.hp2Latch & 1;
      }

      sum += bit * vol;
    }

    if (sum < 0) sum = 0;
    if (sum > 60) sum = 60;

    // Center for WebAudio (simple DC removal) while keeping peak-to-peak similar.
    return ((sum - 30) / 60) * 0.35;
  }

  function pokeyAudioReloadDividerCounters(st) {
    if (!st) return;

    if (st.audctl & 0x10) {
      var p12 = (((st.channels[1].audf & 0xff) << 8) | (st.channels[0].audf & 0xff)) >>> 0;
      st.channels[1].counter = (st.audctl & 0x40) ? (p12 + 7) : (p12 + 1);
    } else {
      st.channels[0].counter =
        (st.audctl & 0x40) ? ((st.channels[0].audf & 0xff) + 4) : ((st.channels[0].audf & 0xff) + 1);
      st.channels[1].counter = ((st.channels[1].audf & 0xff) + 1) | 0;
    }

    if (st.audctl & 0x08) {
      var p34 = (((st.channels[3].audf & 0xff) << 8) | (st.channels[2].audf & 0xff)) >>> 0;
      st.channels[3].counter = (st.audctl & 0x20) ? (p34 + 7) : (p34 + 1);
    } else {
      st.channels[2].counter =
        (st.audctl & 0x20) ? ((st.channels[2].audf & 0xff) + 4) : ((st.channels[2].audf & 0xff) + 1);
      st.channels[3].counter = ((st.channels[3].audf & 0xff) + 1) | 0;
    }
  }

  function pokeyAudioOnRegisterWrite(st, addr, v) {
    if (!st) return;
    var ch;

    switch (addr & 0xffff) {
      case IO_AUDF1_POT0:
        ch = st.channels[0];
        ch.audf = v & 0xff;
        ch.counter = (st.audctl & 0x40) ? ((v & 0xff) + 4) : ((v & 0xff) + 1);
        if (st.audctl & 0x10) {
          var period12 = (((st.channels[1].audf & 0xff) << 8) | (v & 0xff)) >>> 0;
          st.channels[1].counter = (st.audctl & 0x40) ? (period12 + 7) : (period12 + 1);
        }
        break;
      case IO_AUDF2_POT2:
        ch = st.channels[1];
        ch.audf = v & 0xff;
        ch.counter = ((v & 0xff) + 1) | 0;
        if (st.audctl & 0x10) {
          var period12b = (((v & 0xff) << 8) | (st.channels[0].audf & 0xff)) >>> 0;
          st.channels[1].counter = (st.audctl & 0x40) ? (period12b + 7) : (period12b + 1);
        }
        break;
      case IO_AUDF3_POT4:
        ch = st.channels[2];
        ch.audf = v & 0xff;
        ch.counter = (st.audctl & 0x20) ? ((v & 0xff) + 4) : ((v & 0xff) + 1);
        if (st.audctl & 0x08) {
          var period34 = (((st.channels[3].audf & 0xff) << 8) | (v & 0xff)) >>> 0;
          st.channels[3].counter = (st.audctl & 0x20) ? (period34 + 7) : (period34 + 1);
        }
        break;
      case IO_AUDF4_POT6:
        ch = st.channels[3];
        ch.audf = v & 0xff;
        ch.counter = ((v & 0xff) + 1) | 0;
        if (st.audctl & 0x08) {
          var period34b = (((v & 0xff) << 8) | (st.channels[2].audf & 0xff)) >>> 0;
          st.channels[3].counter = (st.audctl & 0x20) ? (period34b + 7) : (period34b + 1);
        }
        break;

      case IO_AUDC1_POT1:
        st.channels[0].audc = v & 0xff;
        break;
      case IO_AUDC2_POT3:
        st.channels[1].audc = v & 0xff;
        break;
      case IO_AUDC3_POT5:
        st.channels[2].audc = v & 0xff;
        break;
      case IO_AUDC4_POT7:
        st.channels[3].audc = v & 0xff;
        break;

      case IO_AUDCTL_ALLPOT: {
        st.audctl = v & 0xff;
        pokeyAudioRecomputeClocks(st.channels, st.audctl);
        pokeyAudioReloadDividerCounters(st);
        break;
      }

      case IO_STIMER_KBCODE: {
        // STIMER restarts POKEY timers/dividers and is used for phase sync.
        for (var r = 0; r < 4; r++) st.channels[r].clkAccCycles = 0;
        pokeyAudioReloadDividerCounters(st);
        break;
      }

      case IO_SKCTL_SKSTAT: {
        var oldSk = st.skctl & 0xff;
        st.skctl = v & 0xff;
        if (((oldSk ^ st.skctl) & 0x03) && (st.skctl & 0x03) === 0) {
          // Hold RNG/audio in reset: restart polynomials and prescalers.
          st.lfsr17 = 0x1ffff;
          st.lfsr9 = 0x01ff;
          st.lfsr5 = 0x00;
          st.lfsr4 = 0x00;
          for (var i = 0; i < 4; i++) st.channels[i].clkAccCycles = 0;
          st.hp1Latch = 0;
          st.hp2Latch = 0;
        }
        break;
      }

      default:
        break;
    }
  }

  function pokeyAudioSync(ctx, st, cycleCounter) {
    if (!ctx || !st) return;
    if (!ctx.ioData) return;

    var target = cycleCounter;

    if (target <= st.lastCycle) return;

    var tmp = st._tmpOut;
    if (!tmp || tmp.length !== 512) tmp = st._tmpOut = new Float32Array(512);

    var tmpCount = 0;
    var cur = st.lastCycle;
    var cps = st.cyclesPerSampleFp;
    var samplePhase = st.samplePhaseFp;
    if (target - cur > POKEY_AUDIO_MAX_CATCHUP_CYCLES) {
      cur = target - POKEY_AUDIO_MAX_CATCHUP_CYCLES;
    }

    while (cur < target) {
      var level = pokeyAudioMixCycleSample(st);

      samplePhase += POKEY_FP_ONE;
      while (samplePhase >= cps) {
        tmp[tmpCount++] = level;
        samplePhase -= cps;
        if (tmpCount === tmp.length) {
          pokeyAudioRingWrite(st, tmp, tmpCount);
          tmpCount = 0;
        }
      }

      pokeyAudioStepCpuCycle(st);
      cur++;
    }

    if (tmpCount) pokeyAudioRingWrite(st, tmp, tmpCount);

    st.samplePhaseFp = samplePhase;
    st.lastCycle = target;
  }

  function pokeyAudioConsume(st, out) {
    if (!st || !out) return;
    var got = pokeyAudioRingRead(st, out, out.length | 0);
    if (got > 0) st.lastSample = out[got - 1] || 0.0;
    var hold = st.lastSample || 0.0;
    var decay = 0.999;
    for (var i = got; i < out.length; i++) {
      out[i] = hold;
      hold *= decay;
    }
    st.lastSample = hold || 0.0;
  }

  function piaPortBWrite(ctx, value) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;
    var oldV = sram[IO_PORTB] & 0xff;
    var v = ((value & 0x83) | 0x7c) & 0xff;

    // Bit 0: OS ROM enable (1=ROM, 0=RAM)
    if ((oldV & 0x01) !== (v & 0x01)) {
      if (v & 0x01) {
        // Enable OS ROM at $C000-$CFFF and FP ROM at $D800-$FFFF.
        sram.set(ram.subarray(0xc000, 0xd000), 0xc000);
        CPU.setRom(ctx, 0xc000, 0xcfff);
        if (io.osRom) ram.set(io.osRom, 0xc000);

        sram.set(ram.subarray(0xd800, 0x10000), 0xd800);
        CPU.setRom(ctx, 0xd800, 0xffff);
        if (io.floatingPointRom) ram.set(io.floatingPointRom, 0xd800);
      } else {
        // Disable OS ROM.
        ram.set(sram.subarray(0xc000, 0xd000), 0xc000);
        CPU.setRam(ctx, 0xc000, 0xcfff);

        ram.set(sram.subarray(0xd800, 0x10000), 0xd800);
        CPU.setRam(ctx, 0xd800, 0xffff);
      }
    }

    // Bit 1: BASIC ROM disable (1=disabled -> RAM, 0=enabled -> ROM)
    if ((oldV & 0x02) !== (v & 0x02)) {
      if (v & 0x02) {
        ram.set(sram.subarray(0xa000, 0xc000), 0xa000);
        CPU.setRam(ctx, 0xa000, 0xbfff);
      } else {
        sram.set(ram.subarray(0xa000, 0xc000), 0xa000);
        CPU.setRom(ctx, 0xa000, 0xbfff);
        if (io.basicRom) ram.set(io.basicRom, 0xa000);
      }
    }

    // Bit 7: Self-test ROM disable (1=disabled -> RAM, 0=enabled -> ROM)
    if ((oldV & 0x80) !== (v & 0x80)) {
      if (v & 0x80) {
        ram.set(sram.subarray(0x5000, 0x5800), 0x5000);
        CPU.setRam(ctx, 0x5000, 0x57ff);
      } else {
        sram.set(ram.subarray(0x5000, 0x5800), 0x5000);
        CPU.setRom(ctx, 0x5000, 0x57ff);
        if (io.selfTestRom) ram.set(io.selfTestRom, 0x5000);
      }
    }

    ram[IO_PORTB] = v;
    sram[IO_PORTB] = v;
  }

  function pokeySeroutWrite(ctx, value) {
    var io = ctx.ioData;
    var now = ctx.cycleCounter;

    io.serialOutputNeedDataCycle = now + SERIAL_OUTPUT_DATA_NEEDED_CYCLES;
    cycleTimedEventUpdate(ctx);

    var buf = io.sioBuffer;
    var SIO_DATA_OFFSET = 32;

    function queueSerinResponse(size) {
      io.sioInSize = size | 0;
      io.sioInIndex = 0;
      io.serialInputDataReadyCycle = now + SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
      cycleTimedEventUpdate(ctx);
    }

    function diskSectorSize(disk) {
      var s = 128;
      if (disk && disk.length >= 6) {
        s = (disk[4] & 0xff) | ((disk[5] & 0xff) << 8);
        if (s !== 128 && s !== 256) s = 128;
      }
      return s;
    }

    function sectorBytesAndOffset(sectorIndex, sectorSize) {
      if (sectorIndex <= 0) return null;
      var bytes = sectorIndex < 4 ? 128 : sectorSize;
      var index = sectorIndex < 4 ? (sectorIndex - 1) * 128 : (sectorIndex - 4) * sectorSize + 128 * 3;
      var offset = 16 + index;
      return { bytes: bytes | 0, offset: offset | 0 };
    }

    // --- Data phase (write/put/verify) ---
    if ((io.sioOutPhase | 0) === 1) {
      var dataIndex = io.sioDataIndex | 0;
      buf[SIO_DATA_OFFSET + dataIndex] = value & 0xff;
      dataIndex = (dataIndex + 1) | 0;
      io.sioDataIndex = dataIndex;

      var expected = (io.sioPendingBytes | 0) + 1; // data + checksum
      if (dataIndex !== expected) return;

      io.serialOutputTransmissionDoneCycle = now + SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
      cycleTimedEventUpdate(ctx);

      var dataBytes = io.sioPendingBytes | 0;
      var provided = buf[SIO_DATA_OFFSET + dataBytes] & 0xff;
      var calculated = sioChecksum(buf.subarray(SIO_DATA_OFFSET, SIO_DATA_OFFSET + dataBytes), dataBytes);

      var disk = io.disk1;
      var diskSize = (io.disk1Size | 0) || (disk ? disk.length : 0);
      var sectorSize = diskSectorSize(disk);
      var si = sectorBytesAndOffset(io.sioPendingSector | 0, sectorSize);
      var cmd = io.sioPendingCmd & 0xff;

      if (calculated !== provided || !disk || !si || si.offset < 16 || si.offset + si.bytes > diskSize || si.bytes !== dataBytes) {
        buf[0] = "N".charCodeAt(0);
        queueSerinResponse(1);
      } else if (cmd === 0x56) {
        // VERIFY SECTOR: compare payload to current disk content.
        var ok = true;
        for (var vi = 0; vi < si.bytes; vi++) {
          if ((disk[si.offset + vi] & 0xff) !== (buf[SIO_DATA_OFFSET + vi] & 0xff)) {
            ok = false;
            break;
          }
        }
        buf[0] = "A".charCodeAt(0);
        buf[1] = ok ? "C".charCodeAt(0) : "E".charCodeAt(0);
        queueSerinResponse(2);
      } else {
        // WRITE / PUT: write sector payload.
        disk.set(buf.subarray(SIO_DATA_OFFSET, SIO_DATA_OFFSET + si.bytes), si.offset);
        buf[0] = "A".charCodeAt(0);
        buf[1] = "C".charCodeAt(0);
        queueSerinResponse(2);
      }

      // Reset state.
      io.sioOutPhase = 0;
      io.sioDataIndex = 0;
      io.sioPendingCmd = 0;
      io.sioPendingSector = 0;
      io.sioPendingBytes = 0;
      io.sioOutIndex = 0;
      return;
    }

    // --- Command phase ---
    var outIdx = io.sioOutIndex | 0;
    if (outIdx === 0) {
      if (value > 0 && value < 255) {
        buf[0] = value & 0xff;
        io.sioOutIndex = 1;
      }
      return;
    }

    buf[outIdx] = value & 0xff;
    outIdx = (outIdx + 1) | 0;
    io.sioOutIndex = outIdx;

    if (outIdx !== 5) return;

    // Reset outgoing command state (always, like the C emulator).
    io.sioOutIndex = 0;

    if (sioChecksum(buf, 4) !== (buf[4] & 0xff)) {
      buf[0] = "N".charCodeAt(0);
      queueSerinResponse(1);
      return;
    }

    io.serialOutputTransmissionDoneCycle = now + SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
    cycleTimedEventUpdate(ctx);

    var dev = buf[0] & 0xff;
    var cmd2 = buf[1] & 0xff;
    var aux1 = buf[2] & 0xff;
    var aux2 = buf[3] & 0xff;

    // Only D1: for now.
    if (dev !== 0x31) {
      buf[0] = "N".charCodeAt(0);
      queueSerinResponse(1);
      return;
    }

    var disk2 = io.disk1;
    var diskSize2 = (io.disk1Size | 0) || (disk2 ? disk2.length : 0);
    var sectorSize2 = diskSectorSize(disk2);

    if (cmd2 === 0x52) {
      // READ SECTOR
      var sectorIndex = (aux1 | (aux2 << 8)) & 0xffff;
      var si2 = sectorBytesAndOffset(sectorIndex, sectorSize2);
      if (!disk2 || !si2 || si2.offset < 16 || si2.offset + si2.bytes > diskSize2) {
        buf[0] = "N".charCodeAt(0);
        queueSerinResponse(1);
        return;
      }
      buf[0] = "A".charCodeAt(0);
      buf[1] = "C".charCodeAt(0);
      buf.set(disk2.subarray(si2.offset, si2.offset + si2.bytes), 2);
      buf[si2.bytes + 2] = sioChecksum(buf.subarray(2, 2 + si2.bytes), si2.bytes);
      queueSerinResponse(si2.bytes + 3);
      return;
    }

    if (cmd2 === 0x53) {
      // STATUS
      if (!disk2 || !disk2.length || disk2[0] === 0) {
        buf[0] = "N".charCodeAt(0);
        queueSerinResponse(1);
        return;
      }
      buf[0] = "A".charCodeAt(0);
      buf[1] = "C".charCodeAt(0);
      if (sectorSize2 === 128) {
        buf[2] = 0x10;
        buf[3] = 0x00;
        buf[4] = 0x01;
        buf[5] = 0x00;
        buf[6] = 0x11;
      } else {
        buf[2] = 0x30;
        buf[3] = 0x00;
        buf[4] = 0x01;
        buf[5] = 0x00;
        buf[6] = 0x31;
      }
      queueSerinResponse(7);
      return;
    }

    if (cmd2 === 0x57 || cmd2 === 0x50 || cmd2 === 0x56) {
      // WRITE / PUT / VERIFY SECTOR (expects a data frame).
      var sectorIndex2 = (aux1 | (aux2 << 8)) & 0xffff;
      var si3 = sectorBytesAndOffset(sectorIndex2, sectorSize2);
      if (!disk2 || !si3 || si3.offset < 16 || si3.offset + si3.bytes > diskSize2) {
        buf[0] = "N".charCodeAt(0);
        queueSerinResponse(1);
        return;
      }

      io.sioOutPhase = 1;
      io.sioDataIndex = 0;
      io.sioPendingCmd = cmd2 & 0xff;
      io.sioPendingSector = sectorIndex2 & 0xffff;
      io.sioPendingBytes = si3.bytes | 0;

      // ACK command frame; host will then send the data frame.
      buf[0] = "A".charCodeAt(0);
      queueSerinResponse(1);
      return;
    }

    if (cmd2 === 0x21) {
      // FORMAT: clear data area (very minimal).
      if (!disk2 || !diskSize2 || diskSize2 <= 16) {
        buf[0] = "N".charCodeAt(0);
        queueSerinResponse(1);
        return;
      }
      disk2.fill(0, 16);
      buf[0] = "A".charCodeAt(0);
      buf[1] = "C".charCodeAt(0);
      queueSerinResponse(2);
      return;
    }

    if (cmd2 === 0x55) {
      // MOTOR ON: no-op, but ACK.
      buf[0] = "A".charCodeAt(0);
      buf[1] = "C".charCodeAt(0);
      queueSerinResponse(2);
      return;
    }

    // Unsupported command.
    buf[0] = "N".charCodeAt(0);
    queueSerinResponse(1);
  }

  function pokeySerinRead(ctx) {
    var io = ctx.ioData;
    if ((io.sioInSize | 0) > 0) {
      var b = io.sioBuffer[io.sioInIndex & 0xffff] & 0xff;
      io.sioInIndex = (io.sioInIndex + 1) & 0xffff;
      io.sioInSize = (io.sioInSize - 1) | 0;
      ctx.ram[IO_SEROUT_SERIN] = b;

      if ((io.sioInSize | 0) > 0) {
        io.serialInputDataReadyCycle =
          ctx.cycleCounter + SERIAL_INPUT_DATA_READY_CYCLES;
        cycleTimedEventUpdate(ctx);
      } else {
        io.sioInIndex = 0;
      }
    }
    return ctx.ram[IO_SEROUT_SERIN] & 0xff;
  }

  function ioAccess(ctx, value) {
    var addr = ctx.accessAddress & 0xffff;
    var ram = ctx.ram;
    var sram = ctx.sram;
    var io = ctx.ioData;

    if (value !== null && value !== undefined) {
      var v = value & 0xff;

      switch (addr) {
        // --- GTIA ---
        case IO_HPOSP0_M0PF:
        case IO_HPOSP1_M1PF:
        case IO_HPOSP2_M2PF:
        case IO_HPOSP3_M3PF:
        case IO_HPOSM0_P0PF:
        case IO_HPOSM1_P1PF:
        case IO_HPOSM2_P2PF:
        case IO_HPOSM3_P3PF:
        case IO_SIZEP0_M0PL:
        case IO_SIZEP1_M1PL:
        case IO_SIZEP2_M2PL:
        case IO_SIZEP3_M3PL:
        case IO_SIZEM_P0PL:
        case IO_GRAFP0_P1PL:
        case IO_GRAFP1_P2PL:
        case IO_GRAFP2_P3PL:
        case IO_GRAFP3_TRIG0:
        case IO_GRAFM_TRIG1:
        case IO_PRIOR:
        case IO_VDELAY:
        case IO_GRACTL:
          sram[addr] = v;
          break;

        case IO_COLPM0_TRIG2:
        case IO_COLPM1_TRIG3:
        case IO_COLPM2_PAL:
        case IO_COLPM3:
        case IO_COLPF0:
        case IO_COLPF1:
        case IO_COLPF2:
        case IO_COLPF3:
        case IO_COLBK:
          sram[addr] = v & 0xfe;
          break;

        case IO_HITCLR:
          // Clear collision registers (HITCLR) on the read side.
          ram[IO_HPOSP0_M0PF] = 0x00;
          ram[IO_HPOSP1_M1PF] = 0x00;
          ram[IO_HPOSP2_M2PF] = 0x00;
          ram[IO_HPOSP3_M3PF] = 0x00;
          ram[IO_HPOSM0_P0PF] = 0x00;
          ram[IO_HPOSM1_P1PF] = 0x00;
          ram[IO_HPOSM2_P2PF] = 0x00;
          ram[IO_HPOSM3_P3PF] = 0x00;
          ram[IO_SIZEP0_M0PL] = 0x00;
          ram[IO_SIZEP1_M1PL] = 0x00;
          ram[IO_SIZEP2_M2PL] = 0x00;
          ram[IO_SIZEP3_M3PL] = 0x00;
          ram[IO_SIZEM_P0PL] = 0x00;
          ram[IO_GRAFP0_P1PL] = 0x00;
          ram[IO_GRAFP1_P2PL] = 0x00;
          ram[IO_GRAFP2_P3PL] = 0x00;
          sram[addr] = v;
          break;

        case IO_CONSOL:
          // Only speaker bit is writable; key bits are read-only.
          sram[addr] = v & 0x08;
          break;

        // --- POKEY ---
        case IO_AUDF1_POT0:
        case IO_AUDC1_POT1:
        case IO_AUDF2_POT2:
        case IO_AUDC2_POT3:
        case IO_AUDF3_POT4:
        case IO_AUDC3_POT5:
        case IO_AUDF4_POT6:
        case IO_AUDC4_POT7:
        case IO_AUDCTL_ALLPOT:
          if (io.pokeyAudio) pokeyAudioSync(ctx, io.pokeyAudio, ctx.cycleCounter);
          sram[addr] = v;
          if (io.pokeyAudio) pokeyAudioOnRegisterWrite(io.pokeyAudio, addr, v);
          break;

        case IO_POTGO:
          sram[addr] = v;
          pokeyPotStartScan(ctx);
          break;

        case IO_STIMER_KBCODE:
          if (io.pokeyAudio) pokeyAudioSync(ctx, io.pokeyAudio, ctx.cycleCounter);
          sram[addr] = v;
          if (io.pokeyAudio) pokeyAudioOnRegisterWrite(io.pokeyAudio, addr, v);
          pokeyRestartTimers(ctx);
          break;

        case IO_SKREST_RANDOM:
          sram[addr] = v;
          break;

        case IO_SEROUT_SERIN:
          sram[addr] = v;
          pokeySeroutWrite(ctx, v);
          break;

        case IO_IRQEN_IRQST:
          sram[addr] = v;
          // IRQST bits read as 1 for disabled sources.
          ram[addr] |= (~v) & 0xff;
          break;

        case IO_SKCTL_SKSTAT:
          if (io.pokeyAudio) pokeyAudioSync(ctx, io.pokeyAudio, ctx.cycleCounter);
          sram[addr] = v;
          if (io.pokeyAudio) pokeyAudioOnRegisterWrite(io.pokeyAudio, addr, v);
          break;

        // --- PIA ---
        case IO_PORTA:
          if ((sram[IO_PACTL] & 0x04) === 0) {
            io.valuePortA = v;
            return io.valuePortA & 0xff;
          }
          sram[addr] = v;
          break;

        case IO_PORTB:
          if ((sram[IO_PBCTL] & 0x04) === 0) {
            io.valuePortB = v;
            return io.valuePortB & 0xff;
          }
          piaPortBWrite(ctx, v);
          break;

        case IO_PACTL:
          sram[addr] = v;
          ram[addr] = (v & 0x0d) | 0x30;
          break;

        case IO_PBCTL:
          sram[addr] = v;
          ram[addr] = (v & 0x0d) | 0x30;
          break;

        // --- ANTIC ---
        case IO_DMACTL:
          sram[addr] = v & 0x3f;
          break;

        case IO_CHACTL:
        case IO_PMBASE:
        case IO_CHBASE:
          sram[addr] = v;
          break;

        case IO_DLISTL:
          sram[addr] = v;
          io.displayListAddress = (io.displayListAddress & 0xff00) | v;
          break;

        case IO_DLISTH:
          sram[addr] = v;
          io.displayListAddress = (io.displayListAddress & 0x00ff) | (v << 8);
          break;

        case IO_HSCROL:
        case IO_VSCROL:
          sram[addr] = v & 0x0f;
          break;

        case IO_WSYNC: {
          // Stall until next scanline boundary (closest display list fetch cycle).
          var nextLine = io.displayListFetchCycle;
          if (nextLine <= ctx.cycleCounter) {
            nextLine =
              (((ctx.cycleCounter / CYCLES_PER_LINE) | 0) + 1) * CYCLES_PER_LINE;
          }
          ctx.stallCycleCounter = Math.max(ctx.stallCycleCounter, nextLine);
          break;
        }

        case IO_NMIEN:
          // Only bits 7-5 are used (DLI/VBI/RESET).
          sram[addr] = v & (NMI_DLI | NMI_VBI | NMI_RESET);
          break;

        case IO_NMIRES_NMIST:
          // Writing clears pending NMI status bits.
          ram[addr] = 0x00;
          break;

        case IO_VCOUNT:
        case IO_PENH:
        case IO_PENV:
          // Read-only in this emulator.
          break;

        default:
          // Default for mapped I/O addresses: write-only shadow.
          sram[addr] = v;
          break;
      }

      return ram[addr] & 0xff;
    }

    // Reads
    switch (addr) {
      case IO_PORTA:
        if ((sram[IO_PACTL] & 0x04) === 0) return io.valuePortA & 0xff;
        return ram[addr] & 0xff;

      case IO_PORTB:
        if ((sram[IO_PBCTL] & 0x04) === 0) return io.valuePortB & 0xff;
        return ram[addr] & 0xff;

      case IO_CONSOL:
        // Shim from the C/SDL version (CONSOL_HACK):
        // OS ROM reads CONSOL at $C49A (PC will be $C49D during the read) to
        // decide whether to disable BASIC. Optionally force OPTION held there.
        if (io.optionOnStart && (ctx.cpu.pc & 0xffff) === 0xc49d) return 0x03;
        return ram[addr] & 0xff;

      case IO_STIMER_KBCODE:
        // KBCODE is stored in RAM at this address by keyboard events.
        return ram[addr] & 0xff;

      case IO_SKREST_RANDOM:
        ram[addr] = pokeyStepLfsr17(io);
        return ram[addr] & 0xff;

      case IO_SEROUT_SERIN:
        return pokeySerinRead(ctx);

      case IO_AUDF1_POT0:
      case IO_AUDC1_POT1:
      case IO_AUDF2_POT2:
      case IO_AUDC2_POT3:
      case IO_AUDF3_POT4:
      case IO_AUDC3_POT5:
      case IO_AUDF4_POT6:
      case IO_AUDC4_POT7:
      case IO_AUDCTL_ALLPOT:
        pokeyPotUpdate(ctx);
        return ram[addr] & 0xff;

      default:
        return ram[addr] & 0xff;
    }
  }

  function fetchLine(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    CPU.stall(ctx, 9);

    if (io.video.currentDisplayLine === LAST_VISIBLE_LINE + 1)
      io.nextDisplayListLine = 8;

    // VBI around scanline 248 (VCOUNT=124)
    if (io.video.currentDisplayLine === 248) {
      ram[IO_NMIRES_NMIST] &= ~NMI_DLI;
      ram[IO_NMIRES_NMIST] |= NMI_VBI;
      if (sram[IO_NMIEN] & NMI_VBI) CPU.nmi(ctx);
    }

    // Playfield DMA active?
    if (sram[IO_DMACTL] & 0x20) {
      if (io.video.currentDisplayLine === io.nextDisplayListLine) {
        var oldCmd = io.currentDisplayListCommand & 0xff;
        io.currentDisplayListCommand = ram[io.displayListAddress & 0xffff] & 0xff;
        io.displayListAddress = Util.fixedAdd(io.displayListAddress, 0x03ff, 1);
        CPU.stall(ctx, 1);

        var cmd = io.currentDisplayListCommand;
        var mode = cmd & 0x0f;
        if (mode <= 0x01) {
          io.nextDisplayListLine += ((cmd & 0x70) >> 4) + 1;
        } else {
          io.nextDisplayListLine += ANTIC_MODE_INFO[mode].lines;
        }

        // Vertical scrolling adjustments (ported from AtariIo.c)
        if ((oldCmd & 0x2f) < 0x22 && (cmd & 0x2f) >= 0x22) {
          io.nextDisplayListLine = Math.max(
            io.video.currentDisplayLine + 1,
            io.nextDisplayListLine - (sram[IO_VSCROL] & 0xff)
          );
          io.video.verticalScrollOffset = 0;
        } else if ((oldCmd & 0x2f) >= 0x22 && (cmd & 0x2f) < 0x22) {
          var temp = io.nextDisplayListLine;
          io.nextDisplayListLine = Math.min(
            io.nextDisplayListLine,
            io.video.currentDisplayLine + (sram[IO_VSCROL] & 0xff) + 1
          );
          io.video.verticalScrollOffset = temp - io.nextDisplayListLine;
        } else {
          io.video.verticalScrollOffset = 0;
        }

        // DLI scheduling
        if (cmd & 0x80) {
          io.dliCycle =
            ctx.cycleCounter +
            (io.nextDisplayListLine - io.video.currentDisplayLine - 1) * CYCLES_PER_LINE;
          cycleTimedEventUpdate(ctx);
        }

        // JMP
        if ((cmd & 0x0f) === 0x01) {
          io.displayListAddress =
            ram[io.displayListAddress & 0xffff] |
            (ram[(io.displayListAddress + 1) & 0xffff] << 8);
        }

        // Wait for VBL (JVB)
        if (cmd === 0x41) io.nextDisplayListLine = 8;

        // Load memory scan (LMS)
        if ((cmd & 0x4f) >= 0x42) {
          io.displayMemoryAddress = ram[io.displayListAddress & 0xffff] & 0xff;
          io.displayListAddress = Util.fixedAdd(io.displayListAddress, 0x03ff, 1);
          io.displayMemoryAddress |=
            (ram[io.displayListAddress & 0xffff] & 0xff) << 8;
          io.displayListAddress = Util.fixedAdd(io.displayListAddress, 0x03ff, 1);
        }
      }
    }
  }

  function drawLineMode2(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
    var vScrollOffset = (8 - lineDelta) - (io.video.verticalScrollOffset | 0);
    if (lineDelta === 1) {
      io.displayMemoryAddress = Util.fixedAdd(
        io.displayMemoryAddress,
        0x0fff,
        io.drawLine.bytesPerLine
      );
    }

    var bytesPerLine = io.drawLine.bytesPerLine | 0;
    var dst = io.videoOut.pixels;
    var prio = io.videoOut.priority;
    var dstIndex = io.drawLine.destIndex | 0;
    var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
    var chactl = sram[IO_CHACTL] & 0x03;
    var priorMode = (sram[IO_PRIOR] >> 6) & 3;
    var colorTable = SCRATCH_GTIA_COLOR_TABLE;
    fillGtiaColorTable(sram, colorTable);
    var colPf1 = sram[IO_COLPF1] & 0xff;
    var colPf2 = sram[IO_COLPF2] & 0xff;
    var colBk = sram[IO_COLBK] & 0xff;
    var c0Inverse = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;
    var c1Inverse = colPf2 & 0xff;
    var c0Normal = colPf2 & 0xff;
    var c1Normal = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;

    var chBase = ((sram[IO_CHBASE] << 8) & 0xfc00) & 0xffff;

    for (var i = 0; i < bytesPerLine; i++) {
      var decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
      var ch = decoded & 0xff;
      var inverse = (decoded & 0x100) !== 0;
      dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

      var c0 = inverse ? c0Inverse : c0Normal;
      var c1 = inverse ? c1Inverse : c1Normal;
      var p0 = inverse ? PRIO_PF1 : PRIO_PF2;
      var p1 = inverse ? PRIO_PF2 : PRIO_PF1;

      var glyph = ram[(chBase + ch * 8 + (vScrollOffset & 0xff)) & 0xffff] & 0xff;

      if (priorMode === 0) {
        for (var b = 0; b < 8; b++) {
          if (glyph & 0x80) {
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
          glyph = (glyph << 1) & 0xff;
        }
      } else if (priorMode === 1) {
        // GTIA mode 9-ish: 2 pixels of 4 bits each mixed with COLBK.
        var hi = glyph >> 4;
        var lo = glyph & 0x0f;
        var col = (colBk | hi) & 0xff;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        col = (colBk | lo) & 0xff;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
      } else if (priorMode === 2) {
        var hi2 = colorTable[glyph >> 4] & 0xff;
        dst[dstIndex++] = hi2;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = hi2;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = hi2;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = hi2;
        prio[dstIndex - 1] = PRIO_BKG;
        var lo2 = colorTable[glyph & 0x0f] & 0xff;
        dst[dstIndex++] = lo2;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = lo2;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = lo2;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = lo2;
        prio[dstIndex - 1] = PRIO_BKG;
      } else {
        var hi3 = glyph & 0xf0 ? (colBk | (glyph & 0xf0)) : colBk & 0xf0;
        dst[dstIndex++] = hi3;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = hi3;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = hi3;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = hi3;
        prio[dstIndex - 1] = PRIO_BKG;
        var lo3 = glyph & 0x0f ? (colBk | ((glyph << 4) & 0xf0)) : colBk & 0xf0;
        dst[dstIndex++] = lo3;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = lo3;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = lo3;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = lo3;
        prio[dstIndex - 1] = PRIO_BKG;
      }
    }

    io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
  }

  function drawLineMode3(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
    if (lineDelta === 1) {
      // Note: matches the C emulator (no FIXED_ADD with $0FFF here).
      io.displayMemoryAddress = (io.displayMemoryAddress + (io.drawLine.bytesPerLine | 0)) & 0xffff;
    }

    var bytesPerLine = io.drawLine.bytesPerLine | 0;
    var dst = io.videoOut.pixels;
    var prio = io.videoOut.priority;
    var dstIndex = io.drawLine.destIndex | 0;
    var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
    var chactl = sram[IO_CHACTL] & 0x03;
    var colPf1 = sram[IO_COLPF1] & 0xff;
    var colPf2 = sram[IO_COLPF2] & 0xff;
    var c0Inverse = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;
    var c1Inverse = colPf2 & 0xff;
    var c0Normal = colPf2 & 0xff;
    var c1Normal = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;

    for (var i = 0; i < bytesPerLine; i++) {
      var decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
      var ch = decoded & 0xff;
      var inverse = (decoded & 0x100) !== 0;
      dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

      var c0 = inverse ? c0Inverse : c0Normal;
      var c1 = inverse ? c1Inverse : c1Normal;
      var p0 = inverse ? PRIO_PF1 : PRIO_PF2;
      var p1 = inverse ? PRIO_PF2 : PRIO_PF1;

      var data = 0;
      if (ch < 0x60) {
        if (lineDelta > 2) {
          data =
            ram[
              ((((sram[IO_CHBASE] & 0xff) << 8) & 0xfc00) +
                ch * 8 +
                (10 - lineDelta)) &
                0xffff
            ] & 0xff;
        }
      } else {
        if (lineDelta > 8) {
          data = 0;
        } else if (lineDelta > 2) {
          data =
            ram[
              ((((sram[IO_CHBASE] & 0xff) << 8) +
                ch * 8 +
                (10 - lineDelta)) &
                0xffff)
            ] & 0xff;
        } else {
          data =
            ram[
              ((((sram[IO_CHBASE] & 0xff) << 8) +
                ch * 8 +
                (2 - lineDelta)) &
                0xffff)
            ] & 0xff;
        }
      }

      for (var x = 0; x < 8; x++) {
        if (data & 0x80) {
          dst[dstIndex] = c1;
          prio[dstIndex] = p1;
        } else {
          dst[dstIndex] = c0;
          prio[dstIndex] = p0;
        }
        dstIndex++;
        data = (data << 1) & 0xff;
      }
    }

    io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
  }

  function drawLineMode4(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
    var vScrollOffset = (8 - lineDelta) - (io.video.verticalScrollOffset | 0);
    if (lineDelta === 1) {
      io.displayMemoryAddress = Util.fixedAdd(
        io.displayMemoryAddress,
        0x0fff,
        io.drawLine.bytesPerLine
      );
    }

    var chactl = sram[IO_CHACTL] & 0x03;
    var aColorTable0 = SCRATCH_COLOR_TABLE_A;
    var aColorTable1 = SCRATCH_COLOR_TABLE_B;
    fillBkgPf012ColorTable(sram, aColorTable0);
    aColorTable1[0] = sram[IO_COLBK] & 0xff;
    aColorTable1[1] = sram[IO_COLPF0] & 0xff;
    aColorTable1[2] = sram[IO_COLPF1] & 0xff;
    aColorTable1[3] = sram[IO_COLPF3] & 0xff;

    var bytesPerLine = io.drawLine.bytesPerLine | 0;
    var dst = io.videoOut.pixels;
    var prio = io.videoOut.priority;
    var dstIndex = io.drawLine.destIndex | 0;
    var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
    var chBase = (((sram[IO_CHBASE] & 0xff) << 8) & 0xfc00) & 0xffff;

    for (var i = 0; i < bytesPerLine; i++) {
      var decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
      var ch = decoded & 0xff;
      var inverse = (decoded & 0x100) !== 0;
      dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

      var colorTable = aColorTable0;
      var prioTable = PRIORITY_TABLE_BKG_PF012;
      if (inverse) {
        colorTable = aColorTable1;
        prioTable = PRIORITY_TABLE_BKG_PF013;
      }

      var data = ram[(chBase + ch * 8 + (vScrollOffset & 0xff)) & 0xffff] & 0xff;
      for (var x = 0; x < 8; x += 2) {
        var idx = (data >> (6 - x)) & 0x03;
        var c = colorTable[idx] & 0xff;
        var p = prioTable[idx] & 0xff;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;
      }
    }

    io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
  }

  function drawLineMode5(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
    var vScrollOffset = (((16 - lineDelta) - (io.video.verticalScrollOffset | 0)) >> 1) & 0xff;
    if (lineDelta === 1) {
      io.displayMemoryAddress = Util.fixedAdd(
        io.displayMemoryAddress,
        0x0fff,
        io.drawLine.bytesPerLine
      );
    }

    var chactl = sram[IO_CHACTL] & 0x03;
    var aColorTable0 = SCRATCH_COLOR_TABLE_A;
    var aColorTable1 = SCRATCH_COLOR_TABLE_B;
    fillBkgPf012ColorTable(sram, aColorTable0);
    aColorTable1[0] = sram[IO_COLBK] & 0xff;
    aColorTable1[1] = sram[IO_COLPF0] & 0xff;
    aColorTable1[2] = sram[IO_COLPF1] & 0xff;
    aColorTable1[3] = sram[IO_COLPF3] & 0xff;

    var bytesPerLine = io.drawLine.bytesPerLine | 0;
    var dst = io.videoOut.pixels;
    var prio = io.videoOut.priority;
    var dstIndex = io.drawLine.destIndex | 0;
    var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
    var chBase = (((sram[IO_CHBASE] & 0xff) << 8) & 0xfe00) & 0xffff;

    for (var i = 0; i < bytesPerLine; i++) {
      var decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
      var ch = decoded & 0xff;
      var inverse = (decoded & 0x100) !== 0;
      dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

      var colorTable = aColorTable0;
      var prioTable = PRIORITY_TABLE_BKG_PF012;
      if (inverse) {
        colorTable = aColorTable1;
        prioTable = PRIORITY_TABLE_BKG_PF013;
      }

      var data = ram[(chBase + ch * 8 + vScrollOffset) & 0xffff] & 0xff;
      for (var x = 0; x < 8; x += 2) {
        var idx = (data >> (6 - x)) & 0x03;
        var c = colorTable[idx] & 0xff;
        var p = prioTable[idx] & 0xff;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;
      }
    }

    io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
  }

  function drawLineMode6(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
    var vScrollOffset = (8 - lineDelta) - (io.video.verticalScrollOffset | 0);
    if (lineDelta === 1) {
      io.displayMemoryAddress = Util.fixedAdd(
        io.displayMemoryAddress,
        0x0fff,
        io.drawLine.bytesPerLine
      );
    }

    var aColorTable = SCRATCH_COLOR_TABLE_A;
    aColorTable[0] = sram[IO_COLPF0] & 0xff;
    aColorTable[1] = sram[IO_COLPF1] & 0xff;
    aColorTable[2] = sram[IO_COLPF2] & 0xff;
    aColorTable[3] = sram[IO_COLPF3] & 0xff;
    var cColor0 = sram[IO_COLBK] & 0xff;

    var bytesPerLine = io.drawLine.bytesPerLine | 0;
    var dst = io.videoOut.pixels;
    var prio = io.videoOut.priority;
    var dstIndex = io.drawLine.destIndex | 0;
    var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
    var chBase = (((sram[IO_CHBASE] & 0xff) << 8) & 0xfe00) & 0xffff;

    for (var i = 0; i < bytesPerLine; i++) {
      var ch = ram[dispAddr] & 0xff;
      dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

      var cColor1 = aColorTable[ch >> 6] & 0xff;
      var p = PRIORITY_TABLE_PF0123[ch >> 6] & 0xff;
      ch &= 0x3f;

      var data = ram[(chBase + ch * 8 + (vScrollOffset & 0xff)) & 0xffff] & 0xff;
      for (var x = 0; x < 8; x++) {
        if (data & 0x80) {
          dst[dstIndex] = cColor1;
          prio[dstIndex] = p;
          dst[dstIndex + 1] = cColor1;
          prio[dstIndex + 1] = p;
        } else {
          dst[dstIndex] = cColor0;
          prio[dstIndex] = PRIO_BKG;
          dst[dstIndex + 1] = cColor0;
          prio[dstIndex + 1] = PRIO_BKG;
        }
        dstIndex += 2;
        data = (data << 1) & 0xff;
      }
    }

    io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
  }

  function drawLineMode7(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
    var vScrollOffset = (((16 - lineDelta) - (io.video.verticalScrollOffset | 0)) >> 1) & 0xff;
    if (lineDelta === 1) {
      io.displayMemoryAddress = Util.fixedAdd(
        io.displayMemoryAddress,
        0x0fff,
        io.drawLine.bytesPerLine
      );
    }

    var aColorTable = SCRATCH_COLOR_TABLE_A;
    aColorTable[0] = sram[IO_COLPF0] & 0xff;
    aColorTable[1] = sram[IO_COLPF1] & 0xff;
    aColorTable[2] = sram[IO_COLPF2] & 0xff;
    aColorTable[3] = sram[IO_COLPF3] & 0xff;
    var cColor0 = sram[IO_COLBK] & 0xff;

    var bytesPerLine = io.drawLine.bytesPerLine | 0;
    var dst = io.videoOut.pixels;
    var prio = io.videoOut.priority;
    var dstIndex = io.drawLine.destIndex | 0;
    var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
    var chBase = (((sram[IO_CHBASE] & 0xff) << 8) & 0xfe00) & 0xffff;

    for (var i = 0; i < bytesPerLine; i++) {
      var ch = ram[dispAddr] & 0xff;
      dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

      var cColor1 = aColorTable[ch >> 6] & 0xff;
      var p = PRIORITY_TABLE_PF0123[ch >> 6] & 0xff;
      ch &= 0x3f;

      var data = ram[(chBase + ch * 8 + vScrollOffset) & 0xffff] & 0xff;
      for (var x = 0; x < 8; x++) {
        if (data & 0x80) {
          dst[dstIndex] = cColor1;
          prio[dstIndex] = p;
          dst[dstIndex + 1] = cColor1;
          prio[dstIndex + 1] = p;
        } else {
          dst[dstIndex] = cColor0;
          prio[dstIndex] = PRIO_BKG;
          dst[dstIndex + 1] = cColor0;
          prio[dstIndex + 1] = PRIO_BKG;
        }
        dstIndex += 2;
        data = (data << 1) & 0xff;
      }
    }

    io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
  }

  function drawLineMode8(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
    if (lineDelta === 1) {
      io.displayMemoryAddress = Util.fixedAdd(
        io.displayMemoryAddress,
        0x0fff,
        io.drawLine.bytesPerLine
      );
    }

    var aColorTable = SCRATCH_COLOR_TABLE_A;
    fillBkgPf012ColorTable(sram, aColorTable);

    var bytesPerLine = io.drawLine.bytesPerLine | 0;
    var dst = io.videoOut.pixels;
    var prio = io.videoOut.priority;
    var dstIndex = io.drawLine.destIndex | 0;
    var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

    for (var i = 0; i < bytesPerLine; i++) {
      var data = ram[dispAddr] & 0xff;
      dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

      for (var x = 0; x < 8; x += 2) {
        var idx = (data >> (6 - x)) & 0x03;
        var c = aColorTable[idx] & 0xff;
        var p = PRIORITY_TABLE_BKG_PF012[idx] & 0xff;
        for (var k = 0; k < 8; k++) {
          dst[dstIndex] = c;
          prio[dstIndex] = p;
          dstIndex++;
        }
      }
    }

    io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
  }

  function drawLineMode9(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
    if (lineDelta === 1) {
      io.displayMemoryAddress = Util.fixedAdd(
        io.displayMemoryAddress,
        0x0fff,
        io.drawLine.bytesPerLine
      );
    }

    var bytesPerLine = io.drawLine.bytesPerLine | 0;
    var dst = io.videoOut.pixels;
    var prio = io.videoOut.priority;
    var dstIndex = io.drawLine.destIndex | 0;
    var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

    var pf0 = sram[IO_COLPF0] & 0xff;
    var bkg = sram[IO_COLBK] & 0xff;

    for (var i = 0; i < bytesPerLine; i++) {
      var data = ram[dispAddr] & 0xff;
      dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

      for (var x = 0; x < 8; x++) {
        var c = data & 0x80 ? pf0 : bkg;
        var p = data & 0x80 ? PRIO_PF0 : PRIO_BKG;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dst[dstIndex + 2] = c;
        prio[dstIndex + 2] = p;
        dst[dstIndex + 3] = c;
        prio[dstIndex + 3] = p;
        dstIndex += 4;
        data = (data << 1) & 0xff;
      }
    }

    io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
  }

  function drawLineModeA(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
    if (lineDelta === 1) {
      io.displayMemoryAddress = Util.fixedAdd(
        io.displayMemoryAddress,
        0x0fff,
        io.drawLine.bytesPerLine
      );
    }

    var aColorTable = SCRATCH_COLOR_TABLE_A;
    fillBkgPf012ColorTable(sram, aColorTable);

    var bytesPerLine = io.drawLine.bytesPerLine | 0;
    var dst = io.videoOut.pixels;
    var prio = io.videoOut.priority;
    var dstIndex = io.drawLine.destIndex | 0;
    var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

    for (var i = 0; i < bytesPerLine; i++) {
      var data = ram[dispAddr] & 0xff;
      dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

      for (var x = 0; x < 8; x += 2) {
        var idx = (data >> (6 - x)) & 0x03;
        var c = aColorTable[idx] & 0xff;
        var p = PRIORITY_TABLE_BKG_PF012[idx] & 0xff;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dst[dstIndex + 2] = c;
        prio[dstIndex + 2] = p;
        dst[dstIndex + 3] = c;
        prio[dstIndex + 3] = p;
        dstIndex += 4;
      }
    }

    io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
  }

  function drawLineModeB(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
    if (lineDelta === 1) {
      io.displayMemoryAddress = Util.fixedAdd(
        io.displayMemoryAddress,
        0x0fff,
        io.drawLine.bytesPerLine
      );
    }

    var bytesPerLine = io.drawLine.bytesPerLine | 0;
    var dst = io.videoOut.pixels;
    var prio = io.videoOut.priority;
    var dstIndex = io.drawLine.destIndex | 0;
    var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

    var pf0 = sram[IO_COLPF0] & 0xff;
    var bkg = sram[IO_COLBK] & 0xff;

    for (var i = 0; i < bytesPerLine; i++) {
      var data = ram[dispAddr] & 0xff;
      dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

      for (var x = 0; x < 8; x++) {
        var c = data & 0x80 ? pf0 : bkg;
        var p = data & 0x80 ? PRIO_PF0 : PRIO_BKG;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;
        data = (data << 1) & 0xff;
      }
    }

    io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
  }

  function drawLineModeC(ctx) {
    // Same renderer as mode B in the C emulator.
    drawLineModeB(ctx);
  }

  function drawLineModeD(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
    if (lineDelta === 1) {
      io.displayMemoryAddress = Util.fixedAdd(
        io.displayMemoryAddress,
        0x0fff,
        io.drawLine.bytesPerLine
      );
    }

    var aColorTable = SCRATCH_COLOR_TABLE_A;
    fillBkgPf012ColorTable(sram, aColorTable);

    var bytesPerLine = io.drawLine.bytesPerLine | 0;
    var dst = io.videoOut.pixels;
    var prio = io.videoOut.priority;
    var dstIndex = io.drawLine.destIndex | 0;
    var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

    for (var i = 0; i < bytesPerLine; i++) {
      var data = ram[dispAddr] & 0xff;
      dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

      for (var x = 0; x < 8; x += 2) {
        var idx = (data >> (6 - x)) & 0x03;
        var c = aColorTable[idx] & 0xff;
        var p = PRIORITY_TABLE_BKG_PF012[idx] & 0xff;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;
      }
    }

    io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
  }

  function drawLineModeE(ctx) {
    // Same renderer as mode D in the C emulator.
    drawLineModeD(ctx);
  }

  function drawLineModeF(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
    if (lineDelta === 1) {
      io.displayMemoryAddress = Util.fixedAdd(
        io.displayMemoryAddress,
        0x0fff,
        io.drawLine.bytesPerLine
      );
    }

    var bytesPerLine = io.drawLine.bytesPerLine | 0;
    var dst = io.videoOut.pixels;
    var prio = io.videoOut.priority;
    var dstIndex = io.drawLine.destIndex | 0;
    var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

    var cColor0 = sram[IO_COLPF2] & 0xff;
    var cColor1 = ((sram[IO_COLPF2] & 0xf0) | (sram[IO_COLPF1] & 0x0f)) & 0xff;

    var colorTable = SCRATCH_GTIA_COLOR_TABLE;
    fillGtiaColorTable(sram, colorTable);
    var colBk = sram[IO_COLBK] & 0xff;

    var priorMode = (sram[IO_PRIOR] >> 6) & 3;

    if (priorMode === 0) {
      for (var i = 0; i < bytesPerLine; i++) {
        var data = ram[dispAddr] & 0xff;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
        for (var x = 0; x < 8; x++) {
          if (data & 0x80) {
            dst[dstIndex] = cColor1;
            prio[dstIndex] = PRIO_PF1;
          } else {
            dst[dstIndex] = cColor0;
            prio[dstIndex] = PRIO_PF2;
          }
          dstIndex++;
          data = (data << 1) & 0xff;
        }
      }
    } else if (priorMode === 1) {
      for (var i1 = 0; i1 < bytesPerLine; i1++) {
        var d1 = ram[dispAddr] & 0xff;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
        var col = (colBk | (d1 >> 4)) & 0xff;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        col = (colBk | (d1 & 0x0f)) & 0xff;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = col;
        prio[dstIndex - 1] = PRIO_BKG;
      }
    } else if (priorMode === 2) {
      for (var i2 = 0; i2 < bytesPerLine; i2++) {
        var d2 = ram[dispAddr] & 0xff;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
        var hi = colorTable[d2 >> 4] & 0xff;
        dst[dstIndex++] = hi;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = hi;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = hi;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = hi;
        prio[dstIndex - 1] = PRIO_BKG;
        var lo = colorTable[d2 & 0x0f] & 0xff;
        dst[dstIndex++] = lo;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = lo;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = lo;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = lo;
        prio[dstIndex - 1] = PRIO_BKG;
      }
    } else {
      for (var i3 = 0; i3 < bytesPerLine; i3++) {
        var d3 = ram[dispAddr] & 0xff;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
        var hi3 = d3 & 0xf0 ? (colBk | (d3 & 0xf0)) : colBk & 0xf0;
        dst[dstIndex++] = hi3;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = hi3;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = hi3;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = hi3;
        prio[dstIndex - 1] = PRIO_BKG;
        var lo3 = d3 & 0x0f ? (colBk | ((d3 << 4) & 0xf0)) : colBk & 0xf0;
        dst[dstIndex++] = lo3;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = lo3;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = lo3;
        prio[dstIndex - 1] = PRIO_BKG;
        dst[dstIndex++] = lo3;
        prio[dstIndex - 1] = PRIO_BKG;
      }
    }

    io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
  }

  function drawLine(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;
    var video = io.videoOut;

    var y = io.video.currentDisplayLine | 0;
    if (y < FIRST_VISIBLE_LINE || y > LAST_VISIBLE_LINE) return;

    var prior = sram[IO_PRIOR] & 0xff;
    SCRATCH_BACKGROUND_TABLE[0] = sram[IO_COLBK] & 0xff;
    SCRATCH_BACKGROUND_TABLE[1] = sram[IO_COLBK] & 0xff;
    SCRATCH_BACKGROUND_TABLE[2] = sram[IO_COLPM0_TRIG2] & 0xff;
    SCRATCH_BACKGROUND_TABLE[3] = sram[IO_COLBK] & 0xf0;
    var bkg = SCRATCH_BACKGROUND_TABLE[(prior >> 6) & 3] & 0xff;

    var dmactl = sram[IO_DMACTL] & 0xff;
    var pfWidth = dmactl & 0x03;
    var pfDma = dmactl & 0x20;

    if (pfDma && pfWidth) {
      var cmd = io.currentDisplayListCommand & 0xff;
      var mode = cmd & 0x0f;

      if (mode < 2) {
        fillLine(video, y, 0, PIXELS_PER_LINE, bkg, PRIO_BKG);
        return;
      }

      var playfieldPixels = 192 + pfWidth * 64;
      var leftBorder = 0;
      var rightBorder = 0;
      var destIndex = y * PIXELS_PER_LINE;

      if (pfWidth === 0x01) {
        leftBorder = (16 + 12 + 6 + 30) * 2;
        rightBorder = (30 + 6) * 2;
        destIndex += (16 + 12 + 6 + 30) * 2;
      } else if (pfWidth === 0x02) {
        leftBorder = (16 + 12 + 6 + 14) * 2;
        rightBorder = (14 + 6) * 2;
        destIndex += (16 + 12 + 6 + 14) * 2;
      } else if (pfWidth === 0x03) {
        leftBorder = (16 + 12 + 6 + 10) * 2;
        rightBorder = (2 + 6) * 2;
        // Matches the original emulator: start earlier for horizontal scrolling.
        destIndex += (16 + 12 + 4) * 2;
      }

      var ppb = ANTIC_MODE_INFO[mode].ppb || 8;
      var bytesPerLine = (playfieldPixels / ppb) | 0;

      if (cmd & 0x10) {
        // HSCROL
        var h = sram[IO_HSCROL] & 0xff;
        if (pfWidth !== 0x03) {
          destIndex -= 32 - h * 2;
          bytesPerLine += 8;
        } else {
          destIndex += h * 2;
        }
      }

      io.drawLine.bytesPerLine = bytesPerLine;
      CPU.stall(ctx, bytesPerLine);
      io.drawLine.destIndex = destIndex;
      io.drawLine.displayMemoryAddress = io.displayMemoryAddress & 0xffff;

      switch (mode) {
        case 2:
          drawLineMode2(ctx);
          break;
        case 3:
          drawLineMode3(ctx);
          break;
        case 4:
          drawLineMode4(ctx);
          break;
        case 5:
          drawLineMode5(ctx);
          break;
        case 6:
          drawLineMode6(ctx);
          break;
        case 7:
          drawLineMode7(ctx);
          break;
        case 8:
          drawLineMode8(ctx);
          break;
        case 9:
          drawLineMode9(ctx);
          break;
        case 0x0a:
          drawLineModeA(ctx);
          break;
        case 0x0b:
          drawLineModeB(ctx);
          break;
        case 0x0c:
          drawLineModeC(ctx);
          break;
        case 0x0d:
          drawLineModeD(ctx);
          break;
        case 0x0e:
          drawLineModeE(ctx);
          break;
        case 0x0f:
          drawLineModeF(ctx);
          break;
        default:
          fillLine(
            video,
            y,
            destIndex - y * PIXELS_PER_LINE,
            bytesPerLine * ppb,
            bkg,
            PRIO_BKG
          );
          break;
      }

      if (leftBorder) fillLine(video, y, 0, leftBorder, bkg, PRIO_BKG);
      if (rightBorder)
        fillLine(
          video,
          y,
          playfieldPixels + leftBorder,
          rightBorder,
          bkg,
          PRIO_BKG
        );
    } else {
      fillLine(video, y, 0, PIXELS_PER_LINE, bkg, PRIO_BKG);
    }
  }

  function drawPlayer(
    color,
    size,
    data,
    priorityMask,
    priorityBit,
    prio,
    dst,
    startIndex,
    special,
    overlap
  ) {
    var mask = 0x80;
    var collision = 0;
    var step;
    var cColor = color & 0xff;
    var cPriorityMask = priorityMask & 0xff;
    var cPriorityBit = priorityBit & 0xff;
    var cOverlap = overlap & 0xff;

    if (((size & 0x03) & 0xff) === 0x01) step = 4;
    else if (((size & 0x03) & 0xff) === 0x03) step = 8;
    else step = 2;

    var idx = startIndex | 0;
    while (mask) {
      if (data & mask) {
        for (var o = 0; o < step; o++) {
          var pi = (idx + o) | 0;
          var p = prio[pi] & 0xff;

          if (cOverlap && (p & cOverlap)) {
            if (special && (p & PRIO_PF1)) {
              dst[pi] = (dst[pi] | (cColor & 0xf0)) & 0xff;
            } else if (!(p & cPriorityMask)) {
              dst[pi] = (dst[pi] | cColor) & 0xff;
            }
          } else {
            if (special && (p & PRIO_PF1)) {
              dst[pi] = ((dst[pi] & 0x0f) | (cColor & 0xf0)) & 0xff;
            } else if (!(p & cPriorityMask)) {
              dst[pi] = cColor;
            }
          }

          prio[pi] = (prio[pi] | cPriorityBit) & 0xff;
          collision |= prio[pi] & 0xff;
        }
      }

      idx += step;
      mask >>= 1;
    }

    if (special) {
      collision =
        (collision & ~(PRIO_PF1 | PRIO_PF2)) | (collision & PRIO_PF1 ? PRIO_PF2 : 0);
    }

    return collision & 0xff;
  }

  function drawMissile(
    number,
    color,
    size,
    data,
    priorityMask,
    prio,
    dst,
    startIndex,
    special
  ) {
    var collision = 0;
    var cColor = color & 0xff;
    var cPriorityMask = priorityMask & 0xff;

    var shifted = (number & 3) << 1;
    var mask = (0x02 << shifted) & 0xff;

    var width;
    var sizeBits = size & (0x03 << shifted);
    if (sizeBits === (0x01 << shifted)) width = 4;
    else if (sizeBits === (0x03 << shifted)) width = 8;
    else width = 2;

    function drawPixel(pi) {
      var p = prio[pi] & 0xff;
      if (special && (p & PRIO_PF1)) {
        dst[pi] = ((dst[pi] & 0x0f) | (cColor & 0xf0)) & 0xff;
      } else if (!(p & cPriorityMask)) {
        dst[pi] = cColor;
      }
      collision |= p;
    }

    if (data & mask) {
      for (var o0 = 0; o0 < width; o0++) drawPixel((startIndex + o0) | 0);
    }

    mask >>= 1;
    if (data & mask) {
      var base = (startIndex + width) | 0;
      for (var o1 = 0; o1 < width; o1++) drawPixel((base + o1) | 0);
    }

    if (special) {
      collision =
        (collision & ~(PRIO_PF1 | PRIO_PF2)) | (collision & PRIO_PF1 ? PRIO_PF2 : 0);
    }

    return collision & 0xff;
  }

  function drawPlayerMissiles(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;
    var y = io.video.currentDisplayLine | 0;

    if (y >= 248) return;

    var dst = io.videoOut.pixels;
    var prio = io.videoOut.priority;
    var prior = sram[IO_PRIOR] & 0xff;
    var mode = io.currentDisplayListCommand & 0x0f;
    var special = (mode === 0x02 || mode === 0x03 || mode === 0x0f) && (prior & 0xc0) === 0;

    var dmactl = sram[IO_DMACTL] & 0xff;
    var pmDmaPlayers = (dmactl & 0x08) && (sram[IO_GRACTL] & 0x02);
    var pmDmaMissiles = (dmactl & 0x04) && (sram[IO_GRACTL] & 0x01);

    var pmbaseHi = (sram[IO_PMBASE] & 0xff) << 8;

    function pmAddrHiRes(offset) {
      return ((pmbaseHi & 0xf800) + offset + y) & 0xffff;
    }

    function pmAddrLoRes(offset, vdelayMask) {
      var lineIndex = (y >> 1) - ((sram[IO_VDELAY] & vdelayMask) ? 1 : 0);
      return ((pmbaseHi & 0xfc00) + offset + (lineIndex & 0xffff)) & 0xffff;
    }

    // Keep the order of the players being drawn!

    // Player 3
    var data;
    if (pmDmaPlayers) {
      data = dmactl & 0x10 ? ram[pmAddrHiRes(1792)] & 0xff : ram[pmAddrLoRes(896, 0x80)] & 0xff;
    } else {
      data = sram[IO_GRAFP3_TRIG0] & 0xff;
    }

    var hpos = sram[IO_HPOSP3_M3PF] & 0xff;
    if (data && hpos) {
      var start = y * PIXELS_PER_LINE + hpos * 2;
      var mask;
      if (prior & 0x01) mask = PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
      else if (prior & 0x02) mask = PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM2;
      else if (prior & 0x04) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
      else if (prior & 0x08) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
      else mask = 0x00;

      var col = drawPlayer(
        sram[IO_COLPM3],
        sram[IO_SIZEP3_M3PL],
        data,
        mask,
        PRIO_PM3,
        prio,
        dst,
        start,
        special,
        0
      );

      ram[IO_HPOSM3_P3PF] |= col & 0x0f;
    }

    // Player 2
    if (pmDmaPlayers) {
      data = dmactl & 0x10 ? ram[pmAddrHiRes(1536)] & 0xff : ram[pmAddrLoRes(768, 0x40)] & 0xff;
    } else {
      data = sram[IO_GRAFP2_P3PL] & 0xff;
    }

    hpos = sram[IO_HPOSP2_M2PF] & 0xff;
    if (data && hpos) {
      var start2 = y * PIXELS_PER_LINE + hpos * 2;
      if (prior & 0x01) mask = PRIO_PM0 | PRIO_PM1;
      else if (prior & 0x02) mask = PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
      else if (prior & 0x04) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1;
      else if (prior & 0x08) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1;
      else mask = 0x00;

      var col2 = drawPlayer(
        sram[IO_COLPM2_PAL],
        sram[IO_SIZEP2_M2PL],
        data,
        mask,
        PRIO_PM2,
        prio,
        dst,
        start2,
        special,
        prior & 0x20 ? PRIO_PM3 : 0
      );

      ram[IO_HPOSM2_P2PF] |= col2 & 0x0f;
      if (col2 & PRIO_PM3) ram[IO_GRAFP2_P3PL] |= 0x04;
      ram[IO_GRAFP1_P2PL] |= ((col2 >> 4) & ~0x04) & 0xff;
    }

    // Player 1
    if (pmDmaPlayers) {
      data = dmactl & 0x10 ? ram[pmAddrHiRes(1280)] & 0xff : ram[pmAddrLoRes(640, 0x20)] & 0xff;
    } else {
      data = sram[IO_GRAFP1_P2PL] & 0xff;
    }

    hpos = sram[IO_HPOSP1_M1PF] & 0xff;
    if (data && hpos) {
      var start1 = y * PIXELS_PER_LINE + hpos * 2;
      if (prior & 0x01) mask = PRIO_PM0;
      else if (prior & 0x02) mask = PRIO_PM0;
      else if (prior & 0x04) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0;
      else if (prior & 0x08) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0;
      else mask = 0x00;

      var col1 = drawPlayer(
        sram[IO_COLPM1_TRIG3],
        sram[IO_SIZEP1_M1PL],
        data,
        mask,
        PRIO_PM1,
        prio,
        dst,
        start1,
        special,
        0
      );

      ram[IO_HPOSM1_P1PF] |= col1 & 0x0f;
      if (col1 & PRIO_PM3) ram[IO_GRAFP2_P3PL] |= 0x02;
      if (col1 & PRIO_PM2) ram[IO_GRAFP1_P2PL] |= 0x02;
      ram[IO_GRAFP0_P1PL] |= ((col1 >> 4) & ~0x02) & 0xff;
    }

    // Player 0
    if (pmDmaPlayers) {
      data = dmactl & 0x10 ? ram[pmAddrHiRes(1024)] & 0xff : ram[pmAddrLoRes(512, 0x10)] & 0xff;
    } else {
      data = sram[IO_GRAFP0_P1PL] & 0xff;
    }

    hpos = sram[IO_HPOSP0_M0PF] & 0xff;
    if (data && hpos) {
      var start0 = y * PIXELS_PER_LINE + hpos * 2;
      if (prior & 0x01) mask = 0x00;
      else if (prior & 0x02) mask = 0x00;
      else if (prior & 0x04) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
      else if (prior & 0x08) mask = PRIO_PF0 | PRIO_PF1;
      else mask = 0x00;

      var col0 = drawPlayer(
        sram[IO_COLPM0_TRIG2],
        sram[IO_SIZEP0_M0PL],
        data,
        mask,
        PRIO_PM0,
        prio,
        dst,
        start0,
        special,
        prior & 0x20 ? PRIO_PM1 : 0
      );

      ram[IO_HPOSM0_P0PF] |= col0 & 0x0f;
      if (col0 & PRIO_PM3) ram[IO_GRAFP2_P3PL] |= 0x01;
      if (col0 & PRIO_PM2) ram[IO_GRAFP1_P2PL] |= 0x01;
      if (col0 & PRIO_PM1) ram[IO_GRAFP0_P1PL] |= 0x01;
      ram[IO_SIZEM_P0PL] |= ((col0 >> 4) & ~0x01) & 0xff;
    }

    // All missiles
    if (pmDmaMissiles) {
      data = dmactl & 0x10 ? ram[pmAddrHiRes(768)] & 0xff : ram[pmAddrLoRes(384, 0x08)] & 0xff;
    } else {
      data = sram[IO_GRAFM_TRIG1] & 0xff;
    }

    // Missile 3
    hpos = sram[IO_HPOSM3_P3PF] & 0xff;
    if ((data & 0xc0) && hpos) {
      var startM3 = y * PIXELS_PER_LINE + hpos * 2;
      if (prior & 0x01) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
      else if (prior & 0x02) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 : PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM2;
      else if (prior & 0x04) mask = prior & 0x10 ? 0x00 : PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
      else if (prior & 0x08) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
      else mask = 0x00;

      var colM3 = drawMissile(
        3,
        prior & 0x10 ? sram[IO_COLPF3] : sram[IO_COLPM3],
        sram[IO_SIZEM_P0PL],
        data,
        mask,
        prio,
        dst,
        startM3,
        special
      );

      ram[IO_HPOSP3_M3PF] |= colM3 & 0x0f;
      ram[IO_SIZEP3_M3PL] |= (colM3 >> 4) & 0xff;
    }

    // Missile 2
    hpos = sram[IO_HPOSM2_P2PF] & 0xff;
    if ((data & 0x30) && hpos) {
      var startM2 = y * PIXELS_PER_LINE + hpos * 2;
      if (prior & 0x01) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PM0 | PRIO_PM1;
      else if (prior & 0x02) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 : PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
      else if (prior & 0x04) mask = prior & 0x10 ? 0x00 : PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1;
      else if (prior & 0x08) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1;
      else mask = 0x00;

      var colM2 = drawMissile(
        2,
        prior & 0x10 ? sram[IO_COLPF3] : sram[IO_COLPM2_PAL],
        sram[IO_SIZEM_P0PL],
        data,
        mask,
        prio,
        dst,
        startM2,
        special
      );

      ram[IO_HPOSP2_M2PF] |= colM2 & 0x0f;
      ram[IO_SIZEP2_M2PL] |= (colM2 >> 4) & 0xff;
    }

    // Missile 1
    hpos = sram[IO_HPOSM1_P1PF] & 0xff;
    if ((data & 0x0c) && hpos) {
      var startM1 = y * PIXELS_PER_LINE + hpos * 2;
      if (prior & 0x01) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PM0;
      else if (prior & 0x02) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 : PRIO_PM0;
      else if (prior & 0x04) mask = prior & 0x10 ? 0x00 : PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0;
      else if (prior & 0x08) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PF0 | PRIO_PF1 | PRIO_PM0;
      else mask = 0x00;

      var colM1 = drawMissile(
        1,
        prior & 0x10 ? sram[IO_COLPF3] : sram[IO_COLPM1_TRIG3],
        sram[IO_SIZEM_P0PL],
        data,
        mask,
        prio,
        dst,
        startM1,
        special
      );

      ram[IO_HPOSP1_M1PF] |= colM1 & 0x0f;
      ram[IO_SIZEP1_M1PL] |= (colM1 >> 4) & 0xff;
    }

    // Missile 0
    hpos = sram[IO_HPOSM0_P0PF] & 0xff;
    if ((data & 0x03) && hpos) {
      var startM0 = y * PIXELS_PER_LINE + hpos * 2;
      if (prior & 0x01) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : 0x00;
      else if (prior & 0x02) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 : 0x00;
      else if (prior & 0x04) mask = prior & 0x10 ? 0x00 : PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
      else if (prior & 0x08) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PF0 | PRIO_PF1;
      else mask = 0x00;

      var colM0 = drawMissile(
        0,
        prior & 0x10 ? sram[IO_COLPF3] : sram[IO_COLPM0_TRIG2],
        sram[IO_SIZEM_P0PL],
        data,
        mask,
        prio,
        dst,
        startM0,
        special
      );

      ram[IO_HPOSP0_M0PF] |= colM0 & 0x0f;
      ram[IO_SIZEP0_M0PL] |= (colM0 >> 4) & 0xff;
    }
  }

  function ioCycleTimedEvent(ctx) {
    var io = ctx.ioData;
    var ram = ctx.ram;
    var sram = ctx.sram;

    if (ctx.cycleCounter >= io.displayListFetchCycle) {
      io.video.currentDisplayLine++;
      if (io.video.currentDisplayLine >= LINES_PER_SCREEN_PAL) {
        io.video.currentDisplayLine = 0;
        io.nextDisplayListLine = 8;
      }
      ram[IO_VCOUNT] = (io.video.currentDisplayLine >> 1) & 0xff;
      fetchLine(ctx);
      io.displayListFetchCycle += CYCLES_PER_LINE;
    }

    if (ctx.cycleCounter >= io.dliCycle) {
      ram[IO_NMIRES_NMIST] &= ~NMI_VBI;
      ram[IO_NMIRES_NMIST] |= NMI_DLI;
      if (sram[IO_NMIEN] & NMI_DLI) CPU.nmi(ctx);
      io.dliCycle = CYCLE_NEVER;
    }

    if (ctx.cycleCounter >= io.drawLineCycle) {
      if (io.video.currentDisplayLine === 0) io.videoOut.priority.fill(0);
      drawLine(ctx);
      drawPlayerMissiles(ctx);
      io.drawLineCycle += CYCLES_PER_LINE;
    }

    if (ctx.cycleCounter >= io.serialOutputTransmissionDoneCycle) {
      ram[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE;
      if (sram[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE) CPU.irq(ctx);
      io.serialOutputTransmissionDoneCycle = CYCLE_NEVER;
    }

    if (ctx.cycleCounter >= io.serialOutputNeedDataCycle) {
      ram[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_OUTPUT_DATA_NEEDED;
      if (sram[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_DATA_NEEDED) CPU.irq(ctx);
      io.serialOutputNeedDataCycle = CYCLE_NEVER;
    }

    if (ctx.cycleCounter >= io.serialInputDataReadyCycle) {
      ram[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_INPUT_DATA_READY;
      if (sram[IO_IRQEN_IRQST] & IRQ_SERIAL_INPUT_DATA_READY) CPU.irq(ctx);
      io.serialInputDataReadyCycle = CYCLE_NEVER;
    }

    if (ctx.cycleCounter >= io.timer1Cycle) {
      var p1 = pokeyTimerPeriodCpuCycles(ctx, 1);
      ram[IO_IRQEN_IRQST] &= ~IRQ_TIMER_1;
      if (sram[IO_IRQEN_IRQST] & IRQ_TIMER_1) CPU.irq(ctx);
      if (p1 === 0) io.timer1Cycle = CYCLE_NEVER;
      else {
        while (io.timer1Cycle <= ctx.cycleCounter) io.timer1Cycle += p1;
      }
    }

    if (ctx.cycleCounter >= io.timer2Cycle) {
      var p2 = pokeyTimerPeriodCpuCycles(ctx, 2);
      ram[IO_IRQEN_IRQST] &= ~IRQ_TIMER_2;
      if (sram[IO_IRQEN_IRQST] & IRQ_TIMER_2) CPU.irq(ctx);
      if (p2 === 0) io.timer2Cycle = CYCLE_NEVER;
      else {
        while (io.timer2Cycle <= ctx.cycleCounter) io.timer2Cycle += p2;
      }
    }

    if (ctx.cycleCounter >= io.timer4Cycle) {
      var p4 = pokeyTimerPeriodCpuCycles(ctx, 4);
      ram[IO_IRQEN_IRQST] &= ~IRQ_TIMER_4;
      if (sram[IO_IRQEN_IRQST] & IRQ_TIMER_4) CPU.irq(ctx);
      if (p4 === 0) io.timer4Cycle = CYCLE_NEVER;
      else {
        while (io.timer4Cycle <= ctx.cycleCounter) io.timer4Cycle += p4;
      }
    }

    cycleTimedEventUpdate(ctx);
  }

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
      audioMode: "none", // "none" | "worklet" | "script" | "loading"
    };

    machine.ctx.ioData = makeIoData(video);
    machine.ctx.ioData.optionOnStart = optionOnStart;
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
          .addModule("js/pokey-audio-worklet.js")
          .then(function () {
            if (!machine.audioCtx || !audioEnabled) return;
            var node = new window.AudioWorkletNode(machine.audioCtx, "a8e-sample-queue", {
              numberOfInputs: 0,
              numberOfOutputs: 1,
              outputChannelCount: [1],
            });
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
      machine.ctx.ioData.pokeyAudio = null;
    }

    function isReady() {
      return machine.osRomLoaded && machine.basicRomLoaded;
    }

    function paint() {
      renderer.paint(video);
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

      var mult = turbo ? 4.0 : 1.0;
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
      if (machine.audioState) {
        pokeyAudioSync(machine.ctx, machine.audioState, machine.ctx.cycleCounter);
        pokeyAudioSetTurbo(machine.audioState, next);
      }
      turbo = next;
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
