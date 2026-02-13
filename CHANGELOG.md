# Changelog

All notable changes to this project will be documented in this file.

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
