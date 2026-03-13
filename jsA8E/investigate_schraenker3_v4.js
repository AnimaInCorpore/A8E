
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHeadlessAutomation } = require("./headless");

function dumpDisplayList(bytes, startAddr) {
  const lines = [];
  let i = 0;
  while (i < bytes.length) {
    const cmd = bytes[i];
    const mode = cmd & 0x0F;
    const dli  = !!(cmd & 0x80);
    const lms  = !!(cmd & 0x40);
    const vs   = !!(cmd & 0x20);
    const hs   = !!(cmd & 0x10);
    const addr = startAddr + i;
    let desc = `$${addr.toString(16).padStart(4,'0').toUpperCase()}: ${cmd.toString(16).padStart(2,'0').toUpperCase()}`;

    if (mode === 0x00) {
      const blank = ((cmd >> 4) & 0x07) + 1;
      desc += ` [blank ${blank} line(s)]${dli?' DLI':''}`;
      i++;
    } else if (mode === 0x01) {
      if (cmd & 0x40) { // JVB
        if (i + 2 < bytes.length) {
          const lo = bytes[i+1], hi = bytes[i+2];
          const target = lo | (hi << 8);
          desc += ` [JVB $${target.toString(16).padStart(4,'0').toUpperCase()}] lo=${lo.toString(16).padStart(2,'0').toUpperCase()} hi=${hi.toString(16).padStart(2,'0').toUpperCase()}`;
          i += 3;
        } else {
          desc += ` [JVB - truncated]`;
          i++;
        }
      } else {
        if (i + 2 < bytes.length) {
          const lo = bytes[i+1], hi = bytes[i+2];
          const target = lo | (hi << 8);
          desc += ` [JMP $${target.toString(16).padStart(4,'0').toUpperCase()}] lo=${lo.toString(16).padStart(2,'0').toUpperCase()} hi=${hi.toString(16).padStart(2,'0').toUpperCase()}`;
          i += 3;
        } else {
          desc += ` [JMP - truncated]`;
          i++;
        }
      }
    } else {
      desc += ` [mode ${mode}]${dli?' DLI':''}${lms?' LMS':''}${vs?' VS':''}${hs?' HS':''}`;
      if (lms && i + 2 < bytes.length) {
        const lo = bytes[i+1], hi = bytes[i+2];
        const memAddr = lo | (hi << 8);
        desc += ` @$${memAddr.toString(16).padStart(4,'0').toUpperCase()} lo=${lo.toString(16).padStart(2,'0').toUpperCase()} hi=${hi.toString(16).padStart(2,'0').toUpperCase()}`;
        i += 3;
      } else {
        i++;
      }
    }
    lines.push(desc);
    if (lines.length > 80) { lines.push("... (truncated)"); break; }
  }
  return lines;
}

async function main() {
  const runtime = await createHeadlessAutomation({
    roms: {
      os: path.resolve(__dirname, "..", "ATARIXL.ROM"),
      basic: path.resolve(__dirname, "..", "ATARIBAS.ROM"),
    },
    turbo: true,
    sioTurbo: false,
    frameDelayMs: 0,
  });

  try {
    const api = runtime.api;
    await api.whenReady();

    const diskData = fs.readFileSync(path.resolve(__dirname, "..", "Schraenker3.atr"));
    await api.media.mountDisk(diskData, { name: "Schraenker3.atr" });
    await api.system.boot();

    const TENTH = Math.floor(1773447 / 10);

    // Run to step 254 (just before pre-corruption step 255)
    for (let i = 0; i < 254; i++) {
      await api.system.waitForCycles({ count: TENTH });
    }

    // Capture display list BEFORE corruption
    const sdlLo = await api.debug.readMemory(0x0230);
    const sdlHi = await api.debug.readMemory(0x0231);
    const dlAddr = sdlLo | (sdlHi << 8);
    console.log(`=== Display list BEFORE corruption (SDLST=$${dlAddr.toString(16).padStart(4,'0').toUpperCase()}) ===`);
    const dlBytes = await api.debug.readRange(dlAddr, 128);
    dumpDisplayList(dlBytes, dlAddr).forEach(l => console.log(`  ${l}`));

    // DLI handler
    const dliLo = await api.debug.readMemory(0x0200);
    const dliHi = await api.debug.readMemory(0x0201);
    const dliAddr = dliLo | (dliHi << 8);
    console.log(`\n=== DLI handler at $${dliAddr.toString(16).padStart(4,'0').toUpperCase()} ===`);
    const dliDasm = await api.debug.disassemble({ pc: dliAddr, count: 40 });
    dliDasm.instructions.forEach(ins => {
      console.log(`  $${ins.address.toString(16).padStart(4,'0').toUpperCase()}: ${ins.text}`);
    });

    // Immediate VBI vector
    const imvbiLo = await api.debug.readMemory(0x0220);
    const imvbiHi = await api.debug.readMemory(0x0221);
    const imvbiAddr = imvbiLo | (imvbiHi << 8);
    const defvbiLo = await api.debug.readMemory(0x0222);
    const defvbiHi = await api.debug.readMemory(0x0223);
    const defvbiAddr = defvbiLo | (defvbiHi << 8);
    console.log(`\n=== VBI vectors ===`);
    console.log(`  VVBLKI ($0220): $${imvbiAddr.toString(16).padStart(4,'0').toUpperCase()}`);
    console.log(`  VVBLKD ($0222): $${defvbiAddr.toString(16).padStart(4,'0').toUpperCase()}`);

    if (imvbiAddr !== 0xE45C && imvbiAddr > 0x0100) {
      console.log(`\n=== Immediate VBI at $${imvbiAddr.toString(16).padStart(4,'0').toUpperCase()} ===`);
      const ivbiDasm = await api.debug.disassemble({ pc: imvbiAddr, count: 30 });
      ivbiDasm.instructions.forEach(ins => {
        console.log(`  $${ins.address.toString(16).padStart(4,'0').toUpperCase()}: ${ins.text}`);
      });
    }

    // Advance 1 more step to step 255 and check corruption
    await api.system.waitForCycles({ count: TENTH });
    const watch = 0x1F3A;
    let prev = await api.debug.readMemory(watch);
    for (let i = 0; i < 200000; i++) {
      await api.system.waitForCycles({ count: 500 });
      const v = await api.debug.readMemory(watch);
      if (v !== prev) {
        console.log(`\n*** $1F3A changed $${prev.toString(16).padStart(2,'0').toUpperCase()} -> $${v.toString(16).padStart(2,'0').toUpperCase()} ***`);
        break;
      }
    }

    // Display list AFTER corruption
    const sdlLo2 = await api.debug.readMemory(0x0230);
    const sdlHi2 = await api.debug.readMemory(0x0231);
    const dlAddr2 = sdlLo2 | (sdlHi2 << 8);
    console.log(`\n=== Display list AFTER corruption (SDLST=$${dlAddr2.toString(16).padStart(4,'0').toUpperCase()}) ===`);
    const dlBytes2 = await api.debug.readRange(dlAddr2, 128);
    dumpDisplayList(dlBytes2, dlAddr2).forEach(l => console.log(`  ${l}`));

    // DLI handler content (might have changed too)
    const dliLo2 = await api.debug.readMemory(0x0200);
    const dliHi2 = await api.debug.readMemory(0x0201);
    const dliAddr2 = dliLo2 | (dliHi2 << 8);
    console.log(`\n=== DLI vector after: $${dliAddr2.toString(16).padStart(4,'0').toUpperCase()} ===`);

    // Also check DLISTL/H (what ANTIC currently has, not shadow)
    // Note: these are write-only on real hardware; reading gives bus noise
    // The shadow at $022E/022F (SDMCTL) and $0230/0231 (SDLST) are more useful

    // Check if there's any code that updates SDLST (look for STA $0230 or STA $0231)
    console.log(`\n=== Disassembly at $6B00 (around DLI) ===`);
    const d6b00 = await api.debug.disassemble({ pc: 0x6B00, count: 50 });
    d6b00.instructions.forEach(ins => {
      console.log(`  $${ins.address.toString(16).padStart(4,'0').toUpperCase()}: ${ins.text}`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await runtime.dispose();
  }
}

main();
