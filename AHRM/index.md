# AHRM - Altirra Hardware Reference Manual

> Local markdown mirror note: revised on 2026-04-05 against the online [2026-01-02 Altirra Hardware Reference Manual PDF](https://www.virtualdub.org/downloads/Altirra%20Hardware%20Reference%20Manual.pdf), the [Atari 8-bit technical documents archive](https://ftp.pigwa.net/stuff/collections/atari_forever/www/www.atari-history.com/archives/tech_docs_8bits.html), the [Atari Home Computer Technical Reference Notes (1982)](https://www.bitsavers.org/pdf/atari/400_800/CO16555_Atari_Home_Computer_Technical_Reference_Notes_1982.pdf), and community resources from [AtariAge](https://forums.atariage.com/) and [Altirra 4.50 Test 7](https://www.virtualdub.org/altirra.html) emulator fixes. The 2026-04-05 pass fixed:
>
> - **Polynomial formulas**: Restored broken superscript notation in 5.2 Initialization, 5.3 Sound generation, 5.5 Noise generators, and B.5 CRC algorithm (`x 3` → `x^3`, `2 N - 1` → `2^N - 1`, etc.)
> - **Register listing (14.7)**: Rebuilt the entire quick-reference register table from scratch — collision, trigger, color, audio, and ANTIC bit fields were all garbled from PDF extraction
> - **Register list (14.2)**: Fixed garbled SIZEM register table layout
> - **HTML entities**: Converted `&gt;`, `&lt;`, `&amp;` back to plain characters across 12 files
> - **Oscilloscope text artifacts**: Removed leaked Rigol instrument metadata from E.5, 5.6, 6.2, E.3, 7.5
> - **Garbled register tables**: Restructured MIO status/control register descriptions (11.3) and 850 Interface Module command fields (9.10)
> - **Garbled character sets**: Added PDF-reference notes for 1025/1029 printer character set tables that were irreparably corrupted during extraction
> - **CRC code formatting**: Restored Python code blocks in B.5 that were collapsed to single lines
> - **ANTIC virtual DMA**: Clarified refresh-cycle overlap behavior on cycle 106 (pulled-up bus data) per Altirra 4.50 findings
> - **Sound generation**: Fixed placeholder "N" → 15 for 4-bit polynomial counter period
>
> The 2026-01-02 PDF remains the latest AHRM edition (confirmed 2026-04-05; no newer version exists). Chapter 14's original section boundaries are preserved in the local index; `14. Reference/2. Register list.md` remains the combined raw extraction.

## 0. Front Matter

- [Front Matter](0.%20Front%20Matter/Front%20Matter.md)

## 1. Introduction

- [1. Introduction](1.%20Introduction/1.%20Introduction.md)
- [2. Conventions in this manual](1.%20Introduction/2.%20Conventions%20in%20this%20manual.md)
- [3. What's new in this edition](1.%20Introduction/3.%20What%27s%20new%20in%20this%20edition.md)
- [4. Concepts](1.%20Introduction/4.%20Concepts.md)

## 2. System Architecture

- [System Architecture](2.%20System%20Architecture/System%20Architecture.md)
- [1. Basic architecture](2.%20System%20Architecture/1.%20Basic%20architecture.md)
- [2. Clocks](2.%20System%20Architecture/2.%20Clocks.md)
- [3. Memory system](2.%20System%20Architecture/3.%20Memory%20system.md)
- [4. System Reset button](2.%20System%20Architecture/4.%20System%20Reset%20button.md)
- [5. Peripheral Interface Adapter (PIA)](2.%20System%20Architecture/5.%20Peripheral%20Interface%20Adapter%20%28PIA%29.md)
- [6. Bank switching](2.%20System%20Architecture/6.%20Bank%20switching.md)
- [7. Extended memory](2.%20System%20Architecture/7.%20Extended%20memory.md)
- [8. Miscellaneous connections](2.%20System%20Architecture/8.%20Miscellaneous%20connections.md)
- [9. Examples](2.%20System%20Architecture/9.%20Examples.md)
- [10. Further reading](2.%20System%20Architecture/10.%20Further%20reading.md)

## 3. CPU

- [CPU](3.%20CPU/CPU.md)
- [1. Flags](3.%20CPU/1.%20Flags.md)
- [2. Decimal mode](3.%20CPU/2.%20Decimal%20mode.md)
- [3. Cycle timing](3.%20CPU/3.%20Cycle%20timing.md)
- [4. Interrupts](3.%20CPU/4.%20Interrupts.md)
- [5. Undocumented instructions](3.%20CPU/5.%20Undocumented%20instructions.md)
- [6. 65C02 compatibility](3.%20CPU/6.%2065C02%20compatibility.md)
- [7. 65C816 compatibility](3.%20CPU/7.%2065C816%20compatibility.md)
- [8. 65C816 new features](3.%20CPU/8.%2065C816%20new%20features.md)
- [9. Examples](3.%20CPU/9.%20Examples.md)
- [10. Further reading](3.%20CPU/10.%20Further%20reading.md)

## 4. ANTIC

- [ANTIC](4.%20ANTIC/ANTIC.md)
- [1. Basic operation](4.%20ANTIC/1.%20Basic%20operation.md)
- [2. Display timing](4.%20ANTIC/2.%20Display%20timing.md)
- [3. Playfield](4.%20ANTIC/3.%20Playfield.md)
- [4. Character modes](4.%20ANTIC/4.%20Character%20modes.md)
- [5. Mapped (bitmap) modes](4.%20ANTIC/5.%20Mapped%20%28bitmap%29%20modes.md)
- [6. Display list](4.%20ANTIC/6.%20Display%20list.md)
- [7. Scrolling](4.%20ANTIC/7.%20Scrolling.md)
- [8. Non-maskable interrupts](4.%20ANTIC/8.%20Non-maskable%20interrupts.md)
- [9. WSYNC](4.%20ANTIC/9.%20WSYNC.md)
- [10. VCOUNT](4.%20ANTIC/10.%20VCOUNT.md)
- [11. Playfield DMA](4.%20ANTIC/11.%20Playfield%20DMA.md)
- [12. Abnormal playfield DMA](4.%20ANTIC/12.%20Abnormal%20playfield%20DMA.md)
- [13. Player-missile DMA](4.%20ANTIC/13.%20Player-missile%20DMA.md)
- [14. Scan line timing](4.%20ANTIC/14.%20Scan%20line%20timing.md)
- [15. Cycle counting example](4.%20ANTIC/15.%20Cycle%20counting%20example.md)
- [16. Examples](4.%20ANTIC/16.%20Examples.md)
- [17. Further reading](4.%20ANTIC/17.%20Further%20reading.md)

## 5. POKEY

- [POKEY](5.%20POKEY/POKEY.md)
- [1. Addressing](5.%20POKEY/1.%20Addressing.md)
- [2. Initialization](5.%20POKEY/2.%20Initialization.md)
- [3. Sound generation](5.%20POKEY/3.%20Sound%20generation.md)
- [4. Clock generation](5.%20POKEY/4.%20Clock%20generation.md)
- [5. Noise generators](5.%20POKEY/5.%20Noise%20generators.md)
- [6. Serial port](5.%20POKEY/6.%20Serial%20port.md)
- [7. Interrupts](5.%20POKEY/7.%20Interrupts.md)
- [8. Keyboard scan](5.%20POKEY/8.%20Keyboard%20scan.md)
- [9. Paddle scan](5.%20POKEY/9.%20Paddle%20scan.md)
- [10. Examples](5.%20POKEY/10.%20Examples.md)
- [11. Further reading](5.%20POKEY/11.%20Further%20reading.md)

## 6. CTIA-GTIA

- [CTIA-GTIA](6.%20CTIA-GTIA/CTIA-GTIA.md)
- [1. System role](6.%20CTIA-GTIA/1.%20System%20role.md)
- [2. Display generation](6.%20CTIA-GTIA/2.%20Display%20generation.md)
- [3. Color encoding](6.%20CTIA-GTIA/3.%20Color%20encoding.md)
- [4. Artifacting](6.%20CTIA-GTIA/4.%20Artifacting.md)
- [5. Player-missile graphics](6.%20CTIA-GTIA/5.%20Player-missile%20graphics.md)
- [6. Collision detection](6.%20CTIA-GTIA/6.%20Collision%20detection.md)
- [7. Priority control](6.%20CTIA-GTIA/7.%20Priority%20control.md)
- [8. High resolution modes](6.%20CTIA-GTIA/8.%20High%20resolution%20modes.md)
- [9. GTIA special modes](6.%20CTIA-GTIA/9.%20GTIA%20special%20modes.md)
- [10. Cycle timing](6.%20CTIA-GTIA/10.%20Cycle%20timing.md)
- [11. General purpose I-O](6.%20CTIA-GTIA/11.%20General%20purpose%20I-O.md)
- [12. Further reading](6.%20CTIA-GTIA/12.%20Further%20reading.md)

## 7. Accessories

- [Accessories](7.%20Accessories/Accessories.md)
- [1. Joystick](7.%20Accessories/1.%20Joystick.md)
- [2. Paddle](7.%20Accessories/2.%20Paddle.md)
- [3. Mouse](7.%20Accessories/3.%20Mouse.md)
- [4. Light Pen-Gun](7.%20Accessories/4.%20Light%20Pen-Gun.md)
- [5. CX-75 Light Pen](7.%20Accessories/5.%20CX-75%20Light%20Pen.md)
- [6. Stack Lightpen](7.%20Accessories/6.%20Stack%20Lightpen.md)
- [7. CX-85 Numerical Keypad](7.%20Accessories/7.%20CX-85%20Numerical%20Keypad.md)
- [8. CX-20 Driving Controller](7.%20Accessories/8.%20CX-20%20Driving%20Controller.md)
- [9. CX-21-23-50 Keyboard Controller](7.%20Accessories/9.%20CX-21-23-50%20Keyboard%20Controller.md)
- [10. XEP80 Interface Module](7.%20Accessories/10.%20XEP80%20Interface%20Module.md)
- [11. Corvus Disk System](7.%20Accessories/11.%20Corvus%20Disk%20System.md)
- [12. ComputerEyes Video Acquisition System](7.%20Accessories/12.%20ComputerEyes%20Video%20Acquisition%20System.md)

## 8. Cartridges

- [Cartridges](8.%20Cartridges/Cartridges.md)
- [1. Cartridge slot](8.%20Cartridges/1.%20Cartridge%20slot.md)
- [2. Atarimax flash cartridges](8.%20Cartridges/2.%20Atarimax%20flash%20cartridges.md)
- [3. Atarimax MyIDE-II](8.%20Cartridges/3.%20Atarimax%20MyIDE-II.md)
- [4. SIC!](8.%20Cartridges/4.%20SIC!.md)
- [5. SIDE 1 - SIDE 2](8.%20Cartridges/5.%20SIDE%201%20-%20SIDE%202.md)
- [6. SIDE 3](8.%20Cartridges/6.%20SIDE%203.md)
- [7. Corina](8.%20Cartridges/7.%20Corina.md)
- [8. R-Time 8](8.%20Cartridges/8.%20R-Time%208.md)
- [9. Veronica](8.%20Cartridges/9.%20Veronica.md)
- [10. The Multiplexer](8.%20Cartridges/10.%20The%20Multiplexer.md)

## 9. Serial I-O (SIO) Bus

- [Serial I-O (SIO) Bus](9.%20Serial%20I-O%20%28SIO%29%20Bus/Serial%20I-O%20%28SIO%29%20Bus.md)
- [1. Basic SIO protocol](9.%20Serial%20I-O%20%28SIO%29%20Bus/1.%20Basic%20SIO%20protocol.md)
- [2. Poll Commands](9.%20Serial%20I-O%20%28SIO%29%20Bus/2.%20Poll%20Commands.md)
- [3. 820 40 Column Printer](9.%20Serial%20I-O%20%28SIO%29%20Bus/3.%20820%2040%20Column%20Printer.md)
- [4. 820 Hardware](9.%20Serial%20I-O%20%28SIO%29%20Bus/4.%20820%20Hardware.md)
- [5. 1020 Color Printer](9.%20Serial%20I-O%20%28SIO%29%20Bus/5.%201020%20Color%20Printer.md)
- [6. 1025 80 Column Printer](9.%20Serial%20I-O%20%28SIO%29%20Bus/6.%201025%2080%20Column%20Printer.md)
- [7. 1025 Hardware](9.%20Serial%20I-O%20%28SIO%29%20Bus/7.%201025%20Hardware.md)
- [8. 1029 Programmable Printer](9.%20Serial%20I-O%20%28SIO%29%20Bus/8.%201029%20Programmable%20Printer.md)
- [9. 1029 Hardware](9.%20Serial%20I-O%20%28SIO%29%20Bus/9.%201029%20Hardware.md)
- [10. 850 Interface Module](9.%20Serial%20I-O%20%28SIO%29%20Bus/10.%20850%20Interface%20Module.md)
- [11. 835 Modem](9.%20Serial%20I-O%20%28SIO%29%20Bus/11.%20835%20Modem.md)
- [12. 835 Hardware](9.%20Serial%20I-O%20%28SIO%29%20Bus/12.%20835%20Hardware.md)
- [13. 1030 Modem](9.%20Serial%20I-O%20%28SIO%29%20Bus/13.%201030%20Modem.md)
- [14. 1030 Hardware](9.%20Serial%20I-O%20%28SIO%29%20Bus/14.%201030%20Hardware.md)
- [15. SX212 Modem](9.%20Serial%20I-O%20%28SIO%29%20Bus/15.%20SX212%20Modem.md)
- [16. R-Verter](9.%20Serial%20I-O%20%28SIO%29%20Bus/16.%20R-Verter.md)
- [17. 410-1010 Program Recorder](9.%20Serial%20I-O%20%28SIO%29%20Bus/17.%20410-1010%20Program%20Recorder.md)
- [18. MidiMate](9.%20Serial%20I-O%20%28SIO%29%20Bus/18.%20MidiMate.md)
- [19. Pocket Modem](9.%20Serial%20I-O%20%28SIO%29%20Bus/19.%20Pocket%20Modem.md)

## 10. Disk drives

- [Disk drives](10.%20Disk%20drives/Disk%20drives.md)
- [1. Introduction](10.%20Disk%20drives/1.%20Introduction.md)
- [2. Basic protocol](10.%20Disk%20drives/2.%20Basic%20protocol.md)
- [3. Extended protocols](10.%20Disk%20drives/3.%20Extended%20protocols.md)
- [4. Commands](10.%20Disk%20drives/4.%20Commands.md)
- [5. Timing](10.%20Disk%20drives/5.%20Timing.md)
- [6. Anomalies](10.%20Disk%20drives/6.%20Anomalies.md)
- [7. 6532 RIOT](10.%20Disk%20drives/7.%206532%20RIOT.md)
- [8. 177X-179X-279X FDC](10.%20Disk%20drives/8.%20177X-179X-279X%20FDC.md)
- [9. 810 disk drive](10.%20Disk%20drives/9.%20810%20disk%20drive.md)
- [10. 810 hardware](10.%20Disk%20drives/10.%20810%20hardware.md)
- [11. Happy 810](10.%20Disk%20drives/11.%20Happy%20810.md)
- [12. 810 Turbo](10.%20Disk%20drives/12.%20810%20Turbo.md)
- [13. 815 disk drive](10.%20Disk%20drives/13.%20815%20disk%20drive.md)
- [14. 815 hardware](10.%20Disk%20drives/14.%20815%20hardware.md)
- [15. 1050 disk drive](10.%20Disk%20drives/15.%201050%20disk%20drive.md)
- [16. 1050 hardware](10.%20Disk%20drives/16.%201050%20hardware.md)
- [17. 1450XLD disk drive](10.%20Disk%20drives/17.%201450XLD%20disk%20drive.md)
- [18. 1450XLD disk hardware](10.%20Disk%20drives/18.%201450XLD%20disk%20hardware.md)
- [19. US Doubler](10.%20Disk%20drives/19.%20US%20Doubler.md)
- [20. Super Archiver](10.%20Disk%20drives/20.%20Super%20Archiver.md)
- [21. Happy 1050](10.%20Disk%20drives/21.%20Happy%201050.md)
- [22. I.S. Plate](10.%20Disk%20drives/22.%20I.S.%20Plate.md)
- [23. XF551 disk drive](10.%20Disk%20drives/23.%20XF551%20disk%20drive.md)
- [24. XF551 hardware](10.%20Disk%20drives/24.%20XF551%20hardware.md)
- [25. Speedy XF disk drive](10.%20Disk%20drives/25.%20Speedy%20XF%20disk%20drive.md)
- [26. Indus GT disk drive](10.%20Disk%20drives/26.%20Indus%20GT%20disk%20drive.md)
- [27. Indus GT hardware](10.%20Disk%20drives/27.%20Indus%20GT%20hardware.md)
- [28. ATR8000 hardware](10.%20Disk%20drives/28.%20ATR8000%20hardware.md)
- [29. Percom RFD](10.%20Disk%20drives/29.%20Percom%20RFD.md)
- [30. Percom AT88](10.%20Disk%20drives/30.%20Percom%20AT88.md)
- [31. Percom AT88-SPD-S1PD](10.%20Disk%20drives/31.%20Percom%20AT88-SPD-S1PD.md)
- [32. Amdek AMDC-I-II](10.%20Disk%20drives/32.%20Amdek%20AMDC-I-II.md)

## 11. Parallel Bus Interface

- [Parallel Bus Interface](11.%20Parallel%20Bus%20Interface/Parallel%20Bus%20Interface.md)
- [1. Introduction](11.%20Parallel%20Bus%20Interface/1.%20Introduction.md)
- [2. Common memory map](11.%20Parallel%20Bus%20Interface/2.%20Common%20memory%20map.md)
- [3. ICD Multi I-O (MIO)](11.%20Parallel%20Bus%20Interface/3.%20ICD%20Multi%20I-O%20%28MIO%29.md)
- [4. CSS Black Box](11.%20Parallel%20Bus%20Interface/4.%20CSS%20Black%20Box.md)
- [5. CSS Black Box Floppy Board](11.%20Parallel%20Bus%20Interface/5.%20CSS%20Black%20Box%20Floppy%20Board.md)
- [6. Atari 1090 80 Column Video Card](11.%20Parallel%20Bus%20Interface/6.%20Atari%201090%2080%20Column%20Video%20Card.md)
- [7. Atari 1400XL-1450XLD](11.%20Parallel%20Bus%20Interface/7.%20Atari%201400XL-1450XLD.md)

## 12. Internal devices

- [Internal devices](12.%20Internal%20devices/Internal%20devices.md)
- [1. Introduction](12.%20Internal%20devices/1.%20Introduction.md)
- [2. Covox](12.%20Internal%20devices/2.%20Covox.md)
- [3. Ultimate1MB](12.%20Internal%20devices/3.%20Ultimate1MB.md)
- [4. VideoBoard XE](12.%20Internal%20devices/4.%20VideoBoard%20XE.md)
- [5. APE Warp+ OS 32-in-1](12.%20Internal%20devices/5.%20APE%20Warp+%20OS%2032-in-1.md)
- [6. Bit-3 Full-View 80](12.%20Internal%20devices/6.%20Bit-3%20Full-View%2080.md)

## 13. 5200 SuperSystem

- [5200 SuperSystem](13.%205200%20SuperSystem/5200%20SuperSystem.md)
- [1. Introduction](13.%205200%20SuperSystem/1.%20Introduction.md)
- [2. Differences from the 8-bit computer line](13.%205200%20SuperSystem/2.%20Differences%20from%20the%208-bit%20computer%20line.md)
- [3. Controller](13.%205200%20SuperSystem/3.%20Controller.md)
- [4. 5200 Memory map](13.%205200%20SuperSystem/4.%205200%20Memory%20map.md)

## 14. Reference

- [Reference](14.%20Reference/Reference.md)
- [1. Memory map](14.%20Reference/1.%20Memory%20map.md)
- [2. Register list](14.%20Reference/2.%20Register%20list.md)
- [3. GTIA registers](14.%20Reference/3.%20GTIA%20registers.md)
- [4. POKEY registers](14.%20Reference/4.%20POKEY%20registers.md)
- [5. PIA registers](14.%20Reference/5.%20PIA%20registers.md)
- [6. ANTIC registers](14.%20Reference/6.%20ANTIC%20registers.md)
- [7. Register listing](14.%20Reference/7.%20Register%20listing.md)

## 15. Bibliography

- [Bibliography](15.%20Bibliography/Bibliography.md)
- [1. List of references](15.%20Bibliography/1.%20List%20of%20references.md)
- [2. Errata](15.%20Bibliography/2.%20Errata.md)
- [3. Printers](15.%20Bibliography/3.%20Printers.md)

## A. Polynomial Counters

- [Polynomial Counters](A.%20Polynomial%20Counters/Polynomial%20Counters.md)

## B. Physical Disk Format

- [Physical Disk Format](B.%20Physical%20Disk%20Format/Physical%20Disk%20Format.md)
- [1. Raw geometry](B.%20Physical%20Disk%20Format/1.%20Raw%20geometry.md)
- [2. Bit encoding](B.%20Physical%20Disk%20Format/2.%20Bit%20encoding.md)
- [3. Address field](B.%20Physical%20Disk%20Format/3.%20Address%20field.md)
- [4. Data field](B.%20Physical%20Disk%20Format/4.%20Data%20field.md)
- [5. CRC algorithm](B.%20Physical%20Disk%20Format/5.%20CRC%20algorithm.md)

## C. Physical Tape Format

- [Physical Tape Format](C.%20Physical%20Tape%20Format/Physical%20Tape%20Format.md)
- [1. Signal encoding](C.%20Physical%20Tape%20Format/1.%20Signal%20encoding.md)
- [2. Framing](C.%20Physical%20Tape%20Format/2.%20Framing.md)
- [3. FSK demodulation](C.%20Physical%20Tape%20Format/3.%20FSK%20demodulation.md)
- [4. Zero crossing detection](C.%20Physical%20Tape%20Format/4.%20Zero%20crossing%20detection.md)
- [5. Peak detection](C.%20Physical%20Tape%20Format/5.%20Peak%20detection.md)
- [6. DFT detection](C.%20Physical%20Tape%20Format/6.%20DFT%20detection.md)
- [7. Quadrature demodulation](C.%20Physical%20Tape%20Format/7.%20Quadrature%20demodulation.md)
- [8. Asynchronous serial decoding](C.%20Physical%20Tape%20Format/8.%20Asynchronous%20serial%20decoding.md)

## D. Analog Video Model

- [Analog Video Model](D.%20Analog%20Video%20Model/Analog%20Video%20Model.md)
- [1. Introduction](D.%20Analog%20Video%20Model/1.%20Introduction.md)
- [2. NTSC color encoding](D.%20Analog%20Video%20Model/2.%20NTSC%20color%20encoding.md)
- [3. NTSC artifacting](D.%20Analog%20Video%20Model/3.%20NTSC%20artifacting.md)
- [4. PAL color encoding](D.%20Analog%20Video%20Model/4.%20PAL%20color%20encoding.md)
- [5. PAL artifacting](D.%20Analog%20Video%20Model/5.%20PAL%20artifacting.md)
- [6. Synchronization](D.%20Analog%20Video%20Model/6.%20Synchronization.md)

## E. Analog Audio Model

- [Analog Audio Model](E.%20Analog%20Audio%20Model/Analog%20Audio%20Model.md)
- [1. Introduction](E.%20Analog%20Audio%20Model/1.%20Introduction.md)
- [2. POKEY output](E.%20Analog%20Audio%20Model/2.%20POKEY%20output.md)
- [3. First amplifier stage](E.%20Analog%20Audio%20Model/3.%20First%20amplifier%20stage.md)
- [4. External signal sum point](E.%20Analog%20Audio%20Model/4.%20External%20signal%20sum%20point.md)
- [5. Second amplifier stage](E.%20Analog%20Audio%20Model/5.%20Second%20amplifier%20stage.md)
- [6. Final output](E.%20Analog%20Audio%20Model/6.%20Final%20output.md)

## F. Firmware Database

- [Firmware Database](F.%20Firmware%20Database/Firmware%20Database.md)
- [1. Introduction](F.%20Firmware%20Database/1.%20Introduction.md)
- [2. 5200 firmware](F.%20Firmware%20Database/2.%205200%20firmware.md)
- [3. 400-800 firmware](F.%20Firmware%20Database/3.%20400-800%20firmware.md)
- [4. XL-XE-XEGS firmware](F.%20Firmware%20Database/4.%20XL-XE-XEGS%20firmware.md)
- [5. Game cartridges](F.%20Firmware%20Database/5.%20Game%20cartridges.md)
- [6. BASIC](F.%20Firmware%20Database/6.%20BASIC.md)
- [7. Disk Drives](F.%20Firmware%20Database/7.%20Disk%20Drives.md)

## G. Quick Reference

- [Quick Reference](G.%20Quick%20Reference/Quick%20Reference.md)
- [1. CPU opcode table](G.%20Quick%20Reference/1.%20CPU%20opcode%20table.md)
