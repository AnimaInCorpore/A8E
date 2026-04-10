#include <stdio.h>
#include <string.h>

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
	pIoData->cCurrentDisplayListCommand = 0;
	pIoData->lNextDisplayListLine = 8;
	pIoData->sDisplayListAddress = 0;
	pIoData->sRowDisplayMemoryAddress = 0;
	pIoData->sDisplayMemoryAddress = 0;
	pIoData->bFirstRowScanline = 0;

	pIoData->tVideoData.lCurrentDisplayLine = 0;
	pIoData->tVideoData.lVerticalScrollOffset = 0;

	memset(&pIoData->tDrawLineData, 0, sizeof(pIoData->tDrawLineData));

	memset(pContext->pMemory, 0, _6502_MEMORY_SIZE);
	memset(pContext->pShadowMemory, 0, _6502_MEMORY_SIZE);

	pContext->tCpu.a = 0;
	pContext->tCpu.x = 0;
	pContext->tCpu.y = 0;
	pContext->tCpu.sp = 0xff;
	pContext->tCpu.pc = 0;
	memset(&pContext->tCpu.ps, 0, sizeof(pContext->tCpu.ps));

	pContext->AccessFunction = NULL;
	pContext->sAccessAddress = 0;
	pContext->cPageCrossed = 0;
	pContext->llIoCycleTimedEventCycle = CYCLE_NEVER;
	pContext->llIoMasterTimedEventCycle = CYCLE_NEVER;
	pContext->llIoBeamTimedEventCycle = CYCLE_NEVER;

	AtariIoCycleTimedEventUpdate(pContext);
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

static int TestPlayfieldFetchSchedulesCycle105Dma(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cValue;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_DMACTL] = 0x23;
	pIoData->llDisplayListFetchCycle = 0;
	pIoData->llCycle = 102;
	pContext->tCpu.pc = 0x4321;
	pContext->pMemory[0x2000] = 0xa5;

	cValue = AtariIoTimingProbeFetchUnbufferedDisplayByte(pContext, 0x2000, 3);
	REQUIRE(cValue == 0xa5, "cycle-105 fetch returned $%02X instead of $A5", cValue);
	REQUIRE(pIoData->tDrawLineData.aScheduledPlayfieldDma[105] == 1,
			"cycle-105 playfield DMA was not scheduled");

	pIoData->llCycle = 105;
	pContext->llCycleCounter = 105;
	AtariIoTimingProbeStepClock(pContext);
	REQUIRE(pContext->llCycleCounter == 106,
			"cycle-105 playfield DMA did not stall the CPU by one cycle");
	REQUIRE(pIoData->tDrawLineData.cPlayfieldDmaStealCount == 1,
			"cycle-105 playfield DMA count was not latched");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestVirtualPlayfieldFetchUsesCpuBus(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cValue;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_DMACTL] = 0x23;
	pIoData->llDisplayListFetchCycle = 0;
	pIoData->llCycle = 103;
	pContext->tCpu.pc = 0x4321;
	pContext->pMemory[0x2000] = 0xa5;
	pContext->pMemory[0x4321] = 0x5a;

	cValue = AtariIoTimingProbeFetchUnbufferedDisplayByte(pContext, 0x2000, 3);
	REQUIRE(cValue == 0x5a,
			"virtual playfield fetch returned $%02X instead of CPU bus value $5A",
			cValue);
	REQUIRE(pIoData->tDrawLineData.aScheduledPlayfieldDma[106] == 0,
			"virtual playfield fetch incorrectly scheduled DMA at cycle 106");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestRefreshDropArtifactLatchesIntoLineBuffer(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cFirstRowValue;
	u8 cReplayValue;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_DMACTL] = 0x23;
	pContext->tCpu.pc = 0x4321;
	pIoData->llDisplayListFetchCycle = 0;
	pIoData->llCycle = 106;
	pIoData->bFirstRowScanline = 1;
	pIoData->tDrawLineData.sDisplayMemoryAddress = 0x2000;
	pIoData->tDrawLineData.cRefreshDmaPending = 1;
	pContext->pMemory[0x2000] = 0x11;
	pContext->pMemory[0x4321] = 0x33;

	cFirstRowValue = AtariIoTimingProbeFetchBufferedDisplayByte(pContext, 0, 0);
	REQUIRE(cFirstRowValue == 0xff,
			"refresh-drop line-buffer fill returned $%02X instead of $FF",
			cFirstRowValue);
	REQUIRE(pIoData->tDrawLineData.aPlayfieldLineBuffer[0] == 0xff,
			"refresh-drop artifact was not latched into line buffer");
	REQUIRE(pIoData->tDrawLineData.aScheduledPlayfieldDma[106] == 0,
			"refresh-drop artifact incorrectly scheduled DMA at cycle 106");

	pIoData->bFirstRowScanline = 0;
	pIoData->tDrawLineData.cRefreshDmaPending = 0;
	pIoData->tDrawLineData.sDisplayMemoryAddress = 0x2000;
	pContext->pMemory[0x2000] = 0x44;
	pContext->pMemory[0x4321] = 0x55;

	cReplayValue = AtariIoTimingProbeFetchBufferedDisplayByte(pContext, 0, 0);
	REQUIRE(cReplayValue == 0xff,
			"replayed line-buffer artifact returned $%02X instead of $FF",
			cReplayValue);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestWsyncBoundaryUsesCurrentOrNextLine(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cValue = 0x00;
	const u64 llLineStartCycle = 0x1000;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pIoData->llDisplayListFetchCycle = llLineStartCycle;

	pContext->llCycleCounter = llLineStartCycle + 103;
	Antic_WSYNC(pContext, &cValue);
	REQUIRE(pContext->llStallCycleCounter == llLineStartCycle + 105,
			"cycle-103 WSYNC stalled until %llu instead of current-line cycle 105",
			pContext->llStallCycleCounter);

	pContext->llStallCycleCounter = 0;
	pContext->llCycleCounter = llLineStartCycle + 104;
	Antic_WSYNC(pContext, &cValue);
	REQUIRE(pContext->llStallCycleCounter == llLineStartCycle + CYCLES_PER_LINE + 105,
			"cycle-104 WSYNC stalled until %llu instead of next-line cycle 105",
			pContext->llStallCycleCounter);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestWsyncRestartDelaysForCycle105PlayfieldDma(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cValue = 0x00;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_DMACTL] = 0x23;
	pIoData->llDisplayListFetchCycle = 0;
	pContext->llCycleCounter = 103;
	Antic_WSYNC(pContext, &cValue);

	pContext->llCycleCounter = 104;
	pContext->tCpu.pc = 0x2000;
	pContext->pMemory[0x2000] = 0xea;
	_6502_Execute(pContext);
	REQUIRE(pContext->llCycleCounter == 105,
			"WSYNC did not stall on the first post-write cycle");
	REQUIRE(pContext->tCpu.pc == 0x2000,
			"CPU advanced before the cycle-105 stall completed");

	pIoData->llCycle = 105;
	pIoData->tDrawLineData.aScheduledPlayfieldDma[105] = 1;
	AtariIoTimingProbeStepClock(pContext);
	REQUIRE(pContext->llCycleCounter == 106,
			"cycle-105 playfield DMA did not delay WSYNC restart by one cycle");

	_6502_Execute(pContext);
	REQUIRE(pContext->tCpu.pc == 0x2001,
			"CPU did not resume after cycle-105 playfield DMA cleared");
	REQUIRE(pContext->llCycleCounter == 108,
			"NOP after cycle-105 playfield DMA completed at %llu instead of 108",
			pContext->llCycleCounter);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestWsyncRestartDelaysForCycle106RefreshDma(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cValue = 0x00;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_DMACTL] = 0x23;
	pIoData->llDisplayListFetchCycle = 0;
	pContext->llCycleCounter = 103;
	Antic_WSYNC(pContext, &cValue);

	pContext->llCycleCounter = 104;
	pContext->tCpu.pc = 0x2000;
	pContext->pMemory[0x2000] = 0xea;
	_6502_Execute(pContext);
	REQUIRE(pContext->llCycleCounter == 105,
			"WSYNC did not stall on the first post-write cycle");

	pIoData->llCycle = 105;
	pIoData->tDrawLineData.aScheduledPlayfieldDma[105] = 1;
	pIoData->tDrawLineData.cRefreshDmaPending = 1;
	AtariIoTimingProbeStepClock(pContext);
	REQUIRE(pContext->llCycleCounter == 106,
			"cycle-105 playfield DMA did not push restart to cycle 106");
	REQUIRE(pIoData->tDrawLineData.cRefreshDmaPending == 1,
			"refresh DMA pending flag was lost before cycle 106");

	AtariIoTimingProbeStepClock(pContext);
	REQUIRE(pContext->llCycleCounter == 107,
			"cycle-106 refresh DMA did not delay WSYNC restart by a second cycle");
	REQUIRE(pIoData->tDrawLineData.cRefreshDmaPending == 0,
			"cycle-106 refresh DMA was not consumed");

	_6502_Execute(pContext);
	REQUIRE(pContext->tCpu.pc == 0x2001,
			"CPU did not resume after cycle-106 refresh DMA cleared");
	REQUIRE(pContext->llCycleCounter == 109,
			"NOP after cycle-106 refresh DMA completed at %llu instead of 109",
			pContext->llCycleCounter);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestWsyncStallLetsDliPreemptNextInstruction(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cValue = 0x00;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pContext->llCycleCounter = 103;
	Antic_WSYNC(pContext, &cValue);

	pContext->llCycleCounter = 104;
	pContext->tCpu.pc = 0x2000;
	pContext->tCpu.sp = 0xff;
	pContext->pMemory[0x2000] = 0xea;
	pContext->pMemory[0xfffa] = 0x34;
	pContext->pMemory[0xfffb] = 0x12;

	_6502_Execute(pContext);
	REQUIRE(pContext->llCycleCounter == 105,
			"WSYNC did not hold the CPU through cycle 105");
	REQUIRE(pContext->tCpu.pc == 0x2000,
			"next instruction started before DLI overlap test");

	pContext->pShadowMemory[IO_NMIEN] = NMI_DLI;
	pIoData->cNmienEnabledByCycle7 = NMI_DLI;
	pIoData->cNmienEnabledByCycle8 = NMI_DLI;
	pIoData->llDliCycle = 105;
	ProbeMachine_TriggerBeamEvent(&tMachine, 105, 105);
	REQUIRE(pContext->cNmiPendingFlag == 1,
			"DLI did not become pending during WSYNC stall");

	_6502_Execute(pContext);
	REQUIRE(pContext->tCpu.pc == 0x1234,
			"DLI did not preempt the post-WSYNC instruction fetch");
	REQUIRE(pContext->llCycleCounter == 112,
			"NMI service after WSYNC completed at %llu instead of 112",
			pContext->llCycleCounter);
	REQUIRE(pContext->tCpu.sp == 0xfc,
			"NMI stack push after WSYNC left SP at $%02X instead of $FC",
			pContext->tCpu.sp);

	ProbeMachine_Close(&tMachine);
	return 1;
}

int main(void)
{
	int lPassed = 1;

	SDL_setenv("SDL_AUDIODRIVER", "dummy", 1);

	_6502_Init();

	lPassed &= TestPlayfieldFetchSchedulesCycle105Dma();
	lPassed &= TestVirtualPlayfieldFetchUsesCpuBus();
	lPassed &= TestRefreshDropArtifactLatchesIntoLineBuffer();
	lPassed &= TestWsyncBoundaryUsesCurrentOrNextLine();
	lPassed &= TestWsyncRestartDelaysForCycle105PlayfieldDma();
	lPassed &= TestWsyncRestartDelaysForCycle106RefreshDma();
	lPassed &= TestWsyncStallLetsDliPreemptNextInstruction();

	SDL_Quit();

	if(!lPassed)
	{
		return 1;
	}

	printf("antic_dma_probe passed\n");
	return 0;
}
