(function () {
  "use strict";

  var Util = window.A8EUtil;

  function boot() {
    var canvas = document.getElementById("screen");
    canvas.tabIndex = 0;
    var nativeScreenW = canvas.width | 0;
    var nativeScreenH = canvas.height | 0;
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
    function resizeCrtCanvas() {
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

    if (gl) {
      canvas.classList.add("crtEnabled");
      resizeCrtCanvas();
      window.addEventListener("resize", resizeCrtCanvas);
      if (window.visualViewport) window.visualViewport.addEventListener("resize", resizeCrtCanvas);
      requestAnimationFrame(resizeCrtCanvas);
    } else {
      canvas.classList.remove("crtEnabled");
      ctx2d = canvas.getContext("2d", { alpha: false });
    }

    var btnStart = document.getElementById("btnStart");
    var btnPause = document.getElementById("btnPause");
    var btnReset = document.getElementById("btnReset");
    var chkTurbo = document.getElementById("chkTurbo");
    var chkAudio = document.getElementById("chkAudio");
    var chkOptionOnStart = document.getElementById("chkOptionOnStart");

    var romOs = document.getElementById("romOs");
    var romBasic = document.getElementById("romBasic");
    var disk1 = document.getElementById("disk1");
    var romStatus = document.getElementById("romStatus");
    var diskStatus = document.getElementById("diskStatus");
    var debugEl = document.getElementById("debug");

    var app;
    try {
      app = window.A8EApp.create({
        canvas: canvas,
        gl: gl,
        ctx2d: ctx2d,
        debugEl: debugEl,
        audioEnabled: chkAudio.checked,
        turbo: chkTurbo.checked,
        optionOnStart: chkOptionOnStart.checked,
      });
    } catch (e) {
      // If WebGL init succeeded but shader/program setup failed, fall back to 2D by replacing the canvas.
      if (gl && !ctx2d) {
        var parent = canvas.parentNode;
        if (parent) {
          var nextCanvas = canvas.cloneNode(false);
          nextCanvas.width = nativeScreenW;
          nextCanvas.height = nativeScreenH;
          nextCanvas.classList.remove("crtEnabled");
          parent.replaceChild(nextCanvas, canvas);
          canvas = nextCanvas;
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
            optionOnStart: chkOptionOnStart.checked,
          });
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

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
