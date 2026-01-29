/********************************************************************
*
*
*
* POKEY
*
* (c) 2004 Sascha Springer
*
*
*
*
********************************************************************/

#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <stdio.h>

#include <SDL/SDL.h>

#include "6502.h"
#include "AtariIo.h"
#include "Pokey.h"

/********************************************************************
*
*
* Definitionen
*
*
********************************************************************/

typedef struct
{
	u16 sMagic;
	u16 sNumberOfParagraphs;
	u16 sSectorSize;
	u16 sNumberOfParagraphsHigh;
	u8 aUnused[8];
} AtrHeader_t;

typedef struct
{
	u8 audf;
	u8 audc;

	u32 counter;
	u8 output;

	u32 clk_div_cycles;
	u32 clk_acc_cycles;
} PokeyAudioChannel_t;

typedef struct
{
	u32 sample_rate_hz;
	u32 cpu_hz;

	u64 last_cycle;

	/* 32.32 fixed-point sample time in CPU cycles. */
	u64 sample_time_fp;
	u64 cycles_per_sample_fp;

	u32 lfsr17;
	u16 lfsr9;

	SDL_AudioSpec have;
	int audio_opened;

	int16_t *ring;
	u32 ring_size; /* in samples */
	u32 ring_read;
	u32 ring_write;
	u32 ring_count;

	u8 audctl;
	PokeyAudioChannel_t aChannels[4];
} PokeyState_t;

static u32 Pokey_CpuHz(void)
{
	/* PAL (as documented in AtariIo.c header comment). */
	return 1773447u;
}

static void PokeyAudio_RingWrite(PokeyState_t *pPokey, const int16_t *pSamples, u32 count)
{
	u32 i;

	if(!pPokey || !pPokey->ring || pPokey->ring_size == 0)
		return;

	if(pPokey->audio_opened)
		SDL_LockAudio();
	for(i = 0; i < count; i++)
	{
		if(pPokey->ring_count == pPokey->ring_size)
		{
			/* Drop oldest sample to avoid unbounded latency. */
			pPokey->ring_read = (pPokey->ring_read + 1) % pPokey->ring_size;
			pPokey->ring_count--;
		}

		pPokey->ring[pPokey->ring_write] = pSamples[i];
		pPokey->ring_write = (pPokey->ring_write + 1) % pPokey->ring_size;
		pPokey->ring_count++;
	}
	if(pPokey->audio_opened)
		SDL_UnlockAudio();
}

static u32 PokeyAudio_RingRead(PokeyState_t *pPokey, int16_t *pSamples, u32 count)
{
	u32 i = 0;

	if(!pPokey || !pPokey->ring || pPokey->ring_size == 0)
		return 0;

	if(pPokey->audio_opened)
		SDL_LockAudio();
	for(i = 0; i < count; i++)
	{
		if(pPokey->ring_count == 0)
			break;

		pSamples[i] = pPokey->ring[pPokey->ring_read];
		pPokey->ring_read = (pPokey->ring_read + 1) % pPokey->ring_size;
		pPokey->ring_count--;
	}
	if(pPokey->audio_opened)
		SDL_UnlockAudio();

	return i;
}

static void PokeyAudio_Callback(void *userdata, Uint8 *stream, int len)
{
	PokeyState_t *pPokey = (PokeyState_t *)userdata;
	int16_t *pOut = (int16_t *)stream;
	u32 samplesRequested = (u32)(len / (int)sizeof(int16_t));
	u32 samplesRead = PokeyAudio_RingRead(pPokey, pOut, samplesRequested);
	u32 i;

	for(i = samplesRead; i < samplesRequested; i++)
		pOut[i] = 0;
}

static void PokeyAudio_RecomputeClocks(PokeyAudioChannel_t *pChannels, u8 audctl)
{
	u32 base = (audctl & 0x01) ? (u32)CYCLES_PER_LINE : 28u;

	/* Channel 1 (AUDF1/AUDC1). */
	pChannels[0].clk_div_cycles = (audctl & 0x40) ? 1u : base;
	/* Channel 2: 16-bit mode (AUDCTL bit 4) ignored in this first version. */
	pChannels[1].clk_div_cycles = base;
	/* Channel 3 (AUDF3/AUDC3). */
	pChannels[2].clk_div_cycles = (audctl & 0x20) ? 1u : base;
	/* Channel 4: 16-bit mode (AUDCTL bit 3) ignored in this first version. */
	pChannels[3].clk_div_cycles = base;
}

static void PokeyAudio_LfsrStep(PokeyState_t *pPokey)
{
	/* Simple deterministic LFSR for noise/RANDOM; accuracy can be improved later. */
	u32 bit = ((pPokey->lfsr17 >> 0) ^ (pPokey->lfsr17 >> 5)) & 1u;
	pPokey->lfsr17 = (pPokey->lfsr17 >> 1) | (bit << 16);

	{
		u16 bit9 = ((pPokey->lfsr9 >> 0) ^ (pPokey->lfsr9 >> 4)) & 1u;
		pPokey->lfsr9 = (pPokey->lfsr9 >> 1) | (bit9 << 8);
	}
}

static void PokeyAudio_ChannelTick(PokeyState_t *pPokey, PokeyAudioChannel_t *pCh, u8 audctl)
{
	u8 vol = (u8)(pCh->audc & 0x0f);
	u8 ctrl = (u8)(pCh->audc >> 4);
	u8 use9 = (u8)((audctl >> 7) & 1);
	u32 reload;

	if(pCh->counter > 0)
		pCh->counter--;

	if(pCh->counter == 0)
	{
		/* AUDF reload value depends on clock source. For 1.79MHz modes the hardware
		   effectively adds an offset; keep it simple here and apply:
		   - 64/15kHz: AUDF + 1
		   - 1.79MHz (ch1/ch3): AUDF + 4 */
		reload = (u32)pCh->audf + 1;
		if(pCh == &pPokey->aChannels[0] && (audctl & 0x40))
			reload = (u32)pCh->audf + 4;
		if(pCh == &pPokey->aChannels[2] && (audctl & 0x20))
			reload = (u32)pCh->audf + 4;

		pCh->counter = reload;

		if(vol == 0)
		{
			pCh->output = 0;
			return;
		}

		/* Very small, game-friendly subset:
		   - ctrl 0xA: pure tone (square wave)
		   - ctrl 0x1: DC level
		   - otherwise: noise-ish */
		if(ctrl == 0x01)
		{
			pCh->output = 1;
		}
		else if(ctrl == 0x0a || ctrl == 0x00)
		{
			pCh->output ^= 1;
		}
		else
		{
			PokeyAudio_LfsrStep(pPokey);
			pCh->output = (u8)(use9 ? (pPokey->lfsr9 & 1) : (pPokey->lfsr17 & 1));
		}
	}
}

static void PokeyAudio_PairTick(
	PokeyState_t *pPokey,
	PokeyAudioChannel_t *pChLow,
	PokeyAudioChannel_t *pChHigh,
	u8 audctl)
{
	u8 vol = (u8)(pChHigh->audc & 0x0f);
	u8 ctrl = (u8)(pChHigh->audc >> 4);
	u8 use9 = (u8)((audctl >> 7) & 1);
	u32 period = (((u32)pChHigh->audf) << 8) | (u32)pChLow->audf;
	u32 reload;

	if(pChHigh->counter > 0)
		pChHigh->counter--;

	if(pChHigh->counter == 0)
	{
		/* For 16-bit modes on 1.79MHz clock, use +7; otherwise +1. */
		reload = period + 1;
		if(pChLow == &pPokey->aChannels[0] && (audctl & 0x40))
			reload = period + 7;
		if(pChLow == &pPokey->aChannels[2] && (audctl & 0x20))
			reload = period + 7;

		pChHigh->counter = reload;

		if(vol == 0)
		{
			pChHigh->output = 0;
			return;
		}

		if(ctrl == 0x01)
		{
			pChHigh->output = 1;
		}
		else if(ctrl == 0x0a || ctrl == 0x00)
		{
			pChHigh->output ^= 1;
		}
		else
		{
			PokeyAudio_LfsrStep(pPokey);
			pChHigh->output = (u8)(use9 ? (pPokey->lfsr9 & 1) : (pPokey->lfsr17 & 1));
		}
	}
}

static void PokeyAudio_StepCpuCycle(
	PokeyState_t *pPokey,
	PokeyAudioChannel_t *pChannels,
	u8 audctl)
{
	u8 pair12 = (u8)((audctl & 0x10) != 0);
	u8 pair34 = (u8)((audctl & 0x08) != 0);
	u32 i;

	if(pair12)
	{
		if(pChannels[0].clk_div_cycles == 1)
		{
			PokeyAudio_PairTick(pPokey, &pChannels[0], &pChannels[1], audctl);
		}
		else
		{
			pChannels[0].clk_acc_cycles++;
			if(pChannels[0].clk_acc_cycles >= pChannels[0].clk_div_cycles)
			{
				pChannels[0].clk_acc_cycles -= pChannels[0].clk_div_cycles;
				PokeyAudio_PairTick(pPokey, &pChannels[0], &pChannels[1], audctl);
			}
		}
	}
	else
	{
		for(i = 0; i < 2; i++)
		{
			if(pChannels[i].clk_div_cycles == 1)
			{
				PokeyAudio_ChannelTick(pPokey, &pChannels[i], audctl);
				continue;
			}

			pChannels[i].clk_acc_cycles++;
			if(pChannels[i].clk_acc_cycles >= pChannels[i].clk_div_cycles)
			{
				pChannels[i].clk_acc_cycles -= pChannels[i].clk_div_cycles;
				PokeyAudio_ChannelTick(pPokey, &pChannels[i], audctl);
			}
		}
	}

	if(pair34)
	{
		if(pChannels[2].clk_div_cycles == 1)
		{
			PokeyAudio_PairTick(pPokey, &pChannels[2], &pChannels[3], audctl);
		}
		else
		{
			pChannels[2].clk_acc_cycles++;
			if(pChannels[2].clk_acc_cycles >= pChannels[2].clk_div_cycles)
			{
				pChannels[2].clk_acc_cycles -= pChannels[2].clk_div_cycles;
				PokeyAudio_PairTick(pPokey, &pChannels[2], &pChannels[3], audctl);
			}
		}
	}
	else
	{
		for(i = 2; i < 4; i++)
		{
			if(pChannels[i].clk_div_cycles == 1)
			{
				PokeyAudio_ChannelTick(pPokey, &pChannels[i], audctl);
				continue;
			}

			pChannels[i].clk_acc_cycles++;
			if(pChannels[i].clk_acc_cycles >= pChannels[i].clk_div_cycles)
			{
				pChannels[i].clk_acc_cycles -= pChannels[i].clk_div_cycles;
				PokeyAudio_ChannelTick(pPokey, &pChannels[i], audctl);
			}
		}
	}
}

static int16_t PokeyAudio_MixSample(PokeyAudioChannel_t *pChannels, u8 audctl)
{
	u32 i;
	int32_t mixed = 0;
	int32_t sample;
	u8 pair12 = (u8)((audctl & 0x10) != 0);
	u8 pair34 = (u8)((audctl & 0x08) != 0);

	for(i = 0; i < 4; i++)
	{
		if(i == 0 && pair12)
			continue;
		if(i == 2 && pair34)
			continue;

		u8 vol = (u8)(pChannels[i].audc & 0x0f);
		u8 ctrl = (u8)(pChannels[i].audc >> 4);
		int32_t level;

		if(vol == 0)
			continue;

		if(ctrl == 0x01)
			level = 1;
		else
			level = pChannels[i].output ? 1 : -1;

		mixed += level * (int32_t)vol;
	}

	/* 4 channels * 15 volume = 60 peak. */
	sample = mixed * 512;

	if(sample > 32767)
		sample = 32767;
	if(sample < -32768)
		sample = -32768;

	return (int16_t)sample;
}

static PokeyState_t *Pokey_GetState(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	if(!pIoData)
		return NULL;

	return (PokeyState_t *)pIoData->pPokey;
}

void Pokey_Init(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	PokeyState_t *pPokey;
	SDL_AudioSpec want;
	u32 i;

	if(!pIoData)
		return;

	pPokey = (PokeyState_t *)malloc(sizeof(PokeyState_t));
	if(!pPokey)
		return;
	memset(pPokey, 0, sizeof(PokeyState_t));

	pPokey->sample_rate_hz = 44100;
	pPokey->cpu_hz = Pokey_CpuHz();
	pPokey->cycles_per_sample_fp =
		(((u64)pPokey->cpu_hz) << 32) / (u64)pPokey->sample_rate_hz;
	pPokey->sample_time_fp = (pContext->llCycleCounter << 32) + pPokey->cycles_per_sample_fp;
	pPokey->last_cycle = pContext->llCycleCounter;

	pPokey->lfsr17 = 0x1ffff;
	pPokey->lfsr9 = 0x1ff;

	pPokey->ring_size = 16384;
	pPokey->ring = (int16_t *)malloc(sizeof(int16_t) * pPokey->ring_size);
	if(pPokey->ring)
		memset(pPokey->ring, 0, sizeof(int16_t) * pPokey->ring_size);

	pPokey->audctl = SRAM[IO_AUDCTL_ALLPOT];
	for(i = 0; i < 4; i++)
	{
		pPokey->aChannels[i].audf = 0;
		pPokey->aChannels[i].audc = 0;
		pPokey->aChannels[i].counter = 1;
		pPokey->aChannels[i].output = 0;
		pPokey->aChannels[i].clk_div_cycles = 28;
		pPokey->aChannels[i].clk_acc_cycles = 0;
	}
	PokeyAudio_RecomputeClocks(pPokey->aChannels, pPokey->audctl);

	memset(&want, 0, sizeof(want));
	want.freq = (int)pPokey->sample_rate_hz;
	want.format = AUDIO_S16SYS;
	want.channels = 1;
	want.samples = 1024;
	want.callback = PokeyAudio_Callback;
	want.userdata = pPokey;

	if(SDL_InitSubSystem(SDL_INIT_AUDIO) < 0)
	{
		/* Keep emulator running without audio. */
		pIoData->pPokey = pPokey;
		return;
	}

	if(SDL_OpenAudio(&want, &pPokey->have) < 0)
	{
		pIoData->pPokey = pPokey;
		return;
	}

	/* Keep implementation simple: require the format we generate. */
	if(pPokey->have.format != AUDIO_S16SYS || pPokey->have.channels != 1 || pPokey->have.freq <= 0)
	{
		SDL_CloseAudio();
		pIoData->pPokey = pPokey;
		return;
	}

	pPokey->sample_rate_hz = (u32)pPokey->have.freq;
	pPokey->cycles_per_sample_fp =
		(((u64)pPokey->cpu_hz) << 32) / (u64)pPokey->sample_rate_hz;
	pPokey->sample_time_fp = (pContext->llCycleCounter << 32) + pPokey->cycles_per_sample_fp;

	pPokey->audio_opened = 1;
	SDL_PauseAudio(0);

	pIoData->pPokey = pPokey;
}

void Pokey_Close(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	PokeyState_t *pPokey;

	if(!pIoData)
		return;

	pPokey = (PokeyState_t *)pIoData->pPokey;
	if(!pPokey)
		return;

	if(pPokey->audio_opened)
		SDL_CloseAudio();

	free(pPokey->ring);
	free(pPokey);
	pIoData->pPokey = NULL;
}

void Pokey_Sync(_6502_Context_t *pContext, u64 llCycleCounter)
{
	PokeyState_t *pPokey;
	int16_t tmp[512];
	u32 tmpCount = 0;

	u64 cur;

	pPokey = Pokey_GetState(pContext);
	if(!pPokey || !pPokey->ring)
	{
		if(pPokey)
			pPokey->last_cycle = llCycleCounter;
		return;
	}

	if(!pPokey->audio_opened)
	{
		pPokey->last_cycle = llCycleCounter;
		return;
	}

	if(llCycleCounter <= pPokey->last_cycle)
		return;

	/* Read latest control regs; callers sync before writes for cycle correctness. */
	if(pPokey->audctl != SRAM[IO_AUDCTL_ALLPOT])
	{
		pPokey->audctl = SRAM[IO_AUDCTL_ALLPOT];
		PokeyAudio_RecomputeClocks(pPokey->aChannels, pPokey->audctl);
	}
	pPokey->aChannels[0].audf = SRAM[IO_AUDF1_POT0];
	pPokey->aChannels[0].audc = SRAM[IO_AUDC1_POT1];
	pPokey->aChannels[1].audf = SRAM[IO_AUDF2_POT2];
	pPokey->aChannels[1].audc = SRAM[IO_AUDC2_POT3];
	pPokey->aChannels[2].audf = SRAM[IO_AUDF3_POT4];
	pPokey->aChannels[2].audc = SRAM[IO_AUDC3_POT5];
	pPokey->aChannels[3].audf = SRAM[IO_AUDF4_POT6];
	pPokey->aChannels[3].audc = SRAM[IO_AUDC4_POT7];

	cur = pPokey->last_cycle;
	while(cur < llCycleCounter)
	{
		PokeyAudio_StepCpuCycle(pPokey, pPokey->aChannels, pPokey->audctl);
		cur++;

		while((pPokey->sample_time_fp >> 32) <= cur)
		{
			tmp[tmpCount++] = PokeyAudio_MixSample(pPokey->aChannels, pPokey->audctl);
			pPokey->sample_time_fp += pPokey->cycles_per_sample_fp;

			if(tmpCount == (sizeof(tmp) / sizeof(tmp[0])))
			{
				PokeyAudio_RingWrite(pPokey, tmp, tmpCount);
				tmpCount = 0;
			}
		}
	}

	if(tmpCount)
		PokeyAudio_RingWrite(pPokey, tmp, tmpCount);

	pPokey->last_cycle = llCycleCounter;
}

/********************************************************************
*
*
* Funktionen
*
*
********************************************************************/

/***********************************************/
/* $D200 - $D2FF (POKEY) */
/***********************************************/

/* $D200 AUDF1/POT0 */
u8 *Pokey_AUDF1_POT0(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
 	{	
		Pokey_Sync(pContext, pContext->llCycleCounter);
		SRAM[IO_AUDF1_POT0] = *pValue;
		{
			PokeyState_t *pPokey = Pokey_GetState(pContext);
			if(pPokey)
			{
				pPokey->aChannels[0].audf = *pValue;
				pPokey->aChannels[0].counter = (pPokey->audctl & 0x40) ? ((u32)(*pValue) + 4) : ((u32)(*pValue) + 1);

				if(pPokey->audctl & 0x10)
				{
					u32 period = (((u32)pPokey->aChannels[1].audf) << 8) | (u32)(*pValue);
					pPokey->aChannels[1].counter = (pPokey->audctl & 0x40) ? (period + 7) : (period + 1);
				}
			}
		}
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" AUDF1: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_AUDF1_POT0];
}

/* $D201 AUDC1/POT1 */
u8 *Pokey_AUDC1_POT1(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
 	{	
		Pokey_Sync(pContext, pContext->llCycleCounter);
		SRAM[IO_AUDC1_POT1] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" AUDC1: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_AUDC1_POT1];
}

/* $D202 AUDF2/POT2 */
u8 *Pokey_AUDF2_POT2(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
 	{	
		Pokey_Sync(pContext, pContext->llCycleCounter);
		SRAM[IO_AUDF2_POT2] = *pValue;
		{
			PokeyState_t *pPokey = Pokey_GetState(pContext);
			if(pPokey)
			{
				pPokey->aChannels[1].audf = *pValue;
				pPokey->aChannels[1].counter = (u32)(*pValue) + 1;

				if(pPokey->audctl & 0x10)
				{
					u32 period = (((u32)(*pValue)) << 8) | (u32)pPokey->aChannels[0].audf;
					pPokey->aChannels[1].counter = (pPokey->audctl & 0x40) ? (period + 7) : (period + 1);
				}
			}
		}
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" AUDF2: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_AUDF2_POT2];
}

/* $D203 AUDC2/POT3 */
u8 *Pokey_AUDC2_POT3(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
 	{	
		Pokey_Sync(pContext, pContext->llCycleCounter);
		SRAM[IO_AUDC2_POT3] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" AUDC2: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_AUDC2_POT3];
}

/* $D204 AUDF3/POT4 */
u8 *Pokey_AUDF3_POT4(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
 	{	
		Pokey_Sync(pContext, pContext->llCycleCounter);
		SRAM[IO_AUDF3_POT4] = *pValue;
		{
			PokeyState_t *pPokey = Pokey_GetState(pContext);
			if(pPokey)
			{
				pPokey->aChannels[2].audf = *pValue;
				pPokey->aChannels[2].counter = (pPokey->audctl & 0x20) ? ((u32)(*pValue) + 4) : ((u32)(*pValue) + 1);

				if(pPokey->audctl & 0x08)
				{
					u32 period = (((u32)pPokey->aChannels[3].audf) << 8) | (u32)(*pValue);
					pPokey->aChannels[3].counter = (pPokey->audctl & 0x20) ? (period + 7) : (period + 1);
				}
			}
		}
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" AUDF3: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_AUDF3_POT4];
}

/* $D205 AUDC3/POT5 */
u8 *Pokey_AUDC3_POT5(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
 	{	
		Pokey_Sync(pContext, pContext->llCycleCounter);
		SRAM[IO_AUDC3_POT5] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" AUDC3: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_AUDC3_POT5];
}

/* $D206 AUDF4/POT6 */
u8 *Pokey_AUDF4_POT6(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
 	{	
		Pokey_Sync(pContext, pContext->llCycleCounter);
		SRAM[IO_AUDF4_POT6] = *pValue;
		{
			PokeyState_t *pPokey = Pokey_GetState(pContext);
			if(pPokey)
			{
				pPokey->aChannels[3].audf = *pValue;
				pPokey->aChannels[3].counter = (u32)(*pValue) + 1;

				if(pPokey->audctl & 0x08)
				{
					u32 period = (((u32)(*pValue)) << 8) | (u32)pPokey->aChannels[2].audf;
					pPokey->aChannels[3].counter = (pPokey->audctl & 0x20) ? (period + 7) : (period + 1);
				}
			}
		}
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" AUDF4: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_AUDF4_POT6];
}

/* $D207 AUDC4/POT7 */
u8 *Pokey_AUDC4_POT7(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
 	{	
		Pokey_Sync(pContext, pContext->llCycleCounter);
		SRAM[IO_AUDC4_POT7] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" AUDC4: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_AUDC4_POT7];
}

/* $D208 AUDCTL/ALLPOT */
u8 *Pokey_AUDCTL_ALLPOT(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
 	{	
		Pokey_Sync(pContext, pContext->llCycleCounter);
		SRAM[IO_AUDCTL_ALLPOT] = *pValue;
		{
			PokeyState_t *pPokey = Pokey_GetState(pContext);
			if(pPokey)
			{
				pPokey->audctl = *pValue;
				PokeyAudio_RecomputeClocks(pPokey->aChannels, pPokey->audctl);

				if(pPokey->audctl & 0x10)
				{
					u32 period12 = (((u32)pPokey->aChannels[1].audf) << 8) | (u32)pPokey->aChannels[0].audf;
					pPokey->aChannels[1].counter = (pPokey->audctl & 0x40) ? (period12 + 7) : (period12 + 1);
				}
				else
				{
					pPokey->aChannels[0].counter =
						(pPokey->audctl & 0x40) ? ((u32)pPokey->aChannels[0].audf + 4) : ((u32)pPokey->aChannels[0].audf + 1);
					pPokey->aChannels[1].counter = (u32)pPokey->aChannels[1].audf + 1;
				}

				if(pPokey->audctl & 0x08)
				{
					u32 period34 = (((u32)pPokey->aChannels[3].audf) << 8) | (u32)pPokey->aChannels[2].audf;
					pPokey->aChannels[3].counter = (pPokey->audctl & 0x20) ? (period34 + 7) : (period34 + 1);
				}
				else
				{
					pPokey->aChannels[2].counter =
						(pPokey->audctl & 0x20) ? ((u32)pPokey->aChannels[2].audf + 4) : ((u32)pPokey->aChannels[2].audf + 1);
					pPokey->aChannels[3].counter = (u32)pPokey->aChannels[3].audf + 1;
				}
			}
		}
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" AUDCTL: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_AUDCTL_ALLPOT];
}

/* $D209 STIMER/KBCODE */
u8 *Pokey_STIMER_KBCODE(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
 	{	
		IoData_t *pIoData = (IoData_t *)pContext->pIoData;
		
		SRAM[IO_STIMER_KBCODE] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" STIMER: %02X\n", *pValue);
#endif
		if(SRAM[IO_AUDF1_POT0])
		{
			pIoData->llTimer1Cycle = 
				pContext->llCycleCounter + SRAM[IO_AUDF1_POT0];

			AtariIoCycleTimedEventUpdate(pContext);
		}

		if(SRAM[IO_AUDF2_POT2])
		{
			pIoData->llTimer2Cycle = 
				pContext->llCycleCounter + SRAM[IO_AUDF2_POT2];

			AtariIoCycleTimedEventUpdate(pContext);
		}

		if(SRAM[IO_AUDF4_POT6])
		{
			pIoData->llTimer4Cycle = 
				pContext->llCycleCounter + SRAM[IO_AUDF4_POT6];

			AtariIoCycleTimedEventUpdate(pContext);
		}
	}

	return &RAM[IO_STIMER_KBCODE];
}

/* $D20A SKREST/RANDOM */
u8 *Pokey_SKREST_RANDOM(_6502_Context_t *pContext, u8 *pValue)
{
	PokeyState_t *pPokey = Pokey_GetState(pContext);

	if(pValue)
 	{	
		SRAM[IO_SKREST_RANDOM] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" SKREST: %02X\n", *pValue);
#endif
		
	}

	if(pPokey)
	{
		PokeyAudio_LfsrStep(pPokey);
		RAM[IO_SKREST_RANDOM] = (u8)(pPokey->lfsr17 & 0xff);
	}
	else
	{
		RAM[IO_SKREST_RANDOM] = rand();
	}
	
	return &RAM[IO_SKREST_RANDOM];
}

/* $D20B POTGO */
u8 *Pokey_POTGO(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
 	{	
		Pokey_Sync(pContext, pContext->llCycleCounter);
		SRAM[IO_POTGO] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" POTGO: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_POTGO];
}

static u8 aSioBuffer[1024];
static u16 cSioOutIndex = 0;
static u16 sSioInIndex = 0;
static u16 sSioInSize = 0;

static u8 AtariIo_SioChecksum(u8 *pBuffer, u32 lSize)
{
	u8 cChecksum = 0;
	
	while(lSize--)
	{
		cChecksum += (((u16 )cChecksum + (u16 )*pBuffer) >> 8) + *pBuffer;
		
		pBuffer++;
	}
	
	return cChecksum;
}

/* $D20D SEROUT/SERIN */
u8 *Pokey_SEROUT_SERIN(_6502_Context_t *pContext, u8 *pValue)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	if(pValue)
	{
		Pokey_Sync(pContext, pContext->llCycleCounter);
#ifdef VERBOSE_SIO
		printf("             [%16lld] SEROUT ", pContext->llCycleCounter);
		printf("(%02X)!\n", *pValue);
#endif		
		pIoData->llSerialOutputNeedDataCycle = 
			pContext->llCycleCounter + SERIAL_OUTPUT_DATA_NEEDED_CYCLES;

		AtariIoCycleTimedEventUpdate(pContext);

		if(cSioOutIndex == 0 && *pValue > 0 && *pValue < 255)
		{
			aSioBuffer[cSioOutIndex++] = *pValue;
		}
		else if(cSioOutIndex > 0)
		{
			aSioBuffer[cSioOutIndex++] = *pValue;
			
			if(cSioOutIndex == 5)
			{
				if(AtariIo_SioChecksum(aSioBuffer, 4) == aSioBuffer[4])
				{
					char aCaption[100];
					u16 sSectorIndex;
					u16 sSectorSize = ((AtrHeader_t *)pIoData->pDisk1)->sSectorSize;
					u16 sBytesToRead;
					u32 lIndex;
#ifdef VERBOSE_SIO
					printf("SIO data send (checksum calculated: %02X): ", 
						AtariIo_SioChecksum(aSioBuffer, 4));

					for(lIndex = 0; lIndex < 5; lIndex++)
						printf("%02X ", aSioBuffer[lIndex]);

					printf("\n");
#endif			
					pIoData->llSerialOutputTransmissionDoneCycle = 
						pContext->llCycleCounter + SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;

					AtariIoCycleTimedEventUpdate(pContext);

					switch(aSioBuffer[1])
					{
					case 0x52:
						sSectorIndex = aSioBuffer[2] + (aSioBuffer[3] << 8);

						sprintf(aCaption, APPLICATION_CAPTION "  [%d]", sSectorIndex);
						SDL_WM_SetCaption(aCaption, NULL);
#ifdef VERBOSE_SIO
						printf("SIO read sector %d\n", aSioBuffer[2] + (aSioBuffer[3] << 8));
#endif
						if(sSectorIndex < 4)
						{
							sBytesToRead = 128;
							lIndex = (sSectorIndex - 1) * 128;
						}
						else
						{
							sBytesToRead = sSectorSize;
							lIndex = (sSectorIndex - 4) * sSectorSize + 128 * 3;
						}

						if(lIndex + 16 >= pIoData->lDiskSize)
						{
							aSioBuffer[0] = 'N';
							sSioInSize = 1;
#ifdef VERBOSE_SIO
							printf("Not accepted (sector %d, index = %ld, disk size = %ld!\n",
								sSectorIndex, lIndex, pIoData->lDiskSize);
#endif
						}
						else
						{
							aSioBuffer[0] = 'A';
							aSioBuffer[1] = 'C';

							memcpy(aSioBuffer + 2, pIoData->pDisk1 + 16 + lIndex, sBytesToRead);

							aSioBuffer[sBytesToRead + 2] = AtariIo_SioChecksum(aSioBuffer + 2, sBytesToRead);

							sSioInSize = sBytesToRead + 3;
#ifdef VERBOSE_SIO
							printf("%04X: ", sSectorIndex);
						
							for(lIndex = 0; lIndex < sSioInSize; lIndex++)
								printf("%02X ", aSioBuffer[lIndex]);

							printf("\n");
#endif
							pIoData->llSerialInputDataReadyCycle = 
								pContext->llCycleCounter + SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
						}
							
						AtariIoCycleTimedEventUpdate(pContext);
						
						break;
						
					case 0x53:
						SDL_WM_SetCaption(APPLICATION_CAPTION "  [-]", NULL);
#ifdef VERBOSE_SIO
						printf("SIO get status\n");
#endif
						if(sSectorSize == 128)
						{
							aSioBuffer[0] = 'A';
							aSioBuffer[1] = 'C';
							aSioBuffer[2] = 0x10;
							aSioBuffer[3] = 0x00;
							aSioBuffer[4] = 0x01;
							aSioBuffer[5] = 0x00;
							aSioBuffer[6] = 0x11;
						}
						else if(sSectorSize == 256)
						{
							aSioBuffer[0] = 'A';
							aSioBuffer[1] = 'C';
							aSioBuffer[2] = 0x30;
							aSioBuffer[3] = 0x00;
							aSioBuffer[4] = 0x01;
							aSioBuffer[5] = 0x00;
							aSioBuffer[6] = 0x31;
						}

						sSioInSize = 7;
						
						if(pIoData->pDisk1[0] != 0)
						{
							pIoData->llSerialInputDataReadyCycle = 
								pContext->llCycleCounter + SERIAL_INPUT_FIRST_DATA_READY_CYCLES;

							AtariIoCycleTimedEventUpdate(pContext);
						}
							
						break;
		
					default:
						printf("Unsupported SIO command $%02X!\n", aSioBuffer[1]);
						
						break;
					}
				}
#ifdef VERBOSE_SIO
				else
				{
					u32 lIndex;
				
					printf("Wrong SIO checksum (expected %02X): ", 
						AtariIo_SioChecksum(aSioBuffer, 4));

					for(lIndex = 0; lIndex < 5; lIndex++)
						printf("%02X ", aSioBuffer[lIndex]);

					printf("\n");
				}
#endif			
				cSioOutIndex = 0;
			}
		}
	}
	else
	{
		RAM[IO_SEROUT_SERIN] = aSioBuffer[sSioInIndex++];
		sSioInSize--;
#ifdef VERBOSE_SIO
		printf("             [%16lld] SERIN ", pContext->llCycleCounter);
		printf("(%02X, %d bytes left)!\n", RAM[IO_SEROUT_SERIN], sSioInSize);
#endif		
		if(sSioInSize > 0)
		{
			pIoData->llSerialInputDataReadyCycle = 
				pContext->llCycleCounter + SERIAL_INPUT_DATA_READY_CYCLES;

			AtariIoCycleTimedEventUpdate(pContext);
		}
		else
		{
			sSioInIndex = 0;
		}
	}

	return &RAM[IO_SEROUT_SERIN];
}

/* $D20E IRQEN/IRQST */
u8 *Pokey_IRQEN_IRQST(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
		Pokey_Sync(pContext, pContext->llCycleCounter);
#ifdef VERBOSE_IRQ
		printf("$%04X: IRQEN [%16lld] ", pContext->tCpu.pc, pContext->llCycleCounter);
	
		if((SRAM[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE) != 
			(*pValue & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE))
		{
			if(*pValue & IRQ_SERIAL_OUTPUT_TRANSMISSION_DONE)
				printf("(SERIAL_OUTPUT_TRANSMISSION_DONE enabled) ");
			else			
				printf("(SERIAL_OUTPUT_TRANSMISSION_DONE disabled) ");
		}		
	
		if((SRAM[IO_IRQEN_IRQST] & IRQ_SERIAL_OUTPUT_DATA_NEEDED) != 
			(*pValue & IRQ_SERIAL_OUTPUT_DATA_NEEDED))
		{
			if(*pValue & IRQ_SERIAL_OUTPUT_DATA_NEEDED)
				printf("(SERIAL_OUTPUT_DATA_NEEDED enabled) ");
			else			
				printf("(SERIAL_OUTPUT_DATA_NEEDED disabled) ");
		}		

		if((SRAM[IO_IRQEN_IRQST] & IRQ_SERIAL_INPUT_DATA_READY) != 
			(*pValue & IRQ_SERIAL_INPUT_DATA_READY))
		{
			if(*pValue & IRQ_SERIAL_INPUT_DATA_READY)
				printf("(SERIAL_INPUT_DATA_READY enabled) ");
			else			
				printf("(SERIAL_INPUT_DATA_READY disabled) ");
		}		
	
		if((SRAM[IO_IRQEN_IRQST] & IRQ_OTHER_KEY_PRESSED) != 
			(*pValue & IRQ_OTHER_KEY_PRESSED))
		{
			if(*pValue & IRQ_OTHER_KEY_PRESSED)
				printf("(OTHER_KEY_PRESSED enabled) ");
			else			
				printf("(OTHER_KEY_PRESSED disabled) ");
		}		
	
		if((SRAM[IO_IRQEN_IRQST] & IRQ_BREAK_KEY_PRESSED) != 
			(*pValue & IRQ_BREAK_KEY_PRESSED))
		{
			if(*pValue & IRQ_BREAK_KEY_PRESSED)
				printf("(BREAK_KEY_PRESSED enabled) ");
			else			
				printf("(BREAK_KEY_PRESSED disabled) ");
		}		
	
		printf("\n");
#endif	
		SRAM[IO_IRQEN_IRQST] = *pValue;
		RAM[IO_IRQEN_IRQST] |= ~SRAM[IO_IRQEN_IRQST];
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" IRQEN: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_IRQEN_IRQST];
}

/* $D20F SKCTL/SKSTAT */
u8 *Pokey_SKCTL_SKSTAT(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
 	{	
		Pokey_Sync(pContext, pContext->llCycleCounter);
		SRAM[IO_SKCTL_SKSTAT] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" SKCTL: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_SKCTL_SKSTAT];
}
