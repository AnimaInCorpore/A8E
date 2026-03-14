# jsA8E (Browser Port)

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

Browser-based Atari 800 XL emulator port of the native C/SDL `A8E` implementation.

## Runtime Overview

- No build step required (plain HTML + JS modules).
- WebGL2/WebGL path uses shader-based decode + CRT post-process.
- If WebGL is unavailable (or shader/program init fails), rendering falls back to 2D canvas.
- Audio uses `AudioWorklet` when available, with `ScriptProcessorNode` fallback.

## Current Emulation Status

The current JS renderer includes the recent raster-timing pass:

- visible playfield/background rendering is on the per-color-clock path
- visible player/missile output is interleaved on the scanline timing path
- visible blank/background-only lines now spend the leading color-burst clocks invisibly before drawing the rest of the line

The browser timing pass now covers the legacy-style active-line geometry, HSCROL handling, visible PMG interleaving, and blank-line color-burst behavior. Remaining work is broader regression verification against raster-effect content and any localized title-specific differences that show up during that sweep. The current verification checklist lives in [../legacy/COLOR_CLOCK_ACCURACY.md](../legacy/COLOR_CLOCK_ACCURACY.md).

## Run

Serve from HTTP (not `file://`) because shader and optional ROM auto-load use `fetch()`:

```sh
python -m http.server 8000
# open http://localhost:8000/jsA8E/
```

## Build Version Tooltip

- Tooltip version text is loaded from `jsA8E/version.json` at runtime.
- The GitHub workflow `.github/workflows/update-jsa8e-version.yml` updates that file automatically when a release is published.
- Local/manual update is just:
  - set `jsA8E/version.json` to the new tag (for example `v1.1.0`)
  - commit and push

## ROM and Boot Requirements

Required ROM files:

- `ATARIXL.ROM` (16 KB)
- `ATARIBAS.ROM` (8 KB)

Behavior:

- The emulator only becomes start-ready after both ROMs are loaded.
- Load ROMs via the top bar file inputs, or
- Serve from repo root and let auto-load try `../ATARIXL.ROM` and `../ATARIBAS.ROM`.
- Disk image/program load (`Load Disk`) accepts `.atr`, `.xex`, and `.zip`.
  - `.zip` archives are scanned for the first `.atr` (preferred) or `.xex` entry and loaded directly.
  - `.xex` files are converted in-memory to an ATR-compatible boot stream using the same XEX boot loader logic as the native path.

## Controls

See the [root README](../README.md#controls) for the shared keyboard, joystick, and console key mappings.

Additional browser-only triggers:

| Key | Function |
|-----|----------|
| Right Alt | TRIG2 |
| F1 | HELP |
| **F11** | Toggle fullscreen mode. A brief overlay also shows "Press Escape or F11 to exit fullscreen" when entering. |

## UI Toggles / Features

- Start/Pause, Reset, Fullscreen
- CPU Turbo (`~4x` speed multiplier)
- SIO Turbo (accelerates SIO transfer timing only)
- Audio On/Off
- On-screen joystick panel toggle
- On-screen Atari keyboard toggle
- Keyboard map toggle (translated symbol mapping for local keyboard layouts vs. original Atari layout)
- Option-on-Start toggle (hold OPTION during boot, BASIC-off style boot behavior)

On smaller/mobile layouts, the virtual keyboard starts hidden by default.

## HostFS (H: Device)

The H: device panel exposes a virtual host filesystem to the emulated Atari.

- Upload files or entire folders via the toolbar or drag-and-drop.
- Files are accessible from the Atari via the `H:` device (e.g. `OPEN #1,4,0,"H:FILE.TXT"`).
- Select files to download them to the browser or delete them.
- File list supports sorting by name, type, and size.

## Assembler

The built-in 6502 assembler editor integrates with HostFS.

- Source files are read from and written to HostFS (`H:`).
- **Assemble** compiles the source and writes a `.XEX` to HostFS.
- **Run** saves, assembles, loads the resulting XEX into D1:, and starts the emulator.

Keyboard shortcuts:

| Shortcut | Function |
|----------|----------|
| Ctrl+S | Save source to HostFS |
| Ctrl+Shift+B | Assemble |
| Ctrl+Enter | Run (save → assemble → load → start) |

### Debugger

The assembler panel includes a source-level debugger:

- Set breakpoints by clicking in the gutter.
- Execution pauses when a breakpoint address is hit.
- **Step** — execute the next instruction and pause again.
- **Step Over** — execute a subroutine call without stepping into it.
- **Continue** — resume execution until the next breakpoint.

## Automation API

jsA8E now exposes a stable automation surface through `window.A8EAutomation` in the browser and `createHeadlessAutomation(...)` in Node.

The full public API reference lives in [AUTOMATION.md](AUTOMATION.md). This README keeps the short overview in sync with that document.

Primary domains:

- `whenReady()`, `getCapabilities()`, `getSystemState()`
- `system.*` for lifecycle, boot/reset options, cache-busting reload, wait helpers, and snapshot save/load
- `media.*` for ROM and disk control, including `loadRomFromUrl(...)`, `mountDiskFromUrl(...)`, and mounted-media queries
- `input.*` for keyboard, joystick, and console keys, including `getConsoleKeyState()` and timed console-key presses
- `debug.*` for breakpoints, stepping, counters, memory, trace, source context, disassembly, and `runUntilPcOrSnapshot(...)`
- `dev.*` for HostFS access, file-state helpers, assembly, `runXex(...)`, and `runXexFromUrl(...)`
- `artifacts.*` for screenshot/artifact capture, including `captureFailureState(...)`
- `events.*` for `attached`, progress, pause, fault, `debugState`, build, and HostFS subscriptions

Reset-time bank overrides are available for bring-up flows that need a specific boot mapping. `system.reset({ portB: 0xFF })`, `system.boot({ portB: 0xFF })`, and `dev.runXex({ ..., resetOptions: { portB: 0xFF } })` apply the initial PIA `PORTB` value before the cold-reset memory map is built.

Worker-backed control calls now acknowledge completion before `system.start()`, `system.pause()`, and `system.reset()` resolve, and `getSystemState({ timeoutMs })` returns partial state with an `error` object instead of hanging forever when one backend read stalls. For deterministic headless/manual fallback, boot with `?a8e_worker=0` (or set `window.A8E_BOOT_OPTIONS = { worker: false }` before `ui.js` runs) to force the main-thread backend.

Flat compatibility aliases still exist, so earlier calls such as `start()`, `runUntilPc()`, or `captureScreenshot()` continue to work.

### Browser-less Node bootstrap

jsA8E now also ships a supported Node bootstrap at `jsA8E/headless.js` for browser-less automation.

- For external agents, CI harnesses, screenshot/snapshot jobs, and other scripted control flows, this is the preferred integration path.
- `createHeadlessAutomation(options)` loads the same core and automation scripts into a Node `vm` context, creates the no-worker app backend, and attaches the normal grouped automation API.
- `options.roms.os` and `options.roms.basic` accept `ArrayBuffer`, typed arrays, `Buffer`, byte arrays, or filesystem paths.
- Headless mode uses the 2D/software renderer, keeps audio disabled by default, and drives continuous execution through a synthetic `requestAnimationFrame` loop so wait helpers and `system.start()` work without a browser.
- `HostFS` falls back to the existing in-memory mode unless you inject your own `indexedDB` global through `options.globals`.

Use the browser-attached `window.A8EAutomation` facade mainly for in-page tooling, manual experiments, or browser harnesses that specifically need to live inside the emulator page.

Example:

All URL-based loaders (`loadRomFromUrl`, `mountDiskFromUrl`, `runXexFromUrl`) share the same deterministic fetch controls: `cacheBust`, `cacheBustParam`, `cache`, `credentials`, `mode`, and `fetch` / `requestInit`.

```js
const api = await window.A8EAutomation.whenReady();
await api.media.loadOsRomFromUrl("/roms/ATARIXL.ROM", { cacheBust: "build-20260311" });
await api.media.loadBasicRomFromUrl("/roms/ATARIBAS.ROM", { cacheBust: "build-20260311" });

const build = await api.dev.assembleSource({
  name: "HELLO.ASM",
  text: ".ORG $2000\nSTART: JMP START\n.RUN START\n",
});

await api.debug.setBreakpoints([0x2000]);
await api.dev.runXex({ build });
const stop = await api.debug.waitForBreakpoint({ timeoutMs: 5000 });

const cpu = stop.debugState;
const sourceContext = await api.debug.getSourceContext({
  pc: cpu.pc,
  beforeLines: 5,
  afterLines: 5,
});
const disassembly = await api.debug.disassemble({
  pc: cpu.pc,
  beforeInstructions: 8,
  afterInstructions: 8,
});
const snapshot = await api.system.saveSnapshot();
const failure = await api.debug.runUntilPcOrSnapshot(0x2000, {
  maxInstructions: 500000,
  screenshot: true,
  ranges: [{ label: "DOSVEC", start: 10, length: 4 }],
});
await api.system.loadSnapshot(snapshot.bytes, { resume: "saved" });
```

Headless example:

```js
const path = require("node:path");
const { createHeadlessAutomation } = require("./headless");

const runtime = await createHeadlessAutomation({
  roms: {
    os: path.resolve("..", "ATARIXL.ROM"),
    basic: path.resolve("..", "ATARIBAS.ROM"),
  },
  turbo: true,
});

const api = runtime.api;
await api.system.start();
await api.system.waitForCycles({ count: 20000, timeoutMs: 5000 });
await api.system.pause();

await runtime.dispose();
```

`captureScreenshot()` returns PNG data. `collectArtifacts()` and `captureFailureState()` now return schema-versioned JSON bundles (`artifactSchemaVersion: "2"`) that include debug state, counters, trace tail, bank state, mounted media, console-key state, memory dumps, optional disassembly/source context, and optional screenshots. Wait helpers such as `waitForPc()` / `waitForBreakpoint()` return these structured failure bundles on timeout instead of only throwing a generic timeout error.

`getCapabilities()` also returns the current automation contract/version flags (`apiVersion`, `artifactSchemaVersion`) and feature booleans such as `worker`, `hostfs`, `assembler`, `urlRomLoad`, `urlDiskLoad`, `urlXexLoad`, `progressEvents`, `snapshots`, and `resetPortBOverride`. `getSystemState()` reports the current ROM/media/debug snapshot, console-key state, HostFS summary, and the last assembler build record.

Additional helpers for tool-driven input:

- `input.focusDisplay()`
- `input.keyDown(eventLike)`, `input.keyUp(eventLike)`, `input.tapKey(eventLike, options)`
- `input.typeText(text, options)`
- `input.setJoystick({ up, down, left, right, trigger })`
- `input.getConsoleKeyState()`
- `input.setConsoleKeys({ option, select, start })`
- `input.pressConsoleKey("start", { holdMs: 200 })`
- `input.releaseAllInputs()`
- `system.waitForFrames({ count })`, `system.waitForCycles({ count })`
- `system.saveSnapshot(options)`, `system.loadSnapshot(data, options)`
- `dev.renameHostFile(oldName, newName)`, `dev.lockHostFile(name)`, `dev.unlockHostFile(name)`
- `dev.getHostFileStatus(name)`, `dev.waitForHostFsFile(name, options)`, `dev.getLastBuildResult(options)`
- `system.reload({ cacheBust: true })`
- `events.subscribe(handler)` for all automation events
- `events.subscribe("progress", handler)` for fetch/boot/wait checkpoints
