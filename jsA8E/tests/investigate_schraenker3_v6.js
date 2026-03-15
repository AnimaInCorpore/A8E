
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

    // --- BEFORE corruption state ---
    console.log("=== BEFORE (step 254) ===");

    // Disassemble the VBI post-wipe code at $1FB3
    console.log("\n--- $1FB3 (VBI post-wipe called from $2006: JSR $1FB3) ---");
    const d1fb3 = await api.debug.disassemble({ pc: 0x1FB3, count: 25 });
    d1fb3.instructions.forEach(i => console.log(`  $${i.address.toString(16).padStart(4,'0').toUpperCase()}: ${i.text}`));

    // Disassemble the code after VBI exit ($1FF6-$2020)
    console.log("\n--- $1FF3 (post-wipe transition code) ---");
    const d1ff3 = await api.debug.disassemble({ pc: 0x1FF3, count: 30 });
    d1ff3.instructions.forEach(i => console.log(`  $${i.address.toString(16).padStart(4,'0').toUpperCase()}: ${i.text}`));

    // Disassemble the animation loop at $6B10-$6B70
    console.log("\n--- $6B10 (animation loop) ---");
    const d6b10 = await api.debug.disassemble({ pc: 0x6B10, count: 50 });
    d6b10.instructions.forEach(i => console.log(`  $${i.address.toString(16).padStart(4,'0').toUpperCase()}: ${i.text}`));

    // Read the animation table at $1F8A (16 bytes)
    console.log("\n--- Animation table at $1F8A ---");
    const tbl = await api.debug.readRange(0x1F8A, 32);
    let tlLine = "  $1F8A: ";
    tbl.forEach(b => tlLine += b.toString(16).padStart(2,'0').toUpperCase() + " ");
    console.log(tlLine);

    // Current animation counter
    const ctr = await api.debug.readMemory(0x062C);
    console.log(`  Animation counter ($062C): $${ctr.toString(16).padStart(2,'0').toUpperCase()}`);

    // What does VVBLKD point to right now?
    const vbiLo = await api.debug.readMemory(0x0222);
    const vbiHi = await api.debug.readMemory(0x0223);
    console.log(`  VVBLKD ($0222): $${(vbiLo | (vbiHi << 8)).toString(16).padStart(4,'0').toUpperCase()}`);

    // Read $6AC0-$6B00 full (the game's "main loop" / animation update code)
    console.log("\n--- $6AC0 (game animation code) ---");
    const d6ac0 = await api.debug.disassemble({ pc: 0x6AC0, count: 60 });
    d6ac0.instructions.forEach(i => console.log(`  $${i.address.toString(16).padStart(4,'0').toUpperCase()}: ${i.text}`));

    // Run to just before transition (wait until step 255 is fully done)
    await api.system.waitForCycles({ count: TENTH }); // step 255

    // Wait for $1F3A to become zero (the clear phase)
    let prev = await api.debug.readMemory(0x1F3A);
    for (let i = 0; i < 100000; i++) {
      await api.system.waitForCycles({ count: 1000 });
      const v = await api.debug.readMemory(0x1F3A);
      if (v !== prev) { console.log(`\n$1F3A: $${prev.toString(16).padStart(2,'0').toUpperCase()} -> $${v.toString(16).padStart(2,'0').toUpperCase()}`); prev = v; break; }
    }

    // Wait for transition to complete (VBI installs new handler or SDLST changes)
    // Watch for VVBLKD to change (game installs new VBI handler)
    let prevVBI = (await api.debug.readMemory(0x0222)) | ((await api.debug.readMemory(0x0223)) << 8);
    let prevSDL = (await api.debug.readMemory(0x0230)) | ((await api.debug.readMemory(0x0231)) << 8);
    let found = false;

    for (let i = 0; i < 200000 && !found; i++) {
      await api.system.waitForCycles({ count: 500 });
      const curVBI = (await api.debug.readMemory(0x0222)) | ((await api.debug.readMemory(0x0223)) << 8);
      const curSDL = (await api.debug.readMemory(0x0230)) | ((await api.debug.readMemory(0x0231)) << 8);

      if (curVBI !== prevVBI || curSDL !== prevSDL) {
        const dbg = await api.debug.getDebugState();
        if (curVBI !== prevVBI) {
          console.log(`\nVVBLKD changed $${prevVBI.toString(16).padStart(4,'0').toUpperCase()} -> $${curVBI.toString(16).padStart(4,'0').toUpperCase()} at PC=$${dbg.pc.toString(16).padStart(4,'0').toUpperCase()}`);
        }
        if (curSDL !== prevSDL) {
          console.log(`\nSDLST changed $${prevSDL.toString(16).padStart(4,'0').toUpperCase()} -> $${curSDL.toString(16).padStart(4,'0').toUpperCase()} at PC=$${dbg.pc.toString(16).padStart(4,'0').toUpperCase()}`);
        }
        prevVBI = curVBI;
        prevSDL = curSDL;
        found = true;

        // Read the new VBI handler
        console.log(`\n--- New VBI at $${curVBI.toString(16).padStart(4,'0').toUpperCase()} ---`);
        const dvbi = await api.debug.disassemble({ pc: curVBI, count: 20 });
        dvbi.instructions.forEach(i2 => console.log(`  $${i2.address.toString(16).padStart(4,'0').toUpperCase()}: ${i2.text}`));
      }
    }

    // Final state
    console.log("\n=== FINAL STATE ===");
    const vbi2Lo = await api.debug.readMemory(0x0222);
    const vbi2Hi = await api.debug.readMemory(0x0223);
    const sdl2Lo = await api.debug.readMemory(0x0230);
    const sdl2Hi = await api.debug.readMemory(0x0231);
    const vdslstLo = await api.debug.readMemory(0x0200);
    const vdslstHi = await api.debug.readMemory(0x0201);
    const dbgFinal = await api.debug.getDebugState();
    console.log(`  VVBLKD: $${(vbi2Lo | (vbi2Hi << 8)).toString(16).padStart(4,'0').toUpperCase()}`);
    console.log(`  SDLST:  $${(sdl2Lo | (sdl2Hi << 8)).toString(16).padStart(4,'0').toUpperCase()}`);
    console.log(`  VDSLST: $${(vdslstLo | (vdslstHi << 8)).toString(16).padStart(4,'0').toUpperCase()}`);
    console.log(`  CPU PC: $${dbgFinal.pc.toString(16).padStart(4,'0').toUpperCase()}`);
    console.log(`  $1FD2: $${(await api.debug.readMemory(0x1FD2)).toString(16).padStart(2,'0').toUpperCase()} (should be $A0 if VBI code intact)`);

    // Read display list at SDLST
    const dl3Lo = sdl2Lo, dl3Hi = sdl2Hi;
    const dl3Addr = dl3Lo | (dl3Hi << 8);
    console.log(`\n--- Display list at SDLST=$${dl3Addr.toString(16).padStart(4,'0').toUpperCase()} ---`);
    const dl3 = await api.debug.readRange(dl3Addr, 32);
    let dl3line = `  $${dl3Addr.toString(16).padStart(4,'0').toUpperCase()}: `;
    dl3.forEach(b => dl3line += b.toString(16).padStart(2,'0').toUpperCase() + " ");
    console.log(dl3line);

  } catch (err) {
    console.error(err);
  } finally {
    await runtime.dispose();
  }
}

main();
