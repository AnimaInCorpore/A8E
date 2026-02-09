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
    var IO_SEROUT_SERIN = cfg.IO_SEROUT_SERIN;

    var CYCLE_NEVER = cfg.CYCLE_NEVER;
    var SERIAL_OUTPUT_DATA_NEEDED_CYCLES = cfg.SERIAL_OUTPUT_DATA_NEEDED_CYCLES;
    var SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES = cfg.SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
    var SERIAL_INPUT_FIRST_DATA_READY_CYCLES = cfg.SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
    var SERIAL_INPUT_DATA_READY_CYCLES = cfg.SERIAL_INPUT_DATA_READY_CYCLES;

    var cycleTimedEventUpdate = cfg.cycleTimedEventUpdate;

// --- POKEY audio (ported from Pokey.c; still simplified, but cycle-based) ---
var POKEY_FP_ONE = 4294967296; // 1<<32 as an exact integer.

function pokeyAudioCreateState(sampleRate) {
  var ringSize = 8192; // power-of-two
  var st = {
    sampleRate: sampleRate || 48000,
    cpuHzBase: ATARI_CPU_HZ_PAL,
    cpuHz: ATARI_CPU_HZ_PAL,
    cyclesPerSampleFp: 0,
    cyclesPerSampleFpBase: 0,
    targetBufferSamples: 2048,
    lastCycle: 0,
    samplePhaseFp: 0,

    lfsr17: 0x1ffff,
    lfsr9: 0x01ff,
    lfsr5: 0x00,
    lfsr4: 0x00,
    hp1Latch: 0,
    hp2Latch: 0,

    audctl: 0x00,
    skctl: 0x00,

    channels: [
      { audf: 0, audc: 0, counter: 1, output: 0, clkDivCycles: 28, clkAccCycles: 0 },
      { audf: 0, audc: 0, counter: 1, output: 0, clkDivCycles: 28, clkAccCycles: 0 },
      { audf: 0, audc: 0, counter: 1, output: 0, clkDivCycles: 28, clkAccCycles: 0 },
      { audf: 0, audc: 0, counter: 1, output: 0, clkDivCycles: 28, clkAccCycles: 0 },
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
  var new4 = (~(((l4 >>> 2) ^ (l4 >>> 3)) & 1)) & 1;
  var new5 = (~(((l5 >>> 2) ^ (l5 >>> 4)) & 1)) & 1;
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
  return ((audctl & 0x80 ? st.lfsr9 : st.lfsr17) & 1) & 1;
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
  if (ch === st.channels[0] && (audctl & 0x40)) reload = ((ch.audf & 0xff) + 4) | 0;
  if (ch === st.channels[2] && (audctl & 0x20)) reload = ((ch.audf & 0xff) + 4) | 0;
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
  if (chLow === st.channels[0] && (audctl & 0x40)) reload = (period + 7) >>> 0;
  if (chLow === st.channels[2] && (audctl & 0x20)) reload = (period + 7) >>> 0;
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
        st.channels[0].clkAccCycles = (st.channels[0].clkAccCycles - st.channels[0].clkDivCycles) | 0;
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
      pulse3 = pokeyAudioPairTick(st, st.channels[2], st.channels[3], audctl);
      pulse2 = pulse3;
    } else {
      st.channels[2].clkAccCycles = (st.channels[2].clkAccCycles + 1) | 0;
      if (st.channels[2].clkAccCycles >= st.channels[2].clkDivCycles) {
        st.channels[2].clkAccCycles = (st.channels[2].clkAccCycles - st.channels[2].clkDivCycles) | 0;
        pulse3 = pokeyAudioPairTick(st, st.channels[2], st.channels[3], audctl);
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

  if (pulse2 && (audctl & 0x04)) st.hp1Latch = st.channels[0].output & 1;
  if (pulse3 && (audctl & 0x02)) st.hp2Latch = st.channels[1].output & 1;
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
      if (i === 0 && (audctl & 0x04)) bit ^= st.hp1Latch & 1;
      if (i === 1 && (audctl & 0x02)) bit ^= st.hp2Latch & 1;
    }

    sum += bit * vol;
  }

  if (sum < 0) sum = 0;
  if (sum > 60) sum = 60;

  // Center for WebAudio (simple DC removal) while keeping peak-to-peak similar.
  return ((sum - 30) / 60) * 0.35;
}

function pokeyAudioReloadDividerCounters(st) {
  if (!st) return;

  if (st.audctl & 0x10) {
    var p12 = (((st.channels[1].audf & 0xff) << 8) | (st.channels[0].audf & 0xff)) >>> 0;
    st.channels[1].counter = (st.audctl & 0x40) ? (p12 + 7) : (p12 + 1);
  } else {
    st.channels[0].counter =
      (st.audctl & 0x40) ? ((st.channels[0].audf & 0xff) + 4) : ((st.channels[0].audf & 0xff) + 1);
    st.channels[1].counter = ((st.channels[1].audf & 0xff) + 1) | 0;
  }

  if (st.audctl & 0x08) {
    var p34 = (((st.channels[3].audf & 0xff) << 8) | (st.channels[2].audf & 0xff)) >>> 0;
    st.channels[3].counter = (st.audctl & 0x20) ? (p34 + 7) : (p34 + 1);
  } else {
    st.channels[2].counter =
      (st.audctl & 0x20) ? ((st.channels[2].audf & 0xff) + 4) : ((st.channels[2].audf & 0xff) + 1);
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
      ch.counter = (st.audctl & 0x40) ? ((v & 0xff) + 4) : ((v & 0xff) + 1);
      if (st.audctl & 0x10) {
        var period12 = (((st.channels[1].audf & 0xff) << 8) | (v & 0xff)) >>> 0;
        st.channels[1].counter = (st.audctl & 0x40) ? (period12 + 7) : (period12 + 1);
      }
      break;
    case IO_AUDF2_POT2:
      ch = st.channels[1];
      ch.audf = v & 0xff;
      ch.counter = ((v & 0xff) + 1) | 0;
      if (st.audctl & 0x10) {
        var period12b = (((v & 0xff) << 8) | (st.channels[0].audf & 0xff)) >>> 0;
        st.channels[1].counter = (st.audctl & 0x40) ? (period12b + 7) : (period12b + 1);
      }
      break;
    case IO_AUDF3_POT4:
      ch = st.channels[2];
      ch.audf = v & 0xff;
      ch.counter = (st.audctl & 0x20) ? ((v & 0xff) + 4) : ((v & 0xff) + 1);
      if (st.audctl & 0x08) {
        var period34 = (((st.channels[3].audf & 0xff) << 8) | (v & 0xff)) >>> 0;
        st.channels[3].counter = (st.audctl & 0x20) ? (period34 + 7) : (period34 + 1);
      }
      break;
    case IO_AUDF4_POT6:
      ch = st.channels[3];
      ch.audf = v & 0xff;
      ch.counter = ((v & 0xff) + 1) | 0;
      if (st.audctl & 0x08) {
        var period34b = (((v & 0xff) << 8) | (st.channels[2].audf & 0xff)) >>> 0;
        st.channels[3].counter = (st.audctl & 0x20) ? (period34b + 7) : (period34b + 1);
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
      if (((oldSk ^ st.skctl) & 0x03) && (st.skctl & 0x03) === 0) {
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
  var maxAdjust = Math.floor(cpsBase / 25); // +/-4%
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
    var level = pokeyAudioMixCycleSample(st);

    samplePhase += POKEY_FP_ONE;
    while (samplePhase >= cps) {
      tmp[tmpCount++] = level;
      samplePhase -= cps;
      if (tmpCount === tmp.length) {
        pokeyAudioRingWrite(st, tmp, tmpCount);
        tmpCount = 0;
      }
    }

    pokeyAudioStepCpuCycle(st);
    cur++;
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

function sioChecksum(buf, size) {
  var checksum = 0;
  for (var i = 0; i < size; i++) {
    var b = buf[i] & 0xff;
    checksum = (checksum + (((checksum + b) >> 8) & 0xff) + b) & 0xff;
  }
  return checksum & 0xff;
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

  if (!anyPending || (io.pokeyPotAllPot & 0xff) === 0) io.pokeyPotScanActive = false;
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
      var period12 = ((sram[IO_AUDF2_POT2] & 0xff) << 8) | (sram[IO_AUDF1_POT0] & 0xff);
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
      var period34 = ((sram[IO_AUDF4_POT6] & 0xff) << 8) | (sram[IO_AUDF3_POT4] & 0xff);
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

function pokeySeroutWrite(ctx, value) {
  var io = ctx.ioData;
  var now = ctx.cycleCounter;

  io.serialOutputNeedDataCycle = now + SERIAL_OUTPUT_DATA_NEEDED_CYCLES;
  cycleTimedEventUpdate(ctx);

  var buf = io.sioBuffer;
  var SIO_DATA_OFFSET = 32;

  function queueSerinResponse(size) {
    io.sioInSize = size | 0;
    io.sioInIndex = 0;
    io.serialInputDataReadyCycle = now + SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
    cycleTimedEventUpdate(ctx);
  }

  function diskSectorSize(disk) {
    var s = 128;
    if (disk && disk.length >= 6) {
      s = (disk[4] & 0xff) | ((disk[5] & 0xff) << 8);
      if (s !== 128 && s !== 256) s = 128;
    }
    return s;
  }

  function sectorBytesAndOffset(sectorIndex, sectorSize) {
    if (sectorIndex <= 0) return null;
    var bytes = sectorIndex < 4 ? 128 : sectorSize;
    var index = sectorIndex < 4 ? (sectorIndex - 1) * 128 : (sectorIndex - 4) * sectorSize + 128 * 3;
    var offset = 16 + index;
    return { bytes: bytes | 0, offset: offset | 0 };
  }

  // --- Data phase (write/put/verify) ---
  if ((io.sioOutPhase | 0) === 1) {
    var dataIndex = io.sioDataIndex | 0;
    buf[SIO_DATA_OFFSET + dataIndex] = value & 0xff;
    dataIndex = (dataIndex + 1) | 0;
    io.sioDataIndex = dataIndex;

    var expected = (io.sioPendingBytes | 0) + 1; // data + checksum
    if (dataIndex !== expected) return;

    io.serialOutputTransmissionDoneCycle = now + SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
    cycleTimedEventUpdate(ctx);

    var dataBytes = io.sioPendingBytes | 0;
    var provided = buf[SIO_DATA_OFFSET + dataBytes] & 0xff;
    var calculated = sioChecksum(buf.subarray(SIO_DATA_OFFSET, SIO_DATA_OFFSET + dataBytes), dataBytes);

    var disk = io.disk1;
    var diskSize = (io.disk1Size | 0) || (disk ? disk.length : 0);
    var sectorSize = diskSectorSize(disk);
    var si = sectorBytesAndOffset(io.sioPendingSector | 0, sectorSize);
    var cmd = io.sioPendingCmd & 0xff;

    if (calculated !== provided || !disk || !si || si.offset < 16 || si.offset + si.bytes > diskSize || si.bytes !== dataBytes) {
      buf[0] = "N".charCodeAt(0);
      queueSerinResponse(1);
    } else if (cmd === 0x56) {
      // VERIFY SECTOR: compare payload to current disk content.
      var ok = true;
      for (var vi = 0; vi < si.bytes; vi++) {
        if ((disk[si.offset + vi] & 0xff) !== (buf[SIO_DATA_OFFSET + vi] & 0xff)) {
          ok = false;
          break;
        }
      }
      buf[0] = "A".charCodeAt(0);
      buf[1] = ok ? "C".charCodeAt(0) : "E".charCodeAt(0);
      queueSerinResponse(2);
    } else {
      // WRITE / PUT: write sector payload.
      disk.set(buf.subarray(SIO_DATA_OFFSET, SIO_DATA_OFFSET + si.bytes), si.offset);
      buf[0] = "A".charCodeAt(0);
      buf[1] = "C".charCodeAt(0);
      queueSerinResponse(2);
    }

    // Reset state.
    io.sioOutPhase = 0;
    io.sioDataIndex = 0;
    io.sioPendingCmd = 0;
    io.sioPendingSector = 0;
    io.sioPendingBytes = 0;
    io.sioOutIndex = 0;
    return;
  }

  // --- Command phase ---
  var outIdx = io.sioOutIndex | 0;
  if (outIdx === 0) {
    if (value > 0 && value < 255) {
      buf[0] = value & 0xff;
      io.sioOutIndex = 1;
    }
    return;
  }

  buf[outIdx] = value & 0xff;
  outIdx = (outIdx + 1) | 0;
  io.sioOutIndex = outIdx;

  if (outIdx !== 5) return;

  // Reset outgoing command state (always, like the C emulator).
  io.sioOutIndex = 0;

  if (sioChecksum(buf, 4) !== (buf[4] & 0xff)) {
    buf[0] = "N".charCodeAt(0);
    queueSerinResponse(1);
    return;
  }

  io.serialOutputTransmissionDoneCycle = now + SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
  cycleTimedEventUpdate(ctx);

  var dev = buf[0] & 0xff;
  var cmd2 = buf[1] & 0xff;
  var aux1 = buf[2] & 0xff;
  var aux2 = buf[3] & 0xff;

  // Only D1: for now.
  if (dev !== 0x31) {
    buf[0] = "N".charCodeAt(0);
    queueSerinResponse(1);
    return;
  }

  var disk2 = io.disk1;
  var diskSize2 = (io.disk1Size | 0) || (disk2 ? disk2.length : 0);
  var sectorSize2 = diskSectorSize(disk2);

  if (cmd2 === 0x52) {
    // READ SECTOR
    var sectorIndex = (aux1 | (aux2 << 8)) & 0xffff;
    var si2 = sectorBytesAndOffset(sectorIndex, sectorSize2);
    if (!disk2 || !si2 || si2.offset < 16 || si2.offset + si2.bytes > diskSize2) {
      buf[0] = "N".charCodeAt(0);
      queueSerinResponse(1);
      return;
    }
    buf[0] = "A".charCodeAt(0);
    buf[1] = "C".charCodeAt(0);
    buf.set(disk2.subarray(si2.offset, si2.offset + si2.bytes), 2);
    buf[si2.bytes + 2] = sioChecksum(buf.subarray(2, 2 + si2.bytes), si2.bytes);
    queueSerinResponse(si2.bytes + 3);
    return;
  }

  if (cmd2 === 0x53) {
    // STATUS
    if (!disk2 || !disk2.length || disk2[0] === 0) {
      buf[0] = "N".charCodeAt(0);
      queueSerinResponse(1);
      return;
    }
    buf[0] = "A".charCodeAt(0);
    buf[1] = "C".charCodeAt(0);
    if (sectorSize2 === 128) {
      buf[2] = 0x10;
      buf[3] = 0x00;
      buf[4] = 0x01;
      buf[5] = 0x00;
      buf[6] = 0x11;
    } else {
      buf[2] = 0x30;
      buf[3] = 0x00;
      buf[4] = 0x01;
      buf[5] = 0x00;
      buf[6] = 0x31;
    }
    queueSerinResponse(7);
    return;
  }

  if (cmd2 === 0x57 || cmd2 === 0x50 || cmd2 === 0x56) {
    // WRITE / PUT / VERIFY SECTOR (expects a data frame).
    var sectorIndex2 = (aux1 | (aux2 << 8)) & 0xffff;
    var si3 = sectorBytesAndOffset(sectorIndex2, sectorSize2);
    if (!disk2 || !si3 || si3.offset < 16 || si3.offset + si3.bytes > diskSize2) {
      buf[0] = "N".charCodeAt(0);
      queueSerinResponse(1);
      return;
    }

    io.sioOutPhase = 1;
    io.sioDataIndex = 0;
    io.sioPendingCmd = cmd2 & 0xff;
    io.sioPendingSector = sectorIndex2 & 0xffff;
    io.sioPendingBytes = si3.bytes | 0;

    // ACK command frame; host will then send the data frame.
    buf[0] = "A".charCodeAt(0);
    queueSerinResponse(1);
    return;
  }

  if (cmd2 === 0x21) {
    // FORMAT: clear data area (very minimal).
    if (!disk2 || !diskSize2 || diskSize2 <= 16) {
      buf[0] = "N".charCodeAt(0);
      queueSerinResponse(1);
      return;
    }
    disk2.fill(0, 16);
    buf[0] = "A".charCodeAt(0);
    buf[1] = "C".charCodeAt(0);
    queueSerinResponse(2);
    return;
  }

  if (cmd2 === 0x55) {
    // MOTOR ON: no-op, but ACK.
    buf[0] = "A".charCodeAt(0);
    buf[1] = "C".charCodeAt(0);
    queueSerinResponse(2);
    return;
  }

  // Unsupported command.
  buf[0] = "N".charCodeAt(0);
  queueSerinResponse(1);
}

function pokeySerinRead(ctx) {
  var io = ctx.ioData;
  if ((io.sioInSize | 0) > 0) {
    var b = io.sioBuffer[io.sioInIndex & 0xffff] & 0xff;
    io.sioInIndex = (io.sioInIndex + 1) & 0xffff;
    io.sioInSize = (io.sioInSize - 1) | 0;
    ctx.ram[IO_SEROUT_SERIN] = b;

    if ((io.sioInSize | 0) > 0) {
      io.serialInputDataReadyCycle =
        ctx.cycleCounter + SERIAL_INPUT_DATA_READY_CYCLES;
      cycleTimedEventUpdate(ctx);
    } else {
      io.sioInIndex = 0;
    }
  }
  return ctx.ram[IO_SEROUT_SERIN] & 0xff;
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
      seroutWrite: pokeySeroutWrite,
      serinRead: pokeySerinRead
    };
  }

  window.A8EPokeyAudio = {
    createApi: createApi
  };
})();
