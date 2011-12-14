/********************************************************************
*
*
*
* ANTIC
*
* (c) 2004 Sascha Springer
*
*
*
********************************************************************/

#ifndef _ANTIC_H_
#define _ANTIC_H_

#include "6502.h"

/********************************************************************
*
*
* Definitionen
*
*
********************************************************************/

#define NMI_DLI 0x80
#define NMI_VBI 0x40
#define NMI_RESET 0x20

/* $D400 - $D5FF (ANTIC) */
#define IO_DMACTL 0xd400
#define IO_CHACTL 0xd401
#define IO_DLISTL 0xd402
#define IO_DLISTH 0xd403
#define IO_HSCROL 0xd404
#define IO_VSCROL 0xd405
#define IO_PMBASE 0xd407
#define IO_CHBASE 0xd409
#define IO_WSYNC 0xd40a
#define IO_VCOUNT 0xd40b
#define IO_PENH 0xd40c
#define IO_PENV 0xd40d
#define IO_NMIEN 0xd40e
#define IO_NMIRES_NMIST 0xd40f

u8 *Antic_DMACTL(_6502_Context_t *pContext, u8 *pValue);
u8 *Antic_CHACTL(_6502_Context_t *pContext, u8 *pValue);
u8 *Antic_DLISTL(_6502_Context_t *pContext, u8 *pValue);
u8 *Antic_DLISTH(_6502_Context_t *pContext, u8 *pValue);
u8 *Antic_HSCROL(_6502_Context_t *pContext, u8 *pValue);
u8 *Antic_VSCROL(_6502_Context_t *pContext, u8 *pValue);
u8 *Antic_PMBASE(_6502_Context_t *pContext, u8 *pValue);
u8 *Antic_CHBASE(_6502_Context_t *pContext, u8 *pValue);
u8 *Antic_WSYNC(_6502_Context_t *pContext, u8 *pValue);
u8 *Antic_VCOUNT(_6502_Context_t *pContext, u8 *pValue);
u8 *Antic_PENH(_6502_Context_t *pContext, u8 *pValue);
u8 *Antic_PENV(_6502_Context_t *pContext, u8 *pValue);
u8 *Antic_NMIEN(_6502_Context_t *pContext, u8 *pValue);
u8 *Antic_NMIRES_NMIST(_6502_Context_t *pContext, u8 *pValue);

#endif

