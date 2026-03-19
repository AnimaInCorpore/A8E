(function () {
  "use strict";

  function createApi(cfg) {
    const CPU = cfg.CPU;
    const PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;
    const CYCLES_PER_LINE = cfg.CYCLES_PER_LINE;
    const LINES_PER_SCREEN_PAL = cfg.LINES_PER_SCREEN_PAL;

    const IO_COLBK = cfg.IO_COLBK;
    const IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    const IO_DMACTL = cfg.IO_DMACTL;
    const IO_HSCROL = cfg.IO_HSCROL;
    const IO_PRIOR = cfg.IO_PRIOR;
    const IO_VCOUNT = cfg.IO_VCOUNT;

    const PRIO_BKG = cfg.PRIO_BKG;
    const PRIO_M10_PM0 = cfg.PRIO_M10_PM0;

    const ioCycleTimedEvent = cfg.ioCycleTimedEvent;
    const drawPlayerMissilesClock = cfg.drawPlayerMissilesClock;
    const fetchPmgDmaCycle = cfg.fetchPmgDmaCycle;

    const ACTIVE_LINE_HSYNC_PIXELS = 32;
    const ACTIVE_LINE_COLOR_BURST_CYCLES = 6;
    const VCOUNT_UPDATE_CYCLE = 100;
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

    function clockAction(ctx) {
      const io = ctx.ioData;
      const lineStartClock = io.displayListFetchCycle;
      const lineCycle = (io.clock - lineStartClock) | 0;

      advanceScanlineCycle(ctx);

      if (io.clock >= lineStartClock + VCOUNT_UPDATE_CYCLE) {
        const nextLine =
          (io.video.currentDisplayLine + 1) % LINES_PER_SCREEN_PAL;
        ctx.ram[IO_VCOUNT] = (nextLine >> 1) & 0xff;
      }

      const drawLine = io.drawLine;

      if (fetchPmgDmaCycle) {
        if (lineCycle === 0 || (lineCycle >= 2 && lineCycle <= 5)) {
          if (fetchPmgDmaCycle(ctx, lineCycle, io.video.currentDisplayLine | 0)) {
            ctx.cycleCounter++;
            // PMG DMA is invisible to playfield DMA steals since it does not delay ANTIC itself,
            // but we delay the CPU by bumping cycleCounter.
          }
        }
      }
      const playfieldDmaStealCount = drawLine.playfieldDmaStealCount | 0;
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

      drawLine.playfieldDmaStealCount = 0;

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

    function fetchCharacterRow8(ram, chBase, ch, row) {
      const glyphRow = row & 0xff;
      if (glyphRow >= 8) return 0;
      return ram[(chBase + ch * 8 + glyphRow) & 0xffff] & 0xff;
    }

    function fetchCharacterRow10(ram, chBase, ch, row) {
      const glyphRow = row & 0xff;
      if (ch < 0x60) return fetchCharacterRow8(ram, chBase, ch, glyphRow);
      if (glyphRow < 2) return 0;
      if (glyphRow < 8) return ram[(chBase + ch * 8 + glyphRow) & 0xffff] & 0xff;
      if (glyphRow < 10) return ram[(chBase + ch * 8 + (glyphRow - 8)) & 0xffff] & 0xff;
      return 0;
    }

    function fetchCharacterRow16(ram, chBase, ch, row) {
      const glyphRow = row & 0xff;
      if (glyphRow >= 16) return 0;
      return ram[(chBase + ch * 8 + (glyphRow >> 1)) & 0xffff] & 0xff;
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
            dst[index] = color;
            prio[index] = priority;
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
      fetchCharacterRow8,
      fetchCharacterRow10,
      fetchCharacterRow16,
      stealDma,
      drawBackgroundClipped,
      drawInterleavedVisibleBlankLine,
      initScanline,
      scanlineState,
    };
  }

  window.A8EPlayfieldRendererBase = { createApi };
})();
