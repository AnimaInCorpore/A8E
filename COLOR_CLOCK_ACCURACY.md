# Color-Clock Accuracy

Reference implementation: `legacy/A8E_experimental/Atari.c`

This document tracks compliance of `A8E/AtariIo.c` and `jsA8E/js/core/` with
the legacy per-color-clock scanline renderer. It is intentionally short and
status-focused.

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

## What Matches Today

These items are implemented in both modern ports:

- Active scanlines are owned by the draw path; next-line recursion is blocked.
- DLI / timer / serial events are allowed during rendering instead of being
  globally suppressed.
- ANTIC modes `2-F` now use per-clock playfield loops with inline DMA steals.
- Blank lines and active-line background borders use live background color
  reads instead of a single scanline snapshot.

That is meaningful progress, but it is not yet full legacy compliance.

## Current Non-Compliance

The review baseline is the current tree versus `legacy/A8E_experimental`.

### 1. Scanline geometry is still not legacy-accurate

Severity: high

Legacy computes the visible scanline budget as:

- `color burst`
- `left border cycles`
- `playfield cycles`
- `right border cycles`

with the destination pointer already positioned after the fixed HSYNC offset.
See `legacy/A8E_experimental/Atari.c` around the playfield geometry setup and
draw call.

Current C and JS instead derive a `renderStartX` in pixels and then spend
`16 + renderStartX / 4` clocks before entering the mode renderer.

Files:

- `legacy/A8E_experimental/Atari.c`
- `A8E/AtariIo.c`
- `jsA8E/js/core/playfield.js`

Effect:

- Normal-width and wide lines do not consume the same border/playfield clock
  breakdown as legacy.
- The timeline can still total 114 clocks, but the clock ownership of border
  versus playfield segments is different from the reference.

### 2. Non-wide HSCROL still changes playfield DMA timing incorrectly

Severity: high

Legacy HSCROL changes left-border timing and scroll pixel offset, but it does
not add an extra eight display bytes for narrow/normal playfields.

Current C and JS both still do that for non-wide HSCROL lines.

Files:

- `legacy/A8E_experimental/Atari.c`
- `A8E/AtariIo.c`
- `jsA8E/js/core/playfield.js`

Effect:

- Extra playfield bytes are fetched where legacy keeps the playfield cycle
  count fixed.
- This changes DMA timing and can shift when mid-scanline writes become
  visible.

### 3. Player/missile interleaving is implemented on visible scanlines

Severity: verification

Legacy interleaves playfield and player/missile work on every color clock from
the main frame loop.

Current native C and JS both resolve player/missile output from the per-color-
clock scanline draw path on visible lines.

Files:

- `legacy/A8E_experimental/Atari.c`
- `A8E/AtariIo.c`
- `jsA8E/js/core/antic.js`
- `jsA8E/js/core/playfield.js`
- `jsA8E/js/core/gtia.js`

Effect:

- Mid-scanline register writes can now affect PMG output on visible scanlines
  in both modern ports.
- Remaining work is verification against real raster content and any still-
  localized title-specific PMG differences.

### 4. Blank-line handling still does not match legacy color-burst behavior

Severity: medium

Legacy blank lines spend the color-burst clocks without painting visible
background pixels, then render the remainder of the line.

Current C and JS now spend the color-burst clocks without painting visible
background, but their remaining blank-line geometry is still not a literal
legacy match.

Files:

- `legacy/A8E_experimental/Atari.c`
- `A8E/AtariIo.c`
- `jsA8E/js/core/playfield.js`

Effect:

- Blank lines are now live-read and per-clock, which is better than the old
  snapshot fill, but they are still not a literal legacy match.

## Compliance Summary

Status: partial, not compliant yet.

Both modern ports now satisfy the scanline-ownership part of the port, but they
still diverge from legacy in two material timing areas:

- border/playfield clock geometry
- HSCROL fetch timing

Blank-line color-burst handling is a smaller but still real mismatch.

## Exit Criteria

This work is complete only when both `A8E` and `jsA8E` satisfy all of the
following against the legacy source:

- Active lines use the same color-burst, left-border, playfield, and
  right-border clock breakdown.
- HSCROL changes border timing and pixel alignment without introducing the
  current extra-byte fetch behavior on narrow/normal playfields.
- Player/missile rendering is interleaved on the active color-clock timeline,
  not applied after the scanline draw returns.
- Blank lines follow the legacy color-burst behavior as well as the live-read
  background behavior.
- Real-content regression checks confirm the expected DLI, HSCROL, PMG, and
  audio behavior.
