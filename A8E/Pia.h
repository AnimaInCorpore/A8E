/********************************************************************
*
*
*
* PIA
*
* (c) 2004 Sascha Springer
*
*
*
********************************************************************/

#ifndef _PIA_H_
#define _PIA_H_

#include "6502.h"

/********************************************************************
*
*
* Definitionen
*
*
********************************************************************/

/* $D300 - $D3FF (PIA) */
#define IO_PORTA 0xd300
#define IO_PORTB 0xd301
#define IO_PACTL 0xd302
#define IO_PBCTL 0xd303

u8 *Pia_PORTA(_6502_Context_t *pContext, u8 *pValue);
u8 *Pia_PORTB(_6502_Context_t *pContext, u8 *pValue);
u8 *Pia_PACTL(_6502_Context_t *pContext, u8 *pValue);
u8 *Pia_PBCTL(_6502_Context_t *pContext, u8 *pValue);

#endif

