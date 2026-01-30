# A8E (Atari 800 XL Emulator)

Small C-based Atari 800 XL emulator using SDL (SDL 1.2 style headers) and optional OpenGL output.

## Author

- Sascha Springer (original codebase, 2004)

## Runtime files

The emulator expects these ROM files in the current working directory when you run it:

- `ATARIBAS.ROM`
- `ATARIXL.ROM`

By default it tries to boot the disk image `d1.atr` (you can pass a different `.atr` path as the first non-flag argument).

## Prerequisites

Build dependencies:

- C compiler (GCC/Clang)
- CMake (3.16+, presets require 3.23+)
- OpenGL headers + libraries (system-provided on Windows/macOS; `libGL` on Linux)
- SDL with **SDL 1.2 style headers** (`<SDL/SDL.h>`)
  - SDL 1.2 *or*
  - `sdl12-compat` (provides the SDL 1.2 headers on top of SDL2)

## Build

### Windows (MSYS2 MinGW-w64)

MSYS2 is expected at `C:\msys64` (this repo includes a CMake preset for that path).

Install prerequisites (in the **MSYS2 MinGW64** shell):

```sh
pacman -S --needed mingw-w64-x86_64-toolchain mingw-w64-x86_64-cmake mingw-w64-x86_64-SDL
```

Configure + build (from **PowerShell** or a normal Windows terminal):

```powershell
cmake --preset msys2-mingw64
cmake --build --preset msys2-mingw64
```

The executable is written to:

- `build/msys2-mingw64/A8E.exe`

If the EXE does not start due to missing DLLs, run it with `C:\msys64\mingw64\bin` on your `PATH` (or copy the required DLLs like `SDL.dll` next to `A8E.exe`).

### Linux

Install prerequisites using your distribution packages. Names vary; common options are:

- SDL 1.2 development package (if available), e.g. `libsdl1.2-dev`
- or `sdl12-compat` + SDL2 development package, e.g. `libsdl2-dev`
- OpenGL development package, e.g. `libgl1-mesa-dev`

Then:

```sh
cmake -S . -B build
cmake --build build -j
```

### macOS

Using Homebrew:

```sh
brew install cmake sdl12-compat
```

Then:

```sh
cmake -S . -B build
cmake --build build -j
```

## Run

From the directory containing `ATARIBAS.ROM` and `ATARIXL.ROM`:

```sh
./A8E
```

Common options:

- `-o` / `-O`: OpenGL output (defaults to software blitting)
- `-f` / `-F`: fullscreen
- `-b` / `-B`: alternate mode (see source)

Example (boot a specific disk image):

```sh
./A8E mydisk.atr
```
