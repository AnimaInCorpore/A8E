
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
    console.log(`Loading ${path.basename(diskPath)}...`);
    const diskData = fs.readFileSync(diskPath);
    await api.media.mountDisk(diskData, { name: path.basename(diskPath) });
    
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
