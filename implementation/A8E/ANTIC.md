# ANTIC

- Files: `A8E/Antic.c`, `A8E/Antic.h`, `A8E/AtariIo.c`, `A8E/AtariIo.h`
- Purpose: handle display list processing, DMA timing, and display NMIs.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: register accessors are in `Antic.c`; scanline progression, display list fetch, DLI scheduling, and VBI timing are driven from the timed-event path in `AtariIo.c`. DLI deadlines are now anchored to the in-line beam clock (`llCycle`) again so `WSYNC`-driven raster effects line up with the playfield fetch position instead of drifting with CPU/DMA cycle steals.
- Issues: none tracked.
- Todo: document any edge-case DMA stalls when touched.
