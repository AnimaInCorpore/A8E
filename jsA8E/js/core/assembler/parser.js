(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const ns = root.A8EAssemblerModules || (root.A8EAssemblerModules = {});

  ns.chooseDirectMode = function chooseDirectMode(opcodes, mnemonic, candidateZp, candidateAbs, valueInfo, preferredMode, forcedMode) {
    const modes = opcodes[mnemonic];
    if (!modes) return null;

    const hasZp = modes[candidateZp] !== undefined;
    const hasAbs = modes[candidateAbs] !== undefined;

    if (forcedMode === candidateAbs) {
      return hasAbs ? candidateAbs : null;
    }
    if (forcedMode === candidateZp) {
      return hasZp ? candidateZp : null;
    }

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
  };

  ns.isCheapLocalLabel = function isCheapLocalLabel(name) {
    const text = String(name || "").trim();
    return text.length > 1 && (text[0] === "@" || text[0] === "?");
  };

  ns.qualifyCheapLocalLabel = function qualifyCheapLocalLabel(name, scopeName, lineNo) {
    const raw = String(name || "").trim();
    const localBody = raw.substring(1);
    if (!/^[A-Za-z_.@?][A-Za-z0-9_.@?]*$/.test(raw) || !localBody.length) {
      throw new Error("Line " + lineNo + ": invalid local label '" + raw + "'.");
    }
    const scope = ns.normalizeSymbolName(scopeName);
    if (!scope.length) {
      throw new Error("Line " + lineNo + ": local label '" + raw + "' requires a preceding global label.");
    }
    const normalizedLocal = ns.normalizeSymbolName(localBody.replace(/\?/g, "@Q_"));
    return scope + ".@" + normalizedLocal;
  };

  ns.rewriteCheapLocalReferences = function rewriteCheapLocalReferences(text, scopeName, lineNo) {
    const src = String(text || "");
    let out = "";
    let i = 0;
    let quote = "";

    function isIdentStart(ch) {
      return /[A-Za-z_.@?]/.test(ch);
    }

    function isIdentChar(ch) {
      return /[A-Za-z0-9_.@?]/.test(ch);
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

      if (!isIdentStart(ch)) {
        out += ch;
        i++;
        continue;
      }

      const start = i;
      i++;
      while (i < src.length && isIdentChar(src[i])) i++;
      const ident = src.substring(start, i);
      if (ns.isCheapLocalLabel(ident)) {
        out += ns.qualifyCheapLocalLabel(ident, scopeName, lineNo);
      } else {
        out += ident;
      }
    }
    return out;
  };

  ns.parseAddressingOverride = function parseAddressingOverride(exprText, lineNo) {
    const raw = String(exprText || "").trim();
    if (!raw.length) {
      throw new Error("Line " + lineNo + ": missing expression.");
    }

    let expr = raw;
    let forceMode = null;

    if (expr[0] === "!") {
      expr = expr.substring(1).trim();
      forceMode = "ABS";
    } else {
      const prefixed = /^(A|ABS)\s*:\s*(.+)$/i.exec(expr);
      if (prefixed) {
        expr = String(prefixed[2] || "").trim();
        forceMode = "ABS";
      }
    }

    if (!expr.length) {
      throw new Error("Line " + lineNo + ": missing expression after addressing override.");
    }
    return {
      expr: expr,
      forceMode: forceMode,
    };
  };

  ns.parseInstructionStatement = function parseInstructionStatement(opcodes, mnemonic, operandText, lineNo) {
    const modes = opcodes[mnemonic];
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

    if (ns.BRANCH_MNEMONICS.has(mnemonic)) {
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
      const direct = ns.parseAddressingOverride(match[1], lineNo);
      return {
        expr: direct.expr,
        modeSelector: {
          zp: "ZPX",
          abs: "ABSX",
          text: ",X addressing",
          forceMode: direct.forceMode === "ABS" ? "ABSX" : null,
        },
      };
    }

    match = operand.match(/^(.+)\s*,\s*Y\s*$/i);
    if (match) {
      if (modes.ZPY === undefined && modes.ABSY === undefined) {
        throw new Error("Line " + lineNo + ": " + mnemonic + " does not support ,Y addressing.");
      }
      const direct = ns.parseAddressingOverride(match[1], lineNo);
      return {
        expr: direct.expr,
        modeSelector: {
          zp: "ZPY",
          abs: "ABSY",
          text: ",Y addressing",
          forceMode: direct.forceMode === "ABS" ? "ABSY" : null,
        },
      };
    }

    if (modes.ZP === undefined && modes.ABS === undefined) {
      throw new Error("Line " + lineNo + ": " + mnemonic + " does not support direct addressing.");
    }
    const direct = ns.parseAddressingOverride(operand, lineNo);
    return {
      expr: direct.expr,
      modeSelector: {
        zp: "ZP",
        abs: "ABS",
        text: "direct addressing",
        forceMode: direct.forceMode === "ABS" ? "ABS" : null,
      },
    };
  };

  ns.resolveInstructionMode = function resolveInstructionMode(opcodes, mnemonic, parsed, symbols, pc, lineNo, fallbackSymbols, preferredMode) {
    if (parsed.mode) return parsed.mode;

    const selector = parsed.modeSelector;
    const valueInfo = ns.evalExpression(
      parsed.expr,
      symbols,
      pc,
      true,
      lineNo,
      fallbackSymbols,
    );
    const mode = ns.chooseDirectMode(
      opcodes,
      mnemonic,
      selector.zp,
      selector.abs,
      valueInfo,
      preferredMode,
      selector.forceMode || null,
    );
    if (!mode) {
      if (selector.forceMode === selector.abs) {
        throw new Error(
          "Line " + lineNo + ": " + mnemonic + " does not support forced absolute " + selector.text + ".",
        );
      }
      throw new Error("Line " + lineNo + ": " + mnemonic + " does not support " + selector.text + ".");
    }
    return mode;
  };

  ns.isReservedLeadingToken = function isReservedLeadingToken(word, mnemonicKeywords, directiveKeywords) {
    const upper = String(word || "").toUpperCase();
    if (!upper.length) return false;
    if (mnemonicKeywords.has(upper) || directiveKeywords.has(upper)) return true;

    if (upper[0] === ".") {
      const bare = upper.substring(1);
      if (mnemonicKeywords.has(bare) || directiveKeywords.has(bare)) return true;
    }
    return false;
  };

  ns.consumeLeadingLabel = function consumeLeadingLabel(text, mnemonicKeywords, directiveKeywords) {
    const body = String(text || "").trim();
    if (!body.length) return null;

    let match = body.match(/^([A-Za-z_.@?][A-Za-z0-9_.@?]*)\s*:\s*(.*)$/);
    if (match) {
      return {
        label: match[1],
        rest: (match[2] || "").trim(),
      };
    }

    match = body.match(/^([A-Za-z_.@?][A-Za-z0-9_.@?]*)(?:\s+(.+))?$/);
    if (!match) return null;

    const label = match[1];
    if (ns.isReservedLeadingToken(label, mnemonicKeywords, directiveKeywords)) return null;

    const rest = (match[2] || "").trim();
    if (!rest.length) {
      return {
        label: label,
        rest: "",
      };
    }

    if (/^(=|EQU\b)/i.test(rest)) return null;

    return {
      label: label,
      rest: rest,
    };
  };

  ns.parseDirectiveSymbolList = function parseDirectiveSymbolList(operand, lineNo, directiveToken) {
    const raw = String(operand || "").trim();
    if (!raw.length) {
      throw new Error("Line " + lineNo + ": " + directiveToken + " requires at least one symbol.");
    }

    let parts = ns.splitArgs(raw).filter(Boolean);
    if (parts.length === 1 && raw.indexOf(",") < 0) {
      parts = raw.split(/\s+/).filter(Boolean);
    }

    const names = [];
    for (let i = 0; i < parts.length; i++) {
      const token = String(parts[i] || "").trim();
      if (!token.length) continue;
      if (!/^[A-Za-z_.@][A-Za-z0-9_.@]*$/.test(token)) {
        throw new Error("Line " + lineNo + ": invalid symbol '" + token + "' in " + directiveToken + ".");
      }
      names.push(token.toUpperCase());
    }

    if (!names.length) {
      throw new Error("Line " + lineNo + ": " + directiveToken + " requires at least one symbol.");
    }
    return names;
  };

  ns.parseSegmentName = function parseSegmentName(operand, lineNo) {
    const raw = String(operand || "").trim();
    if (!raw.length) {
      throw new Error("Line " + lineNo + ": .SEGMENT requires a segment name.");
    }
    const args = ns.splitArgs(raw).filter(Boolean);
    if (!args.length) {
      throw new Error("Line " + lineNo + ": .SEGMENT requires a segment name.");
    }
    let name = String(args[0] || "").trim();
    if ((name[0] === "'" || name[0] === "\"") && name[name.length - 1] === name[0]) {
      name = ns.decodeEscapedString(name, lineNo);
    }
    if (!name.length) {
      throw new Error("Line " + lineNo + ": .SEGMENT requires a non-empty segment name.");
    }
    return name;
  };

  ns.buildLayoutPass = function buildLayoutPass(lines, fallbackSymbols, modeHints, keepGoing, ctx) {
    const symbols = Object.create(null);
    const importedSymbols = Object.create(null);
    const globalSymbols = Object.create(null);
    const statements = [];
    const instructionModes = [];
    const errors = [];
    let pc = 0x2000;
    let cheapLocalScope = "";

    for (let li = 0; li < lines.length; li++) {
      const lineNo = li + 1;
      const raw = ns.stripComment(lines[li]).trim();
      if (!raw.length) continue;

      const symbolsAdded = [];
      const importsAdded = [];
      const globalsAdded = [];
      const statementCountBefore = statements.length;
      const modeCountBefore = instructionModes.length;
      const pcBefore = pc;
      const scopeBefore = cheapLocalScope;

      try {
        let body = raw;
        while (true) {
          const labelInfo = ns.consumeLeadingLabel(body, ctx.mnemonicKeywords, ctx.directiveKeywords);
          if (!labelInfo) break;
          let nameToken = labelInfo.label;
          if (ns.isCheapLocalLabel(nameToken)) {
            nameToken = ns.qualifyCheapLocalLabel(nameToken, cheapLocalScope, lineNo);
          } else {
            cheapLocalScope = ns.normalizeSymbolName(nameToken);
          }
          const name = ns.defineSymbol(symbols, nameToken, pc, lineNo);
          symbolsAdded.push(name);
          body = labelInfo.rest;
          if (!body.length) break;
        }
        if (!body.length) continue;

        const rewriteExpr = function (expr) {
          return ns.rewriteCheapLocalReferences(expr, cheapLocalScope, lineNo);
        };

        const starOrg = body.match(/^\*\s*=\s*(.+)$/);
        if (starOrg) {
          const org = ns.evalExpression(rewriteExpr(starOrg[1]), symbols, pc, false, lineNo);
          const orgVal = ns.requireRange("origin", org.value | 0, 0, 0xffff, lineNo);
          statements.push({ type: "org", lineNo: lineNo, value: orgVal });
          pc = orgVal;
          continue;
        }

        const assignDef = body.match(/^([A-Za-z_.@?][A-Za-z0-9_.@?]*)\s*=\s*(.+)$/);
        if (assignDef) {
          const value = ns.evalExpression(rewriteExpr(assignDef[2]), symbols, pc, false, lineNo);
          let symbolName = assignDef[1];
          if (ns.isCheapLocalLabel(symbolName)) {
            symbolName = ns.qualifyCheapLocalLabel(symbolName, cheapLocalScope, lineNo);
          }
          const name = ns.defineSymbol(
            symbols,
            symbolName,
            ns.requireRange("constant", value.value | 0, 0, 0xffff, lineNo),
            lineNo,
          );
          symbolsAdded.push(name);
          continue;
        }

        const equDef = body.match(/^([A-Za-z_.@?][A-Za-z0-9_.@?]*)\s+EQU\s+(.+)$/i);
        if (equDef) {
          const value = ns.evalExpression(rewriteExpr(equDef[2]), symbols, pc, false, lineNo);
          let symbolName = equDef[1];
          if (ns.isCheapLocalLabel(symbolName)) {
            symbolName = ns.qualifyCheapLocalLabel(symbolName, cheapLocalScope, lineNo);
          }
          const name = ns.defineSymbol(
            symbols,
            symbolName,
            ns.requireRange("constant", value.value | 0, 0, 0xffff, lineNo),
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
        const directive = upper[0] === "." ? upper.substring(1) : upper;

        if (directive === "EQU" || directive === "SET") {
          const args = ns.splitArgs(operand).filter(Boolean);
          if (args.length < 2) {
            throw new Error("Line " + lineNo + ": " + token + " requires name and expression.");
          }
          const nameToken = args.shift();
          const expr = rewriteExpr(args.join(","));
          const value = ns.evalExpression(expr, symbols, pc, false, lineNo);
          let symbolName = nameToken;
          if (ns.isCheapLocalLabel(symbolName)) {
            symbolName = ns.qualifyCheapLocalLabel(symbolName, cheapLocalScope, lineNo);
          }
          const name = ns.defineSymbol(
            symbols,
            symbolName,
            ns.requireRange("constant", value.value | 0, 0, 0xffff, lineNo),
            lineNo,
          );
          symbolsAdded.push(name);
          continue;
        }

        if (directive === "ORG") {
          const org = ns.evalExpression(rewriteExpr(operand), symbols, pc, false, lineNo);
          const orgVal = ns.requireRange("origin", org.value | 0, 0, 0xffff, lineNo);
          statements.push({ type: "org", lineNo: lineNo, value: orgVal });
          pc = orgVal;
          continue;
        }

        if (directive === "RUN") {
          statements.push({ type: "run", lineNo: lineNo, expr: rewriteExpr(operand) });
          continue;
        }

        if (directive === "SEGMENT") {
          statements.push({
            type: "segment",
            lineNo: lineNo,
            name: ns.parseSegmentName(operand, lineNo),
          });
          continue;
        }

        if (directive === "IMPORT") {
          const names = ns.parseDirectiveSymbolList(operand, lineNo, token);
          statements.push({ type: "import", lineNo: lineNo, names: names });
          for (let ni = 0; ni < names.length; ni++) {
            const key = names[ni];
            if (!Object.prototype.hasOwnProperty.call(importedSymbols, key)) {
              importedSymbols[key] = true;
              importsAdded.push(key);
            }
          }
          continue;
        }

        if (directive === "GLOBAL") {
          const names = ns.parseDirectiveSymbolList(operand, lineNo, token);
          statements.push({ type: "global", lineNo: lineNo, names: names });
          for (let ni = 0; ni < names.length; ni++) {
            const key = names[ni];
            if (!Object.prototype.hasOwnProperty.call(globalSymbols, key)) {
              globalSymbols[key] = true;
              globalsAdded.push(key);
            }
          }
          continue;
        }

        if (directive === "DS") {
          const reserve = ns.evalExpression(rewriteExpr(operand), symbols, pc, false, lineNo);
          const reserveSize = ns.requireRange("reserve size", reserve.value | 0, 0, 0x10000, lineNo);
          const nextPc = pc + reserveSize;
          if (nextPc > 0x10000) {
            throw new Error("Line " + lineNo + ": reserve exceeds address space.");
          }
          statements.push({ type: "ds", lineNo: lineNo, size: reserveSize });
          pc = nextPc;
          continue;
        }

        if (directive === "RES") {
          const args = ns.splitArgs(operand).filter(Boolean);
          if (!args.length) {
            throw new Error("Line " + lineNo + ": .RES requires count[,fill].");
          }
          if (args.length > 2) {
            throw new Error("Line " + lineNo + ": .RES accepts at most two arguments.");
          }
          const countExpr = rewriteExpr(args[0]);
          const fillExpr = args.length > 1 ? rewriteExpr(args[1]) : null;
          const countVal = ns.evalExpression(countExpr, symbols, pc, false, lineNo);
          const reserveSize = ns.requireRange("reserve size", countVal.value | 0, 0, 0x10000, lineNo);
          const nextPc = pc + reserveSize;
          if (nextPc > 0x10000) {
            throw new Error("Line " + lineNo + ": reserve exceeds address space.");
          }
          statements.push({
            type: "res",
            lineNo: lineNo,
            size: reserveSize,
            fillExpr: fillExpr,
          });
          pc = nextPc;
          continue;
        }

        if (directive === "BYTE" || directive === "DB") {
          const args = ns.splitArgs(operand).filter(Boolean);
          if (!args.length) throw new Error("Line " + lineNo + ": .BYTE requires at least one argument.");
          let size = 0;
          for (let ai = 0; ai < args.length; ai++) {
            const a = args[ai];
            if (a.length >= 2 && (a[0] === "'" || a[0] === "\"")) {
              size += ns.decodeEscapedString(a, lineNo).length;
            } else {
              size += 1;
            }
          }
          statements.push({
            type: "byte",
            lineNo: lineNo,
            args: args.map(function (a) { return rewriteExpr(a); }),
          });
          pc += size;
          continue;
        }

        if (directive === "WORD" || directive === "DW" || directive === "ADDR") {
          const args = ns.splitArgs(operand).filter(Boolean);
          if (!args.length) {
            throw new Error("Line " + lineNo + ": " + token + " requires at least one argument.");
          }
          statements.push({
            type: "word",
            lineNo: lineNo,
            args: args.map(function (a) { return rewriteExpr(a); }),
          });
          pc += args.length * 2;
          continue;
        }

        if (directive === "LOBYTES" || directive === "HIBYTES") {
          const args = ns.splitArgs(operand).filter(Boolean);
          if (!args.length) {
            throw new Error("Line " + lineNo + ": ." + directive + " requires at least one argument.");
          }
          statements.push({
            type: directive === "LOBYTES" ? "lobytes" : "hibytes",
            lineNo: lineNo,
            args: args.map(function (a) { return rewriteExpr(a); }),
          });
          pc += args.length;
          continue;
        }

        if (directive === "TEXT") {
          const args = ns.splitArgs(operand).filter(Boolean);
          if (!args.length) throw new Error("Line " + lineNo + ": .TEXT requires at least one argument.");
          let size = 0;
          for (let ai = 0; ai < args.length; ai++) {
            const a = args[ai];
            if (a.length >= 2 && (a[0] === "'" || a[0] === "\"")) {
              size += ns.decodeEscapedString(a, lineNo).length;
            } else {
              size += 1;
            }
          }
          statements.push({
            type: "text",
            lineNo: lineNo,
            args: args.map(function (a) { return rewriteExpr(a); }),
          });
          pc += size;
          continue;
        }

        if (directive === "ASSERT") {
          const args = ns.splitArgs(operand).filter(Boolean);
          if (!args.length) {
            throw new Error("Line " + lineNo + ": .ASSERT requires an expression.");
          }
          const expr = rewriteExpr(args.shift());
          const message = args.length ? args.join(",") : "";
          statements.push({
            type: "assert",
            lineNo: lineNo,
            expr: expr,
            message: message,
          });
          continue;
        }

        if (directive === "ERROR") {
          statements.push({
            type: "error",
            lineNo: lineNo,
            message: operand,
          });
          continue;
        }

        if (directive === "END") {
          if (operand.length) {
            statements.push({ type: "run", lineNo: lineNo, expr: rewriteExpr(operand) });
          }
          statements.push({ type: "end", lineNo: lineNo });
          break;
        }

        const mnemonic = upper.replace(/^\./, "");
        const parsed = ns.parseInstructionStatement(
          ctx.opcodes,
          mnemonic,
          rewriteExpr(operand),
          lineNo,
        );
        const preferredMode = modeHints[instructionModes.length] || null;
        const mode = ns.resolveInstructionMode(
          ctx.opcodes,
          mnemonic,
          parsed,
          symbols,
          pc,
          lineNo,
          fallbackSymbols,
          preferredMode,
        );
        const size = ns.MODE_SIZE[mode];
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
        cheapLocalScope = scopeBefore;
        statements.length = statementCountBefore;
        instructionModes.length = modeCountBefore;
        for (let si = 0; si < symbolsAdded.length; si++) {
          delete symbols[symbolsAdded[si]];
        }
        for (let ii = 0; ii < importsAdded.length; ii++) {
          delete importedSymbols[importsAdded[ii]];
        }
        for (let gi = 0; gi < globalsAdded.length; gi++) {
          delete globalSymbols[globalsAdded[gi]];
        }
        errors.push(ns.toAssembleError(err, lineNo));
        if (errors.length >= 64) break;
      }
    }

    return {
      symbols: symbols,
      importedSymbols: importedSymbols,
      globalSymbols: globalSymbols,
      statements: statements,
      instructionModes: instructionModes,
      errors: errors,
    };
  };
})();
