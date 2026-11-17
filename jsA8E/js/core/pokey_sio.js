(function () {
  "use strict";

  function createApi(cfg) {
    const IO_SEROUT_SERIN = cfg.IO_SEROUT_SERIN;
    const IO_IRQEN_IRQST = cfg.IO_IRQEN_IRQST;
    const IO_SKCTL_SKSTAT = cfg.IO_SKCTL_SKSTAT;
    const CYCLE_NEVER = cfg.CYCLE_NEVER;
    const SERIAL_OUTPUT_DATA_NEEDED_CYCLES =
      cfg.SERIAL_OUTPUT_DATA_NEEDED_CYCLES;
    const SERIAL_INPUT_FIRST_DATA_READY_CYCLES =
      cfg.SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
    const SERIAL_INPUT_DATA_READY_CYCLES = cfg.SERIAL_INPUT_DATA_READY_CYCLES;
    const IRQ_SERIAL_INPUT_DATA_READY = 0x20;

    const cycleTimedEventUpdate = cfg.cycleTimedEventUpdate;
    const raisePokeyIrq = cfg.raisePokeyIrq;
    const timerPeriodCpuCycles = cfg.timerPeriodCpuCycles;

    const SIO_DATA_OFFSET = 32;
    const DISK_DEVICE_ID_BASE = 0x31;
    const DISK_DEVICE_COUNT = 8;

    const DISK_HEADER_SIZE = 16;
    const DISK_SECTOR_SIZE_SINGLE = 128;
    const DISK_SECTOR_SIZE_ENHANCED = 256;
    const DISK_BOOT_SECTORS = 3;

    const CHAR_ACK = "A".charCodeAt(0);
    const CHAR_COMPLETE = "C".charCodeAt(0);
    const CHAR_ERROR = "E".charCodeAt(0);
    const CHAR_NACK = "N".charCodeAt(0);

    const CMD_FORMAT = 0x21;
    const CMD_READ_SECTOR = 0x52;
    const CMD_STATUS = 0x53;
    const CMD_MOTOR_ON = 0x55;
    const CMD_VERIFY_SECTOR = 0x56;
    const CMD_WRITE_SECTOR = 0x57;
    const CMD_PUT_SECTOR = 0x50;

    function sioChecksum(buf, size) {
      let checksum = 0;
      for (let i = 0; i < size; i++) {
        const b = buf[i] & 0xff;
        checksum = (checksum + (((checksum + b) >> 8) & 0xff) + b) & 0xff;
      }
      return checksum & 0xff;
    }

    function effectiveEventCycle(ctx) {
      return ctx.cycleCounter;
    }

    // The drive sends the queued response bytes one by one; see
    // serialInputSync().
    function queueSerinResponse(ctx, now, size) {
      const io = ctx.ioData;
      io.sioInSize = size | 0;
      io.sioInIndex = 0;
      io.sioInNextCycle = now + SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
      io.serialInputDataReadyCycle = io.sioInNextCycle;
      cycleTimedEventUpdate(ctx);
    }

    // Shift in every response byte whose time has come. Each byte is copied
    // into SERIN and raises the serial input IRQ; a byte that arrives while
    // that IRQ is still pending sets the overrun bit, SKSTAT bit 5 (AHRM 5.6).
    // The drive paces the bytes itself, independent of when the CPU reads
    // SERIN. Matches Pokey_SerialInputSync() in Pokey.c.
    function serialInputSync(ctx) {
      const io = ctx.ioData;
      const ram = ctx.ram;
      const now = ctx.cycleCounter;

      while ((io.sioInSize | 0) > 0 && io.sioInNextCycle <= now) {
        if (
          ctx.sram[IO_IRQEN_IRQST] & IRQ_SERIAL_INPUT_DATA_READY &&
          (ram[IO_IRQEN_IRQST] & IRQ_SERIAL_INPUT_DATA_READY) === 0
        ) {
          ram[IO_SKCTL_SKSTAT] &= ~0x20 & 0xff;
        }

        ram[IO_SEROUT_SERIN] = io.sioBuffer[io.sioInIndex & 0x3ff];
        io.sioInIndex = (io.sioInIndex + 1) | 0;
        io.sioInSize = (io.sioInSize - 1) | 0;
        raisePokeyIrq(ctx, IRQ_SERIAL_INPUT_DATA_READY);

        // After the ACK the drive executes the command before it sends the
        // result byte, at least 250 us later (AHRM 9.1).
        if (io.sioInSize === 0) io.sioInNextCycle = CYCLE_NEVER;
        else if (io.sioInIndex === 1)
          {io.sioInNextCycle += SERIAL_INPUT_FIRST_DATA_READY_CYCLES;}
        else io.sioInNextCycle += SERIAL_INPUT_DATA_READY_CYCLES;
      }

      io.serialInputDataReadyCycle = io.sioInNextCycle;
      cycleTimedEventUpdate(ctx);
    }

    // Serial output bit time: the output clock toggles on each underflow of
    // its timer, so one bit takes two timer periods (AHRM 5.6, Table 10).
    // Without an internal clock, assume a 19200 baud byte.
    function serialOutputBitCycles(ctx) {
      const clockMode = (ctx.sram[IO_SKCTL_SKSTAT] >> 4) & 0x07;
      let period = 0;
      if (clockMode >= 6) period = timerPeriodCpuCycles(ctx, 2);
      else if (clockMode >= 2) period = timerPeriodCpuCycles(ctx, 4);
      return period ? 2 * period : (SERIAL_OUTPUT_DATA_NEEDED_CYCLES / 10) | 0;
    }

    // A SEROUT write queues a byte. The shift register loads it one bit cell
    // later when idle, or when the byte being shifted out ends. The load
    // raises serial output needed (IRQ bit 4), and ten bits later the output
    // is idle (IRQST bit 3) unless another byte follows. A second write before
    // the load replaces the queued byte (AHRM 5.6).
    function serialOutputWrite(ctx, now) {
      const io = ctx.ioData;
      if (io.serialOutputNeedDataCycle !== CYCLE_NEVER) return;

      const bit = serialOutputBitCycles(ctx);
      const busyUntil = io.serialOutputTransmissionDoneCycle;
      const load =
        busyUntil !== CYCLE_NEVER && busyUntil > now ? busyUntil : now + bit;
      io.serialOutputNeedDataCycle = load;
      io.serialOutputTransmissionDoneCycle = load + 10 * bit;
      cycleTimedEventUpdate(ctx);
    }

    // Initialization mode resets the serial port state machines and drops a
    // queued SEROUT byte (AHRM 5.6); the emulated drive starts over as well.
    // The caller marks the serial output idle.
    function serialReset(ctx) {
      const io = ctx.ioData;
      io.sioOutIndex = 0;
      io.sioOutPhase = 0;
      io.sioDataIndex = 0;
      io.sioInSize = 0;
      io.sioInIndex = 0;
      io.sioInNextCycle = CYCLE_NEVER;
      io.serialInputDataReadyCycle = CYCLE_NEVER;
      io.serialOutputNeedDataCycle = CYCLE_NEVER;
      io.serialOutputTransmissionDoneCycle = CYCLE_NEVER;
      cycleTimedEventUpdate(ctx);
    }

    function diskSectorSize(disk) {
      let s = DISK_SECTOR_SIZE_SINGLE;
      if (disk && disk.length >= 6) {
        s = (disk[4] & 0xff) | ((disk[5] & 0xff) << 8);
        if (s !== DISK_SECTOR_SIZE_SINGLE && s !== DISK_SECTOR_SIZE_ENHANCED) {
          s = DISK_SECTOR_SIZE_SINGLE;
        }
      }
      return s;
    }

    function sectorBytesAndOffset(sectorIndex, sectorSize) {
      if (sectorIndex <= 0) return null;
      const bytes =
        sectorIndex <= DISK_BOOT_SECTORS ? DISK_SECTOR_SIZE_SINGLE : sectorSize;
      const index =
        sectorIndex <= DISK_BOOT_SECTORS
          ? (sectorIndex - 1) * DISK_SECTOR_SIZE_SINGLE
          : (sectorIndex - (DISK_BOOT_SECTORS + 1)) * sectorSize +
            DISK_SECTOR_SIZE_SINGLE * DISK_BOOT_SECTORS;
      const offset = DISK_HEADER_SIZE + index;
      return { bytes: bytes | 0, offset: offset | 0 };
    }

    function queueSingleByteResponse(ctx, now, value) {
      const io = ctx.ioData;
      io.sioBuffer[0] = value & 0xff;
      queueSerinResponse(ctx, now, 1);
    }

    function queueDeviceNack(ctx, now) {
      queueSingleByteResponse(ctx, now, CHAR_NACK);
    }

    function writeAckStatus(buf, statusChar) {
      buf[0] = CHAR_ACK;
      buf[1] = statusChar & 0xff;
    }

    function writeAckComplete(buf) {
      writeAckStatus(buf, CHAR_COMPLETE);
    }

    function queueAckComplete(ctx, now) {
      const io = ctx.ioData;
      const buf = io.sioBuffer;
      writeAckComplete(buf);
      queueSerinResponse(ctx, now, 2);
    }

    function queueAckData(ctx, now, dataStartIndex, dataSize) {
      const io = ctx.ioData;
      const buf = io.sioBuffer;
      writeAckComplete(buf);
      buf[dataSize + 2] = sioChecksum(
        buf.subarray(dataStartIndex, dataStartIndex + dataSize),
        dataSize,
      );
      queueSerinResponse(ctx, now, dataSize + 3);
    }

    function canAccessSector(disk, diskSize, sectorInfo) {
      return (
        !!disk &&
        !!sectorInfo &&
        sectorInfo.offset >= DISK_HEADER_SIZE &&
        sectorInfo.offset + sectorInfo.bytes <= diskSize
      );
    }

    function deviceSlotIndexFromDeviceId(devId) {
      const slot = (devId & 0xff) - DISK_DEVICE_ID_BASE;
      if (slot < 0 || slot >= DISK_DEVICE_COUNT) return -1;
      return slot;
    }

    function getMountedDiskForDevice(io, devId) {
      const slot = deviceSlotIndexFromDeviceId(devId);
      if (slot < 0) return null;

      const slots = io.deviceSlots;
      const images = io.diskImages;
      if (!slots || typeof slots.length !== "number" || slot >= slots.length)
        {return null;}
      const imageIndex = slots[slot] | 0;

      if (
        imageIndex >= 0 &&
        images &&
        typeof images.length === "number" &&
        imageIndex < images.length
      ) {
        const img = images[imageIndex];
        if (img && img.bytes) {
          return {
            bytes: img.bytes,
            size: img.size | 0 || img.bytes.length | 0,
          };
        }
      }

      return null;
    }

    function diskDevice(devId) {
      function onCommandFrame(ctx, now, cmd, aux1, aux2) {
        const io = ctx.ioData;
        const buf = io.sioBuffer;
        const mounted = getMountedDiskForDevice(io, devId);
        const disk = mounted ? mounted.bytes : null;
        const diskSize = mounted ? mounted.size | 0 : 0;
        const sectorSize = diskSectorSize(disk);

        // A drive without a disk image is not on the bus: no response, the
        // OS times out (AHRM 9.1).
        if (!disk || diskSize <= DISK_HEADER_SIZE) return;

        if (cmd === CMD_READ_SECTOR) {
          // READ SECTOR
          const sectorIndex = (aux1 | (aux2 << 8)) & 0xffff;
          const si = sectorBytesAndOffset(sectorIndex, sectorSize);
          if (!canAccessSector(disk, diskSize, si)) {
            queueDeviceNack(ctx, now);
            return;
          }
          buf.set(disk.subarray(si.offset, si.offset + si.bytes), 2);
          queueAckData(ctx, now, 2, si.bytes);
          return;
        }

        if (cmd === CMD_STATUS) {
          // Drive status (motor running, density), inverted FDC status
          // ($FF = no error), format timeout and an unused byte
          // (AHRM 10.2, Table 44).
          buf[2] = 0x10;
          if (sectorSize === DISK_SECTOR_SIZE_ENHANCED) {
            buf[2] |= 0x20;
          } else if ((((diskSize - DISK_HEADER_SIZE) / 128) | 0) === 1040) {
            buf[2] |= 0x80;
          }
          buf[3] = 0xff;
          buf[4] = 0xe0;
          buf[5] = 0x00;
          queueAckData(ctx, now, 2, 4);
          return;
        }

        if (
          cmd === CMD_WRITE_SECTOR ||
          cmd === CMD_PUT_SECTOR ||
          cmd === CMD_VERIFY_SECTOR
        ) {
          // WRITE / PUT / VERIFY SECTOR (expects a data frame).
          const sectorIndex2 = (aux1 | (aux2 << 8)) & 0xffff;
          const si2 = sectorBytesAndOffset(sectorIndex2, sectorSize);
          if (!canAccessSector(disk, diskSize, si2)) {
            queueDeviceNack(ctx, now);
            return;
          }

          io.sioOutPhase = 1;
          io.sioDataIndex = 0;
          io.sioPendingDevice = devId & 0xff;
          io.sioPendingCmd = cmd & 0xff;
          io.sioPendingSector = sectorIndex2 & 0xffff;
          io.sioPendingBytes = si2.bytes | 0;

          // ACK command frame; host will then send the data frame.
          queueSingleByteResponse(ctx, now, CHAR_ACK);
          return;
        }

        if (cmd === CMD_FORMAT) {
          // Format clears every sector and returns a sector-sized list of bad
          // sectors ended by $FFFF; here the list is empty (AHRM 10.2).
          disk.fill(0, DISK_HEADER_SIZE);
          buf.fill(0xff, 2, 2 + sectorSize);
          queueAckData(ctx, now, 2, sectorSize);
          return;
        }

        if (cmd === CMD_MOTOR_ON) {
          // MOTOR ON: no-op, but ACK.
          queueAckComplete(ctx, now);
          return;
        }

        // A drive NAKs commands it does not support (AHRM 9.1).
        queueDeviceNack(ctx, now);
      }

      function onDataFrame(ctx, now, payloadOffset, payloadBytes, providedCrc) {
        const io = ctx.ioData;
        const buf = io.sioBuffer;
        const cmd = io.sioPendingCmd & 0xff;
        const mounted = getMountedDiskForDevice(io, devId);
        const disk = mounted ? mounted.bytes : null;
        const diskSize = mounted ? mounted.size | 0 : 0;
        const sectorSize = diskSectorSize(disk);
        const si = sectorBytesAndOffset(io.sioPendingSector | 0, sectorSize);
        const calculated = sioChecksum(
          buf.subarray(payloadOffset, payloadOffset + payloadBytes),
          payloadBytes,
        );

        if (
          calculated !== providedCrc ||
          !canAccessSector(disk, diskSize, si) ||
          si.bytes !== payloadBytes
        ) {
          queueDeviceNack(ctx, now);
          return;
        }

        if (cmd === CMD_VERIFY_SECTOR) {
          // VERIFY SECTOR: compare payload to current disk content.
          let ok = true;
          for (let vi = 0; vi < si.bytes; vi++) {
            if (
              (disk[si.offset + vi] & 0xff) !==
              (buf[payloadOffset + vi] & 0xff)
            ) {
              ok = false;
              break;
            }
          }
          writeAckStatus(buf, ok ? CHAR_COMPLETE : CHAR_ERROR);
          queueSerinResponse(ctx, now, 2);
          return;
        }

        // WRITE / PUT: write sector payload.
        disk.set(buf.subarray(payloadOffset, payloadOffset + si.bytes), si.offset);
        queueAckComplete(ctx, now);
      }

      return {
        onCommandFrame: onCommandFrame,
        onDataFrame: onDataFrame,
      };
    }

    const sioDeviceHandlers = Object.create(null);
    for (
      let devId = DISK_DEVICE_ID_BASE;
      devId < DISK_DEVICE_ID_BASE + DISK_DEVICE_COUNT;
      devId++
    ) {
      sioDeviceHandlers[devId] = diskDevice(devId);
    }

    function seroutWrite(ctx, value) {
      const io = ctx.ioData;
      const now = effectiveEventCycle(ctx);

      serialOutputWrite(ctx, now);

      const buf = io.sioBuffer;

      // --- Data phase (write/put/verify) ---
      if ((io.sioOutPhase | 0) === 1) {
        let dataIndex = io.sioDataIndex | 0;
        buf[SIO_DATA_OFFSET + dataIndex] = value & 0xff;
        dataIndex = (dataIndex + 1) | 0;
        io.sioDataIndex = dataIndex;

        const expected = (io.sioPendingBytes | 0) + 1; // data + checksum
        if (dataIndex !== expected) return;

        const dataBytes = io.sioPendingBytes | 0;
        const provided = buf[SIO_DATA_OFFSET + dataBytes] & 0xff;
        const pendingDev = io.sioPendingDevice & 0xff;
        const handler = sioDeviceHandlers[pendingDev];
        if (handler && handler.onDataFrame) {
          handler.onDataFrame(ctx, now, SIO_DATA_OFFSET, dataBytes, provided);
        }

        // Reset state.
        io.sioOutPhase = 0;
        io.sioDataIndex = 0;
        io.sioPendingDevice = 0;
        io.sioPendingCmd = 0;
        io.sioPendingSector = 0;
        io.sioPendingBytes = 0;
        io.sioOutIndex = 0;
        return;
      }

      // --- Command phase ---
      let outIdx = io.sioOutIndex | 0;
      if (outIdx === 0) {
        if (value > 0 && value < 255) {
          buf[0] = value & 0xff;
          io.sioOutIndex = 1;
        }
        return;
      }

      buf[outIdx] = value & 0xff;
      outIdx = (outIdx + 1) | 0;
      io.sioOutIndex = outIdx;

      if (outIdx !== 5) return;

      // Reset outgoing command state (always, like the C emulator).
      io.sioOutIndex = 0;

      // Devices ignore frames for other device IDs and frames with a bad
      // checksum; the OS then times out (AHRM 9.1).
      if (sioChecksum(buf, 4) !== (buf[4] & 0xff)) return;

      const dev = buf[0] & 0xff;
      const cmd2 = buf[1] & 0xff;
      const aux1 = buf[2] & 0xff;
      const aux2 = buf[3] & 0xff;
      const handler2 = sioDeviceHandlers[dev];
      if (handler2 && handler2.onCommandFrame) {
        handler2.onCommandFrame(ctx, now, cmd2, aux1, aux2);
      }
    }

    // Reading SERIN has no side effects (AHRM 5.6).
    function serinRead(ctx) {
      serialInputSync(ctx);
      return ctx.ram[IO_SEROUT_SERIN] & 0xff;
    }

    return {
      seroutWrite: seroutWrite,
      serinRead: serinRead,
      serialInputSync: serialInputSync,
      serialReset: serialReset,
    };
  }

  window.A8EPokeySio = {
    createApi: createApi,
  };
})();
