(function () {
  "use strict";

  function createApi(cfg) {
    const CPU = cfg.CPU;
    const Util = cfg.Util;

    const PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;
    const FIRST_VISIBLE_LINE = cfg.FIRST_VISIBLE_LINE;
    const LAST_VISIBLE_LINE = cfg.LAST_VISIBLE_LINE;

    const IO_CHACTL = cfg.IO_CHACTL;
    const IO_CHBASE = cfg.IO_CHBASE;
    const IO_COLBK = cfg.IO_COLBK;
    const IO_COLPF0 = cfg.IO_COLPF0;
    const IO_COLPF1 = cfg.IO_COLPF1;
    const IO_COLPF2 = cfg.IO_COLPF2;
    const IO_COLPF3 = cfg.IO_COLPF3;
    const IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    const IO_DMACTL = cfg.IO_DMACTL;
    const IO_HSCROL = cfg.IO_HSCROL;
    const IO_PRIOR = cfg.IO_PRIOR;

    const ANTIC_MODE_INFO = cfg.ANTIC_MODE_INFO;

    const PRIO_BKG = cfg.PRIO_BKG;
    const PRIO_PF0 = cfg.PRIO_PF0;
    const PRIO_PF1 = cfg.PRIO_PF1;
    const PRIO_PF2 = cfg.PRIO_PF2;
    const PRIORITY_TABLE_BKG_PF012 = cfg.PRIORITY_TABLE_BKG_PF012;
    const PRIORITY_TABLE_BKG_PF013 = cfg.PRIORITY_TABLE_BKG_PF013;
    const PRIORITY_TABLE_PF0123 = cfg.PRIORITY_TABLE_PF0123;
    const SCRATCH_GTIA_COLOR_TABLE = cfg.SCRATCH_GTIA_COLOR_TABLE;
    const SCRATCH_COLOR_TABLE_A = cfg.SCRATCH_COLOR_TABLE_A;
    const SCRATCH_COLOR_TABLE_B = cfg.SCRATCH_COLOR_TABLE_B;
    const SCRATCH_BACKGROUND_TABLE = cfg.SCRATCH_BACKGROUND_TABLE;

    const fillGtiaColorTable = cfg.fillGtiaColorTable;
    const fillBkgPf012ColorTable = cfg.fillBkgPf012ColorTable;
    const decodeTextModeCharacter = cfg.decodeTextModeCharacter;
    const fillLine = cfg.fillLine;

    function drawLineMode2(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollOffset = 8 - lineDelta - (io.video.verticalScrollOffset | 0);
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      const chactl = sram[IO_CHACTL] & 0x03;
      const priorMode = (sram[IO_PRIOR] >> 6) & 3;
      const colorTable = SCRATCH_GTIA_COLOR_TABLE;
      fillGtiaColorTable(sram, colorTable);
      const colPf1 = sram[IO_COLPF1] & 0xff;
      const colPf2 = sram[IO_COLPF2] & 0xff;
      const colBk = sram[IO_COLBK] & 0xff;
      const c0Inverse = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;
      const c1Inverse = colPf2 & 0xff;
      const c0Normal = colPf2 & 0xff;
      const c1Normal = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;

      const chBase = (sram[IO_CHBASE] << 8) & 0xfc00 & 0xffff;

      let mask = 0x00;
      let data = 0;
      let inverse = false;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          const decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
          const ch = decoded & 0xff;
          inverse = (decoded & 0x100) !== 0;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

          data =
            ram[(chBase + ch * 8 + (vScrollOffset & 0xff)) & 0xffff] & 0xff;
          if (priorMode !== 0 && inverse) data ^= 0xff;
          mask = 0x80;
        }

        if (priorMode === 0) {
          const c0 = inverse ? c0Inverse : c0Normal;
          const c1 = inverse ? c1Inverse : c1Normal;
          const p0 = inverse ? PRIO_PF1 : PRIO_PF2;
          const p1 = inverse ? PRIO_PF2 : PRIO_PF1;

          if (data & mask) {
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
          mask >>= 1;

          if (data & mask) {
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
          mask >>= 1;

          if (data & mask) {
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
          mask >>= 1;

          if (data & mask) {
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
          mask >>= 1;
        } else if (priorMode === 1) {
          if (mask > 0x08) {
            const hi = (colBk | (data >> 4)) & 0xff;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo = (colBk | (data & 0x0f)) & 0xff;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        } else if (priorMode === 2) {
          if (mask > 0x08) {
            const hi2 = colorTable[data >> 4] & 0xff;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo2 = colorTable[data & 0x0f] & 0xff;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        } else {
          if (mask > 0x08) {
            const hi3 = data & 0xf0 ? colBk | (data & 0xf0) : colBk & 0xf0;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo3 = data & 0x0f ? colBk | ((data << 4) & 0xf0) : colBk & 0xf0;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode3(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      const chactl = sram[IO_CHACTL] & 0x03;
      const priorMode = (sram[IO_PRIOR] >> 6) & 3;
      const colPf1 = sram[IO_COLPF1] & 0xff;
      const colPf2 = sram[IO_COLPF2] & 0xff;
      const colBk = sram[IO_COLBK] & 0xff;
      const colorTable = SCRATCH_GTIA_COLOR_TABLE;
      fillGtiaColorTable(sram, colorTable);
      const c0Inverse = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;
      const c1Inverse = colPf2 & 0xff;
      const c0Normal = colPf2 & 0xff;
      const c1Normal = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;
      const chBase = (((sram[IO_CHBASE] & 0xff) << 8) & 0xfc00) & 0xffff;

      let mask = 0x00;
      let data = 0;
      let inverse = false;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          const decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
          const ch = decoded & 0xff;
          inverse = (decoded & 0x100) !== 0;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

          if (ch < 0x60) {
            if (lineDelta > 2) {
              data =
                ram[(chBase + ch * 8 + (10 - lineDelta)) & 0xffff] & 0xff;
            } else {
              data = 0;
            }
          } else {
            if (lineDelta > 8) {
              data = 0;
            } else if (lineDelta > 2) {
              data =
                ram[(chBase + ch * 8 + (10 - lineDelta)) & 0xffff] & 0xff;
            } else {
              data = ram[(chBase + ch * 8 + (2 - lineDelta)) & 0xffff] & 0xff;
            }
          }
          if (priorMode !== 0 && inverse) data ^= 0xff;
          mask = 0x80;
        }

        if (priorMode === 0) {
          const c0 = inverse ? c0Inverse : c0Normal;
          const c1 = inverse ? c1Inverse : c1Normal;
          const p0 = inverse ? PRIO_PF1 : PRIO_PF2;
          const p1 = inverse ? PRIO_PF2 : PRIO_PF1;
          
          if (data & mask) {
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
          mask >>= 1;

          if (data & mask) {
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
          mask >>= 1;

          if (data & mask) {
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
          mask >>= 1;

          if (data & mask) {
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
          mask >>= 1;
        } else if (priorMode === 1) {
          if (mask > 0x08) {
            const hi = (colBk | (data >> 4)) & 0xff;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo = (colBk | (data & 0x0f)) & 0xff;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        } else if (priorMode === 2) {
          if (mask > 0x08) {
            const hi2 = colorTable[data >> 4] & 0xff;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo2 = colorTable[data & 0x0f] & 0xff;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        } else {
          if (mask > 0x08) {
            const hi3 = data & 0xf0 ? colBk | (data & 0xf0) : colBk & 0xf0;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo3 = data & 0x0f ? colBk | ((data << 4) & 0xf0) : colBk & 0xf0;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode4(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollOffset = 8 - lineDelta - (io.video.verticalScrollOffset | 0);
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      const chactl = sram[IO_CHACTL] & 0x03;
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
      let colorTable = aColorTable0;
      let prioTable = PRIORITY_TABLE_BKG_PF012;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          const decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
          const ch = decoded & 0xff;
          const inverse = (decoded & 0x100) !== 0;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

          if (inverse) {
            colorTable = aColorTable1;
            prioTable = PRIORITY_TABLE_BKG_PF013;
          } else {
            colorTable = aColorTable0;
            prioTable = PRIORITY_TABLE_BKG_PF012;
          }

          data =
            ram[(chBase + ch * 8 + (vScrollOffset & 0xff)) & 0xffff] & 0xff;
          mask = 0x02;
        }

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
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode5(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollOffset =
        ((16 - lineDelta - (io.video.verticalScrollOffset | 0)) >> 1) & 0xff;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      const chactl = sram[IO_CHACTL] & 0x03;
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
      let colorTable = aColorTable0;
      let prioTable = PRIORITY_TABLE_BKG_PF012;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          const decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
          const ch = decoded & 0xff;
          const inverse = (decoded & 0x100) !== 0;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

          if (inverse) {
            colorTable = aColorTable1;
            prioTable = PRIORITY_TABLE_BKG_PF013;
          } else {
            colorTable = aColorTable0;
            prioTable = PRIORITY_TABLE_BKG_PF012;
          }

          data = ram[(chBase + ch * 8 + vScrollOffset) & 0xffff] & 0xff;
          mask = 0x02;
        }

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
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode6(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollOffset = 8 - lineDelta - (io.video.verticalScrollOffset | 0);
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      const aColorTable = SCRATCH_COLOR_TABLE_A;
      aColorTable[0] = sram[IO_COLPF0] & 0xff;
      aColorTable[1] = sram[IO_COLPF1] & 0xff;
      aColorTable[2] = sram[IO_COLPF2] & 0xff;
      aColorTable[3] = sram[IO_COLPF3] & 0xff;
      const cColor0 = sram[IO_COLBK] & 0xff;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 4;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      const chBase = ((sram[IO_CHBASE] & 0xff) << 8) & 0xfe00 & 0xffff;

      let mask = 0x00;
      let data = 0;
      let cColor1 = 0;
      let p = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          let ch = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

          cColor1 = aColorTable[ch >> 6] & 0xff;
          p = PRIORITY_TABLE_PF0123[ch >> 6] & 0xff;
          ch &= 0x3f;

          data =
            ram[(chBase + ch * 8 + (vScrollOffset & 0xff)) & 0xffff] & 0xff;
          mask = 0x80;
        }

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
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode7(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollOffset =
        ((16 - lineDelta - (io.video.verticalScrollOffset | 0)) >> 1) & 0xff;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      const aColorTable = SCRATCH_COLOR_TABLE_A;
      aColorTable[0] = sram[IO_COLPF0] & 0xff;
      aColorTable[1] = sram[IO_COLPF1] & 0xff;
      aColorTable[2] = sram[IO_COLPF2] & 0xff;
      aColorTable[3] = sram[IO_COLPF3] & 0xff;
      const cColor0 = sram[IO_COLBK] & 0xff;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 4;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      const chBase = ((sram[IO_CHBASE] & 0xff) << 8) & 0xfe00 & 0xffff;

      let mask = 0x00;
      let data = 0;
      let cColor1 = 0;
      let p = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          let ch = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

          cColor1 = aColorTable[ch >> 6] & 0xff;
          p = PRIORITY_TABLE_PF0123[ch >> 6] & 0xff;
          ch &= 0x3f;

          data = ram[(chBase + ch * 8 + vScrollOffset) & 0xffff] & 0xff;
          mask = 0x80;
        }

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
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode8(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      const aColorTable = SCRATCH_COLOR_TABLE_A;
      fillBkgPf012ColorTable(sram, aColorTable);

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 8;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      let data = 0;
      let phase = 8;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (phase === 8) {
          data = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          phase = 0;
        }

        const idx = (data >> (6 - ((phase >> 1) * 2))) & 0x03;
        const c = aColorTable[idx] & 0xff;
        const p = PRIORITY_TABLE_BKG_PF012[idx] & 0xff;
        for (let k = 0; k < 4; k++) {
          dst[dstIndex] = c;
          prio[dstIndex] = p;
          dstIndex++;
        }

        phase++;
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode9(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 8;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      const pf0 = sram[IO_COLPF0] & 0xff;
      const bkg = sram[IO_COLBK] & 0xff;

      let mask = 0x00;
      let data = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          data = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          mask = 0x80;
        }

        const c = data & mask ? pf0 : bkg;
        const p = data & mask ? PRIO_PF0 : PRIO_BKG;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dst[dstIndex + 2] = c;
        prio[dstIndex + 2] = p;
        dst[dstIndex + 3] = c;
        prio[dstIndex + 3] = p;
        dstIndex += 4;
        mask >>= 1;
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineModeA(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      const aColorTable = SCRATCH_COLOR_TABLE_A;
      fillBkgPf012ColorTable(sram, aColorTable);

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 4;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      let mask = 0x00;
      let data = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          data = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          mask = 0xc0;
        }

        const idx = (data & mask) >> (6 - ((cycle & 3) * 2));
        const c = aColorTable[idx] & 0xff;
        const p = PRIORITY_TABLE_BKG_PF012[idx] & 0xff;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dst[dstIndex + 2] = c;
        prio[dstIndex + 2] = p;
        dst[dstIndex + 3] = c;
        prio[dstIndex + 3] = p;
        dstIndex += 4;

        mask >>= 2;
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineModeB(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 4;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      const pf0 = sram[IO_COLPF0] & 0xff;
      const bkg = sram[IO_COLBK] & 0xff;

      let mask = 0x00;
      let data = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          data = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          mask = 0x80;
        }

        let c = data & mask ? pf0 : bkg;
        let p = data & mask ? PRIO_PF0 : PRIO_BKG;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;
        mask >>= 1;

        c = data & mask ? pf0 : bkg;
        p = data & mask ? PRIO_PF0 : PRIO_BKG;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;
        mask >>= 1;
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineModeC(ctx) {
      // Same renderer as mode B in the C emulator.
      drawLineModeB(ctx);
    }

    function drawLineModeD(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      const aColorTable = SCRATCH_COLOR_TABLE_A;
      fillBkgPf012ColorTable(sram, aColorTable);

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      let mask = 0x00;
      let data = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          data = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          mask = 0x02;
        }

        let c = aColorTable[(data >> 6) & 0x3] & 0xff;
        let p = PRIORITY_TABLE_BKG_PF012[(data >> 6) & 0x3] & 0xff;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;

        data = (data << 2) & 0xff;

        c = aColorTable[(data >> 6) & 0x3] & 0xff;
        p = PRIORITY_TABLE_BKG_PF012[(data >> 6) & 0x3] & 0xff;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;

        data = (data << 2) & 0xff;
        mask >>= 1;
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineModeE(ctx) {
      // Same renderer as mode D in the C emulator.
      drawLineModeD(ctx);
    }

    function drawLineModeF(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      const cColor0 = sram[IO_COLPF2] & 0xff;
      const cColor1 =
        ((sram[IO_COLPF2] & 0xf0) | (sram[IO_COLPF1] & 0x0f)) & 0xff;

      const colorTable = SCRATCH_GTIA_COLOR_TABLE;
      fillGtiaColorTable(sram, colorTable);
      const colBk = sram[IO_COLBK] & 0xff;

      const priorMode = (sram[IO_PRIOR] >> 6) & 3;

      let mask = 0x00;
      let data = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          data = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          mask = 0x80;
        }

        if (priorMode === 0) {
          if (data & mask) {
            dst[dstIndex] = cColor1;
            prio[dstIndex] = PRIO_PF1;
          } else {
            dst[dstIndex] = cColor0;
            prio[dstIndex] = PRIO_PF2;
          }
          dstIndex++;
          mask >>= 1;

          if (data & mask) {
            dst[dstIndex] = cColor1;
            prio[dstIndex] = PRIO_PF1;
          } else {
            dst[dstIndex] = cColor0;
            prio[dstIndex] = PRIO_PF2;
          }
          dstIndex++;
          mask >>= 1;

          if (data & mask) {
            dst[dstIndex] = cColor1;
            prio[dstIndex] = PRIO_PF1;
          } else {
            dst[dstIndex] = cColor0;
            prio[dstIndex] = PRIO_PF2;
          }
          dstIndex++;
          mask >>= 1;

          if (data & mask) {
            dst[dstIndex] = cColor1;
            prio[dstIndex] = PRIO_PF1;
          } else {
            dst[dstIndex] = cColor0;
            prio[dstIndex] = PRIO_PF2;
          }
          dstIndex++;
          mask >>= 1;
        } else if (priorMode === 1) {
          if (mask > 0x08) {
            const hi = (colBk | (data >> 4)) & 0xff;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo = (colBk | (data & 0x0f)) & 0xff;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        } else if (priorMode === 2) {
          if (mask > 0x08) {
            const hi2 = colorTable[data >> 4] & 0xff;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi2; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo2 = colorTable[data & 0x0f] & 0xff;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo2; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        } else {
          if (mask > 0x08) {
            const hi3 = data & 0xf0 ? colBk | (data & 0xf0) : colBk & 0xf0;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = hi3; prio[dstIndex++] = PRIO_BKG;
          } else {
            const lo3 = data & 0x0f ? colBk | ((data << 4) & 0xf0) : colBk & 0xf0;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
            dst[dstIndex] = lo3; prio[dstIndex++] = PRIO_BKG;
          }
          mask >>= 4;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLine(ctx) {
      const io = ctx.ioData;
      const sram = ctx.sram;
      const video = io.videoOut;

      const y = io.video.currentDisplayLine | 0;
      if (y < FIRST_VISIBLE_LINE || y > LAST_VISIBLE_LINE) return;

      const prior = sram[IO_PRIOR] & 0xff;
      SCRATCH_BACKGROUND_TABLE[0] = sram[IO_COLBK] & 0xff;
      SCRATCH_BACKGROUND_TABLE[1] = sram[IO_COLBK] & 0xff;
      SCRATCH_BACKGROUND_TABLE[2] = sram[IO_COLPM0_TRIG2] & 0xff;
      SCRATCH_BACKGROUND_TABLE[3] = sram[IO_COLBK] & 0xf0;
      const bkg = SCRATCH_BACKGROUND_TABLE[(prior >> 6) & 3] & 0xff;

      const dmactl = sram[IO_DMACTL] & 0xff;
      const pfWidth = dmactl & 0x03;
      const pfDma = dmactl & 0x20;

      if (pfDma && pfWidth) {
        const cmd = io.currentDisplayListCommand & 0xff;
        const mode = cmd & 0x0f;

        if (mode < 2) {
          fillLine(video, y, 0, PIXELS_PER_LINE, bkg, PRIO_BKG);
          return;
        }

        const playfieldPixels = 192 + pfWidth * 64;
        let leftBorder = 0;
        let rightBorder = 0;
        let destIndex = y * PIXELS_PER_LINE;

        if (pfWidth === 0x01) {
          leftBorder = (16 + 12 + 6 + 30) * 2;
          rightBorder = (30 + 6) * 2;
          destIndex += (16 + 12 + 6 + 30) * 2;
        } else if (pfWidth === 0x02) {
          leftBorder = (16 + 12 + 6 + 14) * 2;
          rightBorder = (14 + 6) * 2;
          destIndex += (16 + 12 + 6 + 14) * 2;
        } else if (pfWidth === 0x03) {
          leftBorder = (16 + 12 + 6 + 10) * 2;
          rightBorder = (2 + 6) * 2;
          // Matches the original emulator: start earlier for horizontal scrolling.
          destIndex += (16 + 12 + 4) * 2;
        }

        const ppb = ANTIC_MODE_INFO[mode].ppb || 8;
        let bytesPerLine = (playfieldPixels / ppb) | 0;

        if (cmd & 0x10) {
          // HSCROL
          const h = sram[IO_HSCROL] & 0xff;
          if (pfWidth !== 0x03) {
            destIndex -= 32 - h * 2;
            bytesPerLine += 8;
          } else {
            destIndex += h * 2;
          }
        }

        io.drawLine.bytesPerLine = bytesPerLine;
        CPU.stall(ctx, bytesPerLine);
        io.drawLine.destIndex = destIndex;
        io.drawLine.displayMemoryAddress = io.displayMemoryAddress & 0xffff;

        switch (mode) {
          case 2:
            drawLineMode2(ctx);
            break;
          case 3:
            drawLineMode3(ctx);
            break;
          case 4:
            drawLineMode4(ctx);
            break;
          case 5:
            drawLineMode5(ctx);
            break;
          case 6:
            drawLineMode6(ctx);
            break;
          case 7:
            drawLineMode7(ctx);
            break;
          case 8:
            drawLineMode8(ctx);
            break;
          case 9:
            drawLineMode9(ctx);
            break;
          case 0x0a:
            drawLineModeA(ctx);
            break;
          case 0x0b:
            drawLineModeB(ctx);
            break;
          case 0x0c:
            drawLineModeC(ctx);
            break;
          case 0x0d:
            drawLineModeD(ctx);
            break;
          case 0x0e:
            drawLineModeE(ctx);
            break;
          case 0x0f:
            drawLineModeF(ctx);
            break;
          default:
            fillLine(
              video,
              y,
              destIndex - y * PIXELS_PER_LINE,
              bytesPerLine * ppb,
              bkg,
              PRIO_BKG,
            );
            break;
        }

        if (leftBorder) fillLine(video, y, 0, leftBorder, bkg, PRIO_BKG);
        if (rightBorder)
          {fillLine(
            video,
            y,
            playfieldPixels + leftBorder,
            rightBorder,
            bkg,
            PRIO_BKG,
          );}
      } else {
        fillLine(video, y, 0, PIXELS_PER_LINE, bkg, PRIO_BKG);
      }
    }

    return {
      drawLine: drawLine,
    };
  }

  window.A8EPlayfield = {
    createApi: createApi,
  };
})();
