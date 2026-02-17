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
- `-b` / `-B`: alternate legacy mode (`lMode=1`, affects internal CONSOL hack state)

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
