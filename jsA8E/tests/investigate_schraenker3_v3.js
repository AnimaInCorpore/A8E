
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

    // Run until just before corruption (step 255)
    const CYCLES_PER_TENTH = Math.floor(1773447 / 10);
    for (let i = 0; i < 255; i++) {
      await api.system.waitForCycles({ count: CYCLES_PER_TENTH });
    }

    // Capture state right at the corruption point
    const watch = 0x1F3A;
    let prev = await api.debug.readMemory(watch);

    // Step until corruption (up to 200k * 500 cycles = 100M cycles)
    for (let i = 0; i < 200000; i++) {
      await api.system.waitForCycles({ count: 500 });
      const v = await api.debug.readMemory(watch);
      if (v !== prev) {
        console.log(`$1F3A changed $${prev.toString(16).padStart(2,'0').toUpperCase()} -> $${v.toString(16).padStart(2,'0').toUpperCase()}`);
        prev = v;
        break;
      }
    }

    // Now disassemble $6AC0 and $6B00 range
    console.log("\n=== Disassembly at $6AC0 ===");
    const dasm6ac0 = await api.debug.disassemble({ pc: 0x6AC0, count: 30 });
    dasm6ac0.instructions.forEach(ins => {
      console.log(`  $${ins.address.toString(16).padStart(4,'0').toUpperCase()}: ${ins.text}`);
    });

    // Also disassemble $7480 (the jiffy wait area)
    console.log("\n=== Disassembly at $7480 ===");
    const dasm7480 = await api.debug.disassemble({ pc: 0x7480, count: 15 });
    dasm7480.instructions.forEach(ins => {
      console.log(`  $${ins.address.toString(16).padStart(4,'0').toUpperCase()}: ${ins.text}`);
    });

    // Check key OS vectors
    console.log("\n=== Key vectors ===");
    const vvblki_lo = await api.debug.readMemory(0x0222); // Deferred VBI vector (low)
    const vvblki_hi = await api.debug.readMemory(0x0223);
    const vblk2_lo  = await api.debug.readMemory(0x0226);
    const vblk2_hi  = await api.debug.readMemory(0x0227);

    // XL OS vectors:
    // $0222 = VVBLKD (deferred VBI)
    // $0220 = VVBLKI (immediate VBI)
    // $0200 = VDSLST (DLI vector)
    const vdslst_lo = await api.debug.readMemory(0x0200);
    const vdslst_hi = await api.debug.readMemory(0x0201);
    const vvblkd_lo = await api.debug.readMemory(0x0222);
    const vvblkd_hi = await api.debug.readMemory(0x0223);
    const rtclok    = await api.debug.readMemory(0x0014); // RTCLOK least sig byte
    const rtclok1   = await api.debug.readMemory(0x0012); // mid byte
    const nmien     = await api.debug.readMemory(0xD40E); // NMIEN shadow
    const nmien_s   = await api.debug.readMemory(0x022F); // NMIEN shadow in OS page

    console.log(`  VDSLST (DLI vector): $${((vdslst_lo | (vdslst_hi << 8))).toString(16).padStart(4,'0').toUpperCase()}`);
    console.log(`  VVBLKD (deferred VBI): $${((vvblkd_lo | (vvblkd_hi << 8))).toString(16).padStart(4,'0').toUpperCase()}`);
    console.log(`  RTCLOK ($14): $${rtclok.toString(16).padStart(2,'0').toUpperCase()}`);
    console.log(`  RTCLOK ($12): $${rtclok1.toString(16).padStart(2,'0').toUpperCase()}`);
    console.log(`  NMIEN ($D40E): $${nmien.toString(16).padStart(2,'0').toUpperCase()}`);
    console.log(`  NMIEN shadow ($022F): $${nmien_s.toString(16).padStart(2,'0').toUpperCase()}`);

    // Wait a full frame and check if $14 changed
    const rtBefore = await api.debug.readMemory(0x0014);
    await api.system.waitForCycles({ count: 35568 }); // 1 frame
    const rtAfter = await api.debug.readMemory(0x0014);
    console.log(`\n  $14 before 1 frame: $${rtBefore.toString(16).padStart(2,'0').toUpperCase()}`);
    console.log(`  $14 after 1 frame:  $${rtAfter.toString(16).padStart(2,'0').toUpperCase()}`);

    // Check where CPU is now
    const dbg = await api.debug.getDebugState();
    console.log(`  CPU PC: $${dbg.pc.toString(16).padStart(4,'0').toUpperCase()}`);

    // Disassemble deferred VBI to understand what it does
    const vvblkd_addr = vvblkd_lo | (vvblkd_hi << 8);
    if (vvblkd_addr !== 0xE462 && vvblkd_addr > 0) {
      console.log(`\n=== Deferred VBI at $${vvblkd_addr.toString(16).padStart(4,'0').toUpperCase()} ===`);
      const dasmVBI = await api.debug.disassemble({ pc: vvblkd_addr, count: 20 });
      dasmVBI.instructions.forEach(ins => {
        console.log(`  $${ins.address.toString(16).padStart(4,'0').toUpperCase()}: ${ins.text}`);
      });
    }

    // Check PMBASE to understand PM graphics layout
    const pmbase = await api.debug.readMemory(0xD407); // PMBASE (actually we need to read from sram)
    const pmbase_s = await api.debug.readMemory(0x026F); // shadow PMBASE
    const dmactl   = await api.debug.readMemory(0x022F); // SDMCTL shadow
    const dmactl_r = await api.debug.readMemory(0xD400); // DMACTL register

    // Also check SDMCTL at $022F
    const sdmctl   = await api.debug.readMemory(0x022F);

    console.log(`\n=== PM Graphics ===`);
    console.log(`  PMBASE ($D407): $${pmbase.toString(16).padStart(2,'0').toUpperCase()}`);
    console.log(`  PMBASE shadow ($026F): $${pmbase_s.toString(16).padStart(2,'0').toUpperCase()}`);
    console.log(`  DMACTL ($D400): $${dmactl_r.toString(16).padStart(2,'0').toUpperCase()}`);
    console.log(`  SDMCTL ($022F): $${sdmctl.toString(16).padStart(2,'0').toUpperCase()}`);

    // Compute PM base address based on PMBASE
    const pmBaseAddr = pmbase_s << 8;
    console.log(`  PM base address: $${pmBaseAddr.toString(16).padStart(4,'0').toUpperCase()}`);
    const doubleRes = !(dmactl_r & 0x10);
    if (doubleRes) {
      console.log(`  Resolution: double-line`);
      console.log(`  Missile: $${(pmBaseAddr + 0x180).toString(16).padStart(4,'0').toUpperCase()}-$${(pmBaseAddr + 0x1BF).toString(16).padStart(4,'0').toUpperCase()}`);
      console.log(`  Player0: $${(pmBaseAddr + 0x200).toString(16).padStart(4,'0').toUpperCase()}-$${(pmBaseAddr + 0x27F).toString(16).padStart(4,'0').toUpperCase()}`);
      console.log(`  Player1: $${(pmBaseAddr + 0x280).toString(16).padStart(4,'0').toUpperCase()}-$${(pmBaseAddr + 0x2FF).toString(16).padStart(4,'0').toUpperCase()}`);
      console.log(`  Player2: $${(pmBaseAddr + 0x300).toString(16).padStart(4,'0').toUpperCase()}-$${(pmBaseAddr + 0x37F).toString(16).padStart(4,'0').toUpperCase()}`);
      console.log(`  Player3: $${(pmBaseAddr + 0x380).toString(16).padStart(4,'0').toUpperCase()}-$${(pmBaseAddr + 0x3FF).toString(16).padStart(4,'0').toUpperCase()}`);
    } else {
      console.log(`  Resolution: single-line`);
      console.log(`  Missile: $${(pmBaseAddr + 0x300).toString(16).padStart(4,'0').toUpperCase()}-$${(pmBaseAddr + 0x3FF).toString(16).padStart(4,'0').toUpperCase()}`);
      console.log(`  Player0: $${(pmBaseAddr + 0x400).toString(16).padStart(4,'0').toUpperCase()}-$${(pmBaseAddr + 0x4FF).toString(16).padStart(4,'0').toUpperCase()}`);
      console.log(`  Player1: $${(pmBaseAddr + 0x500).toString(16).padStart(4,'0').toUpperCase()}-$${(pmBaseAddr + 0x5FF).toString(16).padStart(4,'0').toUpperCase()}`);
      console.log(`  Player2: $${(pmBaseAddr + 0x600).toString(16).padStart(4,'0').toUpperCase()}-$${(pmBaseAddr + 0x6FF).toString(16).padStart(4,'0').toUpperCase()}`);
      console.log(`  Player3: $${(pmBaseAddr + 0x700).toString(16).padStart(4,'0').toUpperCase()}-$${(pmBaseAddr + 0x7FF).toString(16).padStart(4,'0').toUpperCase()}`);
    }

    // Check if $1F3A falls within any PM range
    const addr1f3a = 0x1F3A;
    console.log(`  Does $1F3A ($${addr1f3a.toString(16).toUpperCase()}) overlap PM area? PMBASE=$${pmbase_s.toString(16).padStart(2,'0').toUpperCase()}`);

    // Check what's at VVBLKD - does it still point to the right place?
    console.log(`\n=== OS shadow: SDLSTL/H ===`);
    const sdlstl = await api.debug.readMemory(0x0230);
    const sdlsth = await api.debug.readMemory(0x0231);
    console.log(`  SDLST: $${(sdlstl | (sdlsth << 8)).toString(16).padStart(4,'0').toUpperCase()}`);

    // Read the display list bytes (first 20)
    console.log(`\n=== Display list at $1F3A ===`);
    const dlBytes = await api.debug.readRange(0x1F3A, 40);
    let line = "";
    for (let i = 0; i < dlBytes.length; i++) {
      if (i % 16 === 0) { if (line) console.log(line); line = `  $${(0x1F3A + i).toString(16).padStart(4,'0').toUpperCase()}: `; }
      line += dlBytes[i].toString(16).padStart(2,'0').toUpperCase() + " ";
    }
    if (line) console.log(line);

  } catch (err) {
    console.error(err);
  } finally {
    await runtime.dispose();
  }
}

main();
