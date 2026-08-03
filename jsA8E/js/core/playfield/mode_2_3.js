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

    function resolveCharacterRow10(ch, row, chactl) {
      const glyphRow = row & 0xff;
      if (ch < 0x60) return resolveCharacterRow8(glyphRow, chactl);
      if (glyphRow < 2) return -1;
      if (glyphRow < 8) return resolveCharacterRow8(glyphRow, chactl);
      if (glyphRow < 10) return resolveCharacterRow8(glyphRow - 8, chactl);
      return -1;
    }

    function resolveCharacterRowMode2(ch, row, chactl) {
      const glyphRow = row & 0xff;
      if (glyphRow < 8) return resolveCharacterRow8(glyphRow, chactl);
      // AHRM 4.7: mode 2 rows 8-9 blank non-descender characters and show
      // descender rows 0-1, the same way as mode 3.
      if (ch < 0x60) return -1;
      return resolveCharacterRow8(glyphRow - 8, chactl);
    }

    function writeBackgroundQuad(dst, prio, dstIndex, color) {
      dst[dstIndex] = color; prio[dstIndex++] = PRIO_BKG;
      dst[dstIndex] = color; prio[dstIndex++] = PRIO_BKG;
      dst[dstIndex] = color; prio[dstIndex++] = PRIO_BKG;
      dst[dstIndex] = color; prio[dstIndex++] = PRIO_BKG;
      return dstIndex;
    }

    function drawLineMode23Common(ctx, isMode3) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      // AHRM 4.7: the 4-bit mode-line row counter selects the glyph row;
      // rows 10-15 repeat rows 2-7 in both text modes.
      let vScrollOffset = io.modeLineRowCounter & 0x0f;
      if (vScrollOffset >= 10) vScrollOffset -= 8;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      const colorTable = SCRATCH_GTIA_COLOR_TABLE;
      const chactl = sram[IO_CHACTL] & 0x07;

      let mask = 0x00;
      let data = 0;
      let inverse = false;
      let bufferIndex = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        const chBase = ((currentCharacterBaseRegister(io, sram) << 8) & 0xfc00) & 0xffff;
        const priorMode = (sram[IO_PRIOR] >> 6) & 3;

        if (mask === 0x00) {
          const displayByte = fetchBufferedDisplayByte(ctx, bufferIndex++, dispAddr, 0);
          const decoded = decodeTextModeCharacter(displayByte & 0xff, chactl);
          const ch = decoded & 0xff;
          inverse = (decoded & 0x100) !== 0;
          const blank = (decoded & 0x200) !== 0;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          const glyphRow = isMode3
            ? resolveCharacterRow10(ch, vScrollOffset, chactl)
            : resolveCharacterRowMode2(ch, vScrollOffset, chactl);
          if (glyphRow >= 0 && useDeferredCharacterFetch) {
            data = fetchUnbufferedDisplayByte(
              ctx,
              (chBase + ch * 8 + glyphRow) & 0xffff,
              3,
            );
          } else if (glyphRow >= 0) {
            stealDma(ctx, 1);
            data = ram[(chBase + ch * 8 + glyphRow) & 0xffff] & 0xff;
          } else {
            data = 0;
          }
          if (blank) data = 0;
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
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
          mask >>= 1;

          if (outputData & mask) {
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
          mask >>= 1;

          if (outputData & mask) {
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
          mask >>= 1;

          if (outputData & mask) {
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
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
      return drawLineMode23Common(ctx, false);
    }

    function drawLineMode3(ctx) {
      return drawLineMode23Common(ctx, true);
    }

    return { drawLineMode2, drawLineMode3 };
  }

  window.A8EPlayfieldMode23 = { createApi };
})();
