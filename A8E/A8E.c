/********************************************************************
*
*
*
* Atari 800 XL Emulator
*
* (c) 2004 Sascha Springer
*
* cmake -S . -B build
* cmake --build build -j
*
********************************************************************/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <SDL/SDL.h>

#include "6502.h"
#include "AtariIo.h"
#include "Pokey.h"

/********************************************************************
*
*
* Funktionen
*
*
********************************************************************/

int main(int argc, char *argv[])
{
	_6502_Context_t *pAtariContext;
	SDL_Event tEvent;
	SDL_Surface *pScreenSurface = NULL;
	u8 cTurboFlag = 0;
	u32 lLastTicks = 0;
	u32 lCounter;
	u8 cDisassembleFlag = 0;
	u64 llCycles = CYCLES_PER_LINE * LINES_PER_SCREEN_PAL;
	u32 lMode = 0;
	char *pDiskFileName = "d1.atr";
	u32 lAtariScreenWidth = 0;
	u32 lAtariScreenHeight = 0;
	u32 lWindowWidth = 0;
	u32 lWindowHeight = 0;
	u32 lWindowScale = 2;
	u32 lIndex;
	u32 lSdlFlags = 0;
	
	if(SDL_Init(SDL_INIT_VIDEO | SDL_INIT_TIMER) < 0)
	{
		fprintf(stderr, "SDL_Init() failed: %s\n", SDL_GetError());
		return -1;
	}

	for(lIndex = 1; lIndex < argc; lIndex++)
	{
		if(argv[lIndex][0] == '-')
		{
			switch(argv[lIndex][1])
			{
			case 'b':
			case 'B':
				lMode = 1;
			
				break;
				
			case 'f':
			case 'F':
				lSdlFlags |= SDL_FULLSCREEN;
			
				break;
				
			default:
				break;
			}
		}
		else
		{
			pDiskFileName = argv[lIndex];
		}
	}

	lSdlFlags |= SDL_HWSURFACE | SDL_DOUBLEBUF;

	if(lSdlFlags & SDL_FULLSCREEN)
		lAtariScreenWidth = 320;
	else
		lAtariScreenWidth = 336;

	lAtariScreenHeight = 240;

	lWindowWidth = lAtariScreenWidth * lWindowScale;
	lWindowHeight = lAtariScreenHeight * lWindowScale;

	pScreenSurface = SDL_SetVideoMode(lWindowWidth, lWindowHeight, 32, lSdlFlags);

	if(pScreenSurface == NULL && lWindowScale != 1)
	{
		/* Fallback: if the scaled mode isn't available, try native size. */
		lWindowScale = 1;
		lWindowWidth = lAtariScreenWidth;
		lWindowHeight = lAtariScreenHeight;
		pScreenSurface = SDL_SetVideoMode(lWindowWidth, lWindowHeight, 32, lSdlFlags);
	}
	
	if(pScreenSurface == NULL)
	{
		fprintf(stderr, "SDL_SetVideoMode() failed: %s\n", SDL_GetError());
		SDL_Quit();
		return -1;
	}
	
	SDL_WM_SetCaption(APPLICATION_CAPTION, NULL);

	_6502_Init();
	
	pAtariContext = _6502_Open();
	AtariIoOpen(pAtariContext, lMode, pDiskFileName);
	
	_6502_Reset(pAtariContext);
	
	while(1)
	{
		if(cDisassembleFlag)
		{
			lCounter = CYCLES_PER_LINE * LINES_PER_SCREEN_PAL / 3;

			while(lCounter)
			{
				_6502_Run(pAtariContext, pAtariContext->llCycleCounter + 1);

				_6502_Status(pAtariContext);
				printf(" ");
				_6502_DisassembleLive(pAtariContext, pAtariContext->tCpu.pc);

				lCounter--;
			}
		}
		else
		{
			_6502_Run(pAtariContext, llCycles);
			
			llCycles += CYCLES_PER_LINE * LINES_PER_SCREEN_PAL;
		}

		AtariIoDrawScreen(pAtariContext, pScreenSurface, lAtariScreenWidth, lAtariScreenHeight);

		SDL_Flip(pScreenSurface);

		while(SDL_PollEvent(&tEvent))
        {
            if(tEvent.type == SDL_QUIT)
                goto Exit;
        
    		if(tEvent.type == SDL_KEYDOWN)
            {
    			if(tEvent.key.keysym.sym == SDLK_F11)
    				cTurboFlag = 1;
#ifdef ENABLE_VERBOSE_DEBUGGING
				if(tEvent.key.keysym.sym == SDLK_F12)
					cDisassembleFlag = 1;
#endif
            }

    		if(tEvent.type == SDL_KEYUP)
    		{
    			if(tEvent.key.keysym.sym == SDLK_F11)
    				cTurboFlag = 0;
    		}

			if(tEvent.type == SDL_KEYDOWN || tEvent.type == SDL_KEYUP)
   				AtariIoKeyboardEvent(pAtariContext, &tEvent.key);
		}

		if(!cTurboFlag)
		{
			/* Audio-driven timing: wait while audio buffer is sufficiently full.
			   This keeps emulation in sync with audio playback rate. */
			u32 throttleStart = SDL_GetTicks();
			int didThrottle = 0;

			while(Pokey_ShouldThrottle(pAtariContext))
			{
				/* Audio buffer is filling up - let it drain. */
				SDL_PumpEvents();
				SDL_Delay(1);
				didThrottle = 1;

				/* Safety net: never stall the main loop indefinitely. */
				if((SDL_GetTicks() - throttleStart) > 250)
					break;
			}

			/* Fallback: if audio throttling didn't engage (audio disabled or buffer very empty),
			   use time-based delay to prevent runaway speed. */
			if(!didThrottle)
			{
				u32 elapsed = SDL_GetTicks() - lLastTicks;
				if(elapsed < 18)  /* slightly under 20ms to let buffer build */
					SDL_Delay(18 - elapsed);
			}
		}
		
		lLastTicks = SDL_GetTicks();
	}

Exit:
	AtariIoClose(pAtariContext);
	_6502_Close(pAtariContext);
	SDL_Quit();

	return 0;
}
