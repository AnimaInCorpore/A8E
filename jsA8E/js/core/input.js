(function () {
  "use strict";

  function createApi(cfg) {
    var CPU = cfg.CPU;
    var IO_PORTA = cfg.IO_PORTA;
    var IO_GRAFP3_TRIG0 = cfg.IO_GRAFP3_TRIG0;
    var IO_GRAFM_TRIG1 = cfg.IO_GRAFM_TRIG1;
    var IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    var IO_COLPM1_TRIG3 = cfg.IO_COLPM1_TRIG3;
    var IO_CONSOL = cfg.IO_CONSOL;
    var IO_IRQEN_IRQST = cfg.IO_IRQEN_IRQST;
    var IO_SKCTL_SKSTAT = cfg.IO_SKCTL_SKSTAT;
    var IO_STIMER_KBCODE = cfg.IO_STIMER_KBCODE;
    var IRQ_OTHER_KEY_PRESSED = cfg.IRQ_OTHER_KEY_PRESSED;
    var IRQ_BREAK_KEY_PRESSED = cfg.IRQ_BREAK_KEY_PRESSED;
    var KEY_CODE_TABLE = cfg.KEY_CODE_TABLE;
    var browserKeyToSdlSym = cfg.browserKeyToSdlSym;

    function createRuntime(opts) {
      var machine = opts.machine;
      var isReady = opts.isReady;
      var pressedKeys = {};

      function normalizeSourceToken(e) {
        if (!e || e.sourceToken === undefined || e.sourceToken === null) return null;
        return String(e.sourceToken);
      }

      function getPressedState(sym, createIfMissing) {
        var st = pressedKeys[sym];
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
        var st = getPressedState(sym, true);
        var wasDown = isSymDown(st);
        var source = normalizeSourceToken(e);
        if (source !== null) {
          if (st.sources.has(source)) return { handled: true, newlyPressed: false };
          st.sources.add(source);
          return { handled: true, newlyPressed: !wasDown };
        }
        if (e && e.repeat) return { handled: true, newlyPressed: false };
        if (wasDown) return { handled: true, newlyPressed: false };
        st.anonymousCount++;
        return { handled: true, newlyPressed: !wasDown };
      }

      function releaseSym(sym, e) {
        var st = getPressedState(sym, false);
        if (!st) return { handled: false, newlyReleased: false };
        var source = normalizeSourceToken(e);
        if (source !== null) {
          if (!st.sources.has(source)) return { handled: false, newlyReleased: false };
          st.sources.delete(source);
        } else {
          if (st.anonymousCount <= 0) return { handled: false, newlyReleased: false };
          st.anonymousCount--;
        }
        var stillDown = isSymDown(st);
        if (!stillDown) delete pressedKeys[sym];
        return { handled: true, newlyReleased: !stillDown };
      }

      function onKeyDown(e) {
        if (!isReady()) return false;
        var sym = browserKeyToSdlSym(e);
        if (sym === null) return false;
        var down = pressSym(sym, e);
        if (!down.handled) return false;
        if (!down.newlyPressed) return true;

        // Joystick / console / reset/break follow C behavior.
        if (sym === 273) {
          machine.ctx.ram[IO_PORTA] &= ~0x01;
          return true;
        }
        if (sym === 274) {
          machine.ctx.ram[IO_PORTA] &= ~0x02;
          return true;
        }
        if (sym === 276) {
          machine.ctx.ram[IO_PORTA] &= ~0x04;
          return true;
        }
        if (sym === 275) {
          machine.ctx.ram[IO_PORTA] &= ~0x08;
          return true;
        }

        if (sym === 308) {
          machine.ctx.ram[IO_GRAFP3_TRIG0] = 0;
          return true;
        }
        if (sym === 306) {
          // C/SDL parity: Ctrl is a keyboard modifier, not a joystick trigger.
          return true;
        }
        if (sym === 307) {
          machine.ctx.ram[IO_COLPM0_TRIG2] = 0;
          return true;
        }
        if (sym === 309 || sym === 310) {
          machine.ctx.ram[IO_COLPM1_TRIG3] = 0;
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
          CPU.reset(machine.ctx);
          return true;
        }
        if (sym === 289) {
          machine.ctx.ram[IO_IRQEN_IRQST] &= ~IRQ_BREAK_KEY_PRESSED;
          if (machine.ctx.sram[IO_IRQEN_IRQST] & IRQ_BREAK_KEY_PRESSED) CPU.irq(machine.ctx);
          return true;
        }

        if (sym === 303 || sym === 304) {
          machine.ctx.ram[IO_SKCTL_SKSTAT] &= ~0x08;
          return true;
        }

        var kc = KEY_CODE_TABLE[sym] !== undefined ? KEY_CODE_TABLE[sym] : 255;
        if (kc === 255) {
          releaseSym(sym, e);
          return false;
        }

        if (e.ctrlKey) kc |= 0x80;
        if (e.shiftKey) kc |= 0x40;

        machine.ctx.ram[IO_STIMER_KBCODE] = kc & 0xff;

        machine.ctx.ram[IO_IRQEN_IRQST] &= ~IRQ_OTHER_KEY_PRESSED;
        if (machine.ctx.sram[IO_IRQEN_IRQST] & IRQ_OTHER_KEY_PRESSED) CPU.irq(machine.ctx);

        machine.ctx.ioData.keyPressCounter++;
        machine.ctx.ram[IO_SKCTL_SKSTAT] &= ~0x04;
        return true;
      }

      function onKeyUp(e) {
        if (!isReady()) return false;
        var sym = browserKeyToSdlSym(e);
        if (sym === null) return false;
        var up = releaseSym(sym, e);
        if (!up.handled) return false;
        if (!up.newlyReleased) return true;

        if (sym === 273) {
          machine.ctx.ram[IO_PORTA] |= 0x01;
          return true;
        }
        if (sym === 274) {
          machine.ctx.ram[IO_PORTA] |= 0x02;
          return true;
        }
        if (sym === 276) {
          machine.ctx.ram[IO_PORTA] |= 0x04;
          return true;
        }
        if (sym === 275) {
          machine.ctx.ram[IO_PORTA] |= 0x08;
          return true;
        }
        if (sym === 308) {
          machine.ctx.ram[IO_GRAFP3_TRIG0] = 1;
          return true;
        }
        if (sym === 306) {
          // C/SDL parity: Ctrl is a keyboard modifier, not a joystick trigger.
          return true;
        }
        if (sym === 307) {
          machine.ctx.ram[IO_COLPM0_TRIG2] = 1;
          return true;
        }
        if (sym === 309 || sym === 310) {
          machine.ctx.ram[IO_COLPM1_TRIG3] = 1;
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

        var kc = KEY_CODE_TABLE[sym] !== undefined ? KEY_CODE_TABLE[sym] : 255;
        if (kc === 255) return false;

        if (machine.ctx.ioData.keyPressCounter > 0) machine.ctx.ioData.keyPressCounter--;
        if (machine.ctx.ioData.keyPressCounter === 0) machine.ctx.ram[IO_SKCTL_SKSTAT] |= 0x04;
        return true;
      }

      function releaseAll() {
        pressedKeys = {};
        machine.ctx.ioData.keyPressCounter = 0;
        machine.ctx.ram[IO_PORTA] |= 0x0F;
        machine.ctx.ram[IO_GRAFP3_TRIG0] = 1;
        machine.ctx.ram[IO_COLPM0_TRIG2] = 1;
        machine.ctx.ram[IO_COLPM1_TRIG3] = 1;
        machine.ctx.ram[IO_CONSOL] |= 0x07;
        machine.ctx.ram[IO_SKCTL_SKSTAT] |= 0x0C;
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
