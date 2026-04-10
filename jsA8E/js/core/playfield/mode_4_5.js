(function () {
  "use strict";

  function createApi(cfg) {
    const Util = cfg.Util;

    const IO_CHACTL = cfg.IO_CHACTL;
    const IO_CHBASE = cfg.IO_CHBASE;
    const IO_COLBK = cfg.IO_COLBK;
    const IO_COLPF0 = cfg.IO_COLPF0;
    const IO_COLPF1 = cfg.IO_COLPF1;
    const IO_COLPF3 = cfg.IO_COLPF3;

    const SCRATCH_COLOR_TABLE_A = cfg.SCRATCH_COLOR_TABLE_A;
    const SCRATCH_COLOR_TABLE_B = cfg.SCRATCH_COLOR_TABLE_B;

    const fillBkgPf012ColorTable = cfg.fillBkgPf012ColorTable;
    const PRIORITY_TABLE_BKG_PF012 = cfg.PRIORITY_TABLE_BKG_PF012;
    const PRIORITY_TABLE_BKG_PF013 = cfg.PRIORITY_TABLE_BKG_PF013;

    const clockAction = cfg.clockAction;
    const currentCharacterBaseRegister =
      cfg.currentCharacterBaseRegister ||
      function (io, sram) {
        return sram[IO_CHBASE] & 0xff;
      };
    const fetchCharacterRow8 = cfg.fetchCharacterRow8;
    const fetchCharacterRow16 = cfg.fetchCharacterRow16;
    const useDeferredCharacterFetch =
      typeof cfg.fetchUnbufferedDisplayByte === "function";
    const stealDma = cfg.stealDma || function (ctx, cycles) {
      ctx.cycleCounter += cycles | 0;
    };
    const fetchBufferedDisplayByte =
      cfg.fetchBufferedDisplayByte ||
      function (ctx, bufferIndex, address) {
        void bufferIndex;
        if (ctx.ioData.firstRowScanline) stealDma(ctx, 1);
        return ctx.ram[address & 0xffff] & 0xff;
      };
    const fetchUnbufferedDisplayByte =
      cfg.fetchUnbufferedDisplayByte ||
      function (ctx, address) {
        stealDma(ctx, 1);
        return ctx.ram[address & 0xffff] & 0xff;
      };

    function resolveCharacterRow8(row, chactl) {
      const glyphRow = row & 0xff;
      if (glyphRow >= 8) return -1;
      if ((chactl & 0x04) === 0) return glyphRow;
      return 7 - glyphRow;
    }

    function resolveCharacterRow16(row, chactl) {
      const glyphRow = row & 0xff;
      if (glyphRow >= 16) return -1;
      return resolveCharacterRow8(glyphRow >> 1, chactl);
    }

    function writePixelPair(dst, prio, dstIndex, color, priority) {
      dst[dstIndex] = color;
      prio[dstIndex] = priority;
      dst[dstIndex + 1] = color;
      prio[dstIndex + 1] = priority;
      return dstIndex + 2;
    }

    function loadColorTables(sram, table0, table1) {
      fillBkgPf012ColorTable(sram, table0);
      table1[0] = sram[IO_COLBK] & 0xff;
      table1[1] = sram[IO_COLPF0] & 0xff;
      table1[2] = sram[IO_COLPF1] & 0xff;
      table1[3] = sram[IO_COLPF3] & 0xff;
    }

    function drawLineMode45Common(ctx, fetchCharacterRow, vScrollBase, shouldStealDma) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollLine =
        ((vScrollBase - lineDelta) - (io.video.verticalScrollOffset | 0)) & 0xff;

      const aColorTable0 = SCRATCH_COLOR_TABLE_A;
      const aColorTable1 = SCRATCH_COLOR_TABLE_B;
      loadColorTables(sram, aColorTable0, aColorTable1);

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      const chactl = sram[IO_CHACTL] & 0x07;

      let mask = 0x00;
      let data = 0;
      let inverse = false;
      let bufferIndex = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        const chBase = ((currentCharacterBaseRegister(io, sram) << 8) & 0xfc00) & 0xffff;
        if (mask === 0x00) {
          const raw = fetchBufferedDisplayByte(ctx, bufferIndex++, dispAddr, 0);
          inverse = (raw & 0x80) !== 0;
          const ch = raw & 0x7f;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          if (shouldStealDma(vScrollLine) && useDeferredCharacterFetch) {
            const glyphRow =
              fetchCharacterRow === fetchCharacterRow16
                ? resolveCharacterRow16(vScrollLine, chactl)
                : resolveCharacterRow8(vScrollLine, chactl);
            data = glyphRow >= 0
              ? fetchUnbufferedDisplayByte(
                ctx,
                (chBase + ch * 8 + glyphRow) & 0xffff,
                3,
              )
              : 0;
          } else if (shouldStealDma(vScrollLine)) {
            stealDma(ctx, 1);
            data = fetchCharacterRow(ram, chBase, ch, vScrollLine, chactl);
          } else {
            data = fetchCharacterRow(ram, chBase, ch, vScrollLine, chactl);
          }
          mask = 0x02;
        }

        loadColorTables(sram, aColorTable0, aColorTable1);
        const colorTable = inverse ? aColorTable1 : aColorTable0;
        const prioTable = inverse
          ? PRIORITY_TABLE_BKG_PF013
          : PRIORITY_TABLE_BKG_PF012;

        let c = colorTable[(data >> 6) & 0x3] & 0xff;
        let p = prioTable[(data >> 6) & 0x3] & 0xff;
        dstIndex = writePixelPair(dst, prio, dstIndex, c, p);

        data = (data << 2) & 0xff;

        c = colorTable[(data >> 6) & 0x3] & 0xff;
        p = prioTable[(data >> 6) & 0x3] & 0xff;
        dstIndex = writePixelPair(dst, prio, dstIndex, c, p);

        data = (data << 2) & 0xff;
        mask >>= 1;
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode4(ctx) {
      return drawLineMode45Common(ctx, fetchCharacterRow8, 8, function () {
        return true;
      });
    }

    function drawLineMode5(ctx) {
      return drawLineMode45Common(ctx, fetchCharacterRow16, 16, function () {
        return true;
      });
    }

    return { drawLineMode4, drawLineMode5 };
  }

  window.A8EPlayfieldMode45 = { createApi };
})();
