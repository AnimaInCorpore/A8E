(function () {
  "use strict";

  function createApi(cfg) {
    const Util = cfg.Util;

    const PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;
    const CYCLES_PER_LINE = cfg.CYCLES_PER_LINE;
    const FIRST_VISIBLE_LINE = cfg.FIRST_VISIBLE_LINE;
    const LAST_VISIBLE_LINE = cfg.LAST_VISIBLE_LINE;

    const IO_DMACTL = cfg.IO_DMACTL;
    const IO_HSCROL = cfg.IO_HSCROL;

    const ANTIC_MODE_INFO = cfg.ANTIC_MODE_INFO;

    const rendererApi =
      window.A8EPlayfieldRenderer &&
      typeof window.A8EPlayfieldRenderer.createApi === "function"
        ? window.A8EPlayfieldRenderer.createApi(cfg)
        : null;
    if (!rendererApi) throw new Error("A8EPlayfieldRenderer is not loaded");

    const PLAYFIELD_SCRATCH_VIEW_X = 64;
    const ACTIVE_LINE_HSYNC_PIXELS = 32;
    const ACTIVE_LINE_COLOR_BURST_CYCLES = 6;
    const PMG_PRIORITY_MASK =
      0x10 | 0x20 | 0x40 | 0x80 | 0x100 | 0x200 | 0x400 | 0x800;

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

    function fillBackgroundSpan(
      linePixels,
      linePriority,
      startX,
      endX,
      color,
      bPrio,
      preservePmgPixels,
    ) {
      const clampedStart = Math.max(0, startX | 0);
      const clampedEnd = Math.min(PIXELS_PER_LINE, endX | 0);
      if (clampedEnd <= clampedStart) return;
      if (preservePmgPixels) {
        for (let x = clampedStart; x < clampedEnd; x++) {
          if ((linePriority[x] & PMG_PRIORITY_MASK) === 0) {
            linePixels[x] = color;
            linePriority[x] = bPrio;
          }
        }
        return;
      }
      linePixels.fill(color, clampedStart, clampedEnd);
      linePriority.fill(bPrio, clampedStart, clampedEnd);
    }

    function computeHscrollVisibleAperture(cmd, pfWidth, ppb) {
      if ((cmd & 0x10) === 0) return null;
      if ((pfWidth & 0x03) === 0x03) return null;
      const baseGeometry = computeActiveLineGeometry(cmd & ~0x10, pfWidth, ppb, 0);
      if (!baseGeometry) return null;
      return {
        startX: baseGeometry.playfieldStartX | 0,
        pixelWidth: baseGeometry.playfieldPixelWidth | 0,
      };
    }

    function drawLine(ctx) {
      const io = ctx.ioData;
      const sram = ctx.sram;
      const video = io.videoOut;
      const screenPixels = video.pixels;
      const screenPriority = video.priority;

      const y = io.video.currentDisplayLine | 0;

      const lineStartClock = io.displayListFetchCycle;
      if (io.clock < lineStartClock) io.clock = lineStartClock;
      io.drawLine.playerMissileClockActive = false;
      io.drawLine.playerMissileInterleaved = false;

      if (y < FIRST_VISIBLE_LINE || y > LAST_VISIBLE_LINE) {
        rendererApi.stepClockActions(ctx, CYCLES_PER_LINE);
        return;
      }

      const dmactl = sram[IO_DMACTL] & 0xff;
      const hscrol = sram[IO_HSCROL] & 0x0f;
      const pfWidth = dmactl & 0x03;
      const pfDma = dmactl & 0x20;

      if (pfDma && pfWidth) {
        const cmd = io.currentDisplayListCommand & 0xff;
        const mode = cmd & 0x0f;
        
        rendererApi.initScanline(ctx, mode, dmactl, hscrol);

        if (mode < 2) {
          rendererApi.drawInterleavedVisibleBlankLine(
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
          hscrol,
        );
        const hscrollVisibleAperture = computeHscrollVisibleAperture(
          cmd,
          pfWidth,
          ppb,
        );
        if (!geometry) {
          rendererApi.drawInterleavedVisibleBlankLine(
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
        const baseColor = rendererApi.currentBackgroundColor(sram);
        const basePrio = rendererApi.currentBackgroundPriority(sram);
        video.playfieldScratchPixels.fill(baseColor, lineBase, lineBase + PIXELS_PER_LINE);
        video.playfieldScratchPriority.fill(basePrio, lineBase, lineBase + PIXELS_PER_LINE);

        io.drawLine.bytesPerLine = geometry.bytesPerLine;
        io.drawLine.destIndex = lineBase + geometry.playfieldStartX;
        io.drawLine.displayMemoryAddress = io.rowDisplayMemoryAddress & 0xffff;

        rendererApi.stepClockActions(ctx, ACTIVE_LINE_COLOR_BURST_CYCLES);
        rendererApi.drawBackgroundClipped(
          ctx,
          video.playfieldScratchPixels,
          video.playfieldScratchPriority,
          lineBase,
          geometry.leftBorderStartX,
          geometry.leftBorderCycles,
        );

        if (!rendererApi.drawModeLine(mode, ctx)) {
          const start = lineBase + geometry.playfieldStartX;
          const pixelsToFill = geometry.playfieldPixelWidth;
          const dst = video.playfieldScratchPixels;
          const prio = video.playfieldScratchPriority;
          const color = rendererApi.currentBackgroundColor(sram);
          const bgPrio = rendererApi.currentBackgroundPriority(sram);
          for (let i = 0; i < pixelsToFill; i++) {
            dst[start + i] = color;
            prio[start + i] = bgPrio;
          }
          rendererApi.stepClockActions(ctx, geometry.playfieldCycles);
        }

        if (io.firstRowScanline) {
          advanceDisplayMemoryRow(io);
          io.firstRowScanline = false;
        }

        if (hscrollVisibleAperture) {
          const fetchStartX = geometry.playfieldStartX | 0;
          const fetchEndX = (fetchStartX + geometry.playfieldPixelWidth) | 0;
          const visibleStartX = hscrollVisibleAperture.startX | 0;
          const visibleEndX = (visibleStartX + hscrollVisibleAperture.pixelWidth) | 0;
          const linePixels = video.playfieldScratchPixels.subarray(
            lineBase,
            lineBase + PIXELS_PER_LINE,
          );
          const linePriority = video.playfieldScratchPriority.subarray(
            lineBase,
            lineBase + PIXELS_PER_LINE,
          );

          fillBackgroundSpan(
            linePixels,
            linePriority,
            fetchStartX,
            Math.min(fetchEndX, visibleStartX),
            baseColor,
            rendererApi.currentBackgroundPriority(sram),
            true,
          );
          fillBackgroundSpan(
            linePixels,
            linePriority,
            Math.max(fetchStartX, visibleEndX),
            fetchEndX,
            baseColor,
            rendererApi.currentBackgroundPriority(sram),
            true,
          );
        }

        if (io.clock < lineStartClock + CYCLES_PER_LINE) {
          rendererApi.drawBackgroundClipped(
            ctx,
            video.playfieldScratchPixels,
            video.playfieldScratchPriority,
            lineBase,
            geometry.playfieldStartX + geometry.playfieldPixelWidth,
            lineStartClock + CYCLES_PER_LINE - io.clock,
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
        rendererApi.drawInterleavedVisibleBlankLine(
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
