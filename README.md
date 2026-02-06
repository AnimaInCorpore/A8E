# A8E (Atari 800 XL Emulator)

Small C-based Atari 800 XL emulator using SDL (SDL 1.2 style headers). Original codebase by Sascha Springer (2004).

## Repository Structure

```text
a8e/
|-- A8E/                         # Native C emulator sources
|   |-- CMakeLists.txt
|   |-- A8E.c
|   |-- 6502.c
|   |-- 6502.h
|   |-- Antic.c
|   |-- Antic.h
|   |-- AtariIo.c
|   |-- AtariIo.h
|   |-- Gtia.c
|   |-- Gtia.h
|   |-- Pia.c
|   |-- Pia.h
|   |-- Pokey.c
|   `-- Pokey.h
|-- jsA8E/                       # Browser/JavaScript emulator
|   |-- index.html
|   |-- style.css
|   |-- README.md
|   `-- js/
|       |-- app/
|       |   |-- a8e.js
|       |   `-- ui.js
|       |-- audio/
|       |   |-- runtime.js
|       |   `-- worklet.js
|       |-- core/
|       |   |-- antic.js
|       |   |-- atari.js
|       |   |-- cpu.js
|       |   |-- gtia.js
|       |   |-- hw.js
|       |   |-- input.js
|       |   |-- io.js
|       |   |-- keys.js
|       |   |-- memory.js
|       |   |-- playfield.js
|       |   |-- pokey.js
|       |   `-- state.js
|       |-- render/
|       |   |-- gl.js
|       |   |-- palette.js
|       |   |-- software.js
|       |   `-- shaders/
|       |       |-- webgl1.vert.glsl
|       |       |-- webgl1.decode.frag.glsl
|       |       |-- webgl1.crt.frag.glsl
|       |       |-- webgl2.vert.glsl
|       |       |-- webgl2.decode.frag.glsl
|       |       `-- webgl2.crt.frag.glsl
|       `-- shared/
|           `-- util.js
|-- CMakeLists.txt
`-- README.md
```

## Getting the Source Code

Clone the repository:

```sh
git clone https://bitbucket.org/AnimaInCorpore/a8e.git
cd a8e
```

## Runtime files

The emulator expects these ROM files in the current working directory when you run it:

- `ATARIBAS.ROM`
- `ATARIXL.ROM`

By default it tries to boot the disk image `d1.atr` (you can pass a different `.atr` path as the first non-flag argument).

## Windows (MSYS2 MinGW-w64)

### Prerequisites

- C compiler (GCC/Clang)
- CMake (3.16+)
- SDL with **SDL 1.2 style headers** (`<SDL/SDL.h>`)
  - SDL 1.2 *or*
  - `sdl12-compat` (provides the SDL 1.2 headers on top of SDL2)

MSYS2 is expected at `C:\msys64`.

Install prerequisites (in the **MSYS2 MinGW64** shell):

```sh
pacman -S --needed mingw-w64-x86_64-toolchain mingw-w64-x86_64-cmake mingw-w64-x86_64-SDL
```

### Build

Configure + build (in the **MSYS2 MinGW64** shell):

```sh
cmake -S . -B build/msys2-mingw64 -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release
cmake --build build/msys2-mingw64 -j
```

The executable is written to:

- `build/msys2-mingw64/A8E.exe`

If the EXE does not start due to missing DLLs, run it with `C:\msys64\mingw64\bin` on your `PATH` (or copy the required DLLs like `SDL.dll` next to `A8E.exe`).

### Run

From the directory containing `ATARIBAS.ROM` and `ATARIXL.ROM`:

```sh
./A8E.exe
```

Common options:

- `-f` / `-F`: fullscreen
- `-b` / `-B`: alternate mode (see source)

Example (boot a specific disk image):

```sh
./A8E.exe mydisk.atr
```

## Linux

### Prerequisites

- C compiler (GCC/Clang)
- CMake (3.16+)
- SDL with **SDL 1.2 style headers** (`<SDL/SDL.h>`)
  - SDL 1.2 *or*
  - `sdl12-compat` (provides the SDL 1.2 headers on top of SDL2)

Install prerequisites using your distribution packages. Names vary; common options are:

- SDL 1.2 development package (if available), e.g. `libsdl1.2-dev`
- or `sdl12-compat` + SDL2 development package, e.g. `libsdl2-dev`

### Build

```sh
cmake -S . -B build
cmake --build build -j
```

### Run

From the directory containing `ATARIBAS.ROM` and `ATARIXL.ROM`:

```sh
./A8E
```

Common options:

- `-f` / `-F`: fullscreen
- `-b` / `-B`: alternate mode (see source)

Example (boot a specific disk image):

```sh
./A8E mydisk.atr
```

## macOS

### Prerequisites

- C compiler (GCC/Clang)
- CMake (3.16+)
- SDL with **SDL 1.2 style headers** (`<SDL/SDL.h>`)
  - `sdl12-compat` (provides the SDL 1.2 headers on top of SDL2)

Using Homebrew:

```sh
brew install cmake sdl12-compat
```

### Build

```sh
cmake -S . -B build
cmake --build build -j
```

### Run

From the directory containing `ATARIBAS.ROM` and `ATARIXL.ROM`:

```sh
./A8E
```

Common options:

- `-f` / `-F`: fullscreen
- `-b` / `-B`: alternate mode (see source)

Example (boot a specific disk image):

```sh
./A8E mydisk.atr
```
