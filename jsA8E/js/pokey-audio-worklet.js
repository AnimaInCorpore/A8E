(function () {
  "use strict";

  function countQueuedSamples(queue, queueIndex) {
    if (!queue.length) return 0;
    var total = ((queue[0].length | 0) - (queueIndex | 0)) | 0;
    if (total < 0) total = 0;
    for (var i = 1; i < queue.length; i++) total += queue[i].length | 0;
    return total | 0;
  }

  function clampQueueSamples(queue, queueIndex, maxSamples) {
    if (!queue.length) return queueIndex | 0;
    if (!maxSamples) return queueIndex | 0;

    var total = countQueuedSamples(queue, queueIndex);
    if (total <= maxSamples) return queueIndex | 0;

    // Drop oldest samples, partially trimming the head buffer when possible.
    var toDrop = (total - maxSamples) | 0;
    while (queue.length && toDrop > 0) {
      var head = queue[0];
      var start = queueIndex | 0;
      var avail = ((head.length | 0) - start) | 0;
      if (avail <= 0) {
        queue.shift();
        queueIndex = 0;
        continue;
      }
      if (avail <= toDrop) {
        queue.shift();
        queueIndex = 0;
        toDrop -= avail;
        continue;
      }
      queueIndex = (start + toDrop) | 0;
      toDrop = 0;
    }

    if (!queue.length) queueIndex = 0;
    return queueIndex | 0;
  }

  // A tiny sample-queue AudioWorkletProcessor. The emulator thread pushes
  // Float32Array chunks via postMessage({type:"samples", samples}).
  class A8ESampleQueueProcessor extends AudioWorkletProcessor {
    constructor() {
      super();
      this.queue = [];
      this.queueIndex = 0;
      this.lastSample = 0.0;
      this.maxQueuedSamples = (sampleRate | 0) * 1; // ~1s safety cap
      if (this.maxQueuedSamples <= 0) this.maxQueuedSamples = 48000;
      this.underrunDecay = 0.999;

      var self = this;
      this.port.onmessage = function (e) {
        var msg = e && e.data ? e.data : null;
        if (!msg || !msg.type) return;
        if (msg.type === "samples" && msg.samples && msg.samples.length) {
          var samples = msg.samples;
          if (!(samples instanceof Float32Array)) {
            if (ArrayBuffer.isView(samples) && samples.buffer) {
              samples = new Float32Array(samples.buffer, samples.byteOffset | 0, samples.length | 0);
            } else if (Array.isArray(samples)) {
              samples = new Float32Array(samples);
            } else {
              return;
            }
          }
          self.queue.push(samples);
          self.queueIndex = clampQueueSamples(self.queue, self.queueIndex, self.maxQueuedSamples);
          return;
        }
        if (msg.type === "clear") {
          self.queue.length = 0;
          self.queueIndex = 0;
          self.lastSample = 0.0;
          return;
        }
      };
    }

    process(inputs, outputs, parameters) {
      var out = outputs[0] && outputs[0][0];
      if (!out) return true;

      var i = 0;
      while (i < out.length) {
        if (!this.queue.length) {
          out[i++] = this.lastSample;
          this.lastSample *= this.underrunDecay;
          continue;
        }

        var buf = this.queue[0];
        if (!buf || typeof buf.length !== "number") {
          this.queue.shift();
          this.queueIndex = 0;
          continue;
        }
        var avail = (buf.length | 0) - (this.queueIndex | 0);
        if (avail <= 0) {
          this.queue.shift();
          this.queueIndex = 0;
          continue;
        }

        var toCopy = out.length - i;
        if (toCopy > avail) toCopy = avail;
        var start = this.queueIndex | 0;
        var end = (this.queueIndex + toCopy) | 0;
        if (buf.subarray) {
          out.set(buf.subarray(start, end), i);
        } else {
          for (var j = 0; j < toCopy; j++) out[i + j] = buf[start + j] || 0.0;
        }
        i += toCopy;
        this.queueIndex = (this.queueIndex + toCopy) | 0;

        if ((this.queueIndex | 0) >= (buf.length | 0)) {
          this.queue.shift();
          this.queueIndex = 0;
        }
      }

      this.lastSample = out[out.length - 1] || 0.0;
      return true;
    }
  }

  registerProcessor("a8e-sample-queue", A8ESampleQueueProcessor);
})();
