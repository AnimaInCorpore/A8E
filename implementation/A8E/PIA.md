# PIA

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `A8E/Pia.c`, `A8E/Pia.h`, `A8E/tests/system_probe.c`
- Purpose: manage port control and ROM/bank switching control paths.
- Status: verified on 2026-09-22 (`partial`).
- Notes: port state affects system mapping and input/control behavior. PORTA/PORTB reach the direction register or the I/O register depending on PACTL/PBCTL bit 2. Port A keeps ORA in `SRAM[IO_PORTA]`, DDRA in `cValuePortA`, and the joystick input in `RAM[IO_PORTA]`; a data-mode read returns `input & (ORA | ~DDRA)`, so output bits read as the AND of ORA and the external line (AHRM 2.5, needed by Caverns of Mars). ORA, DDRA and PACTL power on as `$00` (AHRM 14.5). PACTL/PBCTL read back bits 0-5 as written (AHRM 14.5). `Pia_ApplyPortB` maps the ROMs for a port B value; `Pia_Reset` (Reset key) clears every register and applies the pull-up value `$FF`: OS ROM in, BASIC and self-test out (AHRM 2.5, 2.6).
- Issues:
  - PORTB ignores DDRB and forces bits 2-6 to read 1; the floating-input decay of AHRM 2.5 is not modeled.
  - The CA1/CA2/CB1/CB2 interrupt flags (PACTL/PBCTL bits 7-6) and the PIA IRQ line are not modeled.
  - The self-test ROM follows PORTB bit 7 even while the OS ROM is off (AHRM 2.6 maps it only with the OS ROM enabled).
- Todo: add short notes when bank/port side effects are changed.
