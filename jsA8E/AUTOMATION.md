# jsA8E Automation API

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

Public automation reference for jsA8E.

This is the user-facing API document for automation scripts, browser tooling, and external harnesses. Browser integrations use `window.A8EAutomation`; browser-less integrations use `createHeadlessAutomation(...)` from `jsA8E/headless.js`. Implementation details and ownership notes live in [../implementation/jsA8E/AUTOMATION.md](../implementation/jsA8E/AUTOMATION.md).

## Entry Point

jsA8E exposes one grouped automation contract through two entrypaths:

- For external agents, CI, and non-interactive automation, prefer `createHeadlessAutomation(options)` from `jsA8E/headless.js`.
- Browser tooling can use `await window.A8EAutomation.whenReady()`.
- The grouped surface is the primary contract: `system`, `media`, `input`, `debug`, `dev`, `artifacts`, and `events`.
- Flat aliases remain at the root for compatibility, so older calls such as `api.start()` or `api.captureScreenshot()` still work.
- Browser main-thread mode, browser worker mode, and headless Node mode use the same public semantics.

For browser-less Node usage, `jsA8E/headless.js` exports `createHeadlessAutomation(options)`. It loads the same core and automation scripts into a Node `vm` context, creates the no-worker backend, and returns `{ api, app, context, dispose() }`. The returned `api` is the same grouped automation surface documented below.

## Root API

| Member | Purpose |
|---|---|
| `apiVersion` | Automation contract version string. |
| `artifactSchemaVersion` | Current artifact/failure bundle schema version string. |
| `whenReady()` | Resolves with the API once `ui.js` has attached a live app instance. |
| `getCapabilities()` | Returns feature flags and version fields for runtime discovery. |
| `getSystemState(options)` | Returns a structured machine summary; accepts `timeoutMs`. Includes current PC, registers, banking state, and media status. |
| `attach(opts)` | Advanced/internal helper used by the UI bootstrap. |
| `detach()` | Detaches the live app and resets `whenReady()`. |
| `getApp()` | Low-level escape hatch; most consumers should not need it. |
| `sym(name, fallback?)` | **Synchronous.** Returns the address of a symbol from the last successful build, or `fallback` (default `null`) if not found. Also on `api.debug.sym` and `api.dev.sym`. |
| `peek(address)` | Single-byte read shorthand for `readMemory(address)`. Also on `api.debug.peek`. |
| `poke(address, value)` | Single-byte write shorthand for `writeMemory(address, value)`. Also on `api.debug.poke`. |
| `buildAndRun(source, options)` | Assembles source and immediately runs the resulting XEX. Same as `api.dev.buildAndRun`. |
| `events` | Event subscription helpers (`subscribe`, `unsubscribe`). |

## Duration Arguments

Many methods accept duration arguments (`ms`, `holdMs`, `afterMs`, `interKeyDelayMs`, `count`, `maxBootCycles`, etc.). All of these accept either a plain number or a string with a unit suffix.

**Cycle-based durations** (`waitForCycles`, `maxBootCycles`, `count` in `waitForFrames`):

| String form | Meaning |
|---|---|
| `1000` or `"1000"` or `"1000cycles"` | 1000 CPU cycles |
| `"10ms"` | 10 milliseconds of emulated time |
| `"2s"` | 2 seconds of emulated time |
| `"3frames"` | 3 PAL frames |

**Millisecond-based durations** (`holdMs`, `afterMs`, `interKeyDelayMs`, `ms` in `waitForTime`):

| String form | Meaning |
|---|---|
| `500` or `"500"` or `"500ms"` | 500 milliseconds |
| `"2s"` | 2 seconds |
| `"1000us"` | 1000 microseconds (1 ms) |

## Capabilities and System State

`getCapabilities()` returns booleans and version fields describing the current runtime. Important flags include:

- `worker`, `hostfs`, `assembler`, `disk`, `romLoad`
- `urlMediaLoad`, `urlRomLoad`, `urlDiskLoad`, `urlXexLoad`
- `trace`, `breakpoints`, `stepping`, `runUntilPc`
- `sourceContext`, `disassembly`, `joystick`, `consoleKeys`, `consoleKeyState`
- `screenshot`, `artifacts`, `failureSnapshots`, `progressEvents`, `cacheControl`
- `waitPrimitives`, `snapshots`, `groupedApi`, `events`, `faultReporting`, `resetPortBOverride`
- `memoryWrite`, `memoryWait`

`getSystemState({ timeoutMs })` returns:

- runtime status: `ready`, `running`, `worker`, `rendererBackend`
- ROM state: `roms.osLoaded`, `roms.basicLoaded`
- media state: `media.deviceSlots`
- HostFS summary: `hostfs.available`, `hostfs.fileCount`
- debug state: `consoleKeys`, `counters`, `debugState`, `bankState`, `lastBuild`
  - `debugState`: contains `pc`, `a`, `x`, `y`, `sp`, `p`, `cycleCounter`, and `instructionCounter`.
- partial-read diagnostics: `error.code = "system_state_partial"` plus structured per-part failures when one backend read times out

## Domain API

### `system.*`

| Method | Purpose / key options |
|---|---|
| `start()` | Starts emulation and resolves after the backend acknowledges the transition. |
| `pause()` | Pauses emulation and resolves after the backend acknowledges the transition. |
| `reset(options)` | Cold-resets the machine. Supports reset-time overrides such as `portB`. |
| `boot(options)` | Convenience wrapper around reset + start. Use `reset: false` or `start: false` to skip parts. |
| `saveSnapshot(options)` | Saves a versioned full-machine snapshot. Pauses first unless `pauseRunning === false`, in which case it throws if the machine is running. The default save timing is frame-aligned; pass `timing: "exact"` to keep the current paused cycle position. |
| `loadSnapshot(data, options)` | Loads a snapshot from `ArrayBuffer`, typed array, or similar binary input. `resume` defaults to `"saved"`. |
| `reload(options)` | Reloads the page using the shared cache-control URL logic. |
| `dispose()` | Disposes the app and detaches the automation facade. |
| `waitForPause(options)` | Waits for a pause event. Supports `reason`, `timeoutMs`, and `immediate`. |
| `waitForTime(msOrOptions)` | Waits by real or emulated time. Pass a bare number/string (`500`, `"500ms"`, `"2s"`) or `{ ms, clock, timeoutMs }`. Use `clock: "emulated"` for emulated-time waits; default is `"real"`. Real-time waits are the safer choice when `turbo` is enabled or the CPU may be in a tight loop. |
| `waitForFrames(countOrOptions)` | Waits for N PAL frames using cycle-counter progress. Pass a bare frame count or `{ count, timeoutMs }`. |
| `waitForCycles(countOrOptions)` | Waits for N emulated CPU cycles. Pass a bare number, a unit string (`"10ms"`, `"3frames"`), or `{ count, timeoutMs }`. |
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
| `mountDisk(data, nameOrOptions?, slot?)` | Mounts an ATR/XEX payload into a device slot. Supports `{ name, slot }` or legacy `(name, slot)` arguments. |
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
| `tapKey(eventLike, options)` | Convenience key press. `holdMs` and `afterMs` accept plain numbers or time strings (`"50ms"`, `"1s"`). |
| `typeText(text, options)` | Types text through repeated key events. `interKeyDelayMs` accepts plain numbers or time strings. |
| `setJoystick(state)` | Sets joystick directions and trigger using `{ up, down, left, right, trigger }`. |
| `getConsoleKeyState()` | Reads current console-key state as `{ raw, option, select, start }`. |
| `setConsoleKeys(state)` | Sets console keys using `{ option, select, start }`. |
| `pressConsoleKey(key, options)` | Presses one console key (`"option"`, `"select"`, `"start"`). `holdMs` and `afterMs` accept time strings. `release` defaults to `true`. |
| `releaseAllInputs()` | Releases all pressed keys/inputs. |

### `debug.*`

| Method | Purpose / key options |
|---|---|
| `setBreakpoints(addresses)` | Replaces the active breakpoint set. Accepts a single address number or an array of addresses. |
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
| `readRange(start, length, options)` | Reads a byte range; returns a `Uint8Array` by default. Use `format: "hex"` for a hex string. Reads wrap across `$FFFF -> $0000`. Highly efficient for dumping large structures like Display Lists or fonts. |
| `readWord(address, options)` | Reads a 16-bit value from memory. Default is little-endian; pass `{ littleEndian: false }` for big-endian. |
| `readWordSigned(address, options)` | Reads a signed 16-bit value with the same endianness options as `readWord(...)`. |
| `writeMemory(address, value)` | Writes one byte to memory and returns the written value. |
| `writeRange(start, data)` | Writes a byte range from `ArrayBuffer`/typed array/byte array input. |
| `writeWord(address, value, options)` | Writes a 16-bit value. Default is little-endian; pass `{ littleEndian: false }` for big-endian. |
| `waitForMemory(addressOrOptions, value?, options?)` | Polls memory until a condition is met. Accepts object form or positional `(address, value, options?)`. Supports `predicate` for custom match logic. |
| `getSourceContext(options)` | Returns mapped source lines around the current or requested PC from the last successful build. |
| `disassemble(options)` | Returns structured disassembly around the current or requested PC. |
| `sym(name, fallback?)` | **Synchronous.** Symbol address lookup from the last build. |
| `peek(address)` | Single-byte read shorthand for `readMemory`. |
| `poke(address, value)` | Single-byte write shorthand for `writeMemory`. |

The `disassemble(options)` result contains:
- `pc`: The starting address.
- `instructions`: An array of instruction objects, each containing `address`, `text`, `bytes`, `mnemonic`, `mode`, `size`, and `cycles`.

`waitForMemory(addressOrOptions, value?, options?)` accepts:

- `address` (required in object form)
- `value` (expected value, default `0`; ignored when `predicate` is set)
- `mask` (default `0xFF` byte / `0xFFFF` word; ignored when `predicate` is set)
- `predicate` — `(currentValue) => boolean`; when provided, `value` and `mask` are ignored and the result omits `expected`/`mask`
- `size` — `1` (default) or `2` for 16-bit reads
- `littleEndian` — for `size: 2`, default `true`
- `pollIntervalMs` — default `20`
- `timeoutMs` — optional; on timeout returns a failure artifact bundle rather than throwing

Positional shorthand: `waitForMemory(address, value, options?)` is equivalent to `waitForMemory({ address, value, ...options })`.

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
| `buildAndRun(source, options)` | Assembles source (same forms as `assembleSource`) and immediately runs the resulting XEX. Throws with a structured error (`code: "assemble_failed"`) if assembly fails. All `runXex` options are accepted and merged via `options`. |
| `sym(name, fallback?)` | **Synchronous.** Symbol address lookup from the last build. |

Important `runXex(...)` options:

- input source: `hostFile`, `build`, `bytes`, `base64`, `buffer`, `data`
- launch config: `name`, `slot`, `reset`, `start`
- `awaitEntry` (Boolean): Defaults to `true`. If `true`, the API waits until the XEX entry point (or `RUNAD`) is reached before resolving. Set to `false` for programs that have complex loaders or stay in `INITAD` routines for a long time.
- reset/banking: `resetOptions`, top-level `portB`
- entry handling: `entryPc`, `expectedEntryPc`
- boot guards: Controls for the `awaitEntry` phase. `maxBootInstructions`, `maxBootCycles` (accepts unit strings, e.g. `"2s"`, `"50frames"`), `detectTightLoop`, `tightLoopWindow`, `tightLoopMinInstructions`, `tightLoopUniquePcLimit`
- misc: `saveHostFile`, `sourceUrl`

### `artifacts.*`

| Method | Purpose / key options |
|---|---|
| `captureScreenshot(options)` | Returns a PNG screenshot. |

`captureScreenshot(options)` returns:
- `mimeType`: "image/png"
- `width`, `height`: Image dimensions.
- `base64`: The PNG data as a base64 string (default).
- `bytes`: The raw PNG data as a `Uint8Array` (if `encoding: "bytes"` is passed). **Node.js Note:** Use `Buffer.from(result.bytes)` to convert this for `fs.writeFileSync`.
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

## Flat Compatibility Aliases

The grouped domains are the preferred contract, but the root object still exposes compatibility aliases for older scripts (for example `api.start()`, `api.readWord()`, `api.captureScreenshot()`, and `api.releaseAllKeys()`). The convenience methods `sym`, `peek`, `poke`, and `buildAndRun` are also present at the root.

## Result Notes

- `captureScreenshot()` returns `{ mimeType, width, height, base64 }` by default, or `{ ..., bytes }` with `encoding: "bytes"`.
- `saveSnapshot()` returns `{ type, version, mimeType, savedAt, savedRunning, byteLength, buffer, bytes, timing }`.
- Successful build results include `ok`, `format`, `sourceName`, `timestamp`, `byteLength`, `runAddr`, `symbols`, line/address maps, and output bytes or base64.
- `sym(name)` is synchronous and reads directly from the in-memory last-build record — no `await` needed.
- `waitForMemory` with `predicate` omits `expected` and `mask` from success and failure results.
- Wait helpers and XEX bring-up failures can return failure artifacts instead of throwing generic timeout strings.
- `runXex(...)` reports structured XEX preflight and boot failures, including `xexPreflight`, `xexLaunch`, `bootDiagnostics`, and schema-versioned artifact data.
- `buildAndRun(...)` throws an automation error (`code: "assemble_failed"`, `details.errors`) rather than returning a failed build object.

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

### Assemble, run, and inspect (short form)

```js
const api = await window.A8EAutomation.whenReady();

const src = `
  .ORG $2000
  RESULT = $0600
START:
  LDA #42
  STA RESULT
  JMP START
  .RUN START
`;

// Build and launch in one call — throws on assembly error
await api.dev.buildAndRun(src);

// sym() is synchronous: no await needed
const resultAddr = api.sym("RESULT");  // → 0x0600

// Wait with a predicate (any non-zero value)
await api.debug.waitForMemory({ address: resultAddr, predicate: v => v !== 0, timeoutMs: 3000 });

// Or positional shorthand: waitForMemory(address, expectedValue, options?)
await api.debug.waitForMemory(resultAddr, 42, { timeoutMs: 3000 });

// Single-byte read/write shorthands
const val = await api.peek(resultAddr);
await api.poke(resultAddr, 0);
```

### Assemble, run, and inspect (full form)

```js
const api = await window.A8EAutomation.whenReady();

const build = await api.dev.assembleSource({
  name: "HELLO.ASM",
  text: ".ORG $2000\nSTART: JMP START\n.RUN START\n",
});

// setBreakpoints accepts a bare address or an array
await api.debug.setBreakpoints(0x2000);
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

### Wait helpers with duration strings

```js
// Real-time waits
await api.system.waitForTime("500ms");
await api.system.waitForTime("2s");

// Emulated-time waits
await api.system.waitForTime({ ms: "500ms", clock: "emulated" });
await api.system.waitForFrames(3);
await api.system.waitForCycles("10ms");
await api.system.waitForCycles("2frames");

// Input delays
await api.input.tapKey("Return", { holdMs: "50ms", afterMs: "100ms" });
await api.input.typeText("HELLO", { interKeyDelayMs: "80ms" });
await api.input.pressConsoleKey("start", { holdMs: "200ms" });
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

## Troubleshooting

### Blank Screenshots or Background-Only Output

If `captureScreenshot()` returns an image that only shows the background color:

1.  **Check DMACTL**: Use `await api.debug.readMemory(0xD400)` to ensure DMA is enabled (should be non-zero, usually `$22` or `$3E`).
2.  **Check SDLIST**: Ensure the shadow Display List pointer at `$230/$231` is valid.
    ```js
    const sdlists = await api.debug.readRange(0x230, 2);
    const sdlist = sdlists[0] | (sdlists[1] << 8);
    ```
3.  **Wait for VBL**: Many Atari programs wait for the Real Time Clock at `$14` to increment before they start rendering. Use `await api.system.waitForTime({ ms: 1000, clock: "real" })` to allow several vertical blanks to pass.

### XEX Fails to Boot or Timeouts

If `runXex(...)` times out:

1.  **Disable Entry Wait**: Set `awaitEntry: false` to return immediately after triggering the load, then use `waitForTime` or `waitForPc` to monitor progress manually.
2.  **Increase Limits**: If the program is just slow to initialize, increase `maxBootInstructions` and `maxBootCycles`.
3.  **Monitor PC**: Use a loop with `getSystemState()` and `disassemble()` to see if the CPU is stuck in a loop or executing expected code.
