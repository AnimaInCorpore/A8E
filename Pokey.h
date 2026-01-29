/********************************************************************
*
*
*
* POKEY
*
* (c) 2004 Sascha Springer
*
*
*
********************************************************************/

#ifndef _POKEY_H_
#define _POKEY_H_

#include "6502.h"

/********************************************************************
*
*
* Definitionen
*
*
********************************************************************/

/* $D200 - $D2FF (POKEY) */
#define IO_AUDF1_POT0 0xd200
#define IO_AUDC1_POT1 0xd201
#define IO_AUDF2_POT2 0xd202
#define IO_AUDC2_POT3 0xd203
#define IO_AUDF3_POT4 0xd204
#define IO_AUDC3_POT5 0xd205
#define IO_AUDF4_POT6 0xd206
#define IO_AUDC4_POT7 0xd207
#define IO_AUDCTL_ALLPOT 0xd208
#define IO_STIMER_KBCODE 0xd209
#define IO_SKREST_RANDOM 0xd20a
#define IO_POTGO 0xd20b
#define IO_SEROUT_SERIN 0xd20d
#define IO_IRQEN_IRQST 0xd20e
#define IO_SKCTL_SKSTAT 0xd20f

u8 *Pokey_AUDF1_POT0(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_AUDC1_POT1(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_AUDF2_POT2(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_AUDC2_POT3(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_AUDF3_POT4(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_AUDC3_POT5(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_AUDF4_POT6(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_AUDC4_POT7(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_AUDCTL_ALLPOT(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_STIMER_KBCODE(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_SKREST_RANDOM(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_POTGO(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_SEROUT_SERIN(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_IRQEN_IRQST(_6502_Context_t *pContext, u8 *pValue);
u8 *Pokey_SKCTL_SKSTAT(_6502_Context_t *pContext, u8 *pValue);

void Pokey_Init(_6502_Context_t *pContext);
void Pokey_Close(_6502_Context_t *pContext);
void Pokey_Sync(_6502_Context_t *pContext, u64 llCycleCounter);

#endif
