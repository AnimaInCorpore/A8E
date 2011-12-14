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
*
********************************************************************/

#include <SDL/SDL.h>

#include "6502.h"
#include "AtariIo.h"
#include "Antic.h"

/********************************************************************
*
*
* Definitionen
*
*
********************************************************************/

#define FIRST_VISIBLE_LINE 8
#define LAST_VISIBLE_LINE 247

#define PRIO_BKG 0x00
#define PRIO_PF0 0x01
#define PRIO_PF1 0x02
#define PRIO_PF2 0x04
#define PRIO_PF3 0x08
#define PRIO_PM0 0x10
#define PRIO_PM1 0x20
#define PRIO_PM2 0x40
#define PRIO_PM3 0x80

#define FIXED_ADD(address, bits, value) ((address) = ((address) & ~(bits)) | (((address) + (value)) & (bits)))

#define MIN(a,b) ((a) < (b) ? (a) : (b))
#define MAX(a,b) ((a) > (b) ? (a) : (b))

typedef struct
{
	u32 lNumberOfLines;
	u32 lPixelsPerByte;
	void (*DrawFunction)(_6502_Context_t *);
} AnticModeInfo_t;

/********************************************************************
*
*
* Funktionen
*
*
********************************************************************/

/***********************************************/
/* $D400 - $D5FF (ANTIC) */
/***********************************************/

/* $D400 DMACTL */
u8 *Antic_DMACTL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_DMACTL] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" DMACTL: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_DMACTL];
}

/* $D401 CHACTL */
u8 *Antic_CHACTL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_CHACTL] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" CHACTL: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_CHACTL];
}

/* $D402 DLISTL */
u8 *Antic_DLISTL(_6502_Context_t *pContext, u8 *pValue)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	if(pValue)
	{
		pIoData->sDisplayListAddress = (pIoData->sDisplayListAddress & 0xff00) | *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" DLISTL: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_DLISTL];
}

/* $D403 DLISTH */
u8 *Antic_DLISTH(_6502_Context_t *pContext, u8 *pValue)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	if(pValue)
	{
		pIoData->sDisplayListAddress = (pIoData->sDisplayListAddress & 0x00ff) | (*pValue << 8);
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" DLISTH: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_DLISTH];
}

/* $D404 HSCROLL */
u8 *Antic_HSCROL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_HSCROL] = (*pValue & 0x0f);
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" HSCROL: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_HSCROL];
}

/* $D405 VSCROL */
u8 *Antic_VSCROL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_VSCROL] = (*pValue & 0x0f);
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" VSCROL: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_VSCROL];
}

/* $D407 PMBASE */
u8 *Antic_PMBASE(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_PMBASE] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" PMBASE: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_PMBASE];
}

/* $D409 CHBASE */
u8 *Antic_CHBASE(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_CHBASE] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" CHBASE: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_CHBASE];
}

/* $D40A WSYNC */
u8 *Antic_WSYNC(_6502_Context_t *pContext, u8 *pValue)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	
	if(pValue)
	{
		pContext->llStallCycleCounter = 
			MAX(pIoData->llDisplayListFetchCycle, pContext->llStallCycleCounter);
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" WSYNC: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_WSYNC];
}

/* $D40B VCOUNT */
u8 *Antic_VCOUNT(_6502_Context_t *pContext, u8 *pValue)
{
	return &RAM[IO_VCOUNT];
}

/* $D40C PENH */
u8 *Antic_PENH(_6502_Context_t *pContext, u8 *pValue)
{
	return &RAM[IO_PENH];
}

/* $D40D PENV */
u8 *Antic_PENV(_6502_Context_t *pContext, u8 *pValue)
{
	return &RAM[IO_PENV];
}

/* $D40E NMIEN */
u8 *Antic_NMIEN(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
#ifdef VERBOSE_NMI
		printf("$%04X: NMIEN ", pContext->tCpu.pc);

        if((*pValue & 0x80) != (SRAM[IO_NMIEN] & 0x80))
        {
    		if(*pValue & 0x80)
                printf("(DLI enabled) ");
            else
                printf("(DLI disabled) ");
        }

        if((*pValue & 0x40) != (SRAM[IO_NMIEN] & 0x40))
        {
    		if(*pValue & 0x40)
                printf("(VBI enabled) ");
            else
                printf("(VBI disabled) ");
        }

        if((*pValue & 0x20) != (SRAM[IO_NMIEN] & 0x20))
        {
    		if(*pValue & 0x20)
                printf("(RESET enabled)");
            else
                printf("(RESET disabled)");
        }

        printf("\n");
#endif
		SRAM[IO_NMIEN] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" NMIEN: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_NMIEN];
}

/* $D40F NMIRES/NMIST */
u8 *Antic_NMIRES_NMIST(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		RAM[IO_NMIRES_NMIST] = 0x00;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" NMIRES: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_NMIRES_NMIST];
}


