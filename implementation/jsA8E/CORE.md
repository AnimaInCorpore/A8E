# Core Emulation

- Files: `jsA8E/js/core/cpu.js`, `jsA8E/js/core/cpu_tables.js`, `jsA8E/js/core/antic.js`, `jsA8E/js/core/gtia.js`, `jsA8E/js/core/pokey.js`, `jsA8E/js/core/pokey_sio.js`, `jsA8E/js/core/memory.js`, `jsA8E/js/core/io.js`, `jsA8E/js/core/atari.js`, `jsA8E/js/core/hw.js`, `jsA8E/js/core/playfield.js`, `jsA8E/js/core/state.js`
- Purpose: mirror Atari hardware behavior in JavaScript with timing-compatible execution.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: CPU/ANTIC/GTIA/POKEY flow is coordinated in core modules with shared machine state. `playfield.js` implements `drawLineMode2`-`drawLineModeF` for ANTIC display modes 2-F.
- Issues: none tracked.
- Todo: keep behavior in sync with native `A8E/` changes.

