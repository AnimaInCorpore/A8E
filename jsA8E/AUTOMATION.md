# jsA8E Automation API

Public browser-facing reference for `window.A8EAutomation`.

This is the user-facing API document for automation scripts, browser tooling, and external harnesses that drive jsA8E through the page itself. Implementation details and ownership notes live in [../implementation/jsA8E/AUTOMATION.md](../implementation/jsA8E/AUTOMATION.md).

## Entry Point

jsA8E exposes a stable browser-first automation facade on `window.A8EAutomation`.

- Most consumers should wait for `await window.A8EAutomation.whenReady()`.
- The grouped surface is the primary contract: `system`, `media`, `input`, `debug`, `dev`, `artifacts`, and `events`.
- Flat aliases remain at the root for compatibility, so older calls such as `api.start()` or `api.captureScreenshot()` still work.
- Main-thread mode and worker mode use the same public semantics.

## Root API

| Member | Purpose |
|---|---|
| `apiVersion` | Automation contract version string. |
| `artifactSchemaVersion` | Current artifact/failure bundle schema version string. |
| `whenReady()` | Resolves with the API once `ui.js` has attached a live app instance. |
| `getCapabilities()` | Returns feature flags and version fields for runtime discovery. |
| `getSystemState(options)` | Returns a structured machine summary; accepts `timeoutMs`. |
| `attach(opts)` | Advanced/internal helper used by the UI bootstrap. |
| `detach()` | Detaches the live app and resets `whenReady()`. |
| `getApp()` | Low-level escape hatch; most consumers should not need it. |

## Capabilities and System State

`getCapabilities()` returns booleans and version fields describing the current runtime. Important flags include:

- `worker`, `hostfs`, `assembler`, `disk`, `romLoad`
- `urlMediaLoad`, `urlRomLoad`, `urlDiskLoad`, `urlXexLoad`
- `trace`, `breakpoints`, `stepping`, `runUntilPc`
- `sourceContext`, `disassembly`, `joystick`, `consoleKeys`, `consoleKeyState`
- `failureSnapshots`, `progressEvents`, `cacheControl`, `waitPrimitives`, `snapshots`, `groupedApi`, `events`, `faultReporting`, `resetPortBOverride`

`getSystemState({ timeoutMs })` returns:

- runtime status: `ready`, `running`, `worker`, `rendererBackend`
- ROM state: `roms.osLoaded`, `roms.basicLoaded`
- media state: `media.deviceSlots`
- HostFS summary: `hostfs.available`, `hostfs.fileCount`
- debug state: `consoleKeys`, `counters`, `debugState`, `bankState`, `lastBuild`
- partial-read diagnostics: `error.code = "system_state_partial"` plus structured per-part failures when one backend read times out

## Domain API

### `system.*`

| Method | Purpose / key options |
|---|---|
| `start()` | Starts emulation and resolves after the backend acknowledges the transition. |
| `pause()` | Pauses emulation and resolves after the backend acknowledges the transition. |
| `reset(options)` | Cold-resets the machine. Supports reset-time overrides such as `portB`. |
| `boot(options)` | Convenience wrapper around reset + start. Use `reset: false` or `start: false` to skip parts. |
| `saveSnapshot(options)` | Saves a versioned full-machine snapshot. Pauses first unless `pauseRunning === false`, in which case it throws if the machine is running. |
| `loadSnapshot(data, options)` | Loads a snapshot from `ArrayBuffer`, typed array, or similar binary input. `resume` defaults to `"saved"`. |
| `reload(options)` | Reloads the page using the shared cache-control URL logic. |
| `dispose()` | Disposes the app and detaches the automation facade. |
| `waitForPause(options)` | Waits for a pause event. Supports `reason`, `timeoutMs`, and `immediate`. |
| `waitForTime(options)` | Waits by real time or emulated time. Use `clock: "real"` or `clock: "emulated"`. |
| `waitForFrames(options)` | Waits for `count` frames using cycle-counter progress. |
| `waitForCycles(options)` | Waits for `count` emulated CPU cycles. |
| `getSystemState(options)` | Same as the root method. |

### `media.*`

| Method | Purpose / key options |
|---|---|
| `loadRom(kind, data)` | Loads an OS or BASIC ROM. `kind` must be `"os"` or `"basic"`. |
| `loadOsRom(data)` | Convenience wrapper for the OS ROM. |
| `loadBasicRom(data)` | Convenience wrapper for the BASIC ROM. |
| `loadRomFromUrl(kind, url, options)` | Fetches a ROM through the shared cache-control fetch path, then loads it. |
| `loadOsRomFromUrl(url, options)` | URL helper for the OS ROM. |
| `loadBasicRomFromUrl(url, options)` | URL helper for the BASIC ROM. |
| `mountDisk(data, options)` | Mounts an ATR/XEX payload into a device slot. Important options: `name`, `slot`. |
| `mountDiskFromUrl(url, options)` | Fetches and mounts media from a URL. |
| `loadDisk(data, options)` | Compatibility alias for `mountDisk(...)`. |
| `unmountDisk(slot)` | Unmounts a device slot. |
| `getMountedMedia()` | Returns the current 8-slot media view with mount metadata. |

All URL loaders share the same fetch controls:

- `cacheBust`, `cacheBustParam`, `cache`, `credentials`, `mode`
- custom `fetch`
- raw `requestInit`

### `input.*`

| Method | Purpose / key options |
|---|---|
| `focusDisplay()` | Focuses the emulator display/canvas when possible. |
| `keyDown(eventLike)` | Sends a key-down event to the emulator input path. |
| `keyUp(eventLike)` | Sends a key-up event to the emulator input path. |
| `tapKey(eventLike, options)` | Convenience key press with optional `holdMs` and `afterMs`. |
| `typeText(text, options)` | Types text through repeated key events. Supports `interKeyDelayMs`. |
| `setJoystick(state)` | Sets joystick directions and trigger using `{ up, down, left, right, trigger }`. |
| `getConsoleKeyState()` | Reads current console-key state as `{ raw, option, select, start }`. |
| `setConsoleKeys(state)` | Sets console keys using `{ option, select, start }`. |
| `pressConsoleKey(key, options)` | Presses one console key with optional `holdMs`, `release`, and `afterMs`. |
| `releaseAllInputs()` | Releases all pressed keys/inputs. |

### `debug.*`

| Method | Purpose / key options |
|---|---|
| `setBreakpoints(addresses)` | Replaces the active breakpoint set. |
| `stepInstruction()` | Executes one instruction in paused mode. |
| `stepOver()` | Steps over a subroutine call in paused mode. |
| `runUntilPc(targetPc, options)` | Runs until a PC address is reached or a stop condition occurs. |
| `runUntilPcOrSnapshot(targetPc, options)` | Same intent as `runUntilPc`, but returns a failure artifact bundle on timeout/failure. |
| `waitForPc(targetPc, options)` | Waits for a pause event at a specific PC; returns a failure artifact on timeout. |
| `waitForBreakpoint(options)` | Waits for a pause event with `reason = "breakpoint"`. |
| `getDebugState()` | Returns the current debug snapshot (`pc`, registers, counters, reason, fault metadata). |
| `getCounters()` | Returns runtime counters such as `cycleCounter` and `instructionCounter`. |
| `getBankState()` | Returns memory/PIA banking state when available. |
| `getConsoleKeyState()` | Same console-key helper exposed in `input.*`. |
| `getTraceTail(limit)` | Returns the most recent trace entries. |
| `readMemory(address)` | Reads one byte from memory. |
| `readRange(start, length, options)` | Reads a byte range; use `format: "hex"` for a hex string. |
| `getSourceContext(options)` | Returns mapped source lines around the current or requested PC from the last successful build. |
| `disassemble(options)` | Returns structured disassembly around the current or requested PC. |

### `dev.*`

| Method | Purpose / key options |
|---|---|
| `listHostFiles(pattern)` | Lists HostFS files with `name`, `size`, and `locked`. |
| `readHostFile(name, options)` | Reads a HostFS file. Use `encoding: "text"` or `encoding: "base64"`; default is raw `bytes`. |
| `writeHostFile(name, data, options)` | Writes a HostFS file. `data` can be bytes or `{ text }`. Supports `lock: true`. |
| `deleteHostFile(name)` | Deletes a HostFS file. |
| `renameHostFile(oldName, newName)` | Renames a HostFS file. |
| `lockHostFile(name)` | Locks a HostFS file. |
| `unlockHostFile(name)` | Unlocks a HostFS file. |
| `getHostFileStatus(name)` | Reads the HostFS status object for one file. |
| `waitForHostFsFile(name, options)` | Waits until a file exists in HostFS. |
| `assembleSource(spec)` | Assembles source text. Supports `name`, `text`, `format`, include resolution, defines/imports, and `byteEncoding`. |
| `assembleHostFile(name, options)` | Reads a HostFS source file, then assembles it with the same options as `assembleSource(...)`. |
| `getLastBuildResult(options)` | Returns the normalized last build record. |
| `runXex(spec)` | Launches a XEX from `hostFile`, `build`, raw bytes, or the last successful build. Supports reset/entry-wait/boot-limit options. |
| `runXexFromUrl(url, options)` | Fetches a XEX from a URL, then routes through `runXex(...)`. |

Important `runXex(...)` options:

- input source: `hostFile`, `build`, `bytes`, `base64`, `buffer`, `data`
- launch config: `name`, `slot`, `reset`, `start`, `awaitEntry`
- reset/banking: `resetOptions`, top-level `portB`
- entry handling: `entryPc`, `expectedEntryPc`
- boot guards: `maxBootInstructions`, `maxBootCycles`, `detectTightLoop`, `tightLoopWindow`, `tightLoopMinInstructions`, `tightLoopUniquePcLimit`
- misc: `saveHostFile`, `sourceUrl`

### `artifacts.*`

| Method | Purpose / key options |
|---|---|
| `captureScreenshot(options)` | Returns a PNG screenshot. Default payload is base64; use `encoding: "bytes"` for byte arrays. |
| `collectArtifacts(options)` | Captures a schema-versioned artifact bundle with debug state, counters, trace, media state, and optional extras. |
| `captureFailureState(options)` | Captures a schema-versioned failure bundle with the same base artifact data plus failure metadata. |

Useful artifact options:

- memory: `ranges` or `memoryRanges`
- trace: `traceTailLimit`
- code context: `disassembly`, `beforeInstructions`, `afterInstructions`, `sourceContext`, `beforeLines`, `afterLines`
- screenshots: `screenshot`, `screenshotEncoding`
- metadata: `operation`, `runConfiguration`, `failure`, `xexPreflight`, `xexLaunch`, `scenarioMarkers`

### `events.*`

| Method | Purpose |
|---|---|
| `subscribe(handler)` | Subscribes to all automation events. |
| `subscribe(type, handler)` | Subscribes to one event type only. |
| `unsubscribe(token)` | Removes a previous subscription. |

Current event types:

- `attached`
- `progress`
- `pause`
- `fault`
- `debugState`
- `build`
- `hostfs`

## Result Notes

- `captureScreenshot()` returns `{ mimeType, width, height, base64 }` by default, or `{ ..., bytes }` with `encoding: "bytes"`.
- `saveSnapshot()` returns `{ type, version, mimeType, savedAt, savedRunning, byteLength, buffer, bytes }`.
- Successful build results include `ok`, `format`, `sourceName`, `timestamp`, `byteLength`, `runAddr`, `symbols`, line/address maps, and output bytes or base64.
- Wait helpers and XEX bring-up failures can return failure artifacts instead of throwing generic timeout strings.
- `runXex(...)` reports structured XEX preflight and boot failures, including `xexPreflight`, `xexLaunch`, `bootDiagnostics`, and schema-versioned artifact data.

## Pause and Fault Semantics

Pause/fault states use explicit `reason` values rather than UI-only strings. Common values include:

- `pause`
- `breakpoint`
- `step`
- `reset`
- `fault_illegal_opcode`
- `fault_execution_error`
- wait-related outcomes such as `timeout`, `instructionLimit`, `cycleLimit`, or `tight_loop`

## Examples

### Basic bring-up

```js
const api = await window.A8EAutomation.whenReady();

await api.media.loadOsRomFromUrl("/roms/ATARIXL.ROM", {
  cacheBust: "build-20260312",
});
await api.media.loadBasicRomFromUrl("/roms/ATARIBAS.ROM", {
  cacheBust: "build-20260312",
});

await api.system.boot();
```

### Assemble, run, and inspect

```js
const api = await window.A8EAutomation.whenReady();

const build = await api.dev.assembleSource({
  name: "HELLO.ASM",
  text: ".ORG $2000\nSTART: JMP START\n.RUN START\n",
});

await api.debug.setBreakpoints([0x2000]);
await api.dev.runXex({ build });
const stop = await api.debug.waitForBreakpoint({ timeoutMs: 5000 });

const cpu = stop.debugState;
const source = await api.debug.getSourceContext({ pc: cpu.pc, beforeLines: 5, afterLines: 5 });
const disassembly = await api.debug.disassemble({
  pc: cpu.pc,
  beforeInstructions: 8,
  afterInstructions: 8,
});
```

### Snapshot round-trip

```js
const api = await window.A8EAutomation.whenReady();

const snapshot = await api.system.saveSnapshot();
await api.system.loadSnapshot(snapshot.bytes, { resume: "saved" });
```

### HostFS automation

```js
const api = await window.A8EAutomation.whenReady();

await api.dev.writeHostFile("TEST.TXT", { text: "hello" });
const file = await api.dev.readHostFile("TEST.TXT", { encoding: "text" });
await api.dev.renameHostFile("TEST.TXT", "HELLO.TXT");
```
