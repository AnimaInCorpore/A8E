(function () {
  "use strict";

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
      };
    }

    function blitViewportToImageData(video, imageData) {
      const dst = imageData.data;
      const pal = video.paletteRgb;
      const srcPixels = video.pixels;

      let dstIdx = 0;
      for (let y = 0; y < VIEW_H; y++) {
        const srcRow = (VIEW_Y + y) * PIXELS_PER_LINE + VIEW_X;
        for (let x = 0; x < VIEW_W; x++) {
          const c = srcPixels[srcRow + x] & 0xff;
          const pi = c * 3;
          dst[dstIdx++] = pal[pi + 0];
          dst[dstIdx++] = pal[pi + 1];
          dst[dstIdx++] = pal[pi + 2];
          dst[dstIdx++] = 255;
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
