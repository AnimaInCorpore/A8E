cmake_minimum_required(VERSION 3.16)

project(A8E LANGUAGES C)

# Original build commands (from A8E.c):
#   gcc 6502.c A8E.c Antic.c AtariIo.c Gtia.c Pia.c Pokey.c -lGL -lSDL -lm -o A8E
#   gcc 6502.c A8E.c Antic.c AtariIo.c Gtia.c Pia.c Pokey.c -I/opt/homebrew/include -L/opt/homebrew/lib -framework Cocoa -framework OpenGL -lSDLmain -lSDL -lm -o A8E

set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS ON)

if(POLICY CMP0074)
  cmake_policy(SET CMP0074 NEW)
endif()

# Help CMake find Homebrew-installed deps on macOS.
if(APPLE)
  list(APPEND CMAKE_PREFIX_PATH "/opt/homebrew" "/usr/local")
endif()

add_executable(A8E
  6502.c
  A8E.c
  Antic.c
  AtariIo.c
  Gtia.c
  Pia.c
  Pokey.c
)

target_include_directories(A8E PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")

find_package(OpenGL REQUIRED)

# This codebase uses SDL 1.2-style headers (<SDL/SDL.h>).
# Install SDL 1.2 dev packages (or sdl12-compat providing SDL/SDL.h).
find_package(SDL REQUIRED)
set(_sdl_include_dir "")
if(DEFINED SDL_INCLUDE_DIRS AND SDL_INCLUDE_DIRS)
  set(_sdl_include_dir "${SDL_INCLUDE_DIRS}")
else()
  set(_sdl_include_dir "${SDL_INCLUDE_DIR}")
endif()

# FindSDL typically returns the SDL include dir (e.g. ".../include/SDL"). Since this
# code uses <SDL/SDL.h>, also add the parent include dir (e.g. ".../include").
get_filename_component(_sdl_include_parent "${_sdl_include_dir}" DIRECTORY)
target_include_directories(A8E PRIVATE "${_sdl_include_parent}" "${_sdl_include_dir}")

target_link_libraries(A8E PRIVATE OpenGL::GL)

set(_a8e_sdl_libs ${SDL_LIBRARY})

# SDLmain exists on Windows and (often) on macOS; it doesn't on most Linux distros.
if(DEFINED SDLMAIN_LIBRARY AND SDLMAIN_LIBRARY)
  list(FIND _a8e_sdl_libs "${SDLMAIN_LIBRARY}" _a8e_sdlmain_idx)
  if(_a8e_sdlmain_idx EQUAL -1)
    list(APPEND _a8e_sdl_libs "${SDLMAIN_LIBRARY}")
  endif()
endif()
list(REMOVE_DUPLICATES _a8e_sdl_libs)
target_link_libraries(A8E PRIVATE ${_a8e_sdl_libs})

# The original gcc command links libm.
if(UNIX)
  target_link_libraries(A8E PRIVATE m)
endif()

# The original macOS gcc command links Cocoa explicitly.
if(APPLE)
  set(_a8e_needs_cocoa TRUE)
  foreach(_lib IN LISTS _a8e_sdl_libs)
    if(_lib MATCHES "Cocoa")
      set(_a8e_needs_cocoa FALSE)
      break()
    endif()
  endforeach()

  if(_a8e_needs_cocoa)
    find_library(COCOA_FRAMEWORK Cocoa REQUIRED)
    target_link_libraries(A8E PRIVATE "${COCOA_FRAMEWORK}")
  endif()
endif()
