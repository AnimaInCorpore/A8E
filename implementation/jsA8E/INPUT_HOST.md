# Input and Host/Device Integration

> Hardware emulation reference: Before implementing any Atari 800 XL PAL machine related hardware emulation, use the [AHRM](/AHRM/index.md) as reference.

- Files: `jsA8E/js/core/input.js`, `jsA8E/js/core/keys.js`, `jsA8E/js/core/hdevice.js`, `jsA8E/js/core/hostfs.js`, `jsA8E/js/core/app_proxy.js`
- Purpose: map browser input and host file/device interactions into emulator signals.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: keyboard/joystick mappings (including translated/original keyboard modes) and H: hostfs/device bridges are handled through app/core integration, with worker-aware hostfs proxy sync. H: directory footer free-space now uses size-based 128-byte sector math with a 999-sector logical capacity budget. H: CIO `GET BYTES` now returns `SUCCESS` whenever one or more bytes were transferred and returns `EOF` only for zero-byte reads, improving DOS binary-loader compatibility on short final reads. HostFS instances now also support snapshot export/import so jsA8E machine snapshots can restore the saved H: file directory contents and file metadata, not only the live IOCB channel handles.
- Issues: H: uses a logical DOS-style capacity model (999 sectors) for CIO free-space/disk-full behavior, while browser backing storage itself (IndexedDB) may physically hold more data outside CIO-mediated writes.
- Todo: keep host integration notes updated when new device flows are added.
