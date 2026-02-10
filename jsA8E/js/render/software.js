(function () {
  "use strict";

  function createApi(cfg) {
    let Palette = cfg.Palette;
    let PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;
    let LINES_PER_SCREEN_PAL = cfg.LINES_PER_SCREEN_PAL;
    let VIEW_W = cfg.VIEW_W;
    let VIEW_H = cfg.VIEW_H;
    let VIEW_X = cfg.VIEW_X;
    let VIEW_Y = cfg.VIEW_Y;

    function makeVideo() {
      let palette = Palette.createAtariPaletteRgb();
      return {
        pixels: new Uint8Array(PIXELS_PER_LINE * LINES_PER_SCREEN_PAL),
        priority: new Uint8Array(PIXELS_PER_LINE * LINES_PER_SCREEN_PAL),
        paletteRgb: palette,
      };
    }

    function blitViewportToImageData(video, imageData) {
      let dst = imageData.data;
      let pal = video.paletteRgb;
      let srcPixels = video.pixels;

      let dstIdx = 0;
      for (let y = 0; y < VIEW_H; y++) {
        let srcRow = (VIEW_Y + y) * PIXELS_PER_LINE + VIEW_X;
        for (let x = 0; x < VIEW_W; x++) {
          let c = srcPixels[srcRow + x] & 0xff;
          let pi = c * 3;
          dst[dstIdx++] = pal[pi + 0];
          dst[dstIdx++] = pal[pi + 1];
          dst[dstIdx++] = pal[pi + 2];
          dst[dstIdx++] = 255;
        }
      }
    }

    function fillLine(video, y, x, w, color, priority) {
      let base = y * PIXELS_PER_LINE + x;
      let pixels = video.pixels;
      let c = color & 0xff;
      if (priority === null || priority === undefined) {
        for (let i = 0; i < w; i++) pixels[base + i] = c;
        return;
      }
      let pr = video.priority;
      let p = priority & 0xff;
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
