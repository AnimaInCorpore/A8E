(function () {
  "use strict";

  const CLAMP = x => {
    if (x < 0) return 0;
    if (x > 255) return 255;
    return x | 0;
  };

  // Returns Uint8Array length 256*3 (RGB triplets) matching the C palette logic.
  function createAtariPaletteRgb() {
    const palette = new Uint8Array(256 * 3);
    const hueAngle = [
      0.0, 163.0, 150.0, 109.0, 42.0, 17.0, -3.0, -14.0, -26.0, -53.0, -80.0,
      -107.0, -134.0, -161.0, -188.0, -197.0,
    ];

    const CONTRAST = 1.0;
    const BRIGHTNESS = 0.9;

    for (let lum = 0; lum < 16; lum++) {
      for (let hue = 0; hue < 16; hue++) {
        let dS, dY;
        if (hue === 0) {
          dS = 0.0;
          dY = (lum / 15.0) * CONTRAST;
        } else {
          dS = 0.5;
          dY = ((lum + BRIGHTNESS) / (15.0 + BRIGHTNESS)) * CONTRAST;
        }

        const angle = (hueAngle[hue] / 180.0) * Math.PI;
        const dR = dY + dS * Math.sin(angle);
        const dG =
          dY -
          (27.0 / 53.0) * dS * Math.sin(angle) -
          (10.0 / 53.0) * dS * Math.cos(angle);
        const dB = dY + dS * Math.cos(angle);

        const r = CLAMP(dR * 256.0);
        const g = CLAMP(dG * 256.0);
        const b = CLAMP(dB * 256.0);

        const idx = (lum + hue * 16) * 3;
        palette[idx + 0] = r;
        palette[idx + 1] = g;
        palette[idx + 2] = b;
      }
    }

    return palette;
  }

  window.A8EPalette = {
    createAtariPaletteRgb: createAtariPaletteRgb,
  };
})();
