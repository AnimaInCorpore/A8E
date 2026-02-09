(function () {
  "use strict";

  function createApi(cfg) {
    var IO_SEROUT_SERIN = cfg.IO_SEROUT_SERIN;

    var SERIAL_OUTPUT_DATA_NEEDED_CYCLES = cfg.SERIAL_OUTPUT_DATA_NEEDED_CYCLES;
    var SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES =
      cfg.SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
    var SERIAL_INPUT_FIRST_DATA_READY_CYCLES =
      cfg.SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
    var SERIAL_INPUT_DATA_READY_CYCLES = cfg.SERIAL_INPUT_DATA_READY_CYCLES;

    var cycleTimedEventUpdate = cfg.cycleTimedEventUpdate;

    var SIO_DATA_OFFSET = 32;

    function sioChecksum(buf, size) {
      var checksum = 0;
      for (var i = 0; i < size; i++) {
        var b = buf[i] & 0xff;
        checksum = (checksum + (((checksum + b) >> 8) & 0xff) + b) & 0xff;
      }
      return checksum & 0xff;
    }

    function queueSerinResponse(ctx, now, size) {
      var io = ctx.ioData;
      io.sioInSize = size | 0;
      io.sioInIndex = 0;
      io.serialInputDataReadyCycle = now + SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
      cycleTimedEventUpdate(ctx);
    }

    function diskSectorSize(disk) {
      var s = 128;
      if (disk && disk.length >= 6) {
        s = (disk[4] & 0xff) | ((disk[5] & 0xff) << 8);
        if (s !== 128 && s !== 256) s = 128;
      }
      return s;
    }

    function sectorBytesAndOffset(sectorIndex, sectorSize) {
      if (sectorIndex <= 0) return null;
      var bytes = sectorIndex < 4 ? 128 : sectorSize;
      var index =
        sectorIndex < 4
          ? (sectorIndex - 1) * 128
          : (sectorIndex - 4) * sectorSize + 128 * 3;
      var offset = 16 + index;
      return { bytes: bytes | 0, offset: offset | 0 };
    }

    function seroutWrite(ctx, value) {
      var io = ctx.ioData;
      var now = ctx.cycleCounter;

      io.serialOutputNeedDataCycle = now + SERIAL_OUTPUT_DATA_NEEDED_CYCLES;
      cycleTimedEventUpdate(ctx);

      var buf = io.sioBuffer;

      // --- Data phase (write/put/verify) ---
      if ((io.sioOutPhase | 0) === 1) {
        var dataIndex = io.sioDataIndex | 0;
        buf[SIO_DATA_OFFSET + dataIndex] = value & 0xff;
        dataIndex = (dataIndex + 1) | 0;
        io.sioDataIndex = dataIndex;

        var expected = (io.sioPendingBytes | 0) + 1; // data + checksum
        if (dataIndex !== expected) return;

        io.serialOutputTransmissionDoneCycle =
          now + SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
        cycleTimedEventUpdate(ctx);

        var dataBytes = io.sioPendingBytes | 0;
        var provided = buf[SIO_DATA_OFFSET + dataBytes] & 0xff;
        var calculated = sioChecksum(
          buf.subarray(SIO_DATA_OFFSET, SIO_DATA_OFFSET + dataBytes),
          dataBytes,
        );

        var disk = io.disk1;
        var diskSize = io.disk1Size | 0 || (disk ? disk.length : 0);
        var sectorSize = diskSectorSize(disk);
        var si = sectorBytesAndOffset(io.sioPendingSector | 0, sectorSize);
        var cmd = io.sioPendingCmd & 0xff;

        if (
          calculated !== provided ||
          !disk ||
          !si ||
          si.offset < 16 ||
          si.offset + si.bytes > diskSize ||
          si.bytes !== dataBytes
        ) {
          buf[0] = "N".charCodeAt(0);
          queueSerinResponse(ctx, now, 1);
        } else if (cmd === 0x56) {
          // VERIFY SECTOR: compare payload to current disk content.
          var ok = true;
          for (var vi = 0; vi < si.bytes; vi++) {
            if (
              (disk[si.offset + vi] & 0xff) !==
              (buf[SIO_DATA_OFFSET + vi] & 0xff)
            ) {
              ok = false;
              break;
            }
          }
          buf[0] = "A".charCodeAt(0);
          buf[1] = ok ? "C".charCodeAt(0) : "E".charCodeAt(0);
          queueSerinResponse(ctx, now, 2);
        } else {
          // WRITE / PUT: write sector payload.
          disk.set(
            buf.subarray(SIO_DATA_OFFSET, SIO_DATA_OFFSET + si.bytes),
            si.offset,
          );
          buf[0] = "A".charCodeAt(0);
          buf[1] = "C".charCodeAt(0);
          queueSerinResponse(ctx, now, 2);
        }

        // Reset state.
        io.sioOutPhase = 0;
        io.sioDataIndex = 0;
        io.sioPendingCmd = 0;
        io.sioPendingSector = 0;
        io.sioPendingBytes = 0;
        io.sioOutIndex = 0;
        return;
      }

      // --- Command phase ---
      var outIdx = io.sioOutIndex | 0;
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
        buf[0] = "N".charCodeAt(0);
        queueSerinResponse(ctx, now, 1);
        return;
      }

      io.serialOutputTransmissionDoneCycle =
        now + SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
      cycleTimedEventUpdate(ctx);

      var dev = buf[0] & 0xff;
      var cmd2 = buf[1] & 0xff;
      var aux1 = buf[2] & 0xff;
      var aux2 = buf[3] & 0xff;

      // Only D1: for now.
      if (dev !== 0x31) {
        buf[0] = "N".charCodeAt(0);
        queueSerinResponse(ctx, now, 1);
        return;
      }

      var disk2 = io.disk1;
      var diskSize2 = io.disk1Size | 0 || (disk2 ? disk2.length : 0);
      var sectorSize2 = diskSectorSize(disk2);

      if (cmd2 === 0x52) {
        // READ SECTOR
        var sectorIndex = (aux1 | (aux2 << 8)) & 0xffff;
        var si2 = sectorBytesAndOffset(sectorIndex, sectorSize2);
        if (
          !disk2 ||
          !si2 ||
          si2.offset < 16 ||
          si2.offset + si2.bytes > diskSize2
        ) {
          buf[0] = "N".charCodeAt(0);
          queueSerinResponse(ctx, now, 1);
          return;
        }
        buf[0] = "A".charCodeAt(0);
        buf[1] = "C".charCodeAt(0);
        buf.set(disk2.subarray(si2.offset, si2.offset + si2.bytes), 2);
        buf[si2.bytes + 2] = sioChecksum(
          buf.subarray(2, 2 + si2.bytes),
          si2.bytes,
        );
        queueSerinResponse(ctx, now, si2.bytes + 3);
        return;
      }

      if (cmd2 === 0x53) {
        // STATUS
        if (!disk2 || !disk2.length || disk2[0] === 0) {
          buf[0] = "N".charCodeAt(0);
          queueSerinResponse(ctx, now, 1);
          return;
        }
        buf[0] = "A".charCodeAt(0);
        buf[1] = "C".charCodeAt(0);
        if (sectorSize2 === 128) {
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

      if (cmd2 === 0x57 || cmd2 === 0x50 || cmd2 === 0x56) {
        // WRITE / PUT / VERIFY SECTOR (expects a data frame).
        var sectorIndex2 = (aux1 | (aux2 << 8)) & 0xffff;
        var si3 = sectorBytesAndOffset(sectorIndex2, sectorSize2);
        if (
          !disk2 ||
          !si3 ||
          si3.offset < 16 ||
          si3.offset + si3.bytes > diskSize2
        ) {
          buf[0] = "N".charCodeAt(0);
          queueSerinResponse(ctx, now, 1);
          return;
        }

        io.sioOutPhase = 1;
        io.sioDataIndex = 0;
        io.sioPendingCmd = cmd2 & 0xff;
        io.sioPendingSector = sectorIndex2 & 0xffff;
        io.sioPendingBytes = si3.bytes | 0;

        // ACK command frame; host will then send the data frame.
        buf[0] = "A".charCodeAt(0);
        queueSerinResponse(ctx, now, 1);
        return;
      }

      if (cmd2 === 0x21) {
        // FORMAT: clear data area (very minimal).
        if (!disk2 || !diskSize2 || diskSize2 <= 16) {
          buf[0] = "N".charCodeAt(0);
          queueSerinResponse(ctx, now, 1);
          return;
        }
        disk2.fill(0, 16);
        buf[0] = "A".charCodeAt(0);
        buf[1] = "C".charCodeAt(0);
        queueSerinResponse(ctx, now, 2);
        return;
      }

      if (cmd2 === 0x55) {
        // MOTOR ON: no-op, but ACK.
        buf[0] = "A".charCodeAt(0);
        buf[1] = "C".charCodeAt(0);
        queueSerinResponse(ctx, now, 2);
        return;
      }

      // Unsupported command.
      buf[0] = "N".charCodeAt(0);
      queueSerinResponse(ctx, now, 1);
    }

    function serinRead(ctx) {
      var io = ctx.ioData;
      if ((io.sioInSize | 0) > 0) {
        var b = io.sioBuffer[io.sioInIndex & 0xffff] & 0xff;
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
