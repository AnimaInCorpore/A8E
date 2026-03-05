(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const ns = root.A8EAssemblerModules || (root.A8EAssemblerModules = {});

  ns.assembleToXex = function assembleToXex(sourceText, ctx, options) {
    if (!ctx || !ctx.opcodes) {
      return { ok: false, error: "CPU opcode table unavailable." };
    }

    const pre = typeof ns.preprocessSource === "function"
      ? ns.preprocessSource(sourceText, options || {})
      : { ok: true, text: String(sourceText || "") };
    if (!pre.ok) {
      const message = String(pre.error || "Preprocess failed.");
      return {
        ok: false,
        error: message,
        errors: [{
          lineNo: ns.parseLineNumber(message),
          message: message,
        }],
      };
    }

    const lines = String(pre.text || "").replace(/\r\n?/g, "\n").split("\n");

    try {
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

      const symbols = plan.symbols;
      const importedSymbols = plan.importedSymbols || Object.create(null);
      const globalSymbols = plan.globalSymbols || Object.create(null);
      const statements = plan.statements;
      const segments = [];
      let currentSegment = null;
      let outPc = 0x2000;
      let firstEmitPc = null;
      let runAddr = null;
      let explicitRun = false;
      const lineAddressMap = Object.create(null);
      const addressLineMap = Object.create(null);
      const lineBytesMap = Object.create(null);

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

      for (let si = 0; si < statements.length; si++) {
        const st = statements[si];
        if (st.type === "org") {
          outPc = st.value | 0;
          currentSegment = null;
          continue;
        }

        if (st.type === "run") {
          const run = ns.evalExpression(st.expr, symbols, outPc, false, st.lineNo);
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
          const fillValue = ns.evalExpression(st.fillExpr, symbols, outPc, false, st.lineNo);
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
              const val = ns.evalExpression(arg, symbols, outPc, false, st.lineNo);
              writeByte(val.value, st.lineNo);
            }
          }
          continue;
        }

        if (st.type === "word") {
          for (let ai = 0; ai < st.args.length; ai++) {
            const val = ns.evalExpression(st.args[ai], symbols, outPc, false, st.lineNo);
            writeWord(val.value, st.lineNo);
          }
          continue;
        }

        if (st.type === "lobytes" || st.type === "hibytes") {
          for (let ai = 0; ai < st.args.length; ai++) {
            const val = ns.evalExpression(st.args[ai], symbols, outPc, false, st.lineNo);
            const word = val.value & 0xffff;
            const byte = st.type === "lobytes" ? (word & 0xff) : ((word >> 8) & 0xff);
            writeByte(byte, st.lineNo);
          }
          continue;
        }

        if (st.type === "assert") {
          let condValue = 0;
          if (typeof ns.evalConditionalExpression === "function") {
            condValue = ns.evalConditionalExpression(st.expr, {
              defines: Object.create(null),
              macros: Object.create(null),
              currentPc: outPc,
              isDefined: function (name) {
                const key = String(name || "").toUpperCase();
                return Object.prototype.hasOwnProperty.call(symbols, key) ||
                  Object.prototype.hasOwnProperty.call(importedSymbols, key);
              },
              valueResolver: function (name) {
                const key = ns.normalizeSymbolName(name);
                if (Object.prototype.hasOwnProperty.call(symbols, key))
                  {return symbols[key] | 0;}
                if (Object.prototype.hasOwnProperty.call(importedSymbols, key))
                  {return 0;}
                return null;
              },
            }, {
              lineNo: st.lineNo,
              file: options && options.sourceName ? options.sourceName : "<source>",
            });
          } else {
            const cond = ns.evalExpression(st.expr, symbols, outPc, false, st.lineNo);
            condValue = cond.value | 0;
          }

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
            const v = ns.evalExpression(st.expr, symbols, instPc, false, st.lineNo);
            writeByte(v.value, st.lineNo);
          } else if (st.mode === "ABS" || st.mode === "ABSX" || st.mode === "ABSY" || st.mode === "IND") {
            const v = ns.evalExpression(st.expr, symbols, instPc, false, st.lineNo);
            writeWord(v.value, st.lineNo);
          } else if (st.mode === "REL") {
            const target = ns.evalExpression(st.expr, symbols, instPc, false, st.lineNo);
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
      if (runAddr !== null && (explicitRun || !ns.segmentHasRunAddress(segments))) {
        segments.push({
          start: 0x02e0,
          data: [runAddr & 0xff, (runAddr >> 8) & 0xff],
        });
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
      };
    } catch (err) {
      const primaryError = ns.toAssembleError(err, null);
      let errors = [primaryError];
      try {
        const recovered = ns.buildLayoutPass(lines, null, [], true, ctx);
        if (recovered.errors.length) {
          errors = ns.dedupeErrors([primaryError].concat(recovered.errors));
        }
      } catch {
        // If recovery fails, keep the primary error only.
      }
      return {
        ok: false,
        error: ns.summarizeErrors(errors),
        errors: errors,
      };
    }
  };
})();
