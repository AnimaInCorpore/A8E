/********************************************************************
*
*
*
* GTIA
*
* (c) 2004 Sascha Springer
*
*
*
*
********************************************************************/

#include <SDL/SDL.h>

#include <stdio.h>

#include "6502.h"
#include "AtariIo.h"
#include "Gtia.h"

/********************************************************************
*
*
* Variablen
*
*
********************************************************************/

u8 m_cConsolHack = 0x03;

/********************************************************************
*
*
* Funktionen
*
*
********************************************************************/

/***********************************************/
/* $D000 - $D0ff (GTIA) */
/***********************************************/

/* $D000 HPOSP0/M0PF */
u8 *Gtia_HPOSP0_M0PF(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_HPOSP0_M0PF] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" HPOSP0: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_HPOSP0_M0PF];
}

/* $D001 HPOSP1/M1PF */
u8 *Gtia_HPOSP1_M1PF(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_HPOSP1_M1PF] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" HPOSP1: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_HPOSP1_M1PF];
}

/* $D002 HPOSP2/M2PF */
u8 *Gtia_HPOSP2_M2PF(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_HPOSP2_M2PF] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" HPOSP2: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_HPOSP2_M2PF];
}

/* $D003 HPOSP3/M3PF */
u8 *Gtia_HPOSP3_M3PF(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_HPOSP3_M3PF] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" HPOSP3: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_HPOSP3_M3PF];
}

/* $D004 HPOSM0/P0PF */
u8 *Gtia_HPOSM0_P0PF(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_HPOSM0_P0PF] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" HPOSM0: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_HPOSM0_P0PF];
}

/* $D005 HPOSM1/P1PF */
u8 *Gtia_HPOSM1_P1PF(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_HPOSM1_P1PF] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" HPOSM1: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_HPOSM1_P1PF];
}

/* $D006 HPOSM2/P2PF */
u8 *Gtia_HPOSM2_P2PF(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_HPOSM2_P2PF] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" HPOSM2: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_HPOSM2_P2PF];
}

/* $D007 HPOSM3/P3PF */
u8 *Gtia_HPOSM3_P3PF(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_HPOSM3_P3PF] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" HPOSM3: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_HPOSM3_P3PF];
}

/* $D008 SIZEP0/M0PL */
u8 *Gtia_SIZEP0_M0PL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_SIZEP0_M0PL] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" SIZEP0: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_SIZEP0_M0PL];
}

/* $D009 SIZEP1/M1PL */
u8 *Gtia_SIZEP1_M1PL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_SIZEP1_M1PL] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" SIZEP1: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_SIZEP1_M1PL];
}

/* $D00A SIZEP2/M2PL */
u8 *Gtia_SIZEP2_M2PL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_SIZEP2_M2PL] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" SIZEP2: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_SIZEP2_M2PL];
}

/* $D00B SIZEP3/M3PL */
u8 *Gtia_SIZEP3_M3PL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_SIZEP3_M3PL] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" SIZEP3: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_SIZEP3_M3PL];
}

/* $D00C SIZEM/P0PL */
u8 *Gtia_SIZEM_P0PL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_SIZEM_P0PL] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" SIZEM: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_SIZEM_P0PL];
}

/* $D00D GRAFP0/P1PL */
u8 *Gtia_GRAFP0_P1PL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_GRAFP0_P1PL] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" GRAFP0: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_GRAFP0_P1PL];
}

/* $D00E GRAFP1/P2PL */
u8 *Gtia_GRAFP1_P2PL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_GRAFP1_P2PL] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" GRAFP1: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_GRAFP1_P2PL];
}

/* $D00F GRAFP2/P3PL */
u8 *Gtia_GRAFP2_P3PL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_GRAFP2_P3PL] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" GRAFP2: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_GRAFP2_P3PL];
}

/* $D010 GRAFP3/TRIG0 */
u8 *Gtia_GRAFP3_TRIG0(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_GRAFP3_TRIG0] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" GRAFP3: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_GRAFP3_TRIG0];
}

/* $D011 GRAFM/TRIG1 */
u8 *Gtia_GRAFM_TRIG1(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_GRAFM_TRIG1] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" GRAFM: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_GRAFM_TRIG1];
}

/* $D012 COLPM0/TRIG2 */
u8 *Gtia_COLPM0_TRIG2(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_COLPM0_TRIG2] = (*pValue & 0xfe);
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" COLPM0: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_COLPM0_TRIG2];
}

/* $D013 COLPM1/TRIG3 */
u8 *Gtia_COLPM1_TRIG3(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_COLPM1_TRIG3] = (*pValue & 0xfe);
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" COLPM1: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_COLPM1_TRIG3];
}

/* $D014 COLPM2/PAL */
u8 *Gtia_COLPM2_PAL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_COLPM2_PAL] = (*pValue & 0xfe);
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" COLPM2: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_COLPM2_PAL];
}

/* $D015 COLPM3 */
u8 *Gtia_COLPM3(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_COLPM3] = (*pValue & 0xfe);
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" COLPM3: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_COLPM3];
}

/* $D016 COLPF0 */
u8 *Gtia_COLPF0(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_COLPF0] = (*pValue & 0xfe);
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" COLPF0: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_COLPF0];
}

/* $D017 COLPF1 */
u8 *Gtia_COLPF1(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_COLPF1] = (*pValue & 0xfe);
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" COLPF1: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_COLPF1];
}

/* $D018 COLPF2 */
u8 *Gtia_COLPF2(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_COLPF2] = (*pValue & 0xfe);
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" COLPF2: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_COLPF2];
}

/* $D019 COLPF3 */
u8 *Gtia_COLPF3(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_COLPF3] = (*pValue & 0xfe);
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" COLPF3: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_COLPF3];
}

/* $D01A COLBK */
u8 *Gtia_COLBK(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_COLBK] = (*pValue & 0xfe);
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" COLBK: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_COLBK];
}

/* $D01B PRIOR */
u8 *Gtia_PRIOR(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_PRIOR] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" PRIOR: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_PRIOR];
}

/* $D01C VDELAY */
u8 *Gtia_VDELAY(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_VDELAY] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" VDELAY: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_VDELAY];
}

/* $D01D GRACTL */
u8 *Gtia_GRACTL(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		SRAM[IO_GRACTL] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" GRACTL: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_GRACTL];
}

/* $D01E HITCLR */
u8 *Gtia_HITCLR(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
        RAM[IO_HPOSP0_M0PF] = 0x00;
        RAM[IO_HPOSP1_M1PF] = 0x00;
        RAM[IO_HPOSP2_M2PF] = 0x00;
        RAM[IO_HPOSP3_M3PF] = 0x00;
        RAM[IO_HPOSM0_P0PF] = 0x00;
        RAM[IO_HPOSM1_P1PF] = 0x00;
        RAM[IO_HPOSM2_P2PF] = 0x00;
        RAM[IO_HPOSM3_P3PF] = 0x00;
        RAM[IO_SIZEP0_M0PL] = 0x00;
        RAM[IO_SIZEP1_M1PL] = 0x00;
        RAM[IO_SIZEP2_M2PL] = 0x00;
        RAM[IO_SIZEP3_M3PL] = 0x00;
        RAM[IO_SIZEM_P0PL] = 0x00;
        RAM[IO_GRAFP0_P1PL] = 0x00;
        RAM[IO_GRAFP1_P2PL] = 0x00;
        RAM[IO_GRAFP2_P3PL] = 0x00;

		SRAM[IO_HITCLR] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" HITCLR: %02X\n", *pValue);
#endif
    }

	return &RAM[IO_HITCLR];
}

/* $D01F CONSOL */
u8 *Gtia_CONSOL(_6502_Context_t *pContext, u8 *pValue)
{
#ifdef CONSOL_HACK
	if(pValue == NULL && pContext->tCpu.pc == 0xc49d)
		return &m_cConsolHack;
#endif
	if(pValue)
 	{	
		/* Only bit 3 (speaker) is writable; key bits are read-only. */
		SRAM[IO_CONSOL] = *pValue & 0x08;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" CONSOL: %02X\n", *pValue);
#endif
	}
	
	return &RAM[IO_CONSOL];
}
