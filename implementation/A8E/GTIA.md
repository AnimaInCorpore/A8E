# GTIA

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `A8E/Gtia.c`, `A8E/Gtia.h`, `A8E/AtariIo.c`
- Purpose: render player/missile behavior and resolve priorities/collisions.
- Status: updated on 2026-04-08 (`implemented`).
- Notes: register writes are handled in `Gtia.c`; color resolve, player/missile priority, and collision updates are applied during per-line draw in `AtariIo.c`. PMG DMA is managed by the unified `AtariIo_FetchPmgDmaCycle` helper, called from `AtariIo_DrawClockAction` at the documented cycle slots (missile at cycle 0, players 0–3 at cycles 2–5). `VDELAY` masks even-scanline fetches instead of shifting PMG memory rows; missile DMA stays active when player DMA is enabled (AHRM 4.13). `PMBASE` is read live at each DMA cycle — a DLI write between cycles 5 and 0 of adjacent scanlines takes effect cleanly on the next scanline; a write during cycles 0–5 causes a mixed-base fetch for that scanline (matching real hardware behavior).
- Issues: none tracked.
- Todo: keep collision/priorities parity checks with `jsA8E/`.
