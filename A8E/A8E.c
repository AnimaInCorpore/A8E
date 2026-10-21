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
#include <SDL2/SDL.h>

#include "6502.h"
#include "AtariIo.h"
#include "Pokey.h"

/* Global window handle — used by Pokey.c to update the title bar. */
SDL_Window *g_pSdlWindow = NULL;

/* Extended memory configurations (AHRM 2.7, Table 1). */
static const struct
{
	const char *pFlag;
	AtariMemoryExpansion_t eMemoryExpansion;
} m_aMemoryFlags[] =
	{
		{"-128K", ATARI_MEMORY_130XE},
		{"-192R", ATARI_MEMORY_RAMBO_192K},
		{"-320R", ATARI_MEMORY_RAMBO_320K},
		{"-320C", ATARI_MEMORY_COMPY_320K},
		{"-576R", ATARI_MEMORY_RAMBO_576K},
		{"-576C", ATARI_MEMORY_COMPY_576K},
		{"-1088R", ATARI_MEMORY_RAMBO_1088K},
};

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
	SDL_Window *pWindow = NULL;
	SDL_Renderer *pRenderer = NULL;
	SDL_Texture *pScreenTexture = NULL;
	SDL_Surface *pScreenSurface = NULL;
	u8 cTurboFlag = 0;
	u32 lLastTicks = 0;
	u32 lCounter;
	u8 cDisassembleFlag = 0;
	u64 llCyclesPerFrame;
	u64 llCycles;
	u32 lFramePeriodMs;
	u32 lMode = 0;
	AtariVideoStandard_t eVideoStandard = ATARI_VIDEO_PAL;
	AtariMemoryExpansion_t eMemoryExpansion = ATARI_MEMORY_64K;
	u32 lFlag;
	char *pDiskFileName = "d1.atr";
	u32 lAtariScreenWidth = 336;
	u32 lAtariScreenHeight = 240;
	u32 lLogicalWidth;
	u32 lWindowWidth = 0;
	u32 lWindowHeight = 0;
	u32 lWindowScale = 2;
	u32 lFullscreen = 0;
	int lIndex;

	if(SDL_Init(SDL_INIT_VIDEO | SDL_INIT_TIMER) < 0)
	{
		fprintf(stderr, "SDL_Init() failed: %s\n", SDL_GetError());
		return -1;
	}

	for(lIndex = 1; lIndex < argc; lIndex++)
	{
		if(argv[lIndex][0] == '-')
		{
			for(lFlag = 0; lFlag < sizeof(m_aMemoryFlags) / sizeof(m_aMemoryFlags[0]); lFlag++)
			{
				if(SDL_strcasecmp(argv[lIndex], m_aMemoryFlags[lFlag].pFlag) == 0)
				{
					eMemoryExpansion = m_aMemoryFlags[lFlag].eMemoryExpansion;
				}
			}

			switch(argv[lIndex][1])
			{
			case 'b':
			case 'B':
				lMode = 1;

				break;

			case 'f':
			case 'F':
				lFullscreen = 1;

				break;

			case 'n':
			case 'N':
				eVideoStandard = ATARI_VIDEO_NTSC;

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

	/* Hires pixels are 0.857:1 on NTSC and 1.04:1 on PAL (AHRM 4.2), so the
	   336-pixel wide picture is shown 288 or 349 square pixels wide. */
	lLogicalWidth = eVideoStandard == ATARI_VIDEO_NTSC ? 288 : 349;
	lWindowWidth = lLogicalWidth * lWindowScale;
	lWindowHeight = lAtariScreenHeight * lWindowScale;

	/* SDL_WINDOW_FULLSCREEN_DESKTOP scales to desktop resolution without
	   changing the video mode, so the aspect ratio is correct on all
	   monitors and the desktop is never left in a bad resolution if the
	   app crashes. */
	pWindow = SDL_CreateWindow(APPLICATION_CAPTION,
							   SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
							   (int)lWindowWidth, (int)lWindowHeight,
							   lFullscreen ? SDL_WINDOW_FULLSCREEN_DESKTOP : 0);

	if(pWindow == NULL)
	{
		fprintf(stderr, "SDL_CreateWindow() failed: %s\n", SDL_GetError());
		SDL_Quit();
		return -1;
	}

	g_pSdlWindow = pWindow;

	pRenderer = SDL_CreateRenderer(pWindow, -1, SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
	if(pRenderer == NULL)
	{
		pRenderer = SDL_CreateRenderer(pWindow, -1, 0);
	}
	if(pRenderer == NULL)
	{
		fprintf(stderr, "SDL_CreateRenderer() failed: %s\n", SDL_GetError());
		SDL_DestroyWindow(pWindow);
		SDL_Quit();
		return -1;
	}

	/* Logical size lets the renderer scale the Atari output to fill the
	   window (or screen in fullscreen) while preserving the aspect ratio. */
	SDL_RenderSetLogicalSize(pRenderer, (int)lLogicalWidth, (int)lAtariScreenHeight);

	pScreenTexture = SDL_CreateTexture(pRenderer, SDL_PIXELFORMAT_ARGB8888,
									   SDL_TEXTUREACCESS_STREAMING, (int)lAtariScreenWidth, (int)lAtariScreenHeight);
	if(pScreenTexture == NULL)
	{
		fprintf(stderr, "SDL_CreateTexture() failed: %s\n", SDL_GetError());
		SDL_DestroyRenderer(pRenderer);
		SDL_DestroyWindow(pWindow);
		SDL_Quit();
		return -1;
	}

	/* Software surface — AtariIoDrawScreen draws the Atari output here,
	   then we upload it to pScreenTexture each frame. */
	pScreenSurface = SDL_CreateRGBSurface(0,
										  (int)lAtariScreenWidth, (int)lAtariScreenHeight, 32,
										  0x00FF0000, 0x0000FF00, 0x000000FF, 0xFF000000);
	if(pScreenSurface == NULL)
	{
		fprintf(stderr, "SDL_CreateRGBSurface() failed: %s\n", SDL_GetError());
		SDL_DestroyTexture(pScreenTexture);
		SDL_DestroyRenderer(pRenderer);
		SDL_DestroyWindow(pWindow);
		SDL_Quit();
		return -1;
	}

	_6502_Init();

	pAtariContext = _6502_Open();
	AtariIoOpenMachine(pAtariContext, lMode, pDiskFileName, eVideoStandard, eMemoryExpansion);

	/* 114 cycles per scan line, 312 lines on PAL and 262 on NTSC (AHRM 4.2). */
	if(eVideoStandard == ATARI_VIDEO_NTSC)
	{
		llCyclesPerFrame = CYCLES_PER_LINE * LINES_PER_SCREEN_NTSC;
		lFramePeriodMs = (u32)((llCyclesPerFrame * 1000 + ATARI_CPU_HZ_NTSC / 2) / ATARI_CPU_HZ_NTSC);
	}
	else
	{
		llCyclesPerFrame = CYCLES_PER_LINE * LINES_PER_SCREEN_PAL;
		lFramePeriodMs = (u32)((llCyclesPerFrame * 1000 + ATARI_CPU_HZ_PAL / 2) / ATARI_CPU_HZ_PAL);
	}
	llCycles = llCyclesPerFrame;

	_6502_Reset(pAtariContext);

	while(1)
	{
		if(cDisassembleFlag)
		{
			lCounter = (u32)(llCyclesPerFrame / 3);

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

			llCycles += llCyclesPerFrame;
		}

		AtariIoDrawScreen(pAtariContext, pScreenSurface, lAtariScreenWidth, lAtariScreenHeight);

		SDL_UpdateTexture(pScreenTexture, NULL, pScreenSurface->pixels, pScreenSurface->pitch);
		SDL_RenderClear(pRenderer);
		SDL_RenderCopy(pRenderer, pScreenTexture, NULL, NULL);
		SDL_RenderPresent(pRenderer);

		while(SDL_PollEvent(&tEvent))
		{
			if(tEvent.type == SDL_QUIT)
			{
				goto Exit;
			}

			if(tEvent.type == SDL_KEYDOWN)
			{
				if(tEvent.key.keysym.sym == SDLK_F11)
				{
					cTurboFlag = 1;
				}

				/* Alt+Enter toggles fullscreen at runtime. */
				if(tEvent.key.keysym.sym == SDLK_RETURN &&
				   (tEvent.key.keysym.mod & KMOD_ALT) &&
				   tEvent.key.repeat == 0)
				{
					Uint32 flags = SDL_GetWindowFlags(pWindow);
					SDL_SetWindowFullscreen(pWindow,
											(flags & SDL_WINDOW_FULLSCREEN_DESKTOP)
												? 0
												: SDL_WINDOW_FULLSCREEN_DESKTOP);
				}

#ifdef ENABLE_VERBOSE_DEBUGGING
				if(tEvent.key.keysym.sym == SDLK_F12)
				{
					cDisassembleFlag = 1;
				}
#endif
			}

			if(tEvent.type == SDL_KEYUP)
			{
				if(tEvent.key.keysym.sym == SDLK_F11)
				{
					cTurboFlag = 0;
				}
			}

			if(tEvent.type == SDL_KEYDOWN || tEvent.type == SDL_KEYUP)
			{
				AtariIoKeyboardEvent(pAtariContext, &tEvent.key);
			}
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
				{
					break;
				}
			}

			/* Without audio, pace the frames by time. While audio plays, its
			   buffer is the clock and an extra delay would starve it. */
			if(!didThrottle && SDL_GetAudioStatus() != SDL_AUDIO_PLAYING)
			{
				u32 elapsed = SDL_GetTicks() - lLastTicks;
				if(elapsed < lFramePeriodMs)
				{
					SDL_Delay(lFramePeriodMs - elapsed);
				}
			}
		}

		lLastTicks = SDL_GetTicks();
	}

Exit:
	AtariIoClose(pAtariContext);
	_6502_Close(pAtariContext);
	SDL_FreeSurface(pScreenSurface);
	SDL_DestroyTexture(pScreenTexture);
	SDL_DestroyRenderer(pRenderer);
	SDL_DestroyWindow(pWindow);
	SDL_Quit();

	return 0;
}
