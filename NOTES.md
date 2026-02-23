# NOTES.md

Simple implementation notes for this repository.

Reference: follow `AGENTS.md`.
Process rule: review this file before planning any improvement, and update it after each code improvement.

## Project Paths
- `A8E/` -> native C implementation.
- `jsA8E/` -> browser JavaScript implementation.

## Update Rules
- Keep entries short and practical.
- Add/update notes when behavior or structure changes.
- Maintain a short `Files` list for fast navigation.

## Notes Template
- Files: key files to open first.
- Purpose: what this area is responsible for.
- Notes: short implementation details (simplified).
- Issues: known issues, limitations, or missing implementation items.
- Todo: next improvements or checks.

## A8E (C) Implementation Notes

### CPU (6502)
- Files: `A8E/6502.c`, `A8E/6502.h`
- Purpose: emulate 6502 instruction execution and cycle behavior.
- Notes: opcode handling and flags are cycle-driven and act as base timing for other chips.
- Issues: none tracked.
- Todo: keep CPU timing notes aligned with `jsA8E/` behavior changes.

### ANTIC
- Files: `A8E/Antic.c`, `A8E/Antic.h`
- Purpose: handle display list processing, DMA timing, and display NMIs.
- Notes: scanline progression drives display fetches; VBI timing is synchronized around the late-frame region.
- Issues: none tracked.
- Todo: document any edge-case DMA stalls when touched.

### GTIA
- Files: `A8E/Gtia.c`, `A8E/Gtia.h`
- Purpose: render player/missile behavior and resolve priorities/collisions.
- Notes: color and collision state are tied to per-scanline updates and register writes.
- Issues: none tracked.
- Todo: keep collision/priorities parity checks with `jsA8E/`.

### POKEY
- Files: `A8E/Pokey.c`, `A8E/Pokey.h`
- Purpose: provide sound generation, timers, keyboard, and serial timing.
- Notes: digital high-pass filter behavior is implemented (AUDCTL-controlled); volume-only paths can bypass filtering.
- Issues: none tracked.
- Todo: track audio balance and filter behavior changes against browser output.

### PIA
- Files: `A8E/Pia.c`, `A8E/Pia.h`
- Purpose: manage port control and ROM/bank switching control paths.
- Notes: port state affects system mapping and input/control behavior.
- Issues: none tracked.
- Todo: add short notes when bank/port side effects are changed.

### Atari I/O and System Glue
- Files: `A8E/AtariIo.c`, `A8E/AtariIo.h`, `A8E/A8E.c`
- Purpose: connect chips, run main emulation loop, and handle boot/device I/O flow.
- Notes: central integration point for ROM, disk, interrupts, and platform runtime behavior.
- Issues: disassembly mode (F12, when enabled) is one-way until emulator restart.
- Todo: update notes when loop/timing ownership moves between modules.

## jsA8E (JavaScript) Implementation Notes

### Core Emulation
- Files: `jsA8E/js/core/cpu.js`, `jsA8E/js/core/cpu_tables.js`, `jsA8E/js/core/antic.js`, `jsA8E/js/core/gtia.js`, `jsA8E/js/core/pokey.js`, `jsA8E/js/core/pokey_sio.js`, `jsA8E/js/core/memory.js`, `jsA8E/js/core/io.js`, `jsA8E/js/core/atari.js`, `jsA8E/js/core/hw.js`, `jsA8E/js/core/playfield.js`, `jsA8E/js/core/state.js`
- Purpose: mirror Atari hardware behavior in JavaScript with timing-compatible execution.
- Notes: CPU/ANTIC/GTIA/POKEY flow is coordinated in core modules with shared machine state.
- Issues: none tracked.
- Todo: keep behavior in sync with native `A8E/` changes.

### Input and Host/Device Integration
- Files: `jsA8E/js/core/input.js`, `jsA8E/js/core/keys.js`, `jsA8E/js/core/hdevice.js`, `jsA8E/js/core/hostfs.js`, `jsA8E/js/core/app_proxy.js`
- Purpose: map browser input and host file/device interactions into emulator signals.
- Notes: keyboard/joystick mappings and hostfs/device bridges are handled through app/core integration.
- Issues: none tracked.
- Todo: keep host integration notes updated when new device flows are added.

### Rendering / CRT
- Files: `jsA8E/js/render/gl.js`, `jsA8E/js/render/software.js`, `jsA8E/js/render/palette.js`, `jsA8E/js/render/shaders/webgl2.vert.glsl`, `jsA8E/js/render/shaders/webgl2.decode.frag.glsl`, `jsA8E/js/render/shaders/webgl2.crt.frag.glsl`, `jsA8E/js/render/shaders/webgl1.vert.glsl`, `jsA8E/js/render/shaders/webgl1.decode.frag.glsl`, `jsA8E/js/render/shaders/webgl1.crt.frag.glsl`
- Purpose: convert emulator frame data into display output.
- Notes: WebGL uses a two-pass path (decode pass, then CRT post-process pass). CRT shader applies filtering and scanline shaping; software rendering is fallback if WebGL/shaders fail.
- Issues: full shader/render path requires HTTP serving; `file://` cannot fully initialize fetch-based assets.
- Todo: keep CRT visual tuning and software fallback parity documented.

### Audio
- Files: `jsA8E/js/audio/runtime.js`, `jsA8E/js/audio/worklet.js`
- Purpose: output low-latency emulator audio in the browser.
- Notes: AudioWorklet sample-queue path is preferred, with ScriptProcessor fallback for compatibility. POKEY-driven filter behavior is preserved by the core emulation path.
- Issues: ScriptProcessor fallback can increase latency and is only a compatibility path.
- Todo: note any latency/buffer changes and audible side effects.

### UI / Interface
- Files: `jsA8E/index.html`, `jsA8E/style.css`, `jsA8E/js/app/ui.js`, `jsA8E/js/app/hostfs_ui.js`, `jsA8E/js/app/a8e.js`, `jsA8E/js/app/version.js`
- Purpose: provide browser controls and status for emulator operation.
- Notes: handles ROM/disk load, start/pause/reset, turbo/audio toggles, virtual keyboard/joystick, and fullscreen interactions.
- Issues: none tracked.
- Todo: keep UI behavior notes current after control or layout changes.

### Worker Boundary
- Files: `jsA8E/emulator_worker.js`
- Purpose: run emulation away from the main thread and exchange events/data with UI/audio.
- Notes: worker messaging transports frame/audio/control signals between runtime parts.
- Issues: none tracked.
- Todo: log protocol changes whenever message schema changes.

## Improvement Log (Keep Current)
- Format: `YYYY-MM-DD - area - short change summary - touched file(s)/folder(s)`
- 2026-02-23 - docs - initial notes structure created - `./`
- 2026-02-23 - docs - switched to folder-only references and added Purpose/Notes/Todo format - `./`
- 2026-02-23 - docs - re-added per-section files lists for faster agent navigation - `NOTES.md`
- 2026-02-23 - docs - removed Folder fields and added Issues across all sections - `NOTES.md`
