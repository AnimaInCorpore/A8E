(function () {
  "use strict";

  function createApi(cfg) {
    var ATARI_CPU_HZ_PAL = cfg.ATARI_CPU_HZ_PAL;
    var CYCLES_PER_LINE = cfg.CYCLES_PER_LINE;
    var POKEY_AUDIO_MAX_CATCHUP_CYCLES = cfg.POKEY_AUDIO_MAX_CATCHUP_CYCLES;

    var IO_AUDF1_POT0 = cfg.IO_AUDF1_POT0;
    var IO_AUDC1_POT1 = cfg.IO_AUDC1_POT1;
    var IO_AUDF2_POT2 = cfg.IO_AUDF2_POT2;
    var IO_AUDC2_POT3 = cfg.IO_AUDC2_POT3;
    var IO_AUDF3_POT4 = cfg.IO_AUDF3_POT4;
    var IO_AUDC3_POT5 = cfg.IO_AUDC3_POT5;
    var IO_AUDF4_POT6 = cfg.IO_AUDF4_POT6;
    var IO_AUDC4_POT7 = cfg.IO_AUDC4_POT7;
    var IO_AUDCTL_ALLPOT = cfg.IO_AUDCTL_ALLPOT;
    var IO_STIMER_KBCODE = cfg.IO_STIMER_KBCODE;
    var IO_SKCTL_SKSTAT = cfg.IO_SKCTL_SKSTAT;

    var CYCLE_NEVER = cfg.CYCLE_NEVER;
    var cycleTimedEventUpdate = cfg.cycleTimedEventUpdate;
    var pokeySioApi =
      window.A8EPokeySio && window.A8EPokeySio.createApi
        ? window.A8EPokeySio.createApi({
            IO_SEROUT_SERIN: cfg.IO_SEROUT_SERIN,
            SERIAL_OUTPUT_DATA_NEEDED_CYCLES:
              cfg.SERIAL_OUTPUT_DATA_NEEDED_CYCLES,
            SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES:
              cfg.SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES,
            SERIAL_INPUT_FIRST_DATA_READY_CYCLES:
              cfg.SERIAL_INPUT_FIRST_DATA_READY_CYCLES,
            SERIAL_INPUT_DATA_READY_CYCLES: cfg.SERIAL_INPUT_DATA_READY_CYCLES,
            cycleTimedEventUpdate: cycleTimedEventUpdate,
          })
        : null;
    if (!pokeySioApi) throw new Error("A8EPokeySio is not loaded");

    // --- POKEY audio (ported from Pokey.c; still simplified, but cycle-based) ---
    var POKEY_FP_ONE = 4294967296; // 1<<32 as an exact integer.
    var POKEY_MIX_GAIN = 0.35;
    var POKEY_DC_BLOCK_HZ = 20.0;
    var POKEY_AUDIO_RING_SIZE = 4096; // power-of-two
    var POKEY_AUDIO_TARGET_BUFFER_SAMPLES = 512;
    var POKEY_AUDIO_MAX_ADJUST_DIVISOR = 40; // +/-2.5%

    function pokeyAudioCreateState(sampleRate) {
      var ringSize = POKEY_AUDIO_RING_SIZE;
      var st = {
        sampleRate: sampleRate || 48000,
        cpuHzBase: ATARI_CPU_HZ_PAL,
        cpuHz: ATARI_CPU_HZ_PAL,
        cyclesPerSampleFp: 0,
        cyclesPerSampleFpBase: 0,
        targetBufferSamples: POKEY_AUDIO_TARGET_BUFFER_SAMPLES,
        lastCycle: 0,
        samplePhaseFp: 0,
        sampleAccum: 0,
        sampleAccumCount: 0,
        mixGain: POKEY_MIX_GAIN,
        dcBlockR: 0.0,
        dcBlockX1: 0.0,
        dcBlockY1: 0.0,

        lfsr17: 0x1ffff,
        lfsr9: 0x01ff,
        lfsr5: 0x00,
        lfsr4: 0x00,
        hp1Latch: 0,
        hp2Latch: 0,

        audctl: 0x00,
        skctl: 0x00,

        channels: [
          {
            audf: 0,
            audc: 0,
            counter: 1,
            output: 0,
            clkDivCycles: 28,
            clkAccCycles: 0,
          },
          {
            audf: 0,
            audc: 0,
            counter: 1,
            output: 0,
            clkDivCycles: 28,
            clkAccCycles: 0,
          },
          {
            audf: 0,
            audc: 0,
            counter: 1,
            output: 0,
            clkDivCycles: 28,
            clkAccCycles: 0,
          },
          {
            audf: 0,
            audc: 0,
            counter: 1,
            output: 0,
            clkDivCycles: 28,
            clkAccCycles: 0,
          },
        ],

        ring: new Float32Array(ringSize),
        ringSize: ringSize,
        ringMask: ringSize - 1,
        ringRead: 0,
        ringWrite: 0,
        ringCount: 0,
        lastSample: 0.0,
      };

      pokeyAudioRecomputeCyclesPerSample(st);
      pokeyAudioRecomputeDcBlock(st);
      pokeyAudioRecomputeClocks(st.channels, st.audctl);
      return st;
    }

    function pokeyAudioRecomputeCyclesPerSample(st) {
      if (!st) return;
      var sr = st.sampleRate || 48000;
      var hz = st.cpuHz || ATARI_CPU_HZ_PAL;
      var cps = Math.floor((hz * POKEY_FP_ONE) / sr);
      if (cps < 1) cps = 1;
      st.cyclesPerSampleFpBase = cps;
      st.cyclesPerSampleFp = cps;
    }

    function pokeyAudioRecomputeDcBlock(st) {
      if (!st) return;
      var sr = st.sampleRate || 48000;
      if (sr < 1) sr = 1;
      var r = Math.exp((-2.0 * Math.PI * POKEY_DC_BLOCK_HZ) / sr);
      if (!(r >= 0.0)) r = 0.0;
      if (r >= 0.999999) r = 0.999999;
      st.dcBlockR = r;
    }

    function pokeyAudioApplyDcBlock(st, sample) {
      var out = sample - st.dcBlockX1 + st.dcBlockR * st.dcBlockY1;
      st.dcBlockX1 = sample;
      st.dcBlockY1 = out;
      return out;
    }

    function pokeyAudioSetTargetBufferSamples(st, n) {
      if (!st) return;
      var ringSize = st.ringSize | 0;
      var max = ((ringSize * 3) / 4) | 0;
      if (max < 1) max = ringSize > 0 ? (ringSize - 1) | 0 : 1;
      var target = n | 0;
      if (target < 256) target = 256;
      if (target > max) target = max;
      st.targetBufferSamples = target | 0;
    }

    function pokeyAudioSetTurbo(st, turbo) {
      if (!st) return;
      st.cpuHz = (st.cpuHzBase || ATARI_CPU_HZ_PAL) * (turbo ? 4 : 1);
      pokeyAudioRecomputeCyclesPerSample(st);
    }

    function pokeyAudioRingWrite(st, samples, count) {
      if (!st || !samples || !count) return;
      var ring = st.ring;
      if (!ring || !ring.length) return;
      var ringSize = st.ringSize | 0;
      var ringMask = st.ringMask | 0;

      if (count >= ringSize) {
        ring.set(samples.subarray(count - ringSize, count), 0);
        st.ringRead = 0;
        st.ringWrite = 0;
        st.ringCount = ringSize;
        return;
      }

      var freeSpace = ringSize - (st.ringCount | 0);
      var drop = count > freeSpace ? count - freeSpace : 0;
      if (drop) {
        st.ringRead = (st.ringRead + drop) & ringMask;
        st.ringCount = (st.ringCount - drop) | 0;
      }

      var first = count;
      var toEnd = ringSize - (st.ringWrite | 0);
      if (first > toEnd) first = toEnd;
      ring.set(samples.subarray(0, first), st.ringWrite | 0);
      var second = count - first;
      if (second) ring.set(samples.subarray(first, first + second), 0);

      st.ringWrite = ((st.ringWrite + count) & ringMask) | 0;
      st.ringCount = (st.ringCount + count) | 0;
    }

    function pokeyAudioRingRead(st, out, count) {
      if (!st || !out || !count) return 0;
      var ring = st.ring;
      if (!ring || !ring.length) return 0;

      var ringSize = st.ringSize | 0;
      var ringMask = st.ringMask | 0;
      var avail = st.ringCount | 0;
      var toRead = count < avail ? count : avail;

      var first = toRead;
      var toEnd = ringSize - (st.ringRead | 0);
      if (first > toEnd) first = toEnd;
      out.set(ring.subarray(st.ringRead | 0, (st.ringRead + first) | 0), 0);
      var second = toRead - first;
      if (second) out.set(ring.subarray(0, second), first);

      st.ringRead = ((st.ringRead + toRead) & ringMask) | 0;
      st.ringCount = (st.ringCount - toRead) | 0;
      return toRead | 0;
    }

    function pokeyAudioDrain(st, maxSamples) {
      if (!st) return null;
      var n = st.ringCount | 0;
      if (n <= 0) return null;
      if (maxSamples && n > maxSamples) n = maxSamples | 0;
      var out = new Float32Array(n);
      var got = pokeyAudioRingRead(st, out, n);
      if (got !== n) out = out.subarray(0, got);
      return out;
    }

    function pokeyAudioClear(st) {
      if (!st) return;
      st.ringRead = 0;
      st.ringWrite = 0;
      st.ringCount = 0;
      st.lastSample = 0.0;
    }

    function pokeyAudioResetState(st) {
      if (!st) return;
      st.lastCycle = 0;
      st.samplePhaseFp = 0;
      st.sampleAccum = 0;
      st.sampleAccumCount = 0;
      st.mixGain = POKEY_MIX_GAIN;
      st.dcBlockX1 = 0.0;
      st.dcBlockY1 = 0.0;
      st.lfsr17 = 0x1ffff;
      st.lfsr9 = 0x01ff;
      st.lfsr5 = 0x00;
      st.lfsr4 = 0x00;
      st.hp1Latch = 0;
      st.hp2Latch = 0;
      st.audctl = 0x00;
      st.skctl = 0x00;
      for (var i = 0; i < 4; i++) {
        var ch = st.channels[i];
        ch.audf = 0;
        ch.audc = 0;
        ch.counter = 1;
        ch.output = 0;
        ch.clkDivCycles = 28;
        ch.clkAccCycles = 0;
      }
      pokeyAudioRecomputeClocks(st.channels, st.audctl);
      pokeyAudioClear(st);
    }

    function pokeyAudioRecomputeClocks(channels, audctl) {
      var base = audctl & 0x01 ? CYCLES_PER_LINE : 28;
      channels[0].clkDivCycles = audctl & 0x40 ? 1 : base;
      channels[1].clkDivCycles = base;
      channels[2].clkDivCycles = audctl & 0x20 ? 1 : base;
      channels[3].clkDivCycles = base;
    }

    function pokeyAudioPolyStep(st) {
      // Matches PokeyAudio_PolyStep() in Pokey.c.
      var l4 = st.lfsr4 & 0x0f;
      var l5 = st.lfsr5 & 0x1f;
      var new4 = ~(((l4 >>> 2) ^ (l4 >>> 3)) & 1) & 1;
      var new5 = ~(((l5 >>> 2) ^ (l5 >>> 4)) & 1) & 1;
      st.lfsr4 = ((l4 << 1) | new4) & 0x0f;
      st.lfsr5 = ((l5 << 1) | new5) & 0x1f;

      var l9 = st.lfsr9 & 0x1ff;
      var in9 = ((l9 >>> 0) ^ (l9 >>> 5)) & 1;
      st.lfsr9 = ((l9 >>> 1) | (in9 << 8)) & 0x1ff;

      var l17 = st.lfsr17 & 0x1ffff;
      var in8 = ((l17 >>> 8) ^ (l17 >>> 13)) & 1;
      var in0 = l17 & 1;
      l17 = l17 >>> 1;
      l17 = (l17 & 0xff7f) | (in8 << 7);
      l17 = (l17 & 0xffff) | (in0 << 16);
      st.lfsr17 = l17 & 0x1ffff;
    }

    function pokeyAudioPoly17Bit(st, audctl) {
      return (audctl & 0x80 ? st.lfsr9 : st.lfsr17) & 1 & 1;
    }

    function pokeyAudioChannelClockOut(st, ch, audctl) {
      var audc = ch.audc & 0xff;
      var volOnly = (audc & 0x10) !== 0;
      if (volOnly) {
        ch.output = 1;
        return;
      }

      var dist = (audc >>> 5) & 0x07;
      if (dist <= 3) {
        if ((st.lfsr5 & 1) === 0) return;
      }

      switch (dist) {
        case 0:
        case 4:
          ch.output = pokeyAudioPoly17Bit(st, audctl) & 1;
          break;
        case 2:
        case 6:
          ch.output = st.lfsr4 & 1;
          break;
        default:
          ch.output = (ch.output ^ 1) & 1;
          break;
      }
    }

    function pokeyAudioChannelTick(st, ch, audctl) {
      if (ch.counter > 0) ch.counter = (ch.counter - 1) | 0;
      if (ch.counter !== 0) return 0;

      var reload = ((ch.audf & 0xff) + 1) | 0;
      if (ch === st.channels[0] && audctl & 0x40)
        reload = ((ch.audf & 0xff) + 4) | 0;
      if (ch === st.channels[2] && audctl & 0x20)
        reload = ((ch.audf & 0xff) + 4) | 0;
      if (!reload) reload = 1;
      ch.counter = reload;

      pokeyAudioChannelClockOut(st, ch, audctl);
      return 1;
    }

    function pokeyAudioPairTick(st, chLow, chHigh, audctl) {
      var period = (((chHigh.audf & 0xff) << 8) | (chLow.audf & 0xff)) >>> 0;

      if (chHigh.counter > 0) chHigh.counter = (chHigh.counter - 1) | 0;
      if (chHigh.counter !== 0) return 0;

      var reload = (period + 1) >>> 0;
      if (chLow === st.channels[0] && audctl & 0x40)
        reload = (period + 7) >>> 0;
      if (chLow === st.channels[2] && audctl & 0x20)
        reload = (period + 7) >>> 0;
      if (!reload) reload = 1;
      chHigh.counter = reload | 0;

      pokeyAudioChannelClockOut(st, chHigh, audctl);
      return 1;
    }

    function pokeyAudioStepCpuCycle(st) {
      if ((st.skctl & 0x03) === 0) return;

      var audctl = st.audctl & 0xff;
      var pair12 = (audctl & 0x10) !== 0;
      var pair34 = (audctl & 0x08) !== 0;
      var pulse2 = 0;
      var pulse3 = 0;

      pokeyAudioPolyStep(st);

      if (pair12) {
        if (st.channels[0].clkDivCycles === 1) {
          pokeyAudioPairTick(st, st.channels[0], st.channels[1], audctl);
        } else {
          st.channels[0].clkAccCycles = (st.channels[0].clkAccCycles + 1) | 0;
          if (st.channels[0].clkAccCycles >= st.channels[0].clkDivCycles) {
            st.channels[0].clkAccCycles =
              (st.channels[0].clkAccCycles - st.channels[0].clkDivCycles) | 0;
            pokeyAudioPairTick(st, st.channels[0], st.channels[1], audctl);
          }
        }
      } else {
        for (var i = 0; i < 2; i++) {
          var ch = st.channels[i];
          if (ch.clkDivCycles === 1) {
            pokeyAudioChannelTick(st, ch, audctl);
            continue;
          }
          ch.clkAccCycles = (ch.clkAccCycles + 1) | 0;
          if (ch.clkAccCycles >= ch.clkDivCycles) {
            ch.clkAccCycles = (ch.clkAccCycles - ch.clkDivCycles) | 0;
            pokeyAudioChannelTick(st, ch, audctl);
          }
        }
      }

      if (pair34) {
        if (st.channels[2].clkDivCycles === 1) {
          pulse3 = pokeyAudioPairTick(
            st,
            st.channels[2],
            st.channels[3],
            audctl,
          );
          pulse2 = pulse3;
        } else {
          st.channels[2].clkAccCycles = (st.channels[2].clkAccCycles + 1) | 0;
          if (st.channels[2].clkAccCycles >= st.channels[2].clkDivCycles) {
            st.channels[2].clkAccCycles =
              (st.channels[2].clkAccCycles - st.channels[2].clkDivCycles) | 0;
            pulse3 = pokeyAudioPairTick(
              st,
              st.channels[2],
              st.channels[3],
              audctl,
            );
            pulse2 = pulse3;
          }
        }
      } else {
        for (var j = 2; j < 4; j++) {
          var ch2 = st.channels[j];
          if (ch2.clkDivCycles === 1) {
            var pulse = pokeyAudioChannelTick(st, ch2, audctl);
            if (j === 2) pulse2 = pulse;
            else pulse3 = pulse;
            continue;
          }
          ch2.clkAccCycles = (ch2.clkAccCycles + 1) | 0;
          if (ch2.clkAccCycles >= ch2.clkDivCycles) {
            ch2.clkAccCycles = (ch2.clkAccCycles - ch2.clkDivCycles) | 0;
            var pulseOut = pokeyAudioChannelTick(st, ch2, audctl);
            if (j === 2) pulse2 = pulseOut;
            else pulse3 = pulseOut;
          }
        }
      }

      if (pulse2 && audctl & 0x04) st.hp1Latch = st.channels[0].output & 1;
      if (pulse3 && audctl & 0x02) st.hp2Latch = st.channels[1].output & 1;
    }

    function pokeyAudioMixCycleSample(st) {
      var audctl = st.audctl & 0xff;
      var pair12 = (audctl & 0x10) !== 0;
      var pair34 = (audctl & 0x08) !== 0;
      var sum = 0;

      for (var i = 0; i < 4; i++) {
        if (i === 0 && pair12) continue;
        if (i === 2 && pair34) continue;

        var ch = st.channels[i];
        var audc = ch.audc & 0xff;
        var vol = audc & 0x0f;
        if (!vol) continue;

        var volOnly = (audc & 0x10) !== 0;
        var bit = volOnly ? 1 : ch.output & 1;

        if (!volOnly) {
          if (i === 0 && audctl & 0x04) bit ^= st.hp1Latch & 1;
          if (i === 1 && audctl & 0x02) bit ^= st.hp2Latch & 1;
        }

        sum += bit * vol;
      }

      if (sum < 0) sum = 0;
      if (sum > 60) sum = 60;

      // Keep a centered raw mix in [-0.5..+0.5]. Gain and DC filtering are applied
      // after resampling so they operate in the final audio sample domain.
      return (sum - 30) / 60;
    }

    function pokeyAudioNextPulseCycles(counter, clockCh) {
      var c = counter | 0;
      if (c < 1) c = 1;
      var div = clockCh.clkDivCycles | 0;
      if (div <= 1) return c;
      var acc = clockCh.clkAccCycles | 0;
      var firstTick = (div - acc) | 0;
      if (firstTick < 1) firstTick = 1;
      return firstTick + (c - 1) * div;
    }

    function pokeyAudioCyclesUntilNextEvent(st) {
      var audctl = st.audctl & 0xff;
      var pair12 = (audctl & 0x10) !== 0;
      var pair34 = (audctl & 0x08) !== 0;
      var next = 0x7fffffff;

      if (pair12) {
        var n12 = pokeyAudioNextPulseCycles(
          st.channels[1].counter | 0,
          st.channels[0],
        );
        if (n12 < next) next = n12;
      } else {
        var n0 = pokeyAudioNextPulseCycles(
          st.channels[0].counter | 0,
          st.channels[0],
        );
        var n1 = pokeyAudioNextPulseCycles(
          st.channels[1].counter | 0,
          st.channels[1],
        );
        if (n0 < next) next = n0;
        if (n1 < next) next = n1;
      }

      if (pair34) {
        var n34 = pokeyAudioNextPulseCycles(
          st.channels[3].counter | 0,
          st.channels[2],
        );
        if (n34 < next) next = n34;
      } else {
        var n2 = pokeyAudioNextPulseCycles(
          st.channels[2].counter | 0,
          st.channels[2],
        );
        var n3 = pokeyAudioNextPulseCycles(
          st.channels[3].counter | 0,
          st.channels[3],
        );
        if (n2 < next) next = n2;
        if (n3 < next) next = n3;
      }

      if (next < 1) next = 1;
      return next;
    }

    function pokeyAudioAdvanceClockNoPulse(ch, cycles) {
      if (!cycles) return 0;
      var div = ch.clkDivCycles | 0;
      if (div <= 1) return cycles;
      var acc = (ch.clkAccCycles | 0) + cycles;
      var ticks = Math.floor(acc / div);
      ch.clkAccCycles = (acc - ticks * div) | 0;
      return ticks;
    }

    function pokeyAudioCounterDecrementNoPulse(counter, ticks) {
      if (!ticks) return counter | 0;
      var next = (counter | 0) - (ticks | 0);
      if (next < 1) next = 1;
      return next | 0;
    }

    function pokeyAudioPolyAdvance(st, n) {
      // Advance each LFSR by n steps using modular reduction by its period.
      // Periods: lfsr4=15, lfsr5=31, lfsr9=511, lfsr17=131071.
      var n4 = n % 15;
      for (var i4 = 0; i4 < n4; i4++) {
        var l4 = st.lfsr4 & 0x0f;
        st.lfsr4 = ((l4 << 1) | (~(((l4 >>> 2) ^ (l4 >>> 3)) & 1) & 1)) & 0x0f;
      }
      var n5 = n % 31;
      for (var i5 = 0; i5 < n5; i5++) {
        var l5 = st.lfsr5 & 0x1f;
        st.lfsr5 = ((l5 << 1) | (~(((l5 >>> 2) ^ (l5 >>> 4)) & 1) & 1)) & 0x1f;
      }
      var n9 = n % 511;
      for (var i9 = 0; i9 < n9; i9++) {
        var l9 = st.lfsr9 & 0x1ff;
        st.lfsr9 =
          ((l9 >>> 1) | ((((l9 >>> 0) ^ (l9 >>> 5)) & 1) << 8)) & 0x1ff;
      }
      var n17 = n % 131071;
      for (var i17 = 0; i17 < n17; i17++) {
        var l17 = st.lfsr17 & 0x1ffff;
        var in8 = ((l17 >>> 8) ^ (l17 >>> 13)) & 1;
        var in0 = l17 & 1;
        l17 = l17 >>> 1;
        l17 = (l17 & 0xff7f) | (in8 << 7);
        st.lfsr17 = ((l17 & 0xffff) | (in0 << 16)) & 0x1ffff;
      }
    }

    function pokeyAudioFastForwardNoPulse(st, cycles) {
      if (!cycles) return;
      var n = cycles;
      if (n < 1) return;

      pokeyAudioPolyAdvance(st, n);

      var audctl = st.audctl & 0xff;
      var pair12 = (audctl & 0x10) !== 0;
      var pair34 = (audctl & 0x08) !== 0;

      if (pair12) {
        var ticks12 = pokeyAudioAdvanceClockNoPulse(st.channels[0], n);
        st.channels[1].counter = pokeyAudioCounterDecrementNoPulse(
          st.channels[1].counter,
          ticks12,
        );
      } else {
        for (var c = 0; c < 2; c++) {
          var ch = st.channels[c];
          var ticks = pokeyAudioAdvanceClockNoPulse(ch, n);
          ch.counter = pokeyAudioCounterDecrementNoPulse(ch.counter, ticks);
        }
      }

      if (pair34) {
        var ticks34 = pokeyAudioAdvanceClockNoPulse(st.channels[2], n);
        st.channels[3].counter = pokeyAudioCounterDecrementNoPulse(
          st.channels[3].counter,
          ticks34,
        );
      } else {
        for (var c2 = 2; c2 < 4; c2++) {
          var ch2 = st.channels[c2];
          var ticks2 = pokeyAudioAdvanceClockNoPulse(ch2, n);
          ch2.counter = pokeyAudioCounterDecrementNoPulse(ch2.counter, ticks2);
        }
      }
    }

    function pokeyAudioFinalizeSample(st, sample) {
      var out = sample * st.mixGain;
      out = pokeyAudioApplyDcBlock(st, out);
      if (out > 1.0) out = 1.0;
      else if (out < -1.0) out = -1.0;
      return out;
    }

    function pokeyAudioReloadDividerCounters(st) {
      if (!st) return;

      if (st.audctl & 0x10) {
        var p12 =
          (((st.channels[1].audf & 0xff) << 8) |
            (st.channels[0].audf & 0xff)) >>>
          0;
        st.channels[1].counter = st.audctl & 0x40 ? p12 + 7 : p12 + 1;
      } else {
        st.channels[0].counter =
          st.audctl & 0x40
            ? (st.channels[0].audf & 0xff) + 4
            : (st.channels[0].audf & 0xff) + 1;
        st.channels[1].counter = ((st.channels[1].audf & 0xff) + 1) | 0;
      }

      if (st.audctl & 0x08) {
        var p34 =
          (((st.channels[3].audf & 0xff) << 8) |
            (st.channels[2].audf & 0xff)) >>>
          0;
        st.channels[3].counter = st.audctl & 0x20 ? p34 + 7 : p34 + 1;
      } else {
        st.channels[2].counter =
          st.audctl & 0x20
            ? (st.channels[2].audf & 0xff) + 4
            : (st.channels[2].audf & 0xff) + 1;
        st.channels[3].counter = ((st.channels[3].audf & 0xff) + 1) | 0;
      }
    }

    function pokeyAudioOnRegisterWrite(st, addr, v) {
      if (!st) return;
      var ch;

      switch (addr & 0xffff) {
        case IO_AUDF1_POT0:
          ch = st.channels[0];
          ch.audf = v & 0xff;
          ch.counter = st.audctl & 0x40 ? (v & 0xff) + 4 : (v & 0xff) + 1;
          if (st.audctl & 0x10) {
            var period12 =
              (((st.channels[1].audf & 0xff) << 8) | (v & 0xff)) >>> 0;
            st.channels[1].counter =
              st.audctl & 0x40 ? period12 + 7 : period12 + 1;
          }
          break;
        case IO_AUDF2_POT2:
          ch = st.channels[1];
          ch.audf = v & 0xff;
          ch.counter = ((v & 0xff) + 1) | 0;
          if (st.audctl & 0x10) {
            var period12b =
              (((v & 0xff) << 8) | (st.channels[0].audf & 0xff)) >>> 0;
            st.channels[1].counter =
              st.audctl & 0x40 ? period12b + 7 : period12b + 1;
          }
          break;
        case IO_AUDF3_POT4:
          ch = st.channels[2];
          ch.audf = v & 0xff;
          ch.counter = st.audctl & 0x20 ? (v & 0xff) + 4 : (v & 0xff) + 1;
          if (st.audctl & 0x08) {
            var period34 =
              (((st.channels[3].audf & 0xff) << 8) | (v & 0xff)) >>> 0;
            st.channels[3].counter =
              st.audctl & 0x20 ? period34 + 7 : period34 + 1;
          }
          break;
        case IO_AUDF4_POT6:
          ch = st.channels[3];
          ch.audf = v & 0xff;
          ch.counter = ((v & 0xff) + 1) | 0;
          if (st.audctl & 0x08) {
            var period34b =
              (((v & 0xff) << 8) | (st.channels[2].audf & 0xff)) >>> 0;
            st.channels[3].counter =
              st.audctl & 0x20 ? period34b + 7 : period34b + 1;
          }
          break;

        case IO_AUDC1_POT1:
          st.channels[0].audc = v & 0xff;
          break;
        case IO_AUDC2_POT3:
          st.channels[1].audc = v & 0xff;
          break;
        case IO_AUDC3_POT5:
          st.channels[2].audc = v & 0xff;
          break;
        case IO_AUDC4_POT7:
          st.channels[3].audc = v & 0xff;
          break;

        case IO_AUDCTL_ALLPOT: {
          st.audctl = v & 0xff;
          pokeyAudioRecomputeClocks(st.channels, st.audctl);
          pokeyAudioReloadDividerCounters(st);
          break;
        }

        case IO_STIMER_KBCODE: {
          // STIMER restarts POKEY timers/dividers and is used for phase sync.
          for (var r = 0; r < 4; r++) st.channels[r].clkAccCycles = 0;
          pokeyAudioReloadDividerCounters(st);
          break;
        }

        case IO_SKCTL_SKSTAT: {
          var oldSk = st.skctl & 0xff;
          st.skctl = v & 0xff;
          if ((oldSk ^ st.skctl) & 0x03 && (st.skctl & 0x03) === 0) {
            // Hold RNG/audio in reset: restart polynomials and prescalers.
            st.lfsr17 = 0x1ffff;
            st.lfsr9 = 0x01ff;
            st.lfsr5 = 0x00;
            st.lfsr4 = 0x00;
            for (var i = 0; i < 4; i++) st.channels[i].clkAccCycles = 0;
            st.hp1Latch = 0;
            st.hp2Latch = 0;
          }
          break;
        }

        default:
          break;
      }
    }

    function pokeyAudioSync(ctx, st, cycleCounter) {
      if (!ctx || !st) return;
      if (!ctx.ioData) return;

      var target = cycleCounter;

      if (target <= st.lastCycle) return;

      var tmp = st._tmpOut;
      if (!tmp || tmp.length !== 512) tmp = st._tmpOut = new Float32Array(512);

      var tmpCount = 0;
      var cur = st.lastCycle;
      var cpsBase = st.cyclesPerSampleFpBase || st.cyclesPerSampleFp;
      var cps = cpsBase;
      var targetFill = st.targetBufferSamples | 0;
      if (targetFill <= 0) targetFill = 1;
      var fillLevel = st.ringCount | 0;
      var fillDelta = fillLevel - targetFill;
      if (fillDelta > targetFill) fillDelta = targetFill;
      else if (fillDelta < -targetFill) fillDelta = -targetFill;
      var maxAdjust = Math.floor(cpsBase / POKEY_AUDIO_MAX_ADJUST_DIVISOR);
      if (maxAdjust < 1) maxAdjust = 1;
      var adjust = Math.trunc((fillDelta * maxAdjust) / targetFill);
      cps = cpsBase + adjust;
      if (cps < cpsBase - maxAdjust) cps = cpsBase - maxAdjust;
      else if (cps > cpsBase + maxAdjust) cps = cpsBase + maxAdjust;
      if (cps < 1) cps = 1;
      st.cyclesPerSampleFp = cps;
      var samplePhase = st.samplePhaseFp;
      if (target - cur > POKEY_AUDIO_MAX_CATCHUP_CYCLES) {
        cur = target - POKEY_AUDIO_MAX_CATCHUP_CYCLES;
      }

      while (cur < target) {
        var remaining = target - cur;
        var runCycles = remaining;
        var nextEvent = 0;
        var skctlRun = st.skctl & 0x03;
        if (skctlRun !== 0) {
          nextEvent = pokeyAudioCyclesUntilNextEvent(st);
          if (nextEvent < runCycles) runCycles = nextEvent;
        }

        var level = pokeyAudioMixCycleSample(st);
        var left = runCycles;

        while (left > 0) {
          var cyclesUntilSample =
            ((cps - samplePhase + POKEY_FP_ONE - 1) / POKEY_FP_ONE) | 0;
          if (cyclesUntilSample < 1) cyclesUntilSample = 1;
          var batch = left < cyclesUntilSample ? left : cyclesUntilSample;

          st.sampleAccum += level * batch;
          st.sampleAccumCount = (st.sampleAccumCount + batch) | 0;
          samplePhase += POKEY_FP_ONE * batch;
          left -= batch;

          while (samplePhase >= cps) {
            if (st.sampleAccumCount > 0) {
              tmp[tmpCount++] = pokeyAudioFinalizeSample(
                st,
                st.sampleAccum / st.sampleAccumCount,
              );
              st.sampleAccum = 0;
              st.sampleAccumCount = 0;
            } else {
              tmp[tmpCount++] = pokeyAudioFinalizeSample(st, level);
            }
            samplePhase -= cps;
            if (tmpCount === tmp.length) {
              pokeyAudioRingWrite(st, tmp, tmpCount);
              tmpCount = 0;
            }
          }
        }

        if (skctlRun !== 0) {
          var hitEvent = nextEvent > 0 && runCycles === nextEvent;
          if (hitEvent) {
            if (runCycles > 1) pokeyAudioFastForwardNoPulse(st, runCycles - 1);
            pokeyAudioStepCpuCycle(st);
          } else {
            pokeyAudioFastForwardNoPulse(st, runCycles);
          }
        }

        cur += runCycles;
      }

      if (tmpCount) pokeyAudioRingWrite(st, tmp, tmpCount);

      st.samplePhaseFp = samplePhase;
      st.lastCycle = target;
    }

    function pokeyAudioConsume(st, out) {
      if (!st || !out) return;
      var got = pokeyAudioRingRead(st, out, out.length | 0);
      if (got > 0) st.lastSample = out[got - 1] || 0.0;
      var hold = st.lastSample || 0.0;
      for (var i = got; i < out.length; i++) {
        out[i] = hold;
      }
      st.lastSample = hold || 0.0;
    }

    function pokeyStepLfsr17(io) {
      // Matches the poly17 step used in PokeyAudio_PolyStep() (Pokey.c).
      var l17 = io.pokeyLfsr17 & 0x1ffff;
      var in8 = ((l17 >> 8) ^ (l17 >> 13)) & 1;
      var in0 = l17 & 1;
      l17 = l17 >>> 1;
      l17 = (l17 & 0xff7f) | (in8 << 7);
      l17 = (l17 & 0xffff) | (in0 << 16);
      io.pokeyLfsr17 = l17 & 0x1ffff;
      return io.pokeyLfsr17 & 0xff;
    }

    function pokeySyncLfsr17(ctx) {
      var io = ctx.ioData;
      var now = ctx.cycleCounter;

      // Keep RANDOM consistent with the audio poly state when audio is enabled.
      if (io.pokeyAudio) {
        pokeyAudioSync(ctx, io.pokeyAudio, now);
        io.pokeyLfsr17 = io.pokeyAudio.lfsr17 & 0x1ffff;
        io.pokeyLfsr17LastCycle = now;
        return;
      }

      var skctl = ctx.sram[IO_SKCTL_SKSTAT] & 0xff;
      if ((skctl & 0x03) === 0) {
        // SKCTL bits0..1 == 0 holds RNG/audio in reset.
        io.pokeyLfsr17 = 0x1ffff;
        io.pokeyLfsr17LastCycle = now;
        return;
      }

      var last = io.pokeyLfsr17LastCycle;
      if (last > now) last = now;
      var delta = now - last;

      while (delta > 0) {
        pokeyStepLfsr17(io);
        delta--;
      }

      io.pokeyLfsr17LastCycle = now;
    }

    // --- POKEY pot scan (POT0..POT7 / ALLPOT) ---
    var POKEY_POT_MAX = 228;
    var POKEY_POT_CYCLES_PER_COUNT = 28; // ~64kHz at PAL CPU clock.

    function pokeyPotStartScan(ctx) {
      var io = ctx.ioData;
      if (!io) return;
      io.pokeyPotScanActive = true;
      io.pokeyPotScanStartCycle = ctx.cycleCounter;
      io.pokeyPotAllPot = 0xff;
      io.pokeyPotLatched.fill(0);

      // Reset visible pot counters (read-side).
      for (var i = 0; i < 8; i++) ctx.ram[(IO_AUDF1_POT0 + i) & 0xffff] = 0x00;
      ctx.ram[IO_AUDCTL_ALLPOT] = 0xff;
    }

    function pokeyPotUpdate(ctx) {
      var io = ctx.ioData;
      if (!io || !io.pokeyPotScanActive) return;

      var elapsed = ctx.cycleCounter - io.pokeyPotScanStartCycle;
      if (elapsed < 0) elapsed = 0;
      var count = Math.floor(elapsed / POKEY_POT_CYCLES_PER_COUNT);
      if (count > 255) count = 255;

      var allpot = io.pokeyPotAllPot & 0xff;
      var anyPending = 0;

      for (var p = 0; p < 8; p++) {
        if (io.pokeyPotLatched[p]) continue;
        anyPending = 1;

        var target = io.pokeyPotValues[p] & 0xff;
        if (target > POKEY_POT_MAX) target = POKEY_POT_MAX;

        if (count >= target) {
          io.pokeyPotLatched[p] = 1;
          ctx.ram[(IO_AUDF1_POT0 + p) & 0xffff] = target & 0xff;
          allpot &= ~(1 << p);
        } else {
          var cur = count;
          if (cur > POKEY_POT_MAX) cur = POKEY_POT_MAX;
          ctx.ram[(IO_AUDF1_POT0 + p) & 0xffff] = cur & 0xff;
        }
      }

      io.pokeyPotAllPot = allpot & 0xff;
      ctx.ram[IO_AUDCTL_ALLPOT] = io.pokeyPotAllPot;

      if (!anyPending || (io.pokeyPotAllPot & 0xff) === 0)
        io.pokeyPotScanActive = false;
    }

    function pokeyTimerPeriodCpuCycles(ctx, timer) {
      var sram = ctx.sram;
      // Hold timers when POKEY clocks are in reset (SKCTL bits0..1 = 0).
      if ((sram[IO_SKCTL_SKSTAT] & 0x03) === 0) return 0;

      var audctl = sram[IO_AUDCTL_ALLPOT] & 0xff;
      var base = audctl & 0x01 ? CYCLES_PER_LINE : 28;

      var div, reload;
      if (timer === 1) {
        // In 16-bit mode (ch1+ch2), timer1 has no independent divider output.
        if (audctl & 0x10) return 0;
        if ((sram[IO_AUDF1_POT0] & 0xff) === 0) return 0;
        div = audctl & 0x40 ? 1 : base;
        reload = (sram[IO_AUDF1_POT0] & 0xff) + (audctl & 0x40 ? 4 : 1);
        return (reload * div) >>> 0;
      }

      if (timer === 2) {
        if ((sram[IO_AUDF2_POT2] & 0xff) === 0) return 0;
        if (audctl & 0x10) {
          var period12 =
            ((sram[IO_AUDF2_POT2] & 0xff) << 8) | (sram[IO_AUDF1_POT0] & 0xff);
          div = audctl & 0x40 ? 1 : base;
          reload = period12 + (audctl & 0x40 ? 7 : 1);
          return reload * div;
        }
        div = base;
        reload = (sram[IO_AUDF2_POT2] & 0xff) + 1;
        return (reload * div) >>> 0;
      }

      if (timer === 4) {
        if ((sram[IO_AUDF4_POT6] & 0xff) === 0) return 0;
        if (audctl & 0x08) {
          var period34 =
            ((sram[IO_AUDF4_POT6] & 0xff) << 8) | (sram[IO_AUDF3_POT4] & 0xff);
          div = audctl & 0x20 ? 1 : base;
          reload = period34 + (audctl & 0x20 ? 7 : 1);
          return reload * div;
        }
        div = base;
        reload = (sram[IO_AUDF4_POT6] & 0xff) + 1;
        return (reload * div) >>> 0;
      }

      return 0;
    }

    function pokeyRestartTimers(ctx) {
      var io = ctx.ioData;
      var now = ctx.cycleCounter;

      var p1 = pokeyTimerPeriodCpuCycles(ctx, 1);
      io.timer1Cycle = p1 ? now + p1 : CYCLE_NEVER;

      var p2 = pokeyTimerPeriodCpuCycles(ctx, 2);
      io.timer2Cycle = p2 ? now + p2 : CYCLE_NEVER;

      var p4 = pokeyTimerPeriodCpuCycles(ctx, 4);
      io.timer4Cycle = p4 ? now + p4 : CYCLE_NEVER;

      cycleTimedEventUpdate(ctx);
    }

    return {
      createState: pokeyAudioCreateState,
      setTargetBufferSamples: pokeyAudioSetTargetBufferSamples,
      setTurbo: pokeyAudioSetTurbo,
      drain: pokeyAudioDrain,
      clear: pokeyAudioClear,
      resetState: pokeyAudioResetState,
      onRegisterWrite: pokeyAudioOnRegisterWrite,
      sync: pokeyAudioSync,
      consume: pokeyAudioConsume,
      syncLfsr17: pokeySyncLfsr17,
      potStartScan: pokeyPotStartScan,
      potUpdate: pokeyPotUpdate,
      timerPeriodCpuCycles: pokeyTimerPeriodCpuCycles,
      restartTimers: pokeyRestartTimers,
      seroutWrite: pokeySioApi.seroutWrite,
      serinRead: pokeySioApi.serinRead,
    };
  }

  window.A8EPokeyAudio = {
    createApi: createApi,
  };
})();
