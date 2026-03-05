(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const ns = root.A8EAssemblerModules || (root.A8EAssemblerModules = {});

  ns.MODE_SIZE = {
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

  ns.BRANCH_MNEMONICS = new Set([
    "BCC",
    "BCS",
    "BEQ",
    "BMI",
    "BNE",
    "BPL",
    "BVC",
    "BVS",
  ]);

  ns.DIRECTIVE_KEYWORDS = [
    "SEGMENT",
    "IMPORT",
    "GLOBAL",
    "ORG",
    "RUN",
    "DS",
    "RES",
    "BYTE",
    "DB",
    "WORD",
    "DW",
    "ADDR",
    "LOBYTES",
    "HIBYTES",
    "TEXT",
    "EQU",
    "SET",
    "INCLUDE",
    "DEFINE",
    "UNDEF",
    "MACRO",
    "ENDMACRO",
    "ENDM",
    "LOCAL",
    "IF",
    "IFDEF",
    "IFNDEF",
    "ELSEIF",
    "ELSE",
    "ENDIF",
    "ASSERT",
    "ERROR",
  ];

  ns.buildOpcodeMap = function buildOpcodeMap() {
    const CpuTables = root.A8ECpuTables;
    if (!CpuTables || typeof CpuTables.buildCodeTable !== "function") return null;

    const opcodeIdToMnemonic = [
      "LDA", "LDX", "LDY", "STA", "STX", "STY", "TAX", "TAY", "TSX", "TXA",
      "TXS", "TYA", "ADC", "AND", "EOR", "ORA", "SBC", "DEC", "DEX", "DEY",
      "INC", "INX", "INY", "ASL", "LSR", "ROL", "ROR", "BIT", "CMP", "CPX",
      "CPY", "BCC", "BCS", "BEQ", "BMI", "BNE", "BPL", "BVC", "BVS", "BRK",
      "JMP", "JSR", "NOP", "RTI", "RTS", "CLC", "CLD", "CLI", "CLV", "SEC",
      "SED", "SEI", "PHA", "PHP", "PLA", "PLP", "XXX", "LAX", "SLO", "ATX",
      "AAX", "DOP", "TOP", "ASR", "ISC", "SRE", "RLA", "AAC", "XAA", "DCP",
      "RRA", "SBX",
    ];

    const addressTypeToMode = {
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

    const map = Object.create(null);
    const table = CpuTables.buildCodeTable();
    for (let opcode = 0; opcode < 256; opcode++) {
      const meta = table[opcode];
      const mnemonic = opcodeIdToMnemonic[meta.opcodeId | 0];
      const mode = addressTypeToMode[meta.addressType | 0];
      if (!mnemonic || !mode || mnemonic === "XXX") continue;
      if (!map[mnemonic]) map[mnemonic] = Object.create(null);
      if (map[mnemonic][mode] === undefined) {
        map[mnemonic][mode] = opcode & 0xff;
      }
    }
    return map;
  };

  ns.requireRange = function requireRange(name, value, min, max, lineNo) {
    if (value < min || value > max) {
      throw new Error(
        "Line " + lineNo + ": " + name + " out of range (" + value + ", expected " + min + ".." + max + ").",
      );
    }
    return value;
  };

  ns.parseLineNumber = function parseLineNumber(message) {
    const m = /^Line\s+(\d+)\s*:/i.exec(String(message || ""));
    if (!m) return null;
    return parseInt(m[1], 10);
  };

  ns.toAssembleError = function toAssembleError(err, fallbackLineNo) {
    const message = err && err.message ? err.message : String(err);
    const parsedLine = ns.parseLineNumber(message);
    const lineNo = parsedLine === null ? (fallbackLineNo || null) : parsedLine;
    return {
      lineNo: lineNo,
      message: message,
    };
  };

  ns.dedupeErrors = function dedupeErrors(errors) {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < errors.length; i++) {
      const item = errors[i];
      const key = String(item.lineNo || "-") + "|" + item.message;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };

  ns.summarizeErrors = function summarizeErrors(errors) {
    if (!errors.length) return "Assemble failed.";
    if (errors.length === 1) return errors[0].message;
    return errors[0].message + " (+" + (errors.length - 1) + " more)";
  };

  ns.sameModeList = function sameModeList(a, b) {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  };

  ns.sameSymbols = function sameSymbols(a, b) {
    if (!a || !b) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
      const key = keysA[i];
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if ((a[key] | 0) !== (b[key] | 0)) return false;
    }
    return true;
  };
})();
