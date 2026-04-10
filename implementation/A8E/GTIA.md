# GTIA

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `A8E/Gtia.c`, `A8E/Gtia.h`, `A8E/AtariIo.c`
- Purpose: render player/missile behavior and resolve priorities/collisions.
- Status: updated on 2026-04-09 (`implemented`).
- Notes: register writes are handled in `Gtia.c`; color resolve, player/missile priority, and collision updates are applied during per-line draw in `AtariIo.c`. PMG DMA is managed by the unified `AtariIo_FetchPmgDmaCycle` helper, called from `AtariIo_DrawClockAction` at the documented cycle slots (missile at cycle 0, players 0–3 at cycles 2–5). `VDELAY` masks even-scanline fetches instead of shifting PMG memory rows; missile DMA stays active when player DMA is enabled (AHRM 4.13). Interleaved PMG rendering now uses a per-line shift-register/state-machine model: a trigger ORs new latch data into the active shifter, resets the size state to `%00`, and allows repeated rightward same-line retriggers without moving an already-started image. PM horizontal origin also includes the GTIA/ANTIC coordinate bias from AHRM 6.2, so HPOS `$30` aligns with the normal playfield left edge. `PMBASE` is read live at each DMA cycle — a DLI write between cycles 5 and 0 of adjacent scanlines takes effect cleanly on the next scanline; a write during cycles 0–5 causes a mixed-base fetch for that scanline (matching real hardware behavior).
- Issues: the interleaved PMG path still reconstructs the hidden portion of a line from current register state when the first visible span is drawn, rather than replaying every earlier same-line register write cycle by cycle.
- Todo: keep collision/priorities parity checks with `jsA8E/`.
