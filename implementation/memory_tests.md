# Extended Memory Test Manual

This document describes the use and coverage of the two extended-memory diagnostic applications:

- `U1MB_MEMORY_TEST.XEX`: full functional testing of the expansion and its CPU/ANTIC windows.
- `MEMORY_STRESS_TEST.XEX`: repeated bank-switching testing intended to detect aliasing, stale state, and errors that only appear after many bank changes.

The corresponding source files are `u1mb_memory_test.asm` and `memory_stress_test.asm`.

## 1. Requirements and precautions

Run the programs as Atari `.XEX` applications from a DOS loader, emulator, or real hardware with the memory expansion installed. No external libraries or files are required.

These are destructive diagnostics for expanded memory: they write test patterns to every bank they detect. Do not run them while data in those areas must be preserved.

During execution:

- `PORTB` (`$D301`) is changed to select banks and windows.
- The screen, display list, and DMA registers are temporarily changed to show progress.
- At completion, both programs leave the normal motherboard-RAM view active (`PORTB = $FF`) and stop while displaying the results.
- To leave the final result screen, reboot the machine or interrupt execution using the normal mechanism provided by the environment used to load the `.XEX`.

The tests execute from RAM so bank selection cannot make the diagnostic code itself inaccessible.

## 2. Automatic profile detection

Both programs test the AHRM profiles from largest to smallest. For each profile they write a different signature at `$4000` in every bank and read it back. The first profile for which every bank matches is selected as the active profile.

| Profile | Type | 16 KiB banks | Expansion capacity | ANTIC window according to the program |
|---|---|---:|---:|---|
| `1088K` / 1088R | RAMBO | 64 | 1024 KiB additional | Shared with CPU |
| `576C` | COMPY | 32 | 512 KiB additional | Separate |
| `576R` | RAMBO | 32 | 512 KiB additional | Shared with CPU |
| `320C` | COMPY | 16 | 256 KiB additional | Separate |
| `320R` | RAMBO | 16 | 256 KiB additional | Shared with CPU |
| `192` | RAMBO | 8 | 128 KiB additional | Shared with CPU |
| `128` | 128 KiB profile | 4 | 64 KiB additional | Separate |

Detection does not merely accept the first memory response: every bank must retain its own signature. If a profile fails, the next profile is tested. If all profiles fail, `NO EXPANSION` is displayed and the expansion tests are skipped.

### Ultimate1MB identification

It is expected for an Ultimate1MB configuration to be detected as `1088K`. The tests identify the active memory map by behavior; they do not identify the product name or read a separate Ultimate1MB device ID. The Ultimate1MB 1 MiB expansion provides 64 expanded 16 KiB banks, which is represented by the 1088K profile when the 64 KiB motherboard RAM is included in the total addressable memory.

Therefore, detection as `1088K` confirms that the 64-bank 1088K/U1MB mapping is active. It does not, by itself, certify Ultimate1MB-specific firmware, flash, BIOS, PBI, or other non-memory features.

## 3. `U1MB_MEMORY_TEST.XEX`

### 3.1 Startup and per-bank test

After detecting the profile, the program visits every detected bank. For each bank it:

1. Selects the bank using the `PORTB` map for the active profile.
2. Generates a bank-dependent pattern (`BANK + $55`).
3. Writes the pattern to the complete 16 KiB CPU window, `$4000-$7FFF`.
4. Reads the complete 16 KiB window and compares every byte.
5. Increments the error counter and marks the screen if a mismatch is found.

This is the basic capacity and retention test. Unlike the stress application, it covers every byte of every bank in one complete pass.

The result is displayed as `RW BANKS PASS` or `RW BANKS FAIL`.

### 3.2 `STAGE 2`: retention, CPU window, and 1088K map

This stage verifies that banks do not alias and that switching between motherboard RAM and expanded RAM works correctly.

#### Retention and aliasing

- Writes a different signature (`BANK XOR $A5`) to `$4000` in every bank.
- Reads the banks in reverse order.
- An error indicates that two banks may point to the same memory, that a bank-selection bit is not working, or that data is not retained when switching banks.

#### Hidden motherboard RAM

Before changing banks, two sentinels are written to motherboard RAM:

- `$4000 = $A5`
- `$7FFF = $5A`

The expanded window is closed and reopened. Both values must survive. This detects implementations that damage normal RAM while switching the window.

#### Independent 1088K RAMBO map check

Only for the 1088K profile, all 64 banks are visited and the value written to `PORTB` is compared directly with the expected map:

- bank bits 0-2 -> `PORTB` bits 1-3;
- bank bits 3-5 -> `PORTB` bits 5-7;
- `PORTB` bit 4 remains clear to enable the shared CPU+ANTIC window;
- `PORTB` bit 0 remains set so the test continues executing from RAM.

This check is independent of the read/write test. It can therefore detect an incorrectly encoded selector even if the hardware happens to produce apparently correct reads.

#### BASIC and Self-Test visibility

In 1088K RAMBO mode the program also checks that:

- `$A000` is writable RAM while the expanded window is active; this verifies that BASIC is not hiding the region.
- `$5000` is writable RAM while the window is active; this verifies that Self-Test is not overlaying `$5000-$57FF`.

The original bytes are restored after each probe.

The complete stage result is displayed as `SYS CHECKS PASS` or `SYS CHECKS FAIL`.

### 3.3 `STAGE 3`: CPU/ANTIC window configuration

This stage validates the `PORTB` configuration expected for the detected profile:

- RAMBO and 1088K: CPU and ANTIC use a shared window; `PORTB` bit 4 must be clear.
- COMPY and the 128K profile: the CPU window is separate (`PORTB` bit 4 set) and the ANTIC window is independent (`PORTB` bit 5 clear).

The result is displayed as `ANTIC CFG PASS` or `ANTIC CFG FAIL`.

This stage verifies the bit configuration, not that ANTIC actually fetched the expected data through DMA. That check is performed in the next stage.

### 3.4 `STAGE 4`: visual ANTIC DMA test

This stage requires user observation because the CPU cannot directly read back the result of an ANTIC DMA transfer.

The program:

1. Saves the original `PORTB`, display-list, and DMA configuration.
2. Selects the first bank (`BANK = 0`).
3. Writes an alternating pattern to `$4000-$43FF` and a message at `$4168`.
4. Builds a display list in motherboard RAM at `$3000`, with its LMS pointing to `$4000`.
5. Temporarily enables the display using that list and waits for user input.
6. Selects the upper end of the map (`BANK = $3F`; smaller profiles mask this to their last valid bank).
7. Repeats the pattern and display check, also exercising the high bank bits, especially `PORTB` bits 5-7 in 1088K.
8. Restores the original display list, DMA configuration, and `PORTB` value.

Controls for each displayed pattern:

- `START`: confirms that the pattern and message are displayed correctly.
- `SELECT`: marks the visual test as failed.

After a key is pressed, the program waits for both `START` and `SELECT` to be released before starting the second display. The result is displayed as `ANTIC GFX PASS` or `ANTIC GFX FAIL`.

To accept the expansion as functional, both screens must show the pattern/message correctly and `START` must be pressed for both screens.

### 3.5 Result interpretation

The functional test is successful when all of these lines show `PASS`:

- `RW BANKS PASS`
- `SYS CHECKS PASS`
- `ANTIC CFG PASS`
- `ANTIC GFX PASS`

A `FAIL` in any line invalidates the practical certification of the tested profile until the counter or failure point has been investigated. Read/write errors are counted during the complete bank traversal; system, configuration, and graphics errors are stored separately.

## 4. `MEMORY_STRESS_TEST.XEX`

This program does not replace the functional test. It repeats the critical operations to expose intermittent failures and state errors that may not appear in a single pass.

### 4.1 Preparation and sentinels

At the beginning, two values are written to motherboard RAM:

- `$4000 = $A5`
- `$7FFF = $A5`

At the end of every pass, the program returns to the normal view and verifies both values. A change indicates a window-switching or window-restoration error.

### 4.2 32 stress iterations

The program executes 32 iterations (`$00` through `$1F`). During each iteration it:

1. Visits every bank in ascending order.
2. Calculates a different pattern for each bank/iteration combination (`BANK XOR ITER XOR $5A`).
3. Writes the pattern to the first page (`$4000-$40FF`) and last page (`$7F00-$7FFF`) of the bank.
4. Visits the banks in descending order.
5. Reads and compares those two pages.
6. Verifies both motherboard-RAM sentinels.

Each bank is therefore tested with 256 bytes at the beginning and 256 bytes at the end on every iteration, rather than all 16 KiB. This reduces runtime while allowing many bank changes and exposes aliasing, faulty bank bits, and stale window state.

The result of this part is displayed as `STRESS PASS` or `STRESS FAIL`.

### 4.3 `PORTB` control test

After the 32 iterations, the profile-specific control test runs automatically. During this test, NMI and ANTIC DMA are temporarily disabled so they cannot interfere with the probe; both registers are restored afterwards.

#### 1088K RAMBO

All 64 banks are visited. For each bank the program:

- writes a pattern at `$5000`;
- toggles `PORTB` bit 7;
- writes and verifies the complement of the pattern;
- toggles bit 7 again;
- verifies that the original value is visible again.

In this profile bit 7 must select another bank. If it selected the Self-Test ROM instead, the read/write sequence would not prove that two independent banks exist.

#### Smaller RAMBO profiles

For `576R`, `320R`, and `192`, all banks are visited and `$5000` and `$57FF` are checked with both views. With bit 7 clear, Self-Test ROM must have priority: its bytes are captured, writes through the overlay are attempted, and the ROM reads must remain unchanged. After bit 7 is restored, the original expanded-RAM pattern must be visible again. This verifies both write isolation during the overlay and RAM recovery afterwards.

#### Profiles without this control

For `576C`, `320C`, and `128`, the control result is displayed as `PORTB MAP N/A`, because this bit-7-specific check does not apply to the RAMBO selector used by those profiles.

The result is displayed as `PORTB MAP PASS`, `PORTB MAP FAIL`, or `PORTB MAP N/A`.

### 4.4 Result interpretation

The stress test is successful when it displays:

- `STRESS PASS`; and
- `PORTB MAP PASS`, or `PORTB MAP N/A` when the profile does not require that control.

For 1088K RAMBO, `PORTB MAP PASS` is mandatory because it specifically validates bit 7 as a bank bit.

## 5. Recommended execution order

To validate a new or modified memory expansion:

1. Run `U1MB_MEMORY_TEST.XEX`.
2. Confirm both `ANTIC GFX` screens with `START`.
3. Run `MEMORY_STRESS_TEST.XEX` and wait for all 32 iterations to complete.
4. Confirm `STRESS PASS` and the `PORTB MAP` result.
5. Repeat after rebooting the machine if the initial state of the implementation must also be validated.

The first program provides byte-by-byte functional coverage and a graphics-path check. The second checks switching stability over time; both should be run together.

## 6. AHRM certification scope

With both applications reporting `PASS`, the expansion is practically validated for:

- profile and capacity detection;
- selection and retention of all banks;
- CPU access to the expanded window;
- preservation of motherboard RAM;
- BASIC and Self-Test visibility in 1088K RAMBO;
- CPU/ANTIC window configuration;
- visually observed graphics DMA at the endpoints of the map;
- switching stability over 32 complete cycles;
- the special `PORTB` bit-7 behavior of RAMBO profiles.

This alone is not a formal, exhaustive certification of every electrical AHRM property. In particular, these `.XEX` files do not automate checks of `DDRB`, floating inputs/PIA pull-ups, or a CPU-readable verification of every internal ANTIC DMA result. The DMA portion is confirmed visually in `STAGE 4`.

## 7. Delivered files

| File | Function |
|---|---|
| `implementation/U1MB_MEMORY_TEST.XEX` | Executable binary for the complete functional test |
| `implementation/u1mb_memory_test.asm` | Functional-test source |
| `implementation/MEMORY_STRESS_TEST.XEX` | Executable binary for the stress test |
| `implementation/memory_stress_test.asm` | Stress-test source |
