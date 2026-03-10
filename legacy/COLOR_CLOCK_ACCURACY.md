# Color-Clock Accuracy

Reference implementation: `legacy/A8E_experimental/Atari.c`

This document tracks signoff status for `A8E/AtariIo.c` and `jsA8E/js/core/`
against the legacy per-color-clock scanline renderer. The implementation pass
is in place; the remaining work is verification.

## Legacy Rules

The legacy renderer is the behavioral target. The important rules are:

- One active scanline owns its full 114 color clocks before the next scanline
  can begin.
- Each color clock interleaves timed events, CPU progress, and visible output.
- The scanline timeline is `color burst -> left border -> playfield -> right
  border`.
- Visible output reads live hardware state while pixels are emitted.
- DMA steals happen at the actual fetch points, not as a bulk stall.
- Player/missile rendering is interleaved at color-clock granularity with the
  playfield path, not applied as a later whole-line overlay.

Key legacy references:

- `ATARI_LINE_ACTION()`
- `ATARI_CLOCK_ACTION()`
- `Atari_DrawBlank()`
- `Atari_DrawMode2()`
- `Atari_DrawModeF()`
- `AtariExecuteOneFrame()`

## Implemented Behavior

These items are implemented in both modern ports:

- Active scanlines are owned by the draw path; next-line recursion is blocked.
- DLI / timer / serial events are allowed during rendering instead of being
  globally suppressed.
- Active visible lines now use the legacy-style `color burst -> left border ->
  playfield -> right border` geometry.
- Non-wide and wide `HSCROL` lines now keep the legacy playfield cycle budget
  instead of introducing the old extra-byte fetch behavior.
- ANTIC modes `2-F` now use per-clock playfield loops with inline DMA steals.
- Visible player/missile rendering is interleaved on the scanline timing path.
- Blank lines and active-line background borders use live background color
  reads instead of a single scanline snapshot.
- Visible blank/background-only lines spend the first 6 color-burst clocks
  invisibly, then render the remaining 108 clocks with live background reads.

## Remaining Work

The remaining task is verification against real content, not another large
renderer rewrite.

### 1. Regression sweep against raster-effect content

Status: open

Run both ports against the existing display-list/raster test content and check
that DLI, HSCROL, PMG, and audio behavior still match expectations under the
new per-color-clock renderer.

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

### 2. Localized title-specific differences

Status: open until the regression sweep is signed off

The March 2026 notes describe sampled display-list sweeps and PMG timing
rollout progress, but they do not yet record a full signoff pass for all
target content. Any differences found during that sweep should be documented
here briefly until they are resolved or accepted.

### 3. Final signoff

Status: open

This document can be removed once the regression sweep is complete and the
project no longer needs a dedicated verification tracker.

## Compliance Summary

Status: implementation complete, verification open.

The current tree reflects the intended legacy-style scanline model in both
modern ports. What is still missing is a completed regression/signoff pass
against real content.

## Exit Criteria

This work is complete only when both `A8E` and `jsA8E` satisfy all of the
following against the legacy source:

- The existing display-list/raster-effect content has been checked in both
  ports without uncovering unresolved DLI, HSCROL, PMG, or audio regressions.
- Any localized title-specific differences found during that sweep are either
  fixed or explicitly documented as accepted behavior.
- The READMEs no longer need this file as a live verification tracker.
