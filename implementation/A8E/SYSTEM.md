# Atari I/O and System Glue

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `A8E/AtariIo.c`, `A8E/AtariIo.h`, `A8E/A8E.c`, `A8E/tests/system_probe.c`
- Purpose: connect chips, run main emulation loop, and handle boot/device I/O flow.
- Status: verified on 2026-09-22 (`implemented`).
- Notes: central integration point for ROM, disk, interrupts, scanline-timed events, and platform runtime behavior. `AtariIo_SetIoWithMirrors` installs each register handler at every mirror of its chip page (GTIA every `$20` bytes, POKEY and ANTIC every `$10`, PIA every 4; AHRM 2.5, 4.1, 5.1, 6.1); the handlers use fixed register addresses, so mirrors share the canonical state. `RAM[$D000-$D7FF]` starts filled with `$FF`, so undecoded pages (`$D1xx`, `$D5xx-$D7xx`) and unassigned ANTIC/POKEY slots read the pulled-up XL bus (AHRM 2.3); write-only GTIA slots `$D015-$D01E` read `$0F`, and NMIST bits 4-0 read 1. `AtariIoKeyboardEvent` ignores SDL key repeats (POKEY has no auto-repeat; the OS repeats while SKSTAT bit 2 is low, AHRM 5.8), sends Shift+arrow as the Atari cursor keys `$8E/$8F/$86/$87` and releases them on key-up, and maps the SDL2 special keys F1 (Help), F6/Caps Lock (Caps), F7 (Inverse) and Esc like jsA8E. F5 runs `AtariIoWarmReset`, the XL Reset key (AHRM 2.4): ANTIC NMIEN/DMACTL and the NMIEN timing latches clear (AHRM 4.1), `Pia_Reset` maps the OS ROM back in, then the 6502 fetches the OS reset vector; RAM is kept, so the OS warm-starts even after a program banked the OS out. TRIG3 reads 0 (no cartridge, AHRM 2.8), so the OS warm start no longer depends on the CARTCK checksum.
- Issues: disassembly mode (F12, when enabled) is one-way until emulator restart.
- Todo: update notes when loop/timing ownership moves between modules.

