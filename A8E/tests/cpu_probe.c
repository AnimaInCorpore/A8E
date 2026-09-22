#include <stdio.h>
#include <string.h>

#include <SDL2/SDL.h>

#include "6502.h"

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
	u8 cResult;
	u8 cCarry;
	u8 cNegative;
	u8 cOverflow;
	u8 cZero;
} DecimalResult_t;

static int Signed8(u8 cValue)
{
	return (cValue & 0x80) ? (int)cValue - 0x100 : (int)cValue;
}

/* Reference NMOS 6502 decimal ADC (Bruce Clark, "Decimal Mode", Appendix A; AHRM 3.2). */
static DecimalResult_t ReferenceDecimalAdc(u8 cA, u8 cB, u8 cCarry)
{
	DecimalResult_t tResult;
	int iLow = (cA & 0x0f) + (cB & 0x0f) + cCarry;
	int iSum;
	int iSignedSum;

	if(iLow >= 0x0a)
	{
		iLow = ((iLow + 0x06) & 0x0f) + 0x10;
	}

	iSum = (cA & 0xf0) + (cB & 0xf0) + iLow;
	iSignedSum = Signed8(cA & 0xf0) + Signed8(cB & 0xf0) + iLow;

	tResult.cNegative = (iSum & 0x80) != 0;
	tResult.cOverflow = iSignedSum < -128 || iSignedSum > 127;
	tResult.cZero = ((cA + cB + cCarry) & 0xff) == 0;

	if(iSum >= 0xa0)
	{
		iSum += 0x60;
	}

	tResult.cCarry = iSum >= 0x100;
	tResult.cResult = (u8)iSum;

	return tResult;
}

/* Reference NMOS 6502 decimal SBC: binary flags, nibble-wise corrected result. */
static DecimalResult_t ReferenceDecimalSbc(u8 cA, u8 cB, u8 cCarry)
{
	DecimalResult_t tResult;
	int iBinary = (int)cA - (int)cB - (cCarry ? 0 : 1);
	u8 cBinary = (u8)iBinary;
	int iLow = (cA & 0x0f) - (cB & 0x0f) + cCarry - 1;
	int iDiff;

	tResult.cCarry = iBinary >= 0;
	tResult.cNegative = (cBinary & 0x80) != 0;
	tResult.cZero = cBinary == 0;
	tResult.cOverflow = ((cA ^ cBinary) & (cA ^ cB) & 0x80) != 0;

	if(iLow < 0)
	{
		iLow = ((iLow - 0x06) & 0x0f) - 0x10;
	}

	iDiff = (cA & 0xf0) - (cB & 0xf0) + iLow;

	if(iDiff < 0)
	{
		iDiff -= 0x60;
	}

	tResult.cResult = (u8)iDiff;

	return tResult;
}

static _6502_Context_t *OpenCpu(void)
{
	_6502_Context_t *pContext;

	_6502_Init();
	pContext = _6502_Open();

	return pContext;
}

static void PrepareInstruction(_6502_Context_t *pContext, u8 cOpcode, u8 cOperand, u8 cA, u8 cCarry, u8 cDecimal)
{
	pContext->pMemory[PROGRAM_ADDRESS] = cOpcode;
	pContext->pMemory[PROGRAM_ADDRESS + 1] = cOperand;
	CPU.pc = PROGRAM_ADDRESS;
	CPU.a = cA;
	CPU.sp = 0xfd;
	memset(&PS, 0, sizeof(PS));
	PS.c = cCarry;
	PS.d = cDecimal;
	PS.i = 1;
	pContext->llCycleCounter = 0;
	pContext->llStallCycleCounter = 0;
}

static int CheckDecimalOpcode(_6502_Context_t *pContext, u8 cOpcode, int bAdd)
{
	u32 lA;
	u32 lB;
	u32 lCarry;

	for(lA = 0; lA < 256; lA++)
	{
		for(lB = 0; lB < 256; lB++)
		{
			for(lCarry = 0; lCarry < 2; lCarry++)
			{
				DecimalResult_t tExpected = bAdd
					? ReferenceDecimalAdc((u8)lA, (u8)lB, (u8)lCarry)
					: ReferenceDecimalSbc((u8)lA, (u8)lB, (u8)lCarry);

				PrepareInstruction(pContext, cOpcode, (u8)lB, (u8)lA, (u8)lCarry, 1);
				_6502_Execute(pContext);

				REQUIRE(CPU.a == tExpected.cResult,
						"$%02X: A=$%02X B=$%02X C=%u gave $%02X, expected $%02X",
						cOpcode, (unsigned)lA, (unsigned)lB, (unsigned)lCarry, CPU.a, tExpected.cResult);
				REQUIRE((PS.c != 0) == tExpected.cCarry &&
							(PS.n != 0) == tExpected.cNegative &&
							(PS.v != 0) == tExpected.cOverflow &&
							(PS.z != 0) == tExpected.cZero,
						"$%02X: A=$%02X B=$%02X C=%u flags C%u N%u V%u Z%u, expected C%u N%u V%u Z%u",
						cOpcode, (unsigned)lA, (unsigned)lB, (unsigned)lCarry,
						PS.c != 0, PS.n != 0, PS.v != 0, PS.z != 0,
						tExpected.cCarry, tExpected.cNegative, tExpected.cOverflow, tExpected.cZero);
				REQUIRE(pContext->llCycleCounter == 2,
						"$%02X in decimal mode took %llu cycles; the NMOS 6502 takes no extra cycle",
						cOpcode, (unsigned long long)pContext->llCycleCounter);
			}
		}
	}

	return 1;
}

static int TestDecimalAdcMatchesNmosReference(void)
{
	_6502_Context_t *pContext = OpenCpu();

	REQUIRE(pContext != NULL, "cpu open failed");
	REQUIRE(CheckDecimalOpcode(pContext, 0x69, 1), "decimal ADC mismatch");

	_6502_Close(pContext);
	return 1;
}

static int TestDecimalSbcMatchesNmosReference(void)
{
	_6502_Context_t *pContext = OpenCpu();

	REQUIRE(pContext != NULL, "cpu open failed");
	REQUIRE(CheckDecimalOpcode(pContext, 0xe9, 0), "decimal SBC mismatch");
	REQUIRE(CheckDecimalOpcode(pContext, 0xeb, 0), "decimal SBC via $EB mismatch");

	_6502_Close(pContext);
	return 1;
}

static int TestAhrmDecimalExamples(void)
{
	_6502_Context_t *pContext = OpenCpu();

	REQUIRE(pContext != NULL, "cpu open failed");

	/* AHRM 3.2: $0F + $0F -> intermediate $1E, corrected to $14 (no double carry). */
	PrepareInstruction(pContext, 0x69, 0x0f, 0x0f, 0, 1);
	_6502_Execute(pContext);
	REQUIRE(CPU.a == 0x14, "$0F + $0F gave $%02X, expected $14", CPU.a);

	/* AHRM 3.2: $FF + $01 = $66 with Z set. */
	PrepareInstruction(pContext, 0x69, 0x01, 0xff, 0, 1);
	_6502_Execute(pContext);
	REQUIRE(CPU.a == 0x66 && PS.z && PS.c, "$FF + $01 gave $%02X Z%u C%u, expected $66 Z1 C1",
			CPU.a, PS.z != 0, PS.c != 0);

	/* N and V come from the intermediate sum: $79 + $01 = $80 sets both. */
	PrepareInstruction(pContext, 0x69, 0x01, 0x79, 0, 1);
	_6502_Execute(pContext);
	REQUIRE(CPU.a == 0x80 && PS.n && PS.v, "$79 + $01 gave $%02X N%u V%u, expected $80 N1 V1",
			CPU.a, PS.n != 0, PS.v != 0);

	_6502_Close(pContext);
	return 1;
}

static int TestDecimalReadModifyWriteTiming(void)
{
	_6502_Context_t *pContext = OpenCpu();

	REQUIRE(pContext != NULL, "cpu open failed");

	/* RRA zp and ISC zp keep their 5-cycle timing in decimal mode. */
	PrepareInstruction(pContext, 0x67, 0x80, 0x10, 0, 1);
	pContext->pMemory[0x80] = 0x02;
	_6502_Execute(pContext);
	REQUIRE(pContext->llCycleCounter == 5, "RRA zp in decimal mode took %llu cycles, expected 5",
			(unsigned long long)pContext->llCycleCounter);

	PrepareInstruction(pContext, 0xe7, 0x80, 0x10, 1, 1);
	pContext->pMemory[0x80] = 0x02;
	_6502_Execute(pContext);
	REQUIRE(pContext->llCycleCounter == 5, "ISC zp in decimal mode took %llu cycles, expected 5",
			(unsigned long long)pContext->llCycleCounter);

	_6502_Close(pContext);
	return 1;
}

static int TestUndocumentedSbcImmediate(void)
{
	_6502_Context_t *pContext = OpenCpu();

	REQUIRE(pContext != NULL, "cpu open failed");

	PrepareInstruction(pContext, 0xeb, 0x11, 0x50, 1, 0);
	_6502_Execute(pContext);
	REQUIRE(CPU.a == 0x3f && PS.c && CPU.pc == PROGRAM_ADDRESS + 2 && pContext->llCycleCounter == 2,
			"$EB #$11 with A=$50 gave A=$%02X C%u PC=$%04X after %llu cycles",
			CPU.a, PS.c != 0, CPU.pc, (unsigned long long)pContext->llCycleCounter);

	_6502_Close(pContext);
	return 1;
}

static int TestKilJamsUntilReset(void)
{
	static const u8 aKilOpcodes[] = {0x02, 0x12, 0x22, 0x32, 0x42, 0x52, 0x62, 0x72, 0x92, 0xb2, 0xd2, 0xf2};
	_6502_Context_t *pContext = OpenCpu();
	u32 i;

	REQUIRE(pContext != NULL, "cpu open failed");

	pContext->pMemory[0xfffa] = 0x00; /* NMI vector -> $3000 */
	pContext->pMemory[0xfffb] = 0x30;
	pContext->pMemory[0xfffc] = 0x00; /* reset vector -> $4000 */
	pContext->pMemory[0xfffd] = 0x40;

	for(i = 0; i < sizeof(aKilOpcodes); i++)
	{
		PrepareInstruction(pContext, aKilOpcodes[i], 0xea, 0x00, 0, 0);
		_6502_Execute(pContext);
		REQUIRE(pContext->cHaltedFlag, "$%02X did not jam the CPU", aKilOpcodes[i]);
		REQUIRE(CPU.pc == PROGRAM_ADDRESS, "$%02X moved PC to $%04X", aKilOpcodes[i], CPU.pc);

		/* The jammed CPU ignores NMIs and keeps the clock running. */
		_6502_Nmi(pContext);
		pContext->llCycleCounter = 100;
		_6502_Execute(pContext);
		_6502_Execute(pContext);
		REQUIRE(CPU.pc == PROGRAM_ADDRESS && pContext->llCycleCounter == 102 && pContext->cNmiPendingFlag,
				"$%02X: jammed CPU executed or serviced an NMI (PC=$%04X)", aKilOpcodes[i], CPU.pc);

		_6502_Reset(pContext);
		REQUIRE(!pContext->cHaltedFlag && CPU.pc == 0x4000, "reset did not clear the $%02X jam", aKilOpcodes[i]);
	}

	_6502_Close(pContext);
	return 1;
}

int main(int argc, char *argv[])
{
	(void)argc;
	(void)argv;

	if(!TestDecimalAdcMatchesNmosReference())
	{
		return 1;
	}

	if(!TestDecimalSbcMatchesNmosReference())
	{
		return 1;
	}

	if(!TestAhrmDecimalExamples())
	{
		return 1;
	}

	if(!TestDecimalReadModifyWriteTiming())
	{
		return 1;
	}

	if(!TestUndocumentedSbcImmediate())
	{
		return 1;
	}

	if(!TestKilJamsUntilReset())
	{
		return 1;
	}

	printf("cpu_probe passed\n");
	return 0;
}
