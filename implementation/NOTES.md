# NOTES.md

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

Simple implementation notes for this repository.

Reference: follow `AGENTS.md`.
Process rule: review this file before planning any improvement, and update it after each code improvement.

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

## AHRM Discrepancies

`AHRM/` is a verbatim transcription (the manual may only be redistributed verbatim), so its printed errors and internal contradictions stay in place. When sections disagree, both cores follow the register pages (ch. 14), the tables and the more specific statement. Confirmed on 2026-09-22 by comparing the sections involved:

- 5.7 says a pending interrupt sets its IRQST bit "to a 1"; 14.4 gives 0 = pending (active low, as on hardware). The cores follow 14.4.
- 5.7 says the serial-output-complete IRQ (bit 3) fires even with IRQEN bit 3 clear; 14.4 says setting IRQEN bit 3 fires it while the output is idle. The cores require the enable (14.4).
- 14.4's IRQST text says reset status bits "stay low", but its table gives 1 = not active or disabled. The cores follow the table.
- 5.6 says reading SERIN has no side effects; 14.4 says it clears the internal data-ready state. The cores give SERIN reads no IRQ side effect; software acknowledges through IRQEN.
- 5.9 says an ALLPOT bit "is 0" for a time proportional to the count; 14.4 has it read 1 while the pot is still counting. The cores follow 14.4.
- 6.7 says PRIOR=%1000 with PF0/PF1, a player and the fifth player shows PF3; the 6.7 equations give PF0/PF1. The cores follow the equations.
- 3.5 prose opcode lists disagree with Table 2 (the NOP list includes `$4C`, SAX "$87, 8F, 97, 9F", SHA "$93", ANC "$0B"). Table 2 is correct.
- 3.2 applies the BCD correction when a nibble "exceeds 10"; the correction applies above 9.
- 4.14 says VCOUNT changes show "on cycle 100 or later"; 4.10 gives cycle 111, which the cores use.
- 5.3 prints the 4-bit polynomial period as "N bits"; it is 15.
- Pulled-up `$FF` reads of undriven addresses and refresh/virtual-DMA overlaps come from the XL data-bus pull-ups (2.3); 4.14 itself only says "floating bus data being used".

## Recent Improvements

- 2026-09-22: `A8E/AtariIo.c`, `A8E/tests/antic_graphics_modes_probe.c`, `jsA8E/js/core/{gtia,atari}.js`, `jsA8E/tests/gtia_pmg_dma_regression.test.js`: player/missile colors now follow the AHRM 6.7 priority equations in both cores instead of per-object masks that only looked at the lowest PRIOR bit. Each color clock with an active object ORs the color registers the equations select: with the OS default PRIOR=0, PF0/PF1 mix with P0/P1 and PF2/PF3 with P2/P3 (P2 `$46` over PF2 `$94` shows `$D6`), multicolor mode blends M0+M1 and M2+M3, the fifth player beats the other playfields, and conflicting priority bits give Table 16's black. Hires text no longer takes a hidden player's hue: the logic sees PF2 and only the PF1 luminance is impressed on the 1-bits afterwards (AHRM 6.8). Collisions are unchanged. The `d1.atr` title renders pixel-identical.

- 2026-09-22: `A8E/{6502.c,6502.h,Pokey.c,Pokey.h,AtariIo.c}`, `A8E/tests/system_probe.c`, `jsA8E/js/core/{cpu,io,antic,input,atari,atari_snapshot,hw}.js`, `jsA8E/tests/{system_io,keyboard_input,cpu_interrupt_step_regression}.test.js`: POKEY IRQs now follow AHRM 5.7/14.4 in both cores. A source latches its IRQST bit only while enabled in IRQEN (disabled events are lost), IRQEN writes reset the disabled bits, and bit 3 is an unlatched serial-output-idle status (IRQST reads `$F7` at rest) that IRQEN writes do not touch. The CPU's IRQ input is now a level (`~IRQST & IRQEN`) instead of a count of events, so acknowledging a source through IRQEN really releases the IRQ. Fixes the XL OS keyboard going dead after a program starts timer 1 with its IRQ disabled (the OS dispatcher saw the timer bit first), and the bursts of stale IRQs after long masked sections. jsA8E no longer fakes IRQST bits on SEROUT writes or SERIN reads. Verified with the real XL OS: the STIMER scenario keeps the keyboard alive in both cores, and `d1.atr` still boots through SIO into the game in both cores.

- 2026-09-22: `A8E/{Pia.c,Pia.h,AtariIo.c}`, `A8E/tests/system_probe.c`, `jsA8E/js/core/{io,hw,state,input,atari,memory}.js`, `jsA8E/tests/{system_io,keyboard_input}.test.js`, `jsA8E/AUTOMATION.md`: the Reset key (F5) now resets like an XL in both cores (AHRM 2.4): ANTIC NMIEN/DMACTL clear (AHRM 4.1), the PIA clears all registers and port B falls back to the pull-ups, mapping the OS ROM in and BASIC and self-test out while keeping the RAM under them (AHRM 2.5, 2.6), then the 6502 takes the OS reset vector. Programs that banked the OS out warm-start instead of jumping through their RAM vector with NMIs still running. TRIG3 reads 0 on the cartridge-less 800XL (AHRM 2.8), so the OS warm start no longer depends on the CARTCK checksum, and PACTL/PBCTL read back bits 0-5 as written. The jsA8E UI/automation reset stays a cold reset and now clears RAM like a power cycle, so it still reboots the mounted media now that the TRIG3 quirk no longer forces a cold start. Verified end to end with the real XL OS in both cores: F5 keeps a BASIC program, recovers a program that banked the OS out, and the JS UI reset cold-starts.

- 2026-09-22: `A8E/{AtariIo.c,AtariIo.h}`, `A8E/tests/system_probe.c`, `jsA8E/js/core/input.js`, `jsA8E/tests/keyboard_input.test.js`, `README.md`, `jsA8E/README.md`: fixed the keyboard glue against AHRM 5.8 in both cores. Shift+Up/Down now send Ctrl+`-`/Ctrl+`=` (`$8E/$8F`) instead of Ctrl+`<`/Ctrl+`>` (`$B6/$B7`, clear screen and insert), and releasing a Shift+arrow cursor key now sets SKSTAT bit 2 again, so the OS no longer auto-repeats the key forever. The native build ignores SDL key repeats (they latched extra keys and left bit 2 stuck) and maps the SDL2 special keys F1 (Help), F6/Caps Lock (Caps), F7 (Inverse) and Esc like jsA8E.

- 2026-09-22: `A8E/{AtariIo.c,Antic.c}`, `A8E/tests/system_probe.c`, `jsA8E/js/core/{hw,state,io,atari}.js`, `jsA8E/tests/system_io.test.js`: I/O registers now answer at every mirror address in both cores (GTIA every `$20` bytes, POKEY and ANTIC every `$10`, PIA every 4; AHRM 2.5, 4.1, 5.1, 6.1). Bounty Bob Strikes Back! no longer hangs polling VCOUNT at `$D47B` (AHRM 4.16). Undecoded `$D1xx`/`$D5xx-$D7xx` addresses and unassigned ANTIC/POKEY slots read `$FF` instead of `$00` (AHRM 2.3, 4.1, 5.1), write-only GTIA slots `$D01B-$D01E` read `$0F` like `$D015-$D01A` (AHRM 6.1, Table 13), and NMIST bits 4-0 read 1 (AHRM 14.6). JS `ioAccess` dispatches on the canonical address from `hw.ioRegisterAddress`.

- 2026-09-22: `A8E/{Pia.c,AtariIo.c,AtariIo.h,CMakeLists.txt}`, `A8E/tests/system_probe.c`, `jsA8E/js/core/{io,hw}.js`, `jsA8E/tests/system_io.test.js`, `jsA8E/package.json`: port A output bits now read back as the AND of ORA and the joystick input in both cores (`input & (ORA | ~DDRA)`, AHRM 2.5), and ORA powers on as `$00` instead of `$FF` (AHRM 14.5). Software that drives port A bits low to mask them, such as Caverns of Mars (AHRM 2.9), reads the joystick again. New native `system_probe` and JS `system_io` tests drive the registers through the CPU.

- 2026-09-22: `A8E/{6502.c,6502.h,CMakeLists.txt}`, `A8E/tests/cpu_probe.c`, `jsA8E/js/core/{cpu,cpu_tables,atari_snapshot}.js`, `jsA8E/tests/cpu_undocumented_opcodes.test.js`: aligned the CPU with AHRM 3.2/3.5 in both cores. Decimal `ADC` now takes N/V from the intermediate sum and Z from the binary sum, decimal `SBC` flags come from the binary result, and the extra decimal cycle (a 65C02 trait) is gone, which also drops the old `RRA`/`ISC` cycle cancellation. `$EB` executes as `SBC #imm` (the C core previously exited on it and the JS core ran it as a 1-byte NOP). The 12 KIL/JAM opcodes now jam the CPU until reset: no fetches, no NMI/IRQ, clock keeps running. New native `cpu_probe` and the JS tests compare decimal `ADC`/`SBC`/`$EB` exhaustively against the NMOS reference algorithm. JS snapshots carry the `halted` flag.

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
