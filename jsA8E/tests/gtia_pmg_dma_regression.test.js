/* global __dirname, console, require */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadGtiaApi() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "js", "core", "gtia.js"),
    "utf8",
  );
  const context = {
    console: console,
    Uint8Array: Uint8Array,
    Uint16Array: Uint16Array,
    Math: Math,
    Number: Number,
    Object: Object,
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "gtia.js" });

  return context.window.A8EGtia.createApi({
    PIXELS_PER_LINE: 456,
    IO_COLPF0: 0xd016,
    IO_COLPF1: 0xd017,
    IO_COLPF2: 0xd018,
    IO_COLPF3: 0xd019,
    IO_COLPM0_TRIG2: 0xd012,
    IO_COLPM1_TRIG3: 0xd013,
    IO_COLPM2_PAL: 0xd014,
    IO_COLPM3: 0xd015,
    IO_DMACTL: 0xd400,
    IO_GRACTL: 0xd01d,
    IO_GRAFM_TRIG1: 0xd011,
    IO_GRAFP0_P1PL: 0xd00d,
    IO_GRAFP1_P2PL: 0xd00e,
    IO_GRAFP2_P3PL: 0xd00f,
    IO_GRAFP3_TRIG0: 0xd010,
    IO_HPOSM0_P0PF: 0xd004,
    IO_HPOSM1_P1PF: 0xd005,
    IO_HPOSM2_P2PF: 0xd006,
    IO_HPOSM3_P3PF: 0xd007,
    IO_HPOSP0_M0PF: 0xd000,
    IO_HPOSP1_M1PF: 0xd001,
    IO_HPOSP2_M2PF: 0xd002,
    IO_HPOSP3_M3PF: 0xd003,
    IO_PMBASE: 0xd407,
    IO_PRIOR: 0xd01b,
    IO_SIZEM_P0PL: 0xd00c,
    IO_SIZEP0_M0PL: 0xd008,
    IO_SIZEP1_M1PL: 0xd009,
    IO_SIZEP2_M2PL: 0xd00a,
    IO_SIZEP3_M3PL: 0xd00b,
    IO_VDELAY: 0xd01c,
    PLAYFIELD_SCRATCH_VIEW_X: 64,
    PRIO_BKG: 0x00,
    PRIO_PF0: 0x01,
    PRIO_PF1: 0x02,
    PRIO_PF2: 0x04,
    PRIO_PF3: 0x08,
    PRIO_PM0: 0x10,
    PRIO_PM1: 0x20,
    PRIO_PM2: 0x40,
    PRIO_PM3: 0x80,
    PRIO_M10_PM0: 0x100,
    PRIO_M10_PM1: 0x200,
    PRIO_M10_PM2: 0x400,
    PRIO_M10_PM3: 0x800,
  });
}

function makeCtx() {
  return {
    ram: new Uint8Array(0x10000),
    sram: new Uint8Array(0x10000),
    ioData: {
      video: {
        currentDisplayLine: 0,
      },
      clock: 0,
      displayListFetchCycle: 0,
      currentDisplayListCommand: 0x00,
      drawLine: {
        playerMissileClockActive: true,
        playerMissileInterleaved: true,
        pmgFirstVisibleSpan: true,
        playerPmgShift: new Uint8Array(4),
        playerPmgState: new Uint8Array(4),
        missilePmgShift: new Uint8Array(4),
        missilePmgState: new Uint8Array(4),
      },
      videoOut: {
        pixels: new Uint8Array(456),
        priority: new Uint16Array(456),
      },
    },
  };
}

function testVdelayMasksFetchesOnEvenScanlines() {
  const api = loadGtiaApi();
  const ctx = makeCtx();

  ctx.sram[0xd400] = 0x08;
  ctx.sram[0xd01d] = 0x02;
  ctx.sram[0xd01c] = 0x10;
  ctx.sram[0xd407] = 0x20;
  ctx.ram[0x2204] = 0x33;
  ctx.ram[0x2205] = 0x44;

  const firstFetch = api.fetchPmgDmaCycle(ctx, 2, 9);
  assert.equal(firstFetch, 1);
  assert.equal(ctx.sram[0xd00d], 0x33);

  // AHRM 6.5/14.3: ANTIC still takes the DMA cycle; VDELAY only stops GTIA
  // from loading the latch on even scan lines.
  const maskedFetch = api.fetchPmgDmaCycle(ctx, 2, 10);
  assert.equal(maskedFetch, 1);
  assert.equal(ctx.sram[0xd00d], 0x33);

  const secondFetch = api.fetchPmgDmaCycle(ctx, 2, 11);
  assert.equal(secondFetch, 1);
  assert.equal(ctx.sram[0xd00d], 0x44);
}

function testVdelayMasksEachMissileField() {
  const api = loadGtiaApi();
  const ctx = makeCtx();

  ctx.sram[0xd400] = 0x04; // missile DMA
  ctx.sram[0xd01d] = 0x01;
  ctx.sram[0xd01c] = 0x02; // VDELAY for missile 1 only
  ctx.sram[0xd407] = 0x20;
  ctx.sram[0xd011] = 0x0c; // missile 1 latched on the previous line
  ctx.ram[0x2185] = 0xf3; // new data: missiles 0, 2, 3 set, missile 1 clear

  assert.equal(api.fetchPmgDmaCycle(ctx, 0, 10), 1);
  // Missile 1 keeps its old bits, the others load (AHRM 14.3 VDELAY layout).
  assert.equal(ctx.sram[0xd011], 0xff);
}

function testNoPmgDmaInVerticalBlank() {
  const api = loadGtiaApi();
  const ctx = makeCtx();

  ctx.sram[0xd400] = 0x0c;
  ctx.sram[0xd01d] = 0x03;
  ctx.sram[0xd407] = 0x20;
  ctx.ram[0x2203] = 0x55;
  // AHRM 4.13: P/M DMA only runs on scan lines 8-247.
  for (const y of [0, 7, 248]) {
    assert.equal(api.fetchPmgDmaCycle(ctx, 0, y), 0, "missile DMA on line " + y);
    assert.equal(api.fetchPmgDmaCycle(ctx, 2, y), 0, "player DMA on line " + y);
  }
  assert.equal(ctx.sram[0xd00d], 0x00);
  assert.equal(api.fetchPmgDmaCycle(ctx, 2, 8), 1);
}

function testCollisionsOnlyInsideVisibleWindow() {
  // AHRM 6.6: collisions register at color clocks $22-$DD on lines 8-247.
  function collide(hpos, line) {
    const api = loadGtiaApi();
    const ctx = makeCtx();
    const lineBase = line * 456;
    ctx.ioData.video.currentDisplayLine = line;
    ctx.ioData.videoOut.pixels = new Uint8Array(456 * 312);
    ctx.ioData.videoOut.priority = new Uint16Array(456 * 312);
    ctx.sram[0xd00d] = 0x80; // P0, one color clock
    ctx.sram[0xd000] = hpos;
    ctx.ioData.videoOut.priority.fill(0x01, lineBase + hpos * 2, lineBase + hpos * 2 + 2); // PF0
    api.drawPlayerMissilesClock(ctx, hpos * 2);
    return ctx.ram[0xd004] & 0x0f; // P0PF
  }
  assert.equal(collide(0x21, 8), 0, "left of $22");
  assert.equal(collide(0x22, 8), 1, "at $22");
  assert.equal(collide(0xdd, 8), 1, "at $DD");
  assert.equal(collide(0xde, 8), 0, "right of $DD");
  assert.equal(collide(0x80, 7), 0, "line 7");
}

function testPlayerDmaKeepsMissileSlotAlive() {
  const api = loadGtiaApi();
  const ctx = makeCtx();

  ctx.sram[0xd400] = 0x08;
  ctx.sram[0xd01d] = 0x01;
  ctx.sram[0xd407] = 0x20;
  ctx.ram[0x2184] = 0x7a;

  const fetch = api.fetchPmgDmaCycle(ctx, 0, 8);
  assert.equal(fetch, 1);
  assert.equal(ctx.sram[0xd011], 0x7a);
}

function testHposZeroStillRenders() {
  const api = loadGtiaApi();
  const ctx = makeCtx();

  ctx.sram[0xd01b] = 0x00;
  ctx.sram[0xd00d] = 0xff;
  ctx.sram[0xd000] = 0x00;
  ctx.sram[0xd008] = 0x03;
  ctx.sram[0xd012] = 0x66;

  api.drawPlayerMissilesClock(ctx, 32);

  assert.equal(ctx.ioData.videoOut.pixels[32], 0x66);
  assert.equal(ctx.ioData.videoOut.pixels[35], 0x66);
}

function testMidImageHposWriteKeepsOriginalStart() {
  const api = loadGtiaApi();
  const ctx = makeCtx();

  ctx.sram[0xd01b] = 0x00;
  ctx.sram[0xd00d] = 0xff;
  ctx.sram[0xd000] = 0x18;
  ctx.sram[0xd008] = 0x03;
  ctx.sram[0xd012] = 0x44;

  ctx.ioData.clock = 6;
  api.drawPlayerMissilesClock(ctx, 48);

  ctx.sram[0xd000] = 0x3c;
  ctx.ioData.clock = 7;
  api.drawPlayerMissilesClock(ctx, 52);

  ctx.ioData.clock = 24;
  api.drawPlayerMissilesClock(ctx, 120);

  assert.equal(ctx.ioData.videoOut.pixels[48], 0x44);
  assert.equal(ctx.ioData.videoOut.pixels[55], 0x44);
  assert.equal(ctx.ioData.videoOut.pixels[120], 0x44);
  assert.equal(ctx.ioData.videoOut.pixels[123], 0x44);
}

function testOverlappingRightwardHposRetriggerMergesShiftRegister() {
  const api = loadGtiaApi();
  const ctx = makeCtx();

  ctx.sram[0xd01b] = 0x00;
  ctx.sram[0xd00d] = 0x81;
  ctx.sram[0xd000] = 0x18;
  ctx.sram[0xd008] = 0x00;
  ctx.sram[0xd012] = 0x55;

  ctx.ioData.clock = 6;
  api.drawPlayerMissilesClock(ctx, 48);

  ctx.sram[0xd000] = 0x1a;
  ctx.ioData.clock = 7;
  api.drawPlayerMissilesClock(ctx, 52);
  api.drawPlayerMissilesClock(ctx, 56);
  api.drawPlayerMissilesClock(ctx, 60);
  api.drawPlayerMissilesClock(ctx, 64);

  assert.equal(ctx.ioData.videoOut.pixels[48], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[49], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[52], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[53], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[62], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[63], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[66], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[67], 0x55);
  assert.equal(ctx.ioData.drawLine.playerPmgShift[0], 0x00);
}

function testHpos30MapsToNormalPlayfieldLeftEdge() {
  const api = loadGtiaApi();
  const ctx = makeCtx();

  ctx.sram[0xd01b] = 0x00;
  ctx.sram[0xd00d] = 0x80;
  ctx.sram[0xd000] = 0x30;
  ctx.sram[0xd008] = 0x00;
  ctx.sram[0xd012] = 0x77;

  api.drawPlayerMissilesClock(ctx, 92);
  api.drawPlayerMissilesClock(ctx, 96);

  assert.equal(ctx.ioData.videoOut.pixels[95], 0x00);
  assert.equal(ctx.ioData.videoOut.pixels[96], 0x77);
  assert.equal(ctx.ioData.videoOut.pixels[97], 0x77);
}

// Draws the first color clock of the normal playfield (x=96) with objects at
// HPOS $30 over an already rendered playfield pixel and returns its color.
function drawPriorityCase(options) {
  const api = loadGtiaApi();
  const ctx = makeCtx();
  const sram = ctx.sram;

  sram[0xd016] = 0x22; // COLPF0
  sram[0xd017] = 0x0a; // COLPF1
  sram[0xd018] = 0x94; // COLPF2
  sram[0xd019] = 0x44; // COLPF3
  sram[0xd012] = 0x21; // COLPM0
  sram[0xd013] = 0x42; // COLPM1
  sram[0xd014] = 0x46; // COLPM2
  sram[0xd015] = 0x88; // COLPM3
  sram[0xd01b] = options.prior;
  sram[0xd00d] = options.grafP0 || 0;
  sram[0xd00f] = options.grafP2 || 0;
  sram[0xd011] = options.grafM || 0;
  sram[0xd000] = 0x30; // HPOSP0
  sram[0xd002] = 0x30; // HPOSP2
  sram[0xd004] = 0x30; // HPOSM0
  sram[0xd005] = 0x30; // HPOSM1
  ctx.ioData.currentDisplayListCommand = options.mode || 0x0e;
  ctx.ioData.videoOut.pixels.fill(options.pixel, 96, 100);
  ctx.ioData.videoOut.priority.fill(options.priority, 96, 100);

  api.drawPlayerMissilesClock(ctx, 96);
  return ctx.ioData.videoOut.pixels[96];
}

function testGtiaPriorityEquations() {
  const PF0 = { pixel: 0x22, priority: 0x01 };
  const PF2 = { pixel: 0x94, priority: 0x04 };
  const BAK = { pixel: 0x00, priority: 0x00 };
  const cases = [
    // AHRM 6.7 mode 0: PF2/PF3 mix with P2/P3 ($46 | $94).
    ["PRIOR=0 P2 over PF2 mixes", PF2, { prior: 0x00, grafP2: 0xff }, 0xd6],
    // Mode 0: PF0/PF1 mix with P0/P1 ($21 | $22).
    ["PRIOR=0 P0 over PF0 mixes", PF0, { prior: 0x00, grafP0: 0xff }, 0x23],
    // Mode 0: PF0/PF1 still win over P2/P3.
    ["PRIOR=0 PF0 hides P2", PF0, { prior: 0x00, grafP2: 0xff }, 0x22],
    // Table 16: PRIOR[3:0]=0110 with PF01+P01 gives black.
    ["PRIOR=6 PF0 and P0 give black", PF0, { prior: 0x06, grafP0: 0xff }, 0x00],
    ["PRIOR=1 P0 over PF0", PF0, { prior: 0x01, grafP0: 0xff }, 0x21],
    ["PRIOR=4 PF0 over P0", PF0, { prior: 0x04, grafP0: 0xff }, 0x22],
    // Multicolor players blend M0 and M1 too ($21 | $42).
    ["PRIOR=$20 M0+M1 blend", BAK, { prior: 0x20, grafM: 0x0f }, 0x63],
    ["PRIOR=0 M0 hides M1", BAK, { prior: 0x00, grafM: 0x0f }, 0x21],
    // The fifth player shows COLPF3 and beats the other playfields.
    ["PRIOR=$11 fifth player over PF0", PF0, { prior: 0x11, grafM: 0x03 }, 0x44],
    // GTIA mode 10 codes 0000-0011 act as players (AHRM 6.9): P0 hides
    // a code-1 pixel unless multicolor players are on.
    ["PRIOR=$80 P0 over a mode 10 P1 pixel", { pixel: 0x42, priority: 0x200 }, { prior: 0x80, grafP0: 0xff, mode: 0x0f }, 0x21],
    ["PRIOR=$A0 P0 blends with a mode 10 P1 pixel", { pixel: 0x42, priority: 0x200 }, { prior: 0xa0, grafP0: 0xff, mode: 0x0f }, 0x63],
    // AHRM 6.9: in GTIA modes 9/11 the fifth player mixes with the pixel as
    // if PF3 replaced COLBK. The renderers keep the pixel in bits 12-15.
    ["PRIOR=$50 fifth player ORs the mode 9 luminance", { pixel: 0x05, priority: 0x5000 }, { prior: 0x50, grafM: 0x03, mode: 0x0f }, 0x45],
    ["PRIOR=$D0 fifth player ORs the mode 11 hue", { pixel: 0x30, priority: 0x3000 }, { prior: 0xd0, grafM: 0x03, mode: 0x0f }, 0x74],
    ["PRIOR=$D0 mode 11 pixel 0 forces luminance 0", { pixel: 0x00, priority: 0x0000 }, { prior: 0xd0, grafM: 0x03, mode: 0x0f }, 0x40],
  ];
  for (const [name, playfield, objects, expected] of cases) {
    const color = drawPriorityCase(Object.assign({}, playfield, objects));
    assert.equal(color, expected, name + ": got $" + color.toString(16));
  }
}

function testHiresPriorityUsesPf2AndPf1Luminance() {
  // AHRM 6.8: the priority logic sees PF2 in hires modes, and the PF1
  // luminance lands on the 1-bits afterwards (PF1-tagged pixels).
  const lit = { pixel: 0x9a, priority: 0x02, mode: 0x02 };
  const unlit = { pixel: 0x94, priority: 0x04, mode: 0x02 };
  assert.equal(
    drawPriorityCase(Object.assign({ prior: 0x04, grafP0: 0xff }, lit)),
    0x9a,
    "text in front of a player keeps the PF2 hue",
  );
  assert.equal(
    drawPriorityCase(Object.assign({ prior: 0x01, grafP0: 0xff }, lit)),
    0x2a,
    "a player in front lends its hue to the text luminance",
  );
  assert.equal(
    drawPriorityCase(Object.assign({ prior: 0x00, grafP0: 0xff }, unlit)),
    0x21,
    "mode 0: P0 wins over the hires PF2 background",
  );
}

testVdelayMasksFetchesOnEvenScanlines();
testVdelayMasksEachMissileField();
testNoPmgDmaInVerticalBlank();
testCollisionsOnlyInsideVisibleWindow();
testGtiaPriorityEquations();
testHiresPriorityUsesPf2AndPf1Luminance();
testPlayerDmaKeepsMissileSlotAlive();
testHposZeroStillRenders();
testMidImageHposWriteKeepsOriginalStart();
testOverlappingRightwardHposRetriggerMergesShiftRegister();
testHpos30MapsToNormalPlayfieldLeftEdge();
console.log("gtia_pmg_dma_regression tests passed");
