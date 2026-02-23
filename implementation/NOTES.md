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
- 2026-02-23: HostFS directory behavior is now explicitly documented as a design choice: keep a flat filename namespace (no subdirectory hierarchy) for Atari DOS/FMS-style compatibility in the H: workflow.
- 2026-02-23: `jsA8E/js/app/hostfs_ui.js` status bar now shows DOS-style `FREE SECTORS` in the HostFS panel using the same logical model as H: (`999` sectors, `128` bytes per sector, per-file sector rounding), alongside total byte size.
- 2026-02-23: `jsA8E/js/core/hdevice.js` now computes H: `FREE SECTORS` from file-size math (128-byte sectors) with a 999-sector logical capacity budget instead of subtracting file count, and returns `disk full` on `CLOSE` when a write would exceed that budget.
- 2026-02-23: `implementation/jsA8E/UI.md` documents HostFS flat-namespace behavior for H: workflows: subfolder structure is flattened to basename-only entries, so duplicate filenames across subfolders can collide/overwrite.
- 2026-02-23: `jsA8E/index.html` renames the H: file-manager visible labels from `H: Files`/`H: files` to `HostFS`; the panel headline now explicitly shows the drive marker as `HostFS (H:)`.
- 2026-02-23: `jsA8E/style.css` now sizes `hostfsPanel` to keyboard width (`min(100%, 1083px)`), centers it in the layout, and uses a reduced panel/list height baseline (`clamp(220px, 36vh, 420px)` panel, 96 px list floor). `jsA8E/js/app/hostfs_ui.js` now uses lighter dynamic list minimums (150 px empty, 96 px non-empty) with the original 60 px bottom margin and 60% viewport cap.
- 2026-02-23: `.github/workflows/build.yml` now includes a dedicated `build-macos-arm64` job on `macos-14` that builds `arm64` binaries and publishes `A8E-<tag>-macos-arm64` release artifacts.
- 2026-02-23: `A8E/AtariIo.c` ANTIC modes 2 and 3 now snapshot `IO_PRIOR` high bits once per scanline draw call and reuse that value for inversion and mode branching. This aligns C behavior with existing JS/C mode F snapshot semantics.
