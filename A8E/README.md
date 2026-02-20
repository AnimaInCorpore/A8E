# A8E (Native C/SDL Emulator)

A native Atari 800 XL emulator written in C, utilizing SDL 1.2 style headers (`<SDL/SDL.h>`).

## Requirements & Usage

To run A8E, the following ROM files must be present in your current working directory:
* `ATARIXL.ROM` (16 KB)
* `ATARIBAS.ROM` (8 KB)

**Command Line:**
```text
A8E [options] [disk.atr|program.xex]
```

**Options & Arguments:**
* `disk.atr` / `program.xex`: Pass an ATR image or Atari executable as the first argument. `.xex` files are converted to a temporary ATR layout at load time. If no argument is passed, the emulator defaults to looking for `d1.atr`.
* `-f` / `-F`: Launch in fullscreen mode. (Default is windowed at 2× scale: 672×480. Fullscreen scales to 640×480. If 2× is unavailable, it falls back to 1× native resolution).
* `-b` / `-B`: Boot **with** BASIC enabled. By default, A8E simulates holding the OPTION key to disable BASIC. Passing this flag releases the console buttons.

## Controls

For standard keyboard, joystick, and console mappings, please see the [main README](../README.md#controls).

**Native-Specific Keys:**
| Key | Function |
|-----|----------|
| **F11** | Turbo mode (hold) + attempts to reload `D1.ATR` from the current directory (case-sensitive on UNIX-like systems). |
| **F12** | Start live CPU disassembly. *Note: This is a one-way latch and requires the `ENABLE_VERBOSE_DEBUGGING` compile flag. Restart the emulator to stop.* |

---

## Building from Source

Building requires **SDL 1.2** development headers. CMake 3.16+ is recommended but not strictly required (see the macOS section for a manual `clang`/`gcc` build).

> **Version Note:** The window caption version is injected at compile time via `../jsA8E/version.json`. If this file is missing, the build defaults to `dev`.

### Windows — Visual Studio / MSVC (Recommended)
This method produces a standalone `.exe` without external DLL dependencies.

1. **Prerequisites**: Install Visual Studio 2022 with the "Desktop development with C++" workload, or the standalone Build Tools.
2. **Install vcpkg & SDL**: Use Microsoft's package manager to grab the static SDL 1.2 libraries.
   ```powershell
   git clone https://github.com/microsoft/vcpkg C:\vcpkg
   C:\vcpkg\bootstrap-vcpkg.bat
   C:\vcpkg\vcpkg install sdl1:x64-windows-static
   ```
3. **Build**: Run from the repository root.
   ```powershell
   cmake -S . -B build/msvc `
     -G "Visual Studio 17 2022" -A x64 `
     -DCMAKE_TOOLCHAIN_FILE=C:\vcpkg\scripts\buildsystems\vcpkg.cmake `
     -DVCPKG_TARGET_TRIPLET=x64-windows-static `
     -DCMAKE_MSVC_RUNTIME_LIBRARY="MultiThreaded$<$<CONFIG:Debug>:Debug>"

   cmake --build build/msvc --config Release
   ```
   *Executable output: `build\msvc\A8E\Release\A8E.exe`*

### Windows — MSYS2 / MinGW-w64
Produces a standalone `.exe` (statically linked, no external DLLs required).

1. **Install Tools**: Open the [MSYS2](https://www.msys2.org/) MinGW x64 shell:
   ```sh
   pacman -S --needed mingw-w64-x86_64-gcc mingw-w64-x86_64-cmake mingw-w64-x86_64-SDL
   ```
2. **Build**:
   ```sh
   cmake -S . -B build/mingw -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXE_LINKER_FLAGS="-static"
   cmake --build build/mingw -j
   ```
   *Executable output: `build/mingw/A8E/A8E.exe`*

### Linux (Ubuntu / Debian / Others)
1. **Install Prerequisites**:
   * Ubuntu/Debian: `sudo apt-get install -y build-essential cmake libsdl1.2-dev`
   * Fedora/RHEL: `sudo dnf install gcc cmake SDL-devel`
   * Arch Linux: `sudo pacman -S gcc cmake sdl12-compat`
2. **Build**:
   ```sh
   cmake -S . -B build
   cmake --build build -j
   ```
   *Executable output: `build/A8E/A8E`*

### macOS (Homebrew)
1. **Install Prerequisites**:
   ```sh
   xcode-select --install
   brew install cmake sdl12-compat
   ```
2. **Build**:
   ```sh
   cmake -S . -B build
   cmake --build build -j
   ```
   *Executable output: `build/A8E/A8E`*

#### Without CMake (legacy macOS)
If CMake is unavailable or you are on an older/legacy macOS,
you can compile all sources in a single `clang`/`gcc` invocation.  The
`sdl-config` helper (installed by `sdl12-compat`/`libsdl`) prints the correct
flags automatically:

```sh
# from the A8E source directory
clang -std=c99 -O2 -Wall \
      -I. $(sdl-config --cflags) -I$(sdl-config --prefix)/include \
      6502.c A8E.c Antic.c AtariIo.c Gtia.c Pia.c Pokey.c \
      -o A8E \
      $(sdl-config --libs) -lm
```

The extra `-I$(sdl-config --prefix)/include` is needed because the source
code uses `#include <SDL/SDL.h>` — `sdl-config --cflags` alone only adds the
SDL subdirectory.

If `sdl-config` is not on your path, spell the flags out manually:

```sh
clang -std=c99 -O2 -Wall \
      -I. -I/usr/local/include -I/usr/local/include/SDL \
      6502.c A8E.c Antic.c AtariIo.c Gtia.c Pia.c Pokey.c \
      -o A8E \
      -L/usr/local/lib -lSDLmain -lSDL -lm -framework Cocoa
```

Replace `/usr/local` with the prefix where SDL is installed (e.g.
`/opt/homebrew` on Apple Silicon).  Substitute `gcc` for `clang` if needed.
Add `-DA8E_BUILD_VERSION="…"` to override the version string.

---

## Debugging & Logging

Debug output is controlled via compile-time `#define` macros in `AtariIo.h`. You can uncomment them in the header or pass them directly via `CMAKE_C_FLAGS`.

**CMake Example:**
```sh
cmake -S . -B build -DCMAKE_C_FLAGS="-DVERBOSE_REGISTER -DVERBOSE_SIO"
cmake --build build -j
```

**Available Macros:**
| Macro | Function / Log Output |
|-------|-----------------------|
| `ENABLE_VERBOSE_DEBUGGING` | Allows runtime CPU disassembly via **F12** (Active by default). |
| `VERBOSE_NMI` / `VERBOSE_IRQ` | NMI and IRQ events. |
| `VERBOSE_SIO` | Serial I/O command and data phases. |
| `VERBOSE_ROM_SWITCH` | ROM bank switching (PIA port B). |
| `VERBOSE_REGISTER` | **Warning: Noticeably slows emulation.** Logs all chip register reads/writes (GTIA, Pokey, Antic, PIA). |
| `VERBOSE_DL` | ANTIC display-list fetch activity. |
| `DISABLE_COLLISIONS` | Disables GTIA sprite/playfield collision detection. |