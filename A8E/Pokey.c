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
#include <math.h>

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

	/* 32.32 fixed-point audio sample time in CPU cycles. */
	u64 cycles_per_sample_fp;

	/* POKEY polynomial counters clocked at ~1.77MHz (PAL). */
	u32 lfsr17;
	u16 lfsr9;
	u8 lfsr5;
	u8 lfsr4;

	/* High-pass filter latches (AUDCTL bit2/bit1). */
	u8 hp1_latch;
	u8 hp2_latch;
	SDL_AudioSpec have;
	int audio_subsystem_started;
	int audio_opened;

	/* Sample phase (32.32 fixed-point CPU cycles since last output sample). */
	u64 sample_phase_fp;
	int64_t sample_accum;

	/* Last emitted sample (for underrun hold). */
	int16_t last_sample;

	int16_t *ring;
	u32 ring_size; /* in samples */
	u32 ring_mask; /* ring_size-1 if power-of-two, else 0 */
	u32 ring_read;
	u32 ring_write;
	u32 ring_count;

	/* Dynamic sample rate adjustment for audio/emulation sync. */
	u64 cycles_per_sample_fp_base;  /* nominal rate */
	u32 target_buffer_samples;      /* ideal fill level */

	u8 audctl;
	u8 skctl;
	PokeyAudioChannel_t aChannels[4];

	/* DC block (AC coupling): removes low-frequency bias from unipolar mixer output. */
	float dc_block_r;
	float dc_block_x1;
	float dc_block_y1;
} PokeyState_t;

static u32 PokeyAudio_ClampU32(u32 v, u32 lo, u32 hi)
{
	if(hi < lo)
		hi = lo;
	if(v < lo)
		return lo;
	if(v > hi)
		return hi;
	return v;
}

static u32 Pokey_CpuHz(void)
{
	return ATARI_CPU_HZ_PAL;
}

static u32 PokeyAudio_RingWrap(u32 idx, u32 ring_size, u32 ring_mask)
{
	if(ring_mask != 0)
		return idx & ring_mask;
	return (ring_size != 0) ? (idx % ring_size) : 0;
}

static void PokeyAudio_RingWrite(PokeyState_t *pPokey, const int16_t *pSamples, u32 count)
{
	if(!pPokey || !pPokey->ring || pPokey->ring_size == 0)
		return;

	/* If asked to write more than the whole ring, keep only the newest samples. */
	if(count >= pPokey->ring_size)
	{
		u32 keep = pPokey->ring_size;
		pSamples += (count - keep);
		count = keep;
	}

	/* Protect against the SDL audio callback thread. */
	if(pPokey->audio_opened)
		SDL_LockAudio();

	{
		u32 ring_size = pPokey->ring_size;
		u32 ring_mask = pPokey->ring_mask;
		u32 free_space = ring_size - pPokey->ring_count;
		u32 drop = (count > free_space) ? (count - free_space) : 0;

		if(drop)
		{
			pPokey->ring_read = PokeyAudio_RingWrap(pPokey->ring_read + drop, ring_size, ring_mask);
			pPokey->ring_count -= drop;
		}

		{
			u32 first = count;
			u32 to_end = ring_size - pPokey->ring_write;
			if(first > to_end)
				first = to_end;

			memcpy(&pPokey->ring[pPokey->ring_write], pSamples, (size_t)first * sizeof(int16_t));

			{
				u32 second = count - first;
				if(second)
					memcpy(&pPokey->ring[0], &pSamples[first], (size_t)second * sizeof(int16_t));
			}

			pPokey->ring_write = PokeyAudio_RingWrap(pPokey->ring_write + count, ring_size, ring_mask);
			pPokey->ring_count += count;
		}
	}

	if(pPokey->audio_opened)
		SDL_UnlockAudio();
}

static u32 PokeyAudio_RingRead(PokeyState_t *pPokey, int16_t *pSamples, u32 count)
{
	if(!pPokey || !pPokey->ring || pPokey->ring_size == 0)
		return 0;

	/* Called from the SDL audio callback; do not SDL_LockAudio() here. */
	{
		u32 ring_size = pPokey->ring_size;
		u32 ring_mask = pPokey->ring_mask;
		u32 avail = pPokey->ring_count;
		u32 to_read = (count < avail) ? count : avail;
		u32 first = to_read;
		u32 to_end = ring_size - pPokey->ring_read;

		if(first > to_end)
			first = to_end;

		memcpy(pSamples, &pPokey->ring[pPokey->ring_read], (size_t)first * sizeof(int16_t));

		{
			u32 second = to_read - first;
			if(second)
				memcpy(&pSamples[first], &pPokey->ring[0], (size_t)second * sizeof(int16_t));
		}

		pPokey->ring_read = PokeyAudio_RingWrap(pPokey->ring_read + to_read, ring_size, ring_mask);
		pPokey->ring_count -= to_read;
		return to_read;
	}
}

static void PokeyAudio_Callback(void *userdata, Uint8 *stream, int len)
{
	PokeyState_t *pPokey = (PokeyState_t *)userdata;
	int16_t *pOut = (int16_t *)stream;
	u32 samplesRequested = (u32)(len / (int)sizeof(int16_t));
	u32 samplesRead = PokeyAudio_RingRead(pPokey, pOut, samplesRequested);
	int16_t hold = (pPokey != NULL) ? pPokey->last_sample : 0;
	u32 i;

	if(samplesRead > 0)
		hold = pOut[samplesRead - 1];

	for(i = samplesRead; i < samplesRequested; i++)
		pOut[i] = hold;

	if(pPokey)
		pPokey->last_sample = hold;
}

/* Per-channel non-linear volume (~3 dB/step). vol=15 -> 8000 units.
   Soft-clip threshold = 8000; 4-ch max compressed ~= 26000. */
static const int32_t g_pokey_chan_vol[16] = {
	0, 63, 88, 125, 177, 250, 354, 500,
	707, 1000, 1414, 2000, 2828, 4000, 5657, 8000
};

static void PokeyAudio_RecomputeClocks(PokeyAudioChannel_t *pChannels, u8 audctl)
{
	u32 base = (audctl & 0x01) ? (u32)CYCLES_PER_LINE : 28u;

	/* Channel 1 (AUDF1/AUDC1). */
	pChannels[0].clk_div_cycles = (audctl & 0x40) ? 1u : base;
	/* Channel 2: in 16-bit mode (AUDCTL bit4), it is clocked by channel 1. */
	pChannels[1].clk_div_cycles = base;
	/* Channel 3 (AUDF3/AUDC3). */
	pChannels[2].clk_div_cycles = (audctl & 0x20) ? 1u : base;
	/* Channel 4: in 16-bit mode (AUDCTL bit3), it is clocked by channel 3. */
	pChannels[3].clk_div_cycles = base;
}

static void PokeyAudio_PolyStep(PokeyState_t *pPokey)
{
	if(!pPokey)
		return;

	/* Polynomials clocked by the ~1.79MHz (PAL) master clock.
	   The exact stepping matters for the perceived noise/buzz; these taps
	   match widely used reference implementations. */
	{
		/* poly4/poly5: shift left, new bit in bit0. */
		u32 l4 = (u32)pPokey->lfsr4 & 0x0fu;
		u32 l5 = (u32)pPokey->lfsr5 & 0x1fu;
		u32 new4 = (u32)(~(((l4 >> 2) ^ (l4 >> 3)) & 1u) & 1u);
		u32 new5 = (u32)(~(((l5 >> 2) ^ (l5 >> 4)) & 1u) & 1u);
		pPokey->lfsr4 = (u8)(((l4 << 1) | new4) & 0x0fu);
		pPokey->lfsr5 = (u8)(((l5 << 1) | new5) & 0x1fu);
	}

	{
		/* poly9: 9-bit LFSR (BIT0 ^ BIT5). */
		u32 l9 = (u32)pPokey->lfsr9 & 0x1ffu;
		u32 in9 = ((l9 >> 0) ^ (l9 >> 5)) & 1u;
		l9 = (l9 >> 1) | (in9 << 8);
		pPokey->lfsr9 = (u16)(l9 & 0x1ffu);
	}

	{
		/* poly17: POKEY-specific 17-bit polynomial. */
		u32 l17 = pPokey->lfsr17 & 0x1ffffu;
		u32 in8 = ((l17 >> 8) ^ (l17 >> 13)) & 1u;
		u32 in0 = l17 & 1u;
		l17 >>= 1;
		l17 = (l17 & 0xff7fu) | (in8 << 7);
		l17 = (l17 & 0xffffu) | (in0 << 16);
		pPokey->lfsr17 = l17 & 0x1ffffu;
	}
}

static u8 PokeyAudio_Poly17Bit(PokeyState_t *pPokey, u8 audctl)
{
	if(!pPokey)
		return 0;
	return (u8)(((audctl & 0x80) ? pPokey->lfsr9 : pPokey->lfsr17) & 1u);
}

static void PokeyAudio_ChannelClockOut(PokeyState_t *pPokey, PokeyAudioChannel_t *pCh, u8 audctl)
{
	/* AUDC bits:
	   - bit4: volume only (forces DAC input high; bypasses noise control)
	   - bits7..5: distortion selector (3 bits) */
	u8 audc;
	u8 dist;
	u8 vol_only;
	u8 poly5;

	if(!pPokey || !pCh)
		return;

	audc = pCh->audc;
	vol_only = (u8)((audc & 0x10) != 0);
	if(vol_only)
	{
		pCh->output = 1;
		return;
	}

	dist = (u8)((audc >> 5) & 0x07);

	/* poly5 gates the flip-flop clock for distortions 0..3. */
	if(dist <= 3)
	{
		poly5 = (u8)(pPokey->lfsr5 & 1u);
		if(!poly5)
			return;
	}

	switch(dist)
	{
		/* 0: 5-bit/17-bit poly noise (poly5 gated, latch poly17/9). */
		/* 4: 17-bit poly noise (latch poly17/9). */
		case 0:
		case 4:
			pCh->output = PokeyAudio_Poly17Bit(pPokey, audctl);
			break;

		/* 2: 5-bit/4-bit poly noise (poly5 gated, latch poly4). */
		/* 6: 4-bit poly noise (latch poly4). */
		case 2:
		case 6:
			pCh->output = (u8)(pPokey->lfsr4 & 1u);
			break;

		/* 1/3: square buzz (poly5 gated toggle). */
		/* 5/7: pure tone (toggle). */
		default:
			pCh->output ^= 1u;
			break;
	}
}

static u8 PokeyAudio_ChannelTick(PokeyState_t *pPokey, PokeyAudioChannel_t *pCh, u8 audctl)
{
	u32 reload;

	if(pCh->counter > 0)
		pCh->counter--;

	if(pCh->counter != 0)
		return 0;

	/* Divider reload: For 15/64kHz clocks N = AUDF + 1.
	   For the ~1.77/1.79MHz clocks the hardware uses a modified formula:
	   - 8-bit:  N = AUDF + 4
	   - 16-bit: N = AUDF + 7 (handled in PokeyAudio_PairTick). */
	reload = (u32)pCh->audf + 1u;
	if(pCh == &pPokey->aChannels[0] && (audctl & 0x40))
		reload = (u32)pCh->audf + 4u;
	if(pCh == &pPokey->aChannels[2] && (audctl & 0x20))
		reload = (u32)pCh->audf + 4u;
	pCh->counter = reload ? reload : 1u;

	PokeyAudio_ChannelClockOut(pPokey, pCh, audctl);
	return 1;
}

static u8 PokeyAudio_PairTick(
	PokeyState_t *pPokey,
	PokeyAudioChannel_t *pChLow,
	PokeyAudioChannel_t *pChHigh,
	u8 audctl)
{
	u32 period = (((u32)pChHigh->audf) << 8) | (u32)pChLow->audf;
	u32 reload;

	if(pChHigh->counter > 0)
		pChHigh->counter--;

	if(pChHigh->counter != 0)
		return 0;

	reload = period + 1u;
	if(pChLow == &pPokey->aChannels[0] && (audctl & 0x40))
		reload = period + 7u;
	if(pChLow == &pPokey->aChannels[2] && (audctl & 0x20))
		reload = period + 7u;
	pChHigh->counter = reload ? reload : 1u;

	PokeyAudio_ChannelClockOut(pPokey, pChHigh, audctl);
	return 1;
}

static void PokeyAudio_StepCpuCycle(
	PokeyState_t *pPokey,
	PokeyAudioChannel_t *pChannels,
	u8 audctl)
{
	u8 pair12 = (u8)((audctl & 0x10) != 0);
	u8 pair34 = (u8)((audctl & 0x08) != 0);
	u8 pulse2 = 0;
	u8 pulse3 = 0;
	u32 i;

	/* If the two least significant bits of SKCTL are 0, audio clocks (and RNG)
	   are held in reset. */
	if(pPokey && ((pPokey->skctl & 0x03) == 0))
		return;

	/* Master clock tick: advance polynomial counters. */
	PokeyAudio_PolyStep(pPokey);

	if(pair12)
	{
		if(pChannels[0].clk_div_cycles == 1)
		{
			(void)PokeyAudio_PairTick(pPokey, &pChannels[0], &pChannels[1], audctl);
		}
		else
		{
			pChannels[0].clk_acc_cycles++;
			if(pChannels[0].clk_acc_cycles >= pChannels[0].clk_div_cycles)
			{
				pChannels[0].clk_acc_cycles -= pChannels[0].clk_div_cycles;
				(void)PokeyAudio_PairTick(pPokey, &pChannels[0], &pChannels[1], audctl);
			}
		}
	}
	else
	{
		for(i = 0; i < 2; i++)
		{
			if(pChannels[i].clk_div_cycles == 1)
			{
				(void)PokeyAudio_ChannelTick(pPokey, &pChannels[i], audctl);
				continue;
			}

			pChannels[i].clk_acc_cycles++;
			if(pChannels[i].clk_acc_cycles >= pChannels[i].clk_div_cycles)
			{
				pChannels[i].clk_acc_cycles -= pChannels[i].clk_div_cycles;
				(void)PokeyAudio_ChannelTick(pPokey, &pChannels[i], audctl);
			}
		}
	}

	if(pair34)
	{
		/* In 16-bit pair mode ch3 is a prescaler; only ch4 (chHigh) independently
		   underflows.  pulse2 (ch3 clock used for HP filter on ch1) stays 0. */
		if(pChannels[2].clk_div_cycles == 1)
		{
			pulse3 = PokeyAudio_PairTick(pPokey, &pChannels[2], &pChannels[3], audctl);
		}
		else
		{
			pChannels[2].clk_acc_cycles++;
			if(pChannels[2].clk_acc_cycles >= pChannels[2].clk_div_cycles)
			{
				pChannels[2].clk_acc_cycles -= pChannels[2].clk_div_cycles;
				pulse3 = PokeyAudio_PairTick(pPokey, &pChannels[2], &pChannels[3], audctl);
			}
		}
	}
	else
	{
		for(i = 2; i < 4; i++)
		{
			if(pChannels[i].clk_div_cycles == 1)
			{
				u8 pulse = PokeyAudio_ChannelTick(pPokey, &pChannels[i], audctl);
				if(i == 2)
					pulse2 = pulse;
				else
					pulse3 = pulse;
				continue;
			}

			pChannels[i].clk_acc_cycles++;
			if(pChannels[i].clk_acc_cycles >= pChannels[i].clk_div_cycles)
			{
				pChannels[i].clk_acc_cycles -= pChannels[i].clk_div_cycles;
				{
					u8 pulse = PokeyAudio_ChannelTick(pPokey, &pChannels[i], audctl);
					if(i == 2)
						pulse2 = pulse;
					else
						pulse3 = pulse;
				}
			}
		}
	}

	/* Update high-pass latches after divider pulses of ch3/ch4. */
	if(pulse2 && (audctl & 0x04))
		pPokey->hp1_latch = pChannels[0].output;
	if(pulse3 && (audctl & 0x02))
		pPokey->hp2_latch = pChannels[1].output;
}

/* Normalize unipolar mixer output (0..28000), apply 0.75 gain, DC block, and
   scale to int16. Max-vol-all-ch soft-clipped ~= 26000, so 28000 headroom. */
static int16_t PokeyAudio_FinalizeSample(PokeyState_t *pPokey, int32_t raw)
{
	float sample = (float)raw * (0.75f / 28000.0f);
	float out = sample - pPokey->dc_block_x1
	            + pPokey->dc_block_r * pPokey->dc_block_y1;
	pPokey->dc_block_x1 = sample;
	pPokey->dc_block_y1 = out;
	out *= 32767.0f;
	if(out > 32767.0f) out = 32767.0f;
	else if(out < -32768.0f) out = -32768.0f;
	return (int16_t)out;
}

static int32_t PokeyAudio_MixCycleLevel(PokeyState_t *pPokey, PokeyAudioChannel_t *pChannels, u8 audctl)
{
	u32 i;
	int32_t sum = 0;
	u8 pair12 = (u8)((audctl & 0x10) != 0);
	u8 pair34 = (u8)((audctl & 0x08) != 0);
	u8 two_tone = (u8)((pPokey->skctl & 0x08) != 0);

	if(!pPokey)
		return 0;

	for(i = 0; i < 4; i++)
	{
		if(i == 0 && pair12)
			continue;
		if(i == 2 && pair34)
			continue;

		u8 audc = pChannels[i].audc;
		u8 vol = (u8)(audc & 0x0f);
		u8 vol_only = (u8)((audc & 0x10) != 0);
		u8 bit;

		if(vol == 0)
			continue;

		/* Unipolar volume gate: 0 -> silence, 1 -> full channel volume. */
		bit = vol_only ? 1u : (u8)(pChannels[i].output & 1u);

		/* Two-tone mode (SKCTL bit 3): ch1 output ANDed with ch2 flip-flop. */
		if(i == 0 && two_tone)
			bit &= (u8)(pChannels[1].output & 1u);

		/* Optional POKEY digital high-pass filters (bypassed in volume-only mode). */
		if(!vol_only)
		{
			if(i == 0 && (audctl & 0x04))
				bit ^= (u8)(pPokey->hp1_latch & 1u);
			if(i == 1 && (audctl & 0x02))
				bit ^= (u8)(pPokey->hp2_latch & 1u);
		}

		sum += g_pokey_chan_vol[vol] * (int32_t)bit;
	}

	/* Soft-clip: compress beyond one channel's max (transistor output stage). */
	if(sum > 8000)
		sum = 8000 + (sum - 8000) * 3 / 4;
	if(sum < 0) sum = 0;
	if(sum > 28000) sum = 28000;

	return sum;
}

static PokeyState_t *Pokey_GetState(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	if(!pIoData)
		return NULL;

	return (PokeyState_t *)pIoData->pPokey;
}

u64 Pokey_TimerPeriodCpuCycles(_6502_Context_t *pContext, u8 timer)
{
	u8 audctl;
	u32 base;
	u64 div;
	u64 reload;

	if(!pContext)
		return 0;

	/* Hold timers when POKEY clocks are in reset (SKCTL bits0..1 = 0). */
	if((SRAM[IO_SKCTL_SKSTAT] & 0x03) == 0)
		return 0;

	audctl = SRAM[IO_AUDCTL_ALLPOT];
	base = (audctl & 0x01) ? (u32)CYCLES_PER_LINE : 28u;

	switch(timer)
	{
		case 1:
			/* In 16-bit mode (ch1+ch2), timer1 has no independent divider output. */
			if(audctl & 0x10)
				return 0;
			if(SRAM[IO_AUDF1_POT0] == 0)
				return 0;

			div = (audctl & 0x40) ? 1ull : (u64)base;
			reload = (u64)SRAM[IO_AUDF1_POT0] + ((audctl & 0x40) ? 4ull : 1ull);
			return reload * div;

		case 2:
			if(SRAM[IO_AUDF2_POT2] == 0)
				return 0;

			if(audctl & 0x10)
			{
				u32 period12 = (((u32)SRAM[IO_AUDF2_POT2]) << 8) | (u32)SRAM[IO_AUDF1_POT0];
				div = (audctl & 0x40) ? 1ull : (u64)base;
				reload = (u64)period12 + ((audctl & 0x40) ? 7ull : 1ull);
				return reload * div;
			}

			div = (u64)base;
			reload = (u64)SRAM[IO_AUDF2_POT2] + 1ull;
			return reload * div;

		case 4:
			if(SRAM[IO_AUDF4_POT6] == 0)
				return 0;

			if(audctl & 0x08)
			{
				u32 period34 = (((u32)SRAM[IO_AUDF4_POT6]) << 8) | (u32)SRAM[IO_AUDF3_POT4];
				div = (audctl & 0x20) ? 1ull : (u64)base;
				reload = (u64)period34 + ((audctl & 0x20) ? 7ull : 1ull);
				return reload * div;
			}

			div = (u64)base;
			reload = (u64)SRAM[IO_AUDF4_POT6] + 1ull;
			return reload * div;

		default:
			return 0;
	}
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

	/* Prefer 48kHz to avoid common host-side resampling. */
	pPokey->sample_rate_hz = 48000;
	pPokey->cpu_hz = Pokey_CpuHz();
	pPokey->cycles_per_sample_fp =
		(((u64)pPokey->cpu_hz) << 32) / (u64)pPokey->sample_rate_hz;
	pPokey->cycles_per_sample_fp_base = pPokey->cycles_per_sample_fp;
	pPokey->last_cycle = pContext->llCycleCounter;
	pPokey->sample_phase_fp = 0;

	pPokey->lfsr17 = 0x1ffffu;
	pPokey->lfsr9 = 0x01ffu;
	pPokey->lfsr5 = 0x00u;
	pPokey->lfsr4 = 0x00u;
	pPokey->hp1_latch = 0;
	pPokey->hp2_latch = 0;
	pPokey->dc_block_r = (float)exp(-2.0 * 3.14159265358979 * 20.0 / (double)pPokey->sample_rate_hz);
	pPokey->dc_block_x1 = 0.0f;
	pPokey->dc_block_y1 = 0.0f;
	/* Ring buffer to absorb timing variations between emulation and audio output. */
	pPokey->ring_size = 8192;
	pPokey->ring_mask = ((pPokey->ring_size & (pPokey->ring_size - 1u)) == 0) ? (pPokey->ring_size - 1u) : 0;
	pPokey->ring = (int16_t *)malloc(sizeof(int16_t) * pPokey->ring_size);
	if(pPokey->ring)
		memset(pPokey->ring, 0, sizeof(int16_t) * pPokey->ring_size);

	pPokey->ring_write = 0;
	pPokey->ring_read = 0;
	pPokey->ring_count = 0;

	/* Default target: 1/4 ring for low latency. This gets refined after SDL_OpenAudio. */
	pPokey->target_buffer_samples = PokeyAudio_ClampU32(pPokey->ring_size / 4u, 256u, (pPokey->ring_size > 0) ? (pPokey->ring_size - 1u) : 0u);

	pPokey->audctl = SRAM[IO_AUDCTL_ALLPOT];
	pPokey->skctl = SRAM[IO_SKCTL_SKSTAT];
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
	want.samples = 1024;  /* Smaller buffer for lower latency and better sync */
	want.callback = PokeyAudio_Callback;
	want.userdata = pPokey;

	if(!(SDL_WasInit(SDL_INIT_AUDIO) & SDL_INIT_AUDIO))
	{
		if(SDL_InitSubSystem(SDL_INIT_AUDIO) < 0)
		{
			/* Keep emulator running without audio. */
			pIoData->pPokey = pPokey;
			return;
		}

		pPokey->audio_subsystem_started = 1;
	}

	if(SDL_OpenAudio(&want, &pPokey->have) < 0)
	{
		if(pPokey->audio_subsystem_started)
		{
			SDL_QuitSubSystem(SDL_INIT_AUDIO);
			pPokey->audio_subsystem_started = 0;
		}
		pIoData->pPokey = pPokey;
		return;
	}

	/* Keep implementation simple: require the format we generate. */
	if(pPokey->have.format != AUDIO_S16SYS || pPokey->have.channels != 1 || pPokey->have.freq <= 0)
	{
		SDL_CloseAudio();
		if(pPokey->audio_subsystem_started)
		{
			SDL_QuitSubSystem(SDL_INIT_AUDIO);
			pPokey->audio_subsystem_started = 0;
		}
		pIoData->pPokey = pPokey;
		return;
	}

	pPokey->sample_rate_hz = (u32)pPokey->have.freq;
	pPokey->cycles_per_sample_fp =
		(((u64)pPokey->cpu_hz) << 32) / (u64)pPokey->sample_rate_hz;
	pPokey->cycles_per_sample_fp_base = pPokey->cycles_per_sample_fp;
	pPokey->sample_phase_fp = 0;

	/* Prefer ~2 SDL device buffers as the steady-state fill (keeps playback smooth without huge latency). */
	if(pPokey->have.samples > 0)
	{
		u32 target = (u32)pPokey->have.samples * 2u;
		u32 max_target = (pPokey->ring_size * 3u) / 4u; /* leave headroom for throttling */
		if(max_target == 0)
			max_target = (pPokey->ring_size > 0) ? (pPokey->ring_size - 1u) : 0u;
		pPokey->target_buffer_samples = PokeyAudio_ClampU32(target, 256u, max_target);
	}

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
	{
		SDL_LockAudio();
		pPokey->audio_opened = 0;
		SDL_UnlockAudio();
		SDL_CloseAudio();
	}
	if(pPokey->audio_subsystem_started)
		SDL_QuitSubSystem(SDL_INIT_AUDIO);

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
	{
		u8 skctl = SRAM[IO_SKCTL_SKSTAT];
		if(pPokey->skctl != skctl)
		{
			u32 i;
			pPokey->skctl = skctl;
			if((skctl & 0x03) == 0)
			{
				/* Hold RNG/audio in reset: restart polynomials and prescalers. */
				pPokey->lfsr17 = 0x1ffffu;
				pPokey->lfsr9 = 0x01ffu;
				pPokey->lfsr5 = 0x00u;
				pPokey->lfsr4 = 0x00u;
				for(i = 0; i < 4; i++)
					pPokey->aChannels[i].clk_acc_cycles = 0;
				pPokey->hp1_latch = 0;
				pPokey->hp2_latch = 0;
			}
		}
	}

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

	{
		u64 adjusted_cps;
		u32 fill_level;
		int32_t fill_delta;
		u32 target;

		/* Dynamic rate adjustment: speed up sample generation when buffer is low,
		   slow down when buffer is filling up. This keeps audio in sync. */
		if(pPokey->audio_opened)
			SDL_LockAudio();
		fill_level = pPokey->ring_count;
		if(pPokey->audio_opened)
			SDL_UnlockAudio();

		target = pPokey->target_buffer_samples;
		if(target == 0)
			target = 1;

		fill_delta = (int32_t)fill_level - (int32_t)target;

		/* Clamp control error so we never apply a runaway correction. */
		if(fill_delta > (int32_t)target)
			fill_delta = (int32_t)target;
		else if(fill_delta < -(int32_t)target)
			fill_delta = -(int32_t)target;

		/* Adjust by up to +/- 2% based on buffer fill level.
		   Positive fill_delta means buffer is fuller than target -> slow down (increase cycles_per_sample).
		   Negative fill_delta means buffer is emptier -> speed up (decrease cycles_per_sample). */
		{
			int64_t base = (int64_t)pPokey->cycles_per_sample_fp_base;
			int64_t max_adjust = base / 50; /* 2% */
			int64_t adjustment = ((int64_t)fill_delta * max_adjust) / (int64_t)target;
			int64_t adjusted = base + adjustment;

			if(adjusted < (base - max_adjust))
				adjusted = base - max_adjust;
			else if(adjusted > (base + max_adjust))
				adjusted = base + max_adjust;
			if(adjusted < 1)
				adjusted = 1;

			adjusted_cps = (u64)adjusted;
		}

		cur = pPokey->last_cycle;

		while(cur < llCycleCounter)
		{
			int32_t level = PokeyAudio_MixCycleLevel(pPokey, pPokey->aChannels, pPokey->audctl);
			u64 cycles_needed_fp;
			u64 batch_fp = (1ull << 32);

			/* adjusted_cps can decrease between sync calls due adaptive rate control.
			   Keep phase/accum consistent so subtraction below cannot underflow. */
			if(pPokey->sample_phase_fp >= adjusted_cps)
			{
				int64_t avg_level = 0;
				if(pPokey->sample_phase_fp != 0)
					avg_level = pPokey->sample_accum / (int64_t)pPokey->sample_phase_fp;
				pPokey->sample_accum = avg_level * (int64_t)adjusted_cps;
				pPokey->sample_phase_fp = adjusted_cps;
			}

			cycles_needed_fp = adjusted_cps - pPokey->sample_phase_fp;

			if(batch_fp < cycles_needed_fp)
			{
				pPokey->sample_accum += (int64_t)level * (int64_t)batch_fp;
				pPokey->sample_phase_fp += batch_fp;
			}
			else
			{
				pPokey->sample_accum += (int64_t)level * (int64_t)cycles_needed_fp;
				tmp[tmpCount++] = PokeyAudio_FinalizeSample(pPokey,
					(int32_t)(pPokey->sample_accum / (int64_t)adjusted_cps));

				if(tmpCount == (sizeof(tmp) / sizeof(tmp[0])))
				{
					PokeyAudio_RingWrite(pPokey, tmp, tmpCount);
					tmpCount = 0;
				}

				batch_fp -= cycles_needed_fp;
				while(batch_fp >= adjusted_cps)
				{
					tmp[tmpCount++] = PokeyAudio_FinalizeSample(pPokey, level);

					if(tmpCount == (sizeof(tmp) / sizeof(tmp[0])))
					{
						PokeyAudio_RingWrite(pPokey, tmp, tmpCount);
						tmpCount = 0;
					}
					batch_fp -= adjusted_cps;
				}

				pPokey->sample_accum = (int64_t)level * (int64_t)batch_fp;
				pPokey->sample_phase_fp = batch_fp;
			}

			PokeyAudio_StepCpuCycle(pPokey, pPokey->aChannels, pPokey->audctl);
			cur++;
		}

		if(tmpCount)
			PokeyAudio_RingWrite(pPokey, tmp, tmpCount);
	}

	pPokey->last_cycle = llCycleCounter;
}

int Pokey_ShouldThrottle(_6502_Context_t *pContext)
{
	PokeyState_t *pPokey = Pokey_GetState(pContext);
	u32 fill_level;
	u32 high_water;

	if(!pPokey || !pPokey->audio_opened || !pPokey->ring || pPokey->ring_size == 0)
		return 0;

	/* If audio isn't actually playing, don't stall the emulator. */
	if(SDL_GetAudioStatus() != SDL_AUDIO_PLAYING)
		return 0;

	/* High water mark: if buffer is more than 75% full, throttle.
	   This provides audio-driven sync to prevent buffer overflow. */
	high_water = (pPokey->ring_size * 3) / 4;
	if(pPokey->have.samples > 0 && pPokey->target_buffer_samples > 0)
	{
		u32 extra = (u32)pPokey->have.samples * 2u;
		u32 candidate = pPokey->target_buffer_samples;
		if(candidate < (0xffffffffu - extra))
			candidate += extra;
		else
			candidate = 0xffffffffu;
		if(candidate < high_water)
			high_water = candidate;
	}

	SDL_LockAudio();
	fill_level = pPokey->ring_count;
	SDL_UnlockAudio();

	return (fill_level >= high_water) ? 1 : 0;
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

/* Pot scanning constants */
#define POKEY_POT_MAX 228
#define POKEY_POT_CYCLES_PER_COUNT 28

void Pokey_PotStartScan(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u32 i;

	if(!pIoData)
		return;

	pIoData->cPotScanActive = 1;
	pIoData->llPotScanStartCycle = pContext->llCycleCounter;
	pIoData->cAllPot = 0xff;
	memset(pIoData->aPotLatched, 0, sizeof(pIoData->aPotLatched));

	for(i = 0; i < 8; i++)
		RAM[(IO_AUDF1_POT0 + i) & 0xffff] = 0x00;
	RAM[IO_AUDCTL_ALLPOT] = 0xff;
}

void Pokey_PotUpdate(_6502_Context_t *pContext)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;
	u64 elapsed;
	u32 count;
	u32 i;
	u8 allpot;
	u8 anyPending;

	if(!pIoData || !pIoData->cPotScanActive)
		return;

	elapsed = pContext->llCycleCounter - pIoData->llPotScanStartCycle;
	count = (u32)(elapsed / POKEY_POT_CYCLES_PER_COUNT);
	if(count > 255)
		count = 255;

	allpot = pIoData->cAllPot;
	anyPending = 0;

	for(i = 0; i < 8; i++)
	{
		u8 target;

		if(pIoData->aPotLatched[i])
			continue;

		anyPending = 1;
		target = pIoData->aPotValues[i];
		if(target > POKEY_POT_MAX)
			target = POKEY_POT_MAX;

		if(count >= target)
		{
			pIoData->aPotLatched[i] = 1;
			RAM[(IO_AUDF1_POT0 + i) & 0xffff] = target;
			allpot &= ~(1 << i);
		}
		else
		{
			u32 cur = count;
			if(cur > POKEY_POT_MAX)
				cur = POKEY_POT_MAX;
			RAM[(IO_AUDF1_POT0 + i) & 0xffff] = (u8)cur;
		}
	}

	pIoData->cAllPot = allpot;
	RAM[IO_AUDCTL_ALLPOT] = allpot;

	if(!anyPending || (allpot & 0xff) == 0)
		pIoData->cPotScanActive = 0;
}

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
				pPokey->aChannels[0].audf = *pValue;
		}
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" AUDF1: %02X\n", *pValue);
#endif
	}
	else
	{
		Pokey_PotUpdate(pContext);
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
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" AUDC1: %02X\n", *pValue);
#endif
	}
	else
	{
		Pokey_PotUpdate(pContext);
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
				pPokey->aChannels[1].audf = *pValue;
		}
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" AUDF2: %02X\n", *pValue);
#endif
	}
	else
	{
		Pokey_PotUpdate(pContext);
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
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" AUDC2: %02X\n", *pValue);
#endif
	}
	else
	{
		Pokey_PotUpdate(pContext);
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
				pPokey->aChannels[2].audf = *pValue;
		}
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" AUDF3: %02X\n", *pValue);
#endif
	}
	else
	{
		Pokey_PotUpdate(pContext);
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
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" AUDC3: %02X\n", *pValue);
#endif
	}
	else
	{
		Pokey_PotUpdate(pContext);
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
				pPokey->aChannels[3].audf = *pValue;
		}
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" AUDF4: %02X\n", *pValue);
#endif
	}
	else
	{
		Pokey_PotUpdate(pContext);
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
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" AUDC4: %02X\n", *pValue);
#endif
	}
	else
	{
		Pokey_PotUpdate(pContext);
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
			}
		}
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" AUDCTL: %02X\n", *pValue);
#endif
	}
	else
	{
		Pokey_PotUpdate(pContext);
	}

	return &RAM[IO_AUDCTL_ALLPOT];
}

/* $D209 STIMER/KBCODE */
u8 *Pokey_STIMER_KBCODE(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
  	{
		IoData_t *pIoData = (IoData_t *)pContext->pIoData;
		u64 period;

		Pokey_Sync(pContext, pContext->llCycleCounter);
		SRAM[IO_STIMER_KBCODE] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" STIMER: %02X\n", *pValue);
#endif

		/* STIMER resets all audio channel dividers to their AUDF values. */
		{
			PokeyState_t *pPokey = Pokey_GetState(pContext);
			if(pPokey)
			{
				u32 i;
				for(i = 0; i < 4; i++)
					pPokey->aChannels[i].clk_acc_cycles = 0;

				if(pPokey->audctl & 0x10)
				{
					u32 p12 = (((u32)pPokey->aChannels[1].audf) << 8) | (u32)pPokey->aChannels[0].audf;
					pPokey->aChannels[1].counter = (pPokey->audctl & 0x40) ? (p12 + 7u) : (p12 + 1u);
				}
				else
				{
					pPokey->aChannels[0].counter = (pPokey->audctl & 0x40) ?
						((u32)pPokey->aChannels[0].audf + 4u) : ((u32)pPokey->aChannels[0].audf + 1u);
					pPokey->aChannels[1].counter = (u32)pPokey->aChannels[1].audf + 1u;
				}
				if(pPokey->audctl & 0x08)
				{
					u32 p34 = (((u32)pPokey->aChannels[3].audf) << 8) | (u32)pPokey->aChannels[2].audf;
					pPokey->aChannels[3].counter = (pPokey->audctl & 0x20) ? (p34 + 7u) : (p34 + 1u);
				}
				else
				{
					pPokey->aChannels[2].counter = (pPokey->audctl & 0x20) ?
						((u32)pPokey->aChannels[2].audf + 4u) : ((u32)pPokey->aChannels[2].audf + 1u);
					pPokey->aChannels[3].counter = (u32)pPokey->aChannels[3].audf + 1u;
				}
			}
		}

		period = Pokey_TimerPeriodCpuCycles(pContext, 1);
		pIoData->llTimer1Cycle = period ? (pContext->llCycleCounter + period) : CYCLE_NEVER;

		period = Pokey_TimerPeriodCpuCycles(pContext, 2);
		pIoData->llTimer2Cycle = period ? (pContext->llCycleCounter + period) : CYCLE_NEVER;

		period = Pokey_TimerPeriodCpuCycles(pContext, 4);
		pIoData->llTimer4Cycle = period ? (pContext->llCycleCounter + period) : CYCLE_NEVER;

		AtariIoCycleTimedEventUpdate(pContext);
	}

	return &RAM[IO_STIMER_KBCODE];
}

/* Standalone LFSR17 for RANDOM when audio state is unavailable. */
static u32 m_lStandaloneLfsr17 = 0x1ffffu;

static u8 Pokey_StepStandaloneLfsr17(void)
{
	u32 l17 = m_lStandaloneLfsr17 & 0x1ffffu;
	u32 in8 = ((l17 >> 8) ^ (l17 >> 13)) & 1u;
	u32 in0 = l17 & 1u;
	l17 >>= 1;
	l17 = (l17 & 0xff7fu) | (in8 << 7);
	l17 = (l17 & 0xffffu) | (in0 << 16);
	m_lStandaloneLfsr17 = l17 & 0x1ffffu;
	return (u8)(m_lStandaloneLfsr17 & 0xffu);
}

/* $D20A SKREST/RANDOM */
u8 *Pokey_SKREST_RANDOM(_6502_Context_t *pContext, u8 *pValue)
{
	PokeyState_t *pPokey = Pokey_GetState(pContext);

	if(pValue)
 	{
		Pokey_Sync(pContext, pContext->llCycleCounter);
		SRAM[IO_SKREST_RANDOM] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" SKREST: %02X\n", *pValue);
#endif
	}

	if(pPokey)
	{
		RAM[IO_SKREST_RANDOM] = (u8)(pPokey->lfsr17 & 0xff);
	}
	else
	{
		RAM[IO_SKREST_RANDOM] = Pokey_StepStandaloneLfsr17();
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
		Pokey_PotStartScan(pContext);
#ifdef VERBOSE_REGISTER
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" POTGO: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_POTGO];
}

static u8 aSioBuffer[1024];
static u16 cSioOutIndex = 0;
static u16 sSioInIndex = 0;
static u16 sSioInSize = 0;

/* SIO data phase state (for WRITE/PUT/VERIFY commands) */
#define SIO_DATA_OFFSET 32
static u8 cSioOutPhase = 0;
static u16 sSioDataIndex = 0;
static u8 cSioPendingCmd = 0;
static u16 sSioPendingSector = 0;
static u16 sSioPendingBytes = 0;

static u8 AtariIo_SioChecksum(u8 *pBuffer, u32 lSize)
{
	u8 cChecksum = 0;

	while(lSize--)
	{
		cChecksum += (((u16)cChecksum + (u16)*pBuffer) >> 8) + *pBuffer;

		pBuffer++;
	}

	return cChecksum;
}

static void Pokey_SioQueueSerinResponse(_6502_Context_t *pContext, u16 size)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	sSioInSize = size;
	sSioInIndex = 0;
	pIoData->llSerialInputDataReadyCycle =
		pContext->llCycleCounter + SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
	AtariIoCycleTimedEventUpdate(pContext);
}

static void Pokey_SioSectorBytesAndOffset(u16 sSectorIndex, u16 sSectorSize,
	u16 *pBytesToRead, u32 *pOffset)
{
	if(sSectorIndex < 4)
	{
		*pBytesToRead = 128;
		*pOffset = (u32)(sSectorIndex - 1) * 128;
	}
	else
	{
		*pBytesToRead = sSectorSize;
		*pOffset = (u32)(sSectorIndex - 4) * sSectorSize + 128 * 3;
	}
}

/* $D20D SEROUT/SERIN */
u8 *Pokey_SEROUT_SERIN(_6502_Context_t *pContext, u8 *pValue)
{
	IoData_t *pIoData = (IoData_t *)pContext->pIoData;

	Pokey_Sync(pContext, pContext->llCycleCounter);
	if(pValue)
	{
#ifdef VERBOSE_SIO
		printf("             [%16llu] SEROUT ", pContext->llCycleCounter);
		printf("(%02X)!\n", *pValue);
#endif
		pIoData->llSerialOutputNeedDataCycle =
			pContext->llCycleCounter + SERIAL_OUTPUT_DATA_NEEDED_CYCLES;

		AtariIoCycleTimedEventUpdate(pContext);

		/* --- Data phase (WRITE/PUT/VERIFY) --- */
		if(cSioOutPhase == 1)
		{
			u16 expected;

			aSioBuffer[SIO_DATA_OFFSET + sSioDataIndex] = *pValue;
			sSioDataIndex++;

			expected = sSioPendingBytes + 1; /* data + checksum */
			if(sSioDataIndex == expected)
			{
				u16 sSectorSize = ((AtrHeader_t *)pIoData->pDisk1)->sSectorSize;
				u16 sBytesToRead;
				u32 lOffset;
				u8 provided = aSioBuffer[SIO_DATA_OFFSET + sSioPendingBytes];
				u8 calculated = AtariIo_SioChecksum(&aSioBuffer[SIO_DATA_OFFSET], sSioPendingBytes);

				pIoData->llSerialOutputTransmissionDoneCycle =
					pContext->llCycleCounter + SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;
				AtariIoCycleTimedEventUpdate(pContext);

				Pokey_SioSectorBytesAndOffset(sSioPendingSector, sSectorSize, &sBytesToRead, &lOffset);

				if(calculated != provided || !pIoData->pDisk1 ||
				   sSioPendingSector == 0 || lOffset + 16 >= pIoData->lDiskSize ||
				   sBytesToRead != sSioPendingBytes)
				{
					aSioBuffer[0] = 'N';
					Pokey_SioQueueSerinResponse(pContext, 1);
				}
				else if(cSioPendingCmd == 0x56) /* VERIFY */
				{
					u32 vi;
					u8 ok = 1;

					for(vi = 0; vi < sBytesToRead; vi++)
					{
						if(pIoData->pDisk1[16 + lOffset + vi] != aSioBuffer[SIO_DATA_OFFSET + vi])
						{
							ok = 0;
							break;
						}
					}
					aSioBuffer[0] = 'A';
					aSioBuffer[1] = ok ? 'C' : 'E';
					Pokey_SioQueueSerinResponse(pContext, 2);
				}
				else /* WRITE / PUT */
				{
					memcpy(pIoData->pDisk1 + 16 + lOffset,
						&aSioBuffer[SIO_DATA_OFFSET], sBytesToRead);
					aSioBuffer[0] = 'A';
					aSioBuffer[1] = 'C';
					Pokey_SioQueueSerinResponse(pContext, 2);
				}

				/* Reset data phase state */
				cSioOutPhase = 0;
				sSioDataIndex = 0;
				cSioPendingCmd = 0;
				sSioPendingSector = 0;
				sSioPendingBytes = 0;
				cSioOutIndex = 0;
			}

			return &RAM[IO_SEROUT_SERIN];
		}

		/* --- Command phase --- */
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
					u32 lOffset;
#ifdef VERBOSE_SIO
					{
						u32 lIndex;
						printf("SIO data send (checksum calculated: %02X): ",
							AtariIo_SioChecksum(aSioBuffer, 4));

						for(lIndex = 0; lIndex < 5; lIndex++)
							printf("%02X ", aSioBuffer[lIndex]);

						printf("\n");
					}
#endif
					pIoData->llSerialOutputTransmissionDoneCycle =
						pContext->llCycleCounter + SERIAL_OUTPUT_TRANSMISSION_DONE_CYCLES;

					AtariIoCycleTimedEventUpdate(pContext);

					switch(aSioBuffer[1])
					{
					case 0x52: /* READ SECTOR */
						sSectorIndex = aSioBuffer[2] + (aSioBuffer[3] << 8);

						sprintf(aCaption, APPLICATION_CAPTION "  [%d]", sSectorIndex);
						SDL_WM_SetCaption(aCaption, NULL);
#ifdef VERBOSE_SIO
						printf("SIO read sector %d\n", sSectorIndex);
#endif
						if(sSectorIndex == 0)
						{
							aSioBuffer[0] = 'N';
							sSioInSize = 1;
						}
						else
						{
							Pokey_SioSectorBytesAndOffset(sSectorIndex, sSectorSize,
								&sBytesToRead, &lOffset);

							if(lOffset + 16 >= pIoData->lDiskSize)
							{
								aSioBuffer[0] = 'N';
								sSioInSize = 1;
#ifdef VERBOSE_SIO
								printf("Not accepted (sector %d, offset = %lu, disk size = %lu!\n",
									sSectorIndex, lOffset, pIoData->lDiskSize);
#endif
							}
							else
							{
								aSioBuffer[0] = 'A';
								aSioBuffer[1] = 'C';

								memcpy(aSioBuffer + 2, pIoData->pDisk1 + 16 + lOffset, sBytesToRead);

								aSioBuffer[sBytesToRead + 2] = AtariIo_SioChecksum(aSioBuffer + 2, sBytesToRead);

								sSioInSize = sBytesToRead + 3;
#ifdef VERBOSE_SIO
								{
									u32 lIndex;
									printf("%04X: ", sSectorIndex);

									for(lIndex = 0; lIndex < sSioInSize; lIndex++)
										printf("%02X ", aSioBuffer[lIndex]);

									printf("\n");
								}
#endif
								pIoData->llSerialInputDataReadyCycle =
									pContext->llCycleCounter + SERIAL_INPUT_FIRST_DATA_READY_CYCLES;
							}
						}

						AtariIoCycleTimedEventUpdate(pContext);

						break;

					case 0x53: /* STATUS */
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

					case 0x57: /* WRITE SECTOR */
					case 0x50: /* PUT SECTOR */
					case 0x56: /* VERIFY SECTOR */
						sSectorIndex = aSioBuffer[2] + (aSioBuffer[3] << 8);
#ifdef VERBOSE_SIO
						printf("SIO %s sector %d\n",
							aSioBuffer[1] == 0x57 ? "write" :
							aSioBuffer[1] == 0x50 ? "put" : "verify",
							sSectorIndex);
#endif
						if(sSectorIndex == 0)
						{
							aSioBuffer[0] = 'N';
							Pokey_SioQueueSerinResponse(pContext, 1);
						}
						else
						{
							Pokey_SioSectorBytesAndOffset(sSectorIndex, sSectorSize,
								&sBytesToRead, &lOffset);

							if(lOffset + 16 >= pIoData->lDiskSize)
							{
								aSioBuffer[0] = 'N';
								Pokey_SioQueueSerinResponse(pContext, 1);
							}
							else
							{
								/* Enter data phase: ACK command, wait for data frame */
								cSioOutPhase = 1;
								sSioDataIndex = 0;
								cSioPendingCmd = aSioBuffer[1];
								sSioPendingSector = sSectorIndex;
								sSioPendingBytes = sBytesToRead;

								aSioBuffer[0] = 'A';
								Pokey_SioQueueSerinResponse(pContext, 1);
							}
						}

						break;

					case 0x21: /* FORMAT */
#ifdef VERBOSE_SIO
						printf("SIO format\n");
#endif
						if(!pIoData->pDisk1 || pIoData->lDiskSize <= 16)
						{
							aSioBuffer[0] = 'N';
							Pokey_SioQueueSerinResponse(pContext, 1);
						}
						else
						{
							memset(pIoData->pDisk1 + 16, 0, pIoData->lDiskSize - 16);
							aSioBuffer[0] = 'A';
							aSioBuffer[1] = 'C';
							Pokey_SioQueueSerinResponse(pContext, 2);
						}

						break;

					case 0x55: /* MOTOR ON */
#ifdef VERBOSE_SIO
						printf("SIO motor on\n");
#endif
						aSioBuffer[0] = 'A';
						aSioBuffer[1] = 'C';
						Pokey_SioQueueSerinResponse(pContext, 2);

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
		printf("             [%16llu] SERIN ", pContext->llCycleCounter);
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
		printf("$%04X: IRQEN [%16llu] ", pContext->tCpu.pc, pContext->llCycleCounter);
	
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
		printf("             [%16llu]", pContext->llCycleCounter);
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
		printf("             [%16llu]", pContext->llCycleCounter);
		printf(" SKCTL: %02X\n", *pValue);
#endif
	}
	else
	{
		Pokey_Sync(pContext, pContext->llCycleCounter);
	}

	return &RAM[IO_SKCTL_SKSTAT];
}
