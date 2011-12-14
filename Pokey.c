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
		SRAM[IO_AUDF1_POT0] = *pValue;
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
		SRAM[IO_AUDF2_POT2] = *pValue;
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
		SRAM[IO_AUDF3_POT4] = *pValue;
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
		SRAM[IO_AUDF4_POT6] = *pValue;
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
		SRAM[IO_AUDCTL_ALLPOT] = *pValue;
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
	if(pValue)
 	{	
		SRAM[IO_SKREST_RANDOM] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" SKREST: %02X\n", *pValue);
#endif
		
	}

	RAM[IO_SKREST_RANDOM] = rand();
	
	return &RAM[IO_SKREST_RANDOM];
}

/* $D20B POTGO */
u8 *Pokey_POTGO(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
 	{	
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
		SRAM[IO_SKCTL_SKSTAT] = *pValue;
#ifdef VERBOSE_REGISTER
		printf("             [%16lld]", pContext->llCycleCounter);
		printf(" SKCTL: %02X\n", *pValue);
#endif
	}

	return &RAM[IO_SKCTL_SKSTAT];
}

