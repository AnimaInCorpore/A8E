(function () {
  "use strict";

  const Util = window.A8EUtil;

  async function boot() {
    let canvas = document.getElementById("screen");
    const debugEl = document.getElementById("debug");
    canvas.tabIndex = 0;
    const nativeScreenW = canvas.width | 0;
    const nativeScreenH = canvas.height | 0;
    let screenViewport = canvas.parentElement;
    let layoutRoot =
      screenViewport && screenViewport.closest
        ? screenViewport.closest(".layout")
        : null;
    const keyboardPanel = document.getElementById("keyboardPanel");
    const joystickPanel = document.getElementById("joystickPanel");
    let app = null;
    const useWorkerApp =
      window.A8EApp &&
      typeof window.A8EApp.supportsWorker === "function" &&
      window.A8EApp.supportsWorker();
    let gl = null;
    if (!useWorkerApp) {
      try {
        gl =
          canvas.getContext("webgl2", {
            alpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
            desynchronized: true,
          }) ||
          canvas.getContext("webgl", {
            alpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            powerPreference: "high-performance",
            desynchronized: true,
          }) ||
          canvas.getContext("experimental-webgl", {
            alpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            desynchronized: true,
          });
      } catch {
        gl = null;
      }
    }

    let ctx2d = null;
    let crtCanvas = null;
    let onLayoutResize = null;
    let onPostLayoutResize = null;
    let onCrtContextLost = null;
    let onCrtContextRestored = null;
    let onFullscreenChange = null;
    let didCleanup = false;
    let workerRenderWidth = 0;
    let workerRenderHeight = 0;

    function readFlexGapPx(el) {
      if (!el || !window.getComputedStyle) return 0;
      const st = window.getComputedStyle(el);
      const raw = st.rowGap && st.rowGap !== "normal" ? st.rowGap : st.gap;
      const parsed = parseFloat(raw || "0");
      return isFinite(parsed) ? Math.max(0, parsed) : 0;
    }

    function isPanelVisible(el) {
      return !!el && !el.hidden && el.getClientRects().length > 0;
    }

    function reservedPanelHeight(el) {
      if (!isPanelVisible(el)) return 0;
      const rect = el.getBoundingClientRect();
      return Math.max(
        0,
        Math.ceil(rect.height + readFlexGapPx(el.parentElement)),
      );
    }

    function resizeDisplayCanvas() {
      const viewport = screenViewport || canvas.parentElement;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const maxW = Math.max(1, Math.floor(rect.width || nativeScreenW));
      const aspect = nativeScreenW / nativeScreenH;
      let cssW = maxW;
      let cssH = Math.round(cssW / aspect);

      // In normal page layout, fit into both width and visible height while
      // reserving space only for joystick. Keyboard may be below visible area.
      // In fullscreen, fit only inside fullscreen viewport bounds.
      if (isViewportFullscreen()) {
        const vv = window.visualViewport;
        const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
        const availableH = Math.floor(visibleBottom - rect.top - 8);
        const maxH = Math.max(
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
          const layoutRect = layoutRoot.getBoundingClientRect();
          const topOffset = Math.max(0, rect.top - layoutRect.top);
          availableNormalH = Math.floor(
            layoutRoot.clientHeight - topOffset - 8,
          );
        } else {
          const vvNormal = window.visualViewport;
          const visibleBottomNormal = vvNormal
            ? vvNormal.offsetTop + vvNormal.height
            : window.innerHeight;
          availableNormalH = Math.floor(visibleBottomNormal - rect.top - 8);
        }
        availableNormalH -= reservedPanelHeight(joystickPanel);
        const normalMaxH = Math.max(
          1,
          availableNormalH || Math.floor(rect.height || nativeScreenH),
        );
        if (cssH > normalMaxH) {
          cssH = normalMaxH;
          cssW = Math.round(cssH * aspect);
        }
      }

      const nextW = Math.max(1, cssW) + "px";
      const nextH = Math.max(1, cssH) + "px";
      if (canvas.style.width !== nextW) canvas.style.width = nextW;
      if (canvas.style.height !== nextH) canvas.style.height = nextH;
    }

    function resizeCrtCanvas() {
      resizeDisplayCanvas();
      if (!gl && !useWorkerApp) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(rect.width || nativeScreenW));
      const cssH = Math.max(1, Math.round(rect.height || nativeScreenH));
      const targetW = Math.max(nativeScreenW, Math.round(cssW * dpr));
      const targetH = Math.max(nativeScreenH, Math.round(cssH * dpr));
      if (useWorkerApp) {
        if (
          app &&
          typeof app.setRenderSize === "function" &&
          (workerRenderWidth !== targetW || workerRenderHeight !== targetH)
        ) {
          workerRenderWidth = targetW;
          workerRenderHeight = targetH;
          app.setRenderSize(targetW, targetH);
        }
        return;
      }
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        if (app && typeof app.setRenderSize === "function")
          {app.setRenderSize(targetW, targetH);}
      }
    }

    function detachLayoutHooks() {
      if (!onLayoutResize) return;
      window.removeEventListener("resize", onLayoutResize);
      if (window.visualViewport)
        {window.visualViewport.removeEventListener("resize", onLayoutResize);}
      onLayoutResize = null;
    }

    function detachCrtHooks() {
      if (!crtCanvas) return;
      if (onCrtContextLost)
        {crtCanvas.removeEventListener(
          "webglcontextlost",
          onCrtContextLost,
          false,
        );}
      if (onCrtContextRestored)
        {crtCanvas.removeEventListener(
          "webglcontextrestored",
          onCrtContextRestored,
          false,
        );}
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

    if (useWorkerApp) {
      canvas.classList.add("crtEnabled");
    } else if (gl) {
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

    onLayoutResize = function () {
      resizeCrtCanvas();
      if (onPostLayoutResize) onPostLayoutResize();
    };
    window.addEventListener("resize", onLayoutResize);
    if (window.visualViewport)
      {window.visualViewport.addEventListener("resize", onLayoutResize);}
    requestAnimationFrame(onLayoutResize);

    const btnStart = document.getElementById("btnStart");
    const btnReset = document.getElementById("btnReset");
    const btnFullscreen = document.getElementById("btnFullscreen");
    const btnTurbo = document.getElementById("btnTurbo");
    const btnSioTurbo = document.getElementById("btnSioTurbo");
    const btnAudio = document.getElementById("btnAudio");
    const btnJoystick = document.getElementById("btnJoystick");
    const btnKeyboard = document.getElementById("btnKeyboard");
    const btnKeyboardMap = document.getElementById("btnKeyboardMap");
    const btnOptionOnStart = document.getElementById("btnOptionOnStart");

    function getKeyboardMappingModeFromUi() {
      if (!btnKeyboardMap) return "translated";
      return btnKeyboardMap.classList.contains("active")
        ? "translated"
        : "original";
    }

    const romOs = document.getElementById("romOs");
    const romBasic = document.getElementById("romBasic");
    const disk1 = document.getElementById("disk1");
    const romOsStatus = document.getElementById("romOsStatus");
    const romBasicStatus = document.getElementById("romBasicStatus");
    const diskStatus = document.getElementById("diskStatus");
    const atariKeyboard = document.getElementById("atariKeyboard");
    const joystickArea = document.getElementById("joystickArea");
    const joystickStick = document.getElementById("joystickStick");
    const fireButton = document.getElementById("fireButton");
    const joystickGlows = {
      up: document.getElementById("glowUp"),
      down: document.getElementById("glowDown"),
      left: document.getElementById("glowLeft"),
      right: document.getElementById("glowRight"),
    };
    const virtualModifiers = {
      ctrl: false,
      shift: false,
    };
    const physicalModifierKeys = {
      ctrl: new Set(),
      shift: new Set(),
    };
    let emulatedShiftDown = false;
    const pressedVirtualKeysByPointer = new Map();
    const pressedPhysicalKeysByToken = new Map();
    const keyboardButtonsByCode = new Map();
    const keyboardButtonsByKey = new Map();
    const keyboardModifierButtons = {
      ctrl: [],
      shift: [],
    };
    const pressedButtonRefCount = new WeakMap();
    const pressedButtonsBySource = new Map();
    let keyboardScaleCheckQueued = false;
    let keyboardScaleMismatchLogged = false;
    let flashTokenCounter = 0;
    let virtualTapTokenCounter = 0;
    const joystickState = {
      up: false,
      down: false,
      left: false,
      right: false,
      fire: false,
    };
    let stickPointerId = null;
    let firePointerId = null;
    let stickCenter = { x: 0, y: 0 };
    const JOYSTICK_MAX_DEFLECT = 20;
    const JOYSTICK_DEAD_ZONE = 5;
    const JOYSTICK_DIRECTION_UP = {
      name: "up",
      key: "ArrowUp",
      code: "ArrowUp",
      sdlSym: 273,
    };
    const JOYSTICK_DIRECTION_DOWN = {
      name: "down",
      key: "ArrowDown",
      code: "ArrowDown",
      sdlSym: 274,
    };
    const JOYSTICK_DIRECTION_LEFT = {
      name: "left",
      key: "ArrowLeft",
      code: "ArrowLeft",
      sdlSym: 276,
    };
    const JOYSTICK_DIRECTION_RIGHT = {
      name: "right",
      key: "ArrowRight",
      code: "ArrowRight",
      sdlSym: 275,
    };

    function parseKeyboardRowWeight(el) {
      if (!el) return 1;
      let parsed = NaN;
      if (el.style && typeof el.style.getPropertyValue === "function") {
        parsed = parseFloat(el.style.getPropertyValue("--w") || "");
      }
      if ((!isFinite(parsed) || parsed <= 0) && window.getComputedStyle) {
        parsed = parseFloat(
          window.getComputedStyle(el).getPropertyValue("--w") || "",
        );
      }
      return isFinite(parsed) && parsed > 0 ? parsed : 1;
    }

    function logKeyboardScaleMismatch(details) {
      if (keyboardScaleMismatchLogged) return;
      keyboardScaleMismatchLogged = true;
      console.warn(
        "[A8E] Keyboard CSS scaling inconsistency detected:",
        details,
      );
    }

    function syncSideKeyWidthToMainUnit() {
      if (!atariKeyboard) return;
      const mainKey = atariKeyboard.querySelector(".main .row .key");
      if (!mainKey) return;
      const mainW = mainKey.getBoundingClientRect().width;
      if (!(mainW > 0)) return;
      atariKeyboard.style.setProperty(
        "--side-key-w",
        Math.round(mainW * 100) / 100 + "px",
      );
    }

    function checkKeyboardCssScalingConsistency() {
      if (!atariKeyboard || !window.getComputedStyle) return;
      if (!isPanelVisible(keyboardPanel)) return;
      syncSideKeyWidthToMainUnit();

      const rows = Array.from(atariKeyboard.querySelectorAll(".main .row"));
      if (rows.length < 2) return;

      const rowStats = [];
      rows.forEach(function (row, index) {
        const items = Array.from(row.children).filter(function (child) {
          if (!child.classList) return false;
          return (
            child.classList.contains("key") || child.classList.contains("spacer")
          );
        });
        if (items.length < 10) return;

        let totalWeight = 0;
        items.forEach(function (item) {
          totalWeight += parseKeyboardRowWeight(item);
        });
        if (!(totalWeight > 0)) return;

        const rowRect = row.getBoundingClientRect();
        if (!(rowRect.width > 0)) return;
        const st = window.getComputedStyle(row);
        const gapPx = Math.max(
          0,
          parseFloat(st.columnGap || st.gap || "0") || 0,
        );
        const usableWidth =
          rowRect.width - gapPx * Math.max(0, items.length - 1);
        if (!(usableWidth > 0)) return;

        rowStats.push({
          row: index + 1,
          totalWeight: totalWeight,
          unitPx: usableWidth / totalWeight,
        });
      });
      if (rowStats.length < 2) return;

      const reference = rowStats[0];
      const weightDrift = [];
      const unitDrift = [];
      for (let i = 1; i < rowStats.length; i++) {
        const row = rowStats[i];
        if (Math.abs(row.totalWeight - reference.totalWeight) > 0.01)
          {weightDrift.push(row.row);}
        if (Math.abs(row.unitPx - reference.unitPx) > 0.75)
          {unitDrift.push(row.row);}
      }

      let sideHeightDrift = false;
      const mainKey = atariKeyboard.querySelector(".main .row .key");
      const sideKey = atariKeyboard.querySelector(".side-key");
      if (mainKey && sideKey) {
        const mainH = mainKey.getBoundingClientRect().height;
        const sideH = sideKey.getBoundingClientRect().height;
        sideHeightDrift = Math.abs(mainH - sideH) > 1;
      }

      const mismatch =
        weightDrift.length > 0 || unitDrift.length > 0 || sideHeightDrift;
      if (mismatch) {
        logKeyboardScaleMismatch({
          weightRows: weightDrift,
          unitRows: unitDrift,
          sideHeight: sideHeightDrift,
        });
      }
    }

    function queueKeyboardScaleConsistencyCheck() {
      if (keyboardScaleCheckQueued) return;
      keyboardScaleCheckQueued = true;
      requestAnimationFrame(function () {
        keyboardScaleCheckQueued = false;
        checkKeyboardCssScalingConsistency();
      });
    }

    onPostLayoutResize = queueKeyboardScaleConsistencyCheck;

    if (
      !useWorkerApp &&
      gl &&
      window.A8EGlRenderer &&
      window.A8EGlRenderer.loadShaderSources
    ) {
      try {
        await window.A8EGlRenderer.loadShaderSources();
      } catch {
        // create() will fail and trigger the existing 2D fallback path below.
      }
    }

    if (useWorkerApp) {
      app = window.A8EApp.create({
        canvas: canvas,
        gl: null,
        ctx2d: null,
        debugEl: debugEl,
        audioEnabled: btnAudio.classList.contains("active"),
        turbo: btnTurbo.classList.contains("active"),
        sioTurbo: btnSioTurbo.classList.contains("active"),
        optionOnStart: btnOptionOnStart.classList.contains("active"),
        keyboardMappingMode: getKeyboardMappingModeFromUi(),
      });
      resizeCrtCanvas();
    } else {
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
          keyboardMappingMode: getKeyboardMappingModeFromUi(),
        });
      } catch (e) {
        // If WebGL init succeeded but shader/program setup failed, fall back to 2D by replacing the canvas.
        if (gl && !ctx2d) {
          detachCrtHooks();
          const parent = canvas.parentNode;
          if (parent) {
            const nextCanvas = canvas.cloneNode(false);
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
              keyboardMappingMode: getKeyboardMappingModeFromUi(),
            });
            resizeCrtCanvas();
          } else {
            throw e;
          }
        } else {
          throw e;
        }
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
      } catch {
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
      const active = isViewportFullscreen();
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
      const v = String(key);
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
      const buttons = atariKeyboard.querySelectorAll("button.kbKey");
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
        const modifier = button.getAttribute("data-modifier");
        if (modifier === "shift" || modifier === "ctrl") {
          keyboardModifierButtons[modifier].push(button);
        }
      });
    }

    function setButtonPressed(button, sourceToken, isDown) {
      if (!button || !sourceToken) return;
      const source = String(sourceToken);
      let sourceButtons = pressedButtonsBySource.get(source);
      if (isDown) {
        if (!sourceButtons) {
          sourceButtons = new Set();
          pressedButtonsBySource.set(source, sourceButtons);
        }
        if (sourceButtons.has(button)) return;
        sourceButtons.add(button);
        const nextCount = (pressedButtonRefCount.get(button) || 0) + 1;
        pressedButtonRefCount.set(button, nextCount);
        if (nextCount === 1) button.classList.add("pressed");
        return;
      }
      if (!sourceButtons || !sourceButtons.has(button)) return;
      sourceButtons.delete(button);
      if (sourceButtons.size === 0) pressedButtonsBySource.delete(source);
      const next = (pressedButtonRefCount.get(button) || 0) - 1;
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
      const source = String(sourceToken);
      const sourceButtons = pressedButtonsBySource.get(source);
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
      const key = normalizeKeyboardDataKey((e && e.key) || "Unknown");
      const location = e && typeof e.location === "number" ? e.location : 0;
      return key + ":" + location;
    }

    function findButtonsForPhysicalEvent(e) {
      if (!atariKeyboard) return [];
      const modifier = modifierForPhysicalEvent(e);
      if (modifier === "shift" || modifier === "ctrl") return [];
      const code = (e && e.code) || "";
      if (code && keyboardButtonsByCode.has(code))
        {return keyboardButtonsByCode.get(code);}
      const key = normalizeKeyboardDataKey((e && e.key) || "");
      if (key && keyboardButtonsByKey.has(key))
        {return keyboardButtonsByKey.get(key);}
      return [];
    }

    function syncPhysicalKeyVisual(e, isDown) {
      const token = physicalKeyToken(e);
      const sourceToken = "physbtn:" + token;
      if (isDown) {
        if (pressedPhysicalKeysByToken.has(token)) return;
        const buttons = findButtonsForPhysicalEvent(e);
        if (!buttons.length) return;
        pressedPhysicalKeysByToken.set(token, buttons);
        setButtonsPressed(buttons, sourceToken, true);
        return;
      }
      if (!pressedPhysicalKeysByToken.has(token)) return;
      const prevButtons = pressedPhysicalKeysByToken.get(token) || [];
      pressedPhysicalKeysByToken.delete(token);
      setButtonsPressed(prevButtons, sourceToken, false);
    }

    function clearPhysicalKeyVisuals() {
      Array.from(pressedPhysicalKeysByToken.keys()).forEach(function (token) {
        const buttons = pressedPhysicalKeysByToken.get(token) || [];
        pressedPhysicalKeysByToken.delete(token);
        setButtonsPressed(buttons, "physbtn:" + token, false);
      });
    }

    function setModifierButtons(modifier, active) {
      if (!atariKeyboard) return;
      const buttons = keyboardModifierButtons[modifier] || [];
      buttons.forEach(function (button) {
        button.classList.toggle("active", active);
      });
    }

    function isModifierActive(modifier) {
      const heldPhysical =
        physicalModifierKeys[modifier] &&
        physicalModifierKeys[modifier].size > 0;
      return !!virtualModifiers[modifier] || heldPhysical;
    }

    function refreshModifierButtons(modifier) {
      setModifierButtons(modifier, isModifierActive(modifier));
    }

    function modifierForPhysicalEvent(e) {
      const key = (e && e.key) || "";
      const code = (e && e.code) || "";
      if (key === "Shift" || code === "ShiftLeft" || code === "ShiftRight")
        {return "shift";}
      if (
        key === "Control" ||
        code === "ControlLeft" ||
        code === "ControlRight"
      )
        {return "ctrl";}
      return null;
    }

    function physicalModifierToken(e) {
      if (e && e.code) return e.code;
      const key = (e && e.key) || "Modifier";
      const location = e && typeof e.location === "number" ? e.location : 0;
      return key + ":" + location;
    }

    function trackPhysicalModifier(e, isDown) {
      const modifier = modifierForPhysicalEvent(e);
      if (!modifier) return;
      const keySet = physicalModifierKeys[modifier];
      const token = physicalModifierToken(e);
      if (isDown) keySet.add(token);
      else keySet.delete(token);
      refreshModifierButtons(modifier);
      if (modifier === "shift") syncShiftStateToEmulator();
    }

    function clearPhysicalModifiers() {
      const hadShift = physicalModifierKeys.shift.size > 0;
      const hadCtrl = physicalModifierKeys.ctrl.size > 0;
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
        altGraph: !!(
          e &&
          typeof e.getModifierState === "function" &&
          e.getModifierState("AltGraph")
        ),
        ctrlKey: !!e.ctrlKey || isModifierActive("ctrl"),
        shiftKey: !!e.shiftKey || isModifierActive("shift"),
        sourceToken: "phys:" + physicalKeyToken(e),
      };
    }

    function shouldTrackGlobalModifierEvent() {
      const active = document.activeElement;
      if (active === canvas) return true;
      if (atariKeyboard && active && atariKeyboard.contains(active))
        {return true;}
      return false;
    }

    function setCtrlModifier(active) {
      const next = !!active;
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
      const ev = {
        key: key,
        code: code || "",
        // Virtual key presses should be deterministic and only depend on
        // virtual modifier toggles, not currently held physical modifiers.
        ctrlKey: !!virtualModifiers.ctrl,
        shiftKey:
          shiftOverride !== undefined
            ? !!shiftOverride
            : !!virtualModifiers.shift,
      };
      if (typeof sdlSym === "number" && isFinite(sdlSym))
        {ev.sdlSym = sdlSym | 0;}
      if (sourceToken !== undefined && sourceToken !== null)
        {ev.sourceToken = String(sourceToken);}
      return ev;
    }

    function syncShiftStateToEmulator() {
      if (!app || !app.onKeyDown || !app.onKeyUp) return;
      const next = isModifierActive("shift");
      if (next === emulatedShiftDown) return;
      emulatedShiftDown = next;
      const ev = makeVirtualKeyEvent(
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
      const next = !!active;
      if (virtualModifiers.shift === next) return;
      virtualModifiers.shift = next;
      refreshModifierButtons("shift");
      syncShiftStateToEmulator();
    }

    function flashVirtualKey(btn, durationMs) {
      if (!btn) return;
      const sourceToken = "flash:" + ++flashTokenCounter;
      setButtonPressed(btn, sourceToken, true);
      window.setTimeout(function () {
        setButtonPressed(btn, sourceToken, false);
      }, durationMs || 120);
    }

    function pressVirtualKey(key, code, sdlSym) {
      if (!app || !app.onKeyDown || !app.onKeyUp) return;
      const ev = makeVirtualKeyEvent(
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
      const sdl = btn.getAttribute("data-sdl");
      if (!sdl) return null;
      const parsed = parseInt(sdl, 10);
      return isFinite(parsed) ? parsed : null;
    }

    function releasePointerVirtualKey(pointerId) {
      if (!pressedVirtualKeysByPointer.has(pointerId)) return;
      const st = pressedVirtualKeysByPointer.get(pointerId);
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
      const glow = joystickGlows[def.name];
      if (glow) glow.classList.toggle("active", nextPressed);
      if (!app || !app.onKeyDown || !app.onKeyUp) return;
      const ev = makeJoystickEvent(
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
      const next = !!active;
      if (joystickState.fire === next) return;
      joystickState.fire = next;
      if (fireButton) fireButton.classList.toggle("active", next);
      if (!app || !app.onKeyDown || !app.onKeyUp) return;
      const ev = makeJoystickEvent("Alt", "AltLeft", 308, "joy:fire");
      if (next) app.onKeyDown(ev);
      else app.onKeyUp(ev);
    }

    function getJoystickStickCenter() {
      if (!joystickArea) return { x: 0, y: 0 };
      const boot = joystickArea.querySelector(".cx40-boot");
      const rect = boot
        ? boot.getBoundingClientRect()
        : joystickArea.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }

    function updateJoystickStick(dx, dy) {
      if (!joystickStick) return;
      const distance = Math.sqrt(dx * dx + dy * dy);
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
      const dx = clientX - stickCenter.x;
      const dy = clientY - stickCenter.y;
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
      const enabled = !!active;
      btnJoystick.classList.toggle("active", enabled);
      joystickPanel.hidden = !enabled;

      const label = enabled
        ? "Hide the on-screen joystick controls."
        : "Show the on-screen joystick controls.";
      btnJoystick.title = label;
      btnJoystick.setAttribute("aria-label", label);

      if (!enabled) resetJoystickControls();
      resizeCrtCanvas();
      queueKeyboardScaleConsistencyCheck();
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
      const enabled = !!active;
      btnKeyboard.classList.toggle("active", enabled);
      keyboardPanel.hidden = !enabled;

      const label = enabled
        ? "Hide the on-screen keyboard controls."
        : "Show the on-screen keyboard controls.";
      btnKeyboard.title = label;
      btnKeyboard.setAttribute("aria-label", label);

      if (!enabled) resetKeyboardControls();
      resizeCrtCanvas();
      queueKeyboardScaleConsistencyCheck();
      focusCanvas(true);
    }

    function setKeyboardMappingMode(mode, applyToApp) {
      const normalizedMode = mode === "original" ? "original" : "translated";
      const translated = normalizedMode === "translated";
      if (btnKeyboardMap) {
        btnKeyboardMap.classList.toggle("active", translated);
        const label = translated
          ? "Keyboard mapping: translated symbols for local layouts (recommended for BASIC typing)."
          : "Keyboard mapping: original Atari key positions (US layout style).";
        btnKeyboardMap.title = label;
        btnKeyboardMap.setAttribute("aria-label", label);
      }
      if (
        applyToApp &&
        app &&
        typeof app.setKeyboardMappingMode === "function"
      ) {
        app.setKeyboardMappingMode(normalizedMode);
      }
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
      const d1Mounted = app.hasMountedDiskForDeviceSlot(0);
      if (d1Mounted) {
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
        const active = btn.classList.toggle("active");
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
        const op = isViewportFullscreen()
          ? exitFullscreen()
          : requestFullscreen(screenViewport);
        Promise.resolve(op)
          .then(function () {
            updateFullscreenButton();
            resizeCrtCanvas();
            queueKeyboardScaleConsistencyCheck();
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
      queueKeyboardScaleConsistencyCheck();
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

    if (btnKeyboardMap) {
      btnKeyboardMap.addEventListener("click", function () {
        const nextMode = btnKeyboardMap.classList.contains("active")
          ? "original"
          : "translated";
        setKeyboardMappingMode(nextMode, true);
        focusCanvas(true);
      });
    }

    bindToggleButton(btnOptionOnStart, function (active) {
      app.setOptionOnStart(active);
    });

    function getKeyboardButtonFromTarget(target) {
      if (!atariKeyboard || !target || !target.closest) return null;
      const btn = target.closest("button.kbKey");
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
      const btn = getKeyboardButtonFromTarget(e.target);
      if (!btn) return;
      if (keyboardPanel && keyboardPanel.hidden) return;

      if (applyModifierButton(btn.getAttribute("data-modifier"), btn)) {
        focusCanvas(true);
        return;
      }

      const key = btn.getAttribute("data-key");
      if (!key) return;
      const code = btn.getAttribute("data-code") || "";
      const sdlSym = parseSdlSym(btn);

      e.preventDefault();
      if (btn.setPointerCapture) {
        try {
          btn.setPointerCapture(e.pointerId);
        } catch {
          // ignore capture errors
        }
      }

      releasePointerVirtualKey(e.pointerId);
      const sourceToken = "vkptr:" + e.pointerId;
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
      const btn = getKeyboardButtonFromTarget(e.target);
      if (!btn) return;
      if (applyModifierButton(btn.getAttribute("data-modifier"), btn)) {
        e.preventDefault();
        return;
      }
      const key = btn.getAttribute("data-key");
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
      queueKeyboardScaleConsistencyCheck();
    }

    function onJoystickPointerDown(e) {
      if (joystickPanel && joystickPanel.hidden) return;

      const target = e.target;
      const isFire =
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
        } catch {
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

    function getLowercaseExtension(name) {
      if (!name) return "";
      const dot = name.lastIndexOf(".");
      if (dot < 0) return "";
      return name.substring(dot).toLowerCase();
    }

    function isZipFileName(name) {
      return getLowercaseExtension(name) === ".zip";
    }

    function pickDiskEntryFromZip(unzipped) {
      const names = Object.keys(unzipped || {});
      let atrName = "";
      let xexName = "";
      for (let i = 0; i < names.length; i += 1) {
        const entryName = names[i];
        const ext = getLowercaseExtension(entryName);
        if (!atrName && ext === ".atr") atrName = entryName;
        if (!xexName && ext === ".xex") xexName = entryName;
      }
      return atrName || xexName || "";
    }

    function uint8ArrayToArrayBuffer(bytes) {
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
    }

    async function resolveDiskInputFile(file) {
      const rawBuffer = await Util.readFileAsArrayBuffer(file);
      if (!isZipFileName(file && file.name)) {
        return {
          buffer: rawBuffer,
          name: (file && file.name) || "disk.atr",
        };
      }

      const unzipSync = window.fflate && window.fflate.unzipSync;
      if (typeof unzipSync !== "function") {
        throw new Error("ZIP support unavailable (fflate not loaded).");
      }

      let unzipped = null;
      try {
        unzipped = unzipSync(new Uint8Array(rawBuffer));
      } catch (e) {
        throw new Error("Invalid ZIP archive: " + ((e && e.message) || e));
      }

      const entryName = pickDiskEntryFromZip(unzipped);
      if (!entryName) {
        throw new Error("ZIP archive does not contain .atr or .xex files.");
      }

      const entryBytes = unzipped[entryName];
      if (!(entryBytes instanceof Uint8Array) || entryBytes.length === 0) {
        throw new Error("ZIP entry is empty or invalid: " + entryName);
      }

      return {
        buffer: uint8ArrayToArrayBuffer(entryBytes),
        name: entryName,
      };
    }

    function attachFileInput(inputEl, handler, resolveFile) {
      if (!inputEl) return;
      inputEl.addEventListener("change", async function () {
        const file = inputEl.files && inputEl.files[0];
        if (!file) return;
        try {
          const resolved = resolveFile
            ? await resolveFile(file)
            : {
              buffer: await Util.readFileAsArrayBuffer(file),
              name: file.name,
            };
          handler(resolved.buffer, resolved.name || file.name);
          updateStatus();
        } catch (e) {
          console.error("File load error:", e);
        }
        inputEl.value = "";
      });
    }

    attachFileInput(romOs, function (buf) {
      app.loadOsRom(buf);
    });

    attachFileInput(romBasic, function (buf) {
      app.loadBasicRom(buf);
    });

    attachFileInput(
      disk1,
      function (buf, name) {
        app.loadDiskToDeviceSlot(buf, name, 0);
      },
      resolveDiskInputFile,
    );

    // Keyboard input forwarded to emulator.
    function onCanvasKeyDown(e) {
      syncPhysicalKeyVisual(e, true);
      const ev = normalizePhysicalKeyEvent(e, true);
      if (!ev) {
        e.preventDefault();
        return;
      }
      if (app.onKeyDown(ev)) e.preventDefault();
    }

    function onCanvasKeyUp(e) {
      syncPhysicalKeyVisual(e, false);
      const ev = normalizePhysicalKeyEvent(e, false);
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
    setKeyboardMappingMode(getKeyboardMappingModeFromUi(), true);
    if (btnJoystick && joystickPanel) {
      setJoystickEnabled(btnJoystick.classList.contains("active"));
    }
    if (btnKeyboard && keyboardPanel) {
      const keyboardActive = !isMobile();
      btnKeyboard.classList.toggle("active", keyboardActive);
      setKeyboardEnabled(keyboardActive);
    }

    // H: device file manager panel
    if (window.A8EHostFsUI && app) {
      window.A8EHostFsUI.init({
        app: app,
        panel: document.getElementById("hostfsPanel"),
        button: document.getElementById("btnHostFs"),
      });
    }
  }

  window.A8EUI = { boot: boot };
})();
