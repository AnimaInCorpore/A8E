(function () {
  "use strict";

  let Util = window.A8EUtil;

  async function boot() {
    let canvas = document.getElementById("screen");
    let debugEl = document.getElementById("debug");
    canvas.tabIndex = 0;
    let nativeScreenW = canvas.width | 0;
    let nativeScreenH = canvas.height | 0;
    let screenViewport = canvas.parentElement;
    let layoutRoot =
      screenViewport && screenViewport.closest
        ? screenViewport.closest(".layout")
        : null;
    let keyboardPanel = document.getElementById("keyboardPanel");
    let joystickPanel = document.getElementById("joystickPanel");
    let app = null;
    let gl = null;
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

    let ctx2d = null;
    let crtCanvas = null;
    let onLayoutResize = null;
    let onCrtContextLost = null;
    let onCrtContextRestored = null;
    let onFullscreenChange = null;
    let didCleanup = false;

    function readFlexGapPx(el) {
      if (!el || !window.getComputedStyle) return 0;
      let st = window.getComputedStyle(el);
      let raw = st.rowGap && st.rowGap !== "normal" ? st.rowGap : st.gap;
      let parsed = parseFloat(raw || "0");
      return isFinite(parsed) ? Math.max(0, parsed) : 0;
    }

    function isPanelVisible(el) {
      return !!el && !el.hidden && el.getClientRects().length > 0;
    }

    function reservedPanelHeight(el) {
      if (!isPanelVisible(el)) return 0;
      let rect = el.getBoundingClientRect();
      return Math.max(
        0,
        Math.ceil(rect.height + readFlexGapPx(el.parentElement)),
      );
    }

    function resizeDisplayCanvas() {
      let viewport = screenViewport || canvas.parentElement;
      if (!viewport) return;
      let rect = viewport.getBoundingClientRect();
      let maxW = Math.max(1, Math.floor(rect.width || nativeScreenW));
      let aspect = nativeScreenW / nativeScreenH;
      let cssW = maxW;
      let cssH = Math.round(cssW / aspect);

      // In normal page layout, fit into both width and visible height while
      // reserving space only for joystick. Keyboard may be below visible area.
      // In fullscreen, fit only inside fullscreen viewport bounds.
      if (isViewportFullscreen()) {
        let vv = window.visualViewport;
        let visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
        let availableH = Math.floor(visibleBottom - rect.top - 8);
        let maxH = Math.max(
          1,
          availableH || Math.floor(rect.height || nativeScreenH),
        );
        if (cssH > maxH) {
          cssH = maxH;
          cssW = Math.round(cssH * aspect);
        }
      } else {
        let availableNormalH = 0;
        if (layoutRoot) {
          let layoutRect = layoutRoot.getBoundingClientRect();
          let topOffset = Math.max(0, rect.top - layoutRect.top);
          availableNormalH = Math.floor(
            layoutRoot.clientHeight - topOffset - 8,
          );
        } else {
          let vvNormal = window.visualViewport;
          let visibleBottomNormal = vvNormal
            ? vvNormal.offsetTop + vvNormal.height
            : window.innerHeight;
          availableNormalH = Math.floor(visibleBottomNormal - rect.top - 8);
        }
        availableNormalH -= reservedPanelHeight(joystickPanel);
        let normalMaxH = Math.max(
          1,
          availableNormalH || Math.floor(rect.height || nativeScreenH),
        );
        if (cssH > normalMaxH) {
          cssH = normalMaxH;
          cssW = Math.round(cssH * aspect);
        }
      }

      let nextW = Math.max(1, cssW) + "px";
      let nextH = Math.max(1, cssH) + "px";
      if (canvas.style.width !== nextW) canvas.style.width = nextW;
      if (canvas.style.height !== nextH) canvas.style.height = nextH;
    }

    function resizeCrtCanvas() {
      resizeDisplayCanvas();
      if (!gl) return;
      let dpr = window.devicePixelRatio || 1;
      let rect = canvas.getBoundingClientRect();
      let cssW = Math.max(1, Math.round(rect.width || nativeScreenW));
      let cssH = Math.max(1, Math.round(rect.height || nativeScreenH));
      let targetW = Math.max(nativeScreenW, Math.round(cssW * dpr));
      let targetH = Math.max(nativeScreenH, Math.round(cssH * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
    }

    function detachLayoutHooks() {
      if (!onLayoutResize) return;
      window.removeEventListener("resize", onLayoutResize);
      if (window.visualViewport)
        window.visualViewport.removeEventListener("resize", onLayoutResize);
      onLayoutResize = null;
    }

    function detachCrtHooks() {
      if (!crtCanvas) return;
      if (onCrtContextLost)
        crtCanvas.removeEventListener(
          "webglcontextlost",
          onCrtContextLost,
          false,
        );
      if (onCrtContextRestored)
        crtCanvas.removeEventListener(
          "webglcontextrestored",
          onCrtContextRestored,
          false,
        );
      crtCanvas = null;
      onCrtContextLost = null;
      onCrtContextRestored = null;
    }

    function isMobile() {
      return (
        window.innerWidth <= 980 ||
        (window.matchMedia && window.matchMedia("(max-width: 980px)").matches)
      );
    }

    function cleanup() {
      if (didCleanup) return;
      didCleanup = true;
      detachLayoutHooks();
      detachCrtHooks();
      if (onFullscreenChange) {
        document.removeEventListener("fullscreenchange", onFullscreenChange);
        document.removeEventListener(
          "webkitfullscreenchange",
          onFullscreenChange,
        );
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
      crtCanvas.addEventListener(
        "webglcontextrestored",
        onCrtContextRestored,
        false,
      );
    } else {
      canvas.classList.remove("crtEnabled");
      ctx2d = canvas.getContext("2d", { alpha: false });
    }

    onLayoutResize = resizeCrtCanvas;
    window.addEventListener("resize", onLayoutResize);
    if (window.visualViewport)
      window.visualViewport.addEventListener("resize", onLayoutResize);
    requestAnimationFrame(onLayoutResize);

    let btnStart = document.getElementById("btnStart");
    let btnReset = document.getElementById("btnReset");
    let btnFullscreen = document.getElementById("btnFullscreen");
    let btnTurbo = document.getElementById("btnTurbo");
    let btnSioTurbo = document.getElementById("btnSioTurbo");
    let btnAudio = document.getElementById("btnAudio");
    let btnJoystick = document.getElementById("btnJoystick");
    let btnKeyboard = document.getElementById("btnKeyboard");
    let btnOptionOnStart = document.getElementById("btnOptionOnStart");

    let romOs = document.getElementById("romOs");
    let romBasic = document.getElementById("romBasic");
    let disk1 = document.getElementById("disk1");
    let romOsStatus = document.getElementById("romOsStatus");
    let romBasicStatus = document.getElementById("romBasicStatus");
    let diskStatus = document.getElementById("diskStatus");
    let atariKeyboard = document.getElementById("atariKeyboard");
    let joystickArea = document.getElementById("joystickArea");
    let joystickStick = document.getElementById("joystickStick");
    let fireButton = document.getElementById("fireButton");
    let joystickGlows = {
      up: document.getElementById("glowUp"),
      down: document.getElementById("glowDown"),
      left: document.getElementById("glowLeft"),
      right: document.getElementById("glowRight"),
    };
    let virtualModifiers = {
      ctrl: false,
      shift: false,
    };
    let physicalModifierKeys = {
      ctrl: new Set(),
      shift: new Set(),
    };
    let emulatedShiftDown = false;
    let pressedVirtualKeysByPointer = new Map();
    let pressedPhysicalKeysByToken = new Map();
    let keyboardButtonsByCode = new Map();
    let keyboardButtonsByKey = new Map();
    let keyboardModifierButtons = {
      ctrl: [],
      shift: [],
    };
    let pressedButtonRefCount = new WeakMap();
    let pressedButtonsBySource = new Map();
    let flashTokenCounter = 0;
    let virtualTapTokenCounter = 0;
    let joystickState = {
      up: false,
      down: false,
      left: false,
      right: false,
      fire: false,
    };
    let stickPointerId = null;
    let firePointerId = null;
    let stickCenter = { x: 0, y: 0 };
    let JOYSTICK_MAX_DEFLECT = 20;
    let JOYSTICK_DEAD_ZONE = 5;
    let JOYSTICK_DIRECTION_UP = {
      name: "up",
      key: "ArrowUp",
      code: "ArrowUp",
      sdlSym: 273,
    };
    let JOYSTICK_DIRECTION_DOWN = {
      name: "down",
      key: "ArrowDown",
      code: "ArrowDown",
      sdlSym: 274,
    };
    let JOYSTICK_DIRECTION_LEFT = {
      name: "left",
      key: "ArrowLeft",
      code: "ArrowLeft",
      sdlSym: 276,
    };
    let JOYSTICK_DIRECTION_RIGHT = {
      name: "right",
      key: "ArrowRight",
      code: "ArrowRight",
      sdlSym: 275,
    };

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
        let parent = canvas.parentNode;
        if (parent) {
          let nextCanvas = canvas.cloneNode(false);
          nextCanvas.width = nativeScreenW;
          nextCanvas.height = nativeScreenH;
          nextCanvas.classList.remove("crtEnabled");
          parent.replaceChild(nextCanvas, canvas);
          canvas = nextCanvas;
          screenViewport = canvas.parentElement;
          layoutRoot =
            screenViewport && screenViewport.closest
              ? screenViewport.closest(".layout")
              : null;
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
          : "Start emulation and run the loaded Atari system.",
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
      return (
        document.fullscreenElement || document.webkitFullscreenElement || null
      );
    }

    function isViewportFullscreen() {
      return getFullscreenElement() === screenViewport;
    }

    function updateFullscreenButton() {
      if (!btnFullscreen) return;
      let active = isViewportFullscreen();
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
          : "Enter fullscreen mode for the emulator display area.",
      );
    }

    function addButtonLookupEntry(map, key, button) {
      if (!key || !button) return;
      let list = map.get(key);
      if (!list) {
        list = [];
        map.set(key, list);
      }
      list.push(button);
    }

    function normalizeKeyboardDataKey(key) {
      if (key === null || key === undefined) return "";
      let v = String(key);
      if (v === "Spacebar" || v === "Space") return " ";
      if (v.length === 1) return v.toLowerCase();
      return v;
    }

    function indexKeyboardButtons() {
      keyboardButtonsByCode.clear();
      keyboardButtonsByKey.clear();
      keyboardModifierButtons.ctrl.length = 0;
      keyboardModifierButtons.shift.length = 0;
      if (!atariKeyboard) return;
      let buttons = atariKeyboard.querySelectorAll("button.kbKey");
      buttons.forEach(function (button) {
        addButtonLookupEntry(
          keyboardButtonsByCode,
          button.getAttribute("data-code") || "",
          button,
        );
        addButtonLookupEntry(
          keyboardButtonsByKey,
          normalizeKeyboardDataKey(button.getAttribute("data-key")),
          button,
        );
        let modifier = button.getAttribute("data-modifier");
        if (modifier === "shift" || modifier === "ctrl") {
          keyboardModifierButtons[modifier].push(button);
        }
      });
    }

    function setButtonPressed(button, sourceToken, isDown) {
      if (!button || !sourceToken) return;
      let source = String(sourceToken);
      let sourceButtons = pressedButtonsBySource.get(source);
      if (isDown) {
        if (!sourceButtons) {
          sourceButtons = new Set();
          pressedButtonsBySource.set(source, sourceButtons);
        }
        if (sourceButtons.has(button)) return;
        sourceButtons.add(button);
        let nextCount = (pressedButtonRefCount.get(button) || 0) + 1;
        pressedButtonRefCount.set(button, nextCount);
        if (nextCount === 1) button.classList.add("pressed");
        return;
      }
      if (!sourceButtons || !sourceButtons.has(button)) return;
      sourceButtons.delete(button);
      if (sourceButtons.size === 0) pressedButtonsBySource.delete(source);
      let next = (pressedButtonRefCount.get(button) || 0) - 1;
      if (next <= 0) {
        pressedButtonRefCount.delete(button);
        button.classList.remove("pressed");
      } else {
        pressedButtonRefCount.set(button, next);
      }
    }

    function setButtonsPressed(buttons, sourceToken, isDown) {
      if (!buttons || !buttons.length) return;
      buttons.forEach(function (button) {
        setButtonPressed(button, sourceToken, isDown);
      });
    }

    function clearButtonPressSource(sourceToken) {
      if (!sourceToken) return;
      let source = String(sourceToken);
      let sourceButtons = pressedButtonsBySource.get(source);
      if (!sourceButtons || sourceButtons.size === 0) {
        pressedButtonsBySource.delete(source);
        return;
      }
      Array.from(sourceButtons).forEach(function (button) {
        setButtonPressed(button, source, false);
      });
    }

    function physicalKeyToken(e) {
      if (e && e.code) return e.code;
      let key = normalizeKeyboardDataKey((e && e.key) || "Unknown");
      let location = e && typeof e.location === "number" ? e.location : 0;
      return key + ":" + location;
    }

    function findButtonsForPhysicalEvent(e) {
      if (!atariKeyboard) return [];
      let modifier = modifierForPhysicalEvent(e);
      if (modifier === "shift" || modifier === "ctrl") return [];
      let code = (e && e.code) || "";
      if (code && keyboardButtonsByCode.has(code))
        return keyboardButtonsByCode.get(code);
      let key = normalizeKeyboardDataKey((e && e.key) || "");
      if (key && keyboardButtonsByKey.has(key))
        return keyboardButtonsByKey.get(key);
      return [];
    }

    function syncPhysicalKeyVisual(e, isDown) {
      let token = physicalKeyToken(e);
      let sourceToken = "physbtn:" + token;
      if (isDown) {
        if (pressedPhysicalKeysByToken.has(token)) return;
        let buttons = findButtonsForPhysicalEvent(e);
        if (!buttons.length) return;
        pressedPhysicalKeysByToken.set(token, buttons);
        setButtonsPressed(buttons, sourceToken, true);
        return;
      }
      if (!pressedPhysicalKeysByToken.has(token)) return;
      let prevButtons = pressedPhysicalKeysByToken.get(token) || [];
      pressedPhysicalKeysByToken.delete(token);
      setButtonsPressed(prevButtons, sourceToken, false);
    }

    function clearPhysicalKeyVisuals() {
      Array.from(pressedPhysicalKeysByToken.keys()).forEach(function (token) {
        let buttons = pressedPhysicalKeysByToken.get(token) || [];
        pressedPhysicalKeysByToken.delete(token);
        setButtonsPressed(buttons, "physbtn:" + token, false);
      });
    }

    function setModifierButtons(modifier, active) {
      if (!atariKeyboard) return;
      let buttons = keyboardModifierButtons[modifier] || [];
      buttons.forEach(function (button) {
        button.classList.toggle("active", active);
      });
    }

    function isModifierActive(modifier) {
      let heldPhysical =
        physicalModifierKeys[modifier] &&
        physicalModifierKeys[modifier].size > 0;
      return !!virtualModifiers[modifier] || heldPhysical;
    }

    function refreshModifierButtons(modifier) {
      setModifierButtons(modifier, isModifierActive(modifier));
    }

    function modifierForPhysicalEvent(e) {
      let key = (e && e.key) || "";
      let code = (e && e.code) || "";
      if (key === "Shift" || code === "ShiftLeft" || code === "ShiftRight")
        return "shift";
      if (
        key === "Control" ||
        code === "ControlLeft" ||
        code === "ControlRight"
      )
        return "ctrl";
      return null;
    }

    function physicalModifierToken(e) {
      if (e && e.code) return e.code;
      let key = (e && e.key) || "Modifier";
      let location = e && typeof e.location === "number" ? e.location : 0;
      return key + ":" + location;
    }

    function trackPhysicalModifier(e, isDown) {
      let modifier = modifierForPhysicalEvent(e);
      if (!modifier) return;
      let keySet = physicalModifierKeys[modifier];
      let token = physicalModifierToken(e);
      if (isDown) keySet.add(token);
      else keySet.delete(token);
      refreshModifierButtons(modifier);
      if (modifier === "shift") syncShiftStateToEmulator();
    }

    function clearPhysicalModifiers() {
      let hadShift = physicalModifierKeys.shift.size > 0;
      let hadCtrl = physicalModifierKeys.ctrl.size > 0;
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
        sourceToken: "phys:" + physicalKeyToken(e),
      };
    }

    function shouldTrackGlobalModifierEvent() {
      let active = document.activeElement;
      if (active === canvas) return true;
      if (atariKeyboard && active && atariKeyboard.contains(active))
        return true;
      return false;
    }

    function setCtrlModifier(active) {
      let next = !!active;
      if (virtualModifiers.ctrl === next) return;
      virtualModifiers.ctrl = next;
      refreshModifierButtons("ctrl");
    }

    function makeVirtualKeyEvent(
      key,
      code,
      shiftOverride,
      sdlSym,
      sourceToken,
    ) {
      let ev = {
        key: key,
        code: code || "",
        ctrlKey: isModifierActive("ctrl"),
        shiftKey:
          shiftOverride !== undefined
            ? !!shiftOverride
            : isModifierActive("shift"),
      };
      if (typeof sdlSym === "number" && isFinite(sdlSym))
        ev.sdlSym = sdlSym | 0;
      if (sourceToken !== undefined && sourceToken !== null)
        ev.sourceToken = String(sourceToken);
      return ev;
    }

    function syncShiftStateToEmulator() {
      if (!app || !app.onKeyDown || !app.onKeyUp) return;
      let next = isModifierActive("shift");
      if (next === emulatedShiftDown) return;
      emulatedShiftDown = next;
      let ev = makeVirtualKeyEvent(
        "Shift",
        "ShiftLeft",
        next,
        undefined,
        "modifier:shift",
      );
      if (next) app.onKeyDown(ev);
      else app.onKeyUp(ev);
    }

    function setShiftModifier(active) {
      let next = !!active;
      if (virtualModifiers.shift === next) return;
      virtualModifiers.shift = next;
      refreshModifierButtons("shift");
      syncShiftStateToEmulator();
    }

    function flashVirtualKey(btn, durationMs) {
      if (!btn) return;
      let sourceToken = "flash:" + ++flashTokenCounter;
      setButtonPressed(btn, sourceToken, true);
      window.setTimeout(function () {
        setButtonPressed(btn, sourceToken, false);
      }, durationMs || 120);
    }

    function pressVirtualKey(key, code, sdlSym) {
      if (!app || !app.onKeyDown || !app.onKeyUp) return;
      let ev = makeVirtualKeyEvent(
        key,
        code,
        undefined,
        sdlSym,
        "vktap:" + ++virtualTapTokenCounter,
      );
      app.onKeyDown(ev);
      app.onKeyUp(ev);
      if (virtualModifiers.shift) setShiftModifier(false);
      if (virtualModifiers.ctrl) setCtrlModifier(false);
    }

    function parseSdlSym(btn) {
      if (!btn) return null;
      let sdl = btn.getAttribute("data-sdl");
      if (!sdl) return null;
      let parsed = parseInt(sdl, 10);
      return isFinite(parsed) ? parsed : null;
    }

    function releasePointerVirtualKey(pointerId) {
      if (!pressedVirtualKeysByPointer.has(pointerId)) return;
      let st = pressedVirtualKeysByPointer.get(pointerId);
      pressedVirtualKeysByPointer.delete(pointerId);
      clearButtonPressSource(st.sourceToken);
      if (app && app.onKeyUp) {
        app.onKeyUp(
          makeVirtualKeyEvent(
            st.key,
            st.code,
            undefined,
            st.sdlSym,
            st.sourceToken,
          ),
        );
      }
      if (st.consumeShift && virtualModifiers.shift) setShiftModifier(false);
      if (st.consumeCtrl && virtualModifiers.ctrl) setCtrlModifier(false);
    }

    function makeJoystickEvent(key, code, sdlSym, sourceToken) {
      return {
        key: key,
        code: code,
        ctrlKey: false,
        shiftKey: false,
        sdlSym: sdlSym,
        sourceToken: sourceToken,
      };
    }

    function setSingleJoystickDirection(def, nextPressed) {
      if (joystickState[def.name] === nextPressed) return;
      joystickState[def.name] = nextPressed;
      let glow = joystickGlows[def.name];
      if (glow) glow.classList.toggle("active", nextPressed);
      if (!app || !app.onKeyDown || !app.onKeyUp) return;
      let ev = makeJoystickEvent(
        def.key,
        def.code,
        def.sdlSym,
        "joy:" + def.name,
      );
      if (nextPressed) app.onKeyDown(ev);
      else app.onKeyUp(ev);
    }

    function setJoystickDirection(up, down, left, right) {
      setSingleJoystickDirection(JOYSTICK_DIRECTION_UP, !!up);
      setSingleJoystickDirection(JOYSTICK_DIRECTION_DOWN, !!down);
      setSingleJoystickDirection(JOYSTICK_DIRECTION_LEFT, !!left);
      setSingleJoystickDirection(JOYSTICK_DIRECTION_RIGHT, !!right);
    }

    function setJoystickFire(active) {
      let next = !!active;
      if (joystickState.fire === next) return;
      joystickState.fire = next;
      if (fireButton) fireButton.classList.toggle("active", next);
      if (!app || !app.onKeyDown || !app.onKeyUp) return;
      let ev = makeJoystickEvent("Alt", "AltLeft", 308, "joy:fire");
      if (next) app.onKeyDown(ev);
      else app.onKeyUp(ev);
    }

    function getJoystickStickCenter() {
      if (!joystickArea) return { x: 0, y: 0 };
      let boot = joystickArea.querySelector(".cx40-boot");
      let rect = boot
        ? boot.getBoundingClientRect()
        : joystickArea.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }

    function updateJoystickStick(dx, dy) {
      if (!joystickStick) return;
      let distance = Math.sqrt(dx * dx + dy * dy);
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
      let dx = clientX - stickCenter.x;
      let dy = clientY - stickCenter.y;
      updateJoystickStick(dx, dy);
      setJoystickDirection(
        dy < -JOYSTICK_DEAD_ZONE,
        dy > JOYSTICK_DEAD_ZONE,
        dx < -JOYSTICK_DEAD_ZONE,
        dx > JOYSTICK_DEAD_ZONE,
      );
    }

    function handleJoystickPointerMove(e) {
      if (e.pointerId !== stickPointerId) return;
      processJoystickMove(e.clientX, e.clientY);
      e.preventDefault();
    }

    function resetJoystickControls() {
      stickPointerId = null;
      firePointerId = null;
      if (joystickStick) joystickStick.classList.remove("grabbing");
      resetJoystickStick();
      setJoystickFire(false);
    }

    function endJoystickPointer(pointerId) {
      let changed = false;
      if (pointerId === stickPointerId) {
        stickPointerId = null;
        if (joystickStick) joystickStick.classList.remove("grabbing");
        resetJoystickStick();
        changed = true;
      }
      if (pointerId === firePointerId) {
        firePointerId = null;
        setJoystickFire(false);
        changed = true;
      }
      return changed;
    }

    function setJoystickEnabled(active) {
      if (!btnJoystick || !joystickPanel) return;
      let enabled = !!active;
      btnJoystick.classList.toggle("active", enabled);
      joystickPanel.hidden = !enabled;

      let label = enabled
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
        Array.from(pressedVirtualKeysByPointer.keys()).forEach(
          function (pointerId) {
            releasePointerVirtualKey(pointerId);
          },
        );
      }
      if (virtualModifiers.shift) setShiftModifier(false);
      if (virtualModifiers.ctrl) setCtrlModifier(false);
    }

    function setKeyboardEnabled(active) {
      if (!btnKeyboard || !keyboardPanel) return;
      let enabled = !!active;
      btnKeyboard.classList.toggle("active", enabled);
      keyboardPanel.hidden = !enabled;

      let label = enabled
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
      return Promise.reject(
        new Error("Fullscreen is not supported in this browser."),
      );
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

    function bindToggleButton(btn, onToggle) {
      if (!btn) return;
      btn.addEventListener("click", function () {
        let active = btn.classList.toggle("active");
        onToggle(active);
      });
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
        let op = isViewportFullscreen()
          ? exitFullscreen()
          : requestFullscreen(screenViewport);
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

    bindToggleButton(btnTurbo, function (active) {
      app.setTurbo(active);
    });
    bindToggleButton(btnSioTurbo, function (active) {
      app.setSioTurbo(active);
    });
    bindToggleButton(btnAudio, function (active) {
      app.setAudioEnabled(active);
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

    bindToggleButton(btnOptionOnStart, function (active) {
      app.setOptionOnStart(active);
    });

    function getKeyboardButtonFromTarget(target) {
      if (!atariKeyboard || !target || !target.closest) return null;
      let btn = target.closest("button.kbKey");
      if (!btn || !atariKeyboard.contains(btn)) return null;
      return btn;
    }

    function applyModifierButton(modifier, btn) {
      if (modifier === "shift") {
        setShiftModifier(!virtualModifiers.shift);
        flashVirtualKey(btn);
        return true;
      }
      if (modifier === "ctrl") {
        setCtrlModifier(!virtualModifiers.ctrl);
        flashVirtualKey(btn);
        return true;
      }
      return false;
    }

    function onKeyboardPointerDown(e) {
      let btn = getKeyboardButtonFromTarget(e.target);
      if (!btn) return;
      if (keyboardPanel && keyboardPanel.hidden) return;

      if (applyModifierButton(btn.getAttribute("data-modifier"), btn)) {
        focusCanvas(true);
        return;
      }

      let key = btn.getAttribute("data-key");
      if (!key) return;
      let code = btn.getAttribute("data-code") || "";
      let sdlSym = parseSdlSym(btn);

      e.preventDefault();
      if (btn.setPointerCapture) {
        try {
          btn.setPointerCapture(e.pointerId);
        } catch (err) {
          // ignore capture errors
        }
      }

      releasePointerVirtualKey(e.pointerId);
      let sourceToken = "vkptr:" + e.pointerId;
      setButtonPressed(btn, sourceToken, true);
      if (app && app.onKeyDown) {
        app.onKeyDown(
          makeVirtualKeyEvent(key, code, undefined, sdlSym, sourceToken),
        );
      }
      pressedVirtualKeysByPointer.set(e.pointerId, {
        btn: btn,
        key: key,
        code: code,
        sdlSym: sdlSym,
        sourceToken: sourceToken,
        consumeShift: virtualModifiers.shift,
        consumeCtrl: virtualModifiers.ctrl,
      });
      focusCanvas(true);
    }

    function onKeyboardPointerLeave(e) {
      if ((e.buttons | 0) === 0) releasePointerVirtualKey(e.pointerId);
    }

    function onKeyboardAccessibilityKeyDown(e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      let btn = getKeyboardButtonFromTarget(e.target);
      if (!btn) return;
      if (applyModifierButton(btn.getAttribute("data-modifier"), btn)) {
        e.preventDefault();
        return;
      }
      let key = btn.getAttribute("data-key");
      if (!key) return;
      pressVirtualKey(key, btn.getAttribute("data-code") || "", parseSdlSym(btn));
      flashVirtualKey(btn, 80);
      e.preventDefault();
    }

    if (atariKeyboard) {
      indexKeyboardButtons();
      atariKeyboard.addEventListener("pointerdown", onKeyboardPointerDown);
      atariKeyboard.addEventListener("pointerleave", onKeyboardPointerLeave);
      // Keyboard accessibility fallback for focused on-screen key buttons.
      atariKeyboard.addEventListener("keydown", onKeyboardAccessibilityKeyDown);
    }

    function onJoystickPointerDown(e) {
      if (joystickPanel && joystickPanel.hidden) return;

      let target = e.target;
      let isFire =
        target === fireButton ||
        (target.closest && target.closest(".cx40-fire-housing"));
      if (isFire) {
        if (firePointerId !== null) return;
        firePointerId = e.pointerId;
        setJoystickFire(true);
      } else {
        if (stickPointerId !== null) return;
        stickPointerId = e.pointerId;
        stickCenter = getJoystickStickCenter();
        if (joystickStick) joystickStick.classList.add("grabbing");
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
    }

    function onJoystickPointerEnd(e) {
      if (!endJoystickPointer(e.pointerId)) return;
      e.preventDefault();
      focusCanvas(true);
    }

    function onGlobalPointerEnd(e) {
      releasePointerVirtualKey(e.pointerId);
      if (endJoystickPointer(e.pointerId)) {
        e.preventDefault();
        focusCanvas(true);
      }
    }

    if (joystickArea && joystickStick && fireButton) {
      joystickArea.addEventListener("pointerdown", onJoystickPointerDown);
      joystickArea.addEventListener("pointermove", handleJoystickPointerMove);
      joystickArea.addEventListener(
        "lostpointercapture",
        onJoystickPointerEnd,
      );
    }

    if (atariKeyboard || joystickArea) {
      document.addEventListener("pointerup", onGlobalPointerEnd);
      document.addEventListener("pointercancel", onGlobalPointerEnd);
    }

    function attachFileInput(inputEl, handler) {
      if (!inputEl) return;
      inputEl.addEventListener("change", function () {
        let file = inputEl.files && inputEl.files[0];
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
    function onCanvasKeyDown(e) {
      syncPhysicalKeyVisual(e, true);
      let ev = normalizePhysicalKeyEvent(e, true);
      if (!ev) {
        e.preventDefault();
        return;
      }
      if (app.onKeyDown(ev)) e.preventDefault();
    }

    function onCanvasKeyUp(e) {
      syncPhysicalKeyVisual(e, false);
      let ev = normalizePhysicalKeyEvent(e, false);
      if (!ev) {
        e.preventDefault();
        return;
      }
      if (app.onKeyUp(ev)) e.preventDefault();
    }

    function onWindowModifierKeyDown(e) {
      if (!shouldTrackGlobalModifierEvent()) return;
      trackPhysicalModifier(e, true);
    }

    function onWindowModifierKeyUp(e) {
      if (!shouldTrackGlobalModifierEvent()) return;
      trackPhysicalModifier(e, false);
    }

    function releaseInputState() {
      clearPhysicalModifiers();
      clearPhysicalKeyVisuals();
      resetKeyboardControls();
      if (app && app.releaseAllKeys) app.releaseAllKeys();
    }

    canvas.addEventListener("keydown", onCanvasKeyDown);
    canvas.addEventListener("keyup", onCanvasKeyUp);
    window.addEventListener("keydown", onWindowModifierKeyDown);
    window.addEventListener("keyup", onWindowModifierKeyUp);
    canvas.addEventListener("blur", releaseInputState);
    window.addEventListener("blur", releaseInputState);

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
      let keyboardActive = !isMobile();
      btnKeyboard.classList.toggle("active", keyboardActive);
      setKeyboardEnabled(keyboardActive);
    }
  }

  window.A8EUI = { boot: boot };
})();
