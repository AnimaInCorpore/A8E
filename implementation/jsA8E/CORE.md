# Core Emulation

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `jsA8E/js/core/cpu.js`, `jsA8E/js/core/cpu_tables.js`, `jsA8E/js/core/antic.js`, `jsA8E/js/core/gtia.js`, `jsA8E/js/core/pokey.js`, `jsA8E/js/core/pokey_sio.js`, `jsA8E/js/core/memory.js`, `jsA8E/js/core/io.js`, `jsA8E/js/core/atari.js`, `jsA8E/js/core/hw.js`, `jsA8E/js/core/playfield/playfield.js`, `jsA8E/js/core/playfield/renderer_base.js`, `jsA8E/js/core/state.js`, `jsA8E/js/core/snapshot_codec.js`
- Purpose: mirror Atari hardware behavior in JavaScript with timing-compatible execution.
- Status: updated on 2026-04-08 (`partial`).

## Architecture

CPU/ANTIC/GTIA/POKEY execution is coordinated through shared machine state. `playfield/playfield.js` owns scanline orchestration, scratch-buffer setup, and active-line geometry. `playfield/renderer_base.js` owns `clockAction`, the DMA scheduler, CHBASE timing, PM interleave, and shared blank-line/background helpers. Per-mode pixel generators live in `playfield/mode_2_3.js`, `mode_4_5.js`, `mode_6_7.js`, and `mode_8_f.js`.

State is created up-front by `state.js` into a fixed `ioData` shape. ANTIC and the playfield renderer rely on this fixed shape — `nmiTiming`, `chbaseTiming`, and per-line DMA buffers are never rebuilt lazily in hot paths. Media state is normalized through `getMediaState()` before reset/mount/snapshot work.

## Clock Domains

`io.clock` is the display beam clock (color clocks); `ctx.cycleCounter` is the CPU cycle counter. DLI deadlines use `io.clock`; timer/SIO deadlines use `cycleCounter`. The scheduler tracks separate beam/master wake thresholds (`ioBeamTimedEventCycle` / `ioMasterTimedEventCycle`) so scanline rendering and CPU execution each poll the correct domain. During `drawLine`, `io.clock` is the authoritative reference for all timed events.

## ANTIC / Display List

- DLI asserts at cycle 8 of the last scanline of a DLI-enabled mode line (AHRM 4.8). The NMI handler begins at the first instruction boundary at cycle 10 or later.
- Same-scanline `NMIEN` writes: cycle-7 write enables the current DLI (with one-beam-cycle delay to the CPU); cycle-8 write can still suppress it; NMIST latches unconditionally regardless of NMIEN.
- VBI fires at the start of scan line 248 (AHRM 4.8).
- VCOUNT flips to the next scanline on cycle 111 of the previous line (AHRM 4.10), including the one-cycle PAL end-of-frame anomaly (`$9C` on the last scanline's cycle 111 before wrapping to `$00`).
- WSYNC stalls the CPU to cycle 105 (`WSYNC_CYCLE`); writes ≤ cycle 103 target the current line, writes ≥ cycle 104 (`WSYNC_BOUNDARY`) target the next line (AHRM 4.9).
- JVB decode ignores DLI/VSCROL bits; JVB+DLI replay re-arms one DLI per scanline until VBL. NMIST DLI bit follows AHRM lifetime (cleared at line 248 or NMIRES, not every scanline).
- ANTIC display list command bits are named constants: `ANTIC_DLI_BIT`, `ANTIC_LMS_BIT`, `ANTIC_MODE_BITS`, `ANTIC_JUMP_INSTRUCTION`, `ANTIC_JVB_INSTRUCTION`, etc.

## Playfield DMA and Active-Line Geometry

Active-line geometry anchors the unscrolled playfield window to the corrected AHRM 4.14 width starts (clock 26/18/10 after HSYNC for narrow/normal/wide). HSCROL-promoted windows delay those baselines by one cycle per two color clocks of scroll.

DMA steal positions (AHRM 4.14): refresh at cycles 25/29/33/37/41/45/49/53/57 (one-cycle deferral; further blocked refreshes drop); display list instruction at cycle 1; LMS/jump address at cycles 6–7; missile DMA at cycle 0; player DMA at cycles 2–5 (AHRM 4.13).

Playfield DMA is scheduled per line cycle (`scheduledPlayfieldDma` array in `drawLine` state), not charged as a bulk stall. First-row display/name fetches fill a reusable 48-byte line buffer; repeated scanlines reuse buffered bytes. Character modes 2–7 place the character-data fetch in the `+3` cycle slot after the display/name fetch. Late fetches after cycle 105 use the virtual CPU bus path: the active CPU bus address is sampled even when it is `$0000` (JavaScript truthiness is not used as a validity check), and deferred-refresh overlaps return pulled-up `$FF` per AHRM 4.14.

## Character Modes (ANTIC 2–7)

- **CHBASE** (`$D409`): delayed latch in `currentCharacterBaseRegister()` (`renderer_base.js`). When `SRAM[IO_CHBASE]` changes, the new value takes effect 2 clock cycles later, matching AHRM 4.4. The active value is used by all character renderers; `io.chbaseTiming` carries `rawValue`, `activeValue`, `pendingValue`, and `pendingClock`.
- **CHACTL** (`$D401`): latched once at scanline start in all text modes (2/3/4/5/6/7). A DLI write to CHACTL only affects the next scanline, not the remainder of the current one.
- Modes 4/5 use a 1K-aligned CHBASE mask (`& 0xfc00`); modes 6/7 use a 512-byte mask (`& 0xfe00`).
- Modes 5 and 7 always steal character-data DMA on every scanline (doubled lines are not a special case).
- Mode F only steals bitmap DMA on the first scanline of a stretched line.
- Vertical reflection (CHACTL bit 2) is applied in all modes 2–7.
- Modes 2/3: bit 7 of the character name is decoded via `decodeTextModeCharacter` using CHACTL bits 0 (blank) and 1 (invert). Mode 4/5: bit 7 selects the alternate color set (PF3 substitution) directly without routing through `decodeTextModeCharacter`, matching real hardware. Modes 6/7: upper two bits of the character name select the foreground color index; the remaining 6 bits are the character code.

## Player-Missile Graphics

PMG DMA fetches happen in `fetchPmgDmaCycle` (in `gtia.js`, called from `clockAction`): missile at lineCycle 0, players 0–3 at lineCycles 2–5. `VDELAY` masks per-sprite fetches on even scan lines (holds the previous latch); it does not shift PMG memory rows. Player DMA keeps the missile slot active regardless (AHRM 4.13).

`PMBASE` is read live at each DMA cycle. This means a DLI write to PMBASE between cycles 5 and 0 of adjacent scanlines applies cleanly; a write during cycles 0–5 of an active scanline will cause a mixed-base fetch for that scanline (missiles use old base, late players use new base). This matches real hardware behavior.

PM graphics are drawn interleaved with playfield pixels via `drawPlayerMissilesClock` called from `clockAction` during `drawLine`. Priority compositing uses a `Uint16Array` priority buffer; all player/missile draw functions mask with `& 0xffff`. Priority constants `PRIO_PF3` and `PRIO_M10_PM0-3` are wired through the full config chain (`atari.js → antic.js → A8EPlayfield → A8EPlayfieldRenderer → renderer_base → mode_*.js`). HSCROL-clipped lines preserve already-composited PMG pixels in both the aperture fill and the trailing border fill.

## POKEY / Pot Scan

Pot scans track an accumulated counter rather than a fixed 28-cycle divider. Slow scans advance once per scanline; fast scans advance once per machine cycle and can expose the `229` terminal count (held for one extra cycle before forcing `ALLPOT` low). Scans run through the terminal hold cycle even after `ALLPOT` has cleared. `SKCTL` mode changes resync the active scan counter from the current cycle. JS snapshots preserve mid-scan state (`lastCycle`, `terminalCycle`, current count).

## CPU

All documented and undocumented opcodes are implemented, including the fake6502/Lorenz suite: `ANE`, `LXA`, `ARR`, `LAS`, `SHA`, `SHX`, `SHY`, `TAS`, `RRA`, `SBX`, with the `SHX`/`SHY` write-address glitch and the `RRA`/`ISC` decimal-cycle cancellation.

## Snapshots

Snapshot saves default to advancing paused execution to the next frame boundary before encoding, avoiding unstable mid-frame raster state (`timing: "exact"` opts out). Payloads capture CPU registers/counters, RAM + shadow RAM, video buffers, `ioData` timing/custom-chip state (including `nmiTiming`, `chbaseTiming`, POKEY pot-scan state, ANTIC timing latch), mounted media/ROM bytes, debugger trace/breakpoints, input bookkeeping, and H: device HostFS file set plus open-channel state.

## XEX Preflight

XEX mount preflight simulates the file's writes in load order, so a segment that writes `D301` can bank ROM out before later bytes target extended address ranges. Writes that are still ROM-backed at the time they execute are rejected. The default reset `PORTB` value is derived from the real `IO_PORTB` initialization entry (`$FD`) and inherits the `Option-on-Start` policy when no explicit override is supplied.

## Issues
- Broader real-content raster verification (chained DLIs, PMG priority ladders, wide-playfield artifacts) is still incomplete.
- VBI-side `NMIEN` gating and `VSCROL`/DLI same-line deadlines are not yet modeled.

## Todo
- Finish the raster-content sweep and extend the ANTIC deadline pass to VBI and `VSCROL`.
