# Core Emulation

- Files: `jsA8E/js/core/cpu.js`, `jsA8E/js/core/cpu_tables.js`, `jsA8E/js/core/antic.js`, `jsA8E/js/core/gtia.js`, `jsA8E/js/core/pokey.js`, `jsA8E/js/core/pokey_sio.js`, `jsA8E/js/core/memory.js`, `jsA8E/js/core/io.js`, `jsA8E/js/core/atari.js`, `jsA8E/js/core/hw.js`, `jsA8E/js/core/playfield.js`, `jsA8E/js/core/state.js`
- Purpose: mirror Atari hardware behavior in JavaScript with timing-compatible execution.
- Status: updated on 2026-03-10 (`partial`).
- Notes: CPU/ANTIC/GTIA/POKEY flow is coordinated in core modules with shared machine state. `playfield.js` implements `drawLineMode2`-`drawLineModeF` for ANTIC display modes 2-F and now follows the legacy-style active-line geometry, HSCROL timing, visible PMG interleave, and blank-line color-burst behavior used by the native core. The JS path still renders scrolled lines through a wider scratch buffer and copies the visible 456-pixel window back into the main video buffer. Event scheduling now stays on `cycleCounter` for DLI, POKEY timers, and SIO so the current instruction-granular CPU model does not drift against the newer draw-path timing work over longer runs.
- Issues: broader regression verification against real raster-effect content is still open.
- Todo: finish the display-list/raster-content verification sweep and record any title-specific timing differences that remain.
