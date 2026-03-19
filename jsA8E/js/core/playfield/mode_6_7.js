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

    function drawLineMode6(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollOffset = ((8 - lineDelta) - (io.video.verticalScrollOffset | 0)) & 0xff;

      const aColorTable = SCRATCH_COLOR_TABLE_A;
      aColorTable[0] = sram[IO_COLPF0] & 0xff;
      aColorTable[1] = sram[IO_COLPF1] & 0xff;
      aColorTable[2] = sram[IO_COLPF2] & 0xff;
      aColorTable[3] = sram[IO_COLPF3] & 0xff;

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
          stealDma(ctx, 1);

          if (io.firstRowScanline) {
            stealDma(ctx, 1);
          }

          colorIndex = ch >> 6;
          p = PRIORITY_TABLE_PF0123[colorIndex] & 0xff;
          ch &= 0x3f;

          data = fetchCharacterRow8(ram, chBase, ch, vScrollOffset, chactl);
          mask = 0x80;
        }

        aColorTable[0] = sram[IO_COLPF0] & 0xff;
        aColorTable[1] = sram[IO_COLPF1] & 0xff;
        aColorTable[2] = sram[IO_COLPF2] & 0xff;
        aColorTable[3] = sram[IO_COLPF3] & 0xff;
        const cColor0 = sram[IO_COLBK] & 0xff;
        const cColor1 = aColorTable[colorIndex] & 0xff;

        if (data & mask) {
          dst[dstIndex] = cColor1;
          prio[dstIndex] = p;
          dst[dstIndex + 1] = cColor1;
          prio[dstIndex + 1] = p;
        } else {
          dst[dstIndex] = cColor0;
          prio[dstIndex] = PRIO_BKG;
          dst[dstIndex + 1] = cColor0;
          prio[dstIndex + 1] = PRIO_BKG;
        }
        dstIndex += 2;
        mask >>= 1;

        if (data & mask) {
          dst[dstIndex] = cColor1;
          prio[dstIndex] = p;
          dst[dstIndex + 1] = cColor1;
          prio[dstIndex + 1] = p;
        } else {
          dst[dstIndex] = cColor0;
          prio[dstIndex] = PRIO_BKG;
          dst[dstIndex + 1] = cColor0;
          prio[dstIndex + 1] = PRIO_BKG;
        }
        dstIndex += 2;
        mask >>= 1;
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode7(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollLine = ((16 - lineDelta) - (io.video.verticalScrollOffset | 0)) & 0xff;

      const aColorTable = SCRATCH_COLOR_TABLE_A;
      aColorTable[0] = sram[IO_COLPF0] & 0xff;
      aColorTable[1] = sram[IO_COLPF1] & 0xff;
      aColorTable[2] = sram[IO_COLPF2] & 0xff;
      aColorTable[3] = sram[IO_COLPF3] & 0xff;

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
          if ((vScrollLine & 1) === 0) {
            stealDma(ctx, 1);
          }

          if (io.firstRowScanline) {
            stealDma(ctx, 1);
          }

          colorIndex = ch >> 6;
          p = PRIORITY_TABLE_PF0123[colorIndex] & 0xff;
          ch &= 0x3f;

          data = fetchCharacterRow16(ram, chBase, ch, vScrollLine, chactl);
          mask = 0x80;
        }

        aColorTable[0] = sram[IO_COLPF0] & 0xff;
        aColorTable[1] = sram[IO_COLPF1] & 0xff;
        aColorTable[2] = sram[IO_COLPF2] & 0xff;
        aColorTable[3] = sram[IO_COLPF3] & 0xff;
        const cColor0 = sram[IO_COLBK] & 0xff;
        const cColor1 = aColorTable[colorIndex] & 0xff;

        if (data & mask) {
          dst[dstIndex] = cColor1;
          prio[dstIndex] = p;
          dst[dstIndex + 1] = cColor1;
          prio[dstIndex + 1] = p;
        } else {
          dst[dstIndex] = cColor0;
          prio[dstIndex] = PRIO_BKG;
          dst[dstIndex + 1] = cColor0;
          prio[dstIndex + 1] = PRIO_BKG;
        }
        dstIndex += 2;
        mask >>= 1;

        if (data & mask) {
          dst[dstIndex] = cColor1;
          prio[dstIndex] = p;
          dst[dstIndex + 1] = cColor1;
          prio[dstIndex + 1] = p;
        } else {
          dst[dstIndex] = cColor0;
          prio[dstIndex] = PRIO_BKG;
          dst[dstIndex + 1] = cColor0;
          prio[dstIndex + 1] = PRIO_BKG;
        }
        dstIndex += 2;
        mask >>= 1;
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    return { drawLineMode6, drawLineMode7 };
  }

  window.A8EPlayfieldMode67 = { createApi };
})();
