# Worker Boundary

- Files: `jsA8E/emulator_worker.js`, `jsA8E/js/core/app_proxy.js`
- Purpose: run emulation away from the main thread and exchange events/data with UI/audio.
- Status: verified on 2026-02-23 (`implemented`).
- Notes: worker messaging transports control/state, hostfs snapshots, and audio bridge status between runtime parts; rendering is driven through OffscreenCanvas with fallback to legacy in-thread mode when unsupported.
- Issues: none tracked.
- Todo: log protocol changes whenever message schema changes.
