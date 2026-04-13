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

    // Boot the XEX
    const xexResult = await api.dev.runXex({
      bytes: xexData,
      name: "artemis2.xex",
      detectTightLoop: false,
      maxBootCycles: "17s",
    });
    console.log(`\nrunXex: phase=${xexResult.phase}, ok=${xexResult.ok}`);
    if (xexResult.xexPreflight) {
      const pf = xexResult.xexPreflight;
      console.log(`  preflight ok=${pf.ok} segments=${pf.segmentCount}`);
      if (pf.segments) {
        pf.segments.forEach((s, i) =>
          console.log(`  Seg ${i}: $${s.start.toString(16).padStart(4,"0").toUpperCase()}-$${s.end.toString(16).padStart(4,"0").toUpperCase()} (${s.length} bytes)`));
      }
      console.log(`  runAddress=$${(pf.runAddress||0).toString(16).padStart(4,"0").toUpperCase()}`);
      console.log(`  initAddress=$${(pf.initAddress||0).toString(16).padStart(4,"0").toUpperCase()}`);
    }
    if (xexResult.debugState) {
      const ds = xexResult.debugState;
      console.log(`  stall PC=$${ds.pc.toString(16).padStart(4,"0").toUpperCase()} reason=${ds.reason}`);
    }

    // Disassemble around stall point $5821
    console.log(`\n--- Disassembly around stall $5821 ---`);
    const dStall = await api.debug.disassemble({ pc: 0x57F0, count: 60 });
    dStall.instructions.forEach(i =>
      console.log(`  $${i.address.toString(16).padStart(4,"0").toUpperCase()}: ${i.text}`));

    // What is at the RUNAD vector ($02E0-$02E1)?
    const runadL = await api.debug.readMemory(0x02E0);
    const runadH = await api.debug.readMemory(0x02E1);
    const runad = runadL | (runadH << 8);
    console.log(`\nRUNAD=$${runad.toString(16).padStart(4,"0").toUpperCase()}`);

    const initadL = await api.debug.readMemory(0x02E2);
    const initadH = await api.debug.readMemory(0x02E3);
    const initad = initadL | (initadH << 8);
    console.log(`INITAD=$${initad.toString(16).padStart(4,"0").toUpperCase()}`);

    // Read memory around stall PC to see what it's doing
    const stallMem = await api.debug.readRange(0x5810, 32);
    console.log(`\nMemory at $5810:`);
    let line = "  ";
    for (let i = 0; i < stallMem.length; i++) {
      line += stallMem[i].toString(16).padStart(2,"0").toUpperCase() + " ";
      if ((i+1) % 16 === 0) { console.log(line); line = "  "; }
    }
    if (line.trim()) console.log(line);

    // Check key zero-page vars and OS vars the stall might be waiting on
    console.log(`\nKey OS vars:`);
    const RTCLOK = await api.debug.readMemory(0x0014); // frame counter low
    const RTCLOK1 = await api.debug.readMemory(0x0013);
    const RTCLOK2 = await api.debug.readMemory(0x0012);
    console.log(`  RTCLOK=$${RTCLOK2.toString(16).padStart(2,"0")}${RTCLOK1.toString(16).padStart(2,"0")}${RTCLOK.toString(16).padStart(2,"0")} (frame clocks)`);

    const VCOUNT = await api.debug.readMemory(0xD40B);
    const NMIEN  = await api.debug.readMemory(0xD40E);
    const DMACTL = await api.debug.readMemory(0xD400);
    console.log(`  VCOUNT=$${VCOUNT.toString(16).padStart(2,"0").toUpperCase()} NMIEN=$${NMIEN.toString(16).padStart(2,"0").toUpperCase()} DMACTL=$${DMACTL.toString(16).padStart(2,"0").toUpperCase()}`);

    // Force start and capture what it actually looks like
    const state = await api.getSystemState();
    if (!state.running) await api.system.start();

    // Take screenshot immediately (frame 0 of post-failure)
    const ss0 = await api.artifacts.captureScreenshot({ encoding: "bytes" });
    fs.writeFileSync(resolveBuildPath("artemis2-postboot-f0.png"), Buffer.from(ss0.bytes));
    console.log("\nScreenshot at f0 (post-boot) saved");

    // Wait a few frames and look again
    await api.system.waitForCycles("30frames");
    const ss1 = await api.artifacts.captureScreenshot({ encoding: "bytes" });
    fs.writeFileSync(resolveBuildPath("artemis2-postboot-f30.png"), Buffer.from(ss1.bytes));
    console.log("Screenshot at f30 saved");

    await api.system.waitForCycles("270frames");
    const ss2 = await api.artifacts.captureScreenshot({ encoding: "bytes" });
    fs.writeFileSync(resolveBuildPath("artemis2-postboot-f300.png"), Buffer.from(ss2.bytes));
    console.log("Screenshot at f300 saved");

    // Check if the program installed handlers by now
    const vdslstL2 = await api.debug.readMemory(0x0200);
    const vdslstH2 = await api.debug.readMemory(0x0201);
    console.log(`\nVDSLST after running: $${(vdslstL2|(vdslstH2<<8)).toString(16).padStart(4,"0").toUpperCase()}`);

    const CHBASE2 = await api.debug.readMemory(0xD409);
    const PMBASE2 = await api.debug.readMemory(0xD407);
    const PRIOR2  = await api.debug.readMemory(0xD01B);
    console.log(`CHBASE=$${CHBASE2.toString(16).padStart(2,"0").toUpperCase()} PMBASE=$${PMBASE2.toString(16).padStart(2,"0").toUpperCase()} PRIOR=$${PRIOR2.toString(16).padStart(2,"0").toUpperCase()}`);

    // PC now
    const dbg2 = await api.getDebugState();
    console.log(`Current PC=$${dbg2.pc.toString(16).padStart(4,"0").toUpperCase()}`);

  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  } finally {
    await runtime.dispose();
  }
}

main();
