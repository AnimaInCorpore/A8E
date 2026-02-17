# Changelog

All notable changes to this project will be documented in this file.

## v1.1.0 - 2026-02-17

### Added
- Direct `.xex` program loading support in both native `A8E` and browser `jsA8E` paths.
- XEX-to-ATR conversion with segment normalization to support multi-segment files in both implementations.

### Changed
- Embedded XEX boot loader updated to handle `INITAD`/`RUNAD` flow more robustly across native and JS builds.
- Documentation updated to describe ATR/XEX loading behavior and usage.

### Fixed
- Corrected inclusive segment end-copy behavior (off-by-one) in the XEX boot loader for native and JS.
- Added failure handling for invalid/unsupported XEX conversion paths to avoid mounting bad disk data.

## v1.0.1 - 2026-02-13

### Added
- Automated release workflow to update `jsA8E/version.json` from the published Git tag.
- Runtime build version display in `jsA8E` (`version.json` + `js/app/version.js`).
- Help tooltip legend for ROM status and top-menu icons in `jsA8E`.

### Changed
- Improved browser keyboard handling in `jsA8E` with printable key normalization and side-specific modifier mapping.
- Refined on-screen keyboard typography and responsive key label sizing in `jsA8E`.

### Fixed
- Native `A8E` event loop now forwards only keyboard events to `AtariIoKeyboardEvent`, avoiding non-key event forwarding.
