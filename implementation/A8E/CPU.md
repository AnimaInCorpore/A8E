# CPU (6502)

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `A8E/6502.c`, `A8E/6502.h`, `A8E/tests/cpu_probe.c`
- Purpose: emulate 6502 instruction execution and cycle behavior.
- Status: verified on 2026-09-22 (`implemented`).
- Notes: opcode handling and flags are cycle-driven and act as base timing for other chips. The fake6502-compatible undocumented opcode set covers `ANE`/`LXA` plus `ARR`/`LAS`/`SHA`/`SHX`/`SHY`/`TAS`/`RRA`/`SBX`, including the `SHX`/`SHY` store-address quirk. `$EB` is an alias of `SBC #imm`. The 12 KIL/JAM opcodes (`$02`, `$12`, ..., `$F2`) set `cHaltedFlag`: the CPU stops fetching, ignores NMI/IRQ, and only advances the cycle counter until `_6502_Reset` (AHRM 3.5). Decimal mode follows the NMOS 6502 (AHRM 3.2): `ADC` takes N/V from the intermediate sum after the low-nibble fix-up and Z from the binary sum; `SBC` sets all flags from the binary result; neither takes an extra cycle (that is 65C02 behavior), so `RRA`/`ISC` keep their base timing too. `cIrqPendingFlag` is the IRQ line level driven by POKEY (AHRM 5.7): the CPU takes the IRQ at an instruction boundary while it is set and I is clear, without consuming it, so an unacknowledged source re-enters after RTI and no stale IRQ bursts remain after the source is cleared. `_6502_Reset` leaves the line alone because POKEY is not reset by the Reset key.
- Issues: none tracked.
- Todo: keep CPU timing notes aligned with `jsA8E/` behavior changes and future undocumented-opcode additions.
