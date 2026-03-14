# ANTIC

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `A8E/Antic.c`, `A8E/Antic.h`, `A8E/AtariIo.c`, `A8E/AtariIo.h`
- Purpose: handle display list processing, DMA timing, and display NMIs.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: register accessors are in `Antic.c`; scanline progression, display list fetch, DLI scheduling, and VBI timing are driven from the timed-event path in `AtariIo.c`. DLI deadlines are anchored to the in-line beam clock (`llCycle`) again, but the timed-event scheduler now keeps separate beam/master wake thresholds so raster DLIs follow the playfield fetch position without regressing longer-running vertical timing or master-clock POKEY/SIO events. JVB detection now ignores DLI/vertical-scroll bits (`$41/$C1/...` via masked decode), JVB+DLI replay now re-arms one DLI per scanline until VBL, and `NMIST` bit 7 follows AHRM lifetime semantics (cleared at line 248 or `NMIRES`, not every scanline).
- Issues: none tracked.
- Todo: document any edge-case DMA stalls when touched.
