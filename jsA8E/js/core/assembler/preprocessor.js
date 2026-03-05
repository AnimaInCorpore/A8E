(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const ns = root.A8EAssemblerModules || (root.A8EAssemblerModules = {});

  const PREPROCESSOR_DIRECTIVES = new Set([
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
  ]);

  function splitCodeAndComment(line) {
    let quote = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === "\\") {
          i++;
          continue;
        }
        if (ch === quote) quote = "";
        continue;
      }
      if (ch === "'" || ch === "\"") {
        quote = ch;
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

  function parseFirstToken(code) {
    const trimmed = String(code || "").trim();
    if (!trimmed.length) return null;
    const m = /^([.A-Za-z_@][A-Za-z0-9_.@]*)(?:\s+(.*))?$/.exec(trimmed);
    if (!m) return null;
    const token = m[1];
    const upper = token.toUpperCase();
    return {
      token: token,
      upper: upper,
      directive: upper[0] === "." ? upper.substring(1) : upper,
      operand: (m[2] || "").trim(),
      trimmed: trimmed,
    };
  }

  function formatLoc(entry) {
    const file = entry && entry.file ? String(entry.file) : "<source>";
    const lineNo = entry && entry.lineNo ? (entry.lineNo | 0) : 0;
    if (lineNo > 0) return file + ":" + lineNo;
    return file;
  }

  function makePreError(entry, message) {
    return new Error("Line " + (entry.lineNo | 0) + ": " + message + " (" + formatLoc(entry) + ")");
  }

  function extractIncludePath(operand, entry) {
    const text = String(operand || "").trim();
    if (!text.length) throw makePreError(entry, ".include requires a path.");

    if (
      text.length >= 2 &&
      (text[0] === "\"" || text[0] === "'") &&
      text[text.length - 1] === text[0]
    ) {
      try {
        return ns.decodeEscapedString(text, entry.lineNo);
      } catch (err) {
        const rawMessage = err && err.message ? err.message : "Invalid .include path.";
        throw makePreError(entry, String(rawMessage).replace(/^Line\s+\d+:\s*/i, ""));
      }
    }
    let m = /^"([^"]+)"$/.exec(text);
    if (m) return m[1];
    m = /^'([^']+)'$/.exec(text);
    if (m) return m[1];
    m = /^<([^>]+)>$/.exec(text);
    if (m) return m[1];
    return text;
  }

  function replaceIdentifiers(line, replacer) {
    const src = String(line || "");
    let out = "";
    let i = 0;
    let quote = "";

    function isIdentStart(ch) {
      return /[A-Za-z_.@]/.test(ch);
    }

    function isIdentChar(ch) {
      return /[A-Za-z0-9_.@]/.test(ch);
    }

    while (i < src.length) {
      const ch = src[i];
      if (quote) {
        out += ch;
        if (ch === "\\") {
          i++;
          if (i < src.length) out += src[i];
        } else if (ch === quote) {
          quote = "";
        }
        i++;
        continue;
      }

      if (ch === "'" || ch === "\"") {
        quote = ch;
        out += ch;
        i++;
        continue;
      }

      if (ch === ";") {
        out += src.substring(i);
        break;
      }

      if (isIdentStart(ch)) {
        const start = i;
        i++;
        while (i < src.length && isIdentChar(src[i])) i++;
        const ident = src.substring(start, i);
        const replacement = replacer(ident);
        if (replacement === null || replacement === undefined) out += ident;
        else out += String(replacement);
        continue;
      }

      out += ch;
      i++;
    }

    return out;
  }

  function tokenizeExpr(text, entry) {
    const src = String(text || "");
    const out = [];
    let i = 0;

    function push(type, value) {
      out.push({ type: type, value: value });
    }

    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      const two = src.substring(i, i + 2);
      if (two === "<<" || two === ">>" || two === "&&" || two === "||" ||
          two === "<=" || two === ">=" || two === "<>" || two === "==" || two === "!=") {
        push("op", two);
        i += 2;
        continue;
      }

      if ("()+-*/&|^!,=<>".indexOf(ch) >= 0) {
        push("op", ch);
        i++;
        continue;
      }

      if (ch === "$") {
        const start = i;
        i++;
        while (i < src.length && /[0-9a-fA-F]/.test(src[i])) i++;
        if (i <= start + 1) throw makePreError(entry, "Invalid hex literal in .if expression.");
        push("num", parseInt(src.substring(start + 1, i), 16));
        continue;
      }

      if (ch === "%") {
        const start = i;
        i++;
        while (i < src.length && /[01]/.test(src[i])) i++;
        if (i <= start + 1) throw makePreError(entry, "Invalid binary literal in .if expression.");
        push("num", parseInt(src.substring(start + 1, i), 2));
        continue;
      }

      if (ch >= "0" && ch <= "9") {
        const start = i;
        if (ch === "0" && i + 1 < src.length && (src[i + 1] === "x" || src[i + 1] === "X")) {
          i += 2;
          while (i < src.length && /[0-9a-fA-F]/.test(src[i])) i++;
          push("num", parseInt(src.substring(start + 2, i), 16));
        } else {
          i++;
          while (i < src.length && /[0-9]/.test(src[i])) i++;
          push("num", parseInt(src.substring(start, i), 10));
        }
        continue;
      }

      if (/[A-Za-z_.@]/.test(ch)) {
        const start = i;
        i++;
        while (i < src.length && /[A-Za-z0-9_.@]/.test(src[i])) i++;
        push("ident", src.substring(start, i));
        continue;
      }

      throw makePreError(entry, "Unexpected token in .if expression: '" + ch + "'.");
    }

    push("eof", "");
    return out;
  }

  function createExprParser(tokens, state, entry) {
    let pos = 0;

    function peek() {
      return tokens[pos] || { type: "eof", value: "" };
    }

    function consume() {
      const tok = peek();
      pos++;
      return tok;
    }

    function matchOp(op) {
      const tok = peek();
      if (tok.type === "op" && tok.value === op) {
        pos++;
        return true;
      }
      return false;
    }

    function expectOp(op, what) {
      if (!matchOp(op)) {
        throw makePreError(entry, "Expected '" + op + "'" + (what ? (" " + what) : "") + " in .if expression.");
      }
    }

    function normalizeBool(v) {
      return v ? 1 : 0;
    }

    function isSymbolDefined(name) {
      const key = String(name || "").toUpperCase();
      const resolverDefined = state && typeof state.isDefined === "function"
        ? !!state.isDefined(key)
        : false;
      return (
        Object.prototype.hasOwnProperty.call(state.defines, key) ||
        Object.prototype.hasOwnProperty.call(state.macros, key) ||
        resolverDefined
      );
    }

    function parsePrimary() {
      if (matchOp("*")) {
        if (state && typeof state.currentPc === "number") return state.currentPc | 0;
        return 0;
      }

      const tok = peek();
      if (tok.type === "num") {
        consume();
        return tok.value | 0;
      }

      if (tok.type === "ident") {
        const ident = consume().value;
        const identUpper = ident.toUpperCase();

        if (identUpper === ".DEFINED" || identUpper === ".DEF" || identUpper === ".CONST") {
          if (matchOp("(")) {
            if (matchOp(")")) return 0;
            const firstArg = peek();
            const secondArg = tokens[pos + 1] || { type: "eof", value: "" };
            if (
              firstArg.type === "ident" &&
              secondArg.type === "op" &&
              secondArg.value === ")"
            ) {
              consume();
              expectOp(")", "after " + ident);
              return normalizeBool(isSymbolDefined(firstArg.value));
            }
            const argValue = parseOr();
            expectOp(")", "after " + ident);
            return normalizeBool(argValue);
          }

          const nameTok = peek();
          if (nameTok.type === "ident") {
            consume();
            return normalizeBool(isSymbolDefined(nameTok.value));
          }
          return normalizeBool(parsePrimary());
        }

        if (identUpper === ".NOT") {
          if (matchOp("(")) {
            const v = parseOr();
            expectOp(")", "after .not(");
            return normalizeBool(!v);
          }
          return normalizeBool(!parsePrimary());
        }

        if (identUpper === ".OR") {
          if (matchOp("(")) {
            const a = parseOr();
            expectOp(",", "in .or(");
            const b = parseOr();
            expectOp(")", "after .or(");
            return normalizeBool(a || b);
          }
          return normalizeBool(parsePrimary() || parsePrimary());
        }

        if (Object.prototype.hasOwnProperty.call(state.defines, identUpper)) {
          const defineText = String(state.defines[identUpper] || "");
          if (!defineText.trim().length) return 1;
          return evalConditionalExpr(defineText, state, entry, state.evalGuard);
        }
        if (state && typeof state.valueResolver === "function") {
          const resolved = state.valueResolver(ident, entry);
          if (resolved !== null && resolved !== undefined) return Number(resolved) || 0;
        }
        return 0;
      }

      if (matchOp("(")) {
        const v = parseOr();
        expectOp(")", "to close parenthesized expression");
        return v;
      }

      throw makePreError(entry, "Invalid .if expression.");
    }

    function parseUnary() {
      if (matchOp("!")) return normalizeBool(!parseUnary());
      if (matchOp("+")) return +parseUnary();
      if (matchOp("-")) return -parseUnary();
      if (matchOp("<")) return parseUnary() & 0xff;
      if (matchOp(">")) return (parseUnary() >> 8) & 0xff;
      return parsePrimary();
    }

    function parseMul() {
      let left = parseUnary();
      while (true) {
        if (matchOp("*")) left = left * parseUnary();
        else if (matchOp("/")) {
          const rhs = parseUnary();
          left = rhs === 0 ? 0 : (left / rhs);
        } else {
          break;
        }
      }
      return left;
    }

    function parseAdd() {
      let left = parseMul();
      while (true) {
        if (matchOp("+")) left = left + parseMul();
        else if (matchOp("-")) left = left - parseMul();
        else break;
      }
      return left;
    }

    function parseShift() {
      let left = parseAdd();
      while (true) {
        if (matchOp("<<")) left = left << parseAdd();
        else if (matchOp(">>")) left = left >> parseAdd();
        else break;
      }
      return left;
    }

    function parseCompare() {
      let left = parseShift();
      while (true) {
        if (matchOp("=") || matchOp("==")) left = normalizeBool(left === parseShift());
        else if (matchOp("<>") || matchOp("!=")) left = normalizeBool(left !== parseShift());
        else if (matchOp("<")) left = normalizeBool(left < parseShift());
        else if (matchOp("<=")) left = normalizeBool(left <= parseShift());
        else if (matchOp(">")) left = normalizeBool(left > parseShift());
        else if (matchOp(">=")) left = normalizeBool(left >= parseShift());
        else break;
      }
      return left;
    }

    function parseBitAnd() {
      let left = parseCompare();
      while (matchOp("&")) left = (left | 0) & (parseCompare() | 0);
      return left;
    }

    function parseBitXor() {
      let left = parseBitAnd();
      while (matchOp("^")) left = (left | 0) ^ (parseBitAnd() | 0);
      return left;
    }

    function parseBitOr() {
      let left = parseBitXor();
      while (matchOp("|")) left = (left | 0) | (parseBitXor() | 0);
      return left;
    }

    function parseAnd() {
      let left = parseBitOr();
      while (matchOp("&&")) left = normalizeBool(left && parseBitOr());
      return left;
    }

    function parseOr() {
      let left = parseAnd();
      while (matchOp("||")) left = normalizeBool(left || parseAnd());
      return left;
    }

    return {
      parse: function () {
        const v = parseOr();
        if (peek().type !== "eof") {
          throw makePreError(entry, "Unexpected token after .if expression.");
        }
        return v;
      },
    };
  }

  function evalConditionalExpr(exprText, state, entry, guard) {
    const source = String(exprText || "").trim();
    if (!source.length) return 0;

    const key = source.toUpperCase();
    if (guard && guard.has(key)) {
      throw makePreError(entry, "Recursive .define expression: " + source);
    }

    const evalGuard = guard || new Set();
    evalGuard.add(key);
    const prevGuard = state.evalGuard;
    state.evalGuard = evalGuard;
    try {
      const tokens = tokenizeExpr(source, entry);
      const parser = createExprParser(tokens, state, entry);
      return parser.parse();
    } finally {
      evalGuard.delete(key);
      state.evalGuard = prevGuard;
    }
  }

  ns.evalConditionalExpression = function evalConditionalExpression(exprText, stateLike, entryLike) {
    const state = stateLike || {};
    if (!state.defines) state.defines = Object.create(null);
    if (!state.macros) state.macros = Object.create(null);
    const entry = entryLike || { lineNo: 0, file: "<expression>" };
    return evalConditionalExpr(exprText, state, entry, state.evalGuard || null);
  };

  function currentConditionalActive(state) {
    for (let i = 0; i < state.conditionalStack.length; i++) {
      if (!state.conditionalStack[i].active) return false;
    }
    return true;
  }

  function handleConditionalDirective(info, state, entry) {
    const directive = info.directive;

    if (directive === "IF" || directive === "IFDEF" || directive === "IFNDEF") {
      const parentActive = currentConditionalActive(state);
      let cond = 0;
      if (directive === "IF") {
        cond = evalConditionalExpr(info.operand, state, entry, state.evalGuard);
      } else {
        const name = String(info.operand || "").trim().replace(/^\./, "").toUpperCase();
        if (!name.length) throw makePreError(entry, "." + directive.toLowerCase() + " requires a symbol name.");
        const exists = Object.prototype.hasOwnProperty.call(state.defines, name) ||
          Object.prototype.hasOwnProperty.call(state.macros, name);
        cond = directive === "IFDEF" ? (exists ? 1 : 0) : (exists ? 0 : 1);
      }
      const active = !!(parentActive && cond);
      state.conditionalStack.push({
        parentActive: parentActive,
        active: active,
        branchTaken: !!(parentActive && cond),
        seenElse: false,
      });
      return true;
    }

    if (directive === "ELSEIF") {
      if (!state.conditionalStack.length) {
        throw makePreError(entry, ".elseif without matching .if.");
      }
      const frame = state.conditionalStack[state.conditionalStack.length - 1];
      if (frame.seenElse) throw makePreError(entry, ".elseif after .else is not allowed.");
      if (!frame.parentActive || frame.branchTaken) {
        frame.active = false;
        return true;
      }
      const cond = evalConditionalExpr(info.operand, state, entry, state.evalGuard);
      frame.active = !!cond;
      if (frame.active) frame.branchTaken = true;
      return true;
    }

    if (directive === "ELSE") {
      if (!state.conditionalStack.length) {
        throw makePreError(entry, ".else without matching .if.");
      }
      const frame = state.conditionalStack[state.conditionalStack.length - 1];
      if (frame.seenElse) throw makePreError(entry, "Multiple .else in one conditional block.");
      frame.seenElse = true;
      frame.active = !!(frame.parentActive && !frame.branchTaken);
      frame.branchTaken = true;
      return true;
    }

    if (directive === "ENDIF") {
      if (!state.conditionalStack.length) {
        throw makePreError(entry, ".endif without matching .if.");
      }
      state.conditionalStack.pop();
      return true;
    }

    return false;
  }

  function parseDefine(info, state, entry) {
    const m = /^([A-Za-z_.@][A-Za-z0-9_.@]*)(?:\s+(.*))?$/.exec(info.operand);
    if (!m) throw makePreError(entry, ".define requires a symbol name.");
    const name = m[1].toUpperCase();
    const value = (m[2] || "1").trim();
    state.defines[name] = value.length ? value : "1";
  }

  function parseInitialDefinePair(rawName, rawValue) {
    const name = String(rawName || "").trim();
    if (!name.length) return null;
    if (!/^[A-Za-z_.@][A-Za-z0-9_.@]*$/.test(name)) {
      throw new Error("Invalid define name: " + name);
    }
    const key = name.toUpperCase();
    const valueText = rawValue === undefined || rawValue === null
      ? "1"
      : String(rawValue).trim();
    return {
      key: key,
      value: valueText.length ? valueText : "1",
    };
  }

  function addInitialDefine(target, rawEntry) {
    if (rawEntry === null || rawEntry === undefined) return;
    if (typeof rawEntry === "string") {
      const text = rawEntry.trim();
      if (!text.length) return;
      const m = /^([A-Za-z_.@][A-Za-z0-9_.@]*)(?:\s*=\s*(.*))?$/.exec(text);
      if (!m) {
        throw new Error("Invalid define entry: " + text);
      }
      const pair = parseInitialDefinePair(m[1], m[2] === undefined ? "1" : m[2]);
      if (pair) target[pair.key] = pair.value;
      return;
    }

    if (typeof rawEntry === "object") {
      if (Array.isArray(rawEntry)) {
        for (let i = 0; i < rawEntry.length; i++) {
          addInitialDefine(target, rawEntry[i]);
        }
        return;
      }
      const keys = Object.keys(rawEntry);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const pair = parseInitialDefinePair(k, rawEntry[k]);
        if (pair) target[pair.key] = pair.value;
      }
      return;
    }

    throw new Error("Unsupported define source.");
  }

  function buildInitialDefines(options) {
    const defines = Object.create(null);
    const opts = options || {};
    addInitialDefine(defines, opts.defines);
    addInitialDefine(defines, opts.preprocessorDefines);
    addInitialDefine(defines, opts.initialDefines);
    return defines;
  }

  function expandDefineLine(line, state) {
    let out = String(line || "");
    for (let i = 0; i < 16; i++) {
      const next = replaceIdentifiers(out, function (ident) {
        if (ident[0] === ".") return null;
        const key = ident.toUpperCase();
        if (!Object.prototype.hasOwnProperty.call(state.defines, key)) return null;
        return state.defines[key];
      });
      if (next === out) break;
      out = next;
    }
    return out;
  }

  function parseMacroHeader(operand, entry) {
    const m = /^([A-Za-z_.@][A-Za-z0-9_.@]*)(?:\s+(.*))?$/.exec(String(operand || "").trim());
    if (!m) throw makePreError(entry, ".macro requires a macro name.");
    const name = m[1];
    const paramsText = (m[2] || "").trim();
    let params = [];
    if (paramsText.length) {
      if (paramsText.indexOf(",") >= 0) params = ns.splitArgs(paramsText).filter(Boolean);
      else params = paramsText.split(/\s+/).filter(Boolean);
    }
    const paramSet = Object.create(null);
    const outParams = [];
    for (let i = 0; i < params.length; i++) {
      const p = String(params[i]).trim();
      if (!/^[A-Za-z_.@][A-Za-z0-9_.@]*$/.test(p)) {
        throw makePreError(entry, "Invalid macro parameter: " + p);
      }
      const key = p.toUpperCase();
      if (paramSet[key]) {
        throw makePreError(entry, "Duplicate macro parameter: " + p);
      }
      paramSet[key] = true;
      outParams.push(key);
    }
    return {
      name: name,
      key: name.toUpperCase(),
      params: outParams,
    };
  }

  function extractLocalNamesFromLine(line) {
    const info = parseFirstToken(splitCodeAndComment(line).code);
    if (!info) return null;
    if (info.directive !== "LOCAL") return null;
    const parts = ns.splitArgs(info.operand).filter(Boolean);
    if (!parts.length) {
      const simple = info.operand.split(/\s+/).filter(Boolean);
      for (let i = 0; i < simple.length; i++) parts.push(simple[i]);
    }
    return parts.map(function (p) { return p.toUpperCase(); });
  }

  function tryMacroInvocation(line, state, entry, emitEntries) {
    const parts = splitCodeAndComment(line);
    let code = parts.code;
    let labelPrefix = "";

    const labelMatch = /^\s*([A-Za-z_.@][A-Za-z0-9_.@]*\s*:\s*)(.*)$/.exec(code);
    if (labelMatch) {
      labelPrefix = labelMatch[1];
      code = labelMatch[2] || "";
    }

    const info = parseFirstToken(code);
    if (!info) return false;
    if (PREPROCESSOR_DIRECTIVES.has(info.directive)) return false;
    const macro = state.macros[info.upper] || state.macros[info.directive];
    if (!macro) return false;

    if (state.macroDepth >= state.maxMacroDepth) {
      throw makePreError(entry, "Macro expansion depth limit exceeded.");
    }

    const argList = ns.splitArgs(info.operand).filter(Boolean);
    const argMap = Object.create(null);
    for (let i = 0; i < macro.params.length; i++) {
      argMap[macro.params[i]] = i < argList.length ? argList[i] : "";
    }

    const locals = Object.create(null);
    const uniqueId = ++state.macroUnique;
    for (let i = 0; i < macro.body.length; i++) {
      const names = extractLocalNamesFromLine(macro.body[i]);
      if (!names) continue;
      for (let n = 0; n < names.length; n++) {
        const key = names[n];
        if (!/^[A-Za-z_.@][A-Za-z0-9_.@]*$/.test(key)) continue;
        if (!Object.prototype.hasOwnProperty.call(locals, key)) {
          locals[key] = "__MLOCAL_" + uniqueId + "_" + key;
        }
      }
    }

    const expanded = [];
    for (let i = 0; i < macro.body.length; i++) {
      const raw = macro.body[i];
      if (extractLocalNamesFromLine(raw)) continue;
      let replaced = replaceIdentifiers(raw, function (ident) {
        const key = ident.toUpperCase();
        if (Object.prototype.hasOwnProperty.call(argMap, key)) return argMap[key];
        if (Object.prototype.hasOwnProperty.call(locals, key)) return locals[key];
        return null;
      });
      if (labelPrefix && expanded.length === 0) replaced = labelPrefix + replaced;
      expanded.push({
        file: entry.file,
        lineNo: entry.lineNo,
        text: replaced,
      });
    }

    state.macroDepth++;
    try {
      emitEntries(expanded, entry.file);
    } finally {
      state.macroDepth--;
    }
    return true;
  }

  function resolveInclude(entry, includePath, state) {
    if (typeof state.includeResolver !== "function") {
      throw makePreError(entry, "No include resolver configured for .include '" + includePath + "'.");
    }
    const result = state.includeResolver(includePath, {
      from: entry.file,
      lineNo: entry.lineNo,
      sourceName: state.sourceName,
      depth: state.includeDepth,
    });
    if (typeof result !== "string") {
      throw makePreError(entry, "Include file not found: " + includePath);
    }
    return result;
  }

  function preprocessSourceInternal(sourceText, options) {
    let initialDefines = Object.create(null);
    try {
      initialDefines = buildInitialDefines(options || {});
    } catch (err) {
      const message = err && err.message ? err.message : "Invalid initial define configuration.";
      throw new Error("Line 0: " + message);
    }

    const state = {
      includeResolver: options && typeof options.includeResolver === "function"
        ? options.includeResolver
        : null,
      sourceName: options && options.sourceName ? String(options.sourceName) : "<source>",
      includeDepth: 0,
      maxIncludeDepth: options && options.maxIncludeDepth ? (options.maxIncludeDepth | 0) : 16,
      maxMacroDepth: options && options.maxMacroDepth ? (options.maxMacroDepth | 0) : 64,
      maxOutputLines: options && options.maxOutputLines ? (options.maxOutputLines | 0) : 200000,
      defines: initialDefines,
      macros: Object.create(null),
      macroCapture: null,
      macroUnique: 0,
      macroDepth: 0,
      conditionalStack: [],
      evalGuard: null,
      output: [],
    };

    function pushOutputLine(line) {
      state.output.push(line);
      if (state.output.length > state.maxOutputLines) {
        throw new Error("Line 0: preprocessor output exceeds limit.");
      }
    }

    function processEntries(entries, currentFile, includeDepth) {
      if (includeDepth > state.maxIncludeDepth) {
        throw new Error("Line 0: include depth exceeds limit.");
      }
      const prevDepth = state.includeDepth;
      state.includeDepth = includeDepth;
      try {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const lineText = String(entry.text || "");
          const parts = splitCodeAndComment(lineText);
          const info = parseFirstToken(parts.code);

          if (state.macroCapture) {
            if (info && (info.directive === "ENDMACRO" || info.directive === "ENDM")) {
              if (state.macroCapture.enabled) {
                state.macros[state.macroCapture.key] = {
                  key: state.macroCapture.key,
                  name: state.macroCapture.name,
                  params: state.macroCapture.params,
                  body: state.macroCapture.body.slice(),
                };
              }
              state.macroCapture = null;
            } else {
              if (state.macroCapture.enabled) {
                state.macroCapture.body.push(lineText);
              }
            }
            continue;
          }

          if (info && handleConditionalDirective(info, state, entry)) {
            continue;
          }

          const isActive = currentConditionalActive(state);
          if (!isActive) {
            if (info && info.directive === "MACRO") {
              const header = parseMacroHeader(info.operand, entry);
              state.macroCapture = {
                enabled: false,
                key: header.key,
                name: header.name,
                params: header.params,
                body: [],
              };
            }
            continue;
          }

          if (info) {
            if (info.directive === "DEFINE") {
              parseDefine(info, state, entry);
              continue;
            }

            if (info.directive === "UNDEF") {
              const name = String(info.operand || "").trim().toUpperCase();
              if (name.length) delete state.defines[name];
              continue;
            }

            if (info.directive === "MACRO") {
              const header = parseMacroHeader(info.operand, entry);
              state.macroCapture = {
                enabled: true,
                key: header.key,
                name: header.name,
                params: header.params,
                body: [],
              };
              continue;
            }

            if (info.directive === "INCLUDE") {
              const includePath = extractIncludePath(info.operand, entry);
              const includeText = resolveInclude(entry, includePath, state);
              const includeLines = String(includeText).replace(/\r\n?/g, "\n").split("\n");
              const includeEntries = includeLines.map(function (line, idx) {
                return {
                  file: includePath,
                  lineNo: idx + 1,
                  text: line,
                };
              });
              processEntries(includeEntries, includePath, includeDepth + 1);
              continue;
            }

          }

          let lineForOutput = lineText;
          if (tryMacroInvocation(lineForOutput, state, entry, function (expandedEntries) {
            processEntries(expandedEntries, currentFile, includeDepth);
          })) {
            continue;
          }

          lineForOutput = expandDefineLine(lineForOutput, state);
          pushOutputLine(lineForOutput);
        }
      } finally {
        state.includeDepth = prevDepth;
      }
    }

    const baseFile = state.sourceName;
    const baseLines = String(sourceText || "").replace(/\r\n?/g, "\n").split("\n");
    const baseEntries = baseLines.map(function (line, idx) {
      return {
        file: baseFile,
        lineNo: idx + 1,
        text: line,
      };
    });

    processEntries(baseEntries, baseFile, 0);

    if (state.macroCapture) {
      throw new Error("Line 0: unterminated .macro block.");
    }
    if (state.conditionalStack.length) {
      throw new Error("Line 0: unterminated conditional block (.if/.endif mismatch).");
    }

    return {
      text: state.output.join("\n"),
      defines: state.defines,
      macros: state.macros,
      sourceName: state.sourceName,
    };
  }

  ns.preprocessSource = function preprocessSource(sourceText, options) {
    try {
      const pre = preprocessSourceInternal(sourceText, options || {});
      return {
        ok: true,
        text: pre.text,
        sourceName: pre.sourceName,
      };
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      return {
        ok: false,
        error: message,
      };
    }
  };

  ns.PREPROCESSOR_DIRECTIVES = PREPROCESSOR_DIRECTIVES;
})();
