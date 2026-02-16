(function () {
  "use strict";

  function createApi(cfg) {
    let IO_SEROUT_SERIN = cfg.IO_SEROUT_SERIN;

    let SERIAL_OUTPUT_DATA_NEEDED_CYCLES = cfg.SERIAL_OUTPUT_DATA_NEEDED_CYCLES;
    let SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES =
      cfg.SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
    let SERIAL_INPUT_FIRST_DATA_READY_CYCLES =
      cfg.SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
    let SERIAL_INPUT_DATA_READY_CYCLES = cfg.SERIAL_INPUT_DATA_READY_CYCLES;

    let cycleTimedEventUpdate = cfg.cycleTimedEventUpdate;

    let SIO_DATA_OFFSET = 32;

    function sioChecksum(buf, size) {
      let checksum = 0;
      for (let i = 0; i < size; i++) {
        let b = buf[i] & 0xff;
        checksum = (checksum + (((checksum + b) >> 8) & 0xff) + b) & 0xff;
      }
      return checksum & 0xff;
    }

    function queueSerinResponse(ctx, now, size) {
      let io = ctx.ioData;
      io.sioInSize = size | 0;
      io.sioInIndex = 0;
      io.serialInputDataReadyCycle = now + SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
      cycleTimedEventUpdate(ctx);
    }

    function diskSectorSize(disk) {
      let s = 128;
      if (disk && disk.length >= 6) {
        s = (disk[4] & 0xff) | ((disk[5] & 0xff) << 8);
        if (s !== 128 && s !== 256) s = 128;
      }
      return s;
    }

    function sectorBytesAndOffset(sectorIndex, sectorSize) {
      if (sectorIndex <= 0) return null;
      let bytes = sectorIndex < 4 ? 128 : sectorSize;
      let index =
        sectorIndex < 4
          ? (sectorIndex - 1) * 128
          : (sectorIndex - 4) * sectorSize + 128 * 3;
      let offset = 16 + index;
      return { bytes: bytes | 0, offset: offset | 0 };
    }

    function queueSingleByteResponse(ctx, now, value) {
      let io = ctx.ioData;
      io.sioBuffer[0] = value & 0xff;
      queueSerinResponse(ctx, now, 1);
    }

    function queueDeviceNack(ctx, now) {
      queueSingleByteResponse(ctx, now, "N".charCodeAt(0));
    }

    function queueAckComplete(ctx, now) {
      let io = ctx.ioData;
      let buf = io.sioBuffer;
      buf[0] = "A".charCodeAt(0);
      buf[1] = "C".charCodeAt(0);
      queueSerinResponse(ctx, now, 2);
    }

    function queueAckData(ctx, now, dataStartIndex, dataSize) {
      let io = ctx.ioData;
      let buf = io.sioBuffer;
      buf[0] = "A".charCodeAt(0);
      buf[1] = "C".charCodeAt(0);
      buf[dataSize + 2] = sioChecksum(
        buf.subarray(dataStartIndex, dataStartIndex + dataSize),
        dataSize,
      );
      queueSerinResponse(ctx, now, dataSize + 3);
    }

    function disk1Device() {
      function onCommandFrame(ctx, now, cmd, aux1, aux2) {
        let io = ctx.ioData;
        let buf = io.sioBuffer;
        let disk = io.disk1;
        let diskSize = io.disk1Size | 0 || (disk ? disk.length : 0);
        let sectorSize = diskSectorSize(disk);

        if (cmd === 0x52) {
          // READ SECTOR
          let sectorIndex = (aux1 | (aux2 << 8)) & 0xffff;
          let si = sectorBytesAndOffset(sectorIndex, sectorSize);
          if (
            !disk ||
            !si ||
            si.offset < 16 ||
            si.offset + si.bytes > diskSize
          ) {
            queueDeviceNack(ctx, now);
            return;
          }
          buf.set(disk.subarray(si.offset, si.offset + si.bytes), 2);
          queueAckData(ctx, now, 2, si.bytes);
          return;
        }

        if (cmd === 0x53) {
          // STATUS
          if (!disk || !disk.length || disk[0] === 0) {
            queueDeviceNack(ctx, now);
            return;
          }
          buf[0] = "A".charCodeAt(0);
          buf[1] = "C".charCodeAt(0);
          if (sectorSize === 128) {
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

        if (cmd === 0x57 || cmd === 0x50 || cmd === 0x56) {
          // WRITE / PUT / VERIFY SECTOR (expects a data frame).
          let sectorIndex2 = (aux1 | (aux2 << 8)) & 0xffff;
          let si2 = sectorBytesAndOffset(sectorIndex2, sectorSize);
          if (
            !disk ||
            !si2 ||
            si2.offset < 16 ||
            si2.offset + si2.bytes > diskSize
          ) {
            queueDeviceNack(ctx, now);
            return;
          }

          io.sioOutPhase = 1;
          io.sioDataIndex = 0;
          io.sioPendingDevice = 0x31;
          io.sioPendingCmd = cmd & 0xff;
          io.sioPendingSector = sectorIndex2 & 0xffff;
          io.sioPendingBytes = si2.bytes | 0;

          // ACK command frame; host will then send the data frame.
          queueSingleByteResponse(ctx, now, "A".charCodeAt(0));
          return;
        }

        if (cmd === 0x21) {
          // FORMAT: clear data area (very minimal).
          if (!disk || !diskSize || diskSize <= 16) {
            queueDeviceNack(ctx, now);
            return;
          }
          disk.fill(0, 16);
          queueAckComplete(ctx, now);
          return;
        }

        if (cmd === 0x55) {
          // MOTOR ON: no-op, but ACK.
          queueAckComplete(ctx, now);
          return;
        }

        // Unsupported command.
        queueDeviceNack(ctx, now);
      }

      function onDataFrame(ctx, now, payloadOffset, payloadBytes, providedCrc) {
        let io = ctx.ioData;
        let buf = io.sioBuffer;
        let cmd = io.sioPendingCmd & 0xff;
        let disk = io.disk1;
        let diskSize = io.disk1Size | 0 || (disk ? disk.length : 0);
        let sectorSize = diskSectorSize(disk);
        let si = sectorBytesAndOffset(io.sioPendingSector | 0, sectorSize);
        let calculated = sioChecksum(
          buf.subarray(payloadOffset, payloadOffset + payloadBytes),
          payloadBytes,
        );

        if (
          calculated !== providedCrc ||
          !disk ||
          !si ||
          si.offset < 16 ||
          si.offset + si.bytes > diskSize ||
          si.bytes !== payloadBytes
        ) {
          queueDeviceNack(ctx, now);
          return;
        }

        if (cmd === 0x56) {
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
          buf[0] = "A".charCodeAt(0);
          buf[1] = ok ? "C".charCodeAt(0) : "E".charCodeAt(0);
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

    let sioDeviceHandlers = Object.create(null);
    sioDeviceHandlers[0x31] = disk1Device();

    function seroutWrite(ctx, value) {
      let io = ctx.ioData;
      let now = ctx.cycleCounter;

      io.serialOutputNeedDataCycle = now + SERIAL_OUTPUT_DATA_NEEDED_CYCLES;
      cycleTimedEventUpdate(ctx);

      let buf = io.sioBuffer;

      // --- Data phase (write/put/verify) ---
      if ((io.sioOutPhase | 0) === 1) {
        let dataIndex = io.sioDataIndex | 0;
        buf[SIO_DATA_OFFSET + dataIndex] = value & 0xff;
        dataIndex = (dataIndex + 1) | 0;
        io.sioDataIndex = dataIndex;

        let expected = (io.sioPendingBytes | 0) + 1; // data + checksum
        if (dataIndex !== expected) return;

        io.serialOutputTransmissionDoneCycle =
          now + SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
        cycleTimedEventUpdate(ctx);

        let dataBytes = io.sioPendingBytes | 0;
        let provided = buf[SIO_DATA_OFFSET + dataBytes] & 0xff;
        let pendingDev = io.sioPendingDevice & 0xff;
        let handler = sioDeviceHandlers[pendingDev];
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
        queueDeviceNack(ctx, now);
        return;
      }

      io.serialOutputTransmissionDoneCycle =
        now + SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
      cycleTimedEventUpdate(ctx);

      let dev = buf[0] & 0xff;
      let cmd2 = buf[1] & 0xff;
      let aux1 = buf[2] & 0xff;
      let aux2 = buf[3] & 0xff;
      let handler2 = sioDeviceHandlers[dev];
      if (handler2 && handler2.onCommandFrame) {
        handler2.onCommandFrame(ctx, now, cmd2, aux1, aux2);
      } else {
        queueDeviceNack(ctx, now);
      }
    }

    function serinRead(ctx) {
      let io = ctx.ioData;
      if ((io.sioInSize | 0) > 0) {
        let b = io.sioBuffer[io.sioInIndex & 0xffff] & 0xff;
        io.sioInIndex = (io.sioInIndex + 1) & 0xffff;
        io.sioInSize = (io.sioInSize - 1) | 0;
        ctx.ram[IO_SEROUT_SERIN] = b;

        if ((io.sioInSize | 0) > 0) {
          io.serialInputDataReadyCycle =
            ctx.cycleCounter + SERIAL_INPUT_DATA_READY_CYCLES;
          cycleTimedEventUpdate(ctx);
        } else {
          io.sioInIndex = 0;
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
