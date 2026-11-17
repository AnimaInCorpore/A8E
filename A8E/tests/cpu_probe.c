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

/* Runs one instruction at PROGRAM_ADDRESS with the given registers. */
static void ExecuteOne(_6502_Context_t *pContext, const u8 *pBytes, u32 lLength, u8 cA, u8 cX, u8 cY, u8 cCarry)
{
	memcpy(&pContext->pMemory[PROGRAM_ADDRESS], pBytes, lLength);
	CPU.pc = PROGRAM_ADDRESS;
	CPU.a = cA;
	CPU.x = cX;
	CPU.y = cY;
	CPU.sp = 0xfd;
	memset(&PS, 0, sizeof(PS));
	PS.c = cCarry;
	PS.i = 1;
	pContext->llCycleCounter = 0;
	pContext->llStallCycleCounter = 0;
	_6502_Execute(pContext);
}

static u8 m_cIoReadValue;
static u8 m_cIoWriteCount;
static u8 m_cIoLastWrite;
static u16 m_sIoLastAddress;

static u8 *TestIoAccess(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		m_cIoWriteCount++;
		m_cIoLastWrite = *pValue;
		m_sIoLastAddress = pContext->sAccessAddress;
	}

	return &m_cIoReadValue;
}

static int TestReadModifyWriteFlagsUseComputedValue(void)
{
	static const u8 aIncRom[] = {0xee, 0x00, 0xe0}; /* INC $E000 */
	static const u8 aDecRom[] = {0xce, 0x00, 0xe0}; /* DEC $E000 */
	static const u8 aSloRom[] = {0x0f, 0x00, 0xe0}; /* SLO $E000 */
	static const u8 aRlaRom[] = {0x2f, 0x00, 0xe0}; /* RLA $E000 */
	static const u8 aSreRom[] = {0x4f, 0x00, 0xe0}; /* SRE $E000 */
	static const u8 aRraRom[] = {0x6f, 0x00, 0xe0}; /* RRA $E000 */
	static const u8 aIscRom[] = {0xef, 0x00, 0xe0}; /* ISC $E000 */
	static const u8 aDcpRom[] = {0xcf, 0x00, 0xe0}; /* DCP $E000 */
	static const u8 aIncIo[] = {0xee, 0x00, 0xd2};  /* INC $D200 */
	_6502_Context_t *pContext = OpenCpu();

	REQUIRE(pContext != NULL, "cpu open failed");
	_6502_SetRom(pContext, 0xe000, 0xe000);
	_6502_SetIo(pContext, 0xd200, TestIoAccess);

	pContext->pMemory[0xe000] = 0x00;
	ExecuteOne(pContext, aIncRom, sizeof(aIncRom), 0, 0, 0, 0);
	REQUIRE(pContext->pMemory[0xe000] == 0x00, "INC changed ROM");
	REQUIRE(!PS.z && !PS.n, "INC ROM $00 gave Z%u N%u, expected Z0 N0", PS.z != 0, PS.n != 0);

	ExecuteOne(pContext, aDecRom, sizeof(aDecRom), 0, 0, 0, 0);
	REQUIRE(!PS.z && PS.n, "DEC ROM $00 gave Z%u N%u, expected Z0 N1", PS.z != 0, PS.n != 0);

	pContext->pMemory[0xe000] = 0x40;
	ExecuteOne(pContext, aSloRom, sizeof(aSloRom), 0x00, 0, 0, 0);
	REQUIRE(CPU.a == 0x80, "SLO ROM $40 gave A=$%02X, expected $80", CPU.a);
	ExecuteOne(pContext, aRlaRom, sizeof(aRlaRom), 0xff, 0, 0, 0);
	REQUIRE(CPU.a == 0x80, "RLA ROM $40 gave A=$%02X, expected $80", CPU.a);

	pContext->pMemory[0xe000] = 0x02;
	ExecuteOne(pContext, aSreRom, sizeof(aSreRom), 0x00, 0, 0, 0);
	REQUIRE(CPU.a == 0x01, "SRE ROM $02 gave A=$%02X, expected $01", CPU.a);
	ExecuteOne(pContext, aRraRom, sizeof(aRraRom), 0x10, 0, 0, 0);
	REQUIRE(CPU.a == 0x11, "RRA ROM $02 gave A=$%02X, expected $11", CPU.a);

	pContext->pMemory[0xe000] = 0xff;
	ExecuteOne(pContext, aIscRom, sizeof(aIscRom), 0x10, 0, 0, 1);
	REQUIRE(CPU.a == 0x10, "ISC ROM $FF gave A=$%02X, expected $10", CPU.a);

	pContext->pMemory[0xe000] = 0x01;
	ExecuteOne(pContext, aDcpRom, sizeof(aDcpRom), 0x00, 0, 0, 0);
	REQUIRE(PS.z && PS.c, "DCP ROM $01 with A=$00 gave Z%u C%u, expected Z1 C1", PS.z != 0, PS.c != 0);

	/* An I/O register that reads $FF: INC writes $00 and sets flags from it. */
	m_cIoReadValue = 0xff;
	m_cIoWriteCount = 0;
	ExecuteOne(pContext, aIncIo, sizeof(aIncIo), 0, 0, 0, 0);
	REQUIRE(m_cIoWriteCount == 1 && m_cIoLastWrite == 0x00, "INC I/O wrote $%02X (%u writes)", m_cIoLastWrite, m_cIoWriteCount);
	REQUIRE(PS.z && !PS.n, "INC I/O gave Z%u N%u, expected Z1 N0", PS.z != 0, PS.n != 0);

	_6502_Close(pContext);
	return 1;
}

static int TestCycleTableEntries(void)
{
	static const u8 aNopAbsX[] = {0x1c, 0x3c, 0x5c, 0x7c, 0xdc, 0xfc};
	static const u8 aShy[] = {0x9c, 0x00, 0x30};
	static const u8 aNopAbs[] = {0x0c, 0xff, 0x30};
	_6502_Context_t *pContext = OpenCpu();
	u32 i;

	REQUIRE(pContext != NULL, "cpu open failed");

	ExecuteOne(pContext, aShy, sizeof(aShy), 0, 1, 0, 0);
	REQUIRE(pContext->llCycleCounter == 5, "SHY abs,X took %llu cycles, expected 5", (unsigned long long)pContext->llCycleCounter);

	ExecuteOne(pContext, aNopAbs, sizeof(aNopAbs), 0, 1, 0, 0);
	REQUIRE(pContext->llCycleCounter == 4, "NOP abs took %llu cycles, expected 4", (unsigned long long)pContext->llCycleCounter);

	for(i = 0; i < sizeof(aNopAbsX); i++)
	{
		u8 aSamePage[] = {aNopAbsX[i], 0x10, 0x30};
		u8 aPageCross[] = {aNopAbsX[i], 0xff, 0x30};

		ExecuteOne(pContext, aSamePage, sizeof(aSamePage), 0, 1, 0, 0);
		REQUIRE(pContext->llCycleCounter == 4, "NOP abs,X $%02X took %llu cycles, expected 4",
				aNopAbsX[i], (unsigned long long)pContext->llCycleCounter);
		ExecuteOne(pContext, aPageCross, sizeof(aPageCross), 0, 1, 0, 0);
		REQUIRE(pContext->llCycleCounter == 5, "NOP abs,X $%02X across a page took %llu cycles, expected 5",
				aNopAbsX[i], (unsigned long long)pContext->llCycleCounter);
	}

	_6502_Close(pContext);
	return 1;
}

static int TestHighByteAndStores(void)
{
	static const u8 aShaAbsY[] = {0x9f, 0x00, 0x30};      /* SHA $3000,Y */
	static const u8 aShaAbsYCross[] = {0x9f, 0xf0, 0x30}; /* SHA $30F0,Y */
	static const u8 aShaIndY[] = {0x93, 0x80};            /* SHA ($80),Y */
	static const u8 aTas[] = {0x9b, 0xf0, 0x30};          /* TAS $30F0,Y */
	static const u8 aShxIo[] = {0x9e, 0xf0, 0xe0};        /* SHX $E0F0,Y */
	static const u8 aShyRom[] = {0x9c, 0xf0, 0xe0};       /* SHY $E0F0,X */
	_6502_Context_t *pContext = OpenCpu();

	REQUIRE(pContext != NULL, "cpu open failed");

	/* AHRM 3.5: value AND (base high + 1); a page cross also moves the store
	   to that ANDed high byte. */
	ExecuteOne(pContext, aShaAbsY, sizeof(aShaAbsY), 0xff, 0xff, 0x05, 0);
	REQUIRE(pContext->pMemory[0x3005] == 0x31, "SHA abs,Y stored $%02X, expected $31", pContext->pMemory[0x3005]);

	ExecuteOne(pContext, aShaAbsYCross, sizeof(aShaAbsYCross), 0x0f, 0xff, 0x20, 0);
	REQUIRE(pContext->pMemory[0x0110] == 0x01 && pContext->pMemory[0x3110] == 0x00,
			"SHA abs,Y page cross stored $%02X at $0110 / $%02X at $3110",
			pContext->pMemory[0x0110], pContext->pMemory[0x3110]);

	pContext->pMemory[0x0110] = 0x00;
	pContext->pMemory[0x80] = 0xf0;
	pContext->pMemory[0x81] = 0x30;
	ExecuteOne(pContext, aShaIndY, sizeof(aShaIndY), 0x0f, 0x0f, 0x20, 0);
	REQUIRE(pContext->pMemory[0x0110] == 0x01, "SHA (zp),Y stored $%02X at $0110, expected $01 (pointer high + 1)",
			pContext->pMemory[0x0110]);

	pContext->pMemory[0x0110] = 0x00;
	ExecuteOne(pContext, aTas, sizeof(aTas), 0x0f, 0xff, 0x20, 0);
	REQUIRE(CPU.sp == 0x0f, "TAS set S=$%02X, expected $0F", CPU.sp);
	REQUIRE(pContext->pMemory[0x0110] == 0x01, "TAS stored $%02X at $0110, expected $01", pContext->pMemory[0x0110]);

	/* The glitched store is dispatched on its final address: $E110 (RAM)
	   becomes $C110, an I/O register here, and then a ROM byte. */
	_6502_SetIo(pContext, 0xc110, TestIoAccess);
	m_cIoWriteCount = 0;
	ExecuteOne(pContext, aShxIo, sizeof(aShxIo), 0, 0xc1, 0x20, 0);
	REQUIRE(m_cIoWriteCount == 1 && m_cIoLastWrite == 0xc1 && m_sIoLastAddress == 0xc110,
			"SHX glitched store reached I/O %u times ($%02X at $%04X)", m_cIoWriteCount, m_cIoLastWrite, m_sIoLastAddress);
	REQUIRE(pContext->pMemory[0xe110] == 0x00, "SHX stored at the indexed address");

	_6502_SetRom(pContext, 0xc110, 0xc110);
	pContext->pMemory[0xc110] = 0x55;
	ExecuteOne(pContext, aShyRom, sizeof(aShyRom), 0, 0x20, 0xc1, 0);
	REQUIRE(pContext->pMemory[0xc110] == 0x55, "SHY glitched store overwrote ROM with $%02X", pContext->pMemory[0xc110]);

	_6502_Close(pContext);
	return 1;
}

static int TestResetKeepsDecimalFlag(void)
{
	_6502_Context_t *pContext = OpenCpu();

	REQUIRE(pContext != NULL, "cpu open failed");

	/* AHRM 3.1: reset sets I but the NMOS 6502 does not clear D. */
	memset(&PS, 0, sizeof(PS));
	PS.d = 1;
	_6502_Reset(pContext);
	REQUIRE(PS.d && PS.i, "reset gave D%u I%u, expected D1 I1", PS.d != 0, PS.i != 0);

	_6502_Close(pContext);
	return 1;
}

static int TestNmiNestsAndIsServicedOncePerEdge(void)
{
	static const u8 aNop[] = {0xea};
	_6502_Context_t *pContext = OpenCpu();

	REQUIRE(pContext != NULL, "cpu open failed");

	pContext->pMemory[0xfffa] = 0x00; /* NMI vector -> $3000 */
	pContext->pMemory[0xfffb] = 0x30;
	pContext->pMemory[0x3000] = 0xea;
	pContext->pMemory[0x3001] = 0xea;
	pContext->pMemory[0x3002] = 0xea;

	ExecuteOne(pContext, aNop, sizeof(aNop), 0, 0, 0, 0);
	_6502_Nmi(pContext);
	_6502_Execute(pContext);
	REQUIRE(CPU.pc == 0x3000 && CPU.sp == 0xfa && !pContext->cNmiPendingFlag, "first NMI not taken (PC=$%04X)", CPU.pc);
	_6502_Execute(pContext);
	REQUIRE(CPU.pc == 0x3001, "NMI handler did not run its first instruction");

	/* AHRM 3.4: a second edge inside the handler (a VBI during a long DLI) is
	   taken at once, without waiting for RTI. */
	_6502_Nmi(pContext);
	_6502_Execute(pContext);
	REQUIRE(CPU.pc == 0x3000 && CPU.sp == 0xf7, "nested NMI not taken (PC=$%04X SP=$%02X)", CPU.pc, CPU.sp);
	REQUIRE(pContext->pMemory[0x01f9] == 0x01 && pContext->pMemory[0x01fa] == 0x30,
			"nested NMI pushed $%02X%02X", pContext->pMemory[0x01fa], pContext->pMemory[0x01f9]);

	/* One edge is one NMI. */
	_6502_Execute(pContext);
	REQUIRE(CPU.pc == 0x3001, "a single NMI edge was serviced twice");

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

	if(!TestReadModifyWriteFlagsUseComputedValue())
	{
		return 1;
	}

	if(!TestCycleTableEntries())
	{
		return 1;
	}

	if(!TestHighByteAndStores())
	{
		return 1;
	}

	if(!TestResetKeepsDecimalFlag())
	{
		return 1;
	}

	if(!TestNmiNestsAndIsServicedOncePerEdge())
	{
		return 1;
	}

	printf("cpu_probe passed\n");
	return 0;
}
