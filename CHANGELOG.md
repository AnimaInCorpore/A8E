# Changelog

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

All notable changes to this project will be documented in this file.

## Unreleased

### Added
- NTSC machines in native `A8E` (`-n`) and browser `jsA8E` (Video selector, `videoStandard` headless option): 262 lines, 1.79 MHz, the AHRM D.2 NTSC palette, and `$D014` = `$0F`. Based on PR #5 by Leonel Rivas.
- Extended memory from AHRM 2.7 in both cores: 130XE 128K, RAMBO 192K/320K/576K/1088K, and COMPY 320K/576K, including separate ANTIC access (native `-128K` ... `-1088R`, browser Memory selector, `memoryExpansion` headless option). Based on PR #5 by Leonel Rivas.
- Browser `jsA8E` workspace fullscreen button and a HostFS Run button for `.XEX` files (from PR #5 by Leonel Rivas).

### Changed
- PIA port B now has a data direction register in both cores; input lines read the pull-ups and the ROM mapping follows the port pins (AHRM 2.5, 2.6).
- The POKEY mixer in both cores now uses the AHRM E.2 DAC bit weights and output saturation curve.
- Documentation now consistently states that Atari 800 XL PAL hardware-emulation implementation work should use `AHRM/index.md` as the reference baseline (applied across non-AHRM Markdown docs).
- Native `A8E` build caption/version is now injected at compile time from `jsA8E/version.json` (with `dev` fallback when unavailable).
- Browser `jsA8E` frame timing now accumulates CPU cycles and runs whole-frame steps with capped catch-up to reduce visible speed jitter.
- Browser rendering now requests `desynchronized` WebGL contexts and hints `canvas` transforms for smoother presentation.

### Fixed
- The XEX boot loader now tests both bytes of RUNAD/INITAD, so programs with zero-page entry points start (from PR #5 by Leonel Rivas).
- POKEY timers parked by STIMER now start when their AUDF value arrives, so programs that write AUDF after STIMER get timer IRQs (from PR #5 by Leonel Rivas).
- Native audio no longer goes silent when SDL negotiates a different device format.
- Restoring a `jsA8E` snapshot no longer loses RAM that sits under a banked-out ROM.
- Native `A8E` now ignores out-of-range SDL keysyms (e.g. macOS Command/LGUI) when mapping to Atari key codes; previously hitting ⌘ would index past the key table and crash the emulator.
- Hardened `jsA8E` SIO disk sector access checks across read/write/verify paths to reject invalid offsets consistently.

## v1.1.1 - 2026-02-17

### Changed
- XEX boot-loader handling in native `A8E` and browser `jsA8E` now chooses a non-overlapping temporary sector buffer and patches loader buffer addresses dynamically.

### Fixed
- XEX-to-ATR conversion now rejects images whose segments overlap reserved boot-loader memory, preventing invalid boot media generation.

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
