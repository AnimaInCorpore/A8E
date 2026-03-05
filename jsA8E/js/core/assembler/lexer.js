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
    if (!/^[A-Z_.@?][A-Z0-9_.@?]*$/.test(name)) {
      throw new Error("Line " + lineNo + ": invalid symbol name '" + rawName + "'.");
    }
    if (Object.prototype.hasOwnProperty.call(symbols, name)) {
      throw new Error("Line " + lineNo + ": duplicate symbol '" + rawName + "'.");
    }
    symbols[name] = value & 0xffff;
    return name;
  };

  function makeExprValue(value, resolved) {
    return {
      value: value | 0,
      resolved: !!resolved,
    };
  }

  function tokenizeExpression(exprText, lineNo) {
    const source = String(exprText || "");
    const tokens = [];
    let i = 0;

    function push(type, value) {
      tokens.push({
        type: type,
        value: value,
      });
    }

    while (i < source.length) {
      const ch = source[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      const two = source.substring(i, i + 2);
      if (
        two === "<<" || two === ">>" ||
        two === "&&" || two === "||" ||
        two === "<=" || two === ">=" ||
        two === "==" || two === "!=" ||
        two === "<>"
      ) {
        push("op", two);
        i += 2;
        continue;
      }

      if ("()[]+-*/&|^!,=<>~".indexOf(ch) >= 0) {
        push("op", ch);
        i++;
        continue;
      }

      if (ch === "'" || ch === "\"") {
        const quote = ch;
        const start = i;
        i++;
        while (i < source.length) {
          if (source[i] === "\\") {
            i += 2;
            continue;
          }
          if (source[i] === quote) {
            i++;
            break;
          }
          i++;
        }
        if (i > source.length || source[i - 1] !== quote) {
          throw new Error("Line " + lineNo + ": unterminated string literal in expression.");
        }
        push("str", source.substring(start, i));
        continue;
      }

      if (ch === "$") {
        const start = i;
        i++;
        while (i < source.length && /[0-9a-fA-F]/.test(source[i])) i++;
        if (i <= start + 1) {
          throw new Error("Line " + lineNo + ": invalid hex literal in expression.");
        }
        push("num", parseInt(source.substring(start + 1, i), 16));
        continue;
      }

      if (ch === "%") {
        const start = i;
        i++;
        while (i < source.length && /[01]/.test(source[i])) i++;
        if (i <= start + 1) {
          throw new Error("Line " + lineNo + ": invalid binary literal in expression.");
        }
        push("num", parseInt(source.substring(start + 1, i), 2));
        continue;
      }

      if (/[0-9]/.test(ch)) {
        const start = i;
        if (
          source[i] === "0" &&
          i + 1 < source.length &&
          (source[i + 1] === "x" || source[i + 1] === "X")
        ) {
          i += 2;
          while (i < source.length && /[0-9a-fA-F]/.test(source[i])) i++;
          if (i <= start + 2) {
            throw new Error("Line " + lineNo + ": invalid hex literal in expression.");
          }
          push("num", parseInt(source.substring(start + 2, i), 16));
        } else {
          i++;
          while (i < source.length && /[0-9]/.test(source[i])) i++;
          push("num", parseInt(source.substring(start, i), 10));
        }
        continue;
      }

      if (/[A-Za-z_.@?]/.test(ch)) {
        const start = i;
        i++;
        while (i < source.length && /[A-Za-z0-9_.@?]/.test(source[i])) i++;
        push("ident", source.substring(start, i));
        continue;
      }

      throw new Error("Line " + lineNo + ": invalid token '" + ch + "' in expression.");
    }

    push("eof", "");
    return tokens;
  }

  ns.evalExpression = function evalExpression(expr, symbols, currentPc, allowUnresolved, lineNo, fallbackSymbols) {
    const source = String(expr || "").trim();
    if (!source.length) {
      throw new Error("Line " + lineNo + ": missing expression.");
    }

    const tokens = tokenizeExpression(source, lineNo);
    let pos = 0;

    function peek() {
      return tokens[pos] || { type: "eof", value: "" };
    }

    function consume() {
      const token = peek();
      pos++;
      return token;
    }

    function matchOp(op) {
      const token = peek();
      if (token.type === "op" && token.value === op) {
        pos++;
        return true;
      }
      return false;
    }

    function expectOp(op, description) {
      if (!matchOp(op)) {
        throw new Error(
          "Line " + lineNo + ": expected '" + op + "'" +
          (description ? (" " + description) : "") +
          " in expression.",
        );
      }
    }

    function truthy(value) {
      return (value | 0) !== 0;
    }

    function symbolValue(name) {
      const key = ns.normalizeSymbolName(name);
      if (Object.prototype.hasOwnProperty.call(symbols, key)) {
        return makeExprValue(symbols[key] | 0, true);
      }
      if (fallbackSymbols && Object.prototype.hasOwnProperty.call(fallbackSymbols, key)) {
        return makeExprValue(fallbackSymbols[key] | 0, true);
      }
      if (allowUnresolved) return makeExprValue(0, false);
      throw new Error("Line " + lineNo + ": unknown symbol '" + name + "'.");
    }

    function parsePrimary() {
      if (matchOp("*")) {
        return makeExprValue(currentPc & 0xffff, true);
      }

      const token = peek();
      if (token.type === "num") {
        consume();
        return makeExprValue(token.value | 0, true);
      }

      if (token.type === "str") {
        consume();
        const decoded = ns.decodeEscapedString(token.value, lineNo);
        if (decoded.length !== 1) {
          throw new Error("Line " + lineNo + ": character literal must contain exactly one byte.");
        }
        return makeExprValue(decoded.charCodeAt(0) & 0xff, true);
      }

      if (token.type === "ident") {
        consume();
        return symbolValue(token.value);
      }

      if (matchOp("(")) {
        const value = parseOr();
        expectOp(")", "to close parenthesized expression");
        return value;
      }

      if (matchOp("[")) {
        const value = parseOr();
        expectOp("]", "to close bracketed expression");
        return value;
      }

      throw new Error("Line " + lineNo + ": invalid expression.");
    }

    function parseUnary() {
      if (matchOp("+")) {
        return parseUnary();
      }
      if (matchOp("-")) {
        const inner = parseUnary();
        if (!inner.resolved) return makeExprValue(0, false);
        return makeExprValue(-inner.value, true);
      }
      if (matchOp("!")) {
        const inner = parseUnary();
        if (!inner.resolved) return makeExprValue(0, false);
        return makeExprValue(truthy(inner.value) ? 0 : 1, true);
      }
      if (matchOp("~")) {
        const inner = parseUnary();
        if (!inner.resolved) return makeExprValue(0, false);
        return makeExprValue(~(inner.value | 0), true);
      }
      if (matchOp("<")) {
        const inner = parseUnary();
        if (!inner.resolved) return makeExprValue(0, false);
        return makeExprValue(inner.value & 0xff, true);
      }
      if (matchOp(">")) {
        const inner = parseUnary();
        if (!inner.resolved) return makeExprValue(0, false);
        return makeExprValue((inner.value >> 8) & 0xff, true);
      }
      return parsePrimary();
    }

    function parseMul() {
      let left = parseUnary();
      while (true) {
        if (matchOp("*")) {
          const right = parseUnary();
          if (!left.resolved || !right.resolved) left = makeExprValue(0, false);
          else left = makeExprValue((left.value | 0) * (right.value | 0), true);
          continue;
        }
        if (matchOp("/")) {
          const right = parseUnary();
          if (!left.resolved || !right.resolved) left = makeExprValue(0, false);
          else if ((right.value | 0) === 0) left = makeExprValue(0, true);
          else left = makeExprValue((left.value | 0) / (right.value | 0), true);
          continue;
        }
        break;
      }
      return left;
    }

    function parseAdd() {
      let left = parseMul();
      while (true) {
        if (matchOp("+")) {
          const right = parseMul();
          if (!left.resolved || !right.resolved) left = makeExprValue(0, false);
          else left = makeExprValue((left.value | 0) + (right.value | 0), true);
          continue;
        }
        if (matchOp("-")) {
          const right = parseMul();
          if (!left.resolved || !right.resolved) left = makeExprValue(0, false);
          else left = makeExprValue((left.value | 0) - (right.value | 0), true);
          continue;
        }
        break;
      }
      return left;
    }

    function parseShift() {
      let left = parseAdd();
      while (true) {
        if (matchOp("<<")) {
          const right = parseAdd();
          if (!left.resolved || !right.resolved) left = makeExprValue(0, false);
          else left = makeExprValue((left.value | 0) << (right.value | 0), true);
          continue;
        }
        if (matchOp(">>")) {
          const right = parseAdd();
          if (!left.resolved || !right.resolved) left = makeExprValue(0, false);
          else left = makeExprValue((left.value | 0) >> (right.value | 0), true);
          continue;
        }
        break;
      }
      return left;
    }

    function parseCompare() {
      let left = parseShift();
      while (true) {
        let op = null;
        if (matchOp("=") || matchOp("==")) op = "eq";
        else if (matchOp("<>") || matchOp("!=")) op = "ne";
        else if (matchOp("<")) op = "lt";
        else if (matchOp("<=")) op = "le";
        else if (matchOp(">")) op = "gt";
        else if (matchOp(">=")) op = "ge";
        if (!op) break;

        const right = parseShift();
        if (!left.resolved || !right.resolved) {
          left = makeExprValue(0, false);
          continue;
        }
        if (op === "eq") left = makeExprValue((left.value | 0) === (right.value | 0) ? 1 : 0, true);
        else if (op === "ne") left = makeExprValue((left.value | 0) !== (right.value | 0) ? 1 : 0, true);
        else if (op === "lt") left = makeExprValue((left.value | 0) < (right.value | 0) ? 1 : 0, true);
        else if (op === "le") left = makeExprValue((left.value | 0) <= (right.value | 0) ? 1 : 0, true);
        else if (op === "gt") left = makeExprValue((left.value | 0) > (right.value | 0) ? 1 : 0, true);
        else if (op === "ge") left = makeExprValue((left.value | 0) >= (right.value | 0) ? 1 : 0, true);
      }
      return left;
    }

    function parseBitAnd() {
      let left = parseCompare();
      while (matchOp("&")) {
        const right = parseCompare();
        if (!left.resolved || !right.resolved) left = makeExprValue(0, false);
        else left = makeExprValue((left.value | 0) & (right.value | 0), true);
      }
      return left;
    }

    function parseBitXor() {
      let left = parseBitAnd();
      while (matchOp("^")) {
        const right = parseBitAnd();
        if (!left.resolved || !right.resolved) left = makeExprValue(0, false);
        else left = makeExprValue((left.value | 0) ^ (right.value | 0), true);
      }
      return left;
    }

    function parseBitOr() {
      let left = parseBitXor();
      while (matchOp("|")) {
        const right = parseBitXor();
        if (!left.resolved || !right.resolved) left = makeExprValue(0, false);
        else left = makeExprValue((left.value | 0) | (right.value | 0), true);
      }
      return left;
    }

    function parseAnd() {
      let left = parseBitOr();
      while (matchOp("&&")) {
        const right = parseBitOr();
        if ((left.resolved && !truthy(left.value)) || (right.resolved && !truthy(right.value))) {
          left = makeExprValue(0, true);
        } else if (!left.resolved || !right.resolved) {
          left = makeExprValue(0, false);
        } else {
          left = makeExprValue(1, true);
        }
      }
      return left;
    }

    function parseOr() {
      let left = parseAnd();
      while (matchOp("||")) {
        const right = parseAnd();
        if ((left.resolved && truthy(left.value)) || (right.resolved && truthy(right.value))) {
          left = makeExprValue(1, true);
        } else if (!left.resolved || !right.resolved) {
          left = makeExprValue(0, false);
        } else {
          left = makeExprValue(0, true);
        }
      }
      return left;
    }

    const result = parseOr();
    if (peek().type !== "eof") {
      throw new Error("Line " + lineNo + ": unexpected token after expression.");
    }
    return result;
  };

  ns.evalTerm = function evalTerm(termText, symbols, currentPc, allowUnresolved, lineNo, fallbackSymbols) {
    return ns.evalExpression(termText, symbols, currentPc, allowUnresolved, lineNo, fallbackSymbols);
  };
})();
