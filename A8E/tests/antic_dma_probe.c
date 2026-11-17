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
	pContext->cIrqPendingFlag = 0;

	pIoData->llCycle = 0;
	pIoData->llDisplayListFetchCycle = CYCLE_NEVER;
	pIoData->llDliCycle = CYCLE_NEVER;
	pIoData->llVbiCycle = CYCLE_NEVER;
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
	pIoData->cModeLineRowCounter = 0;
	pIoData->cModeLineEndRow = 0;
	pIoData->bModeLineScrollExit = 0;
	pIoData->bModeLineExitDli = 0;
	pIoData->bModeLineEndsThisLine = 0;

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

/* Writes WSYNC from an instruction of lCycles cycles that started on
 * lStartCycle; bRmw first reads WSYNC like INC/DEC do. */
static void WriteWsync(_6502_Context_t *pContext, u64 llStartCycle, u8 cCycles, u8 bRmw)
{
	u8 cValue = 0x00;

	pContext->llStallCycleCounter = 0;
	pContext->llCycleCounter = llStartCycle;
	pContext->cCurrentInstructionCycles = cCycles;
	if(bRmw)
	{
		Antic_WSYNC(pContext, NULL);
	}
	Antic_WSYNC(pContext, &cValue);
}

static int TestWsyncBoundaryUsesCurrentOrNextLine(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	const u64 llLineStartCycle = 0x1000;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pIoData->llDisplayListFetchCycle = llLineStartCycle;

	/* AHRM 4.9: STA WSYNC writes on its last cycle. A write on cycle 103
	 * halts until cycle 105, but the next opcode fetch already happened on
	 * cycle 104, so the next instruction appears to start on cycle 104. */
	WriteWsync(pContext, llLineStartCycle + 100, 4, 0);
	REQUIRE(pContext->llStallCycleCounter == llLineStartCycle + 104,
			"cycle-103 WSYNC write resumed at %llu instead of current-line cycle 104",
			pContext->llStallCycleCounter);

	/* A write on cycle 104 is too late and waits for the next line. */
	WriteWsync(pContext, llLineStartCycle + 101, 4, 0);
	REQUIRE(pContext->llStallCycleCounter == llLineStartCycle + CYCLES_PER_LINE + 104,
			"cycle-104 WSYNC write resumed at %llu instead of next-line cycle 104",
			pContext->llStallCycleCounter);

	/* INC WSYNC: the dummy write counts and the second write fills the
	 * cycle after it, so the next instruction starts on cycle 105. */
	WriteWsync(pContext, llLineStartCycle + 98, 6, 1);
	REQUIRE(pContext->llStallCycleCounter == llLineStartCycle + 105,
			"INC WSYNC writing on 102/103 resumed at %llu instead of cycle 105",
			pContext->llStallCycleCounter);

	/* Writes on 103 and 104: the next instruction starts on 105 but its
	 * second cycle waits for cycle 105 of the next line. */
	WriteWsync(pContext, llLineStartCycle + 99, 6, 1);
	REQUIRE(pContext->llStallCycleCounter == llLineStartCycle + CYCLES_PER_LINE + 104,
			"INC WSYNC writing on 103/104 resumed at %llu instead of next-line cycle 104",
			pContext->llStallCycleCounter);

	WriteWsync(pContext, llLineStartCycle + 100, 6, 1);
	REQUIRE(pContext->llStallCycleCounter == llLineStartCycle + CYCLES_PER_LINE + 105,
			"INC WSYNC writing on 104/105 resumed at %llu instead of next-line cycle 105",
			pContext->llStallCycleCounter);

	ProbeMachine_Close(&tMachine);
	return 1;
}

/* STA WSYNC on cycles 100-103, then a NOP at $2000, stepping the beam from
 * cycle 104 until the NOP has run. Returns the cycle the NOP completed. */
static u64 RunNopAfterWsync(ProbeMachine_t *pMachine, u8 bDma105, u8 bRefreshPending)
{
	_6502_Context_t *pContext = pMachine->pContext;
	IoData_t *pIoData = pMachine->pIoData;

	ProbeMachine_ResetTiming(pMachine);
	pContext->pShadowMemory[IO_DMACTL] = 0x23;
	pIoData->llDisplayListFetchCycle = 0;
	WriteWsync(pContext, 100, 4, 0);
	pContext->llCycleCounter = 104;
	pContext->tCpu.pc = 0x2000;
	pContext->pMemory[0x2000] = 0xea;

	pIoData->llCycle = 104;
	pIoData->tDrawLineData.aScheduledPlayfieldDma[105] = bDma105;
	pIoData->tDrawLineData.cRefreshDmaPending = bRefreshPending;
	while(pContext->tCpu.pc == 0x2000 && pIoData->llCycle < 120)
	{
		AtariIoTimingProbeStepClock(pContext);
	}

	return pContext->tCpu.pc == 0x2001 ? pContext->llCycleCounter : 0;
}

static int TestWsyncRestartDelaysForCycle105PlayfieldDma(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	u64 llDone;

	REQUIRE(tMachine.pContext != NULL, "machine open failed");

	/* AHRM 4.9: NOP fetched on 104, second cycle on 105, done on 106. */
	llDone = RunNopAfterWsync(&tMachine, 0, 0);
	REQUIRE(llDone == 106, "NOP after WSYNC completed at %llu instead of 106", llDone);

	/* Playfield DMA on cycle 105 delays the restart by one cycle. */
	llDone = RunNopAfterWsync(&tMachine, 1, 0);
	REQUIRE(llDone == 107, "NOP after cycle-105 playfield DMA completed at %llu instead of 107", llDone);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestWsyncRestartDelaysForCycle106RefreshDma(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	u64 llDone;

	REQUIRE(tMachine.pContext != NULL, "machine open failed");

	/* AHRM 4.9/4.14: playfield DMA on 105 pushes refresh to 106, a
	 * two-cycle delay. */
	llDone = RunNopAfterWsync(&tMachine, 1, 1);
	REQUIRE(llDone == 108, "NOP after cycle-106 refresh DMA completed at %llu instead of 108", llDone);
	REQUIRE(tMachine.pIoData->tDrawLineData.cRefreshDmaPending == 0,
			"cycle-106 refresh DMA was not consumed");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestWsyncNextInstructionRunsBeforeDli(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	/* AHRM 4.9: the instruction after the WSYNC write has already been
	 * fetched when the CPU halts, so it completes before a DLI that
	 * arrives during the wait is taken. */
	WriteWsync(pContext, 100, 4, 0);
	pContext->llCycleCounter = 104;
	pContext->tCpu.pc = 0x2000;
	pContext->tCpu.sp = 0xff;
	pContext->pMemory[0x2000] = 0xea;
	pContext->pMemory[0xfffa] = 0x34;
	pContext->pMemory[0xfffb] = 0x12;

	pContext->pShadowMemory[IO_NMIEN] = NMI_DLI;
	pIoData->cNmienEnabledByCycle7 = NMI_DLI;
	pIoData->cNmienEnabledByCycle8 = NMI_DLI;
	pIoData->llDliCycle = 104;

	_6502_Execute(pContext);
	REQUIRE(pContext->tCpu.pc == 0x2001,
			"instruction after WSYNC did not run first");
	REQUIRE(pContext->llCycleCounter == 106,
			"NOP after WSYNC completed at %llu instead of 106",
			pContext->llCycleCounter);

	ProbeMachine_TriggerBeamEvent(&tMachine, 105, 106);
	REQUIRE(pContext->cNmiPendingFlag == 1,
			"DLI did not become pending");

	_6502_Execute(pContext);
	REQUIRE(pContext->tCpu.pc == 0x1234,
			"DLI was not taken after the post-WSYNC instruction");
	REQUIRE(pContext->llCycleCounter == 113,
			"NMI service after WSYNC completed at %llu instead of 113",
			pContext->llCycleCounter);
	REQUIRE(pContext->tCpu.sp == 0xfc,
			"NMI stack push after WSYNC left SP at $%02X instead of $FC",
			pContext->tCpu.sp);

	ProbeMachine_Close(&tMachine);
	return 1;
}

int main(int argc, char *argv[])
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
	lPassed &= TestWsyncNextInstructionRunsBeforeDli();

	SDL_Quit();

	if(!lPassed)
	{
		return 1;
	}

	printf("antic_dma_probe passed\n");
	return 0;
}
