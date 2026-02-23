# GTIA

- Files: `A8E/Gtia.c`, `A8E/Gtia.h`, `A8E/AtariIo.c`
- Purpose: render player/missile behavior and resolve priorities/collisions.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: register writes are handled in `Gtia.c`; color resolve, player/missile priority, and collision updates are applied during per-line draw in `AtariIo.c`.
- Issues: none tracked.
- Todo: keep collision/priorities parity checks with `jsA8E/`.

