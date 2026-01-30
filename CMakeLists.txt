cmake_minimum_required(VERSION 3.16)

project(A8E LANGUAGES C)

# --- Configuration ---
set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS ON)

if(POLICY CMP0074)
  cmake_policy(SET CMP0074 NEW)
endif()

# --- Dependencies ---

# 1. OpenGL
find_package(OpenGL REQUIRED)

# 2. SDL (Legacy 1.x)
# Note: If you port the C code to SDL2, change this to find_package(SDL2 REQUIRED)
# and update the target_link_libraries below.
find_package(SDL REQUIRED)

# --- Source Files ---
add_executable(A8E
  6502.c
  A8E.c
  Antic.c
  AtariIo.c
  Gtia.c
  Pia.c
  Pokey.c
)

# --- Include Directories ---
# Add current directory to includes
target_include_directories(A8E PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")

# Add SDL includes
# This logic supports both #include <SDL.h> and #include <SDL/SDL.h>
target_include_directories(A8E PRIVATE ${SDL_INCLUDE_DIR})

# Attempt to locate the parent dir of SDL to support <SDL/SDL.h> syntax safer
get_filename_component(SDL_INCLUDE_PARENT "${SDL_INCLUDE_DIR}" DIRECTORY)
target_include_directories(A8E PRIVATE "${SDL_INCLUDE_PARENT}")

# --- Linking ---

# Link Standard SDL and OpenGL
target_link_libraries(A8E PRIVATE OpenGL::GL ${SDL_LIBRARY})

# --- Platform Specifics ---

if(MINGW)
  # Windows (MinGW) often requires mingw32 before SDLmain
  target_link_libraries(A8E PRIVATE mingw32 ${SDLMAIN_LIBRARY})
endif()

if(APPLE)
  # macOS needs Cocoa and SDLmain for legacy SDL 1.x
  find_library(COCOA_FRAMEWORK Cocoa REQUIRED)
  
  # Append Homebrew paths if on Apple Silicon
  if(EXISTS "/opt/homebrew")
    list(APPEND CMAKE_PREFIX_PATH "/opt/homebrew")
  endif()

  target_link_libraries(A8E PRIVATE "${COCOA_FRAMEWORK}" ${SDLMAIN_LIBRARY})
endif()

if(UNIX AND NOT APPLE)
  # Linux/Unix requires the math library
  target_link_libraries(A8E PRIVATE m)
endif()