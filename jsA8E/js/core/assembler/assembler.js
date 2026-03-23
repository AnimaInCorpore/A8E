(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const ns = root.A8EAssemblerModules || (root.A8EAssemblerModules = {});

  function makePreprocessFailure(message) {
    const text = String(message || "Preprocess failed.");
    return {
      ok: false,
      error: text,
      errors: [{
        lineNo: ns.parseLineNumber(text),
        message: text,
      }],
    };
  }

  function preprocessToLines(sourceText, options) {
    const pre = typeof ns.preprocessSource === "function"
      ? ns.preprocessSource(sourceText, options || {})
      : { ok: true, text: String(sourceText || ""), sourceName: "<source>" };
    if (!pre.ok) {
      return {
        ok: false,
        failure: makePreprocessFailure(pre.error),
      };
    }
    const lines = String(pre.text || "").replace(/\r\n?/g, "\n").split("\n");
    return {
      ok: true,
      pre: pre,
      lines: lines,
    };
  }

  function buildLayoutPlan(lines, ctx) {
    const MAX_LAYOUT_PASSES = 8;
    let modeHints = [];
    let fallbackSymbols = null;
    let plan = null;

    for (let pass = 0; pass < MAX_LAYOUT_PASSES; pass++) {
      plan = ns.buildLayoutPass(lines, fallbackSymbols, modeHints, false, ctx);
      const stableModes = ns.sameModeList(modeHints, plan.instructionModes);
      const stableSymbols = ns.sameSymbols(fallbackSymbols, plan.symbols);
      if (stableModes && stableSymbols) break;
      if (pass >= MAX_LAYOUT_PASSES - 1) {
        throw new Error("Assembler mode resolution did not converge.");
      }
      modeHints = plan.instructionModes.slice();
      fallbackSymbols = plan.symbols;
    }
    return plan;
  }

  function recoverErrorList(lines, ctx, primaryError) {
    let errors = [primaryError];
    try {
      const recovered = ns.buildLayoutPass(lines, null, [], true, ctx);
      if (recovered.errors.length) {
        errors = ns.dedupeErrors([primaryError].concat(recovered.errors));
      }
    } catch {
      // Keep primary error only.
    }
    return errors;
  }

  function cloneSymbolMap(mapLike) {
    const out = Object.create(null);
    if (!mapLike || typeof mapLike !== "object") return out;
    const keys = Object.keys(mapLike);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      out[key] = mapLike[key] | 0;
    }
    return out;
  }

  function cloneStatements(statements) {
    if (!Array.isArray(statements)) return [];
    try {
      return JSON.parse(JSON.stringify(statements));
    } catch {
      return statements.slice();
    }
  }

  function parseImportValue(rawValue, lineNo) {
    if (typeof rawValue === "number") {
      return ns.requireRange("import value", rawValue | 0, 0, 0xffff, lineNo);
    }
    const text = String(rawValue || "").trim();
    if (!text.length) return 0;
    const emptySymbols = Object.create(null);
    const value = ns.evalExpression(text, emptySymbols, 0, false, lineNo, null);
    return ns.requireRange("import value", value.value | 0, 0, 0xffff, lineNo);
  }

  function setImportValue(target, rawName, rawValue, lineNo) {
    const name = String(rawName || "").trim().toUpperCase();
    if (!name.length) return;
    if (!/^[A-Z_.@][A-Z0-9_.@]*$/.test(name)) {
      throw new Error("Line " + lineNo + ": invalid import symbol '" + rawName + "'.");
    }
    target[name] = parseImportValue(rawValue, lineNo);
  }

  function appendImportValues(target, source, lineNo) {
    if (source === null || source === undefined) return;

    if (Array.isArray(source)) {
      for (let i = 0; i < source.length; i++) {
        appendImportValues(target, source[i], lineNo);
      }
      return;
    }

    if (typeof source === "string") {
      const text = source.trim();
      if (!text.length) return;
      const m = /^([A-Za-z_.@][A-Za-z0-9_.@]*)(?:\s*=\s*(.*))?$/.exec(text);
      if (!m) {
        throw new Error("Line " + lineNo + ": invalid import value entry '" + text + "'.");
      }
      setImportValue(target, m[1], m[2] === undefined ? 0 : m[2], lineNo);
      return;
    }

    if (typeof source === "object") {
      const keys = Object.keys(source);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        setImportValue(target, key, source[key], lineNo);
      }
      return;
    }

    throw new Error("Line " + lineNo + ": unsupported import value source.");
  }

  function buildImportValueMap(importedSymbols, options) {
    const map = Object.create(null);
    const defaultValue = parseImportValue(
      options && options.unresolvedImportValue !== undefined
        ? options.unresolvedImportValue
        : 0,
      0,
    );
    const keys = Object.keys(importedSymbols || {});
    for (let i = 0; i < keys.length; i++) {
      map[keys[i]] = defaultValue;
    }
    appendImportValues(map, options && options.importValues, 0);
    appendImportValues(map, options && options.externals, 0);
    appendImportValues(map, options && options.imports, 0);
    return map;
  }

  ns.assembleToXex = function assembleToXex(sourceText, ctx, options) {
    if (!ctx || !ctx.opcodes) {
      return { ok: false, error: "CPU opcode table unavailable." };
    }

    const prepared = preprocessToLines(sourceText, options || {});
    if (!prepared.ok) return prepared.failure;
    const lines = prepared.lines;

    try {
      const plan = buildLayoutPlan(lines, ctx);
      const symbols = plan.symbols;
      const importedSymbols = plan.importedSymbols || Object.create(null);
      const globalSymbols = plan.globalSymbols || Object.create(null);
      const importedValues = buildImportValueMap(importedSymbols, options || {});
      const statements = plan.statements;
      const segments = [];
      let currentSegment = null;
      let outPc = 0x2000;
      let firstEmitPc = null;
      let runAddr = null;
      let explicitRun = false;
      const suppressRunAddress = !!(options && options.suppressRunAddress);
      const lineAddressMap = Object.create(null);
      const addressLineMap = Object.create(null);
      const lineBytesMap = Object.create(null);
      const deferredAsserts = [];
      const deferAsserts = !!(options && options.deferAsserts);

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
        const raw = value | 0;
        ns.requireRange("byte", raw, -128, 255, lineNo);
        const v = raw & 0xff;
        if (outPc > 0xffff) {
          throw new Error("Line " + lineNo + ": write beyond $FFFF.");
        }
        beginSegmentIfNeeded(outPc);
        if (firstEmitPc === null) firstEmitPc = outPc;
        if (lineNo > 0) {
          const key = String(lineNo | 0);
          if (!Object.prototype.hasOwnProperty.call(lineAddressMap, key)) {
            lineAddressMap[key] = outPc & 0xffff;
          }
          if (!Object.prototype.hasOwnProperty.call(addressLineMap, outPc)) {
            addressLineMap[outPc] = lineNo | 0;
          }
        }
        currentSegment.data.push(v & 0xff);
        if (lineNo > 0) {
          const key = String(lineNo | 0);
          if (!Object.prototype.hasOwnProperty.call(lineBytesMap, key))
            {lineBytesMap[key] = [];}
          lineBytesMap[key].push(v & 0xff);
        }
        outPc++;
      }

      function writeWord(value, lineNo) {
        const raw = value | 0;
        ns.requireRange("word", raw, -32768, 0xffff, lineNo);
        const v = raw & 0xffff;
        writeByte(v & 0xff, lineNo);
        writeByte((v >> 8) & 0xff, lineNo);
      }

      function decodeDirectiveMessage(raw, lineNo, fallbackText) {
        const text = String(raw || "").trim();
        if (!text.length) return String(fallbackText || "");
        if ((text[0] === "\"" || text[0] === "'") && text[text.length - 1] === text[0]) {
          try {
            return ns.decodeEscapedString(text, lineNo);
          } catch {
            return text;
          }
        }
        return text;
      }

      function evalEmitExpression(exprText, pcValue, lineNo) {
        return ns.evalExpression(
          exprText,
          symbols,
          pcValue,
          false,
          lineNo,
          importedValues,
        );
      }

      function evalAssertCondition(exprText, lineNo) {
        if (
          typeof ns.evalConditionalExpression === "function" &&
          /\.(DEFINED|DEF|CONST|NOT|OR)\b/i.test(String(exprText || ""))
        ) {
          return ns.evalConditionalExpression(exprText, {
            defines: Object.create(null),
            macros: Object.create(null),
            currentPc: outPc,
            isDefined: function (name) {
              const key = String(name || "").toUpperCase();
              return (
                Object.prototype.hasOwnProperty.call(symbols, key) ||
                Object.prototype.hasOwnProperty.call(importedSymbols, key)
              );
            },
            valueResolver: function (name) {
              const key = ns.normalizeSymbolName(name);
              if (Object.prototype.hasOwnProperty.call(symbols, key))
                {return symbols[key] | 0;}
              if (Object.prototype.hasOwnProperty.call(importedValues, key))
                {return importedValues[key] | 0;}
              return null;
            },
          }, {
            lineNo: lineNo,
            file: options && options.sourceName ? options.sourceName : "<source>",
          }) | 0;
        }
        const cond = evalEmitExpression(exprText, outPc, lineNo);
        return cond.value | 0;
      }

      for (let si = 0; si < statements.length; si++) {
        const st = statements[si];
        if (st.type === "org") {
          outPc = st.value | 0;
          currentSegment = null;
          continue;
        }

        if (st.type === "run") {
          const run = evalEmitExpression(st.expr, outPc, st.lineNo);
          runAddr = ns.requireRange("run address", run.value | 0, 0, 0xffff, st.lineNo);
          explicitRun = true;
          continue;
        }

        if (st.type === "segment" || st.type === "import" || st.type === "global") {
          continue;
        }

        if (st.type === "ds") {
          const nextPc = outPc + (st.size | 0);
          if (nextPc > 0x10000) {
            throw new Error("Line " + st.lineNo + ": reserve exceeds address space.");
          }
          outPc = nextPc;
          if (st.size > 0) currentSegment = null;
          continue;
        }

        if (st.type === "res") {
          const reserveSize = st.size | 0;
          if (reserveSize < 0) {
            throw new Error("Line " + st.lineNo + ": reserve size out of range.");
          }
          if (!st.fillExpr) {
            const nextPc = outPc + reserveSize;
            if (nextPc > 0x10000) {
              throw new Error("Line " + st.lineNo + ": reserve exceeds address space.");
            }
            outPc = nextPc;
            if (reserveSize > 0) currentSegment = null;
            continue;
          }
          const fillValue = evalEmitExpression(st.fillExpr, outPc, st.lineNo);
          for (let ri = 0; ri < reserveSize; ri++) {
            writeByte(fillValue.value, st.lineNo);
          }
          continue;
        }

        if (st.type === "byte" || st.type === "text") {
          for (let ai = 0; ai < st.args.length; ai++) {
            const arg = st.args[ai];
            if (arg.length >= 2 && (arg[0] === "'" || arg[0] === "\"")) {
              const bytes = ns.stringToBytes(ns.decodeEscapedString(arg, st.lineNo));
              for (let bi = 0; bi < bytes.length; bi++) writeByte(bytes[bi], st.lineNo);
            } else {
              const val = evalEmitExpression(arg, outPc, st.lineNo);
              writeByte(val.value, st.lineNo);
            }
          }
          continue;
        }

        if (st.type === "word") {
          for (let ai = 0; ai < st.args.length; ai++) {
            const val = evalEmitExpression(st.args[ai], outPc, st.lineNo);
            writeWord(val.value, st.lineNo);
          }
          continue;
        }

        if (st.type === "lobytes" || st.type === "hibytes") {
          for (let ai = 0; ai < st.args.length; ai++) {
            const val = evalEmitExpression(st.args[ai], outPc, st.lineNo);
            const word = val.value & 0xffff;
            const byte = st.type === "lobytes" ? (word & 0xff) : ((word >> 8) & 0xff);
            writeByte(byte, st.lineNo);
          }
          continue;
        }

        if (st.type === "assert") {
          if (deferAsserts) {
            deferredAsserts.push({
              lineNo: st.lineNo | 0,
              expr: st.expr,
              message: st.message || "",
              pc: outPc & 0xffff,
            });
            continue;
          }
          const condValue = evalAssertCondition(st.expr, st.lineNo);
          if (!(condValue | 0)) {
            const detail = decodeDirectiveMessage(st.message, st.lineNo, ".assert failed");
            throw new Error("Line " + st.lineNo + ": " + detail + ".");
          }
          continue;
        }

        if (st.type === "error") {
          const detail = decodeDirectiveMessage(st.message, st.lineNo, ".error");
          throw new Error("Line " + st.lineNo + ": " + detail + ".");
        }

        if (st.type === "end") {
          continue;
        }

        if (st.type === "ins") {
          const modes = ctx.opcodes[st.mnemonic];
          const opcode = modes && modes[st.mode];
          if (opcode === undefined) {
            throw new Error(
              "Line " + st.lineNo + ": cannot encode " + st.mnemonic + " in mode " + st.mode + ".",
            );
          }
          const instPc = outPc;
          if (!Object.prototype.hasOwnProperty.call(lineAddressMap, st.lineNo))
            {lineAddressMap[st.lineNo] = instPc & 0xffff;}
          if (!Object.prototype.hasOwnProperty.call(addressLineMap, instPc))
            {addressLineMap[instPc] = st.lineNo;}
          writeByte(opcode, st.lineNo);

          if (st.mode === "IMM" || st.mode === "ZP" || st.mode === "ZPX" ||
              st.mode === "ZPY" || st.mode === "INDX" || st.mode === "INDY") {
            const v = evalEmitExpression(st.expr, instPc, st.lineNo);
            writeByte(v.value, st.lineNo);
          } else if (st.mode === "ABS" || st.mode === "ABSX" || st.mode === "ABSY" || st.mode === "IND") {
            const v = evalEmitExpression(st.expr, instPc, st.lineNo);
            writeWord(v.value, st.lineNo);
          } else if (st.mode === "REL") {
            const target = evalEmitExpression(st.expr, instPc, st.lineNo);
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

      if (!suppressRunAddress) {
        if (runAddr === null && firstEmitPc !== null) runAddr = firstEmitPc;
        if (runAddr !== null && (explicitRun || !ns.segmentHasRunAddress(segments))) {
          segments.push({
            start: 0x02e0,
            data: [runAddr & 0xff, (runAddr >> 8) & 0xff],
          });
        }
      }

      const xex = ns.buildXex(segments);
      return {
        ok: true,
        bytes: xex,
        runAddr: runAddr,
        symbols: symbols,
        importedSymbols: Object.keys(importedSymbols),
        globalSymbols: Object.keys(globalSymbols),
        lineAddressMap: lineAddressMap,
        addressLineMap: addressLineMap,
        lineBytesMap: lineBytesMap,
        deferredAsserts: deferredAsserts,
      };
    } catch (err) {
      const primaryError = ns.toAssembleError(err, null);
      const errors = recoverErrorList(lines, ctx, primaryError);
      return {
        ok: false,
        error: ns.summarizeErrors(errors),
        errors: errors,
      };
    }
  };

  ns.assembleToObject = function assembleToObject(sourceText, ctx, options) {
    if (!ctx || !ctx.opcodes) {
      return { ok: false, error: "CPU opcode table unavailable." };
    }

    const prepared = preprocessToLines(sourceText, options || {});
    if (!prepared.ok) return prepared.failure;
    const lines = prepared.lines;

    try {
      const plan = buildLayoutPlan(lines, ctx);
      const importedSymbols = plan.importedSymbols || Object.create(null);
      const globalSymbols = plan.globalSymbols || Object.create(null);
      const payload = {
        format: "A8E-OBJ-1",
        sourceName: options && options.sourceName ? String(options.sourceName) : "<source>",
        importedSymbols: Object.keys(importedSymbols),
        globalSymbols: Object.keys(globalSymbols),
        symbols: cloneSymbolMap(plan.symbols),
        statements: cloneStatements(plan.statements),
      };
      const bytes = typeof ns.buildA8Object === "function"
        ? ns.buildA8Object(payload)
        : new Uint8Array(0);

      return {
        ok: true,
        bytes: bytes,
        object: payload,
        symbols: plan.symbols,
        importedSymbols: payload.importedSymbols.slice(),
        globalSymbols: payload.globalSymbols.slice(),
      };
    } catch (err) {
      const primaryError = ns.toAssembleError(err, null);
      const errors = recoverErrorList(lines, ctx, primaryError);
      return {
        ok: false,
        error: ns.summarizeErrors(errors),
        errors: errors,
      };
    }
  };
})();
