/* global __dirname, console, process, require */

// Regression: an ANTIC draw-line event steps the CPU through a whole scan line
// inside one CPU.run call, so the debugger's single-instruction step saw the
// instruction counter jump past "+1" and never stopped. runUntilPc then
// ignored maxCycles/maxInstructions and ran until something else halted it.

const assert = require("node:assert/strict");
const path = require("node:path");

const { createHeadlessAutomation } = require("../headless");

const CYCLES_PER_LINE = 114;

async function main() {
  const runtime = await createHeadlessAutomation({
    roms: {
      os: path.resolve(__dirname, "..", "..", "ATARIXL.ROM"),
      basic: path.resolve(__dirname, "..", "..", "ATARIBAS.ROM"),
    },
    turbo: true,
    frameDelayMs: 0,
  });

  try {
    const app = runtime.app;
    if (app.isRunning()) app.pause();

    const cycleLimit = 20000;
    const byCycles = app.runUntilPc(null, { maxCycles: cycleLimit });
    assert.equal(byCycles.reason, "cycleLimit", "runUntilPc should stop on maxCycles");
    assert.ok(
      byCycles.executedCycles >= cycleLimit &&
        byCycles.executedCycles < cycleLimit + 2 * CYCLES_PER_LINE,
      "runUntilPc overshot maxCycles: " + byCycles.executedCycles,
    );

    const instructionLimit = 5000;
    const byInstructions = app.runUntilPc(null, {
      maxInstructions: instructionLimit,
      maxCycles: 10000000,
    });
    assert.equal(
      byInstructions.reason,
      "instructionLimit",
      "runUntilPc should stop on maxInstructions",
    );
    assert.ok(
      byInstructions.executedInstructions >= instructionLimit &&
        byInstructions.executedInstructions < instructionLimit + CYCLES_PER_LINE,
      "runUntilPc overshot maxInstructions: " + byInstructions.executedInstructions,
    );

    // A full frame of runUntilPc must come back too (the original report).
    const frame = app.runUntilPc(null, { maxCycles: CYCLES_PER_LINE * 312 * 10 });
    assert.ok(
      frame.reason === "cycleLimit" || frame.reason === "instructionLimit",
      "unexpected stop reason " + frame.reason,
    );
  } finally {
    await runtime.dispose();
  }
}

main().catch(function (err) {
  console.error(err);
  process.exit(1);
});
