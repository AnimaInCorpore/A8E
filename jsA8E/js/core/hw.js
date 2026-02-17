(function () {
  "use strict";

  let api = null;

  function createApi() {
    if (api) return api;

    // --- Constants (from AtariIo.h / Antic.h / Gtia.h / Pokey.h / Pia.h) ---
    const PIXELS_PER_LINE = 456;
    const LINES_PER_SCREEN_PAL = 312;
    const COLOR_CLOCKS_PER_LINE = PIXELS_PER_LINE / 2;
    const CYCLES_PER_LINE = COLOR_CLOCKS_PER_LINE / 2; // 114
    const ATARI_CPU_HZ_PAL = 1773447;
    const CYCLE_NEVER = Infinity;

    const FIRST_VISIBLE_LINE = 8;
    const LAST_VISIBLE_LINE = 247;

    const SERIAL_OUTPUT_DATA_NEEDED_CYCLES = 900;
    const SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES = 1500;
    const SERIAL_INPUT_FIRST_DATA_READY_CYCLES = 3000;
    const SERIAL_INPUT_DATA_READY_CYCLES = 900;
    const SIO_TURBO_EMU_MULTIPLIER = 4.0;
    // Keep enough history to survive moderate frame delays without excessive latency.
    const POKEY_AUDIO_MAX_CATCHUP_CYCLES = 100000;

    const NMI_DLI = 0x80;
    const NMI_VBI = 0x40;
    const NMI_RESET = 0x20;

    // PIA
    const IO_PORTA = 0xd300;
    const IO_PORTB = 0xd301;
    const IO_PACTL = 0xd302;
    const IO_PBCTL = 0xd303;

    // GTIA
    const IO_HPOSP0_M0PF = 0xd000;
    const IO_HPOSP1_M1PF = 0xd001;
    const IO_HPOSP2_M2PF = 0xd002;
    const IO_HPOSP3_M3PF = 0xd003;
    const IO_HPOSM0_P0PF = 0xd004;
    const IO_HPOSM1_P1PF = 0xd005;
    const IO_HPOSM2_P2PF = 0xd006;
    const IO_HPOSM3_P3PF = 0xd007;
    const IO_SIZEP0_M0PL = 0xd008;
    const IO_SIZEP1_M1PL = 0xd009;
    const IO_SIZEP2_M2PL = 0xd00a;
    const IO_SIZEP3_M3PL = 0xd00b;
    const IO_SIZEM_P0PL = 0xd00c;
    const IO_GRAFP0_P1PL = 0xd00d;
    const IO_GRAFP1_P2PL = 0xd00e;
    const IO_GRAFP2_P3PL = 0xd00f;
    const IO_GRAFP3_TRIG0 = 0xd010;
    const IO_GRAFM_TRIG1 = 0xd011;
    const IO_COLPM0_TRIG2 = 0xd012;
    const IO_COLPM1_TRIG3 = 0xd013;
    const IO_COLPM2_PAL = 0xd014;
    const IO_COLPM3 = 0xd015;
    const IO_COLPF0 = 0xd016;
    const IO_COLPF1 = 0xd017;
    const IO_COLPF2 = 0xd018;
    const IO_COLPF3 = 0xd019;
    const IO_COLBK = 0xd01a;
    const IO_PRIOR = 0xd01b;
    const IO_VDELAY = 0xd01c;
    const IO_GRACTL = 0xd01d;
    const IO_HITCLR = 0xd01e;
    const IO_CONSOL = 0xd01f;

    // POKEY
    const IO_AUDF1_POT0 = 0xd200;
    const IO_AUDC1_POT1 = 0xd201;
    const IO_AUDF2_POT2 = 0xd202;
    const IO_AUDC2_POT3 = 0xd203;
    const IO_AUDF3_POT4 = 0xd204;
    const IO_AUDC3_POT5 = 0xd205;
    const IO_AUDF4_POT6 = 0xd206;
    const IO_AUDC4_POT7 = 0xd207;
    const IO_AUDCTL_ALLPOT = 0xd208;
    // combined read/write addresses:
    const IO_STIMER_KBCODE = 0xd209; // write STIMER / read KBCODE
    const IO_SKREST_RANDOM = 0xd20a; // write SKREST / read RANDOM
    const IO_POTGO = 0xd20b;
    const IO_SEROUT_SERIN = 0xd20d; // write SEROUT / read SERIN
    const IO_IRQEN_IRQST = 0xd20e; // write IRQEN / read IRQST
    const IO_SKCTL_SKSTAT = 0xd20f; // write SKCTL / read SKSTAT

    const IRQ_TIMER_1 = 0x01;
    const IRQ_TIMER_2 = 0x02;
    const IRQ_TIMER_4 = 0x04;
    const IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE = 0x08;
    const IRQ_SERIAL_OUTPUT_DATA_NEEDED = 0x10;
    const IRQ_SERIAL_INPUT_DATA_READY = 0x20;
    const IRQ_OTHER_KEY_PRESSED = 0x40;
    const IRQ_BREAK_KEY_PRESSED = 0x80;

    // ANTIC
    const IO_DMACTL = 0xd400;
    const IO_CHACTL = 0xd401;
    const IO_DLISTL = 0xd402;
    const IO_DLISTH = 0xd403;
    const IO_HSCROL = 0xd404;
    const IO_VSCROL = 0xd405;
    const IO_PMBASE = 0xd407;
    const IO_CHBASE = 0xd409;
    const IO_WSYNC = 0xd40a;
    const IO_VCOUNT = 0xd40b;
    const IO_PENH = 0xd40c;
    const IO_PENV = 0xd40d;
    const IO_NMIEN = 0xd40e;
    const IO_NMIRES_NMIST = 0xd40f;

    // Viewport from A8E.c
    const VIEW_W = 336;
    const VIEW_H = 240;
    const VIEW_X = (16 + 12 + 6 + 10 + 4) * 2 + 160 - VIEW_W / 2; // 88
    const VIEW_Y = 8;

    // Priority bits (from Antic.c)
    const PRIO_BKG = 0x00;
    const PRIO_PF0 = 0x01;
    const PRIO_PF1 = 0x02;
    const PRIO_PF2 = 0x04;
    const PRIO_PF3 = 0x08;
    const PRIO_PM0 = 0x10;
    const PRIO_PM1 = 0x20;
    const PRIO_PM2 = 0x40;
    const PRIO_PM3 = 0x80;
    const PRIORITY_TABLE_BKG_PF012 = new Uint8Array([
      PRIO_BKG,
      PRIO_PF0,
      PRIO_PF1,
      PRIO_PF2,
    ]);
    const PRIORITY_TABLE_BKG_PF013 = new Uint8Array([
      PRIO_BKG,
      PRIO_PF0,
      PRIO_PF1,
      PRIO_PF3,
    ]);
    const PRIORITY_TABLE_PF0123 = new Uint8Array([
      PRIO_PF0,
      PRIO_PF1,
      PRIO_PF2,
      PRIO_PF3,
    ]);
    const SCRATCH_GTIA_COLOR_TABLE = new Uint8Array(16);
    const SCRATCH_COLOR_TABLE_A = new Uint8Array(4);
    const SCRATCH_COLOR_TABLE_B = new Uint8Array(4);
    const SCRATCH_BACKGROUND_TABLE = new Uint8Array(4);

    // --- Minimal ANTIC mode info (ported from AtariIo.c) ---
    const ANTIC_MODE_INFO = [
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
    const IO_INIT_VALUES = [
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

    api = {
      PIXELS_PER_LINE: PIXELS_PER_LINE,
      LINES_PER_SCREEN_PAL: LINES_PER_SCREEN_PAL,
      COLOR_CLOCKS_PER_LINE: COLOR_CLOCKS_PER_LINE,
      CYCLES_PER_LINE: CYCLES_PER_LINE,
      ATARI_CPU_HZ_PAL: ATARI_CPU_HZ_PAL,
      CYCLE_NEVER: CYCLE_NEVER,
      FIRST_VISIBLE_LINE: FIRST_VISIBLE_LINE,
      LAST_VISIBLE_LINE: LAST_VISIBLE_LINE,
      SERIAL_OUTPUT_DATA_NEEDED_CYCLES: SERIAL_OUTPUT_DATA_NEEDED_CYCLES,
      SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES:
        SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES,
      SERIAL_INPUT_FIRST_DATA_READY_CYCLES:
        SERIAL_INPUT_FIRST_DATA_READY_CYCLES,
      SERIAL_INPUT_DATA_READY_CYCLES: SERIAL_INPUT_DATA_READY_CYCLES,
      SIO_TURBO_EMU_MULTIPLIER: SIO_TURBO_EMU_MULTIPLIER,
      POKEY_AUDIO_MAX_CATCHUP_CYCLES: POKEY_AUDIO_MAX_CATCHUP_CYCLES,
      NMI_DLI: NMI_DLI,
      NMI_VBI: NMI_VBI,
      NMI_RESET: NMI_RESET,
      IO_PORTA: IO_PORTA,
      IO_PORTB: IO_PORTB,
      IO_PACTL: IO_PACTL,
      IO_PBCTL: IO_PBCTL,
      IO_HPOSP0_M0PF: IO_HPOSP0_M0PF,
      IO_HPOSP1_M1PF: IO_HPOSP1_M1PF,
      IO_HPOSP2_M2PF: IO_HPOSP2_M2PF,
      IO_HPOSP3_M3PF: IO_HPOSP3_M3PF,
      IO_HPOSM0_P0PF: IO_HPOSM0_P0PF,
      IO_HPOSM1_P1PF: IO_HPOSM1_P1PF,
      IO_HPOSM2_P2PF: IO_HPOSM2_P2PF,
      IO_HPOSM3_P3PF: IO_HPOSM3_P3PF,
      IO_SIZEP0_M0PL: IO_SIZEP0_M0PL,
      IO_SIZEP1_M1PL: IO_SIZEP1_M1PL,
      IO_SIZEP2_M2PL: IO_SIZEP2_M2PL,
      IO_SIZEP3_M3PL: IO_SIZEP3_M3PL,
      IO_SIZEM_P0PL: IO_SIZEM_P0PL,
      IO_GRAFP0_P1PL: IO_GRAFP0_P1PL,
      IO_GRAFP1_P2PL: IO_GRAFP1_P2PL,
      IO_GRAFP2_P3PL: IO_GRAFP2_P3PL,
      IO_GRAFP3_TRIG0: IO_GRAFP3_TRIG0,
      IO_GRAFM_TRIG1: IO_GRAFM_TRIG1,
      IO_COLPM0_TRIG2: IO_COLPM0_TRIG2,
      IO_COLPM1_TRIG3: IO_COLPM1_TRIG3,
      IO_COLPM2_PAL: IO_COLPM2_PAL,
      IO_COLPM3: IO_COLPM3,
      IO_COLPF0: IO_COLPF0,
      IO_COLPF1: IO_COLPF1,
      IO_COLPF2: IO_COLPF2,
      IO_COLPF3: IO_COLPF3,
      IO_COLBK: IO_COLBK,
      IO_PRIOR: IO_PRIOR,
      IO_VDELAY: IO_VDELAY,
      IO_GRACTL: IO_GRACTL,
      IO_HITCLR: IO_HITCLR,
      IO_CONSOL: IO_CONSOL,
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
      IO_SKREST_RANDOM: IO_SKREST_RANDOM,
      IO_POTGO: IO_POTGO,
      IO_SEROUT_SERIN: IO_SEROUT_SERIN,
      IO_IRQEN_IRQST: IO_IRQEN_IRQST,
      IO_SKCTL_SKSTAT: IO_SKCTL_SKSTAT,
      IRQ_TIMER_1: IRQ_TIMER_1,
      IRQ_TIMER_2: IRQ_TIMER_2,
      IRQ_TIMER_4: IRQ_TIMER_4,
      IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE: IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE,
      IRQ_SERIAL_OUTPUT_DATA_NEEDED: IRQ_SERIAL_OUTPUT_DATA_NEEDED,
      IRQ_SERIAL_INPUT_DATA_READY: IRQ_SERIAL_INPUT_DATA_READY,
      IRQ_OTHER_KEY_PRESSED: IRQ_OTHER_KEY_PRESSED,
      IRQ_BREAK_KEY_PRESSED: IRQ_BREAK_KEY_PRESSED,
      IO_DMACTL: IO_DMACTL,
      IO_CHACTL: IO_CHACTL,
      IO_DLISTL: IO_DLISTL,
      IO_DLISTH: IO_DLISTH,
      IO_HSCROL: IO_HSCROL,
      IO_VSCROL: IO_VSCROL,
      IO_PMBASE: IO_PMBASE,
      IO_CHBASE: IO_CHBASE,
      IO_WSYNC: IO_WSYNC,
      IO_VCOUNT: IO_VCOUNT,
      IO_PENH: IO_PENH,
      IO_PENV: IO_PENV,
      IO_NMIEN: IO_NMIEN,
      IO_NMIRES_NMIST: IO_NMIRES_NMIST,
      VIEW_W: VIEW_W,
      VIEW_H: VIEW_H,
      VIEW_X: VIEW_X,
      VIEW_Y: VIEW_Y,
      PRIO_BKG: PRIO_BKG,
      PRIO_PF0: PRIO_PF0,
      PRIO_PF1: PRIO_PF1,
      PRIO_PF2: PRIO_PF2,
      PRIO_PF3: PRIO_PF3,
      PRIO_PM0: PRIO_PM0,
      PRIO_PM1: PRIO_PM1,
      PRIO_PM2: PRIO_PM2,
      PRIO_PM3: PRIO_PM3,
      PRIORITY_TABLE_BKG_PF012: PRIORITY_TABLE_BKG_PF012,
      PRIORITY_TABLE_BKG_PF013: PRIORITY_TABLE_BKG_PF013,
      PRIORITY_TABLE_PF0123: PRIORITY_TABLE_PF0123,
      SCRATCH_GTIA_COLOR_TABLE: SCRATCH_GTIA_COLOR_TABLE,
      SCRATCH_COLOR_TABLE_A: SCRATCH_COLOR_TABLE_A,
      SCRATCH_COLOR_TABLE_B: SCRATCH_COLOR_TABLE_B,
      SCRATCH_BACKGROUND_TABLE: SCRATCH_BACKGROUND_TABLE,
      ANTIC_MODE_INFO: ANTIC_MODE_INFO,
      IO_INIT_VALUES: IO_INIT_VALUES,
    };

    return api;
  }

  window.A8EHw = {
    createApi: createApi,
  };
})();
