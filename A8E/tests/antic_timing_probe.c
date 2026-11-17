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
	pIoData->cModeLineRowCounter = 0;
	pIoData->cModeLineEndRow = 0;
	pIoData->bModeLineScrollExit = 0;
	pIoData->bModeLineExitDli = 0;
	pIoData->bModeLineEndsThisLine = 0;

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

	pIoData->llDliCycle = 7;
	pContext->pShadowMemory[IO_NMIEN] = NMI_DLI;
	pIoData->cNmienEnabledByCycle7 = NMI_DLI;
	pIoData->cNmienEnabledByCycle8 = NMI_DLI;

	ProbeMachine_TriggerBeamEvent(&tMachine, 7, 7);
	REQUIRE(pContext->cNmiPendingFlag == 0, "DLI fired before cycle 8");
	REQUIRE((pContext->pMemory[IO_NMIRES_NMIST] & NMI_DLI) != 0,
			"NMIST DLI bit missing at cycle 7");

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
	u64 llVbiLineStartCycle;

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
	pContext->pMemory[IO_NMIRES_NMIST] = NMI_DLI;

	ProbeMachine_RunCurrentScanline(&tMachine);
	llVbiLineStartCycle = pIoData->llDisplayListFetchCycle;

	REQUIRE(pIoData->tVideoData.lCurrentDisplayLine == 248,
			"VBI advanced to line %lu instead of line 248",
			(unsigned long)pIoData->tVideoData.lCurrentDisplayLine);
	REQUIRE(pContext->cNmiPendingFlag == 0,
			"VBI fired at the line 247/248 boundary instead of cycle 8");
	REQUIRE(pIoData->llVbiCycle == llVbiLineStartCycle + 7,
			"VBI deadline was not armed at cycle 7 of line 248");
	REQUIRE((pContext->pMemory[IO_NMIRES_NMIST] & NMI_VBI) == 0,
			"NMIST VBI bit latched before cycle 7 of line 248");

	ProbeMachine_TriggerBeamEvent(
		&tMachine,
		llVbiLineStartCycle + 7,
		llVbiLineStartCycle + 7);
	REQUIRE(pContext->cNmiPendingFlag == 0, "VBI fired before cycle 8");
	REQUIRE((pContext->pMemory[IO_NMIRES_NMIST] & NMI_VBI) != 0,
			"NMIST VBI bit missing at cycle 7 of line 248");
	REQUIRE((pContext->pMemory[IO_NMIRES_NMIST] & NMI_DLI) == 0,
			"NMIST DLI bit not cleared when the VBI latched");

	ProbeMachine_TriggerBeamEvent(
		&tMachine,
		llVbiLineStartCycle + 8,
		llVbiLineStartCycle + 8);
	REQUIRE(pContext->cNmiPendingFlag == 1,
			"VBI did not raise the NMI at cycle 8 of line 248");
	REQUIRE(pIoData->llVbiCycle == CYCLE_NEVER,
			"VBI cycle was not cleared after firing");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestVbiEnableOnCycle7DelaysByOneCycle(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cValue = NMI_VBI;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pIoData->bInDrawLine = 1;
	pIoData->llDisplayListFetchCycle = 0;
	pIoData->llCycle = 7;
	pIoData->llVbiCycle = 7;
	Antic_NMIEN(pContext, &cValue);
	pIoData->bInDrawLine = 0;

	ProbeMachine_TriggerBeamEvent(&tMachine, 8, 8);
	REQUIRE(pContext->cNmiPendingFlag == 0,
			"cycle-7 NMIEN enable should delay the VBI by one cycle");
	REQUIRE(pIoData->llVbiCycle == 8,
			"cycle-7 NMIEN enable moved VBI to %llu instead of 8",
			pIoData->llVbiCycle);
	REQUIRE((pContext->pMemory[IO_NMIRES_NMIST] & NMI_VBI) != 0,
			"cycle-7 delayed VBI did not still latch NMIST");

	ProbeMachine_TriggerBeamEvent(&tMachine, 9, 9);
	REQUIRE(pContext->cNmiPendingFlag == 1,
			"delayed VBI did not trigger on the following cycle");
	REQUIRE(pIoData->llVbiCycle == CYCLE_NEVER,
			"delayed VBI cycle was not cleared after firing");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestVbiDisableOnCycle8SuppressesCurrentLine(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cValue = 0x00;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_NMIEN] = NMI_VBI;
	pIoData->cNmienEnabledByCycle7 = NMI_VBI;
	pIoData->cNmienEnabledByCycle8 = NMI_VBI;
	pIoData->bInDrawLine = 1;
	pIoData->llDisplayListFetchCycle = 0;
	pIoData->llCycle = 8;
	pIoData->llVbiCycle = 7;
	Antic_NMIEN(pContext, &cValue);
	pIoData->bInDrawLine = 0;

	ProbeMachine_TriggerBeamEvent(&tMachine, 8, 8);
	REQUIRE(pContext->cNmiPendingFlag == 0,
			"cycle-8 NMIEN disable should suppress the current-line VBI");
	REQUIRE((pContext->pMemory[IO_NMIRES_NMIST] & NMI_VBI) != 0,
			"cycle-8 disabled VBI still needs NMIST status");
	REQUIRE(pIoData->llVbiCycle == CYCLE_NEVER,
			"cycle-8 disabled VBI cycle was not cleared");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestVscrolEntryWrapExtendsModeLine(void)
{
	/* AHRM 4.7 "GTIA 9++": entering a scrolled region with VSCROL above the
	 * natural end row wraps the 4-bit row counter.  A mode F line entered
	 * with VSCROL=13 must span 4 scanlines (rows 13, 14, 15, 0).
	 */
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_DMACTL] = 0x22;
	pContext->pShadowMemory[IO_VSCROL] = 13;
	pIoData->cCurrentDisplayListCommand = 0x02; /* previous line: no VSCROL */
	pIoData->tVideoData.lCurrentDisplayLine = 100;
	pIoData->lNextDisplayListLine = 100;
	pIoData->sDisplayListAddress = 0x0600;
	pIoData->llDisplayListFetchCycle = 0x2000;
	pContext->pMemory[0x0600] = 0x2f; /* mode F with the VSCROL bit set */

	ProbeMachine_RunCurrentScanline(&tMachine);

	REQUIRE(pIoData->lNextDisplayListLine == 104,
			"mode F entry with VSCROL=13 spans until line %lu instead of 104",
			(unsigned long)pIoData->lNextDisplayListLine);
	REQUIRE(pIoData->cModeLineRowCounter == 14,
			"row counter advanced to %u instead of 14 after the entry scanline",
			pIoData->cModeLineRowCounter);

	ProbeMachine_RunCurrentScanline(&tMachine); /* row 14 -> 15 */
	ProbeMachine_RunCurrentScanline(&tMachine); /* row 15 -> 0 */
	ProbeMachine_RunCurrentScanline(&tMachine); /* row 0 matches the end row */

	REQUIRE(pIoData->lNextDisplayListLine == 104,
			"wrapped mode F line moved its fetch line to %lu",
			(unsigned long)pIoData->lNextDisplayListLine);
	REQUIRE(pIoData->tVideoData.lCurrentDisplayLine == 104,
			"wrapped mode F line ended on line %lu instead of 104",
			(unsigned long)pIoData->tVideoData.lCurrentDisplayLine);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestVscrolExitLineFollowsLiveVscrol(void)
{
	/* AHRM 4.7: the line ending a scrolled region ends when the row counter
	 * matches the live VSCROL value (deadline cycle 108), so mid-mode-line
	 * VSCROL rewrites shorten or extend the line.
	 */
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;

	REQUIRE(pContext != NULL, "machine open failed");

	/* Shorten: VSCROL=2 at fetch predicts 3 rows; dropping VSCROL to 1
	 * before the second scanline ends the line after 2 rows. */
	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_DMACTL] = 0x22;
	pContext->pShadowMemory[IO_VSCROL] = 2;
	pIoData->cCurrentDisplayListCommand = 0x22; /* previous line: VSCROL set */
	pIoData->tVideoData.lCurrentDisplayLine = 100;
	pIoData->lNextDisplayListLine = 100;
	pIoData->sDisplayListAddress = 0x0600;
	pIoData->llDisplayListFetchCycle = 0x2000;
	pContext->pMemory[0x0600] = 0x02; /* mode 2 without the VSCROL bit */

	ProbeMachine_RunCurrentScanline(&tMachine);

	REQUIRE(pIoData->bModeLineScrollExit == 1,
			"scroll-region exit line was not flagged");
	REQUIRE(pIoData->lNextDisplayListLine == 103,
			"exit line with VSCROL=2 predicted fetch line %lu instead of 103",
			(unsigned long)pIoData->lNextDisplayListLine);
	REQUIRE(pIoData->cModeLineRowCounter == 1,
			"exit line row counter advanced to %u instead of 1",
			pIoData->cModeLineRowCounter);

	pContext->pShadowMemory[IO_VSCROL] = 1;
	ProbeMachine_RunCurrentScanline(&tMachine);

	REQUIRE(pIoData->lNextDisplayListLine == 102,
			"shortened exit line did not end after row 1 (fetch line %lu)",
			(unsigned long)pIoData->lNextDisplayListLine);

	/* Extend: VSCROL=0 at fetch predicts 1 row; raising VSCROL to 2 before
	 * cycle 108 of the first scanline keeps the line alive for 3 rows. */
	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_DMACTL] = 0x22;
	pContext->pShadowMemory[IO_VSCROL] = 0;
	pIoData->cCurrentDisplayListCommand = 0x22;
	pIoData->tVideoData.lCurrentDisplayLine = 100;
	pIoData->lNextDisplayListLine = 100;
	pIoData->sDisplayListAddress = 0x0600;
	pIoData->llDisplayListFetchCycle = 0x3000;
	pContext->pMemory[0x0600] = 0x02;

	pContext->pShadowMemory[IO_VSCROL] = 2; /* rewrite before the line draws */
	ProbeMachine_RunCurrentScanline(&tMachine);
	REQUIRE(pIoData->cModeLineRowCounter == 1,
			"extended exit line stopped after row 0");
	ProbeMachine_RunCurrentScanline(&tMachine);
	ProbeMachine_RunCurrentScanline(&tMachine);

	REQUIRE(pIoData->lNextDisplayListLine == 103,
			"extended exit line ended at fetch line %lu instead of 103",
			(unsigned long)pIoData->lNextDisplayListLine);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestVscrolExitDliDeadlineCycle5(void)
{
	/* AHRM 4.8: a VSCROL write affecting whether a DLI occurs must land by
	 * cycle 5.  Later writes cannot trigger the DLI but still end the mode
	 * line via the cycle-108 comparison.
	 */
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u32 i;

	REQUIRE(pContext != NULL, "machine open failed");

	/* Too late: VSCROL only matches after cycle 5. */
	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_NMIEN] = NMI_DLI;
	pIoData->cNmienEnabledByCycle7 = NMI_DLI;
	pIoData->cNmienEnabledByCycle8 = NMI_DLI;
	pIoData->bInDrawLine = 1;
	pIoData->llDisplayListFetchCycle = 0x4000;
	pIoData->llCycle = 0x4000;
	pContext->llCycleCounter = 0x4000 + 200;
	pIoData->bModeLineScrollExit = 1;
	pIoData->bModeLineExitDli = 1;
	pIoData->cModeLineRowCounter = 3;
	pContext->pShadowMemory[IO_VSCROL] = 0;

	for(i = 0; i < 7; i++) /* cycles 0-6 */
	{
		AtariIoTimingProbeStepClock(pContext);
	}
	REQUIRE(pIoData->llDliCycle == CYCLE_NEVER,
			"mismatched VSCROL still armed an exit-line DLI");

	pContext->pShadowMemory[IO_VSCROL] = 3; /* matches, but after cycle 5 */
	while(pIoData->llCycle < 0x4000 + 110) /* through the cycle-109 sample */
	{
		AtariIoTimingProbeStepClock(pContext);
	}
	REQUIRE(pIoData->llDliCycle == CYCLE_NEVER,
			"VSCROL write after cycle 5 incorrectly armed the exit-line DLI");
	REQUIRE(pIoData->bModeLineEndsThisLine == 1,
			"VSCROL write before cycle 108 did not end the exit line");

	/* In time: VSCROL matches from the start of the scanline. */
	ProbeMachine_ResetTiming(&tMachine);

	pContext->pShadowMemory[IO_NMIEN] = NMI_DLI;
	pIoData->cNmienEnabledByCycle7 = NMI_DLI;
	pIoData->cNmienEnabledByCycle8 = NMI_DLI;
	pIoData->bInDrawLine = 1;
	pIoData->llDisplayListFetchCycle = 0x5000;
	pIoData->llCycle = 0x5000;
	pContext->llCycleCounter = 0x5000 + 200;
	pIoData->bModeLineScrollExit = 1;
	pIoData->bModeLineExitDli = 1;
	pIoData->cModeLineRowCounter = 3;
	pContext->pShadowMemory[IO_VSCROL] = 3;

	for(i = 0; i < 7; i++) /* cycles 0-6 */
	{
		AtariIoTimingProbeStepClock(pContext);
	}
	REQUIRE(pIoData->llDliCycle == 0x5000 + 7,
			"matching VSCROL did not arm the exit-line DLI at cycle 7");

	AtariIoTimingProbeStepClock(pContext); /* cycle 7: NMIST */
	REQUIRE((pContext->pMemory[IO_NMIRES_NMIST] & NMI_DLI) != 0,
			"exit-line DLI did not latch NMIST at cycle 7");

	AtariIoTimingProbeStepClock(pContext); /* cycle 8: NMI */
	REQUIRE(pContext->cNmiPendingFlag == 1,
			"exit-line DLI did not raise the NMI at cycle 8");

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
	REQUIRE(pIoData->llDliCycle == llFirstLineStartCycle + CYCLES_PER_LINE + 7,
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
	REQUIRE(pIoData->llDliCycle == llFirstLineStartCycle + (2 * CYCLES_PER_LINE) + 7,
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
	pIoData->llDliCycle = 7;
	Antic_NMIEN(pContext, &cValue);
	pIoData->bInDrawLine = 0;

	ProbeMachine_TriggerBeamEvent(&tMachine, 8, 8);
	REQUIRE(pContext->cNmiPendingFlag == 0,
			"cycle-7 NMIEN enable should delay the DLI by one cycle");
	REQUIRE(pIoData->llDliCycle == 8,
			"cycle-7 NMIEN enable moved DLI to %llu instead of 8",
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
	pIoData->llDliCycle = 7;
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
	pIoData->llDliCycle = 7;
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

void AtariIoFetchLine(_6502_Context_t *pContext);

/* Fetches one display list instruction at line 100 from $0600. */
static void ProbeMachine_FetchInstruction(ProbeMachine_t *pMachine, u8 cPreviousCommand)
{
	_6502_Context_t *pContext = pMachine->pContext;
	IoData_t *pIoData = pMachine->pIoData;

	ProbeMachine_ResetTiming(pMachine);
	pContext->pShadowMemory[IO_DMACTL] = 0x22;
	pIoData->cCurrentDisplayListCommand = cPreviousCommand;
	pIoData->tVideoData.lCurrentDisplayLine = 100;
	pIoData->lNextDisplayListLine = 100;
	pIoData->sDisplayListAddress = 0x0600;
	pIoData->llDisplayListFetchCycle = 0x2000;
	AtariIoFetchLine(pContext);
}

static int TestBlankLinesSkipAddressDma(void)
{
	/* AHRM 4.6/4.14: only LMS on modes 2-F and jumps fetch an address. On
	 * blank lines $40-$70 bit 6 is part of the line count. */
	static const u8 aCommands[] = {0x40, 0x50, 0x60, 0x70, 0x42, 0x01};
	static const u8 aExpected[] = {0, 0, 0, 0, 2, 2};
	ProbeMachine_t tMachine = ProbeMachine_Open();
	u32 i;

	REQUIRE(tMachine.pContext != NULL, "machine open failed");

	for(i = 0; i < sizeof(aCommands); i++)
	{
		tMachine.pContext->pMemory[0x0600] = aCommands[i];
		ProbeMachine_FetchInstruction(&tMachine, 0x02);
		REQUIRE(tMachine.pIoData->tDrawLineData.cDisplayListAddressDmaRemaining == aExpected[i],
				"$%02X scheduled %u address DMA cycles instead of %u",
				aCommands[i],
				tMachine.pIoData->tDrawLineData.cDisplayListAddressDmaRemaining,
				aExpected[i]);
	}

	tMachine.pContext->pMemory[0x0600] = 0x70;
	ProbeMachine_FetchInstruction(&tMachine, 0x02);
	REQUIRE(tMachine.pIoData->lNextDisplayListLine == 108,
			"$70 blank line ends at line %lu instead of 108",
			(unsigned long)tMachine.pIoData->lNextDisplayListLine);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestJumpIsOneBlankLine(void)
{
	/* AHRM 4.6: bits 4-5 are ignored on jumps; a jump is one blank line. */
	static const u8 aCommands[] = {0x01, 0x11, 0x21, 0x31};
	ProbeMachine_t tMachine = ProbeMachine_Open();
	u32 i;

	REQUIRE(tMachine.pContext != NULL, "machine open failed");

	for(i = 0; i < sizeof(aCommands); i++)
	{
		tMachine.pContext->pMemory[0x0600] = aCommands[i];
		tMachine.pContext->pMemory[0x0601] = 0x00;
		tMachine.pContext->pMemory[0x0602] = 0x07;
		ProbeMachine_FetchInstruction(&tMachine, 0x02);
		REQUIRE(tMachine.pIoData->lNextDisplayListLine == 101,
				"jump $%02X fetches the next instruction at line %lu instead of 101",
				aCommands[i],
				(unsigned long)tMachine.pIoData->lNextDisplayListLine);
		REQUIRE(tMachine.pIoData->sDisplayListAddress == 0x0700,
				"jump $%02X went to $%04X instead of $0700",
				aCommands[i],
				tMachine.pIoData->sDisplayListAddress);
	}

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestJumpAddressWrapsWithin1K(void)
{
	/* AHRM 4.6: the display list wraps within its 1K block, even inside a
	 * jump's address bytes. */
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_FetchInstruction(&tMachine, 0x02);
	pIoData->tVideoData.lCurrentDisplayLine = 100;
	pIoData->lNextDisplayListLine = 100;
	pIoData->sDisplayListAddress = 0x07fe;
	pContext->pMemory[0x07fe] = 0x01;
	pContext->pMemory[0x07ff] = 0x34;
	pContext->pMemory[0x0400] = 0x12;
	pContext->pMemory[0x0800] = 0x99;
	AtariIoFetchLine(pContext);
	REQUIRE(pIoData->sDisplayListAddress == 0x1234,
			"jump across the 1K boundary went to $%04X instead of $1234",
			pIoData->sDisplayListAddress);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestIrBit6ClearedAcrossVbl(void)
{
	/* AHRM 4.6: only IR bit 6 is cleared over vertical blank, so a VS line
	 * before VBL followed by a VS line on line 8 is no region entry. */
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetTiming(&tMachine);
	pContext->pShadowMemory[IO_DMACTL] = 0x22;
	pContext->pShadowMemory[IO_VSCROL] = 5;
	pIoData->cCurrentDisplayListCommand = 0xe2;
	pIoData->tVideoData.lCurrentDisplayLine = LINES_PER_SCREEN_PAL - 1;
	pIoData->lNextDisplayListLine = 8;
	pIoData->sDisplayListAddress = 0x0600;
	pIoData->llDisplayListFetchCycle = 0x2000;
	pContext->pMemory[0x0600] = 0x22;

	ProbeMachine_RunCurrentScanline(&tMachine);
	REQUIRE(pIoData->cCurrentDisplayListCommand == 0xa2,
			"IR read $%02X after vertical blank instead of $A2",
			pIoData->cCurrentDisplayListCommand);

	while(pIoData->tVideoData.lCurrentDisplayLine < 8)
	{
		ProbeMachine_RunCurrentScanline(&tMachine);
	}
	ProbeMachine_RunCurrentScanline(&tMachine);
	REQUIRE(pIoData->lNextDisplayListLine == 16,
			"VS line 8 after a VS line before VBL ends at %lu instead of 16",
			(unsigned long)pIoData->lNextDisplayListLine);

	ProbeMachine_Close(&tMachine);
	return 1;
}

int main(int argc, char *argv[])
{
	int lPassed = 1;

	SDL_setenv("SDL_AUDIODRIVER", "dummy", 1);

	_6502_Init();

	lPassed &= TestDliTriggersAtCycle8();
	lPassed &= TestVbiTriggersAtLine248();
	lPassed &= TestVbiEnableOnCycle7DelaysByOneCycle();
	lPassed &= TestVbiDisableOnCycle8SuppressesCurrentLine();
	lPassed &= TestVscrolEntryWrapExtendsModeLine();
	lPassed &= TestVscrolExitLineFollowsLiveVscrol();
	lPassed &= TestVscrolExitDliDeadlineCycle5();
	lPassed &= TestVcountUpdatesAtCycle111();
	lPassed &= TestJvbDliReplayBehavior();
	lPassed &= TestDliEnableOnCycle7DelaysByOneCycle();
	lPassed &= TestDliEnableOnCycle8IsTooLate();
	lPassed &= TestDliDisableOnCycle8SuppressesCurrentLine();
	lPassed &= TestBlankLinesSkipAddressDma();
	lPassed &= TestJumpIsOneBlankLine();
	lPassed &= TestJumpAddressWrapsWithin1K();
	lPassed &= TestIrBit6ClearedAcrossVbl();

	SDL_Quit();

	if(!lPassed)
	{
		return 1;
	}

	printf("antic_timing_probe passed\n");
	return 0;
}
