(function () {
  "use strict";

  function createApi(cfg) {
    var CPU = cfg.CPU;
    var Util = cfg.Util;

    var PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;
    var CYCLES_PER_LINE = cfg.CYCLES_PER_LINE;
    var LINES_PER_SCREEN_PAL = cfg.LINES_PER_SCREEN_PAL;
    var CYCLE_NEVER = cfg.CYCLE_NEVER;
    var FIRST_VISIBLE_LINE = cfg.FIRST_VISIBLE_LINE;
    var LAST_VISIBLE_LINE = cfg.LAST_VISIBLE_LINE;

    var NMI_DLI = cfg.NMI_DLI;
    var NMI_VBI = cfg.NMI_VBI;

    var IRQ_TIMER_1 = cfg.IRQ_TIMER_1;
    var IRQ_TIMER_2 = cfg.IRQ_TIMER_2;
    var IRQ_TIMER_4 = cfg.IRQ_TIMER_4;
    var IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE = cfg.IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE;
    var IRQ_SERIAL_OUTPUT_DATA_NEEDED = cfg.IRQ_SERIAL_OUTPUT_DATA_NEEDED;
    var IRQ_SERIAL_INPUT_DATA_READY = cfg.IRQ_SERIAL_INPUT_DATA_READY;

    var IO_VCOUNT = cfg.IO_VCOUNT;
    var IO_NMIEN = cfg.IO_NMIEN;
    var IO_NMIRES_NMIST = cfg.IO_NMIRES_NMIST;
    var IO_IRQEN_IRQST = cfg.IO_IRQEN_IRQST;
    var IO_DMACTL = cfg.IO_DMACTL;
    var IO_VSCROL = cfg.IO_VSCROL;
    var IO_CHACTL = cfg.IO_CHACTL;
    var IO_CHBASE = cfg.IO_CHBASE;
    var IO_COLBK = cfg.IO_COLBK;
    var IO_COLPF0 = cfg.IO_COLPF0;
    var IO_COLPF1 = cfg.IO_COLPF1;
    var IO_COLPF2 = cfg.IO_COLPF2;
    var IO_COLPF3 = cfg.IO_COLPF3;
    var IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    var IO_PRIOR = cfg.IO_PRIOR;
    var IO_HSCROL = cfg.IO_HSCROL;

    var ANTIC_MODE_INFO = cfg.ANTIC_MODE_INFO;
    var drawPlayerMissiles = cfg.drawPlayerMissiles;
    var pokeyTimerPeriodCpuCycles = cfg.pokeyTimerPeriodCpuCycles;
    var cycleTimedEventUpdate = cfg.cycleTimedEventUpdate;
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
    var playfieldApi =
      window.A8EPlayfield && window.A8EPlayfield.createApi
        ? window.A8EPlayfield.createApi({
            CPU: CPU,
            Util: Util,
            PIXELS_PER_LINE: PIXELS_PER_LINE,
            FIRST_VISIBLE_LINE: FIRST_VISIBLE_LINE,
            LAST_VISIBLE_LINE: LAST_VISIBLE_LINE,
            IO_CHACTL: IO_CHACTL,
            IO_CHBASE: IO_CHBASE,
            IO_COLBK: IO_COLBK,
            IO_COLPF0: IO_COLPF0,
            IO_COLPF1: IO_COLPF1,
            IO_COLPF2: IO_COLPF2,
            IO_COLPF3: IO_COLPF3,
            IO_COLPM0_TRIG2: IO_COLPM0_TRIG2,
            IO_DMACTL: IO_DMACTL,
            IO_HSCROL: IO_HSCROL,
            IO_PRIOR: IO_PRIOR,
            ANTIC_MODE_INFO: ANTIC_MODE_INFO,
            PRIO_BKG: PRIO_BKG,
            PRIO_PF0: PRIO_PF0,
            PRIO_PF1: PRIO_PF1,
            PRIO_PF2: PRIO_PF2,
            PRIORITY_TABLE_BKG_PF012: PRIORITY_TABLE_BKG_PF012,
            PRIORITY_TABLE_BKG_PF013: PRIORITY_TABLE_BKG_PF013,
            PRIORITY_TABLE_PF0123: PRIORITY_TABLE_PF0123,
            SCRATCH_GTIA_COLOR_TABLE: SCRATCH_GTIA_COLOR_TABLE,
            SCRATCH_COLOR_TABLE_A: SCRATCH_COLOR_TABLE_A,
            SCRATCH_COLOR_TABLE_B: SCRATCH_COLOR_TABLE_B,
            SCRATCH_BACKGROUND_TABLE: SCRATCH_BACKGROUND_TABLE,
            fillGtiaColorTable: fillGtiaColorTable,
            fillBkgPf012ColorTable: fillBkgPf012ColorTable,
            decodeTextModeCharacter: decodeTextModeCharacter,
            fillLine: fillLine,
          })
        : null;
    if (!playfieldApi) throw new Error("A8EPlayfield is not loaded");
    var drawLine = playfieldApi.drawLine;

    function fetchLine(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      CPU.stall(ctx, 9);

      if (io.video.currentDisplayLine === LAST_VISIBLE_LINE + 1) io.nextDisplayListLine = 8;

      // VBI around scanline 248 (VCOUNT=124)
      if (io.video.currentDisplayLine === 248) {
        ram[IO_NMIRES_NMIST] &= ~NMI_DLI;
        ram[IO_NMIRES_NMIST] |= NMI_VBI;
        if (sram[IO_NMIEN] & NMI_VBI) CPU.nmi(ctx);
      }

      // Playfield DMA active?
      if (sram[IO_DMACTL] & 0x20) {
        if (io.video.currentDisplayLine === io.nextDisplayListLine) {
          var oldCmd = io.currentDisplayListCommand & 0xff;
          io.currentDisplayListCommand = ram[io.displayListAddress & 0xffff] & 0xff;
          io.displayListAddress = Util.fixedAdd(io.displayListAddress, 0x03ff, 1);
          CPU.stall(ctx, 1);

          var cmd = io.currentDisplayListCommand;
          var mode = cmd & 0x0f;
          if (mode <= 0x01) {
            io.nextDisplayListLine += ((cmd & 0x70) >> 4) + 1;
          } else {
            io.nextDisplayListLine += ANTIC_MODE_INFO[mode].lines;
          }

          // Vertical scrolling adjustments (ported from AtariIo.c)
          if ((oldCmd & 0x2f) < 0x22 && (cmd & 0x2f) >= 0x22) {
            io.nextDisplayListLine = Math.max(
              io.video.currentDisplayLine + 1,
              io.nextDisplayListLine - (sram[IO_VSCROL] & 0xff)
            );
            io.video.verticalScrollOffset = 0;
          } else if ((oldCmd & 0x2f) >= 0x22 && (cmd & 0x2f) < 0x22) {
            var temp = io.nextDisplayListLine;
            io.nextDisplayListLine = Math.min(
              io.nextDisplayListLine,
              io.video.currentDisplayLine + (sram[IO_VSCROL] & 0xff) + 1
            );
            io.video.verticalScrollOffset = temp - io.nextDisplayListLine;
          } else {
            io.video.verticalScrollOffset = 0;
          }

          // DLI scheduling
          if (cmd & 0x80) {
            io.dliCycle = ctx.cycleCounter + (io.nextDisplayListLine - io.video.currentDisplayLine - 1) * CYCLES_PER_LINE;
            cycleTimedEventUpdate(ctx);
          }

          // JMP
          if ((cmd & 0x0f) === 0x01) {
            io.displayListAddress =
              ram[io.displayListAddress & 0xffff] | (ram[(io.displayListAddress + 1) & 0xffff] << 8);
          }

          // Wait for VBL (JVB)
          if (cmd === 0x41) io.nextDisplayListLine = 8;

          // Load memory scan (LMS)
          if ((cmd & 0x4f) >= 0x42) {
            io.displayMemoryAddress = ram[io.displayListAddress & 0xffff] & 0xff;
            io.displayListAddress = Util.fixedAdd(io.displayListAddress, 0x03ff, 1);
            io.displayMemoryAddress |= (ram[io.displayListAddress & 0xffff] & 0xff) << 8;
            io.displayListAddress = Util.fixedAdd(io.displayListAddress, 0x03ff, 1);
          }
        }
      }
    }

    function ioCycleTimedEvent(ctx) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;

      if (ctx.cycleCounter >= io.displayListFetchCycle) {
        io.video.currentDisplayLine++;
        if (io.video.currentDisplayLine >= LINES_PER_SCREEN_PAL) {
          io.video.currentDisplayLine = 0;
          io.nextDisplayListLine = 8;
        }
        ram[IO_VCOUNT] = (io.video.currentDisplayLine >> 1) & 0xff;
        fetchLine(ctx);
        io.displayListFetchCycle += CYCLES_PER_LINE;
      }

      if (ctx.cycleCounter >= io.dliCycle) {
        ram[IO_NMIRES_NMIST] &= ~NMI_VBI;
        ram[IO_NMIRES_NMIST] |= NMI_DLI;
        if (sram[IO_NMIEN] & NMI_DLI) CPU.nmi(ctx);
        io.dliCycle = CYCLE_NEVER;
      }

      if (ctx.cycleCounter >= io.drawLineCycle) {
        if (io.video.currentDisplayLine === 0) io.videoOut.priority.fill(0);
        drawLine(ctx);
        drawPlayerMissiles(ctx);
        io.drawLineCycle += CYCLES_PER_LINE;
      }

      if (ctx.cycleCounter >= io.serialOutputTransmissionDoneCycle) {
        ram[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE;
        if (sram[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE) CPU.irq(ctx);
        io.serialOutputTransmissionDoneCycle = CYCLE_NEVER;
      }

      if (ctx.cycleCounter >= io.serialOutputNeedDataCycle) {
        ram[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_OUTPUT_DATA_NEEDED;
        if (sram[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_DATA_NEEDED) CPU.irq(ctx);
        io.serialOutputNeedDataCycle = CYCLE_NEVER;
      }

      if (ctx.cycleCounter >= io.serialInputDataReadyCycle) {
        ram[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_INPUT_DATA_READY;
        if (sram[IO_IRQEN_IRQST] & IRQ_SERIAL_INPUT_DATA_READY) CPU.irq(ctx);
        io.serialInputDataReadyCycle = CYCLE_NEVER;
      }

      if (ctx.cycleCounter >= io.timer1Cycle) {
        var p1 = pokeyTimerPeriodCpuCycles(ctx, 1);
        ram[IO_IRQEN_IRQST] &= ~IRQ_TIMER_1;
        if (sram[IO_IRQEN_IRQST] & IRQ_TIMER_1) CPU.irq(ctx);
        if (p1 === 0) io.timer1Cycle = CYCLE_NEVER;
        else {
          while (io.timer1Cycle <= ctx.cycleCounter) io.timer1Cycle += p1;
        }
      }

      if (ctx.cycleCounter >= io.timer2Cycle) {
        var p2 = pokeyTimerPeriodCpuCycles(ctx, 2);
        ram[IO_IRQEN_IRQST] &= ~IRQ_TIMER_2;
        if (sram[IO_IRQEN_IRQST] & IRQ_TIMER_2) CPU.irq(ctx);
        if (p2 === 0) io.timer2Cycle = CYCLE_NEVER;
        else {
          while (io.timer2Cycle <= ctx.cycleCounter) io.timer2Cycle += p2;
        }
      }

      if (ctx.cycleCounter >= io.timer4Cycle) {
        var p4 = pokeyTimerPeriodCpuCycles(ctx, 4);
        ram[IO_IRQEN_IRQST] &= ~IRQ_TIMER_4;
        if (sram[IO_IRQEN_IRQST] & IRQ_TIMER_4) CPU.irq(ctx);
        if (p4 === 0) io.timer4Cycle = CYCLE_NEVER;
        else {
          while (io.timer4Cycle <= ctx.cycleCounter) io.timer4Cycle += p4;
        }
      }

      cycleTimedEventUpdate(ctx);
    }

    return {
      fetchLine: fetchLine,
      ioCycleTimedEvent: ioCycleTimedEvent,
    };
  }

  window.A8EAntic = {
    createApi: createApi,
  };
})();
