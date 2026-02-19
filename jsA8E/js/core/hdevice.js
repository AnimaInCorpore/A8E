(function () {
  "use strict";

  // Atari CIO commands
  const CIO_CMD_OPEN = 0x03;
  const CIO_CMD_GET_RECORD = 0x05;
  const CIO_CMD_GET_BYTES = 0x07;
  const CIO_CMD_PUT_RECORD = 0x09;
  const CIO_CMD_PUT_BYTES = 0x0b;
  const CIO_CMD_CLOSE = 0x0c;
  const CIO_CMD_STATUS = 0x0d;
  const CIO_XIO_RENAME = 0x20;
  const CIO_XIO_DELETE = 0x21;
  const CIO_XIO_LOCK = 0x23;
  const CIO_XIO_UNLOCK = 0x24;

  // IOCB offsets (from $0340 + X)
  const IOCB_BASE = 0x0340;
  const IOCB_ICHID = 0x00;
  const IOCB_ICCOM = 0x02;
  const IOCB_ICSTA = 0x03;
  const IOCB_ICBAL = 0x04;
  const IOCB_ICBAH = 0x05;
  const IOCB_ICPTL = 0x06;
  const IOCB_ICPTH = 0x07;
  const IOCB_ICBLL = 0x08;
  const IOCB_ICBLH = 0x09;
  const IOCB_ICAX1 = 0x0a;

  // CIO status codes
  const STA_SUCCESS = 0x01;
  const STA_EOF = 0x88;
  const STA_INVALID_CMD = 0x84;
  const STA_NOT_OPEN = 0x85;
  const STA_INVALID_IOCB = 0x86;
  // DOS/FMS-compatible file errors
  const STA_FILE_EXISTS = 0xae; // duplicate filename
  const STA_FILE_NOT_FOUND = 0xaa;
  const STA_FILE_LOCKED = 0xa7; // file protected

  // Open modes (ICAX1 bits)
  const OPEN_READ = 0x04;
  const OPEN_WRITE = 0x08;
  const OPEN_APPEND = 0x09;
  const OPEN_UPDATE = OPEN_READ | OPEN_WRITE; // 0x0C
  const OPEN_DIRECTORY = 0x06;

  // Approximate host-side CIO timing so H: calls are not zero-cycle operations.
  const HDEVICE_CIO_BASE_CYCLES = 96;
  const HDEVICE_CIO_PER_BYTE_CYCLES = 2;

  // Atari EOL character
  const ATARI_EOL = 0x9b;

  // Sentinel for our H: handler in ICHID
  const HDEVICE_HANDLER_ID = 0xfe;
  // BASIC uses IOCB ICPT as "address minus one" for the one-byte output entry.
  const HDEVICE_PUTBYTE_HOOK_ADDR = 0xe45a;
  const HDEVICE_PUTBYTE_VECTOR_VALUE = (HDEVICE_PUTBYTE_HOOK_ADDR - 1) & 0xffff;
  const FLAG_N = 0x80;
  const FLAG_Z = 0x02;
  const FLAG_C = 0x01;

  function createApi(cfg) {
    const hostFsApi = cfg.hostFsApi;

    function create(hostFs) {
      // Per-channel state (8 IOCB channels)
      const channels = [];
      for (let i = 0; i < 8; i++) {
        channels.push({
          isOpen: false,
          fileName: null,
          mode: 0,
          position: 0,
          fileData: null, // Uint8Array for reading
          writeBuffer: null, // array of bytes for writing
          dirListing: null, // array of strings for directory mode
          dirIndex: 0,
        });
      }

      function _readIocb(ram, x, offset) {
        return ram[IOCB_BASE + (x & 0xf0) + offset] & 0xff;
      }

      function _writeIocb(ram, x, offset, value) {
        ram[IOCB_BASE + (x & 0xf0) + offset] = value & 0xff;
      }

      /**
       * Read a null/EOL-terminated ATASCII string from Atari RAM.
       */
      function _readString(ram, addr, maxLen) {
        let s = "";
        for (let i = 0; i < (maxLen || 256); i++) {
          const ch = ram[(addr + i) & 0xffff] & 0xff;
          if (ch === 0x00 || ch === ATARI_EOL) break;
          s += String.fromCharCode(ch);
        }
        return s;
      }

      /**
       * Check if a filename string references the H: device.
       */
      function _isHdevice(filename) {
        const upper = filename.toUpperCase().trim();
        // Match "H:", "H1:", "H2:", etc.
        if (upper.length >= 2 && upper[0] === "H") {
          if (upper[1] === ":") return true;
          if (
            upper.length >= 3 &&
            upper[1] >= "0" &&
            upper[1] <= "9" &&
            upper[2] === ":"
          ) {
            return true;
          }
        }
        return false;
      }

      function _extractDevicePath(filename) {
        let s = filename || "";
        const colon = s.indexOf(":");
        if (colon >= 0) s = s.substring(colon + 1);
        return s.trim();
      }

      function _isWildcardPattern(filename) {
        const s = _extractDevicePath(filename);
        return s.indexOf("*") >= 0 || s.indexOf("?") >= 0;
      }

      /**
       * Simulate RTS from the CIOV JSR and set CIO return status.
       */
      function _cioReturn(ctx, x, status, transferredBytes) {
        const cpu = ctx.cpu;
        const s = status & 0xff;
        // Write status to IOCB
        _writeIocb(ctx.ram, x, IOCB_ICSTA, s);
        // Y = status
        cpu.y = s;
        // Match LDY side effects so callers can branch on N/Z after CIO return.
        cpu.ps &= ~(FLAG_N | FLAG_Z | FLAG_C);
        cpu.ps |= s & FLAG_N;
        if (s === 0) cpu.ps |= FLAG_Z;
        // Carry: clear = success (status < 128), set = error
        if (s & FLAG_N) cpu.ps |= FLAG_C;
        // Simulate RTS: pop return address pushed by JSR CIOV.
        const lo = ctx.ram[0x100 + ((cpu.sp + 1) & 0xff)];
        const hi = ctx.ram[0x100 + ((cpu.sp + 2) & 0xff)];
        cpu.sp = (cpu.sp + 2) & 0xff;
        cpu.pc = ((lo | (hi << 8)) + 1) & 0xffff;

        const bytes = Math.max(0, transferredBytes | 0);
        ctx.cycleCounter += HDEVICE_CIO_BASE_CYCLES + bytes * HDEVICE_CIO_PER_BYTE_CYCLES;
      }

      function _isCalledViaJsr(ctx) {
        const cpu = ctx.cpu;
        const lo = ctx.ram[0x100 + ((cpu.sp + 1) & 0xff)] & 0xff;
        const hi = ctx.ram[0x100 + ((cpu.sp + 2) & 0xff)] & 0xff;
        const nextPc = ((lo | (hi << 8)) + 1) & 0xffff;
        const jsrAddr = (nextPc - 3) & 0xffff;
        return (ctx.ram[jsrAddr] & 0xff) === 0x20; // JSR abs opcode
      }

      function _isUpdateMode(mode) {
        return (mode & 0x0f) === OPEN_UPDATE;
      }

      function _setPutByteVector(ram, x) {
        _writeIocb(ram, x, IOCB_ICPTL, HDEVICE_PUTBYTE_VECTOR_VALUE & 0xff);
        _writeIocb(ram, x, IOCB_ICPTH, (HDEVICE_PUTBYTE_VECTOR_VALUE >> 8) & 0xff);
      }

      function _getPutByteVector(ram, x) {
        return _readIocb(ram, x, IOCB_ICPTL) | (_readIocb(ram, x, IOCB_ICPTH) << 8);
      }

      function _readDataForChannel(ch) {
        if (ch.writeBuffer) return ch.writeBuffer;
        return ch.fileData;
      }

      function _writeByteToChannel(ch, value) {
        const b = value & 0xff;
        if (_isUpdateMode(ch.mode)) {
          const pos = ch.position | 0;
          if (pos < ch.writeBuffer.length) ch.writeBuffer[pos] = b;
          else ch.writeBuffer.push(b);
          ch.position = (pos + 1) | 0;
          return;
        }
        ch.writeBuffer.push(b);
      }

      /**
       * Format a directory listing entry in Atari DOS style.
       * Returns an array of ATASCII bytes including trailing EOL.
       */
      function _formatDirEntry(name, size, locked) {
        // Format: " FILENAME EXT  nnn\x9B" or "*FILENAME EXT  nnn\x9B" if locked
        const dot = name.indexOf(".");
        let baseName = dot >= 0 ? name.substring(0, dot) : name;
        let ext = dot >= 0 ? name.substring(dot + 1) : "";
        while (baseName.length < 8) baseName += " ";
        while (ext.length < 3) ext += " ";
        // Size in sectors (128 bytes per sector, round up)
        const sectors = Math.max(1, Math.ceil(size / 128));
        let sizeStr = "" + sectors;
        while (sizeStr.length < 3) sizeStr = " " + sizeStr;
        const prefix = locked ? "*" : " ";
        const line = prefix + baseName + ext + " " + sizeStr;
        const bytes = [];
        for (let i = 0; i < line.length; i++) {
          bytes.push(line.charCodeAt(i) & 0xff);
        }
        bytes.push(ATARI_EOL);
        return bytes;
      }

      function _formatDirFooter(fileCount) {
        let free = 999 - fileCount;
        if (free < 0) free = 0;
        const line = free + " FREE SECTORS";
        const bytes = [];
        for (let i = 0; i < line.length; i++) {
          bytes.push(line.charCodeAt(i) & 0xff);
        }
        bytes.push(ATARI_EOL);
        return bytes;
      }

      // ---- CIO command handlers ----

      function _cmdOpen(ctx, x, ch) {
        if (ch.isOpen) {
          _cioReturn(ctx, x, STA_INVALID_IOCB);
          return;
        }
        const bufAddr =
          _readIocb(ctx.ram, x, IOCB_ICBAL) |
          (_readIocb(ctx.ram, x, IOCB_ICBAH) << 8);
        const filename = _readString(ctx.ram, bufAddr, 128);
        const mode = _readIocb(ctx.ram, x, IOCB_ICAX1);
        const openMode = mode & 0x0f;

        const openAsDirectory =
          openMode === OPEN_DIRECTORY ||
          (openMode === OPEN_READ && _isWildcardPattern(filename));

        if (openAsDirectory) {
          // Directory listing mode
          let pattern = _extractDevicePath(filename);
          if (!pattern || !pattern.length) pattern = "*.*";

          const files = hostFs.listFiles(pattern);
          const listing = [];
          for (let fi = 0; fi < files.length; fi++) {
            listing.push(
              _formatDirEntry(files[fi].name, files[fi].size, files[fi].locked),
            );
          }
          listing.push(_formatDirFooter(files.length));

          ch.isOpen = true;
          ch.mode = OPEN_DIRECTORY;
          ch.dirListing = listing;
          ch.dirIndex = 0;
          ch.fileName = null;
          ch.fileData = null;
          ch.writeBuffer = null;
          ch.position = 0;

          _writeIocb(ctx.ram, x, IOCB_ICHID, HDEVICE_HANDLER_ID);
          _setPutByteVector(ctx.ram, x);
          _cioReturn(ctx, x, STA_SUCCESS);
          return;
        }

        // File open
        const normName = hostFsApi.normalizeName(filename);
        if (!normName) {
          _cioReturn(ctx, x, STA_FILE_NOT_FOUND);
          return;
        }

        if (openMode === OPEN_READ) {
          const data = hostFs.readFile(normName);
          if (!data) {
            _cioReturn(ctx, x, STA_FILE_NOT_FOUND);
            return;
          }
          ch.isOpen = true;
          ch.mode = OPEN_READ;
          ch.fileName = normName;
          ch.fileData = data;
          ch.position = 0;
          ch.writeBuffer = null;
          ch.dirListing = null;

          _writeIocb(ctx.ram, x, IOCB_ICHID, HDEVICE_HANDLER_ID);
          _setPutByteVector(ctx.ram, x);
          _cioReturn(ctx, x, STA_SUCCESS);
          return;
        }

        if (
          openMode === OPEN_WRITE ||
          openMode === OPEN_APPEND ||
          openMode === OPEN_UPDATE
        ) {
          // Check if locked
          const stat = hostFs.getStatus(normName);
          if (openMode === OPEN_UPDATE) {
            if (!stat) {
              _cioReturn(ctx, x, STA_FILE_NOT_FOUND);
              return;
            }
            if (stat.locked) {
              _cioReturn(ctx, x, STA_FILE_LOCKED);
              return;
            }
          } else if (stat && stat.locked) {
            _cioReturn(ctx, x, STA_FILE_LOCKED);
            return;
          }

          ch.isOpen = true;
          ch.mode = openMode;
          ch.fileName = normName;
          ch.fileData = null;
          ch.position = 0;
          ch.dirListing = null;

          if ((openMode === OPEN_APPEND || openMode === OPEN_UPDATE) && stat) {
            // Append mode: load existing data
            const existingData = hostFs.readFile(normName);
            ch.writeBuffer = existingData
              ? Array.prototype.slice.call(existingData)
              : [];
            if (openMode === OPEN_APPEND) ch.position = ch.writeBuffer.length;
            if (openMode === OPEN_UPDATE) ch.fileData = ch.writeBuffer;
          } else {
            ch.writeBuffer = [];
          }

          _writeIocb(ctx.ram, x, IOCB_ICHID, HDEVICE_HANDLER_ID);
          _setPutByteVector(ctx.ram, x);
          _cioReturn(ctx, x, STA_SUCCESS);
          return;
        }

        _cioReturn(ctx, x, STA_INVALID_CMD);
      }

      function _cmdClose(ctx, x, ch) {
        if (!ch.isOpen) {
          // Closing an already-closed channel is OK on Atari
          _cioReturn(ctx, x, STA_SUCCESS);
          return;
        }
        // Flush write buffer
        if (ch.writeBuffer && ch.fileName) {
          hostFs.writeFile(ch.fileName, new Uint8Array(ch.writeBuffer));
        }
        ch.isOpen = false;
        ch.fileName = null;
        ch.fileData = null;
        ch.writeBuffer = null;
        ch.dirListing = null;
        ch.dirIndex = 0;
        ch.position = 0;
        ch.mode = 0;
        _writeIocb(ctx.ram, x, IOCB_ICHID, 0xff);
        _cioReturn(ctx, x, STA_SUCCESS);
      }

      function _cmdGetRecord(ctx, x, ch) {
        if (!ch.isOpen) {
          _cioReturn(ctx, x, STA_NOT_OPEN);
          return;
        }

        const bufAddr =
          _readIocb(ctx.ram, x, IOCB_ICBAL) |
          (_readIocb(ctx.ram, x, IOCB_ICBAH) << 8);
        const bufLen =
          _readIocb(ctx.ram, x, IOCB_ICBLL) |
          (_readIocb(ctx.ram, x, IOCB_ICBLH) << 8);

        if (ch.mode === OPEN_DIRECTORY) {
          // Directory listing: return one line at a time
          if (ch.dirIndex >= ch.dirListing.length) {
            _writeIocb(ctx.ram, x, IOCB_ICBLL, 0);
            _writeIocb(ctx.ram, x, IOCB_ICBLH, 0);
            _cioReturn(ctx, x, STA_EOF);
            return;
          }
          const line = ch.dirListing[ch.dirIndex++];
          const count = Math.min(line.length, bufLen || line.length);
          for (let li = 0; li < count; li++) {
            ctx.ram[(bufAddr + li) & 0xffff] = line[li] & 0xff;
          }
          _writeIocb(ctx.ram, x, IOCB_ICBLL, count & 0xff);
          _writeIocb(ctx.ram, x, IOCB_ICBLH, (count >> 8) & 0xff);
          _cioReturn(ctx, x, STA_SUCCESS, count);
          return;
        }

        // File GET RECORD: read until EOL or buffer full
        const readData = _readDataForChannel(ch);
        if (!readData || ch.position >= readData.length) {
          _writeIocb(ctx.ram, x, IOCB_ICBLL, 0);
          _writeIocb(ctx.ram, x, IOCB_ICBLH, 0);
          _cioReturn(ctx, x, STA_EOF);
          return;
        }

        let written = 0;
        const maxRead = bufLen || 256;
        while (written < maxRead && ch.position < readData.length) {
          const b = readData[ch.position++] & 0xff;
          ctx.ram[(bufAddr + written) & 0xffff] = b;
          written++;
          if (b === ATARI_EOL) break;
        }
        _writeIocb(ctx.ram, x, IOCB_ICBLL, written & 0xff);
        _writeIocb(ctx.ram, x, IOCB_ICBLH, (written >> 8) & 0xff);

        const status =
          ch.position >= readData.length && written === 0
            ? STA_EOF
            : STA_SUCCESS;
        _cioReturn(ctx, x, status, written);
      }

      function _cmdGetBytes(ctx, x, ch) {
        if (!ch.isOpen) {
          _cioReturn(ctx, x, STA_NOT_OPEN);
          return;
        }

        const bufAddr =
          _readIocb(ctx.ram, x, IOCB_ICBAL) |
          (_readIocb(ctx.ram, x, IOCB_ICBAH) << 8);
        const bufLen =
          _readIocb(ctx.ram, x, IOCB_ICBLL) |
          (_readIocb(ctx.ram, x, IOCB_ICBLH) << 8);
        const reqLen = bufLen || 256;

        const readData = _readDataForChannel(ch);
        if (!readData || ch.position >= readData.length) {
          _writeIocb(ctx.ram, x, IOCB_ICBLL, 0);
          _writeIocb(ctx.ram, x, IOCB_ICBLH, 0);
          _cioReturn(ctx, x, STA_EOF);
          return;
        }

        const remaining = readData.length - ch.position;
        const toRead = Math.min(reqLen, remaining);
        for (let ri = 0; ri < toRead; ri++) {
          ctx.ram[(bufAddr + ri) & 0xffff] = readData[ch.position++] & 0xff;
        }
        _writeIocb(ctx.ram, x, IOCB_ICBLL, toRead & 0xff);
        _writeIocb(ctx.ram, x, IOCB_ICBLH, (toRead >> 8) & 0xff);

        const eof = toRead < reqLen;
        _cioReturn(ctx, x, eof ? STA_EOF : STA_SUCCESS, toRead);
      }

      function _cmdPutRecord(ctx, x, ch) {
        if (!ch.isOpen || !ch.writeBuffer) {
          _cioReturn(ctx, x, STA_NOT_OPEN);
          return;
        }

        const bufAddr =
          _readIocb(ctx.ram, x, IOCB_ICBAL) |
          (_readIocb(ctx.ram, x, IOCB_ICBAH) << 8);
        const bufLen =
          _readIocb(ctx.ram, x, IOCB_ICBLL) |
          (_readIocb(ctx.ram, x, IOCB_ICBLH) << 8);

        let count = 0;
        let wroteEol = false;
        let transferred = 0;
        const maxWrite = bufLen || 256;
        while (count < maxWrite) {
          const b = ctx.ram[(bufAddr + count) & 0xffff] & 0xff;
          _writeByteToChannel(ch, b);
          transferred++;
          count++;
          if (b === ATARI_EOL) {
            wroteEol = true;
            break;
          }
        }
        // If no EOL was found in the data, append one
        if (count > 0 && !wroteEol) {
          _writeByteToChannel(ch, ATARI_EOL);
          transferred++;
        }

        _writeIocb(ctx.ram, x, IOCB_ICBLL, count & 0xff);
        _writeIocb(ctx.ram, x, IOCB_ICBLH, (count >> 8) & 0xff);
        _cioReturn(ctx, x, STA_SUCCESS, transferred);
      }

      function _cmdPutBytes(ctx, x, ch) {
        if (!ch.isOpen || !ch.writeBuffer) {
          _cioReturn(ctx, x, STA_NOT_OPEN);
          return;
        }

        const bufAddr =
          _readIocb(ctx.ram, x, IOCB_ICBAL) |
          (_readIocb(ctx.ram, x, IOCB_ICBAH) << 8);
        const bufLen =
          _readIocb(ctx.ram, x, IOCB_ICBLL) |
          (_readIocb(ctx.ram, x, IOCB_ICBLH) << 8);
        const reqLen = bufLen || 256;

        for (let wi = 0; wi < reqLen; wi++) {
          _writeByteToChannel(ch, ctx.ram[(bufAddr + wi) & 0xffff] & 0xff);
        }
        _cioReturn(ctx, x, STA_SUCCESS, reqLen);
      }

      function _cmdStatus(ctx, x, ch) {
        // STATUS: return success if open, not-open otherwise
        if (!ch.isOpen) {
          _cioReturn(ctx, x, STA_NOT_OPEN);
          return;
        }
        _cioReturn(ctx, x, STA_SUCCESS);
      }

      function _isPutByteChannel(ctx, x) {
        if ((x & 0x0f) !== 0 || x > 0x70) return false;
        if (_readIocb(ctx.ram, x, IOCB_ICHID) !== HDEVICE_HANDLER_ID) return false;
        return _getPutByteVector(ctx.ram, x) === HDEVICE_PUTBYTE_VECTOR_VALUE;
      }

      function _candidatePutByteBases(rawX) {
        const bases = [];
        function add(base) {
          const b = base & 0xff;
          if ((b & 0x0f) !== 0 || b > 0x70) return;
          if (bases.indexOf(b) >= 0) return;
          bases.push(b);
        }
        // Common CIO convention: X carries IOCB base ($00,$10,...,$70).
        add(rawX & 0xf0);
        // Some callers pass channel number in low bits (0..7).
        if ((rawX & 0xf8) === 0) add((rawX & 0x07) << 4);
        return bases;
      }

      function onPutByteCall(ctx) {
        const rawX = ctx.cpu.x & 0xff;
        const bases = _candidatePutByteBases(rawX);

        for (let bi = 0; bi < bases.length; bi++) {
          const x = bases[bi];
          if (!_isPutByteChannel(ctx, x)) continue;
          const ch = channels[(x >> 4) & 0x07];
          if (!ch || !ch.isOpen) {
            _cioReturn(ctx, x, STA_NOT_OPEN);
            return true;
          }
          if (!ch.writeBuffer) {
            _cioReturn(ctx, x, STA_INVALID_CMD);
            return true;
          }
          _writeByteToChannel(ch, ctx.cpu.a);
          _cioReturn(ctx, x, STA_SUCCESS, 1);
          return true;
        }

        // Fallback: when X is unreliable, accept only an unambiguous writable H: channel.
        let target = null;
        for (let i = 0; i < 8; i++) {
          const x = (i << 4) & 0xff;
          if (!_isPutByteChannel(ctx, x)) continue;
          const ch = channels[i];
          if (!ch || !ch.isOpen || !ch.writeBuffer) continue;
          if (target) return false;
          target = { x: x, ch: ch };
        }
        if (!target) return false;

        _writeByteToChannel(target.ch, ctx.cpu.a);
        _cioReturn(ctx, target.x, STA_SUCCESS, 1);
        return true;
      }

      function _xioRename(ctx, x) {
        const bufAddr =
          _readIocb(ctx.ram, x, IOCB_ICBAL) |
          (_readIocb(ctx.ram, x, IOCB_ICBAH) << 8);
        const rawStr = _readString(ctx.ram, bufAddr, 128);
        // Rename format: "H:OLDNAME,NEWNAME" or "H:OLDNAME.EXT,NEWNAME.EXT"
        const colon = rawStr.indexOf(":");
        const afterDevice = colon >= 0 ? rawStr.substring(colon + 1) : rawStr;
        const comma = afterDevice.indexOf(",");
        if (comma < 0) {
          _cioReturn(ctx, x, STA_INVALID_CMD);
          return;
        }
        const oldName = afterDevice.substring(0, comma).trim();
        const newName = afterDevice.substring(comma + 1).trim();
        const normOld = hostFsApi.normalizeName(oldName);
        const normNew = hostFsApi.normalizeName(newName);
        if (!normOld || !normNew) {
          _cioReturn(ctx, x, STA_INVALID_CMD);
          return;
        }

        const oldStat = hostFs.getStatus(normOld);
        if (!oldStat) {
          _cioReturn(ctx, x, STA_FILE_NOT_FOUND);
          return;
        }
        if (oldStat.locked) {
          _cioReturn(ctx, x, STA_FILE_LOCKED);
          return;
        }
        if (normOld !== normNew && hostFs.fileExists(normNew)) {
          _cioReturn(ctx, x, STA_FILE_EXISTS);
          return;
        }

        if (hostFs.renameFile(normOld, normNew)) {
          _cioReturn(ctx, x, STA_SUCCESS);
        } else {
          _cioReturn(ctx, x, STA_INVALID_CMD);
        }
      }

      function _xioDelete(ctx, x) {
        const bufAddr =
          _readIocb(ctx.ram, x, IOCB_ICBAL) |
          (_readIocb(ctx.ram, x, IOCB_ICBAH) << 8);
        const filename = _readString(ctx.ram, bufAddr, 128);
        const normName = hostFsApi.normalizeName(filename);
        if (!normName) {
          _cioReturn(ctx, x, STA_FILE_NOT_FOUND);
          return;
        }
        if (hostFs.deleteFile(normName)) {
          _cioReturn(ctx, x, STA_SUCCESS);
        } else {
          const stat = hostFs.getStatus(normName);
          _cioReturn(ctx, x, stat ? STA_FILE_LOCKED : STA_FILE_NOT_FOUND);
        }
      }

      function _xioLock(ctx, x) {
        const bufAddr =
          _readIocb(ctx.ram, x, IOCB_ICBAL) |
          (_readIocb(ctx.ram, x, IOCB_ICBAH) << 8);
        const filename = _readString(ctx.ram, bufAddr, 128);
        const normName = hostFsApi.normalizeName(filename);
        if (!normName || !hostFs.lockFile(normName)) {
          _cioReturn(ctx, x, STA_FILE_NOT_FOUND);
          return;
        }
        _cioReturn(ctx, x, STA_SUCCESS);
      }

      function _xioUnlock(ctx, x) {
        const bufAddr =
          _readIocb(ctx.ram, x, IOCB_ICBAL) |
          (_readIocb(ctx.ram, x, IOCB_ICBAH) << 8);
        const filename = _readString(ctx.ram, bufAddr, 128);
        const normName = hostFsApi.normalizeName(filename);
        if (!normName || !hostFs.unlockFile(normName)) {
          _cioReturn(ctx, x, STA_FILE_NOT_FOUND);
          return;
        }
        _cioReturn(ctx, x, STA_SUCCESS);
      }

      /**
       * Main CIO intercept hook.  Called from CIOV entry hooks.
       * Returns true if we handled the call (H: device), false otherwise.
       */
      function onCioCall(ctx) {
        if (!_isCalledViaJsr(ctx)) return false;

        const rawX = ctx.cpu.x & 0xff;
        const x = rawX & 0xf0;
        // Valid IOCB bases are $00,$10,...,$70.
        if (x > 0x70) return false;

        const channelNum = (x >> 4) & 0x07;

        const cmd = _readIocb(ctx.ram, x, IOCB_ICCOM);
        const ch = channels[channelNum];

        // For OPEN: check filename to see if it targets H:
        if (cmd === CIO_CMD_OPEN) {
          const bufAddr =
            _readIocb(ctx.ram, x, IOCB_ICBAL) |
            (_readIocb(ctx.ram, x, IOCB_ICBAH) << 8);
          const filename = _readString(ctx.ram, bufAddr, 128);
          if (!_isHdevice(filename)) return false;
          _cmdOpen(ctx, x, ch);
          return true;
        }

        // For XIO commands that take a filename: check device prefix
        if (
          cmd === CIO_XIO_RENAME ||
          cmd === CIO_XIO_DELETE ||
          cmd === CIO_XIO_LOCK ||
          cmd === CIO_XIO_UNLOCK
        ) {
          const xBufAddr =
            _readIocb(ctx.ram, x, IOCB_ICBAL) |
            (_readIocb(ctx.ram, x, IOCB_ICBAH) << 8);
          const xFilename = _readString(ctx.ram, xBufAddr, 128);
          if (!_isHdevice(xFilename)) return false;

          if (cmd === CIO_XIO_RENAME) _xioRename(ctx, x);
          else if (cmd === CIO_XIO_DELETE) _xioDelete(ctx, x);
          else if (cmd === CIO_XIO_LOCK) _xioLock(ctx, x);
          else if (cmd === CIO_XIO_UNLOCK) _xioUnlock(ctx, x);
          return true;
        }

        // For other commands: check if this channel belongs to H:
        if (!ch.isOpen) return false;
        const handlerId = _readIocb(ctx.ram, x, IOCB_ICHID);
        if (handlerId !== HDEVICE_HANDLER_ID) return false;

        switch (cmd) {
          case CIO_CMD_CLOSE:
            _cmdClose(ctx, x, ch);
            return true;
          case CIO_CMD_GET_RECORD:
            _cmdGetRecord(ctx, x, ch);
            return true;
          case CIO_CMD_GET_BYTES:
            _cmdGetBytes(ctx, x, ch);
            return true;
          case CIO_CMD_PUT_RECORD:
            _cmdPutRecord(ctx, x, ch);
            return true;
          case CIO_CMD_PUT_BYTES:
            _cmdPutBytes(ctx, x, ch);
            return true;
          case CIO_CMD_STATUS:
            _cmdStatus(ctx, x, ch);
            return true;
          default:
            _cioReturn(ctx, x, STA_INVALID_CMD);
            return true;
        }
      }

      /**
       * Reset all channels (e.g. on hard reset).
       */
      function resetChannels() {
        for (let i = 0; i < 8; i++) {
          const ch = channels[i];
          ch.isOpen = false;
          ch.fileName = null;
          ch.mode = 0;
          ch.position = 0;
          ch.fileData = null;
          ch.writeBuffer = null;
          ch.dirListing = null;
          ch.dirIndex = 0;
        }
      }

      return {
        onCioCall: onCioCall,
        onPutByteCall: onPutByteCall,
        putByteHookAddr: HDEVICE_PUTBYTE_HOOK_ADDR,
        putByteHookAltAddr: (HDEVICE_PUTBYTE_HOOK_ADDR + 1) & 0xffff,
        resetChannels: resetChannels,
        getHostFs: function () {
          return hostFs;
        },
      };
    }

    return {
      create: create,
    };
  }

  window.A8EHDevice = {
    createApi: createApi,
  };
})();
