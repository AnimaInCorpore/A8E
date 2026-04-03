(function () {
  "use strict";

  function createApi(cfg) {
    const CPU = cfg.CPU;
    const PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;
    const CYCLES_PER_LINE = cfg.CYCLES_PER_LINE;
    const LINES_PER_SCREEN_PAL = cfg.LINES_PER_SCREEN_PAL;

    const IO_COLBK = cfg.IO_COLBK;
    const IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    const IO_CHBASE = cfg.IO_CHBASE;
    const IO_DMACTL = cfg.IO_DMACTL;
    const IO_HSCROL = cfg.IO_HSCROL;
    const IO_PRIOR = cfg.IO_PRIOR;
    const IO_VCOUNT = cfg.IO_VCOUNT;

    const PRIO_BKG = cfg.PRIO_BKG | 0;
    const PRIO_PM0 = cfg.PRIO_PM0 | 0;
    const PRIO_PM1 = cfg.PRIO_PM1 | 0;
    const PRIO_PM2 = cfg.PRIO_PM2 | 0;
    const PRIO_PM3 = cfg.PRIO_PM3 | 0;
    const PRIO_M10_PM0 = cfg.PRIO_M10_PM0 | 0;
    const PRIO_M10_PM1 = cfg.PRIO_M10_PM1 | 0;
    const PRIO_M10_PM2 = cfg.PRIO_M10_PM2 | 0;
    const PRIO_M10_PM3 = cfg.PRIO_M10_PM3 | 0;
    const PMG_PRIORITY_MASK =
      PRIO_PM0 |
      PRIO_PM1 |
      PRIO_PM2 |
      PRIO_PM3 |
      PRIO_M10_PM0 |
      PRIO_M10_PM1 |
      PRIO_M10_PM2 |
      PRIO_M10_PM3;

    const ioCycleTimedEvent = cfg.ioCycleTimedEvent;
    const drawPlayerMissilesClock = cfg.drawPlayerMissilesClock;
    const fetchPmgDmaCycle = cfg.fetchPmgDmaCycle;

    const ACTIVE_LINE_HSYNC_PIXELS = 32;
    const ACTIVE_LINE_COLOR_BURST_CYCLES = 6;
    const VCOUNT_UPDATE_CYCLE = 111;
    const REFRESH_FIRST_CYCLE = 25;
    const REFRESH_LAST_CYCLE = 57;
    const REFRESH_INTERVAL = 4;
    const DISPLAY_LIST_INSTRUCTION_CYCLE = 1;
    const DISPLAY_LIST_ADDRESS_CYCLE_0 = 6;
    const DISPLAY_LIST_ADDRESS_CYCLE_1 = 7;

    const scanlineState = {
      active: false,
      cycle: 0,
      dmactl: 0,
      hscrol: 0,
      pfWidth: 0,
      pfDma: false,
      mode: 0,
      reset: function() {
        this.active = false;
        this.cycle = 0;
        this.dmactl = 0;
        this.hscrol = 0;
        this.pfWidth = 0;
        this.pfDma = false;
        this.mode = 0;
      }
    };

    function initScanline(ctx, mode, dmactl, hscrol) {
      scanlineState.reset();
      scanlineState.active = true;
      scanlineState.mode = mode;
      scanlineState.dmactl = dmactl;
      scanlineState.hscrol = hscrol;
      scanlineState.pfWidth = dmactl & 0x03;
      scanlineState.pfDma = (dmactl & 0x20) !== 0;
    }

    function ensurePlayfieldLineBuffer(drawLine) {
      let lineBuffer = drawLine.playfieldLineBuffer;
      if (!(lineBuffer instanceof Uint8Array) || lineBuffer.length !== 48) {
        lineBuffer = drawLine.playfieldLineBuffer = new Uint8Array(48);
      }
      return lineBuffer;
    }

    function ensureScheduledPlayfieldDma(drawLine) {
      let scheduled = drawLine.scheduledPlayfieldDma;
      if (!(scheduled instanceof Uint8Array) || scheduled.length !== CYCLES_PER_LINE) {
        scheduled = drawLine.scheduledPlayfieldDma = new Uint8Array(CYCLES_PER_LINE);
      }
      return scheduled;
    }

    function advanceScanlineCycle(ctx) {
      if (!scanlineState.active) return;
      scanlineState.cycle++;

      const sram = ctx.sram;
      const currentDmactl = sram[IO_DMACTL] & 0xff;
      const currentHscrol = sram[IO_HSCROL] & 0x0f;

      if (currentDmactl !== scanlineState.dmactl) {
        scanlineState.dmactl = currentDmactl;
        scanlineState.pfWidth = currentDmactl & 0x03;
        scanlineState.pfDma = (currentDmactl & 0x20) !== 0;
      }

      if (currentHscrol !== scanlineState.hscrol) {
        scanlineState.hscrol = currentHscrol;
      }
    }

    function stealDma(ctx, cycles) {
      const count = cycles | 0;
      if (count <= 0) return;
      ctx.cycleCounter += count;
      const drawLine = ctx.ioData.drawLine;
      drawLine.playfieldDmaStealCount =
        (drawLine.playfieldDmaStealCount | 0) + count;
    }

    function currentLineCycle(ctx, cycleOffset) {
      const io = ctx.ioData;
      return ((io.clock - io.displayListFetchCycle) | 0) + (cycleOffset | 0);
    }

    function playfieldDmaAllowedAtCycle(ctx, cycleOffset) {
      const dmactl = ctx.sram[IO_DMACTL] & 0xff;
      if ((dmactl & 0x20) === 0 || (dmactl & 0x03) === 0) return false;
      return currentLineCycle(ctx, cycleOffset) <= 105;
    }

    function readVirtualPlayfieldBus(ctx, cycleOffset) {
      const lineCycle = currentLineCycle(ctx, cycleOffset);
      if (lineCycle === 106 && (ctx.ioData.drawLine.refreshDmaPending | 0) !== 0) {
        return 0xff;
      }
      const addr = ctx.accessAddress ? (ctx.accessAddress & 0xffff) : (ctx.cpu.pc & 0xffff);
      return ctx.ram[addr] & 0xff;
    }

    function schedulePlayfieldDma(ctx, cycleOffset, cycles) {
      const count = cycles | 0;
      if (count <= 0) return;
      if (!playfieldDmaAllowedAtCycle(ctx, cycleOffset)) return;
      const lineCycle = currentLineCycle(ctx, cycleOffset);
      if (lineCycle < 0 || lineCycle >= CYCLES_PER_LINE) return;
      const scheduled = ensureScheduledPlayfieldDma(ctx.ioData.drawLine);
      scheduled[lineCycle] = Math.min(255, (scheduled[lineCycle] | 0) + count);
    }

    function fetchBufferedDisplayByte(ctx, bufferIndex, address, cycleOffset) {
      const io = ctx.ioData;
      const drawLine = io.drawLine;
      const lineBuffer = ensurePlayfieldLineBuffer(drawLine);
      const index = (bufferIndex | 0) % 48;

      if (io.firstRowScanline) {
        const value = playfieldDmaAllowedAtCycle(ctx, cycleOffset)
          ? (schedulePlayfieldDma(ctx, cycleOffset, 1), ctx.ram[address & 0xffff] & 0xff)
          : readVirtualPlayfieldBus(ctx, cycleOffset);
        lineBuffer[index] = value & 0xff;
      }

      return lineBuffer[index] & 0xff;
    }

    function fetchUnbufferedDisplayByte(ctx, address, cycleOffset) {
      if (playfieldDmaAllowedAtCycle(ctx, cycleOffset)) {
        schedulePlayfieldDma(ctx, cycleOffset, 1);
        return ctx.ram[address & 0xffff] & 0xff;
      }
      return readVirtualPlayfieldBus(ctx, cycleOffset);
    }

    function clockAction(ctx) {
      const io = ctx.ioData;
      const lineStartClock = io.displayListFetchCycle;
      const lineCycle = (io.clock - lineStartClock) | 0;

      advanceScanlineCycle(ctx);

      if (lineCycle >= VCOUNT_UPDATE_CYCLE) {
        const currentLine = io.video.currentDisplayLine | 0;
        const nextLine = (currentLine + 1) % LINES_PER_SCREEN_PAL;
        if (
          currentLine === (LINES_PER_SCREEN_PAL - 1) &&
          lineCycle === VCOUNT_UPDATE_CYCLE
        ) {
          // AHRM 4.10: the final line exposes one extra VCOUNT value for cycle 111 only.
          ctx.ram[IO_VCOUNT] = (LINES_PER_SCREEN_PAL >> 1) & 0xff;
        } else {
          ctx.ram[IO_VCOUNT] = (nextLine >> 1) & 0xff;
        }
      }

      const drawLine = io.drawLine;
      const scheduledPlayfieldDma = ensureScheduledPlayfieldDma(drawLine);
      const playfieldDmaStealCount = scheduledPlayfieldDma[lineCycle] | 0;
      drawLine.playfieldDmaStealCount = playfieldDmaStealCount;

      if (fetchPmgDmaCycle) {
        if (lineCycle === 0 || (lineCycle >= 2 && lineCycle <= 5)) {
          if (fetchPmgDmaCycle(ctx, lineCycle, io.video.currentDisplayLine | 0)) {
            ctx.cycleCounter++;
            // PMG DMA is invisible to playfield DMA steals since it does not delay ANTIC itself,
            // but we delay the CPU by bumping cycleCounter.
          }
        }
      }
      if (playfieldDmaStealCount > 0) {
        ctx.cycleCounter += playfieldDmaStealCount;
      }
      const refreshSlot =
        lineCycle >= REFRESH_FIRST_CYCLE &&
        lineCycle <= REFRESH_LAST_CYCLE &&
        ((lineCycle - REFRESH_FIRST_CYCLE) & (REFRESH_INTERVAL - 1)) === 0;
      let didRefreshDma = false;

      if (
        (drawLine.displayListInstructionDmaPending | 0) !== 0 &&
        lineCycle === DISPLAY_LIST_INSTRUCTION_CYCLE
      ) {
        ctx.cycleCounter++;
        drawLine.displayListInstructionDmaPending = 0;
      }
      if (
        (drawLine.displayListAddressDmaRemaining | 0) > 0 &&
        (lineCycle === DISPLAY_LIST_ADDRESS_CYCLE_0 ||
          lineCycle === DISPLAY_LIST_ADDRESS_CYCLE_1)
      ) {
        ctx.cycleCounter++;
        drawLine.displayListAddressDmaRemaining =
          (drawLine.displayListAddressDmaRemaining | 0) - 1;
      }

      if ((drawLine.refreshDmaPending | 0) !== 0 && playfieldDmaStealCount === 0) {
        ctx.cycleCounter++;
        drawLine.refreshDmaPending = 0;
        didRefreshDma = true;
      }

      if (refreshSlot && !didRefreshDma) {
        if (playfieldDmaStealCount === 0) {
          ctx.cycleCounter++;
        } else if ((drawLine.refreshDmaPending | 0) === 0) {
          // Only one refresh cycle may be deferred; additional blocked refreshes drop.
          drawLine.refreshDmaPending = 1;
        }
      }

      if (
        ctx.ioBeamTimedEventCycle <= io.clock ||
        ctx.ioMasterTimedEventCycle <= ctx.cycleCounter
      ) {
        ioCycleTimedEvent(ctx);
      }
      if (drawPlayerMissilesClock && io.drawLine.playerMissileClockActive) {
        drawPlayerMissilesClock(
          ctx,
          ACTIVE_LINE_HSYNC_PIXELS +
            ((io.clock - io.displayListFetchCycle) * 4),
        );
      }
      if (ctx.cycleCounter < io.clock) CPU.executeOne(ctx);
      io.clock++;
    }

    function stepClockActions(ctx, cycles) {
      for (let i = 0; i < cycles; i++) clockAction(ctx);
    }

    function currentBackgroundPriority(sram) {
      const priorMode = (sram[IO_PRIOR] >> 6) & 3;
      if (priorMode === 2) return PRIO_M10_PM0;
      return PRIO_BKG;
    }

    function currentBackgroundColor(sram) {
      const priorMode = (sram[IO_PRIOR] >> 6) & 3;
      if (priorMode < 2) return sram[IO_COLBK] & 0xff;
      if (priorMode === 2) return sram[IO_COLPM0_TRIG2] & 0xff;
      return sram[IO_COLBK] & 0xf0;
    }

    function ensureChbaseTiming(io) {
      let timing = io.chbaseTiming;
      if (!timing || typeof timing !== "object") {
        timing = io.chbaseTiming = {
          rawValue: 0,
          activeValue: 0,
          pendingValue: 0,
          pendingClock: -1,
          initialized: false,
        };
      }
      return timing;
    }

    function currentCharacterBaseRegister(io, sram) {
      const timing = ensureChbaseTiming(io);
      if (sram) {
        const rawValue = sram[IO_CHBASE] & 0xff;
        if (!timing.initialized) {
          timing.initialized = true;
          timing.rawValue = rawValue;
          timing.activeValue = rawValue;
          timing.pendingValue = rawValue;
          timing.pendingClock = -1;
        } else if (rawValue !== timing.rawValue) {
          timing.rawValue = rawValue;
          timing.pendingValue = rawValue;
          if (timing.pendingClock < 0) {
            timing.pendingClock = (io.clock | 0) + 1;
          }
        }
      }
      if (timing.pendingClock >= 0 && (io.clock | 0) >= timing.pendingClock) {
        timing.activeValue = timing.pendingValue & 0xff;
        timing.pendingClock = -1;
      }
      return timing.activeValue & 0xff;
    }

    function resolveCharacterRow(row, chactl) {
      const glyphRow = row & 0xff;
      if (glyphRow >= 8) return -1;
      if ((chactl & 0x04) === 0) return glyphRow;
      return 7 - glyphRow;
    }

    function fetchCharacterRow8(ram, chBase, ch, row, chactl) {
      const glyphRow = resolveCharacterRow(row, chactl);
      if (glyphRow < 0) return 0;
      return ram[(chBase + ch * 8 + glyphRow) & 0xffff] & 0xff;
    }

    function fetchCharacterRow10(ram, chBase, ch, row, chactl) {
      const glyphRow = row & 0xff;
      if (ch < 0x60) return fetchCharacterRow8(ram, chBase, ch, glyphRow, chactl);
      if (glyphRow < 2) return 0;
      if (glyphRow < 8) return fetchCharacterRow8(ram, chBase, ch, glyphRow, chactl);
      if (glyphRow < 10) return fetchCharacterRow8(ram, chBase, ch, glyphRow - 8, chactl);
      return 0;
    }

    function fetchCharacterRow16(ram, chBase, ch, row, chactl) {
      const glyphRow = row & 0xff;
      if (glyphRow >= 16) return 0;
      return fetchCharacterRow8(ram, chBase, ch, glyphRow >> 1, chactl);
    }

    function drawBackgroundClipped(ctx, dst, prio, dstIndex, startX, cycles) {
      const sram = ctx.sram;
      let x = startX | 0;
      for (let i = 0; i < cycles; i++) {
        const color = currentBackgroundColor(sram);
        const priority = currentBackgroundPriority(sram);
        for (let pixel = 0; pixel < 4; pixel++, x++) {
          if (x >= 0 && x < PIXELS_PER_LINE) {
            const index = dstIndex + x;
            if ((prio[index] & PMG_PRIORITY_MASK) === 0) {
              dst[index] = color;
              prio[index] = priority;
            }
          }
        }
        clockAction(ctx);
      }
    }

    function drawVisibleBlankLine(ctx, dst, prio, dstIndex) {
      stepClockActions(ctx, ACTIVE_LINE_COLOR_BURST_CYCLES);
      drawBackgroundClipped(
        ctx,
        dst,
        prio,
        dstIndex,
        ACTIVE_LINE_HSYNC_PIXELS + ACTIVE_LINE_COLOR_BURST_CYCLES * 4,
        CYCLES_PER_LINE - ACTIVE_LINE_COLOR_BURST_CYCLES,
      );
    }

    function drawInterleavedVisibleBlankLine(ctx, dst, prio, dstIndex) {
      const io = ctx.ioData;
      io.drawLine.playerMissileClockActive = true;
      io.drawLine.playerMissileInterleaved = true;
      try {
        drawVisibleBlankLine(ctx, dst, prio, dstIndex);
      } finally {
        io.drawLine.playerMissileClockActive = false;
      }
    }

    return {
      clockAction,
      stepClockActions,
      currentBackgroundColor,
      currentBackgroundPriority,
      currentCharacterBaseRegister,
      fetchCharacterRow8,
      fetchCharacterRow10,
      fetchCharacterRow16,
      stealDma,
      schedulePlayfieldDma,
      fetchBufferedDisplayByte,
      fetchUnbufferedDisplayByte,
      drawBackgroundClipped,
      drawInterleavedVisibleBlankLine,
      initScanline,
      scanlineState,
    };
  }

  window.A8EPlayfieldRendererBase = { createApi };
})();
