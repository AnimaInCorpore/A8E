(function () {
  "use strict";

  function createApi(cfg) {
    let CPU = cfg.CPU;
    let CYCLES_PER_LINE = cfg.CYCLES_PER_LINE;
    let NMI_DLI = cfg.NMI_DLI;
    let NMI_VBI = cfg.NMI_VBI;
    let NMI_RESET = cfg.NMI_RESET;
    let IO_AUDC1_POT1 = cfg.IO_AUDC1_POT1;
    let IO_AUDC2_POT3 = cfg.IO_AUDC2_POT3;
    let IO_AUDC3_POT5 = cfg.IO_AUDC3_POT5;
    let IO_AUDC4_POT7 = cfg.IO_AUDC4_POT7;
    let IO_AUDCTL_ALLPOT = cfg.IO_AUDCTL_ALLPOT;
    let IO_AUDF1_POT0 = cfg.IO_AUDF1_POT0;
    let IO_AUDF2_POT2 = cfg.IO_AUDF2_POT2;
    let IO_AUDF3_POT4 = cfg.IO_AUDF3_POT4;
    let IO_AUDF4_POT6 = cfg.IO_AUDF4_POT6;
    let IO_CHACTL = cfg.IO_CHACTL;
    let IO_CHBASE = cfg.IO_CHBASE;
    let IO_COLBK = cfg.IO_COLBK;
    let IO_COLPF0 = cfg.IO_COLPF0;
    let IO_COLPF1 = cfg.IO_COLPF1;
    let IO_COLPF2 = cfg.IO_COLPF2;
    let IO_COLPF3 = cfg.IO_COLPF3;
    let IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    let IO_COLPM1_TRIG3 = cfg.IO_COLPM1_TRIG3;
    let IO_COLPM2_PAL = cfg.IO_COLPM2_PAL;
    let IO_COLPM3 = cfg.IO_COLPM3;
    let IO_CONSOL = cfg.IO_CONSOL;
    let IO_DLISTH = cfg.IO_DLISTH;
    let IO_DLISTL = cfg.IO_DLISTL;
    let IO_DMACTL = cfg.IO_DMACTL;
    let IO_GRACTL = cfg.IO_GRACTL;
    let IO_GRAFM_TRIG1 = cfg.IO_GRAFM_TRIG1;
    let IO_GRAFP0_P1PL = cfg.IO_GRAFP0_P1PL;
    let IO_GRAFP1_P2PL = cfg.IO_GRAFP1_P2PL;
    let IO_GRAFP2_P3PL = cfg.IO_GRAFP2_P3PL;
    let IO_GRAFP3_TRIG0 = cfg.IO_GRAFP3_TRIG0;
    let IO_HITCLR = cfg.IO_HITCLR;
    let IO_HPOSM0_P0PF = cfg.IO_HPOSM0_P0PF;
    let IO_HPOSM1_P1PF = cfg.IO_HPOSM1_P1PF;
    let IO_HPOSM2_P2PF = cfg.IO_HPOSM2_P2PF;
    let IO_HPOSM3_P3PF = cfg.IO_HPOSM3_P3PF;
    let IO_HPOSP0_M0PF = cfg.IO_HPOSP0_M0PF;
    let IO_HPOSP1_M1PF = cfg.IO_HPOSP1_M1PF;
    let IO_HPOSP2_M2PF = cfg.IO_HPOSP2_M2PF;
    let IO_HPOSP3_M3PF = cfg.IO_HPOSP3_M3PF;
    let IO_HSCROL = cfg.IO_HSCROL;
    let IO_IRQEN_IRQST = cfg.IO_IRQEN_IRQST;
    let IO_NMIEN = cfg.IO_NMIEN;
    let IO_NMIRES_NMIST = cfg.IO_NMIRES_NMIST;
    let IO_PACTL = cfg.IO_PACTL;
    let IO_PBCTL = cfg.IO_PBCTL;
    let IO_PENH = cfg.IO_PENH;
    let IO_PENV = cfg.IO_PENV;
    let IO_PMBASE = cfg.IO_PMBASE;
    let IO_PORTA = cfg.IO_PORTA;
    let IO_PORTB = cfg.IO_PORTB;
    let IO_POTGO = cfg.IO_POTGO;
    let IO_PRIOR = cfg.IO_PRIOR;
    let IO_SEROUT_SERIN = cfg.IO_SEROUT_SERIN;
    let IO_SIZEM_P0PL = cfg.IO_SIZEM_P0PL;
    let IO_SIZEP0_M0PL = cfg.IO_SIZEP0_M0PL;
    let IO_SIZEP1_M1PL = cfg.IO_SIZEP1_M1PL;
    let IO_SIZEP2_M2PL = cfg.IO_SIZEP2_M2PL;
    let IO_SIZEP3_M3PL = cfg.IO_SIZEP3_M3PL;
    let IO_SKCTL_SKSTAT = cfg.IO_SKCTL_SKSTAT;
    let IO_SKREST_RANDOM = cfg.IO_SKREST_RANDOM;
    let IO_STIMER_KBCODE = cfg.IO_STIMER_KBCODE;
    let IO_VCOUNT = cfg.IO_VCOUNT;
    let IO_VDELAY = cfg.IO_VDELAY;
    let IO_VSCROL = cfg.IO_VSCROL;
    let IO_WSYNC = cfg.IO_WSYNC;
    let pokeyAudioSync = cfg.pokeyAudioSync;
    let pokeyAudioOnRegisterWrite = cfg.pokeyAudioOnRegisterWrite;
    let pokeyPotStartScan = cfg.pokeyPotStartScan;
    let pokeyRestartTimers = cfg.pokeyRestartTimers;
    let pokeySyncLfsr17 = cfg.pokeySyncLfsr17;
    let pokeySeroutWrite = cfg.pokeySeroutWrite;
    let pokeySerinRead = cfg.pokeySerinRead;
    let pokeyPotUpdate = cfg.pokeyPotUpdate;
    const TRIG_REGS = [
      IO_GRAFP3_TRIG0,
      IO_GRAFM_TRIG1,
      IO_COLPM0_TRIG2,
      IO_COLPM1_TRIG3,
    ];

    function piaPortBWrite(ctx, value) {
      let io = ctx.ioData;
      let ram = ctx.ram;
      let sram = ctx.sram;
      let oldV = sram[IO_PORTB] & 0xff;
      let v = ((value & 0x83) | 0x7c) & 0xff;

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

    function syncTriggerReadback(ctx, initializeLatch) {
      let io = ctx.ioData;
      let ram = ctx.ram;
      let sram = ctx.sram;
      if (!io.trigPhysical || !io.trigLatched) return;

      let latchEnabled = (sram[IO_GRACTL] & 0x04) !== 0;
      for (let i = 0; i < TRIG_REGS.length; i++) {
        let physical = io.trigPhysical[i] & 0x01;
        if (!latchEnabled || initializeLatch) io.trigLatched[i] = physical;
        ram[TRIG_REGS[i]] = latchEnabled
          ? io.trigLatched[i] & 0x01
          : physical;
      }
    }

    function ioAccess(ctx, value) {
      let addr = ctx.accessAddress & 0xffff;
      let ram = ctx.ram;
      let sram = ctx.sram;
      let io = ctx.ioData;

      if (value !== null && value !== undefined) {
        let v = value & 0xff;

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
            sram[addr] = v;
            break;

          case IO_GRACTL: {
            let oldV = sram[addr] & 0xff;
            let newV = v & 0x07;
            sram[addr] = newV;
            let oldLatch = (oldV & 0x04) !== 0;
            let newLatch = (newV & 0x04) !== 0;
            if (!newLatch || (newLatch && !oldLatch))
              syncTriggerReadback(ctx, true);
            break;
          }

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
            let nextLine = io.displayListFetchCycle;
            let fallback =
              (((ctx.cycleCounter / CYCLES_PER_LINE) | 0) + 1) *
              CYCLES_PER_LINE;
            if (nextLine <= ctx.cycleCounter) {
              nextLine = fallback;
            } else if (nextLine - ctx.cycleCounter > CYCLES_PER_LINE) {
              // WSYNC is line-local on hardware: never sleep multiple lines.
              nextLine = fallback;
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

        case IO_SKCTL_SKSTAT:
          pokeySyncLfsr17(ctx);
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
