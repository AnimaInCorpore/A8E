#include <stdio.h>
#include <string.h>

#include <SDL2/SDL.h>

#include "6502.h"
#include "Antic.h"
#include "AtariIo.h"
#include "Pia.h"

SDL_Window *g_pSdlWindow = NULL;

#define REQUIRE(condition, format, ...)                                  \
	do                                                                   \
	{                                                                    \
		if(!(condition))                                                 \
		{                                                                \
			fprintf(stderr, "%s: " format "\n", __func__, ##__VA_ARGS__); \
			return 0;                                                    \
		}                                                                \
	} while(0)

#define PROGRAM_ADDRESS 0x2000

typedef struct
{
	AtariMemoryExpansion_t eMemoryExpansion;
	const char *pName;
	u8 cBankMask;
	u8 bSeparateAnticWindow;
} MemoryProfile_t;

/* AHRM 2.7, Table 1. */
static const MemoryProfile_t m_aProfiles[] =
	{
		{ATARI_MEMORY_130XE, "130XE", 0x0c, 1},
		{ATARI_MEMORY_RAMBO_192K, "192K RAMBO", 0x4c, 0},
		{ATARI_MEMORY_RAMBO_320K, "320K RAMBO", 0x6c, 0},
		{ATARI_MEMORY_COMPY_320K, "320K COMPY", 0xcc, 1},
		{ATARI_MEMORY_RAMBO_576K, "576K RAMBO", 0x6e, 0},
		{ATARI_MEMORY_COMPY_576K, "576K COMPY", 0xce, 1},
		{ATARI_MEMORY_RAMBO_1088K, "1088K RAMBO", 0xee, 0},
};

static _6502_Context_t *OpenMachine(AtariMemoryExpansion_t eMemoryExpansion)
{
	_6502_Context_t *pContext = _6502_Open();

	if(pContext != NULL)
	{
		AtariIoOpenMachine(pContext, 0, NULL, ATARI_VIDEO_PAL, eMemoryExpansion);
	}

	return pContext;
}

static void CloseMachine(_6502_Context_t *pContext)
{
	AtariIoClose(pContext);
	_6502_Close(pContext);
}

/* Run one absolute-mode instruction through the CPU's normal dispatch. */
static void ExecuteAbsolute(_6502_Context_t *pContext, u8 cOpcode, u16 sAddress)
{
	pContext->pMemory[PROGRAM_ADDRESS] = cOpcode;
	pContext->pMemory[PROGRAM_ADDRESS + 1] = (u8)(sAddress & 0xff);
	pContext->pMemory[PROGRAM_ADDRESS + 2] = (u8)(sAddress >> 8);
	pContext->tCpu.pc = PROGRAM_ADDRESS;
	pContext->tCpu.ps.i = 1;
	pContext->llStallCycleCounter = 0;
	_6502_Execute(pContext);
}

static void CpuWrite(_6502_Context_t *pContext, u16 sAddress, u8 cValue)
{
	pContext->tCpu.a = cValue;
	ExecuteAbsolute(pContext, 0x8d, sAddress); /* STA abs */
}

static u8 CpuRead(_6502_Context_t *pContext, u16 sAddress)
{
	ExecuteAbsolute(pContext, 0xad, sAddress); /* LDA abs */
	return pContext->tCpu.a;
}

/* Port B as the OS sets it up: ORB=$FF before DDRB=$FF, so the pins never
   leave $FF, then the output register stays selected. */
static void EnablePortBOutputs(_6502_Context_t *pContext)
{
	CpuWrite(pContext, IO_PBCTL, 0x3c);
	CpuWrite(pContext, IO_PORTB, 0xff);
	CpuWrite(pContext, IO_PBCTL, 0x38);
	CpuWrite(pContext, IO_PORTB, 0xff);
	CpuWrite(pContext, IO_PBCTL, 0x3c);
}

/* PORTB value selecting a bank, with the OS ROM on and BASIC off. The
   window enable bits (4, and 5 for ANTIC) are cleared unless they are bank
   bits, so both windows are on. */
static u8 PortBForBank(const MemoryProfile_t *pProfile, u32 lBank)
{
	u8 cPortB = (u8)(0x03 & ~pProfile->cBankMask);
	u8 cBit;

	cPortB |= (u8)(0x80 & ~pProfile->cBankMask); /* self-test off */
	for(cBit = 0x01; cBit != 0; cBit <<= 1)
	{
		if(pProfile->cBankMask & cBit)
		{
			if(lBank & 1)
			{
				cPortB |= cBit;
			}
			lBank >>= 1;
		}
	}

	return cPortB;
}

static u32 BankCount(const MemoryProfile_t *pProfile)
{
	u32 lBanks = 1;
	u8 cBit;

	for(cBit = 0x01; cBit != 0; cBit <<= 1)
	{
		if(pProfile->cBankMask & cBit)
		{
			lBanks <<= 1;
		}
	}

	return lBanks;
}

static u8 AnticRead(_6502_Context_t *pContext, u16 sAddress)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	pIoData->llDisplayListFetchCycle = 0;
	pIoData->llCycle = 0;
	pContext->pShadowMemory[IO_DMACTL] = 0x23;
	return AtariIoTimingProbeFetchUnbufferedDisplayByte(pContext, sAddress, 0);
}

static int CheckBanks(const MemoryProfile_t *pProfile)
{
	_6502_Context_t *pContext = OpenMachine(pProfile->eMemoryExpansion);
	u32 lBanks = BankCount(pProfile);
	u32 lBank;

	REQUIRE(pContext != NULL, "%s: machine open failed", pProfile->pName);
	EnablePortBOutputs(pContext);
	CpuWrite(pContext, 0x4000, 0xa5);
	CpuWrite(pContext, 0x7fff, 0x5a);

	/* Every bank keeps its own contents (AHRM 2.7). */
	for(lBank = 0; lBank < lBanks; lBank++)
	{
		CpuWrite(pContext, IO_PORTB, PortBForBank(pProfile, lBank));
		CpuWrite(pContext, 0x4000, (u8)lBank);
		CpuWrite(pContext, 0x7fff, (u8)~lBank);
	}
	for(lBank = lBanks; lBank-- > 0;)
	{
		CpuWrite(pContext, IO_PORTB, PortBForBank(pProfile, lBank));
		REQUIRE(CpuRead(pContext, 0x4000) == (u8)lBank,
				"%s: bank %u read $%02X at $4000", pProfile->pName, lBank, pContext->tCpu.a);
		REQUIRE(CpuRead(pContext, 0x7fff) == (u8)~lBank,
				"%s: bank %u read $%02X at $7FFF", pProfile->pName, lBank, pContext->tCpu.a);
		REQUIRE(AnticRead(pContext, 0x4000) == (u8)lBank,
				"%s: ANTIC did not see bank %u", pProfile->pName, lBank);
	}

	/* Bank 1 is selected; closing the CPU window brings main memory back.
	   ANTIC keeps the bank only where bit 5 enables its own window. */
	CpuWrite(pContext, IO_PORTB, (u8)(PortBForBank(pProfile, 1) | 0x10));
	REQUIRE(CpuRead(pContext, 0x4000) == 0xa5, "%s: main memory $4000 read $%02X", pProfile->pName, pContext->tCpu.a);
	REQUIRE(CpuRead(pContext, 0x7fff) == 0x5a, "%s: main memory $7FFF read $%02X", pProfile->pName, pContext->tCpu.a);
	REQUIRE(AnticRead(pContext, 0x4000) == (pProfile->bSeparateAnticWindow ? 0x01 : 0xa5),
			"%s: ANTIC read $%02X with only its own window on", pProfile->pName, AnticRead(pContext, 0x4000));

	CloseMachine(pContext);
	return 1;
}

static int TestBanksOfEveryProfile(void)
{
	u32 i;

	for(i = 0; i < sizeof(m_aProfiles) / sizeof(m_aProfiles[0]); i++)
	{
		if(!CheckBanks(&m_aProfiles[i]))
		{
			return 0;
		}
	}

	return 1;
}

/* 130XE: bit 4 opens the CPU window and bit 5 the ANTIC window (AHRM 2.7). */
static int TestSeparateAnticWindow(void)
{
	_6502_Context_t *pContext = OpenMachine(ATARI_MEMORY_130XE);

	REQUIRE(pContext != NULL, "machine open failed");
	EnablePortBOutputs(pContext);
	CpuWrite(pContext, 0x6000, 0x11); /* main memory */
	CpuWrite(pContext, IO_PORTB, 0xe3); /* bank 0, CPU window only */
	CpuWrite(pContext, 0x6000, 0x22);
	REQUIRE(AnticRead(pContext, 0x6000) == 0x11, "ANTIC read $%02X instead of main memory", AnticRead(pContext, 0x6000));
	CpuWrite(pContext, IO_PORTB, 0xd3); /* bank 0, ANTIC window only */
	REQUIRE(CpuRead(pContext, 0x6000) == 0x11, "CPU read $%02X instead of main memory", pContext->tCpu.a);
	REQUIRE(AnticRead(pContext, 0x6000) == 0x22, "ANTIC read $%02X instead of bank 0", AnticRead(pContext, 0x6000));

	CloseMachine(pContext);
	return 1;
}

/* 1088K reuses bits 1 and 7: BASIC and self-test are off while the CPU
   window is on, and follow the bits again once it is off (AHRM 2.7). */
static int TestReusedBitsForceRomsOffInTheWindow(void)
{
	_6502_Context_t *pContext = OpenMachine(ATARI_MEMORY_RAMBO_1088K);
	IoData_t *pIoData;

	REQUIRE(pContext != NULL, "machine open failed");
	pIoData = (IoData_t *)pContext->pIoData;
	EnablePortBOutputs(pContext);

	CpuWrite(pContext, IO_PORTB, 0x71); /* bits 1 and 7 low: BASIC and self-test on */
	REQUIRE(pContext->pMemory[0xa000] == pIoData->pBasicRom[0], "BASIC not mapped by PORTB $71");
	REQUIRE(pContext->pMemory[0x5000] == pIoData->pSelfTestRom[0], "self-test not mapped by PORTB $71");

	CpuWrite(pContext, IO_PORTB, 0x61); /* same bits, CPU window on */
	CpuWrite(pContext, 0xa000, (u8)~pIoData->pBasicRom[0]);
	CpuWrite(pContext, 0x5000, (u8)~pIoData->pSelfTestRom[0]);
	REQUIRE(pContext->pMemory[0xa000] == (u8)~pIoData->pBasicRom[0], "BASIC stayed mapped in the window");
	REQUIRE(pContext->pMemory[0x5000] == (u8)~pIoData->pSelfTestRom[0], "self-test stayed mapped in the window");

	CpuWrite(pContext, IO_PORTB, 0x71);
	REQUIRE(pContext->pMemory[0xa000] == pIoData->pBasicRom[0], "BASIC did not come back");
	REQUIRE(pContext->pMemory[0x5000] == pIoData->pSelfTestRom[0], "self-test did not come back");

	CloseMachine(pContext);
	return 1;
}

/* A mapped self-test ROM wins over the window at $5000-$57FF: reads come
   from the ROM and writes leave the bank alone (AHRM 2.7). */
static int TestSelfTestRomHasPriorityOverTheWindow(void)
{
	_6502_Context_t *pContext = OpenMachine(ATARI_MEMORY_130XE);
	IoData_t *pIoData;

	REQUIRE(pContext != NULL, "machine open failed");
	pIoData = (IoData_t *)pContext->pIoData;
	EnablePortBOutputs(pContext);

	CpuWrite(pContext, IO_PORTB, 0xef); /* bank 3, self-test off */
	CpuWrite(pContext, 0x5000, 0x77);
	CpuWrite(pContext, IO_PORTB, 0x6f); /* bank 3, self-test on */
	REQUIRE(CpuRead(pContext, 0x5000) == pIoData->pSelfTestRom[0], "the window hid the self-test ROM");
	CpuWrite(pContext, 0x5000, 0x88);
	CpuWrite(pContext, IO_PORTB, 0xeb); /* bank 2 */
	CpuWrite(pContext, IO_PORTB, 0xef); /* bank 3, self-test off */
	REQUIRE(CpuRead(pContext, 0x5000) == 0x77, "bank 3 under the self-test ROM read $%02X", pContext->tCpu.a);

	CloseMachine(pContext);
	return 1;
}

/* The Reset key resets the PIA: port B falls back to the pull-ups, which
   close the window, and the banks keep their contents (AHRM 2.4, 2.7). */
static int TestPiaResetClosesTheWindowAndKeepsTheBanks(void)
{
	_6502_Context_t *pContext = OpenMachine(ATARI_MEMORY_RAMBO_320K);

	REQUIRE(pContext != NULL, "machine open failed");
	EnablePortBOutputs(pContext);
	CpuWrite(pContext, 0x4000, 0x11);
	CpuWrite(pContext, IO_PORTB, 0x87); /* bank 1 */
	CpuWrite(pContext, 0x4000, 0x42);

	Pia_Reset(pContext);
	REQUIRE(CpuRead(pContext, 0x4000) == 0x11, "main memory read $%02X after the reset", pContext->tCpu.a);

	EnablePortBOutputs(pContext);
	CpuWrite(pContext, IO_PORTB, 0x87);
	REQUIRE(CpuRead(pContext, 0x4000) == 0x42, "bank 1 read $%02X after the reset", pContext->tCpu.a);

	CloseMachine(pContext);
	return 1;
}

int main(int argc, char *argv[])
{
	int lPassed = 1;

	(void)argc;
	(void)argv;

	SDL_setenv("SDL_AUDIODRIVER", "dummy", 1);

	_6502_Init();

	lPassed &= TestBanksOfEveryProfile();
	lPassed &= TestSeparateAnticWindow();
	lPassed &= TestReusedBitsForceRomsOffInTheWindow();
	lPassed &= TestSelfTestRomHasPriorityOverTheWindow();
	lPassed &= TestPiaResetClosesTheWindowAndKeepsTheBanks();

	SDL_Quit();

	if(!lPassed)
	{
		return 1;
	}

	printf("memory_expansion_probe passed\n");
	return 0;
}
