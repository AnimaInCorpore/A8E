(function () {
  "use strict";

  function createApi(cfg) {
    const CPU = cfg.CPU;
    const Util = cfg.Util;

    const PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;
    const CYCLES_PER_LINE = cfg.CYCLES_PER_LINE;
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

    const fillGtiaColorTable = cfg.fillGtiaColorTable;
    const fillBkgPf012ColorTable = cfg.fillBkgPf012ColorTable;
    const decodeTextModeCharacter = cfg.decodeTextModeCharacter;
    const drawPlayerMissilesClock = cfg.drawPlayerMissilesClock;
    const ioCycleTimedEvent = cfg.ioCycleTimedEvent;
    const PLAYFIELD_SCRATCH_VIEW_X = 64;
    const ACTIVE_LINE_HSYNC_PIXELS = 32;
    const ACTIVE_LINE_COLOR_BURST_CYCLES = 6;

    function clockAction(ctx) {
      const io = ctx.ioData;
      if (ctx.ioCycleTimedEventCycle <= io.clock) ioCycleTimedEvent(ctx);
      if (drawPlayerMissilesClock && io.drawLine.playerMissileClockActive) {
        drawPlayerMissilesClock(
          ctx,
          ACTIVE_LINE_HSYNC_PIXELS +
            ((io.clock - (io.displayListFetchCycle - CYCLES_PER_LINE)) * 4),
        );
      }
      if (ctx.cycleCounter < io.clock) CPU.executeOne(ctx);
      io.clock++;
    }

    function stepClockActions(ctx, cycles) {
      for (let i = 0; i < cycles; i++) clockAction(ctx);
    }

    function advanceDisplayMemoryRow(io) {
      io.displayMemoryAddress = Util.fixedAdd(
        io.displayMemoryAddress,
        0x0fff,
        io.drawLine.bytesPerLine,
      );
    }

    function copyScratchLine(video, y, width, dstPixels, dstPriority) {
      const srcBase = y * width + PLAYFIELD_SCRATCH_VIEW_X;
      const dstBase = y * PIXELS_PER_LINE;
      dstPixels.set(
        video.playfieldScratchPixels.subarray(
          srcBase,
          srcBase + PIXELS_PER_LINE,
        ),
        dstBase,
      );
      dstPriority.set(
        video.playfieldScratchPriority.subarray(
          srcBase,
          srcBase + PIXELS_PER_LINE,
        ),
        dstBase,
      );
    }

    function currentBackgroundColor(sram) {
      const priorMode = (sram[IO_PRIOR] >> 6) & 3;
      if (priorMode < 2) return sram[IO_COLBK] & 0xff;
      if (priorMode === 2) return sram[IO_COLPM0_TRIG2] & 0xff;
      return sram[IO_COLBK] & 0xf0;
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

    function computeActiveLineGeometry(cmd, pfWidth, ppb, hscroll) {
      let leftBorderCycles = 0;
      let playfieldCycles = 0;
      let scrollPixelOffset = 0;

      if (cmd & 0x10) {
        scrollPixelOffset = ((hscroll & 0x0f) & 0x01) << 1;
      }

      switch (pfWidth & 0x03) {
        case 0x01:
          if (cmd & 0x10) {
            leftBorderCycles = (20 + (hscroll & 0x0f)) >> 1;
            playfieldCycles = 80;
          } else {
            leftBorderCycles = 18;
            playfieldCycles = 64;
          }
          break;
        case 0x02:
          if (cmd & 0x10) {
            leftBorderCycles = (4 + (hscroll & 0x0f)) >> 1;
            playfieldCycles = 96;
          } else {
            leftBorderCycles = 10;
            playfieldCycles = 80;
          }
          break;
        case 0x03:
          if (cmd & 0x10) {
            leftBorderCycles = (4 + (hscroll & 0x0f)) >> 1;
          } else {
            leftBorderCycles = 2;
          }
          playfieldCycles = 96;
          break;
        default:
          return null;
      }

      const rightBorderCycles =
        CYCLES_PER_LINE -
        ACTIVE_LINE_COLOR_BURST_CYCLES -
        leftBorderCycles -
        playfieldCycles;
      const cyclesPerByte = ((ppb | 0) / 4) | 0;
      const bytesPerLine =
        cyclesPerByte > 0 ? ((playfieldCycles / cyclesPerByte) | 0) : 0;
      const playfieldStartX =
        ACTIVE_LINE_HSYNC_PIXELS +
        scrollPixelOffset +
        (ACTIVE_LINE_COLOR_BURST_CYCLES + leftBorderCycles) * 4;

      return {
        leftBorderCycles: leftBorderCycles | 0,
        playfieldCycles: playfieldCycles | 0,
        rightBorderCycles: rightBorderCycles | 0,
        scrollPixelOffset: scrollPixelOffset | 0,
        bytesPerLine: bytesPerLine | 0,
        playfieldPixelWidth: (playfieldCycles * 4) | 0,
        leftBorderStartX:
          (ACTIVE_LINE_HSYNC_PIXELS +
            scrollPixelOffset +
            ACTIVE_LINE_COLOR_BURST_CYCLES * 4) |
          0,
        playfieldStartX: playfieldStartX | 0,
      };
    }

    function drawLineMode2(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const mode = io.currentDisplayListCommand & 0x0f;
      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollOffset = 8 - lineDelta - (io.video.verticalScrollOffset | 0);

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
          ctx.cycleCounter++; // DMA steal: pattern

          if (io.firstRowScanline) {
            ctx.cycleCounter++; // DMA steal: name (only on first line of row)
          }

          data =
            ram[(chBase + ch * 8 + (vScrollOffset & 0xff)) & 0xffff] & 0xff;
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

      const mode = io.currentDisplayListCommand & 0x0f;
      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;

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
          ctx.cycleCounter++; // DMA steal: pattern

          if (io.firstRowScanline) {
            ctx.cycleCounter++; // DMA steal: name
          }

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

    function drawLineMode4(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const mode = io.currentDisplayListCommand & 0x0f;
      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollOffset = 8 - lineDelta - (io.video.verticalScrollOffset | 0);

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
      let inverse = false;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          const decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
          const ch = decoded & 0xff;
          inverse = (decoded & 0x100) !== 0;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          ctx.cycleCounter++; // DMA steal: pattern

          if (io.firstRowScanline) {
            ctx.cycleCounter++; // DMA steal: name
          }

          data =
            ram[(chBase + ch * 8 + (vScrollOffset & 0xff)) & 0xffff] & 0xff;
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

      const mode = io.currentDisplayListCommand & 0x0f;
      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollLine = 16 - lineDelta - (io.video.verticalScrollOffset | 0);
      const vScrollOffset = (vScrollLine >> 1) & 0xff;

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
      let inverse = false;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          const decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
          const ch = decoded & 0xff;
          inverse = (decoded & 0x100) !== 0;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          if ((vScrollLine & 1) === 0) {
            ctx.cycleCounter++; // DMA steal: pattern
          }

          if (io.firstRowScanline) {
            ctx.cycleCounter++; // DMA steal: name
          }

          data = ram[(chBase + ch * 8 + vScrollOffset) & 0xffff] & 0xff;
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

    function drawLineMode6(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const mode = io.currentDisplayListCommand & 0x0f;
      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollOffset = 8 - lineDelta - (io.video.verticalScrollOffset | 0);

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
      const chBase = ((sram[IO_CHBASE] & 0xff) << 8) & 0xfe00 & 0xffff;

      let mask = 0x00;
      let data = 0;
      let colorIndex = 0;
      let p = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          let ch = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          ctx.cycleCounter++; // DMA steal: pattern

          if (io.firstRowScanline) {
            ctx.cycleCounter++; // DMA steal: name
          }

          colorIndex = ch >> 6;
          p = PRIORITY_TABLE_PF0123[colorIndex] & 0xff;
          ch &= 0x3f;

          data =
            ram[(chBase + ch * 8 + (vScrollOffset & 0xff)) & 0xffff] & 0xff;
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

      const mode = io.currentDisplayListCommand & 0x0f;
      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      const vScrollLine = 16 - lineDelta - (io.video.verticalScrollOffset | 0);
      const vScrollOffset = (vScrollLine >> 1) & 0xff;

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
      const chBase = ((sram[IO_CHBASE] & 0xff) << 8) & 0xfe00 & 0xffff;

      let mask = 0x00;
      let data = 0;
      let colorIndex = 0;
      let p = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (mask === 0x00) {
          let ch = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          if ((vScrollLine & 1) === 0) {
            ctx.cycleCounter++; // DMA steal: pattern
          }

          if (io.firstRowScanline) {
            ctx.cycleCounter++; // DMA steal: name
          }

          colorIndex = ch >> 6;
          p = PRIORITY_TABLE_PF0123[colorIndex] & 0xff;
          ch &= 0x3f;

          data = ram[(chBase + ch * 8 + vScrollOffset) & 0xffff] & 0xff;
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

    function drawLineMode8(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const mode = io.currentDisplayListCommand & 0x0f;
      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;

      const aColorTable = SCRATCH_COLOR_TABLE_A;

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
          if (io.firstRowScanline) {
            ctx.cycleCounter++; // DMA steal: display
          }
          phase = 0;
        }

        fillBkgPf012ColorTable(sram, aColorTable);
        const idx = (data >> (6 - ((phase >> 1) * 2))) & 0x03;
        const c = aColorTable[idx] & 0xff;
        const p = PRIORITY_TABLE_BKG_PF012[idx] & 0xff;
        for (let k = 0; k < 4; k++) {
          dst[dstIndex] = c;
          prio[dstIndex] = p;
          dstIndex++;
        }

        phase++;
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode9(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const mode = io.currentDisplayListCommand & 0x0f;
      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 8;
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
          if (io.firstRowScanline) {
            ctx.cycleCounter++; // DMA steal: display
          }
          mask = 0x80;
        }

        const c = data & mask ? (sram[IO_COLPF0] & 0xff) : (sram[IO_COLBK] & 0xff);
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
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineModeA(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const mode = io.currentDisplayListCommand & 0x0f;
      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;

      const aColorTable = SCRATCH_COLOR_TABLE_A;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 4;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      let phase = 4;
      let data = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (phase === 4) {
          data = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          if (io.firstRowScanline) {
            ctx.cycleCounter++; // DMA steal: display
          }
          phase = 0;
        }

        fillBkgPf012ColorTable(sram, aColorTable);
        const idx = (data >> (6 - (phase * 2))) & 0x03;
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

        phase++;
        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineModeB(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      const mode = io.currentDisplayListCommand & 0x0f;
      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;

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
          if (io.firstRowScanline) {
            ctx.cycleCounter++; // DMA steal: display
          }
          mask = 0x80;
        }

        let c = data & mask ? (sram[IO_COLPF0] & 0xff) : (sram[IO_COLBK] & 0xff);
        let p = data & mask ? PRIO_PF0 : PRIO_BKG;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;
        mask >>= 1;

        c = data & mask ? (sram[IO_COLPF0] & 0xff) : (sram[IO_COLBK] & 0xff);
        p = data & mask ? PRIO_PF0 : PRIO_BKG;
        dst[dstIndex] = c;
        prio[dstIndex] = p;
        dst[dstIndex + 1] = c;
        prio[dstIndex + 1] = p;
        dstIndex += 2;
        mask >>= 1;
        clockAction(ctx);
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

      const mode = io.currentDisplayListCommand & 0x0f;
      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;

      const aColorTable = SCRATCH_COLOR_TABLE_A;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      let phase = 2;
      let data = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        if (phase === 2) {
          data = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          if (io.firstRowScanline) {
            ctx.cycleCounter++; // DMA steal: display
          }
          phase = 0;
        }

        fillBkgPf012ColorTable(sram, aColorTable);
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
        phase++;
        clockAction(ctx);
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

      const mode = io.currentDisplayListCommand & 0x0f;
      const lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;

      const bytesPerLine = io.drawLine.bytesPerLine | 0;
      const playfieldCycles = bytesPerLine * 2;
      const dst = io.videoOut.pixels;
      const prio = io.videoOut.priority;
      let dstIndex = io.drawLine.destIndex | 0;
      let dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      const colorTable = SCRATCH_GTIA_COLOR_TABLE;
      let mask = 0x00;
      let data = 0;

      for (let cycle = 0; cycle < playfieldCycles; cycle++) {
        const priorMode = (sram[IO_PRIOR] >> 6) & 3;

        if (mask === 0x00) {
          data = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          ctx.cycleCounter++; // DMA steal: display
          mask = 0x80;
        }

        if (priorMode === 0) {
          const cColor0 = sram[IO_COLPF2] & 0xff;
          const cColor1 =
            ((sram[IO_COLPF2] & 0xf0) | (sram[IO_COLPF1] & 0x0f)) & 0xff;

          for (let k = 0; k < 4; k++) {
            if (data & mask) {
              dst[dstIndex] = cColor1;
              prio[dstIndex] = PRIO_PF1;
            } else {
              dst[dstIndex] = cColor0;
              prio[dstIndex] = PRIO_PF2;
            }
            dstIndex++;
            mask >>= 1;
          }
        } else if (priorMode === 1) {
          const colBk = sram[IO_COLBK] & 0xff;
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
          fillGtiaColorTable(sram, colorTable);
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
          const colBk = sram[IO_COLBK] & 0xff;
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

        clockAction(ctx);
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLine(ctx) {
      const io = ctx.ioData;
      const sram = ctx.sram;
      const video = io.videoOut;
      const screenPixels = video.pixels;
      const screenPriority = video.priority;

      const y = io.video.currentDisplayLine | 0;

      // Sync clock to start of line draw window
      const lineStartClock = io.displayListFetchCycle - CYCLES_PER_LINE;
      if (io.clock < lineStartClock) io.clock = lineStartClock;
      io.drawLine.playerMissileClockActive = false;
      io.drawLine.playerMissileInterleaved = false;

      if (y < FIRST_VISIBLE_LINE || y > LAST_VISIBLE_LINE) {
        for (let i = 0; i < 114; i++) clockAction(ctx);
        return;
      }

      const dmactl = sram[IO_DMACTL] & 0xff;
      const pfWidth = dmactl & 0x03;
      const pfDma = dmactl & 0x20;

      if (pfDma && pfWidth) {
        const cmd = io.currentDisplayListCommand & 0xff;
        const mode = cmd & 0x0f;

        if (mode < 2) {
          drawInterleavedVisibleBlankLine(
            ctx,
            screenPixels,
            screenPriority,
            y * PIXELS_PER_LINE,
          );
          return;
        }

        const ppb = ANTIC_MODE_INFO[mode].ppb || 8;
        const geometry = computeActiveLineGeometry(
          cmd,
          pfWidth,
          ppb,
          sram[IO_HSCROL] & 0x0f,
        );
        if (!geometry) {
          drawInterleavedVisibleBlankLine(
            ctx,
            screenPixels,
            screenPriority,
            y * PIXELS_PER_LINE,
          );
          return;
        }

        const scratchWidth = video.playfieldScratchWidth | 0;
        video.pixels = video.playfieldScratchPixels;
        video.priority = video.playfieldScratchPriority;
        io.drawLine.playerMissileClockActive = true;
        io.drawLine.playerMissileInterleaved = true;

        const lineBase = y * scratchWidth + PLAYFIELD_SCRATCH_VIEW_X;
        const baseColor = currentBackgroundColor(sram);
        video.playfieldScratchPixels.fill(baseColor, lineBase, lineBase + PIXELS_PER_LINE);
        video.playfieldScratchPriority.fill(PRIO_BKG, lineBase, lineBase + PIXELS_PER_LINE);

        const lineDelta = (io.nextDisplayListLine - io.video.currentDisplayLine) | 0;
        io.drawLine.bytesPerLine = geometry.bytesPerLine;
        io.drawLine.destIndex =
          lineBase + geometry.playfieldStartX;
        io.drawLine.displayMemoryAddress = io.rowDisplayMemoryAddress & 0xffff;

        stepClockActions(ctx, ACTIVE_LINE_COLOR_BURST_CYCLES);
        drawBackgroundClipped(
          ctx,
          video.playfieldScratchPixels,
          video.playfieldScratchPriority,
          lineBase,
          geometry.leftBorderStartX,
          geometry.leftBorderCycles,
        );

        switch (mode) {
          case 2: drawLineMode2(ctx); break;
          case 3: drawLineMode3(ctx); break;
          case 4: drawLineMode4(ctx); break;
          case 5: drawLineMode5(ctx); break;
          case 6: drawLineMode6(ctx); break;
          case 7: drawLineMode7(ctx); break;
          case 8: drawLineMode8(ctx); break;
          case 9: drawLineMode9(ctx); break;
          case 0x0a: drawLineModeA(ctx); break;
          case 0x0b: drawLineModeB(ctx); break;
          case 0x0c: drawLineModeC(ctx); break;
          case 0x0d: drawLineModeD(ctx); break;
          case 0x0e: drawLineModeE(ctx); break;
          case 0x0f: drawLineModeF(ctx); break;
          default:
            {
              const start =
                lineBase + geometry.playfieldStartX;
              const pixelsToFill = geometry.playfieldPixelWidth;
              const dst = video.playfieldScratchPixels;
              const prio = video.playfieldScratchPriority;
              const color = currentBackgroundColor(sram);
              for (let i = 0; i < pixelsToFill; i++) {
                dst[start + i] = color;
                prio[start + i] = PRIO_BKG;
              }
              const pfCycles = geometry.playfieldCycles;
              for (let i = 0; i < pfCycles; i++) clockAction(ctx);
            }
            break;
        }

        if (io.firstRowScanline) {
          advanceDisplayMemoryRow(io);
          io.firstRowScanline = false;
        }

        if (io.clock < lineStartClock + 114) {
          drawBackgroundClipped(
            ctx,
            video.playfieldScratchPixels,
            video.playfieldScratchPriority,
            lineBase,
            geometry.playfieldStartX + geometry.playfieldPixelWidth,
            lineStartClock + 114 - io.clock,
          );
        }

        copyScratchLine(
          video,
          y,
          scratchWidth,
          screenPixels,
          screenPriority,
        );
        io.drawLine.playerMissileClockActive = false;
        video.pixels = screenPixels;
        video.priority = screenPriority;
      } else {
        drawInterleavedVisibleBlankLine(
          ctx,
          screenPixels,
          screenPriority,
          y * PIXELS_PER_LINE,
        );
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
