
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createRuntime, resolveDiskPath } = require("./script_runtime");

const DISK_CANDIDATES = [
  "Schraenker3.atr",
  "schraenker3.atr",
  "schreckenstein.atr",
  "archon2.atr",
  "archon 2.atr",
];

async function main() {
  const runtime = await createRuntime({
    turbo: true,
    sioTurbo: false,
    frameDelayMs: 0,
  });

  try {
    const api = runtime.api;
    await api.whenReady();

    const diskPath = resolveDiskPath(DISK_CANDIDATES, 2);
    const diskData = fs.readFileSync(diskPath);
    await api.media.mountDisk(diskData, { name: path.basename(diskPath) });
    await api.system.boot();

    const TENTH = Math.floor(1773447 / 10);
    for (let i = 0; i < 254; i++) {
      await api.system.waitForCycles({ count: TENTH });
    }

    // Read VBI handler BEFORE
    const vbiLo = await api.debug.readMemory(0x0222);
    const vbiHi = await api.debug.readMemory(0x0223);
    const vbiAddr = vbiLo | (vbiHi << 8);
    console.log(`=== Deferred VBI handler at $${vbiAddr.toString(16).padStart(4,'0').toUpperCase()} (BEFORE) ===`);
    const vbiDasm = await api.debug.disassemble({ pc: vbiAddr, count: 60 });
    vbiDasm.instructions.forEach(ins => {
      console.log(`  $${ins.address.toString(16).padStart(4,'0').toUpperCase()}: ${ins.text}`);
    });

    // Raw bytes at $1FD2
    console.log(`\nRaw bytes at $1FD2 (BEFORE):`);
    const rawBefore = await api.debug.readRange(0x1FD2, 64);
    for (let row = 0; row < 4; row++) {
      let line = `  $${(0x1FD2 + row*16).toString(16).padStart(4,'0').toUpperCase()}: `;
      for (let col = 0; col < 16; col++) line += rawBefore[row*16+col].toString(16).padStart(2,'0').toUpperCase() + " ";
      console.log(line);
    }

    // Also check what SDLST and DLISTL/H registers contain
    const sdlLo = await api.debug.readMemory(0x0230);
    const sdlHi = await api.debug.readMemory(0x0231);
    console.log(`\nSDLST (shadow): $${(sdlLo | (sdlHi << 8)).toString(16).padStart(4,'0').toUpperCase()}`);

    // Watch $1F3A and nearby for the transition
    await api.system.waitForCycles({ count: TENTH });
    let prev1F3A = await api.debug.readMemory(0x1F3A);
    let prev1FD2 = await api.debug.readMemory(0x1FD2);
    let prev0222 = await api.debug.readMemory(0x0222);
    let prev0223 = await api.debug.readMemory(0x0223);
    let prev0230 = await api.debug.readMemory(0x0230);
    let prev0231 = await api.debug.readMemory(0x0231);

    // Fine polling - watch for ANY change in key addresses
    let step = 0;
    for (let i = 0; i < 500000 && step < 5; i++) {
      await api.system.waitForCycles({ count: 200 });

      const v1F3A = await api.debug.readMemory(0x1F3A);
      const v1FD2 = await api.debug.readMemory(0x1FD2);
      const v0222 = await api.debug.readMemory(0x0222);
      const v0223 = await api.debug.readMemory(0x0223);
      const v0230 = await api.debug.readMemory(0x0230);
      const v0231 = await api.debug.readMemory(0x0231);

      if (v1F3A !== prev1F3A || v1FD2 !== prev1FD2 || v0222 !== prev0222 || v0223 !== prev0223 || v0230 !== prev0230 || v0231 !== prev0231) {
        const dbg = await api.debug.getDebugState();
        const changes = [];
        if (v1F3A !== prev1F3A) changes.push(`$1F3A: $${prev1F3A.toString(16).padStart(2,'0').toUpperCase()}->$${v1F3A.toString(16).padStart(2,'0').toUpperCase()}`);
        if (v1FD2 !== prev1FD2) changes.push(`$1FD2: $${prev1FD2.toString(16).padStart(2,'0').toUpperCase()}->$${v1FD2.toString(16).padStart(2,'0').toUpperCase()}`);
        if (v0222 !== prev0222 || v0223 !== prev0223) {
          const oldVBI = prev0222 | (prev0223 << 8);
          const newVBI = v0222 | (v0223 << 8);
          changes.push(`VVBLKD: $${oldVBI.toString(16).padStart(4,'0').toUpperCase()}->$${newVBI.toString(16).padStart(4,'0').toUpperCase()}`);
        }
        if (v0230 !== prev0230 || v0231 !== prev0231) {
          const oldSDL = prev0230 | (prev0231 << 8);
          const newSDL = v0230 | (v0231 << 8);
          changes.push(`SDLST: $${oldSDL.toString(16).padStart(4,'0').toUpperCase()}->$${newSDL.toString(16).padStart(4,'0').toUpperCase()}`);
        }

        console.log(`\n[change ${step+1} at fine step ${i}] PC=$${dbg.pc.toString(16).padStart(4,'0').toUpperCase()}: ${changes.join(', ')}`);

        // Disassemble at PC
        const d = await api.debug.disassemble({ pc: Math.max(0, dbg.pc - 8), count: 15 });
        d.instructions.forEach(ins => {
          const marker = ins.address === dbg.pc ? " <--" : "";
          console.log(`    $${ins.address.toString(16).padStart(4,'0').toUpperCase()}: ${ins.text}${marker}`);
        });

        // Trace
        const trace = await api.debug.getTraceTail(8);
        console.log(`  Recent trace:`);
        trace.forEach(t => {
          console.log(`    PC=$${t.pc.toString(16).padStart(4,'0').toUpperCase()} A=$${t.a.toString(16).padStart(2,'0').toUpperCase()} X=$${t.x.toString(16).padStart(2,'0').toUpperCase()} Y=$${t.y.toString(16).padStart(2,'0').toUpperCase()}`);
        });

        prev1F3A = v1F3A;
        prev1FD2 = v1FD2;
        prev0222 = v0222;
        prev0223 = v0223;
        prev0230 = v0230;
        prev0231 = v0231;
        step++;
      }
    }

    // After all changes, read VBI again
    const vbiLo2 = await api.debug.readMemory(0x0222);
    const vbiHi2 = await api.debug.readMemory(0x0223);
    const vbiAddr2 = vbiLo2 | (vbiHi2 << 8);
    console.log(`\n=== Deferred VBI handler at $${vbiAddr2.toString(16).padStart(4,'0').toUpperCase()} (AFTER) ===`);
    const vbiDasm2 = await api.debug.disassemble({ pc: vbiAddr2, count: 30 });
    vbiDasm2.instructions.forEach(ins => {
      console.log(`  $${ins.address.toString(16).padStart(4,'0').toUpperCase()}: ${ins.text}`);
    });

    // Read raw bytes at VBI address
    if (vbiAddr2 !== 0xE45F && vbiAddr2 > 0x100) {
      console.log(`\nRaw bytes at $${vbiAddr2.toString(16).padStart(4,'0').toUpperCase()} (AFTER):`);
      const rawAfter = await api.debug.readRange(vbiAddr2, 32);
      let line2 = `  $${vbiAddr2.toString(16).padStart(4,'0').toUpperCase()}: `;
      rawAfter.forEach((b, i) => {
        if (i > 0 && i % 16 === 0) { console.log(line2); line2 = `  $${(vbiAddr2+i).toString(16).padStart(4,'0').toUpperCase()}: `; }
        line2 += b.toString(16).padStart(2,'0').toUpperCase() + " ";
      });
      console.log(line2);
    }

    // Check SDLST
    const sdlLo2 = await api.debug.readMemory(0x0230);
    const sdlHi2 = await api.debug.readMemory(0x0231);
    console.log(`\nSDLST (shadow) AFTER: $${(sdlLo2 | (sdlHi2 << 8)).toString(16).padStart(4,'0').toUpperCase()}`);

    // CPU state
    const dbgFinal = await api.debug.getDebugState();
    console.log(`CPU PC AFTER: $${dbgFinal.pc.toString(16).padStart(4,'0').toUpperCase()}`);

    // Look for where SDLST gets updated - check if there's a SYSTOP style address
    // Check SDLSTL = $0230 neighborhood
    // Also check $0200 (VDSLST) after
    const vdslstLo = await api.debug.readMemory(0x0200);
    const vdslstHi = await api.debug.readMemory(0x0201);
    console.log(`VDSLST ($0200) AFTER: $${(vdslstLo | (vdslstHi << 8)).toString(16).padStart(4,'0').toUpperCase()}`);

  } catch (err) {
    console.error(err);
  } finally {
    await runtime.dispose();
  }
}

main();
