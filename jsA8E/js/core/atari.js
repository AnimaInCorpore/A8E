(function () {
  "use strict";

  var Util = window.A8EUtil;
  var CPU = window.A8E6502;
  var Palette = window.A8EPalette;

  var hwApi = window.A8EHw && window.A8EHw.createApi ? window.A8EHw.createApi() : null;
  if (!hwApi) throw new Error("A8EHw is not loaded");

  var PIXELS_PER_LINE = hwApi.PIXELS_PER_LINE;
  var LINES_PER_SCREEN_PAL = hwApi.LINES_PER_SCREEN_PAL;
  var CYCLES_PER_LINE = hwApi.CYCLES_PER_LINE;
  var ATARI_CPU_HZ_PAL = hwApi.ATARI_CPU_HZ_PAL;
  var CYCLE_NEVER = hwApi.CYCLE_NEVER;
  var FIRST_VISIBLE_LINE = hwApi.FIRST_VISIBLE_LINE;
  var LAST_VISIBLE_LINE = hwApi.LAST_VISIBLE_LINE;
  var SERIAL_OUTPUT_DATA_NEEDED_CYCLES = hwApi.SERIAL_OUTPUT_DATA_NEEDED_CYCLES;
  var SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES = hwApi.SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
  var SERIAL_INPUT_FIRST_DATA_READY_CYCLES = hwApi.SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
  var SERIAL_INPUT_DATA_READY_CYCLES = hwApi.SERIAL_INPUT_DATA_READY_CYCLES;
  var SIO_TURBO_EMU_MULTIPLIER = hwApi.SIO_TURBO_EMU_MULTIPLIER;
  var POKEY_AUDIO_MAX_CATCHUP_CYCLES = hwApi.POKEY_AUDIO_MAX_CATCHUP_CYCLES;
  var NMI_DLI = hwApi.NMI_DLI;
  var NMI_VBI = hwApi.NMI_VBI;
  var NMI_RESET = hwApi.NMI_RESET;
  var IO_PORTA = hwApi.IO_PORTA;
  var IO_PORTB = hwApi.IO_PORTB;
  var IO_PACTL = hwApi.IO_PACTL;
  var IO_PBCTL = hwApi.IO_PBCTL;
  var IO_HPOSP0_M0PF = hwApi.IO_HPOSP0_M0PF;
  var IO_HPOSP1_M1PF = hwApi.IO_HPOSP1_M1PF;
  var IO_HPOSP2_M2PF = hwApi.IO_HPOSP2_M2PF;
  var IO_HPOSP3_M3PF = hwApi.IO_HPOSP3_M3PF;
  var IO_HPOSM0_P0PF = hwApi.IO_HPOSM0_P0PF;
  var IO_HPOSM1_P1PF = hwApi.IO_HPOSM1_P1PF;
  var IO_HPOSM2_P2PF = hwApi.IO_HPOSM2_P2PF;
  var IO_HPOSM3_P3PF = hwApi.IO_HPOSM3_P3PF;
  var IO_SIZEP0_M0PL = hwApi.IO_SIZEP0_M0PL;
  var IO_SIZEP1_M1PL = hwApi.IO_SIZEP1_M1PL;
  var IO_SIZEP2_M2PL = hwApi.IO_SIZEP2_M2PL;
  var IO_SIZEP3_M3PL = hwApi.IO_SIZEP3_M3PL;
  var IO_SIZEM_P0PL = hwApi.IO_SIZEM_P0PL;
  var IO_GRAFP0_P1PL = hwApi.IO_GRAFP0_P1PL;
  var IO_GRAFP1_P2PL = hwApi.IO_GRAFP1_P2PL;
  var IO_GRAFP2_P3PL = hwApi.IO_GRAFP2_P3PL;
  var IO_GRAFP3_TRIG0 = hwApi.IO_GRAFP3_TRIG0;
  var IO_GRAFM_TRIG1 = hwApi.IO_GRAFM_TRIG1;
  var IO_COLPM0_TRIG2 = hwApi.IO_COLPM0_TRIG2;
  var IO_COLPM1_TRIG3 = hwApi.IO_COLPM1_TRIG3;
  var IO_COLPM2_PAL = hwApi.IO_COLPM2_PAL;
  var IO_COLPM3 = hwApi.IO_COLPM3;
  var IO_COLPF0 = hwApi.IO_COLPF0;
  var IO_COLPF1 = hwApi.IO_COLPF1;
  var IO_COLPF2 = hwApi.IO_COLPF2;
  var IO_COLPF3 = hwApi.IO_COLPF3;
  var IO_COLBK = hwApi.IO_COLBK;
  var IO_PRIOR = hwApi.IO_PRIOR;
  var IO_VDELAY = hwApi.IO_VDELAY;
  var IO_GRACTL = hwApi.IO_GRACTL;
  var IO_HITCLR = hwApi.IO_HITCLR;
  var IO_CONSOL = hwApi.IO_CONSOL;
  var IO_AUDF1_POT0 = hwApi.IO_AUDF1_POT0;
  var IO_AUDC1_POT1 = hwApi.IO_AUDC1_POT1;
  var IO_AUDF2_POT2 = hwApi.IO_AUDF2_POT2;
  var IO_AUDC2_POT3 = hwApi.IO_AUDC2_POT3;
  var IO_AUDF3_POT4 = hwApi.IO_AUDF3_POT4;
  var IO_AUDC3_POT5 = hwApi.IO_AUDC3_POT5;
  var IO_AUDF4_POT6 = hwApi.IO_AUDF4_POT6;
  var IO_AUDC4_POT7 = hwApi.IO_AUDC4_POT7;
  var IO_AUDCTL_ALLPOT = hwApi.IO_AUDCTL_ALLPOT;
  var IO_STIMER_KBCODE = hwApi.IO_STIMER_KBCODE;
  var IO_SKREST_RANDOM = hwApi.IO_SKREST_RANDOM;
  var IO_POTGO = hwApi.IO_POTGO;
  var IO_SEROUT_SERIN = hwApi.IO_SEROUT_SERIN;
  var IO_IRQEN_IRQST = hwApi.IO_IRQEN_IRQST;
  var IO_SKCTL_SKSTAT = hwApi.IO_SKCTL_SKSTAT;
  var IRQ_TIMER_1 = hwApi.IRQ_TIMER_1;
  var IRQ_TIMER_2 = hwApi.IRQ_TIMER_2;
  var IRQ_TIMER_4 = hwApi.IRQ_TIMER_4;
  var IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE = hwApi.IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE;
  var IRQ_SERIAL_OUTPUT_DATA_NEEDED = hwApi.IRQ_SERIAL_OUTPUT_DATA_NEEDED;
  var IRQ_SERIAL_INPUT_DATA_READY = hwApi.IRQ_SERIAL_INPUT_DATA_READY;
  var IRQ_OTHER_KEY_PRESSED = hwApi.IRQ_OTHER_KEY_PRESSED;
  var IRQ_BREAK_KEY_PRESSED = hwApi.IRQ_BREAK_KEY_PRESSED;
  var IO_DMACTL = hwApi.IO_DMACTL;
  var IO_CHACTL = hwApi.IO_CHACTL;
  var IO_DLISTL = hwApi.IO_DLISTL;
  var IO_DLISTH = hwApi.IO_DLISTH;
  var IO_HSCROL = hwApi.IO_HSCROL;
  var IO_VSCROL = hwApi.IO_VSCROL;
  var IO_PMBASE = hwApi.IO_PMBASE;
  var IO_CHBASE = hwApi.IO_CHBASE;
  var IO_WSYNC = hwApi.IO_WSYNC;
  var IO_VCOUNT = hwApi.IO_VCOUNT;
  var IO_PENH = hwApi.IO_PENH;
  var IO_PENV = hwApi.IO_PENV;
  var IO_NMIEN = hwApi.IO_NMIEN;
  var IO_NMIRES_NMIST = hwApi.IO_NMIRES_NMIST;
  var VIEW_W = hwApi.VIEW_W;
  var VIEW_H = hwApi.VIEW_H;
  var VIEW_X = hwApi.VIEW_X;
  var VIEW_Y = hwApi.VIEW_Y;
  var PRIO_BKG = hwApi.PRIO_BKG;
  var PRIO_PF0 = hwApi.PRIO_PF0;
  var PRIO_PF1 = hwApi.PRIO_PF1;
  var PRIO_PF2 = hwApi.PRIO_PF2;
  var PRIO_PF3 = hwApi.PRIO_PF3;
  var PRIO_PM0 = hwApi.PRIO_PM0;
  var PRIO_PM1 = hwApi.PRIO_PM1;
  var PRIO_PM2 = hwApi.PRIO_PM2;
  var PRIO_PM3 = hwApi.PRIO_PM3;
  var PRIORITY_TABLE_BKG_PF012 = hwApi.PRIORITY_TABLE_BKG_PF012;
  var PRIORITY_TABLE_BKG_PF013 = hwApi.PRIORITY_TABLE_BKG_PF013;
  var PRIORITY_TABLE_PF0123 = hwApi.PRIORITY_TABLE_PF0123;
  var SCRATCH_GTIA_COLOR_TABLE = hwApi.SCRATCH_GTIA_COLOR_TABLE;
  var SCRATCH_COLOR_TABLE_A = hwApi.SCRATCH_COLOR_TABLE_A;
  var SCRATCH_COLOR_TABLE_B = hwApi.SCRATCH_COLOR_TABLE_B;
  var SCRATCH_BACKGROUND_TABLE = hwApi.SCRATCH_BACKGROUND_TABLE;
  var ANTIC_MODE_INFO = hwApi.ANTIC_MODE_INFO;
  var IO_INIT_VALUES = hwApi.IO_INIT_VALUES;

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

  var softwareApi =
    window.A8ESoftware && window.A8ESoftware.createApi
      ? window.A8ESoftware.createApi({
          Palette: Palette,
          PIXELS_PER_LINE: PIXELS_PER_LINE,
          LINES_PER_SCREEN_PAL: LINES_PER_SCREEN_PAL,
          VIEW_W: VIEW_W,
          VIEW_H: VIEW_H,
          VIEW_X: VIEW_X,
          VIEW_Y: VIEW_Y,
        })
      : null;
  if (!softwareApi) throw new Error("A8ESoftware is not loaded");
  var makeVideo = softwareApi.makeVideo;
  var blitViewportToImageData = softwareApi.blitViewportToImageData;
  var fillLine = softwareApi.fillLine;

  var keysApi =
    window.A8EKeys && window.A8EKeys.createApi
      ? window.A8EKeys.createApi()
      : null;
  if (!keysApi) throw new Error("A8EKeys is not loaded");
  var KEY_CODE_TABLE = keysApi.KEY_CODE_TABLE;
  var browserKeyToSdlSym = keysApi.browserKeyToSdlSym;
  var inputApi =
    window.A8EInput && window.A8EInput.createApi
      ? window.A8EInput.createApi({
          CPU: CPU,
          IO_PORTA: IO_PORTA,
          IO_GRAFP3_TRIG0: IO_GRAFP3_TRIG0,
          IO_GRAFM_TRIG1: IO_GRAFM_TRIG1,
          IO_COLPM0_TRIG2: IO_COLPM0_TRIG2,
          IO_COLPM1_TRIG3: IO_COLPM1_TRIG3,
          IO_CONSOL: IO_CONSOL,
          IO_IRQEN_IRQST: IO_IRQEN_IRQST,
          IO_SKCTL_SKSTAT: IO_SKCTL_SKSTAT,
          IO_STIMER_KBCODE: IO_STIMER_KBCODE,
          IRQ_OTHER_KEY_PRESSED: IRQ_OTHER_KEY_PRESSED,
          IRQ_BREAK_KEY_PRESSED: IRQ_BREAK_KEY_PRESSED,
          KEY_CODE_TABLE: KEY_CODE_TABLE,
          browserKeyToSdlSym: browserKeyToSdlSym,
        })
      : null;
  if (!inputApi) throw new Error("A8EInput is not loaded");
  var stateApi =
    window.A8EState && window.A8EState.createApi
      ? window.A8EState.createApi({
          CPU: CPU,
          CYCLES_PER_LINE: CYCLES_PER_LINE,
          CYCLE_NEVER: CYCLE_NEVER,
          IO_INIT_VALUES: IO_INIT_VALUES,
        })
      : null;
  if (!stateApi) throw new Error("A8EState is not loaded");
  var makeIoData = stateApi.makeIoData;
  var cycleTimedEventUpdate = stateApi.cycleTimedEventUpdate;
  var initHardwareDefaults = stateApi.initHardwareDefaults;
  var installIoHandlers = stateApi.installIoHandlers;
  var memoryApi =
    window.A8EMemory && window.A8EMemory.createApi
      ? window.A8EMemory.createApi({
          CPU: CPU,
          IO_PORTB: IO_PORTB,
        })
      : null;
  if (!memoryApi) throw new Error("A8EMemory is not loaded");
  var audioRuntimeApi =
    window.A8EAudioRuntime && window.A8EAudioRuntime.createApi
      ? window.A8EAudioRuntime.createApi({
          CYCLE_NEVER: CYCLE_NEVER,
          IO_AUDF1_POT0: IO_AUDF1_POT0,
          IO_AUDC1_POT1: IO_AUDC1_POT1,
          IO_AUDF2_POT2: IO_AUDF2_POT2,
          IO_AUDC2_POT3: IO_AUDC2_POT3,
          IO_AUDF3_POT4: IO_AUDF3_POT4,
          IO_AUDC3_POT5: IO_AUDC3_POT5,
          IO_AUDF4_POT6: IO_AUDF4_POT6,
          IO_AUDC4_POT7: IO_AUDC4_POT7,
          IO_SKCTL_SKSTAT: IO_SKCTL_SKSTAT,
          IO_AUDCTL_ALLPOT: IO_AUDCTL_ALLPOT,
        })
      : null;
  if (!audioRuntimeApi) throw new Error("A8EAudioRuntime is not loaded");

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

    var memoryRuntime = memoryApi.createRuntime({
      machine: machine,
      video: video,
      ioCycleTimedEvent: ioCycleTimedEvent,
      makeIoData: makeIoData,
      cycleTimedEventUpdate: cycleTimedEventUpdate,
      initHardwareDefaults: initHardwareDefaults,
      installIoHandlers: installIoHandlers,
      ioAccess: ioAccess,
      getOptionOnStart: function () {
        return optionOnStart;
      },
      getSioTurbo: function () {
        return sioTurbo;
      },
      getTurbo: function () {
        return turbo;
      },
      pokeyAudioResetState: pokeyAudioResetState,
      pokeyAudioSetTurbo: pokeyAudioSetTurbo,
    });
    var setupMemoryMap = memoryRuntime.setupMemoryMap;
    var hardReset = memoryRuntime.hardReset;
    var loadOsRom = memoryRuntime.loadOsRom;
    var loadBasicRom = memoryRuntime.loadBasicRom;
    var loadDisk1 = memoryRuntime.loadDisk1;
    var audioRuntime = audioRuntimeApi.createRuntime({
      machine: machine,
      getAudioEnabled: function () {
        return audioEnabled;
      },
      getTurbo: function () {
        return turbo;
      },
      pokeyAudioCreateState: pokeyAudioCreateState,
      pokeyAudioSetTargetBufferSamples: pokeyAudioSetTargetBufferSamples,
      pokeyAudioSetTurbo: pokeyAudioSetTurbo,
      pokeyAudioResetState: pokeyAudioResetState,
      pokeyAudioOnRegisterWrite: pokeyAudioOnRegisterWrite,
      pokeyAudioSync: pokeyAudioSync,
      pokeyAudioConsume: pokeyAudioConsume,
    });
    var ensureAudio = audioRuntime.ensureAudio;
    var stopAudio = audioRuntime.stopAudio;
    var isSioActive = audioRuntime.isSioActive;
    var syncAudioTurboMode = audioRuntime.syncAudioTurboMode;

    machine.ctx.ioData = makeIoData(video);
    machine.ctx.ioData.optionOnStart = optionOnStart;
    machine.ctx.ioData.sioTurbo = sioTurbo;
    machine.ctx.ioCycleTimedEventFunction = ioCycleTimedEvent;
    cycleTimedEventUpdate(machine.ctx);

    initHardwareDefaults(machine.ctx);
    installIoHandlers(machine.ctx, ioAccess);

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

    function hasOsRom() {
      return machine.osRomLoaded;
    }
    function hasBasicRom() {
      return machine.basicRomLoaded;
    }
    function hasDisk1() {
      return !!machine.ctx.ioData.disk1;
    }
    var inputRuntime = inputApi.createRuntime({
      machine: machine,
      isReady: isReady,
    });
    var onKeyDown = inputRuntime.onKeyDown;
    var onKeyUp = inputRuntime.onKeyUp;

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
