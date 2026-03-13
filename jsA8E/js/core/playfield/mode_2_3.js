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

    const clockAction = cfg.clockAction;
    const fetchCharacterRow8 = cfg.fetchCharacterRow8;
    const fetchCharacterRow10 = cfg.fetchCharacterRow10;

    function drawLineMode2(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollOffset = ((8 - lineDelta) - (io.video.verticalScrollOffset | 0)) & 0xff;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      const colorTable = SCRATCH_GTIA_COLOR_TABLE;

      const chBase = (sram[IO_CHBASE] << 8) & 0xfc00 & 0xffff;

      let mask = 0x00;
      let data = 0;
      let inverse = false;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        const priorMode = (sram[IO_PRIOR] >> 6) & 3;

        if (mask === 0x00) {
          const chactl = sram[IO_CHACTL] & 0x03;
          const decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
          const ch = decoded & 0xff;
          inverse = (decoded & 0x100) !== 0;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          ctx.cycleCounter++;

          if (io.firstRowScanline) {
            ctx.cycleCounter++;
          }

          data = fetchCharacterRow8(ram, chBase, ch, vScrollOffset);
          mask = 0x80;
        }

        const outputData = priorMode !== 0 && inverse ? (data ^ 0xff) : data;

        fillGtiaColorTable(sram, colorTable);
        const colPf1 = sram[IO_COLPF1] & 0xff;
        const colPf2 = sram[IO_COLPF2] & 0xff;
        const colBk = sram[IO_COLBK] & 0xff;
        const c0Inverse = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;
        const c1Inverse = colPf2 & 0xff;
        const c0Normal = colPf2 & 0xff;
        const c1Normal = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;

        if (priorMode === 0) {
          const c0 = inverse ? c0Inverse : c0Normal;
          const c1 = inverse ? c1Inverse : c1Normal;
          const p0 = inverse ? PRIO_PF1 : PRIO_PF2;
          const p1 = inverse ? PRIO_PF2 : PRIO_PF1;

          for (let k = 0; k < 4; k++) {
            if (outputData & mask) {
              dst[dstIndex] = c1;
              prio[dstIndex] = p1;
            } else {
              dst[dstIndex] = c0;
              prio[dstIndex] = p0;
            }
            dstIndex++;
            mask >>= 1;
          }
        } else if (priorMode === 1) {
          if (mask > 0x08) {
            const hi = (colBk | (outputData >> 4)) & 0xff;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo = (colBk | (outputData & 0x0f)) & 0xff;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        } else if (priorMode === 2) {
          if (mask > 0x08) {
            const hi2 = colorTable[outputData >> 4] & 0xff;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo2 = colorTable[outputData & 0x0f] & 0xff;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        } else {
          if (mask > 0x08) {
            const hi3 = outputData & 0xf0
              ? colBk | (outputData & 0xf0)
              : colBk & 0xf0;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo3 = outputData & 0x0f
              ? colBk | ((outputData << 4) & 0xf0)
              : colBk & 0xf0;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        }
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode3(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollOffset = ((10 - lineDelta) - (io.video.verticalScrollOffset | 0)) & 0xff;

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
        const priorMode = (sram[IO_PRIOR] >> 6) & 3;

        if (mask === 0x00) {
          const chactl = sram[IO_CHACTL] & 0x03;
          const chBase = (((sram[IO_CHBASE] & 0xff) << 8) & 0xfc00) & 0xffff;
          const decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
          const ch = decoded & 0xff;
          inverse = (decoded & 0x100) !== 0;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          ctx.cycleCounter++;

          if (io.firstRowScanline) {
            ctx.cycleCounter++;
          }

          data = fetchCharacterRow10(ram, chBase, ch, vScrollOffset);
          mask = 0x80;
        }

        const outputData = priorMode !== 0 && inverse ? (data ^ 0xff) : data;

        if (priorMode === 0) {
          const colPf1 = sram[IO_COLPF1] & 0xff;
          const colPf2 = sram[IO_COLPF2] & 0xff;
          const c0Inverse = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;
          const c1Inverse = colPf2 & 0xff;
          const c0Normal = colPf2 & 0xff;
          const c1Normal = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;
          const c0 = inverse ? c0Inverse : c0Normal;
          const c1 = inverse ? c1Inverse : c1Normal;
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
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo = (colBk | (outputData & 0x0f)) & 0xff;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        } else if (priorMode === 2) {
          fillGtiaColorTable(sram, colorTable);
          if (mask > 0x08) {
            const hi2 = colorTable[outputData >> 4] & 0xff;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo2 = colorTable[outputData & 0x0f] & 0xff;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        } else {
          const colBk = sram[IO_COLBK] & 0xff;
          if (mask > 0x08) {
            const hi3 = outputData & 0xf0 ? colBk | (outputData & 0xf0) : colBk & 0xf0;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo3 = outputData & 0x0f
              ? colBk | ((outputData << 4) & 0xf0)
              : colBk & 0xf0;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        }

        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    return { drawLineMode2, drawLineMode3 };
  }

  window.A8EPlayfieldMode23 = { createApi };
})();
