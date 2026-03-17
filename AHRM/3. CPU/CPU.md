## Chapter 3 CPU

The 6502 chip is the CPU of the Atari. Used in many computers of the time and still in use as a microcontroller in enhanced forms, both the official and unofficial behaviors of the 6502 are well known. While the 6502 was later superseded by chips such as the 65C02 and the 65C816, the Atari 8-bit line continued using the original 6502 until the very end. Note that there is some confusion as to the precise chip used in the Atari 8-bit series. The original 400/800 use the NMOS 6502, along with a handful of extra circuitry to provide the ability to halt the CPU for ANTIC DMA; this was later replaced with the 6502C, a custom version that contains the HALT logic built-in. This should not be confused with the CMOS 65C02, which is an enhanced 6502 with additional instructions and which was never used in the Atari 8-bit line. understand when programming to the metal on the Atari 8-bit series. For the sake of brevity, the basic architecture of the 6502 will be omitted here to allow more space for documenting

The 6502 contains many nuances and unusual undocumented behaviors which are crucial to these corner cases.

