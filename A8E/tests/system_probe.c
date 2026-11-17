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

static int TestTriggerLatchFollowsGractlBit2(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;

	REQUIRE(pContext != NULL, "machine open failed");

	/* AHRM 6.11: without the latch TRIG0 follows the button. */
	SendKey(pContext, SDL_KEYDOWN, SDLK_LALT, KMOD_NONE, 0);
	REQUIRE(CpuRead(pContext, 0xd010) == 0x00, "pressed TRIG0 read $%02X", pContext->tCpu.a);
	SendKey(pContext, SDL_KEYUP, SDLK_LALT, KMOD_NONE, 0);
	REQUIRE(CpuRead(pContext, 0xd010) == 0x01, "released TRIG0 read $%02X", pContext->tCpu.a);

	/* GRACTL bit 2 latches a press until the bit is cleared again. */
	CpuWrite(pContext, 0xd01d, 0x04);
	SendKey(pContext, SDL_KEYDOWN, SDLK_LALT, KMOD_NONE, 0);
	SendKey(pContext, SDL_KEYUP, SDLK_LALT, KMOD_NONE, 0);
	REQUIRE(CpuRead(pContext, 0xd010) == 0x00, "latched TRIG0 read $%02X after release", pContext->tCpu.a);
	REQUIRE(CpuRead(pContext, 0xd011) == 0x01, "TRIG1 read $%02X without a press", pContext->tCpu.a);
	REQUIRE(CpuRead(pContext, 0xd013) == 0x00, "TRIG3 read $%02X with the latch on", pContext->tCpu.a);

	CpuWrite(pContext, 0xd01d, 0x00);
	REQUIRE(CpuRead(pContext, 0xd010) == 0x01, "TRIG0 read $%02X after releasing the latch", pContext->tCpu.a);

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

static int TestVbiNmiIsTakenInsideAnUnfinishedNmiHandler(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	u8 *pMemory;
	int lFrame;

	REQUIRE(pContext != NULL, "machine open failed");
	pMemory = pContext->pMemory;

	/* OS out so the NMI vector lives in RAM; VBI only, no display DMA. */
	CpuWrite(pContext, IO_PBCTL, 0x3c);
	CpuWrite(pContext, IO_PORTB, 0xfe);
	CpuWrite(pContext, 0xfffa, 0x00);
	CpuWrite(pContext, 0xfffb, 0x30);
	CpuWrite(pContext, IO_DMACTL, 0x00);
	CpuWrite(pContext, IO_NMIEN, 0x40);

	/* The NMI handler counts its entries and never returns (no RTI). */
	pMemory[0x80] = 0;
	pMemory[0x3000] = 0xe6; /* INC $80 */
	pMemory[0x3001] = 0x80;
	pMemory[0x3002] = 0x4c; /* JMP $3002 */
	pMemory[0x3003] = 0x02;
	pMemory[0x3004] = 0x30;
	pMemory[0x2100] = 0x4c; /* JMP $2100 */
	pMemory[0x2101] = 0x00;
	pMemory[0x2102] = 0x21;
	pContext->tCpu.pc = 0x2100;

	for(lFrame = 0; lFrame < 5; lFrame++)
	{
		_6502_Run(pContext, pContext->llCycleCounter + 114 * 312);
	}

	/* AHRM 3.4: the NMI is an edge-triggered one-time event independent of I,
	   so every VBI enters the handler again, even though the previous one
	   never executed RTI; one VBI is exactly one NMI. */
	REQUIRE(pMemory[0x80] >= 4 && pMemory[0x80] <= 5,
			"VBI NMI entered the handler %u times in 5 frames", pMemory[0x80]);

	ProbeMachine_Close(&tMachine);
	return 1;
}

#define IDLE_ADDRESS 0x2100

/* Let the machine run on an idle loop with IRQs masked, so timed POKEY
   events fire. */
static void RunCycles(_6502_Context_t *pContext, u32 lCycles)
{
	pContext->pMemory[IDLE_ADDRESS] = 0x4c; /* JMP IDLE_ADDRESS */
	pContext->pMemory[IDLE_ADDRESS + 1] = (u8)(IDLE_ADDRESS & 0xff);
	pContext->pMemory[IDLE_ADDRESS + 2] = (u8)(IDLE_ADDRESS >> 8);
	pContext->tCpu.pc = IDLE_ADDRESS;
	pContext->tCpu.ps.i = 1;
	pContext->llStallCycleCounter = 0;
	_6502_Run(pContext, pContext->llCycleCounter + lCycles);
}

/* Is there a cycle count after init mode at which the 17-bit counter reads
   c17 and the 9-bit counter reads c9? Steps as in Pokey.c. */
static int RandomMatchesCounters(u8 c17, u8 c9)
{
	u32 l17 = 0x1ffff;
	u32 l9 = 0x1ff;
	int k;

	for(k = 0; k < 2000; k++)
	{
		u32 in8 = ((l17 >> 8) ^ (l17 >> 13)) & 1u;

		if((u8)l17 == c17 && (u8)(l9 >> 1) == c9)
		{
			return 1;
		}
		l17 = ((((l17 >> 1) & 0xff7fu) | (in8 << 7)) & 0xffffu) | ((l17 & 1u) << 16);
		l9 = (l9 >> 1) | (((l9 ^ (l9 >> 5)) & 1u) << 8);
	}

	return 0;
}

static u8 RandomAfterInit(_6502_Context_t *pContext, u8 cAudctl)
{
	CpuWrite(pContext, IO_SKCTL_SKSTAT, 0x00);
	CpuWrite(pContext, IO_AUDCTL_ALLPOT, cAudctl);
	RunCycles(pContext, 40);
	CpuWrite(pContext, IO_SKCTL_SKSTAT, 0x03);
	RunCycles(pContext, 1000);
	return CpuRead(pContext, IO_SKREST_RANDOM);
}

/* RANDOM shifts right one bit per machine cycle (AHRM 5.5, 14.4), so two
   reads four cycles apart (back-to-back LDA abs) share four bits. */
static int CheckRandom(const char *pAudioDriver)
{
	ProbeMachine_t tMachine;
	_6502_Context_t *pContext;
	u8 cFirst;
	u8 cSecond;
	int i;

	SDL_setenv("SDL_AUDIODRIVER", pAudioDriver, 1);
	tMachine = ProbeMachine_Open();
	pContext = tMachine.pContext;
	REQUIRE(pContext != NULL, "machine open failed");

	CpuWrite(pContext, IO_SKCTL_SKSTAT, 0x00);
	RunCycles(pContext, 40);
	REQUIRE(CpuRead(pContext, IO_SKREST_RANDOM) == 0xff, "%s: RANDOM read $%02X in init mode", pAudioDriver, pContext->tCpu.a);

	CpuWrite(pContext, IO_SKCTL_SKSTAT, 0x03);
	for(i = 0; i < 2; i++)
	{
		/* 17-bit, then 9-bit counter (AUDCTL bit 7). */
		CpuWrite(pContext, IO_AUDCTL_ALLPOT, i ? 0x80 : 0x00);
		RunCycles(pContext, 1000);
		cFirst = CpuRead(pContext, IO_SKREST_RANDOM);
		cSecond = CpuRead(pContext, IO_SKREST_RANDOM);
		REQUIRE(cFirst != cSecond || cFirst != 0xff, "%s: RANDOM stuck at $FF (AUDCTL $%02X)", pAudioDriver, i ? 0x80 : 0x00);
		REQUIRE((cSecond & 0x0f) == (cFirst >> 4), "%s: RANDOM $%02X then $%02X four cycles later did not shift right (AUDCTL $%02X)",
				pAudioDriver, cFirst, cSecond, i ? 0x80 : 0x00);
	}

	/* Leaving init mode, the counter shifts zeros in from the reset state
	   at once: STA SKCTL + LDA RANDOM reads $FF shifted right a few times
	   (AHRM 5.5 gives $1F in 9-bit mode). */
	CpuWrite(pContext, IO_SKCTL_SKSTAT, 0x00);
	RunCycles(pContext, 40);
	CpuWrite(pContext, IO_SKCTL_SKSTAT, 0x03);
	cFirst = CpuRead(pContext, IO_SKREST_RANDOM);
	REQUIRE(cFirst == 0x7f || cFirst == 0x3f || cFirst == 0x1f || cFirst == 0x0f,
			"%s: 9-bit RANDOM right after init mode read $%02X", pAudioDriver, cFirst);

	/* The same delay after init mode reads the 17-bit counter, or the 9-bit
	   one with AUDCTL bit 7 set (AHRM 14.4). */
	cFirst = RandomAfterInit(pContext, 0x00);
	cSecond = RandomAfterInit(pContext, 0x80);
	REQUIRE(cFirst != cSecond, "%s: 9-bit mode read the 17-bit counter ($%02X)", pAudioDriver, cFirst);
	REQUIRE(RandomMatchesCounters(cFirst, cSecond), "%s: RANDOM read $%02X (17-bit) and $%02X (9-bit)", pAudioDriver, cFirst, cSecond);

	ProbeMachine_Close(&tMachine);
	SDL_setenv("SDL_AUDIODRIVER", "dummy", 1);
	return 1;
}

static int TestRandomRunsWithAndWithoutAudio(void)
{
	return CheckRandom("dummy") && CheckRandom("a8e-no-audio");
}

static int TestTimerPeriodsUseAudfZeroAsDivisorOne(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;

	REQUIRE(pContext != NULL, "machine open failed");

	/* AHRM 5.3: AUDF = $00 is a divisor of 1. */
	CpuWrite(pContext, IO_SKCTL_SKSTAT, 0x03);
	CpuWrite(pContext, IO_AUDF1_POT0, 0x00);
	CpuWrite(pContext, IO_AUDF2_POT2, 0x00);
	CpuWrite(pContext, IO_AUDF3_POT4, 0x28);
	CpuWrite(pContext, IO_AUDF4_POT6, 0x00);
	CpuWrite(pContext, IO_AUDCTL_ALLPOT, 0x00);
	REQUIRE(Pokey_TimerPeriodCpuCycles(pContext, 1) == 28, "64 kHz AUDF1=0 period %llu", (unsigned long long)Pokey_TimerPeriodCpuCycles(pContext, 1));
	REQUIRE(Pokey_TimerPeriodCpuCycles(pContext, 4) == 28, "64 kHz AUDF4=0 period %llu", (unsigned long long)Pokey_TimerPeriodCpuCycles(pContext, 4));
	CpuWrite(pContext, IO_AUDCTL_ALLPOT, 0x01);
	REQUIRE(Pokey_TimerPeriodCpuCycles(pContext, 2) == 114, "15 kHz AUDF2=0 period %llu", (unsigned long long)Pokey_TimerPeriodCpuCycles(pContext, 2));
	CpuWrite(pContext, IO_AUDCTL_ALLPOT, 0x40);
	REQUIRE(Pokey_TimerPeriodCpuCycles(pContext, 1) == 4, "1.79 MHz AUDF1=0 period %llu", (unsigned long long)Pokey_TimerPeriodCpuCycles(pContext, 1));
	/* Linked 3+4 at 1.79 MHz, the SIO 19200 baud setting: N + 7. */
	CpuWrite(pContext, IO_AUDCTL_ALLPOT, 0x28);
	REQUIRE(Pokey_TimerPeriodCpuCycles(pContext, 4) == 0x28 + 7, "linked $0028 period %llu", (unsigned long long)Pokey_TimerPeriodCpuCycles(pContext, 4));

	CpuWrite(pContext, IO_AUDCTL_ALLPOT, 0x00);
	CpuWrite(pContext, IO_STIMER_KBCODE, 0x00);
	REQUIRE(tMachine.pIoData->llTimer1Cycle != CYCLE_NEVER, "STIMER with AUDF1=0 did not start timer 1");

	/* AHRM 5.2: init mode stops only the 15/64 kHz clocks. */
	CpuWrite(pContext, IO_AUDCTL_ALLPOT, 0x40);
	CpuWrite(pContext, IO_SKCTL_SKSTAT, 0x00);
	REQUIRE(Pokey_TimerPeriodCpuCycles(pContext, 1) == 4, "init mode stopped the 1.79 MHz timer 1");
	REQUIRE(Pokey_TimerPeriodCpuCycles(pContext, 2) == 0, "init mode left the 64 kHz timer 2 running");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static u8 SioChecksum(const u8 *pData, u32 lSize)
{
	u32 lSum = 0;

	while(lSize--)
	{
		lSum += *pData++;
		lSum = (lSum & 0xff) + (lSum >> 8);
	}

	return (u8)lSum;
}

/* Mount a blank single density image (720 sectors of 128 bytes) as D1:. */
static void MountBlankDisk(IoData_t *pIoData)
{
	memset(pIoData->pDisk1, 0, 16 + 720 * 128);
	pIoData->pDisk1[0] = 0x96;
	pIoData->pDisk1[1] = 0x02;
	pIoData->pDisk1[2] = (u8)((720 * 128 / 16) & 0xff);
	pIoData->pDisk1[3] = (u8)((720 * 128 / 16) >> 8);
	pIoData->pDisk1[4] = 128;
	pIoData->lDiskSize = 16 + 720 * 128;
}

/* Wait for the serial input IRQ; returns 0 on timeout. */
static int WaitSerialInput(_6502_Context_t *pContext)
{
	int i;

	for(i = 0; i < 100; i++)
	{
		if(!(CpuRead(pContext, IO_IRQEN_IRQST) & IRQ_SERIAL_INPUT_DATA_READY))
		{
			return 1;
		}
		RunCycles(pContext, 100);
	}

	return 0;
}

/* Send a command frame at 19200 baud the way the OS does, then collect up to
   lMax response bytes, acknowledging each serial input IRQ. */
static u32 SioCommand(_6502_Context_t *pContext, u8 cDevice, u8 cCommand, u8 cChecksumError,
					  u8 *pResponse, u32 lMax)
{
	u8 aFrame[5];
	u32 lCount;
	int i;

	aFrame[0] = cDevice;
	aFrame[1] = cCommand;
	aFrame[2] = 0x01;
	aFrame[3] = 0x00;
	aFrame[4] = (u8)(SioChecksum(aFrame, 4) ^ cChecksumError);

	CpuWrite(pContext, IO_SKCTL_SKSTAT, 0x00); /* reset the serial port */
	CpuWrite(pContext, IO_AUDF3_POT4, 0x28);
	CpuWrite(pContext, IO_AUDF4_POT6, 0x00);
	CpuWrite(pContext, IO_AUDCTL_ALLPOT, 0x28);
	CpuWrite(pContext, IO_SKCTL_SKSTAT, 0x23);
	CpuWrite(pContext, IO_IRQEN_IRQST, 0x00);
	for(i = 0; i < 5; i++)
	{
		CpuWrite(pContext, IO_SEROUT_SERIN, aFrame[i]);
		RunCycles(pContext, 1000);
	}
	CpuWrite(pContext, IO_SKCTL_SKSTAT, 0x13);
	CpuWrite(pContext, IO_IRQEN_IRQST, IRQ_SERIAL_INPUT_DATA_READY);

	for(lCount = 0; lCount < lMax && WaitSerialInput(pContext); lCount++)
	{
		pResponse[lCount] = CpuRead(pContext, IO_SEROUT_SERIN);
		CpuWrite(pContext, IO_IRQEN_IRQST, 0x00);
		CpuWrite(pContext, IO_IRQEN_IRQST, IRQ_SERIAL_INPUT_DATA_READY);
	}

	return lCount;
}

static int TestSioDriveAnswersOnlyValidD1Frames(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	u8 aResponse[140];
	u32 lCount;
	u32 i;

	REQUIRE(pContext != NULL, "machine open failed");
	MountBlankDisk(tMachine.pIoData);

	/* AHRM 10.2, Table 44: ACK, Complete, drive status, inverted FDC status
	   ($FF), format timeout, unused byte, checksum. */
	lCount = SioCommand(pContext, 0x31, 0x53, 0, aResponse, sizeof(aResponse));
	REQUIRE(lCount == 7, "status returned %lu bytes instead of 7", (unsigned long)lCount);
	REQUIRE(aResponse[0] == 'A' && aResponse[1] == 'C', "status answered $%02X $%02X", aResponse[0], aResponse[1]);
	REQUIRE(aResponse[2] == 0x10 && aResponse[3] == 0xff && aResponse[4] == 0xe0 && aResponse[5] == 0x00,
			"status frame $%02X $%02X $%02X $%02X instead of $10 $FF $E0 $00", aResponse[2], aResponse[3], aResponse[4], aResponse[5]);
	REQUIRE(aResponse[6] == SioChecksum(&aResponse[2], 4), "status checksum $%02X", aResponse[6]);

	/* AHRM 9.1: no NAK for other device IDs or a bad checksum; the OS times out. */
	REQUIRE(SioCommand(pContext, 0x32, 0x53, 0, aResponse, sizeof(aResponse)) == 0, "D2: answered without a drive");
	REQUIRE(SioCommand(pContext, 0x40, 0x53, 0, aResponse, sizeof(aResponse)) == 0, "the printer ID was answered by the disk drive");
	REQUIRE(SioCommand(pContext, 0x31, 0x53, 0x01, aResponse, sizeof(aResponse)) == 0, "a bad command frame checksum was answered");

	/* An unsupported command to the drive is NAKed. */
	lCount = SioCommand(pContext, 0x31, 0x58, 0, aResponse, sizeof(aResponse));
	REQUIRE(lCount == 1 && aResponse[0] == 'N', "unsupported command returned %lu bytes ($%02X)", (unsigned long)lCount, aResponse[0]);

	/* AHRM 10.2: format returns a sector-sized bad sector list ended by $FFFF. */
	lCount = SioCommand(pContext, 0x31, 0x21, 0, aResponse, sizeof(aResponse));
	REQUIRE(lCount == 131, "format returned %lu bytes instead of 131", (unsigned long)lCount);
	REQUIRE(aResponse[0] == 'A' && aResponse[1] == 'C', "format answered $%02X $%02X", aResponse[0], aResponse[1]);
	for(i = 2; i < 130; i++)
	{
		REQUIRE(aResponse[i] == 0xff, "format list byte %lu is $%02X", (unsigned long)(i - 2), aResponse[i]);
	}
	REQUIRE(aResponse[130] == SioChecksum(&aResponse[2], 128), "format list checksum $%02X", aResponse[130]);

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestSerinReadsHaveNoSideEffects(void)
{
	static const u8 aStatus[4] = {0x10, 0xff, 0xe0, 0x00};
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;
	IoData_t *pIoData = tMachine.pIoData;
	u8 aResponse[8];

	REQUIRE(pContext != NULL, "machine open failed");
	MountBlankDisk(pIoData);

	/* AHRM 5.6: SERIN keeps the last byte; reading it changes nothing. */
	REQUIRE(SioCommand(pContext, 0x31, 0x53, 0, aResponse, 1) == 1 && aResponse[0] == 'A', "no ACK for status");
	REQUIRE(CpuRead(pContext, IO_SEROUT_SERIN) == 'A' && CpuRead(pContext, IO_SEROUT_SERIN) == 'A',
			"a second SERIN read returned $%02X instead of the ACK again", pContext->tCpu.a);

	/* The drive keeps sending at its own pace. Bytes that arrive while the
	   serial input IRQ is still pending overrun SERIN: SKSTAT bit 5 drops. */
	REQUIRE(CpuRead(pContext, IO_SKCTL_SKSTAT) & 0x20, "SKSTAT reported an overrun too early");
	RunCycles(pContext, 20000);
	REQUIRE(CpuRead(pContext, IO_SEROUT_SERIN) == SioChecksum(aStatus, 4),
			"SERIN read $%02X instead of the last status byte", pContext->tCpu.a);
	REQUIRE(!(CpuRead(pContext, IO_SKCTL_SKSTAT) & 0x20), "unacknowledged bytes did not set the overrun bit");

	/* SKRES resets SKSTAT bits 5-7 (AHRM 14.4). */
	CpuWrite(pContext, IO_SKREST_RANDOM, 0x00);
	REQUIRE((CpuRead(pContext, IO_SKCTL_SKSTAT) & 0xe0) == 0xe0, "SKRES left SKSTAT at $%02X", pContext->tCpu.a);

	/* Reading SERIN with nothing to receive schedules no phantom bytes. */
	CpuRead(pContext, IO_SEROUT_SERIN);
	REQUIRE(pIoData->llSerialInputDataReadyCycle == CYCLE_NEVER, "an idle SERIN read scheduled a serial input event");

	ProbeMachine_Close(&tMachine);
	return 1;
}

static int TestSerialOutputCompletesForAnyByte(void)
{
	ProbeMachine_t tMachine = ProbeMachine_Open();
	_6502_Context_t *pContext = tMachine.pContext;

	REQUIRE(pContext != NULL, "machine open failed");

	/* 19200 baud: linked timers 3+4 at $0028 give 47-cycle half bits, so a
	   10-bit byte takes 940 cycles (AHRM 5.6). */
	CpuWrite(pContext, IO_SKCTL_SKSTAT, 0x00);
	CpuWrite(pContext, IO_AUDF3_POT4, 0x28);
	CpuWrite(pContext, IO_AUDF4_POT6, 0x00);
	CpuWrite(pContext, IO_AUDCTL_ALLPOT, 0x28);
	CpuWrite(pContext, IO_SKCTL_SKSTAT, 0x23);
	CpuWrite(pContext, IO_IRQEN_IRQST, IRQ_SERIAL_OUTPUT_DATA_NEEDED);

	/* A lone byte that is no SIO frame still completes. */
	CpuWrite(pContext, IO_SEROUT_SERIN, 0x00);
	REQUIRE(CpuRead(pContext, IO_IRQEN_IRQST) & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE, "SEROUT write left the output idle");
	RunCycles(pContext, 200);
	REQUIRE(!(CpuRead(pContext, IO_IRQEN_IRQST) & IRQ_SERIAL_OUTPUT_DATA_NEEDED), "the shift register load did not raise output needed");
	REQUIRE(CpuRead(pContext, IO_IRQEN_IRQST) & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE, "output went idle before the byte was shifted out");

	/* A second byte loads when the first ends, so the output stays busy. */
	CpuWrite(pContext, IO_IRQEN_IRQST, 0x00);
	CpuWrite(pContext, IO_SEROUT_SERIN, 0x55);
	RunCycles(pContext, 1000);
	REQUIRE(CpuRead(pContext, IO_IRQEN_IRQST) & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE, "output went idle between back-to-back bytes");
	RunCycles(pContext, 1000);
	REQUIRE(!(CpuRead(pContext, IO_IRQEN_IRQST) & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE), "output still busy after two bytes");

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
	lPassed &= TestTriggerLatchFollowsGractlBit2();
	lPassed &= TestPokeyIrqLatchesOnlyEnabledSources();
	lPassed &= TestIrqLineIsALevelNotACount();
	lPassed &= TestSerialOutputCompleteIsUnlatched();
	lPassed &= TestVbiNmiIsTakenInsideAnUnfinishedNmiHandler();
	lPassed &= TestRandomRunsWithAndWithoutAudio();
	lPassed &= TestTimerPeriodsUseAudfZeroAsDivisorOne();
	lPassed &= TestSioDriveAnswersOnlyValidD1Frames();
	lPassed &= TestSerinReadsHaveNoSideEffects();
	lPassed &= TestSerialOutputCompletesForAnyByte();

	SDL_Quit();

	if(!lPassed)
	{
		return 1;
	}

	printf("system_probe passed\n");
	return 0;
}
