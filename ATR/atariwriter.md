# AtariWriter Plus XE: boot process reverse engineering

Date: 2026-09-14  
Branch: `atariwriter`  
Image: `ATR/AtariWriterPlusXE.atr`

## Conclusion

AtariWriter Plus XE requires an XL/XE machine with 128 KiB and a 130XE memory
expansion, the ATR mounted in `D1:`, working DOS/CIO/SIO services, and correct
XL/XE cartridge detection through `TRIG3` (`$D013`). It does not require an
Atari 850, a printer, or an `R:` handler.

The reboot loop was caused by `TRIG3=1` in jsA8E. On XL/XE machines, this
register is not a released third joystick trigger: it reflects the RD5 line and
must read `0` when no external cartridge is providing ROM at `$A000-$BFFF`.
The OS interpreted `1` as cartridge present, validated `RAMSUM` during the
`WARMSV` requested by AtariWriter, and converted that warm start into a cold
start. With `TRIG3=0`, the OS follows the no-cartridge path and AtariWriter
reaches its menu.

## Disk image and file system

The ATR is a valid DOS 2.0S image with 720 128-byte sectors: 92,160 bytes of
data plus a 16-byte ATR header. The DOS sector chains were extracted from
bytes 125-127 of each sector.

| File | Sectors | First sector | Relevant chain |
|---|---:|---:|---|
| `DOS.SYS` | 37 | 4 | DOS loader |
| `DUP.SYS` | 42 | 41 | DOS utilities |
| `AUTORUN.SYS` | 6 | 83 | `83,84,85,86,87,505` |
| `AP.OBJ` | 210 | 88 | `88..289,499..502,506,516,524,543` |
| `PROOF` | 112 | 290 | optional spell checker |
| `PD` | 33 | 406 | printer driver |
| `MM.OBJ` | 91 | 420 | optional mail merge component |

`AP.OBJ` is fragmented. A DOS reader must follow its sector chain and cannot
treat the file as a contiguous sector range. The image contains no Atari 850
firmware, `R:` handler, or additional serial driver.

## Extracted execution chain

1. DOS loads `AUTORUN.SYS`.
2. `AUTORUN.SYS` contains segments `$2000-$20B0` and `$20B5-$22AE`; its
   `RUNAD` is `$223B`.
3. It opens `D:AP.OBJ` through IOCB/CIO (`CIOV=$E456`), reads it in blocks,
   and closes the IOCB. Loading depends on the guest DOS, not on a host-side
   shortcut.
4. `AP.OBJ` is a 26,190-byte XEX with scattered segments and `RUNAD=$BB3B`.
5. The program tests extended RAM, optionally attempts to open `R:`, installs
   `DOSINI=$2800`, sets `COLDST=$00`, and calls `WARMSV`.
6. The second stage of the warm start reaches the user menu.

## 130XE memory requirement

The first `AP.OBJ` segments perform the following writes in order:

| Order | XEX segment |
|---:|---|
| 1 | `$D301=$EF` |
| 2-6 | 4,454 bytes at `$4000-$4E3D` |
| 7 | `$D301=$EB` |
| 8 | `$D301=$FF` |

`AUTORUN.SYS` also runs an explicit test at `$2263-$227D`:

```asm
LDA #$EF
STA $D301
STA $4000
LDA #$EB
STA $D301
STA $4000
LDA #$EF
STA $D301
CMP $4000
BNE $2280
JMP $2000
```

On a 64 KiB machine, this deliberately fails and leaves `COLDST=$09`. On a
130XE, `$EF` and `$EB` select different banks; the CPU window is
`$4000-$7FFF`, the hidden base RAM must be preserved, and ANTIC remains
independent while its window-enable bit is inactive. These rules correspond
to AHRM 2.7.

## The Atari 850 and `R:` are optional

At `$BC21`, AtariWriter attempts `OPEN "R:"`. If the device is unavailable,
it sends Type 1 SIO polls `$50/$3F`. If a response were received, it would copy
a DCB, download the Atari 850 booter, and execute `$0506`. Without a response,
the bus must remain silent.

The absence of an Atari 850 is not fatal: the path ends at `$BC19`, clears
`$0606`, and jumps to `$E474`. Therefore, the emulator must not fabricate an
ACK, NAK, DCB, booter, or handler. The earlier hypothesis that attributed the
loop to an SIO timeout is ruled out.

## Boot vector and exact cause

The XL/XE ROM used for the investigation contains these stubs:

```asm
$E474  JMP $C290    ; WARMSV
$E477  JMP $C2C8    ; COLDSV
```

The vectors were not corrupted. Before `$E474`, AtariWriter had set
`DOSINI=$2800`, `RUNAD=$BB3B`, and `COLDST=$00`. The incorrect decision was
made inside the OS at `$C290`.

AHRM 2.8 specifies that `TRIG3=1` means an external cartridge is asserting
RD5, `TRIG3=0` means that it is not, and internal BASIC does not affect this
line. jsA8E initialized all four triggers as released joystick inputs,
including `TRIG3=1`. The OS copied this value to `GINTLK` and handled the warm
start as the cartridge-present case.

The cartridge path calls `$C4C9`, which sums `$BFF0-$C0EF`. The boot with
BASIC visible had left `RAMSUM=$52`; AtariWriter disables BASIC, exposing the
16 bytes at `$BFF0-$BFFF` as zero-filled RAM, so the sum becomes `$9B`. The
mismatch sends the OS to `$C2C8`, clears RAM, and boots `D1:` again. This was
not a browser-triggered `CPU.reset()`: it was a reproducible guest OS decision
caused by an incorrect hardware input.

With `TRIG3=0`, `GINTLK` also remains `0`; the OS recognizes that no cartridge
is present, skips cartridge validation, and preserves `DOSINI` during
`WARMSV`.

## Generic changes implemented

- `TRIG3` initializes to `0` in the JavaScript and C cores when no cartridge
  is present.
- `releaseAll()` can no longer turn RD5 into a released joystick input.
- PIA PORTB keeps ORB and DDRB separate. After reset, DDRB is `$00`, and the
  pull-ups produce an effective MMU value of `$FF`; writing DDRB immediately
  recalculates ROM and extended-memory mapping, in accordance with AHRM
  2.5-2.7.
- Headless automation now forwards the requested memory-expansion profile,
  preventing a test configured for a 130XE from silently running with 64 KiB.
- `pia_xlxe_defaults.test.js` was added to cover RD5/TRIG3 and DDRB pull-up
  behavior.

There are no conditions based on the ATR name, no AtariWriter-specific
addresses, and no modifications to the disk image.

## Verification

The corrected emulator ran for 80,083,406 cycles with the ATR in `D1:` and
the `130xe-128k` profile. AtariWriter requested one `WARMSV`; no subsequent
cold start occurred, `COLDST` remained `$00`, `TRIG3/GINTLK` remained `$00`,
and the screen displayed the complete menu: `Create File`, `Edit File`,
`Verify Spelling`, `Print File`, `Global Format`, `Mail Merge`, both drive
indexes, and the load/save operations.

The PIA, 130XE banked-memory, potentiometer, snapshot, and headless automation
regressions also pass. The C core builds successfully in Release mode; it only
retains the pre-existing `LNK4098` linker warning.
