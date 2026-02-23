# Atari I/O and System Glue

- Files: `A8E/AtariIo.c`, `A8E/AtariIo.h`, `A8E/A8E.c`
- Purpose: connect chips, run main emulation loop, and handle boot/device I/O flow.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: central integration point for ROM, disk, interrupts, scanline-timed events, and platform runtime behavior.
- Issues: disassembly mode (F12, when enabled) is one-way until emulator restart.
- Todo: update notes when loop/timing ownership moves between modules.

