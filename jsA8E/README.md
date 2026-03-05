# jsA8E (Browser Port)

Browser-based Atari 800 XL emulator port of the native C/SDL `A8E` implementation.

## Runtime Overview

- No build step required (plain HTML + JS modules).
- WebGL2/WebGL path uses shader-based decode + CRT post-process.
- If WebGL is unavailable (or shader/program init fails), rendering falls back to 2D canvas.
- Audio uses `AudioWorklet` when available, with `ScriptProcessorNode` fallback.

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
