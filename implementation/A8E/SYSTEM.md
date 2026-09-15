# Atari I/O and System Glue

> Hardware emulation reference: Before implementing any Atari 800 XL PAL/NTSC hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `A8E/AtariIo.c`, `A8E/AtariIo.h`, `A8E/A8E.c`
- Purpose: connect chips, run main emulation loop, and handle boot/device I/O flow.
- Status: verified on 2026-09-14 (`implemented`), including native AHRM
  130XE, RAMBO, COMPY, and initial Ultimate1MB memory expansion.
- Notes: central integration point for ROM, disk, interrupts, scanline-timed events, platform runtime behavior, and command-line memory-profile selection.
- Issues: disassembly mode (F12, when enabled) is one-way until emulator
  restart. U1MB firmware-dependent BIOS/flash/RTC/PBI features are not
  emulated.
- Todo: update notes when loop/timing ownership moves between modules.

