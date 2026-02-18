(function () {
  "use strict";

  const Util = window.A8EUtil;
  const CPU = window.A8E6502;
  const Palette = window.A8EPalette;

  const hwApi =
    window.A8EHw && window.A8EHw.createApi ? window.A8EHw.createApi() : null;
  if (!hwApi) throw new Error("A8EHw is not loaded");

  const PIXELS_PER_LINE = hwApi.PIXELS_PER_LINE;
  const LINES_PER_SCREEN_PAL = hwApi.LINES_PER_SCREEN_PAL;
  const CYCLES_PER_LINE = hwApi.CYCLES_PER_LINE;
  const ATARI_CPU_HZ_PAL = hwApi.ATARI_CPU_HZ_PAL;
  const CYCLE_NEVER = hwApi.CYCLE_NEVER;
  const FIRST_VISIBLE_LINE = hwApi.FIRST_VISIBLE_LINE;
  const LAST_VISIBLE_LINE = hwApi.LAST_VISIBLE_LINE;
  const SERIAL_OUTPUT_DATA_NEEDED_CYCLES = hwApi.SERIAL_OUTPUT_DATA_NEEDED_CYCLES;
  const SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES =
    hwApi.SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
  const SERIAL_INPUT_FIRST_DATA_READY_CYCLES =
    hwApi.SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
  const SERIAL_INPUT_DATA_READY_CYCLES = hwApi.SERIAL_INPUT_DATA_READY_CYCLES;
  const SIO_TURBO_EMU_MULTIPLIER = hwApi.SIO_TURBO_EMU_MULTIPLIER;
  const POKEY_AUDIO_MAX_CATCHUP_CYCLES = hwApi.POKEY_AUDIO_MAX_CATCHUP_CYCLES;
  const NMI_DLI = hwApi.NMI_DLI;
  const NMI_VBI = hwApi.NMI_VBI;
  const NMI_RESET = hwApi.NMI_RESET;
  const IO_PORTA = hwApi.IO_PORTA;
  const IO_PORTB = hwApi.IO_PORTB;
  const IO_PACTL = hwApi.IO_PACTL;
  const IO_PBCTL = hwApi.IO_PBCTL;
  const IO_HPOSP0_M0PF = hwApi.IO_HPOSP0_M0PF;
  const IO_HPOSP1_M1PF = hwApi.IO_HPOSP1_M1PF;
  const IO_HPOSP2_M2PF = hwApi.IO_HPOSP2_M2PF;
  const IO_HPOSP3_M3PF = hwApi.IO_HPOSP3_M3PF;
  const IO_HPOSM0_P0PF = hwApi.IO_HPOSM0_P0PF;
  const IO_HPOSM1_P1PF = hwApi.IO_HPOSM1_P1PF;
  const IO_HPOSM2_P2PF = hwApi.IO_HPOSM2_P2PF;
  const IO_HPOSM3_P3PF = hwApi.IO_HPOSM3_P3PF;
  const IO_SIZEP0_M0PL = hwApi.IO_SIZEP0_M0PL;
  const IO_SIZEP1_M1PL = hwApi.IO_SIZEP1_M1PL;
  const IO_SIZEP2_M2PL = hwApi.IO_SIZEP2_M2PL;
  const IO_SIZEP3_M3PL = hwApi.IO_SIZEP3_M3PL;
  const IO_SIZEM_P0PL = hwApi.IO_SIZEM_P0PL;
  const IO_GRAFP0_P1PL = hwApi.IO_GRAFP0_P1PL;
  const IO_GRAFP1_P2PL = hwApi.IO_GRAFP1_P2PL;
  const IO_GRAFP2_P3PL = hwApi.IO_GRAFP2_P3PL;
  const IO_GRAFP3_TRIG0 = hwApi.IO_GRAFP3_TRIG0;
  const IO_GRAFM_TRIG1 = hwApi.IO_GRAFM_TRIG1;
  const IO_COLPM0_TRIG2 = hwApi.IO_COLPM0_TRIG2;
  const IO_COLPM1_TRIG3 = hwApi.IO_COLPM1_TRIG3;
  const IO_COLPM2_PAL = hwApi.IO_COLPM2_PAL;
  const IO_COLPM3 = hwApi.IO_COLPM3;
  const IO_COLPF0 = hwApi.IO_COLPF0;
  const IO_COLPF1 = hwApi.IO_COLPF1;
  const IO_COLPF2 = hwApi.IO_COLPF2;
  const IO_COLPF3 = hwApi.IO_COLPF3;
  const IO_COLBK = hwApi.IO_COLBK;
  const IO_PRIOR = hwApi.IO_PRIOR;
  const IO_VDELAY = hwApi.IO_VDELAY;
  const IO_GRACTL = hwApi.IO_GRACTL;
  const IO_HITCLR = hwApi.IO_HITCLR;
  const IO_CONSOL = hwApi.IO_CONSOL;
  const IO_AUDF1_POT0 = hwApi.IO_AUDF1_POT0;
  const IO_AUDC1_POT1 = hwApi.IO_AUDC1_POT1;
  const IO_AUDF2_POT2 = hwApi.IO_AUDF2_POT2;
  const IO_AUDC2_POT3 = hwApi.IO_AUDC2_POT3;
  const IO_AUDF3_POT4 = hwApi.IO_AUDF3_POT4;
  const IO_AUDC3_POT5 = hwApi.IO_AUDC3_POT5;
  const IO_AUDF4_POT6 = hwApi.IO_AUDF4_POT6;
  const IO_AUDC4_POT7 = hwApi.IO_AUDC4_POT7;
  const IO_AUDCTL_ALLPOT = hwApi.IO_AUDCTL_ALLPOT;
  const IO_STIMER_KBCODE = hwApi.IO_STIMER_KBCODE;
  const IO_SKREST_RANDOM = hwApi.IO_SKREST_RANDOM;
  const IO_POTGO = hwApi.IO_POTGO;
  const IO_SEROUT_SERIN = hwApi.IO_SEROUT_SERIN;
  const IO_IRQEN_IRQST = hwApi.IO_IRQEN_IRQST;
  const IO_SKCTL_SKSTAT = hwApi.IO_SKCTL_SKSTAT;
  const IRQ_TIMER_1 = hwApi.IRQ_TIMER_1;
  const IRQ_TIMER_2 = hwApi.IRQ_TIMER_2;
  const IRQ_TIMER_4 = hwApi.IRQ_TIMER_4;
  const IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE =
    hwApi.IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE;
  const IRQ_SERIAL_OUTPUT_DATA_NEEDED = hwApi.IRQ_SERIAL_OUTPUT_DATA_NEEDED;
  const IRQ_SERIAL_INPUT_DATA_READY = hwApi.IRQ_SERIAL_INPUT_DATA_READY;
  const IRQ_OTHER_KEY_PRESSED = hwApi.IRQ_OTHER_KEY_PRESSED;
  const IRQ_BREAK_KEY_PRESSED = hwApi.IRQ_BREAK_KEY_PRESSED;
  const IO_DMACTL = hwApi.IO_DMACTL;
  const IO_CHACTL = hwApi.IO_CHACTL;
  const IO_DLISTL = hwApi.IO_DLISTL;
  const IO_DLISTH = hwApi.IO_DLISTH;
  const IO_HSCROL = hwApi.IO_HSCROL;
  const IO_VSCROL = hwApi.IO_VSCROL;
  const IO_PMBASE = hwApi.IO_PMBASE;
  const IO_CHBASE = hwApi.IO_CHBASE;
  const IO_WSYNC = hwApi.IO_WSYNC;
  const IO_VCOUNT = hwApi.IO_VCOUNT;
  const IO_PENH = hwApi.IO_PENH;
  const IO_PENV = hwApi.IO_PENV;
  const IO_NMIEN = hwApi.IO_NMIEN;
  const IO_NMIRES_NMIST = hwApi.IO_NMIRES_NMIST;
  const VIEW_W = hwApi.VIEW_W;
  const VIEW_H = hwApi.VIEW_H;
  const VIEW_X = hwApi.VIEW_X;
  const VIEW_Y = hwApi.VIEW_Y;
  const PRIO_BKG = hwApi.PRIO_BKG;
  const PRIO_PF0 = hwApi.PRIO_PF0;
  const PRIO_PF1 = hwApi.PRIO_PF1;
  const PRIO_PF2 = hwApi.PRIO_PF2;
  const PRIO_PF3 = hwApi.PRIO_PF3;
  const PRIO_PM0 = hwApi.PRIO_PM0;
  const PRIO_PM1 = hwApi.PRIO_PM1;
  const PRIO_PM2 = hwApi.PRIO_PM2;
  const PRIO_PM3 = hwApi.PRIO_PM3;
  const PRIORITY_TABLE_BKG_PF012 = hwApi.PRIORITY_TABLE_BKG_PF012;
  const PRIORITY_TABLE_BKG_PF013 = hwApi.PRIORITY_TABLE_BKG_PF013;
  const PRIORITY_TABLE_PF0123 = hwApi.PRIORITY_TABLE_PF0123;
  const SCRATCH_GTIA_COLOR_TABLE = hwApi.SCRATCH_GTIA_COLOR_TABLE;
  const SCRATCH_COLOR_TABLE_A = hwApi.SCRATCH_COLOR_TABLE_A;
  const SCRATCH_COLOR_TABLE_B = hwApi.SCRATCH_COLOR_TABLE_B;
  const SCRATCH_BACKGROUND_TABLE = hwApi.SCRATCH_BACKGROUND_TABLE;
  const ANTIC_MODE_INFO = hwApi.ANTIC_MODE_INFO;
  const IO_INIT_VALUES = hwApi.IO_INIT_VALUES;

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

  const softwareApi =
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
  const makeVideo = softwareApi.makeVideo;
  const blitViewportToImageData = softwareApi.blitViewportToImageData;
  const fillLine = softwareApi.fillLine;

  const keysApi =
    window.A8EKeys && window.A8EKeys.createApi
      ? window.A8EKeys.createApi()
      : null;
  if (!keysApi) throw new Error("A8EKeys is not loaded");
  const KEY_CODE_TABLE = keysApi.KEY_CODE_TABLE;
  const browserKeyToSdlSym = keysApi.browserKeyToSdlSym;
  const inputApi =
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
  const stateApi =
    window.A8EState && window.A8EState.createApi
      ? window.A8EState.createApi({
          CPU: CPU,
          CYCLES_PER_LINE: CYCLES_PER_LINE,
          CYCLE_NEVER: CYCLE_NEVER,
          IO_INIT_VALUES: IO_INIT_VALUES,
        })
      : null;
  if (!stateApi) throw new Error("A8EState is not loaded");
  const makeIoData = stateApi.makeIoData;
  const cycleTimedEventUpdate = stateApi.cycleTimedEventUpdate;
  const initHardwareDefaults = stateApi.initHardwareDefaults;
  const installIoHandlers = stateApi.installIoHandlers;
  const memoryApi =
    window.A8EMemory && window.A8EMemory.createApi
      ? window.A8EMemory.createApi({
          CPU: CPU,
          IO_PORTB: IO_PORTB,
        })
      : null;
  if (!memoryApi) throw new Error("A8EMemory is not loaded");
  const audioRuntimeApi =
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
  const pokeyAudioApi =
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

  const pokeyAudioCreateState = pokeyAudioApi.createState;
  const pokeyAudioSetTargetBufferSamples = pokeyAudioApi.setTargetBufferSamples;
  const pokeyAudioSetFillLevelHint = pokeyAudioApi.setFillLevelHint;
  const pokeyAudioSetTurbo = pokeyAudioApi.setTurbo;
  const pokeyAudioDrain = pokeyAudioApi.drain;
  const pokeyAudioClear = pokeyAudioApi.clear;
  const pokeyAudioResetState = pokeyAudioApi.resetState;
  const pokeyAudioOnRegisterWrite = pokeyAudioApi.onRegisterWrite;
  const pokeyAudioSync = pokeyAudioApi.sync;
  const pokeyAudioConsume = pokeyAudioApi.consume;
  const pokeySyncLfsr17 = pokeyAudioApi.syncLfsr17;
  const pokeyPotStartScan = pokeyAudioApi.potStartScan;
  const pokeyPotUpdate = pokeyAudioApi.potUpdate;
  const pokeyTimerPeriodCpuCycles = pokeyAudioApi.timerPeriodCpuCycles;
  const pokeyRestartTimers = pokeyAudioApi.restartTimers;
  const pokeySeroutWrite = pokeyAudioApi.seroutWrite;
  const pokeySerinRead = pokeyAudioApi.serinRead;

  const ioApi =
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
  const ioAccess = ioApi.ioAccess;
  const gtiaApi =
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
  const drawPlayerMissiles = gtiaApi.drawPlayerMissiles;

  const anticApi =
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

  const ioCycleTimedEvent = anticApi.ioCycleTimedEvent;

  // --- H: Device (host filesystem) ---
  const hostFsApi =
    window.A8EHostFs && window.A8EHostFs.createApi
      ? window.A8EHostFs.createApi()
      : null;
  const hDeviceApi =
    window.A8EHDevice && window.A8EHDevice.createApi
      ? window.A8EHDevice.createApi({ hostFsApi: hostFsApi })
      : null;

  // --- UI-facing App ---
  function createApp(opts) {
    const canvas = opts.canvas;
    const ctx2d = opts.ctx2d;
    const gl = opts.gl;
    const debugEl = opts.debugEl;

    let audioEnabled = !!opts.audioEnabled;
    let turbo = !!opts.turbo;
    let sioTurbo = opts.sioTurbo !== false;
    let optionOnStart = !!opts.optionOnStart;

    const video = makeVideo();
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

    const machine = {
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
      frameCycleAccum: 0,
    };

    const memoryRuntime = memoryApi.createRuntime({
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
    const memoryHardReset = memoryRuntime.hardReset;
    const memoryLoadOsRom = memoryRuntime.loadOsRom;
    const loadBasicRom = memoryRuntime.loadBasicRom;
    const loadDiskToDeviceSlot = memoryRuntime.loadDiskToDeviceSlot;
    const mountImageToDeviceSlot = memoryRuntime.mountImageToDeviceSlot;
    const unmountDeviceSlot = memoryRuntime.unmountDeviceSlot;
    const getMountedDiskForDeviceSlot = memoryRuntime.getMountedDiskForDeviceSlot;
    const hasMountedDiskForDeviceSlot = memoryRuntime.hasMountedDiskForDeviceSlot;

    // H: device -- create instance and install CIO hook(s)
    let hDevice = null;
    let hDeviceHookAddresses = [];

    function installHDeviceCioHooks() {
      if (!hDevice) return;

      for (let i = 0; i < hDeviceHookAddresses.length; i++) {
        CPU.clearPcHook(machine.ctx, hDeviceHookAddresses[i]);
      }
      hDeviceHookAddresses = [];

      const addresses = [0xe456];
      // CIOV is typically a JMP stub at $E456. Hook the resolved target as well
      // so ROM variants and direct-target calls are covered.
      const op = machine.ctx.ram[0xe456] & 0xff;
      if (op === 0x4c) {
        const jmpTarget =
          (machine.ctx.ram[0xe457] & 0xff) |
          ((machine.ctx.ram[0xe458] & 0xff) << 8);
        if (jmpTarget !== 0xe456) addresses.push(jmpTarget);
      }

      for (let i = 0; i < addresses.length; i++) {
        const addr = addresses[i] & 0xffff;
        if (hDeviceHookAddresses.indexOf(addr) >= 0) continue;
        CPU.setPcHook(machine.ctx, addr, hDevice.onCioCall);
        hDeviceHookAddresses.push(addr);
      }

      if (hDevice.onPutByteCall && hDevice.putByteHookAddr !== undefined) {
        const putAddrs = [hDevice.putByteHookAddr & 0xffff];
        if (hDevice.putByteHookAltAddr !== undefined)
          {putAddrs.push(hDevice.putByteHookAltAddr & 0xffff);}
        for (let i = 0; i < putAddrs.length; i++) {
          const putAddr = putAddrs[i];
          if (hDeviceHookAddresses.indexOf(putAddr) >= 0) continue;
          CPU.setPcHook(machine.ctx, putAddr, hDevice.onPutByteCall);
          hDeviceHookAddresses.push(putAddr);
        }
      }
    }

    if (hostFsApi && hDeviceApi) {
      const hostFs = hostFsApi.create();
      hDevice = hDeviceApi.create(hostFs);
      // Init IndexedDB (async, but the in-memory cache is usable immediately
      // after init resolves; the hook is installed synchronously so that H:
      // is available as soon as the DB loads).
      hostFs.init().catch(function (err) {
        console.error("H: device: IndexedDB init failed:", err);
      });
      installHDeviceCioHooks();
    }

    function hardReset() {
      memoryHardReset();
      if (hDevice) {
        hDevice.resetChannels();
        installHDeviceCioHooks();
      }
    }

    function loadOsRom(arrayBuffer) {
      memoryLoadOsRom(arrayBuffer);
      installHDeviceCioHooks();
    }

    const audioRuntime = audioRuntimeApi.createRuntime({
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
    const ensureAudio = audioRuntime.ensureAudio;
    const stopAudio = audioRuntime.stopAudio;
    const isSioActive = audioRuntime.isSioActive;
    const syncAudioTurboMode = audioRuntime.syncAudioTurboMode;

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

    const inputRuntime = inputApi.createRuntime({
      machine: machine,
      isReady: isReady,
    });
    const onKeyDown = inputRuntime.onKeyDown;
    const onKeyUp = inputRuntime.onKeyUp;
    const releaseAllKeys = inputRuntime.releaseAll;

    function paint() {
      renderer.paint(video);
    }

    function updateDebug() {
      if (!debugEl) return;
      const c = machine.ctx.cpu;
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
      machine.cycleAccum = 0;
      machine.frameCycleAccum = 0;
      hardReset();
    }

    const CYCLES_PER_FRAME = LINES_PER_SCREEN_PAL * CYCLES_PER_LINE; // 35568

    function frame(ts) {
      if (!machine.running) return;

      if (!machine.lastTs) machine.lastTs = ts;
      let dtMs = ts - machine.lastTs;
      machine.lastTs = ts;

      // Clamp big pauses (tab background etc).
      if (dtMs > 100) dtMs = 100;

      const sioFast = !turbo && sioTurbo && isSioActive(machine.ctx.ioData);
      const emuTurbo = turbo || sioFast;
      syncAudioTurboMode(emuTurbo);

      let mult = turbo ? 4.0 : 1.0;
      if (!turbo && sioFast) mult = SIO_TURBO_EMU_MULTIPLIER;

      // Accumulate cycles from real elapsed time. Run CPU every tick to avoid
      // audio dead ticks, but only present video when a full PAL frame worth
      // of cycles has elapsed.
      machine.cycleAccum += (dtMs / 1000) * ATARI_CPU_HZ_PAL * mult;

      const frameBudget = CYCLES_PER_FRAME;
      // Cap catch-up work to avoid spiral-of-death after long pauses.
      // Scale the cap with emulation multiplier so turbo can still reach target
      // speed on lower display refresh rates (e.g. 30 Hz).
      const maxCatchupFrames = Math.max(4, Math.ceil(mult * 4));
      if (machine.cycleAccum > frameBudget * maxCatchupFrames)
        {machine.cycleAccum = frameBudget * maxCatchupFrames;}

      let cyclesToRun = Math.floor(machine.cycleAccum);
      if (cyclesToRun < 0) cyclesToRun = 0;
      machine.cycleAccum -= cyclesToRun;

      while (cyclesToRun > 0) {
        let runCycles = frameBudget - machine.frameCycleAccum;
        if (runCycles <= 0) runCycles = frameBudget;
        if (runCycles > cyclesToRun) runCycles = cyclesToRun;
        CPU.run(machine.ctx, machine.ctx.cycleCounter + runCycles);
        cyclesToRun -= runCycles;
        machine.frameCycleAccum += runCycles;
        if (machine.frameCycleAccum >= frameBudget) {
          machine.frameCycleAccum -= frameBudget;
          paint();
          updateDebug();
        }
      }

      if (machine.audioState) {
        pokeyAudioSync(machine.ctx, machine.audioState, machine.ctx.cycleCounter);
        if (
          machine.audioMode === "worklet" &&
          machine.audioNode &&
          machine.audioNode.port
        ) {
          while (true) {
            const chunk = pokeyAudioDrain(machine.audioState, 4096);
            if (!chunk) break;
            try {
              machine.audioNode.port.postMessage(
                { type: "samples", samples: chunk },
                [chunk.buffer],
              );
            } catch {
              break;
            }
          }
        }
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
      machine.frameCycleAccum = 0;
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
        } catch {
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
      const next = !!v;
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
        {machine.ctx.ioData.sioTurbo = sioTurbo;}
      syncAudioTurboMode(
        turbo || (!turbo && sioTurbo && isSioActive(machine.ctx.ioData)),
      );
    }

    function setOptionOnStart(v) {
      optionOnStart = !!v;
      if (machine.ctx && machine.ctx.ioData)
        {machine.ctx.ioData.optionOnStart = optionOnStart;}
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
      hDevice: hDevice,
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
