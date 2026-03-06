# Color-Clock Accuracy for Playfield Rendering

## Background

The Atari 8-bit hardware outputs one pixel per color clock. ANTIC performs DMA during
the active display portion of each scanline, fetching one byte every few color clocks
(depending on mode). While ANTIC is doing DMA, the 6502 is stalled. Registers written
by the CPU during the HBlank period of a scanline can therefore affect pixels on that
same scanline if they are written before ANTIC starts outputting those pixels.

The project contains three relevant implementations at different levels of accuracy:

| Implementation | Location | Cycle accuracy |
|---|---|---|
| Legacy experimental | `legacy/A8E_experimental/Atari.c` | Per-color-clock (reference) |
| C emulator | `A8E/AtariIo.c` | Scanline-granular |
| JS emulator | `jsA8E/js/core/playfield.js` + `antic.js` | Scanline-granular |

---

## Reference Architecture: `legacy/A8E_experimental`

`legacy/A8E_experimental/Atari.c` is the cycle-accurate reference implementation.
Its core model is two macros that run at every color clock of every scanline:

```c
#define ATARI_CLOCK_ACTION() \
{ \
    if(pAtariData->llEventCycle <= pAtariData->llCycle) \
        Atari_TimedEvent(pContext); \
    if(pContext->llCycleCounter < pAtariData->llCycle) \
        _6502_Execute(pContext); \
    pAtariData->llCycle++; \
}

#define ATARI_LINE_ACTION() \
{ \
    pAtariData->lDisplayLine++; \
    RAM[IO_VCOUNT] = pAtariData->lDisplayLine >> 1; \
    RAM[IO_NMIRES_NMIST] &= ~NMI_DLI; \
    pContext->llCycleCounter += 9; \
}
```

Every draw function (`Atari_DrawMode2`, `Atari_DrawModeF`, etc.) iterates one
color clock at a time through three regions of each scanline: left border,
playfield, right border. At the end of each color clock `ATARI_CLOCK_ACTION()`
is called, giving the CPU a chance to execute. Hardware registers are read
**live** at each pixel directly from `SRAM[]` — there is no snapshotting:

```c
// Inside Atari_DrawMode2, playfield region — per-cycle loop:
if(cData & cMask)
    *pPixel++ = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
else
    *pPixel++ = SRAM[IO_COLPF2];
// ...
ATARI_CLOCK_ACTION();   // CPU may execute here; registers may change
```

DMA steal cycles are modeled by directly incrementing `pContext->llCycleCounter`
during the character/data fetch inside the playfield loop, which prevents the CPU
from executing during those cycles:

```c
cCharacter = RAM[sDisplayMemoryAddress];
pContext->llCycleCounter++;   // DMA steal: CPU cannot execute this cycle
```

This means any register write the CPU makes lands in `SRAM[]` and is immediately
visible to the very next pixel output — full color-clock accuracy with no queuing
mechanism needed.

---

## What Is Already Cycle-Accurate (C and JS)

Both the C emulator and the JS emulator implement scanline-granular accuracy,
which correctly models:

| Aspect | C (`AtariIo.c`) | JS (`antic.js` / `playfield.js`) | Status |
|---|---|---|---|
| `drawLineCycle` init | `CYCLES_PER_LINE + 16` | `CYCLES_PER_LINE + 16` | Identical |
| `displayListFetchCycle` init | `CYCLES_PER_LINE` | `CYCLES_PER_LINE` | Identical |
| Per-scanline cycle advance | `+= CYCLES_PER_LINE` | `+= CYCLES_PER_LINE` | Identical |
| CPU stall for DMA | `_6502_STALL(bytesPerLine)` | `CPU.stall(ctx, bytesPerLine)` | Equivalent |
| WSYNC target cycle | `llDisplayListFetchCycle` | `io.displayListFetchCycle` | Equivalent |
| DLI scheduling | `cycleCounter + lineDelta * CPL` | `cycleCounter + lineDelta * CPL` | Identical |
| Mode draw functions 2..F | Full per-byte loop | Full per-byte loop (port) | Equivalent |
| Border fill after draw | Two `AtariIo_FillRect` calls | Two explicit fill loops | Equivalent |

Note: the JS implementation applies `CHACTL` more uniformly than the C source —
all text modes use `decodeTextModeCharacter`, whereas C Mode 2 uses a raw bit-7
check. The JS behaviour is more hardware-correct.

---

## What Is Missing: Sub-Scanline Register Sensitivity

Both the C and JS emulators snapshot all hardware registers at `drawLineCycle`
time and hold them constant for the entire scanline. The legacy experimental
source reads `SRAM[]` live at every pixel. The gap enables:

- Horizontal color splits within a single scanline (COLPFx, COLBK)
- Per-line PRIOR / GTIA-mode changes without a DLI
- Fine-grained HSCROL adjustments timed to the pixel clock

---

## Implementation Plan

The goal is to bring the C emulator and the JS emulator up to the per-color-clock
model established by `legacy/A8E_experimental/Atari.c`. The approach for each is
described below.

### Step 1 — Introduce a per-color-clock render loop

Replace the current scanline-atomic model with the experimental source's
interleaved model: iterate one color clock at a time through HBlank, left border,
playfield, and right border, and give the CPU an opportunity to execute after each
clock.

**C — `A8E/AtariIo.c`:**

Introduce a `DRAW_CLOCK_ACTION()` macro equivalent to `ATARI_CLOCK_ACTION()` from
the experimental source. Restructure `AtariIoDrawLine` to call the mode-specific
draw function in a per-clock loop rather than a batch. The existing
`_6502_STALL(bytesPerLine)` bulk stall is replaced by incremental
`pContext->llCycleCounter++` steps during DMA fetch, matching the experimental
source's approach.

**JS — `jsA8E/js/core/playfield.js` + `jsA8E/js/core/cpu.js`:**

Introduce a `clockAction(ctx)` helper equivalent to `ATARI_CLOCK_ACTION()`:

```js
function clockAction(ctx) {
  const io = ctx.ioData;
  if (ctx.ioCycleTimedEventCycle <= io.clock) ioCycleTimedEvent(ctx);
  if (ctx.cycleCounter < io.clock) CPU.executeOne(ctx);
  io.clock++;
}
```

This requires a `CPU.executeOne` entry point that runs a single instruction and
returns (the current `CPU.execute` runs a full time-slice). Add `io.clock` as the
running per-color-clock counter, initialised to `drawLineCycle - CYCLES_PER_LINE`
at the start of each frame.

### Step 2 — Read registers live in mode functions

Remove register snapshots from all mode functions. Replace pre-computed color
locals with direct `sram[IO_COLPFx]` reads at each pixel output, matching the
experimental source. For example in Mode 2 (normal PRIOR mode):

```js
// Before (snapshotted):
const c1 = inverse ? c1Inverse : c1Normal;
dst[dstIndex] = c1;

// After (live read):
dst[dstIndex] = (data & mask)
  ? (sram[IO_COLPF2] & 0xf0) | (sram[IO_COLPF1] & 0x0f)
  : sram[IO_COLPF2];
```

The live reads are only slightly more expensive than local variable accesses —
typed array indexing in JS is fast. The same change applies to all modes in both
the C and JS implementations.

### Step 3 — Model DMA steals as cycle-counter increments

Replace the bulk `CPU.stall(ctx, bytesPerLine)` / `_6502_STALL(bytesPerLine)`
with per-fetch-cycle `ctx.cycleCounter++` / `pContext->llCycleCounter++` at the
point where each display byte is read from RAM, matching lines 883 and 895 of
the experimental source. The `clockAction` / `DRAW_CLOCK_ACTION` call at the end
of each color clock then naturally prevents CPU execution during stolen cycles.

### Step 4 — Left and right border regions

The HBlank and border regions also run through `clockAction` one cycle at a time,
outputting background color live from `sram[IO_COLBK]` and `sram[IO_PRIOR]` at
each clock. This is required for PRIOR mid-scanline splits that extend into the
border area. Reference: `Atari_DrawBlank` and the left/right border loops inside
each mode function in the experimental source.

### Step 5 — HSCROL

HSCROL is latched by ANTIC at the very start of the DMA window for the current
scanline. Reading it once at the start of the playfield region (not per clock)
correctly models this. No change from the current behavior is needed here; verify
only.

### Step 6 — `CPU.executeOne` prerequisite (JS only)

The interleaved model requires the ability to execute exactly one CPU instruction
per call. The current `CPU.execute` runs until a cycle budget is exhausted. A
`CPU.executeOne(ctx)` variant that runs one instruction and returns is needed
before Step 1 can be completed in the JS emulator.

---

## Priority Order

1. Step 6 (JS) — `CPU.executeOne` — prerequisite for everything else in JS
2. Step 1 — Per-clock loop structure in both C and JS
3. Step 3 — DMA steal modeled as incremental counter increments
4. Step 2, Mode 2 — live register reads; most common text mode
5. Step 2, Mode F — live register reads; high-res bitmap
6. Step 2, remaining modes — repeat the same pattern
7. Step 4 — Border regions with live register reads
8. Step 5 — HSCROL latch verification (expected: no change needed)

---

## Progress

### Legacy experimental (`legacy/A8E_experimental/Atari.c`)

- [x] Per-color-clock render loop (`ATARI_CLOCK_ACTION`)
- [x] Live register reads at every pixel
- [x] DMA steals modeled as `llCycleCounter++`
- [x] Left/right border regions run through clock loop
- [x] CPU interleaved with rendering

### C emulator (`A8E/AtariIo.c`)

- [ ] **Step 1** — Per-color-clock render loop introduced; `DRAW_CLOCK_ACTION`
  macro added; scanline-atomic batch replaced
- [ ] **Step 2** — Live `SRAM[]` reads replace snapshotted color locals in all
  `AtariIo_DrawLineModeX` functions
- [ ] **Step 3** — DMA steals modeled as `llCycleCounter++` per fetch; bulk
  `_6502_STALL` removed
- [ ] **Step 4** — Left/right border regions iterate per clock with live reads
- [ ] **Step 5** — HSCROL latch behavior verified (expected: no change needed)

### JS emulator (`jsA8E/js/core/`)

- [ ] **Step 6** — `CPU.executeOne(ctx)` added to `cpu.js`
- [ ] **Step 1** — `clockAction` helper added; per-clock loop replaces
  scanline-atomic dispatch in `playfield.js`; `io.clock` counter introduced
- [ ] **Step 2** — Live `sram[]` reads replace snapshotted color locals in all
  `drawLineModeX` functions
- [ ] **Step 3** — DMA steals modeled as `ctx.cycleCounter++` per fetch;
  `CPU.stall` bulk call removed
- [ ] **Step 4** — Left/right border regions iterate per clock with live reads
- [ ] **Step 5** — HSCROL latch behavior verified (expected: no change needed)
