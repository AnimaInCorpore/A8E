# PIA

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `A8E/Pia.c`, `A8E/Pia.h`, `A8E/tests/system_probe.c`, `A8E/tests/memory_expansion_probe.c`
- Purpose: manage port control and ROM/bank switching control paths.
- Status: verified on 2026-09-22 (`partial`).
- Notes: port state affects system mapping and input/control behavior. PORTA/PORTB reach the direction register or the I/O register depending on PACTL/PBCTL bit 2. Port A keeps ORA in `SRAM[IO_PORTA]`, DDRA in `cValuePortA`, and the joystick input in `RAM[IO_PORTA]`; a data-mode read returns `input & (ORA | ~DDRA)`, so output bits read as the AND of ORA and the external line (AHRM 2.5, needed by Caverns of Mars). ORA, DDRA and PACTL power on as `$00` (AHRM 14.5). PACTL/PBCTL read back bits 0-5 as written (AHRM 14.5). Port B keeps DDRB in `cValuePortB` and ORB in `cOutputPortB`; `Pia_PortBPins` gives the pins, ORB on outputs and the `$FF` pull-ups on inputs, which is both what a data-mode read returns and what drives the memory map (AHRM 2.5). `Pia_ApplyPortB` maps the ROMs and the extended memory window for the pins: BASIC only with bit 1 low and no CPU window reusing it, self-test only with bit 7 low, the OS ROM on and no CPU window reusing bit 7 (AHRM 2.6, 2.7 Table 1). `Pia_SwitchCpuWindow` swaps the selected 16K bank into `$4000-$7FFF`; `pAnticWindow` points ANTIC at its bank when its window is on (bit 5 on 130XE/COMPY, bit 4 on RAMBO profiles). `Pia_Reset` (Reset key) clears every register, so all port B lines become pulled-up inputs: OS ROM in, BASIC, self-test and the expansion windows out (AHRM 2.4, 2.5, 2.6).
- Issues:
  - The floating-input decay of AHRM 2.5 is not modeled; port B inputs always read the pull-ups.
  - The CA1/CA2/CB1/CB2 interrupt flags (PACTL/PBCTL bits 7-6) and the PIA IRQ line are not modeled.
- Todo: add short notes when bank/port side effects are changed.
