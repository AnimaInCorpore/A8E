/********************************************************************
*
*
*
* Atari I/O
*
* (c) 2004 Sascha Springer
*
*
*
********************************************************************/

#ifndef _ATARIIO_H_
#define _ATARIIO_H_

#include <SDL/SDL.h>

#include "6502.h"

/********************************************************************
*
*
* Definitionen
*
*
********************************************************************/

#define ENABLE_VERBOSE_DEBUGGING

//#define VERBOSE_NMI
//#define VERBOSE_IRQ
//#define VERBOSE_SIO
//#define VERBOSE_ROM_SWITCH
//#define VERBOSE_REGISTER
//#define VERBOSE_DL

//#define DISABLE_COLLISIONS

/*******************************************************************/

#ifndef A8E_BUILD_VERSION
#define A8E_BUILD_VERSION "dev"
#endif

#define APPLICATION_CAPTION "A8E " A8E_BUILD_VERSION " (c) Sascha Springer"

#define PIXELS_PER_LINE 456
#define LINES_PER_SCREEN_PAL 312
#define COLOR_CLOCKS_PER_LINE (PIXELS_PER_LINE / 2)
#define CYCLES_PER_LINE (COLOR_CLOCKS_PER_LINE / 2)

#define ATARI_CPU_HZ_PAL 1773447u

#define CYCLE_NEVER 0xffffffffffffffffLL

#define CONSOL_HACK

#define SERIAL_OUTPUT_DATA_NEEDED_CYCLES 900
#define SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES 1500
#define SERIAL_INPUT_FIRST_DATA_READY_CYCLES 3000
#define SERIAL_INPUT_DATA_READY_CYCLES 900

#define IRQ_TIMER_1 0x01
#define IRQ_TIMER_2 0x02
#define IRQ_TIMER_4 0x04
#define IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE 0x08
#define IRQ_SERIAL_OUTPUT_DATA_NEEDED 0x10
#define IRQ_SERIAL_INPUT_DATA_READY 0x20
#define IRQ_OTHER_KEY_PRESSED 0x40
#define IRQ_BREAK_KEY_PRESSED 0x80

#define MIN(a,b) ((a) < (b) ? (a) : (b))
#define MAX(a,b) ((a) > (b) ? (a) : (b))

typedef struct
{
	u32 lVerticalScrollOffset;
	u32 lCurrentDisplayLine;
	
	SDL_Surface *pSdlAtariSurface;
	u8 *pPriorityData;
} VideoData_t;

typedef struct
{
	u8 *pDestination;
	u8 *pPriorityData;
	u16 sDisplayMemoryAddress;
	u32 lBytesPerLine;
} DrawLineData_t;	

typedef struct
{
	u64 llDrawLineCycle;
	u64 llDisplayListFetchCycle;
	u64 llDliCycle;
	u64 llSerialOutputNeedDataCycle;
	u64 llSerialOutputTransmissionDoneCycle;
	u64 llSerialInputDataReadyCycle;
	u64 llTimer1Cycle;
	u64 llTimer2Cycle;
	u64 llTimer4Cycle;

	void *pPokey;

	u8 cCurrentDisplayListCommand;
	u32 lNextDisplayListLine;
	u16 sDisplayListAddress;
	u16 sDisplayMemoryAddress;
	u8 cValuePortA;
	u8 cValuePortB;

	VideoData_t tVideoData;
	DrawLineData_t tDrawLineData;

	u32 lKeyPressCounter;
	u8 cJoystickArrowMask;

	/* POKEY pot scan state */
	u8 cPotScanActive;
	u64 llPotScanStartCycle;
	u8 aPotValues[8];    /* target values per pot (set by input layer) */
	u8 aPotLatched[8];   /* 1 = latched at target */
	u8 cAllPot;          /* ALLPOT shadow (bits clear when pot latched) */

	u8 *pDisk1;
	u32 lDiskSize;

	u8 *pBasicRom;
	u8 *pOsRom;
	u8 *pSelfTestRom;
	u8 *pFloatingPointRom;
} IoData_t;

void AtariIoOpen(_6502_Context_t *pContext, u32 lMode, char *pDiskFileName);
void AtariIoClose(_6502_Context_t *pContext);

void AtariIoCycleTimedEventUpdate(_6502_Context_t *pContext);
void AtariIoStatus(_6502_Context_t *pContext);

void AtariIoDrawScreen(
	_6502_Context_t *pContext, 
	SDL_Surface *pSdlScreenSurface,
	u32 lScreenWidth,
	u32 lScreenHeight);

void AtariIoKeyboardEvent(_6502_Context_t *pContext, SDL_KeyboardEvent *pKeyboardEvent);

#endif
