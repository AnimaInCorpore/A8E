/********************************************************************
*
*
*
* Atari
*
* (c) 2004 Sascha Springer
*
*
*
********************************************************************/

#ifndef _ATARI_H_
#define _ATARI_H_

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

#define CONSOL_HACK

/*******************************************************************/

#define APPLICATION_CAPTION "A8E 0.2 (c) Sascha Springer"

#define PIXELS_PER_LINE 456
#define LINES_PER_SCREEN_PAL 312
#define COLOR_CLOCKS_PER_LINE (PIXELS_PER_LINE / 2)
#define CYCLES_PER_LINE (COLOR_CLOCKS_PER_LINE / 2)

#define HSYNC_CYCLES (16 / 2)
#define COLOR_BURST_CYCLES (12 / 2)

#define CYCLE_NEVER 0xffffffffffffffffLL

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
	u64 llCycle;
    u64 llEventCycle;

	u64 llDliCycle;
	u64 llSerialOutputNeedDataCycle;
	u64 llSerialOutputTransmissionDoneCycle;
	u64 llSerialInputDataReadyCycle;
	u64 llTimer1Cycle;
	u64 llTimer2Cycle;
	u64 llTimer4Cycle;

	SDL_Surface *pSdlSurface;
	u32 lDisplayLine;
	u16 sDisplayListAddress;
	u16 sDisplayMemoryAddress;

	u8 cValuePortA;
	u8 cValuePortB;

	u32 lKeyPressCounter;

	u8 *pDisk1;
	u32 lDiskSize;
	
	u8 *pBasicRom;
	u8 *pOsRom;
	u8 *pSelfTestRom;
	u8 *pFloatingPointRom;
} AtariData_t;

void AtariOpen(_6502_Context_t *pContext, u32 lMode, char *pDiskFileName);
void AtariClose(_6502_Context_t *pContext);

void AtariExecuteOneFrame(_6502_Context_t *pContext);
void AtariExecuteOneFrameVerbose(_6502_Context_t *pContext);

void AtariTimedEventUpdate(_6502_Context_t *pContext);

//void AtariStatus(_6502_Context_t *pContext);

void AtariDrawScreen(
	_6502_Context_t *pContext, 
	SDL_Surface *pSdlScreenSurface,
	u32 lScreenWidth,
	u32 lScreenHeight);

void AtariKeyboardEvent(_6502_Context_t *pContext, SDL_KeyboardEvent *pKeyboardEvent);

#endif

