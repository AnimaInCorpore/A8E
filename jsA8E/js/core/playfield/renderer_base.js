(function () {
  "use strict";

  function createApi(cfg) {
    const CPU = cfg.CPU;
    const PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;
    const CYCLES_PER_LINE = cfg.CYCLES_PER_LINE;

    const IO_COLBK = cfg.IO_COLBK;
    const IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    const IO_PRIOR = cfg.IO_PRIOR;

    const PRIO_BKG = cfg.PRIO_BKG;

    const ioCycleTimedEvent = cfg.ioCycleTimedEvent;
    const drawPlayerMissilesClock = cfg.drawPlayerMissilesClock;

    const ACTIVE_LINE_HSYNC_PIXELS = 32;
    const ACTIVE_LINE_COLOR_BURST_CYCLES = 6;

    function clockAction(ctx) {
      const io = ctx.ioData;
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
        for (let pixel = 0; pixel < 4; pixel++, x++) {
          if (x >= 0 && x < PIXELS_PER_LINE) {
            const index = dstIndex + x;
            dst[index] = color;
            prio[index] = PRIO_BKG;
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
      fetchCharacterRow8,
      fetchCharacterRow10,
      fetchCharacterRow16,
      drawBackgroundClipped,
      drawInterleavedVisibleBlankLine,
    };
  }

  window.A8EPlayfieldRendererBase = { createApi };
})();
