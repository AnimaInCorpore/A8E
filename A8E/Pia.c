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
		{
			pIoData->cValuePortA = *pValue;
		}

		return &pIoData->cValuePortA;
	}

	if(pValue)
	{
		SRAM[IO_PORTA] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" PORTA: %02X\n", *pValue);
#endif
	}

	/* RAM holds the joystick input. Output bits read back as the AND of
	   ORA and that input (AHRM 2.5). */
	pIoData->cReadValuePortA = RAM[IO_PORTA] & (SRAM[IO_PORTA] | (u8)~pIoData->cValuePortA);

	return &pIoData->cReadValuePortA;
}

/* Port B pins as the MMU sees them: output bits drive ORB and input bits are
   pulled up (AHRM 2.6, 2.7). Output bits also read back as ORB (AHRM 2.5). */
static u8 Pia_PortBPins(IoData_t *pIoData)
{
	return (u8)((pIoData->cOutputPortB & pIoData->cValuePortB) | (u8)~pIoData->cValuePortB);
}

/* Extended memory (AHRM 2.7): bit 4 enables the CPU window at $4000-$7FFF,
   and bit 5 the ANTIC window where ANTIC has separate access. */
static u8 Pia_CpuWindowOn(IoData_t *pIoData, u8 cPins)
{
	return (u8)(pIoData->cBankMask != 0 && (cPins & 0x10) == 0);
}

static u8 Pia_AnticWindowOn(IoData_t *pIoData, u8 cPins)
{
	u8 cEnableBit = pIoData->bSeparateAnticWindow ? 0x20 : 0x10;

	return (u8)(pIoData->cBankMask != 0 && (cPins & cEnableBit) == 0);
}

/* The bank selection bits, lowest PORTB bit first. */
static u32 Pia_Bank(IoData_t *pIoData, u8 cPins)
{
	u32 lBank = 0;
	u32 lBankBit = 1;
	u8 cBit;

	for(cBit = 0x01; cBit != 0; cBit <<= 1)
	{
		if(pIoData->cBankMask & cBit)
		{
			if(cPins & cBit)
			{
				lBank |= lBankBit;
			}
			lBankBit <<= 1;
		}
	}

	return lBank;
}

/* Main memory, or the selected bank, behind $4000-$7FFF. */
static u8 *Pia_WindowMemory(IoData_t *pIoData, u8 cPins, u8 bWindowOn)
{
	return bWindowOn
		? &pIoData->pExtendedMemory[Pia_Bank(pIoData, cPins) * 0x4000]
		: pIoData->pMainWindow;
}

/* Big expansions reuse the BASIC (bit 1) and self-test (bit 7) bits as bank
   bits; while the CPU window is on those ROMs are forced off (AHRM 2.7). */
static u8 Pia_BasicMapped(IoData_t *pIoData, u8 cPins)
{
	if((pIoData->cBankMask & 0x02) && Pia_CpuWindowOn(pIoData, cPins))
	{
		return 0;
	}

	return (u8)((cPins & 0x02) == 0);
}

/* The self-test ROM is mapped only while the OS ROM is enabled (AHRM 2.6). */
static u8 Pia_SelfTestMapped(IoData_t *pIoData, u8 cPins)
{
	if((pIoData->cBankMask & 0x80) && Pia_CpuWindowOn(pIoData, cPins))
	{
		return 0;
	}

	return (u8)((cPins & 0x81) == 0x01);
}

/* Swaps the memory behind $4000-$7FFF when the CPU window or its bank
   changes. The self-test ROM has priority over the window (AHRM 2.7), so
   while it is mapped the RAM under it stays in the shadow memory. */
static void Pia_SwitchCpuWindow(_6502_Context_t *pContext, u8 cOldPins, u8 cPins)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u8 bOldWindowOn = Pia_CpuWindowOn(pIoData, cOldPins);
	u8 bWindowOn = Pia_CpuWindowOn(pIoData, cPins);
	u8 *pOld;
	u8 *pNew;

	if(bOldWindowOn == bWindowOn && (!bWindowOn || Pia_Bank(pIoData, cOldPins) == Pia_Bank(pIoData, cPins)))
	{
		return;
	}

	pOld = Pia_WindowMemory(pIoData, cOldPins, bOldWindowOn);
	pNew = Pia_WindowMemory(pIoData, cPins, bWindowOn);
	memcpy(pOld, &RAM[0x4000], 0x4000);
	memcpy(&RAM[0x4000], pNew, 0x4000);

	if(Pia_SelfTestMapped(pIoData, cOldPins))
	{
		memcpy(&pOld[0x1000], &SRAM[0x5000], 0x0800);
		memcpy(&SRAM[0x5000], &pNew[0x1000], 0x0800);
		memcpy(&RAM[0x5000], pIoData->pSelfTestRom, 0x0800);
	}
}

/* Maps the OS, BASIC and self-test ROMs for the port B pins (AHRM 2.6),
   keeping the RAM under each ROM in the shadow memory while the ROM is
   visible. SRAM[IO_PORTB] holds the previous pins. */
static void Pia_ApplyPortB(_6502_Context_t *pContext, u8 cValue)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u8 cOldPins = SRAM[IO_PORTB];
	u8 bAnticWindowOn = Pia_AnticWindowOn(pIoData, cValue);

	if(pIoData->cBankMask != 0)
	{
		Pia_SwitchCpuWindow(pContext, cOldPins, cValue);
	}

	if((SRAM[IO_PORTB] & 0x01) != (cValue & 0x01))
	{
		if(cValue & 0x01) /* OS area */
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

	if(Pia_BasicMapped(pIoData, cOldPins) != Pia_BasicMapped(pIoData, cValue))
	{
		if(!Pia_BasicMapped(pIoData, cValue)) /* BASIC area */
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

	if(Pia_SelfTestMapped(pIoData, cOldPins) != Pia_SelfTestMapped(pIoData, cValue))
	{
		if(!Pia_SelfTestMapped(pIoData, cValue)) /* Self-test area */
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
	RAM[IO_PORTB] = SRAM[IO_PORTB] = cValue;

	/* ANTIC reads the CPU view unless only one of the windows is on. */
	pIoData->pAnticWindow = bAnticWindowOn == Pia_CpuWindowOn(pIoData, cValue)
		? NULL
		: Pia_WindowMemory(pIoData, cValue, bAnticWindowOn);
}

/* $D301 PORTB */
u8 *Pia_PORTB(_6502_Context_t *pContext, u8 *pValue)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u8 bDirection = (u8)((SRAM[IO_PBCTL] & 0x04) == 0);

	if(pValue)
	{
		if(bDirection)
		{
			pIoData->cValuePortB = *pValue;
		}
		else
		{
			pIoData->cOutputPortB = *pValue;
		}
#ifdef VERBOSE_ROM_SWITCH
		printf("$%04X: PORTB ", pContext->tCpu.pc);
#endif
		Pia_ApplyPortB(pContext, Pia_PortBPins(pIoData));
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" %s: %02X\n", bDirection ? "DDRB" : "PORTB", *pValue);
#endif
	}

	return bDirection ? &pIoData->cValuePortB : &RAM[IO_PORTB];
}

/* $D302 PACTL */
u8 *Pia_PACTL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_PACTL] = *pValue;
		RAM[IO_PACTL] = *pValue & 0x3f; /* bits 7-6 are the (unmodeled) IRQ flags */
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
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
		RAM[IO_PBCTL] = *pValue & 0x3f; /* bits 7-6 are the (unmodeled) IRQ flags */
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" PBCTL: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_PBCTL];
}

/* A PIA reset clears every register, so PORTA/PORTB select their direction
   registers and all port bits become inputs (AHRM 2.5). Port B then reads the
   pull-ups: OS ROM in, BASIC and self-test ROM out (AHRM 2.6). */
void Pia_Reset(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	SRAM[IO_PACTL] = RAM[IO_PACTL] = 0x00;
	SRAM[IO_PBCTL] = RAM[IO_PBCTL] = 0x00;
	SRAM[IO_PORTA] = 0x00;
	pIoData->cValuePortA = 0x00;
	pIoData->cValuePortB = 0x00;
	pIoData->cOutputPortB = 0x00;
	Pia_ApplyPortB(pContext, Pia_PortBPins(pIoData));
}
