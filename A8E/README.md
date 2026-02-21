# A8E (Native C/SDL Emulator)

A native Atari 800 XL emulator written in C, utilizing SDL 1.2 style headers (`<SDL/SDL.h>`).

## Table of Contents

- [Requirements & Usage](#requirements--usage)
- [Controls](#controls)
- [Building from Source](#building-from-source)
- [Windows - Visual Studio / MSVC (Recommended)](#windows---visual-studio--msvc-recommended)
- [Windows - MSYS2 / MinGW-w64](#windows---msys2--mingw-w64)
- [Linux (Ubuntu / Debian / Fedora / RHEL / Arch Linux)](#linux-ubuntu--debian--fedora--rhel--arch-linux)
- [macOS (Homebrew)](#macos-homebrew)
- [Cross-compiling for Windows (from Linux/macOS)](#cross-compiling-for-windows-from-linuxmacos)
- [Cross-compiling Linux from macOS](#cross-compiling-linux-from-macos)
- [Manual Compilation (Unix/Linux/macOS)](#manual-compilation-unixlinuxmacos)
- [Debugging & Logging](#debugging--logging)

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

Building requires **SDL 1.2** development headers. SDL 1.2 is legacy, so for modern systems we recommend `sdl12-compat`, which preserves SDL 1.2 APIs while keeping this codebase unchanged. CMake 3.16+ is recommended but not strictly required (see the manual compilation section for a direct `clang`/`gcc` build).

The build process aims to produce **portable standalone binaries** with minimal external runtime dependencies. Where possible, static linking is used to achieve this.

> **Version Note:** The window caption version is injected at compile time via `../jsA8E/version.json`. If this file is missing, the build defaults to `dev`.
>
> **Shell Note:** Run `powershell` blocks in PowerShell. Run `sh` blocks in Bash/Zsh (or the MSYS2 MinGW shell where specified).

### Windows - Visual Studio / MSVC (Recommended)

This method produces a standalone `.exe` without external DLL dependencies.

#### Prerequisites
- Install Visual Studio 2022 with the "Desktop development with C++" workload, or the standalone Build Tools.
- Install vcpkg and SDL:
  ```powershell
  git clone https://github.com/microsoft/vcpkg C:\dev\vcpkg
  cd C:\dev\vcpkg
  .\bootstrap-vcpkg.bat
  .\vcpkg install sdl1:x64-windows-static
  ```
  > **Note:** `vcpkg install sdl1:x64-windows-static` builds SDL from source and may take a few minutes.

#### Build (PowerShell)
Run from the repository root:
```powershell
cmake -S . -B build/msvc `
  -G "Visual Studio 17 2022" -A x64 `
  -DCMAKE_TOOLCHAIN_FILE=C:\dev\vcpkg\scripts\buildsystems\vcpkg.cmake `
  -DVCPKG_TARGET_TRIPLET=x64-windows-static `
  -DCMAKE_MSVC_RUNTIME_LIBRARY="MultiThreaded$<$<CONFIG:Debug>:Debug>"

cmake --build build/msvc --config Release
```

*Executable output: `build\msvc\A8E\Release\A8E.exe`*

---

### Windows - MSYS2 / MinGW-w64

Produces a standalone `.exe` (statically linked, no external DLLs required).

#### Prerequisites
- Open the [MSYS2](https://www.msys2.org/) MinGW x64 shell and install tools:
  ```sh
  pacman -S --needed mingw-w64-x86_64-gcc mingw-w64-x86_64-cmake mingw-w64-x86_64-SDL
  ```

#### Build (MSYS2 MinGW shell)
```sh
cmake -S . -B build/mingw -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXE_LINKER_FLAGS="-static"
cmake --build build/mingw -j
```

*Executable output: `build/mingw/A8E/A8E.exe`*

---

### Linux (Ubuntu / Debian / Fedora / RHEL / Arch Linux)

#### Prerequisites
- **Ubuntu/Debian:** `sudo apt-get install -y build-essential cmake libsdl1.2-dev`
- **Fedora/RHEL:** `sudo dnf install gcc cmake SDL-devel`
- **Arch Linux:** `sudo pacman -S gcc cmake sdl12-compat`

#### Build (Bash/Zsh)
```sh
cmake -S . -B build
cmake --build build -j
```

*Executable output: `build/A8E/A8E`*

---

### macOS (Homebrew)

#### Prerequisites
```sh
xcode-select --install
brew install cmake sdl12-compat
```

#### Build (Zsh/Bash)
```sh
cmake -S . -B build
cmake --build build -j
```

*Executable output: `build/A8E/A8E`*

---

### Cross-compiling for Windows (from Linux/macOS)

You can cross-compile a Windows `.exe` from Linux or macOS with MinGW-w64 and Windows-target SDL 1.2 static libraries.

#### Prerequisites
- Linux: install MinGW-w64 (`sudo apt-get install gcc-mingw-w64` on Ubuntu/Debian, or distro equivalent).
- macOS: install MinGW-w64 (`brew install mingw-w64`).
- Obtain Windows SDL 1.2 static libraries (for example from MSYS2 MinGW packages).
- Replace placeholder paths like `<path-to-mingw>` with real paths on your machine.

#### Build (Bash/Zsh)
```sh
cmake -S . -B build/win64 \
  -DCMAKE_SYSTEM_NAME=Windows \
  -DCMAKE_C_COMPILER=x86_64-w64-mingw32-gcc \
  -DCMAKE_RC_COMPILER=x86_64-w64-mingw32-windres \
  -DSDL_INCLUDE_DIR=<path-to-mingw>/include/SDL \
  -DSDL_LIBRARY=<path-to-mingw>/lib/libSDL.a \
  -DSDLMAIN_LIBRARY=<path-to-mingw>/lib/libSDLmain.a \
  -DCMAKE_EXE_LINKER_FLAGS="-static"

cmake --build build/win64 -j
```

*Executable output (typical): `build/win64/A8E/A8E.exe`*

---

### Cross-compiling Linux from macOS

You can cross-compile a Linux binary from macOS using a Linux cross-toolchain.

#### Prerequisites
- Install a Linux cross-toolchain: `brew install x86_64-linux-gnu-gcc` (or similar).
- Obtain Linux SDL 1.2 static libraries and headers (e.g., build from source or extract from a Linux system).
- Replace placeholder paths like `<path-to-linux-sysroot>` with real paths on your machine.

#### Build (Zsh/Bash)
```sh
cmake -S . -B build/linux \
  -DCMAKE_SYSTEM_NAME=Linux \
  -DCMAKE_C_COMPILER=x86_64-linux-gnu-gcc \
  -DSDL_INCLUDE_DIR=<path-to-linux-sysroot>/include/SDL \
  -DSDL_LIBRARY=<path-to-linux-sysroot>/lib/libSDL.a \
  -DSDLMAIN_LIBRARY=<path-to-linux-sysroot>/lib/libSDLmain.a \
  -DCMAKE_EXE_LINKER_FLAGS="-static"

cmake --build build/linux -j
```

*Executable output (typical): `build/linux/A8E/A8E`*

---

### Manual Compilation (Unix/Linux/macOS)

If CMake is unavailable, you can compile all sources directly in a Unix-like shell (`bash`/`zsh`) with `clang` or `gcc`. The `sdl-config` helper (installed by `sdl12-compat`/`libsdl`) prints the correct flags automatically.

#### Prerequisites
- Install SDL 1.2 development headers (via `sdl12-compat` or `libsdl`).

#### Build (Bash/Zsh)
```sh
# from the A8E source directory
clang -std=c99 -O2 -Wall \
      -I. $(sdl-config --cflags) -I$(sdl-config --prefix)/include \
      6502.c A8E.c Antic.c AtariIo.c Gtia.c Pia.c Pokey.c \
      -o A8E \
      $(sdl-config --libs) -lm
```

The extra `-I$(sdl-config --prefix)/include` is needed because the source code uses `#include <SDL/SDL.h>` — `sdl-config --cflags` alone only adds the SDL subdirectory.

If `sdl-config` is not on your path, spell the flags out manually (macOS example):

```sh
clang -std=c99 -O2 -Wall \
      -I. -I/usr/local/include -I/usr/local/include/SDL \
      6502.c A8E.c Antic.c AtariIo.c Gtia.c Pia.c Pokey.c \
      -o A8E \
      -L/usr/local/lib -lSDLmain -lSDL -lm -framework Cocoa
```

On Linux or other Unix systems, drop `-framework Cocoa` and use your platform's SDL linker flags. Replace `/usr/local` with the prefix where SDL is installed (e.g. `/opt/homebrew` on Apple Silicon or `/usr` on many Linux distributions). Substitute `gcc` for `clang` if needed (primarily on Linux/Unix systems, as macOS GCC is deprecated). Add `-DA8E_BUILD_VERSION="…"` to override the version string.

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
