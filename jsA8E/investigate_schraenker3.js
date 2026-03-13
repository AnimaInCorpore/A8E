
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
    sioTurbo: false,
    frameDelayMs: 0,
  });

  try {
    const api = runtime.api;
    await api.whenReady();

    console.log("Loading Schraenker3.atr...");
    const diskData = fs.readFileSync(path.resolve(__dirname, "..", "Schraenker3.atr"));
    await api.media.mountDisk(diskData, { name: "Schraenker3.atr" });
    
    console.log("Booting normally...");
    await api.system.boot();

    console.log("Monitoring boot process...");
    for (let i = 0; i < 400; i++) {
      if (i === 200) {
          const dasm = await api.debug.disassemble({ pc: 0xC026, count: 10 });
          console.log(`Disassembly at $C026:`);
          dasm.instructions.forEach(ins => console.log(`  $${ins.address.toString(16).toUpperCase()}: ${ins.text}`));
      }

      const dlist_first = await api.debug.readMemory(0x1F3A);
      if (dlist_first === 0xFF) {
          console.log(`DLIST corrupted at emulated step ${i}!`);
          break;
      }

      await api.system.waitForCycles({ count: 1773447 / 10 }); 
    }

  } catch (err) {
    console.error(err);
  } finally {
    await runtime.dispose();
  }
}

main();
