/********************************************************************
*
*
*
* GTIA
*
* (c) 2004 Sascha Springer
*
*
*
********************************************************************/

#ifndef _GTIA_H_
#define _GTIA_H_

#include "6502.h"

/********************************************************************
*
*
* Definitionen
*
*
********************************************************************/

/* $D000 - $D0ff (GTIA) */
#define IO_HPOSP0_M0PF 0xd000
#define IO_HPOSP1_M1PF 0xd001
#define IO_HPOSP2_M2PF 0xd002
#define IO_HPOSP3_M3PF 0xd003
#define IO_HPOSM0_P0PF 0xd004
#define IO_HPOSM1_P1PF 0xd005
#define IO_HPOSM2_P2PF 0xd006
#define IO_HPOSM3_P3PF 0xd007
#define IO_SIZEP0_M0PL 0xd008
#define IO_SIZEP1_M1PL 0xd009
#define IO_SIZEP2_M2PL 0xd00a
#define IO_SIZEP3_M3PL 0xd00b
#define IO_SIZEM_P0PL 0xd00c
#define IO_GRAFP0_P1PL 0xd00d
#define IO_GRAFP1_P2PL 0xd00e
#define IO_GRAFP2_P3PL 0xd00f
#define IO_GRAFP3_TRIG0 0xd010
#define IO_GRAFM_TRIG1 0xd011
#define IO_COLPM0_TRIG2 0xd012
#define IO_COLPM1_TRIG3 0xd013
#define IO_COLPM2_PAL 0xd014
#define IO_COLPM3 0xd015
#define IO_COLPF0 0xd016
#define IO_COLPF1 0xd017
#define IO_COLPF2 0xd018
#define IO_COLPF3 0xd019
#define IO_COLBK 0xd01a
#define IO_PRIOR 0xd01b
#define IO_VDELAY 0xd01c
#define IO_GRACTL 0xd01d
#define IO_HITCLR 0xd01e
#define IO_CONSOL 0xd01f

u8 *Gtia_HPOSP0_M0PF(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_HPOSP1_M1PF(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_HPOSP2_M2PF(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_HPOSP3_M3PF(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_HPOSM0_P0PF(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_HPOSM1_P1PF(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_HPOSM2_P2PF(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_HPOSM3_P3PF(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_SIZEP0_M0PL(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_SIZEP1_M1PL(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_SIZEP2_M2PL(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_SIZEP3_M3PL(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_SIZEM_P0PL(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_GRAFP0_P1PL(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_GRAFP1_P2PL(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_GRAFP2_P3PL(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_GRAFP3_TRIG0(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_GRAFM_TRIG1(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_COLPM0_TRIG2(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_COLPM1_TRIG3(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_COLPM2_PAL(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_COLPM3(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_COLPF0(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_COLPF1(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_COLPF2(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_COLPF3(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_COLBK(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_PRIOR(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_VDELAY(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_GRACTL(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_HITCLR(_6502_Context_t *pContext, u8 *pValue);
u8 *Gtia_CONSOL(_6502_Context_t *pContext, u8 *pValue);

#endif

