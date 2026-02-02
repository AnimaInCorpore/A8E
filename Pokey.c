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

	/* Smoothed output to reduce aliasing from high-frequency polynomial noise. */
	double output_smooth;
} PokeyAudioChannel_t;

typedef struct
{
	double b0, b1, b2, a1, a2;
	double z1, z2;
} PokeyBiquad_t;

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

	/* Box-filter (cycle-accurate) resampling accumulator. */
	int64_t sample_acc;
	u64 sample_phase_fp;

	/* Output conditioning. */
	PokeyBiquad_t hp;
	PokeyBiquad_t lp;
	PokeyBiquad_t lp2;
	PokeyBiquad_t lp3;
	PokeyBiquad_t lp4;
	double analog_lp_fc;
	u8 filter_mode;
	u8 lp_stages;

	u32 dither_state;

	/* Non-linear-ish DAC/mixer approximation: sum(volume gates) -> raw level. */
	int32_t dac_table[61]; /* 0..60 */

	/* Optional smoothing for volume-only (sample playback) to reduce aliasing. */
	double vol_smooth[4];
	double vol_smooth2[4];
	double vol_alpha;

	/* Last emitted sample (for underrun hold). */
	int16_t last_sample;

	/* Drift compensation: smoothly adjust rate when buffer is too full/empty. */
	double rate_adjust;

	int16_t *ring;
	u32 ring_size; /* in samples */
	u32 ring_read;
	u32 ring_write;
	u32 ring_count;
	u32 ring_target; /* target fill level for rate adjustment */

	u8 audctl;
	u8 skctl;
	PokeyAudioChannel_t aChannels[4];
} PokeyState_t;

static u32 Pokey_CpuHz(void)
{
	return ATARI_CPU_HZ_PAL;
}

static void PokeyAudio_RingWrite(PokeyState_t *pPokey, const int16_t *pSamples, u32 count)
{
	u32 i;

	if(!pPokey || !pPokey->ring || pPokey->ring_size == 0)
		return;

	/* Protect against the SDL audio callback thread. */
	if(pPokey->audio_opened)
		SDL_LockAudio();

	/* Adaptive rate adjustment: if buffer is getting too full, slightly
	   speed up sample generation (skip); if too empty, slow down (duplicate).
	   This prevents hard discontinuities from dropping samples. */
	{
		int32_t fill_error = (int32_t)pPokey->ring_count - (int32_t)pPokey->ring_target;
		double adjust_speed = 0.00001; /* Very slow adjustment */
		pPokey->rate_adjust += (double)fill_error * adjust_speed;
		/* Clamp rate adjustment to +/- 2% */
		if(pPokey->rate_adjust > 0.02)
			pPokey->rate_adjust = 0.02;
		if(pPokey->rate_adjust < -0.02)
			pPokey->rate_adjust = -0.02;
	}

	for(i = 0; i < count; i++)
	{
		/* If buffer is critically full, blend with existing to avoid pop */
		if(pPokey->ring_count >= pPokey->ring_size - 1)
		{
			/* Crossfade oldest sample with new one */
			int32_t old_sample = pPokey->ring[pPokey->ring_read];
			int32_t new_sample = pSamples[i];
			pPokey->ring[pPokey->ring_read] = (int16_t)((old_sample + new_sample) / 2);
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

	/* Called from the SDL audio callback; do not SDL_LockAudio() here. */
	for(i = 0; i < count; i++)
	{
		if(pPokey->ring_count == 0)
			break;

		pSamples[i] = pPokey->ring[pPokey->ring_read];
		pPokey->ring_read = (pPokey->ring_read + 1) % pPokey->ring_size;
		pPokey->ring_count--;
	}

	return i;
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

	/* On underrun, fade to zero gradually instead of holding constant
	   (which can cause a DC offset click when audio resumes). */
	for(i = samplesRead; i < samplesRequested; i++)
	{
		pOut[i] = hold;
		/* Gentle fade toward zero */
		hold = (int16_t)(hold * 0.995);
	}

	if(pPokey)
		pPokey->last_sample = hold;
}

static u32 PokeyAudio_Xorshift32(u32 *pState)
{
	u32 x = *pState;
	if(x == 0)
		x = 0x6d2b79f5u;
	x ^= x << 13;
	x ^= x >> 17;
	x ^= x << 5;
	*pState = x;
	return x;
}

static double PokeyAudio_DitherTPDF(PokeyState_t *pPokey)
{
	/* Triangular PDF dither in approximately [-1, 1] LSB. */
	u32 r1 = PokeyAudio_Xorshift32(&pPokey->dither_state);
	u32 r2 = PokeyAudio_Xorshift32(&pPokey->dither_state);
	int32_t v = (int32_t)(r1 & 0xffff) - (int32_t)(r2 & 0xffff);
	return (double)v / 65536.0;
}

static void PokeyAudio_RecomputeDacTable(PokeyState_t *pPokey)
{
	/* A fast approximation of the real POKEY output path. Real POKEY DACs
	   and resistive summing are notably non-linear, which contributes to
	   the "warm" sound. We use a soft S-curve to reduce the "buzzy"
	   digital edge. Output is now BIPOLAR centered at 0. */
	const double headroom = 0.82;
	u32 i;

	if(!pPokey)
		return;

	for(i = 0; i <= 60; i++)
	{
		/* Use a tanh-based S-curve for smoother saturation at extremes.
		   Map 0-60 to -1.0 to +1.0 (bipolar) for proper AC audio. */
		double normalized = (double)i / 60.0;  /* 0..1 */
		double centered = (normalized * 2.0) - 1.0;  /* -1..+1 */
		double shaped = tanh(centered * 1.2) / tanh(1.2);  /* soft saturation */
		if(shaped < -1.0)
			shaped = -1.0;
		if(shaped > 1.0)
			shaped = 1.0;
		pPokey->dac_table[i] = (int32_t)lrint(shaped * 32767.0 * headroom);
	}
}

static void PokeyAudio_BiquadReset(PokeyBiquad_t *pBiquad)
{
	pBiquad->z1 = 0.0;
	pBiquad->z2 = 0.0;
}

static double PokeyAudio_BiquadProcess(PokeyBiquad_t *pBiquad, double x)
{
	double b0 = pBiquad->b0, b1 = pBiquad->b1, b2 = pBiquad->b2, a1 = pBiquad->a1,
		   a2 = pBiquad->a2;
	double z1 = pBiquad->z1, z2 = pBiquad->z2;
	double y = b0 * x + z1;
	z1 = b1 * x - a1 * y + z2;
	z2 = b2 * x - a2 * y;
	pBiquad->z1 = z1;
	pBiquad->z2 = z2;
	return y;
}

static void PokeyAudio_BiquadSetupLowpass(PokeyBiquad_t *pBiquad, double fs, double fc, double q)
{
	const double pi = 3.14159265358979323846;
	double w0, cosw0, sinw0, alpha, a0;
	double b0, b1, b2, a1, a2;

	if(fc < 1.0)
		fc = 1.0;
	if(fc > fs * 0.49)
		fc = fs * 0.49;

	w0 = 2.0 * pi * fc / fs;
	cosw0 = cos(w0);
	sinw0 = sin(w0);
	alpha = sinw0 / (2.0 * q);

	b0 = (1.0 - cosw0) * 0.5;
	b1 = 1.0 - cosw0;
	b2 = (1.0 - cosw0) * 0.5;
	a0 = 1.0 + alpha;
	a1 = -2.0 * cosw0;
	a2 = 1.0 - alpha;

	pBiquad->b0 = b0 / a0;
	pBiquad->b1 = b1 / a0;
	pBiquad->b2 = b2 / a0;
	pBiquad->a1 = a1 / a0;
	pBiquad->a2 = a2 / a0;
}

static void PokeyAudio_BiquadSetupHighpass(PokeyBiquad_t *pBiquad, double fs, double fc, double q)
{
	const double pi = 3.14159265358979323846;
	double w0, cosw0, sinw0, alpha, a0;
	double b0, b1, b2, a1, a2;

	if(fc < 1.0)
		fc = 1.0;
	if(fc > fs * 0.49)
		fc = fs * 0.49;

	w0 = 2.0 * pi * fc / fs;
	cosw0 = cos(w0);
	sinw0 = sin(w0);
	alpha = sinw0 / (2.0 * q);

	b0 = (1.0 + cosw0) * 0.5;
	b1 = -(1.0 + cosw0);
	b2 = (1.0 + cosw0) * 0.5;
	a0 = 1.0 + alpha;
	a1 = -2.0 * cosw0;
	a2 = 1.0 - alpha;

	pBiquad->b0 = b0 / a0;
	pBiquad->b1 = b1 / a0;
	pBiquad->b2 = b2 / a0;
	pBiquad->a1 = a1 / a0;
	pBiquad->a2 = a2 / a0;
}

static void PokeyAudio_RecomputeFilter(PokeyState_t *pPokey)
{
	double fs;
	double fc_lp;
	double fc_hp = 10.0;    /* DC blocker - lower since signal is now bipolar */
	const double q = 0.7071067811865475; /* Butterworth */

	if(!pPokey || pPokey->sample_rate_hz == 0)
		return;

	fs = (double)pPokey->sample_rate_hz;
	fc_lp = pPokey->analog_lp_fc;
	if(fc_lp < 1.0)
		fc_lp = 1.0;

	PokeyAudio_BiquadSetupHighpass(&pPokey->hp, fs, fc_hp, q);
	PokeyAudio_BiquadSetupLowpass(&pPokey->lp, fs, fc_lp, q);
	PokeyAudio_BiquadSetupLowpass(&pPokey->lp2, fs, fc_lp, q);
	PokeyAudio_BiquadSetupLowpass(&pPokey->lp3, fs, fc_lp, q);
	PokeyAudio_BiquadSetupLowpass(&pPokey->lp4, fs, fc_lp, q);
}

static int16_t PokeyAudio_PostProcessSample(PokeyState_t *pPokey, int32_t raw)
{
	double x;
	double y1;
	double y2;
	double out;

	if(!pPokey)
	{
		if(raw > 32767)
			raw = 32767;
		if(raw < -32768)
			raw = -32768;
		return (int16_t)raw;
	}

	x = (double)raw / 32768.0;

	y1 = PokeyAudio_BiquadProcess(&pPokey->hp, x);
	y2 = PokeyAudio_BiquadProcess(&pPokey->lp, y1);
	y2 = PokeyAudio_BiquadProcess(&pPokey->lp2, y2);
	if(pPokey->lp_stages >= 3)
		y2 = PokeyAudio_BiquadProcess(&pPokey->lp3, y2);
	if(pPokey->lp_stages >= 4)
		y2 = PokeyAudio_BiquadProcess(&pPokey->lp4, y2);

	/* Clamp and add a tiny amount of dither before quantizing back to int16. */
	out = y2;
	if(out > 1.0)
		out = 1.0;
	if(out < -1.0)
		out = -1.0;

	out += PokeyAudio_DitherTPDF(pPokey) * (1.0 / 32768.0);

	{
		int32_t s = (int32_t)lrint(out * 32767.0);
		if(s > 32767)
			s = 32767;
		if(s < -32768)
			s = -32768;
		return (int16_t)s;
	}
}

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
		if(pChannels[2].clk_div_cycles == 1)
		{
			pulse3 = PokeyAudio_PairTick(pPokey, &pChannels[2], &pChannels[3], audctl);
			pulse2 = pulse3;
		}
		else
		{
			pChannels[2].clk_acc_cycles++;
			if(pChannels[2].clk_acc_cycles >= pChannels[2].clk_div_cycles)
			{
				pChannels[2].clk_acc_cycles -= pChannels[2].clk_div_cycles;
				pulse3 = PokeyAudio_PairTick(pPokey, &pChannels[2], &pChannels[3], audctl);
				pulse2 = pulse3;
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

static int32_t PokeyAudio_MixCycleLevel(PokeyState_t *pPokey, PokeyAudioChannel_t *pChannels, u8 audctl)
{
	u32 i;
	double sum = 0.0;
	u8 pair12 = (u8)((audctl & 0x10) != 0);
	u8 pair34 = (u8)((audctl & 0x08) != 0);
	/* Alpha for smoothing raw polynomial output at ~1.77MHz rate.
	   This is the primary anti-aliasing filter for the noise generators. */
	const double poly_alpha = 0.08;

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
		double smoothed_bit;
		double x;

		if(vol == 0)
		{
			/* Still update smoothing state to avoid discontinuities when volume returns. */
			pChannels[i].output_smooth *= (1.0 - poly_alpha);
			continue;
		}

		/* Unipolar volume gate: 0 -> silence, 1 -> full channel volume. */
		bit = vol_only ? 1u : (u8)(pChannels[i].output & 1u);

		/* Optional POKEY digital high-pass filters (bypassed in volume-only mode). */
		if(!vol_only)
		{
			if(i == 0 && (audctl & 0x04))
				bit ^= (u8)(pPokey->hp1_latch & 1u);
			if(i == 1 && (audctl & 0x02))
				bit ^= (u8)(pPokey->hp2_latch & 1u);
		}

		/* First-stage smoothing: filter the raw polynomial output.
		   This runs at CPU clock rate (~1.77MHz) and is the main anti-aliasing. */
		pChannels[i].output_smooth += poly_alpha * ((double)bit - pChannels[i].output_smooth);
		smoothed_bit = pChannels[i].output_smooth;

		x = smoothed_bit * (double)vol;
		
		/* Second-stage smoothing for final output.
		   Use stronger alpha for volume-only (sample playback). */
		{
			double alpha = vol_only ? pPokey->vol_alpha : 0.5;
			pPokey->vol_smooth[i] += alpha * (x - pPokey->vol_smooth[i]);
			pPokey->vol_smooth2[i] += alpha * (pPokey->vol_smooth[i] - pPokey->vol_smooth2[i]);
			sum += pPokey->vol_smooth2[i];
		}
	}

	if(sum < 0.0)
		sum = 0.0;
	if(sum > 60.0)
		sum = 60.0;

	{
		u32 idx = (u32)sum;
		double frac = sum - (double)idx;
		int32_t a = pPokey->dac_table[idx];
		int32_t b = pPokey->dac_table[(idx < 60) ? (idx + 1u) : 60u];
		double y = ((double)a * (1.0 - frac)) + ((double)b * frac);
		return (int32_t)lrint(y);
	}
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

	/* Prefer 48kHz to avoid common host-side resampling. */
	pPokey->sample_rate_hz = 48000;
	pPokey->cpu_hz = Pokey_CpuHz();
	pPokey->cycles_per_sample_fp =
		(((u64)pPokey->cpu_hz) << 32) / (u64)pPokey->sample_rate_hz;
	pPokey->last_cycle = pContext->llCycleCounter;
	pPokey->sample_acc = 0;
	pPokey->sample_phase_fp = 0;
	pPokey->dither_state = 0x12345678u ^ (u32)pPokey->last_cycle;

	pPokey->lfsr17 = 0x1ffffu;
	pPokey->lfsr9 = 0x01ffu;
	pPokey->lfsr5 = 0x00u;
	pPokey->lfsr4 = 0x00u;
	pPokey->hp1_latch = 0;
	pPokey->hp2_latch = 0;
	PokeyAudio_RecomputeDacTable(pPokey);

	PokeyAudio_BiquadReset(&pPokey->hp);
	PokeyAudio_BiquadReset(&pPokey->lp);
	PokeyAudio_BiquadReset(&pPokey->lp2);
	PokeyAudio_BiquadReset(&pPokey->lp3);
	PokeyAudio_BiquadReset(&pPokey->lp4);
	pPokey->analog_lp_fc = 5000.0;
	pPokey->filter_mode = 0xff;
	pPokey->lp_stages = 4;
	pPokey->vol_alpha = 0.90;
	for(i = 0; i < 4; i++)
	{
		pPokey->vol_smooth[i] = 0.0;
		pPokey->vol_smooth2[i] = 0.0;
	}
	PokeyAudio_RecomputeFilter(pPokey);

	/* Larger ring buffer to absorb timing variations between emulation and audio output. */
	pPokey->ring_size = 32768;
	pPokey->ring = (int16_t *)malloc(sizeof(int16_t) * pPokey->ring_size);
	if(pPokey->ring)
		memset(pPokey->ring, 0, sizeof(int16_t) * pPokey->ring_size);
	pPokey->ring_target = pPokey->ring_size / 4; /* Target 25% full for headroom */
	pPokey->rate_adjust = 0.0;

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
		pPokey->aChannels[i].output_smooth = 0.0;
	}
	PokeyAudio_RecomputeClocks(pPokey->aChannels, pPokey->audctl);

	memset(&want, 0, sizeof(want));
	want.freq = (int)pPokey->sample_rate_hz;
	want.format = AUDIO_S16SYS;
	want.channels = 1;
	want.samples = 2048;  /* Larger buffer for smoother playback */
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
	pPokey->sample_acc = 0;
	pPokey->sample_phase_fp = 0;
	PokeyAudio_BiquadReset(&pPokey->hp);
	PokeyAudio_BiquadReset(&pPokey->lp);
	PokeyAudio_BiquadReset(&pPokey->lp2);
	PokeyAudio_BiquadReset(&pPokey->lp3);
	PokeyAudio_BiquadReset(&pPokey->lp4);
	PokeyAudio_RecomputeFilter(pPokey);

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

	/* Adapt the analog low-pass to common "sample playback" mode (15kHz volume updates).
	   This reduces the very audible 15kHz imaging/buzz without overly muffling normal tones. */
	{
		u8 mode = 0;
		if(pPokey->audctl & 0x01)
			mode |= 0x01; /* 15kHz base clock */
		if((pPokey->aChannels[0].audc | pPokey->aChannels[1].audc | pPokey->aChannels[2].audc | pPokey->aChannels[3].audc) & 0x10)
			mode |= 0x02; /* volume-only active */

		if(mode != pPokey->filter_mode)
		{
			const double pi = 3.14159265358979323846;
			double fc_smooth = 0.0;

			pPokey->filter_mode = mode;
			/* If volume-only is used, treat it as likely sample playback and
			   low-pass more aggressively to reduce imaging/aliasing. */
			if(mode & 0x02)
			{
				pPokey->analog_lp_fc = (mode & 0x01) ? 3200.0 : 4000.0;
				fc_smooth = pPokey->analog_lp_fc;
				pPokey->lp_stages = 4;
			}
			else
			{
				pPokey->analog_lp_fc = 5000.0;
				pPokey->lp_stages = 4;
			}

			if(fc_smooth > 0.0 && pPokey->cpu_hz > 0)
				pPokey->vol_alpha = 1.0 - exp(-2.0 * pi * fc_smooth / (double)pPokey->cpu_hz);
			else
				pPokey->vol_alpha = 0.85;

			PokeyAudio_RecomputeFilter(pPokey);
		}
		}

	cur = pPokey->last_cycle;
	while(cur < llCycleCounter)
	{
		/* Apply rate adjustment to compensate for emulation/audio timing drift. */
		u64 adjusted_cps = pPokey->cycles_per_sample_fp;
		if(pPokey->rate_adjust != 0.0)
		{
			double factor = 1.0 + pPokey->rate_adjust;
			adjusted_cps = (u64)((double)pPokey->cycles_per_sample_fp * factor);
		}

		/* Box-filter the piecewise-constant signal over each output sample
		   interval to reduce aliasing vs. point sampling. The signal is assumed
		   constant over the CPU cycle interval [cur, cur+1). */
		int32_t level = PokeyAudio_MixCycleLevel(pPokey, pPokey->aChannels, pPokey->audctl);
		u64 remaining_fp = 1ull << 32;

		while(remaining_fp)
		{
			u64 need_fp = adjusted_cps - pPokey->sample_phase_fp;
			u64 take_fp = (remaining_fp < need_fp) ? remaining_fp : need_fp;

			pPokey->sample_acc += (int64_t)level * (int64_t)take_fp;
			pPokey->sample_phase_fp += take_fp;
			remaining_fp -= take_fp;

			if(pPokey->sample_phase_fp >= adjusted_cps)
			{
				/* Round-to-nearest division for signed numerator. */
				int64_t num = pPokey->sample_acc;
				u64 den = adjusted_cps;
				int32_t avg_level;
					if(num >= 0)
						avg_level = (int32_t)((num + (int64_t)(den / 2)) / (int64_t)den);
					else
						avg_level = -(int32_t)(((-num) + (int64_t)(den / 2)) / (int64_t)den);

					tmp[tmpCount++] = PokeyAudio_PostProcessSample(pPokey, avg_level);
					pPokey->sample_acc = 0;
					pPokey->sample_phase_fp -= adjusted_cps;

					if(tmpCount == (sizeof(tmp) / sizeof(tmp[0])))
				{
					PokeyAudio_RingWrite(pPokey, tmp, tmpCount);
					tmpCount = 0;
				}
			}
		}

		PokeyAudio_StepCpuCycle(pPokey, pPokey->aChannels, pPokey->audctl);
		cur++;
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
				pPokey->aChannels[0].counter = (pPokey->audctl & 0x40) ? ((u32)(*pValue) + 4u) : ((u32)(*pValue) + 1u);

				if(pPokey->audctl & 0x10)
				{
					u32 period = (((u32)pPokey->aChannels[1].audf) << 8) | (u32)(*pValue);
					pPokey->aChannels[1].counter = (pPokey->audctl & 0x40) ? (period + 7u) : (period + 1u);
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
				pPokey->aChannels[1].counter = (u32)(*pValue) + 1u;

				if(pPokey->audctl & 0x10)
				{
					u32 period = (((u32)(*pValue)) << 8) | (u32)pPokey->aChannels[0].audf;
					pPokey->aChannels[1].counter = (pPokey->audctl & 0x40) ? (period + 7u) : (period + 1u);
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
				pPokey->aChannels[2].counter = (pPokey->audctl & 0x20) ? ((u32)(*pValue) + 4u) : ((u32)(*pValue) + 1u);

				if(pPokey->audctl & 0x08)
				{
					u32 period = (((u32)pPokey->aChannels[3].audf) << 8) | (u32)(*pValue);
					pPokey->aChannels[3].counter = (pPokey->audctl & 0x20) ? (period + 7u) : (period + 1u);
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
				pPokey->aChannels[3].counter = (u32)(*pValue) + 1u;

				if(pPokey->audctl & 0x08)
				{
					u32 period = (((u32)(*pValue)) << 8) | (u32)pPokey->aChannels[2].audf;
					pPokey->aChannels[3].counter = (pPokey->audctl & 0x20) ? (period + 7u) : (period + 1u);
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
					pPokey->aChannels[1].counter = (pPokey->audctl & 0x40) ? (period12 + 7u) : (period12 + 1u);
				}
				else
				{
					pPokey->aChannels[0].counter =
						(pPokey->audctl & 0x40) ? ((u32)pPokey->aChannels[0].audf + 4u) : ((u32)pPokey->aChannels[0].audf + 1u);
					pPokey->aChannels[1].counter = (u32)pPokey->aChannels[1].audf + 1u;
				}

				if(pPokey->audctl & 0x08)
				{
					u32 period34 = (((u32)pPokey->aChannels[3].audf) << 8) | (u32)pPokey->aChannels[2].audf;
					pPokey->aChannels[3].counter = (pPokey->audctl & 0x20) ? (period34 + 7u) : (period34 + 1u);
				}
				else
				{
					pPokey->aChannels[2].counter =
						(pPokey->audctl & 0x20) ? ((u32)pPokey->aChannels[2].audf + 4u) : ((u32)pPokey->aChannels[2].audf + 1u);
					pPokey->aChannels[3].counter = (u32)pPokey->aChannels[3].audf + 1u;
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
