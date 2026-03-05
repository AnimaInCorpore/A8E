(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const ns = root.A8EAssemblerModules || (root.A8EAssemblerModules = {});

  ns.chooseDirectMode = function chooseDirectMode(opcodes, mnemonic, candidateZp, candidateAbs, valueInfo, preferredMode) {
    const modes = opcodes[mnemonic];
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
    );
    if (!mode) {
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

      try {
        let body = raw;
        while (true) {
          const labelInfo = ns.consumeLeadingLabel(body, ctx.mnemonicKeywords, ctx.directiveKeywords);
          if (!labelInfo) break;
          const name = ns.defineSymbol(symbols, labelInfo.label, pc, lineNo);
          symbolsAdded.push(name);
          body = labelInfo.rest;
          if (!body.length) break;
        }
        if (!body.length) continue;

        const starOrg = body.match(/^\*\s*=\s*(.+)$/);
        if (starOrg) {
          const org = ns.evalExpression(starOrg[1], symbols, pc, false, lineNo);
          const orgVal = ns.requireRange("origin", org.value | 0, 0, 0xffff, lineNo);
          statements.push({ type: "org", lineNo: lineNo, value: orgVal });
          pc = orgVal;
          continue;
        }

        const assignDef = body.match(/^([A-Za-z_.@][A-Za-z0-9_.@]*)\s*=\s*(.+)$/);
        if (assignDef) {
          const value = ns.evalExpression(assignDef[2], symbols, pc, false, lineNo);
          const name = ns.defineSymbol(
            symbols,
            assignDef[1],
            ns.requireRange("constant", value.value | 0, 0, 0xffff, lineNo),
            lineNo,
          );
          symbolsAdded.push(name);
          continue;
        }

        const equDef = body.match(/^([A-Za-z_.@][A-Za-z0-9_.@]*)\s+EQU\s+(.+)$/i);
        if (equDef) {
          const value = ns.evalExpression(equDef[2], symbols, pc, false, lineNo);
          const name = ns.defineSymbol(
            symbols,
            equDef[1],
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
          const expr = args.join(",");
          const value = ns.evalExpression(expr, symbols, pc, false, lineNo);
          const name = ns.defineSymbol(
            symbols,
            nameToken,
            ns.requireRange("constant", value.value | 0, 0, 0xffff, lineNo),
            lineNo,
          );
          symbolsAdded.push(name);
          continue;
        }

        if (directive === "ORG") {
          const org = ns.evalExpression(operand, symbols, pc, false, lineNo);
          const orgVal = ns.requireRange("origin", org.value | 0, 0, 0xffff, lineNo);
          statements.push({ type: "org", lineNo: lineNo, value: orgVal });
          pc = orgVal;
          continue;
        }

        if (directive === "RUN") {
          statements.push({ type: "run", lineNo: lineNo, expr: operand });
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
          const reserve = ns.evalExpression(operand, symbols, pc, false, lineNo);
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
          const countExpr = args[0];
          const fillExpr = args.length > 1 ? args[1] : null;
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
          statements.push({ type: "byte", lineNo: lineNo, args: args });
          pc += size;
          continue;
        }

        if (directive === "WORD" || directive === "DW" || directive === "ADDR") {
          const args = ns.splitArgs(operand).filter(Boolean);
          if (!args.length) {
            throw new Error("Line " + lineNo + ": " + token + " requires at least one argument.");
          }
          statements.push({ type: "word", lineNo: lineNo, args: args });
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
            args: args,
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
          statements.push({ type: "text", lineNo: lineNo, args: args });
          pc += size;
          continue;
        }

        if (directive === "ASSERT") {
          const args = ns.splitArgs(operand).filter(Boolean);
          if (!args.length) {
            throw new Error("Line " + lineNo + ": .ASSERT requires an expression.");
          }
          const expr = args.shift();
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
            statements.push({ type: "run", lineNo: lineNo, expr: operand });
          }
          statements.push({ type: "end", lineNo: lineNo });
          break;
        }

        const mnemonic = upper.replace(/^\./, "");
        const parsed = ns.parseInstructionStatement(ctx.opcodes, mnemonic, operand, lineNo);
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
