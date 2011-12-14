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
*
********************************************************************/

#include <string.h>

#include "6502.h"
#include "AtariIo.h"
#include "Pia.h"

/********************************************************************
*
*
* Funktionen
*
*
********************************************************************/

/***********************************************/
/* $D300 - $D3FF (PIA) */
/***********************************************/

/* $D300 PORTA */
u8 *Pia_PORTA(_6502_Context_t *pContext, u8 *pValue)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	if(!(SRAM[IO_PACTL] & 0x04))
	{
		if(pValue)
			pIoData->cValuePortA = *pValue;

		return &pIoData->cValuePortA;
	}

	if(pValue)
    {
        SRAM[IO_PORTA] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" PORTA: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_PORTA];
}

/* $D301 PORTB */
u8 *Pia_PORTB(_6502_Context_t *pContext, u8 *pValue)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	if(!(SRAM[IO_PBCTL] & 0x04))
	{
		if(pValue)
			pIoData->cValuePortB = *pValue;

		return &pIoData->cValuePortB;
	}

	if(pValue)
	{
#ifdef VERBOSE_ROM_SWITCH
		printf("$%04X: PORTB ", pContext->tCpu.pc);
#endif	
		if((SRAM[IO_PORTB] & 0x01) != (*pValue & 0x01))
		{
			if(*pValue & 0x01) /* OS area */
			{
#ifdef VERBOSE_ROM_SWITCH
				printf("(OS ROM enabled) ");
#endif		
				memcpy(&SRAM[0xc000], &RAM[0xc000], 0x1000);
				_6502_SetRom(pContext, 0xc000, 0xcfff);
				memcpy(&RAM[0xc000], pIoData->pOsRom, 0x1000);

				memcpy(&SRAM[0xd800], &RAM[0xd800], 0x2800);
				_6502_SetRom(pContext, 0xd800, 0xffff);
				memcpy(&RAM[0xd800], pIoData->pFloatingPointRom, 0x2800);
			}
			else
			{
#ifdef VERBOSE_ROM_SWITCH
				printf("(OS ROM disabled) ");
#endif		
				memcpy(&RAM[0xc000], &SRAM[0xc000], 0x1000);
				_6502_SetRam(pContext, 0xc000, 0xcfff);

				memcpy(&RAM[0xd800], &SRAM[0xd800], 0x2800);
				_6502_SetRam(pContext, 0xd800, 0xffff);
			}
		}

		if((SRAM[IO_PORTB] & 0x02) != (*pValue & 0x02))
		{
			if(*pValue & 0x02) /* BASIC area */
			{
#ifdef VERBOSE_ROM_SWITCH
				printf("(BASIC ROM disabled) ");
#endif		
				memcpy(&RAM[0xa000], &SRAM[0xa000], 0x2000);
				_6502_SetRam(pContext, 0xa000, 0xbfff);
			}
			else
			{
#ifdef VERBOSE_ROM_SWITCH
				printf("(BASIC ROM enabled) ");
#endif		
				memcpy(&SRAM[0xa000], &RAM[0xa000], 0x2000);
				_6502_SetRom(pContext, 0xa000, 0xbfff);
				memcpy(&RAM[0xa000], pIoData->pBasicRom, 0x2000);
			}
		}

		if((SRAM[IO_PORTB] & 0x80) != (*pValue & 0x80))
		{
			if(*pValue & 0x80) /* Self-test area */
			{
#ifdef VERBOSE_ROM_SWITCH
				printf("(Self Test ROM disabled)");
#endif		
				memcpy(&RAM[0x5000], &SRAM[0x5000], 0x0800);
				_6502_SetRam(pContext, 0x5000, 0x57ff);
			}
			else
			{
#ifdef VERBOSE_ROM_SWITCH
				printf("(Self Test ROM enabled)");
#endif			
				memcpy(&SRAM[0x5000], &RAM[0x5000], 0x0800);
				_6502_SetRom(pContext, 0x5000, 0x57ff);
				memcpy(&RAM[0x5000], pIoData->pSelfTestRom, 0x0800);
			}
		}
		
#ifdef VERBOSE_ROM_SWITCH
		printf("\n");
#endif		
		RAM[IO_PORTB] = SRAM[IO_PORTB] = (*pValue & 0x83) | 0x7c;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" PORTB: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_PORTB];
}

/* $D302 PACTL */
u8 *Pia_PACTL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_PACTL] = *pValue;
		RAM[IO_PACTL] = (*pValue & 0x0d) | 0x30;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" PACTL: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_PACTL];
}

/* $D303 PBCTL */
u8 *Pia_PBCTL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_PBCTL] = *pValue;
		RAM[IO_PBCTL] = (*pValue & 0x0d) | 0x30;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" PBCTL: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_PBCTL];
}


