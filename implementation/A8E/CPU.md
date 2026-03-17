# CPU (6502)

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `A8E/6502.c`, `A8E/6502.h`
- Purpose: emulate 6502 instruction execution and cycle behavior.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: opcode handling and flags are cycle-driven and act as base timing for other chips.
- Issues: none tracked.
- Todo: keep CPU timing notes aligned with `jsA8E/` behavior changes.
