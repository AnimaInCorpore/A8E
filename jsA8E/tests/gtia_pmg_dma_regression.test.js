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
  ctx.ram[0x2203] = 0x33;
  ctx.ram[0x2204] = 0x44;

  const firstFetch = api.fetchPmgDmaCycle(ctx, 2, 7);
  assert.equal(firstFetch, 1);
  assert.equal(ctx.sram[0xd00d], 0x33);

  const maskedFetch = api.fetchPmgDmaCycle(ctx, 2, 8);
  assert.equal(maskedFetch, 0);
  assert.equal(ctx.sram[0xd00d], 0x33);

  const secondFetch = api.fetchPmgDmaCycle(ctx, 2, 9);
  assert.equal(secondFetch, 1);
  assert.equal(ctx.sram[0xd00d], 0x44);
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
  api.drawPlayerMissilesClock(ctx, 56);

  ctx.sram[0xd000] = 0x3c;
  ctx.ioData.clock = 7;
  api.drawPlayerMissilesClock(ctx, 60);

  ctx.ioData.clock = 24;
  api.drawPlayerMissilesClock(ctx, 128);

  assert.equal(ctx.ioData.videoOut.pixels[56], 0x44);
  assert.equal(ctx.ioData.videoOut.pixels[63], 0x44);
  assert.equal(ctx.ioData.videoOut.pixels[128], 0x44);
  assert.equal(ctx.ioData.videoOut.pixels[131], 0x44);
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
  api.drawPlayerMissilesClock(ctx, 56);

  ctx.sram[0xd000] = 0x1a;
  ctx.ioData.clock = 7;
  api.drawPlayerMissilesClock(ctx, 60);
  api.drawPlayerMissilesClock(ctx, 64);
  api.drawPlayerMissilesClock(ctx, 68);
  api.drawPlayerMissilesClock(ctx, 72);

  assert.equal(ctx.ioData.videoOut.pixels[56], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[57], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[60], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[61], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[70], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[71], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[74], 0x55);
  assert.equal(ctx.ioData.videoOut.pixels[75], 0x55);
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

  api.drawPlayerMissiles(ctx);

  assert.equal(ctx.ioData.videoOut.pixels[96], 0x00);
  assert.equal(ctx.ioData.videoOut.pixels[104], 0x77);
  assert.equal(ctx.ioData.videoOut.pixels[105], 0x77);
}

testVdelayMasksFetchesOnEvenScanlines();
testPlayerDmaKeepsMissileSlotAlive();
testHposZeroStillRenders();
testMidImageHposWriteKeepsOriginalStart();
testOverlappingRightwardHposRetriggerMergesShiftRegister();
testHpos30MapsToNormalPlayfieldLeftEdge();
console.log("gtia_pmg_dma_regression tests passed");
