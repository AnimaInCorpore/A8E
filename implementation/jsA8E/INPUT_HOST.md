# Input and Host/Device Integration

- Files: `jsA8E/js/core/input.js`, `jsA8E/js/core/keys.js`, `jsA8E/js/core/hdevice.js`, `jsA8E/js/core/hostfs.js`, `jsA8E/js/core/app_proxy.js`
- Purpose: map browser input and host file/device interactions into emulator signals.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: keyboard/joystick mappings (including translated/original keyboard modes) and H: hostfs/device bridges are handled through app/core integration, with worker-aware hostfs proxy sync.
- Issues: none tracked.
- Todo: keep host integration notes updated when new device flows are added.

