(function () {
  "use strict";

  function createApi(cfg) {
    const CPU = cfg.CPU;
    const Util = cfg.Util;

    const PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;
    const CYCLES_PER_LINE = cfg.CYCLES_PER_LINE;
    const LINES_PER_SCREEN_PAL = cfg.LINES_PER_SCREEN_PAL;
    const CYCLE_NEVER = cfg.CYCLE_NEVER;
    const FIRST_VISIBLE_LINE = cfg.FIRST_VISIBLE_LINE;
    const LAST_VISIBLE_LINE = cfg.LAST_VISIBLE_LINE;

    const NMI_DLI = cfg.NMI_DLI;
    const NMI_VBI = cfg.NMI_VBI;

    const IRQ_TIMER_1 = cfg.IRQ_TIMER_1;
    const IRQ_TIMER_2 = cfg.IRQ_TIMER_2;
    const IRQ_TIMER_4 = cfg.IRQ_TIMER_4;
    const IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE =
      cfg.IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE;
    const IRQ_SERIAL_OUTPUT_DATA_NEEDED = cfg.IRQ_SERIAL_OUTPUT_DATA_NEEDED;
    const IRQ_SERIAL_INPUT_DATA_READY = cfg.IRQ_SERIAL_INPUT_DATA_READY;

    const IO_VCOUNT = cfg.IO_VCOUNT;
    const IO_NMIEN = cfg.IO_NMIEN;
    const IO_NMIRES_NMIST = cfg.IO_NMIRES_NMIST;
    const IO_IRQEN_IRQST = cfg.IO_IRQEN_IRQST;
    const IO_DMACTL = cfg.IO_DMACTL;
    const IO_VSCROL = cfg.IO_VSCROL;
    const IO_CHACTL = cfg.IO_CHACTL;
    const IO_CHBASE = cfg.IO_CHBASE;
    const IO_COLBK = cfg.IO_COLBK;
    const IO_COLPF0 = cfg.IO_COLPF0;
    const IO_COLPF1 = cfg.IO_COLPF1;
    const IO_COLPF2 = cfg.IO_COLPF2;
    const IO_COLPF3 = cfg.IO_COLPF3;
    const IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    const IO_PRIOR = cfg.IO_PRIOR;
    const IO_HSCROL = cfg.IO_HSCROL;

    const ANTIC_MODE_INFO = cfg.ANTIC_MODE_INFO;
    const drawPlayerMissilesClock = cfg.drawPlayerMissilesClock;
    const fetchPmgDmaCycle = cfg.fetchPmgDmaCycle;
    const drawPlayerMissiles = cfg.drawPlayerMissiles;
    const pokeyTimerPeriodCpuCycles = cfg.pokeyTimerPeriodCpuCycles;
    const cycleTimedEventUpdate = cfg.cycleTimedEventUpdate;
    const PRIO_BKG = cfg.PRIO_BKG;
    const PRIO_PF0 = cfg.PRIO_PF0;
    const PRIO_PF1 = cfg.PRIO_PF1;
    const PRIO_PF2 = cfg.PRIO_PF2;
    const PRIO_PF3 = cfg.PRIO_PF3;
    const PRIO_M10_PM0 = cfg.PRIO_M10_PM0;
    const PRIO_M10_PM1 = cfg.PRIO_M10_PM1;
    const PRIO_M10_PM2 = cfg.PRIO_M10_PM2;
    const PRIO_M10_PM3 = cfg.PRIO_M10_PM3;
    const PRIORITY_TABLE_BKG_PF012 = cfg.PRIORITY_TABLE_BKG_PF012;
    const PRIORITY_TABLE_BKG_PF013 = cfg.PRIORITY_TABLE_BKG_PF013;
    const PRIORITY_TABLE_PF0123 = cfg.PRIORITY_TABLE_PF0123;
    const SCRATCH_GTIA_COLOR_TABLE = cfg.SCRATCH_GTIA_COLOR_TABLE;
    const SCRATCH_COLOR_TABLE_A = cfg.SCRATCH_COLOR_TABLE_A;
    const SCRATCH_COLOR_TABLE_B = cfg.SCRATCH_COLOR_TABLE_B;
    const SCRATCH_BACKGROUND_TABLE = cfg.SCRATCH_BACKGROUND_TABLE;
    const fillGtiaColorTable = cfg.fillGtiaColorTable;
    const fillBkgPf012ColorTable = cfg.fillBkgPf012ColorTable;
    const decodeTextModeCharacter = cfg.decodeTextModeCharacter;
    const fillLine = cfg.fillLine;
    const DLI_HORIZONTAL_OFFSET = 7;
    // ANTIC display list command bits
    const ANTIC_DLI_BIT = 0x80;
    const ANTIC_LMS_BIT = 0x40;
    const ANTIC_VSCROL_BITS = 0x70;
    const ANTIC_MODE_BITS = 0x0f;
    const ANTIC_JUMP_INSTRUCTION = 0x01;
    const ANTIC_JVB_INSTRUCTION = 0x41;
    const ANTIC_JVB_DLI_INSTRUCTION = 0xc1;
    const ANTIC_LMS_MIN_INSTRUCTION = 0x42;
    const ANTIC_CMD_MASK_DLI_JMP = 0x4f; // Isolates DLI, LMS, and instruction bits
    const ANTIC_CMD_MASK_JVB_DLI = 0xcf; // Isolates replayed JVB+DLI pattern

    function resetNmiTiming(ctx) {
      const timing = ctx.ioData.nmiTiming;
      const nmien = ctx.sram[IO_NMIEN] & (NMI_DLI | NMI_VBI);
      timing.enabledByCycle7 = nmien;
      timing.enabledByCycle8 = nmien;
      timing.enabledOnCycle7Mask = 0;
      return timing;
    }

    function currentLineNmiState(io, bit) {
      const timing = io.nmiTiming;
      if ((timing.enabledByCycle8 & bit) === 0) {
        return { enabled: false, delayOneCycle: false };
      }
      if ((timing.enabledOnCycle7Mask & bit) !== 0) {
        return { enabled: true, delayOneCycle: true };
      }
      if ((timing.enabledByCycle7 & bit) !== 0) {
        return { enabled: true, delayOneCycle: false };
      }
      return { enabled: false, delayOneCycle: false };
    }

    function resetDrawLineState(drawLine) {
      drawLine.playfieldDmaStealCount = 0;
      drawLine.refreshDmaPending = 0;
      drawLine.displayListInstructionDmaPending = 0;
      drawLine.displayListAddressDmaRemaining = 0;
      drawLine.playerMissileClockActive = false;
      drawLine.playerMissileInterleaved = false;
      drawLine.pmgFirstVisibleSpan = true;
      drawLine.playerPmgShift.fill(0);
      drawLine.playerPmgState.fill(0);
      drawLine.missilePmgShift.fill(0);
      drawLine.missilePmgState.fill(0);
      drawLine.scheduledPlayfieldDma.fill(0);
    }

    const playfieldApi =
      window.A8EPlayfield && window.A8EPlayfield.createApi
        ? window.A8EPlayfield.createApi({
            CPU: CPU,
            Util: Util,
            PIXELS_PER_LINE: PIXELS_PER_LINE,
            CYCLES_PER_LINE: CYCLES_PER_LINE,
            LINES_PER_SCREEN_PAL: LINES_PER_SCREEN_PAL,
            FIRST_VISIBLE_LINE: FIRST_VISIBLE_LINE,
            LAST_VISIBLE_LINE: LAST_VISIBLE_LINE,
            IO_VCOUNT: IO_VCOUNT,
            IO_VSCROL: IO_VSCROL,
            IO_CHACTL: IO_CHACTL,
            IO_CHBASE: IO_CHBASE,
            IO_COLBK: IO_COLBK,
            IO_COLPF0: IO_COLPF0,
            IO_COLPF1: IO_COLPF1,
            IO_COLPF2: IO_COLPF2,
            IO_COLPF3: IO_COLPF3,
            IO_COLPM0_TRIG2: IO_COLPM0_TRIG2,
            IO_DMACTL: IO_DMACTL,
            IO_HSCROL: IO_HSCROL,
            IO_PRIOR: IO_PRIOR,
            ANTIC_MODE_INFO: ANTIC_MODE_INFO,
            PRIO_BKG: PRIO_BKG,
            PRIO_PF0: PRIO_PF0,
            PRIO_PF1: PRIO_PF1,
            PRIO_PF2: PRIO_PF2,
            PRIO_PF3: PRIO_PF3,
            PRIO_M10_PM0: PRIO_M10_PM0,
            PRIO_M10_PM1: PRIO_M10_PM1,
            PRIO_M10_PM2: PRIO_M10_PM2,
            PRIO_M10_PM3: PRIO_M10_PM3,
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
            drawPlayerMissilesClock: drawPlayerMissilesClock,
            fetchPmgDmaCycle: fetchPmgDmaCycle,
            ioCycleTimedEvent: function (c) {
              ioCycleTimedEvent(c);
            },
            })
            : null;    if (!playfieldApi) throw new Error("A8EPlayfield is not loaded");
    const drawLine = playfieldApi.drawLine;

    function fetchLine(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      if (io.video.currentDisplayLine === LAST_VISIBLE_LINE + 1)
        {io.nextDisplayListLine = 8;}

      // Playfield DMA active?
      if (sram[IO_DMACTL] & 0x20) {
        if (io.video.currentDisplayLine === io.nextDisplayListLine) {
          io.drawLine.displayListInstructionDmaPending = 1;
          const oldCmd = io.currentDisplayListCommand & 0xff;
          io.currentDisplayListCommand =
            ram[io.displayListAddress & 0xffff] & 0xff;
          io.displayListAddress = Util.fixedAdd(
            io.displayListAddress,
            0x03ff,
            1,
          );

          const cmd = io.currentDisplayListCommand;

          // LMS (bit 6) or JUMP (instruction 01) schedule 2 more DMA steals
          // for the address on cycles 6 and 7 (AHRM 4.14).
          if ((cmd & ANTIC_LMS_BIT) || (cmd & ANTIC_MODE_BITS) === ANTIC_JUMP_INSTRUCTION) {
            io.drawLine.displayListAddressDmaRemaining = 2;
          }
          const mode = cmd & ANTIC_MODE_BITS;

          // Mode-line row counter setup (AHRM 4.7).  The 4-bit delta
          // counter starts at 0, or at VSCROL when this mode line enters
          // a vertically scrolled region.  It normally runs to the static
          // end row; the first line after a scrolled region instead ends
          // when the counter matches the live VSCROL value.
          let startRow = 0;
          let endRow;
          let scrollExit = false;

          if (mode <= 0x01) {
            endRow = (cmd & ANTIC_VSCROL_BITS) >> 4;
          } else {
            endRow = (ANTIC_MODE_INFO[mode].lines - 1) & 0x0f;
          }

          if ((oldCmd & 0x2f) < 0x22 && (cmd & 0x2f) >= 0x22) {
            // Region entry: the counter starts at VSCROL (deadline cycle
            // 0).  Values above the natural end row wrap the 4-bit counter
            // and extend the mode line (GTIA 9++).
            startRow = sram[IO_VSCROL] & 0x0f;
          } else if ((oldCmd & 0x2f) >= 0x22 && (cmd & 0x2f) < 0x22) {
            // Region exit: this line ends when the counter matches the
            // live VSCROL value instead of the static end row.
            scrollExit = true;
          }

          io.modeLineRowCounter = startRow;
          io.modeLineEndRow = endRow;
          io.modeLineScrollExit = scrollExit;
          io.modeLineExitDli =
            scrollExit &&
            (cmd & ANTIC_DLI_BIT) !== 0 &&
            (cmd & ANTIC_CMD_MASK_DLI_JMP) !== ANTIC_JVB_INSTRUCTION;
          io.modeLineEndsThisLine = false;

          const modeLineRows = scrollExit
            ? (((sram[IO_VSCROL] & 0x0f) - startRow) & 0x0f) + 1
            : ((endRow - startRow) & 0x0f) + 1;
          io.nextDisplayListLine = io.video.currentDisplayLine + modeLineRows;

          // DLI scheduling.  Exit lines are armed dynamically at cycle 6
          // of the scanline whose row counter matches VSCROL (AHRM 4.8:
          // VSCROL writes affect the DLI only through cycle 5).
          if (cmd & ANTIC_DLI_BIT) {
            if ((cmd & ANTIC_CMD_MASK_DLI_JMP) === ANTIC_JVB_INSTRUCTION) {
              // Replayed JVB has one-scanline height.
              io.dliCycle = io.clock + DLI_HORIZONTAL_OFFSET;
              cycleTimedEventUpdate(ctx);
            } else if (!scrollExit) {
              io.dliCycle =
                io.clock +
                (io.nextDisplayListLine - io.video.currentDisplayLine - 1) *
                  CYCLES_PER_LINE +
                DLI_HORIZONTAL_OFFSET;
              cycleTimedEventUpdate(ctx);
            }
          }

          // JMP
          if ((cmd & ANTIC_MODE_BITS) === ANTIC_JUMP_INSTRUCTION) {
            io.displayListAddress =
              ram[io.displayListAddress & 0xffff] |
              (ram[(io.displayListAddress + 1) & 0xffff] << 8);
          }

          // Wait for VBL (JVB)
          if ((cmd & ANTIC_CMD_MASK_DLI_JMP) === ANTIC_JVB_INSTRUCTION) io.nextDisplayListLine = 8;

          // Load memory scan (LMS)
          if ((cmd & ANTIC_CMD_MASK_DLI_JMP) >= ANTIC_LMS_MIN_INSTRUCTION) {
            io.displayMemoryAddress =
              ram[io.displayListAddress & 0xffff] & 0xff;
            io.displayListAddress = Util.fixedAdd(
              io.displayListAddress,
              0x03ff,
              1,
            );
            io.displayMemoryAddress |=
              (ram[io.displayListAddress & 0xffff] & 0xff) << 8;
            io.displayListAddress = Util.fixedAdd(
              io.displayListAddress,
              0x03ff,
              1,
            );
          }

          if (mode > 0x01) {
            io.rowDisplayMemoryAddress = io.displayMemoryAddress & 0xffff;
            io.firstRowScanline = true;
          }
        }
      }
    }

    // Called after each drawn scanline: advance the 4-bit mode-line row
    // counter and decide whether the next scanline fetches a new display
    // list command (AHRM 4.7).  Exit lines use the VSCROL comparison
    // latched at cycle 108.
    function evaluateModeLineEnd(ctx) {
      const io = ctx.ioData;
      const sram = ctx.sram;
      const currentLine = io.video.currentDisplayLine | 0;

      if ((sram[IO_DMACTL] & 0x20) === 0) return;
      if (currentLine < FIRST_VISIBLE_LINE || currentLine > LAST_VISIBLE_LINE)
        {return;}
      // Only evaluate while a fetched mode line is in progress.
      if (io.nextDisplayListLine <= currentLine) return;
      // JVB waits for vertical blank regardless of its height.
      if (
        (io.currentDisplayListCommand & ANTIC_CMD_MASK_DLI_JMP) ===
        ANTIC_JVB_INSTRUCTION
      )
        {return;}

      const ended = io.modeLineScrollExit
        ? io.modeLineEndsThisLine
        : (io.modeLineRowCounter & 0x0f) === (io.modeLineEndRow & 0x0f);

      if (ended) {
        io.nextDisplayListLine = currentLine + 1;
      } else {
        io.modeLineRowCounter = (io.modeLineRowCounter + 1) & 0x0f;
        if (io.nextDisplayListLine === currentLine + 1) {
          io.nextDisplayListLine = currentLine + 2;
        }
      }
    }

    function advanceScanline(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;

      io.video.currentDisplayLine++;

      if (io.video.currentDisplayLine === LAST_VISIBLE_LINE + 1) {
        io.dliCycle = CYCLE_NEVER;
        // NMIST DLI is cleared at start of VBL.
        ram[IO_NMIRES_NMIST] &= ~NMI_DLI;
      }

      if (io.video.currentDisplayLine >= LINES_PER_SCREEN_PAL) {
        io.video.currentDisplayLine = 0;
        io.nextDisplayListLine = 8;
        io.currentDisplayListCommand = 0;
        io.modeLineRowCounter = 0;
        io.modeLineEndRow = 0;
        io.modeLineScrollExit = false;
        io.modeLineExitDli = false;
        io.modeLineEndsThisLine = false;
        io.videoOut.priority.fill(0);
      }

      ram[IO_VCOUNT] = (io.video.currentDisplayLine >> 1) & 0xff;

      // Replayed JVB+DLI ($C1) issues one DLI per scanline until VBL.
      if (
        (io.currentDisplayListCommand & ANTIC_CMD_MASK_JVB_DLI) === ANTIC_JVB_DLI_INSTRUCTION &&
        io.video.currentDisplayLine >= FIRST_VISIBLE_LINE &&
        io.video.currentDisplayLine <= LAST_VISIBLE_LINE
      ) {
        io.dliCycle = io.displayListFetchCycle + DLI_HORIZONTAL_OFFSET;
      }

      if (io.video.currentDisplayLine === LAST_VISIBLE_LINE + 1) {
        // VBI NMIST latches at cycle 7 of scan line 248; the NMI itself
        // fires at cycle 8, gated by the same NMIEN deadlines as the DLI
        // (AHRM 4.8). io.displayListFetchCycle already points at line 248.
        io.vbiCycle = io.displayListFetchCycle + DLI_HORIZONTAL_OFFSET;
      }
    }

    function ioCycleTimedEvent(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      if (!io.inDrawLine && ctx.cycleCounter >= io.displayListFetchCycle) {
        if (io.video.currentDisplayLine === 0) {
          io.clock = io.displayListFetchCycle;
        }
        resetDrawLineState(io.drawLine);
        resetNmiTiming(ctx);
        fetchLine(ctx);
        io.inDrawLine = true;
        cycleTimedEventUpdate(ctx);

        try {
          drawLine(ctx);
          if (!io.drawLine.playerMissileInterleaved) drawPlayerMissiles(ctx);
          evaluateModeLineEnd(ctx);
          io.displayListFetchCycle += CYCLES_PER_LINE;
          advanceScanline(ctx);
        } finally {
          io.inDrawLine = false;
        }
      }

      const masterEff = ctx.cycleCounter;
      const beamEff = io.clock;

      if (beamEff >= io.dliCycle) {
        // NMIST is set at cycle 7 unconditionally (AHRM 4.8)
        ram[IO_NMIRES_NMIST] &= ~NMI_VBI;
        ram[IO_NMIRES_NMIST] |= NMI_DLI;

        if (beamEff > io.dliCycle) {
          // NMI fires at cycle 8 (one cycle after NMIST at cycle 7)
          const dliTiming = currentLineNmiState(io, NMI_DLI);
          if (dliTiming.enabled) {
            if (dliTiming.delayOneCycle && beamEff === io.dliCycle + 1) {
              io.nmiTiming.enabledOnCycle7Mask &= ~NMI_DLI;
              io.dliCycle = beamEff; // reschedule: NMI fires at beamEff+1
            } else {
              CPU.nmi(ctx);
              io.dliCycle = CYCLE_NEVER;
            }
          } else {
            io.dliCycle = CYCLE_NEVER;
          }
        }
      }

      if (beamEff >= io.vbiCycle) {
        // NMIST is set at cycle 7 unconditionally (AHRM 4.8)
        ram[IO_NMIRES_NMIST] &= ~NMI_DLI;
        ram[IO_NMIRES_NMIST] |= NMI_VBI;

        if (beamEff > io.vbiCycle) {
          // NMI fires at cycle 8 (one cycle after NMIST at cycle 7)
          const vbiTiming = currentLineNmiState(io, NMI_VBI);
          if (vbiTiming.enabled) {
            if (vbiTiming.delayOneCycle && beamEff === io.vbiCycle + 1) {
              io.nmiTiming.enabledOnCycle7Mask &= ~NMI_VBI;
              io.vbiCycle = beamEff; // reschedule: NMI fires at beamEff+1
            } else {
              CPU.nmi(ctx);
              io.vbiCycle = CYCLE_NEVER;
            }
          } else {
            io.vbiCycle = CYCLE_NEVER;
          }
        }
      }

      if (masterEff >= io.serialOutputTransmissionDoneCycle) {
        ram[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE;
        if (sram[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE)
          {CPU.irq(ctx);}
        io.serialOutputTransmissionDoneCycle = CYCLE_NEVER;
      }

      if (masterEff >= io.serialOutputNeedDataCycle) {
        ram[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_OUTPUT_DATA_NEEDED;
        if (sram[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_DATA_NEEDED) CPU.irq(ctx);
        io.serialOutputNeedDataCycle = CYCLE_NEVER;
      }

      if (masterEff >= io.serialInputDataReadyCycle) {
        ram[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_INPUT_DATA_READY;
        if (sram[IO_IRQEN_IRQST] & IRQ_SERIAL_INPUT_DATA_READY) CPU.irq(ctx);
        io.serialInputDataReadyCycle = CYCLE_NEVER;
      }

      if (masterEff >= io.timer1Cycle) {
        const p1 = pokeyTimerPeriodCpuCycles(ctx, 1);
        ram[IO_IRQEN_IRQST] &= ~IRQ_TIMER_1;
        if (sram[IO_IRQEN_IRQST] & IRQ_TIMER_1) CPU.irq(ctx);
        if (p1 === 0) io.timer1Cycle = CYCLE_NEVER;
        else {
          while (io.timer1Cycle <= masterEff) io.timer1Cycle += p1;
        }
      }

      if (masterEff >= io.timer2Cycle) {
        const p2 = pokeyTimerPeriodCpuCycles(ctx, 2);
        ram[IO_IRQEN_IRQST] &= ~IRQ_TIMER_2;
        if (sram[IO_IRQEN_IRQST] & IRQ_TIMER_2) CPU.irq(ctx);
        if (p2 === 0) io.timer2Cycle = CYCLE_NEVER;
        else {
          while (io.timer2Cycle <= masterEff) io.timer2Cycle += p2;
        }
      }

      if (masterEff >= io.timer4Cycle) {
        const p4 = pokeyTimerPeriodCpuCycles(ctx, 4);
        ram[IO_IRQEN_IRQST] &= ~IRQ_TIMER_4;
        if (sram[IO_IRQEN_IRQST] & IRQ_TIMER_4) CPU.irq(ctx);
        if (p4 === 0) io.timer4Cycle = CYCLE_NEVER;
        else {
          while (io.timer4Cycle <= masterEff) io.timer4Cycle += p4;
        }
      }

      cycleTimedEventUpdate(ctx);
    }

    return {
      fetchLine: fetchLine,
      ioCycleTimedEvent: ioCycleTimedEvent,
    };
  }

  window.A8EAntic = {
    createApi: createApi,
  };
})();
