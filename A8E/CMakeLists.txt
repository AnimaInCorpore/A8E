cmake_minimum_required(VERSION 3.16)

project(A8E LANGUAGES C)

# --- Configuration ---
set(CMAKE_C_STANDARD 99)
set(CMAKE_C_STANDARD_REQUIRED ON)
set(CMAKE_C_EXTENSIONS ON)

if(POLICY CMP0074)
  cmake_policy(SET CMP0074 NEW)
endif()

# --- Build Version (shared with jsA8E release tracking) ---
set(A8E_BUILD_VERSION "dev")
set(A8E_VERSION_FILE "${CMAKE_CURRENT_SOURCE_DIR}/../jsA8E/version.json")

if(EXISTS "${A8E_VERSION_FILE}")
  file(READ "${A8E_VERSION_FILE}" A8E_VERSION_JSON)
  string(
    REGEX MATCH
    "\"version\"[ \t\r\n]*:[ \t\r\n]*\"([^\"]+)\""
    A8E_VERSION_MATCH
    "${A8E_VERSION_JSON}"
  )
  if(CMAKE_MATCH_1)
    set(A8E_BUILD_VERSION "${CMAKE_MATCH_1}")
  endif()
endif()

message(STATUS "A8E build version: ${A8E_BUILD_VERSION}")

# --- Dependencies ---
# Add common Homebrew prefixes before dependency discovery.
if(APPLE)
  if(EXISTS "/opt/homebrew")
    list(PREPEND CMAKE_PREFIX_PATH "/opt/homebrew")
  endif()
  if(EXISTS "/usr/local")
    list(PREPEND CMAKE_PREFIX_PATH "/usr/local")
  endif()
endif()

# 1. SDL2
find_package(SDL2 REQUIRED)

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

target_compile_definitions(A8E PRIVATE A8E_BUILD_VERSION=\"${A8E_BUILD_VERSION}\")

# --- Include Directories ---
target_include_directories(A8E PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")

# SDL2: modern config provides SDL2::SDL2 imported target; old-style provides
# SDL2_INCLUDE_DIRS / SDL2_LIBRARIES variables.
if(TARGET SDL2::SDL2)
  target_include_directories(A8E PRIVATE $<TARGET_PROPERTY:SDL2::SDL2,INTERFACE_INCLUDE_DIRECTORIES>)
else()
  target_include_directories(A8E PRIVATE ${SDL2_INCLUDE_DIRS})
  # Also expose the parent dir so <SDL2/SDL.h> resolves correctly.
  foreach(_d ${SDL2_INCLUDE_DIRS})
    get_filename_component(_parent "${_d}" DIRECTORY)
    target_include_directories(A8E PRIVATE "${_parent}")
  endforeach()
endif()

# --- Linking ---

# --- Platform Specifics ---

if(MINGW)
  # MinGW link order matters: mingw32, SDL2main, then SDL2.
  if(TARGET SDL2::SDL2main)
    target_link_libraries(A8E PRIVATE mingw32 SDL2::SDL2main SDL2::SDL2)
  elseif(TARGET SDL2::SDL2)
    target_link_libraries(A8E PRIVATE mingw32 SDL2::SDL2)
  else()
    target_link_libraries(A8E PRIVATE mingw32 ${SDL2_LIBRARIES})
  endif()
elseif(TARGET SDL2::SDL2)
  if(TARGET SDL2::SDL2main)
    target_link_libraries(A8E PRIVATE SDL2::SDL2main SDL2::SDL2)
  else()
    target_link_libraries(A8E PRIVATE SDL2::SDL2)
  endif()
else()
  target_link_libraries(A8E PRIVATE ${SDL2_LIBRARIES})
endif()

if(MSVC)
  # SDL2 static builds on MSVC need explicit Win32 system libs (SDL2's CMake
  # config usually adds these automatically, but keep them as a fallback).
  target_link_libraries(A8E PRIVATE winmm version imm32)
endif()

if(APPLE)
  if(NOT TARGET SDL2::SDL2)
    find_library(COCOA_FRAMEWORK Cocoa REQUIRED)
    target_link_libraries(A8E PRIVATE "${COCOA_FRAMEWORK}")
  endif()
endif()

if(UNIX AND NOT APPLE)
  # Linux/Unix requires the math library
  target_link_libraries(A8E PRIVATE m)
endif()
