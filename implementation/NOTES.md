# NOTES.md

> Hardware emulation reference: Before implementing any Atari 800 XL PAL/NTSC hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

Simple implementation notes for this repository.

- 2026-09-18: `jsA8E/{index.html,style.css,js/app/ui.js}`: added the first
  extensible presentation-layout presets. `Emulation`, `Work`, and
  `Development` are selectable beside the lifecycle controls, persist through
  `localStorage`, and rearrange the existing screen, keyboard, joystick,
  HostFS, Disk Library, and assembler/debugger panels without resetting the
  emulator. The disk activity overlay remains anchored to the screen viewport.
- 2026-09-18: `jsA8E/js/app/ui.js`: in the desktop `Work` layout, the canvas no
  longer reserves vertical space for the joystick because that control is in
  the row below the screen. Mobile layouts keep the reservation while panels
  are stacked.
- 2026-09-18: `jsA8E/{index.html,style.css}`: layout selectors are now compact
  icon-only buttons positioned immediately before the secondary-tools expand
  button, with labels retained through tooltip and ARIA text.
- 2026-09-18: `jsA8E/{index.html,js/app/ui.js}`: `Work` is now the default
  layout when no saved presentation preference exists.
- 2026-09-19: `jsA8E/{index.html,js/app/ui.js,js/core/app_proxy.js}`: all
  presentation layouts now start with SIO turbo, the on-screen joystick, and
  the on-screen keyboard disabled. Changing layouts no longer enables either
  input panel; each can still be enabled independently from its toolbar button.
- 2026-09-19: `jsA8E/{index.html,style.css}`: Disk Library headers and rows now
  share one horizontal scroll viewport, keeping column headings aligned when
  long filenames exceed the available panel width.

- 2026-09-15: removed obsolete game-specific investigation scripts, the CDP
  diagnostic runner, and the unused SIO/NMI/POKEY diagnostic counters. The
  reusable automation debugger and regression tests remain available.

- 2026-09-15: `jsA8E/js/core/atari.js`: registered the worker-provided disk
  activity bridge with the app's disk observer fan-out. This restores disk
  activity notifications in the worker backend while keeping them outside the
  SIO response and timing path.

- 2026-09-14: `jsA8E/js/core/{memory,atari,app_proxy}.js`,
  `jsA8E/emulator_worker.js`, and `jsA8E/{index.html,js/app/ui.js}`: separated
  the web toolbar action into a full machine restart (power-cycle). It now
  stops the running machine, releases inputs, rebuilds volatile RAM and the
  selected expansion-bank state, reinitializes the machine, and starts it
  again while preserving loaded ROMs, disk images, and H: files. The virtual
  keyboard F5/reset path remains the ordinary XL/XE hardware reset and keeps
  its existing warm-reset semantics.

- 2026-09-14: `jsA8E/js/core/{pokey_sio,memory,atari,app_proxy}.js`,
  `jsA8E/emulator_worker.js`, `jsA8E/js/app/disk_activity_ui.js`,
  `jsA8E/index.html`, and `jsA8E/style.css`: refined the transient lower-right
  disk-activity OSD to match the Altirra-style blinking drive indicator and
  placed it in a dedicated high-z-index screen overlay above the canvas:
  yellow for reads and orange for writes/formats. Activity is forwarded
  through the worker without changing SIO response bytes or timing; the
  focused SIO regression verifies the write event context.

- 2026-09-14: `jsA8E/js/core/disk_library.js`, `jsA8E/js/core/{memory,pokey_sio,atari}.js`,
  `jsA8E/js/core/app_proxy.js`, `jsA8E/emulator_worker.js`, and
  `jsA8E/js/app/disk_library_ui.js`: added the initial worker-owned multi-drive
  disk library. ATR/XEX entries use IndexedDB, the browser panel supports
  upload/drop, exclusive D1:-D4: mounting, deletion, and download, and disk
  writes are observed with image identity and drive-slot context without
  changing SIO timing or responses. Serialized
  dirty flushing and download consistency barriers are covered by focused
  library and SIO observer tests; snapshot/media replacement edge cases remain
  covered by library identity metadata and mount reconciliation.

- 2026-09-14: `jsA8E/js/core/{hw,state,input,io}.js`, `jsA8E/headless.js`,
  `A8E/AtariIo.c`, and `jsA8E/tests/pia_xlxe_defaults.test.js`: corrected the
  XL/XE no-cartridge hardware state per AHRM 2.8. `TRIG3` now reports RD5 low
  when no external cartridge maps `$A000-$BFFF`; internal BASIC does not
  assert it. Also separated jsA8E's PORTB output latch from DDRB: reset now
  exposes effective `$FF` through MMU pull-ups, and DDRB writes immediately
  update ROM/extended-memory mapping. Headless automation now forwards its
  selected memory-expansion profile. AtariWriter reaches its user menu after
  one intended warm start without an 850 or title-specific behavior.

- 2026-09-14: `jsA8E/index.html`: removed the obsolete `Nonfunctional`
  label from the validated `1088K (RAMBO)` profile and marked the separate
  `Ultimate1MB (1MB)` profile as `(WIP)` to reflect its remaining
  Ultimate1MB-specific work.

- 2026-09-14: `implementation/memory_stress_test.asm` and
  `implementation/MEMORY_STRESS_TEST.XEX`: corrected the smaller-RAMBO
  `PORTB MAP` probe. For `320R` and `192K`, bit 7 now tests Self-Test ROM
  write isolation while the overlay is active, then verifies that the
  original expanded-RAM pattern returns after the overlay is disabled.

- 2026-09-14: `implementation/u1mb_memory_test.asm` and
  `implementation/U1MB_MEMORY_TEST.XEX`: corrected the Atari screen-code
  order for the Stage 4 label, so the visual result now displays `ANTIC GFX`
  instead of `ANTIC GXF`.

- 2026-09-13: `implementation/u1mb_memory_test.asm` and
  `implementation/U1MB_MEMORY_TEST.XEX`: gave the Stage 4 visual result its
  own `ANTIC GFX PASS/FAIL` label. Stage 3 now remains clearly identified as
  `ANTIC CFG PASS/FAIL`, so the two ANTIC checks are distinguishable on screen.

- 2026-09-13: `implementation/u1mb_memory_test.asm` and
  `implementation/U1MB_MEMORY_TEST.XEX`: fixed the Stage 2 motherboard-RAM
  sentinel check. The `$4000`/`$7FFF` sentinels are now read while the
  extended window is closed; the expanded-bank pattern is checked only after
  the window is reopened. This removes the false `SYS CHECKS FAIL` reported
  by functional expansions whose bank access was working correctly.

- 2026-09-13: `implementation/{u1mb_memory_test.asm,memory_stress_test.asm}`
  and their XEX outputs: strengthened the memory diagnostics for practical
  AHRM expansion compliance. The generic test now checks the exact 1088K
  RAMBO PORTB map, BASIC/Self-Test visibility, both motherboard-window
  endpoints, and visual ANTIC DMA in banks 0 and 63. The stress test now runs
  its PORTB control stage normally and validates bit 7 as a bank bit for
  1088K RAMBO. The ANTIC checks remain partly visual because ANTIC output is
  not readable by the CPU.

- 2026-09-13: `jsA8E/index.html`: removed the stale `Nonfunctional` labels
  from the 320K and 576K COMPY menu profiles after their memory-bank and
  ANTIC-window behavior was validated.

- 2026-09-13: `A8E/{Pia.c,AtariIo.c}`, `A8E/tests/memory_expansion_probe.c`,
  and `A8E/CMakeLists.txt`: ported the validated jsA8E expansion behavior to
  native A8E. The port now preserves the live CPU/ANTIC window view, restores
  motherboard RAM through the same shadow transitions, applies profile-specific
  BASIC/Self-Test bit reuse, reconfigures U1MB modes from a clean window, and
  reserves the full U1MB `$D380-$D3FF` range. Added a native regression probe
  covering all AHRM profiles, bank retention, CPU/ANTIC access, and U1MB mode
  changes. Removed the obsolete PORTB console diagnostic from jsA8E after the
  memory-transition investigation was resolved.

- 2026-09-13: `jsA8E/js/core/memory.js`, `jsA8E/js/core/cpu.js`,
  `jsA8E/js/core/io.js`, and `A8E/AtariIo.c`: corrected generic XEX RUNAD
  handling so valid low-memory entry points such as Mikie's `$008A` are
  launched, and stopped retaining a software-queued POKEY IRQ after `IRQEN`
  disables its source. These changes follow AHRM 5.7 level-sensitive IRQ
  behavior and were motivated by the AtariBlast/Mikie loader audit.
- 2026-09-13: `A8E/AtariIo.c`: applied the same 16-bit RUNAD handoff correction
  to the native XEX boot loader so low-memory entry points behave consistently
  in both emulator implementations.
- 2026-09-13: `jsA8E/js/core/memory.js` and `A8E/AtariIo.c`: completed the XEX
  loader relocation after expanding the RUNAD check. Internal `get_byte` and
  `read_sector` targets, plus all SIO buffer patch indices, now point to their
  relocated addresses. AtariBlast and Mikie were rerun successfully through
  their normal startup paths. The remaining compatibility items in
  `ATR/AtariBlast.md` are generic follow-up work, not blockers for these two
  titles.
- 2026-09-13: `A8E/6502.c`, `A8E/6502.h`, and `A8E/Pokey.c`: ported the
  level-sensitive POKEY IRQ behavior. Masked requests now collapse to one
  pending level, and writing `IRQEN` clears that request when no enabled
  active POKEY source remains, matching AHRM 5.7.
- 2026-09-20: `jsA8E/js/core/{cpu,io}.js`: reconciled the JavaScript POKEY IRQ
  level in both directions when writing `IRQEN/$D20E`. An already asserted and
  re-enabled source now reasserts the CPU IRQ, matching AHRM 5.7 and the native
  `_6502_ReconcileIrq()` path instead of only clearing stale pending state.
- 2026-09-13: `A8E/A8E.c`: made the native window title include the active
  memory profile and PAL/NTSC standard. The title is generated from the same
  parsed runtime state reported on the console.
- 2026-09-13: `A8E/{A8E.c,AtariIo.c,AtariIo.h,Pia.c}`: added the canonical
  RAMBO/COMPY profile names and console switches (`-192R`, `-320R`, `-320C`,
  `-576R`, `-576C`, `-1088R`, `-U1MB`) and generalized extended-memory storage,
  bank-bit decoding, and ANTIC window selection. U1MB register/shadow-PIA
  semantics remain a follow-up layer; `-U1MB` currently selects its 1088K
  bank geometry.
- 2026-09-13: `A8E/{AtariIo.c,AtariIo.h,Pia.c,Pia.h}`: added the native U1MB
  UCTL, UAUX, and COLDF register surface with unlocked-write and config-lock
  behavior, plus cold-reset initialization. Full U1MB flash, BIOS/PBI, and
  mode-dependent overlay routing remains pending; the register state is now
  available for the next AHRM-compliant mapping layer.

- 2026-09-13: `ATR/AtariBlast.md`: recorded the prioritized remaining work for
  AtariBlast. The first item is validation of independent 1088K/U1MB banks;
  the existing `U1MB_MEMORY_TEST.XEX` Stage 2 already covers generic bank
  isolation, so no duplicate test or title-specific workaround is planned.

- 2026-09-12: `jsA8E/js/core/{memory,io}.js`, `jsA8E/{emulator_worker.js,index.html}`, and configuration normalizers: added the initial Ultimate1MB memory model. It provides the AHRM 1MB bank storage, dynamic UCTL memory modes, UCTL/UAUX/COLDF register access, and a web UI selector. BIOS/flash/RTC/PBI behavior remains intentionally out of scope until separately specified and tested.
- 2026-09-12: `jsA8E/js/core/memory.js`: fixed expansion-profile transitions by restoring the motherboard RAM hidden under `$4000-$7FFF` before replacing the active memory profile. This prevents a bank from the previous expansion from becoming visible as base RAM after a selector change. PAL/NTSC changes still use a full page reload so video timing and palette state are rebuilt atomically.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: moved the generic U1MB tester's persistent state from OS-owned zero-page locations to a private high-RAM area at `$2FF2-$2FF8`. This prevents VBI/display services from corrupting the detected mode, bank counter, pattern, and progress state during the longer multi-map probe.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: improved test cleanup and status labels. The tester now restores `PORTB=$FF` after the bank test, leaving the motherboard RAM view active, and displays unambiguous `1088K`, `576K`, `320K`, or `128K` labels.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: expanded automatic detection to all seven AHRM-listed maps: 1088K, 576K RAMBO/COMPY, 320K RAMBO/COMPY, 192K RAMBO, and 130XE. Absolute jump tables avoid 6502 relative-branch range limits, and the result identifies RAMBO versus COMPY where applicable.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: fixed the jump-table dispatch used by the expanded detector. The 6502 `RTS` indirect-jump convention now uses target-minus-one entries; the previous entries landed one byte into each routine and could execute `$F2` (`KIL`).
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: removed obsolete mode guards from the shared 576K/320K bank selectors. The 320K RAMBO candidate uses a different detector mode number and was incorrectly falling back to the 128K selector.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: fixed false memory-test failures caused by the Self-Test ROM remaining enabled in maps that do not reuse `PORTB` bit 7. Those selectors now set `PORTB` bit 7, and the detected-size label is kept away from the live bank-progress rows.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: corrected the 320K COMPY selector so bank bits 2 and 3 map to PORTB bits 6 and 7 as specified by AHRM. The 320K results now distinguish `320R` from `320C`; the previous COMPY selector was actually selecting the RAMBO bit layout and could pass detection before failing on the Self-Test ROM region.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: corrected the 192K display label from `1I2K` to `192K` (`$19` is the Atari screen code for digit 9; `$29` is letter I).
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: added a visible Stage 2 that checks bank retention in reverse order and preservation of motherboard RAM across CPU-window disable/re-enable transitions. Stage 2 reports separately before the final overall result; ANTIC DMA/CPU-independent access remains a future stage.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: reorganized the test display into a fixed layout: title/memory on line 1, four progress lines, `RW BANKS PASS/FAIL`, and `SYS CHECKS PASS/FAIL`. Stage 1 progress is no longer overwritten by Stage 2 status text.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: added Stage 3 at the next screen row as `ANTIC CFG PASS/FAIL`. It checks the expected CPU/ANTIC window configuration for 130XE/COMPY versus shared-window RAMBO/1088K maps; it intentionally does not claim to validate ANTIC DMA data fetches.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: added Stage 4, a visual ANTIC DMA exercise. It displays an alternating pattern fetched from the expanded bank through a temporary display list, restores the original ANTIC/PORTB state, and reports `ANTIC DMA VIEW` on the next row; this result requires visual inspection rather than automatic PASS/FAIL.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: Stage 4 now displays `PRESS START TO CONTINUE` from the expanded bank and records `ANTIC DMA PASS` on START or `ANTIC DMA FAIL` on SELECT before restoring the machine state.
- 2026-09-12: `jsA8E/js/core/{antic,playfield/renderer_base}.js`: corrected ANTIC display-list and playfield DMA reads to use the expansion memory view. This is required for separate-window maps such as COMPY/130XE; shared-window RAMBO behavior remains unchanged.
- 2026-09-12: `implementation/memory_stress_test.asm` and `implementation/MEMORY_STRESS_TEST.XEX`: added a separate stress executable for Mikie-like workloads. It detects the supported AHRM map, repeatedly switches every bank in forward and reverse order, writes and reads both ends of `$4000-$7FFF`, and verifies that the motherboard RAM view survives each pass. The test reports the detected map and `STRESS PASS/FAIL`; ANTIC-specific checks remain outside this CPU-window stress test.
- 2026-09-12: `implementation/memory_stress_test.asm` and `implementation/MEMORY_STRESS_TEST.XEX`: added a RAMBO-specific Self-Test ROM overlay check. It toggles `PORTB` bit 7 over `$5000-$57FF`, verifies ROM isolation and RAM restoration across every bank, and reports `PORTB ROM PASS/FAIL`; COMPY, 130XE, and Ultimate1MB report this subtest as not applicable.
- 2026-09-12: `implementation/memory_stress_test.asm` and `implementation/MEMORY_STRESS_TEST.XEX`: made the RAMBO overlay stage explicitly restore `PORTB=$FF` before returning, so the stress executable cannot leave the Self-Test ROM or another temporary ROM view active.
- 2026-09-12: `implementation/memory_stress_test.asm` and `implementation/MEMORY_STRESS_TEST.XEX`: isolated the RAMBO Self-Test ROM overlay check by saving and disabling NMI/DMA during the temporary `$5000-$57FF` ROM view, then restoring both registers and `PORTB`; this prevents active VBI/DLI handlers from executing through the temporary overlay.
- 2026-09-12: `implementation/memory_stress_test.asm` and `implementation/MEMORY_STRESS_TEST.XEX`: removed the optional RAMBO Self-Test ROM overlay probe from the normal stress flow. The probe remains in the source for isolated experiments, but the general bank stress test now avoids changing the `$5000-$57FF` mapping and reports that control check as not applicable, preventing the test itself from entering firmware Self Test after the final pass.
- 2026-09-12: `implementation/memory_stress_test.asm` and `implementation/MEMORY_STRESS_TEST.XEX`: corrected the Atari screen-code encoding of the not-applicable control result from `NOO` to `N/A`.
- 2026-09-12: `implementation/u1mb_memory_test.asm`, `implementation/U1MB_MEMORY_TEST.XEX`, `implementation/memory_stress_test.asm`, and `implementation/MEMORY_STRESS_TEST.XEX`: preserved the initial BASIC-enable bit across bank selections for profiles whose AHRM banking map does not reuse PORTB bit 1. Profiles that use bit 1 as a bank bit retain their documented banking behavior.
- 2026-09-13: `implementation/u1mb_memory_test.asm`, `implementation/U1MB_MEMORY_TEST.XEX`, `implementation/memory_stress_test.asm`, and `implementation/MEMORY_STRESS_TEST.XEX`: corrected the fixed OS screen address from `$9C40` to `$BC40`, matching `SAVMSC` after XEX boot. The tests were running and writing results, but the display list was rendering the other screen buffer.
- 2026-09-13: `implementation/u1mb_memory_test.asm`, `implementation/U1MB_MEMORY_TEST.XEX`, `implementation/memory_stress_test.asm`, and `implementation/MEMORY_STRESS_TEST.XEX`: replaced the fixed screen address with startup relocation based on the OS `SAVMSC` vector, so diagnostics remain visible with BASIC enabled or disabled.
- 2026-09-13: `implementation/u1mb_memory_test.asm`, `implementation/U1MB_MEMORY_TEST.XEX`, `implementation/memory_stress_test.asm`, and `implementation/MEMORY_STRESS_TEST.XEX`: use `$9C40` only as the relocation's canonical assembly address; all runtime screen stores now move to the actual `SAVMSC`, including `$BC40` when BASIC is disabled.
- 2026-09-13: `jsA8E/js/core/io.js`: added temporary diagnostic logging for actual `PORTB` changes, including CPU PC, cycle, old/new value, selected bank, and CPU/ANTIC window state. This is instrumentation for the Mikie memory-transition investigation and does not alter emulation behavior.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: replaced letter progress markers with Atari display characters: `-` for completed banks, `#` for write pages, `+` for read pages, and `!` for an error marker.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: clarified the 576K COMPY result label from `576K` to `576C`; the bank-selection and verification logic are unchanged.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: corrected the remaining bank-progress marker that still used screen code `$21` (`A`); completed banks now consistently use `-` (`$0D`).
- 2026-09-13: `jsA8E/js/core/memory.js`: aligned U1MB 576K/1088K ROM-overlay behavior with AHRM. BASIC and Self-Test are no longer forcibly disabled when the CPU extended-memory window is enabled; their state changes only on PORTB writes while that window is disabled. This preserves the documented U1MB shadow-PIA behavior and is independent of AtariBlast.
- 2026-09-13: `jsA8E/js/core/io.js`: completed the U1MB overlay correction. PORTB writes with the CPU extended-memory window enabled now preserve the current BASIC/Self-Test visibility while changing banks; writes with the window disabled still apply the documented PORTB overlay bits. This keeps the I/O mapping consistent with the U1MB state model in `memory.js` and AHRM.
- 2026-09-13: `jsA8E/js/core/memory.js`: corrected ANTIC reads while the CPU extended-memory window is active. ANTIC now reads the live selected-bank view instead of stale bank storage, so shared CPU+ANTIC profiles such as RAMBO and U1MB see CPU writes immediately during DMA. Bank storage remains the persistence source after the CPU window changes or closes.
- 2026-09-12: `implementation/u1mb_memory_test.asm` and `implementation/U1MB_MEMORY_TEST.XEX`: fixed Stage 2 status rendering by clearing all reused status rows before writing its label and result, preventing Stage 1 `A`/`B` progress markers from appearing after the new text.
- 2026-09-12: `implementation/U1MB_MEMORY_TEST.XEX` and `implementation/u1mb_memory_test.asm`: added a standalone machine-code test that detects the AHRM 130XE, 320K RAMBO, 576K COMPY, or 1088K bank map, exercises its full banks, displays page-level write/read progress, and reports PASS or FAIL on the OS screen. It avoids BASIC because U1MB bank bits reuse the BASIC/Self-Test control bits; screen-code labels use Atari display encoding.

- 2026-09-10: `A8E/6502.c`: matched the validated jsA8E NMI dispatch fix. Native A8E now accepts one pending NMI edge while an earlier NMI handler is active, instead of dropping it behind the software active-handler guard. The single pending flag is retained to avoid queueing unbounded interrupts.
- 2026-09-11: `A8E/Pokey.c`: synchronized disk READ responses with jsA8E by delivering the command ACK separately from the Complete/data/checksum phase. The pending phase is queued when the ACK is consumed, matching AHRM SIO framing without changing write, status, format, or poll commands.

Reference: follow `AGENTS.md`.
Process rule: review this file before planning any improvement, and update it after each code improvement.

Maintenance rule: temporary diagnostics and single-purpose test routines must be removed after the related bug is confirmed, unless they are generalized into reusable regression tests. Avoid accumulating one-off test hooks in the emulator.

Keep reusable inspection points: the public `A8EAutomation` connection and general-purpose memory, CPU, state, trace, disassembly, breakpoint, and input controls may remain available for future investigations. Remove only game-specific wrappers, probes, counters, and cache-busters once their investigation is complete.
- 2026-09-10: `jsA8E/js/core/{state,memory,io,pokey_sio}.js`: separated disk READ responses into the Acknowledgment and Complete/data phases described by AHRM SIO, preserving the pending phase through snapshots; this is the first Animal Party compatibility experiment and remains under verification.
- 2026-09-10: `A8E/Pokey.c`, `jsA8E/js/core/pokey_sio.js`: added generic AHRM handling for disk `$3F` high-speed index queries and silent routing for absent Type 1/3/4 peripherals. Disk IDs use the high-speed query; non-disk devices do not receive fabricated responses.

## Project Paths
- `A8E/` -> native C implementation.
- `jsA8E/` -> browser JavaScript implementation.
- `implementation/A8E/` -> native C implementation notes.
- `implementation/jsA8E/` -> browser JavaScript implementation notes.

## Update Rules
- Keep entries short and practical.
- Add/update notes when behavior or structure changes.
- Maintain a short `Files` list for fast navigation.

## Notes Template
- Files: key files to open first.
- Purpose: what this area is responsible for.
- Status: verified implementation state (`implemented`, `partial`, or `pending`).
- Notes: short implementation details (simplified).
- Issues: known issues, limitations, or missing implementation items.
- Todo: next improvements or checks.

## A8E (C) Implementation Notes
- [CPU (6502)](A8E/CPU.md)
- [ANTIC](A8E/ANTIC.md)
- [GTIA](A8E/GTIA.md)
- [POKEY](A8E/POKEY.md)
- [PIA](A8E/PIA.md)
- [Atari I/O and System Glue](A8E/SYSTEM.md)
- [Debug](A8E/DEBUG.md)

## jsA8E (JavaScript) Implementation Notes
- [Core Emulation](jsA8E/CORE.md)
- [Input and Host/Device Integration](jsA8E/INPUT_HOST.md)
- [Rendering / CRT](jsA8E/RENDER.md)
- [Audio](jsA8E/AUDIO.md)
- [Automation / Public Machine API](jsA8E/AUTOMATION.md)
- [UI / Interface](jsA8E/UI.md)
- [Worker Boundary](jsA8E/WORKER.md)
- [Debug](jsA8E/DEBUG.md)

## Recent Improvements

- 2026-09-10: `jsA8E/js/core/{state,cpu,antic,atari,app_proxy}.js`, `jsA8E/js/app/automation/utils.js`, `jsA8E/emulator_worker.js`: added non-invasive DLI/VBI/NMI timing diagnostics to `getDebugState()` and preserved them across the Worker boundary. The counters distinguish scheduled, latched, suppressed, requested, coalesced, and serviced NMIs, including the last event location, coalesced source classification, CPU pending/active state, and RTI/RTS return counts; emulation behavior is unchanged and the counters reset with the machine. A temporary Worker URL cache-buster is marked in `app_proxy.js` for live Chrome diagnostics.
- 2026-09-10: `jsA8E/js/core/cpu.js`, `jsA8E/tests/cpu_interrupt_step_regression.test.js`: removed the software `nmiActive` mask from pending-NMI dispatch. A new edge can now be serviced while an earlier NMI handler is active, while the single pending flag still prevents an unbounded queue; this follows the 6502 NMI behavior and targets the DLI coalescing observed with Karate Champion.

- 2026-09-10: `jsA8E/js/core/{atari,state,antic,memory}.js`, `jsA8E/js/{core/app_proxy,app/automation/utils}.js`: extended `getDebugState()` with non-invasive POKEY timer-4 diagnostics (`IRQEN`, `IRQST`, timer configuration, deadline, IRQ count, and CPU IRQ state) to investigate Bosconian's digitized-voice wait loop. The field is now preserved across the worker/API boundary, the diagnostic counter is preserved in snapshots, and neither changes emulation behavior.
- 2026-09-10: `jsA8E/js/core/{pokey,io,atari}.js`: arm inactive POKEY timers when valid AUDF/AUDCTL or SKCTL configuration arrives after an earlier STIMER, without resetting already-running timer phase. This covers software that configures a timer after initialization and is based on AHRM POKEY initialization behavior.
- 2026-09-10: `A8E/Pokey.c`: ported the inactive POKEY timer arming behavior to the native core. AUDF/AUDCTL/SKCTL writes now schedule a valid timer that previously had no deadline without disturbing active timer phase; the implementation is independent of memory expansion.
- 2026-09-10: `A8E/{A8E.c,AtariIo.c,AtariIo.h,Pia.c}`, `A8E/README.md`: added the first native memory-expansion profile, 130XE 128K, selectable with `-128K`. PORTB selects the four 16K banks and separate CPU/ANTIC window enables; ANTIC playfield, virtual-bus, and PMG reads honor the extended window. Larger RAMBO/COMPY profiles remain unimplemented.
- 2026-09-10: `A8E/{AtariIo.h,AtariIo.c,Pia.c}`: preserved a shadow copy of the main `$4000-$7FFF` window while the 130XE CPU window is enabled, restoring it when the window is disabled. This is required by Bosconian's bank-isolation test and prevents extended-bank writes from corrupting the visible main-memory copy.
- 2026-09-10: `A8E/A8E.c`, `A8E/README.md`: added a startup log reporting the selected native memory profile, matching the existing audio startup diagnostics.
- 2026-09-10: validated native `-128K` with `Bosconian.atr`; Bosconian now detects the 130XE memory, loads successfully, and its digitized-voice audio works with the native POKEY timer fix. RAMBO and COMPY profiles remain pending.

- 2026-08-03: real-content spot verification of the timing changes below via the headless runtime with real XL OS/BASIC ROMs: cold boot reaches the BASIC READY prompt with byte-exact screen contents, the SELF TEST menu renders correctly, and `d1.atr` (DOS 2.x boot + Schränker 3 with its DLI color-ladder title screen) loads and renders cleanly. The full disk-content regression sweep from `legacy/COLOR_CLOCK_ACCURACY.md` remains open.

- 2026-08-03: `A8E/AtariIo.{c,h}`, `jsA8E/js/core/{antic,state,memory}.js`, `jsA8E/js/core/playfield/{renderer_base,mode_2_3,mode_4_5,mode_6_7}.js`, `A8E/tests/antic_timing_probe.c`, `jsA8E/tests/antic_vscrol_timing.test.js`: replaced the fetch-time VSCROL height clamps with a live 4-bit mode-line row counter per AHRM 4.7 in both cores. Region entries latch VSCROL at the mode-line fetch and wrap out-of-range values (GTIA 9++ extended lines now work); region-exit lines end when the counter matches the live VSCROL value latched at the top of the cycle-109 clock action (writes through cycle 108 count), so mid-mode-line VSCROL rewrites shorten, extend, or wrap the line. Exit-line DLIs are armed dynamically at cycle 6 of the scanline whose counter matches VSCROL as of cycle 5 (AHRM 4.8), letting the DLI and height decisions diverge as in the documented turbo double-write trick. Character renderers now derive glyph rows from the row counter with the AHRM tall-line mappings (modes 2/3 rows 10-15 repeat 2-7 and rows 8-9 blank/descend, modes 4/6 repeat rows 0-7, modes 5/7 halve the scanline counter); the old `verticalScrollOffset` plumbing was removed. JS snapshots persist the new row-counter state and tolerate older payloads. 

- 2026-08-03: `A8E/{Antic.c,AtariIo.c,AtariIo.h,6502.c,6502.h}`, `A8E/tests/antic_graphics_modes_probe.c`: ported the jsA8E delayed CHBASE latch to the C core per AHRM 4.4. `Antic_CHBASE` schedules the new value 2 color clocks after the bus write (offset by instruction length minus one via the new `cCurrentInstructionCycles` context field), and character modes 2-7 poll `AtariIo_CurrentChbaseRegister` every render cycle instead of snapshotting CHBASE before the loop, so mid-scanline DLI character-set switches land at the correct beam position in both cores.

- 2026-08-03: `A8E/{Antic.c,AtariIo.c,AtariIo.h}`, `jsA8E/js/core/{antic,state,memory}.js`, `A8E/tests/antic_timing_probe.c`, `jsA8E/tests/antic_display_list_nmi.test.js`: aligned VBI timing with AHRM 4.8 in both cores. The VBI now uses the same two-phase model as the DLI: NMIST VBI latches at cycle 7 of scan line 248 (clearing the DLI status bit), the NMI fires at cycle 8, and the NMIEN cycle-7/8 gating (one-cycle delay for a cycle-7 enable, cycle-8 disable suppression) applies. Previously the VBI fired unconditionally at the 247/248 line boundary. JS snapshots persist the armed `vbiCycle` deadline.

- 2026-06-01: `A8E/tests/antic_graphics_modes_probe.c`: restored the probe's SDL-compatible `main(int argc, char *argv[])` signature so the MinGW/SDL2main build no longer conflicts with SDL's `SDL_main` declaration.

- 2026-05-20: `jsA8E/js/core/playfield/mode_8_f.js`, `jsA8E/tests/playfield_mode_8_f_rendering.test.js`: corrected JS ANTIC mode A bitmap expansion to consume all four two-bit pairs in each byte. Mode 8 still repeats each pair across two output cycles, but mode A now advances per pair, fixing the broken Archon board-border bitmap line.

- 2026-05-20: `jsA8E/js/core/hw.js`, `A8E/AtariIo.c`, `jsA8E/tests/playfield_geometry_timing.test.js`: merged the viewport-centering change with the corrected AHRM GTIA origin. The normal 320-pixel playfield starts at full-line `x=96`, so the 336-pixel visible crop starts at `x=88` and keeps the playfield at screen `x=8..327`.

- 2026-05-12: `A8E/AtariIo.c`, `A8E/tests/antic_graphics_modes_probe.c`, `jsA8E/js/core/{gtia,playfield/{playfield,renderer_base}}.js`, `jsA8E/tests/{playfield_geometry_timing,playfield_hscroll_priority_preservation,gtia_pmg_dma_regression}.test.js`: corrected the GTIA/playfield horizontal origin. Normal-width playfield now starts at GTIA color clock `$30` (`x=96` in the 456-pixel line buffer) instead of the previous shifted `x=104`, which centers character modes in the 336-pixel viewport. PMG `HPOS=$30` now maps to the same `x=96` coordinate. Native probes now verify modes 2-7 start at the corrected origin.

- 2026-05-12: `A8E/AtariIo.c`, `A8E/tests/antic_graphics_modes_probe.c`, `A8E/tests/{antic_timing_probe,antic_dma_probe}.c`, `jsA8E/js/core/{atari,playfield/mode_2_3}.js`, `jsA8E/tests/playfield_mode_2_3_rendering.test.js`: tightened ANTIC character-mode rendering against AHRM 4.4/4.11/4.14. Modes 2/3 now treat CHACTL blank+invert as an inverted zero glyph in both cores; JS blanking no longer depends on the character-0 font contents. Native mode 5 now uses the required 1K CHBASE alignment, and native modes 5/7 fetch character data on every repeated scanline instead of silently skipping odd doubled rows. Added a native graphics-mode probe for these regressions and refreshed native DLI probe constants to the current NMIST-cycle representation.

- 2026-04-14: `jsA8E/js/core/{cpu,io}.js`, `jsA8E/js/core/playfield/renderer_base.js`: corrected CHBASE delayed-latch origin per AHRM 4.4. The 2-color-clock latch delay must be measured from the bus write cycle (last cycle of the instruction), not from the instruction start. Since `executeOne` runs instructions atomically, the IO handler now offsets by `(ctx.currentInstructionCycles − 1)` to place the write at the correct point. For STA absolute (4 cycles), the effective latch is now at `io.clock + 5` instead of `io.clock + 2`, fixing a 3-cycle-early CHBASE effect that caused DLI-driven character set switches (e.g. Archon 2 attract mode) to show fewer garbled characters than real hardware.

- 2026-04-13: `A8E/AtariIo.c`, `jsA8E/js/core/antic.js`, `jsA8E/tests/antic_display_list_nmi.test.js`: aligned DLI NMIST/NMI timing with AHRM 4.8 in both cores. `DLI_HORIZONTAL_OFFSET` changed from 8 to 7 (the NMIST cycle); the event handler now sets NMIST at cycle 7 unconditionally and fires the NMI at cycle 8. The `enabledOnCycle7Mask` delay path now reschedules to `beamCycle` (not `beamCycle+1`) so the delayed NMI fires one cycle later at cycle 9. Tests updated to exercise the two-phase cycle-7/cycle-8 behavior explicitly.

- 2026-04-09: `A8E/AtariIo.c`, `jsA8E/js/core/gtia.js`, `jsA8E/tests/gtia_pmg_dma_regression.test.js`: aligned PM horizontal origin with the then-current playfield coordinate map. This was superseded on 2026-05-12 by the corrected GTIA color-clock origin (`HPOS $30 -> x=96`). The interleaved PMG renderer in both cores continues to use the per-line shift-register/state-machine model.

- 2026-04-08: `A8E/AtariIo.c`, `A8E/AtariIo.h`, `jsA8E/js/core/{gtia,antic,memory,state}.js`, `jsA8E/tests/gtia_pmg_dma_regression.test.js`: replaced the interleaved PMG line latch with a bounded per-line trigger queue in both cores. Active PM objects keep their original horizontal start through mid-image `HPOS` writes, `HPOS=0` renders correctly, and repeated rightward same-line retriggers can now build overlapping duplicate images again (matching `dbug.atr` style logo assembly more closely). JS snapshots now preserve the PMG queue state.

- 2026-04-08: `A8E/AtariIo.c`, `jsA8E/js/core/playfield/{mode_4_5,mode_6_7}.js`, `jsA8E/js/core/playfield/renderer_base.js`: fixed character-mode CHACTL/CHBASE timing in both cores. In JS, CHACTL is now latched once at scanline start in modes 4/5/6/7 (matching existing mode 2/3 behavior), and the CHBASE delayed-latch window corrected from +1 to +2 cycles per AHRM 4.4. In C, CHBASE and CHACTL are now snapshotted before the render loop in all modes 2–7, eliminating mid-scanline DLI drift. C modes 2/3 now also correctly implement CHACTL bit 0 (blank), bit 1 (invert), and bit 2 (vertical reflection), which were previously unimplemented; bit 2 reflection is now applied in all C modes 4–7 as well.

- 2026-04-05: `jsA8E/js/core/playfield/renderer_base.js`, `jsA8E/tests/playfield_dma_contention_regression.test.js`: tightened the JS ANTIC virtual-bus path per AHRM 4.14. Late playfield fetches after cycle 105 now honor the active CPU bus address even when it is `$0000` (fixed JavaScript truthiness bug), while the deferred-refresh overlap case remains pinned to pulled-up `$FF`.

- 2026-04-03: `jsA8E/js/core/{antic,io,memory,state}.js`, `jsA8E/js/core/playfield/{renderer_base,mode_8_f}.js`: simplified JS emulation core state flow. `state.js` now owns the fixed `ioData` shape (including `nmiTiming`, `chbaseTiming`, per-line DMA buffers); ANTIC and the playfield renderer no longer rebuild these lazily in hot paths. Media helpers normalize a single shared `machine.media` object instead of patching nested fields in place.

- 2026-04-03: `A8E/{AtariIo.h,Pokey.c}`, `jsA8E/js/core/{atari,io,memory,pokey,state}.js`: aligned POKEY pot-scan model with AHRM. Slow scans advance once per scanline; fast scans advance per machine cycle and hold the `229` terminal count for one extra cycle before forcing `ALLPOT` low; scans run through terminal hold even when `ALLPOT` has already cleared; `SKCTL` mode changes resync from current cycle. JS snapshots preserve mid-scan counter state.

- 2026-04-03: `A8E/{Antic.c,AtariIo.c}`, `jsA8E/js/core/{antic,io,memory,state}.js`: aligned same-scanline DLI `NMIEN` timing with AHRM 4.8 in both cores. Writes by cycle 7 enable the current-line DLI (with one-beam-cycle delay); writes on cycle 8 can still suppress it; NMIST latches unconditionally. JS snapshot state extended to preserve the ANTIC timing latch.

- 2026-03-31: `A8E/AtariIo.{c,h}`, `jsA8E/js/core/{state,memory,antic}.js`, `jsA8E/js/core/playfield/{renderer_base,mode_2_3,mode_4_5,mode_6_7,mode_8_f}.js`: completed ANTIC heavy-contention DMA pass in both cores. Playfield DMA scheduled per line cycle (not bulk stall); first-row fetches fill a reusable 48-byte line buffer; character modes 2–7 place character-data fetch in the later `+3` cycle slot; late fetches after cycle 105 use the virtual CPU bus / refresh-drop path.

- 2026-03-31: `A8E/AtariIo.c`, `jsA8E/js/core/antic.js`: corrected ANTIC NMI timing in both cores. DLI asserts at cycle 8 of the triggering scanline per AHRM 4.8; VBI asserts at the start of scan line 248. VCOUNT flips to the next scanline on cycle 111 of the previous line per AHRM 4.10, including the one-cycle PAL end-of-frame anomaly. Active-line playfield geometry corrected to AHRM 4.14 width starts.

- 2026-03-26: `A8E/6502.c`, `jsA8E/js/core/cpu.js`: aligned undocumented opcodes with the fake6502/Lorenz reference suite in both cores. Covers `ANE`, `LXA`, `ARR`, `LAS`, `SHA`, `SHX`, `SHY`, `TAS`, `RRA`, `SBX`, including the `SHX`/`SHY` write-address glitch and `RRA`/`ISC` decimal-cycle cancellation.

- 2026-03-26: `jsA8E/mcp_server.js`, `jsA8E/tests/mcp_server.test.js`, `jsA8E/package.json`, `README.md`, `jsA8E/README.md`, `jsA8E/AUTOMATION.md`, `implementation/jsA8E/AUTOMATION.md`, `implementation/NOTES.md`: added a local stdio MCP bridge over the headless jsA8E automation runtime for Codex-style clients. The server now exposes `get_capabilities`, `get_system_state`, and `call_automation` with grouped `domain`/`action` routing, keeps binary payloads on base64 or file-path boundaries, and returns screenshot image content plus structured base64 data.

- 2026-03-20: `jsA8E/js/core/{atari.js,atari_snapshot.js}`, `jsA8E/index.html`, `jsA8E/headless.js`, `jsA8E/emulator_worker.js`, `jsA8E/tests/snapshot_save_timing.test.js`: split the snapshot encode/decode and restore cluster out of `atari.js` into a dedicated runtime module. `atari.js` now keeps thin config helpers plus public wrappers, while `A8EAtariSnapshot` owns snapshot building, save/load, screenshot capture, and artifact collection.

- 2026-03-20: `jsA8E/js/app/automation/{build,xex,automation_api}.js`, `jsA8E/index.html`, `jsA8E/headless.js`, `jsA8E/tests/automation_{memory_helpers,snapshot_api,system_state_resilience,url_media_loading,xex_boot_failure}.test.js`: split the build/source-context/disassembly helper cluster out of `automation_api.js` into a dedicated support module. Assembly now owns the last-build record and source lookup/disassembly helpers behind `A8EAutomationBuild`, while `automation_api.js` keeps only thin API wrappers and the boot/load harnesses load `build.js` before the facade.

- 2026-03-20: `jsA8E/js/app/automation/{xex,automation_api}.js`, `jsA8E/index.html`, `jsA8E/headless.js`, `jsA8E/tests/automation_{memory_helpers,snapshot_api,system_state_resilience,url_media_loading,xex_boot_failure}.test.js`: split the XEX boot/orchestration helper cluster out of `automation_api.js` into a dedicated support module. `runXex` now delegates to the new helper layer, and the boot/load harnesses load `xex.js` before `automation_api.js` so the public API can stay thin.

- 2026-03-20: `jsA8E/js/app/automation/{media,artifacts,automation_api}.js`, `jsA8E/index.html`, `jsA8E/headless.js`, `jsA8E/tests/automation_{memory_helpers,snapshot_api,system_state_resilience,url_media_loading,xex_boot_failure}.test.js`: split the media/resource-loading helper cluster out of `automation_api.js` into a dedicated support module. URL fetch, ROM/disk request normalization, HostFS include resolution, assembler option building, and URL-backed media loaders now live behind the new helper layer, while `automation_api.js` keeps only the thin public wrappers.

- 2026-03-20: `jsA8E/js/app/automation/{artifacts,automation_api}.js`, `jsA8E/index.html`, `jsA8E/headless.js`, `jsA8E/tests/automation_{memory_helpers,snapshot_api,system_state_resilience,url_media_loading,xex_boot_failure}.test.js`: split the artifact/failure snapshot cluster out of `automation_api.js` into a dedicated helper module. The public API still exposes the same methods, but wait failure snapshots, artifact bundles, and XEX boot failure capture now delegate through thin wrappers backed by the new support file, and every boot path/test harness loads that support file before `automation_api.js`.

- 2026-03-20: `jsA8E/js/core/{atari.js,atari_support.js}`, `jsA8E/index.html`, `jsA8E/emulator_worker.js`, `jsA8E/headless.js`: split the snapshot/video/artifact helper cluster out of `atari.js` into a shared support module. `atari.js` now keeps boot/runtime orchestration, while the new helper file owns reusable video cloning/restoration, frame-alignment, artifact range normalization, and screenshot capture logic.

- 2026-03-20: `jsA8E/js/core/playfield/mode_8_f.js`: reduced the repeated ANTIC 8/F scanline write blocks by introducing small pair/quad write helpers and a shared mode 8/A body. The helper cuts keep the hot-path structure explicit while removing the largest duplicated pixel-write fragments in the file.

- 2026-03-20: `jsA8E/js/core/playfield/mode_2_3.js`: reduced the duplicated ANTIC mode 2/3 text scanline bodies with a shared helper that takes the character-row fetch function and scroll base as parameters. The wrappers are now thin mode selectors, which keeps the mode-specific differences obvious while removing repeated pixel-write code.

- 2026-03-20: `jsA8E/js/core/playfield/mode_{4_5,6_7}.js`: reduced duplicated text-mode scanline bodies by introducing per-file common render helpers for the paired ANTIC modes. The wrappers now only select the fetch function and scroll/DMA variant, which makes the inner loops easier to follow without changing behavior.

- 2026-03-20: `jsA8E/js/app/automation/{utils,automation_api}.js`: split out shared automation helpers for XEX launch, failure normalization, timeout parsing, and state cloning. `automation_api.js` now keeps orchestration only, while `utils.js` owns the reusable helper layer, including the preflight range clone used by XEX snapshots.

- 2026-03-20: `jsA8E/js/core/gtia.js`, `jsA8E/js/core/playfield/mode_8_f.js`, `implementation/NOTES.md`: small runtime cleanup pass. Removed the unused `vdelayMask` parameter from the GTIA PMG DMA address helper and hoisted the mode-F M10 priority lookup table out of the inner scanline loop to reduce per-cycle allocation churn.

- 2026-03-19: `jsA8E/js/core/gtia.js`, `A8E/AtariIo.c`: fixed PMG DMA timing in both cores. `VDELAY` now masks per-sprite DMA fetches on even scan lines instead of shifting PMG memory rows; player DMA keeps the missile slot active as required by AHRM 4.13. Native C now uses a unified cycle-accurate `AtariIo_FetchPmgDmaCycle` scheduled in `AtariIo_DrawClockAction` at the documented DMA cycle slots.

- 2026-03-19: `jsA8E/js/core/playfield/playfield.js`, `jsA8E/js/core/playfield/renderer_base.js`, `A8E/AtariIo.c`: fixed HSCROL clip/background fill paths to preserve already-composited PMG pixels in both the clipped aperture fill and trailing border area.

- 2026-03-19: `jsA8E/js/core/{gtia,antic,atari}.js`, `jsA8E/js/core/playfield/`, `jsA8E/js/core/state.js`: code quality review pass. Fixed GTIA priority mask truncation (`& 0xffff`), wired `PRIO_PF3`/`PRIO_M10_PM0-3` through the full config chain, corrected VCOUNT update ordering in `clockAction()`, removed dead code throughout.

- 2026-08-16: `jsA8E/{index.html,style.css,js/app/ui.js,js/core/{hw,atari,app_proxy}.js,emulator_worker.js}`: wired a minimal PAL/NTSC selector into the browser UI and boot path. The selected standard now persists through `window.A8E_BOOT_OPTIONS` / `localStorage`, reaches both the main-thread and worker backends before hardware setup, and rebuilds the timing tables on reload. `hw.js` now selects PAL vs NTSC line count and CPU clock from the boot standard, and `$D014` reads back `01` for PAL / `0F` for NTSC per AHRM so `peek(53268)` can distinguish the machine type again.


- 2026-08-17: `jsA8E/{index.html,style.css,js/app/ui.js,js/core/{state,io,memory,atari,app_proxy}.js,emulator_worker.js}`: reworked the browser memory-expansion path on top of the clean PAL/NTSC base. The UI now exposes a profile selector, `PORTB` writes preserve the raw banking bits, and the runtime carries the active extended-RAM profile through main-thread and worker boot/reset flows while restoring the banked window on `PORTB` changes. Snapshot state now includes the memory profile so COMPY and larger RAMBO variants can keep CPU/ANTIC views separate.

- 2026-08-17: project checkpoint.
  - Confirmed: PAL/NTSC selector is wired through the browser boot path.
  - Confirmed: `peek(53268)` distinguishes PAL and NTSC again.
  - Confirmed: PAL and NTSC now use separate browser palette tables.
  - Confirmed: the BASIC color-bar test shows a visible PAL/NTSC difference.
  - Pending: memory-expansion compatibility still needs a clean verification pass.


- 2026-08-17: `jsA8E/{js/render/{palette,software}.js,js/core/atari.js}`: split the browser color palette by video standard so NTSC and PAL no longer share a single RGB table. The renderer now passes `videoStandard` into palette construction, giving NTSC its own chroma tuning path and leaving PAL with a separate mapping.
- 2026-08-17: `jsA8E/{js/render/{palette,software}.js,js/core/atari.js}`: restored the PAL palette to the original C hue table and switched NTSC to a separate, more evenly spaced hue progression. The browser renderer still selects the palette from `videoStandard`, so PAL keeps its prior look while NTSC can diverge more realistically.
- 2026-08-17: `jsA8E/js/render/palette.js`: documented the calibrated palette split for future reference. PAL keeps the legacy C hue table (`0, 163, 150, 109, 42, 17, -3, -14, -26, -53, -80, -107, -134, -161, -188, -197`), while NTSC uses the smoother progression (`0, 163, 139, 115, 91, 67, 43, 19, -5, -29, -53, -77, -101, -125, -149, -173`). This was verified visually with the BASIC color-bar test, which now shows a clear PAL/NTSC difference without collapsing the PAL palette.

- 2026-09-08: `A8E/{A8E.c,AtariIo.{c,h},Gtia.c,Pokey.c}`: ported the PAL/NTSC machine selection to the native C emulator. PAL remains the default; `-n` selects NTSC with 262 lines, 1.789773 MHz POKEY timing, `$D014 = $0F`, a separate NTSC palette, and an NTSC logical pixel aspect. The internal 456-pixel line and maximum 312-line allocation remain shared only as storage limits; active timing and register behavior use the selected machine state.

- 2026-09-09: `A8E/A8E.c`: replaced the fixed 18 ms no-audio fallback delay with the selected machine's rounded frame period. This prevents NTSC (about 16.68 ms per frame) from being throttled below its native cadence while preserving PAL's approximately 20 ms cadence.
- 2026-09-09: `A8E/Pokey.c`: added startup diagnostics for SDL audio initialization, device opening, and negotiated format. Audio failures previously fell back to silent operation without reporting the cause.
- 2026-09-09: `A8E/{A8E.c,Pokey.{c,h},AtariIo.c,AtariIo.h}`: added `-d` audio diagnostics. The native emulator writes per-frame CSV metrics for ring level, generated/consumed samples, underruns, overruns, selected standard, and SDL audio status.
- 2026-09-09: `A8E/A8E.c`: audio playback now uses the SDL ring buffer as the sole active timing source. The PAL/NTSC frame-delay fallback is used only when SDL audio is not playing, preventing the extra delay from causing audio underruns.
- 2026-09-09: `A8E/Pokey.c`: on Windows only, failed default SDL audio opening now retries with `SDL_AudioInit("directsound")`; Linux and macOS retain SDL's automatic backend selection. Startup logs now include the active SDL audio driver.
- 2026-09-09: `A8E/Pokey.c`: accepted SDL devices negotiating mono or stereo output. The native POKEY mixer remains mono and duplicates each frame into both channels for stereo devices, avoiding a false initialization failure when Windows defaults to two channels.
- 2026-09-09: `A8E/Pokey.c`: accepted SDL devices negotiating 32-bit signed or float output in addition to `AUDIO_S16SYS`. In particular, `0x8120` is `AUDIO_F32SYS`; the callback converts the 16-bit POKEY mixer output to float or signed 32-bit samples and preserves mono/stereo handling.
- 2026-09-09: `A8E/Pokey.c`: corrected the SDL callback branch selection so `AUDIO_F32SYS` uses the 32-bit conversion path instead of being written as 16-bit PCM. This fixes silent output when the Windows WASAPI device negotiates format `0x8120`.
- 2026-08-21: `Memory` branch: restored the PAL/NTSC palette selection lost during the merge from `main`. The memory-expansion changes remain untouched; the software renderer now receives the hardware video standard and selects the matching PAL or NTSC hue table.

- 2026-09-10: `jsA8E/js/core/pokey_sio.js`, `jsA8E/js/core/pokey.js`: made the absent-device path explicitly clear pending `SERIN` data, the pending read phase, and the SERIN-ready flag before allowing `$3F/$40` polls to time out. This preserves the no-response behavior while preventing stale bytes from a previous SIO command from being consumed as a poll result.
- 2026-09-10: `jsA8E/js/core/pokey_sio.js`: corrected the timeout cleanup to use the configured `CYCLE_NEVER` sentinel. The missing local constant caused the CPU execution error that appeared as the blue-screen hang after the first timeout patch.
- 2026-09-10: `jsA8E/js/core/atari.js`: completed the SIO timeout wiring by passing the active frame-cycle value into POKEY/SIO. Without this connection, absent-device timeouts were scheduled with `NaN` and `TIMFLG` could never be raised.
- 2026-09-10: `jsA8E/js/core/{pokey_sio,antic}.js`: corrected `TIMFLG` polarity using the OS definition: SIO waits start with `$0317=1`, and an absent-device timeout changes it to `$00`. The previous diagnostic implementation inverted this flag.
- 2026-09-10: `jsA8E/js/core/antic.js`: completed the generic absent-SIO-device timeout cleanup. When `TIMFLG` expires, pending serial timing events, frame phases, response bytes, and active-low serial IRQ sources are cleared without changing the OS DCB or inventing a peripheral response.
- 2026-09-10: `jsA8E/js/core/{atari,pokey,pokey_sio}.js`: aligned the synthetic absent-device `DTIMLO` timeout to the next OS VBI (scan line 248) instead of expiring at an arbitrary SIO command cycle. The selected PAL/NTSC frame geometry is passed into SIO so the timing remains standard-specific.
- 2026-09-10: `jsA8E/js/core/pokey_sio.js`: stopped rearming the absent-device `DTIMLO` timeout on every Type 1 poll retry. The first unanswered `$3F` command starts one timeout window; subsequent retries remain silent until that same window expires.
- 2026-09-11: `jsA8E/js/core/pokey_sio.js`: cleared all three active-low serial IRQST sources (`$08/$10/$20`) before an absent-device poll retry. Clearing only SERIN could leave stale SEROUT/ transmission-done state from the preceding disk command and alter the OS SIOV retry path.
- 2026-09-11: `jsA8E/js/core/pokey_sio.js`: made absent `$3F/$40` SIO devices fully silent by removing the artificial `IRQST`, `TIMFLG`, SERIN and SEROUT cleanup. The OS now exclusively owns the timeout/retry result, per AHRM 9.1.
- 2026-09-11: `jsA8E/{js/core/app_proxy.js,emulator_worker.js}`: versioned the worker and `pokey_sio.js` URLs as `sio-silent1` so the absent-device behavior change cannot be hidden by browser cache.
- 2026-09-11: removed AtariWriter-only reset/checksum/status probes, CDP wrappers, cache-busters, and placeholder 850/R: device classes after that investigation was paused. Generic SIO disk phases, absent-device routing, bounded SIO events, and reusable public inspection APIs remain.
- 2026-09-13: added `ATR/mikie.md` as the reference for the Mikie V1.12 investigation. It records the XEX/temporary-ATR distinction, banked segment layout, observed SIO and CPU failure state, current diagnosis, AHRM references, and the bounded PORTB-transition diagnostic proposed for the next comparison.
- 2026-09-13: added `ATR/AtariBlast.md` as the reference for Atari Blast. The initial entry records the mixed 128/256-byte ATR geometry, custom boot/SIO observations, the absence of runtime results so far, and the AHRM-compliant investigation order.
- 2026-09-13: updated `ATR/AtariBlast.md` with the first live jsA8E observation: valid 256-byte D1 reads reached at least sector 582 while Ultimate1MB bank switching remained active, followed by a suspected OS SIO/VBI load stall without CPU fault or reset. No workaround was added.
- 2026-09-13: updated `ATR/AtariBlast.md` with the later live result: after the long load, Atari Blast entered a repeating `$0000`/`$C02C` BRK/vector path with descending SP, without SIO timeout or illegal opcode. The issue is now classified as post-load control-flow corruption; no patch was added.
- 2026-09-13: updated `ATR/AtariBlast.md` after re-reading the image: Atari Blast's loader writes `$D301` and reads `$7FFE-$7FFF`, confirming that bank contents, not only expansion size, are required during loading. The next comparison must correlate PORTB writes with window reads before any fix is attempted.
- 2026-09-13: updated `ATR/AtariBlast.md` with the required capability for Atari Blast: profile-accurate PORTB bank mapping/persistence across the `$4000-$7FFF` CPU window, including `$7FFE/$7FFF` reads and final vector/stack handoff. Existing 256-byte SIO reads progress without timeout, so no SIO patch was selected.

### XEX loader target relocation after 16-bit RUNAD fix

The XEX loader's RUNAD check now reads both `$02E0` and `$02E1`. The three-byte expansion moves the `get_byte` and `read_sector` routines and the SIO buffer operands; all internal JSR targets and patch indices in both JavaScript and native loaders must be relocated together. This preserves low-memory RUNAD support without corrupting XEX segment reads.
- 2026-09-13: `A8E/Pia.c`: connected U1MB UCTL memory modes to the generic
  bank mapper: mode 00 disables expansion, mode 01 selects 320K RAMBO, mode
  10 selects 576K COMPY, and mode 11 selects 1088K RAMBO-style banking.
  UCTL writes immediately resynchronize the active PORTB window.
- 2026-09-13: `A8E/Pia.c`: applied the U1MB Shadow PIA overlay rule. While the
  CPU extended-memory window is enabled, PORTB bank writes no longer change
  BASIC/OS/Self-Test overlays; those controls update only when the CPU window
  is disabled, matching AHRM 12.3 sequence-dependent behavior.
- 2026-09-13: `A8E/{AtariIo.c,AtariIo.h,Pia.c}`: added the U1MB UPBI/UCAR
  configuration register and read-only PBI button status surface. These
  registers are isolated to the U1MB profile and honor the configuration lock.
- 2026-09-13: `A8E/README.md`: documented the native RAMBO/COMPY/U1MB command
  line profiles and clarified that U1MB BIOS/flash/PBI image emulation needs
  an external image; no synthetic firmware contents are provided.
- 2026-09-13: `A8E/AtariIo.c`: corrected U1MB register installation so
  `$D380-$D384` remain OS ROM on ordinary 64K/130XE/RAMBO/COMPY machines and
  are remapped to U1MB only when `-U1MB` is selected. This prevents the U1MB
  handlers from corrupting the normal XL/XE startup path.
- 2026-09-13: `A8E/Pia.c`: removed the eager ORB application during PBCTL
  direction changes. Applying an uninitialized zero ORB at that point could
  hide the OS ROM before startup software wrote the intended PORTB value.
  PORTB mapping remains driven by explicit PORTB writes until effective DDRB
  handling is completed with pull-up state.
- 2026-09-13: `A8E/Pia.c`: verified the native startup regression fix. Removing
  eager ORB application during PBCTL direction changes restores normal OS ROM
  startup; `A8E` now renders correctly again with default and expanded-memory
  arguments.
- 2026-09-13: `A8E/Pia.c`: corrected the expansion bus matrix. RAMBO profiles
  no longer expose their CPU window to ANTIC; COMPY profiles use the separate
  ANTIC window, and only U1MB mode 1088K uses a shared CPU/ANTIC window, per
  AHRM 2.7 and 12.3.
- 2026-09-13: Native memory-test validation: `-320R` and `-320C` complete
  successfully. `-576R`, `-576C`, and `-1088R` reach the START prompt but
  show graphics corruption during bank testing. `-U1MB` begins testing,
  flickers, and eventually loses the display before the START prompt. These
  results isolate the remaining work to high-map overlay/ANTIC interaction
  and U1MB firmware-independent mapping, rather than the basic 320K bank
  decoder.
- 2026-09-13: `A8E/Pia.c`: fixed high-capacity RAMBO/COMPY bank writes from
  being misinterpreted as BASIC/Self-Test overlay changes. The reused PORTB
  bits are now treated as bank selectors for 576K and 1088K physical profiles;
  U1MB retains its separate Shadow PIA sequencing rule.
- 2026-09-13: `A8E/AtariIo.c`: synchronized ANTIC reads with the live CPU
  window for U1MB's shared 1088K mode. Bank storage is now used only after a
  bank/window transition, matching jsA8E and preventing one-write-late display
  glitches during DMA.
- 2026-09-13: `A8E/{Pia.c,AtariIo.c}`: aligned native shared-window behavior
  with the validated jsA8E profiles. RAMBO 192K/320K/576K/1088K and U1MB
  1088K expose the live CPU window to ANTIC; 130XE and COMPY retain separate
  ANTIC-window rules. This supersedes the earlier native-only interpretation
  that treated RAMBO as CPU-only.
- 2026-09-13: `A8E/AtariIo.c`: matched jsA8E's live-window rule for ANTIC
  reads whenever the CPU extended window is active, including 130XE's
  separate ANTIC window. This keeps display DMA coherent with CPU writes
  during the memory test's visual stage.
- 2026-09-13: `A8E/{AtariIo.h,Pia.c}`: ported persistent expansion state from
  jsA8E. Native transitions now track initialization and BASIC/Self-Test
  visibility separately, calculate new overlay state before committing a
  bank, and preserve high-map forced-off behavior during active CPU windows.
- 2026-09-13: `A8E/Pia.c`: removed the legacy 130XE `PORTB` bit-6 forcing
  during expansion writes. jsA8E preserves the complete written byte and
  derives only the documented bank/window bits; native behavior now matches
  that rule and avoids altering the test's post-load display state.
- 2026-09-14: `jsA8E/js/core/memory.js` and
  `jsA8E/tests/memory_xex_preflight_bank_switch.test.js`: corrected separate
  130XE/COMPY ANTIC visibility. When only the CPU extended-RAM window is
  enabled, ANTIC now reads the preserved motherboard `$4000-$7FFF` view rather
  than the CPU's live bank; enabling the independent ANTIC window still exposes
  that selected bank. This follows AHRM 2.7 and is covered by a regression.
- 2026-09-20: `jsA8E/js/app/hostfs_ui.js`: added a row-level Run action for
  `.XEX` files in HostFS. The action reads the file from H:, loads it into D1:
  through the existing emulator loader, and resets/starts the machine. This is
  a direct UI loader path, not an Atari-side CIO command executed through H:.
- 2026-09-20: `implementation/jsA8E/COMPILER_DEBUGGER.md`: recorded the
  compiler/debugger review. The current XEX workflow is functional, while
  worker Run synchronization, preprocessor source mapping, worker step
  acknowledgements, `stepOverAsync()` validation, object linking, `.SET`
  redefinition, and case-insensitive automation symbol lookup remain follow-up
  items.
- 2026-09-20: `jsA8E/js/app/ui.js`: identified a pending UI improvement for the
  top-bar run/pause control. While a worker lifecycle request is in flight, the
  UI currently disables the control; a future change should coalesce repeated
  clicks and apply the last requested start/pause state after the worker ACK.
  This is now implemented as a GUI-only promise queue; the worker and emulator
  lifecycle behavior remain unchanged. While pending, the run/pause button
  shows a spinner and an explicit busy style so the disabled state is visible.
  If Start is still pending, the first Pause click is accepted as one queued
  intent and subsequent clicks are blocked until that intent is confirmed.
- 2026-09-20: jsA8E: added a separate application fullscreen control. The
  existing fullscreen button and F11 continue to maximize only the Atari
  display; the new workspace button maximizes the complete browser app, keeping
  the toolbar, screen, Disk Library, HostFS, and other panels visible.
- 2026-09-20: jsA8E/js/core/pokey.js: replaced the exponential browser mixer
  volume curve with an AHRM-informed, approximately binary-weighted 4-bit DAC
  table. The approximation preserves the documented wider transitions at
  volume changes 3->4, 7->8, and 11->12; hardware-level calibration remains
  pending real-device or reference-emulator captures.
