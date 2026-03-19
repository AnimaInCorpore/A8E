(function () {
  "use strict";

  function createApi(cfg) {
    if (!window.A8EPlayfieldRendererBase || typeof window.A8EPlayfieldRendererBase.createApi !== "function")
      {throw new Error("A8EPlayfieldRendererBase is not loaded");}
    if (!window.A8EPlayfieldMode23 || typeof window.A8EPlayfieldMode23.createApi !== "function")
      {throw new Error("A8EPlayfieldMode23 is not loaded");}
    if (!window.A8EPlayfieldMode45 || typeof window.A8EPlayfieldMode45.createApi !== "function")
      {throw new Error("A8EPlayfieldMode45 is not loaded");}
    if (!window.A8EPlayfieldMode67 || typeof window.A8EPlayfieldMode67.createApi !== "function")
      {throw new Error("A8EPlayfieldMode67 is not loaded");}
    if (!window.A8EPlayfieldMode8F || typeof window.A8EPlayfieldMode8F.createApi !== "function")
      {throw new Error("A8EPlayfieldMode8F is not loaded");}

    const base = window.A8EPlayfieldRendererBase.createApi(cfg);
    const modeCfg = Object.assign({}, cfg, base);

    const mode23 = window.A8EPlayfieldMode23.createApi(modeCfg);
    const mode45 = window.A8EPlayfieldMode45.createApi(modeCfg);
    const mode67 = window.A8EPlayfieldMode67.createApi(modeCfg);
    const mode8f = window.A8EPlayfieldMode8F.createApi(modeCfg);

    function drawModeLine(mode, ctx) {
      switch (mode) {
        case 2:    mode23.drawLineMode2(ctx); return true;
        case 3:    mode23.drawLineMode3(ctx); return true;
        case 4:    mode45.drawLineMode4(ctx); return true;
        case 5:    mode45.drawLineMode5(ctx); return true;
        case 6:    mode67.drawLineMode6(ctx); return true;
        case 7:    mode67.drawLineMode7(ctx); return true;
        case 8:    mode8f.drawLineMode8(ctx); return true;
        case 9:    mode8f.drawLineMode9(ctx); return true;
        case 0x0a: mode8f.drawLineModeA(ctx); return true;
        case 0x0b: mode8f.drawLineModeB(ctx); return true;
        case 0x0c: mode8f.drawLineModeC(ctx); return true;
        case 0x0d: mode8f.drawLineModeD(ctx); return true;
        case 0x0e: mode8f.drawLineModeE(ctx); return true;
        case 0x0f: mode8f.drawLineModeF(ctx); return true;
        default:
          return false;
      }
    }

    return {
      currentBackgroundColor: base.currentBackgroundColor,
      currentBackgroundPriority: base.currentBackgroundPriority,
      drawBackgroundClipped: base.drawBackgroundClipped,
      drawInterleavedVisibleBlankLine: base.drawInterleavedVisibleBlankLine,
      drawModeLine,
      initScanline: base.initScanline,
      stepClockActions: base.stepClockActions,
    };
  }

  window.A8EPlayfieldRenderer = { createApi };
})();
