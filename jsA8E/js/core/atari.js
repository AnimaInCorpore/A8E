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
  const PLAYFIELD_SCRATCH_VIEW_X = 64;
  const DEFAULT_PORTB = (function () {
    for (let i = 0; i < IO_INIT_VALUES.length; i++) {
      const entry = IO_INIT_VALUES[i];
      if (entry && entry.addr === IO_PORTB) return entry.write & 0xff;
    }
    return 0xfd;
  })();

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
  const setKeysKeyboardMappingMode = keysApi.setKeyboardMappingMode;
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
  const snapshotCodec =
    window.A8ESnapshotCodec &&
    typeof window.A8ESnapshotCodec.encodeSnapshot === "function" &&
    typeof window.A8ESnapshotCodec.decodeSnapshot === "function"
      ? window.A8ESnapshotCodec
      : null;
  if (!snapshotCodec) throw new Error("A8ESnapshotCodec is not loaded");
  const memoryApi =
    window.A8EMemory && window.A8EMemory.createApi
      ? window.A8EMemory.createApi({
          CPU: CPU,
          IO_PORTB: IO_PORTB,
          DEFAULT_PORTB: DEFAULT_PORTB,
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
          PLAYFIELD_SCRATCH_VIEW_X: PLAYFIELD_SCRATCH_VIEW_X,
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
  const drawPlayerMissilesClock = gtiaApi.drawPlayerMissilesClock;
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
          drawPlayerMissilesClock: drawPlayerMissilesClock,
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
  const debuggerApi =
    window.A8EDebugger && window.A8EDebugger.createApi
      ? window.A8EDebugger.createApi({ CPU: CPU })
      : null;
  if (!debuggerApi) throw new Error("A8EDebugger is not loaded");

  // --- UI-facing App ---
  function createApp(opts) {
    const canvas = opts.canvas;
    const ctx2d = opts.ctx2d;
    const gl = opts.gl;
    const debugEl = opts.debugEl;
    const onDebugState =
      opts && typeof opts.onDebugState === "function" ? opts.onDebugState : null;

    let audioEnabled = !!opts.audioEnabled;
    let turbo = !!opts.turbo;
    let sioTurbo = opts.sioTurbo !== false;
    let optionOnStart = !!opts.optionOnStart;
    let keyboardMappingMode =
      opts.keyboardMappingMode === "original" ? "original" : "translated";
    if (setKeysKeyboardMappingMode)
      {setKeysKeyboardMappingMode(keyboardMappingMode);}

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
      audioQueuedSamples: 0,
      audioWorkletMaxQueuedSamples: 0,
      audioFillLevelSmoothed: -1,
      cycleAccum: 0,
      frameCycleAccum: 0,
    };
    let debugRuntime = null;

    function pauseInternal(reason) {
      const wasRunning = !!machine.running;
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
      machine.cycleAccum = 0;
      if (debugRuntime) debugRuntime.onPause(reason || "pause", wasRunning);
    }

    function setBreakpoints(addresses) {
      return debugRuntime.setBreakpoints(addresses);
    }

    function stepInstruction() {
      return debugRuntime.stepInstruction();
    }

    function stepOver() {
      return debugRuntime.stepOver();
    }

    function stepInstructionAsync() {
      return debugRuntime.stepInstructionAsync();
    }

    function stepOverAsync() {
      return debugRuntime.stepOverAsync();
    }

    function getDebugState() {
      return debugRuntime.getDebugState();
    }

    function getCounters() {
      return debugRuntime.getCounters();
    }

    function getTraceTail(limit) {
      return debugRuntime.getTraceTail(limit);
    }

    function runUntilPc(targetPc, opts) {
      return debugRuntime.runUntilPc(targetPc, opts);
    }

    function onDebugStateChange(fn) {
      return debugRuntime.onDebugStateChange(fn);
    }

    debugRuntime = debuggerApi.createRuntime({
      machine: machine,
      onDebugState: onDebugState,
      pauseInternal: pauseInternal,
      isReady: isReady,
      start: start,
      afterStep: function (reason) {
        paint();
        updateDebug(reason || "step");
      },
    });

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
    const loadDiskToDeviceSlotDetailed = memoryRuntime.loadDiskToDeviceSlotDetailed;
    const mountImageToDeviceSlot = memoryRuntime.mountImageToDeviceSlot;
    const unmountDeviceSlot = memoryRuntime.unmountDeviceSlot;
    const getMountedDiskForDeviceSlot = memoryRuntime.getMountedDiskForDeviceSlot;
    const hasMountedDiskForDeviceSlot = memoryRuntime.hasMountedDiskForDeviceSlot;
    const readMemoryRuntime = memoryRuntime.readMemory;
    const readRangeRuntime = memoryRuntime.readRange;
    const writeMemoryRuntime = memoryRuntime.writeMemory;
    const writeRangeRuntime = memoryRuntime.writeRange;
    const getBankStateRuntime = memoryRuntime.getBankState;

    // H: device -- create instance and install CIO hook(s)
    let hDevice = null;
    let hDeviceHookAddresses = [];

    function installHDeviceCioHooks() {
      if (!hDevice) {
        debugRuntime.rebindBreakpointHooks();
        return;
      }

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
      debugRuntime.rebindBreakpointHooks();
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

    function hardReset(options) {
      memoryHardReset(options || null);
      debugRuntime.resetExecutionState();
      if (hDevice) {
        hDevice.resetChannels();
        installHDeviceCioHooks();
      } else {
        debugRuntime.rebindBreakpointHooks();
      }
    }

    function loadOsRom(arrayBuffer) {
      memoryLoadOsRom(arrayBuffer);
      debugRuntime.resetExecutionState();
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
    const getConsoleKeyState = inputRuntime.getConsoleKeyState;

    function paint() {
      renderer.paint(video);
    }

    function getRendererBackend() {
      return renderer && renderer.backend ? renderer.backend : "unknown";
    }

    function readMemory(address) {
      return readMemoryRuntime(address);
    }

    function readRange(startAddress, length) {
      return readRangeRuntime(startAddress, length);
    }

    function writeMemory(address, value) {
      return writeMemoryRuntime(address, value);
    }

    function writeRange(startAddress, data) {
      return writeRangeRuntime(startAddress, data);
    }

    function getBankState() {
      return getBankStateRuntime();
    }

    function cloneVideoState() {
      return {
        pixels: new Uint8Array(video.pixels),
        priority: new Uint8Array(video.priority),
        playfieldScratchPixels: new Uint8Array(video.playfieldScratchPixels),
        playfieldScratchPriority: new Uint8Array(video.playfieldScratchPriority),
      };
    }

    function restoreVideoState(snapshot) {
      const state = snapshot && typeof snapshot === "object" ? snapshot : {};
      video.pixels.fill(0);
      video.priority.fill(0);
      video.playfieldScratchPixels.fill(0);
      video.playfieldScratchPriority.fill(0);
      if (state.pixels) {
        video.pixels.set(
          new Uint8Array(state.pixels).subarray(0, video.pixels.length),
          0,
        );
      }
      if (state.priority) {
        video.priority.set(
          new Uint8Array(state.priority).subarray(0, video.priority.length),
          0,
        );
      }
      if (state.playfieldScratchPixels) {
        video.playfieldScratchPixels.set(
          new Uint8Array(state.playfieldScratchPixels).subarray(
            0,
            video.playfieldScratchPixels.length,
          ),
          0,
        );
      }
      if (state.playfieldScratchPriority) {
        video.playfieldScratchPriority.set(
          new Uint8Array(state.playfieldScratchPriority).subarray(
            0,
            video.playfieldScratchPriority.length,
          ),
          0,
        );
      }
    }

    function buildCoreSnapshot(savedRunning) {
      return {
        type: "a8e.snapshot",
        version: snapshotCodec.formatVersion | 0,
        savedAt: Date.now(),
        savedRunning: !!savedRunning,
        config: {
          audioEnabled: !!audioEnabled,
          turbo: !!turbo,
          sioTurbo: !!sioTurbo,
          optionOnStart: !!optionOnStart,
          keyboardMappingMode: keyboardMappingMode,
        },
        machine: {
          cpu: {
            a: machine.ctx.cpu.a & 0xff,
            x: machine.ctx.cpu.x & 0xff,
            y: machine.ctx.cpu.y & 0xff,
            sp: machine.ctx.cpu.sp & 0xff,
            pc: machine.ctx.cpu.pc & 0xffff,
            ps: CPU.getPs(machine.ctx) & 0xff,
          },
          cycleCounter: machine.ctx.cycleCounter,
          stallCycleCounter: machine.ctx.stallCycleCounter,
          ioCycleTimedEventCycle: machine.ctx.ioCycleTimedEventCycle,
          nmiPending: machine.ctx.nmiPending | 0,
          nmiActive: machine.ctx.nmiActive | 0,
          irqPending: machine.ctx.irqPending | 0,
          instructionCounter: machine.ctx.instructionCounter >>> 0,
          cycleAccum: +machine.cycleAccum || 0,
          frameCycleAccum: machine.frameCycleAccum | 0,
          video: cloneVideoState(),
          memory: memoryRuntime.exportSnapshotState(),
          debug: debugRuntime.exportSnapshotState(),
          input: inputRuntime.exportSnapshotState(),
          hDevice:
            hDevice && typeof hDevice.exportSnapshotState === "function"
              ? hDevice.exportSnapshotState()
              : null,
        },
      };
    }

    function normalizeSnapshotTiming(options) {
      const opts = options && typeof options === "object" ? options : null;
      return opts && opts.timing === "exact" ? "exact" : "frame";
    }

    function alignSnapshotToFrameBoundary(options) {
      const timing = normalizeSnapshotTiming(options);
      if (timing === "exact") {
        return {
          timing: timing,
          advancedCycles: 0,
        };
      }

      const frameRemainder = machine.frameCycleAccum | 0;
      if (frameRemainder <= 0) {
        return {
          timing: timing,
          advancedCycles: 0,
        };
      }

      const remainingCycles = CYCLES_PER_FRAME - frameRemainder;
      if (remainingCycles <= 0) {
        machine.frameCycleAccum = 0;
        return {
          timing: timing,
          advancedCycles: 0,
        };
      }

      const debugState =
        debugRuntime && typeof debugRuntime.suspendBreakpoints === "function"
          ? debugRuntime.suspendBreakpoints()
          : null;
      const startCycle = machine.ctx.cycleCounter | 0;
      let endCycle = startCycle;
      try {
        endCycle = CPU.run(machine.ctx, startCycle + remainingCycles) | 0;
      } catch (err) {
        if (debugRuntime && typeof debugRuntime.onExecutionError === "function") {
          debugRuntime.onExecutionError(err);
        }
        throw err;
      } finally {
        if (debugRuntime && typeof debugRuntime.restoreBreakpoints === "function") {
          debugRuntime.restoreBreakpoints(debugState);
        }
      }

      let executed = (endCycle - startCycle) | 0;
      if (executed < 0) executed = 0;
      if (executed > remainingCycles) executed = remainingCycles;
      if (executed !== remainingCycles) {
        throw new Error(
          "A8E snapshot frame alignment stopped before the next frame boundary",
        );
      }

      machine.frameCycleAccum =
        (frameRemainder + executed) % CYCLES_PER_FRAME;
      paint();
      updateDebug("snapshot_save");
      return {
        timing: timing,
        advancedCycles: executed,
      };
    }

    function saveSnapshot(options) {
      if (machine.running) {
        throw new Error("A8E snapshot save requires paused emulation");
      }
      const opts = options && typeof options === "object" ? options : {};
      const alignment = alignSnapshotToFrameBoundary(opts);
      const snapshot = buildCoreSnapshot(
        opts.savedRunning !== undefined ? !!opts.savedRunning : false,
      );
      const buffer = snapshotCodec.encodeSnapshot(snapshot);
      return {
        type: "a8e.snapshot",
        version: snapshot.version | 0,
        savedAt: snapshot.savedAt,
        savedRunning: snapshot.savedRunning,
        mimeType: "application/x-a8e-snapshot",
        byteLength: buffer.byteLength | 0,
        buffer: buffer,
        timing: alignment.timing,
      };
    }

    function loadSnapshot(arrayBuffer, options) {
      const bytes = snapshotCodec.toUint8Array(arrayBuffer);
      const payload = snapshotCodec.decodeSnapshot(bytes);
      if (!payload || payload.type !== "a8e.snapshot") {
        throw new Error("A8E snapshot is invalid");
      }
      const snapshot = payload.machine || {};
      const opts = options && typeof options === "object" ? options : {};
      pauseInternal("pause");
      if (debugRuntime && typeof debugRuntime.removeStepOverHook === "function") {
        debugRuntime.removeStepOverHook();
      }
      if (typeof opts.audioEnabled === "boolean") {
        audioEnabled = !!opts.audioEnabled;
      } else if (payload.config && typeof payload.config.audioEnabled === "boolean") {
        audioEnabled = !!payload.config.audioEnabled;
      }
      if (payload.config && typeof payload.config.turbo === "boolean") {
        turbo = !!payload.config.turbo;
      }
      if (payload.config && typeof payload.config.sioTurbo === "boolean") {
        sioTurbo = !!payload.config.sioTurbo;
      }
      if (payload.config && typeof payload.config.optionOnStart === "boolean") {
        optionOnStart = !!payload.config.optionOnStart;
      }
      if (payload.config && payload.config.keyboardMappingMode) {
        keyboardMappingMode =
          payload.config.keyboardMappingMode === "original"
            ? "original"
            : "translated";
        if (setKeysKeyboardMappingMode) {
          setKeysKeyboardMappingMode(keyboardMappingMode);
        }
      }
      machine.cycleAccum =
        typeof snapshot.cycleAccum === "number" ? +snapshot.cycleAccum : 0;
      machine.frameCycleAccum = snapshot.frameCycleAccum | 0;
      machine.ctx.cpu.a =
        snapshot.cpu && typeof snapshot.cpu.a === "number"
          ? snapshot.cpu.a & 0xff
          : 0;
      machine.ctx.cpu.x =
        snapshot.cpu && typeof snapshot.cpu.x === "number"
          ? snapshot.cpu.x & 0xff
          : 0;
      machine.ctx.cpu.y =
        snapshot.cpu && typeof snapshot.cpu.y === "number"
          ? snapshot.cpu.y & 0xff
          : 0;
      machine.ctx.cpu.sp =
        snapshot.cpu && typeof snapshot.cpu.sp === "number"
          ? snapshot.cpu.sp & 0xff
          : 0;
      machine.ctx.cpu.pc =
        snapshot.cpu && typeof snapshot.cpu.pc === "number"
          ? snapshot.cpu.pc & 0xffff
          : 0;
      CPU.setPs(
        machine.ctx,
        snapshot.cpu && typeof snapshot.cpu.ps === "number"
          ? snapshot.cpu.ps & 0xff
          : 0,
      );
      machine.ctx.cycleCounter =
        typeof snapshot.cycleCounter === "number" ? snapshot.cycleCounter : 0;
      machine.ctx.stallCycleCounter =
        typeof snapshot.stallCycleCounter === "number"
          ? snapshot.stallCycleCounter
          : 0;
      machine.ctx.ioCycleTimedEventCycle = snapshot.ioCycleTimedEventCycle;
      machine.ctx.ioMasterTimedEventCycle = Infinity;
      machine.ctx.ioBeamTimedEventCycle = Infinity;
      machine.ctx.nmiPending = snapshot.nmiPending ? 1 : 0;
      machine.ctx.nmiActive = snapshot.nmiActive ? 1 : 0;
      machine.ctx.irqPending = snapshot.irqPending | 0;
      machine.ctx.instructionCounter = snapshot.instructionCounter >>> 0;
      machine.ctx.breakRun = false;
      machine.ctx.pcHooks = Object.create(null);
      memoryRuntime.importSnapshotState(snapshot.memory);
      restoreVideoState(snapshot.video);
      cycleTimedEventUpdate(machine.ctx);
      if (hDevice && typeof hDevice.importSnapshotState === "function") {
        hDevice.importSnapshotState(snapshot.hDevice);
      }
      installHDeviceCioHooks();
      if (typeof inputRuntime.importSnapshotState === "function") {
        inputRuntime.importSnapshotState(snapshot.input);
      }
      if (typeof debugRuntime.importSnapshotState === "function") {
        debugRuntime.importSnapshotState(snapshot.debug);
      }
      if (machine.audioCtx) {
        stopAudio();
      }
      paint();
      updateDebug("snapshot_load");
      const resume =
        opts.resume === true ||
        (opts.resume !== false && payload.savedRunning === true);
      if (resume) start();
      return {
        command: "loadSnapshot",
        snapshotVersion: payload.version | 0,
        savedAt: payload.savedAt || 0,
        savedRunning: !!payload.savedRunning,
        resumed: !!resume,
        state: {
          running: !!machine.running,
          debug: getDebugState(),
        },
        debugState: getDebugState(),
      };
    }

    function createCaptureCanvas(width, height) {
      if (typeof OffscreenCanvas === "function") {
        return new OffscreenCanvas(width, height);
      }
      if (typeof document !== "undefined" && document.createElement) {
        const canvasEl = document.createElement("canvas");
        canvasEl.width = width;
        canvasEl.height = height;
        return canvasEl;
      }
      return null;
    }

    function dataUrlToArrayBuffer(dataUrl) {
      if (!dataUrl || typeof dataUrl !== "string") {
        return new ArrayBuffer(0);
      }
      const comma = dataUrl.indexOf(",");
      const base64 = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i) & 0xff;
      }
      return bytes.buffer;
    }

    function bytesToHex(bytes) {
      let out = "";
      for (let i = 0; i < bytes.length; i++) {
        out += Util.toHex2(bytes[i]);
      }
      return out;
    }

    function normalizeArtifactRange(entry, fallbackLabel) {
      if (entry === null || entry === undefined) return null;
      let start = 0;
      let length = 0;
      let label = fallbackLabel || "";
      if (Array.isArray(entry)) {
        if (entry.length < 2) return null;
        start = Number(entry[0]);
        length = Number(entry[1]);
        if (entry.length > 2 && typeof entry[2] === "string") {
          label = entry[2];
        }
      } else if (typeof entry === "object") {
        start = Number(entry.start);
        if (entry.length !== undefined && entry.length !== null) {
          length = Number(entry.length);
        } else if (entry.end !== undefined && entry.end !== null) {
          length = Number(entry.end) - start + 1;
        }
        if (typeof entry.label === "string" && entry.label.length) {
          label = entry.label;
        }
      } else {
        return null;
      }
      if (!isFinite(start) || !isFinite(length)) return null;
      start = start | 0;
      length = length | 0;
      if (start < 0 || start > 0xffff || length <= 0) return null;
      if (length > 0x10000) length = 0x10000;
      return {
        label: label || "range_" + Util.toHex4(start),
        start: start & 0xffff,
        end: (start + length - 1) & 0xffff,
        length: length,
      };
    }

    async function captureScreenshot() {
      const captureCanvas = createCaptureCanvas(VIEW_W, VIEW_H);
      if (!captureCanvas) {
        throw new Error("A8E: screenshot capture canvas unavailable");
      }
      const captureCtx = captureCanvas.getContext("2d", { alpha: false });
      if (!captureCtx || typeof captureCtx.createImageData !== "function") {
        throw new Error("A8E: screenshot capture context unavailable");
      }
      const imageData = captureCtx.createImageData(VIEW_W, VIEW_H);
      blitViewportToImageData(video, imageData);
      captureCtx.putImageData(imageData, 0, 0);

      if (typeof captureCanvas.convertToBlob === "function") {
        const blob = await captureCanvas.convertToBlob({ type: "image/png" });
        return {
          mimeType: "image/png",
          width: VIEW_W,
          height: VIEW_H,
          buffer: await blob.arrayBuffer(),
        };
      }

      if (typeof captureCanvas.toBlob === "function") {
        return new Promise(function (resolve, reject) {
          captureCanvas.toBlob(
            function (blob) {
              if (!blob) {
                reject(new Error("A8E: screenshot capture failed"));
                return;
              }
              blob
                .arrayBuffer()
                .then(function (buffer) {
                  resolve({
                    mimeType: "image/png",
                    width: VIEW_W,
                    height: VIEW_H,
                    buffer: buffer,
                  });
                })
                .catch(reject);
            },
            "image/png",
            1.0,
          );
        });
      }

      if (typeof captureCanvas.toDataURL === "function") {
        return {
          mimeType: "image/png",
          width: VIEW_W,
          height: VIEW_H,
          buffer: dataUrlToArrayBuffer(captureCanvas.toDataURL("image/png")),
        };
      }

      throw new Error("A8E: screenshot capture unsupported in this runtime");
    }

    function collectArtifacts(options) {
      const config = options || {};
      const ranges = Array.isArray(config.ranges) ? config.ranges : [];
      const labels = Array.isArray(config.labels) ? config.labels : [];
      const memoryRanges = [];
      for (let i = 0; i < ranges.length; i++) {
        const normalized = normalizeArtifactRange(ranges[i], labels[i]);
        if (!normalized) continue;
        const bytes = readRangeRuntime(normalized.start, normalized.length);
        memoryRanges.push({
          label: normalized.label,
          start: normalized.start,
          end: normalized.end,
          length: bytes.length | 0,
          hex: bytesToHex(bytes),
        });
      }

      const debugState = getDebugState();
      return {
        rendererBackend: getRendererBackend(),
        debugState: debugState,
        counters: getCounters(),
        bankState: getBankState(),
        breakpointHit:
          debugState && typeof debugState.breakpointHit === "number"
            ? debugState.breakpointHit & 0xffff
            : null,
        traceTail: getTraceTail(config.traceTailLimit || 32),
        memoryRanges: memoryRanges,
      };
    }

    function updateDebug(reason) {
      const c = machine.ctx.cpu;
      if (debugEl) {
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
      debugRuntime.emitDebugState(reason || "debug");
    }

    function hardResetWithInputRelease(options) {
      if (releaseAllKeys) releaseAllKeys();
      machine.cycleAccum = 0;
      machine.frameCycleAccum = 0;
      hardReset(options || null);
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
      let completedFrames = 0;
      let faulted = false;

      while (cyclesToRun > 0) {
        let runCycles = frameBudget - machine.frameCycleAccum;
        if (runCycles <= 0) runCycles = frameBudget;
        if (runCycles > cyclesToRun) runCycles = cyclesToRun;
        const startCycle = machine.ctx.cycleCounter | 0;
        let endCycle = startCycle;
        try {
          endCycle = CPU.run(machine.ctx, machine.ctx.cycleCounter + runCycles) | 0;
        } catch (err) {
          if (debugRuntime && typeof debugRuntime.onExecutionError === "function") {
            debugRuntime.onExecutionError(err);
          }
          pauseInternal("fault_execution_error");
          paint();
          updateDebug("fault_execution_error");
          faulted = true;
          cyclesToRun = 0;
          break;
        }
        let executed = (endCycle - startCycle) | 0;
        if (executed < 0) executed = 0;
        if (executed > runCycles) executed = runCycles;
        if (executed <= 0) {
          cyclesToRun = 0;
          break;
        }
        cyclesToRun -= executed;
        machine.frameCycleAccum += executed;
        if (machine.frameCycleAccum >= frameBudget) {
          machine.frameCycleAccum -= frameBudget;
          completedFrames++;
        }
        if (executed < runCycles) break;
      }

      if (completedFrames > 0 && !faulted) {
        paint();
        updateDebug("frame");
      }

      if (machine.audioState) {
        pokeyAudioSync(machine.ctx, machine.audioState, machine.ctx.cycleCounter);
        if (
          machine.audioMode === "worklet" &&
          machine.audioNode &&
          machine.audioNode.port
        ) {
          let queued = machine.audioQueuedSamples | 0;
          const queueCap = machine.audioWorkletMaxQueuedSamples | 0;
          while (true) {
            let drainLimit = 4096;
            if (queueCap > 0) {
              const budget = queueCap - queued;
              if (budget <= 0) break;
              if (budget < drainLimit) drainLimit = budget;
            }
            if (drainLimit < 256) break;
            const chunk = pokeyAudioDrain(machine.audioState, drainLimit);
            if (!chunk) break;
            try {
              machine.audioNode.port.postMessage(
                { type: "samples", samples: chunk },
                [chunk.buffer],
              );
              queued += chunk.length | 0;
            } catch {
              break;
            }
          }
          machine.audioQueuedSamples = queued | 0;
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
      debugRuntime.onStart();
    }

    function pause() {
      debugRuntime.removeStepOverHook();
      pauseInternal("pause");
    }

    function reset(options) {
      if (!isReady()) return;
      debugRuntime.resetExecutionState();
      hardResetWithInputRelease(options || null);
      paint();
      updateDebug("reset");
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

    function setKeyboardMappingMode(mode) {
      keyboardMappingMode = mode === "original" ? "original" : "translated";
      if (setKeysKeyboardMappingMode)
        {setKeysKeyboardMappingMode(keyboardMappingMode);}
    }

    function dispose() {
      debugRuntime.removeStepOverHook();
      pauseInternal("dispose");
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
    updateDebug("init");

    return {
      start: start,
      pause: pause,
      reset: reset,
      setTurbo: setTurbo,
      getTurbo: function () { return turbo; },
      setSioTurbo: setSioTurbo,
      getSioTurbo: function () { return sioTurbo; },
      setAudioEnabled: setAudioEnabled,
      getAudioEnabled: function () { return audioEnabled; },
      setOptionOnStart: setOptionOnStart,
      getOptionOnStart: function () { return optionOnStart; },
      setKeyboardMappingMode: setKeyboardMappingMode,
      getKeyboardMappingMode: function () { return keyboardMappingMode; },
      setBreakpoints: setBreakpoints,
      stepInstruction: stepInstruction,
      stepInstructionAsync: stepInstructionAsync,
      stepOver: stepOver,
      stepOverAsync: stepOverAsync,
      getDebugState: getDebugState,
      getCounters: getCounters,
      getTraceTail: getTraceTail,
      runUntilPc: runUntilPc,
      readMemory: readMemory,
      readRange: readRange,
      writeMemory: writeMemory,
      writeRange: writeRange,
      getBankState: getBankState,
      saveSnapshot: saveSnapshot,
      loadSnapshot: loadSnapshot,
      captureScreenshot: captureScreenshot,
      collectArtifacts: collectArtifacts,
      onDebugStateChange: onDebugStateChange,
      loadOsRom: loadOsRom,
      loadBasicRom: loadBasicRom,
      loadDiskToDeviceSlot: loadDiskToDeviceSlot,
      loadDiskToDeviceSlotDetailed: loadDiskToDeviceSlotDetailed,
      mountImageToDeviceSlot: mountImageToDeviceSlot,
      unmountDeviceSlot: unmountDeviceSlot,
      getMountedDiskForDeviceSlot: getMountedDiskForDeviceSlot,
      hasMountedDiskForDeviceSlot: hasMountedDiskForDeviceSlot,
      hDevice: hDevice,
      hasOsRom: hasOsRom,
      hasBasicRom: hasBasicRom,
      isReady: isReady,
      getRendererBackend: getRendererBackend,
      isWorkerBackend: function () {
        return false;
      },
      isRunning: function () {
        return machine.running;
      },
      dispose: dispose,
      onKeyDown: onKeyDown,
      onKeyUp: onKeyUp,
      releaseAllKeys: releaseAllKeys,
      getConsoleKeyState: getConsoleKeyState,
    };
  }

  window.A8EApp = { create: createApp };
})();
