# POKEY

- Files: `A8E/Pokey.c`, `A8E/Pokey.h`
- Purpose: provide sound generation, timers, keyboard, and serial timing.
- Status: verified on 2026-02-23 (`implemented`, with open tuning tradeoffs below).
- Notes: digital high-pass filter behavior is implemented (AUDCTL-controlled); volume-only paths can bypass filtering. Mixer uses a per-channel exponential volume table (`g_pokey_chan_vol`, ~3 dB/step, vol=15 -> 8000 units). Unipolar mixer output is DC-blocked via a first-order high-pass filter (~20 Hz cutoff) before int16 output. Soft-clipping compresses sums beyond one channel's maximum (8000) to approximate hardware output-stage saturation.
- Issues: The exponential volume table (introduced 2026-02-23) creates a large dynamic range between volume settings - vol=15 is ~11x louder than vol=8, vs ~1.9x with the previous linear table. Programs that balance channels using different volume settings will sound more unbalanced than before. Channels in volume-only mode (AUDC bit4) at a constant level are attenuated to silence by the DC block filter within ~50 ms, since they present a pure DC signal. Single-channel absolute output level (~10.7% of int16 max at vol=15) is lower than with the previous bipolar DAC table (~18%), though the old table was producing a DC-offset signal without AC coupling.
- Todo: consider reducing dB-per-step (e.g. ~1.5 dB instead of 3 dB) or increasing the normalization gain to improve single-channel perceived loudness; verify volume balance against browser (`jsA8E/`) POKEY output and real hardware recordings.

