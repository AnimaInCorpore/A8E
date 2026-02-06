(function () {
  "use strict";

  function createApi(cfg) {
    var Palette = cfg.Palette;
    var PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;
    var LINES_PER_SCREEN_PAL = cfg.LINES_PER_SCREEN_PAL;
    var VIEW_W = cfg.VIEW_W;
    var VIEW_H = cfg.VIEW_H;
    var VIEW_X = cfg.VIEW_X;
    var VIEW_Y = cfg.VIEW_Y;

    function makeVideo() {
      var palette = Palette.createAtariPaletteRgb();
      return {
        pixels: new Uint8Array(PIXELS_PER_LINE * LINES_PER_SCREEN_PAL),
        priority: new Uint8Array(PIXELS_PER_LINE * LINES_PER_SCREEN_PAL),
        paletteRgb: palette,
      };
    }

    function blitViewportToImageData(video, imageData) {
      var dst = imageData.data;
      var pal = video.paletteRgb;
      var srcPixels = video.pixels;

      var dstIdx = 0;
      for (var y = 0; y < VIEW_H; y++) {
        var srcRow = (VIEW_Y + y) * PIXELS_PER_LINE + VIEW_X;
        for (var x = 0; x < VIEW_W; x++) {
          var c = srcPixels[srcRow + x] & 0xff;
          var pi = c * 3;
          dst[dstIdx++] = pal[pi + 0];
          dst[dstIdx++] = pal[pi + 1];
          dst[dstIdx++] = pal[pi + 2];
          dst[dstIdx++] = 255;
        }
      }
    }

    function fillLine(video, y, x, w, color, priority) {
      var base = y * PIXELS_PER_LINE + x;
      var pixels = video.pixels;
      var c = color & 0xff;
      if (priority === null || priority === undefined) {
        for (var i = 0; i < w; i++) pixels[base + i] = c;
        return;
      }
      var pr = video.priority;
      var p = priority & 0xff;
      for (var j = 0; j < w; j++) {
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
