(function () {
  "use strict";

  function createApi(cfg) {
    var CPU = cfg.CPU;
    var CYCLES_PER_LINE = cfg.CYCLES_PER_LINE;
    var NMI_DLI = cfg.NMI_DLI;
    var NMI_VBI = cfg.NMI_VBI;
    var NMI_RESET = cfg.NMI_RESET;
    var IO_AUDC1_POT1 = cfg.IO_AUDC1_POT1;
    var IO_AUDC2_POT3 = cfg.IO_AUDC2_POT3;
    var IO_AUDC3_POT5 = cfg.IO_AUDC3_POT5;
    var IO_AUDC4_POT7 = cfg.IO_AUDC4_POT7;
    var IO_AUDCTL_ALLPOT = cfg.IO_AUDCTL_ALLPOT;
    var IO_AUDF1_POT0 = cfg.IO_AUDF1_POT0;
    var IO_AUDF2_POT2 = cfg.IO_AUDF2_POT2;
    var IO_AUDF3_POT4 = cfg.IO_AUDF3_POT4;
    var IO_AUDF4_POT6 = cfg.IO_AUDF4_POT6;
    var IO_CHACTL = cfg.IO_CHACTL;
    var IO_CHBASE = cfg.IO_CHBASE;
    var IO_COLBK = cfg.IO_COLBK;
    var IO_COLPF0 = cfg.IO_COLPF0;
    var IO_COLPF1 = cfg.IO_COLPF1;
    var IO_COLPF2 = cfg.IO_COLPF2;
    var IO_COLPF3 = cfg.IO_COLPF3;
    var IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    var IO_COLPM1_TRIG3 = cfg.IO_COLPM1_TRIG3;
    var IO_COLPM2_PAL = cfg.IO_COLPM2_PAL;
    var IO_COLPM3 = cfg.IO_COLPM3;
    var IO_CONSOL = cfg.IO_CONSOL;
    var IO_DLISTH = cfg.IO_DLISTH;
    var IO_DLISTL = cfg.IO_DLISTL;
    var IO_DMACTL = cfg.IO_DMACTL;
    var IO_GRACTL = cfg.IO_GRACTL;
    var IO_GRAFM_TRIG1 = cfg.IO_GRAFM_TRIG1;
    var IO_GRAFP0_P1PL = cfg.IO_GRAFP0_P1PL;
    var IO_GRAFP1_P2PL = cfg.IO_GRAFP1_P2PL;
    var IO_GRAFP2_P3PL = cfg.IO_GRAFP2_P3PL;
    var IO_GRAFP3_TRIG0 = cfg.IO_GRAFP3_TRIG0;
    var IO_HITCLR = cfg.IO_HITCLR;
    var IO_HPOSM0_P0PF = cfg.IO_HPOSM0_P0PF;
    var IO_HPOSM1_P1PF = cfg.IO_HPOSM1_P1PF;
    var IO_HPOSM2_P2PF = cfg.IO_HPOSM2_P2PF;
    var IO_HPOSM3_P3PF = cfg.IO_HPOSM3_P3PF;
    var IO_HPOSP0_M0PF = cfg.IO_HPOSP0_M0PF;
    var IO_HPOSP1_M1PF = cfg.IO_HPOSP1_M1PF;
    var IO_HPOSP2_M2PF = cfg.IO_HPOSP2_M2PF;
    var IO_HPOSP3_M3PF = cfg.IO_HPOSP3_M3PF;
    var IO_HSCROL = cfg.IO_HSCROL;
    var IO_IRQEN_IRQST = cfg.IO_IRQEN_IRQST;
    var IO_NMIEN = cfg.IO_NMIEN;
    var IO_NMIRES_NMIST = cfg.IO_NMIRES_NMIST;
    var IO_PACTL = cfg.IO_PACTL;
    var IO_PBCTL = cfg.IO_PBCTL;
    var IO_PENH = cfg.IO_PENH;
    var IO_PENV = cfg.IO_PENV;
    var IO_PMBASE = cfg.IO_PMBASE;
    var IO_PORTA = cfg.IO_PORTA;
    var IO_PORTB = cfg.IO_PORTB;
    var IO_POTGO = cfg.IO_POTGO;
    var IO_PRIOR = cfg.IO_PRIOR;
    var IO_SEROUT_SERIN = cfg.IO_SEROUT_SERIN;
    var IO_SIZEM_P0PL = cfg.IO_SIZEM_P0PL;
    var IO_SIZEP0_M0PL = cfg.IO_SIZEP0_M0PL;
    var IO_SIZEP1_M1PL = cfg.IO_SIZEP1_M1PL;
    var IO_SIZEP2_M2PL = cfg.IO_SIZEP2_M2PL;
    var IO_SIZEP3_M3PL = cfg.IO_SIZEP3_M3PL;
    var IO_SKCTL_SKSTAT = cfg.IO_SKCTL_SKSTAT;
    var IO_SKREST_RANDOM = cfg.IO_SKREST_RANDOM;
    var IO_STIMER_KBCODE = cfg.IO_STIMER_KBCODE;
    var IO_VCOUNT = cfg.IO_VCOUNT;
    var IO_VDELAY = cfg.IO_VDELAY;
    var IO_VSCROL = cfg.IO_VSCROL;
    var IO_WSYNC = cfg.IO_WSYNC;
    var pokeyAudioSync = cfg.pokeyAudioSync;
    var pokeyAudioOnRegisterWrite = cfg.pokeyAudioOnRegisterWrite;
    var pokeyPotStartScan = cfg.pokeyPotStartScan;
    var pokeyRestartTimers = cfg.pokeyRestartTimers;
    var pokeySyncLfsr17 = cfg.pokeySyncLfsr17;
    var pokeySeroutWrite = cfg.pokeySeroutWrite;
    var pokeySerinRead = cfg.pokeySerinRead;
    var pokeyPotUpdate = cfg.pokeyPotUpdate;

    function piaPortBWrite(ctx, value) {
      var io = ctx.ioData;
      var ram = ctx.ram;
      var sram = ctx.sram;
      var oldV = sram[IO_PORTB] & 0xff;
      var v = ((value & 0x83) | 0x7c) & 0xff;

      // Bit 0: OS ROM enable (1=ROM, 0=RAM)
      if ((oldV & 0x01) !== (v & 0x01)) {
        if (v & 0x01) {
          // Enable OS ROM at $C000-$CFFF and FP ROM at $D800-$FFFF.
          sram.set(ram.subarray(0xc000, 0xd000), 0xc000);
          CPU.setRom(ctx, 0xc000, 0xcfff);
          if (io.osRom) ram.set(io.osRom, 0xc000);

          sram.set(ram.subarray(0xd800, 0x10000), 0xd800);
          CPU.setRom(ctx, 0xd800, 0xffff);
          if (io.floatingPointRom) ram.set(io.floatingPointRom, 0xd800);
        } else {
          // Disable OS ROM.
          ram.set(sram.subarray(0xc000, 0xd000), 0xc000);
          CPU.setRam(ctx, 0xc000, 0xcfff);

          ram.set(sram.subarray(0xd800, 0x10000), 0xd800);
          CPU.setRam(ctx, 0xd800, 0xffff);
        }
      }

      // Bit 1: BASIC ROM disable (1=disabled -> RAM, 0=enabled -> ROM)
      if ((oldV & 0x02) !== (v & 0x02)) {
        if (v & 0x02) {
          ram.set(sram.subarray(0xa000, 0xc000), 0xa000);
          CPU.setRam(ctx, 0xa000, 0xbfff);
        } else {
          sram.set(ram.subarray(0xa000, 0xc000), 0xa000);
          CPU.setRom(ctx, 0xa000, 0xbfff);
          if (io.basicRom) ram.set(io.basicRom, 0xa000);
        }
      }

      // Bit 7: Self-test ROM disable (1=disabled -> RAM, 0=enabled -> ROM)
      if ((oldV & 0x80) !== (v & 0x80)) {
        if (v & 0x80) {
          ram.set(sram.subarray(0x5000, 0x5800), 0x5000);
          CPU.setRam(ctx, 0x5000, 0x57ff);
        } else {
          sram.set(ram.subarray(0x5000, 0x5800), 0x5000);
          CPU.setRom(ctx, 0x5000, 0x57ff);
          if (io.selfTestRom) ram.set(io.selfTestRom, 0x5000);
        }
      }

      ram[IO_PORTB] = v;
      sram[IO_PORTB] = v;
    }

    function ioAccess(ctx, value) {
      var addr = ctx.accessAddress & 0xffff;
      var ram = ctx.ram;
      var sram = ctx.sram;
      var io = ctx.ioData;

      if (value !== null && value !== undefined) {
        var v = value & 0xff;

        switch (addr) {
          // --- GTIA ---
          case IO_HPOSP0_M0PF:
          case IO_HPOSP1_M1PF:
          case IO_HPOSP2_M2PF:
          case IO_HPOSP3_M3PF:
          case IO_HPOSM0_P0PF:
          case IO_HPOSM1_P1PF:
          case IO_HPOSM2_P2PF:
          case IO_HPOSM3_P3PF:
          case IO_SIZEP0_M0PL:
          case IO_SIZEP1_M1PL:
          case IO_SIZEP2_M2PL:
          case IO_SIZEP3_M3PL:
          case IO_SIZEM_P0PL:
          case IO_GRAFP0_P1PL:
          case IO_GRAFP1_P2PL:
          case IO_GRAFP2_P3PL:
          case IO_GRAFP3_TRIG0:
          case IO_GRAFM_TRIG1:
          case IO_PRIOR:
          case IO_VDELAY:
          case IO_GRACTL:
            sram[addr] = v;
            break;

          case IO_COLPM0_TRIG2:
          case IO_COLPM1_TRIG3:
          case IO_COLPM2_PAL:
          case IO_COLPM3:
          case IO_COLPF0:
          case IO_COLPF1:
          case IO_COLPF2:
          case IO_COLPF3:
          case IO_COLBK:
            sram[addr] = v & 0xfe;
            break;

          case IO_HITCLR:
            // Clear collision registers (HITCLR) on the read side.
            ram[IO_HPOSP0_M0PF] = 0x00;
            ram[IO_HPOSP1_M1PF] = 0x00;
            ram[IO_HPOSP2_M2PF] = 0x00;
            ram[IO_HPOSP3_M3PF] = 0x00;
            ram[IO_HPOSM0_P0PF] = 0x00;
            ram[IO_HPOSM1_P1PF] = 0x00;
            ram[IO_HPOSM2_P2PF] = 0x00;
            ram[IO_HPOSM3_P3PF] = 0x00;
            ram[IO_SIZEP0_M0PL] = 0x00;
            ram[IO_SIZEP1_M1PL] = 0x00;
            ram[IO_SIZEP2_M2PL] = 0x00;
            ram[IO_SIZEP3_M3PL] = 0x00;
            ram[IO_SIZEM_P0PL] = 0x00;
            ram[IO_GRAFP0_P1PL] = 0x00;
            ram[IO_GRAFP1_P2PL] = 0x00;
            ram[IO_GRAFP2_P3PL] = 0x00;
            sram[addr] = v;
            break;

          case IO_CONSOL:
            // Only speaker bit is writable; key bits are read-only.
            sram[addr] = v & 0x08;
            break;

          // --- POKEY ---
          case IO_AUDF1_POT0:
          case IO_AUDC1_POT1:
          case IO_AUDF2_POT2:
          case IO_AUDC2_POT3:
          case IO_AUDF3_POT4:
          case IO_AUDC3_POT5:
          case IO_AUDF4_POT6:
          case IO_AUDC4_POT7:
          case IO_AUDCTL_ALLPOT:
            if (io.pokeyAudio)
              pokeyAudioSync(ctx, io.pokeyAudio, ctx.cycleCounter);
            sram[addr] = v;
            if (io.pokeyAudio)
              pokeyAudioOnRegisterWrite(io.pokeyAudio, addr, v);
            break;

          case IO_POTGO:
            sram[addr] = v;
            pokeyPotStartScan(ctx);
            break;

          case IO_STIMER_KBCODE:
            if (io.pokeyAudio)
              pokeyAudioSync(ctx, io.pokeyAudio, ctx.cycleCounter);
            sram[addr] = v;
            if (io.pokeyAudio)
              pokeyAudioOnRegisterWrite(io.pokeyAudio, addr, v);
            pokeyRestartTimers(ctx);
            break;

          case IO_SKREST_RANDOM:
            pokeySyncLfsr17(ctx);
            sram[addr] = v;
            break;

          case IO_SEROUT_SERIN:
            sram[addr] = v;
            pokeySeroutWrite(ctx, v);
            break;

          case IO_IRQEN_IRQST:
            sram[addr] = v;
            // IRQST bits read as 1 for disabled sources.
            ram[addr] |= ~v & 0xff;
            break;

          case IO_SKCTL_SKSTAT:
            pokeySyncLfsr17(ctx);
            sram[addr] = v;
            if (io.pokeyAudio)
              pokeyAudioOnRegisterWrite(io.pokeyAudio, addr, v);
            break;

          // --- PIA ---
          case IO_PORTA:
            if ((sram[IO_PACTL] & 0x04) === 0) {
              io.valuePortA = v;
              return io.valuePortA & 0xff;
            }
            sram[addr] = v;
            break;

          case IO_PORTB:
            if ((sram[IO_PBCTL] & 0x04) === 0) {
              io.valuePortB = v;
              return io.valuePortB & 0xff;
            }
            piaPortBWrite(ctx, v);
            break;

          case IO_PACTL:
            sram[addr] = v;
            ram[addr] = (v & 0x0d) | 0x30;
            break;

          case IO_PBCTL:
            sram[addr] = v;
            ram[addr] = (v & 0x0d) | 0x30;
            break;

          // --- ANTIC ---
          case IO_DMACTL:
            sram[addr] = v & 0x3f;
            break;

          case IO_CHACTL:
          case IO_PMBASE:
          case IO_CHBASE:
            sram[addr] = v;
            break;

          case IO_DLISTL:
            sram[addr] = v;
            io.displayListAddress = (io.displayListAddress & 0xff00) | v;
            break;

          case IO_DLISTH:
            sram[addr] = v;
            io.displayListAddress = (io.displayListAddress & 0x00ff) | (v << 8);
            break;

          case IO_HSCROL:
          case IO_VSCROL:
            sram[addr] = v & 0x0f;
            break;

          case IO_WSYNC: {
            // Stall until next scanline boundary (closest display list fetch cycle).
            var nextLine = io.displayListFetchCycle;
            if (nextLine <= ctx.cycleCounter) {
              nextLine =
                (((ctx.cycleCounter / CYCLES_PER_LINE) | 0) + 1) *
                CYCLES_PER_LINE;
            }
            ctx.stallCycleCounter = Math.max(ctx.stallCycleCounter, nextLine);
            break;
          }

          case IO_NMIEN:
            // Only bits 7-5 are used (DLI/VBI/RESET).
            sram[addr] = v & (NMI_DLI | NMI_VBI | NMI_RESET);
            break;

          case IO_NMIRES_NMIST:
            // Writing clears pending NMI status bits.
            ram[addr] = 0x00;
            break;

          case IO_VCOUNT:
          case IO_PENH:
          case IO_PENV:
            // Read-only in this emulator.
            break;

          default:
            // Default for mapped I/O addresses: write-only shadow.
            sram[addr] = v;
            break;
        }

        return ram[addr] & 0xff;
      }

      // Reads
      switch (addr) {
        case IO_PORTA:
          if ((sram[IO_PACTL] & 0x04) === 0) return io.valuePortA & 0xff;
          return ram[addr] & 0xff;

        case IO_PORTB:
          if ((sram[IO_PBCTL] & 0x04) === 0) return io.valuePortB & 0xff;
          return ram[addr] & 0xff;

        case IO_CONSOL:
          // Shim from the C/SDL version (CONSOL_HACK):
          // OS ROM reads CONSOL at $C49A (PC will be $C49D during the read) to
          // decide whether to disable BASIC. Optionally force OPTION held there.
          if (io.optionOnStart && (ctx.cpu.pc & 0xffff) === 0xc49d) return 0x03;
          return ram[addr] & 0xff;

        case IO_STIMER_KBCODE:
          // KBCODE is stored in RAM at this address by keyboard events.
          return ram[addr] & 0xff;

        case IO_SKREST_RANDOM:
          pokeySyncLfsr17(ctx);
          ram[addr] = io.pokeyLfsr17 & 0xff;
          return ram[addr] & 0xff;

        case IO_SEROUT_SERIN:
          return pokeySerinRead(ctx);

        case IO_AUDF1_POT0:
        case IO_AUDC1_POT1:
        case IO_AUDF2_POT2:
        case IO_AUDC2_POT3:
        case IO_AUDF3_POT4:
        case IO_AUDC3_POT5:
        case IO_AUDF4_POT6:
        case IO_AUDC4_POT7:
        case IO_AUDCTL_ALLPOT:
          pokeyPotUpdate(ctx);
          return ram[addr] & 0xff;

        default:
          return ram[addr] & 0xff;
      }
    }

    return {
      ioAccess: ioAccess,
    };
  }

  window.A8EIo = {
    createApi: createApi,
  };
})();
