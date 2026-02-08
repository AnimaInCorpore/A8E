# jsA8E (JavaScript-only A8E)

Browser-based Atari 800 XL emulator port of the C/SDL A8E project.

Rendering uses WebGL when available (indexed framebuffer + palette lookup, then a `crt-lottes-fast` style post-process tuned for early-1980s TV metrics), with a 2D-canvas fallback.

## Run

Because most browsers block `fetch()` from `file://` URLs, run it via a local static server from the repo root:

- `python3 -m http.server 8000`
- then open `http://localhost:8000/jsA8E/`

## Input

- Joystick 1: Arrow keys
- Triggers: Left Alt = TRIG0, Right Alt = TRIG2, Meta = TRIG3
- Keyboard modifiers: Ctrl, Shift

## ROMs

For legal reasons, this folder does not embed ROMs by default.

- Load `ATARIXL.ROM` (16KB) and `ATARIBAS.ROM` (8KB) via the UI.
- If you serve the whole repo root, the app also tries to auto-load `../ATARIXL.ROM` and `../ATARIBAS.ROM`.
