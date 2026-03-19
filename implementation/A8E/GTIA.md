# GTIA

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `A8E/Gtia.c`, `A8E/Gtia.h`, `A8E/AtariIo.c`
- Purpose: render player/missile behavior and resolve priorities/collisions.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: register writes are handled in `Gtia.c`; color resolve, player/missile priority, and collision updates are applied during per-line draw in `AtariIo.c`. PMG fetch timing now matches the JS core and AHRM VDELAY behavior: even-scanline fetches are masked instead of shifting the source row, and missile DMA stays active when player DMA is enabled.
- Issues: none tracked.
- Todo: keep collision/priorities parity checks with `jsA8E/`.
