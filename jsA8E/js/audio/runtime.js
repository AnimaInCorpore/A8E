(function () {
  "use strict";

  function createApi(cfg) {
    var CYCLE_NEVER = cfg.CYCLE_NEVER;
    var IO_AUDF1_POT0 = cfg.IO_AUDF1_POT0;
    var IO_AUDC1_POT1 = cfg.IO_AUDC1_POT1;
    var IO_AUDF2_POT2 = cfg.IO_AUDF2_POT2;
    var IO_AUDC2_POT3 = cfg.IO_AUDC2_POT3;
    var IO_AUDF3_POT4 = cfg.IO_AUDF3_POT4;
    var IO_AUDC3_POT5 = cfg.IO_AUDC3_POT5;
    var IO_AUDF4_POT6 = cfg.IO_AUDF4_POT6;
    var IO_AUDC4_POT7 = cfg.IO_AUDC4_POT7;
    var IO_SKCTL_SKSTAT = cfg.IO_SKCTL_SKSTAT;
    var IO_AUDCTL_ALLPOT = cfg.IO_AUDCTL_ALLPOT;

    function createRuntime(opts) {
      var machine = opts.machine;
      var getAudioEnabled = opts.getAudioEnabled;
      var getTurbo = opts.getTurbo;
      var pokeyAudioCreateState = opts.pokeyAudioCreateState;
      var pokeyAudioSetTargetBufferSamples = opts.pokeyAudioSetTargetBufferSamples;
      var pokeyAudioSetTurbo = opts.pokeyAudioSetTurbo;
      var pokeyAudioResetState = opts.pokeyAudioResetState;
      var pokeyAudioOnRegisterWrite = opts.pokeyAudioOnRegisterWrite;
      var pokeyAudioSync = opts.pokeyAudioSync;
      var pokeyAudioConsume = opts.pokeyAudioConsume;

      function ensureAudio() {
        if (!getAudioEnabled()) return;
        if (machine.audioCtx) return;
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        machine.audioCtx = new AC();
        machine.audioState = pokeyAudioCreateState(machine.audioCtx.sampleRate);
        pokeyAudioResetState(machine.audioState);
        pokeyAudioSetTurbo(machine.audioState, !!getTurbo());
        machine.audioTurbo = !!getTurbo();
        // Initialize audio regs from current POKEY write-shadow.
        {
          var sram = machine.ctx.sram;
          pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDF1_POT0, sram[IO_AUDF1_POT0] & 0xff);
          pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDC1_POT1, sram[IO_AUDC1_POT1] & 0xff);
          pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDF2_POT2, sram[IO_AUDF2_POT2] & 0xff);
          pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDC2_POT3, sram[IO_AUDC2_POT3] & 0xff);
          pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDF3_POT4, sram[IO_AUDF3_POT4] & 0xff);
          pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDC3_POT5, sram[IO_AUDC3_POT5] & 0xff);
          pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDF4_POT6, sram[IO_AUDF4_POT6] & 0xff);
          pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDC4_POT7, sram[IO_AUDC4_POT7] & 0xff);
          pokeyAudioOnRegisterWrite(machine.audioState, IO_SKCTL_SKSTAT, sram[IO_SKCTL_SKSTAT] & 0xff);
          pokeyAudioOnRegisterWrite(machine.audioState, IO_AUDCTL_ALLPOT, sram[IO_AUDCTL_ALLPOT] & 0xff);
          machine.audioState.lastCycle = machine.ctx.cycleCounter;
        }
        machine.ctx.ioData.pokeyAudio = machine.audioState;

        function setupScriptProcessor() {
          if (!machine.audioCtx) return;
          // ScriptProcessorNode fallback for older browsers.
          var node = machine.audioCtx.createScriptProcessor(1024, 0, 1);
          if (machine.audioState) pokeyAudioSetTargetBufferSamples(machine.audioState, ((node.bufferSize | 0) * 2) | 0);
          node.onaudioprocess = function (e) {
            var out = e.outputBuffer.getChannelData(0);
            try {
              if (!machine.running || !machine.audioState) {
                out.fill(0.0);
                return;
              }
              pokeyAudioSync(machine.ctx, machine.audioState, machine.ctx.cycleCounter);
              pokeyAudioConsume(machine.audioState, out);
            } catch (err) {
              out.fill(0.0);
            }
          };
          node.connect(machine.audioCtx.destination);
          machine.audioNode = node;
          machine.audioMode = "script";
        }

        // Prefer AudioWorklet when available.
        if (machine.audioCtx.audioWorklet && window.AudioWorkletNode) {
          machine.audioMode = "loading";
          machine.audioCtx.audioWorklet
            .addModule("js/audio/worklet.js")
            .then(function () {
              if (!machine.audioCtx || !getAudioEnabled()) return;
              var node = new window.AudioWorkletNode(machine.audioCtx, "a8e-sample-queue", {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [1],
              });
              if (machine.audioState)
                pokeyAudioSetTargetBufferSamples(machine.audioState, ((machine.audioCtx.sampleRate / 20) | 0) || 2048);
              node.connect(machine.audioCtx.destination);
              machine.audioNode = node;
              machine.audioMode = "worklet";
              try {
                node.port.postMessage({ type: "clear" });
              } catch (e) {
                // ignore
              }
            })
            .catch(function () {
              setupScriptProcessor();
            });
        } else {
          setupScriptProcessor();
        }
      }

      function stopAudio() {
        if (!machine.audioCtx) return;
        try {
          if (machine.audioMode === "worklet" && machine.audioNode && machine.audioNode.port) {
            try {
              machine.audioNode.port.postMessage({ type: "clear" });
            } catch (e) {
              // ignore
            }
          }
          if (machine.audioNode) machine.audioNode.disconnect();
          machine.audioNode = null;
          machine.audioCtx.close();
        } catch (e) {
          // ignore
        }
        machine.audioMode = "none";
        machine.audioCtx = null;
        machine.audioState = null;
        machine.audioTurbo = false;
        machine.ctx.ioData.pokeyAudio = null;
      }

      function isSioActive(io) {
        if (!io) return false;
        if ((io.sioOutIndex | 0) !== 0) return true;
        if ((io.sioOutPhase | 0) !== 0) return true;
        if ((io.sioInSize | 0) > 0) return true;
        if (io.serialOutputNeedDataCycle !== CYCLE_NEVER) return true;
        if (io.serialOutputTransmissionDoneCycle !== CYCLE_NEVER) return true;
        if (io.serialInputDataReadyCycle !== CYCLE_NEVER) return true;
        return false;
      }

      function syncAudioTurboMode(nextTurbo) {
        if (!machine.audioState) return;
        var next = !!nextTurbo;
        if (next === machine.audioTurbo) return;
        pokeyAudioSync(machine.ctx, machine.audioState, machine.ctx.cycleCounter);
        pokeyAudioSetTurbo(machine.audioState, next);
        machine.audioTurbo = next;
      }

      return {
        ensureAudio: ensureAudio,
        stopAudio: stopAudio,
        isSioActive: isSioActive,
        syncAudioTurboMode: syncAudioTurboMode,
      };
    }

    return {
      createRuntime: createRuntime,
    };
  }

  window.A8EAudioRuntime = {
    createApi: createApi,
  };
})();
