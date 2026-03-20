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
      throw new Error("A8EAutomationArtifacts requires an api dependency");
    }
    const apiVersion =
      typeof config.apiVersion === "string" && config.apiVersion.length
        ? String(config.apiVersion)
        : "1";
    const artifactSchemaVersion =
      typeof config.artifactSchemaVersion === "number"
        ? config.artifactSchemaVersion | 0
        : 2;

    const getApp =
      typeof config.getApp === "function"
        ? config.getApp
        : function () {
            return Promise.resolve(null);
          };
    const emitProgress =
      typeof config.emitProgress === "function" ? config.emitProgress : function () {};
    const clamp16 =
      typeof config.clamp16 === "function" ? config.clamp16 : AutomationUtil.clamp16;
    const cloneDebugState =
      typeof config.cloneDebugState === "function"
        ? config.cloneDebugState
        : AutomationUtil.cloneDebugState;
    const cloneMountedMediaState =
      typeof config.cloneMountedMediaState === "function"
        ? config.cloneMountedMediaState
        : AutomationUtil.cloneMountedMediaState;
    const cloneTraceEntries =
      typeof config.cloneTraceEntries === "function"
        ? config.cloneTraceEntries
        : AutomationUtil.cloneTraceEntries;
    const cloneXexPreflightReport =
      typeof config.cloneXexPreflightReport === "function"
        ? config.cloneXexPreflightReport
        : AutomationUtil.cloneXexPreflightReport;
    const normalizeRunConfiguration =
      typeof config.normalizeRunConfiguration === "function"
        ? config.normalizeRunConfiguration
        : AutomationUtil.normalizeRunConfiguration;
    const buildFailureDescriptor =
      typeof config.buildFailureDescriptor === "function"
        ? config.buildFailureDescriptor
        : AutomationUtil.buildFailureDescriptor;
    const buildXexLaunchSummary =
      typeof config.buildXexLaunchSummary === "function"
        ? config.buildXexLaunchSummary
        : AutomationUtil.buildXexLaunchSummary;
    const buildXexRunConfiguration =
      typeof config.buildXexRunConfiguration === "function"
        ? config.buildXexRunConfiguration
        : AutomationUtil.buildXexRunConfiguration;
    const didReachTargetPc =
      typeof config.didReachTargetPc === "function"
        ? config.didReachTargetPc
        : AutomationUtil.didReachTargetPc;
    const serializeAutomationError =
      typeof config.serializeAutomationError === "function"
        ? config.serializeAutomationError
        : AutomationUtil.serializeAutomationError;

    const getDebugState =
      typeof api.getDebugState === "function"
        ? function () {
            return api.getDebugState();
          }
        : function () {
            return Promise.resolve(null);
          };
    const getCounters =
      typeof api.getCounters === "function"
        ? function () {
            return api.getCounters();
          }
        : function () {
            return Promise.resolve(null);
          };
    const getBankState =
      typeof api.getBankState === "function"
        ? function () {
            return api.getBankState();
          }
        : function () {
            return Promise.resolve(null);
          };
    const getTraceTail =
      typeof api.getTraceTail === "function"
        ? function (limit) {
            return api.getTraceTail(limit);
          }
        : function () {
            return Promise.resolve([]);
          };
    const getConsoleKeyState =
      typeof api.getConsoleKeyState === "function"
        ? function () {
            return api.getConsoleKeyState();
          }
        : function () {
            return Promise.resolve(null);
          };
    const captureScreenshot =
      typeof api.captureScreenshot === "function"
        ? function (options) {
            return api.captureScreenshot(options);
          }
        : function () {
            return Promise.resolve(null);
          };
    const getCapabilities =
      typeof api.getCapabilities === "function"
        ? function () {
            return api.getCapabilities();
          }
        : function () {
            return Promise.resolve(null);
          };
    const getSourceContext =
      typeof api.getSourceContext === "function"
        ? function (options) {
            return api.getSourceContext(options);
          }
        : function () {
            return Promise.resolve(null);
          };
    const disassemble =
      typeof api.disassemble === "function"
        ? function (options) {
            return api.disassemble(options);
          }
        : function () {
            return Promise.resolve(null);
          };
    const getMountedMedia =
      typeof api.getMountedMedia === "function"
        ? function () {
            return api.getMountedMedia();
          }
        : function () {
            return Promise.resolve([]);
          };

    function buildBootStateSnapshot(
      app,
      debugState,
      bankState,
      mountedMedia,
      consoleKeys,
      renderer,
    ) {
      return {
        ready: app && typeof app.isReady === "function" ? !!app.isReady() : false,
        running: !!(debugState && debugState.running),
        rendererBackend: renderer ? String(renderer) : "unknown",
        currentPc:
          debugState && typeof debugState.pc === "number"
            ? clamp16(debugState.pc)
            : null,
        stopReason:
          debugState && debugState.reason ? String(debugState.reason) : null,
        bankState: bankState ? Object.assign({}, bankState) : null,
        mountedMedia: cloneMountedMediaState(mountedMedia),
        consoleKeys: consoleKeys ? Object.assign({}, consoleKeys) : null,
      };
    }

    async function buildArtifactBundle(options) {
      const opts = options || {};
      const traceTailLimit = Math.max(1, opts.traceTailLimit | 0 || 32);
      const artifactRequest = {
        ranges: Array.isArray(opts.ranges)
          ? opts.ranges
          : Array.isArray(opts.memoryRanges)
            ? opts.memoryRanges
            : [],
        labels: Array.isArray(opts.labels) ? opts.labels : [],
        traceTailLimit: traceTailLimit,
      };
      const app = await getApp();
      let base = null;
      if (app && typeof app.collectArtifacts === "function") {
        base = await Promise.resolve(app.collectArtifacts(artifactRequest));
      }
      const debugState =
        base && base.debugState ? cloneDebugState(base.debugState) : await getDebugState();
      const pc =
        opts.pc !== undefined && opts.pc !== null
          ? clamp16(opts.pc)
          : debugState
            ? clamp16(debugState.pc)
            : 0;
      let disassemblyResult = null;
      if (opts.disassembly !== false && debugState) {
        try {
          disassemblyResult = await disassemble({
            pc: pc,
            beforeInstructions: Math.max(0, opts.beforeInstructions | 0 || 8),
            afterInstructions: Math.max(0, opts.afterInstructions | 0 || 8),
          });
        } catch {
          disassemblyResult = null;
        }
      }
      let sourceContext = null;
      if (opts.sourceContext !== false) {
        try {
          sourceContext = await getSourceContext({
            pc: pc,
            beforeLines: Math.max(0, opts.beforeLines | 0 || 8),
            afterLines: Math.max(0, opts.afterLines | 0 || 8),
          });
        } catch {
          sourceContext = null;
        }
      }
      let screenshot = null;
      if (opts.screenshot) {
        try {
          screenshot = await captureScreenshot({
            encoding: opts.screenshotEncoding === "bytes" ? "bytes" : "base64",
          });
        } catch (err) {
          screenshot = {
            error: serializeAutomationError(err),
          };
        }
      }
      const counters =
        base && base.counters !== undefined ? base.counters : await getCounters();
      const bankState =
        base && base.bankState !== undefined ? base.bankState : await getBankState();
      const traceTail =
        base && Array.isArray(base.traceTail)
          ? cloneTraceEntries(base.traceTail)
          : cloneTraceEntries(await getTraceTail(traceTailLimit));
      const mountedMedia = await getMountedMedia();
      const consoleKeys = await getConsoleKeyState();
      const rendererBackend =
        base && base.rendererBackend
          ? String(base.rendererBackend)
          : app && typeof app.getRendererBackend === "function"
            ? String(app.getRendererBackend() || "unknown")
            : "unknown";
      return {
        type: "a8e.artifactBundle",
        schemaVersion: artifactSchemaVersion,
        artifactSchemaVersion: artifactSchemaVersion,
        apiVersion: apiVersion,
        capturedAt: new Date().toISOString(),
        capturedAtMs: Date.now(),
        operation: opts.operation ? String(opts.operation) : null,
        rendererBackend: rendererBackend,
        capabilities: await getCapabilities(),
        runConfiguration: normalizeRunConfiguration(opts.runConfiguration),
        debugState: debugState,
        counters: counters,
        bankState: bankState,
        breakpointHit:
          base && base.breakpointHit !== undefined
            ? base.breakpointHit
            : debugState && typeof debugState.breakpointHit === "number"
              ? debugState.breakpointHit & 0xffff
              : null,
        traceTail: traceTail,
        disassembly: disassemblyResult,
        sourceContext: sourceContext,
        mountedMedia: mountedMedia,
        consoleKeys: consoleKeys,
        bootState: buildBootStateSnapshot(
          app,
          debugState,
          bankState,
          mountedMedia,
          consoleKeys,
          rendererBackend,
        ),
        xexPreflight: cloneXexPreflightReport(opts.xexPreflight),
        xexLaunch:
          opts.xexLaunch && typeof opts.xexLaunch === "object"
            ? Object.assign({}, opts.xexLaunch)
            : null,
        memoryRanges:
          base && Array.isArray(base.memoryRanges)
            ? base.memoryRanges.map(function (entry) {
                return entry && typeof entry === "object"
                  ? Object.assign({}, entry)
                  : entry;
              })
            : [],
        scenarioMarkers:
          opts.scenarioMarkers && typeof opts.scenarioMarkers === "object"
            ? Object.assign({}, opts.scenarioMarkers)
            : opts.markers && typeof opts.markers === "object"
              ? Object.assign({}, opts.markers)
              : null,
        screenshot: screenshot,
      };
    }

    async function captureFailureState(options) {
      const bundle = await buildArtifactBundle(options || {});
      const failure = buildFailureDescriptor(options || {}, bundle);
      bundle.type = "a8e.failureArtifact";
      bundle.phase = failure.phase;
      bundle.failure = failure;
      return bundle;
    }

    async function buildWaitFailureSnapshot(operation, options, failure) {
      const opts = options || {};
      const rawFailure = failure && typeof failure === "object" ? failure : {};
      const runConfiguration = Object.assign(
        {},
        normalizeRunConfiguration(opts.runConfiguration) || {},
      );
      if (rawFailure.counterKey) {
        runConfiguration.counterKey = rawFailure.counterKey;
        runConfiguration.targetCount = rawFailure.targetCount;
      }
      if (rawFailure.targetPc !== undefined && rawFailure.targetPc !== null) {
        runConfiguration.targetPc = clamp16(rawFailure.targetPc);
      }
      const snapshot = await captureFailureState(
        Object.assign({}, opts, {
          operation: operation,
          runConfiguration: runConfiguration,
          failure: Object.assign({}, rawFailure, {
            operation: operation,
          }),
        }),
      );
      snapshot.ok = false;
      snapshot.reason =
        rawFailure.reason !== undefined && rawFailure.reason !== null
          ? String(rawFailure.reason)
          : "timeout";
      if (typeof rawFailure.executedInstructions === "number") {
        snapshot.executedInstructions = rawFailure.executedInstructions >>> 0;
      }
      if (typeof rawFailure.executedCycles === "number") {
        snapshot.executedCycles = rawFailure.executedCycles >>> 0;
      }
      if (typeof rawFailure.targetPc === "number") {
        snapshot.targetPc = clamp16(rawFailure.targetPc);
      }
      if (typeof rawFailure.currentDelta === "number") {
        snapshot.currentDelta = rawFailure.currentDelta >>> 0;
      }
      emitProgress(operation, snapshot.phase || "wait_timeout", {
        reason: snapshot.reason,
        targetPc:
          typeof snapshot.targetPc === "number" ? snapshot.targetPc & 0xffff : undefined,
        timeoutMs:
          snapshot.failure && typeof snapshot.failure.timeoutMs === "number"
            ? snapshot.failure.timeoutMs | 0
            : undefined,
      });
      return snapshot;
    }

    async function finalizeWaitForPcResult(targetPc, result, options, operation) {
      const normalizedTarget = clamp16(targetPc);
      if (didReachTargetPc(result, normalizedTarget)) {
        emitProgress(operation, "entry_pc_reached", {
          targetPc: normalizedTarget,
        });
        return result;
      }
      return buildWaitFailureSnapshot(operation, options || {}, {
        reason:
          result && result.reason !== undefined && result.reason !== null
            ? String(result.reason)
            : "timeout",
        message:
          result && result.reason === "breakpoint"
            ? "Execution stopped at a different breakpoint before reaching target PC"
            : "Execution did not reach the requested PC",
        targetPc: normalizedTarget,
        executedInstructions:
          result && typeof result.executedInstructions === "number"
            ? result.executedInstructions >>> 0
            : undefined,
        executedCycles:
          result && typeof result.executedCycles === "number"
            ? result.executedCycles >>> 0
            : undefined,
      });
    }

    async function captureXexBootFailure(operation, context, failure, options) {
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
        mountedMedia: cloneMountedMediaState(snapshot.mountedMedia),
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

    return {
      buildBootStateSnapshot: buildBootStateSnapshot,
      buildArtifactBundle: buildArtifactBundle,
      captureFailureState: captureFailureState,
      buildWaitFailureSnapshot: buildWaitFailureSnapshot,
      finalizeWaitForPcResult: finalizeWaitForPcResult,
      captureXexBootFailure: captureXexBootFailure,
    };
  }

  window.A8EAutomationArtifacts = {
    createApi: createApi,
  };
})();
