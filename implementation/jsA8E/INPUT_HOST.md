# Input and Host/Device Integration

- Files: `jsA8E/js/core/input.js`, `jsA8E/js/core/keys.js`, `jsA8E/js/core/hdevice.js`, `jsA8E/js/core/hostfs.js`, `jsA8E/js/core/app_proxy.js`
- Purpose: map browser input and host file/device interactions into emulator signals.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: keyboard/joystick mappings (including translated/original keyboard modes) and H: hostfs/device bridges are handled through app/core integration, with worker-aware hostfs proxy sync. H: directory footer free-space now uses size-based 128-byte sector math with a 999-sector logical capacity budget.
- Issues: H: uses a logical DOS-style capacity model (999 sectors) for CIO free-space/disk-full behavior, while browser backing storage itself (IndexedDB) may physically hold more data outside CIO-mediated writes.
- Todo: keep host integration notes updated when new device flows are added.
