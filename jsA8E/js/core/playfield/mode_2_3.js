(function () {
  "use strict";

  function createApi(cfg) {
    const Util = cfg.Util;

    const IO_CHACTL = cfg.IO_CHACTL;
    const IO_CHBASE = cfg.IO_CHBASE;
    const IO_COLBK = cfg.IO_COLBK;
    const IO_COLPF1 = cfg.IO_COLPF1;
    const IO_COLPF2 = cfg.IO_COLPF2;
    const IO_PRIOR = cfg.IO_PRIOR;

    const PRIO_BKG = cfg.PRIO_BKG;
    const PRIO_PF1 = cfg.PRIO_PF1;
    const PRIO_PF2 = cfg.PRIO_PF2;

    const SCRATCH_GTIA_COLOR_TABLE = cfg.SCRATCH_GTIA_COLOR_TABLE;

    const fillGtiaColorTable = cfg.fillGtiaColorTable;
    const decodeTextModeCharacter = cfg.decodeTextModeCharacter;
    const currentCharacterBaseRegister =
      cfg.currentCharacterBaseRegister ||
      function (io, sram) {
        return sram[IO_CHBASE] & 0xff;
      };
    const clockAction = cfg.clockAction;
    const fetchCharacterRow8 = cfg.fetchCharacterRow8;
    const fetchCharacterRow10 = cfg.fetchCharacterRow10;
    const stealDma = cfg.stealDma || function (ctx, cycles) {
      ctx.cycleCounter += cycles | 0;
    };

    function writeBackgroundQuad(dst, prio, dstIndex, color) {
      dst[dstIndex] = color; prio[dstIndex++] = PRIO_BKG;
      dst[dstIndex] = color; prio[dstIndex++] = PRIO_BKG;
      dst[dstIndex] = color; prio[dstIndex++] = PRIO_BKG;
      dst[dstIndex] = color; prio[dstIndex++] = PRIO_BKG;
      return dstIndex;
    }

    function writePixelPair(dst, prio, dstIndex, color, priority) {
      dst[dstIndex] = color;
      prio[dstIndex] = priority;
      dst[dstIndex + 1] = color;
      prio[dstIndex + 1] = priority;
      return dstIndex + 2;
    }

    function drawLineMode23Common(ctx, fetchCharacterRow, vScrollBase) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollOffset =
        ((vScrollBase - lineDelta) - (io.video.verticalScrollOffset | 0)) & 0xff;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      const colorTable = SCRATCH_GTIA_COLOR_TABLE;

      let mask = 0x00;
      let data = 0;
      let inverse = false;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        const chBase = ((currentCharacterBaseRegister(io, sram) << 8) & 0xfc00) & 0xffff;
        const priorMode = (sram[IO_PRIOR] >> 6) & 3;
        const chactl = sram[IO_CHACTL] & 0x07;

        if (mask === 0x00) {
          const decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
          const ch = decoded & 0xff;
          inverse = (decoded & 0x100) !== 0;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          stealDma(ctx, 1);

          if (io.firstRowScanline) {
            stealDma(ctx, 1);
          }

          data = fetchCharacterRow(ram, chBase, ch, vScrollOffset, chactl);
          mask = 0x80;
        }

        const outputData = priorMode !== 0 && inverse ? (data ^ 0xff) : data;

        if (priorMode === 0) {
          const colPf1 = sram[IO_COLPF1] & 0xff;
          const colPf2 = sram[IO_COLPF2] & 0xff;
          const colorA = colPf2 & 0xff;
          const colorB = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;
          const c0 = inverse ? colorB : colorA;
          const c1 = inverse ? colorA : colorB;
          const p0 = inverse ? PRIO_PF1 : PRIO_PF2;
          const p1 = inverse ? PRIO_PF2 : PRIO_PF1;

          if (outputData & mask) {
            dstIndex = writePixelPair(dst, prio, dstIndex, c1, p1);
          } else {
            dstIndex = writePixelPair(dst, prio, dstIndex, c0, p0);
          }
          mask >>= 1;

          if (outputData & mask) {
            dstIndex = writePixelPair(dst, prio, dstIndex, c1, p1);
          } else {
            dstIndex = writePixelPair(dst, prio, dstIndex, c0, p0);
          }
          mask >>= 1;

          if (outputData & mask) {
            dstIndex = writePixelPair(dst, prio, dstIndex, c1, p1);
          } else {
            dstIndex = writePixelPair(dst, prio, dstIndex, c0, p0);
          }
          mask >>= 1;

          if (outputData & mask) {
            dstIndex = writePixelPair(dst, prio, dstIndex, c1, p1);
          } else {
            dstIndex = writePixelPair(dst, prio, dstIndex, c0, p0);
          }
          mask >>= 1;
        } else if (priorMode === 1) {
          const colBk = sram[IO_COLBK] & 0xff;
          if (mask > 0x08) {
            const hi = (colBk | (outputData >> 4)) & 0xff;
            dstIndex = writeBackgroundQuad(dst, prio, dstIndex, hi);
          } else {
            const lo = (colBk | (outputData & 0x0f)) & 0xff;
            dstIndex = writeBackgroundQuad(dst, prio, dstIndex, lo);
          }
          mask >>= 4;
        } else if (priorMode === 2) {
          fillGtiaColorTable(sram, colorTable);
          if (mask > 0x08) {
            const hi2 = colorTable[outputData >> 4] & 0xff;
            dstIndex = writeBackgroundQuad(dst, prio, dstIndex, hi2);
          } else {
            const lo2 = colorTable[outputData & 0x0f] & 0xff;
            dstIndex = writeBackgroundQuad(dst, prio, dstIndex, lo2);
          }
          mask >>= 4;
        } else {
          const colBk = sram[IO_COLBK] & 0xff;
          if (mask > 0x08) {
            const hi3 = outputData & 0xf0
              ? colBk | (outputData & 0xf0)
              : colBk & 0xf0;
            dstIndex = writeBackgroundQuad(dst, prio, dstIndex, hi3);
          } else {
            const lo3 = outputData & 0x0f
              ? colBk | ((outputData << 4) & 0xf0)
              : colBk & 0xf0;
            dstIndex = writeBackgroundQuad(dst, prio, dstIndex, lo3);
          }
          mask >>= 4;
        }
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode2(ctx) {
      return drawLineMode23Common(ctx, fetchCharacterRow8, 8);
    }

    function drawLineMode3(ctx) {
      return drawLineMode23Common(ctx, fetchCharacterRow10, 10);
    }

    return { drawLineMode2, drawLineMode3 };
  }

  window.A8EPlayfieldMode23 = { createApi };
})();
