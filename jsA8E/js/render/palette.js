(function () {
  "use strict";

  var CLAMP = function (x) {
    if (x < 0) return 0;
    if (x > 255) return 255;
    return x | 0;
  };

  // Returns Uint8Array length 256*3 (RGB triplets) matching the C palette logic.
  function createAtariPaletteRgb() {
    var palette = new Uint8Array(256 * 3);
    var hueAngle = [
      0.0, 163.0, 150.0, 109.0, 42.0, 17.0, -3.0, -14.0, -26.0, -53.0, -80.0,
      -107.0, -134.0, -161.0, -188.0, -197.0,
    ];

    var CONTRAST = 1.0;
    var BRIGHTNESS = 0.9;

    for (var lum = 0; lum < 16; lum++) {
      for (var hue = 0; hue < 16; hue++) {
        var dS, dY;
        if (hue === 0) {
          dS = 0.0;
          dY = (lum / 15.0) * CONTRAST;
        } else {
          dS = 0.5;
          dY = ((lum + BRIGHTNESS) / (15.0 + BRIGHTNESS)) * CONTRAST;
        }

        var angle = (hueAngle[hue] / 180.0) * Math.PI;
        var dR = dY + dS * Math.sin(angle);
        var dG =
          dY -
          (27.0 / 53.0) * dS * Math.sin(angle) -
          (10.0 / 53.0) * dS * Math.cos(angle);
        var dB = dY + dS * Math.cos(angle);

        var r = CLAMP(dR * 256.0);
        var g = CLAMP(dG * 256.0);
        var b = CLAMP(dB * 256.0);

        var idx = (lum + hue * 16) * 3;
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

