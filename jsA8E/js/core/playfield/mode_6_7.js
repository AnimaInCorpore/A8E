(function () {
  "use strict";

  function createApi(cfg) {
    const Util = cfg.Util;

    const IO_CHACTL = cfg.IO_CHACTL;
    const IO_CHBASE = cfg.IO_CHBASE;
    const IO_COLBK = cfg.IO_COLBK;
    const IO_COLPF0 = cfg.IO_COLPF0;
    const IO_COLPF1 = cfg.IO_COLPF1;
    const IO_COLPF2 = cfg.IO_COLPF2;
    const IO_COLPF3 = cfg.IO_COLPF3;

    const PRIO_BKG = cfg.PRIO_BKG;
    const SCRATCH_COLOR_TABLE_A = cfg.SCRATCH_COLOR_TABLE_A;
    const PRIORITY_TABLE_PF0123 = cfg.PRIORITY_TABLE_PF0123;

    const clockAction = cfg.clockAction;
    const currentCharacterBaseRegister =
      cfg.currentCharacterBaseRegister ||
      function (io, sram) {
        return sram[IO_CHBASE] & 0xff;
      };
    const fetchCharacterRow8 = cfg.fetchCharacterRow8;
    const fetchCharacterRow16 = cfg.fetchCharacterRow16;
    const stealDma = cfg.stealDma || function (ctx, cycles) {
      ctx.cycleCounter += cycles | 0;
    };

    function writePixelPair(dst, prio, dstIndex, color, priority) {
      dst[dstIndex] = color;
      prio[dstIndex] = priority;
      dst[dstIndex + 1] = color;
      prio[dstIndex + 1] = priority;
      return dstIndex + 2;
    }

    function loadColorTable(sram, table) {
      table[0] = sram[IO_COLPF0] & 0xff;
      table[1] = sram[IO_COLPF1] & 0xff;
      table[2] = sram[IO_COLPF2] & 0xff;
      table[3] = sram[IO_COLPF3] & 0xff;
    }

    function drawLineMode67Common(ctx, fetchCharacterRow, vScrollBase, shouldStealDma) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollLine =
        ((vScrollBase - lineDelta) - (io.video.verticalScrollOffset | 0)) & 0xff;

      const aColorTable = SCRATCH_COLOR_TABLE_A;
      loadColorTable(sram, aColorTable);

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 4;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      let mask = 0x00;
      let data = 0;
      let colorIndex = 0;
      let p = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        const chBase = ((currentCharacterBaseRegister(io, sram) << 8) & 0xfe00) & 0xffff;
        const chactl = sram[IO_CHACTL] & 0x07;
        if (mask === 0x00) {
          let ch = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          if (shouldStealDma(vScrollLine)) {
            stealDma(ctx, 1);
          }

          if (io.firstRowScanline) {
            stealDma(ctx, 1);
          }

          colorIndex = ch >> 6;
          p = PRIORITY_TABLE_PF0123[colorIndex] & 0xff;
          ch &= 0x3f;

          data = fetchCharacterRow(ram, chBase, ch, vScrollLine, chactl);
          mask = 0x80;
        }

        loadColorTable(sram, aColorTable);
        const cColor0 = sram[IO_COLBK] & 0xff;
        const cColor1 = aColorTable[colorIndex] & 0xff;

        if (data & mask) {
          dstIndex = writePixelPair(dst, prio, dstIndex, cColor1, p);
        } else {
          dstIndex = writePixelPair(dst, prio, dstIndex, cColor0, PRIO_BKG);
        }
        mask >>= 1;

        if (data & mask) {
          dstIndex = writePixelPair(dst, prio, dstIndex, cColor1, p);
        } else {
          dstIndex = writePixelPair(dst, prio, dstIndex, cColor0, PRIO_BKG);
        }
        mask >>= 1;
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode6(ctx) {
      return drawLineMode67Common(ctx, fetchCharacterRow8, 8, function () {
        return true;
      });
    }

    function drawLineMode7(ctx) {
      return drawLineMode67Common(ctx, fetchCharacterRow16, 16, function (vScrollLine) {
        return (vScrollLine & 1) === 0;
      });
    }

    return { drawLineMode6, drawLineMode7 };
  }

  window.A8EPlayfieldMode67 = { createApi };
})();
