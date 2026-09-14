# Mikie V1.12 investigation

## Scope

This document records the investigation of `ATR/MikieV112.xex` in jsA8E and
the compatibility fixes that resolved its loader failure. The earlier failure
observations remain below as historical evidence.

There is currently no Mikie ATR image in `ATR/`. The tested file is an XEX.
When an XEX is launched, jsA8E normalizes it and builds a temporary ATR with
the standard XEX boot loader; the boot loader then reads the normalized data
through D1 SIO. Therefore sector numbers seen in the SIO trace belong to this
temporary ATR, not to an original Mikie disk image.

## Current verified behavior

As of 2026-09-13, the corrected JavaScript and native XEX loaders complete all
40 segments, honor the low-memory `RUNAD=$008A`, and reach Mikie's control
screen. The fix is generic: the loader now tests the complete 16-bit RUNAD
word and relocates its internal routines and SIO-buffer patch addresses after
that check was expanded. No Mikie-specific workaround is used.

The same run also confirmed that the earlier AtariBlast/Mikie compatibility
issue was not caused by a missing printer, Atari 850, or title-specific SIO
response.

## Historical pre-fix behavior

- The XEX loads through its initial graphics/demo phase.
- Music plays during the demo.
- After pressing the controller button to continue, the loading sequence does
  not reach the game in jsA8E.
- Depending on memory profile and run, the display may turn green, become
  corrupted, enter the Atari self-test, or remain on a loading screen.
- In Altirra the same software proceeds normally. The user reported testing
  both the 320K RAMBO configuration and Ultimate1MB in jsA8E.
- The user also reported that Mikie detects expanded memory in the emulator,
  so simple expansion-size detection is not sufficient to validate the model.

## XEX structure

`MikieV112.xex` is 122549 bytes and contains 40 valid load segments after XEX
normalization. Important segments are:

| Segment ranges | Meaning / relevance |
| --- | --- |
| `$3C00-$3FFF` | 1024-byte character/font data block |
| `$1020-$3937` | Main low-memory code/data block |
| `$4000-$44D2` | Banked-window load |
| `$4800-$6FFF` | Banked-window load |
| `$7300-$7BFB` | Banked-window load |
| `$A800-$AF7F`, `$B400-$BB7F` | High-memory code/data |
| `$81C0-$A424`, `$A429-$A771` | Main program data/code |
| `$4000-$7F07` | Banked-window load |
| `$4000-$7EA7` | Banked-window load |
| `$4000-$6DFA` | Banked-window load |
| `$4000-$59E3` | Banked-window load |
| `$5AFA-$78AF` | Additional data; exact spacing should be checked by the XEX tool |
| `$02E0-$02E1` | Final RUNAD value `$008A` |

The repeated `$4000` segments are significant. They show that Mikie relies on
repeated writes or initialization between segments to load different data
into the same CPU-visible expansion window. A test that only verifies that
banks can be written and read independently does not fully validate this
execution pattern.

The XEX contains several `INITAD` updates. The initialization addresses found
while parsing the segment stream include `$3667`, `$7800`, `$0196`, and several
segments using `$0140`. The `$0140-$0146` blocks are associated with the
repeated banked loads and must be examined together with the PORTB writes they
perform.

## Direct jsA8E observation

The Chrome remote-debug session stopped with:

```text
pc       = $E409
opcode   = $F2
fault    = illegal_opcode / Unsupported opcode $F2
sp       = $01
portB    = $6F
profile  = ultimate1mb
bank     = 31
cpuWindow= enabled
anticWindow = enabled
basic    = disabled
os       = enabled
selfTest = disabled
```

`$E409` is inside the floating-point ROM range (`$D800-$FFFF`), and the bytes
around that address are ROM/data rather than a valid Mikie execution entry.
The low stack pointer and the jump into floating-point ROM indicate corrupted
control flow or stack state. The `$F2` trap is therefore a symptom of reaching
an invalid address, not evidence that Mikie intentionally uses `$F2` there.

The NMI counters at the stop were internally balanced:

- NMI requested: 7289
- NMI serviced: 7289
- NMI RTI count: 7289
- NMI pending/active at stop: 0

This does not prove that all NMI timing is perfect, but it does not currently
support a permanently nested or unreturned NMI as the primary cause.

## SIO evidence

The temporary ATR loader successfully issued sequential D1 reads through the
late sectors, including sectors in the 900 range. In the captured run it read
sectors 906 through 918 before the failure state.

After the program state was already corrupted, the trace contained repeated
commands addressed to `$4F` with command `$40` and invalid-looking auxiliary
bytes. These are not normal D1 disk reads. They are consistent with the CPU
executing corrupted code or data as an SIO command generator.

Earlier traces also showed repeated `$3F` polls and the absent-device timeout
path. According to AHRM 9.1, an absent Type 3/4 device must remain electrically
silent; the OS owns the timeout and retry behavior. The current generic SIO
implementation follows that rule. The AtariWriter-specific 850/R: probes and
workarounds were removed and must not be reintroduced as a Mikie fix.

## Historical pre-fix diagnosis

The strongest current hypothesis is a divergence during Mikie's banked XEX
load or initialization sequence:

1. The temporary ATR/XEX loader reads the data successfully for a long time.
2. Mikie loads several blocks into the same `$4000-$7FFF` CPU window.
3. An `INITAD` routine changes state between those loads, likely including
   `PORTB` banking and ROM/window visibility.
4. The emulator eventually presents the wrong bank or wrong memory/ROM view to
   the CPU, or fails to preserve a value that should remain hidden under the
   expansion window.
5. Control flow becomes invalid; the later `$4F/$40` SIO traffic and the
   `$E409/$F2` illegal-opcode stop are consequences.

This is more likely than a missing disk sector or a missing printer/850 device.
It is not yet proven which exact PORTB transition or memory address first
diverges from Altirra.

## Relevant implementation areas

- `jsA8E/js/core/memory.js`: XEX normalization, temporary ATR construction,
  boot-loader placement, expansion-bank storage and CPU/ANTIC windows.
- `jsA8E/js/core/io.js`: PORTB writes, ROM visibility, and expansion state
  synchronization.
- `jsA8E/js/core/pokey_sio.js`: D1 SIO command/data phases and absent-device
  behavior.
- `jsA8E/js/core/cpu.js`: instruction execution, interrupt service, and
  illegal-opcode fault reporting.
- `jsA8E/js/core/atari.js`: debug-state composition and runtime wiring.
- `AHRM/2. System Architecture/7. Extended memory.md`: expansion mappings,
  bank bits, and CPU/ANTIC window rules.
- `AHRM/9. Serial I-O (SIO) Bus/1. Basic SIO protocol.md`: SIO timing,
  command phases, retries, and silent absent devices.

## Historical next diagnostic step

Console-only PORTB logging is insufficient because the browser may stop or
restart before the useful messages are collected. The next safe diagnostic is
to retain a bounded in-memory PORTB transition ring in the runtime debug state.
Each entry should include CPU PC, cycle, old/new PORTB values, selected bank,
and CPU/ANTIC window state. This must be observational only: it must not alter
PORTB semantics, SIO timing, interrupt behavior, or memory mapping.

The useful comparison is then:

- the last PORTB transitions before the first repeated `$4000`-window load;
- the bank visible during each `INITAD` call;
- whether the underlying base-RAM shadow is restored at each window disable;
- the first point where jsA8E's state differs from an equivalent Altirra trace.

No Mikie-specific workaround was added. The eventual loader and interrupt
fixes followed the AHRM behavior and remain generic rather than special-casing
this executable.
