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
    var layoutRoot = screenViewport && screenViewport.closest ? screenViewport.closest(".layout") : null;
    var keyboardPanel = document.getElementById("keyboardPanel");
    var joystickPanel = document.getElementById("joystickPanel");
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

    function readFlexGapPx(el) {
      if (!el || !window.getComputedStyle) return 0;
      var st = window.getComputedStyle(el);
      var raw = st.rowGap && st.rowGap !== "normal" ? st.rowGap : st.gap;
      var parsed = parseFloat(raw || "0");
      return isFinite(parsed) ? Math.max(0, parsed) : 0;
    }

    function isPanelVisible(el) {
      return !!el && !el.hidden && el.getClientRects().length > 0;
    }

    function reservedPanelHeight(el) {
      if (!isPanelVisible(el)) return 0;
      var rect = el.getBoundingClientRect();
      return Math.max(0, Math.ceil(rect.height + readFlexGapPx(el.parentElement)));
    }

    function resizeDisplayCanvas() {
      var viewport = screenViewport || canvas.parentElement;
      if (!viewport) return;
      var rect = viewport.getBoundingClientRect();
      var maxW = Math.max(1, Math.floor(rect.width || nativeScreenW));
      var aspect = nativeScreenW / nativeScreenH;
      var cssW = maxW;
      var cssH = Math.round(cssW / aspect);

      // In normal page layout, fit into both width and visible height while
      // reserving space only for joystick. Keyboard may be below visible area.
      // In fullscreen, fit only inside fullscreen viewport bounds.
      if (isViewportFullscreen()) {
        var vv = window.visualViewport;
        var visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
        var availableH = Math.floor(visibleBottom - rect.top - 8);
        var maxH = Math.max(1, availableH || Math.floor(rect.height || nativeScreenH));
        if (cssH > maxH) {
          cssH = maxH;
          cssW = Math.round(cssH * aspect);
        }
      } else {
        var availableNormalH = 0;
        if (layoutRoot) {
          var layoutRect = layoutRoot.getBoundingClientRect();
          var topOffset = Math.max(0, rect.top - layoutRect.top);
          availableNormalH = Math.floor(layoutRoot.clientHeight - topOffset - 8);
        } else {
          var vvNormal = window.visualViewport;
          var visibleBottomNormal = vvNormal ? vvNormal.offsetTop + vvNormal.height : window.innerHeight;
          availableNormalH = Math.floor(visibleBottomNormal - rect.top - 8);
        }
        availableNormalH -= reservedPanelHeight(joystickPanel);
        var normalMaxH = Math.max(1, availableNormalH || Math.floor(rect.height || nativeScreenH));
        if (cssH > normalMaxH) {
          cssH = normalMaxH;
          cssW = Math.round(cssH * aspect);
        }
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

    function isMobile() {
      return window.innerWidth <= 980 || (window.matchMedia && window.matchMedia("(max-width: 980px)").matches);
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
    var btnJoystick = document.getElementById("btnJoystick");
    var btnKeyboard = document.getElementById("btnKeyboard");
    var btnOptionOnStart = document.getElementById("btnOptionOnStart");

    var romOs = document.getElementById("romOs");
    var romBasic = document.getElementById("romBasic");
    var disk1 = document.getElementById("disk1");
    var romOsStatus = document.getElementById("romOsStatus");
    var romBasicStatus = document.getElementById("romBasicStatus");
    var diskStatus = document.getElementById("diskStatus");
    var atariKeyboard = document.getElementById("atariKeyboard");
    var joystickArea = document.getElementById("joystickArea");
    var joystickStick = document.getElementById("joystickStick");
    var fireButton = document.getElementById("fireButton");
    var joystickGlows = {
      up: document.getElementById("glowUp"),
      down: document.getElementById("glowDown"),
      left: document.getElementById("glowLeft"),
      right: document.getElementById("glowRight"),
    };
    var virtualModifiers = {
      ctrl: false,
      shift: false,
    };
    var physicalModifierKeys = {
      ctrl: new Set(),
      shift: new Set(),
    };
    var emulatedShiftDown = false;
    var pressedVirtualKeysByPointer = new Map();
    var joystickState = {
      up: false,
      down: false,
      left: false,
      right: false,
      fire: false,
    };
    var stickPointerId = null;
    var firePointerId = null;
    var stickCenter = { x: 0, y: 0 };
    var JOYSTICK_MAX_DEFLECT = 20;
    var JOYSTICK_DEAD_ZONE = 5;

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
          layoutRoot = screenViewport && screenViewport.closest ? screenViewport.closest(".layout") : null;
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

    function focusCanvas(preventScroll) {
      if (!canvas || typeof canvas.focus !== "function") return;
      if (!preventScroll) {
        canvas.focus();
        return;
      }
      try {
        canvas.focus({ preventScroll: true });
      } catch (err) {
        // Do not fallback to plain focus here; it would scroll the viewport.
      }
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

    function isModifierActive(modifier) {
      var heldPhysical = physicalModifierKeys[modifier] && physicalModifierKeys[modifier].size > 0;
      return !!virtualModifiers[modifier] || heldPhysical;
    }

    function refreshModifierButtons(modifier) {
      setModifierButtons(modifier, isModifierActive(modifier));
    }

    function modifierForPhysicalEvent(e) {
      var key = (e && e.key) || "";
      var code = (e && e.code) || "";
      if (key === "Shift" || code === "ShiftLeft" || code === "ShiftRight") return "shift";
      if (key === "Control" || code === "ControlLeft" || code === "ControlRight") return "ctrl";
      return null;
    }

    function physicalModifierToken(e) {
      if (e && e.code) return e.code;
      var key = (e && e.key) || "Modifier";
      var location = e && typeof e.location === "number" ? e.location : 0;
      return key + ":" + location;
    }

    function trackPhysicalModifier(e, isDown) {
      var modifier = modifierForPhysicalEvent(e);
      if (!modifier) return;
      var keySet = physicalModifierKeys[modifier];
      var token = physicalModifierToken(e);
      if (isDown) keySet.add(token);
      else keySet.delete(token);
      refreshModifierButtons(modifier);
      if (modifier === "shift") syncShiftStateToEmulator();
    }

    function clearPhysicalModifiers() {
      var hadShift = physicalModifierKeys.shift.size > 0;
      var hadCtrl = physicalModifierKeys.ctrl.size > 0;
      physicalModifierKeys.shift.clear();
      physicalModifierKeys.ctrl.clear();
      if (hadShift) refreshModifierButtons("shift");
      if (hadCtrl) refreshModifierButtons("ctrl");
      if (hadShift) syncShiftStateToEmulator();
    }

    function normalizePhysicalKeyEvent(e, isDown) {
      trackPhysicalModifier(e, isDown);
      if (modifierForPhysicalEvent(e) === "shift") return null;
      return {
        key: e.key,
        code: e.code || "",
        ctrlKey: !!e.ctrlKey || isModifierActive("ctrl"),
        shiftKey: !!e.shiftKey || isModifierActive("shift"),
      };
    }

    function shouldTrackGlobalModifierEvent() {
      var active = document.activeElement;
      if (active === canvas) return true;
      if (atariKeyboard && active && atariKeyboard.contains(active)) return true;
      return false;
    }

    function setCtrlModifier(active) {
      var next = !!active;
      if (virtualModifiers.ctrl === next) return;
      virtualModifiers.ctrl = next;
      refreshModifierButtons("ctrl");
    }

    function makeVirtualKeyEvent(key, code, shiftOverride, sdlSym) {
      var ev = {
        key: key,
        code: code || "",
        ctrlKey: isModifierActive("ctrl"),
        shiftKey: shiftOverride !== undefined ? !!shiftOverride : isModifierActive("shift"),
      };
      if (typeof sdlSym === "number" && isFinite(sdlSym)) ev.sdlSym = sdlSym | 0;
      return ev;
    }

    function syncShiftStateToEmulator() {
      if (!app || !app.onKeyDown || !app.onKeyUp) return;
      var next = isModifierActive("shift");
      if (next === emulatedShiftDown) return;
      emulatedShiftDown = next;
      var ev = makeVirtualKeyEvent("Shift", "ShiftLeft", next);
      if (next) app.onKeyDown(ev);
      else app.onKeyUp(ev);
    }

    function setShiftModifier(active) {
      var next = !!active;
      if (virtualModifiers.shift === next) return;
      virtualModifiers.shift = next;
      refreshModifierButtons("shift");
      syncShiftStateToEmulator();
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

    function makeJoystickEvent(key, code, sdlSym) {
      return {
        key: key,
        code: code,
        ctrlKey: false,
        shiftKey: false,
        sdlSym: sdlSym,
      };
    }

    function setJoystickDirection(up, down, left, right) {
      var next = {
        up: !!up,
        down: !!down,
        left: !!left,
        right: !!right,
      };
      var directionDefs = [
        { name: "up", key: "ArrowUp", code: "ArrowUp", sdlSym: 273 },
        { name: "down", key: "ArrowDown", code: "ArrowDown", sdlSym: 274 },
        { name: "left", key: "ArrowLeft", code: "ArrowLeft", sdlSym: 276 },
        { name: "right", key: "ArrowRight", code: "ArrowRight", sdlSym: 275 },
      ];
      directionDefs.forEach(function (entry) {
        var nextPressed = next[entry.name];
        if (joystickState[entry.name] === nextPressed) return;
        joystickState[entry.name] = nextPressed;
        var glow = joystickGlows[entry.name];
        if (glow) glow.classList.toggle("active", nextPressed);
        if (!app || !app.onKeyDown || !app.onKeyUp) return;
        var ev = makeJoystickEvent(entry.key, entry.code, entry.sdlSym);
        if (nextPressed) app.onKeyDown(ev);
        else app.onKeyUp(ev);
      });
    }

    function setJoystickFire(active) {
      var next = !!active;
      if (joystickState.fire === next) return;
      joystickState.fire = next;
      if (fireButton) fireButton.classList.toggle("active", next);
      if (!app || !app.onKeyDown || !app.onKeyUp) return;
      var ev = makeJoystickEvent("Alt", "AltLeft", 308);
      if (next) app.onKeyDown(ev);
      else app.onKeyUp(ev);
    }

    function getJoystickStickCenter() {
      if (!joystickArea) return { x: 0, y: 0 };
      var boot = joystickArea.querySelector(".cx40-boot");
      var rect = boot ? boot.getBoundingClientRect() : joystickArea.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }

    function updateJoystickStick(dx, dy) {
      if (!joystickStick) return;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > JOYSTICK_MAX_DEFLECT) {
        dx = (dx / distance) * JOYSTICK_MAX_DEFLECT;
        dy = (dy / distance) * JOYSTICK_MAX_DEFLECT;
      }
      joystickStick.style.transform = "translate(" + dx + "px, " + dy + "px)";
    }

    function resetJoystickStick() {
      if (joystickStick) joystickStick.style.transform = "";
      setJoystickDirection(false, false, false, false);
    }

    function processJoystickMove(clientX, clientY) {
      var dx = clientX - stickCenter.x;
      var dy = clientY - stickCenter.y;
      updateJoystickStick(dx, dy);
      setJoystickDirection(
        dy < -JOYSTICK_DEAD_ZONE,
        dy > JOYSTICK_DEAD_ZONE,
        dx < -JOYSTICK_DEAD_ZONE,
        dx > JOYSTICK_DEAD_ZONE
      );
    }

    function resetJoystickControls() {
      stickPointerId = null;
      firePointerId = null;
      if (joystickStick) joystickStick.classList.remove("grabbing");
      resetJoystickStick();
      setJoystickFire(false);
    }

    function setJoystickEnabled(active) {
      if (!btnJoystick || !joystickPanel) return;
      var enabled = !!active;
      btnJoystick.classList.toggle("active", enabled);
      joystickPanel.hidden = !enabled;

      var label = enabled
        ? "Hide the on-screen joystick controls."
        : "Show the on-screen joystick controls.";
      btnJoystick.title = label;
      btnJoystick.setAttribute("aria-label", label);

      if (!enabled) resetJoystickControls();
      resizeCrtCanvas();
      focusCanvas(true);
    }

    function resetKeyboardControls() {
      if (pressedVirtualKeysByPointer.size > 0) {
        Array.from(pressedVirtualKeysByPointer.keys()).forEach(function (pointerId) {
          releasePointerVirtualKey(pointerId);
        });
      }
      if (virtualModifiers.shift) setShiftModifier(false);
      if (virtualModifiers.ctrl) setCtrlModifier(false);
    }

    function setKeyboardEnabled(active) {
      if (!btnKeyboard || !keyboardPanel) return;
      var enabled = !!active;
      btnKeyboard.classList.toggle("active", enabled);
      keyboardPanel.hidden = !enabled;

      var label = enabled
        ? "Hide the on-screen keyboard controls."
        : "Show the on-screen keyboard controls.";
      btnKeyboard.title = label;
      btnKeyboard.setAttribute("aria-label", label);

      if (!enabled) resetKeyboardControls();
      resizeCrtCanvas();
      focusCanvas(true);
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
        focusCanvas(false);
      }
    });

    btnReset.addEventListener("click", function () {
      app.reset();
      updateStatus();
      focusCanvas(false);
    });

    if (btnFullscreen) {
      btnFullscreen.addEventListener("click", function () {
        var op = isViewportFullscreen() ? exitFullscreen() : requestFullscreen(screenViewport);
        Promise.resolve(op)
          .then(function () {
            updateFullscreenButton();
            resizeCrtCanvas();
            focusCanvas(false);
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

    if (btnJoystick && joystickPanel) {
      btnJoystick.addEventListener("click", function () {
        setJoystickEnabled(!btnJoystick.classList.contains("active"));
      });
    }

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
          focusCanvas(true);
          return;
        }
        if (modifier === "ctrl") {
          setCtrlModifier(!virtualModifiers.ctrl);
          flashVirtualKey(btn);
          focusCanvas(true);
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
        focusCanvas(true);
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

    if (joystickArea && joystickStick && fireButton) {
      joystickArea.addEventListener("pointerdown", function (e) {
        if (joystickPanel && joystickPanel.hidden) return;

        var target = e.target;
        var isFire = target === fireButton || (target.closest && target.closest(".cx40-fire-housing"));
        if (isFire) {
          if (firePointerId !== null) return;
          firePointerId = e.pointerId;
          setJoystickFire(true);
        } else {
          if (stickPointerId !== null) return;
          stickPointerId = e.pointerId;
          stickCenter = getJoystickStickCenter();
          joystickStick.classList.add("grabbing");
          processJoystickMove(e.clientX, e.clientY);
        }

        if (joystickArea.setPointerCapture) {
          try {
            joystickArea.setPointerCapture(e.pointerId);
          } catch (err) {
            // ignore capture errors
          }
        }
        e.preventDefault();
        focusCanvas(true);
      });

      joystickArea.addEventListener("pointermove", function (e) {
        if (e.pointerId !== stickPointerId) return;
        processJoystickMove(e.clientX, e.clientY);
        e.preventDefault();
      });

      function handleJoystickPointerEnd(e) {
        var changed = false;
        if (e.pointerId === stickPointerId) {
          stickPointerId = null;
          joystickStick.classList.remove("grabbing");
          resetJoystickStick();
          changed = true;
        }
        if (e.pointerId === firePointerId) {
          firePointerId = null;
          setJoystickFire(false);
          changed = true;
        }
        if (changed) {
          e.preventDefault();
          focusCanvas(true);
        }
      }

      joystickArea.addEventListener("pointerup", handleJoystickPointerEnd);
      joystickArea.addEventListener("pointercancel", handleJoystickPointerEnd);
      joystickArea.addEventListener("lostpointercapture", handleJoystickPointerEnd);
      document.addEventListener("pointerup", handleJoystickPointerEnd);
      document.addEventListener("pointercancel", handleJoystickPointerEnd);
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
      var ev = normalizePhysicalKeyEvent(e, true);
      if (!ev) {
        e.preventDefault();
        return;
      }
      if (app.onKeyDown(ev)) e.preventDefault();
    });
    canvas.addEventListener("keyup", function (e) {
      var ev = normalizePhysicalKeyEvent(e, false);
      if (!ev) {
        e.preventDefault();
        return;
      }
      if (app.onKeyUp(ev)) e.preventDefault();
    });
    window.addEventListener("keydown", function (e) {
      if (!shouldTrackGlobalModifierEvent()) return;
      trackPhysicalModifier(e, true);
    });
    window.addEventListener("keyup", function (e) {
      if (!shouldTrackGlobalModifierEvent()) return;
      trackPhysicalModifier(e, false);
    });
    canvas.addEventListener("blur", function () {
      clearPhysicalModifiers();
      if (app && app.releaseAllKeys) app.releaseAllKeys();
    });
    window.addEventListener("blur", function () {
      clearPhysicalModifiers();
      if (app && app.releaseAllKeys) app.releaseAllKeys();
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
    if (btnJoystick && joystickPanel) {
      setJoystickEnabled(btnJoystick.classList.contains("active"));
    }
    if (btnKeyboard && keyboardPanel) {
      var keyboardActive = !isMobile();
      btnKeyboard.classList.toggle("active", keyboardActive);
      setKeyboardEnabled(keyboardActive);
    }
  }

  window.A8EUI = { boot: boot };
})();
