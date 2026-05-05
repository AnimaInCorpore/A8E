"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  createRuntime,
  resolveBuildPath,
  resolveProjectPath,
} = require("./script_runtime");

const ARTEMIS2_XEX = resolveProjectPath("disks", "artemis2.xex");

async function main() {
  const runtime = await createRuntime({ turbo: true });

  try {
    const api = runtime.api;
    await api.whenReady();

    console.log(`Input XEX: ${ARTEMIS2_XEX}`);
    const xexData = fs.readFileSync(ARTEMIS2_XEX);

    const xexResult = await api.dev.runXex({
      bytes: xexData,
      name: "artemis2.xex",
      detectTightLoop: false,
      maxBootCycles: "17s",
    });
    console.log(`runXex: phase=${xexResult.phase}, ok=${xexResult.ok}`);
    if (xexResult.xexPreflight) {
      const pf = xexResult.xexPreflight;
      console.log(`  preflight ok=${pf.ok} rejected=${pf.rejectedBytes} segments=${pf.segmentCount}`);
      if (pf.rejectedRanges && pf.rejectedRanges.length > 0) {
        pf.rejectedRanges.forEach(r =>
          console.log(`    REJECTED: $${r.start.toString(16).toUpperCase()}-$${r.end.toString(16).toUpperCase()}`));
      }
    }
    if (xexResult.debugState) {
      const ds = xexResult.debugState;
      console.log(`  PC=$${ds.pc.toString(16).padStart(4,"0").toUpperCase()} reason=${ds.reason}`);
    }

    const state = await api.getSystemState();
    console.log(`System state: running=${state.running}`);
    if (!state.running) await api.system.start();

    // Early screenshot — catch loading screen or early render
    console.log("Waiting 100 frames...");
    await api.system.waitForCycles("100frames");
    const ss0 = await api.artifacts.captureScreenshot({ encoding: "bytes" });
    fs.writeFileSync(resolveBuildPath("artemis2-f100.png"), Buffer.from(ss0.bytes));
    console.log("Screenshot saved at frame ~100");

    // Mid screenshot
    await api.system.waitForCycles("450frames");
    const ss1 = await api.artifacts.captureScreenshot({ encoding: "bytes" });
    fs.writeFileSync(resolveBuildPath("artemis2-f550.png"), Buffer.from(ss1.bytes));
    console.log("Screenshot saved at frame ~550");

    // Read hardware state at stable point
    const DMACTL  = await api.debug.readMemory(0xD400);
    const DLISTL  = await api.debug.readMemory(0xD402);
    const DLISTH  = await api.debug.readMemory(0xD403);
    const NMIEN   = await api.debug.readMemory(0xD40E);
    const NMIST   = await api.debug.readMemory(0xD40F);
    const COLBK   = await api.debug.readMemory(0xD01A);
    const PRIOR   = await api.debug.readMemory(0xD01B);
    const VCOUNT  = await api.debug.readMemory(0xD40B);
    const CHBASE  = await api.debug.readMemory(0xD409);
    const PMBASE  = await api.debug.readMemory(0xD407);
    const GRACTL  = await api.debug.readMemory(0xD01D);
    const CHACTL  = await api.debug.readMemory(0xD401);

    console.log(`\nHardware state:`);
    console.log(`  DMACTL=$${DMACTL.toString(16).padStart(2,"0").toUpperCase()} DLIST=$${(DLISTL|(DLISTH<<8)).toString(16).padStart(4,"0").toUpperCase()}`);
    console.log(`  NMIEN=$${NMIEN.toString(16).padStart(2,"0").toUpperCase()} NMIST=$${NMIST.toString(16).padStart(2,"0").toUpperCase()} VCOUNT=$${VCOUNT.toString(16).padStart(2,"0").toUpperCase()}`);
    console.log(`  COLBK=$${COLBK.toString(16).padStart(2,"0").toUpperCase()} PRIOR=$${PRIOR.toString(16).padStart(2,"0").toUpperCase()}`);
    console.log(`  CHBASE=$${CHBASE.toString(16).padStart(2,"0").toUpperCase()} PMBASE=$${PMBASE.toString(16).padStart(2,"0").toUpperCase()}`);
    console.log(`  GRACTL=$${GRACTL.toString(16).padStart(2,"0").toUpperCase()} CHACTL=$${CHACTL.toString(16).padStart(2,"0").toUpperCase()}`);

    // Color registers
    const colors = [];
    for (let i = 0; i < 9; i++) {
      colors.push(await api.debug.readMemory(0xD012 + i));
    }
    console.log(`  COLOR0-8: ${colors.map(c => c.toString(16).padStart(2,"0").toUpperCase()).join(" ")}`);

    // Shadow display list
    const SDLSTL = await api.debug.readMemory(0x0230);
    const SDLSTH = await api.debug.readMemory(0x0231);
    const dlAddr = SDLSTL | (SDLSTH << 8);
    console.log(`  SDLST=$${dlAddr.toString(16).padStart(4,"0").toUpperCase()}`);

    // Read display list (64 bytes)
    console.log(`\nDisplay list at $${dlAddr.toString(16).padStart(4,"0").toUpperCase()}:`);
    const dl = await api.debug.readRange(dlAddr, 64);
    let dlLine = `  `;
    for (let i = 0; i < dl.length; i++) {
      dlLine += dl[i].toString(16).padStart(2,"0").toUpperCase() + " ";
      if ((i+1) % 16 === 0) { console.log(dlLine); dlLine = "  "; }
    }
    if (dlLine.trim()) console.log(dlLine);

    // DLI and VBI vectors
    const vdslstL = await api.debug.readMemory(0x0200);
    const vdslstH = await api.debug.readMemory(0x0201);
    const dliAddr = vdslstL | (vdslstH << 8);
    console.log(`\nVDSLST (DLI handler) = $${dliAddr.toString(16).padStart(4,"0").toUpperCase()}`);

    const vvblkdL = await api.debug.readMemory(0x0222);
    const vvblkdH = await api.debug.readMemory(0x0223);
    const vbiAddr = vvblkdL | (vvblkdH << 8);
    console.log(`VVBLKD (VBI handler)  = $${vbiAddr.toString(16).padStart(4,"0").toUpperCase()}`);

    // Disassemble DLI handler
    if (dliAddr > 0x0600) {
      console.log(`\n--- DLI handler at $${dliAddr.toString(16).padStart(4,"0").toUpperCase()} ---`);
      const dDLI = await api.debug.disassemble({ pc: dliAddr, count: 60 });
      dDLI.instructions.forEach(i =>
        console.log(`  $${i.address.toString(16).padStart(4,"0").toUpperCase()}: ${i.text}`));
    }

    // Disassemble VBI handler
    if (vbiAddr > 0x0600) {
      console.log(`\n--- VBI handler at $${vbiAddr.toString(16).padStart(4,"0").toUpperCase()} ---`);
      const dVBI = await api.debug.disassemble({ pc: vbiAddr, count: 60 });
      dVBI.instructions.forEach(i =>
        console.log(`  $${i.address.toString(16).padStart(4,"0").toUpperCase()}: ${i.text}`));
    }

    // Run more and take final screenshot
    await api.system.waitForCycles("200frames");
    const ss2 = await api.artifacts.captureScreenshot({ encoding: "bytes" });
    fs.writeFileSync(resolveBuildPath("artemis2-f750.png"), Buffer.from(ss2.bytes));
    console.log("\nScreenshot saved at frame ~750");

  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  } finally {
    await runtime.dispose();
  }
}

main();
