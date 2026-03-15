"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHeadlessAutomation } = require("./headless");

async function main() {
  const runtime = await createHeadlessAutomation({
    roms: {
      os: path.resolve(__dirname, "..", "ATARIXL.ROM"),
      basic: path.resolve(__dirname, "..", "ATARIBAS.ROM"),
    },
    turbo: true,
    frameDelayMs: 0,
  });

  try {
    const api = runtime.api;
    await api.whenReady();

    const xexData = fs.readFileSync(path.resolve(__dirname, "..", "image.xex"));
    // Disable tight-loop detection and raise cycle limit for large demo XEX
    const xexResult = await api.dev.runXex({
      bytes: xexData,
      name: "image.xex",
      detectTightLoop: false,
      maxBootCycles: "17s",
    });
    console.log(`runXex: phase=${xexResult.phase}, ok=${xexResult.ok}`);
    if (xexResult.xexPreflight) {
      const pf = xexResult.xexPreflight;
      console.log(`  preflight ok=${pf.ok} rejected=${pf.rejectedBytes} segments=${pf.segmentCount}`);
      if (pf.rejectedRanges && pf.rejectedRanges.length > 0) {
        pf.rejectedRanges.forEach(r => console.log(`    REJECTED: $${r.start.toString(16).toUpperCase()}-$${r.end.toString(16).toUpperCase()}`));
      }
    }
    if (xexResult.debugState) {
      const ds = xexResult.debugState;
      console.log(`  PC=$${ds.pc.toString(16).padStart(4,"0").toUpperCase()} reason=${ds.reason}`);
    }

    // Resume if still paused at entry point
    const state = await api.getSystemState();
    console.log(`System state: running=${state.running}`);
    if (!state.running) await api.system.start();

    // Wait for the demo to start displaying (past XEX load phase, ~600 frames)
    console.log("Waiting for demo to start...");

    // Run to just before the garble starts (frame ~550)
    await api.system.waitForCycles("550frames");
    const ss1 = await api.artifacts.captureScreenshot({ encoding: "bytes" });
    fs.writeFileSync(path.resolve(__dirname, "..", "build", "image-diag-f550.png"), Buffer.from(ss1.bytes));
    console.log("Screenshot saved at frame ~550");

    // Run 70 more frames (to ~620)
    await api.system.waitForCycles("70frames");
    const ss2 = await api.artifacts.captureScreenshot({ encoding: "bytes" });
    fs.writeFileSync(path.resolve(__dirname, "..", "build", "image-diag-f620.png"), Buffer.from(ss2.bytes));
    console.log("Screenshot saved at frame ~620");

    // Read hardware state
    const dbg = await api.debug.getDebugState();
    console.log(`\nCPU state: PC=$${dbg.pc.toString(16).padStart(4,"0").toUpperCase()}`);
    console.log(`  A=$${dbg.a.toString(16).padStart(2,"0").toUpperCase()} X=$${dbg.x.toString(16).padStart(2,"0").toUpperCase()} Y=$${dbg.y.toString(16).padStart(2,"0").toUpperCase()} SP=$${dbg.sp.toString(16).padStart(2,"0").toUpperCase()}`);

    // Read key registers
    const DMACTL  = await api.debug.readMemory(0xD400);
    const DLISTL  = await api.debug.readMemory(0xD402);
    const DLISTH  = await api.debug.readMemory(0xD403);
    const NMIEN   = await api.debug.readMemory(0xD40E);
    const NMIST   = await api.debug.readMemory(0xD40F);
    const COLBK   = await api.debug.readMemory(0xD01A);
    const VCOUNT  = await api.debug.readMemory(0xD40B);
    console.log(`\nHardware state:`);
    console.log(`  DMACTL=$${DMACTL.toString(16).padStart(2,"0").toUpperCase()} DLIST=$${(DLISTL|(DLISTH<<8)).toString(16).padStart(4,"0").toUpperCase()}`);
    console.log(`  NMIEN=$${NMIEN.toString(16).padStart(2,"0").toUpperCase()} NMIST=$${NMIST.toString(16).padStart(2,"0").toUpperCase()} VCOUNT=$${VCOUNT.toString(16).padStart(2,"0").toUpperCase()}`);
    console.log(`  COLBK=$${COLBK.toString(16).padStart(2,"0").toUpperCase()}`);

    // Read SDLST (shadow display list)
    const SDLSTL = await api.debug.readMemory(0x0230);
    const SDLSTH = await api.debug.readMemory(0x0231);
    const dlAddr = SDLSTL | (SDLSTH << 8);
    console.log(`  SDLST=$${dlAddr.toString(16).padStart(4,"0").toUpperCase()}`);

    // Read display list
    console.log(`\nDisplay list at $${dlAddr.toString(16).padStart(4,"0").toUpperCase()}:`);
    const dl = await api.debug.readRange(dlAddr, 64);
    let dlLine = `  `;
    for (let i = 0; i < dl.length; i++) {
      dlLine += dl[i].toString(16).padStart(2,"0").toUpperCase() + " ";
      if ((i+1) % 16 === 0) { console.log(dlLine); dlLine = "  "; }
    }
    if (dlLine.trim()) console.log(dlLine);

    // Read NMI vector (VDSLST - DLI handler)
    const vdslstL = await api.debug.readMemory(0x0200);
    const vdslstH = await api.debug.readMemory(0x0201);
    const dliAddr = vdslstL | (vdslstH << 8);
    console.log(`\nVDSLST (DLI handler) = $${dliAddr.toString(16).padStart(4,"0").toUpperCase()}`);

    // VBI handler
    const vvblkdL = await api.debug.readMemory(0x0222);
    const vvblkdH = await api.debug.readMemory(0x0223);
    const vbiAddr = vvblkdL | (vvblkdH << 8);
    console.log(`VVBLKD (VBI handler) = $${vbiAddr.toString(16).padStart(4,"0").toUpperCase()}`);

    // Disassemble $4F50
    console.log(`\n--- Disassembly at $4F50 ---`);
    const d4f50 = await api.debug.disassemble({ pc: 0x4F50, count: 30 });
    d4f50.instructions.forEach(i => console.log(`  $${i.address.toString(16).padStart(4,"0").toUpperCase()}: ${i.text}`));

    // Disassemble $67CD
    console.log(`\n--- Disassembly at $67CD ---`);
    const d67cd = await api.debug.disassemble({ pc: 0x67CD, count: 30 });
    d67cd.instructions.forEach(i => console.log(`  $${i.address.toString(16).padStart(4,"0").toUpperCase()}: ${i.text}`));

    // Disassemble DLI handler
    if (dliAddr > 0) {
      console.log(`\n--- Disassembly at DLI=$${dliAddr.toString(16).padStart(4,"0").toUpperCase()} ---`);
      const dDLI = await api.debug.disassemble({ pc: dliAddr, count: 50 });
      dDLI.instructions.forEach(i => console.log(`  $${i.address.toString(16).padStart(4,"0").toUpperCase()}: ${i.text}`));
    }

    // Disassemble VBI handler
    if (vbiAddr > 0) {
      console.log(`\n--- Disassembly at VBI=$${vbiAddr.toString(16).padStart(4,"0").toUpperCase()} ---`);
      const dVBI = await api.debug.disassemble({ pc: vbiAddr, count: 40 });
      dVBI.instructions.forEach(i => console.log(`  $${i.address.toString(16).padStart(4,"0").toUpperCase()}: ${i.text}`));
    }

    // Run a bit more to see the stable demo
    await api.system.waitForCycles("100frames");
    const ss3 = await api.artifacts.captureScreenshot({ encoding: "bytes" });
    fs.writeFileSync(path.resolve(__dirname, "..", "build", "image-diag-f720.png"), Buffer.from(ss3.bytes));
    console.log("\nScreenshot saved at frame ~720");

  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
  } finally {
    await runtime.dispose();
  }
}

main();
