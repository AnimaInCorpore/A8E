(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const ns = root.A8EAssemblerModules || (root.A8EAssemblerModules = {});

  ns.stripComment = function stripComment(line) {
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
  };

  ns.splitArgs = function splitArgs(text) {
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
      if (ch === "(" || ch === "[") {
        depth++;
        token += ch;
        continue;
      }
      if ((ch === ")" || ch === "]") && depth > 0) {
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
  };

  ns.decodeEscapedString = function decodeEscapedString(raw, lineNo) {
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
  };

  ns.stringToBytes = function stringToBytes(text) {
    const out = [];
    for (let i = 0; i < text.length; i++) {
      out.push(text.charCodeAt(i) & 0xff);
    }
    return out;
  };

  ns.normalizeSymbolName = function normalizeSymbolName(raw) {
    return String(raw || "").trim().toUpperCase();
  };

  ns.defineSymbol = function defineSymbol(symbols, rawName, value, lineNo) {
    const name = ns.normalizeSymbolName(rawName);
    if (!/^[A-Z_.@][A-Z0-9_.@]*$/.test(name)) {
      throw new Error("Line " + lineNo + ": invalid symbol name '" + rawName + "'.");
    }
    if (Object.prototype.hasOwnProperty.call(symbols, name)) {
      throw new Error("Line " + lineNo + ": duplicate symbol '" + rawName + "'.");
    }
    symbols[name] = value & 0xffff;
    return name;
  };

  ns.evalExpression = function evalExpression(expr, symbols, currentPc, allowUnresolved, lineNo, fallbackSymbols) {
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
        if (c === "(" || c === "[") {
          depth++;
          i++;
          continue;
        }
        if ((c === ")" || c === "]") && depth > 0) {
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

      const term = ns.evalTerm(
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
  };

  ns.evalTerm = function evalTerm(termText, symbols, currentPc, allowUnresolved, lineNo, fallbackSymbols) {
    const text = termText.trim();
    if (!text.length) {
      throw new Error("Line " + lineNo + ": invalid expression term.");
    }

    if (text[0] === "<" || text[0] === ">") {
      const op = text[0];
      const inner = ns.evalExpression(
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

    if ((text[0] === "(" && text[text.length - 1] === ")") ||
        (text[0] === "[" && text[text.length - 1] === "]")) {
      const open = text[0];
      const close = open === "(" ? ")" : "]";
      let depth = 0;
      let wraps = true;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === open) depth++;
        if (text[i] === close) depth--;
        if (depth === 0 && i < text.length - 1) {
          wraps = false;
          break;
        }
      }
      if (wraps) {
        return ns.evalExpression(
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
      const s = ns.decodeEscapedString(text, lineNo);
      return { value: s.charCodeAt(0) & 0xff, resolved: true };
    }

    if (/^[A-Za-z_.@][A-Za-z0-9_.@]*$/.test(text)) {
      const key = ns.normalizeSymbolName(text);
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
  };
})();
