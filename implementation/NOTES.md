# NOTES.md

Simple implementation notes for this repository.

Reference: follow `AGENTS.md`.
Process rule: review this file before planning any improvement, and update it after each code improvement.

## Project Paths
- `A8E/` -> native C implementation.
- `jsA8E/` -> browser JavaScript implementation.
- `implementation/A8E/` -> native C implementation notes.
- `implementation/jsA8E/` -> browser JavaScript implementation notes.

## Update Rules
- Keep entries short and practical.
- Add/update notes when behavior or structure changes.
- Maintain a short `Files` list for fast navigation.

## Notes Template
- Files: key files to open first.
- Purpose: what this area is responsible for.
- Status: verified implementation state (`implemented`, `partial`, or `pending`).
- Notes: short implementation details (simplified).
- Issues: known issues, limitations, or missing implementation items.
- Todo: next improvements or checks.

## A8E (C) Implementation Notes
- [CPU (6502)](A8E/CPU.md)
- [ANTIC](A8E/ANTIC.md)
- [GTIA](A8E/GTIA.md)
- [POKEY](A8E/POKEY.md)
- [PIA](A8E/PIA.md)
- [Atari I/O and System Glue](A8E/SYSTEM.md)
- [Debug](A8E/DEBUG.md)

## jsA8E (JavaScript) Implementation Notes
- [Core Emulation](jsA8E/CORE.md)
- [Input and Host/Device Integration](jsA8E/INPUT_HOST.md)
- [Rendering / CRT](jsA8E/RENDER.md)
- [Audio](jsA8E/AUDIO.md)
- [UI / Interface](jsA8E/UI.md)
- [Worker Boundary](jsA8E/WORKER.md)
- [Debug](jsA8E/DEBUG.md)

## Recent Improvements
- 2026-03-05: `jsA8E/js/core/assembler/lexer.js`, `jsA8E/js/core/assembler/parser.js`, `jsA8E/js/core/assembler/preprocessor.js`: expanded assembler expression support to precedence-based operators (`* / << >> & | ^ ~ ! == != <= >= && ||` plus existing low/high-byte unary `<`/`>`), added cheap local labels (`@name`/`?name`) scoped to the most recent non-local label, added forced-absolute operand overrides for direct/indexed addressing (`!expr`, `A:expr`, `ABS:expr`), and aligned preprocessor expression/`.include` parsing with escaped-string + `==`/`!=` handling.
- 2026-03-05: `jsA8E/js/core/assembler/shared.js`, `jsA8E/js/core/assembler/parser.js`, `jsA8E/js/core/assembler/assembler.js`: added `END/.END` directive handling to the modular assembler core. `END` is now treated as a real directive (not as a label), optionally accepts a run expression (`END expr`), and terminates further source parsing for the current file.
- 2026-03-05: `jsA8E/js/core/assembler/assembler.js`: byte/word emission now accepts signed constants in 8/16-bit assembler contexts (byte: `-128..255`, word: `-32768..65535`) and encodes them as two's complement (`& $FF`/`& $FFFF`). This fixes immediate forms like `CMP #-2` while still rejecting true overflow (for example `#-129`).
- 2026-03-05: `jsA8E/js/core/assembler/parser.js`, `jsA8E/js/core/assembler/assembler.js`, `jsA8E/js/core/assembler/shared.js`, `jsA8E/js/core/assembler/preprocessor.js`: added parser/emit support for additional ca65/GEOS-style directives in the browser assembler core: `.segment`, `.import`, `.global`, `.res`, `.addr`, `.lobytes`, `.hibytes`, plus assembler-stage `.assert` and `.error`. Current XEX mode semantics: `.segment`, `.import`, and `.global` are accepted as metadata/no-ops for now; `.res` supports optional fill (`.res count[,fill]`), `.addr` aliases `.word`, and `.lobytes`/`.hibytes` emit low/high bytes per expression.
- 2026-03-05: `jsA8E/js/core/assembler/preprocessor.js`, `jsA8E/js/core/assembler/assembler.js`, `jsA8E/js/core/assembler/shared.js`, `jsA8E/js/core/assembler_core.js`, `jsA8E/js/app/assembler_ui.js`, `jsA8E/index.html`: added a real assembler preprocessor stage in the modular core with support for `.include`, `.define`/`.undef`, `.macro`/`.endmacro` (`.endm` alias), `.local` macro locals, and conditional assembly (`.if`, `.ifdef`, `.ifndef`, `.elseif`, `.else`, `.endif`) including expression operators and builtins (`.defined`/`.def`/`.const`, `.not`, `.or`). UI assembly now passes `sourceName` + HostFS-backed include resolver options to core so includes resolve during build.
- 2026-03-05: `jsA8E/js/core/assembler/shared.js`, `jsA8E/js/core/assembler/lexer.js`, `jsA8E/js/core/assembler/parser.js`, `jsA8E/js/core/assembler/object_writer.js`, `jsA8E/js/core/assembler/assembler.js`, `jsA8E/js/core/assembler_core.js`, `jsA8E/index.html`: phase-2 assembler-core modularization. The core assembler pipeline is now split into internal modules (shared tables/utils, lexer/expression parsing, parser/layout pass, object writer, and assemble/orchestration), and `assembler_core.js` is now a thin facade that wires modules and exposes `window.A8EAssemblerCore`.
- 2026-03-05: `jsA8E/js/app/assembler_ui.js`: completed phase-1 UI/core split cleanup by removing the duplicated in-UI assembler engine (parsing/layout/emit helpers and local `assembleToXex`) and keeping a thin `assembleSourceToXex` proxy that calls `window.A8EAssemblerCore`. UI now focuses on editor/highlight/debugger panel behavior.
- 2026-03-05: `jsA8E/js/core/assembler_core.js`, `jsA8E/index.html`, `jsA8E/js/app/assembler_ui.js`: phase-1 assembler architecture split started by extracting the assembler engine into a reusable `A8EAssemblerCore` module (loaded after `cpu_tables.js`) and wiring the UI to delegate assembly through the core. UI keyword highlighting/reserved-token detection now consumes core-exported mnemonic/directive keyword lists.
- 2026-03-05: `jsA8E/js/app/assembler_ui.js`: assembler expression parser now treats square brackets as grouping (like parentheses) in both argument splitting and expression term parsing, enabling MADS-style forms such as `LDA # <[MAZEDAT-$84]`.
- 2026-03-05: `jsA8E/js/app/assembler_ui.js`: improved MADS-style compatibility for assembler directives by accepting bare and dotted forms for existing directives (for example `ORG $80` and `.ORG $80`), and adding `DS/.DS` storage reservation support. `.DS` now advances the location counter without emitting bytes (segment gap), enabling label allocation patterns like `PL2 .DS $0100` / `PL3 .DS $0100`.
- 2026-03-05: `jsA8E/js/app/assembler_ui.js`, `jsA8E/style.css`: assembler breakpoint gutter now gets a `has-build` visual state after successful build output is available (address and/or bytes maps). In this state, assembled-line breakpoint markers and line-number column are rendered with higher contrast so the breakpoint column is clearly visible after build.
- 2026-03-05: `jsA8E/js/app/assembler_ui.js`, `jsA8E/style.css`: assembler build results now include per-source-line emitted byte lists, shown in a new bytes column in the breakpoint gutter (with full byte text in row tooltips). Debug controls are also activated immediately after a successful assemble (Build or Run path), so stepping/continue buttons are available as soon as code has been assembled.
- 2026-03-05: `jsA8E/js/app/assembler_ui.js`: assembler debug control state now has explicit `hidden/armed/paused/running` modes. While emulation is running, the former `Continue` action is shown as `Pause` (same button) and calls `app.pause()`, then returns to paused stepping controls (`Step`, `Step Over`, `Continue`). This provides an in-panel pause path for live breakpoint editing during execution.
- 2026-03-05: `jsA8E/js/app/assembler_ui.js`: when execution pauses with `reason=breakpoint`, assembler debug navigation now jumps caret/scroll directly to the mapped source line (if address-to-line mapping exists), so breakpoint hits immediately reveal the active source location.
- 2026-03-05: `jsA8E/js/app/assembler_ui.js`: assembler debugger line tracking now auto-scrolls the editor when paused `step` lands on a different mapped source line (for example after stepping into `JSR`/`JMP` targets). Auto-scroll is conditional on available address-to-line mapping and does not alter caret/selection.
- 2026-03-05: `jsA8E/js/core/debugger.js`, `jsA8E/js/core/atari.js`, `jsA8E/index.html`, `jsA8E/emulator_worker.js`, `implementation/jsA8E/DEBUG.md`: debug runtime responsibilities (breakpoint hooks, debug state broadcasting, step/step-over flow, and breakpoint resume/hit bookkeeping) were extracted from `atari.js` into a dedicated `core/debugger.js` module and wired into both main-thread and worker boot script lists. `atari.js` now delegates debugger operations via the new runtime API while preserving existing public app methods and behavior.
- 2026-03-05: `jsA8E/index.html`, `jsA8E/style.css`, `jsA8E/js/app/assembler_ui.js`, `jsA8E/js/app/ui.js`, `jsA8E/js/core/atari.js`, `jsA8E/js/core/cpu.js`, `jsA8E/js/core/app_proxy.js`, `jsA8E/emulator_worker.js`: assembler editor now includes a dedicated breakpoint gutter with per-line toggles; successful assembly exports line-to-address mappings, and active line breakpoints are pushed dynamically to runtime PC hooks. Runtime now supports pausing on breakpoint hits plus debug stepping (`Step`, `Step Over`, `Continue`) in both main-thread and worker mode. While paused in debugger mode, the assembler `Run` action is hidden and restored after `Continue`. Assembler status bar appends live debug registers (`PC/A/X/Y/SP/P`) plus breakpoint-hit context.
- 2026-03-05: `jsA8E/js/app/assembler_ui.js`: assembler label parsing now accepts leading labels without a trailing colon (both label-only lines and `label <statement>` forms), while preserving constant-definition parsing (`NAME = expr`, `NAME EQU expr`) and existing mnemonic/directive handling.
- 2026-03-03: `jsA8E/js/app/assembler_ui.js`, `jsA8E/style.css`: fixed assembler panel stability for long sources by removing conflicting editor minimum sizing (`.asm-editor-wrap` can now flex/shrink), raising panel minimum to `340px`, resetting editor scroll/caret to top on source load, and using focus-without-scroll when opening the panel so the assembler toolbar/menu stays visible.
- 2026-03-03: `jsA8E/js/app/assembler_ui.js`, `jsA8E/style.css`: assembler panel now opens taller by default (screen height + extra headroom, clamped to viewport), with a larger minimum panel/editor height (`280px` panel minimum, `300px` editor area minimum) for a bigger editing workspace.
- 2026-03-03: `jsA8E/js/app/assembler_ui.js`: assembler panel initial height now matches the emulator display screen (`.screenViewport`) height, so the editor and screen are visually aligned. Still resizable via the bottom drag handle (min 220px).
- 2026-03-03: `jsA8E/js/app/assembler_ui.js`: assembler panel now auto-loads the first `.ASM` source file from HostFS when opened with an empty editor; if no source files exist on HostFS the editor stays clear.
- 2026-03-03: `jsA8E/index.html`, `jsA8E/style.css`: HostFS panel toolbar restructured for consistency with assembler panel. Upload/Folder buttons moved from titlebar into toolbar with unified `hostfs-btn` base class. Toolbar now uses two labeled groups (Add: Upload, Folder | Select: All, None, Download, Delete). Titlebar is now purely informational (icon + title), matching assembler panel conventions. Removed separate titlebar button CSS rules and unused `.hostfs-title-path`.
- 2026-03-03: `jsA8E/index.html`, `jsA8E/style.css`, `jsA8E/js/app/assembler_ui.js`: assembler toolbar streamlined to two logical groups (File | Build). Removed the separate output filename input; `.XEX` name is now auto-derived from the source name. Run now auto-saves source before assembling. Added keyboard shortcuts: `Ctrl+S` save, `Ctrl+Shift+B` assemble, `Ctrl+Enter` run.
- 2026-03-03: `jsA8E/style.css` UI consistency pass: extracted shared sub-panel CSS custom properties (`--sub-panel-*`) for border, background, button radius, toolbar, and statusbar colors; normalized button padding/radius (`4px` radius, `3px 8px` padding), toolbar gap (`5px`) and padding (`5px 8px`), statusbar padding (`4px 10px`), disabled opacity (`0.35`), and separator margin across HostFS and Assembler panels; unified top-bar button border-radius to `6px`; added matching WebKit scrollbar styling to the assembler editor and error list.
- 2026-03-03: `jsA8E/version.json` runtime build version updated from `v1.2.0` to `v1.3.0` to prepare the next release.
- 2026-03-03: `jsA8E/index.html`, `jsA8E/style.css`, `jsA8E/js/app/assembler_ui.js`, and `jsA8E/js/app/ui.js` now add an assembler `Run` action next to `Assemble`: it assembles, writes the `.XEX` to HostFS, mounts it to `D1:` through the same `loadDiskToDeviceSlot` path used by disk loading, and then resets/starts the emulator for a one-click launch. The assembler panel height was also increased (`min-height` and editor area floor) for a larger editing workspace.
- 2026-03-03: `jsA8E/index.html`, `jsA8E/style.css`, and `jsA8E/js/app/assembler_ui.js` now provide built-in syntax highlighting in the assembler editor without external dependencies: a mirrored `<pre>` highlight layer is synchronized with textarea input/scroll, with token coloring for comments, labels, directives, mnemonics, numbers, strings, and register names.
- 2026-03-03: `jsA8E/js/app/assembler_ui.js` assembler layout now resolves instruction sizes iteratively (up to convergence) using prior-pass symbol hints, so forward references can correctly select zero-page encodings (`ZP/ZPX/ZPY`) instead of being locked to absolute mode. The assembler now also returns structured error lists (`errors[]`) and can recover enough to report multiple line errors in one build attempt. `jsA8E/index.html` + `jsA8E/style.css` add an assembler error list panel with clickable line navigation in the editor.
- 2026-03-03: `jsA8E/js/core/hdevice.js` H: `GET BYTES` CIO behavior now reports `SUCCESS` on short final reads when bytes were transferred, and `EOF` only when zero bytes are returned. This aligns better with DOS binary loaders that treat immediate EOF on partial reads as an error path.
- 2026-03-03: `jsA8E/js/app/assembler_ui.js` assembler now supports constant definitions (`NAME=expr`, `NAME EQU expr`, `.EQU/.SET name,expr`), enabling source like `DOSVEC=$000A` to assemble successfully and be referenced in instructions/directives.
- 2026-03-03: `jsA8E/index.html` adds a new assembler editor toolbar icon (`btnAssembler`) and `assemblerPanel`; `jsA8E/style.css` adds matching panel/theme styles; `jsA8E/js/app/ui.js` now initializes `window.A8EAssemblerUI`; `jsA8E/js/app/assembler_ui.js` adds HostFS-integrated source load/save plus a built-in two-pass 6502 assembler that writes DOS-loadable `.XEX` executables to H: (including RUNAD segment emission).
- 2026-02-23: `.github/workflows/build.yml` now packages Linux/macOS release artifacts as standalone `tar.gz` bundles that include SDL runtime libraries (`libSDL-1.2.so.0` or `libSDL-1.2.0.dylib`) and adds packaging-time dependency checks (`ldd`/`otool`) to fail on unresolved or Homebrew-linked SDL paths.
- 2026-02-23: `jsA8E/version.json` runtime build version updated from `v1.1.1` to `v1.2.0`.
- 2026-02-23: HostFS directory behavior is now explicitly documented as a design choice: keep a flat filename namespace (no subdirectory hierarchy) for Atari DOS/FMS-style compatibility in the H: workflow.
- 2026-02-23: `jsA8E/js/app/hostfs_ui.js` status bar now shows DOS-style `FREE SECTORS` in the HostFS panel using the same logical model as H: (`999` sectors, `128` bytes per sector, per-file sector rounding), alongside total byte size.
- 2026-02-23: `jsA8E/js/core/hdevice.js` now computes H: `FREE SECTORS` from file-size math (128-byte sectors) with a 999-sector logical capacity budget instead of subtracting file count, and returns `disk full` on `CLOSE` when a write would exceed that budget.
- 2026-02-23: `implementation/jsA8E/UI.md` documents HostFS flat-namespace behavior for H: workflows: subfolder structure is flattened to basename-only entries, so duplicate filenames across subfolders can collide/overwrite.
- 2026-02-23: `jsA8E/index.html` renames the H: file-manager visible labels from `H: Files`/`H: files` to `HostFS`; the panel headline now explicitly shows the drive marker as `HostFS (H:)`.
- 2026-02-23: `jsA8E/style.css` now sizes `hostfsPanel` to keyboard width (`min(100%, 1083px)`), centers it in the layout, and uses a reduced panel/list height baseline (`clamp(220px, 36vh, 420px)` panel, 96 px list floor). `jsA8E/js/app/hostfs_ui.js` now uses lighter dynamic list minimums (150 px empty, 96 px non-empty) with the original 60 px bottom margin and 60% viewport cap.
- 2026-02-23: `.github/workflows/build.yml` now includes a dedicated `build-macos-arm64` job on `macos-14` that builds `arm64` binaries and publishes `A8E-<tag>-macos-arm64` release artifacts.
- 2026-02-23: `A8E/AtariIo.c` ANTIC modes 2 and 3 now snapshot `IO_PRIOR` high bits once per scanline draw call and reuse that value for inversion and mode branching. This aligns C behavior with existing JS/C mode F snapshot semantics.
