(function () {
  "use strict";

  function createApi(cfg) {
    const CPU = cfg.CPU;

    function createRuntime(opts) {
      const machine = opts.machine;
      const onDebugState =
        typeof opts.onDebugState === "function" ? opts.onDebugState : null;
      const pauseInternal =
        typeof opts.pauseInternal === "function" ? opts.pauseInternal : null;
      const isReady = typeof opts.isReady === "function" ? opts.isReady : null;
      const afterStep =
        typeof opts.afterStep === "function" ? opts.afterStep : null;

      if (!machine || !machine.ctx) {
        throw new Error("A8EDebugger: missing machine context");
      }
      if (!pauseInternal) {
        throw new Error("A8EDebugger: missing pauseInternal callback");
      }

      const debugStateListeners = new Set();
      let lastDebugState = null;
      let breakpointAddresses = [];
      const breakpointSet = Object.create(null);
      const breakpointHookBackups = Object.create(null);
      let breakpointResumeAddress = -1;
      let breakpointHitAddress = -1;
      const TRACE_BUFFER_SIZE = 256;
      const traceBuffer = new Array(TRACE_BUFFER_SIZE);
      let traceWriteIndex = 0;
      let traceCount = 0;
      let lastStopReason = "";
      let lastStopAddress = -1;
      let lastFaultInfo = null;

      function clearLastStopState() {
        lastStopReason = "";
        lastStopAddress = -1;
        lastFaultInfo = null;
      }

      function pushTraceEntry(entry) {
        if (!entry || typeof entry !== "object") return;
        traceBuffer[traceWriteIndex] = {
          pc: (entry.pc | 0) & 0xffff,
          a: (entry.a | 0) & 0xff,
          x: (entry.x | 0) & 0xff,
          y: (entry.y | 0) & 0xff,
          sp: (entry.sp | 0) & 0xff,
          p: (entry.p | 0) & 0xff,
          cycles: entry.cycles >>> 0,
        };
        traceWriteIndex = (traceWriteIndex + 1) % TRACE_BUFFER_SIZE;
        if (traceCount < TRACE_BUFFER_SIZE) traceCount++;
      }

      function clearTraceBuffer() {
        traceWriteIndex = 0;
        traceCount = 0;
      }

      machine.ctx.instructionTraceHook = pushTraceEntry;
      machine.ctx.illegalOpcodeHook = function (faultState, ctx) {
        lastStopReason = "fault_illegal_opcode";
        lastStopAddress = faultState && typeof faultState.pc === "number"
          ? faultState.pc & 0xffff
          : -1;
        lastFaultInfo = {
          faultType: "illegal_opcode",
          faultMessage:
            "Unsupported opcode $" +
            (faultState.opcode & 0xff).toString(16).toUpperCase().padStart(2, "0"),
          faultAddress: lastStopAddress >= 0 ? lastStopAddress & 0xffff : undefined,
          opcode:
            faultState && typeof faultState.opcode === "number"
              ? faultState.opcode & 0xff
              : undefined,
        };
        ctx.breakRun = true;
        pauseInternal("fault_illegal_opcode");
      };

      function makeDebugState(reason) {
        const cpu = machine.ctx.cpu;
        const out = {
          reason: reason || "update",
          running: !!machine.running,
          pc: cpu.pc & 0xffff,
          a: cpu.a & 0xff,
          x: cpu.x & 0xff,
          y: cpu.y & 0xff,
          sp: cpu.sp & 0xff,
          p: CPU.getPs(machine.ctx) & 0xff,
          cycleCounter: machine.ctx.cycleCounter >>> 0,
          instructionCounter: machine.ctx.instructionCounter >>> 0,
        };
        if (breakpointHitAddress >= 0) {
          out.breakpointHit = breakpointHitAddress & 0xffff;
        }
        if (lastStopAddress >= 0) {
          out.stopAddress = lastStopAddress & 0xffff;
        }
        if (lastFaultInfo) {
          if (lastFaultInfo.faultType) out.faultType = lastFaultInfo.faultType;
          if (lastFaultInfo.faultMessage)
            {out.faultMessage = String(lastFaultInfo.faultMessage);}
          if (typeof lastFaultInfo.faultAddress === "number") {
            out.faultAddress = lastFaultInfo.faultAddress & 0xffff;
          }
          if (typeof lastFaultInfo.opcode === "number") {
            out.opcode = lastFaultInfo.opcode & 0xff;
          }
        }
        return out;
      }

      function emitDebugState(reason) {
        const snapshot = makeDebugState(reason);
        lastDebugState = snapshot;
        debugStateListeners.forEach(function (fn) {
          try {
            fn(snapshot);
          } catch {
            // ignore listener errors
          }
        });
        if (onDebugState) {
          try {
            onDebugState(snapshot);
          } catch {
            // ignore callback errors
          }
        }
      }

      function getDebugState() {
        if (!lastDebugState) lastDebugState = makeDebugState("snapshot");
        return Object.assign({}, lastDebugState);
      }

      function onDebugStateChange(fn) {
        if (typeof fn !== "function") return function () {};
        debugStateListeners.add(fn);
        return function () {
          debugStateListeners.delete(fn);
        };
      }

      function onPause(reason, wasRunning) {
        if (!lastStopReason && reason) lastStopReason = String(reason);
        if (reason === "breakpoint" && breakpointHitAddress >= 0) {
          lastStopAddress = breakpointHitAddress & 0xffff;
        }
        if (
          reason === "fault_illegal_opcode" &&
          (!lastFaultInfo || !lastFaultInfo.faultType)
        ) {
          const cpu = machine.ctx.cpu;
          lastStopAddress = cpu.pc & 0xffff;
          lastFaultInfo = {
            faultType: "illegal_opcode",
            faultMessage: "Unsupported opcode trap",
            faultAddress: lastStopAddress & 0xffff,
          };
        }
        if (reason === "breakpoint" || wasRunning) {
          emitDebugState(reason || "pause");
        }
      }

      function removeStepOverHook() {
        clearLastStopState();
      }

      function installBreakpointHook(addr) {
        const key = String(addr & 0xffff);
        if (Object.prototype.hasOwnProperty.call(breakpointHookBackups, key))
          {return;}
        const prev = machine.ctx.pcHooks[addr & 0xffff] || null;
        breakpointHookBackups[key] = prev;
        CPU.setPcHook(machine.ctx, addr & 0xffff, function (ctx) {
          if (breakpointResumeAddress === (addr & 0xffff)) {
            breakpointResumeAddress = -1;
            if (typeof prev === "function") return !!prev(ctx);
            return false;
          }
          lastStopReason = "breakpoint";
          lastStopAddress = addr & 0xffff;
          breakpointHitAddress = addr & 0xffff;
          ctx.breakRun = true;
          pauseInternal("breakpoint");
          return true;
        });
      }

      function removeBreakpointHook(addr) {
        const key = String(addr & 0xffff);
        if (!Object.prototype.hasOwnProperty.call(breakpointHookBackups, key))
          {return;}
        const prev = breakpointHookBackups[key];
        if (typeof prev === "function")
          {CPU.setPcHook(machine.ctx, addr & 0xffff, prev);}
        else CPU.clearPcHook(machine.ctx, addr & 0xffff);
        delete breakpointHookBackups[key];
      }

      function rebindBreakpointHooks() {
        const active = breakpointAddresses.slice();
        for (let i = 0; i < active.length; i++) removeBreakpointHook(active[i]);
        for (let i = 0; i < active.length; i++) installBreakpointHook(active[i]);
      }

      function suspendBreakpoints() {
        const state = {
          breakpointHitAddress: breakpointHitAddress,
          breakpointResumeAddress: breakpointResumeAddress,
        };
        for (let i = 0; i < breakpointAddresses.length; i++) {
          removeBreakpointHook(breakpointAddresses[i]);
        }
        return state;
      }

      function restoreBreakpoints(state) {
        for (let i = 0; i < breakpointAddresses.length; i++) {
          installBreakpointHook(breakpointAddresses[i]);
        }
        breakpointHitAddress =
          state && typeof state.breakpointHitAddress === "number"
            ? state.breakpointHitAddress & 0xffff
            : -1;
        breakpointResumeAddress =
          state && typeof state.breakpointResumeAddress === "number"
            ? state.breakpointResumeAddress & 0xffff
            : -1;
      }

      function applyBreakpoints(addresses, emit) {
        removeStepOverHook();
        const nextSet = Object.create(null);
        const nextList = [];
        const list = Array.isArray(addresses) ? addresses : [];
        for (let i = 0; i < list.length; i++) {
          const addr = list[i] | 0;
          if (addr < 0 || addr > 0xffff) continue;
          const key = String(addr);
          if (nextSet[key]) continue;
          nextSet[key] = true;
          nextList.push(addr);
        }
        nextList.sort(function (a, b) { return a - b; });

        for (let i = 0; i < breakpointAddresses.length; i++) {
          const addr = breakpointAddresses[i] & 0xffff;
          if (!nextSet[String(addr)]) removeBreakpointHook(addr);
        }
        for (let i = 0; i < nextList.length; i++) {
          const addr = nextList[i] & 0xffff;
          if (!breakpointSet[String(addr)]) installBreakpointHook(addr);
        }

        const oldKeys = Object.keys(breakpointSet);
        for (let i = 0; i < oldKeys.length; i++) delete breakpointSet[oldKeys[i]];
        for (let i = 0; i < nextList.length; i++) {
          breakpointSet[String(nextList[i] & 0xffff)] = true;
        }
        breakpointAddresses = nextList;

        if (
          breakpointHitAddress >= 0 &&
          !breakpointSet[String(breakpointHitAddress)]
        )
          {breakpointHitAddress = -1;}
        if (
          breakpointResumeAddress >= 0 &&
          !breakpointSet[String(breakpointResumeAddress)]
        )
          {breakpointResumeAddress = -1;}
        if (emit !== false) emitDebugState("breakpoints");
        return breakpointAddresses.length;
      }

      function setBreakpoints(addresses) {
        return applyBreakpoints(addresses, true);
      }

      function resetExecutionState() {
        removeStepOverHook();
        breakpointHitAddress = -1;
        breakpointResumeAddress = -1;
        clearLastStopState();
        clearTraceBuffer();
      }

      function onStart() {
        if (
          breakpointHitAddress >= 0 &&
          breakpointSet[String(breakpointHitAddress)]
        )
          {breakpointResumeAddress = breakpointHitAddress & 0xffff;}
        breakpointHitAddress = -1;
        clearLastStopState();
        emitDebugState("start");
      }

      function getCounters() {
        return {
          running: !!machine.running,
          cycleCounter: machine.ctx.cycleCounter >>> 0,
          instructionCounter: machine.ctx.instructionCounter >>> 0,
        };
      }

      function getTraceTail(limit) {
        let count = traceCount;
        const requested = limit | 0;
        if (requested > 0 && requested < count) count = requested;
        const out = [];
        let index =
          (traceWriteIndex - count + TRACE_BUFFER_SIZE) % TRACE_BUFFER_SIZE;
        for (let i = 0; i < count; i++) {
          const entry = traceBuffer[index];
          if (entry) out.push(Object.assign({}, entry));
          index = (index + 1) % TRACE_BUFFER_SIZE;
        }
        return out;
      }

      function exportSnapshotState() {
        return {
          breakpointAddresses: breakpointAddresses.slice(),
          breakpointHitAddress:
            breakpointHitAddress >= 0 ? breakpointHitAddress & 0xffff : null,
          breakpointResumeAddress:
            breakpointResumeAddress >= 0 ? breakpointResumeAddress & 0xffff : null,
          lastStopReason: lastStopReason ? String(lastStopReason) : "",
          lastStopAddress: lastStopAddress >= 0 ? lastStopAddress & 0xffff : null,
          lastFaultInfo: lastFaultInfo
            ? {
                faultType: lastFaultInfo.faultType
                  ? String(lastFaultInfo.faultType)
                  : "",
                faultMessage: lastFaultInfo.faultMessage
                  ? String(lastFaultInfo.faultMessage)
                  : "",
                faultAddress:
                  typeof lastFaultInfo.faultAddress === "number"
                    ? lastFaultInfo.faultAddress & 0xffff
                    : null,
                opcode:
                  typeof lastFaultInfo.opcode === "number"
                    ? lastFaultInfo.opcode & 0xff
                    : null,
              }
            : null,
          traceTail: getTraceTail(TRACE_BUFFER_SIZE),
        };
      }

      function importSnapshotState(snapshot) {
        const state = snapshot && typeof snapshot === "object" ? snapshot : {};
        clearTraceBuffer();
        const traceEntries = Array.isArray(state.traceTail) ? state.traceTail : [];
        for (let i = 0; i < traceEntries.length; i++) {
          pushTraceEntry(traceEntries[i]);
        }
        const keys = Object.keys(breakpointHookBackups);
        for (let i = 0; i < keys.length; i++) delete breakpointHookBackups[keys[i]];
        const setKeys = Object.keys(breakpointSet);
        for (let i = 0; i < setKeys.length; i++) delete breakpointSet[setKeys[i]];
        breakpointAddresses = [];
        breakpointHitAddress = -1;
        breakpointResumeAddress = -1;
        clearLastStopState();
        applyBreakpoints(state.breakpointAddresses || [], false);
        if (
          typeof state.breakpointHitAddress === "number" &&
          breakpointSet[String(state.breakpointHitAddress & 0xffff)]
        ) {
          breakpointHitAddress = state.breakpointHitAddress & 0xffff;
        }
        if (
          typeof state.breakpointResumeAddress === "number" &&
          breakpointSet[String(state.breakpointResumeAddress & 0xffff)]
        ) {
          breakpointResumeAddress = state.breakpointResumeAddress & 0xffff;
        }
        lastStopReason = state.lastStopReason ? String(state.lastStopReason) : "";
        lastStopAddress =
          typeof state.lastStopAddress === "number"
            ? state.lastStopAddress & 0xffff
            : -1;
        if (state.lastFaultInfo && typeof state.lastFaultInfo === "object") {
          lastFaultInfo = {
            faultType: state.lastFaultInfo.faultType
              ? String(state.lastFaultInfo.faultType)
              : "",
            faultMessage: state.lastFaultInfo.faultMessage
              ? String(state.lastFaultInfo.faultMessage)
              : "",
            faultAddress:
              typeof state.lastFaultInfo.faultAddress === "number"
                ? state.lastFaultInfo.faultAddress & 0xffff
                : undefined,
            opcode:
              typeof state.lastFaultInfo.opcode === "number"
                ? state.lastFaultInfo.opcode & 0xff
                : undefined,
          };
        } else {
          lastFaultInfo = null;
        }
        lastDebugState = null;
      }

      function normalizePositiveLimit(value, fallbackValue) {
        const normalized = value | 0;
        if (normalized <= 0) return fallbackValue | 0;
        return normalized;
      }

      function buildAddressSet(addresses) {
        const out = Object.create(null);
        const list = Array.isArray(addresses) ? addresses : [];
        for (let i = 0; i < list.length; i++) {
          const addr = list[i] | 0;
          if (addr < 0 || addr > 0xffff) continue;
          out[String(addr & 0xffff)] = true;
        }
        return out;
      }

      function summarizeTightLoopHistory(history) {
        const counts = Object.create(null);
        for (let i = 0; i < history.length; i++) {
          const key = String(history[i] & 0xffff);
          counts[key] = ((counts[key] | 0) + 1) | 0;
        }
        const pcs = Object.keys(counts);
        pcs.sort(function (a, b) {
          return (counts[b] | 0) - (counts[a] | 0);
        });
        return {
          windowSize: history.length | 0,
          uniquePcCount: pcs.length | 0,
          hotAddresses: pcs.slice(0, 4).map(function (key) {
            return {
              pc: (key | 0) & 0xffff,
              count: counts[key] | 0,
            };
          }),
        };
      }

      function executeSingleInstruction() {
        const ctx = machine.ctx;
        const startCycleCounter = ctx.cycleCounter >>> 0;
        const startInstructionCounter = ctx.instructionCounter >>> 0;
        const targetInstruction =
          ((ctx.instructionCounter | 0) + 1) >>> 0;
        let safetyCounter = 0;
        clearLastStopState();
        while ((ctx.instructionCounter | 0) !== targetInstruction) {
          const beforeCycles = ctx.cycleCounter | 0;
          try {
            CPU.run(ctx, (ctx.cycleCounter | 0) + 1);
          } catch (err) {
            onExecutionError(err);
            return {
              ok: false,
              reason: lastStopReason || "fault_execution_error",
              stopAddress:
                lastStopAddress >= 0 ? lastStopAddress & 0xffff : undefined,
              executedInstructions:
                ((ctx.instructionCounter >>> 0) - startInstructionCounter) >>> 0,
              executedCycles:
                ((ctx.cycleCounter >>> 0) - startCycleCounter) >>> 0,
            };
          }
          if ((ctx.instructionCounter | 0) === targetInstruction) {
            return {
              ok: true,
              executedInstructions:
                ((ctx.instructionCounter >>> 0) - startInstructionCounter) >>> 0,
              executedCycles:
                ((ctx.cycleCounter >>> 0) - startCycleCounter) >>> 0,
            };
          }
          if (lastStopReason) {
            return {
              ok: false,
              reason: lastStopReason,
              stopAddress:
                lastStopAddress >= 0 ? lastStopAddress & 0xffff : undefined,
              executedInstructions:
                ((ctx.instructionCounter >>> 0) - startInstructionCounter) >>> 0,
              executedCycles:
                ((ctx.cycleCounter >>> 0) - startCycleCounter) >>> 0,
            };
          }
          if ((ctx.cycleCounter | 0) <= beforeCycles) {
            safetyCounter++;
            if (safetyCounter > 100000) {
              return {
                ok: false,
                reason: "stalled",
                executedInstructions:
                  ((ctx.instructionCounter >>> 0) - startInstructionCounter) >>> 0,
                executedCycles:
                  ((ctx.cycleCounter >>> 0) - startCycleCounter) >>> 0,
              };
            }
          } else {
            safetyCounter = 0;
          }
        }
        return {
          ok: true,
          executedInstructions:
            ((ctx.instructionCounter >>> 0) - startInstructionCounter) >>> 0,
          executedCycles:
            ((ctx.cycleCounter >>> 0) - startCycleCounter) >>> 0,
        };
      }

      function updatePausedView(reason) {
        if (afterStep) afterStep(reason || "pause");
        else emitDebugState(reason || "pause");
      }

      function finalizePausedRun(result, uiReason) {
        const reason =
          result && result.reason ? String(result.reason) : "pause";
        const displayReason =
          result && result.reason
            ? reason === "pause" && uiReason
              ? uiReason
              : reason
            : uiReason || "pause";
        if (
          reason !== "notReady" &&
          reason !== "running" &&
          reason !== "invalidPc"
        ) {
          updatePausedView(displayReason);
        }
        const out = {
          ok: !!(result && result.ok),
          reason: reason,
          executedInstructions:
            result && result.executedInstructions
              ? result.executedInstructions >>> 0
              : 0,
          executedCycles:
            result && result.executedCycles
              ? result.executedCycles >>> 0
              : 0,
          debugState: getDebugState(),
          counters: getCounters(),
          traceTail: getTraceTail(32),
        };
        if (result && typeof result.stopAddress === "number") {
          out.stopAddress = result.stopAddress & 0xffff;
        }
        if (result && result.tightLoop) {
          out.tightLoop = {
            windowSize: result.tightLoop.windowSize | 0,
            uniquePcCount: result.tightLoop.uniquePcCount | 0,
            hotAddresses: Array.isArray(result.tightLoop.hotAddresses)
              ? result.tightLoop.hotAddresses.map(function (entry) {
                  return {
                    pc: entry.pc & 0xffff,
                    count: entry.count | 0,
                  };
                })
              : [],
          };
        }
        if (breakpointHitAddress >= 0) {
          out.breakpointHit = breakpointHitAddress & 0xffff;
        }
        return out;
      }

      function runInstructionWhilePaused(reason) {
        if (isReady && !isReady()) return false;
        if (machine.running) return false;
        const ctx = machine.ctx;
        const pc = ctx.cpu.pc & 0xffff;
        if (breakpointSet[String(pc)]) breakpointResumeAddress = pc;
        breakpointHitAddress = -1;
        const result = executeSingleInstruction();
        if (!result.ok) {
          if (result.reason === "breakpoint") {
            updatePausedView("breakpoint");
          }
          return false;
        }
        updatePausedView(reason || "step");
        return true;
      }

      function runUntilPcInternal(targetPc, opts) {
        if (isReady && !isReady()) {
          return { ok: false, reason: "notReady" };
        }
        if (machine.running) {
          return { ok: false, reason: "running" };
        }
        const hasTarget = targetPc !== null && targetPc !== undefined;
        let normalizedTarget = -1;
        if (hasTarget) {
          const parsedTarget = Number(targetPc);
          if (
            !isFinite(parsedTarget) ||
            parsedTarget < 0 ||
            parsedTarget > 0xffff
          ) {
            return { ok: false, reason: "invalidPc" };
          }
          normalizedTarget = parsedTarget & 0xffff;
        }
        const config = opts || {};
        const stopOnCurrentPc = config.stopOnCurrentPc !== false;
        const pauseAddressSet = buildAddressSet(config.pauseAddresses);
        const maxInstructions = normalizePositiveLimit(
          config.maxInstructions,
          65536,
        );
        const maxCycles = normalizePositiveLimit(config.maxCycles, 2000000);
        const detectTightLoop = !!config.detectTightLoop;
        const tightLoopWindow = normalizePositiveLimit(config.tightLoopWindow, 32);
        const tightLoopMinInstructions = normalizePositiveLimit(
          config.tightLoopMinInstructions,
          256,
        );
        const tightLoopUniquePcLimit = normalizePositiveLimit(
          config.tightLoopUniquePcLimit,
          4,
        );
        const tightLoopHistory = [];
        const ctx = machine.ctx;
        const startCycleCounter = ctx.cycleCounter >>> 0;
        const startInstructionCounter = ctx.instructionCounter >>> 0;
        const startPc = ctx.cpu.pc & 0xffff;

        if (breakpointSet[String(startPc)]) breakpointResumeAddress = startPc;
        breakpointHitAddress = -1;
        clearLastStopState();

        while (true) {
          const currentPc = ctx.cpu.pc & 0xffff;
          const executedInstructions =
            ((ctx.instructionCounter >>> 0) - startInstructionCounter) >>> 0;
          const executedCycles =
            ((ctx.cycleCounter >>> 0) - startCycleCounter) >>> 0;

          if (
            hasTarget &&
            (stopOnCurrentPc || executedInstructions > 0) &&
            currentPc === normalizedTarget
          ) {
            return {
              ok: true,
              reason: "pc",
              stopAddress: currentPc,
              executedInstructions: executedInstructions,
              executedCycles: executedCycles,
            };
          }

          if (executedInstructions > 0 && pauseAddressSet[String(currentPc)]) {
            return {
              ok: true,
              reason: "pauseAddress",
              stopAddress: currentPc,
              executedInstructions: executedInstructions,
              executedCycles: executedCycles,
            };
          }

          if (executedInstructions >= maxInstructions) {
            return {
              ok: false,
              reason: "instructionLimit",
              executedInstructions: executedInstructions,
              executedCycles: executedCycles,
            };
          }

          if (executedCycles >= maxCycles) {
            return {
              ok: false,
              reason: "cycleLimit",
              executedInstructions: executedInstructions,
              executedCycles: executedCycles,
            };
          }

          const stepResult = executeSingleInstruction();
          if (!stepResult.ok) {
            const stopReason = stepResult.reason || "stalled";
            return {
              ok: stopReason === "breakpoint",
              reason: stopReason,
              stopAddress:
                typeof stepResult.stopAddress === "number"
                  ? stepResult.stopAddress & 0xffff
                  : undefined,
              executedInstructions:
                ((ctx.instructionCounter >>> 0) - startInstructionCounter) >>> 0,
              executedCycles:
                ((ctx.cycleCounter >>> 0) - startCycleCounter) >>> 0,
            };
          }
          if (detectTightLoop) {
            tightLoopHistory.push(currentPc & 0xffff);
            if (tightLoopHistory.length > tightLoopWindow) tightLoopHistory.shift();
            if (
              tightLoopHistory.length >= tightLoopWindow &&
              (((ctx.instructionCounter >>> 0) - startInstructionCounter) >>> 0) >=
                tightLoopMinInstructions
            ) {
              const summary = summarizeTightLoopHistory(tightLoopHistory);
              if (summary.uniquePcCount <= tightLoopUniquePcLimit) {
                return {
                  ok: false,
                  reason: "tight_loop",
                  stopAddress: ctx.cpu.pc & 0xffff,
                  executedInstructions:
                    ((ctx.instructionCounter >>> 0) - startInstructionCounter) >>> 0,
                  executedCycles:
                    ((ctx.cycleCounter >>> 0) - startCycleCounter) >>> 0,
                  tightLoop: summary,
                };
              }
            }
          }
        }
      }

      function stepInstruction() {
        removeStepOverHook();
        return runInstructionWhilePaused("step");
      }

      function stepOver() {
        if (isReady && !isReady()) return false;
        if (machine.running) return false;
        const pc = machine.ctx.cpu.pc & 0xffff;
        const opcode = machine.ctx.ram[pc] & 0xff;
        if (opcode !== 0x20) return stepInstruction();
        const result = runUntilPcInternal((pc + 3) & 0xffff, {
          stopOnCurrentPc: false,
        });
        finalizePausedRun(
          result,
          result && result.reason === "breakpoint" ? "breakpoint" : "stepOver",
        );
        return !!result.ok;
      }

      function stepInstructionAsync() {
        if (isReady && !isReady()) {
          return finalizePausedRun({ ok: false, reason: "notReady" }, "pause");
        }
        if (machine.running) {
          return finalizePausedRun({ ok: false, reason: "running" }, "pause");
        }
        const ctx = machine.ctx;
        const pc = ctx.cpu.pc & 0xffff;
        if (breakpointSet[String(pc)]) breakpointResumeAddress = pc;
        breakpointHitAddress = -1;
        const result = executeSingleInstruction();
        return finalizePausedRun(
          result,
          result && result.reason === "breakpoint" ? "breakpoint" : "step",
        );
      }

      function stepOverAsync() {
        const pc = machine.ctx.cpu.pc & 0xffff;
        const opcode = machine.ctx.ram[pc] & 0xff;
        if (opcode !== 0x20) return stepInstructionAsync();
        const result = runUntilPcInternal((pc + 3) & 0xffff, {
          stopOnCurrentPc: false,
        });
        return finalizePausedRun(
          result,
          result && result.reason === "breakpoint" ? "breakpoint" : "stepOver",
        );
      }

      function runUntilPc(targetPc, opts) {
        const result = runUntilPcInternal(targetPc, opts);
        return finalizePausedRun(
          result,
          result && result.reason === "breakpoint" ? "breakpoint" : "pause",
        );
      }

      function onExecutionError(err) {
        const cpu = machine.ctx.cpu;
        lastStopReason = "fault_execution_error";
        lastStopAddress = cpu.pc & 0xffff;
        lastFaultInfo = {
          faultType: "execution_error",
          faultMessage:
            err && err.message ? String(err.message) : String(err || "Execution error"),
          faultAddress: lastStopAddress & 0xffff,
        };
      }

      return {
        emitDebugState: emitDebugState,
        getDebugState: getDebugState,
        getCounters: getCounters,
        getTraceTail: getTraceTail,
        onDebugStateChange: onDebugStateChange,
        onPause: onPause,
        setBreakpoints: setBreakpoints,
        rebindBreakpointHooks: rebindBreakpointHooks,
        suspendBreakpoints: suspendBreakpoints,
        restoreBreakpoints: restoreBreakpoints,
        removeStepOverHook: removeStepOverHook,
        resetExecutionState: resetExecutionState,
        onStart: onStart,
        stepInstruction: stepInstruction,
        stepInstructionAsync: stepInstructionAsync,
        stepOver: stepOver,
        stepOverAsync: stepOverAsync,
        runUntilPc: runUntilPc,
        onExecutionError: onExecutionError,
        exportSnapshotState: exportSnapshotState,
        importSnapshotState: importSnapshotState,
      };
    }

    return {
      createRuntime: createRuntime,
    };
  }

  window.A8EDebugger = {
    createApi: createApi,
  };
})();
