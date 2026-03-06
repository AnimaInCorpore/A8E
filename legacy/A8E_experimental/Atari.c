/********************************************************************
*
*
*
* Atari
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
#include "Atari.h"
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
	u16 sAddress;
	u8 cDefaultValueWrite;
	u8 cDefaultValueRead;
	u8 *(*AccessFunction)(_6502_Context_t *, u8 *);
} IoInitValue_t;

typedef struct
{
	u32 lLines;
	void (*DrawModeFunction)(_6502_Context_t *, u8 *, u32, u32, u32, u32, u32);
} DrawModeInfo_t;

/********************************************************************
*
*
* Variablen
*
*
********************************************************************/

extern u8 m_cConsolHack;

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

static u32 m_aAlternateAtariColors[] =
{
	0x000000, 0x101010, 0x202020, 0x303030,
	0x404040, 0x505050, 0x606060, 0x707070,
	0x808080, 0x909090, 0xa0a0a0, 0xb0b0b0,
	0xc0c0c0, 0xd0d0d0, 0xe0e0e0, 0xf0f0f0,
	0x340000, 0x460000, 0x580c00, 0x6a1c00,
	0x7c2c00, 0x8e3c00, 0xa04c00, 0xb25c00,
	0xc46c06, 0xd67c0d, 0xe88c14, 0xfa9c1b,
	0xffac22, 0xffbc29, 0xffcc30, 0xffdc37,
	0x550000, 0x650000, 0x760300, 0x871200,
	0x972000, 0xa82f00, 0xb93e00, 0xc94c0c,
	0xda5b18, 0xeb6a24, 0xfb7830, 0xff873c,
	0xff9648, 0xffa454, 0xffb360, 0xffc26c,
	0x660000, 0x750000, 0x840000, 0x93000c,
	0xa2001c, 0xb1102c, 0xc0203c, 0xcf304c,
	0xde405c, 0xed506c, 0xfc607c, 0xff708c,
	0xff809c, 0xff90ac, 0xffa0bc, 0xffb0cc,
	0x500048, 0x5c0054, 0x680060, 0x740b6c,
	0x801878, 0x8c2584, 0x983290, 0xa43f9c,
	0xb04ca8, 0xbc59b4, 0xc866c0, 0xd473cc,
	0xe080d8, 0xec8de4, 0xf89af0, 0xffa7fc,
	0x280048, 0x380058, 0x480068, 0x580278,
	0x681088, 0x781e98, 0x882ca8, 0x983ab8,
	0xa848c8, 0xb856d8, 0xc864e8, 0xd872f8,
	0xe880ff, 0xf88eff, 0xff9cff, 0xffaaff,
	0x220096, 0x3100a2, 0x4108af, 0x5014bb,
	0x6020c8, 0x6f2cd4, 0x7f38e1, 0x8e44ed,
	0x9e50fa, 0xad5cff, 0xbd68ff, 0xcc74ff,
	0xdc80ff, 0xeb8cff, 0xfb98ff, 0xffa4ff,
	0x0000a4, 0x0000b0, 0x0002bc, 0x0c11c8,
	0x1c20d4, 0x2b2fe0, 0x3b3eec, 0x4a4df8,
	0x5a5cff, 0x696bff, 0x797aff, 0x8889ff,
	0x9898ff, 0xa7a7ff, 0xb7b6ff, 0xc6c5ff,
	0x000098, 0x060da4, 0x0f1ab0, 0x1827bc,
	0x2134c8, 0x2a41d4, 0x334ee0, 0x3c5bec,
	0x4568f8, 0x4e75ff, 0x5782ff, 0x608fff,
	0x699cff, 0x72adff, 0x7bbeff, 0x84cfff,
	0x000066, 0x001075, 0x002084, 0x003093,
	0x0040a2, 0x0850b1, 0x1260c0, 0x1c70cf,
	0x2680de, 0x3090ed, 0x3aa0fc, 0x44b0ff,
	0x4ec0ff, 0x58d0ff, 0x62e0ff, 0x6cf0ff,
	0x001400, 0x042400, 0x0b3400, 0x124410,
	0x185420, 0x1f6430, 0x267440, 0x2c8450,
	0x339460, 0x3aa470, 0x40b480, 0x47c490,
	0x4ed4a0, 0x54e4b0, 0x5bf4c0, 0x62ffd0,
	0x001100, 0x002100, 0x003201, 0x094305,
	0x185308, 0x27640b, 0x37750f, 0x468512,
	0x559615, 0x65a719, 0x74b71c, 0x83c81f,
	0x93d923, 0xa2e926, 0xb1fa29, 0xc1ff2d,
	0x001200, 0x002100, 0x003000, 0x0f4000,
	0x204f00, 0x315e00, 0x436e00, 0x547d00,
	0x658c00, 0x779c00, 0x88ab00, 0x99ba00,
	0xabca00, 0xbcd900, 0xcde800, 0xdff800,
	0x000800, 0x0c1800, 0x1d2800, 0x2f3800,
	0x404800, 0x515800, 0x636800, 0x747800,
	0x858800, 0x979800, 0xa8a800, 0xb9b800,
	0xcbc800, 0xdcd800, 0xede800, 0xfff800,
	0x0a0000, 0x1d0e00, 0x301d00, 0x442d00,
	0x573c00, 0x6a4b00, 0x7e5b00, 0x916a00,
	0xa47900, 0xb88900, 0xcb9800, 0xdea700,
	0xf2b700, 0xffc600, 0xffd500, 0xffe500,
	0x320000, 0x440100, 0x571000, 0x6a2000,
	0x7c2f00, 0x8f3e03, 0xa24e07, 0xb45d0a,
	0xc76c0d, 0xda7c11, 0xec8b14, 0xff9a17,
	0xffaa1b, 0xffb91e, 0xffc821, 0xffd825
};

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

static u16 m_aGtiaMode10ColorTable[] = 
{ 
	IO_COLPM0_TRIG2, IO_COLPM1_TRIG3, IO_COLPM2_PAL, IO_COLPM3,
	IO_COLPF0, IO_COLPF1, IO_COLPF2, IO_COLPF3,
	IO_COLBK, IO_COLBK, IO_COLBK, IO_COLBK,
	IO_COLPF0, IO_COLPF1, IO_COLPF2, IO_COLPF3
};

static u16 m_aAnticMode4Table[] = 
{ 
	IO_COLBK, IO_COLPF0, IO_COLPF1, IO_COLPF2 
};

static u16 m_aAnticMode4InvertedTable[] = 
{ 
	IO_COLBK, IO_COLPF0, IO_COLPF1, IO_COLPF3 
};

static u16 m_aAnticMode6Table[] = 
{ 
	IO_COLPF0, IO_COLPF1, IO_COLPF2, IO_COLPF3
};

static void Atari_DrawBlank(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawMode2(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawMode3(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawMode4(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawMode5(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawMode6(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawMode7(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawMode8(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawMode9(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawModeA(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawModeB(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawModeC(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawModeD(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawModeE(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static void Atari_DrawModeF(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles);

static DrawModeInfo_t m_aDrawModeInfoTable[16] =
{
	{ 0, Atari_DrawBlank },
	{ 0, Atari_DrawBlank },
	{ 8, Atari_DrawMode2 },
	{ 10, Atari_DrawMode3 },
	{ 8, Atari_DrawMode4 },
	{ 16, Atari_DrawMode5 },
	{ 8, Atari_DrawMode6 },
	{ 16, Atari_DrawMode7 },
	{ 8, Atari_DrawMode8 },
	{ 4, Atari_DrawMode9 },
	{ 4, Atari_DrawModeA },
	{ 2, Atari_DrawModeB },
	{ 1, Atari_DrawModeC },
	{ 2, Atari_DrawModeD },
	{ 1, Atari_DrawModeE },
	{ 1, Atari_DrawModeF },
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

static void Atari_CreatePalette()
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

static void Atari_CreateAlternatePalette()
{
	u32 lIndex;

	for(lIndex = 0; lIndex < 256; lIndex++)
	{
		m_aAtariColors[lIndex].r = (m_aAlternateAtariColors[lIndex] >> 16) & 0xff;
		m_aAtariColors[lIndex].g = (m_aAlternateAtariColors[lIndex] >> 8) & 0xff;
		m_aAtariColors[lIndex].b = m_aAlternateAtariColors[lIndex] & 0xff;
	}
}

void AtariDrawScreen(
	_6502_Context_t *pContext, 
	SDL_Surface *pSdlScreenSurface,
	u32 lScreenWidth,
	u32 lScreenHeight)
{
	SDL_Rect tRect;
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	tRect.x = (16 + 12 + 6 + 10 + 4) * 2 + 160 - lScreenWidth / 2;
	tRect.y = 8;
	tRect.w = lScreenWidth;
	tRect.h = lScreenHeight;
	SDL_BlitSurface(pAtariData->pSdlSurface, &tRect, pSdlScreenSurface, NULL);
}

void AtariTimedEventUpdate(_6502_Context_t *pContext)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	pAtariData->llEventCycle = CYCLE_NEVER;

	pAtariData->llEventCycle = 
		MIN(pAtariData->llEventCycle, pAtariData->llDliCycle);

	pAtariData->llEventCycle = 
		MIN(pAtariData->llEventCycle, pAtariData->llSerialOutputNeedDataCycle);

	pAtariData->llEventCycle = 
		MIN(pAtariData->llEventCycle, pAtariData->llSerialOutputTransmissionDoneCycle);

	pAtariData->llEventCycle = 
		MIN(pAtariData->llEventCycle, pAtariData->llSerialInputDataReadyCycle);

	pAtariData->llEventCycle = 
		MIN(pAtariData->llEventCycle, pAtariData->llTimer1Cycle);

	pAtariData->llEventCycle = 
		MIN(pAtariData->llEventCycle, pAtariData->llTimer2Cycle);

	pAtariData->llEventCycle = 
		MIN(pAtariData->llEventCycle, pAtariData->llTimer4Cycle);
}

static void Atari_TimedEvent(_6502_Context_t *pContext)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	// Event: DLI

	if(pAtariData->llCycle >= pAtariData->llDliCycle)
	{
		if(SRAM[IO_NMIEN] & NMI_DLI)
		{
#ifdef VERBOSE_DL
			printf("             [%16lld]", pContext->llCycleCounter);
			printf(" DL: %3ld DLI\n", pAtariData->lDisplayLine);
#endif
			RAM[IO_NMIRES_NMIST] |= NMI_DLI;
			_6502_Nmi(pContext);
		}

		pAtariData->llDliCycle = CYCLE_NEVER;
	}

	// Event: SIO output done

	if(pAtariData->llCycle >= pAtariData->llSerialOutputTransmissionDoneCycle)
	{
#ifdef VERBOSE_SIO
		printf("             [%16lld] SERIAL_OUTPUT_TRANSMISSION_DONE request!\n", pContext->llCycleCounter);
#endif
		if(SRAM[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE)
		{
			RAM[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE;
			_6502_Irq(pContext);
		}

		pAtariData->llSerialOutputTransmissionDoneCycle = CYCLE_NEVER;
	}

	// Event: SIO output need data

	if(pAtariData->llCycle >= pAtariData->llSerialOutputNeedDataCycle)
	{
#ifdef VERBOSE_SIO
		printf("             [%16lld] SERIAL_OUTPUT_DATA_NEEDED request!\n", pContext->llCycleCounter);
#endif
		if(SRAM[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_DATA_NEEDED)
		{
			RAM[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_OUTPUT_DATA_NEEDED;
			_6502_Irq(pContext);
		}

		pAtariData->llSerialOutputNeedDataCycle = CYCLE_NEVER;
	}

	// Event: SIO input ready

	if(pAtariData->llCycle >= pAtariData->llSerialInputDataReadyCycle)
	{
#ifdef VERBOSE_SIO
		printf("             [%16lld] SERIAL_INPUT_DATA_READY request!\n", pContext->llCycleCounter);
#endif
		if(SRAM[IO_IRQEN_IRQST] & IRQ_SERIAL_INPUT_DATA_READY)
		{
			RAM[IO_IRQEN_IRQST] &= ~IRQ_SERIAL_INPUT_DATA_READY;
			_6502_Irq(pContext);
		}

		pAtariData->llSerialInputDataReadyCycle = CYCLE_NEVER;
	}

	// Event: POKEY timer 1

	if(pAtariData->llCycle >= pAtariData->llTimer1Cycle)
	{
#ifdef VERBOSE_SIO
		printf("             [%16lld] TIMER_1 request!\n", pContext->llCycleCounter);
#endif
		if(SRAM[IO_IRQEN_IRQST] & IRQ_TIMER_1)
		{
			RAM[IO_IRQEN_IRQST] &= ~IRQ_TIMER_1;
			_6502_Irq(pContext);
		}

		pAtariData->llTimer1Cycle = CYCLE_NEVER;
	}

	// Event: POKEY timer 2

	if(pAtariData->llCycle >= pAtariData->llTimer2Cycle)
	{
#ifdef VERBOSE_SIO
		printf("             [%16lld] TIMER_2 request!\n", pContext->llCycleCounter);
#endif
		if(SRAM[IO_IRQEN_IRQST] & IRQ_TIMER_2)
		{
			RAM[IO_IRQEN_IRQST] &= ~IRQ_TIMER_2;
			_6502_Irq(pContext);
		}

		pAtariData->llTimer2Cycle = CYCLE_NEVER;
	}

	// Event: POKEY timer 4

	if(pAtariData->llCycle >= pAtariData->llTimer4Cycle)
	{
#ifdef VERBOSE_SIO
		printf("             [%16lld] TIMER_4 request!\n", pContext->llCycleCounter);
#endif
		if(SRAM[IO_IRQEN_IRQST] & IRQ_TIMER_4)
		{
			RAM[IO_IRQEN_IRQST] &= ~IRQ_TIMER_4;
			_6502_Irq(pContext);
		}

		pAtariData->llTimer4Cycle = CYCLE_NEVER;
	}

	AtariTimedEventUpdate(pContext);
}

#define ATARI_LINE_ACTION() \
{ \
	pAtariData->lDisplayLine++; \
	RAM[IO_VCOUNT] = pAtariData->lDisplayLine >> 1; \
	RAM[IO_NMIRES_NMIST] &= ~NMI_DLI; \
	pContext->llCycleCounter += 9; \
}

#define ATARI_CLOCK_ACTION() \
{ \
	if(pAtariData->llEventCycle <= pAtariData->llCycle) \
		Atari_TimedEvent(pContext); \
	if(pContext->llCycleCounter < pAtariData->llCycle) \
		_6502_Execute(pContext); \
	pAtariData->llCycle++; \
}

static void Atari_DrawInvisible(_6502_Context_t *pContext, u32 lLines)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;
	u32 lLine;
	u32 lCycle;

	for(lLine = 0; lLine < lLines; lLine++)
	{
		for(lCycle = 0; lCycle < CYCLES_PER_LINE; lCycle++)
		{
			ATARI_CLOCK_ACTION();
		}

		ATARI_LINE_ACTION();
	}
}
		
static void Atari_DrawBlank(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;
	u32 lLine;
	u32 lCycle;

	for(lLine = 0; lLine < lLines; lLine++)
	{
		for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
		{
			pPixel += 4;
			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < CYCLES_PER_LINE - COLOR_BURST_CYCLES; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		ATARI_LINE_ACTION();
	}
}
		
static void Atari_DrawMode2(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lLine;
	u32 lCycle;
	u16 sDisplayMemoryAddress;
	u16 sOldDisplayMemoryAddress;
	u16 sCharacterBaseAddress = 0x0000;
	u8 cCharacter;
	u8 cData = 0x00;
	u8 cMask;
	u8 cColor;

	sOldDisplayMemoryAddress = sDisplayMemoryAddress = pAtariData->sDisplayMemoryAddress;

	for(lLine = 0; lLine < lLines; lLine++, lLineOffset++)
	{
		sDisplayMemoryAddress = sOldDisplayMemoryAddress;

		for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
		{
			pPixel += 4;
			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		cMask = 0x00;

		for(lCycle = 0; lCycle < lPlayfieldCycles; lCycle++)
		{
			if(cMask == 0x00)
			{
				if(lLine == 0)
					sCharacterBaseAddress = (SRAM[IO_CHBASE] << 8) & 0xfc00;

				cCharacter = RAM[sDisplayMemoryAddress] & 0x7f;
				cData = RAM[sCharacterBaseAddress + (cCharacter << 3) + lLineOffset]; 
				pContext->llCycleCounter++;	

				if(RAM[sDisplayMemoryAddress] & 0x80)
					cData ^= 0xff;

				cMask = 0x80;

				FIXED_ADD(sDisplayMemoryAddress, 0x0fff, 1);

				if(lLine == 0)
				{
					FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
					pContext->llCycleCounter++;	
				}
			}

			if((SRAM[IO_PRIOR] & 0xc0) == 0x00)
			{
				if(cData & cMask)
					*pPixel++ = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
				else
					*pPixel++ = SRAM[IO_COLPF2];

				cMask >>= 1;

				if(cData & cMask)
					*pPixel++ = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
				else
					*pPixel++ = SRAM[IO_COLPF2];

				cMask >>= 1;

				if(cData & cMask)
					*pPixel++ = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
				else
					*pPixel++ = SRAM[IO_COLPF2];

				cMask >>= 1;

				if(cData & cMask)
					*pPixel++ = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
				else
					*pPixel++ = SRAM[IO_COLPF2];

				cMask >>= 1;
			}
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x40)
			{
				if(cMask > 0x08)
				{
					cColor = SRAM[IO_COLBK] | (cData >> 4);

					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
				}
				else
				{
					cColor = SRAM[IO_COLBK] | (cData & 0x0f);

					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
				}

				cMask >>= 4;
			}
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				if(cMask > 0x08)
				{
					cColor = SRAM[m_aGtiaMode10ColorTable[cData >> 4]];

					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
				}
				else
				{
					cColor = SRAM[m_aGtiaMode10ColorTable[cData & 0x0f]];

					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
				}

				cMask >>= 4;
			}
			else
			{
				if(cMask > 0x08)
				{
					cColor = (cData & 0xf0) ? (SRAM[IO_COLBK] | (cData & 0xf0)) : (SRAM[IO_COLBK] & 0xf0);
	
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
				}
				else
				{
					cColor = (cData & 0x0f) ? (SRAM[IO_COLBK] | (cData << 4)) : (SRAM[IO_COLBK] & 0xf0);

					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
				}

				cMask >>= 4;
			}

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		ATARI_LINE_ACTION();
	}
}    

static void Atari_DrawMode3(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lLine;
	u32 lCycle;
	u16 sDisplayMemoryAddress;
	u16 sOldDisplayMemoryAddress;
	u16 sCharacterBaseAddress = 0x0000;
	u8 cCharacter;
	u8 cData = 0x00;
	u8 cMask;
	u8 cColor;

	sOldDisplayMemoryAddress = sDisplayMemoryAddress = pAtariData->sDisplayMemoryAddress;

	for(lLine = 0; lLine < lLines; lLine++, lLineOffset++)
	{
		sDisplayMemoryAddress = sOldDisplayMemoryAddress;

		for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
		{
			pPixel += 4;
			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		cMask = 0x00;

		for(lCycle = 0; lCycle < lPlayfieldCycles; lCycle++)
		{
			if(cMask == 0x00)
			{
				if(lLine == 0)
					sCharacterBaseAddress = (SRAM[IO_CHBASE] << 8) & 0xfc00;

				cCharacter = RAM[sDisplayMemoryAddress] & 0x7f;
				cData = RAM[sCharacterBaseAddress + (cCharacter << 3) + lLineOffset]; 
				pContext->llCycleCounter++;	

				if(cCharacter < 0x60)
				{
					if(lLine < 8)
						cData = RAM[((SRAM[IO_CHBASE] << 8) & 0xfc00) + (cCharacter << 3) + lLineOffset]; 
					else
						cData = 0x00;
				}
				else
				{
					if(lLine < 2)
						cData = 0x00;
					else if(lLine < 8)
						cData = RAM[((SRAM[IO_CHBASE] << 8) & 0xfc00) + (cCharacter << 3) + lLineOffset]; 
					else
						cData = RAM[((SRAM[IO_CHBASE] << 8) & 0xfc00) + (cCharacter << 3) + lLineOffset - 8]; 
				}

				if(RAM[sDisplayMemoryAddress] & 0x80)
					cData ^= 0xff;

				cMask = 0x80;

				FIXED_ADD(sDisplayMemoryAddress, 0x0fff, 1);

				if(lLine == 0)
				{
					FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
					pContext->llCycleCounter++;	
				}
			}

			if((SRAM[IO_PRIOR] & 0xc0) == 0x00)
			{
				if(cData & cMask)
					*pPixel++ = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
				else
					*pPixel++ = SRAM[IO_COLPF2];

				cMask >>= 1;

				if(cData & cMask)
					*pPixel++ = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
				else
					*pPixel++ = SRAM[IO_COLPF2];

				cMask >>= 1;

				if(cData & cMask)
					*pPixel++ = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
				else
					*pPixel++ = SRAM[IO_COLPF2];

				cMask >>= 1;

				if(cData & cMask)
					*pPixel++ = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
				else
					*pPixel++ = SRAM[IO_COLPF2];

				cMask >>= 1;
			}
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x40)
			{
				if(cMask > 0x08)
				{
					cColor = SRAM[IO_COLBK] | (cData >> 4);

					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
				}
				else
				{
					cColor = SRAM[IO_COLBK] | (cData & 0x0f);

					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
				}

				cMask >>= 4;
			}
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				if(cMask > 0x08)
				{
					cColor = SRAM[m_aGtiaMode10ColorTable[cData >> 4]];

					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
				}
				else
				{
					cColor = SRAM[m_aGtiaMode10ColorTable[cData & 0x0f]];

					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
				}

				cMask >>= 4;
			}
			else
			{
				if(cMask > 0x08)
				{
					cColor = (cData & 0xf0) ? (SRAM[IO_COLBK] | (cData & 0xf0)) : (SRAM[IO_COLBK] & 0xf0);
	
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
				}
				else
				{
					cColor = (cData & 0x0f) ? (SRAM[IO_COLBK] | (cData << 4)) : (SRAM[IO_COLBK] & 0xf0);

					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
					*pPixel++ = cColor;
				}

				cMask >>= 4;
			}

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		ATARI_LINE_ACTION();
	}
}    

static void Atari_DrawMode4(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lLine;
	u32 lCycle;
	u16 sDisplayMemoryAddress;
	u16 sOldDisplayMemoryAddress;
	u16 sCharacterBaseAddress = 0x0000;
	u8 cCharacter;
	u8 cData;
	u8 cColor;
	u16 *pColorTable;

	sOldDisplayMemoryAddress = sDisplayMemoryAddress = pAtariData->sDisplayMemoryAddress;

	for(lLine = 0; lLine < lLines; lLine++, lLineOffset++)
	{
		sDisplayMemoryAddress = sOldDisplayMemoryAddress;

		for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
		{
			pPixel += 4;
			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < (lPlayfieldCycles >> 1); lCycle++)
		{
			if(lLine == 0)
				sCharacterBaseAddress = (SRAM[IO_CHBASE] << 8) & 0xfc00;

			cCharacter = RAM[sDisplayMemoryAddress] & 0x7f;
			cData = RAM[sCharacterBaseAddress + (cCharacter << 3) + lLineOffset]; 
			pContext->llCycleCounter++;	

			if(RAM[sDisplayMemoryAddress] & 0x80)
				pColorTable = m_aAnticMode4InvertedTable;
			else
				pColorTable = m_aAnticMode4Table;

			FIXED_ADD(sDisplayMemoryAddress, 0x0fff, 1);

			if(lLine == 0)
			{
				FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
				pContext->llCycleCounter++;	
			}

			cColor = SRAM[pColorTable[(cData >> 6) & 0x03]];
			*pPixel++ = cColor;
			*pPixel++ = cColor;

			cColor = SRAM[pColorTable[(cData >> 4) & 0x03]];
			*pPixel++ = cColor;
			*pPixel++ = cColor;

			ATARI_CLOCK_ACTION();

			cColor = SRAM[pColorTable[(cData >> 2) & 0x03]];
			*pPixel++ = cColor;
			*pPixel++ = cColor;

			cColor = SRAM[pColorTable[cData & 0x03]];
			*pPixel++ = cColor;
			*pPixel++ = cColor;

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		ATARI_LINE_ACTION();
	}
}    

static void Atari_DrawMode5(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lLine;
	u32 lCycle;
	u16 sDisplayMemoryAddress;
	u16 sOldDisplayMemoryAddress;
	u16 sCharacterBaseAddress = 0x0000;
	u8 cCharacter;
	u8 cData;
	u8 cColor;
	u16 *pColorTable;

	sOldDisplayMemoryAddress = sDisplayMemoryAddress = pAtariData->sDisplayMemoryAddress;

	for(lLine = 0; lLine < lLines; lLine++, lLineOffset++)
	{
		sDisplayMemoryAddress = sOldDisplayMemoryAddress;

		for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
		{
			pPixel += 4;
			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < (lPlayfieldCycles >> 1); lCycle++)
		{
			if(lLine == 0)
				sCharacterBaseAddress = (SRAM[IO_CHBASE] << 8) & 0xfe00;

			cCharacter = RAM[sDisplayMemoryAddress] & 0x7f;
			cData = RAM[sCharacterBaseAddress + (cCharacter << 3) + (lLineOffset >> 1)]; 

			if((lLine & 1) == 0)
				pContext->llCycleCounter++;	

			if(RAM[sDisplayMemoryAddress] & 0x80)
				pColorTable = m_aAnticMode4InvertedTable;
			else
				pColorTable = m_aAnticMode4Table;

			FIXED_ADD(sDisplayMemoryAddress, 0x0fff, 1);

			if(lLine == 0)
			{
				FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
				pContext->llCycleCounter++;	
			}

			cColor = SRAM[pColorTable[(cData >> 6) & 0x03]];
			*pPixel++ = cColor;
			*pPixel++ = cColor;

			cColor = SRAM[pColorTable[(cData >> 4) & 0x03]];
			*pPixel++ = cColor;
			*pPixel++ = cColor;

			ATARI_CLOCK_ACTION();

			cColor = SRAM[pColorTable[(cData >> 2) & 0x03]];
			*pPixel++ = cColor;
			*pPixel++ = cColor;

			cColor = SRAM[pColorTable[cData & 0x03]];
			*pPixel++ = cColor;
			*pPixel++ = cColor;

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		ATARI_LINE_ACTION();
	}
}    

static void Atari_DrawMode6(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lLine;
	u32 lCycle;
	u16 sDisplayMemoryAddress;
	u16 sOldDisplayMemoryAddress;
	u16 sCharacterBaseAddress = 0x0000;
	u8 cCharacter;
	u8 cData;
	u16 sColorAddress;

	sOldDisplayMemoryAddress = sDisplayMemoryAddress = pAtariData->sDisplayMemoryAddress;

	for(lLine = 0; lLine < lLines; lLine++, lLineOffset++)
	{
		sDisplayMemoryAddress = sOldDisplayMemoryAddress;

		for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
		{
			pPixel += 4;
			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < (lPlayfieldCycles >> 2); lCycle++)
		{
			if(lLine == 0)
				sCharacterBaseAddress = (SRAM[IO_CHBASE] << 8) & 0xfe00;

			cCharacter = RAM[sDisplayMemoryAddress] & 0x3f;
			cData = RAM[sCharacterBaseAddress + (cCharacter << 3) + lLineOffset]; 
			pContext->llCycleCounter++;	

			sColorAddress = m_aAnticMode6Table[RAM[sDisplayMemoryAddress] >> 6];

			FIXED_ADD(sDisplayMemoryAddress, 0x0fff, 1);

			if(lLine == 0)
			{
				FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
				pContext->llCycleCounter++;	
			}

			if(cData & 0x80)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			if(cData & 0x40)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			ATARI_CLOCK_ACTION();

			if(cData & 0x20)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			if(cData & 0x10)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			ATARI_CLOCK_ACTION();

			if(cData & 0x08)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			if(cData & 0x04)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			ATARI_CLOCK_ACTION();

			if(cData & 0x02)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			if(cData & 0x01)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		ATARI_LINE_ACTION();
	}
}

static void Atari_DrawMode7(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lLine;
	u32 lCycle;
	u16 sDisplayMemoryAddress;
	u16 sOldDisplayMemoryAddress;
	u16 sCharacterBaseAddress = 0x0000;
	u8 cCharacter;
	u8 cData;
	u16 sColorAddress;

	sOldDisplayMemoryAddress = sDisplayMemoryAddress = pAtariData->sDisplayMemoryAddress;

	for(lLine = 0; lLine < lLines; lLine++, lLineOffset++)
	{
		sDisplayMemoryAddress = sOldDisplayMemoryAddress;

		for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
		{
			pPixel += 4;
			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < (lPlayfieldCycles >> 2); lCycle++)
		{
			if(lLine == 0)
				sCharacterBaseAddress = (SRAM[IO_CHBASE] << 8) & 0xfe00;

			cCharacter = RAM[sDisplayMemoryAddress] & 0x3f;
			cData = RAM[sCharacterBaseAddress + (cCharacter << 3) + (lLineOffset >> 1)]; 

			if((lLine & 1) == 0)
				pContext->llCycleCounter++;	

			sColorAddress = m_aAnticMode6Table[RAM[sDisplayMemoryAddress] >> 6];

			FIXED_ADD(sDisplayMemoryAddress, 0x0fff, 1);

			if(lLine == 0)
			{
				FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
				pContext->llCycleCounter++;	
			}

			if(cData & 0x80)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			if(cData & 0x40)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			ATARI_CLOCK_ACTION();

			if(cData & 0x20)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			if(cData & 0x10)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			ATARI_CLOCK_ACTION();

			if(cData & 0x08)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			if(cData & 0x04)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			ATARI_CLOCK_ACTION();

			if(cData & 0x02)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			if(cData & 0x01)
			{
				*pPixel++ = SRAM[sColorAddress];
				*pPixel++ = SRAM[sColorAddress];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		ATARI_LINE_ACTION();
	}
}

static void Atari_DrawMode8(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lLine;
	u32 lCycle;
	u16 sDisplayMemoryAddress;
	u16 sOldDisplayMemoryAddress;
	u8 cData;
	u16 sColorAddress;

	sOldDisplayMemoryAddress = sDisplayMemoryAddress = pAtariData->sDisplayMemoryAddress;

	for(lLine = 0; lLine < lLines; lLine++)
	{
		sDisplayMemoryAddress = sOldDisplayMemoryAddress;

		for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
		{
			pPixel += 4;
			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < (lPlayfieldCycles >> 3); lCycle++)
		{
			cData = RAM[sDisplayMemoryAddress]; 
			FIXED_ADD(sDisplayMemoryAddress, 0x0fff, 1);

			if(lLine == 0)
			{
				FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
				pContext->llCycleCounter++;	
			}

			sColorAddress = m_aAnticMode4Table[(cData >> 6) & 0x03];

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();

			sColorAddress = m_aAnticMode4Table[(cData >> 4) & 0x03];

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();

			sColorAddress = m_aAnticMode4Table[(cData >> 2) & 0x03];

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();

			sColorAddress = m_aAnticMode4Table[cData & 0x03];

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		ATARI_LINE_ACTION();
	}
}

static void Atari_DrawMode9(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lLine;
	u32 lCycle;
	u16 sDisplayMemoryAddress;
	u16 sOldDisplayMemoryAddress;
	u8 cData;

	sOldDisplayMemoryAddress = sDisplayMemoryAddress = pAtariData->sDisplayMemoryAddress;

	for(lLine = 0; lLine < lLines; lLine++)
	{
		sDisplayMemoryAddress = sOldDisplayMemoryAddress;

		for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
		{
			pPixel += 4;
			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < (lPlayfieldCycles >> 3); lCycle++)
		{
			cData = RAM[sDisplayMemoryAddress]; 
			FIXED_ADD(sDisplayMemoryAddress, 0x0fff, 1);

			if(lLine == 0)
			{
				FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
				pContext->llCycleCounter++;	
			}

			if(cData & 0x80)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];

				ATARI_CLOCK_ACTION();
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];

				ATARI_CLOCK_ACTION();
			}

			if(cData & 0x40)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];

				ATARI_CLOCK_ACTION();
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];

				ATARI_CLOCK_ACTION();
			}

			if(cData & 0x20)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];

				ATARI_CLOCK_ACTION();
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];

				ATARI_CLOCK_ACTION();
			}

			if(cData & 0x10)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];

				ATARI_CLOCK_ACTION();
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];

				ATARI_CLOCK_ACTION();
			}

			if(cData & 0x08)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];

				ATARI_CLOCK_ACTION();
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];

				ATARI_CLOCK_ACTION();
			}

			if(cData & 0x04)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];

				ATARI_CLOCK_ACTION();
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];

				ATARI_CLOCK_ACTION();
			}

			if(cData & 0x02)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];

				ATARI_CLOCK_ACTION();
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];

				ATARI_CLOCK_ACTION();
			}

			if(cData & 0x01)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];

				ATARI_CLOCK_ACTION();
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];

				ATARI_CLOCK_ACTION();
			}
		}

		for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		ATARI_LINE_ACTION();
	}
}

static void Atari_DrawModeA(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lLine;
	u32 lCycle;
	u16 sDisplayMemoryAddress;
	u16 sOldDisplayMemoryAddress;
	u8 cData;
	u16 sColorAddress;

	sOldDisplayMemoryAddress = sDisplayMemoryAddress = pAtariData->sDisplayMemoryAddress;

	for(lLine = 0; lLine < lLines; lLine++)
	{
		sDisplayMemoryAddress = sOldDisplayMemoryAddress;

		for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
		{
			pPixel += 4;
			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < (lPlayfieldCycles >> 2); lCycle++)
		{
			cData = RAM[sDisplayMemoryAddress]; 
			FIXED_ADD(sDisplayMemoryAddress, 0x0fff, 1);

			if(lLine == 0)
			{
				FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
				pContext->llCycleCounter++;	
			}

			sColorAddress = m_aAnticMode4Table[(cData >> 6) & 0x03];

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();

			sColorAddress = m_aAnticMode4Table[(cData >> 4) & 0x03];

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();

			sColorAddress = m_aAnticMode4Table[(cData >> 2) & 0x03];

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();

			sColorAddress = m_aAnticMode4Table[cData & 0x03];

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		ATARI_LINE_ACTION();
	}
}

static void Atari_DrawModeB(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lLine;
	u32 lCycle;
	u16 sDisplayMemoryAddress;
	u16 sOldDisplayMemoryAddress;
	u8 cData;

	sOldDisplayMemoryAddress = sDisplayMemoryAddress = pAtariData->sDisplayMemoryAddress;

	for(lLine = 0; lLine < lLines; lLine++)
	{
		sDisplayMemoryAddress = sOldDisplayMemoryAddress;

		for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
		{
			pPixel += 4;
			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < (lPlayfieldCycles >> 2); lCycle++)
		{
			cData = RAM[sDisplayMemoryAddress]; 
			FIXED_ADD(sDisplayMemoryAddress, 0x0fff, 1);

			if(lLine == 0)
			{
				FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
				pContext->llCycleCounter++;	
			}

			if(cData & 0x80)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			if(cData & 0x40)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			ATARI_CLOCK_ACTION();

			if(cData & 0x20)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			if(cData & 0x10)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			ATARI_CLOCK_ACTION();

			if(cData & 0x08)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			if(cData & 0x04)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			ATARI_CLOCK_ACTION();

			if(cData & 0x02)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			if(cData & 0x01)
			{
				*pPixel++ = SRAM[IO_COLPF0];
				*pPixel++ = SRAM[IO_COLPF0];
			}
			else
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		ATARI_LINE_ACTION();
	}
}

static void Atari_DrawModeC(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lCycle;
	u8 cData;

	for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
	{
		pPixel += 4;
		ATARI_CLOCK_ACTION();
	}

	for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
	{
		if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}	
		else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
		{
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
		}	
		else
		{
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
		}	

		ATARI_CLOCK_ACTION();
	}

	for(lCycle = 0; lCycle < (lPlayfieldCycles >> 2); lCycle++)
	{
		cData = RAM[pAtariData->sDisplayMemoryAddress]; 
		FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
		pContext->llCycleCounter++;	

		if(cData & 0x80)
		{
			*pPixel++ = SRAM[IO_COLPF0];
			*pPixel++ = SRAM[IO_COLPF0];
		}
		else
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}

		if(cData & 0x40)
		{
			*pPixel++ = SRAM[IO_COLPF0];
			*pPixel++ = SRAM[IO_COLPF0];
		}
		else
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}

		ATARI_CLOCK_ACTION();

		if(cData & 0x20)
		{
			*pPixel++ = SRAM[IO_COLPF0];
			*pPixel++ = SRAM[IO_COLPF0];
		}
		else
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}

		if(cData & 0x10)
		{
			*pPixel++ = SRAM[IO_COLPF0];
			*pPixel++ = SRAM[IO_COLPF0];
		}
		else
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}

		ATARI_CLOCK_ACTION();

		if(cData & 0x08)
		{
			*pPixel++ = SRAM[IO_COLPF0];
			*pPixel++ = SRAM[IO_COLPF0];
		}
		else
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}

		if(cData & 0x04)
		{
			*pPixel++ = SRAM[IO_COLPF0];
			*pPixel++ = SRAM[IO_COLPF0];
		}
		else
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}

		ATARI_CLOCK_ACTION();

		if(cData & 0x02)
		{
			*pPixel++ = SRAM[IO_COLPF0];
			*pPixel++ = SRAM[IO_COLPF0];
		}
		else
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}

		if(cData & 0x01)
		{
			*pPixel++ = SRAM[IO_COLPF0];
			*pPixel++ = SRAM[IO_COLPF0];
		}
		else
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}

		ATARI_CLOCK_ACTION();
	}

	for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
	{
		if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}	
		else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
		{
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
		}	
		else
		{
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
		}	

		ATARI_CLOCK_ACTION();
	}

	ATARI_LINE_ACTION();
}

static void Atari_DrawModeD(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lLine;
	u32 lCycle;
	u16 sDisplayMemoryAddress;
	u16 sOldDisplayMemoryAddress;
	u8 cData;
	u16 sColorAddress;

	sOldDisplayMemoryAddress = sDisplayMemoryAddress = pAtariData->sDisplayMemoryAddress;

	for(lLine = 0; lLine < lLines; lLine++)
	{
		sDisplayMemoryAddress = sOldDisplayMemoryAddress;

		for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
		{
			pPixel += 4;
			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < (lPlayfieldCycles >> 1); lCycle++)
		{
			cData = RAM[sDisplayMemoryAddress]; 
			FIXED_ADD(sDisplayMemoryAddress, 0x0fff, 1);

			if(lLine == 0)
			{
				FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
				pContext->llCycleCounter++;	
			}

			sColorAddress = m_aAnticMode4Table[(cData >> 6) & 0x03];

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			sColorAddress = m_aAnticMode4Table[(cData >> 4) & 0x03];

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();

			sColorAddress = m_aAnticMode4Table[(cData >> 2) & 0x03];

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			sColorAddress = m_aAnticMode4Table[cData & 0x03];

			*pPixel++ = SRAM[sColorAddress];
			*pPixel++ = SRAM[sColorAddress];

			ATARI_CLOCK_ACTION();
		}

		for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
		{
			if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
			{
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
				*pPixel++ = SRAM[IO_COLBK];
			}	
			else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
			{
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
				*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			}	
			else
			{
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
				*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			}	

			ATARI_CLOCK_ACTION();
		}

		ATARI_LINE_ACTION();
	}
}

static void Atari_DrawModeE(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lCycle;
	u8 cData;
	u16 sColorAddress;

	for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
	{
		pPixel += 4;
		ATARI_CLOCK_ACTION();
	}

	for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
	{
		if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}	
		else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
		{
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
		}	
		else
		{
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
		}	

		ATARI_CLOCK_ACTION();
	}

	for(lCycle = 0; lCycle < (lPlayfieldCycles >> 1); lCycle++)
	{
		cData = RAM[pAtariData->sDisplayMemoryAddress]; 
		FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
		pContext->llCycleCounter++;	

		sColorAddress = m_aAnticMode4Table[(cData >> 6) & 0x03];

		*pPixel++ = SRAM[sColorAddress];
		*pPixel++ = SRAM[sColorAddress];

		sColorAddress = m_aAnticMode4Table[(cData >> 4) & 0x03];

		*pPixel++ = SRAM[sColorAddress];
		*pPixel++ = SRAM[sColorAddress];

		ATARI_CLOCK_ACTION();

		sColorAddress = m_aAnticMode4Table[(cData >> 2) & 0x03];

		*pPixel++ = SRAM[sColorAddress];
		*pPixel++ = SRAM[sColorAddress];

		sColorAddress = m_aAnticMode4Table[cData & 0x03];

		*pPixel++ = SRAM[sColorAddress];
		*pPixel++ = SRAM[sColorAddress];

		ATARI_CLOCK_ACTION();
	}

	for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
	{
		if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}	
		else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
		{
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
		}	
		else
		{
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
		}	

		ATARI_CLOCK_ACTION();
	}

	ATARI_LINE_ACTION();
}

static void Atari_DrawModeF(
	_6502_Context_t *pContext, 
	u8 *pPixel, 
	u32 lLines,
	u32 lLineOffset, 
	u32 lLeftBorderCycles,
	u32 lPlayfieldCycles,
	u32 lRightBorderCycles)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	u32 lCycle;
	u8 cData = 0x00;
	u8 cMask;
	u8 cColor;

	for(lCycle = 0; lCycle < COLOR_BURST_CYCLES; lCycle++)
	{
		pPixel += 4;
		ATARI_CLOCK_ACTION();
	}

	for(lCycle = 0; lCycle < lLeftBorderCycles; lCycle++)
	{
		if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}	
		else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
		{
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
		}	
		else
		{
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
		}	

		ATARI_CLOCK_ACTION();
	}

	cMask = 0x00;

	for(lCycle = 0; lCycle < lPlayfieldCycles; lCycle++)
	{
		if(cMask == 0x00)
		{
			cData = RAM[pAtariData->sDisplayMemoryAddress];
			cMask = 0x80;

			FIXED_ADD(pAtariData->sDisplayMemoryAddress, 0x0fff, 1);
			pContext->llCycleCounter++;	
		}

		if((SRAM[IO_PRIOR] & 0xc0) == 0x00)
		{
			if(cData & cMask)
				*pPixel++ = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
			else
				*pPixel++ = SRAM[IO_COLPF2];

			cMask >>= 1;

			if(cData & cMask)
				*pPixel++ = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
			else
				*pPixel++ = SRAM[IO_COLPF2];

			cMask >>= 1;

			if(cData & cMask)
				*pPixel++ = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
			else
				*pPixel++ = SRAM[IO_COLPF2];

			cMask >>= 1;

			if(cData & cMask)
				*pPixel++ = (SRAM[IO_COLPF2] & 0xf0) | (SRAM[IO_COLPF1] & 0x0f);
			else
				*pPixel++ = SRAM[IO_COLPF2];

			cMask >>= 1;
		}
		else if((SRAM[IO_PRIOR] & 0xc0) == 0x40)
		{
			if(cMask > 0x08)
			{
				cColor = SRAM[IO_COLBK] | (cData >> 4);

				*pPixel++ = cColor;
				*pPixel++ = cColor;
				*pPixel++ = cColor;
				*pPixel++ = cColor;
			}
			else
			{
				cColor = SRAM[IO_COLBK] | (cData & 0x0f);

				*pPixel++ = cColor;
				*pPixel++ = cColor;
				*pPixel++ = cColor;
				*pPixel++ = cColor;
			}

			cMask >>= 4;
		}
		else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
		{
			if(cMask > 0x08)
			{
				cColor = SRAM[m_aGtiaMode10ColorTable[cData >> 4]];

				*pPixel++ = cColor;
				*pPixel++ = cColor;
				*pPixel++ = cColor;
				*pPixel++ = cColor;
			}
			else
			{
				cColor = SRAM[m_aGtiaMode10ColorTable[cData & 0x0f]];

				*pPixel++ = cColor;
				*pPixel++ = cColor;
				*pPixel++ = cColor;
				*pPixel++ = cColor;
			}

			cMask >>= 4;
		}
		else
		{
			if(cMask > 0x08)
			{
				cColor = (cData & 0xf0) ? (SRAM[IO_COLBK] | (cData & 0xf0)) : (SRAM[IO_COLBK] & 0xf0);
	
				*pPixel++ = cColor;
				*pPixel++ = cColor;
				*pPixel++ = cColor;
				*pPixel++ = cColor;
			}
			else
			{
				cColor = (cData & 0x0f) ? (SRAM[IO_COLBK] | (cData << 4)) : (SRAM[IO_COLBK] & 0xf0);

				*pPixel++ = cColor;
				*pPixel++ = cColor;
				*pPixel++ = cColor;
				*pPixel++ = cColor;
			}

			cMask >>= 4;
		}

		ATARI_CLOCK_ACTION();
	}

	for(lCycle = 0; lCycle < lRightBorderCycles; lCycle++)
	{
		if((SRAM[IO_PRIOR] & 0xc0) < 0x80)
		{
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
			*pPixel++ = SRAM[IO_COLBK];
		}	
		else if((SRAM[IO_PRIOR] & 0xc0) == 0x80)
		{
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
			*pPixel++ = SRAM[IO_COLPM0_TRIG2];
		}	
		else
		{
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
			*pPixel++ = SRAM[IO_COLBK] & 0xf0;
		}	

		ATARI_CLOCK_ACTION();
	}

	ATARI_LINE_ACTION();
}    

void AtariKeyboardEvent(_6502_Context_t *pContext, SDL_KeyboardEvent *pKeyboardEvent)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

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
    				pAtariData->lDiskSize = fread(pAtariData->pDisk1, 1, 64 * 1024 * 256, pFile);
    				fclose(pFile);
#ifdef VERBOSE_SIO
					printf("Disk name: %s, size = %ld\n", "D1.ATR", pAtariData->lDiskSize);
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

    				pAtariData->lKeyPressCounter++;
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
                    if(pAtariData->lKeyPressCounter > 0)
                        pAtariData->lKeyPressCounter--;

                    if(pAtariData->lKeyPressCounter == 0)
                        RAM[IO_SKCTL_SKSTAT] |= 0x04;
                }
            }
            
            break;
        }
	}
}

// One frame with a 16 clocks (HSYNC) offset!
void AtariExecuteOneFrame(_6502_Context_t *pContext)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;
	u8 cDisplayListCommand = 0x00;
	u8 cOldDisplayListCommand;
	u16 sNewDisplayListAddress;
	u32 lLines;
	u32 lLineOffset;
	u32 lLeftBorderCycles = 0;
	u32 lPlayfieldCycles = 0;
	u32 lRightBorderCycles = 0;
	u32 lScrollClockOffset = 0;

	SDL_LockSurface(pAtariData->pSdlSurface);
	
	pAtariData->lDisplayLine = 0;
	RAM[IO_VCOUNT] = 0;

	Atari_DrawInvisible(pContext, 8);

	while(pAtariData->lDisplayLine < 248)
	{
		if(((SRAM[IO_DMACTL] & 0x03) == 0x00) ||
			cDisplayListCommand == 0x41)
		{
			Atari_DrawBlank(
				pContext, 
				pAtariData->pSdlSurface->pixels + pAtariData->lDisplayLine * PIXELS_PER_LINE + HSYNC_CYCLES * 4,
				240 - pAtariData->lDisplayLine + 8, 0, 0, 0, 0);
		}
		else
		{
			cOldDisplayListCommand = cDisplayListCommand;
#ifdef VERBOSE_DL
			if(pAtariData->lDisplayLine == 8)
				printf("DL START\n");

			printf("             [%16lld]", pContext->llCycleCounter);
			printf(" DL: %3ld", pAtariData->lDisplayLine);
			printf(" $%04X:", pAtariData->sDisplayListAddress);
#endif
			cDisplayListCommand = RAM[pAtariData->sDisplayListAddress];
			FIXED_ADD(pAtariData->sDisplayListAddress, 0x03ff, 1);
			pContext->llCycleCounter++;

			// Blank lines?
			if((cDisplayListCommand & 0x0f) < 0x02)
				lLines = ((cDisplayListCommand & 0x70) >> 4) + 1;
			else
				lLines = m_aDrawModeInfoTable[cDisplayListCommand & 0x0f].lLines;

			// Fetch new display list address
			if((cDisplayListCommand & 0x0f) == 0x01)
			{
				sNewDisplayListAddress = RAM[pAtariData->sDisplayListAddress];
				FIXED_ADD(pAtariData->sDisplayListAddress, 0x03ff, 1);
				sNewDisplayListAddress |= RAM[pAtariData->sDisplayListAddress] << 8;
				pAtariData->sDisplayListAddress = sNewDisplayListAddress;

				pContext->llCycleCounter += 2;
			}

			// Fetch new display memory address
			if((cDisplayListCommand & 0x4f) >= 0x42)
			{
				pAtariData->sDisplayMemoryAddress = RAM[pAtariData->sDisplayListAddress];
				FIXED_ADD(pAtariData->sDisplayListAddress, 0x03ff, 1);
				pAtariData->sDisplayMemoryAddress |= RAM[pAtariData->sDisplayListAddress] << 8;
				FIXED_ADD(pAtariData->sDisplayListAddress, 0x03ff, 1);

				pContext->llCycleCounter += 2;
			}

			// Vertical scrolling
			if(((cOldDisplayListCommand & 0x2f) < 0x22) &&
				((cDisplayListCommand & 0x2f) >= 0x22))
			{
				if(lLines > SRAM[IO_VSCROL])
	    			lLines = lLines - SRAM[IO_VSCROL];
				else
					lLines = 1;

				lLineOffset = SRAM[IO_VSCROL];	
			}
			else if(((cOldDisplayListCommand & 0x2f) >= 0x22) &&
				((cDisplayListCommand & 0x2f) < 0x22))
			{
				lLines = SRAM[IO_VSCROL] + 1;
				lLineOffset = 0;
			}
			else
			{
				lLineOffset = 0;
			}
	
			// Don't draw more than 248 lines
			if(pAtariData->lDisplayLine + lLines > 248)
				lLines = 248 - pAtariData->lDisplayLine;

			// Size of playfield and take horizontal scrolling into account
			switch(SRAM[IO_DMACTL] & 0x03)
			{
			case 0:
			case 1:
				if(cDisplayListCommand & 0x10)
				{
					lLeftBorderCycles = (6 + 14 + SRAM[IO_HSCROL]) / 2;
					lPlayfieldCycles = 160 / 2;
					lScrollClockOffset = (SRAM[IO_HSCROL] & 0x01) << 1;
				}
				else
				{
					lLeftBorderCycles = (6 + 30) / 2;
					lPlayfieldCycles = (128 / 2);
					lScrollClockOffset = 0;
				}
				
				break;

			case 2:
				if(cDisplayListCommand & 0x10)
				{
					lLeftBorderCycles = (4 + SRAM[IO_HSCROL]) / 2;
					lPlayfieldCycles = 192 / 2;
					lScrollClockOffset = (SRAM[IO_HSCROL] & 0x01) << 1;
				}
				else
				{
					lLeftBorderCycles = (6 + 14) / 2;
					lPlayfieldCycles = 160 / 2;
					lScrollClockOffset = 0;
				}

				break;

			case 3:
				if(cDisplayListCommand & 0x10)
				{
					lLeftBorderCycles = (4 + SRAM[IO_HSCROL]) / 2;
					lPlayfieldCycles = 192 / 2;
					lScrollClockOffset = (SRAM[IO_HSCROL] & 0x01) << 1;
				}
				else
				{
					lLeftBorderCycles = 4 / 2;
					lPlayfieldCycles = 192 / 2;
					lScrollClockOffset = 0;
				}

				break;
			}
#ifdef VERBOSE_DL
			printf("%02X", cDisplayListCommand);
			
			if((cDisplayListCommand & 0x8f) > 0x81)
				printf(" DLI");

			if((cDisplayListCommand & 0x4f) > 0x41)
			{
				printf(" MEM(%04X)", pAtariData->sDisplayMemoryAddress);
			}

			if((cDisplayListCommand & 0x2f) > 0x21)
				printf(" VSCR");

			if((cDisplayListCommand & 0x1f) > 0x11)
				printf(" HSCR");
				
			if((cDisplayListCommand & 0x4f) == 0x01)
				printf(" JMP(%04X)", pAtariData->sDisplayListAddress);
				
			if((cDisplayListCommand & 0x4f) == 0x41)
				printf(" JMPVBL(%04X)", pAtariData->sDisplayListAddress);
				
			printf("\n");
#endif
			// DLI
			if(cDisplayListCommand & 0x80)
			{
				pAtariData->llDliCycle = pAtariData->llCycle + (lLines - 1) * CYCLES_PER_LINE;	
				AtariTimedEventUpdate(pContext);
			}

			lRightBorderCycles = 
				CYCLES_PER_LINE - 
				lLeftBorderCycles - 
				lPlayfieldCycles - 
				COLOR_BURST_CYCLES;

			m_aDrawModeInfoTable[cDisplayListCommand & 0x0f].DrawModeFunction(
				pContext,
				pAtariData->pSdlSurface->pixels + pAtariData->lDisplayLine * PIXELS_PER_LINE + HSYNC_CYCLES * 4 + lScrollClockOffset,
				lLines,
				lLineOffset,
				lLeftBorderCycles,
				lPlayfieldCycles,
				lRightBorderCycles);
		}
	}

	// Don't allow DLIs here!
	pAtariData->llDliCycle = CYCLE_NEVER;
	AtariTimedEventUpdate(pContext);

	Atari_DrawInvisible(pContext, 1);

	if(SRAM[IO_NMIEN] & NMI_VBI)
	{
		RAM[IO_NMIRES_NMIST] |= NMI_VBI;
		_6502_Nmi(pContext);
	}

	Atari_DrawInvisible(pContext, LINES_PER_SCREEN_PAL - 248 - 1);

	SDL_UnlockSurface(pAtariData->pSdlSurface);
}

void AtariExecuteOneFrameVerbose(_6502_Context_t *pContext)
{
/*	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;
	u32 lCycle;

	pAtariData->pPixel = pAtariData->pSdlSurface->pixels;
	pAtariData->pDrawPlayfieldFunction = pAtariData->pDrawPlayfieldArray;    
	pAtariData->pDrawPlayerMissileFunction = pAtariData->pDrawPlayerMissileArray;    
	pAtariData->lDisplayLine = LINES_PER_SCREEN_PAL - 1;

	// Playfield DMA active?
	if(SRAM[IO_DMACTL] & 0x20)
	{
		u32 lLine;
		u32 lPixel;

		for(lLine = 0; lLine < 248; lLine++)
		{
			for(lPixel = 0; lPixel < 16 + 12 + 4; lPixel++)
				pAtariData->pDrawPlayfieldArray[lLine * COLOR_CLOCKS_PER_LINE + lPixel] = Atari_DrawBackground;
		}

		pAtariData->llFetchDisplayListCommandClock = 
			pAtariData->llDisplayLineClock + COLOR_CLOCKS_PER_LINE * 8;

		pAtariData->cDisplayListCommand = 0;
	}
	else
	{
		u32 lLine;
		u32 lPixel;

		pAtariData->llFetchDisplayListCommandClock = CYCLE_NEVER;

		for(lLine = 0; lLine < 248; lLine++)
		{
			for(lPixel = 0; lPixel < COLOR_CLOCKS_PER_LINE; lPixel++)
				pAtariData->pDrawPlayfieldArray[lLine * COLOR_CLOCKS_PER_LINE + lPixel] = Atari_DrawBackground;
		}
	}	

	for(lCycle = 0; lCycle < LINES_PER_SCREEN_PAL * COLOR_CLOCKS_PER_LINE; lCycle++)
	{
		if(pAtariData->llEventCycle <= pAtariData->llCycle)
			Atari_TimedEvent(pContext);

		if(*pAtariData->pDrawPlayfieldFunction)
			(*pAtariData->pDrawPlayfieldFunction)(pContext);

		pAtariData->pDrawPlayfieldFunction++;
			
		if(*pAtariData->pDrawPlayerMissileFunction)
			(*pAtariData->pDrawPlayerMissileFunction)(pContext);

		pAtariData->pDrawPlayerMissileFunction++;
			
		if(pContext->llCycleCounter * 2 < pAtariData->llCycle)
		{
			_6502_Execute(pContext);
			_6502_Status(pContext);
			printf(" ");
			_6502_DisassembleLive(pContext, pContext->tCpu.pc);
		}

		pAtariData->llCycle++;
	}    
*/
}

void AtariOpen(_6502_Context_t *pContext, u32 lMode, char *pDiskFileName)
{
	FILE *pFile;
	IoInitValue_t *pIoInitValue = m_aIoInitValues;
	AtariData_t *pAtariData;
	SDL_Surface *pSdlSurface;

	if(lMode & 0x1)
		m_cConsolHack = 0x07;

	pSdlSurface = SDL_CreateRGBSurface(
		SDL_SWSURFACE, 
		PIXELS_PER_LINE, 
		312, 
		8, 
		0x000000ff, 
		0x0000ff00, 
		0x00ff0000, 
		0);
	
	if(pSdlSurface == NULL)
	{
		printf("SDL_CreateRGBSurface() failed!\n");

		exit(-1);
	}

	Atari_CreatePalette();
//	Atari_CreateAlternatePalette();

	SDL_SetPalette(pSdlSurface, SDL_LOGPAL | SDL_PHYSPAL, m_aAtariColors, 0, 256);

	pAtariData = malloc(sizeof(AtariData_t));
	pContext->pUserData = pAtariData;
	memset(pAtariData, 0, sizeof(AtariData_t));

	pAtariData->pBasicRom = malloc(0x2000);
	pAtariData->pOsRom = malloc(0x1000);
	pAtariData->pSelfTestRom = malloc(0x0800);
	pAtariData->pFloatingPointRom = malloc(0x2800);

	pFile = fopen("ATARIBAS.ROM", "rb");
	fread(pAtariData->pBasicRom, 0x2000, 1, pFile);
	memcpy(&RAM[0xa000], pAtariData->pBasicRom, 0x2000);
	fclose(pFile);

	pFile = fopen("ATARIXL.ROM", "rb");
	fread(pAtariData->pOsRom, 0x1000, 1, pFile);
	memcpy(&RAM[0xc000], pAtariData->pOsRom, 0x1000);
	fread(pAtariData->pSelfTestRom, 0x0800, 1, pFile);
	fread(pAtariData->pFloatingPointRom, 0x2800, 1, pFile);
	memcpy(&RAM[0xd800], pAtariData->pFloatingPointRom, 0x2800);
	fclose(pFile);
	
	_6502_SetRom(pContext, 0xa000, 0xbfff);
	_6502_SetRom(pContext, 0xc000, 0xcfff);
	_6502_SetRom(pContext, 0xd000, 0xd7ff);
	_6502_SetRom(pContext, 0xd800, 0xffff);

	pContext->llCycleCounter = HSYNC_CYCLES;
	pAtariData->llCycle = HSYNC_CYCLES;
	pAtariData->llDliCycle = CYCLE_NEVER;
	pAtariData->llSerialOutputNeedDataCycle = CYCLE_NEVER;
	pAtariData->llSerialOutputTransmissionDoneCycle = CYCLE_NEVER;
	pAtariData->llSerialInputDataReadyCycle = CYCLE_NEVER;
	pAtariData->llTimer1Cycle = CYCLE_NEVER;
	pAtariData->llTimer2Cycle = CYCLE_NEVER;
	pAtariData->llTimer4Cycle = CYCLE_NEVER;
	AtariTimedEventUpdate(pContext);

	pAtariData->pSdlSurface = pSdlSurface;

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

	pAtariData->pDisk1 = (u8 *)malloc(64 * 1024 * 256);
	memset(pAtariData->pDisk1, 0, 64 * 1024 * 256);
	
	if(pDiskFileName)
	{
		pFile = fopen(pDiskFileName, "rb");

		if(pFile)
		{
			pAtariData->lDiskSize = fread(pAtariData->pDisk1, 1, 64 * 1024 * 256, pFile);
			fclose(pFile);
#ifdef VERBOSE_SIO
			printf("Disk name: %s, size = %ld\n", pDiskFileName, pAtariData->lDiskSize);
#endif
		}
	}

	srand(time(0));
}

void AtariClose(_6502_Context_t *pContext)
{
	AtariData_t *pAtariData = (AtariData_t *)pContext->pUserData;

	free(pAtariData->pDisk1);
	free(pAtariData->pBasicRom);
	free(pAtariData->pOsRom);
	free(pAtariData->pSelfTestRom);
	free(pAtariData->pFloatingPointRom);
}

