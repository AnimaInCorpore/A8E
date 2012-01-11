/********************************************************************
*
*
*
* Atari I/O
*
* (c) 2004 Sascha Springer
*
* NTSC: 1.7897725 MHz, 262 lines, 59.94 Hz
* PAL: 1.773447 MHz, 312 lines, 49.86 Hz
* 114 clocks per line
*
*
*
********************************************************************/

#include <string.h>
#include <stdlib.h>
#include <math.h>
#include <time.h>

#include "6502.h"
#include "AtariIo.h"
#include "Gtia.h"
#include "Antic.h"
#include "Pia.h"
#include "Pokey.h"

/********************************************************************
*
*
* Definitionen
*
*
********************************************************************/

#define CLIP(a) MAX(0, MIN(255, a))

#define FIRST_VISIBLE_LINE 8
#define LAST_VISIBLE_LINE 247

#define PRIO_BKG 0x00
#define PRIO_PF0 0x01
#define PRIO_PF1 0x02
#define PRIO_PF2 0x04
#define PRIO_PF3 0x08
#define PRIO_PM0 0x10
#define PRIO_PM1 0x20
#define PRIO_PM2 0x40
#define PRIO_PM3 0x80

#define FIXED_ADD(address, bits, value) ((address) = ((address) & ~(bits)) | (((address) + (value)) & (bits)))

typedef struct
{
	u32 lNumberOfLines;
	u32 lPixelsPerByte;
	void (*DrawFunction)(_6502_Context_t *);
} AnticModeInfo_t;

typedef struct
{
	u16 sAddress;
	u8 cDefaultValueWrite;
	u8 cDefaultValueRead;
	u8 *(*AccessFunction)(_6502_Context_t *, u8 *);
} IoInitValue_t;

/********************************************************************
*
*
* Variablen
*
*
********************************************************************/

extern u8 m_cConsolHack;

static void AtariIo_DrawLineMode2(_6502_Context_t *pContext);
static void AtariIo_DrawLineMode3(_6502_Context_t *pContext);
static void AtariIo_DrawLineMode4(_6502_Context_t *pContext);
static void AtariIo_DrawLineMode5(_6502_Context_t *pContext);
static void AtariIo_DrawLineMode6(_6502_Context_t *pContext);
static void AtariIo_DrawLineMode7(_6502_Context_t *pContext);
static void AtariIo_DrawLineMode8(_6502_Context_t *pContext);
static void AtariIo_DrawLineMode9(_6502_Context_t *pContext);
static void AtariIo_DrawLineModeA(_6502_Context_t *pContext);
static void AtariIo_DrawLineModeB(_6502_Context_t *pContext);
static void AtariIo_DrawLineModeC(_6502_Context_t *pContext);
static void AtariIo_DrawLineModeD(_6502_Context_t *pContext);
static void AtariIo_DrawLineModeE(_6502_Context_t *pContext);
static void AtariIo_DrawLineModeF(_6502_Context_t *pContext);

static AnticModeInfo_t m_aAnticModeInfoTable[16] =
{
	{ 0, 0, NULL },
	{ 0, 0, NULL },
	{ 8, 8, AtariIo_DrawLineMode2 },
	{ 10, 8, AtariIo_DrawLineMode3 },
	{ 8, 8, AtariIo_DrawLineMode4 },
	{ 16, 8, AtariIo_DrawLineMode5 },
	{ 8, 16, AtariIo_DrawLineMode6 },
	{ 16, 16, AtariIo_DrawLineMode7 },
	{ 8, 32, AtariIo_DrawLineMode8 },
	{ 4, 32, AtariIo_DrawLineMode9 },
	{ 4, 16, AtariIo_DrawLineModeA },
	{ 2, 16, AtariIo_DrawLineModeB },
	{ 1, 16, AtariIo_DrawLineModeC },
	{ 2, 8, AtariIo_DrawLineModeD },
	{ 1, 8, AtariIo_DrawLineModeE },
	{ 1, 8, AtariIo_DrawLineModeF },
};

// Todo: check all true read values!
static IoInitValue_t m_aIoInitValues[] =
{
	{ IO_HPOSP0_M0PF, 0x00, 0x00, Gtia_HPOSP0_M0PF },
	{ IO_HPOSP1_M1PF, 0x00, 0x00, Gtia_HPOSP1_M1PF },
	{ IO_HPOSP2_M2PF, 0x00, 0x00, Gtia_HPOSP2_M2PF },
	{ IO_HPOSP3_M3PF, 0x00, 0x00, Gtia_HPOSP3_M3PF },
	{ IO_HPOSM0_P0PF, 0x00, 0x00, Gtia_HPOSM0_P0PF },
	{ IO_HPOSM1_P1PF, 0x00, 0x00, Gtia_HPOSM1_P1PF },
	{ IO_HPOSM2_P2PF, 0x00, 0x00, Gtia_HPOSM2_P2PF },
	{ IO_HPOSM3_P3PF, 0x00, 0x00, Gtia_HPOSM3_P3PF },
	{ IO_SIZEP0_M0PL, 0x00, 0x00, Gtia_SIZEP0_M0PL },
	{ IO_SIZEP1_M1PL, 0x00, 0x00, Gtia_SIZEP1_M1PL },
	{ IO_SIZEP2_M2PL, 0x00, 0x00, Gtia_SIZEP2_M2PL },
	{ IO_SIZEP3_M3PL, 0x00, 0x00, Gtia_SIZEP3_M3PL },
	{ IO_SIZEM_P0PL, 0x00, 0x00, Gtia_SIZEM_P0PL },
	{ IO_GRAFP0_P1PL, 0x00, 0x00, Gtia_GRAFP0_P1PL },
	{ IO_GRAFP1_P2PL, 0x00, 0x00, Gtia_GRAFP1_P2PL },
	{ IO_GRAFP2_P3PL, 0x00, 0x00, Gtia_GRAFP2_P3PL },
	{ IO_GRAFP3_TRIG0, 0x00, 0x01, Gtia_GRAFP3_TRIG0 },
	{ IO_GRAFM_TRIG1, 0x00, 0x01, Gtia_GRAFM_TRIG1 },
	{ IO_COLPM0_TRIG2, 0x00, 0x01, Gtia_COLPM0_TRIG2 },
	{ IO_COLPM1_TRIG3, 0x00, 0x00, Gtia_COLPM1_TRIG3 },
	{ IO_COLPM2_PAL, 0x00, 0x01, Gtia_COLPM2_PAL },
	{ IO_COLPM3, 0x00, 0x0f, Gtia_COLPM3 },
	{ IO_COLPF0, 0x00, 0x0f, Gtia_COLPF0 },
	{ IO_COLPF1, 0x00, 0x0f, Gtia_COLPF1 },
	{ IO_COLPF2, 0x00, 0x0f, Gtia_COLPF2 },
	{ IO_COLPF3, 0x00, 0x0f, Gtia_COLPF3 },
	{ IO_COLBK, 0x00, 0x0f, Gtia_COLBK },
	{ IO_PRIOR, 0x00, 0xff, Gtia_PRIOR },
	{ IO_VDELAY, 0x00, 0xff, Gtia_VDELAY },
	{ IO_GRACTL, 0x00, 0xff, Gtia_GRACTL },
	{ IO_HITCLR, 0x00, 0xff, Gtia_HITCLR },
	{ IO_CONSOL, 0x00, 0x07, Gtia_CONSOL },

	{ IO_AUDF1_POT0, 0x00, 0xff, Pokey_AUDF1_POT0 },
	{ IO_AUDC1_POT1, 0x00, 0xff, Pokey_AUDC1_POT1 },
	{ IO_AUDF2_POT2, 0x00, 0xff, Pokey_AUDF2_POT2 },
	{ IO_AUDC2_POT3, 0x00, 0xff, Pokey_AUDC2_POT3 },
	{ IO_AUDF3_POT4, 0x00, 0xff, Pokey_AUDF3_POT4 },
	{ IO_AUDC3_POT5, 0x00, 0xff, Pokey_AUDC3_POT5 },
	{ IO_AUDF4_POT6, 0x00, 0xff, Pokey_AUDF4_POT6 },
	{ IO_AUDC4_POT7, 0x00, 0xff, Pokey_STIMER_KBCODE },
	{ IO_AUDCTL_ALLPOT, 0x00, 0xff, Pokey_AUDCTL_ALLPOT },
	{ IO_STIMER_KBCODE, 0x00, 0xff, Pokey_STIMER_KBCODE },
	{ IO_SKREST_RANDOM, 0x00, 0xff, Pokey_SKREST_RANDOM },
	{ IO_POTGO, 0x00, 0xff, Pokey_POTGO },
	{ IO_SEROUT_SERIN, 0x00, 0xff, Pokey_SEROUT_SERIN },
	{ IO_IRQEN_IRQST, 0x00, 0xff, Pokey_IRQEN_IRQST },
	{ IO_SKCTL_SKSTAT, 0x00, 0xff, Pokey_SKCTL_SKSTAT },

	{ IO_PORTA, 0xff, 0xff, Pia_PORTA },
	{ IO_PORTB, 0xfd, 0xfd, Pia_PORTB },
	{ IO_PACTL, 0x00, 0x3c, Pia_PACTL },
	{ IO_PBCTL, 0x00, 0x3c, Pia_PBCTL },

	{ IO_DMACTL, 0x00, 0xff, Antic_DMACTL },
	{ IO_CHACTL, 0x00, 0xff, Antic_CHACTL },
	{ IO_DLISTL, 0x00, 0xff, Antic_DLISTL },
	{ IO_DLISTH, 0x00, 0xff, Antic_DLISTH },
	{ IO_HSCROL, 0x00, 0xff, Antic_HSCROL },
	{ IO_VSCROL, 0x00, 0xff, Antic_VSCROL },
	{ IO_PMBASE, 0x00, 0xff, Antic_PMBASE },
	{ IO_CHBASE, 0x00, 0xff, Antic_CHBASE },
	{ IO_WSYNC, 0x00, 0xff, Antic_WSYNC },
	{ IO_VCOUNT, 0x00, 0x00, Antic_VCOUNT },
	{ IO_PENH, 0x00, 0xff, Antic_PENH },
	{ IO_PENV, 0x00, 0xff, Antic_PENV },
	{ IO_NMIEN, 0x00, 0xff, Antic_NMIEN },
	{ IO_NMIRES_NMIST, 0x00, 0x00, Antic_NMIRES_NMIST },

	{ 0, 0, 0, NULL }
};

static SDL_Color m_aAtariColors[256];

static u8 m_aKeyCodeTable[512] =
{
	255, 255, 255, 255, 255, 255, 255, 255, /*   0 */
	 52,  44, 255, 255, 255,  12, 255, 255, /*   8 */
	255, 255, 255, 255, 255, 255, 255, 255, /*  16 */
	255, 255, 255, 255, 255, 255, 255, 255, /*  24 */
	 33, 255, 255, 255, 255, 255, 255,   6, /*  32 */
	255, 255, 255, 255,  32,  54,  34,  38, /*  40 */
	 50,  31,  30,  26,  24,  29,  27,  51, /*  48 */
	 53,  48, 255,   2, 255,  55, 255, 255, /*  56 */

	255, 255, 255, 255, 255, 255, 255, 255, /*  64 */
	255, 255, 255, 255, 255, 255, 255, 255, /*  72 */
	255, 255, 255, 255, 255, 255, 255, 255, /*  80 */
	255, 255, 255,  14,   7,  15, 255, 255, /*  88 */
	 28,  63,  21,  18,  58,  42,  56,  61, /*  96 */
	 57,  13,   1,   5,   0,  37,  35,   8, /* 104 */
	 10,  47,  40,  62,  45,  11,  16,  46, /* 112 */
	 22,  43,  23, 255, 255, 255, 255, 255, /* 120 */

	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,

	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,

	255, 255, 255, 255, 255, 255, 255, 255, /* 256 */
	255, 255, 255, 255, 255, 255, 255, 255, /* 264 */
	255, 255, 255, 255, 255, 255, 255, 255, /* 272 */
	255, 255,  17, 255, 255, 255, 255,  60, /* 280 */
	 39, 255, 255, 255, 255, 255, 255, 255, /* 288 */
	255, 255, 255, 255, 255,  60, 255, 255, /* 296 */
	255, 255, 255, 255, 255, 255, 255, 255, /* 304 */
	255, 255, 255, 255, 255, 255, 255, 255, /* 312 */

	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,

	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,

	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255,
	255, 255, 255, 255, 255, 255, 255, 255
};

/********************************************************************
*
*
* Funktionen
*
*
********************************************************************/

#define ANGLE_STEP (360.0 / 15.0)
#define ANGLE_START (ANGLE_STEP * 6.0)

#define CONTRAST 1.0
#define BRIGHTNESS 0.9

static void AtariIo_CreatePalette()
{
	u32 lHue;
	u32 lLum;
	double dAngle;
	double dR;
	double dG;
	double dB;
	double dY;
	double dS;

	double aHueAngleTable[16] = 
	{ 
		0.0, // 0
		163.0, // 1
		150.0, // 2
		109.0, // 3
		42.0, // 4
		17.0, // 5
		-3.0, // 6
		-14.0, // 7
		-26.0, // 8
		-53.0, // 9
		-80.0, // 10
		-107.0, // 11
		-134.0, // 12
		-161.0, // 13
		-188.0, // 14
		-197.0, // 15
	};

	for(lLum = 0; lLum < 16; lLum++)
	{
		for(lHue = 0; lHue < 16; lHue++)
		{
			if(lHue == 0)
			{
				dS = 0.0;
				dY = (lLum / 15.0) * CONTRAST;
			}
			else
			{
				dS = 0.5;
				dY = ((lLum + BRIGHTNESS) / (15.0 + BRIGHTNESS)) * CONTRAST;
			}

//			dAngle = (ANGLE_START - ANGLE_STEP * lHue) / 180.0 * M_PI;
			dAngle = aHueAngleTable[lHue] / 180.0 * M_PI;

			dR = dY + dS * sin(dAngle);
			dG = dY - (27.0 / 53.0) * dS * sin(dAngle) - (10.0 / 53.0) * dS * cos(dAngle);
			dB = dY + dS * cos(dAngle);

			m_aAtariColors[lLum + lHue * 16].r = (u8 )CLIP(dR * 256.0);
			m_aAtariColors[lLum + lHue * 16].g = (u8 )CLIP(dG * 256.0);
			m_aAtariColors[lLum + lHue * 16].b = (u8 )CLIP(dB * 256.0);
		}
	}
}

static void AtariIo_FillRect(
	SDL_Surface *pSurface, u32 lX, u32 lY, u32 lW, u32 lH, u8 cColor)
{
	u32 lOldW = lW;
	u8 *pScreen = pSurface->pixels + lY * PIXELS_PER_LINE + lX;
	
	while(lH--)
	{
		while(lW--)
			*pScreen++ = cColor;
		
		lW = lOldW;
		
		pScreen += PIXELS_PER_LINE - lW;
	}
}

static void AtariIo_DrawLineMode2(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cCharacter;
	u8 cData;
	u8 cColor;
	u8 cColor0;
	u8 cColor1;
	u8 cPriority0;
	u8 cPriority1;

	u32 lVerticalScrollOffset = (8 - (pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine)) -
		pIoData->tVideoData.lVerticalScrollOffset; 

	u8 aColorTable[16] = 
	{ 
		SRAM[IO_COLPM0_TRIG2], SRAM[IO_COLPM1_TRIG3], SRAM[IO_COLPM2_PAL], SRAM[IO_COLPM3],
		SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF2], SRAM[IO_COLPF3],
		SRAM[IO_COLBK], SRAM[IO_COLBK], SRAM[IO_COLBK], SRAM[IO_COLBK],
		SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF2], SRAM[IO_COLPF3],
	};
	
	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		FIXED_ADD(pIoData->sDisplayMemoryAddress, 0x0fff, pIoData->tDrawLineData.lBytesPerLine);

	switch(SRAM[IO_PRIOR] >> 6)
	{
	case 0:
		while(pIoData->tDrawLineData.lBytesPerLine--)
		{
			cCharacter = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
    		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);

			if(cCharacter & 0x80)
			{
				cCharacter &= 0x7f;
				cColor0 = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
				cColor1 = SRAM[IO_COLPF2];
				cPriority0 = PRIO_PF1;
				cPriority1 = PRIO_PF2;
			}
			else
			{
				cColor0 = SRAM[IO_COLPF2];
				cColor1 = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
				cPriority0 = PRIO_PF2;
				cPriority1 = PRIO_PF1;
			}
		
			cData = RAM[((SRAM[IO_CHBASE] << 8) & 0xfc00) + cCharacter * 8 + lVerticalScrollOffset]; 
		
			for(lX = 0; lX < 8; lX++)
			{
				if(cData & 0x80)
				{
					*(pIoData->tDrawLineData.pDestination)++ = cColor1;

					*(pIoData->tDrawLineData.pPriorityData)++ = cPriority1;
                }
				else
				{
					*(pIoData->tDrawLineData.pDestination)++ = cColor0;

					*(pIoData->tDrawLineData.pPriorityData)++ = cPriority0;
				}
				
				cData <<= 1;	
			}
		}
		
		break;

	case 1:
		while(pIoData->tDrawLineData.lBytesPerLine--)
		{
			cCharacter = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
    		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);

			if(cCharacter & 0x80)
			{
				cCharacter &= 0x7f;
				cColor0 = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
				cColor1 = SRAM[IO_COLPF2];
			}
			else
			{
				cColor0 = SRAM[IO_COLPF2];
				cColor1 = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
			}
		
			cData = RAM[((SRAM[IO_CHBASE] << 8) & 0xfc00) + cCharacter * 8 + lVerticalScrollOffset];
		
			cColor = SRAM[IO_COLBK] | (cData >> 4);

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
		
			cColor = SRAM[IO_COLBK] | (cData & 0x0f);

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
		}

		break;

	case 2:
		while(pIoData->tDrawLineData.lBytesPerLine--)
		{
			cCharacter = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
    		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);

			if(cCharacter & 0x80)
			{
				cCharacter &= 0x7f;
				cColor0 = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
				cColor1 = SRAM[IO_COLPF2];
			}
			else
			{
				cColor0 = SRAM[IO_COLPF2];
				cColor1 = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
			}
		
			cData = RAM[((SRAM[IO_CHBASE] << 8) & 0xfc00) + cCharacter * 8 + lVerticalScrollOffset];

			cColor = aColorTable[cData >> 4];

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
		
			cColor = aColorTable[cData & 0x0f];

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
		}
	
		break;

	case 3:
		while(pIoData->tDrawLineData.lBytesPerLine--)
		{
			cCharacter = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
    		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);

			if(cCharacter & 0x80)
			{
				cCharacter &= 0x7f;
				cColor0 = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
				cColor1 = SRAM[IO_COLPF2];
			}
			else
			{
				cColor0 = SRAM[IO_COLPF2];
				cColor1 = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
			}
		
			cData = RAM[((SRAM[IO_CHBASE] << 8) & 0xfc00) + cCharacter * 8 + lVerticalScrollOffset];
		
			cColor = (cData & 0xf0) ? (SRAM[IO_COLBK] | (cData & 0xf0)) : (SRAM[IO_COLBK] & 0xf0);

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
		
			cColor = (cData & 0x0f) ? (SRAM[IO_COLBK] | (cData << 4)) : (SRAM[IO_COLBK] & 0xf0);

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
		}

		break;
	}
}

// Todo: GTIA modes 9, 10 and 11, vertical scrolling
static void AtariIo_DrawLineMode3(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cCharacter;
	u8 cData;
	u8 cColor0;
	u8 cColor1;
	u8 cPriority0;
	u8 cPriority1;

	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		pIoData->sDisplayMemoryAddress += pIoData->tDrawLineData.lBytesPerLine;

	while(pIoData->tDrawLineData.lBytesPerLine--)
	{
		cCharacter = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);

		if(cCharacter & 0x80)
		{
			cCharacter &= 0x7f;
			cColor0 = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
			cColor1 = SRAM[IO_COLPF2];
			cPriority0 = PRIO_PF1;
			cPriority1 = PRIO_PF2;
		}
		else
		{
			cColor0 = SRAM[IO_COLPF2];
			cColor1 = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
			cPriority0 = PRIO_PF2;
			cPriority1 = PRIO_PF1;
		}
		
		if(cCharacter < 0x60)
		{
			if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) > 2)
				cData = RAM[((SRAM[IO_CHBASE] << 8) & 0xfc00) + cCharacter * 8 + 
					(10 - (pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine))];
			else
				cData = 0x00;

			for(lX = 0; lX < 8; lX++)
			{
				if(cData & 0x80)
				{
					*(pIoData->tDrawLineData.pDestination)++ = cColor1;

					*(pIoData->tDrawLineData.pPriorityData)++ = cPriority1;
                }
				else
				{
					*(pIoData->tDrawLineData.pDestination)++ = cColor0;

					*(pIoData->tDrawLineData.pPriorityData)++ = cPriority0;
                }
					
				cData <<= 1;	
			}
		}
		else
		{
			if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) > 8)
				cData = 0x00;
			else if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) > 2)
				cData = RAM[(SRAM[IO_CHBASE] << 8) + cCharacter * 8 + 
					(10 - (pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine))];
			else
				cData = RAM[(SRAM[IO_CHBASE] << 8) + cCharacter * 8 + 
					(2 - (pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine))];

			for(lX = 0; lX < 8; lX++)
			{
				if(cData & 0x80)
				{
					*(pIoData->tDrawLineData.pDestination)++ = cColor1;

					*(pIoData->tDrawLineData.pPriorityData)++ = cPriority1;
				}
                else
                {
					*(pIoData->tDrawLineData.pDestination)++ = cColor0;

					*(pIoData->tDrawLineData.pPriorityData)++ = cPriority0;
                }
					
				cData <<= 1;	
			}
		}
	}
}

static void AtariIo_DrawLineMode4(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cCharacter;
	u8 cData;
	u8 aColorTable0[4] = { SRAM[IO_COLBK], SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF2] };
	u8 aColorTable1[4] = { SRAM[IO_COLBK], SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF3] };
	u8 aPriorityTable0[4] = { PRIO_BKG, PRIO_PF0, PRIO_PF1, PRIO_PF2 };
	u8 aPriorityTable1[4] = { PRIO_BKG, PRIO_PF0, PRIO_PF1, PRIO_PF3 };
	u8 *pColorTable;
	u8 *pPriorityTable;
	u8 cColor;
	u8 cPriority;
	
	u32 lVerticalScrollOffset = (8 - (pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine)) -
		pIoData->tVideoData.lVerticalScrollOffset; 

	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		FIXED_ADD(pIoData->sDisplayMemoryAddress, 0x0fff, pIoData->tDrawLineData.lBytesPerLine);

	while(pIoData->tDrawLineData.lBytesPerLine--)
	{
		cCharacter = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);

		if(cCharacter & 0x80)
		{
			cCharacter &= 0x7f;
			pColorTable = aColorTable1;
			pPriorityTable = aPriorityTable1;
		}
		else
		{
			pColorTable = aColorTable0;
			pPriorityTable = aPriorityTable0;
		}
		
		cData = RAM[((SRAM[IO_CHBASE] << 8) & 0xfc00) + cCharacter * 8 + lVerticalScrollOffset]; 
		
		for(lX = 0; lX < 8; lX += 2)
		{
			cColor = pColorTable[(cData >> (6 - lX)) & 0x3];

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;

			cPriority = pPriorityTable[(cData >> (6 - lX)) & 0x3];

			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
		}
	}
}

static void AtariIo_DrawLineMode5(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cCharacter;
	u8 cData;
	u8 aColorTable0[4] = { SRAM[IO_COLBK], SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF2] };
	u8 aColorTable1[4] = { SRAM[IO_COLBK], SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF3] };
	u8 aPriorityTable0[4] = { PRIO_BKG, PRIO_PF0, PRIO_PF1, PRIO_PF2 };
	u8 aPriorityTable1[4] = { PRIO_BKG, PRIO_PF0, PRIO_PF1, PRIO_PF3 };
	u8 *pColorTable;
	u8 *pPriorityTable;
	u8 cColor;
	u8 cPriority;

	u32 lVerticalScrollOffset = ((16 - (pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine)) -
		pIoData->tVideoData.lVerticalScrollOffset) >> 1; 
	
	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		FIXED_ADD(pIoData->sDisplayMemoryAddress, 0x0fff, pIoData->tDrawLineData.lBytesPerLine);

	while(pIoData->tDrawLineData.lBytesPerLine--)
	{
		cCharacter = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);

		if(cCharacter & 0x80)
		{
			cCharacter &= 0x7f;
			pColorTable = aColorTable1;
			pPriorityTable = aPriorityTable1;
		}
		else
		{
			pColorTable = aColorTable0;
			pPriorityTable = aPriorityTable0;
		}
		
		cData = RAM[((SRAM[IO_CHBASE] << 8) & 0xfe00) + cCharacter * 8 + lVerticalScrollOffset]; 
		
		for(lX = 0; lX < 8; lX += 2)
		{
			cColor = pColorTable[(cData >> (6 - lX)) & 0x3];

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;

			cPriority = pPriorityTable[(cData >> (6 - lX)) & 0x3];

			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
		}
	}
}

static void AtariIo_DrawLineMode6(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cCharacter;
	u8 cData;
	u8 aColorTable[4] = { SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF2], SRAM[IO_COLPF3] };
	u8 aPriorityTable[4] = { PRIO_PF0, PRIO_PF1, PRIO_PF2, PRIO_PF3 };
	u8 cColor0 = SRAM[IO_COLBK];
	u8 cColor1;
	u8 cPriority;
	
	u32 lVerticalScrollOffset = (8 - (pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine)) -
		pIoData->tVideoData.lVerticalScrollOffset; 

	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		FIXED_ADD(pIoData->sDisplayMemoryAddress, 0x0fff, pIoData->tDrawLineData.lBytesPerLine);

	while(pIoData->tDrawLineData.lBytesPerLine--)
	{
		cCharacter = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);
		cColor1 = aColorTable[cCharacter >> 6];
		cPriority = aPriorityTable[cCharacter >> 6];
		cCharacter &= 0x3f;

		cData = RAM[((SRAM[IO_CHBASE] << 8) & 0xfe00) + cCharacter * 8 + lVerticalScrollOffset]; 
		
		for(lX = 0; lX < 8; lX++)
		{
			if(cData & 0x80)
			{
				*(pIoData->tDrawLineData.pDestination)++ = cColor1;
				*(pIoData->tDrawLineData.pDestination)++ = cColor1;

				*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
				*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			}
			else
			{
				*(pIoData->tDrawLineData.pDestination)++ = cColor0;
				*(pIoData->tDrawLineData.pDestination)++ = cColor0;

				*(pIoData->tDrawLineData.pPriorityData)++ = PRIO_BKG;
				*(pIoData->tDrawLineData.pPriorityData)++ = PRIO_BKG;
			}
				
			cData <<= 1;
		}
	}
}

static void AtariIo_DrawLineMode7(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cCharacter;
	u8 cData;
	u8 aColorTable[4] = { SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF2], SRAM[IO_COLPF3] };
	u8 aPriorityTable[4] = { PRIO_PF0, PRIO_PF1, PRIO_PF2, PRIO_PF3 };
	u8 cColor0 = SRAM[IO_COLBK];
	u8 cColor1;
	u8 cPriority;

	u32 lVerticalScrollOffset = ((16 - (pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine)) -
		pIoData->tVideoData.lVerticalScrollOffset) >> 1; 
	
	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		FIXED_ADD(pIoData->sDisplayMemoryAddress, 0x0fff, pIoData->tDrawLineData.lBytesPerLine);

	while(pIoData->tDrawLineData.lBytesPerLine--)
	{
		cCharacter = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);
		cColor1 = aColorTable[cCharacter >> 6];
		cPriority = aPriorityTable[cCharacter >> 6];
		cCharacter &= 0x3f;

		cData = RAM[((SRAM[IO_CHBASE] << 8) & 0xfe00) + cCharacter * 8 + lVerticalScrollOffset]; 
		
		for(lX = 0; lX < 8; lX++)
		{
			if(cData & 0x80)
			{
				*(pIoData->tDrawLineData.pDestination)++ = cColor1;
				*(pIoData->tDrawLineData.pDestination)++ = cColor1;

				*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
				*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			}
			else
			{
				*(pIoData->tDrawLineData.pDestination)++ = cColor0;
				*(pIoData->tDrawLineData.pDestination)++ = cColor0;

				*(pIoData->tDrawLineData.pPriorityData)++ = PRIO_BKG;
				*(pIoData->tDrawLineData.pPriorityData)++ = PRIO_BKG;
			}
				
			cData <<= 1;
		}
	}
}

static void AtariIo_DrawLineMode8(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cData;
	u8 aColorTable[4] = { SRAM[IO_COLBK], SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF2] };
	u8 aPriorityTable[4] = { PRIO_BKG, PRIO_PF0, PRIO_PF1, PRIO_PF2 };
	u8 cColor;
	u8 cPriority;
	
	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		FIXED_ADD(pIoData->sDisplayMemoryAddress, 0x0fff, pIoData->tDrawLineData.lBytesPerLine);

	while(pIoData->tDrawLineData.lBytesPerLine--)
	{
		cData = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);
		
		for(lX = 0; lX < 8; lX += 2)
		{
			cColor = aColorTable[(cData >> (6 - lX)) & 0x3];

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;

			cPriority = aPriorityTable[(cData >> (6 - lX)) & 0x3];

			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
		}
	}
}

static void AtariIo_DrawLineMode9(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cData;
	u8 cColor;
	u8 cPriority;
	
	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		FIXED_ADD(pIoData->sDisplayMemoryAddress, 0x0fff, pIoData->tDrawLineData.lBytesPerLine);

	while(pIoData->tDrawLineData.lBytesPerLine--)
	{
		cData = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);
		
		for(lX = 0; lX < 8; lX++)
		{
			if(cData & 0x80)
			{
				cColor = SRAM[IO_COLPF0];
				cPriority = PRIO_PF0;
            }
			else
			{
				cColor = SRAM[IO_COLBK];
				cPriority = PRIO_BKG;
            }

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			
			cData <<= 1;
		}
	}
}

static void AtariIo_DrawLineModeA(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cData;
	u8 aColorTable[4] = { SRAM[IO_COLBK], SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF2] };
	u8 aPriorityTable[4] = { PRIO_BKG, PRIO_PF0, PRIO_PF1, PRIO_PF2 };
	u8 cColor;
	u8 cPriority;
	
	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		FIXED_ADD(pIoData->sDisplayMemoryAddress, 0x0fff, pIoData->tDrawLineData.lBytesPerLine);

	while(pIoData->tDrawLineData.lBytesPerLine--)
	{
		cData = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);
		
		for(lX = 0; lX < 8; lX += 2)
		{
			cColor = aColorTable[(cData >> (6 - lX)) & 0x3];

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;

			cPriority = aPriorityTable[(cData >> (6 - lX)) & 0x3];

			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
		}
	}
}

static void AtariIo_DrawLineModeB(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cData;
	u8 cColor;
	u8 cPriority;
	
	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		FIXED_ADD(pIoData->sDisplayMemoryAddress, 0x0fff, pIoData->tDrawLineData.lBytesPerLine);

	while(pIoData->tDrawLineData.lBytesPerLine--)
	{
		cData = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);
		
		for(lX = 0; lX < 8; lX++)
		{
			if(cData & 0x80)
			{
				cColor = SRAM[IO_COLPF0];
				cPriority = PRIO_PF0;
            }
			else
			{
				cColor = SRAM[IO_COLBK];
				cPriority = PRIO_BKG;
            }
			
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;

			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;

			cData <<= 1;
		}
	}
}

static void AtariIo_DrawLineModeC(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cData;
	u8 cColor;
	u8 cPriority;
	
	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		FIXED_ADD(pIoData->sDisplayMemoryAddress, 0x0fff, pIoData->tDrawLineData.lBytesPerLine);

	while(pIoData->tDrawLineData.lBytesPerLine--)
	{
		cData = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);
		
		for(lX = 0; lX < 8; lX++)
		{
			if(cData & 0x80)
			{
				cColor = SRAM[IO_COLPF0];
				cPriority = PRIO_PF0;
            }
			else
			{
				cColor = SRAM[IO_COLBK];
				cPriority = PRIO_BKG;
            }
			
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;

			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			
			cData <<= 1;
		}
	}
}

static void AtariIo_DrawLineModeD(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cData;
	u8 aColorTable[4] = { SRAM[IO_COLBK], SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF2] };
	u8 aPriorityTable[4] = { PRIO_BKG, PRIO_PF0, PRIO_PF1, PRIO_PF2 };
	u8 cColor;
	u8 cPriority;
	
	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		FIXED_ADD(pIoData->sDisplayMemoryAddress, 0x0fff, pIoData->tDrawLineData.lBytesPerLine);

	while(pIoData->tDrawLineData.lBytesPerLine--)
	{
		cData = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);
		
		for(lX = 0; lX < 8; lX += 2)
		{
			cColor = aColorTable[(cData >> (6 - lX)) & 0x3];

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;

			cPriority = aPriorityTable[(cData >> (6 - lX)) & 0x3];

			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
		}
	}
}

static void AtariIo_DrawLineModeE(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cData;
	u8 aColorTable[4] = { SRAM[IO_COLBK], SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF2] };
	u8 aPriorityTable[4] = { PRIO_BKG, PRIO_PF0, PRIO_PF1, PRIO_PF2 };
	u8 cColor;
	u8 cPriority;
	
	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		FIXED_ADD(pIoData->sDisplayMemoryAddress, 0x0fff, pIoData->tDrawLineData.lBytesPerLine);

	while(pIoData->tDrawLineData.lBytesPerLine--)
	{
		cData = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress];
   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);
		
		for(lX = 0; lX < 8; lX += 2)
		{
			cColor = aColorTable[(cData >> (6 - lX)) & 0x3];

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;

			cPriority = aPriorityTable[(cData >> (6 - lX)) & 0x3];

			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
			*(pIoData->tDrawLineData.pPriorityData)++ = cPriority;
		}
	}
}

static void AtariIo_DrawLineModeF(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lX;
	u8 cData;
	u8 cColor;
	u8 cColor0 = SRAM[IO_COLPF2];
	u8 cColor1 = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);

	u8 aColorTable[16] = 
	{ 
		SRAM[IO_COLPM0_TRIG2], SRAM[IO_COLPM1_TRIG3], SRAM[IO_COLPM2_PAL], SRAM[IO_COLPM3],
		SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF2], SRAM[IO_COLPF3],
		SRAM[IO_COLBK], SRAM[IO_COLBK], SRAM[IO_COLBK], SRAM[IO_COLBK],
		SRAM[IO_COLPF0], SRAM[IO_COLPF1], SRAM[IO_COLPF2], SRAM[IO_COLPF3],
	};

	if((pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine) == 1)
		FIXED_ADD(pIoData->sDisplayMemoryAddress, 0x0fff, pIoData->tDrawLineData.lBytesPerLine);

	switch(SRAM[IO_PRIOR] >> 6)
	{
	case 0:
		while(pIoData->tDrawLineData.lBytesPerLine--)
		{
			cData = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress]; 
       		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);
		
			for(lX = 0; lX < 8; lX++)
			{
				if(cData & 0x80)
				{
					*(pIoData->tDrawLineData.pDestination)++ = cColor1;

					*(pIoData->tDrawLineData.pPriorityData)++ = PRIO_PF1;
                }
				else
				{
					*(pIoData->tDrawLineData.pDestination)++ = cColor0;

					*(pIoData->tDrawLineData.pPriorityData)++ = PRIO_PF2;
				}
    	
				cData <<= 1;	
			}
		}

		break;

	case 1:
		while(pIoData->tDrawLineData.lBytesPerLine--)
		{
			cData = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress]; 
	   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);
	
			cColor = SRAM[IO_COLBK] | (cData >> 4);

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
		
			cColor = SRAM[IO_COLBK] | (cData & 0x0f);

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
		}

		break;

	case 2:
		while(pIoData->tDrawLineData.lBytesPerLine--)
		{
			cData = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress]; 
       		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);
		
			cColor = aColorTable[cData >> 4];

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
		
			cColor = aColorTable[cData & 0x0f];

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
		}

		break;

	case 3:
		while(pIoData->tDrawLineData.lBytesPerLine--)
		{
			cData = RAM[pIoData->tDrawLineData.sDisplayMemoryAddress]; 
	   		FIXED_ADD(pIoData->tDrawLineData.sDisplayMemoryAddress, 0x0fff, 1);
	
			cColor = (cData & 0xf0) ? (SRAM[IO_COLBK] | (cData & 0xf0)) : (SRAM[IO_COLBK] & 0xf0);

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
		
			cColor = (cData & 0x0f) ? (SRAM[IO_COLBK] | (cData << 4)) : (SRAM[IO_COLBK] & 0xf0);

			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
			*(pIoData->tDrawLineData.pDestination)++ = cColor;
		}

		break;
	}
}

void AtariIoFetchLine(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	RAM[IO_NMIRES_NMIST] &= ~NMI_DLI;
	_6502_STALL(9);

	if(pIoData->tVideoData.lCurrentDisplayLine == LAST_VISIBLE_LINE + 1)
		pIoData->lNextDisplayListLine = 8;

	if((pIoData->tVideoData.lCurrentDisplayLine == 249) &&
		(SRAM[IO_NMIEN] & NMI_VBI))
	{
		RAM[IO_NMIRES_NMIST] |= NMI_VBI;
		_6502_Nmi(pContext);
	}
    		
	// Playfield DMA active?
	if((SRAM[IO_DMACTL] & 0x20)) // && (SRAM[IO_DMACTL] & 0x03))
	{
		// Do we need to fetch a new display list command?
		if(pIoData->tVideoData.lCurrentDisplayLine == pIoData->lNextDisplayListLine)
		{
			u8 cOldDisplayListCommand = pIoData->cCurrentDisplayListCommand;
#ifdef VERBOSE_DL
			if(pIoData->tVideoData.lCurrentDisplayLine == 8)
				printf("DL START\n");

			printf("             [%16lld]", pContext->llCycleCounter);
			printf(" DL: %3ld", pIoData->tVideoData.lCurrentDisplayLine);
			printf(" $%04X:", pIoData->sDisplayListAddress);
#endif
			// Fetch new display list command   		
			pIoData->cCurrentDisplayListCommand = RAM[pIoData->sDisplayListAddress];
			FIXED_ADD(pIoData->sDisplayListAddress, 0x03ff, 1);
			_6502_STALL(1);

			// Calculate next fetch line
			if((pIoData->cCurrentDisplayListCommand & 0x0f) <= 0x01)
			{
				pIoData->lNextDisplayListLine += 
					((pIoData->cCurrentDisplayListCommand & 0x70) >> 4) + 1;
			}
			else
			{
				pIoData->lNextDisplayListLine += 
					m_aAnticModeInfoTable[pIoData->cCurrentDisplayListCommand & 0x0f].lNumberOfLines;
			}		

			// DLI?
			if(pIoData->cCurrentDisplayListCommand & 0x80)
			{
				pIoData->llDliCycle = pContext->llCycleCounter + 
					(pIoData->lNextDisplayListLine - pIoData->tVideoData.lCurrentDisplayLine - 1) * CYCLES_PER_LINE;
					
				AtariIoCycleTimedEventUpdate(pContext);
			}

			// Vertical scrolling fixes on the next fetch line   			
			if(((cOldDisplayListCommand & 0x2f) < 0x22) &&
				((pIoData->cCurrentDisplayListCommand & 0x2f) >= 0x22))
			{
    			pIoData->lNextDisplayListLine = 
					MAX(pIoData->tVideoData.lCurrentDisplayLine + 1, pIoData->lNextDisplayListLine - SRAM[IO_VSCROL]);

				pIoData->tVideoData.lVerticalScrollOffset = 0;
			}
			else if(((cOldDisplayListCommand & 0x2f) >= 0x22) &&
				((pIoData->cCurrentDisplayListCommand & 0x2f) < 0x22))
			{
				u32 lTemp = pIoData->lNextDisplayListLine;
			
				pIoData->lNextDisplayListLine = 
					MIN(pIoData->lNextDisplayListLine, pIoData->tVideoData.lCurrentDisplayLine + SRAM[IO_VSCROL] + 1);

				pIoData->tVideoData.lVerticalScrollOffset = lTemp - pIoData->lNextDisplayListLine;
			}
			else
			{
				pIoData->tVideoData.lVerticalScrollOffset = 0;
			}

			// Fetch new display list address
			if((pIoData->cCurrentDisplayListCommand & 0x0f) == 0x01)
			{
				pIoData->sDisplayListAddress =
					RAM[pIoData->sDisplayListAddress] |
					(RAM[pIoData->sDisplayListAddress + 1] << 8);
			}

			// Wait for VBL?
			if(pIoData->cCurrentDisplayListCommand == 0x41)
				pIoData->lNextDisplayListLine = 8;

			// Fetch new display memory address
			if((pIoData->cCurrentDisplayListCommand & 0x4f) >= 0x42)
			{
				pIoData->sDisplayMemoryAddress = RAM[pIoData->sDisplayListAddress];
				FIXED_ADD(pIoData->sDisplayListAddress, 0x03ff, 1);
				pIoData->sDisplayMemoryAddress |= RAM[pIoData->sDisplayListAddress] << 8;
				FIXED_ADD(pIoData->sDisplayListAddress, 0x03ff, 1);
			}

#ifdef VERBOSE_DL
			printf("%02X", pIoData->cCurrentDisplayListCommand);
			
			if((pIoData->cCurrentDisplayListCommand & 0x8f) > 0x81)
				printf(" DLI");

			if((pIoData->cCurrentDisplayListCommand & 0x4f) > 0x41)
			{
				printf(" MEM(%04X)", pIoData->sDisplayMemoryAddress);
			}

			if((pIoData->cCurrentDisplayListCommand & 0x2f) > 0x21)
				printf(" VSCR");

			if((pIoData->cCurrentDisplayListCommand & 0x1f) > 0x11)
				printf(" HSCR");
				
			if((pIoData->cCurrentDisplayListCommand & 0x4f) == 0x01)
				printf(" JMP(%04X)", pIoData->sDisplayListAddress);
				
			if((pIoData->cCurrentDisplayListCommand & 0x4f) == 0x41)
				printf(" JMPVBL(%04X)", pIoData->sDisplayListAddress);
				
			printf("\n");
#endif
		}
	}
}

void AtariIoDrawLine(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 lPlayfieldPixelsPerLine = 192 + (SRAM[IO_DMACTL] & 0x03) * 64;	

	u8 aBackgroundColorTable[4] = 
	{ 
		SRAM[IO_COLBK], SRAM[IO_COLBK], SRAM[IO_COLPM0_TRIG2], (SRAM[IO_COLBK] & 0xf0)
	};
   				
	u8 cBackgroundColor = aBackgroundColorTable[SRAM[IO_PRIOR] >> 6];

	if(pIoData->tVideoData.lCurrentDisplayLine < FIRST_VISIBLE_LINE ||
		pIoData->tVideoData.lCurrentDisplayLine > LAST_VISIBLE_LINE)
	{
		return;
	}

	if((SRAM[IO_DMACTL] & 0x20) && (SRAM[IO_DMACTL] & 0x03))
	{
		if((pIoData->cCurrentDisplayListCommand & 0x0f) < 2)
		{
			AtariIo_FillRect(
				pIoData->tVideoData.pSdlAtariSurface, 
				0, 
				pIoData->tVideoData.lCurrentDisplayLine, 
				PIXELS_PER_LINE,
				1,
				cBackgroundColor);
		}
		else
		{
			u32 lLeftBorderSize = 0;
			u32 lRightBorderSize = 0;

			pIoData->tDrawLineData.pDestination = 
				pIoData->tVideoData.pSdlAtariSurface->pixels + 
				pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
				
			pIoData->tDrawLineData.pPriorityData = 
                pIoData->tVideoData.pPriorityData +
				pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
				
            switch(SRAM[IO_DMACTL] & 0x03)
            {
            case 0x01:
                lLeftBorderSize = (16 + 12 + 6 + 30) * 2;
                lRightBorderSize = (30 + 6) * 2;
    			pIoData->tDrawLineData.pDestination += (16 + 12 + 6 + 30) * 2;
    			pIoData->tDrawLineData.pPriorityData += (16 + 12 + 6 + 30) * 2;
                
                break;
                
            case 0x02:
                lLeftBorderSize = (16 + 12 + 6 + 14) * 2;
                lRightBorderSize = (14 + 6) * 2;
    			pIoData->tDrawLineData.pDestination += (16 + 12 + 6 + 14) * 2;
    			pIoData->tDrawLineData.pPriorityData += (16 + 12 + 6 + 14) * 2;
                
                break;
            
            case 0x03:
                lLeftBorderSize = (16 + 12 + 6 + 10) * 2;
                lRightBorderSize = (2 + 6) * 2;
    			pIoData->tDrawLineData.pDestination += (16 + 12 + 4) * 2;
    			pIoData->tDrawLineData.pPriorityData += (16 + 12 + 4) * 2;
                
                break;
            
            default:
                break;
            }

			pIoData->tDrawLineData.lBytesPerLine = 
				lPlayfieldPixelsPerLine / 
 				m_aAnticModeInfoTable[pIoData->cCurrentDisplayListCommand & 0x0f].lPixelsPerByte;

			_6502_STALL(pIoData->tDrawLineData.lBytesPerLine);

			if(pIoData->cCurrentDisplayListCommand & 0x10)
			{
				if((SRAM[IO_DMACTL] & 0x03) != 0x03)
				{
					pIoData->tDrawLineData.pDestination -= 32 - (SRAM[IO_HSCROL] * 2);
					pIoData->tDrawLineData.pPriorityData -= 32 - (SRAM[IO_HSCROL] * 2);
					pIoData->tDrawLineData.lBytesPerLine += 8;
				}
				else
				{
					pIoData->tDrawLineData.pDestination += SRAM[IO_HSCROL] * 2;	
					pIoData->tDrawLineData.pPriorityData += SRAM[IO_HSCROL] * 2;	
				}
			}

            pIoData->tDrawLineData.sDisplayMemoryAddress = pIoData->sDisplayMemoryAddress;
	
			m_aAnticModeInfoTable[pIoData->cCurrentDisplayListCommand & 0x0f].DrawFunction(pContext);

			AtariIo_FillRect(
				pIoData->tVideoData.pSdlAtariSurface, 
				0, 
				pIoData->tVideoData.lCurrentDisplayLine, 
				lLeftBorderSize,
				1,
				cBackgroundColor);

			AtariIo_FillRect(
				pIoData->tVideoData.pSdlAtariSurface, 
				lPlayfieldPixelsPerLine + lLeftBorderSize, 
				pIoData->tVideoData.lCurrentDisplayLine, 
				lRightBorderSize,
				1,
				cBackgroundColor);
		}
	}
	else
	{
		AtariIo_FillRect(
			pIoData->tVideoData.pSdlAtariSurface, 
			0, 
			pIoData->tVideoData.lCurrentDisplayLine, 
			PIXELS_PER_LINE,
			1,
			cBackgroundColor);
	}
}

#define DRAW_PLAYER_PIXEL(offset) \
	if(cOverlap && (pPriorityData[offset] & cOverlap)) \
	{ \
		if(cSpecial && (pPriorityData[offset] & PRIO_PF1)) \
			pDestination[offset] |= cColor & 0xf0; \
		else if(!(pPriorityData[offset] & cPriorityMask)) \
			pDestination[offset] |= cColor; \
	} \
	else \
	{ \
		if(cSpecial && (pPriorityData[offset] & PRIO_PF1)) \
			pDestination[offset] = (pDestination[offset] & 0x0f) | (cColor & 0xf0); \
		else if(!(pPriorityData[offset] & cPriorityMask)) \
			pDestination[offset] = cColor; \
	};

static u8 AtariIo_DrawPlayer(
	u8 cColor, 
	u8 cSize, 
	u8 cData, 
	u8 cPriorityMask,
	u8 cPriority, 
	u8 *pPriorityData, 
	u8 *pDestination,
	u8 cSpecial,
	u8 cOverlap)
{
	u8 cMask = 0x80;
	u8 cCollision = 0;

	if((cSize & 0x3) == 0x1)
	{
		while(cMask)
		{
			if(cData & cMask)
			{
				DRAW_PLAYER_PIXEL(0);
				DRAW_PLAYER_PIXEL(1);
				DRAW_PLAYER_PIXEL(2);
				DRAW_PLAYER_PIXEL(3);

				pPriorityData[0] |= cPriority;
				pPriorityData[1] |= cPriority;
				pPriorityData[2] |= cPriority;
				pPriorityData[3] |= cPriority;
                
				cCollision |= pPriorityData[0];
				cCollision |= pPriorityData[1];
				cCollision |= pPriorityData[2];
				cCollision |= pPriorityData[3];
			}
        
			pPriorityData += 4;
			pDestination += 4;
			cMask >>= 1;
		}
	}
	else if((cSize & 0x3) == 0x3)
	{
		while(cMask)
		{
			if(cData & cMask)
			{
				DRAW_PLAYER_PIXEL(0);
				DRAW_PLAYER_PIXEL(1);
				DRAW_PLAYER_PIXEL(2);
				DRAW_PLAYER_PIXEL(3);
				DRAW_PLAYER_PIXEL(4);
				DRAW_PLAYER_PIXEL(5);
				DRAW_PLAYER_PIXEL(6);
				DRAW_PLAYER_PIXEL(7);

				pPriorityData[0] |= cPriority;
				pPriorityData[1] |= cPriority;
				pPriorityData[2] |= cPriority;
				pPriorityData[3] |= cPriority;
				pPriorityData[4] |= cPriority;
				pPriorityData[5] |= cPriority;
				pPriorityData[6] |= cPriority;
				pPriorityData[7] |= cPriority;

				cCollision |= pPriorityData[0];
				cCollision |= pPriorityData[1];
				cCollision |= pPriorityData[2];
				cCollision |= pPriorityData[3];
				cCollision |= pPriorityData[4];
				cCollision |= pPriorityData[5];
				cCollision |= pPriorityData[6];
				cCollision |= pPriorityData[7];
			}
        
			pPriorityData += 8;
			pDestination += 8;
			cMask >>= 1;
		}
	}
	else
	{
		while(cMask)
		{
			if(cData & cMask)
			{
				DRAW_PLAYER_PIXEL(0);
				DRAW_PLAYER_PIXEL(1);

				pPriorityData[0] |= cPriority;
				pPriorityData[1] |= cPriority;

				cCollision |= pPriorityData[0];
				cCollision |= pPriorityData[1];
			}
        
			pPriorityData += 2;
			pDestination += 2;
			cMask >>= 1;
		}
	}
	
	if(cSpecial)
		cCollision = (cCollision & ~(PRIO_PF1 | PRIO_PF2)) | (cCollision & PRIO_PF1 ? PRIO_PF2 : 0);
	
	return cCollision;
}

#define DRAW_MISSILE_PIXEL(offset) \
	if(cSpecial && (pPriorityData[offset] & PRIO_PF1)) \
		pDestination[offset] = (pDestination[offset] & 0x0f) | (cColor & 0xf0); \
	else if(!(pPriorityData[offset] & cPriorityMask)) \
		pDestination[offset] = cColor;

static u8 AtariIo_DrawMissile(
	u8 cNumber,
	u8 cColor, 
	u8 cSize, 
	u8 cData, 
	u8 cPriorityMask,
	u8 *pPriorityData, 
	u8 *pDestination,
	u8 cSpecial)
{
	u8 cCollision = 0;
	u8 cMask;

	cNumber <<= 1;
	cMask = 0x02 << cNumber;
    
	if((cSize & (0x03 << cNumber)) == (0x01 << cNumber))
	{
		if(cData & cMask)
		{
			DRAW_MISSILE_PIXEL(0);
			DRAW_MISSILE_PIXEL(1);
			DRAW_MISSILE_PIXEL(2);
			DRAW_MISSILE_PIXEL(3);

			cCollision |= pPriorityData[0];
			cCollision |= pPriorityData[1];
			cCollision |= pPriorityData[2];
			cCollision |= pPriorityData[3];
		}

		cMask >>= 1;

		if(cData & cMask)
		{
			DRAW_MISSILE_PIXEL(4);
			DRAW_MISSILE_PIXEL(5);
			DRAW_MISSILE_PIXEL(6);
			DRAW_MISSILE_PIXEL(7);

			cCollision |= pPriorityData[4];
			cCollision |= pPriorityData[5];
			cCollision |= pPriorityData[6];
			cCollision |= pPriorityData[7];
		}
	}
	else if((cSize & (0x03 << cNumber)) == (0x03 << cNumber))
	{
		if(cData & cMask)
		{
			DRAW_MISSILE_PIXEL(0);
			DRAW_MISSILE_PIXEL(1);
			DRAW_MISSILE_PIXEL(2);
			DRAW_MISSILE_PIXEL(3);
			DRAW_MISSILE_PIXEL(4);
			DRAW_MISSILE_PIXEL(5);
			DRAW_MISSILE_PIXEL(6);
			DRAW_MISSILE_PIXEL(7);

			cCollision |= pPriorityData[0];
			cCollision |= pPriorityData[1];
			cCollision |= pPriorityData[2];
			cCollision |= pPriorityData[3];
			cCollision |= pPriorityData[4];
			cCollision |= pPriorityData[5];
			cCollision |= pPriorityData[6];
			cCollision |= pPriorityData[7];
		}

		cMask >>= 1;

		if(cData & cMask)
		{
			DRAW_MISSILE_PIXEL(8);
			DRAW_MISSILE_PIXEL(9);
			DRAW_MISSILE_PIXEL(10);
			DRAW_MISSILE_PIXEL(11);
			DRAW_MISSILE_PIXEL(12);
			DRAW_MISSILE_PIXEL(13);
			DRAW_MISSILE_PIXEL(14);
			DRAW_MISSILE_PIXEL(15);

			cCollision |= pPriorityData[8];
			cCollision |= pPriorityData[9];
			cCollision |= pPriorityData[10];
			cCollision |= pPriorityData[11];
			cCollision |= pPriorityData[12];
			cCollision |= pPriorityData[13];
			cCollision |= pPriorityData[14];
			cCollision |= pPriorityData[15];
		}
	}
	else
	{
		if(cData & cMask)
		{
			DRAW_MISSILE_PIXEL(0);
			DRAW_MISSILE_PIXEL(1);

			cCollision |= pPriorityData[0];
			cCollision |= pPriorityData[1];
		}
		
		cMask >>= 1;

		if(cData & cMask)
		{
			DRAW_MISSILE_PIXEL(2);
			DRAW_MISSILE_PIXEL(3);

			cCollision |= pPriorityData[2];
			cCollision |= pPriorityData[3];
		}
	}
    
	if(cSpecial)
		cCollision = (cCollision & ~(PRIO_PF1 | PRIO_PF2)) | (cCollision & PRIO_PF1 ? PRIO_PF2 : 0);
	
	return cCollision;    
}

void AtariIoDrawPlayerMissiles(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u8 cData;
	u8 *pDestination;
	u8 *pPriorityData;
	u8 cPriorityMask;
	u8 cCollision;

	if(pIoData->tVideoData.lCurrentDisplayLine >= 248)
		return;
	
	// Keep the order of the players being drawn!

    // Player 3

	if((SRAM[IO_DMACTL] & 0x08) && (SRAM[IO_GRACTL] & 0x02))
	{
	    if(SRAM[IO_DMACTL] & 0x10)
	        cData = RAM[((SRAM[IO_PMBASE] << 8) & 0xf800) + 1792 + 
				pIoData->tVideoData.lCurrentDisplayLine];
	    else
	        cData = RAM[((SRAM[IO_PMBASE] << 8) & 0xfc00) + 896 + 
				pIoData->tVideoData.lCurrentDisplayLine / 2 - ((SRAM[IO_VDELAY] & 0x80) ? 1 : 0)];
	}
	else
	{
        cData = SRAM[IO_GRAFP3_TRIG0];
	}

	if(cData && SRAM[IO_HPOSP3_M3PF])
	{
		pDestination = 
			SRAM[IO_HPOSP3_M3PF] * 2 +
			pIoData->tVideoData.pSdlAtariSurface->pixels + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		pPriorityData = 
			SRAM[IO_HPOSP3_M3PF] * 2 +
			pIoData->tVideoData.pPriorityData + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		if(SRAM[IO_PRIOR] & 0x01)
		{
			cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
		}
		else if(SRAM[IO_PRIOR] & 0x02)
		{
			cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM2;
		}
		else if(SRAM[IO_PRIOR] & 0x04)
		{
			cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
		}
		else if(SRAM[IO_PRIOR] & 0x08)
		{
			cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
		}
		else
		{
			cPriorityMask = 0x00;
		}

		cCollision = AtariIo_DrawPlayer(
			SRAM[IO_COLPM3], 
			SRAM[IO_SIZEP3_M3PL], 
			cData,
			cPriorityMask,
			PRIO_PM3,
			pPriorityData, 
			pDestination,
			((pIoData->cCurrentDisplayListCommand & 0xf) == 0x02 || 
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x03 ||
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x0f) &&
			(SRAM[IO_PRIOR] & 0xc0) == 0,
			0);
#ifndef DISABLE_COLLISIONS
		RAM[IO_HPOSM3_P3PF] |= cCollision & 0x0f;
#endif
	}
    
    // Player 2

	if((SRAM[IO_DMACTL] & 0x08) && (SRAM[IO_GRACTL] & 0x02))
	{
	    if(SRAM[IO_DMACTL] & 0x10)
	        cData = RAM[((SRAM[IO_PMBASE] << 8) & 0xf800) + 1536 + 
				pIoData->tVideoData.lCurrentDisplayLine];
	    else
	        cData = RAM[((SRAM[IO_PMBASE] << 8) & 0xfc00) + 768 + 
				pIoData->tVideoData.lCurrentDisplayLine / 2 - ((SRAM[IO_VDELAY] & 0x40) ? 1 : 0)];
	}
	else
	{
        cData = SRAM[IO_GRAFP2_P3PL];
	}

	if(cData && SRAM[IO_HPOSP2_M2PF])
	{
		pDestination = 
			SRAM[IO_HPOSP2_M2PF] * 2 +
			pIoData->tVideoData.pSdlAtariSurface->pixels + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		pPriorityData = 
			SRAM[IO_HPOSP2_M2PF] * 2 +
			pIoData->tVideoData.pPriorityData + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		if(SRAM[IO_PRIOR] & 0x01)
		{
			cPriorityMask = PRIO_PM0 | PRIO_PM1;
		}
		else if(SRAM[IO_PRIOR] & 0x02)
		{
			cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
		}
		else if(SRAM[IO_PRIOR] & 0x04)
		{
			cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1;
		}
		else if(SRAM[IO_PRIOR] & 0x08)
		{
			cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1;
		}
		else
		{
			cPriorityMask = 0x00;
		}
        
		cCollision = AtariIo_DrawPlayer(
			SRAM[IO_COLPM2_PAL], 
			SRAM[IO_SIZEP2_M2PL], 
			cData,
			cPriorityMask,
			PRIO_PM2,
			pPriorityData, 
			pDestination,
			((pIoData->cCurrentDisplayListCommand & 0xf) == 0x02 || 
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x03 ||
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x0f) &&
			(SRAM[IO_PRIOR] & 0xc0) == 0,
			(SRAM[IO_PRIOR] & 0x20) ? PRIO_PM3 : 0);
#ifndef DISABLE_COLLISIONS
		RAM[IO_HPOSM2_P2PF] |= cCollision & 0x0f;

		if(cCollision & PRIO_PM3)
			RAM[IO_GRAFP2_P3PL] |= 0x04;
        
		RAM[IO_GRAFP1_P2PL] |= (cCollision >> 4) & ~0x04;
#endif
	}
     
    // Player 1

	if((SRAM[IO_DMACTL] & 0x08) && (SRAM[IO_GRACTL] & 0x02))
	{
	    if(SRAM[IO_DMACTL] & 0x10)
	        cData = RAM[((SRAM[IO_PMBASE] << 8) & 0xf800) + 1280 + 
				pIoData->tVideoData.lCurrentDisplayLine];
	    else
	        cData = RAM[((SRAM[IO_PMBASE] << 8) & 0xfc00) + 640 + 
				pIoData->tVideoData.lCurrentDisplayLine / 2 - ((SRAM[IO_VDELAY] & 0x20) ? 1 : 0)];
	}
	else
	{
        cData = SRAM[IO_GRAFP1_P2PL];
	}

	if(cData && SRAM[IO_HPOSP1_M1PF])
	{
		pDestination = 
			SRAM[IO_HPOSP1_M1PF] * 2 +
			pIoData->tVideoData.pSdlAtariSurface->pixels + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		pPriorityData = 
			SRAM[IO_HPOSP1_M1PF] * 2 +
			pIoData->tVideoData.pPriorityData + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		if(SRAM[IO_PRIOR] & 0x01)
		{
			cPriorityMask = PRIO_PM0;
		}
		else if(SRAM[IO_PRIOR] & 0x02)
		{
			cPriorityMask = PRIO_PM0;
		}
		else if(SRAM[IO_PRIOR] & 0x04)
		{
			cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0;
		}
		else if(SRAM[IO_PRIOR] & 0x08)
		{
			cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0;
		}
		else
		{
			cPriorityMask = 0x00;
		}

		cCollision = AtariIo_DrawPlayer(
			SRAM[IO_COLPM1_TRIG3], 
			SRAM[IO_SIZEP1_M1PL], 
			cData,
			cPriorityMask,
			PRIO_PM1,
			pPriorityData, 
			pDestination,
			((pIoData->cCurrentDisplayListCommand & 0xf) == 0x02 || 
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x03 ||
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x0f) &&
			(SRAM[IO_PRIOR] & 0xc0) == 0,
			0);
#ifndef DISABLE_COLLISIONS
		RAM[IO_HPOSM1_P1PF] |= cCollision & 0x0f;

		if(cCollision & PRIO_PM3)
			RAM[IO_GRAFP2_P3PL] |= 0x02;
        
		if(cCollision & PRIO_PM2)
			RAM[IO_GRAFP1_P2PL] |= 0x02;
    
		RAM[IO_GRAFP0_P1PL] |= (cCollision >> 4) & ~0x02;
#endif
	}
      
    // Player 0

	if((SRAM[IO_DMACTL] & 0x08) && (SRAM[IO_GRACTL] & 0x02))
	{
	    if(SRAM[IO_DMACTL] & 0x10)
	        cData = RAM[((SRAM[IO_PMBASE] << 8) & 0xf800) + 1024 + 
				pIoData->tVideoData.lCurrentDisplayLine];
	    else
	        cData = RAM[((SRAM[IO_PMBASE] << 8) & 0xfc00) + 512 + 
				pIoData->tVideoData.lCurrentDisplayLine / 2 - ((SRAM[IO_VDELAY] & 0x10) ? 1 : 0)];
	}
	else
	{
        cData = SRAM[IO_GRAFP0_P1PL];
	}

	if(cData && SRAM[IO_HPOSP0_M0PF])
	{
		pDestination = 
			SRAM[IO_HPOSP0_M0PF] * 2 +
			pIoData->tVideoData.pSdlAtariSurface->pixels + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		pPriorityData = 
			SRAM[IO_HPOSP0_M0PF] * 2 +
			pIoData->tVideoData.pPriorityData + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;

		if(SRAM[IO_PRIOR] & 0x01)
		{
			cPriorityMask = 0x00;
		}
		else if(SRAM[IO_PRIOR] & 0x02)
		{
			cPriorityMask = 0x00;
		}
		else if(SRAM[IO_PRIOR] & 0x04)
		{
			cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
		}
		else if(SRAM[IO_PRIOR] & 0x08)
		{
			cPriorityMask = PRIO_PF0 | PRIO_PF1;
		}
		else
		{
			cPriorityMask = 0x00;
		}
        
		cCollision = AtariIo_DrawPlayer(
			SRAM[IO_COLPM0_TRIG2], 
			SRAM[IO_SIZEP0_M0PL], 
			cData,
			cPriorityMask,
			PRIO_PM0,
			pPriorityData, 
			pDestination,
			((pIoData->cCurrentDisplayListCommand & 0xf) == 0x02 || 
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x03 ||
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x0f) &&
			(SRAM[IO_PRIOR] & 0xc0) == 0,
			(SRAM[IO_PRIOR] & 0x20) ? PRIO_PM1 : 0);
#ifndef DISABLE_COLLISIONS
		RAM[IO_HPOSM0_P0PF] |= cCollision & 0x0f;

		if(cCollision & PRIO_PM3)
			RAM[IO_GRAFP2_P3PL] |= 0x01;
        
		if(cCollision & PRIO_PM2)
			RAM[IO_GRAFP1_P2PL] |= 0x01;
    
		if(cCollision & PRIO_PM1)
			RAM[IO_GRAFP0_P1PL] |= 0x01;
    
		RAM[IO_SIZEM_P0PL] |= (cCollision >> 4) & ~0x01;
#endif
	}
    
    // All missiles

	if((SRAM[IO_DMACTL] & 0x04) && (SRAM[IO_GRACTL] & 0x01))
	{
	    if(SRAM[IO_DMACTL] & 0x10)
	        cData = RAM[((SRAM[IO_PMBASE] << 8) & 0xf800) + 768 + 
				pIoData->tVideoData.lCurrentDisplayLine];
	    else
	        cData = RAM[((SRAM[IO_PMBASE] << 8) & 0xfc00) + 384 + 
				pIoData->tVideoData.lCurrentDisplayLine / 2 - ((SRAM[IO_VDELAY] & 0x08) ? 1 : 0)];
	}
	else
	{
        cData = SRAM[IO_GRAFM_TRIG1];
	}

    // Missile 3

	if((cData & 0xc0) && SRAM[IO_HPOSM3_P3PF])
	{
		pDestination = 
			SRAM[IO_HPOSM3_P3PF] * 2 +
			pIoData->tVideoData.pSdlAtariSurface->pixels + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;

		pPriorityData = 
			SRAM[IO_HPOSM3_P3PF] * 2 +
			pIoData->tVideoData.pPriorityData + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		if(SRAM[IO_PRIOR] & 0x01)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3;
			else
				cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
		}
		else if(SRAM[IO_PRIOR] & 0x02)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = PRIO_PM0 | PRIO_PM1;
			else
				cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM2;
		}
		else if(SRAM[IO_PRIOR] & 0x04)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = 0x00;
			else
				cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
		}
		else if(SRAM[IO_PRIOR] & 0x08)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3;
			else
				cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1 | PRIO_PM2;
		}
		else
		{
			cPriorityMask = 0x00;
		}
        
		cCollision = AtariIo_DrawMissile(
			3,
			SRAM[IO_PRIOR] & 0x10 ? SRAM[IO_COLPF3] : SRAM[IO_COLPM3], 
			SRAM[IO_SIZEM_P0PL],
			cData, 
			cPriorityMask,
			pPriorityData, 
			pDestination,
			((pIoData->cCurrentDisplayListCommand & 0xf) == 0x02 || 
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x03 ||
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x0f) &&
			(SRAM[IO_PRIOR] & 0xc0) == 0);
#ifndef DISABLE_COLLISIONS
		RAM[IO_HPOSP3_M3PF] |= cCollision & 0x0f;	
		RAM[IO_SIZEP3_M3PL] |= cCollision >> 4;
#endif
	}
     
    // Missile 2

	if((cData & 0x30) && SRAM[IO_HPOSM2_P2PF])
	{
		pDestination = 
			SRAM[IO_HPOSM2_P2PF] * 2 +
			pIoData->tVideoData.pSdlAtariSurface->pixels + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		pPriorityData = 
			SRAM[IO_HPOSM2_P2PF] * 2 +
			pIoData->tVideoData.pPriorityData + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		if(SRAM[IO_PRIOR] & 0x01)	
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3;
			else
				cPriorityMask = PRIO_PM0 | PRIO_PM1;
		}
		else if(SRAM[IO_PRIOR] & 0x02)	
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = PRIO_PM0 | PRIO_PM1;
			else
				cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
		}
		else if(SRAM[IO_PRIOR] & 0x04)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = 0x00;
			else	
				cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0 | PRIO_PM1;
		}
		else if(SRAM[IO_PRIOR] & 0x08)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3;
			else
				cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0 | PRIO_PM1;
		}
		else
		{
			cPriorityMask = 0x00;
		}
        
		cCollision = AtariIo_DrawMissile(
			2,
			SRAM[IO_PRIOR] & 0x10 ? SRAM[IO_COLPF3] : SRAM[IO_COLPM2_PAL], 
			SRAM[IO_SIZEM_P0PL],
			cData, 
			cPriorityMask,
			pPriorityData, 
			pDestination,
			((pIoData->cCurrentDisplayListCommand & 0xf) == 0x02 || 
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x03 ||
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x0f) &&
			(SRAM[IO_PRIOR] & 0xc0) == 0);
#ifndef DISABLE_COLLISIONS
		RAM[IO_HPOSP2_M2PF] |= cCollision & 0x0f;
		RAM[IO_SIZEP2_M2PL] |= cCollision >> 4;
#endif
	}
     
    // Missile 1

	if((cData & 0x0c) && SRAM[IO_HPOSM1_P1PF])
	{
		pDestination = 
			SRAM[IO_HPOSM1_P1PF] * 2 +
			pIoData->tVideoData.pSdlAtariSurface->pixels + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		pPriorityData = 
			SRAM[IO_HPOSM1_P1PF] * 2 +
			pIoData->tVideoData.pPriorityData + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		if(SRAM[IO_PRIOR] & 0x01)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3;
			else
				cPriorityMask = PRIO_PM0;
		}
		else if(SRAM[IO_PRIOR] & 0x02)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = PRIO_PM0 | PRIO_PM1;
			else
				cPriorityMask = PRIO_PM0;
		}
		else if(SRAM[IO_PRIOR] & 0x04)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = 0x00;
			else
				cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3 | PRIO_PM0;
		}
		else if(SRAM[IO_PRIOR] & 0x08)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3;
			else
				cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PM0;
		}
		else
		{
			cPriorityMask = 0x00;
		}
        
		cCollision = AtariIo_DrawMissile(
			1,
			SRAM[IO_PRIOR] & 0x10 ? SRAM[IO_COLPF3] : SRAM[IO_COLPM1_TRIG3], 
			SRAM[IO_SIZEM_P0PL],
			cData, 
			cPriorityMask,
			pPriorityData, 
			pDestination,
			((pIoData->cCurrentDisplayListCommand & 0xf) == 0x02 || 
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x03 ||
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x0f) &&
			(SRAM[IO_PRIOR] & 0xc0) == 0);
#ifndef DISABLE_COLLISIONS
		RAM[IO_HPOSP1_M1PF] |= cCollision & 0x0f;
		RAM[IO_SIZEP1_M1PL] |= cCollision >> 4;
#endif
	}
    
    // Missile 0

	if((cData & 0x03) && SRAM[IO_HPOSM0_P0PF])
	{
		pDestination = 
			SRAM[IO_HPOSM0_P0PF] * 2 +
			pIoData->tVideoData.pSdlAtariSurface->pixels + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		pPriorityData = 
			SRAM[IO_HPOSM0_P0PF] * 2 +
			pIoData->tVideoData.pPriorityData + 
			pIoData->tVideoData.lCurrentDisplayLine * PIXELS_PER_LINE;
        
		if(SRAM[IO_PRIOR] & 0x01)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3;
			else
				cPriorityMask = 0x00;
		}
		else if(SRAM[IO_PRIOR] & 0x02)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = PRIO_PM0 | PRIO_PM1;
			else
				cPriorityMask = 0x00;
		}
		else if(SRAM[IO_PRIOR] & 0x04)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = 0x00;
			else
				cPriorityMask = PRIO_PF0 | PRIO_PF1 | PRIO_PF2 | PRIO_PF3;
		}
		else if(SRAM[IO_PRIOR] & 0x08)
		{
			if(SRAM[IO_PRIOR] & 0x10)
				cPriorityMask = PRIO_PM0 | PRIO_PM1 | PRIO_PM2 | PRIO_PM3;
			else
				cPriorityMask = PRIO_PF0 | PRIO_PF1;
		}
		else
		{
			cPriorityMask = 0x00;
		}
        
		cCollision = AtariIo_DrawMissile(
			0,
			SRAM[IO_PRIOR] & 0x10 ? SRAM[IO_COLPF3] : SRAM[IO_COLPM0_TRIG2], 
			SRAM[IO_SIZEM_P0PL],
			cData, 
			cPriorityMask,
			pPriorityData, 
			pDestination,
			((pIoData->cCurrentDisplayListCommand & 0xf) == 0x02 || 
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x03 ||
			(pIoData->cCurrentDisplayListCommand & 0xf) == 0x0f) &&
			(SRAM[IO_PRIOR] & 0xc0) == 0);
#ifndef DISABLE_COLLISIONS
		RAM[IO_HPOSP0_M0PF] |= cCollision & 0x0f;
		RAM[IO_SIZEP0_M0PL] |= cCollision >> 4;
#endif
	}
}

void AtariIoDrawScreen(
	_6502_Context_t *pContext, 
	SDL_Surface *pSdlScreenSurface,
	u32 lScreenWidth,
	u32 lScreenHeight)
{
	SDL_Rect tRect;
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	tRect.x = (16 + 12 + 6 + 10 + 4) * 2 + 160 - lScreenWidth / 2;
	tRect.y = 8;
	tRect.w = lScreenWidth;
	tRect.h = lScreenHeight;
	SDL_BlitSurface(pIoData->tVideoData.pSdlAtariSurface, &tRect, pSdlScreenSurface, NULL);
}

void AtariIoCycleTimedEventUpdate(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	pContext->llIoCycleTimedEventCycle = CYCLE_NEVER;

	pContext->llIoCycleTimedEventCycle = 
		MIN(pIoData->llDrawLineCycle, pContext->llIoCycleTimedEventCycle);

	pContext->llIoCycleTimedEventCycle = 
		MIN(pIoData->llDisplayListFetchCycle, pContext->llIoCycleTimedEventCycle);

	pContext->llIoCycleTimedEventCycle = 
		MIN(pIoData->llDliCycle, pContext->llIoCycleTimedEventCycle);

	pContext->llIoCycleTimedEventCycle = 
		MIN(pIoData->llSerialOutputTransmissionDoneCycle, pContext->llIoCycleTimedEventCycle);

	pContext->llIoCycleTimedEventCycle = 
		MIN(pIoData->llSerialOutputNeedDataCycle, pContext->llIoCycleTimedEventCycle);

	pContext->llIoCycleTimedEventCycle = 
		MIN(pIoData->llSerialInputDataReadyCycle, pContext->llIoCycleTimedEventCycle);

	pContext->llIoCycleTimedEventCycle = 
		MIN(pIoData->llTimer1Cycle, pContext->llIoCycleTimedEventCycle);

	pContext->llIoCycleTimedEventCycle = 
		MIN(pIoData->llTimer2Cycle, pContext->llIoCycleTimedEventCycle);

	pContext->llIoCycleTimedEventCycle = 
		MIN(pIoData->llTimer4Cycle, pContext->llIoCycleTimedEventCycle);
}

static void AtariIo_CycleTimedEvent(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	if(pContext->llCycleCounter >= pIoData->llDisplayListFetchCycle)
	{
		pIoData->tVideoData.lCurrentDisplayLine++;

		if(pIoData->tVideoData.lCurrentDisplayLine >= LINES_PER_SCREEN_PAL)
		{
			pIoData->tVideoData.lCurrentDisplayLine = 0;
			pIoData->lNextDisplayListLine = 8;
		}

		RAM[IO_VCOUNT] = pIoData->tVideoData.lCurrentDisplayLine >> 1;

		AtariIoFetchLine(pContext);		
		
		pIoData->llDisplayListFetchCycle += CYCLES_PER_LINE;
	}

	if(pContext->llCycleCounter >= pIoData->llDliCycle)
	{
		if(SRAM[IO_NMIEN] & NMI_DLI)
		{
#ifdef VERBOSE_DL
			printf("             [%16lld]", pContext->llCycleCounter);
			printf(" DL: %3ld DLI\n", pIoData->tVideoData.lCurrentDisplayLine);
#endif
			RAM[IO_NMIRES_NMIST] |= NMI_DLI;
			_6502_Nmi(pContext);
		}

		pIoData->llDliCycle = CYCLE_NEVER;
	}

	if(pContext->llCycleCounter >= pIoData->llDrawLineCycle)
	{
        if(pIoData->tVideoData.lCurrentDisplayLine == 0)
        	memset(pIoData->tVideoData.pPriorityData, 0, PIXELS_PER_LINE * LINES_PER_SCREEN_PAL);
	
		AtariIoDrawLine(pContext);		
		AtariIoDrawPlayerMissiles(pContext);		

		pIoData->llDrawLineCycle += CYCLES_PER_LINE;
	}

	if(pContext->llCycleCounter >= pIoData->llSerialOutputTransmissionDoneCycle)
	{
#ifdef VERBOSE_SIO
		printf("             [%16lld] SERIAL_OUTPUT_TRANSMISSION_DONE request!\n", pContext->llCycleCounter);
#endif
		if(SRAM[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE)
		{
			RAM[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE;
			_6502_Irq(pContext);
		}

		pIoData->llSerialOutputTransmissionDoneCycle = CYCLE_NEVER;
	}

	if(pContext->llCycleCounter >= pIoData->llSerialOutputNeedDataCycle)
	{
#ifdef VERBOSE_SIO
		printf("             [%16lld] SERIAL_OUTPUT_DATA_NEEDED request!\n", pContext->llCycleCounter);
#endif
		if(SRAM[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_DATA_NEEDED)
		{
			RAM[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_OUTPUT_DATA_NEEDED;
			_6502_Irq(pContext);
		}

		pIoData->llSerialOutputNeedDataCycle = CYCLE_NEVER;
	}

	if(pContext->llCycleCounter >= pIoData->llSerialInputDataReadyCycle)
	{
#ifdef VERBOSE_SIO
		printf("             [%16lld] SERIAL_INPUT_DATA_READY request!\n", pContext->llCycleCounter);
#endif
		if(SRAM[IO_IRQEN_IRQST] & IRQ_SERIAL_INPUT_DATA_READY)
		{
			RAM[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_INPUT_DATA_READY;
			_6502_Irq(pContext);
		}

		pIoData->llSerialInputDataReadyCycle = CYCLE_NEVER;
	}

	if(pContext->llCycleCounter >= pIoData->llTimer1Cycle)
	{
#ifdef VERBOSE_SIO
		printf("             [%16lld] TIMER_1 request!\n", pContext->llCycleCounter);
#endif
		if(SRAM[IO_IRQEN_IRQST] & IRQ_TIMER_1)
		{
			RAM[IO_IRQEN_IRQST] &= ~IRQ_TIMER_1;
			_6502_Irq(pContext);
		}

		pIoData->llTimer1Cycle = CYCLE_NEVER;
	}

	if(pContext->llCycleCounter >= pIoData->llTimer2Cycle)
	{
#ifdef VERBOSE_SIO
		printf("             [%16lld] TIMER_2 request!\n", pContext->llCycleCounter);
#endif
		if(SRAM[IO_IRQEN_IRQST] & IRQ_TIMER_2)
		{
			RAM[IO_IRQEN_IRQST] &= ~IRQ_TIMER_2;
			_6502_Irq(pContext);
		}

		pIoData->llTimer2Cycle = CYCLE_NEVER;
	}

	if(pContext->llCycleCounter >= pIoData->llTimer4Cycle)
	{
#ifdef VERBOSE_SIO
		printf("             [%16lld] TIMER_4 request!\n", pContext->llCycleCounter);
#endif
		if(SRAM[IO_IRQEN_IRQST] & IRQ_TIMER_4)
		{
			RAM[IO_IRQEN_IRQST] &= ~IRQ_TIMER_4;
			_6502_Irq(pContext);
		}

		pIoData->llTimer4Cycle = CYCLE_NEVER;
	}

	AtariIoCycleTimedEventUpdate(pContext);
}

static u8 *AtariIo_DefaultAccess(_6502_Context_t *pContext, u8 *pValue)
{
/*	printf("<$%04X: $%04X", pContext->tCpu.pc, pContext->sAccessAddress);

	if(pValue)
		printf(", $%02X", *pValue);

	printf(">\n");
*/
	return &RAM[pContext->sAccessAddress];
}

void AtariIoOpen(_6502_Context_t *pContext, u32 lMode, char *pDiskFileName)
{
	FILE *pFile;
	IoInitValue_t *pIoInitValue = m_aIoInitValues;
	IoData_t *pIoData;
	SDL_Surface *pSdlAtariSurface;

	if(lMode & 0x1)
		m_cConsolHack = 0x07;

	pSdlAtariSurface = SDL_CreateRGBSurface(
		SDL_SWSURFACE, 
		PIXELS_PER_LINE, 
		312, 
		8, 
		0x000000ff, 
		0x0000ff00, 
		0x00ff0000, 
		0);
	
	if(pSdlAtariSurface == NULL)
	{
		printf("SDL_CreateRGBSurface() failed!\n");

		exit(-1);
	}

	AtariIo_CreatePalette();

	SDL_SetPalette(pSdlAtariSurface, SDL_LOGPAL | SDL_PHYSPAL, m_aAtariColors, 0, 256);

	pIoData = malloc(sizeof(IoData_t));
	pContext->pIoData = pIoData;
	memset(pIoData, 0, sizeof(IoData_t));

	pIoData->pBasicRom = malloc(0x2000);
	pIoData->pOsRom = malloc(0x1000);
	pIoData->pSelfTestRom = malloc(0x0800);
	pIoData->pFloatingPointRom = malloc(0x2800);

	pFile = fopen("ATARIBAS.ROM", "rb");
	fread(pIoData->pBasicRom, 0x2000, 1, pFile);
	memcpy(&RAM[0xa000], pIoData->pBasicRom, 0x2000);
	fclose(pFile);

	pFile = fopen("ATARIXL.ROM", "rb");
	fread(pIoData->pOsRom, 0x1000, 1, pFile);
	memcpy(&RAM[0xc000], pIoData->pOsRom, 0x1000);
	fread(pIoData->pSelfTestRom, 0x0800, 1, pFile);
	fread(pIoData->pFloatingPointRom, 0x2800, 1, pFile);
	memcpy(&RAM[0xd800], pIoData->pFloatingPointRom, 0x2800);
	fclose(pFile);
	
	_6502_SetRom(pContext, 0xa000, 0xbfff);
	_6502_SetRom(pContext, 0xc000, 0xcfff);
	_6502_SetRom(pContext, 0xd000, 0xd7ff);
	_6502_SetRom(pContext, 0xd800, 0xffff);

	pIoData->llDrawLineCycle = CYCLES_PER_LINE + 16;
	pIoData->llDisplayListFetchCycle = CYCLES_PER_LINE;
	pIoData->llDliCycle = CYCLE_NEVER;
	pIoData->llSerialOutputNeedDataCycle = CYCLE_NEVER;
	pIoData->llSerialOutputTransmissionDoneCycle = CYCLE_NEVER;
	pIoData->llSerialInputDataReadyCycle = CYCLE_NEVER;
	pIoData->llTimer1Cycle = CYCLE_NEVER;
	pIoData->llTimer2Cycle = CYCLE_NEVER;
	pIoData->llTimer4Cycle = CYCLE_NEVER;
	AtariIoCycleTimedEventUpdate(pContext);

	pIoData->tVideoData.pSdlAtariSurface = pSdlAtariSurface;

	while(pIoInitValue->sAddress != 0)
	{
		SRAM[pIoInitValue->sAddress] = pIoInitValue->cDefaultValueWrite;
		RAM[pIoInitValue->sAddress] = pIoInitValue->cDefaultValueRead;

		_6502_SetIo(
			pContext,
			pIoInitValue->sAddress,
			pIoInitValue->AccessFunction);
			
		pIoInitValue++;
	}

	pIoData->pDisk1 = (u8 *)malloc(64 * 1024 * 256);
	memset(pIoData->pDisk1, 0, 64 * 1024 * 256);
	
	if(pDiskFileName)
	{
		pFile = fopen(pDiskFileName, "rb");

		if(pFile)
		{
			pIoData->lDiskSize = fread(pIoData->pDisk1, 1, 64 * 1024 * 256, pFile);
			fclose(pFile);
#ifdef VERBOSE_SIO
			printf("Disk name: %s, size = %ld\n", pDiskFileName, pIoData->lDiskSize);
#endif
		}
	}

	pIoData->tVideoData.pPriorityData = (u8 *)malloc(PIXELS_PER_LINE * LINES_PER_SCREEN_PAL);

	if(pIoData->tVideoData.pPriorityData == NULL)
		return;

	memset(pIoData->tVideoData.pPriorityData, 0, PIXELS_PER_LINE * LINES_PER_SCREEN_PAL);

	pContext->IoCycleTimedEventFunction = AtariIo_CycleTimedEvent;
	
	srand(time(0));
}

void AtariIoClose(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	SDL_FreeSurface(pIoData->tVideoData.pSdlAtariSurface);

	free(pIoData->tVideoData.pPriorityData);
	free(pIoData->pDisk1);
	free(pIoData->pBasicRom);
	free(pIoData->pOsRom);
	free(pIoData->pSelfTestRom);
	free(pIoData->pFloatingPointRom);
}

void AtariIoStatus(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	printf("Atari IO status:\n\n");

	printf("CPU cycles: %lld\n\n", pContext->llCycleCounter);
	printf("Vertical line counter: %ld\n\n", pIoData->tVideoData.lCurrentDisplayLine);

	printf("NMIs\n");

	printf("DLI:                             %s, %s\n",
		SRAM[IO_NMIEN] & NMI_DLI ? "enabled " : "disabled",
		RAM[IO_NMIRES_NMIST] & NMI_DLI ? "requested": "not requested");

	printf("VBI:                             %s, %s\n",
		SRAM[IO_NMIEN] & NMI_VBI ? "enabled " : "disabled",
		RAM[IO_NMIRES_NMIST] & NMI_VBI ? "requested": "not requested");

	printf("Reset:                           %s, %s\n",
		SRAM[IO_NMIEN] & NMI_RESET ? "enabled " : "disabled",
		RAM[IO_NMIRES_NMIST] & NMI_RESET ? "requested": "not requested");

	printf("\n");

	printf("IRQs\n");

	printf("Timer 1:                         %s, %s\n",
		SRAM[IO_IRQEN_IRQST] & IRQ_TIMER_1 ? "enabled " : "disabled",
		RAM[IO_IRQEN_IRQST] & IRQ_TIMER_1 ? "not pending": "pending");

	printf("Timer 2:                         %s, %s\n",
		SRAM[IO_IRQEN_IRQST] & IRQ_TIMER_2 ? "enabled " : "disabled",
		RAM[IO_IRQEN_IRQST] & IRQ_TIMER_2 ? "not pending": "pending");

	printf("Timer 4:                         %s, %s\n",
		SRAM[IO_IRQEN_IRQST] & IRQ_TIMER_4 ? "enabled " : "disabled",
		RAM[IO_IRQEN_IRQST] & IRQ_TIMER_4 ? "not pending": "pending");

	printf("Serial output transmission done: %s, %s\n",
		SRAM[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE ? "enabled " : "disabled",
		RAM[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE ? "not pending": "pending");

	printf("Serial output data needed:       %s, %s\n",
		SRAM[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_DATA_NEEDED ? "enabled " : "disabled",
		RAM[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_DATA_NEEDED ? "not pending": "pending");

	printf("Serial input data ready:         %s, %s\n",
		SRAM[IO_IRQEN_IRQST] & IRQ_SERIAL_INPUT_DATA_READY ? "enabled " : "disabled",
		RAM[IO_IRQEN_IRQST] & IRQ_SERIAL_INPUT_DATA_READY ? "not pending": "pending");

	printf("Other key pressed:               %s, %s\n",
		SRAM[IO_IRQEN_IRQST] & IRQ_OTHER_KEY_PRESSED ? "enabled " : "disabled",
		RAM[IO_IRQEN_IRQST] & IRQ_OTHER_KEY_PRESSED ? "not pending": "pending");

	printf("Break key pressed:               %s, %s\n",
		SRAM[IO_IRQEN_IRQST] & IRQ_BREAK_KEY_PRESSED ? "enabled " : "disabled",
		RAM[IO_IRQEN_IRQST] & IRQ_BREAK_KEY_PRESSED ? "not pending": "pending");

	printf("\n");

	printf("PORTA:                           %s, %s\n",
		RAM[IO_PACTL] & 0x01 ? "enabled " : "disabled",
		RAM[IO_PACTL] & 0x80 ? "pending": "not pending");

	printf("PORTB:                           %s, %s\n",
		RAM[IO_PBCTL] & 0x01 ? "enabled " : "disabled",
		RAM[IO_PBCTL] & 0x80 ? "pending": "not pending");

	printf("\n");
}

void AtariIoKeyboardEvent(_6502_Context_t *pContext, SDL_KeyboardEvent *pKeyboardEvent)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	if(pKeyboardEvent->type == SDL_KEYDOWN)
	{
		switch(pKeyboardEvent->keysym.sym)
  		{
    	case SDLK_UP: // Joystick up
    		RAM[IO_PORTA] &= ~0x01;
    		
			break;	
    	
    	case SDLK_DOWN: // Joystick down
    		RAM[IO_PORTA] &= ~0x02;
    		
			break;	

    	case SDLK_LEFT: // Joystick left
    		RAM[IO_PORTA] &= ~0x04;

			break;	

    	case SDLK_RIGHT: // Joystick right
    		RAM[IO_PORTA] &= ~0x08;

			break;	

    	case SDLK_LALT: // Joystick trigger
    		RAM[IO_GRAFP3_TRIG0] = 0;
    		
    		break;

    	case SDLK_F2: // OPTION
			RAM[IO_CONSOL] &= ~0x4;
    		
    		break;

    	case SDLK_F3: // SELECT
			RAM[IO_CONSOL] &= ~0x2;
    		
    		break;

    	case SDLK_F4: // START
			RAM[IO_CONSOL] &= ~0x1;
    		
    		break;

    	case SDLK_F5: // RESET
			_6502_Reset(pContext);
    		
    		break;

    	case SDLK_F8: // BREAK
			if(SRAM[IO_IRQEN_IRQST] & IRQ_BREAK_KEY_PRESSED)
			{
				RAM[IO_IRQEN_IRQST] &= ~IRQ_BREAK_KEY_PRESSED;
				_6502_Irq(pContext);
			}
    		
    		break;

    	case SDLK_F11: // Insert new disk "D1.ATR"
            {
    			FILE *pFile;
		
    			pFile = fopen("D1.ATR", "rb");

    			if(pFile)
    			{
    				pIoData->lDiskSize = fread(pIoData->pDisk1, 1, 64 * 1024 * 256, pFile);
    				fclose(pFile);
#ifdef VERBOSE_SIO
					printf("Disk name: %s, size = %ld\n", "D1.ATR", pIoData->lDiskSize);
#endif
    			}
			}
    		
    		break;

        case SDLK_LSHIFT: // SHIFT
        case SDLK_RSHIFT:
            RAM[IO_SKCTL_SKSTAT] &= ~0x08;
        
            break;
    	
        default:
    		{
    			u8 cKeyCode = m_aKeyCodeTable[pKeyboardEvent->keysym.sym];

    			if(cKeyCode != 255)
    			{
    				if(pKeyboardEvent->keysym.mod & KMOD_CTRL)
    					cKeyCode |= 0x80;

    				if(pKeyboardEvent->keysym.mod & KMOD_SHIFT)
    					cKeyCode |= 0x40;

    				RAM[IO_STIMER_KBCODE] = cKeyCode;

    				if(SRAM[IO_IRQEN_IRQST] & IRQ_OTHER_KEY_PRESSED)
    				{
    					RAM[IO_IRQEN_IRQST] &= ~IRQ_OTHER_KEY_PRESSED;  
    					_6502_Irq(pContext);
    				}

    				pIoData->lKeyPressCounter++;
    				RAM[IO_SKCTL_SKSTAT] &= ~0x04;
                }
            }
            
            break;
        }
	}
    else if(pKeyboardEvent->type == SDL_KEYUP)
	{
		switch(pKeyboardEvent->keysym.sym)
  		{
    	case SDLK_UP: // Joystick up
    		RAM[IO_PORTA] |= 0x01;
    		
			break;	
    	
    	case SDLK_DOWN: // Joystick down
    		RAM[IO_PORTA] |= 0x02;
    		
			break;	

    	case SDLK_LEFT: // Joystick left
    		RAM[IO_PORTA] |= 0x04;

			break;	

    	case SDLK_RIGHT: // Joystick right
    		RAM[IO_PORTA] |= 0x08;

			break;	

    	case SDLK_LALT: // Joystick trigger
    		RAM[IO_GRAFP3_TRIG0] = 1;
    		
    		break;

    	case SDLK_F2: // OPTION
			RAM[IO_CONSOL] |= 0x4;
    		
    		break;

    	case SDLK_F3: // SELECT
			RAM[IO_CONSOL] |= 0x2;
    		
    		break;

    	case SDLK_F4: // START
			RAM[IO_CONSOL] |= 0x1;
    		
    		break;

        case SDLK_LSHIFT: // SHIFT
        case SDLK_RSHIFT:
            RAM[IO_SKCTL_SKSTAT] |= 0x08;
        
            break;
    	
        default:
    		{
    			u8 cKeyCode = m_aKeyCodeTable[pKeyboardEvent->keysym.sym];

    			if(cKeyCode != 255)
                {
                    if(pIoData->lKeyPressCounter > 0)
                        pIoData->lKeyPressCounter--;

                    if(pIoData->lKeyPressCounter == 0)
                        RAM[IO_SKCTL_SKSTAT] |= 0x04;
                }
            }
            
            break;
        }
	}
}

