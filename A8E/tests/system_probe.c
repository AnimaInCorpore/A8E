#include <stdio.h>
#include <string.h>

#include <SDL2/SDL.h>

#include "6502.h"
#include "Antic.h"
#include "AtariIo.h"
#include "Pia.h"
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

#define PROGRAM_ADDRESS 0x2000

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

/* Run one absolute-mode instruction so the access goes through the CPU's
   normal I/O dispatch. IRQs are masked so a pending IRQ cannot preempt it. */
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

static int TestPortAPowerOnState(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;

	REQUIRE(pContext != NULL, "machine open failed");

	/* AHRM 2.5/14.5: reset clears DDRA, ORA and PACTL, so PORTA starts on
	   the direction register with all bits as inputs. */
	REQUIRE(pContext->pShadowMemory[IO_PORTA] == 0x00,
			"ORA powered on as $%02X instead of $00", pContext->pShadowMemory[IO_PORTA]);
	REQUIRE(CpuRead(pContext, IO_PORTA) == 0x00,
			"DDRA read $%02X instead of $00 at power-on", pContext->tCpu.a);

	CpuWrite(pContext, IO_PACTL, 0x3c);
	REQUIRE(CpuRead(pContext, IO_PORTA) == 0xff,
			"all-input PORTA read $%02X instead of the idle joystick lines $FF", pContext->tCpu.a);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestPortAOutputBitsReadAsAndOfOraAndInput(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;

	REQUIRE(pContext != NULL, "machine open failed");

	/* Caverns of Mars setup (AHRM 2.9): upper four bits as outputs driven low. */
	CpuWrite(pContext, IO_PACTL, 0x38);
	CpuWrite(pContext, IO_PORTA, 0xf0);
	CpuWrite(pContext, IO_PACTL, 0x3c);
	CpuWrite(pContext, IO_PORTA, 0x00);

	REQUIRE(CpuRead(pContext, IO_PORTA) == 0x0f,
			"DDRA=$F0 ORA=$00 read $%02X instead of $0F", pContext->tCpu.a);

	/* Jack 1 up (bit 0 low) still reads through the input bits. */
	pContext->pMemory[IO_PORTA] &= (u8)~0x01;
	REQUIRE(CpuRead(pContext, IO_PORTA) == 0x0e,
			"joystick up with DDRA=$F0 ORA=$00 read $%02X instead of $0E", pContext->tCpu.a);
	pContext->pMemory[IO_PORTA] |= 0x01;

	/* Output bits driven high read back the external line state. */
	CpuWrite(pContext, IO_PORTA, 0x50);
	REQUIRE(CpuRead(pContext, IO_PORTA) == 0x5f,
			"DDRA=$F0 ORA=$50 read $%02X instead of $5F", pContext->tCpu.a);

	pContext->pMemory[IO_PORTA] &= (u8)~0x10; /* external device pulls bit 4 low */
	CpuWrite(pContext, IO_PORTA, 0xf0);
	REQUIRE(CpuRead(pContext, IO_PORTA) == 0xef,
			"output bit pulled low externally read $%02X instead of $EF", pContext->tCpu.a);
	pContext->pMemory[IO_PORTA] |= 0x10;

	/* The direction register itself still reads back as written. */
	CpuWrite(pContext, IO_PACTL, 0x38);
	REQUIRE(CpuRead(pContext, IO_PORTA) == 0xf0,
			"DDRA read $%02X instead of $F0", pContext->tCpu.a);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestRegisterMirrorsShareCanonicalRegisters(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;

	REQUIRE(pContext != NULL, "machine open failed");

	/* Bounty Bob Strikes Back! polls VCOUNT through $D47B (AHRM 4.16). */
	pContext->pMemory[IO_VCOUNT] = 0x42;
	REQUIRE(CpuRead(pContext, 0xd47b) == 0x42,
			"$D47B read $%02X instead of VCOUNT $42", pContext->tCpu.a);

	pContext->pMemory[IO_STIMER_KBCODE] = 0x3f;
	REQUIRE(CpuRead(pContext, 0xd2f9) == 0x3f,
			"$D2F9 read $%02X instead of KBCODE $3F", pContext->tCpu.a);

	REQUIRE(CpuRead(pContext, 0xd0f4) == 0x01,
			"$D0F4 read $%02X instead of the PAL register $01", pContext->tCpu.a);

	CpuWrite(pContext, 0xd4f4, 0x07);
	REQUIRE(pContext->pShadowMemory[IO_HSCROL] == 0x07,
			"a write to $D4F4 left HSCROL at $%02X", pContext->pShadowMemory[IO_HSCROL]);

	/* PIA registers repeat every 4 bytes. */
	CpuWrite(pContext, 0xd3fe, 0x38); /* PACTL: select DDRA */
	CpuWrite(pContext, 0xd3fc, 0xf0); /* DDRA = $F0 */
	REQUIRE(CpuRead(pContext, IO_PORTA) == 0xf0,
			"PIA mirror writes left DDRA at $%02X", pContext->tCpu.a);
	REQUIRE(CpuRead(pContext, 0xd306) == CpuRead(pContext, IO_PACTL),
			"$D306 does not read PACTL like $D302");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestUnassignedAddressesReadPulledUpValues(void)
{
	/* Undecoded pages and unassigned ANTIC/POKEY registers (AHRM 2.3, 4.1, 5.1). */
	static const u16 aPulledUp[] = {
		0xd100, 0xd1ff, 0xd20c, 0xd2fc, 0xd406, 0xd408, 0xd4f6, 0xd500, 0xd5ff, 0xd600, 0xd7ff};
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	u32 i;
	u16 sAddress;

	REQUIRE(pContext != NULL, "machine open failed");

	for(i = 0; i < sizeof(aPulledUp) / sizeof(aPulledUp[0]); i++)
	{
		REQUIRE(CpuRead(pContext, aPulledUp[i]) == 0xff,
				"$%04X read $%02X instead of the pulled-up $FF", aPulledUp[i], pContext->tCpu.a);
	}

	/* Write-only GTIA registers read $0F (AHRM 6.1, Table 13). */
	for(sAddress = 0xd015; sAddress <= 0xd01e; sAddress++)
	{
		REQUIRE(CpuRead(pContext, sAddress) == 0x0f,
				"$%04X read $%02X instead of $0F", sAddress, pContext->tCpu.a);
		REQUIRE(CpuRead(pContext, (u16)(sAddress + 0x20)) == 0x0f,
				"$%04X read $%02X instead of $0F", sAddress + 0x20, pContext->tCpu.a);
	}

	/* NMIST bits 4-0 always read 1 (AHRM 14.6). */
	REQUIRE(CpuRead(pContext, IO_NMIRES_NMIST) == 0x1f,
			"idle NMIST read $%02X instead of $1F", pContext->tCpu.a);
	pContext->pMemory[IO_NMIRES_NMIST] |= NMI_DLI;
	REQUIRE(CpuRead(pContext, IO_NMIRES_NMIST) == 0x9f,
			"NMIST with a DLI read $%02X instead of $9F", pContext->tCpu.a);
	CpuWrite(pContext, IO_NMIRES_NMIST, 0x00);
	REQUIRE(CpuRead(pContext, IO_NMIRES_NMIST) == 0x1f,
			"NMIST after NMIRES read $%02X instead of $1F", pContext->tCpu.a);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static void SendKey(_6502_Context_t *pContext, Uint32 lType, SDL_Keycode tSym, Uint16 sMod, Uint8 cRepeat)
{
	SDL_KeyboardEvent tEvent;

	memset(&tEvent, 0, sizeof(tEvent));
	tEvent.type = lType;
	tEvent.state = lType == SDL_KEYDOWN ? SDL_PRESSED : SDL_RELEASED;
	tEvent.repeat = cRepeat;
	tEvent.keysym.sym = tSym;
	tEvent.keysym.mod = sMod;
	AtariIoKeyboardEvent(pContext, &tEvent);
}

static int TestShiftArrowSendsCursorKeysAndReleases(void)
{
	/* AHRM 5.8 Table 11: Ctrl + - = + * are the Atari cursor keys. */
	static const SDL_Keycode aArrows[] = {SDLK_UP, SDLK_DOWN, SDLK_LEFT, SDLK_RIGHT};
	static const u8 aCursorCodes[] = {0x8e, 0x8f, 0x86, 0x87};
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	u32 i;

	REQUIRE(pContext != NULL, "machine open failed");

	for(i = 0; i < 4; i++)
	{
		SendKey(pContext, SDL_KEYDOWN, aArrows[i], KMOD_LSHIFT, 0);
		REQUIRE(pContext->pMemory[IO_STIMER_KBCODE] == aCursorCodes[i],
				"Shift+arrow %u sent KBCODE $%02X instead of $%02X", i,
				pContext->pMemory[IO_STIMER_KBCODE], aCursorCodes[i]);
		REQUIRE((pContext->pMemory[IO_SKCTL_SKSTAT] & 0x04) == 0,
				"Shift+arrow %u did not report a held key in SKSTAT", i);
		REQUIRE(pContext->pMemory[IO_PORTA] == 0xff,
				"Shift+arrow %u also moved the joystick", i);

		/* Shift may already be up when the arrow is released. */
		SendKey(pContext, SDL_KEYUP, aArrows[i], KMOD_NONE, 0);
		REQUIRE((pContext->pMemory[IO_SKCTL_SKSTAT] & 0x04) != 0,
				"releasing Shift+arrow %u left SKSTAT bit 2 stuck low", i);
	}

	/* A plain arrow is the joystick and must not touch the keyboard. */
	SendKey(pContext, SDL_KEYDOWN, SDLK_UP, KMOD_NONE, 0);
	REQUIRE(pContext->pMemory[IO_PORTA] == 0xfe, "Up did not move joystick 1 up");
	REQUIRE((pContext->pMemory[IO_SKCTL_SKSTAT] & 0x04) != 0, "Up reported a held key");
	SendKey(pContext, SDL_KEYUP, SDLK_UP, KMOD_NONE, 0);
	REQUIRE(pContext->pMemory[IO_PORTA] == 0xff, "releasing Up left the joystick pushed");

	/* A cursor key released while another key is held keeps bit 2 low. */
	SendKey(pContext, SDL_KEYDOWN, SDLK_a, KMOD_NONE, 0);
	SendKey(pContext, SDL_KEYDOWN, SDLK_DOWN, KMOD_LSHIFT, 0);
	SendKey(pContext, SDL_KEYUP, SDLK_DOWN, KMOD_LSHIFT, 0);
	REQUIRE((pContext->pMemory[IO_SKCTL_SKSTAT] & 0x04) == 0,
			"releasing Shift+Down cleared SKSTAT bit 2 while A is still held");
	SendKey(pContext, SDL_KEYUP, SDLK_a, KMOD_NONE, 0);
	REQUIRE((pContext->pMemory[IO_SKCTL_SKSTAT] & 0x04) != 0,
			"releasing the last key left SKSTAT bit 2 low");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestHostKeyRepeatsAreIgnored(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;

	REQUIRE(pContext != NULL, "machine open failed");

	/* POKEY has no auto-repeat; the OS repeats while SKSTAT bit 2 is low (AHRM 5.8). */
	SendKey(pContext, SDL_KEYDOWN, SDLK_a, KMOD_NONE, 0);
	pContext->pMemory[IO_STIMER_KBCODE] = 0x00;
	SendKey(pContext, SDL_KEYDOWN, SDLK_a, KMOD_NONE, 1);
	SendKey(pContext, SDL_KEYDOWN, SDLK_a, KMOD_NONE, 1);
	REQUIRE(pContext->pMemory[IO_STIMER_KBCODE] == 0x00, "a host key repeat latched a new key code");
	SendKey(pContext, SDL_KEYUP, SDLK_a, KMOD_NONE, 0);
	REQUIRE((pContext->pMemory[IO_SKCTL_SKSTAT] & 0x04) != 0,
			"host key repeats left SKSTAT bit 2 stuck low after release");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestSpecialKeysReachAtariKeyCodes(void)
{
	/* SDL2 moved these keys out of the SDL 1.2 keysym range. */
	static const SDL_Keycode aSyms[] = {SDLK_ESCAPE, SDLK_F1, SDLK_F6, SDLK_F7, SDLK_CAPSLOCK};
	static const u8 aCodes[] = {0x1c, 0x11, 0x3c, 0x27, 0x3c}; /* Esc, Help, Caps, Inverse, Caps */
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	u32 i;

	REQUIRE(pContext != NULL, "machine open failed");

	for(i = 0; i < sizeof(aSyms) / sizeof(aSyms[0]); i++)
	{
		pContext->pMemory[IO_STIMER_KBCODE] = 0xff;
		SendKey(pContext, SDL_KEYDOWN, aSyms[i], KMOD_NONE, 0);
		REQUIRE(pContext->pMemory[IO_STIMER_KBCODE] == aCodes[i],
				"special key %u sent KBCODE $%02X instead of $%02X", i,
				pContext->pMemory[IO_STIMER_KBCODE], aCodes[i]);
		SendKey(pContext, SDL_KEYUP, aSyms[i], KMOD_NONE, 0);
		REQUIRE((pContext->pMemory[IO_SKCTL_SKSTAT] & 0x04) != 0,
				"special key %u left SKSTAT bit 2 low after release", i);
	}

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestResetKeyResetsAnticAndPia(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u16 sOsResetVector;

	REQUIRE(pContext != NULL, "machine open failed");

	sOsResetVector = (u16)(pIoData->pFloatingPointRom[0x27fc] | (pIoData->pFloatingPointRom[0x27fd] << 8));

	/* A program banks BASIC and the OS out, leaves data under both, points
	   the RAM reset vector at itself and runs with display DMA and NMIs on. */
	CpuWrite(pContext, IO_PBCTL, 0x3c);
	CpuWrite(pContext, IO_PORTB, 0xff); /* BASIC out */
	CpuWrite(pContext, 0xa000, 0x77);
	CpuWrite(pContext, IO_PORTB, 0xfe); /* OS out as well */
	CpuWrite(pContext, 0xc000, 0x5a);
	CpuWrite(pContext, 0xfffc, 0x80);
	CpuWrite(pContext, 0xfffd, 0x06);
	CpuWrite(pContext, 0x0600, 0xa5);
	CpuWrite(pContext, IO_NMIEN, 0xc0);
	CpuWrite(pContext, IO_DMACTL, 0x22);
	CpuWrite(pContext, IO_PACTL, 0x38);
	CpuWrite(pContext, IO_PORTA, 0xf0); /* DDRA */
	CpuWrite(pContext, IO_PACTL, 0x3c);
	CpuWrite(pContext, IO_PORTA, 0x55); /* ORA */

	SendKey(pContext, SDL_KEYDOWN, SDLK_F5, KMOD_NONE, 0);
	SendKey(pContext, SDL_KEYUP, SDLK_F5, KMOD_NONE, 0);

	/* AHRM 2.4-2.6, 4.1: the PIA reset maps the OS back in, so the CPU takes
	   the OS reset vector instead of the program's RAM vector. */
	REQUIRE(pContext->tCpu.pc == sOsResetVector,
			"Reset started at $%04X instead of the OS reset vector $%04X", pContext->tCpu.pc, sOsResetVector);
	REQUIRE(pContext->pMemory[0xc000] == pIoData->pOsRom[0], "Reset did not map the OS ROM back in");
	REQUIRE(pContext->pShadowMemory[IO_NMIEN] == 0x00, "Reset left NMIEN at $%02X", pContext->pShadowMemory[IO_NMIEN]);
	REQUIRE(pContext->pShadowMemory[IO_DMACTL] == 0x00, "Reset left DMACTL at $%02X", pContext->pShadowMemory[IO_DMACTL]);
	REQUIRE(CpuRead(pContext, IO_PACTL) == 0x00, "PACTL read $%02X after reset", pContext->tCpu.a);
	REQUIRE(CpuRead(pContext, IO_PBCTL) == 0x00, "PBCTL read $%02X after reset", pContext->tCpu.a);
	REQUIRE(CpuRead(pContext, IO_PORTA) == 0x00, "DDRA read $%02X after reset", pContext->tCpu.a);
	REQUIRE(pContext->pShadowMemory[IO_PORTA] == 0x00, "ORA was $%02X after reset", pContext->pShadowMemory[IO_PORTA]);

	/* RAM survives a warm reset, including the RAM under the ROMs. */
	REQUIRE(pContext->pMemory[0x0600] == 0xa5, "Reset cleared main RAM");
	REQUIRE(pContext->pMemory[0xa000] == 0x77, "BASIC was mapped back in by reset");
	CpuWrite(pContext, IO_PBCTL, 0x3c);
	CpuWrite(pContext, IO_PORTB, 0xfe);
	REQUIRE(pContext->pMemory[0xc000] == 0x5a, "RAM under the OS ROM was lost across reset");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestTrig3ReportsNoCartridge(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;

	REQUIRE(pContext != NULL, "machine open failed");

	/* AHRM 2.8: TRIG3 is the cartridge sense line; the internal BASIC does not set it. */
	REQUIRE(CpuRead(pContext, 0xd013) == 0x00, "TRIG3 read $%02X on a cartridge-less 800XL", pContext->tCpu.a);
	REQUIRE(CpuRead(pContext, 0xd033) == 0x00, "TRIG3 mirror read $%02X", pContext->tCpu.a);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestPokeyIrqLatchesOnlyEnabledSources(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;

	REQUIRE(pContext != NULL, "machine open failed");

	/* AHRM 14.4: IRQST is active low; bit 3 reads 0 while serial output is idle. */
	REQUIRE(CpuRead(pContext, IO_IRQEN_IRQST) == 0xf7, "idle IRQST read $%02X instead of $F7", pContext->tCpu.a);
	REQUIRE(pContext->cIrqPendingFlag == 0, "IRQ line asserted at power-on");

	/* AHRM 5.7: events of a disabled source are lost. A timer that fires with
	   only the keyboard IRQ enabled must not show up in IRQST, or the OS
	   dispatcher sends the next key press to the timer vector. */
	CpuWrite(pContext, IO_IRQEN_IRQST, IRQ_OTHER_KEY_PRESSED);
	Pokey_RaiseIrq(pContext, IRQ_TIMER_1);
	REQUIRE(CpuRead(pContext, IO_IRQEN_IRQST) == 0xf7, "disabled timer 1 latched IRQST $%02X", pContext->tCpu.a);
	REQUIRE(pContext->cIrqPendingFlag == 0, "disabled timer 1 asserted the IRQ line");

	SendKey(pContext, SDL_KEYDOWN, SDLK_a, KMOD_NONE, 0);
	SendKey(pContext, SDL_KEYUP, SDLK_a, KMOD_NONE, 0);
	REQUIRE(CpuRead(pContext, IO_IRQEN_IRQST) == 0xb7, "key press left IRQST at $%02X instead of $B7", pContext->tCpu.a);
	REQUIRE(pContext->cIrqPendingFlag == 1, "enabled keyboard IRQ did not assert the IRQ line");

	/* Clearing the IRQEN bit resets the status bit and releases the line. */
	CpuWrite(pContext, IO_IRQEN_IRQST, 0x00);
	REQUIRE(CpuRead(pContext, IO_IRQEN_IRQST) == 0xf7, "IRQEN=0 left IRQST at $%02X", pContext->tCpu.a);
	REQUIRE(pContext->cIrqPendingFlag == 0, "IRQEN=0 left the IRQ line asserted");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestIrqLineIsALevelNotACount(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u16 sIrqVector;

	REQUIRE(pContext != NULL, "machine open failed");

	sIrqVector = (u16)(pIoData->pFloatingPointRom[0x27fe] | (pIoData->pFloatingPointRom[0x27ff] << 8));

	/* Three key presses while I is set, acknowledged once: no stale IRQs follow. */
	CpuWrite(pContext, IO_IRQEN_IRQST, IRQ_OTHER_KEY_PRESSED);
	pContext->tCpu.ps.i = 1;
	SendKey(pContext, SDL_KEYDOWN, SDLK_a, KMOD_NONE, 0);
	SendKey(pContext, SDL_KEYUP, SDLK_a, KMOD_NONE, 0);
	SendKey(pContext, SDL_KEYDOWN, SDLK_b, KMOD_NONE, 0);
	SendKey(pContext, SDL_KEYUP, SDLK_b, KMOD_NONE, 0);
	SendKey(pContext, SDL_KEYDOWN, SDLK_c, KMOD_NONE, 0);
	SendKey(pContext, SDL_KEYUP, SDLK_c, KMOD_NONE, 0);
	CpuWrite(pContext, IO_IRQEN_IRQST, 0x00);
	CpuWrite(pContext, IO_IRQEN_IRQST, IRQ_OTHER_KEY_PRESSED);
	pContext->tCpu.ps.i = 0;
	pContext->pMemory[PROGRAM_ADDRESS] = 0xea; /* NOP */
	pContext->tCpu.pc = PROGRAM_ADDRESS;
	_6502_Execute(pContext);
	REQUIRE(pContext->tCpu.pc == PROGRAM_ADDRESS + 1, "a stale IRQ fired after the source was acknowledged");

	/* A pending source keeps the line asserted: the CPU enters the handler,
	   and the I flag (not the line) keeps it from re-entering. */
	SendKey(pContext, SDL_KEYDOWN, SDLK_a, KMOD_NONE, 0);
	SendKey(pContext, SDL_KEYUP, SDLK_a, KMOD_NONE, 0);
	pContext->tCpu.pc = PROGRAM_ADDRESS;
	_6502_Execute(pContext);
	REQUIRE(pContext->tCpu.pc == sIrqVector, "pending keyboard IRQ was not taken (PC=$%04X)", pContext->tCpu.pc);
	REQUIRE(pContext->cIrqPendingFlag == 1, "taking the IRQ consumed the IRQ line level");
	REQUIRE(pContext->tCpu.ps.i != 0, "IRQ entry did not set I");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestSerialOutputCompleteIsUnlatched(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;

	REQUIRE(pContext != NULL, "machine open failed");

	/* AHRM 14.4: enabling IRQEN bit 3 while serial output is idle fires at once. */
	CpuWrite(pContext, IO_IRQEN_IRQST, IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE);
	REQUIRE(pContext->cIrqPendingFlag == 1, "IRQEN bit 3 with idle serial output did not assert the IRQ line");

	/* A byte shifting out makes bit 3 read 1 and releases the line. */
	CpuWrite(pContext, IO_SEROUT_SERIN, 0x00);
	REQUIRE(CpuRead(pContext, IO_IRQEN_IRQST) == 0xff, "busy serial output read IRQST $%02X", pContext->tCpu.a);
	REQUIRE(pContext->cIrqPendingFlag == 0, "busy serial output kept the IRQ line asserted");

	/* Bit 3 is not latched: IRQEN writes do not change it. */
	Pokey_SetSerialOutputIdle(pContext, 1);
	REQUIRE(pContext->cIrqPendingFlag == 1, "transmission complete did not assert the IRQ line");
	CpuWrite(pContext, IO_IRQEN_IRQST, 0x00);
	REQUIRE(CpuRead(pContext, IO_IRQEN_IRQST) == 0xf7, "IRQEN=0 changed the unlatched bit 3 (IRQST $%02X)", pContext->tCpu.a);
	REQUIRE(pContext->cIrqPendingFlag == 0, "IRQEN=0 left the IRQ line asserted");

	ProbeMachine_Close(&tMachine);
	return 1;
}

int main(int argc, char *argv[])
{
	int lPassed = 1;

	(void)argc;
	(void)argv;

	SDL_setenv("SDL_AUDIODRIVER", "dummy", 1);

	_6502_Init();

	lPassed &= TestPortAPowerOnState();
	lPassed &= TestPortAOutputBitsReadAsAndOfOraAndInput();
	lPassed &= TestRegisterMirrorsShareCanonicalRegisters();
	lPassed &= TestUnassignedAddressesReadPulledUpValues();
	lPassed &= TestShiftArrowSendsCursorKeysAndReleases();
	lPassed &= TestHostKeyRepeatsAreIgnored();
	lPassed &= TestSpecialKeysReachAtariKeyCodes();
	lPassed &= TestResetKeyResetsAnticAndPia();
	lPassed &= TestTrig3ReportsNoCartridge();
	lPassed &= TestPokeyIrqLatchesOnlyEnabledSources();
	lPassed &= TestIrqLineIsALevelNotACount();
	lPassed &= TestSerialOutputCompleteIsUnlatched();

	SDL_Quit();

	if(!lPassed)
	{
		return 1;
	}

	printf("system_probe passed\n");
	return 0;
}
