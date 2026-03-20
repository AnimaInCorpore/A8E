(function () {
  "use strict";

  function clamp16(value) {
    return (value | 0) & 0xffff;
  }

  function clamp8(value) {
    return (value | 0) & 0xff;
  }

  function toHex2(value) {
    return clamp8(value).toString(16).toUpperCase().padStart(2, "0");
  }

  function toHex4(value) {
    return clamp16(value).toString(16).toUpperCase().padStart(4, "0");
  }

  function bytesToHex(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += toHex2(bytes[i]);
    }
    return out;
  }

  function normalizeArtifactRange(entry, fallbackLabel) {
    if (entry === null || entry === undefined) return null;
    let start = 0;
    let length = 0;
    let label = fallbackLabel || "";
    if (Array.isArray(entry)) {
      if (entry.length < 2) return null;
      start = Number(entry[0]);
      length = Number(entry[1]);
      if (entry.length > 2 && typeof entry[2] === "string") {
        label = entry[2];
      }
    } else if (typeof entry === "object") {
      start = Number(entry.start);
      if (entry.length !== undefined && entry.length !== null) {
        length = Number(entry.length);
      } else if (entry.end !== undefined && entry.end !== null) {
        length = Number(entry.end) - start + 1;
      }
      if (typeof entry.label === "string" && entry.label.length) {
        label = entry.label;
      }
    } else {
      return null;
    }
    if (!isFinite(start) || !isFinite(length)) return null;
    start = start | 0;
    length = length | 0;
    if (start < 0 || start > 0xffff || length <= 0) return null;
    if (length > 0x10000) length = 0x10000;
    return {
      label: label || "range_" + toHex4(start),
      start: start & 0xffff,
      end: (start + length - 1) & 0xffff,
      length: length,
    };
  }

  function createCaptureCanvas(width, height) {
    const w = Math.max(0, width | 0);
    const h = Math.max(0, height | 0);
    if (typeof OffscreenCanvas === "function") {
      return new OffscreenCanvas(w, h);
    }
    if (typeof document !== "undefined" && document.createElement) {
      const canvasEl = document.createElement("canvas");
      canvasEl.width = w;
      canvasEl.height = h;
      return canvasEl;
    }
    return null;
  }

  function dataUrlToArrayBuffer(dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string") {
      return new ArrayBuffer(0);
    }
    const comma = dataUrl.indexOf(",");
    const base64 = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i) & 0xff;
    }
    return bytes.buffer;
  }

  async function captureScreenshot(video, blitViewportToImageData, width, height) {
    if (!video || typeof blitViewportToImageData !== "function") {
      throw new Error("A8E: screenshot capture unavailable");
    }
    const w = Math.max(0, width | 0);
    const h = Math.max(0, height | 0);
    const captureCanvas = createCaptureCanvas(w, h);
    if (!captureCanvas) {
      throw new Error("A8E: screenshot capture canvas unavailable");
    }
    const captureCtx = captureCanvas.getContext("2d", { alpha: false });
    if (!captureCtx || typeof captureCtx.createImageData !== "function") {
      throw new Error("A8E: screenshot capture context unavailable");
    }
    const imageData = captureCtx.createImageData(w, h);
    blitViewportToImageData(video, imageData);
    captureCtx.putImageData(imageData, 0, 0);

    if (typeof captureCanvas.convertToBlob === "function") {
      const blob = await captureCanvas.convertToBlob({ type: "image/png" });
      return {
        mimeType: "image/png",
        width: w,
        height: h,
        buffer: await blob.arrayBuffer(),
      };
    }

    if (typeof captureCanvas.toBlob === "function") {
      return new Promise(function (resolve, reject) {
        captureCanvas.toBlob(
          function (blob) {
            if (!blob) {
              reject(new Error("A8E: screenshot capture failed"));
              return;
            }
            blob
              .arrayBuffer()
              .then(function (buffer) {
                resolve({
                  mimeType: "image/png",
                  width: w,
                  height: h,
                  buffer: buffer,
                });
              })
              .catch(reject);
          },
          "image/png",
          1.0,
        );
      });
    }

    if (typeof captureCanvas.toDataURL === "function") {
      return {
        mimeType: "image/png",
        width: w,
        height: h,
        buffer: dataUrlToArrayBuffer(captureCanvas.toDataURL("image/png")),
      };
    }

    throw new Error("A8E: screenshot capture unsupported in this runtime");
  }

  function cloneVideoState(video) {
    if (!video || typeof video !== "object") return null;
    return {
      pixels: new Uint8Array(video.pixels),
      priority: new Uint16Array(video.priority),
      presentPixels: new Uint8Array(video.presentPixels || video.pixels),
      presentPriority: new Uint16Array(video.presentPriority || video.priority),
      playfieldScratchPixels: new Uint8Array(video.playfieldScratchPixels),
      playfieldScratchPriority: new Uint16Array(video.playfieldScratchPriority),
    };
  }

  function restorePriorityBuffer(target, source) {
    if (!source) return;

    const isView =
      typeof ArrayBuffer !== "undefined" &&
      typeof ArrayBuffer.isView === "function" &&
      ArrayBuffer.isView(source);

    if (source instanceof Uint16Array) {
      target.set(source.subarray(0, target.length), 0);
      return;
    }

    const bytes = isView
      ? new Uint8Array(source.buffer, source.byteOffset | 0, source.byteLength | 0)
      : new Uint8Array(source);

    if (bytes.byteLength >= target.length * 2 && (bytes.byteLength & 1) === 0) {
      const words = new Uint16Array(
        bytes.buffer,
        bytes.byteOffset | 0,
        (bytes.byteLength / 2) | 0,
      );
      target.set(words.subarray(0, target.length), 0);
      return;
    }

    const count = Math.min(bytes.length, target.length);
    for (let i = 0; i < count; i++) target[i] = bytes[i] & 0xff;
  }

  function restoreVideoState(video, snapshot) {
    if (!video || typeof video !== "object") return;
    const state = snapshot && typeof snapshot === "object" ? snapshot : {};

    video.pixels.fill(0);
    video.priority.fill(0);
    if (video.presentPixels) video.presentPixels.fill(0);
    if (video.presentPriority) video.presentPriority.fill(0);
    video.playfieldScratchPixels.fill(0);
    video.playfieldScratchPriority.fill(0);
    if (state.pixels) {
      video.pixels.set(new Uint8Array(state.pixels).subarray(0, video.pixels.length), 0);
    }
    if (state.priority) {
      restorePriorityBuffer(video.priority, state.priority);
    }
    if (state.presentPixels && video.presentPixels) {
      video.presentPixels.set(
        new Uint8Array(state.presentPixels).subarray(0, video.presentPixels.length),
        0,
      );
    } else if (state.pixels && video.presentPixels) {
      video.presentPixels.set(
        new Uint8Array(state.pixels).subarray(0, video.presentPixels.length),
        0,
      );
    }
    if (state.presentPriority && video.presentPriority) {
      restorePriorityBuffer(video.presentPriority, state.presentPriority);
    } else if (state.priority && video.presentPriority) {
      restorePriorityBuffer(video.presentPriority, state.priority);
    }
    if (state.playfieldScratchPixels) {
      video.playfieldScratchPixels.set(
        new Uint8Array(state.playfieldScratchPixels).subarray(
          0,
          video.playfieldScratchPixels.length,
        ),
        0,
      );
    }
    if (state.playfieldScratchPriority) {
      restorePriorityBuffer(video.playfieldScratchPriority, state.playfieldScratchPriority);
    }
  }

  function normalizeSnapshotTiming(options) {
    const opts = options && typeof options === "object" ? options : null;
    return opts && opts.timing === "exact" ? "exact" : "frame";
  }

  function alignSnapshotToFrameBoundary(context, options) {
    const timing = normalizeSnapshotTiming(options);
    const machine = context && context.machine ? context.machine : null;
    const CPU = context && context.CPU ? context.CPU : null;
    const CYCLES_PER_FRAME =
      context && typeof context.CYCLES_PER_FRAME === "number"
        ? context.CYCLES_PER_FRAME | 0
        : 0;
    const debugRuntime = context && context.debugRuntime ? context.debugRuntime : null;
    const publishVideoFrame =
      context && typeof context.publishVideoFrame === "function"
        ? context.publishVideoFrame
        : null;
    const paint = context && typeof context.paint === "function" ? context.paint : null;
    const updateDebug =
      context && typeof context.updateDebug === "function" ? context.updateDebug : null;

    if (timing === "exact" || !machine || !CPU || CYCLES_PER_FRAME <= 0) {
      return {
        timing: timing,
        advancedCycles: 0,
      };
    }

    const frameRemainder = machine.frameCycleAccum | 0;
    if (frameRemainder <= 0) {
      return {
        timing: timing,
        advancedCycles: 0,
      };
    }

    const remainingCycles = CYCLES_PER_FRAME - frameRemainder;
    if (remainingCycles <= 0) {
      machine.frameCycleAccum = 0;
      return {
        timing: timing,
        advancedCycles: 0,
      };
    }

    const debugState =
      debugRuntime && typeof debugRuntime.suspendBreakpoints === "function"
        ? debugRuntime.suspendBreakpoints()
        : null;
    const startCycle = machine.ctx.cycleCounter | 0;
    let endCycle = startCycle;
    try {
      endCycle = CPU.run(machine.ctx, startCycle + remainingCycles) | 0;
    } catch (err) {
      if (debugRuntime && typeof debugRuntime.onExecutionError === "function") {
        debugRuntime.onExecutionError(err);
      }
      throw err;
    } finally {
      if (debugRuntime && typeof debugRuntime.restoreBreakpoints === "function") {
        debugRuntime.restoreBreakpoints(debugState);
      }
    }

    let executed = (endCycle - startCycle) | 0;
    if (executed < 0) executed = 0;
    if (executed > remainingCycles) executed = remainingCycles;
    if (executed !== remainingCycles) {
      throw new Error(
        "A8E snapshot frame alignment stopped before the next frame boundary",
      );
    }

    machine.frameCycleAccum = (frameRemainder + executed) % CYCLES_PER_FRAME;
    if (publishVideoFrame) publishVideoFrame();
    if (paint) paint();
    if (updateDebug) updateDebug("snapshot_save");
    return {
      timing: timing,
      advancedCycles: executed,
    };
  }

  window.A8EAtariSupport = {
    alignSnapshotToFrameBoundary: alignSnapshotToFrameBoundary,
    bytesToHex: bytesToHex,
    captureScreenshot: captureScreenshot,
    cloneVideoState: cloneVideoState,
    createCaptureCanvas: createCaptureCanvas,
    dataUrlToArrayBuffer: dataUrlToArrayBuffer,
    normalizeArtifactRange: normalizeArtifactRange,
    normalizeSnapshotTiming: normalizeSnapshotTiming,
    restoreVideoState: restoreVideoState,
  };
})();
