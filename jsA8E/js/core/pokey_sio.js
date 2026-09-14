(function () {
  "use strict";

  function createApi(cfg) {
    const IO_SEROUT_SERIN = cfg.IO_SEROUT_SERIN;
    const SERIAL_OUTPUT_DATA_NEEDED_CYCLES =
      cfg.SERIAL_OUTPUT_DATA_NEEDED_CYCLES;
    const SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES =
      cfg.SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
    const SERIAL_INPUT_FIRST_DATA_READY_CYCLES =
      cfg.SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
    const SERIAL_INPUT_DATA_READY_CYCLES = cfg.SERIAL_INPUT_DATA_READY_CYCLES;

    const cycleTimedEventUpdate = cfg.cycleTimedEventUpdate;

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
    const SIO_DIAGNOSTIC_LIMIT = 512;

    const CMD_FORMAT = 0x21;
    const CMD_READ_SECTOR = 0x52;
    const CMD_STATUS = 0x53;
    const CMD_MOTOR_ON = 0x55;
    const CMD_VERIFY_SECTOR = 0x56;
    const CMD_WRITE_SECTOR = 0x57;
    const CMD_PUT_SECTOR = 0x50;
    const CMD_HIGH_SPEED_INDEX = 0x3f;
    const CMD_POLL = 0x40;

    function sioChecksum(buf, size) {
      let checksum = 0;
      for (let i = 0; i < size; i++) {
        const b = buf[i] & 0xff;
        checksum = (checksum + (((checksum + b) >> 8) & 0xff) + b) & 0xff;
      }
      return checksum & 0xff;
    }

    function recordSioEvent(ctx, type, fields) {
      const diagnostics = ctx.ioData && ctx.ioData.sioDiagnostics;
      if (!diagnostics) return;
      const event = Object.assign({
        sequence: diagnostics.eventCount >>> 0,
        cycle: ctx.cycleCounter >>> 0,
        type: type,
      }, fields || {});
      diagnostics.eventCount = (diagnostics.eventCount + 1) >>> 0;
      diagnostics.events.push(event);
      if (diagnostics.events.length > SIO_DIAGNOSTIC_LIMIT)
        diagnostics.events.shift();
    }

    function effectiveEventCycle(ctx) {
      return ctx.cycleCounter;
    }

    function handleAbsentDevice(ctx, device, command) {
      const io = ctx.ioData;
      // An absent Type 1/2 device is electrically silent. The OS owns the
      // timeout and completion state (AHRM 9.1, 9.2).
      io.sioInIndex = 0;
      io.sioInSize = 0;
      io.sioPendingReadSize = 0;
      recordSioEvent(ctx, "absent_device", {
        device: device & 0xff,
        command: command & 0xff,
      });
    }

    function queueSerinResponse(ctx, now, size) {
      const io = ctx.ioData;
      io.sioInSize = size | 0;
      io.sioInIndex = 0;
      io.serialInputDataReadyCycle = now + SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
      recordSioEvent(ctx, "response_queued", {
        size: size | 0,
        firstByte: io.sioBuffer[0] & 0xff,
        secondByte: io.sioBuffer[1] & 0xff,
      });
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
      // A disk drive acknowledges the command before sending the data frame.
      // Keep the two phases separate so software polling SERIN/IRQST sees the
      // same byte boundaries as the real SIO bus (AHRM 9.1, 5.6).
      io.sioPendingReadSize = dataSize | 0;
      io.sioBuffer[0] = CHAR_ACK;
      queueSerinResponse(ctx, now, 1);
    }

    function queuePendingReadData(ctx, now) {
      const io = ctx.ioData;
      const dataSize = io.sioPendingReadSize | 0;
      if (dataSize <= 0) return false;

      const buf = io.sioBuffer;
      // The response already contains C, data, and checksum at offsets
      // 1..dataSize+1. Move the sector down one byte for the data phase.
      buf[0] = CHAR_COMPLETE;
      for (let i = 0; i < dataSize; i++)
        buf[i + 1] = buf[i + 2] & 0xff;
      buf[dataSize + 1] = sioChecksum(buf.subarray(1, dataSize + 1), dataSize);
      io.sioPendingReadSize = 0;
      queueSerinResponse(ctx, now, dataSize + 2);
      return true;
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
            deviceSlot: slot,
            imageIndex: imageIndex,
            bytes: img.bytes,
            size: img.size | 0 || img.bytes.length | 0,
          };
        }
      }

      return null;
    }

    // Application-layer observers may persist a disk image after a successful
    // mutation. This callback is deliberately outside the SIO response path:
    // it does not alter protocol bytes or timing.
    function notifyDiskMediaChanged(io, mounted) {
      if (!mounted || typeof io.diskMediaChangeObserver !== "function") return;
      try {
        io.diskMediaChangeObserver(
          mounted.imageIndex | 0,
          mounted.deviceSlot | 0,
        );
      } catch {
        // Persistence observers must never affect emulated SIO behavior.
      }
    }

    function diskDevice(devId) {
      function onCommandFrame(ctx, now, cmd, aux1, aux2) {
        const io = ctx.ioData;
        const buf = io.sioBuffer;
        const mounted = getMountedDiskForDevice(io, devId);
        const disk = mounted ? mounted.bytes : null;
        const diskSize = mounted ? mounted.size | 0 : 0;
        const sectorSize = diskSectorSize(disk);

        if (cmd === CMD_READ_SECTOR) {
          // READ SECTOR
          const sectorIndex = (aux1 | (aux2 << 8)) & 0xffff;
          const si = sectorBytesAndOffset(sectorIndex, sectorSize);
          recordSioEvent(ctx, "read_command", {
            device: devId & 0xff,
            command: cmd & 0xff,
            sector: sectorIndex,
            sectorSize: si ? si.bytes : 0,
            bufferOffset: si ? si.offset : -1,
          });
          if (!canAccessSector(disk, diskSize, si)) {
            queueDeviceNack(ctx, now);
            return;
          }
          buf.set(disk.subarray(si.offset, si.offset + si.bytes), 2);
          queueAckData(ctx, now, 2, si.bytes);
          return;
        }

        if (cmd === CMD_HIGH_SPEED_INDEX) {
          // AHRM 10.3: a disk drive may answer this command with the
          // US Doubler divisor. Type 1 polls using $3F are filtered before
          // reaching this disk handler and receive no response instead.
          recordSioEvent(ctx, "high_speed_index_command", {
            device: devId & 0xff,
            command: cmd & 0xff,
            divisor: 0x0a,
          });
          buf[2] = 0x0a;
          queueAckData(ctx, now, 2, 1);
          return;
        }

        if (cmd === CMD_POLL) {
          // Type 3 poll/reset is a bus-wide protocol. This disk device does
          // not provide a downloadable handler, so it must stay silent.
          recordSioEvent(ctx, "poll_command", {
            device: devId & 0xff,
            command: cmd & 0xff,
            aux1: aux1 & 0xff,
            aux2: aux2 & 0xff,
          });
          return;
        }

        if (cmd === CMD_STATUS) {
          // STATUS
          recordSioEvent(ctx, "status_command", {
            device: devId & 0xff,
            command: cmd & 0xff,
          });
          if (!disk || !disk.length || disk[0] === 0) {
            queueDeviceNack(ctx, now);
            return;
          }
          writeAckComplete(buf);
          if (sectorSize === DISK_SECTOR_SIZE_SINGLE) {
            buf[2] = 0x10;
            buf[3] = 0x00;
            buf[4] = 0x01;
            buf[5] = 0x00;
            buf[6] = 0x11;
          } else {
            buf[2] = 0x30;
            buf[3] = 0x00;
            buf[4] = 0x01;
            buf[5] = 0x00;
            buf[6] = 0x31;
          }
          queueSerinResponse(ctx, now, 7);
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
          // FORMAT: clear data area (very minimal).
          if (!disk || !diskSize || diskSize <= DISK_HEADER_SIZE) {
            queueDeviceNack(ctx, now);
            return;
          }
          disk.fill(0, DISK_HEADER_SIZE);
          notifyDiskMediaChanged(io, mounted);
          queueAckComplete(ctx, now);
          return;
        }

        if (cmd === CMD_MOTOR_ON) {
          // MOTOR ON: no-op, but ACK.
          queueAckComplete(ctx, now);
          return;
        }

        // Unsupported command.
        recordSioEvent(ctx, "unsupported_command", {
          device: devId & 0xff,
          command: cmd & 0xff,
          aux1: aux1 & 0xff,
          aux2: aux2 & 0xff,
        });
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
        notifyDiskMediaChanged(io, mounted);
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

      io.serialOutputNeedDataCycle = now + SERIAL_OUTPUT_DATA_NEEDED_CYCLES;
      cycleTimedEventUpdate(ctx);

      const buf = io.sioBuffer;

      // --- Data phase (write/put/verify) ---
      if ((io.sioOutPhase | 0) === 1) {
        let dataIndex = io.sioDataIndex | 0;
        buf[SIO_DATA_OFFSET + dataIndex] = value & 0xff;
        dataIndex = (dataIndex + 1) | 0;
        io.sioDataIndex = dataIndex;

        const expected = (io.sioPendingBytes | 0) + 1; // data + checksum
        if (dataIndex !== expected) return;

        io.serialOutputTransmissionDoneCycle =
          now + SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
        cycleTimedEventUpdate(ctx);

        const dataBytes = io.sioPendingBytes | 0;
        const provided = buf[SIO_DATA_OFFSET + dataBytes] & 0xff;
        const pendingDev = io.sioPendingDevice & 0xff;
        const handler = sioDeviceHandlers[pendingDev];
        if (handler && handler.onDataFrame) {
          handler.onDataFrame(ctx, now, SIO_DATA_OFFSET, dataBytes, provided);
        } else {
          queueDeviceNack(ctx, now);
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

      if (sioChecksum(buf, 4) !== (buf[4] & 0xff)) {
        recordSioEvent(ctx, "command_checksum_error", {
          device: buf[0] & 0xff,
          command: buf[1] & 0xff,
          aux1: buf[2] & 0xff,
          aux2: buf[3] & 0xff,
        });
        queueDeviceNack(ctx, now);
        return;
      }

      io.serialOutputTransmissionDoneCycle =
        now + SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
      cycleTimedEventUpdate(ctx);

      const dev = buf[0] & 0xff;
      const cmd2 = buf[1] & 0xff;
      const aux1 = buf[2] & 0xff;
      const aux2 = buf[3] & 0xff;
      const handler2 = sioDeviceHandlers[dev];
      recordSioEvent(ctx, "command_frame", {
        device: dev,
        command: cmd2,
        aux1: aux1,
        aux2: aux2,
      });
      if (handler2 && handler2.onCommandFrame) {
        handler2.onCommandFrame(ctx, now, cmd2, aux1, aux2);
      } else {
        // $3F/$40 are SIO poll commands. An absent peripheral must not be
        // turned into a disk NACK; the OS uses the resulting timeout.
        if (cmd2 === CMD_HIGH_SPEED_INDEX || cmd2 === CMD_POLL) {
          // A missing peripheral must remain electrically silent. The OS
          // owns the timeout and completion state; SIO only records that the
          // response phase is pending.
          handleAbsentDevice(ctx, dev, cmd2);
          return;
        }
        queueDeviceNack(ctx, now);
      }
    }

    function serinRead(ctx) {
      const io = ctx.ioData;
      if ((io.sioInSize | 0) > 0) {
        const b = io.sioBuffer[io.sioInIndex & 0xffff] & 0xff;
        io.sioInIndex = (io.sioInIndex + 1) & 0xffff;
        io.sioInSize = (io.sioInSize - 1) | 0;
        ctx.ram[IO_SEROUT_SERIN] = b;
        // Keep the trace focused on frame boundaries. Logging every byte
        // would hide command/sector events in a single 128-byte response.
        if ((io.sioInSize | 0) <= 1) {
          recordSioEvent(ctx, "serin_frame_end", {
            value: b,
            remaining: io.sioInSize | 0,
          });
        }

        if ((io.sioInSize | 0) > 0) {
          io.serialInputDataReadyCycle =
            effectiveEventCycle(ctx) + SERIAL_INPUT_DATA_READY_CYCLES;
          cycleTimedEventUpdate(ctx);
        } else {
          io.sioInIndex = 0;
          queuePendingReadData(ctx, effectiveEventCycle(ctx));
        }
      }
      return ctx.ram[IO_SEROUT_SERIN] & 0xff;
    }

    return {
      seroutWrite: seroutWrite,
      serinRead: serinRead,
    };
  }

  window.A8EPokeySio = {
    createApi: createApi,
  };
})();
