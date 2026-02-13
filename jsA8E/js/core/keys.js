(function () {
  "use strict";

  function createApi() {
    // Key mapping table from AtariIo.c (indexed by SDL 1.2 keysym.sym).
    // Values are Atari POKEY KBCODE codes; 255 => unmapped.
    const KEY_CODE_TABLE = [
      255, 255, 255, 255, 255, 255, 255, 255, 52, 44, 255, 255, 255, 12, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 33, 255, 255, 255, 255, 255, 255, 6, 255, 255, 255, 255, 32, 54,
      34, 38, 50, 31, 30, 26, 24, 29, 27, 51, 53, 48, 255, 2, 255, 55, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 14, 7, 15,
      255, 255, 28, 63, 21, 18, 58, 42, 56, 61, 57, 13, 1, 5, 0, 37, 35, 8, 10,
      47, 40, 62, 45, 11, 16, 46, 22, 43, 23, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 17, 255, 255, 255, 255, 60, 39, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 60, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255,
    ];

    // SDL keysyms for printable keys are based on the physical key identity
    // (unshifted symbol), not the shifted character produced by layout.
    const CODE_TO_SDL_SYM = {
      Digit0: 48,
      Digit1: 49,
      Digit2: 50,
      Digit3: 51,
      Digit4: 52,
      Digit5: 53,
      Digit6: 54,
      Digit7: 55,
      Digit8: 56,
      Digit9: 57,
      KeyA: 97,
      KeyB: 98,
      KeyC: 99,
      KeyD: 100,
      KeyE: 101,
      KeyF: 102,
      KeyG: 103,
      KeyH: 104,
      KeyI: 105,
      KeyJ: 106,
      KeyK: 107,
      KeyL: 108,
      KeyM: 109,
      KeyN: 110,
      KeyO: 111,
      KeyP: 112,
      KeyQ: 113,
      KeyR: 114,
      KeyS: 115,
      KeyT: 116,
      KeyU: 117,
      KeyV: 118,
      KeyW: 119,
      KeyX: 120,
      KeyY: 121,
      KeyZ: 122,
      Backquote: 96,
      Minus: 45,
      Equal: 61,
      BracketLeft: 91,
      BracketRight: 93,
      Backslash: 92,
      Semicolon: 59,
      Quote: 39,
      Comma: 44,
      Period: 46,
      Slash: 47,
    };

    const SHIFTED_PRINTABLE_TO_BASE = {
      "!": "1",
      '"': "2",
      "#": "3",
      $: "4",
      "%": "5",
      "&": "6",
      "'": "7",
      "@": "8",
      "(": "9",
      ")": "0",
      "<": ",",
      ">": ".",
      "?": "/",
      ":": ";",
      "+": "=",
      "*": "\\",
      "^": "-",
    };

    function printableKeyToSdlSym(key, shiftKey) {
      if (!key || key.length !== 1) return null;
      const mapped =
        shiftKey && SHIFTED_PRINTABLE_TO_BASE[key]
          ? SHIFTED_PRINTABLE_TO_BASE[key]
          : key.toLowerCase();
      const sym = mapped.charCodeAt(0) & 0x1ff;
      if (KEY_CODE_TABLE[sym] === undefined || KEY_CODE_TABLE[sym] === 255)
        return null;
      return sym;
    }

    function browserKeyToSdlSym(e) {
      if (e && typeof e.sdlSym === "number" && isFinite(e.sdlSym))
        return e.sdlSym | 0;
      // Prefer code/location for side-specific modifiers first.
      if (e.code === "ShiftRight") return 303;
      if (e.code === "ShiftLeft") return 304;
      if (e.code === "AltRight") return 307;
      if (e.code === "AltLeft") return 308;
      if (e.code === "MetaRight") return 309;
      if (e.code === "MetaLeft") return 310;

      const printableSym = printableKeyToSdlSym(e && e.key, !!(e && e.shiftKey));
      if (printableSym !== null) return printableSym;

      if (e && e.code && CODE_TO_SDL_SYM[e.code] !== undefined)
        return CODE_TO_SDL_SYM[e.code];

      // SDL 1.2 keysyms mostly follow ASCII for printable keys.
      const k = e.key;
      switch (k) {
        case "Enter":
          return 13;
        case "Backspace":
          return 8;
        case "Tab":
          return 9;
        case "Escape":
          return 27;
        case " ":
        case "Spacebar":
        case "Space":
          return 32;
        case "ArrowUp":
          return 273;
        case "ArrowDown":
          return 274;
        case "ArrowRight":
          return 275;
        case "ArrowLeft":
          return 276;
        case "F1":
          return 282;
        case "F2":
          return 283;
        case "F3":
          return 284;
        case "F4":
          return 285;
        case "F5":
          return 286;
        case "F6":
          return 287;
        case "F7":
          return 288;
        case "F8":
          return 289;
        case "F11":
          return 292;
        case "CapsLock":
          return 301;
        case "Shift":
          // Side-specific Shift is handled above via e.code.
          return 304;
        case "Alt":
          return 308;
        case "Control":
          return 306; // SDLK_LCTRL (approx; unused for table)
        case "Meta":
          return 310; // SDLK_LMETA (approx; unused for table)
        default:
          break;
      }

      return null;
    }

    return {
      KEY_CODE_TABLE: KEY_CODE_TABLE,
      browserKeyToSdlSym: browserKeyToSdlSym,
    };
  }

  window.A8EKeys = {
    createApi: createApi,
  };
})();
