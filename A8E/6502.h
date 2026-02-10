/********************************************************************
*
*
*
* 6502 Prozessor-Emulation
*
* (c) 2004 Sascha Springer
*
*
*
********************************************************************/

#ifndef _6502_H_
#define _6502_H_

/********************************************************************
*
*
* Definitionen
*
*
********************************************************************/

#define _6502_MEMORY_SIZE 0x10000

#define CPU pContext->tCpu
#define PS pContext->tCpu.ps
#define RAM pContext->pMemory
#define SRAM pContext->pShadowMemory
#define IO pContext->pIoMemory

#define _6502_STALL(cycles) \
	pContext->llStallCycleCounter = \
		MAX(pContext->llStallCycleCounter, \
		pContext->llCycleCounter + (cycles));

typedef char s8;
typedef unsigned char u8;
typedef short s16;
typedef unsigned short u16;
typedef long s32;
typedef unsigned long u32;
typedef long long s64;
typedef unsigned long long u64;

typedef struct
{
	u8 n, v, b, d, i, z, c;
} _6502_Flags_t;

typedef struct
{
	u8 a;
	u8 x;
	u8 y;
	u8 sp;
	_6502_Flags_t ps;
	u16 pc;
} _6502_Register_t;

typedef struct _6502_Context
{
	_6502_Register_t tCpu;
	u8 *pMemory;

	u8 *pShadowMemory;

	u8 *(**pAccessFunctionList)(struct _6502_Context *, u8 *);

	u8 *(*AccessFunction)(struct _6502_Context *, u8 *);
	u16 sAccessAddress;
	u8 cPageCrossed;

	u64 llCycleCounter;
	u64 llStallCycleCounter;

	u64 llIoCycleTimedEventCycle;
	void (*IoCycleTimedEventFunction)(struct _6502_Context *);

	u8 cIrqPendingFlag;

	void *pIoData;
} _6502_Context_t;

void _6502_Init();
_6502_Context_t *_6502_Open();
void _6502_Close(_6502_Context_t *pContext);

void _6502_SetRom(_6502_Context_t *pContext, u16 sStart, u16 sEnd);
void _6502_SetRam(_6502_Context_t *pContext, u16 sStart, u16 sEnd);
void _6502_SetIo(_6502_Context_t *pContext, u16 sAddress, u8 *(*IoAccessFunction)(_6502_Context_t *, u8 *));

void _6502_Status(_6502_Context_t *pContext);
u16 _6502_Disassemble(_6502_Context_t *pContext, u16 sAddress);
u16 _6502_DisassembleLive(_6502_Context_t *pContext, u16 sAddress);

void _6502_Nmi(_6502_Context_t *pContext);
void _6502_Reset(_6502_Context_t *pContext);
void _6502_Irq(_6502_Context_t *pContext);
u64 _6502_Run(_6502_Context_t *pContext, u64 llCycles);

#endif
