(function () {
  "use strict";

  const AutomationUtil = window.A8EAutomationUtil;
  if (!AutomationUtil) {
    throw new Error("A8EAutomationUtil is unavailable");
  }

  function createApi(deps) {
    const config = deps && typeof deps === "object" ? deps : {};
    const api = config.api && typeof config.api === "object" ? config.api : null;
    if (!api) {
      throw new Error("A8EAutomationXex requires an api dependency");
    }

    const getApp =
      typeof config.getApp === "function"
        ? config.getApp
        : function () {
            return Promise.resolve(null);
          };
    const getCurrentHostFs =
      typeof config.getCurrentHostFs === "function"
        ? config.getCurrentHostFs
        : function () {
            return null;
          };
    const emitProgress =
      typeof config.emitProgress === "function" ? config.emitProgress : function () {};
    const notifyStatus =
      typeof config.notifyStatus === "function" ? config.notifyStatus : function () {};
    const clamp16 =
      typeof config.clamp16 === "function" ? config.clamp16 : AutomationUtil.clamp16;
    const toArrayBuffer =
      typeof config.toArrayBuffer === "function"
        ? config.toArrayBuffer
        : AutomationUtil.toArrayBuffer;
    const toUint8Array =
      typeof config.toUint8Array === "function"
        ? config.toUint8Array
        : AutomationUtil.toUint8Array;
    const cloneMountedMediaState =
      typeof config.cloneMountedMediaState === "function"
        ? config.cloneMountedMediaState
        : AutomationUtil.cloneMountedMediaState;
    const createAutomationError =
      typeof config.createAutomationError === "function"
        ? config.createAutomationError
        : AutomationUtil.createAutomationError;
    const normalizeResetOptions =
      typeof config.normalizeResetOptions === "function"
        ? config.normalizeResetOptions
        : AutomationUtil.normalizeResetOptions;
    const parseCycleDuration =
      typeof config.parseCycleDuration === "function"
        ? config.parseCycleDuration
        : AutomationUtil.parseCycleDuration;
    const buildXexLaunchSummary =
      typeof config.buildXexLaunchSummary === "function"
        ? config.buildXexLaunchSummary
        : AutomationUtil.buildXexLaunchSummary;
    const buildXexRunConfiguration =
      typeof config.buildXexRunConfiguration === "function"
        ? config.buildXexRunConfiguration
        : AutomationUtil.buildXexRunConfiguration;
    const cloneTraceEntries =
      typeof config.cloneTraceEntries === "function"
        ? config.cloneTraceEntries
        : AutomationUtil.cloneTraceEntries;
    const cloneXexPreflightReport =
      typeof config.cloneXexPreflightReport === "function"
        ? config.cloneXexPreflightReport
        : AutomationUtil.cloneXexPreflightReport;
    const didReachTargetPc =
      typeof config.didReachTargetPc === "function"
        ? config.didReachTargetPc
        : AutomationUtil.didReachTargetPc;
    const describeXexBootFailure =
      typeof config.describeXexBootFailure === "function"
        ? config.describeXexBootFailure
        : AutomationUtil.describeXexBootFailure;
    const resolveXexEntryPc =
      typeof config.resolveXexEntryPc === "function"
        ? config.resolveXexEntryPc
        : AutomationUtil.resolveXexEntryPc;

    const captureFailureState =
      typeof api.captureFailureState === "function"
        ? function (options) {
            return api.captureFailureState(options);
          }
        : null;

    function getLastBuildResult() {
      if (typeof api.getLastBuildResult === "function") {
        return api.getLastBuildResult();
      }
      return Promise.resolve(null);
    }

    async function captureXexBootFailure(operation, context, failure, options) {
      if (!captureFailureState) {
        throw new Error("A8EAutomationXex captureFailureState is unavailable");
      }
      const failureInfo = Object.assign({}, failure || {});
      const launch = buildXexLaunchSummary(context);
      const snapshot = await captureFailureState(
        Object.assign({}, options || {}, {
          operation: operation,
          runConfiguration: buildXexRunConfiguration(context, options || {}),
          xexPreflight: context.xexPreflight || null,
          xexLaunch: launch,
          failure: {
            operation: operation,
            phase: failureInfo.phase || "xex_boot_failed",
            reason: failureInfo.reason || "xex_boot_failed",
            code: failureInfo.code || "xex_boot_failed",
            message: failureInfo.message || "XEX boot failed",
            targetPc:
              typeof context.entryPc === "number" ? clamp16(context.entryPc) : undefined,
            error: failureInfo.error || null,
          },
        }),
      );
      snapshot.type = "a8e.xexBootFailure";
      snapshot.ok = false;
      snapshot.phase = "xex_boot_failed";
      snapshot.reason = failureInfo.reason || "xex_boot_failed";
      snapshot.code = failureInfo.code || "xex_boot_failed";
      snapshot.xexLaunch = launch;
      snapshot.xexPreflight = cloneXexPreflightReport(context.xexPreflight);
      snapshot.bootDiagnostics = {
        currentPc:
          snapshot.bootState && typeof snapshot.bootState.currentPc === "number"
            ? snapshot.bootState.currentPc & 0xffff
            : null,
        bankState: snapshot.bankState ? Object.assign({}, snapshot.bankState) : null,
        mountedMedia: snapshot.mountedMedia
          ? cloneMountedMediaState(snapshot.mountedMedia)
          : [],
        traceTail: cloneTraceEntries(snapshot.traceTail),
        disassembly:
          snapshot.disassembly && typeof snapshot.disassembly === "object"
            ? Object.assign({}, snapshot.disassembly)
            : null,
      };
      if (typeof failureInfo.executedInstructions === "number") {
        snapshot.executedInstructions = failureInfo.executedInstructions >>> 0;
      }
      if (typeof failureInfo.executedCycles === "number") {
        snapshot.executedCycles = failureInfo.executedCycles >>> 0;
      }
      if (failureInfo.tightLoop) snapshot.tightLoop = failureInfo.tightLoop;
      emitProgress(operation, "boot_failed", {
        name: launch.name,
        slot: launch.slot,
        reason: snapshot.reason,
        code: snapshot.code,
        targetPc:
          typeof launch.entryPc === "number" ? launch.entryPc & 0xffff : undefined,
        currentPc:
          snapshot.bootState && typeof snapshot.bootState.currentPc === "number"
            ? snapshot.bootState.currentPc & 0xffff
            : undefined,
      });
      return snapshot;
    }

    async function runXex(spec) {
      const app = await getApp();
      const hostFs = getCurrentHostFs();
      const raw = spec && typeof spec === "object" ? spec : {};
      const operation = raw.operation ? String(raw.operation) : "runXex";
      const resetOptions = normalizeResetOptions(
        raw.resetOptions && typeof raw.resetOptions === "object"
          ? raw.resetOptions
          : raw,
      );
      let bytes = null;
      let name = raw.name ? String(raw.name) : "PROGRAM.XEX";
      let runAddr = null;

      if (raw.hostFile) {
        if (!hostFs || typeof hostFs.readFile !== "function") {
          throw new Error("A8EAutomation HostFS is unavailable");
        }
        const normalized =
          typeof hostFs.normalizeName === "function"
            ? hostFs.normalizeName(raw.hostFile)
            : String(raw.hostFile || "").toUpperCase();
        bytes = toUint8Array(hostFs.readFile(normalized));
        if (!bytes.length) throw new Error("HostFS file not found: " + normalized);
        name = normalized;
      } else if (raw.build && raw.build.bytes) {
        bytes = toUint8Array(raw.build.bytes);
        if (raw.build.name) name = String(raw.build.name);
        if (raw.build.runAddr !== undefined && raw.build.runAddr !== null) {
          runAddr = clamp16(raw.build.runAddr);
        }
      } else if (raw.bytes || raw.base64 || raw.buffer || raw.data) {
        bytes = toUint8Array(raw);
      } else {
        const lastBuild = await Promise.resolve(getLastBuildResult());
        if (lastBuild && lastBuild.ok && lastBuild.bytes) {
          bytes = toUint8Array(lastBuild.bytes);
          if (lastBuild.sourceName) {
            name = String(lastBuild.sourceName).replace(/\.[^.]+$/, ".XEX");
          }
          if (lastBuild.runAddr !== undefined && lastBuild.runAddr !== null) {
            runAddr = clamp16(lastBuild.runAddr);
          }
        }
      }

      if (!bytes || !bytes.length) {
        throw createAutomationError({
          operation: operation,
          phase: "xex_loader_start",
          message: "A8EAutomation.dev.runXex requires XEX bytes or a HostFS file",
        });
      }

      if (raw.saveHostFile && hostFs && typeof hostFs.writeFile === "function") {
        hostFs.writeFile(name, bytes);
      }

      const slotIndex = raw.slot !== undefined ? raw.slot | 0 : 0;
      let mountResult = null;
      let xexPreflight = null;
      emitProgress(operation, "xex_mount_started", {
        name: name,
        slot: slotIndex,
        byteLength: bytes.length | 0,
      });
      try {
        if (typeof app.loadDiskToDeviceSlotDetailed === "function") {
          mountResult = await Promise.resolve(
            app.loadDiskToDeviceSlotDetailed(toArrayBuffer(bytes), name, slotIndex, {
              portB: resetOptions && resetOptions.portB,
            }),
          );
        } else {
          app.loadDiskToDeviceSlot(toArrayBuffer(bytes), name, slotIndex);
          mountResult = {
            deviceSlot: slotIndex,
            format: "xex",
            sourceByteLength: bytes.length | 0,
            mountedByteLength: bytes.length | 0,
            xexPreflight: null,
          };
        }
        xexPreflight = cloneXexPreflightReport(
          mountResult && mountResult.xexPreflight ? mountResult.xexPreflight : null,
        );
        emitProgress(operation, "xex_preflight_passed", {
          name: name,
          slot: slotIndex,
          byteLength: bytes.length | 0,
          segmentCount:
            xexPreflight && typeof xexPreflight.segmentCount === "number"
              ? xexPreflight.segmentCount | 0
              : undefined,
          bufferAddress:
            xexPreflight && typeof xexPreflight.bufferAddress === "number"
              ? xexPreflight.bufferAddress & 0xffff
              : undefined,
          entryPc:
            xexPreflight && typeof xexPreflight.runAddress === "number"
              ? xexPreflight.runAddress & 0xffff
              : undefined,
        });
      } catch (err) {
        xexPreflight = cloneXexPreflightReport(
          err && err.details && err.details.xexPreflight
            ? err.details.xexPreflight
            : err && err.details && err.details.preflight
              ? err.details.preflight
              : null,
        );
        emitProgress(operation, "xex_preflight_failed", {
          name: name,
          slot: slotIndex,
          code: err && err.code ? String(err.code) : "xex_preflight_failed",
        });
        return captureXexBootFailure(
          operation,
          {
            name: name,
            slot: slotIndex,
            byteLength: bytes.length | 0,
            mountedByteLength: 0,
            reset: raw.reset !== false,
            started: false,
            resetOptions: resetOptions,
            runAddr: runAddr,
            entryPc: null,
            sourceUrl: raw.sourceUrl ? String(raw.sourceUrl) : null,
            format: "xex",
            xexPreflight: xexPreflight,
          },
          {
            phase: err && err.phase ? String(err.phase) : "xex_preflight_failed",
            reason: "xex_boot_failed",
            code: err && err.code ? String(err.code) : "xex_preflight_failed",
            message:
              err && err.message ? String(err.message) : "XEX preflight failed",
            error: err,
          },
          raw,
        );
      }

      const entryPc = resolveXexEntryPc(raw, runAddr, xexPreflight);
      const launchContext = {
        name: name,
        slot: slotIndex,
        byteLength: bytes.length | 0,
        mountedByteLength:
          mountResult && typeof mountResult.mountedByteLength === "number"
            ? mountResult.mountedByteLength | 0
            : bytes.length | 0,
        reset: raw.reset !== false,
        started: false,
        resetOptions: resetOptions,
        runAddr: runAddr,
        entryPc: entryPc,
        sourceUrl: raw.sourceUrl ? String(raw.sourceUrl) : null,
        format:
          mountResult && mountResult.format ? String(mountResult.format) : "xex",
        xexPreflight: xexPreflight,
      };

      if (raw.reset !== false && typeof app.reset === "function") {
        emitProgress(operation, "boot_reset_started", {
          name: name,
          slot: slotIndex,
        });
        try {
          await Promise.resolve(app.reset(resetOptions));
        } catch (err) {
          return captureXexBootFailure(
            operation,
            launchContext,
            {
              phase: "system_reset",
              reason: "xex_boot_failed",
              code: "xex_reset_failed",
              message:
                err && err.message
                  ? String(err.message)
                  : "Failed to reset emulator for XEX boot",
              error: err,
            },
            raw,
          );
        }
        emitProgress(operation, "boot_reset", {
          name: name,
          slot: slotIndex,
        });
      }

      const shouldAwaitEntry =
        raw.awaitEntry !== false &&
        raw.start !== false &&
        entryPc !== null &&
        typeof app.runUntilPc === "function";
      if (shouldAwaitEntry) {
        const runOptions = {
          maxInstructions: Math.max(
            1,
            raw.maxBootInstructions | 0 || raw.maxInstructions | 0 || 500000,
          ),
          maxCycles: Math.max(
            1,
            parseCycleDuration(raw.maxBootCycles) ||
              parseCycleDuration(raw.maxCycles) ||
              4000000,
          ),
          detectTightLoop: raw.detectTightLoop !== false,
          tightLoopWindow: Math.max(1, raw.tightLoopWindow | 0 || 32),
          tightLoopMinInstructions: Math.max(
            1,
            raw.tightLoopMinInstructions | 0 || 256,
          ),
          tightLoopUniquePcLimit: Math.max(
            1,
            raw.tightLoopUniquePcLimit | 0 || 4,
          ),
        };
        const result = await Promise.resolve(app.runUntilPc(entryPc, runOptions));
        if (didReachTargetPc(result, entryPc)) {
          emitProgress(operation, "entry_breakpoint_hit", {
            name: name,
            slot: slotIndex,
            entryPc: entryPc & 0xffff,
          });
          notifyStatus();
          return Object.assign({}, buildXexLaunchSummary(launchContext), {
            ok: true,
            phase: "entry_breakpoint_hit",
            debugState:
              result && result.debugState ? result.debugState : await api.getDebugState(),
            counters:
              result && result.counters ? result.counters : await api.getCounters(),
            traceTail:
              result && Array.isArray(result.traceTail)
                ? cloneTraceEntries(result.traceTail)
                : await api.getTraceTail(32),
            xexPreflight: xexPreflight,
          });
        }
        return captureXexBootFailure(
          operation,
          launchContext,
          describeXexBootFailure(result, entryPc),
          Object.assign({}, raw, runOptions),
        );
      }

      if (raw.start !== false && typeof app.start === "function") {
        try {
          await Promise.resolve(app.start());
          launchContext.started = true;
        } catch (err) {
          return captureXexBootFailure(
            operation,
            launchContext,
            {
              phase: "xex_boot_start",
              reason: "xex_boot_failed",
              code: "xex_start_failed",
              message:
                err && err.message
                  ? String(err.message)
                  : "Failed to start emulator after XEX setup",
              error: err,
            },
            raw,
          );
        }
      }
      notifyStatus();
      return Object.assign({}, buildXexLaunchSummary(launchContext), {
        ok: true,
        phase:
          launchContext.started && entryPc === null
            ? "boot_started"
            : "xex_preflight_passed",
        xexPreflight: xexPreflight,
      });
    }

    return {
      runXex: runXex,
      captureXexBootFailure: captureXexBootFailure,
    };
  }

  window.A8EAutomationXex = {
    createApi: createApi,
  };
})();
