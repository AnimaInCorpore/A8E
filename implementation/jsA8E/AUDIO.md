# Audio

- Files: `jsA8E/js/audio/runtime.js`, `jsA8E/js/audio/worklet.js`
- Purpose: output low-latency emulator audio in the browser.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: AudioWorklet sample-queue path is preferred, with ScriptProcessor fallback for compatibility. POKEY-driven filter behavior is preserved by the core emulation path.
- Issues: ScriptProcessor fallback can increase latency and is only a compatibility path.
- Todo: note any latency/buffer changes and audible side effects.

