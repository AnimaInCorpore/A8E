(function () {
  "use strict";

  function createApi(cfg) {
    const CPU = cfg.CPU;
    const IO_PORTA = cfg.IO_PORTA;
    const IO_GRAFP3_TRIG0 = cfg.IO_GRAFP3_TRIG0;
    const IO_GRAFM_TRIG1 = cfg.IO_GRAFM_TRIG1;
    const IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    const IO_COLPM1_TRIG3 = cfg.IO_COLPM1_TRIG3;
    const IO_GRACTL = cfg.IO_GRACTL;
    const IO_CONSOL = cfg.IO_CONSOL;
    const IO_IRQEN_IRQST = cfg.IO_IRQEN_IRQST;
    const IO_SKCTL_SKSTAT = cfg.IO_SKCTL_SKSTAT;
    const IO_STIMER_KBCODE = cfg.IO_STIMER_KBCODE;
    const IRQ_OTHER_KEY_PRESSED = cfg.IRQ_OTHER_KEY_PRESSED;
    const IRQ_BREAK_KEY_PRESSED = cfg.IRQ_BREAK_KEY_PRESSED;
    const KEY_CODE_TABLE = cfg.KEY_CODE_TABLE;
    const browserKeyToSdlSym = cfg.browserKeyToSdlSym;
    const SDLK_UP = 273;
    const SDLK_DOWN = 274;
    const SDLK_LEFT = 276;
    const SDLK_RIGHT = 275;
    // These masks must stay aligned with IO_PORTA joystick direction bits.
    const JOYSTICK_UP_MASK = 0x01;
    const JOYSTICK_DOWN_MASK = 0x02;
    const JOYSTICK_LEFT_MASK = 0x04;
    const JOYSTICK_RIGHT_MASK = 0x08;

    function createRuntime(opts) {
      const machine = opts.machine;
      const isReady = opts.isReady;
      let pressedKeys = {};
      let joystickArrowMask = 0;

      function normalizeSourceToken(e) {
        if (!e || e.sourceToken === undefined || e.sourceToken === null)
          {return null;}
        return String(e.sourceToken);
      }

      function getPressedState(sym, createIfMissing) {
        let st = pressedKeys[sym];
        if (!st && createIfMissing) {
          st = {
            anonymousCount: 0,
            sources: new Set(),
          };
          pressedKeys[sym] = st;
        }
        return st || null;
      }

      function isSymDown(st) {
        return !!st && (st.anonymousCount > 0 || st.sources.size > 0);
      }

      function pressSym(sym, e) {
        const st = getPressedState(sym, true);
        const wasDown = isSymDown(st);
        const source = normalizeSourceToken(e);
        if (source !== null) {
          if (st.sources.has(source))
            {return { handled: true, newlyPressed: false };}
          st.sources.add(source);
          return { handled: true, newlyPressed: !wasDown };
        }
        if (e && e.repeat) return { handled: true, newlyPressed: false };
        if (wasDown) return { handled: true, newlyPressed: false };
        st.anonymousCount++;
        return { handled: true, newlyPressed: !wasDown };
      }

      function releaseSym(sym, e) {
        const st = getPressedState(sym, false);
        if (!st) return { handled: false, newlyReleased: false };
        const source = normalizeSourceToken(e);
        if (source !== null) {
          if (!st.sources.has(source))
            {return { handled: false, newlyReleased: false };}
          st.sources.delete(source);
        } else {
          if (st.anonymousCount <= 0)
            {return { handled: false, newlyReleased: false };}
          st.anonymousCount--;
        }
        const stillDown = isSymDown(st);
        if (!stillDown) delete pressedKeys[sym];
        return { handled: true, newlyReleased: !stillDown };
      }

      function releaseSymBySource(e) {
        const source = normalizeSourceToken(e);
        if (source === null) return { handled: false, newlyReleased: false, sym: null };
        const syms = Object.keys(pressedKeys);
        for (let i = 0; i < syms.length; i++) {
          const sym = syms[i] | 0;
          const st = pressedKeys[sym];
          if (!st || !st.sources || !st.sources.has(source)) continue;
          const released = releaseSym(sym, e);
          if (released.handled)
            {return { handled: true, newlyReleased: released.newlyReleased, sym: sym };}
        }
        return { handled: false, newlyReleased: false, sym: null };
      }

      function triggerRegister(index) {
        if (index === 0) return IO_GRAFP3_TRIG0;
        if (index === 1) return IO_GRAFM_TRIG1;
        if (index === 2) return IO_COLPM0_TRIG2;
        return IO_COLPM1_TRIG3;
      }

      function setTriggerPressed(index, pressed) {
        const ctx = machine.ctx;
        const io = ctx.ioData;
        const reg = triggerRegister(index);
        const physical = pressed ? 0 : 1;

        if (!io.trigPhysical || !io.trigLatched) {
          ctx.ram[reg] = physical;
          return;
        }

        io.trigPhysical[index] = physical;

        if (ctx.sram[IO_GRACTL] & 0x04) {
          if (physical === 0) io.trigLatched[index] = 0;
          ctx.ram[reg] = io.trigLatched[index] & 0x01;
          return;
        }

        io.trigLatched[index] = physical;
        ctx.ram[reg] = physical;
      }

      function queueKeyCode(kc) {
        machine.ctx.ram[IO_STIMER_KBCODE] = kc & 0xff;
        machine.ctx.ram[IO_IRQEN_IRQST] &= ~IRQ_OTHER_KEY_PRESSED;
        if (machine.ctx.sram[IO_IRQEN_IRQST] & IRQ_OTHER_KEY_PRESSED)
          {CPU.irq(machine.ctx);}
        machine.ctx.ioData.keyPressCounter++;
        machine.ctx.ram[IO_SKCTL_SKSTAT] &= ~0x04;
      }

      function joystickMaskForArrowSym(sym) {
        if (sym === SDLK_UP) return JOYSTICK_UP_MASK;
        if (sym === SDLK_DOWN) return JOYSTICK_DOWN_MASK;
        if (sym === SDLK_LEFT) return JOYSTICK_LEFT_MASK;
        if (sym === SDLK_RIGHT) return JOYSTICK_RIGHT_MASK;
        return 0;
      }

      function effectiveShiftKey(e) {
        if (e && typeof e.atariShiftOverride === "boolean")
          {return e.atariShiftOverride;}
        return !!(e && e.shiftKey);
      }

      function effectiveCtrlKey(e) {
        if (e && e.altGraph) return false;
        return !!(e && e.ctrlKey);
      }

      function cursorKeyCodeForArrowSym(sym) {
        if (sym === SDLK_UP) return 54 | 0x80; // Ctrl + '-'
        if (sym === SDLK_DOWN) return 55 | 0x80; // Ctrl + '='
        if (sym === SDLK_LEFT) return 6 | 0x80; // Ctrl + '+'
        if (sym === SDLK_RIGHT) return 7 | 0x80; // Ctrl + '*'
        return null;
      }

      function engageJoystickArrow(mask) {
        if (!mask) return false;
        const wasEngaged = (joystickArrowMask & mask) !== 0;
        joystickArrowMask |= mask;
        return !wasEngaged;
      }

      function releaseJoystickArrow(mask) {
        if (!mask) return false;
        const wasEngaged = (joystickArrowMask & mask) !== 0;
        joystickArrowMask &= ~mask;
        return wasEngaged;
      }

      function onKeyDown(e) {
        if (!isReady()) return false;
        const sym = browserKeyToSdlSym(e);
        if (sym === null) return false;
        const down = pressSym(sym, e);
        if (!down.handled) return false;
        if (!down.newlyPressed) return true;
        const shiftKeyDown = effectiveShiftKey(e);
        const ctrlKeyDown = effectiveCtrlKey(e);

        // Joystick / console / reset/break follow C behavior.
        const arrowMask = joystickMaskForArrowSym(sym);
        if (arrowMask) {
          if (shiftKeyDown) {
            const cursorKeyCode = cursorKeyCodeForArrowSym(sym);
            if (cursorKeyCode !== null) queueKeyCode(cursorKeyCode);
            return true;
          }
          if (engageJoystickArrow(arrowMask)) {
            machine.ctx.ram[IO_PORTA] &= ~arrowMask;
          }
          return true;
        }

        if (sym === 308) {
          setTriggerPressed(0, true);
          return true;
        }
        if (sym === 306) {
          // C/SDL parity: Ctrl is a keyboard modifier, not a joystick trigger.
          return true;
        }
        if (sym === 307) {
          setTriggerPressed(2, true);
          return true;
        }
        if (sym === 309 || sym === 310) {
          setTriggerPressed(3, true);
          return true;
        }

        if (sym === 283) {
          machine.ctx.ram[IO_CONSOL] &= ~0x4;
          return true;
        }
        if (sym === 284) {
          machine.ctx.ram[IO_CONSOL] &= ~0x2;
          return true;
        }
        if (sym === 285) {
          machine.ctx.ram[IO_CONSOL] &= ~0x1;
          return true;
        }
        if (sym === 286) {
          joystickArrowMask = 0;
          machine.ctx.ram[IO_PORTA] |= 0x0f;
          CPU.reset(machine.ctx);
          return true;
        }
        if (sym === 289) {
          machine.ctx.ram[IO_IRQEN_IRQST] &= ~IRQ_BREAK_KEY_PRESSED;
          if (machine.ctx.sram[IO_IRQEN_IRQST] & IRQ_BREAK_KEY_PRESSED)
            {CPU.irq(machine.ctx);}
          return true;
        }

        if (sym === 303 || sym === 304) {
          machine.ctx.ram[IO_SKCTL_SKSTAT] &= ~0x08;
          return true;
        }

        let kc = KEY_CODE_TABLE[sym] !== undefined ? KEY_CODE_TABLE[sym] : 255;
        if (kc === 255) {
          releaseSym(sym, e);
          return false;
        }

        if (ctrlKeyDown) kc |= 0x80;
        if (shiftKeyDown) kc |= 0x40;

        queueKeyCode(kc);
        return true;
      }

      function onKeyUp(e) {
        if (!isReady()) return false;
        const resolvedSym = browserKeyToSdlSym(e);
        let up =
          resolvedSym === null
            ? { handled: false, newlyReleased: false }
            : releaseSym(resolvedSym, e);
        let sym = resolvedSym;
        if (!up.handled) {
          const fallback = releaseSymBySource(e);
          if (!fallback.handled) return false;
          up = fallback;
          sym = fallback.sym;
        }
        if (!up.newlyReleased) return true;

        const arrowMask = joystickMaskForArrowSym(sym);
        if (arrowMask) {
          if (releaseJoystickArrow(arrowMask)) {
            machine.ctx.ram[IO_PORTA] |= arrowMask;
          }
          return true;
        }
        if (sym === 308) {
          setTriggerPressed(0, false);
          return true;
        }
        if (sym === 306) {
          // C/SDL parity: Ctrl is a keyboard modifier, not a joystick trigger.
          return true;
        }
        if (sym === 307) {
          setTriggerPressed(2, false);
          return true;
        }
        if (sym === 309 || sym === 310) {
          setTriggerPressed(3, false);
          return true;
        }
        if (sym === 283) {
          machine.ctx.ram[IO_CONSOL] |= 0x4;
          return true;
        }
        if (sym === 284) {
          machine.ctx.ram[IO_CONSOL] |= 0x2;
          return true;
        }
        if (sym === 285) {
          machine.ctx.ram[IO_CONSOL] |= 0x1;
          return true;
        }
        if (sym === 303 || sym === 304) {
          machine.ctx.ram[IO_SKCTL_SKSTAT] |= 0x08;
          return true;
        }

        const kc = KEY_CODE_TABLE[sym] !== undefined ? KEY_CODE_TABLE[sym] : 255;
        if (kc === 255) return false;

        if (machine.ctx.ioData.keyPressCounter > 0)
          {machine.ctx.ioData.keyPressCounter--;}
        if (machine.ctx.ioData.keyPressCounter === 0)
          {machine.ctx.ram[IO_SKCTL_SKSTAT] |= 0x04;}
        return true;
      }

      function releaseAll() {
        pressedKeys = {};
        joystickArrowMask = 0;
        machine.ctx.ioData.keyPressCounter = 0;
        machine.ctx.ram[IO_PORTA] |= 0x0f;
        setTriggerPressed(0, false);
        setTriggerPressed(1, false);
        setTriggerPressed(2, false);
        setTriggerPressed(3, false);
        machine.ctx.ram[IO_CONSOL] |= 0x07;
        machine.ctx.ram[IO_SKCTL_SKSTAT] |= 0x0c;
      }

      return {
        onKeyDown: onKeyDown,
        onKeyUp: onKeyUp,
        releaseAll: releaseAll,
      };
    }

    return {
      createRuntime: createRuntime,
    };
  }

  window.A8EInput = {
    createApi: createApi,
  };
})();
