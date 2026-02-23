# Rendering / CRT

- Files: `jsA8E/js/render/gl.js`, `jsA8E/js/render/software.js`, `jsA8E/js/render/palette.js`, `jsA8E/js/render/shaders/webgl2.vert.glsl`, `jsA8E/js/render/shaders/webgl2.decode.frag.glsl`, `jsA8E/js/render/shaders/webgl2.crt.frag.glsl`, `jsA8E/js/render/shaders/webgl1.vert.glsl`, `jsA8E/js/render/shaders/webgl1.decode.frag.glsl`, `jsA8E/js/render/shaders/webgl1.crt.frag.glsl`
- Purpose: convert emulator frame data into display output.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: WebGL uses a two-pass path (decode pass, then CRT post-process pass). CRT shader applies filtering and scanline shaping; software rendering is fallback if WebGL/shaders fail.
- Issues: full shader/render path requires HTTP serving; `file://` cannot fully initialize fetch-based assets.
- Todo: keep CRT visual tuning and software fallback parity documented.

