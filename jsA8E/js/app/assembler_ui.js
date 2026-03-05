(function () {
  "use strict";

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

  const BRANCH_MNEMONICS = new Set([
    "BCC",
    "BCS",
    "BEQ",
    "BMI",
    "BNE",
    "BPL",
    "BVC",
    "BVS",
  ]);

  const SOURCE_EXTS = new Set(["ASM", "S", "SRC", "TXT", "INC", "MAC"]);
  const PANEL_MIN_HEIGHT = 340;
  const PANEL_MAX_HEIGHT_RATIO = 0.9;
  const PANEL_DEFAULT_EXTRA_HEIGHT = 120;
  const DEFAULT_SOURCE_TEMPLATE = [
    "; Atari 8-bit 6502 source",
    ".ORG $2000",
    "START:",
    "  LDA #$00",
    "  RTS",
    ".RUN START",
    "",
  ].join("\n");

  function buildOpcodeMap() {
    const CpuTables = window.A8ECpuTables;
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
      // Preserve the first seen encoding for each mnemonic/mode pair.
      if (map[mnemonic][mode] === undefined) {
        map[mnemonic][mode] = opcode & 0xff;
      }
    }
    return map;
  }

  const OPCODES = buildOpcodeMap();
  const MNEMONIC_KEYWORDS = new Set(OPCODES ? Object.keys(OPCODES) : []);
  const DIRECTIVE_KEYWORDS = new Set([
    "ORG",
    "RUN",
    "BYTE",
    "DB",
    "WORD",
    "DW",
    "TEXT",
    "EQU",
    "SET",
  ]);
  const REGISTER_TOKENS = new Set(["A", "X", "Y"]);

  function isSourceFileName(name) {
    if (!name) return false;
    const dot = name.lastIndexOf(".");
    if (dot < 0) return false;
    const ext = name.substring(dot + 1).toUpperCase();
    return SOURCE_EXTS.has(ext);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function splitCommentParts(line) {
    let inQuote = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === "\\") {
          i++;
          continue;
        }
        if (ch === inQuote) inQuote = "";
        continue;
      }
      if (ch === "'" || ch === "\"") {
        inQuote = ch;
        continue;
      }
      if (ch === ";") {
        return {
          code: line.substring(0, i),
          comment: line.substring(i),
        };
      }
    }
    return {
      code: line,
      comment: "",
    };
  }

  function wrapHighlightToken(cssClass, text) {
    return "<span class=\"" + cssClass + "\">" + escapeHtml(text) + "</span>";
  }

  function isIdentStart(ch) {
    return /[A-Za-z_.@]/.test(ch);
  }

  function isIdentChar(ch) {
    return /[A-Za-z0-9_.@]/.test(ch);
  }

  function classifyHighlightWord(word) {
    if (!word.length) return "";
    if (word[0] === ".") return "asm-tok-directive";

    const upper = word.toUpperCase();
    if (MNEMONIC_KEYWORDS.has(upper)) return "asm-tok-mnemonic";
    if (DIRECTIVE_KEYWORDS.has(upper)) return "asm-tok-directive";
    if (REGISTER_TOKENS.has(upper)) return "asm-tok-register";
    return "";
  }

  function highlightCodeFragment(code) {
    let out = "";
    let i = 0;
    while (i < code.length) {
      const ch = code[i];

      if (ch === " " || ch === "\t") {
        const start = i;
        while (i < code.length && (code[i] === " " || code[i] === "\t")) i++;
        out += escapeHtml(code.substring(start, i));
        continue;
      }

      if (ch === "'" || ch === "\"") {
        const quote = ch;
        const start = i;
        i++;
        while (i < code.length) {
          const c = code[i];
          i++;
          if (c === "\\") {
            if (i < code.length) i++;
            continue;
          }
          if (c === quote) break;
        }
        out += wrapHighlightToken("asm-tok-string", code.substring(start, i));
        continue;
      }

      if (ch === "$") {
        const start = i;
        i++;
        while (i < code.length && /[0-9a-fA-F]/.test(code[i])) i++;
        out += wrapHighlightToken("asm-tok-number", code.substring(start, i));
        continue;
      }

      if (ch === "%") {
        const start = i;
        i++;
        while (i < code.length && /[01]/.test(code[i])) i++;
        out += wrapHighlightToken("asm-tok-number", code.substring(start, i));
        continue;
      }

      if (ch >= "0" && ch <= "9") {
        const start = i;
        if (
          ch === "0" &&
          i + 1 < code.length &&
          (code[i + 1] === "x" || code[i + 1] === "X")
        ) {
          i += 2;
          while (i < code.length && /[0-9a-fA-F]/.test(code[i])) i++;
        } else {
          i++;
          while (i < code.length && /[0-9]/.test(code[i])) i++;
        }
        out += wrapHighlightToken("asm-tok-number", code.substring(start, i));
        continue;
      }

      if (isIdentStart(ch)) {
        const start = i;
        i++;
        while (i < code.length && isIdentChar(code[i])) i++;
        const word = code.substring(start, i);
        if (i < code.length && code[i] === ":") {
          out += wrapHighlightToken("asm-tok-label", word);
          out += ":";
          i++;
          continue;
        }
        const tokenClass = classifyHighlightWord(word);
        if (tokenClass) out += wrapHighlightToken(tokenClass, word);
        else out += escapeHtml(word);
        continue;
      }

      out += escapeHtml(ch);
      i++;
    }
    return out;
  }

  function highlightAssemblerSource(sourceText) {
    const lines = String(sourceText || "").replace(/\r\n?/g, "\n").split("\n");
    let out = "";
    for (let i = 0; i < lines.length; i++) {
      const parts = splitCommentParts(lines[i]);
      out += highlightCodeFragment(parts.code);
      if (parts.comment.length) {
        out += wrapHighlightToken("asm-tok-comment", parts.comment);
      }
      if (i + 1 < lines.length) out += "\n";
    }
    if (!out.length) return " ";
    return out;
  }

  function stripComment(line) {
    let inQuote = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === "\\") {
          i++;
          continue;
        }
        if (ch === inQuote) inQuote = "";
        continue;
      }
      if (ch === "'" || ch === "\"") {
        inQuote = ch;
        continue;
      }
      if (ch === ";") return line.substring(0, i);
    }
    return line;
  }

  function splitArgs(text) {
    const out = [];
    let token = "";
    let quote = "";
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quote) {
        token += ch;
        if (ch === "\\") {
          i++;
          if (i < text.length) token += text[i];
          continue;
        }
        if (ch === quote) quote = "";
        continue;
      }
      if (ch === "'" || ch === "\"") {
        quote = ch;
        token += ch;
        continue;
      }
      if (ch === "(") {
        depth++;
        token += ch;
        continue;
      }
      if (ch === ")" && depth > 0) {
        depth--;
        token += ch;
        continue;
      }
      if (ch === "," && depth === 0) {
        out.push(token.trim());
        token = "";
        continue;
      }
      token += ch;
    }
    if (token.trim().length || text.endsWith(",")) out.push(token.trim());
    return out;
  }

  function decodeEscapedString(raw, lineNo) {
    if (!raw || raw.length < 2) {
      throw new Error("Line " + lineNo + ": invalid string literal.");
    }
    const quote = raw[0];
    if ((quote !== "'" && quote !== "\"") || raw[raw.length - 1] !== quote) {
      throw new Error("Line " + lineNo + ": invalid string literal.");
    }
    let out = "";
    for (let i = 1; i < raw.length - 1; i++) {
      let ch = raw[i];
      if (ch !== "\\") {
        out += ch;
        continue;
      }
      i++;
      if (i >= raw.length - 1) {
        throw new Error("Line " + lineNo + ": malformed escape sequence.");
      }
      ch = raw[i];
      if (ch === "n") out += "\n";
      else if (ch === "r") out += "\r";
      else if (ch === "t") out += "\t";
      else if (ch === "\\" || ch === "'" || ch === "\"") out += ch;
      else if (ch === "x") {
        if (i + 2 >= raw.length - 1) {
          throw new Error("Line " + lineNo + ": malformed hex escape.");
        }
        const hh = raw.substring(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hh)) {
          throw new Error("Line " + lineNo + ": malformed hex escape.");
        }
        out += String.fromCharCode(parseInt(hh, 16) & 0xff);
        i += 2;
      } else {
        out += ch;
      }
    }
    return out;
  }

  function stringToBytes(text) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
      out.push(text.charCodeAt(i) & 0xff);
    }
    return out;
  }

  function normalizeSymbolName(raw) {
    return String(raw || "").trim().toUpperCase();
  }

  function defineSymbol(symbols, rawName, value, lineNo) {
    const name = normalizeSymbolName(rawName);
    if (!/^[A-Z_.@][A-Z0-9_.@]*$/.test(name)) {
      throw new Error("Line " + lineNo + ": invalid symbol name '" + rawName + "'.");
    }
    if (Object.prototype.hasOwnProperty.call(symbols, name)) {
      throw new Error("Line " + lineNo + ": duplicate symbol '" + rawName + "'.");
    }
    symbols[name] = value & 0xffff;
    return name;
  }

  function evalExpression(expr, symbols, currentPc, allowUnresolved, lineNo, fallbackSymbols) {
    const source = String(expr || "").trim();
    if (!source.length) {
      throw new Error("Line " + lineNo + ": missing expression.");
    }

    let i = 0;
    let total = 0;
    let resolved = true;
    let nextSign = 1;
    let expectingTerm = true;

    while (i < source.length) {
      while (i < source.length && /\s/.test(source[i])) i++;
      if (i >= source.length) break;

      const ch = source[i];
      if ((ch === "+" || ch === "-") && expectingTerm) {
        if (ch === "-") nextSign = -nextSign;
        i++;
        continue;
      }
      if ((ch === "+" || ch === "-") && !expectingTerm) {
        nextSign = ch === "-" ? -1 : 1;
        expectingTerm = true;
        i++;
        continue;
      }

      const start = i;
      let quote = "";
      let depth = 0;
      while (i < source.length) {
        const c = source[i];
        if (quote) {
          if (c === "\\") {
            i += 2;
            continue;
          }
          if (c === quote) quote = "";
          i++;
          continue;
        }
        if (c === "'" || c === "\"") {
          quote = c;
          i++;
          continue;
        }
        if (c === "(") {
          depth++;
          i++;
          continue;
        }
        if (c === ")" && depth > 0) {
          depth--;
          i++;
          continue;
        }
        if (depth === 0 && (c === "+" || c === "-")) break;
        i++;
      }

      const termText = source.substring(start, i).trim();
      if (!termText.length) {
        throw new Error("Line " + lineNo + ": invalid expression.");
      }

      const term = evalTerm(
        termText,
        symbols,
        currentPc,
        allowUnresolved,
        lineNo,
        fallbackSymbols,
      );
      if (!term.resolved) resolved = false;
      total += nextSign * term.value;
      nextSign = 1;
      expectingTerm = false;
    }

    if (expectingTerm) {
      throw new Error("Line " + lineNo + ": invalid expression.");
    }

    return { value: total, resolved: resolved };
  }

  function evalTerm(termText, symbols, currentPc, allowUnresolved, lineNo, fallbackSymbols) {
    const text = termText.trim();
    if (!text.length) {
      throw new Error("Line " + lineNo + ": invalid expression term.");
    }

    if (text[0] === "<" || text[0] === ">") {
      const op = text[0];
      const inner = evalExpression(
        text.substring(1),
        symbols,
        currentPc,
        allowUnresolved,
        lineNo,
        fallbackSymbols,
      );
      if (!inner.resolved) return { value: 0, resolved: false };
      const val = inner.value & 0xffff;
      return { value: op === "<" ? (val & 0xff) : ((val >> 8) & 0xff), resolved: true };
    }

    if (text[0] === "(" && text[text.length - 1] === ")") {
      let depth = 0;
      let wraps = true;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === "(") depth++;
        if (text[i] === ")") depth--;
        if (depth === 0 && i < text.length - 1) {
          wraps = false;
          break;
        }
      }
      if (wraps) {
        return evalExpression(
          text.substring(1, text.length - 1),
          symbols,
          currentPc,
          allowUnresolved,
          lineNo,
          fallbackSymbols,
        );
      }
    }

    if (text === "*") return { value: currentPc & 0xffff, resolved: true };
    if (/^\$[0-9a-fA-F]+$/.test(text))
      {return { value: parseInt(text.substring(1), 16), resolved: true };}
    if (/^0x[0-9a-fA-F]+$/i.test(text))
      {return { value: parseInt(text.substring(2), 16), resolved: true };}
    if (/^%[01]+$/.test(text))
      {return { value: parseInt(text.substring(1), 2), resolved: true };}
    if (/^[0-9]+$/.test(text))
      {return { value: parseInt(text, 10), resolved: true };}
    if (/^'(?:[^'\\]|\\.)'$/.test(text)) {
      const s = decodeEscapedString(text, lineNo);
      return { value: s.charCodeAt(0) & 0xff, resolved: true };
    }

    if (/^[A-Za-z_.@][A-Za-z0-9_.@]*$/.test(text)) {
      const key = normalizeSymbolName(text);
      if (Object.prototype.hasOwnProperty.call(symbols, key)) {
        return { value: symbols[key] | 0, resolved: true };
      }
      if (
        fallbackSymbols &&
        Object.prototype.hasOwnProperty.call(fallbackSymbols, key)
      ) {
        return { value: fallbackSymbols[key] | 0, resolved: true };
      }
      if (allowUnresolved) return { value: 0, resolved: false };
      throw new Error("Line " + lineNo + ": unknown symbol '" + text + "'.");
    }

    throw new Error("Line " + lineNo + ": invalid term '" + text + "'.");
  }

  function chooseDirectMode(mnemonic, candidateZp, candidateAbs, valueInfo, preferredMode) {
    const modes = OPCODES[mnemonic];
    if (!modes) return null;

    const hasZp = modes[candidateZp] !== undefined;
    const hasAbs = modes[candidateAbs] !== undefined;

    if (hasZp && hasAbs) {
      if (valueInfo && valueInfo.resolved && valueInfo.value >= 0 && valueInfo.value <= 0xff) {
        return candidateZp;
      }
      if (preferredMode === candidateZp || preferredMode === candidateAbs) {
        return preferredMode;
      }
      return candidateAbs;
    }
    if (hasAbs) return candidateAbs;
    if (hasZp) return candidateZp;
    return null;
  }

  function parseInstructionStatement(mnemonic, operandText, lineNo) {
    const modes = OPCODES[mnemonic];
    if (!modes) {
      throw new Error("Line " + lineNo + ": unknown mnemonic '" + mnemonic + "'.");
    }

    const operand = String(operandText || "").trim();
    if (!operand.length) {
      if (modes.IMP !== undefined) return { mode: "IMP", expr: null };
      if (modes.ACC !== undefined) return { mode: "ACC", expr: null };
      throw new Error("Line " + lineNo + ": missing operand for " + mnemonic + ".");
    }

    if (operand.toUpperCase() === "A" && modes.ACC !== undefined) {
      return { mode: "ACC", expr: null };
    }

    if (BRANCH_MNEMONICS.has(mnemonic)) {
      if (modes.REL === undefined) {
        throw new Error("Line " + lineNo + ": " + mnemonic + " does not support relative addressing.");
      }
      return { mode: "REL", expr: operand };
    }

    if (operand[0] === "#") {
      if (modes.IMM === undefined) {
        throw new Error("Line " + lineNo + ": " + mnemonic + " does not support immediate mode.");
      }
      const immExpr = operand.substring(1).trim();
      if (!immExpr.length) {
        throw new Error("Line " + lineNo + ": missing immediate expression for " + mnemonic + ".");
      }
      return { mode: "IMM", expr: immExpr };
    }

    let match = operand.match(/^\(\s*(.+)\s*,\s*X\s*\)$/i);
    if (match) {
      if (modes.INDX === undefined)
        {throw new Error("Line " + lineNo + ": " + mnemonic + " does not support (operand,X).");}
      return { mode: "INDX", expr: match[1] };
    }

    match = operand.match(/^\(\s*(.+)\s*\)\s*,\s*Y\s*$/i);
    if (match) {
      if (modes.INDY === undefined)
        {throw new Error("Line " + lineNo + ": " + mnemonic + " does not support (operand),Y.");}
      return { mode: "INDY", expr: match[1] };
    }

    match = operand.match(/^\(\s*(.+)\s*\)$/i);
    if (match) {
      if (modes.IND === undefined)
        {throw new Error("Line " + lineNo + ": " + mnemonic + " does not support indirect mode.");}
      return { mode: "IND", expr: match[1] };
    }

    match = operand.match(/^(.+)\s*,\s*X\s*$/i);
    if (match) {
      if (modes.ZPX === undefined && modes.ABSX === undefined) {
        throw new Error("Line " + lineNo + ": " + mnemonic + " does not support ,X addressing.");
      }
      return {
        expr: match[1],
        modeSelector: {
          zp: "ZPX",
          abs: "ABSX",
          text: ",X addressing",
        },
      };
    }

    match = operand.match(/^(.+)\s*,\s*Y\s*$/i);
    if (match) {
      if (modes.ZPY === undefined && modes.ABSY === undefined) {
        throw new Error("Line " + lineNo + ": " + mnemonic + " does not support ,Y addressing.");
      }
      return {
        expr: match[1],
        modeSelector: {
          zp: "ZPY",
          abs: "ABSY",
          text: ",Y addressing",
        },
      };
    }

    if (modes.ZP === undefined && modes.ABS === undefined) {
      throw new Error("Line " + lineNo + ": " + mnemonic + " does not support direct addressing.");
    }
    return {
      expr: operand,
      modeSelector: {
        zp: "ZP",
        abs: "ABS",
        text: "direct addressing",
      },
    };
  }

  function resolveInstructionMode(
    mnemonic,
    parsed,
    symbols,
    pc,
    lineNo,
    fallbackSymbols,
    preferredMode,
  ) {
    if (parsed.mode) return parsed.mode;

    const selector = parsed.modeSelector;
    const valueInfo = evalExpression(
      parsed.expr,
      symbols,
      pc,
      true,
      lineNo,
      fallbackSymbols,
    );
    const mode = chooseDirectMode(
      mnemonic,
      selector.zp,
      selector.abs,
      valueInfo,
      preferredMode,
    );
    if (!mode) {
      throw new Error("Line " + lineNo + ": " + mnemonic + " does not support " + selector.text + ".");
    }
    return mode;
  }

  function requireRange(name, value, min, max, lineNo) {
    if (value < min || value > max) {
      throw new Error(
        "Line " + lineNo + ": " + name + " out of range (" + value + ", expected " + min + ".." + max + ").",
      );
    }
    return value;
  }

  function isReservedLeadingToken(word) {
    const upper = String(word || "").toUpperCase();
    if (!upper.length) return false;
    if (MNEMONIC_KEYWORDS.has(upper) || DIRECTIVE_KEYWORDS.has(upper)) return true;

    if (upper[0] === ".") {
      const bare = upper.substring(1);
      if (MNEMONIC_KEYWORDS.has(bare) || DIRECTIVE_KEYWORDS.has(bare)) return true;
    }
    return false;
  }

  function consumeLeadingLabel(text) {
    const body = String(text || "").trim();
    if (!body.length) return null;

    let match = body.match(/^([A-Za-z_.@][A-Za-z0-9_.@]*)\s*:\s*(.*)$/);
    if (match) {
      return {
        label: match[1],
        rest: (match[2] || "").trim(),
      };
    }

    match = body.match(/^([A-Za-z_.@][A-Za-z0-9_.@]*)(?:\s+(.+))?$/);
    if (!match) return null;

    const label = match[1];
    if (isReservedLeadingToken(label)) return null;

    const rest = (match[2] || "").trim();
    if (!rest.length) {
      return {
        label: label,
        rest: "",
      };
    }

    // Preserve constant-definition forms like "NAME = expr" and "NAME EQU expr".
    if (/^(=|EQU\b)/i.test(rest)) return null;

    return {
      label: label,
      rest: rest,
    };
  }

  function buildXex(segments) {
    let total = 0;
    for (let i = 0; i < segments.length; i++) {
      total += 6 + segments[i].data.length;
    }
    const out = new Uint8Array(total);
    let p = 0;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const start = seg.start & 0xffff;
      const end = start + seg.data.length - 1;
      if (end > 0xffff) {
        throw new Error("Segment out of 16-bit address range.");
      }
      out[p++] = 0xff;
      out[p++] = 0xff;
      out[p++] = start & 0xff;
      out[p++] = (start >> 8) & 0xff;
      out[p++] = end & 0xff;
      out[p++] = (end >> 8) & 0xff;
      out.set(seg.data, p);
      p += seg.data.length;
    }
    return out;
  }

  function parseLineNumber(message) {
    const m = /^Line\s+(\d+)\s*:/i.exec(String(message || ""));
    if (!m) return null;
    return parseInt(m[1], 10);
  }

  function toAssembleError(err, fallbackLineNo) {
    const message = err && err.message ? err.message : String(err);
    const parsedLine = parseLineNumber(message);
    const lineNo = parsedLine === null ? (fallbackLineNo || null) : parsedLine;
    return {
      lineNo: lineNo,
      message: message,
    };
  }

  function dedupeErrors(errors) {
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
  }

  function summarizeErrors(errors) {
    if (!errors.length) return "Assemble failed.";
    if (errors.length === 1) return errors[0].message;
    return errors[0].message + " (+" + (errors.length - 1) + " more)";
  }

  function sameModeList(a, b) {
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function sameSymbols(a, b) {
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
  }

  function buildLayoutPass(lines, fallbackSymbols, modeHints, keepGoing) {
    const symbols = Object.create(null);
    const statements = [];
    const instructionModes = [];
    const errors = [];
    let pc = 0x2000;

    for (let li = 0; li < lines.length; li++) {
      const lineNo = li + 1;
      const raw = stripComment(lines[li]).trim();
      if (!raw.length) continue;

      const symbolsAdded = [];
      const statementCountBefore = statements.length;
      const modeCountBefore = instructionModes.length;
      const pcBefore = pc;

      try {
        let body = raw;
        while (true) {
          const labelInfo = consumeLeadingLabel(body);
          if (!labelInfo) break;
          const name = defineSymbol(symbols, labelInfo.label, pc, lineNo);
          symbolsAdded.push(name);
          body = labelInfo.rest;
          if (!body.length) break;
        }
        if (!body.length) continue;

        const starOrg = body.match(/^\*\s*=\s*(.+)$/);
        if (starOrg) {
          const org = evalExpression(starOrg[1], symbols, pc, false, lineNo);
          const orgVal = requireRange("origin", org.value | 0, 0, 0xffff, lineNo);
          statements.push({ type: "org", lineNo: lineNo, value: orgVal });
          pc = orgVal;
          continue;
        }

        const assignDef = body.match(/^([A-Za-z_.@][A-Za-z0-9_.@]*)\s*=\s*(.+)$/);
        if (assignDef) {
          const value = evalExpression(assignDef[2], symbols, pc, false, lineNo);
          const name = defineSymbol(
            symbols,
            assignDef[1],
            requireRange("constant", value.value | 0, 0, 0xffff, lineNo),
            lineNo,
          );
          symbolsAdded.push(name);
          continue;
        }

        const equDef = body.match(/^([A-Za-z_.@][A-Za-z0-9_.@]*)\s+EQU\s+(.+)$/i);
        if (equDef) {
          const value = evalExpression(equDef[2], symbols, pc, false, lineNo);
          const name = defineSymbol(
            symbols,
            equDef[1],
            requireRange("constant", value.value | 0, 0, 0xffff, lineNo),
            lineNo,
          );
          symbolsAdded.push(name);
          continue;
        }

        const tokenMatch = body.match(/^([.\w]+)\s*(.*)$/);
        if (!tokenMatch) continue;
        const token = tokenMatch[1];
        const operand = (tokenMatch[2] || "").trim();
        const upper = token.toUpperCase();

        if (upper === ".EQU" || upper === ".SET") {
          const args = splitArgs(operand).filter(Boolean);
          if (args.length < 2) {
            throw new Error("Line " + lineNo + ": " + upper + " requires name and expression.");
          }
          const nameToken = args.shift();
          const expr = args.join(",");
          const value = evalExpression(expr, symbols, pc, false, lineNo);
          const name = defineSymbol(
            symbols,
            nameToken,
            requireRange("constant", value.value | 0, 0, 0xffff, lineNo),
            lineNo,
          );
          symbolsAdded.push(name);
          continue;
        }

        if (upper === ".ORG") {
          const org = evalExpression(operand, symbols, pc, false, lineNo);
          const orgVal = requireRange("origin", org.value | 0, 0, 0xffff, lineNo);
          statements.push({ type: "org", lineNo: lineNo, value: orgVal });
          pc = orgVal;
          continue;
        }

        if (upper === ".RUN") {
          statements.push({ type: "run", lineNo: lineNo, expr: operand });
          continue;
        }

        if (upper === ".BYTE" || upper === ".DB") {
          const args = splitArgs(operand).filter(Boolean);
          if (!args.length) throw new Error("Line " + lineNo + ": .BYTE requires at least one argument.");
          let size = 0;
          for (let ai = 0; ai < args.length; ai++) {
            const a = args[ai];
            if (a.length >= 2 && (a[0] === "'" || a[0] === "\"")) {
              size += decodeEscapedString(a, lineNo).length;
            } else {
              size += 1;
            }
          }
          statements.push({ type: "byte", lineNo: lineNo, args: args });
          pc += size;
          continue;
        }

        if (upper === ".WORD" || upper === ".DW") {
          const args = splitArgs(operand).filter(Boolean);
          if (!args.length) throw new Error("Line " + lineNo + ": .WORD requires at least one argument.");
          statements.push({ type: "word", lineNo: lineNo, args: args });
          pc += args.length * 2;
          continue;
        }

        if (upper === ".TEXT") {
          const args = splitArgs(operand).filter(Boolean);
          if (!args.length) throw new Error("Line " + lineNo + ": .TEXT requires at least one argument.");
          let size = 0;
          for (let ai = 0; ai < args.length; ai++) {
            const a = args[ai];
            if (a.length >= 2 && (a[0] === "'" || a[0] === "\"")) {
              size += decodeEscapedString(a, lineNo).length;
            } else {
              size += 1;
            }
          }
          statements.push({ type: "text", lineNo: lineNo, args: args });
          pc += size;
          continue;
        }

        const mnemonic = upper.replace(/^\./, "");
        const parsed = parseInstructionStatement(mnemonic, operand, lineNo);
        const preferredMode = modeHints[instructionModes.length] || null;
        const mode = resolveInstructionMode(
          mnemonic,
          parsed,
          symbols,
          pc,
          lineNo,
          fallbackSymbols,
          preferredMode,
        );
        const size = MODE_SIZE[mode];
        if (!size) {
          throw new Error("Line " + lineNo + ": unsupported mode for " + mnemonic + ".");
        }
        statements.push({
          type: "ins",
          lineNo: lineNo,
          mnemonic: mnemonic,
          mode: mode,
          expr: parsed.expr,
        });
        instructionModes.push(mode);
        pc += size;
      } catch (err) {
        if (!keepGoing) throw err;

        pc = pcBefore;
        statements.length = statementCountBefore;
        instructionModes.length = modeCountBefore;
        for (let si = 0; si < symbolsAdded.length; si++) {
          delete symbols[symbolsAdded[si]];
        }
        errors.push(toAssembleError(err, lineNo));
        if (errors.length >= 64) break;
      }
    }

    return {
      symbols: symbols,
      statements: statements,
      instructionModes: instructionModes,
      errors: errors,
    };
  }

  function assembleToXex(sourceText) {
    if (!OPCODES) {
      return { ok: false, error: "CPU opcode table unavailable." };
    }

    const lines = String(sourceText || "").replace(/\r\n?/g, "\n").split("\n");

    try {
      const MAX_LAYOUT_PASSES = 8;
      let modeHints = [];
      let fallbackSymbols = null;
      let plan = null;

      for (let pass = 0; pass < MAX_LAYOUT_PASSES; pass++) {
        plan = buildLayoutPass(lines, fallbackSymbols, modeHints, false);
        const stableModes = sameModeList(modeHints, plan.instructionModes);
        const stableSymbols = sameSymbols(fallbackSymbols, plan.symbols);
        if (stableModes && stableSymbols) break;
        if (pass >= MAX_LAYOUT_PASSES - 1) {
          throw new Error("Assembler mode resolution did not converge.");
        }
        modeHints = plan.instructionModes.slice();
        fallbackSymbols = plan.symbols;
      }

      const symbols = plan.symbols;
      const statements = plan.statements;
      const segments = [];
      let currentSegment = null;
      let outPc = 0x2000;
      let firstEmitPc = null;
      let runAddr = null;
      let explicitRun = false;

      function beginSegmentIfNeeded(addr) {
        if (addr < 0 || addr > 0xffff) {
          throw new Error("Address out of range: $" + (addr >>> 0).toString(16).toUpperCase());
        }
        if (
          currentSegment &&
          currentSegment.start + currentSegment.data.length === addr
        ) {
          return;
        }
        currentSegment = { start: addr, data: [] };
        segments.push(currentSegment);
      }

      function writeByte(value, lineNo) {
        const v = requireRange("byte", value | 0, 0, 255, lineNo);
        if (outPc > 0xffff) {
          throw new Error("Line " + lineNo + ": write beyond $FFFF.");
        }
        beginSegmentIfNeeded(outPc);
        if (firstEmitPc === null) firstEmitPc = outPc;
        currentSegment.data.push(v & 0xff);
        outPc++;
      }

      function writeWord(value, lineNo) {
        const v = requireRange("word", value | 0, 0, 0xffff, lineNo);
        writeByte(v & 0xff, lineNo);
        writeByte((v >> 8) & 0xff, lineNo);
      }

      for (let si = 0; si < statements.length; si++) {
        const st = statements[si];
        if (st.type === "org") {
          outPc = st.value | 0;
          currentSegment = null;
          continue;
        }

        if (st.type === "run") {
          const run = evalExpression(st.expr, symbols, outPc, false, st.lineNo);
          runAddr = requireRange("run address", run.value | 0, 0, 0xffff, st.lineNo);
          explicitRun = true;
          continue;
        }

        if (st.type === "byte" || st.type === "text") {
          for (let ai = 0; ai < st.args.length; ai++) {
            const arg = st.args[ai];
            if (arg.length >= 2 && (arg[0] === "'" || arg[0] === "\"")) {
              const bytes = stringToBytes(decodeEscapedString(arg, st.lineNo));
              for (let bi = 0; bi < bytes.length; bi++) writeByte(bytes[bi], st.lineNo);
            } else {
              const val = evalExpression(arg, symbols, outPc, false, st.lineNo);
              writeByte(val.value, st.lineNo);
            }
          }
          continue;
        }

        if (st.type === "word") {
          for (let ai = 0; ai < st.args.length; ai++) {
            const val = evalExpression(st.args[ai], symbols, outPc, false, st.lineNo);
            writeWord(val.value, st.lineNo);
          }
          continue;
        }

        if (st.type === "ins") {
          const modes = OPCODES[st.mnemonic];
          const opcode = modes && modes[st.mode];
          if (opcode === undefined) {
            throw new Error(
              "Line " + st.lineNo + ": cannot encode " + st.mnemonic + " in mode " + st.mode + ".",
            );
          }
          const instPc = outPc;
          writeByte(opcode, st.lineNo);

          if (st.mode === "IMM" || st.mode === "ZP" || st.mode === "ZPX" ||
              st.mode === "ZPY" || st.mode === "INDX" || st.mode === "INDY") {
            const v = evalExpression(st.expr, symbols, instPc, false, st.lineNo);
            writeByte(v.value, st.lineNo);
          } else if (st.mode === "ABS" || st.mode === "ABSX" || st.mode === "ABSY" || st.mode === "IND") {
            const v = evalExpression(st.expr, symbols, instPc, false, st.lineNo);
            writeWord(v.value, st.lineNo);
          } else if (st.mode === "REL") {
            const target = evalExpression(st.expr, symbols, instPc, false, st.lineNo);
            const rel = (target.value | 0) - (instPc + 2);
            if (rel < -128 || rel > 127) {
              throw new Error(
                "Line " + st.lineNo + ": branch target out of range (offset " + rel + ").",
              );
            }
            writeByte(rel & 0xff, st.lineNo);
          }
        }
      }

      if (!segments.length) {
        throw new Error("Source does not emit any code/data.");
      }

      if (runAddr === null && firstEmitPc !== null) runAddr = firstEmitPc;
      if (runAddr !== null && (explicitRun || !segmentHasRunAddress(segments))) {
        segments.push({
          start: 0x02e0,
          data: [runAddr & 0xff, (runAddr >> 8) & 0xff],
        });
      }

      const xex = buildXex(segments);
      return {
        ok: true,
        bytes: xex,
        runAddr: runAddr,
        symbols: symbols,
      };
    } catch (err) {
      const primaryError = toAssembleError(err, null);
      let errors = [primaryError];
      try {
        const recovered = buildLayoutPass(lines, null, [], true);
        if (recovered.errors.length) {
          errors = dedupeErrors([primaryError].concat(recovered.errors));
        }
      } catch {
        // If recovery fails, keep the primary error only.
      }
      return {
        ok: false,
        error: summarizeErrors(errors),
        errors: errors,
      };
    }
  }

  function segmentHasRunAddress(segments) {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const start = seg.start | 0;
      const end = start + seg.data.length - 1;
      if (start <= 0x02e0 && end >= 0x02e1) return true;
    }
    return false;
  }

  function decodeBytesToText(bytes) {
    if (typeof TextDecoder !== "undefined") {
      try {
        return new TextDecoder().decode(bytes);
      } catch {
        // fallback below
      }
    }
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += String.fromCharCode(bytes[i] & 0xff);
    }
    return out;
  }

  function encodeTextToBytes(text) {
    if (typeof TextEncoder !== "undefined") {
      try {
        return new TextEncoder().encode(text);
      } catch {
        // fallback below
      }
    }
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
    return out;
  }

  function ensureExtension(name, ext) {
    const raw = String(name || "").trim();
    if (!raw.length) return "";
    if (raw.indexOf(".") >= 0) return raw;
    return raw + ext;
  }

  function uint8ArrayToArrayBuffer(bytes) {
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
  }

  function init(opts) {
    const app = opts.app;
    const panel = opts.panel;
    const button = opts.button;
    const onMediaChanged = typeof opts.onMediaChanged === "function"
      ? opts.onMediaChanged
      : null;
    const focusCanvas = typeof opts.focusCanvas === "function"
      ? opts.focusCanvas
      : null;
    if (!panel || !button || !app || !app.hDevice) return;
    if (panel.__a8eAssemblerInitialized) return;
    panel.__a8eAssemblerInitialized = true;

    const hostFs = app.hDevice.getHostFs && app.hDevice.getHostFs();
    if (!hostFs) return;

    const sourceNameInput = panel.querySelector(".asm-source-name");
    const sourceSelect = panel.querySelector(".asm-source-select");
    const loadBtn = panel.querySelector(".asm-load-btn");
    const saveBtn = panel.querySelector(".asm-save-btn");
    const buildBtn = panel.querySelector(".asm-build-btn");
    const runBtn = panel.querySelector(".asm-run-btn");
    const highlight = panel.querySelector(".asm-highlight");
    const editor = panel.querySelector(".asm-editor");
    const errorsWrap = panel.querySelector(".asm-errors");
    const errorList = panel.querySelector(".asm-error-list");
    const status = panel.querySelector(".asm-status");

    if (
      !sourceNameInput ||
      !sourceSelect ||
      !loadBtn ||
      !saveBtn ||
      !buildBtn ||
      !runBtn ||
      !highlight ||
      !editor ||
      !errorsWrap ||
      !errorList ||
      !status
    ) {
      return;
    }

    function normalizeFsName(raw, fallbackExt) {
      let name = String(raw || "").trim();
      if (!name.length) return "";
      if (fallbackExt) name = ensureExtension(name, fallbackExt);
      if (typeof hostFs.normalizeName === "function") {
        return hostFs.normalizeName(name) || "";
      }
      return name.toUpperCase();
    }

    function setStatus(message, kind) {
      status.textContent = message;
      status.className = "asm-status";
      if (kind === "error" || kind === "success") status.classList.add(kind);
    }

    function deriveOutputName() {
      var srcName = normalizeFsName(sourceNameInput.value, ".ASM");
      if (!srcName) return "PROGRAM.XEX";
      var dot = srcName.lastIndexOf(".");
      var base = dot > 0 ? srcName.substring(0, dot) : srcName;
      return base + ".XEX";
    }

    let highlightQueued = false;

    function syncHighlightScroll() {
      highlight.scrollTop = editor.scrollTop;
      highlight.scrollLeft = editor.scrollLeft;
    }

    function refreshHighlightNow() {
      highlight.innerHTML = highlightAssemblerSource(editor.value);
      syncHighlightScroll();
    }

    function queueHighlightRefresh() {
      if (highlightQueued) return;
      highlightQueued = true;
      const run = function () {
        highlightQueued = false;
        refreshHighlightNow();
      };
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(run);
      } else {
        setTimeout(run, 0);
      }
    }

    function lineStartOffset(text, lineNo) {
      let line = 1;
      let i = 0;
      while (i < text.length && line < lineNo) {
        if (text.charCodeAt(i) === 10) line++;
        i++;
      }
      return i;
    }

    function jumpEditorToLine(lineNo) {
      if (!lineNo || lineNo < 1) return;
      const text = editor.value || "";
      const pos = lineStartOffset(text, lineNo);
      const style = window.getComputedStyle(editor);
      const lineHeight = parseFloat(style.lineHeight || "16");
      editor.focus();
      editor.selectionStart = pos;
      editor.selectionEnd = pos;
      if (isFinite(lineHeight) && lineHeight > 0) {
        editor.scrollTop = Math.max(0, (lineNo - 2) * lineHeight);
      }
      syncHighlightScroll();
    }

    function clearErrorList() {
      errorList.innerHTML = "";
      errorsWrap.hidden = true;
    }

    function displayErrorText(entry) {
      if (!entry) return "";
      const message = entry.message ? String(entry.message) : String(entry);
      let lineNo = null;
      if (typeof entry.lineNo === "number" && entry.lineNo > 0) {
        lineNo = entry.lineNo;
      } else {
        lineNo = parseLineNumber(message);
      }
      if (!lineNo) return message;
      if (/^Line\s+\d+\s*:/i.test(message)) return message;
      return "Line " + lineNo + ": " + message;
    }

    function renderErrorList(errors) {
      const list = Array.isArray(errors) ? errors : [];
      if (!list.length) {
        clearErrorList();
        return;
      }

      errorList.innerHTML = "";
      const visibleCount = Math.min(list.length, 20);
      for (let i = 0; i < visibleCount; i++) {
        const item = list[i];
        const message = displayErrorText(item);
        const lineNo = item && typeof item.lineNo === "number"
          ? item.lineNo
          : parseLineNumber(message);

        const li = document.createElement("li");
        li.className = "asm-error-item";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "asm-error-btn";
        btn.textContent = message;
        if (lineNo && lineNo > 0) {
          btn.dataset.line = String(lineNo);
          btn.title = "Jump to line " + lineNo;
        } else {
          btn.disabled = true;
        }
        li.appendChild(btn);
        errorList.appendChild(li);
      }

      if (list.length > visibleCount) {
        const li = document.createElement("li");
        li.className = "asm-error-item";
        li.textContent = "... " + (list.length - visibleCount) + " more errors";
        errorList.appendChild(li);
      }

      errorsWrap.hidden = false;
    }

    function refreshSourceList() {
      const files = hostFs.listFiles().filter(function (f) {
        return isSourceFileName(f.name);
      });

      const selectedBefore = sourceSelect.value;
      sourceSelect.innerHTML = "";

      if (!files.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "(no source files)";
        sourceSelect.appendChild(opt);
      } else {
        for (let i = 0; i < files.length; i++) {
          const opt = document.createElement("option");
          opt.value = files[i].name;
          opt.textContent = files[i].name;
          sourceSelect.appendChild(opt);
        }
      }

      const normalizedInput = normalizeFsName(sourceNameInput.value, ".ASM");
      if (normalizedInput && files.some(function (f) { return f.name === normalizedInput; })) {
        sourceSelect.value = normalizedInput;
      } else if (selectedBefore && files.some(function (f) { return f.name === selectedBefore; })) {
        sourceSelect.value = selectedBefore;
      } else if (sourceSelect.options.length) {
        sourceSelect.selectedIndex = 0;
      }
    }

    function loadFromHostFs() {
      const selected = sourceSelect.value || normalizeFsName(sourceNameInput.value, ".ASM");
      if (!selected) {
        setStatus("No source file selected.", "error");
        return;
      }
      const data = hostFs.readFile(selected);
      if (!data) {
        setStatus("Source file not found on HostFS: " + selected, "error");
        return;
      }
      editor.value = decodeBytesToText(data);
      editor.selectionStart = 0;
      editor.selectionEnd = 0;
      editor.scrollTop = 0;
      editor.scrollLeft = 0;
      sourceNameInput.value = selected;
      queueHighlightRefresh();
      clearErrorList();
      setStatus("Loaded " + selected + " from HostFS.", "success");
    }

    function saveToHostFs() {
      const name = normalizeFsName(sourceNameInput.value, ".ASM");
      if (!name) {
        setStatus("Enter a source filename.", "error");
        return;
      }
      const text = editor.value.replace(/\r\n?/g, "\n");
      const bytes = encodeTextToBytes(text);
      if (!hostFs.writeFile(name, bytes)) {
        setStatus("Unable to write source file (locked or invalid name): " + name, "error");
        return;
      }
      sourceNameInput.value = name;
      refreshSourceList();
      sourceSelect.value = name;
      clearErrorList();
      setStatus("Saved " + name + " to HostFS.", "success");
    }

    function assembleAndStoreExecutable() {
      var outputName = deriveOutputName();

      const result = assembleToXex(editor.value);
      if (!result.ok) {
        renderErrorList(result.errors);
        setStatus("Assemble failed: " + result.error, "error");
        return null;
      }

      if (!hostFs.writeFile(outputName, result.bytes)) {
        setStatus("Unable to write executable (locked or invalid name): " + outputName, "error");
        return null;
      }

      clearErrorList();
      return {
        outputName: outputName,
        result: result,
      };
    }

    function assembleAndWriteExecutable() {
      const built = assembleAndStoreExecutable();
      if (!built) return;

      const runText = built.result.runAddr === null
        ? ""
        : " RUN=$" + (built.result.runAddr & 0xffff).toString(16).toUpperCase().padStart(4, "0");
      setStatus(
        "Assembled " + built.outputName + " (" + built.result.bytes.length + " bytes)." + runText,
        "success",
      );
    }

    function assembleRunExecutable() {
      saveToHostFs();
      const built = assembleAndStoreExecutable();
      if (!built) return;

      try {
        const diskBuffer = uint8ArrayToArrayBuffer(built.result.bytes);
        app.loadDiskToDeviceSlot(diskBuffer, built.outputName, 0);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        setStatus("Unable to load into D1: " + msg, "error");
        return;
      }

      if (typeof app.reset === "function") app.reset();
      if (typeof app.start === "function") app.start();
      if (onMediaChanged) onMediaChanged();
      if (focusCanvas) focusCanvas(false);

      const runText = built.result.runAddr === null
        ? ""
        : " RUN=$" + (built.result.runAddr & 0xffff).toString(16).toUpperCase().padStart(4, "0");
      const running = typeof app.isRunning === "function" ? app.isRunning() : true;
      const suffix = running
        ? " Loaded into D1: and started."
        : " Loaded into D1:. Press Start when ROMs are ready.";
      setStatus(
        "Assembled " + built.outputName + " (" + built.result.bytes.length + " bytes)." + runText + suffix,
        "success",
      );
    }

    function onEditorKeyDown(e) {
      // Ctrl+S  -> Save
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "s") {
        e.preventDefault();
        saveToHostFs();
        return;
      }
      // Ctrl+Shift+B  -> Assemble
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        assembleAndWriteExecutable();
        return;
      }
      // Ctrl+Enter  -> Run
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        assembleRunExecutable();
        return;
      }
      if (e.key !== "Tab") return;
      e.preventDefault();
      const start = editor.selectionStart | 0;
      const end = editor.selectionEnd | 0;
      const before = editor.value.substring(0, start);
      const after = editor.value.substring(end);
      editor.value = before + "  " + after;
      const nextPos = start + 2;
      editor.selectionStart = nextPos;
      editor.selectionEnd = nextPos;
      queueHighlightRefresh();
    }

    function sizePanelToViewport() {
      var screenEl = document.querySelector(".screenPanel");
      var h = screenEl ? screenEl.getBoundingClientRect().height : 0;
      var clientH = document.documentElement.clientHeight || window.innerHeight || 0;
      var maxH = Math.floor(clientH * PANEL_MAX_HEIGHT_RATIO);
      h += PANEL_DEFAULT_EXTRA_HEIGHT;
      if (maxH > 0 && h > maxH) h = maxH;
      if (h < PANEL_MIN_HEIGHT) h = PANEL_MIN_HEIGHT;
      panel.style.height = h + "px";
    }

    function focusEditorNoScroll() {
      if (!editor || typeof editor.focus !== "function") return;
      try {
        editor.focus({ preventScroll: true });
      } catch (_) {
        editor.focus();
      }
    }

    button.addEventListener("click", function () {
      const active = button.classList.toggle("active");
      panel.hidden = !active;
      if (active) {
        refreshSourceList();
        /* Auto-load the first ASM file, or clear editor if none exist */
        if (!editor.value && sourceSelect.value) {
          loadFromHostFs();
        } else if (!editor.value) {
          clearErrorList();
        }
        sizePanelToViewport();
        queueHighlightRefresh();
        focusEditorNoScroll();
      }
    });

    sourceSelect.addEventListener("change", function () {
      if (sourceSelect.value) sourceNameInput.value = sourceSelect.value;
    });

    loadBtn.addEventListener("click", loadFromHostFs);
    saveBtn.addEventListener("click", saveToHostFs);
    buildBtn.addEventListener("click", assembleAndWriteExecutable);
    runBtn.addEventListener("click", assembleRunExecutable);
    editor.addEventListener("keydown", onEditorKeyDown);
    editor.addEventListener("input", queueHighlightRefresh);
    editor.addEventListener("scroll", syncHighlightScroll);
    errorList.addEventListener("click", function (e) {
      const target = e.target && e.target.closest
        ? e.target.closest(".asm-error-btn")
        : null;
      if (!target || target.disabled) return;
      const lineNo = parseInt(target.dataset.line || "0", 10);
      if (lineNo > 0) jumpEditorToLine(lineNo);
    });

    /* ---- Resize handle (drag to change panel height) ---- */
    var resizeHandle = panel.querySelector(".asm-resize-handle");
    if (resizeHandle) {
      var dragStartY = 0;
      var dragStartH = 0;

      function onResizeMove(e) {
        var dy = (e.clientY || e.touches && e.touches[0].clientY || 0) - dragStartY;
        var clientH = document.documentElement.clientHeight || window.innerHeight;
        var newH = Math.max(PANEL_MIN_HEIGHT, Math.min(clientH * PANEL_MAX_HEIGHT_RATIO, dragStartH + dy));
        panel.style.height = newH + "px";
      }

      function onResizeEnd() {
        document.removeEventListener("mousemove", onResizeMove);
        document.removeEventListener("mouseup", onResizeEnd);
        document.removeEventListener("touchmove", onResizeMove);
        document.removeEventListener("touchend", onResizeEnd);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }

      function onResizeStart(e) {
        e.preventDefault();
        dragStartY = e.clientY || e.touches && e.touches[0].clientY || 0;
        dragStartH = panel.getBoundingClientRect().height;
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onResizeMove);
        document.addEventListener("mouseup", onResizeEnd);
        document.addEventListener("touchmove", onResizeMove);
        document.addEventListener("touchend", onResizeEnd);
      }

      resizeHandle.addEventListener("mousedown", onResizeStart);
      resizeHandle.addEventListener("touchstart", onResizeStart, { passive: false });
    }

    if (typeof hostFs.onChange === "function") {
      panel.__a8eAssemblerUnsub = hostFs.onChange(function () {
        if (!panel.hidden) refreshSourceList();
      });
    }

    window.addEventListener("beforeunload", function () {
      if (panel.__a8eAssemblerUnsub) {
        panel.__a8eAssemblerUnsub();
        panel.__a8eAssemblerUnsub = null;
      }
    });

    if (!editor.value.trim().length) editor.value = DEFAULT_SOURCE_TEMPLATE;
    refreshHighlightNow();
    panel.hidden = true;
    button.classList.remove("active");
    clearErrorList();
    setStatus("Ready.");
  }

  window.A8EAssemblerUI = {
    init: init,
    assembleToXex: assembleToXex,
  };
})();
