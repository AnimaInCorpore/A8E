#include <stdio.h>
#include <string.h>

#define SDL_MAIN_HANDLED
#include <SDL2/SDL.h>

#include "6502.h"
#include "AtariIo.h"
#include "Pokey.h"

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

#define POKEY_POT_DEFAULT_VALUE 229

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

static void ProbeMachine_ResetPotState(ProbeMachine_t *pMachine)
{
	_6502_Context_t *pContext = pMachine->pContext;
	IoData_t *pIoData = pMachine->pIoData;
	u32 i;

	pContext->llCycleCounter = 0;
	pContext->llStallCycleCounter = 0;

	pIoData->cPotScanActive = 0;
	pIoData->llPotScanLastCycle = 0;
	pIoData->llPotScanTerminalCycle = CYCLE_NEVER;
	pIoData->cPotScanCounter = 0;
	memset(pIoData->aPotLatched, 0, sizeof(pIoData->aPotLatched));

	for(i = 0; i < 8; i++)
	{
		pIoData->aPotValues[i] = POKEY_POT_DEFAULT_VALUE;
		pContext->pMemory[(IO_AUDF1_POT0 + i) & 0xffff] = 0xff;
	}

	pContext->pShadowMemory[IO_SKCTL_SKSTAT] = 0x03;
	pContext->pMemory[IO_AUDCTL_ALLPOT] = 0xff;
}

static int TestSlowScanUsesScanlineRateAndRunsToCompletion(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u32 i;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetPotState(&tMachine);
	for(i = 0; i < 8; i++)
	{
		pIoData->aPotValues[i] = 1;
	}

	Pokey_PotStartScan(pContext);

	pContext->llCycleCounter = CYCLES_PER_LINE - 1;
	Pokey_PotUpdate(pContext);
	REQUIRE(pContext->pMemory[IO_AUDF1_POT0] == 0,
			"POT0 advanced before the first scanline boundary");
	REQUIRE(pContext->pMemory[IO_AUDCTL_ALLPOT] == 0xff,
			"ALLPOT changed before the first scanline boundary");

	pContext->llCycleCounter = CYCLES_PER_LINE;
	Pokey_PotUpdate(pContext);
	REQUIRE(pContext->pMemory[IO_AUDF1_POT0] == 1,
			"POT0 did not advance on the first scanline boundary");
	REQUIRE(pContext->pMemory[IO_AUDCTL_ALLPOT] == 0x00,
			"ALLPOT did not clear once all pots latched");
	REQUIRE(pIoData->cPotScanActive == 1,
			"scan stopped as soon as ALLPOT reached zero");

	pContext->llCycleCounter = CYCLES_PER_LINE * 228;
	Pokey_PotUpdate(pContext);
	REQUIRE(pIoData->cPotScanCounter == 228,
			"slow scan did not stop at count 228");
	REQUIRE(pIoData->cPotScanActive == 1,
			"scan stopped before the terminal hold cycle");

	pContext->llCycleCounter = CYCLES_PER_LINE * 228 + 1;
	Pokey_PotUpdate(pContext);
	REQUIRE(pIoData->cPotScanActive == 0,
			"slow scan did not finish after the terminal hold cycle");
	REQUIRE(pContext->pMemory[IO_AUDCTL_ALLPOT] == 0x00,
			"ALLPOT was not forced low at slow-scan completion");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestFastScanUsesMachineClockAndEndsAt229(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetPotState(&tMachine);
	pContext->pShadowMemory[IO_SKCTL_SKSTAT] = 0x07;

	Pokey_PotStartScan(pContext);

	pContext->llCycleCounter = 228;
	Pokey_PotUpdate(pContext);
	REQUIRE(pContext->pMemory[IO_AUDF1_POT0] == 228,
			"fast scan did not expose count 228 after 228 cycles");
	REQUIRE(pContext->pMemory[IO_AUDCTL_ALLPOT] == 0xff,
			"ALLPOT cleared too early during fast scan");
	REQUIRE(pIoData->cPotScanActive == 1,
			"fast scan stopped before the 229 terminal count");

	pContext->llCycleCounter = 229;
	Pokey_PotUpdate(pContext);
	REQUIRE(pContext->pMemory[IO_AUDF1_POT0] == 229,
			"fast scan did not reach the 229 terminal count");
	REQUIRE(pContext->pMemory[IO_AUDCTL_ALLPOT] == 0xff,
			"ALLPOT cleared on the terminal fast-scan cycle");

	pContext->llCycleCounter = 230;
	Pokey_PotUpdate(pContext);
	REQUIRE(pIoData->cPotScanActive == 0,
			"fast scan did not finish after the terminal hold cycle");
	REQUIRE(pContext->pMemory[IO_AUDF1_POT0] == 229,
			"fast scan did not hold the final 229 count");
	REQUIRE(pContext->pMemory[IO_AUDCTL_ALLPOT] == 0x00,
			"ALLPOT was not forced low at fast-scan completion");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestSkctlModeChangesDoNotRetroactivelyRescaleElapsedTime(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 cFastSkctl = 0x07;

	REQUIRE(pContext != NULL, "machine open failed");

	ProbeMachine_ResetPotState(&tMachine);
	Pokey_PotStartScan(pContext);

	pContext->llCycleCounter = 57;
	Pokey_SKCTL_SKSTAT(pContext, &cFastSkctl);

	pContext->llCycleCounter = 58;
	Pokey_PotUpdate(pContext);
	REQUIRE(pIoData->cPotScanCounter == 1,
			"SKCTL clock change reused pre-switch slow time as fast counts");
	REQUIRE(pContext->pMemory[IO_AUDF1_POT0] == 1,
			"POT0 did not advance by exactly one fast count after the SKCTL change");

	ProbeMachine_Close(&tMachine);
	return 1;
}

int main(void)
{
	if(!TestSlowScanUsesScanlineRateAndRunsToCompletion())
	{
		return 1;
	}

	if(!TestFastScanUsesMachineClockAndEndsAt229())
	{
		return 1;
	}

	if(!TestSkctlModeChangesDoNotRetroactivelyRescaleElapsedTime())
	{
		return 1;
	}

	printf("pokey_pot_scan_probe passed\n");
	return 0;
}
