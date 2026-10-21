(function () {
  "use strict";

  function createApi(cfg) {
    const CPU = cfg.CPU;
    const CYCLES_PER_LINE = cfg.CYCLES_PER_LINE;
    const NMI_DLI = cfg.NMI_DLI;
    const NMI_VBI = cfg.NMI_VBI;
    const NMI_RESET = cfg.NMI_RESET;
    const IO_AUDC1_POT1 = cfg.IO_AUDC1_POT1;
    const IO_AUDC2_POT3 = cfg.IO_AUDC2_POT3;
    const IO_AUDC3_POT5 = cfg.IO_AUDC3_POT5;
    const IO_AUDC4_POT7 = cfg.IO_AUDC4_POT7;
    const IO_AUDCTL_ALLPOT = cfg.IO_AUDCTL_ALLPOT;
    const IO_AUDF1_POT0 = cfg.IO_AUDF1_POT0;
    const IO_AUDF2_POT2 = cfg.IO_AUDF2_POT2;
    const IO_AUDF3_POT4 = cfg.IO_AUDF3_POT4;
    const IO_AUDF4_POT6 = cfg.IO_AUDF4_POT6;
    const IO_CHACTL = cfg.IO_CHACTL;
    const IO_CHBASE = cfg.IO_CHBASE;
    const IO_COLBK = cfg.IO_COLBK;
    const IO_COLPF0 = cfg.IO_COLPF0;
    const IO_COLPF1 = cfg.IO_COLPF1;
    const IO_COLPF2 = cfg.IO_COLPF2;
    const IO_COLPF3 = cfg.IO_COLPF3;
    const IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    const IO_COLPM1_TRIG3 = cfg.IO_COLPM1_TRIG3;
    const IO_COLPM2_PAL = cfg.IO_COLPM2_PAL;
    const IO_COLPM3 = cfg.IO_COLPM3;
    const IO_CONSOL = cfg.IO_CONSOL;
    const IO_DLISTH = cfg.IO_DLISTH;
    const IO_DLISTL = cfg.IO_DLISTL;
    const IO_DMACTL = cfg.IO_DMACTL;
    const IO_GRACTL = cfg.IO_GRACTL;
    const IO_GRAFM_TRIG1 = cfg.IO_GRAFM_TRIG1;
    const IO_GRAFP0_P1PL = cfg.IO_GRAFP0_P1PL;
    const IO_GRAFP1_P2PL = cfg.IO_GRAFP1_P2PL;
    const IO_GRAFP2_P3PL = cfg.IO_GRAFP2_P3PL;
    const IO_GRAFP3_TRIG0 = cfg.IO_GRAFP3_TRIG0;
    const IO_HITCLR = cfg.IO_HITCLR;
    const IO_HPOSM0_P0PF = cfg.IO_HPOSM0_P0PF;
    const IO_HPOSM1_P1PF = cfg.IO_HPOSM1_P1PF;
    const IO_HPOSM2_P2PF = cfg.IO_HPOSM2_P2PF;
    const IO_HPOSM3_P3PF = cfg.IO_HPOSM3_P3PF;
    const IO_HPOSP0_M0PF = cfg.IO_HPOSP0_M0PF;
    const IO_HPOSP1_M1PF = cfg.IO_HPOSP1_M1PF;
    const IO_HPOSP2_M2PF = cfg.IO_HPOSP2_M2PF;
    const IO_HPOSP3_M3PF = cfg.IO_HPOSP3_M3PF;
    const IO_HSCROL = cfg.IO_HSCROL;
    const IO_IRQEN_IRQST = cfg.IO_IRQEN_IRQST;
    const IO_NMIEN = cfg.IO_NMIEN;
    const IO_NMIRES_NMIST = cfg.IO_NMIRES_NMIST;
    const IO_PACTL = cfg.IO_PACTL;
    const IO_PBCTL = cfg.IO_PBCTL;
    const IO_PENH = cfg.IO_PENH;
    const IO_PENV = cfg.IO_PENV;
    const IO_PMBASE = cfg.IO_PMBASE;
    const IO_PORTA = cfg.IO_PORTA;
    const IO_PORTB = cfg.IO_PORTB;
    const IO_POTGO = cfg.IO_POTGO;
    const IO_PRIOR = cfg.IO_PRIOR;
    const IO_SEROUT_SERIN = cfg.IO_SEROUT_SERIN;
    const IO_SIZEM_P0PL = cfg.IO_SIZEM_P0PL;
    const IO_SIZEP0_M0PL = cfg.IO_SIZEP0_M0PL;
    const IO_SIZEP1_M1PL = cfg.IO_SIZEP1_M1PL;
    const IO_SIZEP2_M2PL = cfg.IO_SIZEP2_M2PL;
    const IO_SIZEP3_M3PL = cfg.IO_SIZEP3_M3PL;
    const IO_SKCTL_SKSTAT = cfg.IO_SKCTL_SKSTAT;
    const IO_SKREST_RANDOM = cfg.IO_SKREST_RANDOM;
    const IO_STIMER_KBCODE = cfg.IO_STIMER_KBCODE;
    const IO_VCOUNT = cfg.IO_VCOUNT;
    const IO_VDELAY = cfg.IO_VDELAY;
    const IO_VSCROL = cfg.IO_VSCROL;
    const IO_WSYNC = cfg.IO_WSYNC;
    const pokeyAudioSync = cfg.pokeyAudioSync;
    const pokeyAudioOnRegisterWrite = cfg.pokeyAudioOnRegisterWrite;
    const pokeyPotPrepareSkctlWrite = cfg.pokeyPotPrepareSkctlWrite;
    const pokeyPotStartScan = cfg.pokeyPotStartScan;
    const pokeyRestartTimers = cfg.pokeyRestartTimers;
    const pokeyArmInactiveTimers = cfg.pokeyArmInactiveTimers;
    const pokeySyncLfsr17 = cfg.pokeySyncLfsr17;
    const pokeySeroutWrite = cfg.pokeySeroutWrite;
    const pokeySerinRead = cfg.pokeySerinRead;
    const pokeyPotUpdate = cfg.pokeyPotUpdate;
    const ioRegisterAddress = cfg.ioRegisterAddress;
    const IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE =
      cfg.IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE;
    const TRIG_REGS = [
      IO_GRAFP3_TRIG0,
      IO_GRAFM_TRIG1,
      IO_COLPM0_TRIG2,
      IO_COLPM1_TRIG3,
    ];

    // POKEY IRQs (AHRM 5.7, 14.4): IRQST bits are active low. A source
    // latches its bit only while enabled in IRQEN, and the IRQ line stays
    // asserted while any enabled bit is pending. Bit 3 is not latched; it
    // shows the idle serial output shift register.
    function updateIrqLine(ctx) {
      const pending = ~ctx.ram[IO_IRQEN_IRQST] & ctx.sram[IO_IRQEN_IRQST] & 0xff;
      ctx.irqPending = pending ? 1 : 0;
    }

    // Events of a disabled source are lost (AHRM 5.7).
    function raisePokeyIrq(ctx, mask) {
      if (ctx.sram[IO_IRQEN_IRQST] & mask) ctx.ram[IO_IRQEN_IRQST] &= ~mask & 0xff;
      updateIrqLine(ctx);
    }

    // IRQST bit 3 reads 0 while the serial output shift register is idle and
    // requests an IRQ whenever IRQEN bit 3 is set (AHRM 14.4).
    function setSerialOutputIdle(ctx, idle) {
      if (idle) {
        ctx.ram[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE & 0xff;
      } else {
        ctx.ram[IO_IRQEN_IRQST] |= IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE;
      }
      updateIrqLine(ctx);
    }

    // ram[IO_PORTA] holds the joystick input. Output bits read back as the
    // AND of ORA and that input (AHRM 2.5).
    function piaPortARead(ctx) {
      const outputBits = ctx.ioData.valuePortA & 0xff;
      return ctx.ram[IO_PORTA] & (ctx.sram[IO_PORTA] | (~outputBits & 0xff)) & 0xff;
    }

    // Port B pins as the MMU sees them: output bits drive ORB and input bits
    // are pulled up (AHRM 2.6, 2.7). Output bits also read back as ORB (2.5).
    function piaPortBPins(io) {
      const direction = io.valuePortB & 0xff;
      return ((io.outputPortB & direction) | (~direction & 0xff)) & 0xff;
    }

    // Extended memory configurations: the PORTB bits that select the bank,
    // and whether bit 5 enables a separate ANTIC window (AHRM 2.7, Table 1).
    const EXTENDED_MEMORY_PROFILES = {
      "130xe": { bankMask: 0x0c, separateAnticWindow: true },
      "rambo-192k": { bankMask: 0x4c, separateAnticWindow: false },
      "rambo-320k": { bankMask: 0x6c, separateAnticWindow: false },
      "compy-320k": { bankMask: 0xcc, separateAnticWindow: true },
      "rambo-576k": { bankMask: 0x6e, separateAnticWindow: false },
      "compy-576k": { bankMask: 0xce, separateAnticWindow: true },
      "rambo-1088k": { bankMask: 0xee, separateAnticWindow: false },
    };

    // The CPU window's bank lives in ram while the window is on, and main
    // memory $4000-$7FFF waits in mainWindow. Returns null for plain 64K.
    function createExtendedMemory(profile) {
      const spec = EXTENDED_MEMORY_PROFILES[profile];
      if (!spec) return null;
      let bankCount = 1;
      for (let bit = 0x01; bit <= 0x80; bit <<= 1) {
        if (spec.bankMask & bit) bankCount <<= 1;
      }
      return {
        profile: profile,
        bankMask: spec.bankMask,
        separateAnticWindow: spec.separateAnticWindow,
        banks: new Uint8Array(bankCount * 0x4000),
        mainWindow: new Uint8Array(0x4000),
      };
    }

    // Bit 4 enables the CPU window at $4000-$7FFF, bit 5 the ANTIC window
    // where ANTIC has separate access (AHRM 2.7).
    function cpuWindowOn(xm, pins) {
      return !!xm && (pins & 0x10) === 0;
    }

    function anticWindowOn(xm, pins) {
      return !!xm && (pins & (xm.separateAnticWindow ? 0x20 : 0x10)) === 0;
    }

    // The bank selection bits, lowest PORTB bit first.
    function selectedBank(xm, pins) {
      let bank = 0;
      let bankBit = 1;
      for (let bit = 0x01; bit <= 0x80; bit <<= 1) {
        if (xm.bankMask & bit) {
          if (pins & bit) bank |= bankBit;
          bankBit <<= 1;
        }
      }
      return bank;
    }

    // Main memory, or the selected bank, behind $4000-$7FFF.
    function windowMemory(xm, pins, windowOn) {
      if (!windowOn) return xm.mainWindow;
      const offset = selectedBank(xm, pins) * 0x4000;
      return xm.banks.subarray(offset, offset + 0x4000);
    }

    // Big expansions reuse the BASIC (bit 1) and self-test (bit 7) bits as
    // bank bits; while the CPU window is on those ROMs are forced off (2.7).
    function basicRomMapped(io, pins) {
      const xm = io.extendedMemory;
      if (xm && (xm.bankMask & 0x02) && cpuWindowOn(xm, pins)) return false;
      return (pins & 0x02) === 0;
    }

    // The self-test ROM is mapped only while the OS ROM is enabled (AHRM 2.6).
    function selfTestRomMapped(io, pins) {
      const xm = io.extendedMemory;
      if (xm && (xm.bankMask & 0x80) && cpuWindowOn(xm, pins)) return false;
      return (pins & 0x81) === 0x01;
    }

    // Swaps the memory behind $4000-$7FFF when the CPU window or its bank
    // changes. The self-test ROM has priority over the window (AHRM 2.7), so
    // while it is mapped the RAM under it stays in the shadow memory.
    function switchCpuWindow(ctx, oldPins, pins) {
      const io = ctx.ioData;
      const xm = io.extendedMemory;
      const oldWindowOn = cpuWindowOn(xm, oldPins);
      const windowOn = cpuWindowOn(xm, pins);
      if (
        oldWindowOn === windowOn &&
        (!windowOn || selectedBank(xm, oldPins) === selectedBank(xm, pins))
      ) {
        return false;
      }

      const ram = ctx.ram;
      const sram = ctx.sram;
      const oldMemory = windowMemory(xm, oldPins, oldWindowOn);
      const newMemory = windowMemory(xm, pins, windowOn);
      oldMemory.set(ram.subarray(0x4000, 0x8000));
      ram.set(newMemory, 0x4000);
      if (selfTestRomMapped(io, oldPins)) {
        oldMemory.set(sram.subarray(0x5000, 0x5800), 0x1000);
        sram.set(newMemory.subarray(0x1000, 0x1800), 0x5000);
        if (io.selfTestRom) ram.set(io.selfTestRom, 0x5000);
      }
      return true;
    }

    // ANTIC reads the CPU view unless only one of the windows is on.
    function refreshAnticWindow(ctx) {
      const io = ctx.ioData;
      const xm = io.extendedMemory;
      const pins = ctx.sram[IO_PORTB] & 0xff;
      const anticOn = anticWindowOn(xm, pins);
      io.anticWindow =
        anticOn === cpuWindowOn(xm, pins) ? null : windowMemory(xm, pins, anticOn);
    }

    // ANTIC DMA read. With extended memory ANTIC may see other memory than
    // the CPU at $4000-$7FFF (AHRM 2.7).
    function anticRead(ctx, address) {
      const view = ctx.ioData.anticWindow;
      return view && (address & 0xc000) === 0x4000
        ? view[address & 0x3fff]
        : ctx.ram[address & 0xffff];
    }

    // Maps the OS, BASIC and self-test ROMs for the port B pins (AHRM 2.6).
    // sram[IO_PORTB] holds the previous pins.
    function piaPortBWrite(ctx, value) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;
      const oldV = sram[IO_PORTB] & 0xff;
      const v = value & 0xff;
      const windowSwitched =
        !!io.extendedMemory && switchCpuWindow(ctx, oldV, v);

      function traceCopy(startAddr, source) {
        if (!ctx || typeof ctx.memoryWriteHook !== "function") return;
        const bytes = source instanceof Uint8Array ? source : new Uint8Array(source || 0);
        for (let i = 0; i < bytes.length; i++) {
          const addr = (startAddr + i) & 0xffff;
          try {
            ctx.memoryWriteHook(
              addr,
              bytes[i] & 0xff,
              ctx.cycleCounter >>> 0,
              ctx.instructionCounter >>> 0,
              ctx.currentInstructionPc & 0xffff,
              ctx.currentOpcode & 0xff,
              ctx,
            );
          } catch {
            // ignore hook errors
          }
        }
      }

      if (windowSwitched) traceCopy(0x4000, ram.subarray(0x4000, 0x8000));

      // Bit 0: OS ROM enable (1=ROM, 0=RAM)
      if ((oldV & 0x01) !== (v & 0x01)) {
        if (v & 0x01) {
          // Enable OS ROM at $C000-$CFFF and FP ROM at $D800-$FFFF.
          const osRamShadow = ram.subarray(0xc000, 0xd000);
          sram.set(osRamShadow, 0xc000);
          traceCopy(0xc000, osRamShadow);
          CPU.setRom(ctx, 0xc000, 0xcfff);
          if (io.osRom) {
            ram.set(io.osRom, 0xc000);
            traceCopy(0xc000, io.osRom);
          }

          const fpRamShadow = ram.subarray(0xd800, 0x10000);
          sram.set(fpRamShadow, 0xd800);
          traceCopy(0xd800, fpRamShadow);
          CPU.setRom(ctx, 0xd800, 0xffff);
          if (io.floatingPointRom) {
            ram.set(io.floatingPointRom, 0xd800);
            traceCopy(0xd800, io.floatingPointRom);
          }
        } else {
          // Disable OS ROM.
          const osRamVisible = sram.subarray(0xc000, 0xd000);
          ram.set(osRamVisible, 0xc000);
          traceCopy(0xc000, osRamVisible);
          CPU.setRam(ctx, 0xc000, 0xcfff);

          const fpRamVisible = sram.subarray(0xd800, 0x10000);
          ram.set(fpRamVisible, 0xd800);
          traceCopy(0xd800, fpRamVisible);
          CPU.setRam(ctx, 0xd800, 0xffff);
        }
      }

      // Bit 1: BASIC ROM disable (1=disabled -> RAM, 0=enabled -> ROM)
      if (basicRomMapped(io, oldV) !== basicRomMapped(io, v)) {
        if (!basicRomMapped(io, v)) {
          const basicRamVisible = sram.subarray(0xa000, 0xc000);
          ram.set(basicRamVisible, 0xa000);
          traceCopy(0xa000, basicRamVisible);
          CPU.setRam(ctx, 0xa000, 0xbfff);
        } else {
          const basicRamShadow = ram.subarray(0xa000, 0xc000);
          sram.set(basicRamShadow, 0xa000);
          traceCopy(0xa000, basicRamShadow);
          CPU.setRom(ctx, 0xa000, 0xbfff);
          if (io.basicRom) {
            ram.set(io.basicRom, 0xa000);
            traceCopy(0xa000, io.basicRom);
          }
        }
      }

      // Bit 7: Self-test ROM disable (1=disabled -> RAM, 0=enabled -> ROM)
      if (selfTestRomMapped(io, oldV) !== selfTestRomMapped(io, v)) {
        if (!selfTestRomMapped(io, v)) {
          const selfTestRamVisible = sram.subarray(0x5000, 0x5800);
          ram.set(selfTestRamVisible, 0x5000);
          traceCopy(0x5000, selfTestRamVisible);
          CPU.setRam(ctx, 0x5000, 0x57ff);
        } else {
          const selfTestRamShadow = ram.subarray(0x5000, 0x5800);
          sram.set(selfTestRamShadow, 0x5000);
          traceCopy(0x5000, selfTestRamShadow);
          CPU.setRom(ctx, 0x5000, 0x57ff);
          if (io.selfTestRom) {
            ram.set(io.selfTestRom, 0x5000);
            traceCopy(0x5000, io.selfTestRom);
          }
        }
      }

      ram[IO_PORTB] = v;
      sram[IO_PORTB] = v;
      refreshAnticWindow(ctx);
    }

    function syncTriggerReadback(ctx, initializeLatch) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;
      if (!io.trigPhysical || !io.trigLatched) return;

      const latchEnabled = (sram[IO_GRACTL] & 0x04) !== 0;
      for (let i = 0; i < TRIG_REGS.length; i++) {
        const physical = io.trigPhysical[i] & 0x01;
        if (!latchEnabled || initializeLatch) io.trigLatched[i] = physical;
        ram[TRIG_REGS[i]] = latchEnabled
          ? io.trigLatched[i] & 0x01
          : physical;
      }
    }

    function ioAccess(ctx, value) {
      const addr = ioRegisterAddress(ctx.accessAddress & 0xffff);
      const ram = ctx.ram;
      const sram = ctx.sram;
      const io = ctx.ioData;

      if (value != null) {
        const v = value & 0xff;

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
            const oldV = sram[addr] & 0xff;
            const newV = v & 0x07;
            sram[addr] = newV;
            const oldLatch = (oldV & 0x04) !== 0;
            const newLatch = (newV & 0x04) !== 0;
            if (!newLatch || (newLatch && !oldLatch))
              {syncTriggerReadback(ctx, true);}
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
              {pokeyAudioSync(ctx, io.pokeyAudio, ctx.cycleCounter);}
            sram[addr] = v;
            if (io.pokeyAudio)
              {pokeyAudioOnRegisterWrite(io.pokeyAudio, addr, v);}
            pokeyArmInactiveTimers(ctx);
            break;

          case IO_POTGO:
            sram[addr] = v;
            pokeyPotStartScan(ctx);
            break;

          case IO_STIMER_KBCODE:
            if (io.pokeyAudio)
              {pokeyAudioSync(ctx, io.pokeyAudio, ctx.cycleCounter);}
            sram[addr] = v;
            if (io.pokeyAudio)
              {pokeyAudioOnRegisterWrite(io.pokeyAudio, addr, v);}
            pokeyRestartTimers(ctx);
            break;

          case IO_SKREST_RANDOM:
            pokeySyncLfsr17(ctx);
            sram[addr] = v;
            break;

          case IO_SEROUT_SERIN:
            sram[addr] = v;
            // Writing SEROUT starts shifting a byte out: IRQST bit 3 shows
            // the transmission in progress.
            setSerialOutputIdle(ctx, false);
            pokeySeroutWrite(ctx, v);
            break;

          case IO_IRQEN_IRQST:
            // Disabling a source resets its latched status bit; bit 3 is not
            // latched and ignores IRQEN (AHRM 14.4).
            sram[addr] = v;
            ram[addr] |= ~v & ~IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE & 0xff;
            updateIrqLine(ctx);
            break;

          case IO_SKCTL_SKSTAT:
            pokeySyncLfsr17(ctx);
            pokeyPotPrepareSkctlWrite(ctx);
            sram[addr] = v;
            if (io.pokeyAudio)
              {pokeyAudioOnRegisterWrite(io.pokeyAudio, addr, v);}
            // Writing SKCTL with serial mode off (bits 0-1 = 0) resets the
            // serial port.  Clear the high-level SIO state machine so a
            // subsequent command frame starts cleanly.
            if ((v & 0x03) === 0) {
              io.sioOutIndex = 0;
              io.sioOutPhase = 0;
              io.sioDataIndex = 0;
              io.sioInSize = 0;
              io.sioInIndex = 0;
            }
            pokeyArmInactiveTimers(ctx);
            break;

          // --- PIA ---
          case IO_PORTA:
            if ((sram[IO_PACTL] & 0x04) === 0) {
              io.valuePortA = v;
              return io.valuePortA & 0xff;
            }
            sram[addr] = v;
            return piaPortARead(ctx);

          case IO_PORTB:
            if ((sram[IO_PBCTL] & 0x04) === 0) {
              io.valuePortB = v;
              piaPortBWrite(ctx, piaPortBPins(io));
              return io.valuePortB & 0xff;
            }
            io.outputPortB = v;
            piaPortBWrite(ctx, piaPortBPins(io));
            break;

          case IO_PACTL:
          case IO_PBCTL:
            // Bits 5-0 read back as written; bits 7-6 are the (unmodeled)
            // IRQ flags (AHRM 14.5).
            sram[addr] = v;
            ram[addr] = v & 0x3f;
            break;

          // --- ANTIC ---
          case IO_DMACTL:
            sram[addr] = v & 0x3f;
            break;

          case IO_CHACTL:
          case IO_PMBASE:
            sram[addr] = v;
            break;

          case IO_CHBASE: {
            sram[addr] = v;
            const chbaseTiming = io.chbaseTiming;
            chbaseTiming.initialized = true;
            chbaseTiming.rawValue = v & 0xff;
            chbaseTiming.pendingValue = v & 0xff;
            // AHRM 4.4: CHBASE change takes effect 2 color clocks after
            // the register write.  The 6502 bus write occurs on the last
            // cycle of the instruction, so offset by (instructionCycles − 1)
            // to place the latch relative to the actual write cycle.
            const writeCycleOffset =
              Math.max((ctx.currentInstructionCycles | 0) - 1, 0);
            chbaseTiming.pendingClock =
              (io.clock | 0) + writeCycleOffset + 2;
            break;
          }

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
            // Stall until cycle 105 of the current scanline (0-indexed: cycle 104).
            // AHRM 4.9: A write to WSYNC halts CPU execution until cycle 105 on the current line.
            const WSYNC_CYCLE = 105;
            const WSYNC_BOUNDARY = WSYNC_CYCLE - 1; // 104: if past this, wait for next line
            let lineStart = io.displayListFetchCycle;
            if (
              lineStart > ctx.cycleCounter ||
              ctx.cycleCounter >= lineStart + CYCLES_PER_LINE
            ) {
              lineStart =
                ((ctx.cycleCounter / CYCLES_PER_LINE) | 0) * CYCLES_PER_LINE;
            }
            const target = lineStart + WSYNC_CYCLE;

            // If we are already at or past cycle 104, wait for the next line's cycle 105.
            if (ctx.cycleCounter >= lineStart + WSYNC_BOUNDARY) {
              ctx.stallCycleCounter = Math.max(
                ctx.stallCycleCounter,
                target + CYCLES_PER_LINE,
              );
            } else {
              ctx.stallCycleCounter = Math.max(ctx.stallCycleCounter, target);
            }
            break;
          }

          case IO_NMIEN:
            // Only bits 7-5 are used (DLI/VBI/RESET).
            sram[addr] = v & (NMI_DLI | NMI_VBI | NMI_RESET);
            if (io.inDrawLine) {
              const nmiTiming = io.nmiTiming;
              const lineCycle = (io.clock - io.displayListFetchCycle) | 0;
              if (lineCycle >= 0 && lineCycle < CYCLES_PER_LINE) {
                if (lineCycle < 7) {
                  nmiTiming.enabledByCycle7 = sram[addr] & 0xff;
                  nmiTiming.enabledByCycle8 = sram[addr] & 0xff;
                  nmiTiming.enabledOnCycle7Mask = 0;
                } else if (lineCycle === 7) {
                  nmiTiming.enabledOnCycle7Mask =
                    ((~nmiTiming.enabledByCycle7) & sram[addr]) &
                    (NMI_DLI | NMI_VBI | NMI_RESET);
                  nmiTiming.enabledByCycle7 = sram[addr] & 0xff;
                  nmiTiming.enabledByCycle8 = sram[addr] & 0xff;
                } else if (lineCycle === 8) {
                  nmiTiming.enabledByCycle8 = sram[addr] & 0xff;
                }
              }
            }
            break;

          case IO_NMIRES_NMIST:
            // Writing clears pending NMI status bits; bits 4-0 always read 1.
            ram[addr] = 0x1f;
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
          return piaPortARead(ctx);

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
          // Reading SERIN has no IRQ side effect; software acknowledges the
          // data-ready IRQ through IRQEN (AHRM 5.6, 5.7).
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

    // The XL Reset key drives the reset lines of the 6502, ANTIC and the PIA
    // (AHRM 2.4). ANTIC clears NMIEN and DMACTL (AHRM 4.1). The PIA clears
    // every register (AHRM 2.5), so port B reads the pull-ups: OS ROM in,
    // BASIC and self-test out (AHRM 2.6), and the 6502 fetches the OS reset
    // vector even when a program had banked the OS out. RAM is left alone.
    function warmReset(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const sram = ctx.sram;

      sram[IO_NMIEN] = 0x00;
      sram[IO_DMACTL] = 0x00;
      io.nmiTiming.enabledByCycle7 = 0;
      io.nmiTiming.enabledByCycle8 = 0;
      io.nmiTiming.enabledOnCycle7Mask = 0;

      sram[IO_PACTL] = 0x00;
      ram[IO_PACTL] = 0x00;
      sram[IO_PBCTL] = 0x00;
      ram[IO_PBCTL] = 0x00;
      sram[IO_PORTA] = 0x00;
      io.valuePortA = 0x00;
      io.valuePortB = 0x00;
      io.outputPortB = 0x00;
      piaPortBWrite(ctx, piaPortBPins(io));

      CPU.reset(ctx);
    }

    return {
      ioAccess: ioAccess,
      warmReset: warmReset,
      createExtendedMemory: createExtendedMemory,
      memoryExpansionProfiles: ["none"].concat(Object.keys(EXTENDED_MEMORY_PROFILES)),
      basicRomMapped: basicRomMapped,
      selfTestRomMapped: selfTestRomMapped,
      refreshAnticWindow: refreshAnticWindow,
      anticRead: anticRead,
      raisePokeyIrq: raisePokeyIrq,
      setSerialOutputIdle: setSerialOutputIdle,
      updateIrqLine: updateIrqLine,
    };
  }

  window.A8EIo = {
    createApi: createApi,
  };
})();
