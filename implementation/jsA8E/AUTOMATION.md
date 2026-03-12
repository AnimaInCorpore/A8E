# Automation / Public Machine API

- Files: `jsA8E/js/app/automation_api.js`, `jsA8E/js/app/automation/utils.js`, `jsA8E/js/app/ui.js`, `jsA8E/js/core/app_proxy.js`, `jsA8E/emulator_worker.js`, `jsA8E/js/core/atari.js`, `jsA8E/js/core/debugger.js`, `jsA8E/js/core/memory.js`, `jsA8E/js/core/input.js`, `jsA8E/js/core/hostfs.js`, `jsA8E/js/core/assembler_core.js`, `jsA8E/js/core/snapshot_codec.js`, `jsA8E/headless.js`
- Purpose: provide the stable shared control surface for jsA8E so UI code, in-browser tools, external automation, and browser-less harnesses all drive the same machine API, with headless Node bootstrap as the preferred path for non-interactive agent/CI automation.
- Status: verified on 2026-03-12 (`implemented`).
- Notes: `window.A8EAutomation` is the public browser entrypoint, while `headless.js#createHeadlessAutomation(...)` is the preferred external automation entrypoint for agents and CI. `automation_api.js` owns the exported contract, `automation/utils.js` owns shared binary/fetch/error helpers, `ui.js` only attaches the live app instance, and worker transport stays behind the same public semantics. `headless.js` formalizes the Node-side bootstrap that earlier only existed implicitly in test harnesses: it loads the same script graph into a `vm` context, creates the no-worker `atari.js` backend with a minimal 2D host, wires a synthetic `requestAnimationFrame` scheduler, exposes the same grouped automation API through `attach({ app })`, and provides software screenshot PNG encoding through a small in-process `OffscreenCanvas` shim. The grouped API is now live and the older flat aliases still point at the same operations for compatibility. The current surface covers lifecycle control, ROM/disk mounting, URL-native media loading, keyboard/joystick/console input, paused-mode debug execution, trace/counter/bank inspection, assembler and HostFS workflows, screenshot/artifact capture, `attached`/progress/build/pause/fault events, and versioned full-machine snapshot save/load. The public consumer-facing reference now lives in `jsA8E/AUTOMATION.md`; this file stays focused on implementation boundaries and current behavior.
- Issues: there is still no dedicated in-browser automation console or standalone diagnostics page built on top of the public API; headless HostFS persistence still defaults to in-memory unless a host provides an `indexedDB`-compatible global.
- Todo: keep this file and both READMEs aligned with exported methods/result shapes when automation changes; add a small browser-side automation harness if direct interactive tooling becomes necessary; consider a filesystem-backed HostFS adapter for headless Node use if durable H: state becomes necessary.

## Public Surface

`window.A8EAutomation` currently exports:

- Root: `whenReady()`, `attach(...)`, `detach()`, `getApp()`, `apiVersion`, `artifactSchemaVersion`, `getCapabilities()`, `getSystemState()`.
- `system.*`: `start()`, `pause()`, `reset(options)`, `boot(options)`, `saveSnapshot(options)`, `loadSnapshot(data, options)`, `reload(options)`, `dispose()`, `waitForPause(options)`, `waitForTime(options)`, `waitForFrames(options)`, `waitForCycles(options)`, `getSystemState(options)`.
- `media.*`: `loadRom(...)`, `loadOsRom(...)`, `loadBasicRom(...)`, `loadRomFromUrl(...)`, `loadOsRomFromUrl(...)`, `loadBasicRomFromUrl(...)`, `mountDisk(...)`, `mountDiskFromUrl(...)`, compatibility `loadDisk(...)`, `unmountDisk(slot)`, `getMountedMedia()`.
- `input.*`: `focusDisplay()`, `keyDown(eventLike)`, `keyUp(eventLike)`, `tapKey(eventLike, options)`, `typeText(text, options)`, `setJoystick(state)`, `getConsoleKeyState()`, `setConsoleKeys(state)`, `pressConsoleKey(key, options)`, `releaseAllInputs()`.
- `debug.*`: `setBreakpoints(addresses)`, `stepInstruction()`, `stepOver()`, `runUntilPc(targetPc, options)`, `runUntilPcOrSnapshot(targetPc, options)`, `waitForPc(targetPc, options)`, `waitForBreakpoint(options)`, `getDebugState()`, `getCounters()`, `getBankState()`, `getConsoleKeyState()`, `getTraceTail(limit)`, `readMemory(address)`, `readRange(start, length, options)`, `getSourceContext(options)`, `disassemble(options)`.
- `dev.*`: `listHostFiles()`, `readHostFile(name, options)`, `writeHostFile(name, data, options)`, `deleteHostFile(name)`, `renameHostFile(oldName, newName)`, `lockHostFile(name)`, `unlockHostFile(name)`, `getHostFileStatus(name)`, `waitForHostFsFile(name, options)`, `assembleSource(spec)`, `assembleHostFile(name, options)`, `getLastBuildResult(options)`, `runXexFromUrl(url, options)`, `runXex(spec)`.
- `artifacts.*`: `captureScreenshot(options)`, `collectArtifacts(options)`, `captureFailureState(options)`.
- `events.*`: `subscribe(handler)` for all events or `subscribe(type, handler)` for filtered events, plus `unsubscribe(token)`.

## Behavior Notes

- `whenReady()` resolves once `ui.js` has attached a live emulator app to the facade.
- `getCapabilities()` reports both `apiVersion` and `artifactSchemaVersion`, plus feature flags such as `worker`, `hostfs`, `assembler`, `disk`, `romLoad`, `urlRomLoad`, `urlDiskLoad`, `urlXexLoad`, `trace`, `breakpoints`, `stepping`, `runUntilPc`, `sourceContext`, `disassembly`, `consoleKeys`, `failureSnapshots`, `progressEvents`, `snapshots`, `events`, and `resetPortBOverride`.
- `getSystemState({ timeoutMs })` reads mounted media, counters, debug state, console keys, and bank state with per-part timeouts. If one read stalls, the call returns partial state plus `error.code = "system_state_partial"` and structured per-part failure details instead of hanging.
- Worker-backed `start()`, `pause()`, and `reset()` resolve only after the worker acknowledges the requested transition. The no-worker fallback remains available through `?a8e_worker=0` or `window.A8E_BOOT_OPTIONS.worker = false`.
- URL-based loaders share the same fetch/cache controls through the common utility layer: `cacheBust`, `cacheBustParam`, `cache`, `credentials`, `mode`, and custom `fetch` / `requestInit`.
- `system.saveSnapshot()` and `system.loadSnapshot()` are backed by the versioned binary snapshot codec. Both paths pause first when needed, preserve `savedRunning` metadata, and return live debug-state context after the operation. Snapshot saves now default to advancing a paused machine to the next frame boundary before serializing, which avoids mid-raster save points that sometimes resumed unreliably; callers can still request cycle-exact paused saves with `timing: "exact"`.
- Artifact helpers return schema-versioned JSON bundles (`artifactSchemaVersion: "2"`). Timeout-oriented wait flows and XEX bring-up failures reuse those bundles so failure reporting includes debug state, counters, trace, bank/media state, console keys, optional memory ranges, optional disassembly/source context, and optional screenshots.
- `dev.runXex(...)` now emits progress checkpoints such as `xex_mount_started`, runs the structured XEX preflight, honors reset-time `portB` overrides, and turns preflight/boot failures into explicit `xex_boot_failed` artifacts rather than generic wait timeouts.
- HostFS automation is broader than the initial read/write pass: callers can now rename, lock, unlock, query status, and wait for files in addition to listing, reading, writing, deleting, assembling, and launching XEX output.

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
