# PIA

XL/XE `TRIG3` is the external cartridge RD5 sense line and defaults low when
no cartridge maps `$A000-$BFFF`; internal BASIC does not affect it. This
default comes from the native hardware register table and follows AHRM 2.8.

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `A8E/Pia.c`, `A8E/Pia.h`
- Purpose: manage port control and ROM/bank switching control paths.
- Status: verified on 2026-09-14 (`implemented`), including the AHRM 130XE,
  RAMBO, COMPY, and Ultimate1MB bank maps.
- Notes: `TRIG3` now follows the no-cartridge RD5 default, and effective
  `PORTB` pull-ups/`DDRB` writes update mapping at reset and during runtime.
  `PORTB` bank bits, CPU/ANTIC window selection, live CPU-window
  visibility, motherboard-window shadowing, and BASIC/Self-Test bit reuse now
  follow the validated jsA8E model. The native U1MB surface implements the
  write-only UCTL/UAUX range and readable COLDF flag used by jsA8E; U1MB
  BIOS/flash/RTC/PBI behavior remains outside this port.
- Issues: native interactive validation of the high-capacity profiles still
  needs real software/title coverage beyond the generic probe.
- Todo: keep the profile matrix and overlay transition rules synchronized with
  `jsA8E/js/core/memory.js` and `jsA8E/js/core/io.js`.

