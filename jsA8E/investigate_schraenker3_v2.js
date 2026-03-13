
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHeadlessAutomation } = require("./headless");

// SIO DCB addresses
const SIO_BUF_LO = 0x0304;
const SIO_BUF_HI = 0x0305;
// Shadow display list
const SDLSTL = 0x0230;
const SDLSTH = 0x0231;
// DLISTL/DLISTH (ANTIC registers)
const DLISTL = 0xD402;
const DLISTH = 0xD403;
// The address to watch
const WATCH_ADDR = 0x1F3A;

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

    console.log("Loading Schraenker3.atr...");
    const diskData = fs.readFileSync(path.resolve(__dirname, "..", "Schraenker3.atr"));
    await api.media.mountDisk(diskData, { name: "Schraenker3.atr" });

    console.log("Booting...");
    await api.system.boot();

    const CYCLES_PER_TENTH = Math.floor(1773447 / 10);

    // Run until just before the known corruption (step 255 = 25.5s)
    console.log("Running to step 255...");
    for (let i = 0; i < 255; i++) {
      await api.system.waitForCycles({ count: CYCLES_PER_TENTH });
    }

    console.log("Entering fine-grained monitoring...");
    let lastValue = await api.debug.readMemory(WATCH_ADDR);
    let sdlstl = await api.debug.readMemory(SDLSTL);
    let sdlsth = await api.debug.readMemory(SDLSTH);
    const dlistAddr = sdlstl | (sdlsth << 8);
    console.log(`$${WATCH_ADDR.toString(16).toUpperCase()} = $${lastValue.toString(16).padStart(2,'0').toUpperCase()}`);
    console.log(`SDLST (display list ptr) = $${dlistAddr.toString(16).toUpperCase().padStart(4,'0')}`);

    // Fine-grained: poll every 500 cycles
    const FINE_STEP = 500;
    let found = false;
    for (let i = 0; i < 200000 && !found; i++) {
      await api.system.waitForCycles({ count: FINE_STEP });
      const v = await api.debug.readMemory(WATCH_ADDR);
      if (v !== lastValue) {
        console.log(`\n*** $${WATCH_ADDR.toString(16).toUpperCase()} changed: $${lastValue.toString(16).padStart(2,'0').toUpperCase()} -> $${v.toString(16).padStart(2,'0').toUpperCase()} at fine step ${i} ***`);

        // Capture CPU state
        const dbg = await api.debug.getDebugState();
        console.log(`CPU: PC=$${dbg.pc.toString(16).padStart(4,'0').toUpperCase()} A=$${dbg.a.toString(16).padStart(2,'0').toUpperCase()} X=$${dbg.x.toString(16).padStart(2,'0').toUpperCase()} Y=$${dbg.y.toString(16).padStart(2,'0').toUpperCase()} SP=$${dbg.sp.toString(16).padStart(2,'0').toUpperCase()}`);
        console.log(`Cycles: ${dbg.cycleCounter}`);

        // Capture trace
        const trace = await api.debug.getTraceTail(32);
        console.log(`\nInstruction trace (last ${trace.length}):`);
        trace.forEach((t, i2) => {
          console.log(`  [${i2}] PC=$${t.pc.toString(16).padStart(4,'0').toUpperCase()} A=$${t.a.toString(16).padStart(2,'0').toUpperCase()} X=$${t.x.toString(16).padStart(2,'0').toUpperCase()} Y=$${t.y.toString(16).padStart(2,'0').toUpperCase()}`);
        });

        // Dump SIO buffer pointer
        const bufLo = await api.debug.readMemory(SIO_BUF_LO);
        const bufHi = await api.debug.readMemory(SIO_BUF_HI);
        const bufAddr = bufLo | (bufHi << 8);
        console.log(`\nSIO buffer ptr: $${bufAddr.toString(16).padStart(4,'0').toUpperCase()}`);

        // Dump current SDLST
        const sdlLo = await api.debug.readMemory(SDLSTL);
        const sdlHi = await api.debug.readMemory(SDLSTH);
        console.log(`SDLST: $${(sdlLo | (sdlHi << 8)).toString(16).padStart(4,'0').toUpperCase()}`);

        // Dump 32 bytes around the watch address
        const dumpStart = Math.max(0, WATCH_ADDR - 16);
        const dumpBytes = await api.debug.readRange(dumpStart, 32);
        console.log(`\nMemory dump around $${dumpStart.toString(16).padStart(4,'0').toUpperCase()}:`);
        let hexStr = "";
        for (let j = 0; j < dumpBytes.length; j++) {
          if (j % 16 === 0) hexStr += `  $${(dumpStart + j).toString(16).padStart(4,'0').toUpperCase()}: `;
          hexStr += dumpBytes[j].toString(16).padStart(2,'0').toUpperCase() + " ";
          if ((j + 1) % 16 === 0) { console.log(hexStr); hexStr = ""; }
        }
        if (hexStr) console.log(hexStr);

        // Disassemble around PC
        const disasm = await api.debug.disassemble({ pc: Math.max(0, dbg.pc - 16), count: 20 });
        console.log(`\nDisassembly around PC:`);
        disasm.instructions.forEach(ins => {
          const marker = ins.address === dbg.pc ? " <-- PC" : "";
          console.log(`  $${ins.address.toString(16).padStart(4,'0').toUpperCase()}: ${ins.text}${marker}`);
        });

        // Also dump the page that contains $1F3A
        console.log(`\nFull $1F00 page dump:`);
        const pageDump = await api.debug.readRange(0x1F00, 256);
        for (let row = 0; row < 16; row++) {
          let line = `  $${(0x1F00 + row * 16).toString(16).padStart(4,'0').toUpperCase()}: `;
          for (let col = 0; col < 16; col++) {
            line += pageDump[row * 16 + col].toString(16).padStart(2,'0').toUpperCase() + " ";
          }
          console.log(line);
        }

        found = true;
        lastValue = v;
      }
    }

    if (!found) {
      console.log("No corruption detected in fine-grained phase.");
    }

  } catch (err) {
    console.error(err);
  } finally {
    await runtime.dispose();
  }
}

main();
