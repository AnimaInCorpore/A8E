# A8E (Native C/SDL Emulator)

Native Atari 800 XL emulator written in C with SDL 1.2 style headers (`<SDL/SDL.h>`).

## Runtime Requirements

The executable requires these ROM files in its current working directory:

- `ATARIXL.ROM` (16 KB)
- `ATARIBAS.ROM` (8 KB)

Disk handling:

- Startup default disk path is `d1.atr` (lowercase) if no disk argument is passed.
- You can pass either an ATR image (`.atr`) or an Atari executable (`.xex`) as the first non-flag argument.
- `.xex` files are converted to a temporary ATR layout at load time, using the built-in XEX boot loader.
  - Conversion normalizes XEX segments and supports multi-segment files with `INITAD`/`RUNAD` behavior.
- Pressing `F11` attempts to reload `D1.ATR` (uppercase) from the current working directory.
  - On Linux/macOS, filename case matters.

## Command Line

```text
A8E [options] [disk.atr|program.xex]
```

Options currently implemented:

- `-f` / `-F`: fullscreen
- `-b` / `-B`: boot **with** BASIC enabled. By default the emulator simulates holding OPTION at power-on (sets `CONSOL = 0x03`) which disables BASIC on the XL. Passing `-b` releases all console buttons at startup (`CONSOL = 0x07`) so BASIC loads normally.

## Window

The emulator window opens at **2× scale** by default:

- Windowed: 672 × 480 (336 × 240 Atari pixels × 2)
- Fullscreen (`-f`): 640 × 480 (320 × 240 — narrower to fill standard fullscreen)

If the 2× mode is unavailable, it falls back to 1× (native Atari resolution).

## Build Version

- The window caption version is injected at compile time.
- `A8E/CMakeLists.txt` reads `../jsA8E/version.json` (shared with the jsA8E release workflow).
- If that file is missing or invalid, the native build falls back to `dev`.

## Controls

See the [root README](../README.md#controls) for the shared keyboard, joystick, and console key mappings.

Additional native-only key:

| Key | Function |
|-----|----------|
| F11 | Turbo mode (hold) + reload `D1.ATR` |
| F12 | Start live CPU disassembly — **one-way latch**, requires `ENABLE_VERBOSE_DEBUGGING` compile flag; restart to stop |

## Debug Options

All debug/verbose output options are controlled via compile-time `#define` macros in `AtariIo.h`.

### Runtime key (requires compile flag)

`ENABLE_VERBOSE_DEBUGGING` is defined by default in `AtariIo.h`. When active, pressing **F12** at runtime enables a live CPU disassembly loop that prints each instruction to stdout.

### Verbose logging macros

Uncomment in `AtariIo.h` or pass via `CMAKE_C_FLAGS` to enable detailed logging:

| Macro | Logs |
|-------|------|
| `VERBOSE_NMI` | NMI events |
| `VERBOSE_IRQ` | IRQ events |
| `VERBOSE_SIO` | Serial I/O (SIO) command and data phases |
| `VERBOSE_ROM_SWITCH` | ROM bank switching (PIA port B) |
| `VERBOSE_REGISTER` | All chip register reads/writes (GTIA, Pokey, Antic, PIA) |
| `VERBOSE_DL` | ANTIC display-list fetch activity |

### Other debug macros

| Macro | Effect |
|-------|--------|
| `DISABLE_COLLISIONS` | Disables GTIA sprite/playfield collision detection |

### Enabling via CMake

```sh
cmake -S . -B build -DCMAKE_C_FLAGS="-DVERBOSE_REGISTER -DVERBOSE_SIO"
cmake --build build -j
```

> **Warning:** `VERBOSE_REGISTER` in particular generates very high output volume and will noticeably slow emulation.

## Build (Windows, MSYS2 MinGW-w64)

Run inside `A8E/`:

```sh
cmake -S . -B build/msys2-mingw64 -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release
cmake --build build/msys2-mingw64 -j
```

Output executable:

- `A8E/build/msys2-mingw64/A8E.exe`

If needed, add `C:\msys64\mingw64\bin` to `PATH` (or copy required DLLs such as `SDL.dll` next to `A8E.exe`).

## Build (Linux / macOS)

Run inside `A8E/`:

```sh
cmake -S . -B build
cmake --build build -j
```

Output executable:

- `A8E/build/A8E` (or `A8E/build/A8E.exe` on some toolchains)

## Running After Build

From repository root (where ROM files are typically stored):

- Linux/macOS: `./A8E/build/A8E`
- Windows: `.\A8E\build\msys2-mingw64\A8E.exe`

Example with explicit disk:

- Linux/macOS: `./A8E/build/A8E disks/dos.atr`
- Windows: `.\A8E\build\msys2-mingw64\A8E.exe disks\dos.atr`
- Linux/macOS (XEX): `./A8E/build/A8E disks/game.xex`
- Windows (XEX): `.\A8E\build\msys2-mingw64\A8E.exe disks\game.xex`
