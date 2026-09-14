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

	return &RAM[IO_PORTA];
}

/* $D301 PORTB */
u8 *Pia_PORTB(_6502_Context_t *pContext, u8 *pValue)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	if(!(SRAM[IO_PBCTL] & 0x04))
	{
		if(pValue)
		{
			pIoData->cValuePortB = *pValue;
		}

		return &pIoData->cValuePortB;
	}

	if(pValue)
	{
		u8 cOldBank = pIoData->cExtendedBank;
		u8 bOldCpu = pIoData->bCpuExtendedWindow;
		u8 cNewPortB;
		u8 bU1mbSharedWindow = 0;
		u8 bNewCpu = 0;
		u8 bOldBasic;
		u8 bOldSelfTest;
		u8 bNewBasic;
		u8 bNewSelfTest;
		AtariMemoryExpansion_t eProfile = pIoData->eMemoryExpansion;

		/* Before the first expansion write, the persistent ROM state is the
		 * state represented by the current PORTB value. Subsequent writes use
		 * the state retained by the expansion model, as in jsA8E. */
		bOldBasic = pIoData->bMemoryExpansionInitialized
			? pIoData->bBasicRomEnabled
			: (u8)((SRAM[IO_PORTB] & 0x02) == 0);
		bOldSelfTest = pIoData->bMemoryExpansionInitialized
			? pIoData->bSelfTestRomEnabled
			: (u8)((SRAM[IO_PORTB] & 0x80) == 0);

		if(eProfile == ATARI_MEMORY_ULTIMATE1MB)
		{
			switch(pIoData->cU1mbUctl & 0x03)
			{
			case 0: eProfile = ATARI_MEMORY_NONE; break;
			case 1: eProfile = ATARI_MEMORY_RAMBO_320K; break;
			case 2: eProfile = ATARI_MEMORY_COMPY_576K; break;
			default: eProfile = ATARI_MEMORY_RAMBO_1088K; bU1mbSharedWindow = 1; break;
			}
		}
		if(eProfile != ATARI_MEMORY_NONE)
		{
			u8 cBankMask = 0x0c;
			u8 cBankBits = 2;
			u8 bSharedWindow = 0;
			switch(eProfile)
			{
			case ATARI_MEMORY_RAMBO_192K: cBankMask = 0x4c; cBankBits = 3; bSharedWindow = 1; break;
			case ATARI_MEMORY_RAMBO_320K: cBankMask = 0x6c; cBankBits = 4; bSharedWindow = 1; break;
			case ATARI_MEMORY_COMPY_320K: cBankMask = 0xcc; cBankBits = 4; break;
			case ATARI_MEMORY_RAMBO_576K: cBankMask = 0x6e; cBankBits = 5; bSharedWindow = 1; break;
			case ATARI_MEMORY_COMPY_576K: cBankMask = 0xce; cBankBits = 5; break;
			case ATARI_MEMORY_RAMBO_1088K: cBankMask = 0xee; cBankBits = 6; bSharedWindow = 1; break;
			default: break;
			}
			cNewPortB = *pValue;
			u8 cNewBank = 0;
			u8 cBankIndex;
			u8 cBankPosition = 0;
			for(cBankIndex = 0; cBankIndex < 8; cBankIndex++)
				if(cBankMask & (1u << cBankIndex))
					cNewBank |= (u8)(((cNewPortB >> cBankIndex) & 1u) << cBankPosition++);
			if(cBankBits < 6) cNewBank &= (u8)((1u << cBankBits) - 1u);
			bNewCpu = (u8)((cNewPortB & 0x10) == 0);
			if(!bOldCpu && bNewCpu)
				memcpy(pIoData->pMainWindowShadow, &RAM[0x4000], 0x4000);
			if(bOldCpu)
				memcpy(&pIoData->pExtendedMemory[cOldBank * 0x4000u], &RAM[0x4000], 0x4000);
			pIoData->cExtendedBank = cNewBank;
			pIoData->bCpuExtendedWindow = bNewCpu;
			pIoData->bAnticExtendedWindow = bU1mbSharedWindow || bSharedWindow
				? bNewCpu
				: (eProfile == ATARI_MEMORY_130XE_128K ||
				   eProfile == ATARI_MEMORY_COMPY_320K ||
				   eProfile == ATARI_MEMORY_COMPY_576K)
					? (u8)((cNewPortB & 0x20) == 0) : 0;
			if(bOldCpu && !bNewCpu)
				memcpy(&RAM[0x4000], pIoData->pMainWindowShadow, 0x4000);
			else if(bNewCpu)
				memcpy(&RAM[0x4000], &pIoData->pExtendedMemory[pIoData->cExtendedBank * 0x4000u], 0x4000);
		}
		else
			cNewPortB = (u8)((*pValue & 0x83) | 0x7c);

		/* jsA8E keeps BASIC/Self-Test state separately when PORTB bits are
		 * reused for bank selection. Physical expansions that force a ROM off
		 * do so only while the CPU window is enabled; U1MB has no such force
		 * because its shadow PIA allows the ROMs to remain visible. */
		bNewBasic = (u8)((*pValue & 0x02) == 0);
		bNewSelfTest = (u8)((*pValue & 0x80) == 0);
		if(pIoData->eMemoryExpansion == ATARI_MEMORY_ULTIMATE1MB)
		{
			if(bNewCpu && (pIoData->cU1mbUctl & 0x03) != 0)
			{
				bNewBasic = bOldBasic;
				bNewSelfTest = bOldSelfTest;
			}
		}
		else
		{
			if(bNewCpu && (pIoData->eMemoryExpansion == ATARI_MEMORY_RAMBO_576K ||
						   pIoData->eMemoryExpansion == ATARI_MEMORY_COMPY_576K ||
						   pIoData->eMemoryExpansion == ATARI_MEMORY_RAMBO_1088K))
				bNewBasic = 0;
			if(bNewCpu && (pIoData->eMemoryExpansion == ATARI_MEMORY_COMPY_320K ||
						   pIoData->eMemoryExpansion == ATARI_MEMORY_COMPY_576K ||
						   pIoData->eMemoryExpansion == ATARI_MEMORY_RAMBO_1088K))
				bNewSelfTest = 0;
		}
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

		if(bOldBasic != bNewBasic)
		{
			if(!bNewBasic) /* BASIC disabled */
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

		if(bOldSelfTest != bNewSelfTest)
		{
			if(!bNewSelfTest) /* Self-test disabled */
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
		pIoData->bBasicRomEnabled = bNewBasic;
		pIoData->bSelfTestRomEnabled = bNewSelfTest;
		pIoData->bMemoryExpansionInitialized = 1;

#ifdef VERBOSE_ROM_SWITCH
		printf("\n");
#endif
		RAM[IO_PORTB] = SRAM[IO_PORTB] = cNewPortB;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
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
		RAM[IO_PBCTL] = (*pValue & 0x0d) | 0x30;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" PBCTL: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_PBCTL];
}

/* U1MB configuration registers. Configuration writes are accepted only
 * while unlocked; UCTL bit 7 permanently locks the register block until the
 * next cold reset. */
u8 *Pia_U1mbRegister(_6502_Context_t *pContext, u8 *pValue)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u16 sAddress = pContext->sAccessAddress;
	if(pIoData->eMemoryExpansion != ATARI_MEMORY_ULTIMATE1MB)
		return &RAM[sAddress];
	if(!pValue)
	{
		/* jsA8E models UCTL/UAUX/UPBI and PBI-button as write-only
		 * registers. COLDF is the only readable register in this surface. */
		if(sAddress == IO_U1MB_COLDF)
			return &pIoData->cU1mbColdf;
		RAM[sAddress] = 0xff;
		return &RAM[sAddress];
	}

	if(!pIoData->bU1mbConfigLocked)
	{
		if(sAddress == IO_U1MB_UCTL)
		{
			/* Reconfigure from a clean motherboard-window view, matching
			 * memory.js when UCTL changes the active U1MB memory mode. */
			if(pIoData->bMemoryExpansionInitialized)
			{
				if(pIoData->bCpuExtendedWindow)
				{
					memcpy(&pIoData->pExtendedMemory[pIoData->cExtendedBank * 0x4000u],
						   &RAM[0x4000], 0x4000);
					memcpy(&RAM[0x4000], pIoData->pMainWindowShadow, 0x4000);
				}
				pIoData->bCpuExtendedWindow = 0;
				pIoData->bAnticExtendedWindow = 0;
				pIoData->cExtendedBank = 0;
				pIoData->bMemoryExpansionInitialized = 0;
			}
			pIoData->cU1mbUctl = *pValue;
			if(*pValue & 0x80)
				pIoData->bU1mbConfigLocked = 1;
			{
				u8 cPortB = SRAM[IO_PORTB];
				Pia_PORTB(pContext, &cPortB);
			}
		}
		else if(sAddress == IO_U1MB_UAUX)
			pIoData->cU1mbUaux = *pValue;
		else if(sAddress == IO_U1MB_COLDF)
			pIoData->cU1mbColdf = (u8)(*pValue & 0x80);
	}
	return &RAM[sAddress];
}
