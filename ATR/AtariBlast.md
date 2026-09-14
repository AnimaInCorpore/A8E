# Atari Blast investigation

## Scope

This file is the working reference for investigating `ATR/AtariBlast.atr`.
All static-analysis results, runtime tests, hypotheses, decisions, and future
test results should be added here. Earlier hypotheses are retained as
historical evidence; the verified status is summarized below.

## Current verified status

As of 2026-09-13, AtariBlast completes its mixed-geometry ATR load and reaches
the game screen in both jsA8E and native A8E. The 64-bank 1088K load path was
verified against the reconstructed data, including the final vector at
`$7FFE/$7FFF`. The fixes were generic: 16-bit XEX RUNAD handling, complete
loader relocation after that change, level-sensitive POKEY IRQ cleanup, and
profile-accurate memory-window behavior. No AtariBlast-specific workaround or
fabricated SIO response is used.

Remaining work concerns broader AHRM regression coverage (for example DDRB and
reset/snapshot edge cases), not the title's normal startup path.

## ATR geometry

The image is 368272 bytes and has this ATR header:

```text
96 02 E8 59 00 01 00 00 00 00 00 00 00 00 00 00
```

This means:

- ATR signature: `$0296`.
- Sector size field: `256` bytes.
- The first three boot sectors remain `128` bytes, as required by the ATR
  mixed boot-sector format.
- Data after the first three sectors is `256` bytes per sector.
- Total geometry: `1440` sectors, consistent with a double-sided,
  double-density disk.
- The first 3 sectors occupy offsets `$0010-$018F`; sector 4 starts at file
  offset `400`.

When inspecting sectors, the normal 128-byte fixed-stride calculation must
not be used after sector 3. It would read the wrong data and can create false
conclusions about the program.

## Boot structure

The first sectors contain a custom boot path rather than an obvious DOS2
directory boot:

- Sector 1 starts with load/boot metadata followed by 6502 code.
- The first code includes setup of D1 SIO command fields, including device
  `$31` and READ SECTOR command `$52`.
- Sector 2 is zero-filled.
- Sector 3 is zero-filled.
- Sector 4 begins with `JMP $28FC` and contains additional code/data.
- Sectors 5 onward contain dense binary data, including graphics-like and
  table-like patterns.

The data at logical sector 360 is not sufficient by itself to identify a
standard DOS2 VTOC/directory. Sectors 361-368 also look like binary program
data rather than ordinary directory filename entries. This suggests that the
image is booted and managed by its own loader or disk format. A proper
sector-aware disassembly of the boot chain is required before treating any
later sector as a DOS file.

## Initial static observations

The boot code directly prepares SIO requests for D1. This makes the following
areas relevant even if the game ultimately uses no expanded memory:

- mixed 128/256-byte ATR sector addressing;
- D1 READ SECTOR command framing and checksums;
- status/completion/data-frame sequencing;
- timing and retry behavior during custom boot loading;
- writes to the boot buffer and any subsequent display-list memory;
- possible use of disk sectors beyond the normal single-density range.

The boot/data code also contains a direct expanded-memory path:

- A routine writes values to `PORTB` at `$D301`.
- Immediately around that code it initializes pointers in zero page and later
  reads the two-byte value at `$7FFE-$7FFF`.
- `$7FFE-$7FFF` is inside the `$4000-$7FFF` expansion window, so the value
  depends on the currently selected bank and CPU-window state.
- The code therefore appears to use bank switching as part of the loader or
  decompressor, not merely as an optional memory-size probe.
- The first boot sector declares a load range beginning at `$0100` and ending
  at `$17FA`, with an initialization entry at `$1844`; this is consistent with
  a multi-stage custom loader.

The image size and header do not prove that Atari Blast requires a memory
expansion. No memory profile has yet been selected for a controlled runtime
comparison, and no PORTB or expansion-bank trace has yet been collected for
this title.

## Bootloader reconstruction

The first-stage loader is loaded at `$0100`. It reads the later disk image
through D1 into a working area beginning at `$2000`; sector 4 is therefore
visible at `$2000` and begins with `JMP $28FC`. The code loaded into this area
contains a dedicated expanded-memory loading path.

The relevant sequence is:

| Address | Operation | Meaning |
|---------|-----------|---------|
| `$2817` | `LDX $80` | Select the current bank-table index. |
| `$2819` | `LDA $2663,X` | Read one of 64 `PORTB` bank values. |
| `$281C` | `STA $D301` | Select that bank and enable the extended window. |
| `$2904` | `LDA $D301` | Read the current PIA output value. |
| `$2907` | `ORA #$02` | Set the BASIC-disable bit. |
| `$2909` | `STA $D301` | Apply the BASIC-off mapping. |
| `$2934` | `LDA $7FFE` | Read the low byte of the final vector from the active bank. |
| `$2939` | `LDA $7FFF` | Read the high byte of the final vector from the active bank. |
| `$293E` | `JMP ($0086)` | Transfer control using the vector just read. |

The table at `$2663` contains 64 values formed by the 1088K banking pattern:
bits `1,2,3,5,6,7` vary, while bit 4 remains clear so the CPU window is
enabled. The values begin `01 03 05 07 ... 0F`, followed by the `$21-$2F`,
`$41-$4F`, `$61-$6F`, `$81-$8F`, `$A1-$AF`, `$C1-$CF`, and `$E1-$EF` groups.
This is the AHRM 1088K RAMBO/U1MB-compatible banking pattern.

AtariBlast therefore uses all 64 banks as working storage and expects the
active bank to contain a valid two-byte vector at the top of the
`$4000-$7FFF` window. A mapping that reports 1MB but aliases banks, loses
writes on a bank switch, or returns motherboard RAM at `$7FFE/$7FFF` can load
for a while and then jump to an invalid address.

The static code does not select U1MB configuration registers in
`$D380-$D3FF`; it uses the normal PIA `PORTB` path. The emulated U1MB must
therefore already be in the 1088K-compatible mode before the loader runs.
This matches the current default `ultimate1mb` mode, but the runtime bank
contents and final vector still need direct verification.

## Tests performed

### Static ATR read

Performed on 2026-09-13:

- Read and verified the ATR header.
- Calculated the mixed-sector geometry.
- Read boot sectors 1-10 using the correct sector offsets.
- Read sectors 360-368 using the correct 256-byte-sector offsets.
- Confirmed the boot code contains direct D1 SIO setup.
- Found code patterns that write `$D301` and read `$7FFE-$7FFF`, confirming
  active use of the expanded-memory window.

### Runtime tests

Initial jsA8E observation performed on 2026-09-13 through Chrome remote
debugging:

- The image was mounted and execution was continued without changing the
  emulator during the observation.
- The machine was running with the `ultimate1mb` profile, PAL/NTSC not yet
  varied, and the existing SIO diagnostics enabled.
- The loader issued valid D1 READ SECTOR requests with `sectorSize=256`.
- The observed request sequence reached at least sectors 510 through 582.
- `PORTB` changed while the loader ran. Examples observed included `$47`,
  `$61`, `$83`, `$A1`, and `$C9`, corresponding to different Ultimate1MB
  banks while both CPU and ANTIC windows remained enabled.
- NMI accounting remained balanced during this period. At the latest sample,
  NMI requested, serviced, and RTI counts were equal, with no pending or
  active NMI.
- After more than 50 seconds, execution was still marked `running` but had
  remained in the OS SIO/VBI service loop around `$EB16-$EB...`, with `SP=$F0`.
  No CPU fault or reset was reported at that point.
- This is currently classified as a suspected load stall, not yet as a CPU
  crash. The first missing or delayed SIO completion still needs to be
  identified from a compact final-event query.
- A later live observation showed the actual failure after the long load: the
  CPU entered a repeating `BRK`/interrupt-vector path, alternating between
  `$0000` and `$C02C`, while the stack pointer descended toward underflow. The
  machine remained marked `running`; no illegal-opcode fault or SIO timeout was
  reported.
- At that point the active profile was `ultimate1mb`, with `PORTB=$03`, bank 1,
  and both CPU and ANTIC windows enabled. POKEY showed `IRQEN=$00` and
  `IRQST=$FE`, so an enabled POKEY IRQ alone does not explain the loop.
- The failure is now classified as post-load CPU control-flow corruption. The
  first corrupting write or vector change remains unidentified.

## Current conclusions

1. Atari Blast is a bootable custom-format or custom-loader disk image, not a
   simple DOS2 file disk based on the initial inspection.
2. The ATR reader must use 128-byte sectors for sectors 1-3 and 256-byte
   sectors thereafter. Any diagnostic tool that assumes one fixed stride is
   invalid for this image.
3. SIO is the first subsystem to verify during runtime because the boot code
   explicitly issues D1 reads.
4. Memory expansion is only a secondary hypothesis until a runtime trace shows
   PORTB changes, `$4000-$7FFF` bank use, or a memory test performed by the
   software.
5. The first runtime observation initially looked like a SIO/load-progress
   stall, but the later run reached a confirmed BRK/vector loop after the
   extended load.
6. The failure is compatible with corrupted vector, stack, or control-flow
   state; it is not yet proof of a SIO or memory-expansion defect.
7. The ATR itself confirms that bank switching is part of the loader path. A
   generic memory-size PASS is therefore insufficient; the exact PORTB bank
   sequence and bank contents must be validated.
8. No title-specific workaround should be implemented at this stage.
9. The exact bank sequence is compatible with the AHRM 1088K/U1MB banking
   pattern. The remaining issue is an implementation detail in bank contents,
   window persistence, or final vector visibility, not an unknown AtariBlast
   memory protocol.

## Required emulator capability

For Atari Blast to finish loading, the emulator must provide an accurate
expanded-memory service for the loader's active access pattern:

- accept the loader's `PORTB ($D301)` writes as PIA output changes;
- derive the correct bank from the profile's documented PORTB banking bits;
- map the selected bank into the CPU-visible `$4000-$7FFF` window;
- preserve the hidden motherboard `$4000-$7FFF` RAM while that window is
  enabled and restore it when the window is disabled;
- return the selected bank's actual bytes for reads at `$7FFE-$7FFF`;
- keep the bank selection and window state stable across SIO transfers,
  interrupts, and the loader's initialization routines;
- perform the final handoff with the loaded vectors, stack, and RAM contents
  unchanged by the expansion overlay.

The emulator already has generic pieces for these operations and the live
trace proves that `PORTB` changes and bank selection are occurring. What is not
yet proven is that the bank selected by each Atari Blast value contains the
same bytes as the expected hardware bank. Thus the missing capability is more
precisely **verified profile-accurate bank mapping and persistence during the
custom loader**, rather than simply adding more RAM.

The 256-byte DSDD SIO path is also required and is already active in the
observed run: D1 returns `258` bytes per sector response. Since those reads
progressed through the image without a reported timeout, SIO is currently a
secondary verification target, not the leading missing service.

## Consolidated implementation checklist

The following is the implementation and verification target, in priority
order. The current generic emulator contains most of these pieces, but the
AtariBlast-specific runtime behavior remains to be verified.

1. Preserve the 128-byte first three ATR sectors and use 256-byte sectors from
   sector 4 onward during the complete image load.
2. Complete D1 SIO ACK/data phases, checksums, timing, and consecutive
   256-byte reads without dropping a response.
3. Provide 64 independent 16K banks for the 1088K/U1MB-compatible profile.
4. Decode `PORTB` bits `1,2,3,5,6,7` in the documented order. AtariBlast's
   table at `$2663` must select banks 0 through 63 without aliasing.
5. Map the selected bank into the CPU-visible `$4000-$7FFF` window whenever
   bit 4 is clear, and expose motherboard RAM when it is set.
6. Preserve hidden motherboard RAM while the expanded window is active and
   restore it when the window closes.
7. Apply BASIC and Self-Test bit reuse correctly, keeping conflicting ROM
   overlays disabled while the 1088K/U1MB window is active.
8. Return the selected bank's actual bytes for `$7FFE/$7FFF`, including after
   the loader's `ORA #$02` and `STA $D301` sequence.
9. Preserve the shared CPU/ANTIC window behavior required by the 1088K RAMBO
   compatible map, without letting ANTIC DMA change the CPU bank state.
10. Preserve bank and window state across NMIs, VBI processing, SIO completion,
    and loader callbacks.
11. Verify the final vector, indirect handoff through `$0086`, stack, and
    interrupt vectors immediately before the loader exits.
12. Distinguish an application jump to the OS reset path from an emulator
    generated reset, and ensure a warm/software reset does not silently erase
    expanded banks before the handoff.

The first required diagnostic is a bounded trace correlating every `$D301`
write with its raw value, derived bank, CPU/ANTIC window state, and subsequent
values read at `$7FFE/$7FFF`. No emulation semantics should change until that
trace identifies a mismatch.

## Planned runtime investigation

The safe order of investigation is:

1. Run the ATR with 64K, PAL and NTSC, with SIO Turbo disabled.
2. Capture the first boot state and the bounded SIO event trace.
3. Confirm whether reads use 128-byte boot sectors and 256-byte data sectors
   at the correct boundaries.
4. If it fails, capture CPU PC, stack pointer, DSTAT, TIMFLG, IRQST, and the
   last successful sector.
5. Compare 64K against the selected expansion profiles only if the trace shows
   PORTB or `$4000-$7FFF` activity.
6. Use AHRM SIO and extended-memory rules before proposing any fix.

For the next observation, capture only the final SIO events and compact state
fields so output is not truncated. The important fields are the last successful
sector, the outstanding response phase, DSTAT, TIMFLG, IRQST, PC, SP, PORTB,
and the expansion bank/window state.

The next static/runtime comparison must correlate each `$D301` write with the
subsequent `$7FFE/$7FFF` read. In particular, record the PORTB value, derived
bank number, CPU-window enable, and the two bytes read from the window. This
will show whether the loader is receiving the expected bank data or merely
seeing a correctly sized but incorrectly mapped expansion.

The preferred diagnostic additions are observational and bounded. They must
not change SIO replies, timing, CPU interrupts, PORTB mapping, or disk data.

## AHRM references

- `AHRM/9. Serial I-O (SIO) Bus/1. Basic SIO protocol.md`: command frames,
  ACK/NAK, complete/data phases, retries, and timing.
- `AHRM/B. Physical Disk Format/1. Raw geometry.md`: 128/256-byte sector
  geometry and sector-number conversion.
- `AHRM/2. System Architecture/7. Extended memory.md`: PORTB banking,
  `$4000-$7FFF` window behavior, and CPU/ANTIC access rules.

## AHRM compliance audit

Audited on 2026-09-13 against:

- `AHRM/2. System Architecture/7. Extended memory.md`
- `AHRM/2. System Architecture/5. Peripheral Interface Adapter (PIA).md`
- `AHRM/12. Internal devices/3. Ultimate1MB.md`
- `AHRM/9. Serial I-O (SIO) Bus/1. Basic SIO protocol.md`
- `AHRM/B. Physical Disk Format/1. Raw geometry.md`

| Checklist area | AHRM status | Current assessment |
|----------------|-------------|--------------------|
| ATR 128/256-byte geometry | Compliant requirement | The ATR and loader analysis agree with AHRM. Runtime completion still needs verification. |
| D1 SIO framing and checksums | Compliant requirement | The observed 256-byte reads and 258-byte responses are consistent with AHRM. No new SIO behavior is justified yet. |
| 64 independent 16K banks | Compliant requirement | Required by the 1088K configuration. Current storage model has the required capacity, but AtariBlast must verify retention of every bank. |
| `PORTB` bits `1,2,3,5,6,7` | Compliant | This matches both AHRM's 1088K RAMBO table and U1MB UCTL mode `11`. |
| Bit 4 CPU window | Compliant | AHRM defines bit 4 as inverted: clear enables the extended CPU window. |
| ANTIC behavior | Compliant for this profile | AHRM defines 1088K RAMBO/U1MB mode as shared CPU+ANTIC access. Separate ANTIC access is not required here. |
| Hidden motherboard RAM | Compliant requirement | AHRM requires it to remain untouched while the extended window is active. Current shadow mechanism is directionally correct and needs runtime validation. |
| `$5000-$57FF` Self-Test conflict | Conditional | AHRM gives Self-Test ROM priority when enabled. It must not be unconditionally forced off merely because the expanded window is active. |
| BASIC/Self-Test bit reuse | Corrected, runtime verification pending | AHRM's U1MB-specific behavior says that in 576K/1088K modes these ROM enables are changed by `PORTB` writes with CPU window disabled; ROMs may remain enabled while the expanded CPU window is active. The U1MB mode model no longer forces them off when the CPU window is active. |
| PIA output/input behavior | **Needs verification** | AHRM says physical expansions depend on PIA output configuration and pull-ups, while U1MB shadows PIA writes and has distinct behavior. The current path should be checked against `PBCTL` and U1MB shadow semantics. |
| `$7FFE/$7FFF` | Compliant requirement | AHRM's window rules require these reads to come from the selected bank when the CPU window is enabled. Direct AtariBlast use confirms this is a critical test. |
| Bank state across NMI/SIO | Compliant requirement | AHRM does not authorize changing bank state during interrupt or SIO service; state must remain whatever the software selected. |
| Final vector and stack handoff | Compliant requirement | This is a software-visible consequence of the memory rules, not an extra hardware protocol. |
| Warm reset bank contents | Partially specified | AHRM describes reset-sensitive device state and U1MB `COLDF`; exact emulator persistence must be validated rather than assumed. |

### Audit conclusion

The bank-selection portion of the proposed implementation is AHRM-compliant.
The U1MB mode model has now been corrected so it does not treat BASIC and
Self-Test as forcibly disabled while the CPU window is active. The existing
state-dependent `PORTB` logic preserves the documented distinction between
physical 1088K RAMBO and U1MB: they share the bank pattern and window layout,
but do not necessarily share ROM-overlay state transitions. Runtime validation
of the corrected behavior is still required.

For AtariBlast, the next compliant implementation step is therefore to model
the U1MB write-sequence rule, then run the loader with a trace of `PORTB`,
effective ROM visibility, selected bank, and `$7FFE/$7FFF`. The SIO and ATR
parts should remain unchanged unless a later trace demonstrates a protocol
error.

## Pre-fix remaining work (historical)

The following items are still outstanding for AtariBlast, in priority order:

1. Validate that all 64 expanded-memory banks are independent and retain their
   contents. `U1MB_MEMORY_TEST.XEX` already covers the generic case through its
   Stage 2 bank-retention test; this must still be confirmed for the exact
   AtariBlast access pattern.
2. Verify that reads from `$7FFE/$7FFF` return the bytes from the currently
   selected bank after every relevant `PORTB` write.
3. Confirm that the selected bank and CPU/ANTIC window state remain unchanged
   across SIO transfers, NMI handling, and VBI processing.
4. Validate the shared CPU/ANTIC behavior in the 1088K/U1MB profile. The
   generic ANTIC live-window correction exists, but RAMBO/U1MB visual tests
   still require a clean runtime verification.
5. Confirm that motherboard RAM hidden by `$4000-$7FFF` is restored correctly
   when the expanded window is disabled.
6. Verify the U1MB-specific BASIC and Self-Test overlay sequence against AHRM,
   including writes made with the CPU window enabled and disabled.
7. Compare the final vector, stack, and interrupt-vector contents with a
   reference run in Altirra immediately before the loader handoff.
8. Identify the first corrupted value preceding the observed reboot, and
   distinguish an AtariBlast software reset path from an emulator-generated
   reset.
9. Run AtariBlast through the complete load and confirm that it reaches its
   initial executable screen.

The first item is a validation task, not a request for a second duplicate
test: the existing `U1MB_MEMORY_TEST.XEX` already performs the generic
write/read bank-isolation check. Any emulator change must remain generic and
must be justified by a mismatch in this validation or in the AtariBlast
trace.

## Decision log

- 2026-09-13: Start with ATR geometry and boot/SIO analysis. Do not modify the
  emulator until a runtime failure and its first divergence are identified.
- 2026-09-13: Treat the image as a custom boot/loader disk for now; do not
  assume DOS2 directory semantics from sector numbers alone.
- 2026-09-13: During the first live jsA8E observation, the loader reached at
  least sector 582 with valid 256-byte D1 reads and active bank switching, then
  appeared to stall in the OS SIO/VBI loop without a CPU fault or reset. Keep
  the diagnosis open between an incomplete load sequence and a memory-window
  divergence; do not patch yet.
- 2026-09-13: Re-evaluation of the live trace shows that the observed traffic
  is a full-image sequential load through a 1440-sector DSDD image. Each data
  sector response is 258 bytes (`$43` plus 256 data bytes and checksum), and
  the loader advanced from at least sector 510 to sector 582. This means the
  apparent pause may be a long load rather than a confirmed deadlock. Do not
  change SIO or memory behavior until the last requested sector and the final
  completion/launch transition are observed.
- 2026-09-13: Continued live observation reached a repeating `$0000`/`$C02C`
  BRK/vector path with descending SP after the long load. No SIO timeout or
  illegal opcode was reported. Compare the final vectors, stack, and memory
  state before making any patch.
- 2026-09-13: Re-read the ATR and found the loader writes `$D301` and reads
  `$7FFE-$7FFF`, proving that expanded-memory bank contents are used by the
  loading/decompression path. The primary hypothesis is now an incorrect
  PORTB-to-bank mapping or bank content at the first such transition, not just
  a missing SIO response. No code change yet.
- 2026-09-13: Identified the capability required to complete the load as
  profile-accurate PORTB bank mapping and persistence across the `$4000-$7FFF`
  CPU window, including correct `$7FFE/$7FFF` reads and final vector/stack
  handoff. Existing SIO reads appear to progress correctly, so no SIO patch
  was selected.
- 2026-09-13: Reconstructed the loader from the correctly mapped ATR sectors.
  It uses the 64-value 1088K bank table at `$2663`, writes each value through
  `$D301` at `$281C`, disables BASIC with `ORA #$02`, then reads the final
  vector from `$7FFE/$7FFF` at `$2934/$2939` before its indirect handoff. The
  expected profile is therefore the AHRM 1088K/U1MB banking pattern. The
  consolidated checklist now prioritizes bank contents, window persistence,
  and final-vector visibility over a new SIO workaround.
- 2026-09-13: Corrected the U1MB 576K/1088K mode model in `jsA8E/js/core/memory.js`.
  The modes no longer force BASIC and Self-Test off when the CPU window is
  enabled; the existing state-dependent PORTB logic now follows AHRM's rule
  that those overlays change only on writes made with the CPU window disabled.
  This is a generic U1MB correction, not an AtariBlast-specific workaround.
- 2026-09-13: Completed the U1MB overlay correction in `jsA8E/js/core/io.js`.
  The PIA/ROM mapping now preserves BASIC and Self-Test visibility for bank
  selection writes made with the CPU window enabled, instead of recalculating
  visibility from the reused bank bits. Writes with the window disabled still
  update the overlays from PORTB. This keeps the memory and I/O layers aligned
  with AHRM without changing RAMBO/COMPY.
- 2026-09-13: Diagnosed and corrected a generic shared-window ANTIC issue in
  `jsA8E/js/core/memory.js`. RAMBO and U1MB ANTIC DMA could read stale
  `bankStorage` after the CPU had written the test pattern to the active bank,
  because storage was committed only when the CPU window changed or closed.
  ANTIC now reads the live selected-bank window while CPU access is active,
  which matches the AHRM shared CPU+ANTIC behavior. This is not a
  title-specific workaround.

## Session 2: combined loader and emulator audit

This section records the follow-up analysis of both files in `ATR/`, using the
current jsA8E headless runtime and the local AHRM chapters. No emulator code was
changed during this audit.

### Mikie route

`MikieV112.xex` contains 40 load segments. The important execution sequence is:

1. `$3667` is the first `INITAD`. It configures display/timing state and runs
   through the normal OS services.
2. `$7800` is another `INITAD`. It installs the DLI/VBI vectors, writes
   `$D301=$FE`, clears hardware state, and later restores `$D301=$FF`.
3. `$0196` initializes the program and calls the OS disk loader at `$E45C`.
4. Repeated `$0140-$0146` segments contain `LDA $0101..$0104 / STA $D301 / RTS`.
   These are deliberate bank-selection INITAD calls between repeated loads into
   `$4000-$7FFF`; they are not four independent copies of ordinary RAM.
5. The final XEX segment writes `RUNAD=$008A` at `$02E0-$02E1`.

The jsA8E XEX boot loader at `$0700` tests only `$02E1` (`LDA $02E1 / BEQ
$0705 / JMP ($02E0)`). Mikie has a valid non-zero low-byte entry and a zero
high-byte entry, so the loader executes the `RTS` path instead of transferring
control to `$008A`. That is a generic loader defect: every valid XEX entry below
`$0100` is skipped. A diagnostic run forcing the documented RUNAD handoff to
`$008A` reached Mikie's control screen; the observed screen is evidence that the
loaded program itself is usable once the handoff is made.

After the uncorrected return path, Mikie eventually reaches a corrupted control
flow and the existing report's `$E409/$F2` stop. That fault is a consequence of
the failed launch path in this run, not evidence for an undocumented Mikie
opcode. Its banked load pattern still validates the need for correct PORTB,
window, and INITAD sequencing.

### AtariBlast route

The ATR has three 128-byte boot sectors followed by 256-byte sectors. Sector 1
loads `$0100-$17FA`, calls `$1801`, and then jumps to `$2000` after 24 sector
loads. The code at `$28FC` performs the expanded-memory phase:

- `$2818` selects one of 64 bytes at `$2663` and writes it to `$D301`.
- `$27E8` reads a compressed block from the disk buffer and writes its expanded
  output into `$4000-$7FFF`.
- `$2934/$2939` read the final vector from `$7FFE/$7FFF` in the active bank.
- `$293E` jumps through `$0086`, which was filled from that vector.

The table at `$2663` is exactly the 1088K pattern using PORTB bits
`1,2,3,5,6,7`; bit 4 is clear for the CPU window. A standalone decompressor
reconstructed all 64 16-KiB blocks and their expected hashes. A live jsA8E run
observed all 64 bank transitions and compared each active window against the
reconstructed block: 64/64 comparisons passed, including bank 63's final
vector `$6000`. This rules out the earlier hypothesis that the ATR data was
being written to aliased or incorrectly numbered banks.

The failure occurs after the handoff. AtariBlast's code clears POKEY `IRQEN`
while interrupts are masked, then executes `CLI` and waits for its own timing
state. jsA8E's `CPU.irq()` increments `ctx.irqPending` when an IRQ is asserted
while `I` is set. Clearing `$D20E` removes the POKEY source, but does not remove
that queued request. When `CLI` executes, `servicePendingInterrupts()` still
enters the old IRQ vector. A direct probe reproduced this: after a pending IRQ,
writing `IRQEN=0` left `irqPending=1`, and the instruction after `CLI` vectored
to `$C02C` instead of continuing. A diagnostic run with that stale request
discarded reached AtariBlast's game screen.

This is contrary to AHRM 5.7: IRQ is level-triggered, and a disabled POKEY
source cannot leave a queued interrupt for later service. The fix must be a
generic level-sensitive IRQ model that derives the CPU request from currently
asserted POKEY/PIA/PBI sources, with the documented timing delay, rather than a
software event counter that survives source removal.

### Features still required for compatibility

The following are generic emulator capabilities, ordered by demonstrated
impact:

1. **Correct XEX RUNAD/INITAD handoff.** Treat a 16-bit RUNAD as valid when
   either byte is non-zero; jump to `$02E0` whenever the complete word is not
   zero. Preserve the existing INITAD loop and support valid entries below
   `$0100`. This is required by Mikie and benefits every XEX using a low-memory
   entry point.
2. **Level-sensitive IRQ aggregation.** Recompute the 6502 IRQ condition from
   active POKEY, PIA, and PBI sources. Disabling/clearing the source before
   service must remove the request, subject only to AHRM's 2–3 cycle assertion
   and IRQEN enable/disable timing. Do not retain an unbounded or stale
   `irqPending` count for a source that is no longer asserted.
3. **Accurate POKEY IRQST/IRQEN timing.** Keep active-low IRQST, the special
   XMTDON behavior, source latching rules, and the AHRM one-cycle disable window
   while making the CPU line level-driven. This must be shared by SIO, timers,
   and normal software writes to `$D20E`.
4. **PIA DDRB/effective PORTB model.** Bank and ROM decoding must use the
   effective PORTB pins: ORB bits configured as outputs use their written value;
   input bits use the XL/XE pull-up behavior. The current path can leave the
   raw port value at zero after a DDRB write, so a program that changes `PBCTL`
   can see a wrong window or bank. U1MB must retain its documented shadow-PIA
   exception.
5. **ROM/expanded-window priority matrix.** Apply AHRM priority for
   `$5000-$57FF` Self-Test over expanded RAM when Self-Test is enabled, while
   honoring U1MB's sequence-dependent BASIC/Game/Self-Test state (changes from
   PORTB writes only when the CPU window is disabled in 576K/1088K modes). CPU
   and ANTIC must resolve the same profile-specific matrix without silently
   forcing overlays off.
6. **Atomic, observable bank-window transitions.** A PORTB write must commit the
   old bank, expose the new bank, preserve hidden motherboard RAM, and update
   CPU/ANTIC visibility as one bus event. The current shadow/storage design is
   directionally correct and passed the AtariBlast 64-bank content check, but it
   still needs regression coverage for input/output transitions, ROM priority,
   and bank changes during INITAD, NMI, and SIO service.
7. **Shared versus separate ANTIC access.** Keep ANTIC reads on the live selected
   window for shared RAMBO/1088K/U1MB maps, and on its independent ANTIC window
   for 130XE/COMPY maps. The recently added live-window path fixes stale DMA data;
   it needs generic tests for CPU-only, ANTIC-only, and both-window states.
8. **Correct SIO phase and mixed ATR geometry preservation.** Retain the existing
   AHRM ACK then Complete/data phases and 128-byte boot/256-byte data addressing.
   AtariBlast reaches the end of its banked load without a sector timeout, so no
   title-specific SIO change is justified; the capability should remain covered
   by generic tests.
9. **Reset and snapshot memory semantics.** Warm/software reset and snapshot
   restore must preserve or reset expanded-bank contents according to the active
   hardware profile and U1MB `COLDF` state. Do not erase valid bank data during a
   loader handoff or a software reset unless the selected hardware model requires
   it.

### AHRM compliance boundary

The conclusions above use AHRM 2.5 (PIA), 2.6/2.7 (bank switching and extended
memory), 3.4 (interrupt behavior), 5.6/5.7 (serial and POKEY IRQ), 9.1 (SIO
protocol), and 12.3 (Ultimate1MB). They do not authorize fake peripherals,
game-specific PORTB tables, forced jumps for named titles, fabricated SIO
responses, or suppression of normal interrupt sources. The two highest-impact
changes are the generic low-byte RUNAD fix and replacement of stale IRQ event
counting with AHRM level-sensitive aggregation.

### Evidence and remaining verification

- Mikie: 40 segments, repeated banked `$4000` loads, valid `RUNAD=$008A`; forced
  handoff reaches the control screen.
- AtariBlast: 1440-sector mixed-geometry ATR; 64 reconstructed and observed
  banks match; final vector is `$6000`; stale IRQ after `$D20E=0` reproduces the
  `$C02C` diversion; diagnostic stale-IRQ removal reaches the game screen.
- Implemented in the current session: the JS and native XEX loaders now test
  the complete 16-bit RUNAD word, and jsA8E collapses masked IRQ requests to the
  active POKEY IRQ level when IRQEN is written. Existing XEX/preflight
  regressions still pass. The full AtariBlast/Mikie rerun is now complete;
  both titles reach their normal startup screens.
### Corrección posterior: relocalización completa del loader XEX

La primera corrección del RUNAD de 16 bits añadía tres bytes y dejaba desfasados los destinos internos de `get_byte`/`read_sector` y los índices de parcheo del buffer SIO. Eso explica que Mikie no completara su arranque. Se corrigieron los destinos en los loaders JavaScript y nativo (`get_byte=$0781`, `read_sector=$0792`) y los operandos de buffer (`$078B/$078C/$07A7/$07AC`), manteniendo la misma semántica documentada por AHRM.
### Estado verificado (2026-09-13)

La corrección fue validada ejecutando nuevamente ambos medios con el loader XEX actualizado:

- **AtariBlast** completa la carga ATR de geometría mixta y llega a su pantalla de juego.
- **Mikie** completa sus 40 segmentos XEX, ejecuta su `RUNAD=$008A` y supera el Self Test hasta su pantalla de control.

La causa no era un parche específico de ninguno de los juegos. Era la combinación de un handoff RUNAD que descartaba direcciones con byte alto cero y una relocalización incompleta del loader después de ampliar esa comprobación. Las correcciones se mantienen genéricas y se aplican por igual al loader JavaScript y al nativo.

Los puntos restantes de la lista de compatibilidad siguen siendo mejoras generales del modelo AHRM (agregación de IRQ de POKEY/PIA/PBI, DDRB efectivo, prioridad de overlays, transiciones de bancos, acceso ANTIC y semántica de reset/snapshot). No son necesarios para que AtariBlast y Mikie completen actualmente su arranque.
