(function () {
  "use strict";

  function createApi(cfg) {
    const Util = cfg.Util;

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
    const fetchCharacterRow8 = cfg.fetchCharacterRow8;
    const fetchCharacterRow16 = cfg.fetchCharacterRow16;
    const stealDma = cfg.stealDma || function (ctx, cycles) {
      ctx.cycleCounter += cycles | 0;
    };

    function drawLineMode4(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollOffset = ((8 - lineDelta) - (io.video.verticalScrollOffset | 0)) & 0xff;

      const aColorTable0 = SCRATCH_COLOR_TABLE_A;
      const aColorTable1 = SCRATCH_COLOR_TABLE_B;
      fillBkgPf012ColorTable(sram, aColorTable0);
      aColorTable1[0] = sram[IO_COLBK] & 0xff;
      aColorTable1[1] = sram[IO_COLPF0] & 0xff;
      aColorTable1[2] = sram[IO_COLPF1] & 0xff;
      aColorTable1[3] = sram[IO_COLPF3] & 0xff;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      const chBase = ((sram[IO_CHBASE] & 0xff) << 8) & 0xfc00 & 0xffff;

      let mask = 0x00;
      let data = 0;
      let inverse = false;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          const raw = ram[dispAddr] & 0xff;
          inverse = (raw & 0x80) !== 0;
          const ch = raw & 0x7f;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          stealDma(ctx, 1);

          if (io.firstRowScanline) {
            stealDma(ctx, 1);
          }

          data = fetchCharacterRow8(ram, chBase, ch, vScrollOffset);
          mask = 0x02;
        }

        fillBkgPf012ColorTable(sram, aColorTable0);
        aColorTable1[0] = sram[IO_COLBK] & 0xff;
        aColorTable1[1] = sram[IO_COLPF0] & 0xff;
        aColorTable1[2] = sram[IO_COLPF1] & 0xff;
        aColorTable1[3] = sram[IO_COLPF3] & 0xff;
        const colorTable = inverse ? aColorTable1 : aColorTable0;
        const prioTable = inverse
          ? PRIORITY_TABLE_BKG_PF013
          : PRIORITY_TABLE_BKG_PF012;

        let c = colorTable[(data >> 6) & 0x3] & 0xff;
        let p = prioTable[(data >> 6) & 0x3] & 0xff;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;

        data = (data << 2) & 0xff;

        c = colorTable[(data >> 6) & 0x3] & 0xff;
        p = prioTable[(data >> 6) & 0x3] & 0xff;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;

        data = (data << 2) & 0xff;
        mask >>= 1;
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode5(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollLine = ((16 - lineDelta) - (io.video.verticalScrollOffset | 0)) & 0xff;

      const aColorTable0 = SCRATCH_COLOR_TABLE_A;
      const aColorTable1 = SCRATCH_COLOR_TABLE_B;
      fillBkgPf012ColorTable(sram, aColorTable0);
      aColorTable1[0] = sram[IO_COLBK] & 0xff;
      aColorTable1[1] = sram[IO_COLPF0] & 0xff;
      aColorTable1[2] = sram[IO_COLPF1] & 0xff;
      aColorTable1[3] = sram[IO_COLPF3] & 0xff;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      const chBase = ((sram[IO_CHBASE] & 0xff) << 8) & 0xfe00 & 0xffff;

      let mask = 0x00;
      let data = 0;
      let inverse = false;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          const raw = ram[dispAddr] & 0xff;
          inverse = (raw & 0x80) !== 0;
          const ch = raw & 0x7f;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          if ((vScrollLine & 1) === 0) {
            stealDma(ctx, 1);
          }

          if (io.firstRowScanline) {
            stealDma(ctx, 1);
          }

          data = fetchCharacterRow16(ram, chBase, ch, vScrollLine);
          mask = 0x02;
        }

        fillBkgPf012ColorTable(sram, aColorTable0);
        aColorTable1[0] = sram[IO_COLBK] & 0xff;
        aColorTable1[1] = sram[IO_COLPF0] & 0xff;
        aColorTable1[2] = sram[IO_COLPF1] & 0xff;
        aColorTable1[3] = sram[IO_COLPF3] & 0xff;
        const colorTable = inverse ? aColorTable1 : aColorTable0;
        const prioTable = inverse
          ? PRIORITY_TABLE_BKG_PF013
          : PRIORITY_TABLE_BKG_PF012;

        let c = colorTable[(data >> 6) & 0x3] & 0xff;
        let p = prioTable[(data >> 6) & 0x3] & 0xff;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;

        data = (data << 2) & 0xff;

        c = colorTable[(data >> 6) & 0x3] & 0xff;
        p = prioTable[(data >> 6) & 0x3] & 0xff;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;

        data = (data << 2) & 0xff;
        mask >>= 1;
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    return { drawLineMode4, drawLineMode5 };
  }

  window.A8EPlayfieldMode45 = { createApi };
})();
