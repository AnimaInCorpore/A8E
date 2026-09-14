# jsA8E Continuation Notes

Status reviewed on 2026-09-14. This file is a handoff summary, not the
authoritative user documentation; see [README.md](README.md) and
[AUTOMATION.md](AUTOMATION.md) for the current public behavior.

This file is a handoff note for the next session.

## What we were trying to do

- Keep the browser-side memory-expansion selector and PAL/NTSC boot selection
  aligned with the runtime configuration.
- Keep the implementation generic and AHRM-driven rather than title-specific.
- Maintain parity between browser, headless, and native memory-window behavior.

## What was verified

- PAL and NTSC selection works through boot and reset.
- `peek(53268)` distinguishes the video standard as expected from the browser console.
- Browser and native AHRM profiles cover 130XE, 192K/320K/576K/1088K RAMBO,
  both COMPY variants, and the initial U1MB model.
- Generic browser memory, XEX, ANTIC, CPU, POKEY, snapshot, automation, and MCP
  regressions pass; native CMake probes cover the corresponding hardware paths.
- AtariBlast and Mikie complete their normal startup paths after the generic
  XEX RUNAD/loader, IRQ, and memory-window corrections.

## What is still incomplete

- Ultimate1MB BIOS/flash, RTC, PBI devices, and external peripherals are not
  emulated.
- Raster-effect verification against real content and a small set of AHRM
  corner cases remain open; see `legacy/COLOR_CLOCK_ACCURACY.md`.

## Important AHRM reminders

- COMPY expansions use separate ANTIC access behavior, unlike the simpler RAMBO cases; this is covered by the profile matrix and memory diagnostics.
- RAMBO and COMPY profiles do not share the same banking pattern; all listed AHRM maps are exercised by the native probe and the reusable XEX diagnostics.
- The 1088K mapping has been checked for its 64-bank PORTB layout, shared CPU/ANTIC window, overlay behavior, bank retention, and high-bank visual DMA path.

## Validation already covered

- `PORTB` bank-bit layouts and CPU/ANTIC window transitions are covered by
  `A8E/tests/memory_expansion_probe.c`, `U1MB_MEMORY_TEST.XEX`, and
  `MEMORY_STRESS_TEST.XEX`.
- Motherboard-RAM preservation, BASIC/Self-Test overlay priority, bank
  retention, and the 1088K high-bank path are covered by the memory diagnostics.
- The browser regression suite covers the corresponding memory, XEX, PIA,
  ANTIC, CPU, POKEY, automation, snapshot, and MCP paths.

## Open validation

- A full cycle-by-cycle comparison against an Altirra trace is still useful for
  future AHRM corner cases, but it is no longer a prerequisite for the generic
  bank-map implementation.
- Karate Champion and Animal Party still need final title-level startup
  confirmation; their DLI/NMI and SIO paths are covered by the generic fixes
  and diagnostic work.
- Ultimate1MB firmware-dependent behavior (BIOS/flash, RTC, and PBI) remains
  outside the current model.

## Relevant files

- `jsA8E/index.html`
- `jsA8E/js/app/ui.js`
- `jsA8E/js/core/app_proxy.js`
- `jsA8E/js/core/atari.js`
- `jsA8E/js/core/io.js`
- `jsA8E/js/core/memory.js`
- `jsA8E/js/core/state.js`
- `jsA8E/emulator_worker.js`

## Short summary for the next session

The PAL/NTSC and memory-expansion baseline is now validated. Future changes
should start with the AHRM and preserve generic behavior across all profiles.
