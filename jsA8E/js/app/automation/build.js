(function () {
  "use strict";

  const AutomationUtil = window.A8EAutomationUtil;
  if (!AutomationUtil) {
    throw new Error("A8EAutomationUtil is unavailable");
  }

  const CODE_TABLE =
    window.A8ECpuTables && typeof window.A8ECpuTables.buildCodeTable === "function"
      ? window.A8ECpuTables.buildCodeTable()
      : null;
  const OPCODE_ID_TO_MNEMONIC = [
    "LDA", "LDX", "LDY", "STA", "STX", "STY", "TAX", "TAY", "TSX", "TXA",
    "TXS", "TYA", "ADC", "AND", "EOR", "ORA", "SBC", "DEC", "DEX", "DEY",
    "INC", "INX", "INY", "ASL", "LSR", "ROL", "ROR", "BIT", "CMP", "CPX",
    "CPY", "BCC", "BCS", "BEQ", "BMI", "BNE", "BPL", "BVC", "BVS", "BRK",
    "JMP", "JSR", "NOP", "RTI", "RTS", "CLC", "CLD", "CLI", "CLV", "SEC",
    "SED", "SEI", "PHA", "PHP", "PLA", "PLP", "XXX", "LAX", "SLO", "ATX",
    "AAX", "DOP", "TOP", "ASR", "ISC", "SRE", "RLA", "AAC", "XAA", "DCP",
    "RRA", "SBX",
  ];
  const ADDRESS_TYPE_TO_MODE = {
    0: "IMM",
    1: "ABS",
    2: "ZP",
    3: "ACC",
    4: "IMP",
    5: "INDX",
    6: "INDY",
    7: "ZPX",
    8: "ZPY",
    9: "ABSX",
    10: "ABSY",
    11: "REL",
    12: "IND",
  };
  const MODE_SIZE = {
    IMP: 1,
    ACC: 1,
    IMM: 2,
    ZP: 2,
    ZPX: 2,
    ZPY: 2,
    INDX: 2,
    INDY: 2,
    REL: 2,
    ABS: 3,
    ABSX: 3,
    ABSY: 3,
    IND: 3,
  };

  function createApi(deps) {
    const config = deps && typeof deps === "object" ? deps : {};
    const api = config.api && typeof config.api === "object" ? config.api : null;
    if (!api) {
      throw new Error("A8EAutomationBuild requires an api dependency");
    }

    const getCurrentHostFs =
      typeof config.getCurrentHostFs === "function"
        ? config.getCurrentHostFs
        : function () {
            return null;
          };
    const emitEvent =
      typeof config.emitEvent === "function" ? config.emitEvent : function () {};
    const runXex = typeof config.runXex === "function" ? config.runXex : null;
    const clamp16 =
      typeof config.clamp16 === "function" ? config.clamp16 : AutomationUtil.clamp16;
    const clamp8 =
      typeof config.clamp8 === "function" ? config.clamp8 : AutomationUtil.clamp8;
    const toUint8Array =
      typeof config.toUint8Array === "function"
        ? config.toUint8Array
        : AutomationUtil.toUint8Array;
    const decodeText =
      typeof config.decodeText === "function"
        ? config.decodeText
        : AutomationUtil.decodeText;
    const createAutomationError =
      typeof config.createAutomationError === "function"
        ? config.createAutomationError
        : AutomationUtil.createAutomationError;
    const normalizeBuildResult =
      typeof config.normalizeBuildResult === "function"
        ? config.normalizeBuildResult
        : AutomationUtil.normalizeBuildResult;
    const normalizeBuildSpec =
      typeof config.normalizeBuildSpec === "function"
        ? config.normalizeBuildSpec
        : AutomationUtil.normalizeBuildSpec;
    const buildAssembleOptions =
      typeof config.buildAssembleOptions === "function"
        ? config.buildAssembleOptions
        : null;
    const codeTable =
      config.codeTable && typeof config.codeTable === "object"
        ? config.codeTable
        : CODE_TABLE;

    if (!buildAssembleOptions) {
      throw new Error("A8EAutomationBuild requires buildAssembleOptions dependency");
    }

    const getDebugState =
      typeof api.getDebugState === "function"
        ? function () {
            return api.getDebugState();
          }
        : function () {
            return Promise.resolve(null);
          };
    const readRange =
      typeof api.readRange === "function"
        ? function (start, length) {
            return api.readRange(start, length);
          }
        : null;
    const readMemory =
      typeof api.readMemory === "function"
        ? function (address) {
            return api.readMemory(address);
          }
        : null;

    let lastBuildRecord = null;

    function getOpcodeMeta(opcode) {
      if (!codeTable) return null;
      return codeTable[opcode & 0xff] || null;
    }

    function formatOperand(mode, address, bytes) {
      const lo = bytes.length > 1 ? bytes[1] & 0xff : 0;
      const hi = bytes.length > 2 ? bytes[2] & 0xff : 0;
      const word = lo | (hi << 8);
      switch (mode) {
        case "IMM":
          return { text: "#$" + lo.toString(16).toUpperCase().padStart(2, "0") };
        case "ZP":
          return { text: "$" + lo.toString(16).toUpperCase().padStart(2, "0") };
        case "ZPX":
          return { text: "$" + lo.toString(16).toUpperCase().padStart(2, "0") + ",X" };
        case "ZPY":
          return { text: "$" + lo.toString(16).toUpperCase().padStart(2, "0") + ",Y" };
        case "INDX":
          return { text: "($" + lo.toString(16).toUpperCase().padStart(2, "0") + ",X)" };
        case "INDY":
          return { text: "($" + lo.toString(16).toUpperCase().padStart(2, "0") + "),Y" };
        case "ABS":
          return { text: "$" + word.toString(16).toUpperCase().padStart(4, "0") };
        case "ABSX":
          return { text: "$" + word.toString(16).toUpperCase().padStart(4, "0") + ",X" };
        case "ABSY":
          return { text: "$" + word.toString(16).toUpperCase().padStart(4, "0") + ",Y" };
        case "IND":
          return { text: "($" + word.toString(16).toUpperCase().padStart(4, "0") + ")" };
        case "REL": {
          const offset = lo >= 0x80 ? lo - 0x100 : lo;
          const target = (address + 2 + offset) & 0xffff;
          return {
            text: "$" + target.toString(16).toUpperCase().padStart(4, "0"),
            target: target,
          };
        }
        case "ACC":
          return { text: "A" };
        default:
          return { text: "" };
      }
    }

    function decodeInstructionAt(address, readByte) {
      const addr = clamp16(address);
      const opcode = readByte(addr) & 0xff;
      const meta = getOpcodeMeta(opcode);
      const mnemonic = meta ? OPCODE_ID_TO_MNEMONIC[meta.opcodeId | 0] || "???" : "???";
      const mode = meta ? ADDRESS_TYPE_TO_MODE[meta.addressType | 0] || "IMP" : "IMP";
      const size = MODE_SIZE[mode] || 1;
      const bytes = [];
      for (let i = 0; i < size; i++) bytes.push(readByte((addr + i) & 0xffff) & 0xff);
      const operand = formatOperand(mode, addr, bytes);
      const unsupported = mnemonic === "XXX";
      return {
        address: addr,
        opcode: opcode,
        mnemonic: unsupported ? ".BYTE" : mnemonic,
        mode: mode,
        size: size,
        cycles: meta ? meta.cycles & 0xff : 0,
        bytes: bytes,
        operand: operand.text,
        target: operand.target,
        unsupported: unsupported,
        text: unsupported
          ? ".BYTE $" + opcode.toString(16).toUpperCase().padStart(2, "0")
          : mnemonic + (operand.text ? " " + operand.text : ""),
      };
    }

    function findSequenceEndingAt(pc, beforeInstructions, readByte) {
      const limit = Math.max(0, beforeInstructions | 0);
      if (!limit) return [];
      let best = [];
      const searchStart = Math.max(0, (pc | 0) - limit * 3 - 12);
      for (let start = searchStart; start <= (pc | 0); start++) {
        const sequence = [];
        let cursor = start;
        while (cursor < (pc | 0) && sequence.length < limit + 8) {
          const instruction = decodeInstructionAt(cursor, readByte);
          sequence.push(instruction);
          cursor += instruction.size;
          if (cursor === (pc | 0)) {
            if (sequence.length > best.length) best = sequence.slice(0);
            break;
          }
          if (cursor > (pc | 0)) break;
        }
      }
      if (!best.length) return [];
      return best.slice(-limit);
    }

    function serializeInstruction(entry, currentPc, lineLookup) {
      const out = {
        address: clamp16(entry.address),
        opcode: clamp8(entry.opcode),
        mnemonic: String(entry.mnemonic || ""),
        mode: String(entry.mode || ""),
        size: entry.size | 0,
        cycles: entry.cycles | 0,
        bytes: entry.bytes.slice(0),
        operand: String(entry.operand || ""),
        text: String(entry.text || ""),
        current: clamp16(entry.address) === clamp16(currentPc),
        unsupported: !!entry.unsupported,
      };
      if (typeof entry.target === "number") out.target = clamp16(entry.target);
      if (lineLookup) {
        const lineNo = lineLookup(clamp16(entry.address));
        if (lineNo > 0) out.sourceLine = lineNo;
      }
      return out;
    }

    function getLineLookup(record) {
      if (
        !record ||
        !record.ok ||
        !record.result ||
        !record.result.addressLineMap
      ) {
        return null;
      }
      const addressLineMap = record.result.addressLineMap;
      return function (pc) {
        const key = String(clamp16(pc));
        if (Object.prototype.hasOwnProperty.call(addressLineMap, key)) {
          return addressLineMap[key] | 0;
        }
        for (let delta = 1; delta <= 2; delta++) {
          const prevKey = String(clamp16(pc - delta));
          if (Object.prototype.hasOwnProperty.call(addressLineMap, prevKey)) {
            return addressLineMap[prevKey] | 0;
          }
        }
        return 0;
      };
    }

    async function readRangeBytes(start, length) {
      const addr = clamp16(start);
      const size = length | 0;
      if (size <= 0) return new Uint8Array(0);
      if (readRange) {
        if (addr + size <= 0x10000) {
          return toUint8Array(await Promise.resolve(readRange(addr, size)));
        }
        const head = 0x10000 - addr;
        const tail = size - head;
        const headBytes = toUint8Array(await Promise.resolve(readRange(addr, head)));
        const tailBytes = toUint8Array(await Promise.resolve(readRange(0, tail)));
        const out = new Uint8Array(size);
        out.set(headBytes, 0);
        out.set(tailBytes, head);
        return out;
      }
      if (!readMemory) {
        return new Uint8Array(0);
      }
      const out = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        out[i] = clamp8(await Promise.resolve(readMemory((addr + i) & 0xffff)));
      }
      return out;
    }

    function sym(name, fallback) {
      if (!lastBuildRecord || !lastBuildRecord.ok || !lastBuildRecord.result) {
        return fallback !== undefined ? fallback : null;
      }
      const symbols = lastBuildRecord.result.symbols;
      if (!symbols) return fallback !== undefined ? fallback : null;
      const key = String(name || "");
      if (!Object.prototype.hasOwnProperty.call(symbols, key)) {
        return fallback !== undefined ? fallback : null;
      }
      const value = symbols[key];
      return typeof value === "number" ? clamp16(value) : value;
    }

    function getLastBuildResult(options) {
      if (!lastBuildRecord) return null;
      return normalizeBuildResult(lastBuildRecord, options || {});
    }

    async function assembleSource(spec) {
      const buildSpec = normalizeBuildSpec(spec);
      if (
        !window.A8EAssemblerCore ||
        typeof window.A8EAssemblerCore.assembleToXex !== "function"
      ) {
        throw new Error("A8EAssemblerCore is unavailable");
      }
      const hostFs = getCurrentHostFs();
      const options = buildAssembleOptions(buildSpec, hostFs);
      const result =
        buildSpec.format === "object" &&
        typeof window.A8EAssemblerCore.assembleToObject === "function"
          ? window.A8EAssemblerCore.assembleToObject(buildSpec.text, options)
          : window.A8EAssemblerCore.assembleToXex(buildSpec.text, options);
      lastBuildRecord = {
        ok: !!(result && result.ok),
        format: buildSpec.format,
        sourceName: options.sourceName,
        sourceText: buildSpec.text,
        sourceLines: buildSpec.text.replace(/\r\n?/g, "\n").split("\n"),
        result: result || null,
        timestamp: Date.now(),
        error: result && result.error ? String(result.error) : "",
      };
      emitEvent("build", {
        build: normalizeBuildResult(lastBuildRecord, {
          byteEncoding: buildSpec.byteEncoding,
        }),
      });
      return normalizeBuildResult(lastBuildRecord, {
        byteEncoding: buildSpec.byteEncoding,
      });
    }

    async function assembleHostFile(name, options) {
      const hostFs = getCurrentHostFs();
      if (!hostFs || typeof hostFs.readFile !== "function") {
        throw new Error("A8EAutomation HostFS is unavailable");
      }
      const normalized =
        typeof hostFs.normalizeName === "function"
          ? hostFs.normalizeName(name)
          : String(name || "").toUpperCase();
      const bytes = hostFs.readFile(normalized);
      if (!bytes) throw new Error("HostFS source file not found: " + normalized);
      const spec = Object.assign({}, options || {}, {
        name: normalized,
        text: decodeText(toUint8Array(bytes)),
      });
      return assembleSource(spec);
    }

    async function getSourceContext(options) {
      const record = lastBuildRecord;
      if (
        !record ||
        !record.ok ||
        !record.result ||
        !record.result.addressLineMap ||
        !record.sourceLines
      ) {
        return null;
      }
      const opts = options || {};
      let pc = opts.pc;
      if (pc === undefined || pc === null) {
        const state = await getDebugState();
        if (!state) return null;
        pc = state.pc;
      }
      const lineLookup = getLineLookup(record);
      const lineNo = lineLookup ? lineLookup(clamp16(pc)) : 0;
      if (!lineNo) return null;
      const beforeLines = Math.max(0, opts.beforeLines | 0 || 5);
      const afterLines = Math.max(0, opts.afterLines | 0 || 5);
      const startLine = Math.max(1, lineNo - beforeLines);
      const endLine = Math.min(record.sourceLines.length, lineNo + afterLines);
      const outLines = [];
      for (let line = startLine; line <= endLine; line++) {
        const key = String(line);
        outLines.push({
          lineNo: line,
          text: record.sourceLines[line - 1],
          current: line === lineNo,
          address:
            record.result.lineAddressMap &&
            Object.prototype.hasOwnProperty.call(record.result.lineAddressMap, key)
              ? clamp16(record.result.lineAddressMap[key])
              : undefined,
          bytes:
            record.result.lineBytesMap &&
            Object.prototype.hasOwnProperty.call(record.result.lineBytesMap, key)
              ? record.result.lineBytesMap[key].slice(0)
              : undefined,
        });
      }
      return {
        sourceName: record.sourceName,
        pc: clamp16(pc),
        lineNo: lineNo,
        startLine: startLine,
        endLine: endLine,
        lines: outLines,
      };
    }

    async function disassemble(options) {
      if (!codeTable) {
        throw new Error("A8EAutomation disassembly requires CPU opcode tables");
      }
      const opts = options || {};
      let pc = opts.pc;
      if (pc === undefined || pc === null) {
        const state = await getDebugState();
        if (!state) return null;
        pc = state.pc;
      }
      pc = clamp16(pc);
      const beforeInstructions = Math.max(0, opts.beforeInstructions | 0 || 8);
      const afterInstructions = Math.max(0, opts.afterInstructions | 0 || 8);
      const start = Math.max(0, pc - beforeInstructions * 3 - 16);
      const end = Math.min(0xffff, pc + (afterInstructions + 1) * 3 + 16);
      const bytes = await readRangeBytes(start, end - start + 1);

      function readByte(addr) {
        const index = (addr | 0) - start;
        if (index < 0 || index >= bytes.length) return 0;
        return bytes[index] & 0xff;
      }

      const before = findSequenceEndingAt(pc, beforeInstructions, readByte);
      const current = decodeInstructionAt(pc, readByte);
      const after = [];
      let cursor = (pc + current.size) & 0xffff;
      for (let i = 0; i < afterInstructions && cursor <= end; i++) {
        const next = decodeInstructionAt(cursor, readByte);
        after.push(next);
        cursor += next.size;
      }
      const lineLookup = getLineLookup(lastBuildRecord);
      return {
        pc: pc,
        instructions: before
          .concat([current], after)
          .map(function (entry) {
            return serializeInstruction(entry, pc, lineLookup);
          }),
      };
    }

    async function buildAndRun(source, options) {
      const build = await assembleSource(source);
      if (!build || !build.ok) {
        throw createAutomationError({
          operation: "buildAndRun",
          phase: "assemble",
          code: "assemble_failed",
          message:
            "Assembly failed" + (build && build.error ? ": " + String(build.error) : ""),
          details: {
            errors: build && Array.isArray(build.errors) ? build.errors : [],
          },
        });
      }
      if (!runXex) {
        throw new Error("A8EAutomationBuild requires a runXex dependency");
      }
      return runXex(Object.assign({}, options || {}, { build: build }));
    }

    return {
      assembleSource: assembleSource,
      assembleHostFile: assembleHostFile,
      buildAndRun: buildAndRun,
      getSourceContext: getSourceContext,
      disassemble: disassemble,
      sym: sym,
      getLastBuildResult: getLastBuildResult,
    };
  }

  window.A8EAutomationBuild = {
    createApi: createApi,
  };
})();
