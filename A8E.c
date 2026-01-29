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
#include <SDL/SDL_opengl.h>

#include "6502.h"
#include "AtariIo.h"

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
	SDL_Surface *pDisplaySurface = NULL;
	u8 cTurboFlag = 0;
	u32 lLastTicks = 0;
	u32 lCounter;
	u8 cDisassembleFlag = 0;
	u64 llCycles = CYCLES_PER_LINE * LINES_PER_SCREEN_PAL;
	u32 lMode = 0;
	char *pDiskFileName = "d1.atr";
	u32 lScreenWidth = 0;
	u32 lScreenHeight = 0;
	u32 lIndex;
	u8 cUseOpenGl = 0;
	u32 lSdlFlags = 0;
	unsigned int iTextureId;
	
	SDL_Init(SDL_INIT_VIDEO | SDL_INIT_TIMER);

	for(lIndex = 1; lIndex < argc; lIndex++)
	{
		if(argv[lIndex][0] == '-')
		{
			switch(argv[lIndex][1])
			{
			case 'o':
			case 'O':
				cUseOpenGl = 1;
			
				break;
				
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

	if(cUseOpenGl)
	{
		lSdlFlags |= SDL_OPENGL;
		SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
		
		if(lScreenWidth == 0 || lScreenHeight == 0)
		{
			lScreenWidth = 1024;
			lScreenHeight = 768;
		}
	}
	else
	{
		lSdlFlags |= SDL_HWSURFACE | SDL_DOUBLEBUF;

		if(lSdlFlags & SDL_FULLSCREEN)
			lScreenWidth = 320;
		else
			lScreenWidth = 336;

		lScreenHeight = 240;
	}

	pScreenSurface = SDL_SetVideoMode(lScreenWidth, lScreenHeight, 32, lSdlFlags);
	
	if(pScreenSurface == NULL)
	{
		printf("SDL_SetVideoMode() failed: %s!\n", SDL_GetError());

		exit(-1);
	}

	if(cUseOpenGl)
	{
		pDisplaySurface = SDL_CreateRGBSurface(
			SDL_SWSURFACE, 512, 512, 32,
#if SDL_BYTEORDER == SDL_BIG_ENDIAN
			0xff000000, 0x00ff0000, 0x0000ff00, 0x000000ff);
#else
			0x000000ff, 0x0000ff00, 0x00ff0000, 0xff000000);
#endif

		glGenTextures(1, &iTextureId);
		glBindTexture(GL_TEXTURE_2D, iTextureId);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);

		glViewport(0, 0, lScreenWidth, lScreenHeight);

		glMatrixMode(GL_PROJECTION);
		glLoadIdentity();

		glOrtho(0, lScreenWidth, lScreenHeight, 0, -1.0, 1.0);

		glMatrixMode(GL_MODELVIEW);
		glLoadIdentity();
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

		if(cUseOpenGl)
		{
			AtariIoDrawScreen(pAtariContext, pDisplaySurface, 336, 240);

			glPixelStorei(GL_UNPACK_ROW_LENGTH, pDisplaySurface->pitch / pDisplaySurface->format->BytesPerPixel);
			glTexImage2D(GL_TEXTURE_2D, 0, 4, 512, 512, 0, GL_RGBA, GL_UNSIGNED_BYTE, pDisplaySurface->pixels);
//			glTexSubImage2D(GL_TEXTURE_2D, 0, 0, 0, 512, 512, GL_RGBA, GL_UNSIGNED_BYTE, pDisplaySurface->pixels);
			glPixelStorei(GL_UNPACK_ROW_LENGTH, 0);

			glColor3ub(255, 255, 255);
			glEnable(GL_TEXTURE_2D);
			glBindTexture(GL_TEXTURE_2D, iTextureId);

			glBegin(GL_QUADS);

			glTexCoord2f(0, 0);
			glVertex2i(0, 0);

			glTexCoord2f(1, 0);
			glVertex2i(lScreenWidth * 512 / 336, 0);

			glTexCoord2f(1, 1);
			glVertex2i(lScreenWidth * 512 / 336, lScreenHeight * 512 / 240);

			glTexCoord2f(0, 1);
			glVertex2i(0, lScreenHeight * 512 / 240);

			glEnd();
    	
			SDL_GL_SwapBuffers();
		}
		else
		{
			AtariIoDrawScreen(pAtariContext, pScreenSurface, lScreenWidth, lScreenHeight);

			SDL_Flip(pScreenSurface);
		}

		while(SDL_PollEvent(&tEvent))
        {
            if(tEvent.type == SDL_QUIT)
                goto Exit;
        
    		if(tEvent.type == SDL_KEYDOWN)
            {
    			if(tEvent.key.keysym.sym == SDLK_F11)
    				cTurboFlag = 1;

                if(tEvent.key.keysym.sym == SDLK_ESCAPE)
                    goto Exit;
#ifdef ENABLE_VERBOSE_DEBUGGING
				if(tEvent.key.keysym.sym == SDLK_F12)
					cDisassembleFlag = 1;
#endif
            }

    		if(tEvent.type == SDL_KEYUP)
    			if(tEvent.key.keysym.sym == SDLK_F11)
    				cTurboFlag = 0;

   			AtariIoKeyboardEvent(pAtariContext, &tEvent.key);
		}

		if(!cTurboFlag)
			SDL_Delay(MAX(0, MIN(20, 20 - (SDL_GetTicks() - lLastTicks))));
		
		lLastTicks = SDL_GetTicks();
	}

Exit:
	AtariIoClose(pAtariContext);
	_6502_Close(pAtariContext);

	return 0;
}

