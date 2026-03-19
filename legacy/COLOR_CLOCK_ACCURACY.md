# Color-Clock Accuracy

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

This document tracks signoff status for `A8E/AtariIo.c` and `jsA8E/js/core/`
against the AHRM-specified scanline timing model. The implementation pass is
in place; the remaining work is verification.

## Accuracy Reference

The [AHRM](/AHRM/index.md) is the ground of truth for hardware emulation
accuracy. The legacy renderer (`legacy/A8E_experimental/Atari.c`) remains a
useful secondary reference for implementation patterns, but any conflict
between the legacy code and the AHRM is resolved in favor of the AHRM.

The key AHRM sections that govern color-clock accuracy are:

- [4.2 Display timing](../AHRM/4.%20ANTIC/2.%20Display%20timing.md) — 114
  machine cycles per scanline, PAL 312-line / 49.86 Hz frame.
- [4.14 Scan line timing](../AHRM/4.%20ANTIC/14.%20Scan%20line%20timing.md) —
  per-cycle DMA steal positions (refresh, display list, playfield, P/M),
  virtual DMA, and the event timing chart.
- [4.11 Playfield DMA](../AHRM/4.%20ANTIC/11.%20Playfield%20DMA.md) — fetch
  widths (narrow/normal/wide), HSCROL fetch-window delay, line buffer
  behavior, and mid-scanline DMACTL changes.
- [4.8 Non-maskable interrupts](../AHRM/4.%20ANTIC/8.%20Non-maskable%20interrupts.md) —
  DLI/VBI enable timing (NMIEN by cycle 7/8), DLI fires on the last scanline
  of a mode line, NMI dispatch earliest at cycle 10, missed-NMI window.
- [4.9 WSYNC](../AHRM/4.%20ANTIC/9.%20WSYNC.md) — CPU halt until cycle 105,
  DMA-induced restart delays, RMW edge cases.
- [4.13 Player/missile DMA](../AHRM/4.%20ANTIC/13.%20Player-missile%20DMA.md) —
  missile fetch at cycle 0, player fetches at cycles 2–5, one/two-line
  resolution addressing.
- [6.5 Player/missile graphics](../AHRM/6.%20CTIA-GTIA/5.%20Player-missile%20graphics.md) —
  shift-register triggering, mid-image size changes, color-clock resolution
  positioning.

## Scanline Timing Rules

Derived from the AHRM sections above, these are the concrete rules the
emulator must satisfy:

- One scanline is exactly 114 machine cycles. The next scanline cannot begin
  until the current one completes.
- Each color clock interleaves timed events, CPU progress, and visible output.
- The scanline timeline is `color burst → left border → playfield → right
  border`.
- Visible output reads live hardware state while pixels are emitted.
- DMA steals happen at the AHRM-specified fetch points (not as a bulk stall):
  refresh at cycle 25 then every 4 cycles, display list at cycle 1 (+ LMS at
  6–7), missile at cycle 0, players at cycles 2–5, playfield at mode-specific
  positions.
- Player/missile rendering is interleaved at color-clock granularity with the
  playfield path, not applied as a later whole-line overlay.
- DLI fires at the beginning of the last scanline of a DLI-enabled mode line;
  NMI dispatch begins at the first instruction boundary on cycle 10 or later.
- WSYNC halts the CPU until cycle 105, subject to DMA-induced delays of up to
  3 additional cycles.

## Implemented Behavior

These items are implemented in both modern ports:

- Active scanlines are owned by the draw path; next-line recursion is blocked.
- DLI / timer / serial events are allowed during rendering instead of being
  globally suppressed.
- Active visible lines use the AHRM `color burst → left border → playfield →
  right border` geometry.
- Non-wide and wide `HSCROL` lines keep the AHRM playfield cycle budget
  (fetch window delayed by one cycle per two HSCROL increments) instead of
  introducing extra-byte fetch behavior.
- ANTIC modes `2–F` use per-clock playfield loops with inline DMA steals at
  the AHRM-specified cycle positions. Character modes 2-7 and bitmap modes
  8-F consume playfield DMA through `stealDma()` for refresh contention
  tracking (one-cycle defer, further blocked drops per AHRM 4.14).
- Visible player/missile rendering is interleaved on the scanline timing path,
  with 16-bit priority buffers preserving GTIA Mode 10 pixel identity
  (`PRIO_M10_PM0-3`) through the full collision/priority pipeline.
- Blank lines and active-line background borders use live background color
  reads instead of a single scanline snapshot.
- Visible blank/background-only lines spend the first 6 color-burst clocks
  invisibly, then render the remaining 108 clocks with live background reads.

## Remaining Work

The remaining task is verification against real content and the AHRM timing
charts, not another large renderer rewrite.

### 1. Regression sweep against raster-effect content

Status: open

Run both ports against the existing display-list/raster test content and check
that DLI, HSCROL, PMG, and audio behavior match AHRM-specified timing under
the per-color-clock renderer.

Useful local content already in the tree:

- `disks/arkanoid (display list).atr`
- `disks/hard hat mack (display list).atr`
- `disks/jumpjet (display list).atr`
- `disks/miner 2049er (display list).atr`
- `disks/mr dos castle (display list).atr`
- `disks/polar pierre (display list).atr`
- `disks/rescue on fractalus (display list).atr`
- `disks/space shuttle (display list).atr`
- `disks/tomahawk (display list).atr`
- `disks/world championship karate (display list).atr`

### 2. AHRM timing-chart audit

Status: open

Cross-check the DMA timing charts in
[4.14 Scan line timing](../AHRM/4.%20ANTIC/14.%20Scan%20line%20timing.md)
against both cores for each ANTIC mode, playfield width, and HSCROL
configuration. Document any deviations found and resolve or accept them.

### 3. Localized title-specific differences

Status: open until the regression sweep is signed off

The March 2026 notes describe sampled display-list sweeps and PMG timing
rollout progress, but they do not yet record a full signoff pass for all
target content. Any differences found during that sweep should be documented
here briefly until they are resolved or accepted.

### 4. Final signoff

Status: open

This document can be removed once the regression sweep and AHRM timing-chart
audit are complete and the project no longer needs a dedicated verification
tracker.

## Compliance Summary

Status: implementation complete, verification open.

The current tree reflects the AHRM-specified scanline model in both modern
ports. What is still missing is a completed regression/signoff pass against
real content and a systematic cross-check against the AHRM DMA timing charts.

## Exit Criteria

This work is complete only when both `A8E` and `jsA8E` satisfy all of the
following:

- The implemented DMA steal positions, playfield fetch windows, and NMI/WSYNC
  timing match the AHRM timing charts and event deadlines.
- The existing display-list/raster-effect content has been checked in both
  ports without uncovering unresolved DLI, HSCROL, PMG, or audio regressions.
- Any localized title-specific differences found during that sweep are either
  fixed or explicitly documented as accepted behavior.
- The READMEs no longer need this file as a live verification tracker.
