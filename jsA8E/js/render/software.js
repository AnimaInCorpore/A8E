(function () {
  "use strict";

  const IS_LITTLE_ENDIAN =
    new Uint8Array(new Uint32Array([0x01020304]).buffer)[0] === 0x04;

  function buildPaletteRgba32(paletteRgb) {
    const out = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      const pi = i * 3;
      const r = paletteRgb[pi + 0] & 0xff;
      const g = paletteRgb[pi + 1] & 0xff;
      const b = paletteRgb[pi + 2] & 0xff;
      out[i] = IS_LITTLE_ENDIAN
        ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
        : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
    }
    return out;
  }

  function createApi(cfg) {
    const Palette = cfg.Palette;
    const PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;
    const LINES_PER_SCREEN_PAL = cfg.LINES_PER_SCREEN_PAL;
    const VIEW_W = cfg.VIEW_W;
    const VIEW_H = cfg.VIEW_H;
    const VIEW_X = cfg.VIEW_X;
    const VIEW_Y = cfg.VIEW_Y;

    function makeVideo() {
      const palette = Palette.createAtariPaletteRgb();
      return {
        pixels: new Uint8Array(PIXELS_PER_LINE * LINES_PER_SCREEN_PAL),
        priority: new Uint8Array(PIXELS_PER_LINE * LINES_PER_SCREEN_PAL),
        paletteRgb: palette,
        paletteRgba32: buildPaletteRgba32(palette),
      };
    }

    function blitViewportToImageData(video, imageData) {
      const dst32 = new Uint32Array(
        imageData.data.buffer,
        imageData.data.byteOffset,
        VIEW_W * VIEW_H,
      );
      const pal32 = video.paletteRgba32;
      const srcPixels = video.pixels;

      let dstIdx = 0;
      for (let y = 0; y < VIEW_H; y++) {
        let src = (VIEW_Y + y) * PIXELS_PER_LINE + VIEW_X;
        const srcEnd = src + VIEW_W;
        while (src < srcEnd) {
          dst32[dstIdx++] = pal32[srcPixels[src] & 0xff];
          src++;
        }
      }
    }

    function fillLine(video, y, x, w, color, priority) {
      const base = y * PIXELS_PER_LINE + x;
      const pixels = video.pixels;
      const c = color & 0xff;
      if (priority === null || priority === undefined) {
        for (let i = 0; i < w; i++) pixels[base + i] = c;
        return;
      }
      const pr = video.priority;
      const p = priority & 0xff;
      for (let j = 0; j < w; j++) {
        pixels[base + j] = c;
        pr[base + j] = p;
      }
    }

    return {
      makeVideo: makeVideo,
      blitViewportToImageData: blitViewportToImageData,
      fillLine: fillLine,
    };
  }

  window.A8ESoftware = {
    createApi: createApi,
  };
})();
