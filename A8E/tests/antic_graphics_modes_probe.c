#include <stdio.h>
#include <string.h>

#include <SDL2/SDL.h>

#include "6502.h"
#include "Antic.h"
#include "Gtia.h"
#include "AtariIo.h"

SDL_Window *g_pSdlWindow = NULL;

void AtariIoDrawLine(_6502_Context_t *pContext);

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

static void ProbeMachine_ResetVideo(ProbeMachine_t *pMachine)
{
	_6502_Context_t *pContext = pMachine->pContext;
	IoData_t *pIoData = pMachine->pIoData;

	pContext->llCycleCounter = 100000;
	pContext->llStallCycleCounter = 0;
	pContext->cNmiPendingFlag = 0;
	pContext->cNmiActiveFlag = 0;
	pContext->cIrqPendingFlag = 0;
	pContext->AccessFunction = NULL;
	pContext->sAccessAddress = 0;
	pContext->llIoCycleTimedEventCycle = CYCLE_NEVER;
	pContext->llIoMasterTimedEventCycle = CYCLE_NEVER;
	pContext->llIoBeamTimedEventCycle = CYCLE_NEVER;

	memset(pContext->pMemory, 0, _6502_MEMORY_SIZE);
	memset(pContext->pShadowMemory, 0, _6502_MEMORY_SIZE);
	memset(pIoData->tVideoData.pSdlAtariSurface->pixels, 0, PIXELS_PER_LINE * LINES_PER_SCREEN_PAL);
	memset(pIoData->tVideoData.pPriorityData, 0, PIXELS_PER_LINE * LINES_PER_SCREEN_PAL);
	memset(&pIoData->tDrawLineData, 0, sizeof(pIoData->tDrawLineData));

	pIoData->llCycle = 0;
	pIoData->llDisplayListFetchCycle = 0;
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
	pIoData->sRowDisplayMemoryAddress = 0x2000;
	pIoData->sDisplayMemoryAddress = 0x2000;
	pIoData->bFirstRowScanline = 0;
	pIoData->tVideoData.lCurrentDisplayLine = 8;
	pIoData->cModeLineRowCounter = 0;
	pIoData->cModeLineEndRow = 0;
	pIoData->bModeLineScrollExit = 0;
	pIoData->bModeLineExitDli = 0;
	pIoData->bModeLineEndsThisLine = 0;
}

static void ProbeMachine_PrepareModeLine(
	ProbeMachine_t *pMachine,
	u8 cMode,
	u32 lCurrentLine,
	u32 lNextLine,
	u8 bFirstRowScanline)
{
	_6502_Context_t *pContext = pMachine->pContext;
	IoData_t *pIoData = pMachine->pIoData;

	pIoData->llCycle = 0;
	pIoData->llDisplayListFetchCycle = 0;
	pIoData->cCurrentDisplayListCommand = cMode;
	pIoData->lNextDisplayListLine = lNextLine;
	pIoData->sRowDisplayMemoryAddress = 0x2000;
	pIoData->sDisplayMemoryAddress = 0x2000;
	pIoData->bFirstRowScanline = bFirstRowScanline;
	pIoData->tVideoData.lCurrentDisplayLine = lCurrentLine;
	pIoData->cModeLineRowCounter = 0;
	pIoData->bModeLineScrollExit = 0;
	pIoData->bModeLineExitDli = 0;
	pIoData->bModeLineEndsThisLine = 0;

	SRAM[IO_DMACTL] = 0x22;
	SRAM[IO_HSCROL] = 0x00;
	SRAM[IO_COLBK] = 0x00;
	SRAM[IO_COLPF0] = 0x22;
	SRAM[IO_COLPF1] = 0x0b;
	SRAM[IO_COLPF2] = 0xa0;
	SRAM[IO_COLPF3] = 0x44;
	SRAM[IO_PRIOR] = 0x00;
}

static u8 ProbeMachine_PixelAt(ProbeMachine_t *pMachine, u32 lLine, u32 lX)
{
	u8 *pPixels = (u8 *)pMachine->pIoData->tVideoData.pSdlAtariSurface->pixels;
	return pPixels[lLine * PIXELS_PER_LINE + lX];
}

static u32 ProbeMachine_ScheduledPlayfieldDmaCount(ProbeMachine_t *pMachine)
{
	u32 lCount = 0;
	u32 i;

	for(i = 0; i < CYCLES_PER_LINE; i++)
	{
		lCount += pMachine->pIoData->tDrawLineData.aScheduledPlayfieldDma[i];
	}

	return lCount;
}

static int TestCharacterModeOriginsUseGtiaClock30(void)
{
	static const struct
	{
		u8 cMode;
		u32 lModeLines;
		u8 cGlyphData;
		u8 cExpectedColor;
	} aCases[] =
		{
			{0x02, 8, 0xff, 0xab},
			{0x03, 10, 0xff, 0xab},
			{0x04, 8, 0xc0, 0xa0},
			{0x05, 16, 0xc0, 0xa0},
			{0x06, 8, 0x80, 0x22},
			{0x07, 16, 0x80, 0x22},
	};
	u32 i;

	for(i = 0; i < sizeof(aCases) / sizeof(aCases[0]); i++)
	{
		ProbeMachine_t tMachine = ProbeMachine_Open();
		_6502_Context_t *pContext = tMachine.pContext;
		IoData_t *pIoData = tMachine.pIoData;

		REQUIRE(pContext != NULL, "machine open failed");

		ProbeMachine_ResetVideo(&tMachine);
		ProbeMachine_PrepareModeLine(
			&tMachine,
			aCases[i].cMode,
			8,
			8 + aCases[i].lModeLines,
			0);

		SRAM[IO_CHACTL] = 0x00;
		SRAM[IO_CHBASE] = 0x20;
		pIoData->tDrawLineData.aPlayfieldLineBuffer[0] = 0x00;
		RAM[0x2000] = aCases[i].cGlyphData;

		AtariIoDrawLine(pContext);

		REQUIRE(
			ProbeMachine_PixelAt(&tMachine, 8, 95) == SRAM[IO_COLBK],
			"mode %X drew before GTIA clock $30; x95 was $%02X",
			aCases[i].cMode,
			ProbeMachine_PixelAt(&tMachine, 8, 95));
		REQUIRE(
			ProbeMachine_PixelAt(&tMachine, 8, 96) == aCases[i].cExpectedColor,
			"mode %X started at $%02X instead of expected $%02X at x96",
			aCases[i].cMode,
			ProbeMachine_PixelAt(&tMachine, 8, 96),
			aCases[i].cExpectedColor);

		ProbeMachine_Close(&tMachine);
	}

	return 1;
}

static int TestMode2BlankAndInvertProducesInvertedSpace(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetVideo(&tMachine);
	ProbeMachine_PrepareModeLine(&tMachine, 0x02, 8, 16, 0);

	SRAM[IO_CHACTL] = 0x03;
	SRAM[IO_CHBASE] = 0x20;
	pIoData->tDrawLineData.aPlayfieldLineBuffer[0] = 0x80;
	RAM[0x2000] = 0xff;

	AtariIoDrawLine(pContext);

	REQUIRE(
		ProbeMachine_PixelAt(&tMachine, 8, 96) == 0xab,
		"mode 2 CHACTL blank+invert pixel was $%02X instead of inverted-space $AB",
		ProbeMachine_PixelAt(&tMachine, 8, 96));

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestMode2MidScanlineChbaseLatchSwitchesCharacterSet(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetVideo(&tMachine);
	ProbeMachine_PrepareModeLine(&tMachine, 0x02, 8, 16, 0);

	SRAM[IO_CHACTL] = 0x00;
	SRAM[IO_CHBASE] = 0x24;
	RAM[0x2000] = 0xff; /* old charset: char 0 row 0 solid */
	RAM[0x2400] = 0x00; /* new charset: char 0 row 0 empty */

	/* Prime a pending CHBASE switch ($20 -> $24) that matures at beam
	 * cycle 58 - the fetch cycle of character cell 20 on this line
	 * (playfield starts at cycle 18, one character per two cycles).
	 */
	pIoData->bChbaseTimingInitialized = 1;
	pIoData->cChbaseRawValue = 0x24;
	pIoData->cChbaseActiveValue = 0x20;
	pIoData->cChbasePendingValue = 0x24;
	pIoData->llChbasePendingCycle = 58;

	AtariIoDrawLine(pContext);

	REQUIRE(
		ProbeMachine_PixelAt(&tMachine, 8, 248) == 0xab,
		"character 19 used the pending CHBASE too early; x248 was $%02X",
		ProbeMachine_PixelAt(&tMachine, 8, 248));
	REQUIRE(
		ProbeMachine_PixelAt(&tMachine, 8, 256) == SRAM[IO_COLPF2],
		"character 20 kept the stale CHBASE; x256 was $%02X instead of $%02X",
		ProbeMachine_PixelAt(&tMachine, 8, 256),
		SRAM[IO_COLPF2]);
	REQUIRE(
		pIoData->cChbaseActiveValue == 0x24,
		"pending CHBASE value $24 was not latched (active is $%02X)",
		pIoData->cChbaseActiveValue);
	REQUIRE(
		pIoData->llChbasePendingCycle == CYCLE_NEVER,
		"CHBASE pending cycle was not cleared after latching");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestMode5UsesOneKilobyteChbaseAlignment(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetVideo(&tMachine);
	ProbeMachine_PrepareModeLine(&tMachine, 0x05, 8, 24, 0);

	SRAM[IO_CHBASE] = 0xff;
	pIoData->tDrawLineData.aPlayfieldLineBuffer[0] = 0x00;
	RAM[0xfc00] = 0xc0;
	RAM[0xfe00] = 0x00;

	AtariIoDrawLine(pContext);

	REQUIRE(
		ProbeMachine_PixelAt(&tMachine, 8, 96) == SRAM[IO_COLPF2],
		"mode 5 read $%02X; expected 1K CHBASE-aligned PF2 color $%02X",
		ProbeMachine_PixelAt(&tMachine, 8, 96),
		SRAM[IO_COLPF2]);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestMode5FetchesCharacterDataOnOddRepeatedScanlines(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetVideo(&tMachine);
	ProbeMachine_PrepareModeLine(&tMachine, 0x05, 8, 23, 0);
	pIoData->cModeLineRowCounter = 1;

	SRAM[IO_CHBASE] = 0x20;
	pIoData->tDrawLineData.aPlayfieldLineBuffer[0] = 0x00;

	AtariIoDrawLine(pContext);

	REQUIRE(
		ProbeMachine_ScheduledPlayfieldDmaCount(&tMachine) == 40,
		"mode 5 odd repeated scanline scheduled %lu character DMA fetches instead of 40",
		(unsigned long)ProbeMachine_ScheduledPlayfieldDmaCount(&tMachine));

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestMode7FetchesCharacterDataOnOddRepeatedScanlines(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetVideo(&tMachine);
	ProbeMachine_PrepareModeLine(&tMachine, 0x07, 8, 23, 0);
	pIoData->cModeLineRowCounter = 1;

	SRAM[IO_CHBASE] = 0x20;
	pIoData->tDrawLineData.aPlayfieldLineBuffer[0] = 0x00;

	AtariIoDrawLine(pContext);

	REQUIRE(
		ProbeMachine_ScheduledPlayfieldDmaCount(&tMachine) == 20,
		"mode 7 odd repeated scanline scheduled %lu character DMA fetches instead of 20",
		(unsigned long)ProbeMachine_ScheduledPlayfieldDmaCount(&tMachine));

	ProbeMachine_Close(&tMachine);
	return 1;
}

/* Draws one scanline with the given playfield byte under objects at HPOS $30
   (x=96) and returns the color of the first color clock. */
static u8 DrawPriorityCase(
	u8 cMode,
	u8 cPlayfieldData,
	u8 cPrior,
	u8 cGrafP0,
	u8 cGrafP2,
	u8 cGrafM,
	u8 *pcRightPixel)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cColor;

	ProbeMachine_ResetVideo(&tMachine);
	ProbeMachine_PrepareModeLine(&tMachine, cMode, 8, cMode == 0x02 ? 16 : 9, 0);

	SRAM[IO_COLBK] = 0x00;
	SRAM[IO_COLPF0] = 0x22;
	SRAM[IO_COLPF1] = 0x0a;
	SRAM[IO_COLPF2] = 0x94;
	SRAM[IO_COLPF3] = 0x44;
	SRAM[IO_COLPM0_TRIG2] = 0x21;
	SRAM[IO_COLPM1_TRIG3] = 0x42;
	SRAM[IO_COLPM2_PAL] = 0x46;
	SRAM[IO_COLPM3] = 0x88;
	SRAM[IO_PRIOR] = cPrior;
	SRAM[IO_CHACTL] = 0x00;
	SRAM[IO_CHBASE] = 0x20;
	SRAM[IO_GRAFP0_P1PL] = cGrafP0;
	SRAM[IO_GRAFP2_P3PL] = cGrafP2;
	SRAM[IO_GRAFM_TRIG1] = cGrafM;
	SRAM[IO_HPOSP0_M0PF] = 0x30;
	SRAM[IO_HPOSP2_M2PF] = 0x30;
	SRAM[IO_HPOSM0_P0PF] = 0x30;
	SRAM[IO_HPOSM1_P1PF] = 0x30;
	if(cMode == 0x02)
	{
		/* Character 0 everywhere; its row 0 holds the pixel pattern. */
		memset(pIoData->tDrawLineData.aPlayfieldLineBuffer, 0x00, sizeof(pIoData->tDrawLineData.aPlayfieldLineBuffer));
		RAM[0x2000] = cPlayfieldData;
	}
	else
	{
		memset(pIoData->tDrawLineData.aPlayfieldLineBuffer, cPlayfieldData, sizeof(pIoData->tDrawLineData.aPlayfieldLineBuffer));
	}

	pIoData->bInDrawLine = 1; /* players and missiles are drawn per clock inside a line */
	AtariIoDrawLine(pContext);

	cColor = ProbeMachine_PixelAt(&tMachine, 8, 96);
	if(pcRightPixel)
	{
		*pcRightPixel = ProbeMachine_PixelAt(&tMachine, 8, 97);
	}

	ProbeMachine_Close(&tMachine);
	return cColor;
}

static int TestGtiaPriorityEquations(void)
{
	/* Mode E bytes: $FF = PF2, $55 = PF0, $00 = background. */
	static const struct
	{
		const char *pName;
		u8 cData;
		u8 cPrior;
		u8 cGrafP0;
		u8 cGrafP2;
		u8 cGrafM;
		u8 cExpected;
	} aCases[] =
		{
			/* AHRM 6.7 mode 0: PF2/PF3 mix with P2/P3 ($46 | $94). */
			{"PRIOR=0 P2 over PF2 mixes", 0xff, 0x00, 0x00, 0xff, 0x00, 0xd6},
			/* Mode 0: PF0/PF1 mix with P0/P1 ($21 | $22). */
			{"PRIOR=0 P0 over PF0 mixes", 0x55, 0x00, 0xff, 0x00, 0x00, 0x23},
			/* Mode 0: PF0/PF1 still win over P2/P3. */
			{"PRIOR=0 PF0 hides P2", 0x55, 0x00, 0x00, 0xff, 0x00, 0x22},
			/* Table 16: PRIOR[3:0]=0110 with PF01+P01 gives black. */
			{"PRIOR=6 PF0 and P0 give black", 0x55, 0x06, 0xff, 0x00, 0x00, 0x00},
			{"PRIOR=1 P0 over PF0", 0x55, 0x01, 0xff, 0x00, 0x00, 0x21},
			{"PRIOR=4 PF0 over P0", 0x55, 0x04, 0xff, 0x00, 0x00, 0x22},
			/* Multicolor players blend M0 and M1 too ($21 | $42). */
			{"PRIOR=$20 M0+M1 blend", 0x00, 0x20, 0x00, 0x00, 0x0f, 0x63},
			{"PRIOR=0 M0 hides M1", 0x00, 0x00, 0x00, 0x00, 0x0f, 0x21},
			/* The fifth player shows COLPF3 and beats the other playfields. */
			{"PRIOR=$11 fifth player over PF0", 0x55, 0x11, 0x00, 0x00, 0x03, 0x44},
	};
	u32 i;

	for(i = 0; i < sizeof(aCases) / sizeof(aCases[0]); i++)
	{
		u8 cColor = DrawPriorityCase(0x0e, aCases[i].cData, aCases[i].cPrior, aCases[i].cGrafP0,
									 aCases[i].cGrafP2, aCases[i].cGrafM, NULL);

		REQUIRE(cColor == aCases[i].cExpected, "%s: got $%02X instead of $%02X", aCases[i].pName, cColor,
				aCases[i].cExpected);
	}

	return 1;
}

static int TestHiresPriorityUsesPf2AndPf1Luminance(void)
{
	u8 cRight;
	u8 cColor;

	/* AHRM 6.8: the priority logic sees PF2 in hires modes, and the PF1
	   luminance lands on the 1-bits afterwards. A text pixel in front of a
	   player (PRIOR=4) keeps the PF2 hue ... */
	cColor = DrawPriorityCase(0x02, 0xff, 0x04, 0xff, 0x00, 0x00, &cRight);
	REQUIRE(cColor == 0x9a, "PRIOR=4 text over P0 was $%02X instead of $9A", cColor);

	/* ... while a player in front lends its hue to the text luminance. */
	cColor = DrawPriorityCase(0x02, 0xff, 0x01, 0xff, 0x00, 0x00, &cRight);
	REQUIRE(cColor == 0x2a, "PRIOR=1 P0 over text was $%02X instead of $2A", cColor);

	/* Background hires pixels under a player take the player color (mode 0: P0 wins over PF2). */
	cColor = DrawPriorityCase(0x02, 0x00, 0x00, 0xff, 0x00, 0x00, &cRight);
	REQUIRE(cColor == 0x21, "PRIOR=0 P0 over hires background was $%02X instead of $21", cColor);

	return 1;
}

int main(int argc, char *argv[])
{
	int bOk = 1;

	(void)argc;
	(void)argv;

	SDL_setenv("SDL_AUDIODRIVER", "dummy", 1);
	SDL_setenv("SDL_VIDEODRIVER", "dummy", 1);
	if(SDL_Init(SDL_INIT_AUDIO | SDL_INIT_VIDEO) != 0)
	{
		fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
		return 1;
	}

	bOk &= TestCharacterModeOriginsUseGtiaClock30();
	bOk &= TestMode2BlankAndInvertProducesInvertedSpace();
	bOk &= TestMode2MidScanlineChbaseLatchSwitchesCharacterSet();
	bOk &= TestMode5UsesOneKilobyteChbaseAlignment();
	bOk &= TestMode5FetchesCharacterDataOnOddRepeatedScanlines();
	bOk &= TestMode7FetchesCharacterDataOnOddRepeatedScanlines();
	bOk &= TestGtiaPriorityEquations();
	bOk &= TestHiresPriorityUsesPf2AndPf1Luminance();

	SDL_Quit();

	if(!bOk)
	{
		return 1;
	}

	printf("antic_graphics_modes_probe passed\n");
	return 0;
}
