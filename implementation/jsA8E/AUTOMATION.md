# Automation / Public Machine API

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `jsA8E/js/app/automation_api.js`, `jsA8E/js/app/automation/utils.js`, `jsA8E/js/app/ui.js`, `jsA8E/js/core/app_proxy.js`, `jsA8E/emulator_worker.js`, `jsA8E/js/core/atari.js`, `jsA8E/js/core/debugger.js`, `jsA8E/js/core/memory.js`, `jsA8E/js/core/input.js`, `jsA8E/js/core/hostfs.js`, `jsA8E/js/core/assembler_core.js`, `jsA8E/js/core/snapshot_codec.js`, `jsA8E/headless.js`
- Purpose: provide the stable shared control surface for jsA8E so UI code, in-browser tools, external automation, and browser-less harnesses all drive the same machine API, with headless Node bootstrap as the preferred path for non-interactive agent/CI automation.
- Status: verified on 2026-03-12 (`implemented`).
- Notes: `window.A8EAutomation` is the public browser entrypoint, while `headless.js#createHeadlessAutomation(...)` is the preferred external automation entrypoint for agents and CI. `automation_api.js` owns the exported contract, `automation/utils.js` owns shared binary/fetch/error helpers, `ui.js` only attaches the live app instance, and worker transport stays behind the same public semantics. `headless.js` formalizes the Node-side bootstrap that earlier only existed implicitly in test harnesses: it loads the same script graph into a `vm` context, creates the no-worker `atari.js` backend with a minimal 2D host, wires a synthetic `requestAnimationFrame` scheduler, exposes the same grouped automation API through `attach({ app })`, and provides software screenshot PNG encoding through a small in-process `OffscreenCanvas` shim. The grouped API is now live and the older flat aliases still point at the same operations for compatibility. **Rendering optimization**: headless automation now skips per-frame render blitting by default (`skipRendering: true`), which eliminates wasted viewport-to-imageData copies and improves turbo-mode performance by 2-3x for pure CPU/timing automation. Screenshots still work correctly by rendering on-demand when `captureScreenshot()` is called. Set `skipRendering: false` to force continuous rendering if needed. The current surface covers lifecycle control, ROM/disk mounting, URL-native media loading, keyboard/joystick/console input, paused-mode debug execution, trace/counter/bank inspection, assembler and HostFS workflows, screenshot/artifact capture, `attached`/progress/build/pause/fault events, and versioned full-machine snapshot save/load. The public consumer-facing reference now lives in `jsA8E/AUTOMATION.md`; this file stays focused on implementation boundaries and current behavior.
- Issues: there is still no dedicated in-browser automation console or standalone diagnostics page built on top of the public API; headless HostFS persistence still defaults to in-memory unless a host provides an `indexedDB`-compatible global.
- Todo: keep this file and both READMEs aligned with exported methods/result shapes when automation changes; add a small browser-side automation harness if direct interactive tooling becomes necessary; consider a filesystem-backed HostFS adapter for headless Node use if durable H: state becomes necessary.

## Public Surface

`window.A8EAutomation` currently exports:

- Root: `whenReady()`, `attach(...)`, `detach()`, `getApp()`, `apiVersion`, `artifactSchemaVersion`, `getCapabilities()`, `getSystemState()`, `sym(name, fallback?)`, `peek(address)`, `poke(address, value)`, `buildAndRun(source, options)`, and `events.{subscribe,unsubscribe}`.
- `system.*`: `start()`, `pause()`, `reset(options)`, `boot(options)`, `saveSnapshot(options)`, `loadSnapshot(data, options)`, `reload(options)`, `dispose()`, `waitForPause(options)`, `waitForTime(msOrOptions)`, `waitForFrames(countOrOptions)`, `waitForCycles(countOrOptions)`, `getSystemState(options)`.
- `media.*`: `loadRom(...)`, `loadOsRom(...)`, `loadBasicRom(...)`, `loadRomFromUrl(...)`, `loadOsRomFromUrl(...)`, `loadBasicRomFromUrl(...)`, `mountDisk(data, nameOrOpts, slot)` (plus object-form options), `mountDiskFromUrl(...)`, compatibility `loadDisk(...)`, `unmountDisk(slot)`, `getMountedMedia()`.
- `input.*`: `focusDisplay()`, `keyDown(eventLike)`, `keyUp(eventLike)`, `tapKey(eventLike, options)`, `typeText(text, options)`, `setJoystick(state)`, `getConsoleKeyState()`, `setConsoleKeys(state)`, `pressConsoleKey(key, options)`, `releaseAllInputs()`.
- `debug.*`: `setBreakpoints(addresses)`, `stepInstruction()`, `stepOver()`, `runUntilPc(targetPc, options)`, `runUntilPcOrSnapshot(targetPc, options)`, `waitForPc(targetPc, options)`, `waitForBreakpoint(options)`, `getDebugState()`, `getCounters()`, `getBankState()`, `getConsoleKeyState()`, `getTraceTail(limit)`, `readMemory(address)`, `readRange(start, length, options)`, `readWord(address, options)`, `readWordSigned(address, options)`, `writeMemory(address, value)`, `writeRange(start, data)`, `writeWord(address, value, options)`, `waitForMemory(addressOrOptions, value?, options?)`, `getSourceContext(options)`, `disassemble(options)`, `sym(name, fallback?)`, `peek(address)`, `poke(address, value)`.
- `dev.*`: `listHostFiles()`, `readHostFile(name, options)`, `writeHostFile(name, data, options)`, `deleteHostFile(name)`, `renameHostFile(oldName, newName)`, `lockHostFile(name)`, `unlockHostFile(name)`, `getHostFileStatus(name)`, `waitForHostFsFile(name, options)`, `assembleSource(spec)`, `assembleHostFile(name, options)`, `getLastBuildResult(options)`, `runXexFromUrl(url, options)`, `runXex(spec)`, `buildAndRun(source, options)`, `sym(name, fallback?)`.
- `artifacts.*`: `captureScreenshot(options)`, `collectArtifacts(options)`, `captureFailureState(options)`.
- `events.*`: `subscribe(handler)` for all events or `subscribe(type, handler)` for filtered events, plus `unsubscribe(token)`.
- Flat aliases: root-level compatibility aliases still exist for grouped methods (for example `start`, `pause`, `reset`, `waitForPc`, `readWord`, `captureScreenshot`, and `releaseAllKeys`).

## Behavior Notes

- `whenReady()` resolves once `ui.js` has attached a live emulator app to the facade.
- `getCapabilities()` reports both `apiVersion` and `artifactSchemaVersion`, plus feature flags such as `worker`, `hostfs`, `assembler`, `disk`, `romLoad`, `urlRomLoad`, `urlDiskLoad`, `urlXexLoad`, `trace`, `breakpoints`, `stepping`, `runUntilPc`, `sourceContext`, `disassembly`, `joystick`, `consoleKeys`, `consoleKeyState`, `screenshot`, `artifacts`, `failureSnapshots`, `progressEvents`, `cacheControl`, `waitPrimitives`, `snapshots`, `groupedApi`, `events`, `faultReporting`, `resetPortBOverride`, `memoryWrite`, and `memoryWait`.
- `getSystemState({ timeoutMs })` reads mounted media, counters, debug state, console keys, and bank state with per-part timeouts. If one read stalls, the call returns partial state plus `error.code = "system_state_partial"` and structured per-part failure details instead of hanging.
- Worker-backed `start()`, `pause()`, and `reset()` resolve only after the worker acknowledges the requested transition. The no-worker fallback remains available through `?a8e_worker=0` or `window.A8E_BOOT_OPTIONS.worker = false`.
- URL-based loaders share the same fetch/cache controls through the common utility layer: `cacheBust`, `cacheBustParam`, `cache`, `credentials`, `mode`, and custom `fetch` / `requestInit`.
- `system.saveSnapshot()` and `system.loadSnapshot()` are backed by the versioned binary snapshot codec. Both paths pause first when needed, preserve `savedRunning` metadata, and return live debug-state context after the operation. Snapshot saves now default to advancing a paused machine to the next frame boundary before serializing, which avoids mid-raster save points that sometimes resumed unreliably; callers can still request cycle-exact paused saves with `timing: "exact"`.
- Artifact helpers return schema-versioned JSON bundles (`artifactSchemaVersion: "2"`). Timeout-oriented wait flows and XEX bring-up failures reuse those bundles so failure reporting includes debug state, counters, trace, bank/media state, console keys, optional memory ranges, optional disassembly/source context, and optional screenshots.
- `dev.runXex(...)` now emits progress checkpoints such as `xex_mount_started`, runs the structured XEX preflight, honors reset-time `portB` overrides, and turns preflight/boot failures into explicit `xex_boot_failed` artifacts rather than generic wait timeouts.
- HostFS automation is broader than the initial read/write pass: callers can now rename, lock, unlock, query status, and wait for files in addition to listing, reading, writing, deleting, assembling, and launching XEX output.
- Debug memory automation now supports both read and write primitives. `writeMemory`/`writeRange`/`writeWord` update the live machine RAM view directly (with range wrap at `$FFFF`), `waitForMemory(address, value, options?)` is available alongside the object form, and masked byte/word polling still returns timeout-based failure artifacts.
- `sym(name, fallback?)` is synchronous and reads directly from the in-memory last-build record; `peek`/`poke` are root and debug aliases for one-byte memory access, and `buildAndRun(source, options)` assembles then launches a XEX in one call.

## Event Model

Current event traffic uses the same facade in main-thread and worker mode.

- `attached`: emitted when `ui.js` binds a live app instance to the facade.
- `progress`: fetch, mount, boot, and wait checkpoints.
- `pause`: emitted once per distinct paused stop state with stable `reason` values such as `pause`, `breakpoint`, `step`, `reset`, `fault_illegal_opcode`, or `fault_execution_error`.
- `fault`: mirrored fault-only pause events.
- `debugState`: live debug snapshot updates.
- `build`: assembler/build result updates.
- `hostfs`: HostFS directory change notifications.

## Current Limitations

- Automation exposes one joystick-state helper (`setJoystick(state)`) rather than a per-port joystick routing API.
- The public API is documented and tested, but there is still no bundled browser UI dedicated to running arbitrary automation scripts against the facade.

## Headless Performance: Rendering Skip

In headless automation with `createHeadlessAutomation()`, rendering is now **skipped by default** to maximize CPU emulation speed:

- `skipRendering: true` (default): Per-frame render blitting is skipped. The viewport buffer is not copied to imageData on every frame, eliminating ~2-3x overhead. Screenshots still capture correctly via on-demand rendering.
- `skipRendering: false`: Forces per-frame rendering if needed (e.g., for continuous visual monitoring in non-performance-critical tests).

Combined with `turbo: true` (4x emulation multiplier) and `frameDelayMs: 0`, this enables running 1 minute of emulated time in ~10-15 seconds:

```javascript
const runtime = await createHeadlessAutomation({
  roms: { os: "ATARIXL.ROM", basic: "ATARIBAS.ROM" },
  turbo: true,
  skipRendering: true,    // default: eliminates render blit overhead
  frameDelayMs: 0,         // remove animation frame delay
});
```

Note: Rendering skip only affects per-frame performance. Screenshot requests trigger on-demand rendering, so `captureScreenshot()` works correctly regardless of the `skipRendering` setting.
