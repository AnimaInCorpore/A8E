# CPU (6502)

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `A8E/6502.c`, `A8E/6502.h`
- Purpose: emulate 6502 instruction execution and cycle behavior.
- Status: verified on 2026-03-26 (`implemented`).
- Notes: opcode handling and flags are cycle-driven and act as base timing for other chips. The fake6502-compatible undocumented opcode set now covers `ANE`/`LXA` plus `ARR`/`LAS`/`SHA`/`SHX`/`SHY`/`TAS`/`RRA`/`SBX`, including the `SHX`/`SHY` store-address quirk and the `RRA`/`ISC` decimal-cycle cancel so the Lorenz opcode suite matches the upstream reference behavior.
- Issues: none tracked.
- Todo: keep CPU timing notes aligned with `jsA8E/` behavior changes and future undocumented-opcode additions.
