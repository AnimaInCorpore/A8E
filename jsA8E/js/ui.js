(function () {
  "use strict";

  var Util = window.A8EUtil;

  function boot() {
    var canvas = document.getElementById("screen");
    var debugEl = document.getElementById("debug");
    canvas.tabIndex = 0;
    var nativeScreenW = canvas.width | 0;
    var nativeScreenH = canvas.height | 0;
    var screenViewport = canvas.parentElement;
    var app = null;
    var gl = null;
    try {
      gl =
        canvas.getContext("webgl2", {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
          powerPreference: "high-performance",
        }) ||
        canvas.getContext("webgl", {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
          powerPreference: "high-performance",
        }) ||
        canvas.getContext("experimental-webgl", {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
        });
    } catch (e) {
      gl = null;
    }

    var ctx2d = null;
    var crtCanvas = null;
    var onLayoutResize = null;
    var onCrtContextLost = null;
    var onCrtContextRestored = null;
    var didCleanup = false;

    function resizeDisplayCanvas() {
      var viewport = screenViewport || canvas.parentElement;
      if (!viewport) return;
      var rect = viewport.getBoundingClientRect();
      var maxW = Math.max(1, Math.floor(rect.width || nativeScreenW));
      var maxH = Math.max(1, Math.floor(rect.height || nativeScreenH));
      var aspect = nativeScreenW / nativeScreenH;
      var cssW = maxW;
      var cssH = Math.round(cssW / aspect);
      if (cssH > maxH) {
        cssH = maxH;
        cssW = Math.round(cssH * aspect);
      }
      var nextW = Math.max(1, cssW) + "px";
      var nextH = Math.max(1, cssH) + "px";
      if (canvas.style.width !== nextW) canvas.style.width = nextW;
      if (canvas.style.height !== nextH) canvas.style.height = nextH;
    }

    function resizeCrtCanvas() {
      resizeDisplayCanvas();
      if (!gl) return;
      var dpr = window.devicePixelRatio || 1;
      var rect = canvas.getBoundingClientRect();
      var cssW = Math.max(1, Math.round(rect.width || nativeScreenW));
      var cssH = Math.max(1, Math.round(rect.height || nativeScreenH));
      var targetW = Math.max(nativeScreenW, Math.round(cssW * dpr));
      var targetH = Math.max(nativeScreenH, Math.round(cssH * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    }

    function detachLayoutHooks() {
      if (!onLayoutResize) return;
      window.removeEventListener("resize", onLayoutResize);
      if (window.visualViewport) window.visualViewport.removeEventListener("resize", onLayoutResize);
      onLayoutResize = null;
    }

    function detachCrtHooks() {
      if (!crtCanvas) return;
      if (onCrtContextLost) crtCanvas.removeEventListener("webglcontextlost", onCrtContextLost, false);
      if (onCrtContextRestored) crtCanvas.removeEventListener("webglcontextrestored", onCrtContextRestored, false);
      crtCanvas = null;
      onCrtContextLost = null;
      onCrtContextRestored = null;
    }

    function cleanup() {
      if (didCleanup) return;
      didCleanup = true;
      detachLayoutHooks();
      detachCrtHooks();
      if (app && app.dispose) app.dispose();
    }

    if (gl) {
      canvas.classList.add("crtEnabled");
      resizeCrtCanvas();

      crtCanvas = canvas;
      onCrtContextLost = function (e) {
        e.preventDefault();
        if (app && app.pause) {
          app.pause();
          setButtons(false);
        }
        gl = null;
        if (debugEl) {
          debugEl.textContent = "WebGL context lost. Waiting for restore.";
        }
      };
      onCrtContextRestored = function () {
        if (debugEl) {
          debugEl.textContent = "WebGL context restored. Reloading emulator.";
        }
        window.setTimeout(function () {
          window.location.reload();
        }, 0);
      };

      crtCanvas.addEventListener("webglcontextlost", onCrtContextLost, false);
      crtCanvas.addEventListener("webglcontextrestored", onCrtContextRestored, false);
    } else {
      canvas.classList.remove("crtEnabled");
      ctx2d = canvas.getContext("2d", { alpha: false });
    }

    onLayoutResize = resizeCrtCanvas;
    window.addEventListener("resize", onLayoutResize);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", onLayoutResize);
    requestAnimationFrame(onLayoutResize);

    var btnStart = document.getElementById("btnStart");
    var btnPause = document.getElementById("btnPause");
    var btnReset = document.getElementById("btnReset");
    var chkTurbo = document.getElementById("chkTurbo");
    var chkSioTurbo = document.getElementById("chkSioTurbo");
    var chkAudio = document.getElementById("chkAudio");
    var chkOptionOnStart = document.getElementById("chkOptionOnStart");

    var romOs = document.getElementById("romOs");
    var romBasic = document.getElementById("romBasic");
    var disk1 = document.getElementById("disk1");
    var romStatus = document.getElementById("romStatus");
    var diskStatus = document.getElementById("diskStatus");

    try {
      app = window.A8EApp.create({
        canvas: canvas,
        gl: gl,
        ctx2d: ctx2d,
        debugEl: debugEl,
        audioEnabled: chkAudio.checked,
        turbo: chkTurbo.checked,
        sioTurbo: chkSioTurbo.checked,
        optionOnStart: chkOptionOnStart.checked,
      });
    } catch (e) {
      // If WebGL init succeeded but shader/program setup failed, fall back to 2D by replacing the canvas.
      if (gl && !ctx2d) {
        detachCrtHooks();
        var parent = canvas.parentNode;
        if (parent) {
          var nextCanvas = canvas.cloneNode(false);
          nextCanvas.width = nativeScreenW;
          nextCanvas.height = nativeScreenH;
          nextCanvas.classList.remove("crtEnabled");
          parent.replaceChild(nextCanvas, canvas);
          canvas = nextCanvas;
          screenViewport = canvas.parentElement;
          canvas.tabIndex = 0;
          gl = null;
          ctx2d = canvas.getContext("2d", { alpha: false });
          app = window.A8EApp.create({
            canvas: canvas,
            gl: null,
            ctx2d: ctx2d,
            debugEl: debugEl,
            audioEnabled: chkAudio.checked,
            turbo: chkTurbo.checked,
            sioTurbo: chkSioTurbo.checked,
            optionOnStart: chkOptionOnStart.checked,
          });
          resizeCrtCanvas();
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    window.addEventListener("beforeunload", cleanup);

    function setButtons(running) {
      btnStart.disabled = running;
      btnPause.disabled = !running;
      btnReset.disabled = !app.isReady();
    }

    function updateStatus() {
      var rs = [];
      if (app.hasOsRom()) rs.push("ATARIXL.ROM loaded");
      if (app.hasBasicRom()) rs.push("ATARIBAS.ROM loaded");
      romStatus.textContent = rs.length ? rs.join(" · ") : "No ROMs loaded yet.";
      diskStatus.textContent = app.hasDisk1() ? "Disk loaded." : "No disk loaded.";
      setButtons(app.isRunning());
    }

    btnStart.addEventListener("click", function () {
      app.start();
      setButtons(true);
      canvas.focus();
    });

    btnPause.addEventListener("click", function () {
      app.pause();
      setButtons(false);
    });

    btnReset.addEventListener("click", function () {
      app.reset();
      updateStatus();
      canvas.focus();
    });

    chkTurbo.addEventListener("change", function () {
      app.setTurbo(!!chkTurbo.checked);
    });

    chkSioTurbo.addEventListener("change", function () {
      app.setSioTurbo(!!chkSioTurbo.checked);
    });

    chkAudio.addEventListener("change", function () {
      app.setAudioEnabled(!!chkAudio.checked);
    });

    chkOptionOnStart.addEventListener("change", function () {
      app.setOptionOnStart(!!chkOptionOnStart.checked);
    });

    function attachFileInput(inputEl, handler) {
      inputEl.addEventListener("change", function () {
        var file = inputEl.files && inputEl.files[0];
        if (!file) return;
        Util.readFileAsArrayBuffer(file).then(function (buf) {
          try {
            handler(buf, file.name);
            updateStatus();
          } catch (e) {
            debugEl.textContent = String(e && e.message ? e.message : e);
          }
        });
      });
    }

    attachFileInput(romOs, function (buf) {
      app.loadOsRom(buf);
    });

    attachFileInput(romBasic, function (buf) {
      app.loadBasicRom(buf);
    });

    attachFileInput(disk1, function (buf, name) {
      app.loadDisk1(buf, name);
    });

    // Keyboard input forwarded to emulator.
    canvas.addEventListener("keydown", function (e) {
      if (app.onKeyDown(e)) e.preventDefault();
    });
    canvas.addEventListener("keyup", function (e) {
      if (app.onKeyUp(e)) e.preventDefault();
    });

    // Attempt auto-load from repo root (works when serving repo root).
    Promise.all([
      Util.fetchOptional("../ATARIXL.ROM"),
      Util.fetchOptional("../ATARIBAS.ROM"),
    ]).then(function (res) {
      try {
        if (res[0]) app.loadOsRom(res[0]);
        if (res[1]) app.loadBasicRom(res[1]);
      } catch (e) {
        debugEl.textContent = String(e && e.message ? e.message : e);
      }
      updateStatus();
    });

    updateStatus();
  }

  window.A8EUI = { boot: boot };
})();
