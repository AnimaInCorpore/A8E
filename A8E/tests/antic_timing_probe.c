#include <stdio.h>
#include <string.h>

#define SDL_MAIN_HANDLED
#include <SDL2/SDL.h>

#include "6502.h"
#include "Antic.h"
#include "AtariIo.h"

SDL_Window *g_pSdlWindow = NULL;

typedef struct
{
	_6502_Context_t *pContext;
	IoData_t *pIoData;
} ProbeMachine_t;

#define REQUIRE(condition, format, ...)                                  \
	do                                                                   \
	{                                                                    \
		if(!(condition))                                                 \
		{                                                                \
			fprintf(stderr, "%s: " format "\n", __func__, ##__VA_ARGS__); \
			return 0;                                                    \
		}                                                                \
	} while(0)

static ProbeMachine_t ProbeMachine_Open(void)
{
	ProbeMachine_t tMachine;

	memset(&tMachine, 0, sizeof(tMachine));

	tMachine.pContext = _6502_Open();
	if(tMachine.pContext == NULL)
	{
		fprintf(stderr, "ProbeMachine_Open: _6502_Open failed\n");
		return tMachine;
	}

	AtariIoOpen(tMachine.pContext, 0, NULL);
	tMachine.pIoData = (IoData_t *)tMachine.pContext->pIoData;

	return tMachine;
}

static void ProbeMachine_Close(ProbeMachine_t *pMachine)
{
	if(pMachine->pContext)
	{
		AtariIoClose(pMachine->pContext);
		_6502_Close(pMachine->pContext);
	}

	memset(pMachine, 0, sizeof(*pMachine));
}

static void ProbeMachine_ResetTiming(ProbeMachine_t *pMachine)
{
	_6502_Context_t *pContext = pMachine->pContext;
	IoData_t *pIoData = pMachine->pIoData;

	pContext->llCycleCounter = 0;
	pContext->llStallCycleCounter = 0;
	pContext->cNmiPendingFlag = 0;
	pContext->cNmiActiveFlag = 0;
	pContext->cIrqPendingFlag = 0;

	pIoData->llCycle = 0;
	pIoData->llDisplayListFetchCycle = CYCLE_NEVER;
	pIoData->llDliCycle = CYCLE_NEVER;
	pIoData->llSerialOutputNeedDataCycle = CYCLE_NEVER;
	pIoData->llSerialOutputTransmissionDoneCycle = CYCLE_NEVER;
	pIoData->llSerialInputDataReadyCycle = CYCLE_NEVER;
	pIoData->llTimer1Cycle = CYCLE_NEVER;
	pIoData->llTimer2Cycle = CYCLE_NEVER;
	pIoData->llTimer4Cycle = CYCLE_NEVER;
	pIoData->bInDrawLine = 0;
	pIoData->cNmienEnabledByCycle7 = 0;
	pIoData->cNmienEnabledByCycle8 = 0;
	pIoData->cNmienEnabledOnCycle7Mask = 0;
	pIoData->cCurrentDisplayListCommand = 0;
	pIoData->lNextDisplayListLine = 8;
	pIoData->sDisplayListAddress = 0;
	pIoData->sRowDisplayMemoryAddress = 0;
	pIoData->sDisplayMemoryAddress = 0;
	pIoData->bFirstRowScanline = 0;

	pIoData->tVideoData.lCurrentDisplayLine = 0;
	pIoData->tVideoData.lVerticalScrollOffset = 0;

	pIoData->tDrawLineData.cPlayfieldDmaStealCount = 0;
	pIoData->tDrawLineData.cRefreshDmaPending = 0;
	pIoData->tDrawLineData.cDisplayListInstructionDmaPending = 0;
	pIoData->tDrawLineData.cDisplayListAddressDmaRemaining = 0;

	pContext->pMemory[IO_NMIRES_NMIST] = 0;
	pContext->pMemory[IO_VCOUNT] = 0;
	pContext->pShadowMemory[IO_DMACTL] = 0;
	pContext->pShadowMemory[IO_NMIEN] = 0;

	AtariIoCycleTimedEventUpdate(pContext);
}

static void ProbeMachine_RunCurrentScanline(ProbeMachine_t *pMachine)
{
	_6502_Context_t *pContext = pMachine->pContext;
	IoData_t *pIoData = pMachine->pIoData;

	pIoData->llCycle = pIoData->llDisplayListFetchCycle;
	pContext->llCycleCounter = pIoData->llDisplayListFetchCycle + CYCLES_PER_LINE;
	AtariIoCycleTimedEventUpdate(pContext);
	pContext->IoCycleTimedEventFunction(pContext);
}

static void ProbeMachine_TriggerBeamEvent(ProbeMachine_t *pMachine, u64 llBeamCycle, u64 llMasterCycle)
{
	_6502_Context_t *pContext = pMachine->pContext;
	IoData_t *pIoData = pMachine->pIoData;

	pIoData->bInDrawLine = 1;
	pIoData->llCycle = llBeamCycle;
	pContext->llCycleCounter = llMasterCycle;
	AtariIoCycleTimedEventUpdate(pContext);
	pContext->IoCycleTimedEventFunction(pContext);
	pIoData->bInDrawLine = 0;
}

static int TestDliTriggersAtCycle8(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pIoData->llDliCycle = 8;
	pContext->pShadowMemory[IO_NMIEN] = NMI_DLI;
	pIoData->cNmienEnabledByCycle7 = NMI_DLI;
	pIoData->cNmienEnabledByCycle8 = NMI_DLI;

	ProbeMachine_TriggerBeamEvent(&tMachine, 7, 7);
	REQUIRE(pContext->cNmiPendingFlag == 0, "DLI fired before cycle 8");
	REQUIRE((pContext->pMemory[IO_NMIRES_NMIST] & NMI_DLI) == 0,
			"NMIST DLI bit set before cycle 8");

	ProbeMachine_TriggerBeamEvent(&tMachine, 8, 8);
	REQUIRE(pContext->cNmiPendingFlag == 1, "DLI did not trigger on cycle 8");
	REQUIRE(pIoData->llDliCycle == CYCLE_NEVER, "DLI cycle was not cleared after firing");
	REQUIRE((pContext->pMemory[IO_NMIRES_NMIST] & NMI_DLI) != 0,
			"NMIST DLI bit missing after cycle-8 trigger");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestVbiTriggersAtLine248(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_DMACTL] = 0x20;
	pContext->pShadowMemory[IO_NMIEN] = NMI_VBI;
	pIoData->tVideoData.lCurrentDisplayLine = 247;
	pIoData->lNextDisplayListLine = 247;
	pIoData->sDisplayListAddress = 0x0700;
	pIoData->llDisplayListFetchCycle = 0x1000;
	pContext->pMemory[0x0700] = 0x01;
	pContext->pMemory[0x0701] = 0x00;
	pContext->pMemory[0x0702] = 0x04;

	ProbeMachine_RunCurrentScanline(&tMachine);

	REQUIRE(pIoData->tVideoData.lCurrentDisplayLine == 248,
			"VBI advanced to line %lu instead of line 248",
			(unsigned long)pIoData->tVideoData.lCurrentDisplayLine);
	REQUIRE(pContext->cNmiPendingFlag == 1, "VBI did not raise NMI at line 248");
	REQUIRE((pContext->pMemory[IO_NMIRES_NMIST] & NMI_VBI) != 0,
			"NMIST VBI bit missing at line 248");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestVcountUpdatesAtCycle111(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	const u32 lCurrentDisplayLine = 9;
	const u64 llLineStartCycle = 0x2000;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pIoData->bInDrawLine = 1;
	pIoData->tVideoData.lCurrentDisplayLine = lCurrentDisplayLine;
	pIoData->llDisplayListFetchCycle = llLineStartCycle;
	pIoData->llCycle = llLineStartCycle + 110;
	pContext->llCycleCounter = llLineStartCycle + CYCLES_PER_LINE;
	pContext->pMemory[IO_VCOUNT] = (u8)(lCurrentDisplayLine >> 1);

	AtariIoTimingProbeStepClock(pContext);
	REQUIRE(pContext->pMemory[IO_VCOUNT] == (u8)(lCurrentDisplayLine >> 1),
			"VCOUNT changed before cycle 111");

	AtariIoTimingProbeStepClock(pContext);
	REQUIRE(pContext->pMemory[IO_VCOUNT] == (u8)((lCurrentDisplayLine + 1) >> 1),
			"VCOUNT did not update on cycle 111");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestJvbDliReplayBehavior(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	const u64 llFirstLineStartCycle = 0x3000;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_DMACTL] = 0x20;
	pContext->pShadowMemory[IO_NMIEN] = NMI_DLI;
	pIoData->tVideoData.lCurrentDisplayLine = 20;
	pIoData->lNextDisplayListLine = 20;
	pIoData->sDisplayListAddress = 0x0400;
	pIoData->llDisplayListFetchCycle = llFirstLineStartCycle;
	pContext->pMemory[0x0400] = 0xc1;
	pContext->pMemory[0x0401] = 0x34;
	pContext->pMemory[0x0402] = 0x12;

	ProbeMachine_RunCurrentScanline(&tMachine);

	REQUIRE(pIoData->cCurrentDisplayListCommand == 0xc1,
			"JVB+DLI command was not fetched");
	REQUIRE(pIoData->sDisplayListAddress == 0x1234,
			"JVB+DLI jump target latched as $%04X instead of $1234",
			pIoData->sDisplayListAddress);
	REQUIRE(pIoData->lNextDisplayListLine == 8,
			"JVB+DLI did not switch to wait-for-VBL semantics");
	REQUIRE(pIoData->llDliCycle == llFirstLineStartCycle + CYCLES_PER_LINE + 8,
			"JVB+DLI replay did not arm the next scanline DLI");

	pContext->cNmiPendingFlag = 0;
	ProbeMachine_TriggerBeamEvent(
		&tMachine,
		llFirstLineStartCycle + CYCLES_PER_LINE + 8,
		llFirstLineStartCycle + CYCLES_PER_LINE + 8);
	REQUIRE(pContext->cNmiPendingFlag == 1,
			"Replayed JVB DLI did not trigger on the next scanline");

	pContext->cNmiPendingFlag = 0;
	ProbeMachine_RunCurrentScanline(&tMachine);
	REQUIRE(pIoData->tVideoData.lCurrentDisplayLine == 22,
			"JVB+DLI replay did not advance to the next scanline");
	REQUIRE(pIoData->llDliCycle == llFirstLineStartCycle + (2 * CYCLES_PER_LINE) + 8,
			"JVB+DLI replay did not re-arm after a replayed scanline");

	pIoData->tVideoData.lCurrentDisplayLine = 247;
	pIoData->llDisplayListFetchCycle = 0x4000;
	pIoData->llDliCycle = CYCLE_NEVER;
	ProbeMachine_RunCurrentScanline(&tMachine);
	REQUIRE(pIoData->tVideoData.lCurrentDisplayLine == 248,
			"JVB+DLI replay did not stop at VBL entry");
	REQUIRE(pIoData->llDliCycle == CYCLE_NEVER,
			"JVB+DLI replay incorrectly armed a DLI in VBL");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestDliEnableOnCycle7DelaysByOneCycle(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cValue = NMI_DLI;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pIoData->bInDrawLine = 1;
	pIoData->llDisplayListFetchCycle = 0;
	pIoData->llCycle = 7;
	pIoData->llDliCycle = 8;
	Antic_NMIEN(pContext, &cValue);
	pIoData->bInDrawLine = 0;

	ProbeMachine_TriggerBeamEvent(&tMachine, 8, 8);
	REQUIRE(pContext->cNmiPendingFlag == 0,
			"cycle-7 NMIEN enable should delay the DLI by one cycle");
	REQUIRE(pIoData->llDliCycle == 9,
			"cycle-7 NMIEN enable moved DLI to %llu instead of 9",
			pIoData->llDliCycle);
	REQUIRE((pContext->pMemory[IO_NMIRES_NMIST] & NMI_DLI) != 0,
			"cycle-7 delayed DLI did not still latch NMIST");

	ProbeMachine_TriggerBeamEvent(&tMachine, 9, 9);
	REQUIRE(pContext->cNmiPendingFlag == 1,
			"delayed DLI did not trigger on the following cycle");
	REQUIRE(pIoData->llDliCycle == CYCLE_NEVER,
			"delayed DLI cycle was not cleared after firing");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestDliEnableOnCycle8IsTooLate(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cValue = NMI_DLI;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pIoData->bInDrawLine = 1;
	pIoData->llDisplayListFetchCycle = 0;
	pIoData->llCycle = 8;
	pIoData->llDliCycle = 8;
	Antic_NMIEN(pContext, &cValue);
	pIoData->bInDrawLine = 0;

	ProbeMachine_TriggerBeamEvent(&tMachine, 8, 8);
	REQUIRE(pContext->cNmiPendingFlag == 0,
			"cycle-8 NMIEN enable incorrectly triggered the current-line DLI");
	REQUIRE((pContext->pMemory[IO_NMIRES_NMIST] & NMI_DLI) != 0,
			"disabled DLI still needs to report NMIST status");
	REQUIRE(pIoData->llDliCycle == CYCLE_NEVER,
			"cycle-8 late-enable DLI cycle was not cleared");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestDliDisableOnCycle8SuppressesCurrentLine(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cValue = 0x00;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_NMIEN] = NMI_DLI;
	pIoData->cNmienEnabledByCycle7 = NMI_DLI;
	pIoData->cNmienEnabledByCycle8 = NMI_DLI;
	pIoData->bInDrawLine = 1;
	pIoData->llDisplayListFetchCycle = 0;
	pIoData->llCycle = 8;
	pIoData->llDliCycle = 8;
	Antic_NMIEN(pContext, &cValue);
	pIoData->bInDrawLine = 0;

	ProbeMachine_TriggerBeamEvent(&tMachine, 8, 8);
	REQUIRE(pContext->cNmiPendingFlag == 0,
			"cycle-8 NMIEN disable should suppress the current-line DLI");
	REQUIRE((pContext->pMemory[IO_NMIRES_NMIST] & NMI_DLI) != 0,
			"cycle-8 disabled DLI still needs NMIST status");
	REQUIRE(pIoData->llDliCycle == CYCLE_NEVER,
			"cycle-8 disabled DLI cycle was not cleared");

	ProbeMachine_Close(&tMachine);
	return 1;
}

int main(void)
{
	int lPassed = 1;

	SDL_setenv("SDL_AUDIODRIVER", "dummy", 1);

	_6502_Init();

	lPassed &= TestDliTriggersAtCycle8();
	lPassed &= TestVbiTriggersAtLine248();
	lPassed &= TestVcountUpdatesAtCycle111();
	lPassed &= TestJvbDliReplayBehavior();
	lPassed &= TestDliEnableOnCycle7DelaysByOneCycle();
	lPassed &= TestDliEnableOnCycle8IsTooLate();
	lPassed &= TestDliDisableOnCycle8SuppressesCurrentLine();

	SDL_Quit();

	if(!lPassed)
	{
		return 1;
	}

	printf("antic_timing_probe passed\n");
	return 0;
}
