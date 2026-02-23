# UI / Interface

- Files: `jsA8E/index.html`, `jsA8E/style.css`, `jsA8E/js/app/ui.js`, `jsA8E/js/app/hostfs_ui.js`, `jsA8E/js/app/a8e.js`, `jsA8E/js/app/version.js`
- Purpose: provide browser controls and status for emulator operation.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: handles ROM/disk load, start/pause/reset, turbo/audio toggles, virtual keyboard/joystick, fullscreen interactions, and H: file-manager UI flows. `hostfsPanel` is now width-aligned with the keyboard and uses reduced panel/list minimum heights with moderate dynamic sizing so the default open state is smaller while empty-state readability is preserved. Visible UI naming uses `HostFS`, with the panel title showing `HostFS (H:)`. Status bar now reports DOS-style free space as `FREE SECTORS` (999 logical sectors at 128 bytes each, per-file sector rounding).
- Issues: HostFS intentionally uses a flat basename-only namespace (`file.name`) for H: DOS/FMS-style workflows; directory hierarchy is not preserved and duplicate filenames from different subfolders can collide/overwrite.
- Todo: keep UI behavior notes current after control or layout changes.
