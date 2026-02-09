(function () {
  "use strict";

  function createApi(cfg) {
    var CPU = cfg.CPU;
    var Util = cfg.Util;

    var PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;
    var FIRST_VISIBLE_LINE = cfg.FIRST_VISIBLE_LINE;
    var LAST_VISIBLE_LINE = cfg.LAST_VISIBLE_LINE;

    var IO_CHACTL = cfg.IO_CHACTL;
    var IO_CHBASE = cfg.IO_CHBASE;
    var IO_COLBK = cfg.IO_COLBK;
    var IO_COLPF0 = cfg.IO_COLPF0;
    var IO_COLPF1 = cfg.IO_COLPF1;
    var IO_COLPF2 = cfg.IO_COLPF2;
    var IO_COLPF3 = cfg.IO_COLPF3;
    var IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    var IO_DMACTL = cfg.IO_DMACTL;
    var IO_HSCROL = cfg.IO_HSCROL;
    var IO_PRIOR = cfg.IO_PRIOR;

    var ANTIC_MODE_INFO = cfg.ANTIC_MODE_INFO;

    var PRIO_BKG = cfg.PRIO_BKG;
    var PRIO_PF0 = cfg.PRIO_PF0;
    var PRIO_PF1 = cfg.PRIO_PF1;
    var PRIO_PF2 = cfg.PRIO_PF2;
    var PRIORITY_TABLE_BKG_PF012 = cfg.PRIORITY_TABLE_BKG_PF012;
    var PRIORITY_TABLE_BKG_PF013 = cfg.PRIORITY_TABLE_BKG_PF013;
    var PRIORITY_TABLE_PF0123 = cfg.PRIORITY_TABLE_PF0123;
    var SCRATCH_GTIA_COLOR_TABLE = cfg.SCRATCH_GTIA_COLOR_TABLE;
    var SCRATCH_COLOR_TABLE_A = cfg.SCRATCH_COLOR_TABLE_A;
    var SCRATCH_COLOR_TABLE_B = cfg.SCRATCH_COLOR_TABLE_B;
    var SCRATCH_BACKGROUND_TABLE = cfg.SCRATCH_BACKGROUND_TABLE;

    var fillGtiaColorTable = cfg.fillGtiaColorTable;
    var fillBkgPf012ColorTable = cfg.fillBkgPf012ColorTable;
    var decodeTextModeCharacter = cfg.decodeTextModeCharacter;
    var fillLine = cfg.fillLine;

    function drawLineMode2(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      var vScrollOffset = 8 - lineDelta - (io.video.verticalScrollOffset | 0);
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      var bytesPerLine = io.drawLine.bytesPerLine | 0;
      var dst = io.videoOut.pixels;
      var prio = io.videoOut.priority;
      var dstIndex = io.drawLine.destIndex | 0;
      var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      var chactl = sram[IO_CHACTL] & 0x03;
      var priorMode = (sram[IO_PRIOR] >> 6) & 3;
      var colorTable = SCRATCH_GTIA_COLOR_TABLE;
      fillGtiaColorTable(sram, colorTable);
      var colPf1 = sram[IO_COLPF1] & 0xff;
      var colPf2 = sram[IO_COLPF2] & 0xff;
      var colBk = sram[IO_COLBK] & 0xff;
      var c0Inverse = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;
      var c1Inverse = colPf2 & 0xff;
      var c0Normal = colPf2 & 0xff;
      var c1Normal = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;

      var chBase = (sram[IO_CHBASE] << 8) & 0xfc00 & 0xffff;

      for (var i = 0; i < bytesPerLine; i++) {
        var decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
        var ch = decoded & 0xff;
        var inverse = (decoded & 0x100) !== 0;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

        var c0 = inverse ? c0Inverse : c0Normal;
        var c1 = inverse ? c1Inverse : c1Normal;
        var p0 = inverse ? PRIO_PF1 : PRIO_PF2;
        var p1 = inverse ? PRIO_PF2 : PRIO_PF1;

        var glyph =
          ram[(chBase + ch * 8 + (vScrollOffset & 0xff)) & 0xffff] & 0xff;

        if (priorMode === 0) {
          for (var b = 0; b < 8; b++) {
            if (glyph & 0x80) {
              dst[dstIndex] = c1;
              prio[dstIndex] = p1;
            } else {
              dst[dstIndex] = c0;
              prio[dstIndex] = p0;
            }
            dstIndex++;
            glyph = (glyph << 1) & 0xff;
          }
        } else if (priorMode === 1) {
          // GTIA mode 9-ish: 2 pixels of 4 bits each mixed with COLBK.
          var hi = glyph >> 4;
          var lo = glyph & 0x0f;
          var col = (colBk | hi) & 0xff;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          col = (colBk | lo) & 0xff;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
        } else if (priorMode === 2) {
          var hi2 = colorTable[glyph >> 4] & 0xff;
          dst[dstIndex++] = hi2;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = hi2;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = hi2;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = hi2;
          prio[dstIndex - 1] = PRIO_BKG;
          var lo2 = colorTable[glyph & 0x0f] & 0xff;
          dst[dstIndex++] = lo2;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = lo2;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = lo2;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = lo2;
          prio[dstIndex - 1] = PRIO_BKG;
        } else {
          var hi3 = glyph & 0xf0 ? colBk | (glyph & 0xf0) : colBk & 0xf0;
          dst[dstIndex++] = hi3;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = hi3;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = hi3;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = hi3;
          prio[dstIndex - 1] = PRIO_BKG;
          var lo3 = glyph & 0x0f ? colBk | ((glyph << 4) & 0xf0) : colBk & 0xf0;
          dst[dstIndex++] = lo3;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = lo3;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = lo3;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = lo3;
          prio[dstIndex - 1] = PRIO_BKG;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode3(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        // Note: matches the C emulator (no FIXED_ADD with $0FFF here).
        io.displayMemoryAddress =
          (io.displayMemoryAddress + (io.drawLine.bytesPerLine | 0)) & 0xffff;
      }

      var bytesPerLine = io.drawLine.bytesPerLine | 0;
      var dst = io.videoOut.pixels;
      var prio = io.videoOut.priority;
      var dstIndex = io.drawLine.destIndex | 0;
      var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      var chactl = sram[IO_CHACTL] & 0x03;
      var colPf1 = sram[IO_COLPF1] & 0xff;
      var colPf2 = sram[IO_COLPF2] & 0xff;
      var c0Inverse = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;
      var c1Inverse = colPf2 & 0xff;
      var c0Normal = colPf2 & 0xff;
      var c1Normal = ((colPf2 & 0xf0) | (colPf1 & 0x0f)) & 0xff;

      for (var i = 0; i < bytesPerLine; i++) {
        var decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
        var ch = decoded & 0xff;
        var inverse = (decoded & 0x100) !== 0;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

        var c0 = inverse ? c0Inverse : c0Normal;
        var c1 = inverse ? c1Inverse : c1Normal;
        var p0 = inverse ? PRIO_PF1 : PRIO_PF2;
        var p1 = inverse ? PRIO_PF2 : PRIO_PF1;

        var data = 0;
        if (ch < 0x60) {
          if (lineDelta > 2) {
            data =
              ram[
                ((((sram[IO_CHBASE] & 0xff) << 8) & 0xfc00) +
                  ch * 8 +
                  (10 - lineDelta)) &
                  0xffff
              ] & 0xff;
          }
        } else {
          if (lineDelta > 8) {
            data = 0;
          } else if (lineDelta > 2) {
            data =
              ram[
                (((sram[IO_CHBASE] & 0xff) << 8) + ch * 8 + (10 - lineDelta)) &
                  0xffff
              ] & 0xff;
          } else {
            data =
              ram[
                (((sram[IO_CHBASE] & 0xff) << 8) + ch * 8 + (2 - lineDelta)) &
                  0xffff
              ] & 0xff;
          }
        }

        for (var x = 0; x < 8; x++) {
          if (data & 0x80) {
            dst[dstIndex] = c1;
            prio[dstIndex] = p1;
          } else {
            dst[dstIndex] = c0;
            prio[dstIndex] = p0;
          }
          dstIndex++;
          data = (data << 1) & 0xff;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode4(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      var vScrollOffset = 8 - lineDelta - (io.video.verticalScrollOffset | 0);
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      var chactl = sram[IO_CHACTL] & 0x03;
      var aColorTable0 = SCRATCH_COLOR_TABLE_A;
      var aColorTable1 = SCRATCH_COLOR_TABLE_B;
      fillBkgPf012ColorTable(sram, aColorTable0);
      aColorTable1[0] = sram[IO_COLBK] & 0xff;
      aColorTable1[1] = sram[IO_COLPF0] & 0xff;
      aColorTable1[2] = sram[IO_COLPF1] & 0xff;
      aColorTable1[3] = sram[IO_COLPF3] & 0xff;

      var bytesPerLine = io.drawLine.bytesPerLine | 0;
      var dst = io.videoOut.pixels;
      var prio = io.videoOut.priority;
      var dstIndex = io.drawLine.destIndex | 0;
      var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      var chBase = ((sram[IO_CHBASE] & 0xff) << 8) & 0xfc00 & 0xffff;

      for (var i = 0; i < bytesPerLine; i++) {
        var decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
        var ch = decoded & 0xff;
        var inverse = (decoded & 0x100) !== 0;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

        var colorTable = aColorTable0;
        var prioTable = PRIORITY_TABLE_BKG_PF012;
        if (inverse) {
          colorTable = aColorTable1;
          prioTable = PRIORITY_TABLE_BKG_PF013;
        }

        var data =
          ram[(chBase + ch * 8 + (vScrollOffset & 0xff)) & 0xffff] & 0xff;
        for (var x = 0; x < 8; x += 2) {
          var idx = (data >> (6 - x)) & 0x03;
          var c = colorTable[idx] & 0xff;
          var p = prioTable[idx] & 0xff;
          dst[dstIndex] = c;
          prio[dstIndex] = p;
          dst[dstIndex + 1] = c;
          prio[dstIndex + 1] = p;
          dstIndex += 2;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode5(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      var vScrollOffset =
        ((16 - lineDelta - (io.video.verticalScrollOffset | 0)) >> 1) & 0xff;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      var chactl = sram[IO_CHACTL] & 0x03;
      var aColorTable0 = SCRATCH_COLOR_TABLE_A;
      var aColorTable1 = SCRATCH_COLOR_TABLE_B;
      fillBkgPf012ColorTable(sram, aColorTable0);
      aColorTable1[0] = sram[IO_COLBK] & 0xff;
      aColorTable1[1] = sram[IO_COLPF0] & 0xff;
      aColorTable1[2] = sram[IO_COLPF1] & 0xff;
      aColorTable1[3] = sram[IO_COLPF3] & 0xff;

      var bytesPerLine = io.drawLine.bytesPerLine | 0;
      var dst = io.videoOut.pixels;
      var prio = io.videoOut.priority;
      var dstIndex = io.drawLine.destIndex | 0;
      var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      var chBase = ((sram[IO_CHBASE] & 0xff) << 8) & 0xfe00 & 0xffff;

      for (var i = 0; i < bytesPerLine; i++) {
        var decoded = decodeTextModeCharacter(ram[dispAddr] & 0xff, chactl);
        var ch = decoded & 0xff;
        var inverse = (decoded & 0x100) !== 0;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

        var colorTable = aColorTable0;
        var prioTable = PRIORITY_TABLE_BKG_PF012;
        if (inverse) {
          colorTable = aColorTable1;
          prioTable = PRIORITY_TABLE_BKG_PF013;
        }

        var data = ram[(chBase + ch * 8 + vScrollOffset) & 0xffff] & 0xff;
        for (var x = 0; x < 8; x += 2) {
          var idx = (data >> (6 - x)) & 0x03;
          var c = colorTable[idx] & 0xff;
          var p = prioTable[idx] & 0xff;
          dst[dstIndex] = c;
          prio[dstIndex] = p;
          dst[dstIndex + 1] = c;
          prio[dstIndex + 1] = p;
          dstIndex += 2;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode6(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      var vScrollOffset = 8 - lineDelta - (io.video.verticalScrollOffset | 0);
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      var aColorTable = SCRATCH_COLOR_TABLE_A;
      aColorTable[0] = sram[IO_COLPF0] & 0xff;
      aColorTable[1] = sram[IO_COLPF1] & 0xff;
      aColorTable[2] = sram[IO_COLPF2] & 0xff;
      aColorTable[3] = sram[IO_COLPF3] & 0xff;
      var cColor0 = sram[IO_COLBK] & 0xff;

      var bytesPerLine = io.drawLine.bytesPerLine | 0;
      var dst = io.videoOut.pixels;
      var prio = io.videoOut.priority;
      var dstIndex = io.drawLine.destIndex | 0;
      var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      var chBase = ((sram[IO_CHBASE] & 0xff) << 8) & 0xfe00 & 0xffff;

      for (var i = 0; i < bytesPerLine; i++) {
        var ch = ram[dispAddr] & 0xff;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

        var cColor1 = aColorTable[ch >> 6] & 0xff;
        var p = PRIORITY_TABLE_PF0123[ch >> 6] & 0xff;
        ch &= 0x3f;

        var data =
          ram[(chBase + ch * 8 + (vScrollOffset & 0xff)) & 0xffff] & 0xff;
        for (var x = 0; x < 8; x++) {
          if (data & 0x80) {
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
          data = (data << 1) & 0xff;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode7(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      var vScrollOffset =
        ((16 - lineDelta - (io.video.verticalScrollOffset | 0)) >> 1) & 0xff;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      var aColorTable = SCRATCH_COLOR_TABLE_A;
      aColorTable[0] = sram[IO_COLPF0] & 0xff;
      aColorTable[1] = sram[IO_COLPF1] & 0xff;
      aColorTable[2] = sram[IO_COLPF2] & 0xff;
      aColorTable[3] = sram[IO_COLPF3] & 0xff;
      var cColor0 = sram[IO_COLBK] & 0xff;

      var bytesPerLine = io.drawLine.bytesPerLine | 0;
      var dst = io.videoOut.pixels;
      var prio = io.videoOut.priority;
      var dstIndex = io.drawLine.destIndex | 0;
      var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;
      var chBase = ((sram[IO_CHBASE] & 0xff) << 8) & 0xfe00 & 0xffff;

      for (var i = 0; i < bytesPerLine; i++) {
        var ch = ram[dispAddr] & 0xff;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

        var cColor1 = aColorTable[ch >> 6] & 0xff;
        var p = PRIORITY_TABLE_PF0123[ch >> 6] & 0xff;
        ch &= 0x3f;

        var data = ram[(chBase + ch * 8 + vScrollOffset) & 0xffff] & 0xff;
        for (var x = 0; x < 8; x++) {
          if (data & 0x80) {
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
          data = (data << 1) & 0xff;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode8(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      var aColorTable = SCRATCH_COLOR_TABLE_A;
      fillBkgPf012ColorTable(sram, aColorTable);

      var bytesPerLine = io.drawLine.bytesPerLine | 0;
      var dst = io.videoOut.pixels;
      var prio = io.videoOut.priority;
      var dstIndex = io.drawLine.destIndex | 0;
      var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      for (var i = 0; i < bytesPerLine; i++) {
        var data = ram[dispAddr] & 0xff;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

        for (var x = 0; x < 8; x += 2) {
          var idx = (data >> (6 - x)) & 0x03;
          var c = aColorTable[idx] & 0xff;
          var p = PRIORITY_TABLE_BKG_PF012[idx] & 0xff;
          for (var k = 0; k < 8; k++) {
            dst[dstIndex] = c;
            prio[dstIndex] = p;
            dstIndex++;
          }
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineMode9(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      var bytesPerLine = io.drawLine.bytesPerLine | 0;
      var dst = io.videoOut.pixels;
      var prio = io.videoOut.priority;
      var dstIndex = io.drawLine.destIndex | 0;
      var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      var pf0 = sram[IO_COLPF0] & 0xff;
      var bkg = sram[IO_COLBK] & 0xff;

      for (var i = 0; i < bytesPerLine; i++) {
        var data = ram[dispAddr] & 0xff;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

        for (var x = 0; x < 8; x++) {
          var c = data & 0x80 ? pf0 : bkg;
          var p = data & 0x80 ? PRIO_PF0 : PRIO_BKG;
          dst[dstIndex] = c;
          prio[dstIndex] = p;
          dst[dstIndex + 1] = c;
          prio[dstIndex + 1] = p;
          dst[dstIndex + 2] = c;
          prio[dstIndex + 2] = p;
          dst[dstIndex + 3] = c;
          prio[dstIndex + 3] = p;
          dstIndex += 4;
          data = (data << 1) & 0xff;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineModeA(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      var aColorTable = SCRATCH_COLOR_TABLE_A;
      fillBkgPf012ColorTable(sram, aColorTable);

      var bytesPerLine = io.drawLine.bytesPerLine | 0;
      var dst = io.videoOut.pixels;
      var prio = io.videoOut.priority;
      var dstIndex = io.drawLine.destIndex | 0;
      var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      for (var i = 0; i < bytesPerLine; i++) {
        var data = ram[dispAddr] & 0xff;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

        for (var x = 0; x < 8; x += 2) {
          var idx = (data >> (6 - x)) & 0x03;
          var c = aColorTable[idx] & 0xff;
          var p = PRIORITY_TABLE_BKG_PF012[idx] & 0xff;
          dst[dstIndex] = c;
          prio[dstIndex] = p;
          dst[dstIndex + 1] = c;
          prio[dstIndex + 1] = p;
          dst[dstIndex + 2] = c;
          prio[dstIndex + 2] = p;
          dst[dstIndex + 3] = c;
          prio[dstIndex + 3] = p;
          dstIndex += 4;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineModeB(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      var bytesPerLine = io.drawLine.bytesPerLine | 0;
      var dst = io.videoOut.pixels;
      var prio = io.videoOut.priority;
      var dstIndex = io.drawLine.destIndex | 0;
      var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      var pf0 = sram[IO_COLPF0] & 0xff;
      var bkg = sram[IO_COLBK] & 0xff;

      for (var i = 0; i < bytesPerLine; i++) {
        var data = ram[dispAddr] & 0xff;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

        for (var x = 0; x < 8; x++) {
          var c = data & 0x80 ? pf0 : bkg;
          var p = data & 0x80 ? PRIO_PF0 : PRIO_BKG;
          dst[dstIndex] = c;
          prio[dstIndex] = p;
          dst[dstIndex + 1] = c;
          prio[dstIndex + 1] = p;
          dstIndex += 2;
          data = (data << 1) & 0xff;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineModeC(ctx) {
      // Same renderer as mode B in the C emulator.
      drawLineModeB(ctx);
    }

    function drawLineModeD(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      var aColorTable = SCRATCH_COLOR_TABLE_A;
      fillBkgPf012ColorTable(sram, aColorTable);

      var bytesPerLine = io.drawLine.bytesPerLine | 0;
      var dst = io.videoOut.pixels;
      var prio = io.videoOut.priority;
      var dstIndex = io.drawLine.destIndex | 0;
      var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      for (var i = 0; i < bytesPerLine; i++) {
        var data = ram[dispAddr] & 0xff;
        dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);

        for (var x = 0; x < 8; x += 2) {
          var idx = (data >> (6 - x)) & 0x03;
          var c = aColorTable[idx] & 0xff;
          var p = PRIORITY_TABLE_BKG_PF012[idx] & 0xff;
          dst[dstIndex] = c;
          prio[dstIndex] = p;
          dst[dstIndex + 1] = c;
          prio[dstIndex + 1] = p;
          dstIndex += 2;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLineModeE(ctx) {
      // Same renderer as mode D in the C emulator.
      drawLineModeD(ctx);
    }

    function drawLineModeF(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      var lineDelta = io.nextDisplayListLine - io.video.currentDisplayLine;
      if (lineDelta === 1) {
        io.displayMemoryAddress = Util.fixedAdd(
          io.displayMemoryAddress,
          0x0fff,
          io.drawLine.bytesPerLine,
        );
      }

      var bytesPerLine = io.drawLine.bytesPerLine | 0;
      var dst = io.videoOut.pixels;
      var prio = io.videoOut.priority;
      var dstIndex = io.drawLine.destIndex | 0;
      var dispAddr = io.drawLine.displayMemoryAddress & 0xffff;

      var cColor0 = sram[IO_COLPF2] & 0xff;
      var cColor1 =
        ((sram[IO_COLPF2] & 0xf0) | (sram[IO_COLPF1] & 0x0f)) & 0xff;

      var colorTable = SCRATCH_GTIA_COLOR_TABLE;
      fillGtiaColorTable(sram, colorTable);
      var colBk = sram[IO_COLBK] & 0xff;

      var priorMode = (sram[IO_PRIOR] >> 6) & 3;

      if (priorMode === 0) {
        for (var i = 0; i < bytesPerLine; i++) {
          var data = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          for (var x = 0; x < 8; x++) {
            if (data & 0x80) {
              dst[dstIndex] = cColor1;
              prio[dstIndex] = PRIO_PF1;
            } else {
              dst[dstIndex] = cColor0;
              prio[dstIndex] = PRIO_PF2;
            }
            dstIndex++;
            data = (data << 1) & 0xff;
          }
        }
      } else if (priorMode === 1) {
        for (var i1 = 0; i1 < bytesPerLine; i1++) {
          var d1 = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          var col = (colBk | (d1 >> 4)) & 0xff;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          col = (colBk | (d1 & 0x0f)) & 0xff;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = col;
          prio[dstIndex - 1] = PRIO_BKG;
        }
      } else if (priorMode === 2) {
        for (var i2 = 0; i2 < bytesPerLine; i2++) {
          var d2 = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          var hi = colorTable[d2 >> 4] & 0xff;
          dst[dstIndex++] = hi;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = hi;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = hi;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = hi;
          prio[dstIndex - 1] = PRIO_BKG;
          var lo = colorTable[d2 & 0x0f] & 0xff;
          dst[dstIndex++] = lo;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = lo;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = lo;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = lo;
          prio[dstIndex - 1] = PRIO_BKG;
        }
      } else {
        for (var i3 = 0; i3 < bytesPerLine; i3++) {
          var d3 = ram[dispAddr] & 0xff;
          dispAddr = Util.fixedAdd(dispAddr, 0x0fff, 1);
          var hi3 = d3 & 0xf0 ? colBk | (d3 & 0xf0) : colBk & 0xf0;
          dst[dstIndex++] = hi3;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = hi3;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = hi3;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = hi3;
          prio[dstIndex - 1] = PRIO_BKG;
          var lo3 = d3 & 0x0f ? colBk | ((d3 << 4) & 0xf0) : colBk & 0xf0;
          dst[dstIndex++] = lo3;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = lo3;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = lo3;
          prio[dstIndex - 1] = PRIO_BKG;
          dst[dstIndex++] = lo3;
          prio[dstIndex - 1] = PRIO_BKG;
        }
      }

      io.drawLine.displayMemoryAddress = dispAddr & 0xffff;
    }

    function drawLine(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;
      var video = io.videoOut;

      var y = io.video.currentDisplayLine | 0;
      if (y < FIRST_VISIBLE_LINE || y > LAST_VISIBLE_LINE) return;

      var prior = sram[IO_PRIOR] & 0xff;
      SCRATCH_BACKGROUND_TABLE[0] = sram[IO_COLBK] & 0xff;
      SCRATCH_BACKGROUND_TABLE[1] = sram[IO_COLBK] & 0xff;
      SCRATCH_BACKGROUND_TABLE[2] = sram[IO_COLPM0_TRIG2] & 0xff;
      SCRATCH_BACKGROUND_TABLE[3] = sram[IO_COLBK] & 0xf0;
      var bkg = SCRATCH_BACKGROUND_TABLE[(prior >> 6) & 3] & 0xff;

      var dmactl = sram[IO_DMACTL] & 0xff;
      var pfWidth = dmactl & 0x03;
      var pfDma = dmactl & 0x20;

      if (pfDma && pfWidth) {
        var cmd = io.currentDisplayListCommand & 0xff;
        var mode = cmd & 0x0f;

        if (mode < 2) {
          fillLine(video, y, 0, PIXELS_PER_LINE, bkg, PRIO_BKG);
          return;
        }

        var playfieldPixels = 192 + pfWidth * 64;
        var leftBorder = 0;
        var rightBorder = 0;
        var destIndex = y * PIXELS_PER_LINE;

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

        var ppb = ANTIC_MODE_INFO[mode].ppb || 8;
        var bytesPerLine = (playfieldPixels / ppb) | 0;

        if (cmd & 0x10) {
          // HSCROL
          var h = sram[IO_HSCROL] & 0xff;
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
          fillLine(
            video,
            y,
            playfieldPixels + leftBorder,
            rightBorder,
            bkg,
            PRIO_BKG,
          );
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
