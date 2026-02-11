(function () {
  "use strict";

  function createApi(cfg) {
    let PIXELS_PER_LINE = cfg.PIXELS_PER_LINE;

    let IO_COLPF3 = cfg.IO_COLPF3;
    let IO_COLPM0_TRIG2 = cfg.IO_COLPM0_TRIG2;
    let IO_COLPM1_TRIG3 = cfg.IO_COLPM1_TRIG3;
    let IO_COLPM2_PAL = cfg.IO_COLPM2_PAL;
    let IO_COLPM3 = cfg.IO_COLPM3;
    let IO_DMACTL = cfg.IO_DMACTL;
    let IO_GRACTL = cfg.IO_GRACTL;
    let IO_GRAFM_TRIG1 = cfg.IO_GRAFM_TRIG1;
    let IO_GRAFP0_P1PL = cfg.IO_GRAFP0_P1PL;
    let IO_GRAFP1_P2PL = cfg.IO_GRAFP1_P2PL;
    let IO_GRAFP2_P3PL = cfg.IO_GRAFP2_P3PL;
    let IO_GRAFP3_TRIG0 = cfg.IO_GRAFP3_TRIG0;
    let IO_HPOSM0_P0PF = cfg.IO_HPOSM0_P0PF;
    let IO_HPOSM1_P1PF = cfg.IO_HPOSM1_P1PF;
    let IO_HPOSM2_P2PF = cfg.IO_HPOSM2_P2PF;
    let IO_HPOSM3_P3PF = cfg.IO_HPOSM3_P3PF;
    let IO_HPOSP0_M0PF = cfg.IO_HPOSP0_M0PF;
    let IO_HPOSP1_M1PF = cfg.IO_HPOSP1_M1PF;
    let IO_HPOSP2_M2PF = cfg.IO_HPOSP2_M2PF;
    let IO_HPOSP3_M3PF = cfg.IO_HPOSP3_M3PF;
    let IO_PMBASE = cfg.IO_PMBASE;
    let IO_PRIOR = cfg.IO_PRIOR;
    let IO_SIZEM_P0PL = cfg.IO_SIZEM_P0PL;
    let IO_SIZEP0_M0PL = cfg.IO_SIZEP0_M0PL;
    let IO_SIZEP1_M1PL = cfg.IO_SIZEP1_M1PL;
    let IO_SIZEP2_M2PL = cfg.IO_SIZEP2_M2PL;
    let IO_SIZEP3_M3PL = cfg.IO_SIZEP3_M3PL;
    let IO_VDELAY = cfg.IO_VDELAY;

    let PRIO_PF0 = cfg.PRIO_PF0;
    let PRIO_PF1 = cfg.PRIO_PF1;
    let PRIO_PF2 = cfg.PRIO_PF2;
    let PRIO_PF3 = cfg.PRIO_PF3;
    let PRIO_PM0 = cfg.PRIO_PM0;
    let PRIO_PM1 = cfg.PRIO_PM1;
    let PRIO_PM2 = cfg.PRIO_PM2;
    let PRIO_PM3 = cfg.PRIO_PM3;

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
      overlap,
    ) {
      let mask = 0x80;
      let collision = 0;
      let step;
      let cColor = color & 0xff;
      let cPriorityMask = priorityMask & 0xff;
      let cPriorityBit = priorityBit & 0xff;
      let cOverlap = overlap & 0xff;

      if ((size & 0x03 & 0xff) === 0x01) step = 4;
      else if ((size & 0x03 & 0xff) === 0x03) step = 8;
      else step = 2;

      let idx = startIndex | 0;
      while (mask) {
        if (data & mask) {
          for (let o = 0; o < step; o++) {
            let pi = (idx + o) | 0;
            let p = prio[pi] & 0xff;

            if (cOverlap && p & cOverlap) {
              if (special && p & PRIO_PF1) {
                dst[pi] = (dst[pi] | (cColor & 0xf0)) & 0xff;
              } else if (!(p & cPriorityMask)) {
                dst[pi] = (dst[pi] | cColor) & 0xff;
              }
            } else {
              if (special && p & PRIO_PF1) {
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
          (collision & ~(PRIO_PF1 | PRIO_PF2)) |
          (collision & PRIO_PF1 ? PRIO_PF2 : 0);
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
      special,
    ) {
      let collision = 0;
      let cColor = color & 0xff;
      let cPriorityMask = priorityMask & 0xff;

      let shifted = (number & 3) << 1;
      let mask = (0x02 << shifted) & 0xff;

      let width;
      let sizeBits = size & (0x03 << shifted);
      if (sizeBits === 0x01 << shifted) width = 4;
      else if (sizeBits === 0x03 << shifted) width = 8;
      else width = 2;

      function drawPixel(pi) {
        let p = prio[pi] & 0xff;
        if (special && p & PRIO_PF1) {
          dst[pi] = ((dst[pi] & 0x0f) | (cColor & 0xf0)) & 0xff;
        } else if (!(p & cPriorityMask)) {
          dst[pi] = cColor;
        }
        collision |= p;
      }

      if (data & mask) {
        for (let o0 = 0; o0 < width; o0++) drawPixel((startIndex + o0) | 0);
      }

      mask >>= 1;
      if (data & mask) {
        let base = (startIndex + width) | 0;
        for (let o1 = 0; o1 < width; o1++) drawPixel((base + o1) | 0);
      }

      if (special) {
        collision =
          (collision & ~(PRIO_PF1 | PRIO_PF2)) |
          (collision & PRIO_PF1 ? PRIO_PF2 : 0);
      }

      return collision & 0xff;
    }

    function drawPlayerMissiles(ctx) {
      let io = ctx.ioData;
      let ram = ctx.ram;
      let sram = ctx.sram;
      let y = io.video.currentDisplayLine | 0;

      if (y >= 248) return;

      let dst = io.videoOut.pixels;
      let prio = io.videoOut.priority;
      let prior = sram[IO_PRIOR] & 0xff;
      let mode = io.currentDisplayListCommand & 0x0f;
      let special =
        (mode === 0x02 || mode === 0x03 || mode === 0x0f) &&
        (prior & 0xc0) === 0;

      let dmactl = sram[IO_DMACTL] & 0xff;
      let pmDmaPlayers = dmactl & 0x08 && sram[IO_GRACTL] & 0x02;
      let pmDmaMissiles = dmactl & 0x04 && sram[IO_GRACTL] & 0x01;

      let pmbaseHi = (sram[IO_PMBASE] & 0xff) << 8;

      function pmAddrHiRes(offset, vdelayMask) {
        let lineIndex = y - (sram[IO_VDELAY] & vdelayMask ? 1 : 0);
        return ((pmbaseHi & 0xf800) + offset + (lineIndex & 0xffff)) & 0xffff;
      }

      function pmAddrLoRes(offset, vdelayMask) {
        let lineIndex = (y >> 1) - (sram[IO_VDELAY] & vdelayMask ? 1 : 0);
        return ((pmbaseHi & 0xfc00) + offset + (lineIndex & 0xffff)) & 0xffff;
      }

      // Keep the order of the players being drawn!

      // Player 3
      let data;
      let mask;
      if (pmDmaPlayers) {
        data =
          dmactl & 0x10
            ? ram[pmAddrHiRes(1792, 0x80)] & 0xff
            : ram[pmAddrLoRes(896, 0x80)] & 0xff;
        // With player DMA on, keep GRAFPn shadowed from PM memory.
        sram[IO_GRAFP3_TRIG0] = data;
      } else {
        data = sram[IO_GRAFP3_TRIG0] & 0xff;
      }

      let hpos = sram[IO_HPOSP3_M3PF] & 0xff;
      if (data && hpos) {
        let start = y * PIXELS_PER_LINE + hpos * 2;
        if (prior & 0x01) mask = PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
        else if (prior & 0x02)
          mask =
            PRIO_PM0 |
            PRIO_PM1 |
            PRIO_PF0 |
            PRIO_PF1 |
            PRIO_PF2 |
            PRIO_PF3 |
            PRIO_PM2;
        else if (prior & 0x04)
          mask =
            PRIO_PF0 |
            PRIO_PF1 |
            PRIO_PF2 |
            PRIO_PF3 |
            PRIO_PM0 |
            PRIO_PM1 |
            PRIO_PM2;
        else if (prior & 0x08)
          mask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
        else mask = 0x00;

        let col = drawPlayer(
          sram[IO_COLPM3],
          sram[IO_SIZEP3_M3PL],
          data,
          mask,
          PRIO_PM3,
          prio,
          dst,
          start,
          special,
          0,
        );

        ram[IO_HPOSM3_P3PF] |= col & 0x0f;
      }

      // Player 2
      if (pmDmaPlayers) {
        data =
          dmactl & 0x10
            ? ram[pmAddrHiRes(1536, 0x40)] & 0xff
            : ram[pmAddrLoRes(768, 0x40)] & 0xff;
        sram[IO_GRAFP2_P3PL] = data;
      } else {
        data = sram[IO_GRAFP2_P3PL] & 0xff;
      }

      hpos = sram[IO_HPOSP2_M2PF] & 0xff;
      if (data && hpos) {
        let start2 = y * PIXELS_PER_LINE + hpos * 2;
        if (prior & 0x01) mask = PRIO_PM0 | PRIO_PM1;
        else if (prior & 0x02)
          mask =
            PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
        else if (prior & 0x04)
          mask =
            PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1;
        else if (prior & 0x08) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1;
        else mask = 0x00;

        let col2 = drawPlayer(
          sram[IO_COLPM2_PAL],
          sram[IO_SIZEP2_M2PL],
          data,
          mask,
          PRIO_PM2,
          prio,
          dst,
          start2,
          special,
          prior & 0x20 ? PRIO_PM3 : 0,
        );

        ram[IO_HPOSM2_P2PF] |= col2 & 0x0f;
        if (col2 & PRIO_PM3) ram[IO_GRAFP2_P3PL] |= 0x04;
        ram[IO_GRAFP1_P2PL] |= (col2 >> 4) & ~0x04 & 0xff;
      }

      // Player 1
      if (pmDmaPlayers) {
        data =
          dmactl & 0x10
            ? ram[pmAddrHiRes(1280, 0x20)] & 0xff
            : ram[pmAddrLoRes(640, 0x20)] & 0xff;
        sram[IO_GRAFP1_P2PL] = data;
      } else {
        data = sram[IO_GRAFP1_P2PL] & 0xff;
      }

      hpos = sram[IO_HPOSP1_M1PF] & 0xff;
      if (data && hpos) {
        let start1 = y * PIXELS_PER_LINE + hpos * 2;
        if (prior & 0x01) mask = PRIO_PM0;
        else if (prior & 0x02) mask = PRIO_PM0;
        else if (prior & 0x04)
          mask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0;
        else if (prior & 0x08) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0;
        else mask = 0x00;

        let col1 = drawPlayer(
          sram[IO_COLPM1_TRIG3],
          sram[IO_SIZEP1_M1PL],
          data,
          mask,
          PRIO_PM1,
          prio,
          dst,
          start1,
          special,
          0,
        );

        ram[IO_HPOSM1_P1PF] |= col1 & 0x0f;
        if (col1 & PRIO_PM3) ram[IO_GRAFP2_P3PL] |= 0x02;
        if (col1 & PRIO_PM2) ram[IO_GRAFP1_P2PL] |= 0x02;
        ram[IO_GRAFP0_P1PL] |= (col1 >> 4) & ~0x02 & 0xff;
      }

      // Player 0
      if (pmDmaPlayers) {
        data =
          dmactl & 0x10
            ? ram[pmAddrHiRes(1024, 0x10)] & 0xff
            : ram[pmAddrLoRes(512, 0x10)] & 0xff;
        sram[IO_GRAFP0_P1PL] = data;
      } else {
        data = sram[IO_GRAFP0_P1PL] & 0xff;
      }

      hpos = sram[IO_HPOSP0_M0PF] & 0xff;
      if (data && hpos) {
        let start0 = y * PIXELS_PER_LINE + hpos * 2;
        if (prior & 0x01) mask = 0x00;
        else if (prior & 0x02) mask = 0x00;
        else if (prior & 0x04) mask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
        else if (prior & 0x08) mask = PRIO_PF0 | PRIO_PF1;
        else mask = 0x00;

        let col0 = drawPlayer(
          sram[IO_COLPM0_TRIG2],
          sram[IO_SIZEP0_M0PL],
          data,
          mask,
          PRIO_PM0,
          prio,
          dst,
          start0,
          special,
          prior & 0x20 ? PRIO_PM1 : 0,
        );

        ram[IO_HPOSM0_P0PF] |= col0 & 0x0f;
        if (col0 & PRIO_PM3) ram[IO_GRAFP2_P3PL] |= 0x01;
        if (col0 & PRIO_PM2) ram[IO_GRAFP1_P2PL] |= 0x01;
        if (col0 & PRIO_PM1) ram[IO_GRAFP0_P1PL] |= 0x01;
        ram[IO_SIZEM_P0PL] |= (col0 >> 4) & ~0x01 & 0xff;
      }

      // All missiles
      if (pmDmaMissiles) {
        data =
          dmactl & 0x10
            ? ram[pmAddrHiRes(768, 0x08)] & 0xff
            : ram[pmAddrLoRes(384, 0x08)] & 0xff;
        // With missile DMA on, keep GRAFM shadowed from PM memory.
        sram[IO_GRAFM_TRIG1] = data;
      } else {
        data = sram[IO_GRAFM_TRIG1] & 0xff;
      }

      // Missile 3
      hpos = sram[IO_HPOSM3_P3PF] & 0xff;
      if (data & 0xc0 && hpos) {
        let startM3 = y * PIXELS_PER_LINE + hpos * 2;
        if (prior & 0x01)
          mask =
            prior & 0x10
              ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3
              : PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
        else if (prior & 0x02)
          mask =
            prior & 0x10
              ? PRIO_PM0 | PRIO_PM1
              : PRIO_PM0 |
                PRIO_PM1 |
                PRIO_PF0 |
                PRIO_PF1 |
                PRIO_PF2 |
                PRIO_PF3 |
                PRIO_PM2;
        else if (prior & 0x04)
          mask =
            prior & 0x10
              ? 0x00
              : PRIO_PF0 |
                PRIO_PF1 |
                PRIO_PF2 |
                PRIO_PF3 |
                PRIO_PM0 |
                PRIO_PM1 |
                PRIO_PM2;
        else if (prior & 0x08)
          mask =
            prior & 0x10
              ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3
              : PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
        else mask = 0x00;

        let colM3 = drawMissile(
          3,
          prior & 0x10 ? sram[IO_COLPF3] : sram[IO_COLPM3],
          sram[IO_SIZEM_P0PL],
          data,
          mask,
          prio,
          dst,
          startM3,
          special,
        );

        ram[IO_HPOSP3_M3PF] |= colM3 & 0x0f;
        ram[IO_SIZEP3_M3PL] |= (colM3 >> 4) & 0xff;
      }

      // Missile 2
      hpos = sram[IO_HPOSM2_P2PF] & 0xff;
      if (data & 0x30 && hpos) {
        let startM2 = y * PIXELS_PER_LINE + hpos * 2;
        if (prior & 0x01)
          mask =
            prior & 0x10
              ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3
              : PRIO_PM0 | PRIO_PM1;
        else if (prior & 0x02)
          mask =
            prior & 0x10
              ? PRIO_PM0 | PRIO_PM1
              : PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
        else if (prior & 0x04)
          mask =
            prior & 0x10
              ? 0x00
              : PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1;
        else if (prior & 0x08)
          mask =
            prior & 0x10
              ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3
              : PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1;
        else mask = 0x00;

        let colM2 = drawMissile(
          2,
          prior & 0x10 ? sram[IO_COLPF3] : sram[IO_COLPM2_PAL],
          sram[IO_SIZEM_P0PL],
          data,
          mask,
          prio,
          dst,
          startM2,
          special,
        );

        ram[IO_HPOSP2_M2PF] |= colM2 & 0x0f;
        ram[IO_SIZEP2_M2PL] |= (colM2 >> 4) & 0xff;
      }

      // Missile 1
      hpos = sram[IO_HPOSM1_P1PF] & 0xff;
      if (data & 0x0c && hpos) {
        let startM1 = y * PIXELS_PER_LINE + hpos * 2;
        if (prior & 0x01)
          mask =
            prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : PRIO_PM0;
        else if (prior & 0x02)
          mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 : PRIO_PM0;
        else if (prior & 0x04)
          mask =
            prior & 0x10
              ? 0x00
              : PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0;
        else if (prior & 0x08)
          mask =
            prior & 0x10
              ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3
              : PRIO_PF0 | PRIO_PF1 | PRIO_PM0;
        else mask = 0x00;

        let colM1 = drawMissile(
          1,
          prior & 0x10 ? sram[IO_COLPF3] : sram[IO_COLPM1_TRIG3],
          sram[IO_SIZEM_P0PL],
          data,
          mask,
          prio,
          dst,
          startM1,
          special,
        );

        ram[IO_HPOSP1_M1PF] |= colM1 & 0x0f;
        ram[IO_SIZEP1_M1PL] |= (colM1 >> 4) & 0xff;
      }

      // Missile 0
      hpos = sram[IO_HPOSM0_P0PF] & 0xff;
      if (data & 0x03 && hpos) {
        let startM0 = y * PIXELS_PER_LINE + hpos * 2;
        if (prior & 0x01)
          mask =
            prior & 0x10 ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3 : 0x00;
        else if (prior & 0x02) mask = prior & 0x10 ? PRIO_PM0 | PRIO_PM1 : 0x00;
        else if (prior & 0x04)
          mask =
            prior & 0x10 ? 0x00 : PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
        else if (prior & 0x08)
          mask =
            prior & 0x10
              ? PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3
              : PRIO_PF0 | PRIO_PF1;
        else mask = 0x00;

        let colM0 = drawMissile(
          0,
          prior & 0x10 ? sram[IO_COLPF3] : sram[IO_COLPM0_TRIG2],
          sram[IO_SIZEM_P0PL],
          data,
          mask,
          prio,
          dst,
          startM0,
          special,
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
