(function () {
  "use strict";

  let Util = window.A8EUtil;
  let CPU = window.A8E6502;
  let Palette = window.A8EPalette;

  let hwApi =
    window.A8EHw && window.A8EHw.createApi ? window.A8EHw.createApi() : null;
  if (!hwApi) throw new Error("A8EHw is not loaded");

  let PIXELS_PER_LINE = hwApi.PIXELS_PER_LINE;
  let LINES_PER_SCREEN_PAL = hwApi.LINES_PER_SCREEN_PAL;
  let CYCLES_PER_LINE = hwApi.CYCLES_PER_LINE;
  let ATARI_CPU_HZ_PAL = hwApi.ATARI_CPU_HZ_PAL;
  let CYCLE_NEVER = hwApi.CYCLE_NEVER;
  let FIRST_VISIBLE_LINE = hwApi.FIRST_VISIBLE_LINE;
  let LAST_VISIBLE_LINE = hwApi.LAST_VISIBLE_LINE;
  let SERIAL_OUTPUT_DATA_NEEDED_CYCLES = hwApi.SERIAL_OUTPUT_DATA_NEEDED_CYCLES;
  let SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES =
    hwApi.SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
  let SERIAL_INPUT_FIRST_DATA_READY_CYCLES =
    hwApi.SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
  let SERIAL_INPUT_DATA_READY_CYCLES = hwApi.SERIAL_INPUT_DATA_READY_CYCLES;
  let SIO_TURBO_EMU_MULTIPLIER = hwApi.SIO_TURBO_EMU_MULTIPLIER;
  let POKEY_AUDIO_MAX_CATCHUP_CYCLES = hwApi.POKEY_AUDIO_MAX_CATCHUP_CYCLES;
  let NMI_DLI = hwApi.NMI_DLI;
  let NMI_VBI = hwApi.NMI_VBI;
  let NMI_RESET = hwApi.NMI_RESET;
  let IO_PORTA = hwApi.IO_PORTA;
  let IO_PORTB = hwApi.IO_PORTB;
  let IO_PACTL = hwApi.IO_PACTL;
  let IO_PBCTL = hwApi.IO_PBCTL;
  let IO_HPOSP0_M0PF = hwApi.IO_HPOSP0_M0PF;
  let IO_HPOSP1_M1PF = hwApi.IO_HPOSP1_M1PF;
  let IO_HPOSP2_M2PF = hwApi.IO_HPOSP2_M2PF;
  let IO_HPOSP3_M3PF = hwApi.IO_HPOSP3_M3PF;
  let IO_HPOSM0_P0PF = hwApi.IO_HPOSM0_P0PF;
  let IO_HPOSM1_P1PF = hwApi.IO_HPOSM1_P1PF;
  let IO_HPOSM2_P2PF = hwApi.IO_HPOSM2_P2PF;
  let IO_HPOSM3_P3PF = hwApi.IO_HPOSM3_P3PF;
  let IO_SIZEP0_M0PL = hwApi.IO_SIZEP0_M0PL;
  let IO_SIZEP1_M1PL = hwApi.IO_SIZEP1_M1PL;
  let IO_SIZEP2_M2PL = hwApi.IO_SIZEP2_M2PL;
  let IO_SIZEP3_M3PL = hwApi.IO_SIZEP3_M3PL;
  let IO_SIZEM_P0PL = hwApi.IO_SIZEM_P0PL;
  let IO_GRAFP0_P1PL = hwApi.IO_GRAFP0_P1PL;
  let IO_GRAFP1_P2PL = hwApi.IO_GRAFP1_P2PL;
  let IO_GRAFP2_P3PL = hwApi.IO_GRAFP2_P3PL;
  let IO_GRAFP3_TRIG0 = hwApi.IO_GRAFP3_TRIG0;
  let IO_GRAFM_TRIG1 = hwApi.IO_GRAFM_TRIG1;
  let IO_COLPM0_TRIG2 = hwApi.IO_COLPM0_TRIG2;
  let IO_COLPM1_TRIG3 = hwApi.IO_COLPM1_TRIG3;
  let IO_COLPM2_PAL = hwApi.IO_COLPM2_PAL;
  let IO_COLPM3 = hwApi.IO_COLPM3;
  let IO_COLPF0 = hwApi.IO_COLPF0;
  let IO_COLPF1 = hwApi.IO_COLPF1;
  let IO_COLPF2 = hwApi.IO_COLPF2;
  let IO_COLPF3 = hwApi.IO_COLPF3;
  let IO_COLBK = hwApi.IO_COLBK;
  let IO_PRIOR = hwApi.IO_PRIOR;
  let IO_VDELAY = hwApi.IO_VDELAY;
  let IO_GRACTL = hwApi.IO_GRACTL;
  let IO_HITCLR = hwApi.IO_HITCLR;
  let IO_CONSOL = hwApi.IO_CONSOL;
  let IO_AUDF1_POT0 = hwApi.IO_AUDF1_POT0;
  let IO_AUDC1_POT1 = hwApi.IO_AUDC1_POT1;
  let IO_AUDF2_POT2 = hwApi.IO_AUDF2_POT2;
  let IO_AUDC2_POT3 = hwApi.IO_AUDC2_POT3;
  let IO_AUDF3_POT4 = hwApi.IO_AUDF3_POT4;
  let IO_AUDC3_POT5 = hwApi.IO_AUDC3_POT5;
  let IO_AUDF4_POT6 = hwApi.IO_AUDF4_POT6;
  let IO_AUDC4_POT7 = hwApi.IO_AUDC4_POT7;
  let IO_AUDCTL_ALLPOT = hwApi.IO_AUDCTL_ALLPOT;
  let IO_STIMER_KBCODE = hwApi.IO_STIMER_KBCODE;
  let IO_SKREST_RANDOM = hwApi.IO_SKREST_RANDOM;
  let IO_POTGO = hwApi.IO_POTGO;
  let IO_SEROUT_SERIN = hwApi.IO_SEROUT_SERIN;
  let IO_IRQEN_IRQST = hwApi.IO_IRQEN_IRQST;
  let IO_SKCTL_SKSTAT = hwApi.IO_SKCTL_SKSTAT;
  let IRQ_TIMER_1 = hwApi.IRQ_TIMER_1;
  let IRQ_TIMER_2 = hwApi.IRQ_TIMER_2;
  let IRQ_TIMER_4 = hwApi.IRQ_TIMER_4;
  let IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE =
    hwApi.IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE;
  let IRQ_SERIAL_OUTPUT_DATA_NEEDED = hwApi.IRQ_SERIAL_OUTPUT_DATA_NEEDED;
  let IRQ_SERIAL_INPUT_DATA_READY = hwApi.IRQ_SERIAL_INPUT_DATA_READY;
  let IRQ_OTHER_KEY_PRESSED = hwApi.IRQ_OTHER_KEY_PRESSED;
  let IRQ_BREAK_KEY_PRESSED = hwApi.IRQ_BREAK_KEY_PRESSED;
  let IO_DMACTL = hwApi.IO_DMACTL;
  let IO_CHACTL = hwApi.IO_CHACTL;
  let IO_DLISTL = hwApi.IO_DLISTL;
  let IO_DLISTH = hwApi.IO_DLISTH;
  let IO_HSCROL = hwApi.IO_HSCROL;
  let IO_VSCROL = hwApi.IO_VSCROL;
  let IO_PMBASE = hwApi.IO_PMBASE;
  let IO_CHBASE = hwApi.IO_CHBASE;
  let IO_WSYNC = hwApi.IO_WSYNC;
  let IO_VCOUNT = hwApi.IO_VCOUNT;
  let IO_PENH = hwApi.IO_PENH;
  let IO_PENV = hwApi.IO_PENV;
  let IO_NMIEN = hwApi.IO_NMIEN;
  let IO_NMIRES_NMIST = hwApi.IO_NMIRES_NMIST;
  let VIEW_W = hwApi.VIEW_W;
  let VIEW_H = hwApi.VIEW_H;
  let VIEW_X = hwApi.VIEW_X;
  let VIEW_Y = hwApi.VIEW_Y;
  let PRIO_BKG = hwApi.PRIO_BKG;
  let PRIO_PF0 = hwApi.PRIO_PF0;
  let PRIO_PF1 = hwApi.PRIO_PF1;
  let PRIO_PF2 = hwApi.PRIO_PF2;
  let PRIO_PF3 = hwApi.PRIO_PF3;
  let PRIO_PM0 = hwApi.PRIO_PM0;
  let PRIO_PM1 = hwApi.PRIO_PM1;
  let PRIO_PM2 = hwApi.PRIO_PM2;
  let PRIO_PM3 = hwApi.PRIO_PM3;
  let PRIORITY_TABLE_BKG_PF012 = hwApi.PRIORITY_TABLE_BKG_PF012;
  let PRIORITY_TABLE_BKG_PF013 = hwApi.PRIORITY_TABLE_BKG_PF013;
  let PRIORITY_TABLE_PF0123 = hwApi.PRIORITY_TABLE_PF0123;
  let SCRATCH_GTIA_COLOR_TABLE = hwApi.SCRATCH_GTIA_COLOR_TABLE;
  let SCRATCH_COLOR_TABLE_A = hwApi.SCRATCH_COLOR_TABLE_A;
  let SCRATCH_COLOR_TABLE_B = hwApi.SCRATCH_COLOR_TABLE_B;
  let SCRATCH_BACKGROUND_TABLE = hwApi.SCRATCH_BACKGROUND_TABLE;
  let ANTIC_MODE_INFO = hwApi.ANTIC_MODE_INFO;
  let IO_INIT_VALUES = hwApi.IO_INIT_VALUES;

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
    return chactl & 0x02 ? ch | 0x100 : ch;
  }

  let softwareApi =
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
  let makeVideo = softwareApi.makeVideo;
  let blitViewportToImageData = softwareApi.blitViewportToImageData;
  let fillLine = softwareApi.fillLine;

  let keysApi =
    window.A8EKeys && window.A8EKeys.createApi
      ? window.A8EKeys.createApi()
      : null;
  if (!keysApi) throw new Error("A8EKeys is not loaded");
  let KEY_CODE_TABLE = keysApi.KEY_CODE_TABLE;
  let browserKeyToSdlSym = keysApi.browserKeyToSdlSym;
  let inputApi =
    window.A8EInput && window.A8EInput.createApi
      ? window.A8EInput.createApi({
          CPU: CPU,
          IO_PORTA: IO_PORTA,
          IO_GRAFP3_TRIG0: IO_GRAFP3_TRIG0,
          IO_GRAFM_TRIG1: IO_GRAFM_TRIG1,
          IO_COLPM0_TRIG2: IO_COLPM0_TRIG2,
          IO_COLPM1_TRIG3: IO_COLPM1_TRIG3,
          IO_GRACTL: IO_GRACTL,
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
  let stateApi =
    window.A8EState && window.A8EState.createApi
      ? window.A8EState.createApi({
          CPU: CPU,
          CYCLES_PER_LINE: CYCLES_PER_LINE,
          CYCLE_NEVER: CYCLE_NEVER,
          IO_INIT_VALUES: IO_INIT_VALUES,
        })
      : null;
  if (!stateApi) throw new Error("A8EState is not loaded");
  let makeIoData = stateApi.makeIoData;
  let cycleTimedEventUpdate = stateApi.cycleTimedEventUpdate;
  let initHardwareDefaults = stateApi.initHardwareDefaults;
  let installIoHandlers = stateApi.installIoHandlers;
  let memoryApi =
    window.A8EMemory && window.A8EMemory.createApi
      ? window.A8EMemory.createApi({
          CPU: CPU,
          IO_PORTB: IO_PORTB,
        })
      : null;
  if (!memoryApi) throw new Error("A8EMemory is not loaded");
  let audioRuntimeApi =
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
  let pokeyAudioApi =
    window.A8EPokeyAudio && window.A8EPokeyAudio.createApi
      ? window.A8EPokeyAudio.createApi({
          ATARI_CPU_HZ_PAL: ATARI_CPU_HZ_PAL,
          CYCLES_PER_LINE: CYCLES_PER_LINE,
          POKEY_AUDIO_MAX_CATCHUP_CYCLES: POKEY_AUDIO_MAX_CATCHUP_CYCLES,
          CYCLE_NEVER: CYCLE_NEVER,
          SERIAL_OUTPUT_DATA_NEEDED_CYCLES: SERIAL_OUTPUT_DATA_NEEDED_CYCLES,
          SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES:
            SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES,
          SERIAL_INPUT_FIRST_DATA_READY_CYCLES:
            SERIAL_INPUT_FIRST_DATA_READY_CYCLES,
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

  let pokeyAudioCreateState = pokeyAudioApi.createState;
  let pokeyAudioSetTargetBufferSamples = pokeyAudioApi.setTargetBufferSamples;
  let pokeyAudioSetFillLevelHint = pokeyAudioApi.setFillLevelHint;
  let pokeyAudioSetTurbo = pokeyAudioApi.setTurbo;
  let pokeyAudioDrain = pokeyAudioApi.drain;
  let pokeyAudioClear = pokeyAudioApi.clear;
  let pokeyAudioResetState = pokeyAudioApi.resetState;
  let pokeyAudioOnRegisterWrite = pokeyAudioApi.onRegisterWrite;
  let pokeyAudioSync = pokeyAudioApi.sync;
  let pokeyAudioConsume = pokeyAudioApi.consume;
  let pokeySyncLfsr17 = pokeyAudioApi.syncLfsr17;
  let pokeyPotStartScan = pokeyAudioApi.potStartScan;
  let pokeyPotUpdate = pokeyAudioApi.potUpdate;
  let pokeyTimerPeriodCpuCycles = pokeyAudioApi.timerPeriodCpuCycles;
  let pokeyRestartTimers = pokeyAudioApi.restartTimers;
  let pokeySeroutWrite = pokeyAudioApi.seroutWrite;
  let pokeySerinRead = pokeyAudioApi.serinRead;

  let ioApi =
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
  let ioAccess = ioApi.ioAccess;
  let gtiaApi =
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
  let drawPlayerMissiles = gtiaApi.drawPlayerMissiles;

  let anticApi =
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
          IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE:
            IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE,
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

  let ioCycleTimedEvent = anticApi.ioCycleTimedEvent;

  // --- UI-facing App ---
  function createApp(opts) {
    let canvas = opts.canvas;
    let ctx2d = opts.ctx2d;
    let gl = opts.gl;
    let debugEl = opts.debugEl;

    let audioEnabled = !!opts.audioEnabled;
    let turbo = !!opts.turbo;
    let sioTurbo = opts.sioTurbo !== false;
    let optionOnStart = !!opts.optionOnStart;

    let video = makeVideo();
    let renderer = null;
    let imageData = null;
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

    let machine = {
      ctx: CPU.makeContext(),
      video: video,
      osRomLoaded: false,
      basicRomLoaded: false,
      media: {
        deviceSlots: new Int16Array([-1, -1, -1, -1, -1, -1, -1, -1]),
        diskImages: [],
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
      cycleAccum: 0,
    };

    let memoryRuntime = memoryApi.createRuntime({
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
    let setupMemoryMap = memoryRuntime.setupMemoryMap;
    let hardReset = memoryRuntime.hardReset;
    let loadOsRom = memoryRuntime.loadOsRom;
    let loadBasicRom = memoryRuntime.loadBasicRom;
    let loadDiskToDeviceSlot = memoryRuntime.loadDiskToDeviceSlot;
    let mountImageToDeviceSlot = memoryRuntime.mountImageToDeviceSlot;
    let unmountDeviceSlot = memoryRuntime.unmountDeviceSlot;
    let getMountedDiskForDeviceSlot = memoryRuntime.getMountedDiskForDeviceSlot;
    let hasMountedDiskForDeviceSlot = memoryRuntime.hasMountedDiskForDeviceSlot;
    let audioRuntime = audioRuntimeApi.createRuntime({
      machine: machine,
      getAudioEnabled: function () {
        return audioEnabled;
      },
      getTurbo: function () {
        return turbo;
      },
      pokeyAudioCreateState: pokeyAudioCreateState,
      pokeyAudioSetTargetBufferSamples: pokeyAudioSetTargetBufferSamples,
      pokeyAudioSetFillLevelHint: pokeyAudioSetFillLevelHint,
      pokeyAudioSetTurbo: pokeyAudioSetTurbo,
      pokeyAudioResetState: pokeyAudioResetState,
      pokeyAudioOnRegisterWrite: pokeyAudioOnRegisterWrite,
      pokeyAudioSync: pokeyAudioSync,
      pokeyAudioConsume: pokeyAudioConsume,
    });
    let ensureAudio = audioRuntime.ensureAudio;
    let stopAudio = audioRuntime.stopAudio;
    let isSioActive = audioRuntime.isSioActive;
    let syncAudioTurboMode = audioRuntime.syncAudioTurboMode;

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

    let inputRuntime = inputApi.createRuntime({
      machine: machine,
      isReady: isReady,
    });
    let onKeyDown = inputRuntime.onKeyDown;
    let onKeyUp = inputRuntime.onKeyUp;
    let releaseAllKeys = inputRuntime.releaseAll;

    function paint() {
      renderer.paint(video);
    }

    function updateDebug() {
      if (!debugEl) return;
      let c = machine.ctx.cpu;
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

    function hardResetWithInputRelease() {
      if (releaseAllKeys) releaseAllKeys();
      hardReset();
    }

    let CYCLES_PER_FRAME = LINES_PER_SCREEN_PAL * CYCLES_PER_LINE; // 35568

    function frame(ts) {
      if (!machine.running) return;

      if (!machine.lastTs) machine.lastTs = ts;
      let dtMs = ts - machine.lastTs;
      machine.lastTs = ts;

      // Clamp big pauses (tab background etc).
      if (dtMs > 100) dtMs = 100;

      let sioFast = !turbo && sioTurbo && isSioActive(machine.ctx.ioData);
      let emuTurbo = turbo || sioFast;
      syncAudioTurboMode(emuTurbo);

      let mult = turbo ? 4.0 : 1.0;
      if (!turbo && sioFast) mult = SIO_TURBO_EMU_MULTIPLIER;

      // Accumulate cycles from real elapsed time, then run in whole-frame
      // steps.  This prevents rAF timing jitter (e.g. from compositor work
      // during mouse movement) from translating into visible speed variation.
      machine.cycleAccum += (dtMs / 1000) * ATARI_CPU_HZ_PAL * mult;

      let frameBudget = CYCLES_PER_FRAME;
      // Cap catch-up work to avoid spiral-of-death after long pauses.
      // Scale the cap with emulation multiplier so turbo can still reach target
      // speed on lower display refresh rates (e.g. 30 Hz).
      let maxCatchupFrames = Math.max(4, Math.ceil(mult * 4));
      if (machine.cycleAccum > frameBudget * maxCatchupFrames)
        machine.cycleAccum = frameBudget * maxCatchupFrames;

      let ranFrames = 0;
      while (machine.cycleAccum >= frameBudget) {
        machine.cycleAccum -= frameBudget;
        CPU.run(machine.ctx, machine.ctx.cycleCounter + frameBudget);
        ranFrames++;
      }

      if (ranFrames > 0 && machine.audioState) {
        pokeyAudioSync(
          machine.ctx,
          machine.audioState,
          machine.ctx.cycleCounter,
        );
        if (
          machine.audioMode === "worklet" &&
          machine.audioNode &&
          machine.audioNode.port
        ) {
          while (true) {
            let chunk = pokeyAudioDrain(machine.audioState, 4096);
            if (!chunk) break;
            try {
              machine.audioNode.port.postMessage(
                { type: "samples", samples: chunk },
                [chunk.buffer],
              );
            } catch (e) {
              break;
            }
          }
        }
      }

      if (ranFrames > 0) {
        paint();
        updateDebug();
      }

      machine.rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (!isReady()) return;
      if (machine.running) return;
      ensureAudio();
      if (machine.audioCtx && machine.audioCtx.state === "suspended") {
        machine.audioCtx.resume().catch(function () {});
      }
      if (!machine.ctx.cpu.pc) hardResetWithInputRelease();
      machine.running = true;
      machine.lastTs = 0;
      machine.cycleAccum = 0;
      machine.rafId = requestAnimationFrame(frame);
    }

    function pause() {
      machine.running = false;
      if (machine.rafId) cancelAnimationFrame(machine.rafId);
      machine.rafId = 0;
      if (machine.audioState) pokeyAudioClear(machine.audioState);
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

    function reset() {
      if (!isReady()) return;
      hardResetWithInputRelease();
      paint();
      updateDebug();
    }

    function setTurbo(v) {
      let next = !!v;
      if (next === turbo) return;
      turbo = next;
      syncAudioTurboMode(
        turbo || (!turbo && sioTurbo && isSioActive(machine.ctx.ioData)),
      );
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
      if (machine.ctx && machine.ctx.ioData)
        machine.ctx.ioData.sioTurbo = sioTurbo;
      syncAudioTurboMode(
        turbo || (!turbo && sioTurbo && isSioActive(machine.ctx.ioData)),
      );
    }

    function setOptionOnStart(v) {
      optionOnStart = !!v;
      if (machine.ctx && machine.ctx.ioData)
        machine.ctx.ioData.optionOnStart = optionOnStart;
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
      loadDiskToDeviceSlot: loadDiskToDeviceSlot,
      mountImageToDeviceSlot: mountImageToDeviceSlot,
      unmountDeviceSlot: unmountDeviceSlot,
      getMountedDiskForDeviceSlot: getMountedDiskForDeviceSlot,
      hasMountedDiskForDeviceSlot: hasMountedDiskForDeviceSlot,
      hasOsRom: hasOsRom,
      hasBasicRom: hasBasicRom,
      isReady: isReady,
      isRunning: function () {
        return machine.running;
      },
      dispose: dispose,
      onKeyDown: onKeyDown,
      onKeyUp: onKeyUp,
      releaseAllKeys: releaseAllKeys,
    };
  }

  window.A8EApp = { create: createApp };
})();
