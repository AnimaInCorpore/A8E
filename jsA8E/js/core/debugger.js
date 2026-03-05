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
      const start = typeof opts.start === "function" ? opts.start : null;
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
      let stepOverTargetAddress = -1;
      let stepOverHookPrevious = null;

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
        };
        if (breakpointHitAddress >= 0) {
          out.breakpointHit = breakpointHitAddress & 0xffff;
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
        if (reason === "breakpoint" || wasRunning) {
          emitDebugState(reason || "pause");
        }
      }

      function removeStepOverHook() {
        if (stepOverTargetAddress < 0) return;
        const addr = stepOverTargetAddress & 0xffff;
        if (typeof stepOverHookPrevious === "function") {
          CPU.setPcHook(machine.ctx, addr, stepOverHookPrevious);
        } else {
          CPU.clearPcHook(machine.ctx, addr);
        }
        stepOverTargetAddress = -1;
        stepOverHookPrevious = null;
      }

      function installStepOverHook(addr) {
        removeStepOverHook();
        const target = addr & 0xffff;
        stepOverTargetAddress = target;
        stepOverHookPrevious = machine.ctx.pcHooks[target] || null;
        CPU.setPcHook(machine.ctx, target, function (ctx) {
          removeStepOverHook();
          const key = String(target);
          breakpointHitAddress = breakpointSet[key] ? target : -1;
          ctx.breakRun = true;
          pauseInternal(breakpointSet[key] ? "breakpoint" : "stepOver");
          return true;
        });
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

      function setBreakpoints(addresses) {
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
        emitDebugState("breakpoints");
        return breakpointAddresses.length;
      }

      function resetExecutionState() {
        removeStepOverHook();
        breakpointHitAddress = -1;
        breakpointResumeAddress = -1;
      }

      function onStart() {
        if (
          breakpointHitAddress >= 0 &&
          breakpointSet[String(breakpointHitAddress)]
        )
          {breakpointResumeAddress = breakpointHitAddress & 0xffff;}
        breakpointHitAddress = -1;
        emitDebugState("start");
      }

      function runInstructionWhilePaused(reason) {
        if (isReady && !isReady()) return false;
        if (machine.running) return false;
        const ctx = machine.ctx;
        const pc = ctx.cpu.pc & 0xffff;
        if (breakpointSet[String(pc)]) breakpointResumeAddress = pc;
        breakpointHitAddress = -1;
        const targetInstruction = ((ctx.instructionCounter | 0) + 1) >>> 0;
        let safetyCounter = 0;
        while ((ctx.instructionCounter | 0) !== targetInstruction) {
          const beforeCycles = ctx.cycleCounter | 0;
          CPU.run(ctx, (ctx.cycleCounter | 0) + 1);
          if ((ctx.instructionCounter | 0) === targetInstruction) break;
          if ((ctx.cycleCounter | 0) <= beforeCycles) {
            safetyCounter++;
            if (safetyCounter > 100000) break;
          } else {
            safetyCounter = 0;
          }
        }

        if (afterStep) afterStep(reason || "step");
        else emitDebugState(reason || "step");
        return true;
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
        const returnAddress = (pc + 3) & 0xffff;
        breakpointHitAddress = -1;
        breakpointResumeAddress = -1;
        installStepOverHook(returnAddress);
        if (start) start();
        return true;
      }

      return {
        emitDebugState: emitDebugState,
        getDebugState: getDebugState,
        onDebugStateChange: onDebugStateChange,
        onPause: onPause,
        setBreakpoints: setBreakpoints,
        rebindBreakpointHooks: rebindBreakpointHooks,
        removeStepOverHook: removeStepOverHook,
        resetExecutionState: resetExecutionState,
        onStart: onStart,
        stepInstruction: stepInstruction,
        stepOver: stepOver,
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
