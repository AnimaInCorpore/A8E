(function () {
  "use strict";

  var Util = window.A8EUtil;

  async function boot() {
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
    var onFullscreenChange = null;
    var didCleanup = false;

    function resizeDisplayCanvas() {
      var viewport = screenViewport || canvas.parentElement;
      if (!viewport) return;
      var rect = viewport.getBoundingClientRect();
      var vv = window.visualViewport;
      var visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      var availableH = Math.floor(visibleBottom - rect.top - 8);
      if (keyboardPanel && !keyboardPanel.hidden) {
        var kbRect = keyboardPanel.getBoundingClientRect();
        availableH -= Math.max(0, Math.ceil(kbRect.height + 10));
      }
      var maxW = Math.max(1, Math.floor(rect.width || nativeScreenW));
      var maxH = Math.max(1, availableH || Math.floor(rect.height || nativeScreenH));
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
      if (onFullscreenChange) {
        document.removeEventListener("fullscreenchange", onFullscreenChange);
        document.removeEventListener("webkitfullscreenchange", onFullscreenChange);
      }
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
      };
      onCrtContextRestored = function () {
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
    var btnReset = document.getElementById("btnReset");
    var btnFullscreen = document.getElementById("btnFullscreen");
    var btnTurbo = document.getElementById("btnTurbo");
    var btnSioTurbo = document.getElementById("btnSioTurbo");
    var btnAudio = document.getElementById("btnAudio");
    var btnKeyboard = document.getElementById("btnKeyboard");
    var btnOptionOnStart = document.getElementById("btnOptionOnStart");

    var romOs = document.getElementById("romOs");
    var romBasic = document.getElementById("romBasic");
    var disk1 = document.getElementById("disk1");
    var romOsStatus = document.getElementById("romOsStatus");
    var romBasicStatus = document.getElementById("romBasicStatus");
    var diskStatus = document.getElementById("diskStatus");
    var keyboardPanel = document.getElementById("keyboardPanel");
    var atariKeyboard = document.getElementById("atariKeyboard");
    var virtualModifiers = {
      ctrl: false,
      shift: false,
    };
    var pressedVirtualKeysByPointer = new Map();

    if (gl && window.A8EGlRenderer && window.A8EGlRenderer.loadShaderSources) {
      try {
        await window.A8EGlRenderer.loadShaderSources();
      } catch (e) {
        // create() will fail and trigger the existing 2D fallback path below.
      }
    }

    try {
      app = window.A8EApp.create({
        canvas: canvas,
        gl: gl,
        ctx2d: ctx2d,
        debugEl: debugEl,
        audioEnabled: btnAudio.classList.contains("active"),
        turbo: btnTurbo.classList.contains("active"),
        sioTurbo: btnSioTurbo.classList.contains("active"),
        optionOnStart: btnOptionOnStart.classList.contains("active"),
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
            audioEnabled: btnAudio.classList.contains("active"),
            turbo: btnTurbo.classList.contains("active"),
            sioTurbo: btnSioTurbo.classList.contains("active"),
            optionOnStart: btnOptionOnStart.classList.contains("active"),
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

    function setRunPauseButton(running) {
      btnStart.innerHTML = running
        ? '<i class="fa-solid fa-pause"></i>'
        : '<i class="fa-solid fa-play"></i>';
      btnStart.title = running
        ? "Pause emulation. Use this button again to continue from the current state."
        : "Start emulation and run the loaded Atari system.";
      btnStart.setAttribute(
        "aria-label",
        running
          ? "Pause emulation. Use this button again to continue from the current state."
          : "Start emulation and run the loaded Atari system."
      );
    }

    function setButtons(running) {
      setRunPauseButton(running);
      btnReset.disabled = !app.isReady();
    }

    function getFullscreenElement() {
      return document.fullscreenElement || document.webkitFullscreenElement || null;
    }

    function isViewportFullscreen() {
      return getFullscreenElement() === screenViewport;
    }

    function updateFullscreenButton() {
      if (!btnFullscreen) return;
      var active = isViewportFullscreen();
      btnFullscreen.innerHTML = active
        ? '<i class="fa-solid fa-compress"></i>'
        : '<i class="fa-solid fa-expand"></i>';
      btnFullscreen.title = active
        ? "Exit fullscreen mode and return to the normal emulator layout."
        : "Enter fullscreen mode for the emulator display area.";
      btnFullscreen.setAttribute(
        "aria-label",
        active
          ? "Exit fullscreen mode and return to the normal emulator layout."
          : "Enter fullscreen mode for the emulator display area."
      );
    }

    function setModifierButtons(modifier, active) {
      if (!atariKeyboard) return;
      var buttons = atariKeyboard.querySelectorAll('button[data-modifier="' + modifier + '"]');
      buttons.forEach(function (button) {
        button.classList.toggle("active", active);
      });
    }

    function setCtrlModifier(active) {
      var next = !!active;
      if (virtualModifiers.ctrl === next) return;
      virtualModifiers.ctrl = next;
      setModifierButtons("ctrl", next);
    }

    function makeVirtualKeyEvent(key, code, shiftOverride, sdlSym) {
      var ev = {
        key: key,
        code: code || "",
        ctrlKey: virtualModifiers.ctrl,
        shiftKey: shiftOverride !== undefined ? !!shiftOverride : virtualModifiers.shift,
      };
      if (typeof sdlSym === "number" && isFinite(sdlSym)) ev.sdlSym = sdlSym | 0;
      return ev;
    }

    function setShiftModifier(active) {
      var next = !!active;
      if (virtualModifiers.shift === next) return;
      virtualModifiers.shift = next;
      setModifierButtons("shift", next);
      if (!app || !app.onKeyDown || !app.onKeyUp) return;
      var ev = makeVirtualKeyEvent("Shift", "ShiftLeft", next);
      if (next) app.onKeyDown(ev);
      else app.onKeyUp(ev);
    }

    function clearVirtualModifiers() {
      setShiftModifier(false);
      setCtrlModifier(false);
    }

    function flashVirtualKey(btn, durationMs) {
      if (!btn) return;
      btn.classList.add("pressed");
      window.setTimeout(function () {
        btn.classList.remove("pressed");
      }, durationMs || 120);
    }

    function pressVirtualKey(key, code, sdlSym) {
      if (!app || !app.onKeyDown || !app.onKeyUp) return;
      var ev = makeVirtualKeyEvent(key, code, undefined, sdlSym);
      app.onKeyDown(ev);
      app.onKeyUp(ev);
      if (virtualModifiers.shift) setShiftModifier(false);
      if (virtualModifiers.ctrl) setCtrlModifier(false);
    }

    function parseSdlSym(btn) {
      if (!btn) return null;
      var sdl = btn.getAttribute("data-sdl");
      if (!sdl) return null;
      var parsed = parseInt(sdl, 10);
      return isFinite(parsed) ? parsed : null;
    }

    function releasePointerVirtualKey(pointerId) {
      if (!pressedVirtualKeysByPointer.has(pointerId)) return;
      var st = pressedVirtualKeysByPointer.get(pointerId);
      pressedVirtualKeysByPointer.delete(pointerId);
      if (st.btn) st.btn.classList.remove("pressed");
      if (app && app.onKeyUp) {
        app.onKeyUp(makeVirtualKeyEvent(st.key, st.code, undefined, st.sdlSym));
      }
      if (st.consumeShift && virtualModifiers.shift) setShiftModifier(false);
      if (st.consumeCtrl && virtualModifiers.ctrl) setCtrlModifier(false);
    }

    function setKeyboardEnabled(active) {
      if (!btnKeyboard || !keyboardPanel) return;
      var enabled = !!active;
      btnKeyboard.classList.toggle("active", enabled);
      keyboardPanel.hidden = !enabled;

      var label = enabled
        ? "Hide the on-screen Atari 800 XL keyboard."
        : "Show the on-screen Atari 800 XL keyboard.";
      btnKeyboard.title = label;
      btnKeyboard.setAttribute("aria-label", label);

      if (!enabled) {
        pressedVirtualKeysByPointer.forEach(function (_st, pid) {
          releasePointerVirtualKey(pid);
        });
        clearVirtualModifiers();
      }
      resizeCrtCanvas();
      canvas.focus();
    }

    function requestFullscreen(el) {
      if (el.requestFullscreen) return el.requestFullscreen();
      if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
      return Promise.reject(new Error("Fullscreen is not supported in this browser."));
    }

    function exitFullscreen() {
      if (document.exitFullscreen) return document.exitFullscreen();
      if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
      return Promise.resolve();
    }

    function updateStatus() {
      // Update OS ROM status icon
      if (app.hasOsRom()) {
        romOsStatus.classList.remove("fa-circle-xmark");
        romOsStatus.classList.add("fa-circle-check");
      } else {
        romOsStatus.classList.remove("fa-circle-check");
        romOsStatus.classList.add("fa-circle-xmark");
      }

      // Update BASIC ROM status icon
      if (app.hasBasicRom()) {
        romBasicStatus.classList.remove("fa-circle-xmark");
        romBasicStatus.classList.add("fa-circle-check");
      } else {
        romBasicStatus.classList.remove("fa-circle-check");
        romBasicStatus.classList.add("fa-circle-xmark");
      }

      // Update disk status icon
      if (app.hasDisk1()) {
        diskStatus.classList.remove("fa-circle-xmark");
        diskStatus.classList.add("fa-circle-check");
      } else {
        diskStatus.classList.remove("fa-circle-check");
        diskStatus.classList.add("fa-circle-xmark");
      }

      setButtons(app.isRunning());
    }

    btnStart.addEventListener("click", function () {
      if (app.isRunning()) {
        app.pause();
        setButtons(app.isRunning());
      } else {
        app.start();
        setButtons(app.isRunning());
        canvas.focus();
      }
    });

    btnReset.addEventListener("click", function () {
      app.reset();
      updateStatus();
      canvas.focus();
    });

    if (btnFullscreen) {
      btnFullscreen.addEventListener("click", function () {
        var op = isViewportFullscreen() ? exitFullscreen() : requestFullscreen(screenViewport);
        Promise.resolve(op)
          .then(function () {
            updateFullscreenButton();
            resizeCrtCanvas();
            canvas.focus();
          })
          .catch(function () {
            // Fullscreen error - silently ignore
          });
      });
    }

    onFullscreenChange = function () {
      updateFullscreenButton();
      resizeCrtCanvas();
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("webkitfullscreenchange", onFullscreenChange);

    btnTurbo.addEventListener("click", function () {
      btnTurbo.classList.toggle("active");
      app.setTurbo(btnTurbo.classList.contains("active"));
    });

    btnSioTurbo.addEventListener("click", function () {
      btnSioTurbo.classList.toggle("active");
      app.setSioTurbo(btnSioTurbo.classList.contains("active"));
    });

    btnAudio.addEventListener("click", function () {
      btnAudio.classList.toggle("active");
      app.setAudioEnabled(btnAudio.classList.contains("active"));
    });

    if (btnKeyboard && keyboardPanel) {
      btnKeyboard.addEventListener("click", function () {
        setKeyboardEnabled(!btnKeyboard.classList.contains("active"));
      });
    }

    btnOptionOnStart.addEventListener("click", function () {
      btnOptionOnStart.classList.toggle("active");
      app.setOptionOnStart(btnOptionOnStart.classList.contains("active"));
    });

    if (atariKeyboard) {
      atariKeyboard.addEventListener("pointerdown", function (e) {
        var btn = e.target.closest("button.kbKey");
        if (!btn || !atariKeyboard.contains(btn)) return;
        if (keyboardPanel && keyboardPanel.hidden) return;

        var modifier = btn.getAttribute("data-modifier");
        if (modifier === "shift") {
          setShiftModifier(!virtualModifiers.shift);
          flashVirtualKey(btn);
          canvas.focus();
          return;
        }
        if (modifier === "ctrl") {
          setCtrlModifier(!virtualModifiers.ctrl);
          flashVirtualKey(btn);
          canvas.focus();
          return;
        }

        var key = btn.getAttribute("data-key");
        if (!key) return;
        var code = btn.getAttribute("data-code") || "";
        var sdlSym = parseSdlSym(btn);

        e.preventDefault();
        if (btn.setPointerCapture) {
          try {
            btn.setPointerCapture(e.pointerId);
          } catch (err) {
            // ignore capture errors
          }
        }

        btn.classList.add("pressed");
        if (app && app.onKeyDown) {
          app.onKeyDown(makeVirtualKeyEvent(key, code, undefined, sdlSym));
        }
        pressedVirtualKeysByPointer.set(e.pointerId, {
          btn: btn,
          key: key,
          code: code,
          sdlSym: sdlSym,
          consumeShift: virtualModifiers.shift,
          consumeCtrl: virtualModifiers.ctrl,
        });
        canvas.focus();
      });

      atariKeyboard.addEventListener("pointerup", function (e) {
        releasePointerVirtualKey(e.pointerId);
      });
      atariKeyboard.addEventListener("pointercancel", function (e) {
        releasePointerVirtualKey(e.pointerId);
      });
      atariKeyboard.addEventListener("pointerleave", function (e) {
        if ((e.buttons | 0) === 0) releasePointerVirtualKey(e.pointerId);
      });
      document.addEventListener("pointerup", function (e) {
        releasePointerVirtualKey(e.pointerId);
      });
      document.addEventListener("pointercancel", function (e) {
        releasePointerVirtualKey(e.pointerId);
      });

      // Keyboard accessibility fallback for focused on-screen key buttons.
      atariKeyboard.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var btn = e.target.closest("button.kbKey");
        if (!btn || !atariKeyboard.contains(btn)) return;
        var modifier = btn.getAttribute("data-modifier");
        if (modifier === "shift") {
          setShiftModifier(!virtualModifiers.shift);
          flashVirtualKey(btn);
          e.preventDefault();
          return;
        }
        if (modifier === "ctrl") {
          setCtrlModifier(!virtualModifiers.ctrl);
          flashVirtualKey(btn);
          e.preventDefault();
          return;
        }
        var key = btn.getAttribute("data-key");
        if (!key) return;
        pressVirtualKey(key, btn.getAttribute("data-code") || "", parseSdlSym(btn));
        flashVirtualKey(btn, 80);
        e.preventDefault();
      });
    }

    function attachFileInput(inputEl, handler) {
      inputEl.addEventListener("change", function () {
        var file = inputEl.files && inputEl.files[0];
        if (!file) return;
        Util.readFileAsArrayBuffer(file).then(function (buf) {
          try {
            handler(buf, file.name);
            updateStatus();
          } catch (e) {
            console.error("File load error:", e);
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
        console.error("Auto-load error:", e);
      }
      updateStatus();
    });

    updateStatus();
    updateFullscreenButton();
    if (btnKeyboard && keyboardPanel) {
      setKeyboardEnabled(btnKeyboard.classList.contains("active"));
    }
  }

  window.A8EUI = { boot: boot };
})();
