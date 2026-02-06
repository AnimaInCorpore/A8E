(function () {
  "use strict";

  function createApi(cfg) {
    var PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;

    var IO_COLPF3 = cfg.IO_COLPF3;
    var IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    var IO_COLPM1_TRIG3 = cfg.IO_COLPM1_TRIG3;
    var IO_COLPM2_PAL = cfg.IO_COLPM2_PAL;
    var IO_COLPM3 = cfg.IO_COLPM3;
    var IO_DMACTL = cfg.IO_DMACTL;
    var IO_GRACTL = cfg.IO_GRACTL;
    var IO_GRAFM_TRIG1 = cfg.IO_GRAFM_TRIG1;
    var IO_GRAFP0_P1PL = cfg.IO_GRAFP0_P1PL;
    var IO_GRAFP1_P2PL = cfg.IO_GRAFP1_P2PL;
    var IO_GRAFP2_P3PL = cfg.IO_GRAFP2_P3PL;
    var IO_GRAFP3_TRIG0 = cfg.IO_GRAFP3_TRIG0;
    var IO_HPOSM0_P0PF = cfg.IO_HPOSM0_P0PF;
    var IO_HPOSM1_P1PF = cfg.IO_HPOSM1_P1PF;
    var IO_HPOSM2_P2PF = cfg.IO_HPOSM2_P2PF;
    var IO_HPOSM3_P3PF = cfg.IO_HPOSM3_P3PF;
    var IO_HPOSP0_M0PF = cfg.IO_HPOSP0_M0PF;
    var IO_HPOSP1_M1PF = cfg.IO_HPOSP1_M1PF;
    var IO_HPOSP2_M2PF = cfg.IO_HPOSP2_M2PF;
    var IO_HPOSP3_M3PF = cfg.IO_HPOSP3_M3PF;
    var IO_PMBASE = cfg.IO_PMBASE;
    var IO_PRIOR = cfg.IO_PRIOR;
    var IO_SIZEM_P0PL = cfg.IO_SIZEM_P0PL;
    var IO_SIZEP0_M0PL = cfg.IO_SIZEP0_M0PL;
    var IO_SIZEP1_M1PL = cfg.IO_SIZEP1_M1PL;
    var IO_SIZEP2_M2PL = cfg.IO_SIZEP2_M2PL;
    var IO_SIZEP3_M3PL = cfg.IO_SIZEP3_M3PL;
    var IO_VDELAY = cfg.IO_VDELAY;

    var PRIO_PF0 = cfg.PRIO_PF0;
    var PRIO_PF1 = cfg.PRIO_PF1;
    var PRIO_PF2 = cfg.PRIO_PF2;
    var PRIO_PF3 = cfg.PRIO_PF3;
    var PRIO_PM0 = cfg.PRIO_PM0;
    var PRIO_PM1 = cfg.PRIO_PM1;
    var PRIO_PM2 = cfg.PRIO_PM2;
    var PRIO_PM3 = cfg.PRIO_PM3;

function drawPlayer(
  color,
  size,
  data,
  priorityMask,
  priorityBit,
  prio,
  dst,
  startIndex,
  special,
  overlap
) {
  var mask = 0x80;
  var collision = 0;
  var step;
  var cColor = color & 0xff;
  var cPriorityMask = priorityMask & 0xff;
  var cPriorityBit = priorityBit & 0xff;
  var cOverlap = overlap & 0xff;

  if (((size & 0x03) & 0xff) === 0x01) step = 4;
  else if (((size & 0x03) & 0xff) === 0x03) step = 8;
  else step = 2;

  var idx = startIndex | 0;
  while (mask) {
    if (data & mask) {
      for (var o = 0; o < step; o++) {
        var pi = (idx + o) | 0;
        var p = prio[pi] & 0xff;

        if (cOverlap && (p & cOverlap)) {
          if (special && (p & PRIO_PF1)) {
            dst[pi] = (dst[pi] | (cColor & 0xf0)) & 0xff;
          } else if (!(p & cPriorityMask)) {
            dst[pi] = (dst[pi] | cColor) & 0xff;
          }
        } else {
          if (special && (p & PRIO_PF1)) {
            dst[pi] = ((dst[pi] & 0x0f) | (cColor & 0xf0)) & 0xff;
          } else if (!(p & cPriorityMask)) {
            dst[pi] = cColor;
          }
        }

        prio[pi] = (prio[pi] | cPriorityBit) & 0xff;
        collision |= prio[pi] & 0xff;
      }
    }

    idx += step;
    mask >>= 1;
  }

  if (special) {
    collision =
      (collision & ~(PRIO_PF1 | PRIO_PF2)) | (collision & PRIO_PF1 ? PRIO_PF2 : 0);
  }

  return collision & 0xff;
}

function drawMissile(
  number,
  color,
  size,
  data,
  priorityMask,
  prio,
  dst,
  startIndex,
  special
) {
  var collision = 0;
  var cColor = color & 0xff;
  var cPriorityMask = priorityMask & 0xff;

  var shifted = (number & 3) << 1;
  var mask = (0x02 << shifted) & 0xff;

  var width;
  var sizeBits = size & (0x03 << shifted);
  if (sizeBits === (0x01 << shifted)) width = 4;
  else if (sizeBits === (0x03 << shifted)) width = 8;
  else width = 2;

  function drawPixel(pi) {
    var p = prio[pi] & 0xff;
    if (special && (p & PRIO_PF1)) {
      dst[pi] = ((dst[pi] & 0x0f) | (cColor & 0xf0)) & 0xff;
    } else if (!(p & cPriorityMask)) {
      dst[pi] = cColor;
    }
    collision |= p;
  }

  if (data & mask) {
    for (var o0 = 0; o0 < width; o0++) drawPixel((startIndex + o0) | 0);
  }

  mask >>= 1;
  if (data & mask) {
    var base = (startIndex + width) | 0;
    for (var o1 = 0; o1 < width; o1++) drawPixel((base + o1) | 0);
  }

  if (special) {
    collision =
      (collision & ~(PRIO_PF1 | PRIO_PF2)) | (collision & PRIO_PF1 ? PRIO_PF2 : 0);
  }

  return collision & 0xff;
}

function drawPlayerMissiles(ctx) {
  var io = ctx.ioData;
  var ram = ctx.ram;
  var sram = ctx.sram;
  var y = io.video.currentDisplayLine | 0;

  if (y >= 248) return;

  var dst = io.videoOut.pixels;
  var prio = io.videoOut.priority;
  var prior = sram[IO_PRIOR] & 0xff;
  var mode = io.currentDisplayListCommand & 0x0f;
  var special = (mode === 0x02 || mode === 0x03 || mode === 0x0f) && (prior & 0xc0) === 0;

  var dmactl = sram[IO_DMACTL] & 0xff;
  var pmDmaPlayers = (dmactl & 0x08) && (sram[IO_GRACTL] & 0x02);
  var pmDmaMissiles = (dmactl & 0x04) && (sram[IO_GRACTL] & 0x01);

  var pmbaseHi = (sram[IO_PMBASE] & 0xff) << 8;

  function pmAddrHiRes(offset) {
    return ((pmbaseHi & 0xf800) + offset + y) & 0xffff;
  }

  function pmAddrLoRes(offset, vdelayMask) {
    var lineIndex = (y >> 1) - ((sram[IO_VDELAY] & vdelayMask) ? 1 : 0);
    return ((pmbaseHi & 0xfc00) + offset + (lineIndex & 0xffff)) & 0xffff;
  }

  // Keep the order of the players being drawn!

  // Player 3
  var data;
  if (pmDmaPlayers) {
    data = dmactl & 0x10 ? ram[pmAddrHiRes(1792)] & 0xff : ram[pmAddrLoRes(896, 0x80)] & 0xff;
  } else {
    data = sram[IO_GRAFP3_TRIG0] & 0xff;
  }

  var hpos = sram[IO_HPOSP3_M3PF] & 0xff;
  if (data && hpos) {
    var start = y * PIXELS_PER_LINE + hpos * 2;
    var mask;
    if (prior & 0x01) mask = PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
    else if (prior & 0x02) mask = PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM2;
    else if (prior & 0x04) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
    else if (prior & 0x08) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
    else mask = 0x00;

    var col = drawPlayer(
      sram[IO_COLPM3],
      sram[IO_SIZEP3_M3PL],
      data,
      mask,
      PRIO_PM3,
      prio,
      dst,
      start,
      special,
      0
    );

    ram[IO_HPOSM3_P3PF] |= col & 0x0f;
  }

  // Player 2
  if (pmDmaPlayers) {
    data = dmactl & 0x10 ? ram[pmAddrHiRes(1536)] & 0xff : ram[pmAddrLoRes(768, 0x40)] & 0xff;
  } else {
    data = sram[IO_GRAFP2_P3PL] & 0xff;
  }

  hpos = sram[IO_HPOSP2_M2PF] & 0xff;
  if (data && hpos) {
    var start2 = y * PIXELS_PER_LINE + hpos * 2;
    if (prior & 0x01) mask = PRIO_PM0 | PRIO_PM1;
    else if (prior & 0x02) mask = PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
    else if (prior & 0x04) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1;
    else if (prior & 0x08) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1;
    else mask = 0x00;

    var col2 = drawPlayer(
      sram[IO_COLPM2_PAL],
      sram[IO_SIZEP2_M2PL],
      data,
      mask,
      PRIO_PM2,
      prio,
      dst,
      start2,
      special,
      prior & 0x20 ? PRIO_PM3 : 0
    );

    ram[IO_HPOSM2_P2PF] |= col2 & 0x0f;
    if (col2 & PRIO_PM3) ram[IO_GRAFP2_P3PL] |= 0x04;
    ram[IO_GRAFP1_P2PL] |= ((col2 >> 4) & ~0x04) & 0xff;
  }

  // Player 1
  if (pmDmaPlayers) {
    data = dmactl & 0x10 ? ram[pmAddrHiRes(1280)] & 0xff : ram[pmAddrLoRes(640, 0x20)] & 0xff;
  } else {
    data = sram[IO_GRAFP1_P2PL] & 0xff;
  }

  hpos = sram[IO_HPOSP1_M1PF] & 0xff;
  if (data && hpos) {
    var start1 = y * PIXELS_PER_LINE + hpos * 2;
    if (prior & 0x01) mask = PRIO_PM0;
    else if (prior & 0x02) mask = PRIO_PM0;
    else if (prior & 0x04) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0;
    else if (prior & 0x08) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0;
    else mask = 0x00;

    var col1 = drawPlayer(
      sram[IO_COLPM1_TRIG3],
      sram[IO_SIZEP1_M1PL],
      data,
      mask,
      PRIO_PM1,
      prio,
      dst,
      start1,
      special,
      0
    );

    ram[IO_HPOSM1_P1PF] |= col1 & 0x0f;
    if (col1 & PRIO_PM3) ram[IO_GRAFP2_P3PL] |= 0x02;
    if (col1 & PRIO_PM2) ram[IO_GRAFP1_P2PL] |= 0x02;
    ram[IO_GRAFP0_P1PL] |= ((col1 >> 4) & ~0x02) & 0xff;
  }

  // Player 0
  if (pmDmaPlayers) {
    data = dmactl & 0x10 ? ram[pmAddrHiRes(1024)] & 0xff : ram[pmAddrLoRes(512, 0x10)] & 0xff;
  } else {
    data = sram[IO_GRAFP0_P1PL] & 0xff;
  }

  hpos = sram[IO_HPOSP0_M0PF] & 0xff;
  if (data && hpos) {
    var start0 = y * PIXELS_PER_LINE + hpos * 2;
    if (prior & 0x01) mask = 0x00;
    else if (prior & 0x02) mask = 0x00;
    else if (prior & 0x04) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
    else if (prior & 0x08) mask = PRIO_PF0 | PRIO_PF1;
    else mask = 0x00;

    var col0 = drawPlayer(
      sram[IO_COLPM0_TRIG2],
      sram[IO_SIZEP0_M0PL],
      data,
      mask,
      PRIO_PM0,
      prio,
      dst,
      start0,
      special,
      prior & 0x20 ? PRIO_PM1 : 0
    );

    ram[IO_HPOSM0_P0PF] |= col0 & 0x0f;
    if (col0 & PRIO_PM3) ram[IO_GRAFP2_P3PL] |= 0x01;
    if (col0 & PRIO_PM2) ram[IO_GRAFP1_P2PL] |= 0x01;
    if (col0 & PRIO_PM1) ram[IO_GRAFP0_P1PL] |= 0x01;
    ram[IO_SIZEM_P0PL] |= ((col0 >> 4) & ~0x01) & 0xff;
  }

  // All missiles
  if (pmDmaMissiles) {
    data = dmactl & 0x10 ? ram[pmAddrHiRes(768)] & 0xff : ram[pmAddrLoRes(384, 0x08)] & 0xff;
  } else {
    data = sram[IO_GRAFM_TRIG1] & 0xff;
  }

  // Missile 3
  hpos = sram[IO_HPOSM3_P3PF] & 0xff;
  if ((data & 0xc0) && hpos) {
    var startM3 = y * PIXELS_PER_LINE + hpos * 2;
    if (prior & 0x01) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
    else if (prior & 0x02) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 : PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM2;
    else if (prior & 0x04) mask = prior & 0x10 ? 0x00 : PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
    else if (prior & 0x08) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
    else mask = 0x00;

    var colM3 = drawMissile(
      3,
      prior & 0x10 ? sram[IO_COLPF3] : sram[IO_COLPM3],
      sram[IO_SIZEM_P0PL],
      data,
      mask,
      prio,
      dst,
      startM3,
      special
    );

    ram[IO_HPOSP3_M3PF] |= colM3 & 0x0f;
    ram[IO_SIZEP3_M3PL] |= (colM3 >> 4) & 0xff;
  }

  // Missile 2
  hpos = sram[IO_HPOSM2_P2PF] & 0xff;
  if ((data & 0x30) && hpos) {
    var startM2 = y * PIXELS_PER_LINE + hpos * 2;
    if (prior & 0x01) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PM0 | PRIO_PM1;
    else if (prior & 0x02) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 : PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
    else if (prior & 0x04) mask = prior & 0x10 ? 0x00 : PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1;
    else if (prior & 0x08) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1;
    else mask = 0x00;

    var colM2 = drawMissile(
      2,
      prior & 0x10 ? sram[IO_COLPF3] : sram[IO_COLPM2_PAL],
      sram[IO_SIZEM_P0PL],
      data,
      mask,
      prio,
      dst,
      startM2,
      special
    );

    ram[IO_HPOSP2_M2PF] |= colM2 & 0x0f;
    ram[IO_SIZEP2_M2PL] |= (colM2 >> 4) & 0xff;
  }

  // Missile 1
  hpos = sram[IO_HPOSM1_P1PF] & 0xff;
  if ((data & 0x0c) && hpos) {
    var startM1 = y * PIXELS_PER_LINE + hpos * 2;
    if (prior & 0x01) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PM0;
    else if (prior & 0x02) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 : PRIO_PM0;
    else if (prior & 0x04) mask = prior & 0x10 ? 0x00 : PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0;
    else if (prior & 0x08) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PF0 | PRIO_PF1 | PRIO_PM0;
    else mask = 0x00;

    var colM1 = drawMissile(
      1,
      prior & 0x10 ? sram[IO_COLPF3] : sram[IO_COLPM1_TRIG3],
      sram[IO_SIZEM_P0PL],
      data,
      mask,
      prio,
      dst,
      startM1,
      special
    );

    ram[IO_HPOSP1_M1PF] |= colM1 & 0x0f;
    ram[IO_SIZEP1_M1PL] |= (colM1 >> 4) & 0xff;
  }

  // Missile 0
  hpos = sram[IO_HPOSM0_P0PF] & 0xff;
  if ((data & 0x03) && hpos) {
    var startM0 = y * PIXELS_PER_LINE + hpos * 2;
    if (prior & 0x01) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : 0x00;
    else if (prior & 0x02) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 : 0x00;
    else if (prior & 0x04) mask = prior & 0x10 ? 0x00 : PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
    else if (prior & 0x08) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PF0 | PRIO_PF1;
    else mask = 0x00;

    var colM0 = drawMissile(
      0,
      prior & 0x10 ? sram[IO_COLPF3] : sram[IO_COLPM0_TRIG2],
      sram[IO_SIZEM_P0PL],
      data,
      mask,
      prio,
      dst,
      startM0,
      special
    );

    ram[IO_HPOSP0_M0PF] |= colM0 & 0x0f;
    ram[IO_SIZEP0_M0PL] |= (colM0 >> 4) & 0xff;
  }
}


    return {
      drawPlayerMissiles: drawPlayerMissiles,
    };
  }

  window.A8EGtia = {
    createApi: createApi,
  };
})();