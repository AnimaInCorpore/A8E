(function () {
  "use strict";

  function createApi(cfg) {
    const Util = cfg.Util;

    const IO_COLBK = cfg.IO_COLBK;
    const IO_COLPF0 = cfg.IO_COLPF0;
    const IO_COLPF1 = cfg.IO_COLPF1;
    const IO_COLPF2 = cfg.IO_COLPF2;
    const IO_PRIOR = cfg.IO_PRIOR;

    const PRIO_BKG = cfg.PRIO_BKG;
    const PRIO_PF0 = cfg.PRIO_PF0;
    const PRIO_PF1 = cfg.PRIO_PF1;
    const PRIO_PF2 = cfg.PRIO_PF2;
    const PRIO_PF3 = cfg.PRIO_PF3;
    const PRIO_M10_PM0 = cfg.PRIO_M10_PM0;
    const PRIO_M10_PM1 = cfg.PRIO_M10_PM1;
    const PRIO_M10_PM2 = cfg.PRIO_M10_PM2;
    const PRIO_M10_PM3 = cfg.PRIO_M10_PM3;

    const SCRATCH_GTIA_COLOR_TABLE = cfg.SCRATCH_GTIA_COLOR_TABLE;
    const SCRATCH_COLOR_TABLE_A = cfg.SCRATCH_COLOR_TABLE_A;

    const fillBkgPf012ColorTable = cfg.fillBkgPf012ColorTable;
    const fillGtiaColorTable = cfg.fillGtiaColorTable;
    const PRIORITY_TABLE_BKG_PF012 = cfg.PRIORITY_TABLE_BKG_PF012;
    const M10_PRIORITY_TABLE = new Uint8Array([
      PRIO_M10_PM0,
      PRIO_M10_PM1,
      PRIO_M10_PM2,
      PRIO_M10_PM3,
      PRIO_PF0,
      PRIO_PF1,
      PRIO_PF2,
      PRIO_PF3,
      PRIO_BKG,
      PRIO_BKG,
      PRIO_BKG,
      PRIO_BKG,
      PRIO_PF0,
      PRIO_PF1,
      PRIO_PF2,
      PRIO_PF3,
    ]);

    const clockAction = cfg.clockAction;
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

    function writePixelQuad(dst, prio, dstIndex, color, priority) {
      dst[dstIndex] = color;
      prio[dstIndex] = priority;
      dst[dstIndex + 1] = color;
      prio[dstIndex + 1] = priority;
      dst[dstIndex + 2] = color;
      prio[dstIndex + 2] = priority;
      dst[dstIndex + 3] = color;
      prio[dstIndex + 3] = priority;
      return dstIndex + 4;
    }

    function writePixelPair(dst, prio, dstIndex, color, priority) {
      dst[dstIndex] = color;
      prio[dstIndex] = priority;
      dst[dstIndex + 1] = color;
      prio[dstIndex + 1] = priority;
      return dstIndex + 2;
    }

    function writePixel(dst, prio, dstIndex, color, priority) {
      dst[dstIndex] = color;
      prio[dstIndex] = priority;
      return dstIndex + 1;
    }

    function drawLineMode8Like(ctx, bytesPerLineFactor, initialPhase) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const aColorTable = SCRATCH_COLOR_TABLE_A;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * bytesPerLineFactor;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      let data = 0;
      let phase = initialPhase;
      let bufferIndex = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (phase === initialPhase) {
          data = fetchBufferedDisplayByte(ctx, bufferIndex++, dispAddr, 0);
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          phase = 0;
        }

        fillBkgPf012ColorTable(sram, aColorTable);
        const idx = (data >> (6 - ((phase >> 1) * 2))) & 0x03;
        const c = aColorTable[idx] & 0xff;
        const p = PRIORITY_TABLE_BKG_PF012[idx] & 0xff;
        dstIndex = writePixelQuad(dst, prio, dstIndex, c, p);

        phase++;
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode8(ctx) {
      return drawLineMode8Like(ctx, 8, 8);
    }

    function drawLineMode9(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 8;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      let mask = 0x00;
      let data = 0;
      let bufferIndex = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          data = fetchBufferedDisplayByte(ctx, bufferIndex++, dispAddr, 0);
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          mask = 0x80;
        }

        const c = data & mask ? (sram[IO_COLPF0] & 0xff) : (sram[IO_COLBK] & 0xff);
        const p = data & mask ? PRIO_PF0 : PRIO_BKG;
        dstIndex = writePixelQuad(dst, prio, dstIndex, c, p);
        mask >>= 1;
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineModeA(ctx) {
      return drawLineMode8Like(ctx, 4, 4);
    }

    function drawLineModeB(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 4;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      let mask = 0x00;
      let data = 0;
      let bufferIndex = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          data = fetchBufferedDisplayByte(ctx, bufferIndex++, dispAddr, 0);
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          mask = 0x80;
        }

        let c = data & mask ? (sram[IO_COLPF0] & 0xff) : (sram[IO_COLBK] & 0xff);
        let p = data & mask ? PRIO_PF0 : PRIO_BKG;
        dstIndex = writePixelPair(dst, prio, dstIndex, c, p);
        mask >>= 1;

        c = data & mask ? (sram[IO_COLPF0] & 0xff) : (sram[IO_COLBK] & 0xff);
        p = data & mask ? PRIO_PF0 : PRIO_BKG;
        dstIndex = writePixelPair(dst, prio, dstIndex, c, p);
        mask >>= 1;
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineModeC(ctx) {
      drawLineModeB(ctx);
    }

    function drawLineModeD(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const aColorTable = SCRATCH_COLOR_TABLE_A;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      let phase = 2;
      let data = 0;
      let bufferIndex = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (phase === 2) {
          data = fetchBufferedDisplayByte(ctx, bufferIndex++, dispAddr, 0);
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          phase = 0;
        }

        fillBkgPf012ColorTable(sram, aColorTable);
        let c = aColorTable[(data >> 6) & 0x3] & 0xff;
        let p = PRIORITY_TABLE_BKG_PF012[(data >> 6) & 0x3] & 0xff;
        dstIndex = writePixelPair(dst, prio, dstIndex, c, p);

        data = (data << 2) & 0xff;

        c = aColorTable[(data >> 6) & 0x3] & 0xff;
        p = PRIORITY_TABLE_BKG_PF012[(data >> 6) & 0x3] & 0xff;
        dstIndex = writePixelPair(dst, prio, dstIndex, c, p);

        data = (data << 2) & 0xff;
        phase++;
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineModeE(ctx) {
      drawLineModeD(ctx);
    }

    function drawLineModeF(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      const colorTable = SCRATCH_GTIA_COLOR_TABLE;
      let mask = 0x00;
      let data = 0;
      let bufferIndex = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        const priorMode = (sram[IO_PRIOR] >> 6) & 3;

        if (mask === 0x00) {
          data = fetchBufferedDisplayByte(ctx, bufferIndex++, dispAddr, 0);
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          mask = 0x80;
        }

        if (priorMode === 0) {
          const cColor0 = sram[IO_COLPF2] & 0xff;
          const cColor1 =
            ((sram[IO_COLPF2] & 0xf0) | (sram[IO_COLPF1] & 0x0f)) & 0xff;

          for (let k = 0; k < 4; k++) {
            if (data & mask) {
              dstIndex = writePixel(dst, prio, dstIndex, cColor1, PRIO_PF1);
            } else {
              dstIndex = writePixel(dst, prio, dstIndex, cColor0, PRIO_PF2);
            }
            mask >>= 1;
          }
        } else if (priorMode === 1) {
          const colBk = sram[IO_COLBK] & 0xff;
          if (mask > 0x08) {
            const hi = (colBk | (data >> 4)) & 0xff;
            dstIndex = writePixelQuad(dst, prio, dstIndex, hi, PRIO_BKG);
          } else {
            const lo = (colBk | (data & 0x0f)) & 0xff;
            dstIndex = writePixelQuad(dst, prio, dstIndex, lo, PRIO_BKG);
          }
          mask >>= 4;
        } else if (priorMode === 2) {
          fillGtiaColorTable(sram, colorTable);
          if (mask > 0x08) {
            const hi_i = data >> 4;
            const hi2 = colorTable[hi_i] & 0xff;
            const p2 = M10_PRIORITY_TABLE[hi_i];
            dstIndex = writePixelQuad(dst, prio, dstIndex, hi2, p2);
          } else {
            const lo_i = data & 0x0f;
            const lo2 = colorTable[lo_i] & 0xff;
            const p2 = M10_PRIORITY_TABLE[lo_i];
            dstIndex = writePixelQuad(dst, prio, dstIndex, lo2, p2);
          }
          mask >>= 4;
        } else {
          const colBk = sram[IO_COLBK] & 0xff;
          if (mask > 0x08) {
            const hi3 = data & 0xf0 ? colBk | (data & 0xf0) : colBk & 0xf0;
            dstIndex = writePixelQuad(dst, prio, dstIndex, hi3, PRIO_BKG);
          } else {
            const lo3 = data & 0x0f ? colBk | ((data << 4) & 0xf0) : colBk & 0xf0;
            dstIndex = writePixelQuad(dst, prio, dstIndex, lo3, PRIO_BKG);
          }
          mask >>= 4;
        }

        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    return {
      drawLineMode8,
      drawLineMode9,
      drawLineModeA,
      drawLineModeB,
      drawLineModeC,
      drawLineModeD,
      drawLineModeE,
      drawLineModeF,
    };
  }

  window.A8EPlayfieldMode8F = { createApi };
})();
