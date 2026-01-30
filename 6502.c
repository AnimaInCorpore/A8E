/********************************************************************
*
*
*
* 6502 Prozessor-Emulation
*
* (c) 2004 Sascha Springer
*
*
*
********************************************************************/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "6502.h"

/********************************************************************
*
*
* Definitionen
*
*
********************************************************************/

#define FLAG_N 0x80
#define FLAG_V 0x40
#define FLAG_B 0x10
#define FLAG_D 0x08
#define FLAG_I 0x04
#define FLAG_Z 0x02
#define FLAG_C 0x01

#define AT_IMMEDIATE 0
#define AT_ABSOLUTE 1
#define AT_ZERO_PAGE 2
#define AT_ACCUMULATOR 3
#define AT_IMPLICIT 4
#define AT_INDEXED_INDIRECT 5
#define AT_INDIRECT_INDEXED 6
#define AT_ZERO_PAGE_X 7
#define AT_ZERO_PAGE_Y 8
#define AT_ABSOLUTE_X 9
#define AT_ABSOLUTE_Y 10
#define AT_RELATIVE 11
#define AT_INDIRECT 12

#define READ_ACCESS \
	pContext->AccessFunction(pContext, NULL)

#define WRITE_ACCESS(pointer) \
	pContext->AccessFunction(pContext, (pointer))

#define MIN(a,b) ((a) < (b) ? (a) : (b))
#define MAX(a,b) ((a) > (b) ? (a) : (b))

typedef struct 
{
	u8 cIndex;
	u8 cOpcodeId;
	u8 cCycles;
	u8 cAddressType;
} _6502_Code_t;

typedef struct 
{
	u8 cOpcodeId;
	u8 cAddressType;
	u8 cCycles;
} _6502_CodeTableEntry_t;

typedef void (*_6502_AddressTypeFunction_t)(_6502_Context_t *);
typedef void (*_6502_OpcodeFunction_t)(_6502_Context_t *);

void _6502_LDA(_6502_Context_t *);
void _6502_LDX(_6502_Context_t *);
void _6502_LDY(_6502_Context_t *);
void _6502_STA(_6502_Context_t *);
void _6502_STX(_6502_Context_t *);
void _6502_STY(_6502_Context_t *);
void _6502_TAX(_6502_Context_t *);
void _6502_TAY(_6502_Context_t *);
void _6502_TSX(_6502_Context_t *);
void _6502_TXA(_6502_Context_t *);
void _6502_TXS(_6502_Context_t *);
void _6502_TYA(_6502_Context_t *);
void _6502_ADC(_6502_Context_t *);
void _6502_AND(_6502_Context_t *);
void _6502_EOR(_6502_Context_t *);
void _6502_ORA(_6502_Context_t *);
void _6502_SBC(_6502_Context_t *);
void _6502_DEC(_6502_Context_t *);
void _6502_DEX(_6502_Context_t *);
void _6502_DEY(_6502_Context_t *);
void _6502_INC(_6502_Context_t *);
void _6502_INX(_6502_Context_t *);
void _6502_INY(_6502_Context_t *);
void _6502_ASL(_6502_Context_t *);
void _6502_LSR(_6502_Context_t *);
void _6502_ROL(_6502_Context_t *);
void _6502_ROR(_6502_Context_t *);
void _6502_BIT(_6502_Context_t *);
void _6502_CMP(_6502_Context_t *);
void _6502_CPX(_6502_Context_t *);
void _6502_CPY(_6502_Context_t *);
void _6502_BCC(_6502_Context_t *);
void _6502_BCS(_6502_Context_t *);
void _6502_BEQ(_6502_Context_t *);
void _6502_BMI(_6502_Context_t *);
void _6502_BNE(_6502_Context_t *);
void _6502_BPL(_6502_Context_t *);
void _6502_BVC(_6502_Context_t *);
void _6502_BVS(_6502_Context_t *);
void _6502_BRK(_6502_Context_t *);
void _6502_JMP(_6502_Context_t *);
void _6502_JSR(_6502_Context_t *);
void _6502_NOP(_6502_Context_t *);
void _6502_RTI(_6502_Context_t *);
void _6502_RTS(_6502_Context_t *);
void _6502_CLC(_6502_Context_t *);
void _6502_CLD(_6502_Context_t *);
void _6502_CLI(_6502_Context_t *);
void _6502_CLV(_6502_Context_t *);
void _6502_SEC(_6502_Context_t *);
void _6502_SED(_6502_Context_t *);
void _6502_SEI(_6502_Context_t *);
void _6502_PHA(_6502_Context_t *);
void _6502_PHP(_6502_Context_t *);
void _6502_PLA(_6502_Context_t *);
void _6502_PLP(_6502_Context_t *);
void _6502_XXX(_6502_Context_t *);

void _6502_LAX(_6502_Context_t *);
void _6502_SLO(_6502_Context_t *);
void _6502_ATX(_6502_Context_t *);
void _6502_AAX(_6502_Context_t *);
void _6502_DOP(_6502_Context_t *);
void _6502_TOP(_6502_Context_t *);
void _6502_ASR(_6502_Context_t *);
void _6502_ISC(_6502_Context_t *);
void _6502_SRE(_6502_Context_t *);
void _6502_RLA(_6502_Context_t *);
void _6502_AAC(_6502_Context_t *);
void _6502_XAA(_6502_Context_t *);
void _6502_DCP(_6502_Context_t *);

void _6502_Implicit(_6502_Context_t *);
void _6502_Immediate(_6502_Context_t *);
void _6502_Absolute(_6502_Context_t *);
void _6502_ZeroPage(_6502_Context_t *);
void _6502_Accumulator(_6502_Context_t *);
void _6502_IndexedIndirect(_6502_Context_t *);
void _6502_IndirectIndexed(_6502_Context_t *);
void _6502_ZeroPageX(_6502_Context_t *);
void _6502_ZeroPageY(_6502_Context_t *);
void _6502_AbsoluteX(_6502_Context_t *);
void _6502_AbsoluteY(_6502_Context_t *);
void _6502_Relative(_6502_Context_t *);
void _6502_Indirect(_6502_Context_t *);

/********************************************************************
*
*
* Variablen
*
*
********************************************************************/

_6502_Code_t m_a6502CodeList[] = 
{
	{ 0xa9,  0, 2, AT_IMMEDIATE        }, /* LDA */
	{ 0xad,  0, 4, AT_ABSOLUTE         },
	{ 0xa5,  0, 3, AT_ZERO_PAGE        },
	{ 0xa1,  0, 6, AT_INDEXED_INDIRECT },
	{ 0xb1,  0, 5, AT_INDIRECT_INDEXED },
	{ 0xb5,  0, 4, AT_ZERO_PAGE_X      },
	{ 0xbd,  0, 4, AT_ABSOLUTE_X       },
	{ 0xb9,  0, 4, AT_ABSOLUTE_Y       },
	{ 0xa2,  1, 2, AT_IMMEDIATE        }, /* LDX */
	{ 0xae,  1, 4, AT_ABSOLUTE         },
	{ 0xa6,  1, 3, AT_ZERO_PAGE        },
	{ 0xb6,  1, 4, AT_ZERO_PAGE_Y      },
	{ 0xbe,  1, 4, AT_ABSOLUTE_Y       },
	{ 0xa0,  2, 2, AT_IMMEDIATE        }, /* LDY */
	{ 0xac,  2, 4, AT_ABSOLUTE         },
	{ 0xa4,  2, 3, AT_ZERO_PAGE        },
	{ 0xb4,  2, 4, AT_ZERO_PAGE_X      },
	{ 0xbc,  2, 4, AT_ABSOLUTE_X       },
	{ 0x8d,  3, 4, AT_ABSOLUTE         }, /* STA */
	{ 0x85,  3, 3, AT_ZERO_PAGE        },
	{ 0x81,  3, 6, AT_INDEXED_INDIRECT },
	{ 0x91,  3, 6, AT_INDIRECT_INDEXED },
	{ 0x95,  3, 4, AT_ZERO_PAGE_X      },
	{ 0x9d,  3, 5, AT_ABSOLUTE_X       },
	{ 0x99,  3, 5, AT_ABSOLUTE_Y       },
	{ 0x8e,  4, 4, AT_ABSOLUTE         }, /* STX */
	{ 0x86,  4, 3, AT_ZERO_PAGE        },
	{ 0x96,  4, 4, AT_ZERO_PAGE_Y      },
	{ 0x8c,  5, 4, AT_ABSOLUTE         }, /* STY */
	{ 0x84,  5, 3, AT_ZERO_PAGE        },
	{ 0x94,  5, 4, AT_ZERO_PAGE_X      },
	{ 0xaa,  6, 2, AT_IMPLICIT         }, /* TAX */
	{ 0xa8,  7, 2, AT_IMPLICIT         }, /* TAY */
	{ 0xba,  8, 2, AT_IMPLICIT         }, /* TSX */
	{ 0x8a,  9, 2, AT_IMPLICIT         }, /* TXA */
	{ 0x9a, 10, 2, AT_IMPLICIT         }, /* TXS */
	{ 0x98, 11, 2, AT_IMPLICIT         }, /* TYA */
	{ 0x69, 12, 2, AT_IMMEDIATE        }, /* ADC */
	{ 0x6d, 12, 4, AT_ABSOLUTE         },
	{ 0x65, 12, 3, AT_ZERO_PAGE        },
	{ 0x61, 12, 6, AT_INDEXED_INDIRECT },
	{ 0x71, 12, 5, AT_INDIRECT_INDEXED },
	{ 0x75, 12, 4, AT_ZERO_PAGE_X      },
	{ 0x7d, 12, 4, AT_ABSOLUTE_X       },
	{ 0x79, 12, 4, AT_ABSOLUTE_Y       },
	{ 0x29, 13, 2, AT_IMMEDIATE        }, /* AND */
	{ 0x2d, 13, 4, AT_ABSOLUTE         },
	{ 0x25, 13, 3, AT_ZERO_PAGE        },
	{ 0x21, 13, 6, AT_INDEXED_INDIRECT },
	{ 0x31, 13, 5, AT_INDIRECT_INDEXED },
	{ 0x35, 13, 4, AT_ZERO_PAGE_X      },
	{ 0x3d, 13, 4, AT_ABSOLUTE_X       },
	{ 0x39, 13, 4, AT_ABSOLUTE_Y       },
	{ 0x49, 14, 2, AT_IMMEDIATE        }, /* EOR */
	{ 0x4d, 14, 4, AT_ABSOLUTE         },
	{ 0x45, 14, 3, AT_ZERO_PAGE        },
	{ 0x41, 14, 6, AT_INDEXED_INDIRECT },
	{ 0x51, 14, 5, AT_INDIRECT_INDEXED },
	{ 0x55, 14, 4, AT_ZERO_PAGE_X      },
	{ 0x5d, 14, 4, AT_ABSOLUTE_X       },
	{ 0x59, 14, 4, AT_ABSOLUTE_Y       },
	{ 0x09, 15, 2, AT_IMMEDIATE        }, /* ORA */
	{ 0x0d, 15, 4, AT_ABSOLUTE         },
	{ 0x05, 15, 3, AT_ZERO_PAGE        },
	{ 0x01, 15, 6, AT_INDEXED_INDIRECT },
	{ 0x11, 15, 5, AT_INDIRECT_INDEXED },
	{ 0x15, 15, 4, AT_ZERO_PAGE_X      },
	{ 0x1d, 15, 4, AT_ABSOLUTE_X       },
	{ 0x19, 15, 4, AT_ABSOLUTE_Y       },
	{ 0xe9, 16, 2, AT_IMMEDIATE        }, /* SBC */
	{ 0xed, 16, 4, AT_ABSOLUTE         },
	{ 0xe5, 16, 3, AT_ZERO_PAGE        },
	{ 0xe1, 16, 6, AT_INDEXED_INDIRECT },
	{ 0xf1, 16, 5, AT_INDIRECT_INDEXED },
	{ 0xf5, 16, 4, AT_ZERO_PAGE_X      },
	{ 0xfd, 16, 4, AT_ABSOLUTE_X       },
	{ 0xf9, 16, 4, AT_ABSOLUTE_Y       },
	{ 0xce, 17, 6, AT_ABSOLUTE         }, /* DEC */
	{ 0xc6, 17, 5, AT_ZERO_PAGE        },
	{ 0xd6, 17, 6, AT_ZERO_PAGE_X      },
	{ 0xde, 17, 7, AT_ABSOLUTE_X       },
	{ 0xca, 18, 2, AT_IMPLICIT         }, /* DEX */
	{ 0x88, 19, 2, AT_IMPLICIT         }, /* DEY */
	{ 0xee, 20, 6, AT_ABSOLUTE         }, /* INC */
	{ 0xe6, 20, 5, AT_ZERO_PAGE        },
	{ 0xf6, 20, 6, AT_ZERO_PAGE_X      },
	{ 0xfe, 20, 7, AT_ABSOLUTE_X       },
	{ 0xe8, 21, 2, AT_IMPLICIT         }, /* INX */
	{ 0xc8, 22, 2, AT_IMPLICIT         }, /* INY */
	{ 0x0e, 23, 6, AT_ABSOLUTE         }, /* ASL */
	{ 0x06, 23, 5, AT_ZERO_PAGE        },
	{ 0x0a, 23, 2, AT_ACCUMULATOR      },
	{ 0x16, 23, 6, AT_ZERO_PAGE_X      },
	{ 0x1e, 23, 7, AT_ABSOLUTE_X       },
	{ 0x4e, 24, 6, AT_ABSOLUTE         }, /* LSR */
	{ 0x46, 24, 5, AT_ZERO_PAGE        },
	{ 0x4a, 24, 2, AT_ACCUMULATOR      },
	{ 0x56, 24, 6, AT_ZERO_PAGE_X      },
	{ 0x5e, 24, 7, AT_ABSOLUTE_X       },
	{ 0x2e, 25, 6, AT_ABSOLUTE         }, /* ROL */
	{ 0x26, 25, 5, AT_ZERO_PAGE        },
	{ 0x2a, 25, 2, AT_ACCUMULATOR      },
	{ 0x36, 25, 6, AT_ZERO_PAGE_X      },
	{ 0x3e, 25, 7, AT_ABSOLUTE_X       },
	{ 0x6e, 26, 6, AT_ABSOLUTE         }, /* ROR */
	{ 0x66, 26, 5, AT_ZERO_PAGE        },
	{ 0x6a, 26, 2, AT_ACCUMULATOR      },
	{ 0x76, 26, 6, AT_ZERO_PAGE_X      },
	{ 0x7e, 26, 7, AT_ABSOLUTE_X       },
	{ 0x2c, 27, 4, AT_ABSOLUTE         }, /* BIT */
	{ 0x24, 27, 3, AT_ZERO_PAGE        },
	{ 0xc9, 28, 2, AT_IMMEDIATE        }, /* CMP */
	{ 0xcd, 28, 4, AT_ABSOLUTE         },
	{ 0xc5, 28, 3, AT_ZERO_PAGE        },
	{ 0xc1, 28, 6, AT_INDEXED_INDIRECT },
	{ 0xd1, 28, 5, AT_INDIRECT_INDEXED },
	{ 0xd5, 28, 4, AT_ZERO_PAGE_X      },
	{ 0xdd, 28, 4, AT_ABSOLUTE_X       },
	{ 0xd9, 28, 4, AT_ABSOLUTE_Y       },
	{ 0xe0, 29, 2, AT_IMMEDIATE        }, /* CPX */
	{ 0xec, 29, 4, AT_ABSOLUTE         },
	{ 0xe4, 29, 3, AT_ZERO_PAGE        },
	{ 0xc0, 30, 2, AT_IMMEDIATE        }, /* CPY */
	{ 0xcc, 30, 4, AT_ABSOLUTE         },
	{ 0xc4, 30, 3, AT_ZERO_PAGE        },
	{ 0x90, 31, 2, AT_RELATIVE         }, /* BCC */
	{ 0xb0, 32, 2, AT_RELATIVE         }, /* BCS */
	{ 0xf0, 33, 2, AT_RELATIVE         }, /* BEQ */
	{ 0x30, 34, 2, AT_RELATIVE         }, /* BMI */
	{ 0xd0, 35, 2, AT_RELATIVE         }, /* BNE */
	{ 0x10, 36, 2, AT_RELATIVE         }, /* BPL */
	{ 0x50, 37, 2, AT_RELATIVE         }, /* BVC */
	{ 0x70, 38, 2, AT_RELATIVE         }, /* BVS */
	{ 0x00, 39, 7, AT_IMPLICIT         }, /* BRK */
	{ 0x4c, 40, 3, AT_ABSOLUTE         }, /* JMP */
	{ 0x6c, 40, 5, AT_INDIRECT         },
	{ 0x20, 41, 6, AT_ABSOLUTE         }, /* JSR */
	{ 0xea, 42, 2, AT_IMPLICIT         }, /* NOP */
	{ 0x40, 43, 6, AT_IMPLICIT         }, /* RTI */
	{ 0x60, 44, 6, AT_IMPLICIT         }, /* RTS */
	{ 0x18, 45, 2, AT_IMPLICIT         }, /* CLC */
	{ 0xd8, 46, 2, AT_IMPLICIT         }, /* CLD */
	{ 0x58, 47, 2, AT_IMPLICIT         }, /* CLI */
	{ 0xb8, 48, 2, AT_IMPLICIT         }, /* CLV */
	{ 0x38, 49, 2, AT_IMPLICIT         }, /* SEC */
	{ 0xf8, 50, 2, AT_IMPLICIT         }, /* SED */
	{ 0x78, 51, 2, AT_IMPLICIT         }, /* SEI */
	{ 0x48, 52, 3, AT_IMPLICIT         }, /* PHA */
	{ 0x08, 53, 3, AT_IMPLICIT         }, /* PHP */
	{ 0x68, 54, 4, AT_IMPLICIT         }, /* PLA */
	{ 0x28, 55, 4, AT_IMPLICIT         }, /* PLP */

	{ 0xa7, 57, 3, AT_ZERO_PAGE        }, /* LAX */
	{ 0xb7, 57, 4, AT_ZERO_PAGE_Y      },
	{ 0xaf, 57, 4, AT_ABSOLUTE         },
	{ 0xbf, 57, 4, AT_ABSOLUTE_Y       },
	{ 0xa3, 57, 6, AT_INDEXED_INDIRECT },
	{ 0xb3, 57, 5, AT_INDIRECT_INDEXED },
	{ 0x07, 58, 5, AT_ZERO_PAGE        }, /* SLO */
	{ 0x17, 58, 6, AT_ZERO_PAGE_X      },
	{ 0x0f, 58, 6, AT_ABSOLUTE         },
	{ 0x1f, 58, 7, AT_ABSOLUTE_X       },
	{ 0x1b, 58, 7, AT_ABSOLUTE_Y       },
	{ 0x03, 58, 8, AT_INDEXED_INDIRECT },
	{ 0x13, 58, 8, AT_INDIRECT_INDEXED },
	{ 0x1a, 42, 2, AT_IMPLICIT         }, /* NOP */
	{ 0x3a, 42, 2, AT_IMPLICIT         },
	{ 0x5a, 42, 2, AT_IMPLICIT         },
	{ 0x7a, 42, 2, AT_IMPLICIT         },
	{ 0xda, 42, 2, AT_IMPLICIT         },
	{ 0xfa, 42, 2, AT_IMPLICIT         },
	{ 0xab, 59, 2, AT_IMMEDIATE        }, /* ATX */
	{ 0x87, 60, 3, AT_ZERO_PAGE        }, /* AAX */
	{ 0x97, 60, 4, AT_ZERO_PAGE_Y      },
	{ 0x83, 60, 6, AT_INDEXED_INDIRECT },
	{ 0x8f, 60, 4, AT_ABSOLUTE         },
	{ 0x04, 61, 3, AT_ZERO_PAGE        }, /* DOP */
	{ 0x14, 61, 4, AT_ZERO_PAGE_X      },
	{ 0x34, 61, 4, AT_ZERO_PAGE_X      },
	{ 0x44, 61, 3, AT_ZERO_PAGE        },
	{ 0x54, 61, 4, AT_ZERO_PAGE_X      },
	{ 0x64, 61, 3, AT_ZERO_PAGE        },
	{ 0x74, 61, 4, AT_ZERO_PAGE_X      },
	{ 0x80, 61, 2, AT_IMMEDIATE        },
	{ 0x82, 61, 2, AT_IMMEDIATE        },
	{ 0x89, 61, 2, AT_IMMEDIATE        },
	{ 0xc2, 61, 2, AT_IMMEDIATE        },
	{ 0xd4, 61, 4, AT_ZERO_PAGE_X      },
	{ 0xe2, 61, 2, AT_IMMEDIATE        },
	{ 0xf4, 61, 4, AT_ZERO_PAGE_X      },
	{ 0x0c, 62, 4, AT_ABSOLUTE         }, /* TOP */
	{ 0x1c, 62, 4, AT_ABSOLUTE_X       },
	{ 0x3c, 62, 4, AT_ABSOLUTE_X       },
	{ 0x5c, 62, 4, AT_ABSOLUTE_X       },
	{ 0x7c, 62, 4, AT_ABSOLUTE_X       },
	{ 0xdc, 62, 4, AT_ABSOLUTE_X       },
	{ 0xfc, 62, 4, AT_ABSOLUTE_X       },
	{ 0x4b, 63, 2, AT_IMMEDIATE        }, /* ASR */
	{ 0xe7, 64, 5, AT_ZERO_PAGE        }, /* ISC */
	{ 0xf7, 64, 6, AT_ZERO_PAGE_X      },
	{ 0xef, 64, 6, AT_ABSOLUTE         },
	{ 0xff, 64, 7, AT_ABSOLUTE_X       },
	{ 0xfb, 64, 7, AT_ABSOLUTE_Y       },
	{ 0xe3, 64, 8, AT_INDEXED_INDIRECT },
	{ 0xf3, 64, 8, AT_INDIRECT_INDEXED },
	{ 0x47, 65, 5, AT_ZERO_PAGE        }, /* SRE */
	{ 0x57, 65, 6, AT_ZERO_PAGE_X      },
	{ 0x4f, 65, 6, AT_ABSOLUTE         },
	{ 0x5f, 65, 7, AT_ABSOLUTE_X       },
	{ 0x5b, 65, 7, AT_ABSOLUTE_Y       },
	{ 0x43, 65, 8, AT_INDEXED_INDIRECT },
	{ 0x53, 65, 8, AT_INDIRECT_INDEXED },
	{ 0x27, 66, 5, AT_ZERO_PAGE        }, /* RLA */
	{ 0x37, 66, 6, AT_ZERO_PAGE_X      },
	{ 0x2f, 66, 6, AT_ABSOLUTE         },
	{ 0x3f, 66, 7, AT_ABSOLUTE_X       },
	{ 0x3b, 66, 7, AT_ABSOLUTE_Y       },
	{ 0x23, 66, 8, AT_INDEXED_INDIRECT },
	{ 0x33, 66, 8, AT_INDIRECT_INDEXED },
	{ 0x0b, 67, 2, AT_IMMEDIATE        }, /* AAC */
	{ 0x2b, 67, 2, AT_IMMEDIATE        },
	{ 0x8b, 68, 2, AT_IMMEDIATE        }, /* XAA */
	{ 0xc7, 69, 5, AT_ZERO_PAGE        }, /* DCP */
	{ 0xd7, 69, 6, AT_ZERO_PAGE_X      },
	{ 0xcf, 69, 6, AT_ABSOLUTE         },
	{ 0xdf, 69, 7, AT_ABSOLUTE_X       },
	{ 0xdb, 69, 7, AT_ABSOLUTE_Y       },
	{ 0xc3, 69, 8, AT_INDEXED_INDIRECT },
	{ 0xd3, 69, 8, AT_INDIRECT_INDEXED },
};

char *m_a6502MnemonicList[] = 
{
	"LDA", "LDX", "LDY", "STA", "STX", "STY",
	"TAX", "TAY", "TSX", "TXA", "TXS", "TYA",
	"ADC", "AND", "EOR", "ORA", "SBC",
	"DEC", "DEX", "DEY", "INC", "INX", "INY",
	"ASL", "LSR", "ROL", "ROR",
	"BIT", "CMP", "CPX", "CPY",
	"BCC", "BCS", "BEQ", "BMI", "BNE", "BPL", "BVC", "BVS",
	"BRK", "JMP", "JSR", "NOP", "RTI", "RTS",
	"CLC", "CLD", "CLI", "CLV", "SEC", "SED", "SEI",
	"PHA", "PHP", "PLA", "PLP", "???",
	
	"LAX", "SLO", "ATX", "AAX", "DOP", "TOP",
	"ASR", "ISC", "SRE", "RLA", "AAC", "XAA", "DCP"
};

_6502_OpcodeFunction_t m_a6502OpcodeFunctionList[] = 
{
	_6502_LDA, _6502_LDX, _6502_LDY, _6502_STA, _6502_STX, _6502_STY,
	_6502_TAX, _6502_TAY, _6502_TSX, _6502_TXA, _6502_TXS, _6502_TYA,
	_6502_ADC, _6502_AND, _6502_EOR, _6502_ORA, _6502_SBC,
	_6502_DEC, _6502_DEX, _6502_DEY, _6502_INC, _6502_INX, _6502_INY,
	_6502_ASL, _6502_LSR, _6502_ROL, _6502_ROR,
	_6502_BIT, _6502_CMP, _6502_CPX, _6502_CPY,
	_6502_BCC, _6502_BCS, _6502_BEQ, _6502_BMI,
	_6502_BNE, _6502_BPL, _6502_BVC, _6502_BVS,
	_6502_BRK, _6502_JMP, _6502_JSR, _6502_NOP, _6502_RTI, _6502_RTS,
	_6502_CLC, _6502_CLD, _6502_CLI, _6502_CLV,
	_6502_SEC, _6502_SED, _6502_SEI,
	_6502_PHA, _6502_PHP, _6502_PLA, _6502_PLP,
	_6502_XXX,
	
	_6502_LAX, _6502_SLO, _6502_ATX, _6502_AAX, _6502_DOP, _6502_TOP,
	_6502_ASR, _6502_ISC, _6502_SRE, _6502_RLA, _6502_AAC, _6502_XAA,
	_6502_DCP,
};

_6502_AddressTypeFunction_t m_a6502AddressTypeFunctionList[] = 
{
	_6502_Immediate, _6502_Absolute, _6502_ZeroPage, _6502_Accumulator, 
	_6502_Implicit,
	_6502_IndexedIndirect, _6502_IndirectIndexed,
	_6502_ZeroPageX, _6502_ZeroPageY,
	_6502_AbsoluteX, _6502_AbsoluteY,
	_6502_Relative, _6502_Indirect
};

_6502_CodeTableEntry_t m_a6502CodeTable[256];

u8 m_aBcdToBinTable[256] =
{
	 0,  1,  2,  3,  4,  5,  6,  7,  8,  9,  0,  0,  0,  0,  0,  0,
	10, 11, 12, 13, 14, 15, 16, 17, 18, 19,  0,  0,  0,  0,  0,  0,
	20, 21, 22, 23, 24, 25, 26, 27, 28, 29,  0,  0,  0,  0,  0,  0,
	30, 31, 32, 33, 34, 35, 36, 37, 38, 39,  0,  0,  0,  0,  0,  0,

	40, 41, 42, 43, 44, 45, 46, 47, 48, 49,  0,  0,  0,  0,  0,  0,
	50, 51, 52, 53, 54, 55, 56, 57, 58, 59,  0,  0,  0,  0,  0,  0,
	60, 61, 62, 63, 64, 65, 66, 67, 68, 69,  0,  0,  0,  0,  0,  0,
	70, 71, 72, 73, 74, 75, 76, 77, 78, 79,  0,  0,  0,  0,  0,  0,

	80, 81, 82, 83, 84, 85, 86, 87, 88, 89,  0,  0,  0,  0,  0,  0,
	90, 91, 92, 93, 94, 95, 96, 97, 98, 99,  0,  0,  0,  0,  0,  0,
	 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
	 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,

	 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
	 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
	 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
	 0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0
};

u8 m_aBinToBcdTable[100] =
{
	0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09,
	0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19,
	0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29,
	0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
	0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
	0x50, 0x51, 0x52, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
	0x60, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
	0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79,
	0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
	0x90, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99
};

/********************************************************************
*
*
* Funktionen
*
*
********************************************************************/

static u8 _6502_GetPs(_6502_Context_t *pContext)
{
	u8 cPs = 0x20;
	
	if(PS.n)
		cPs |= FLAG_N;

	if(PS.v)
		cPs |= FLAG_V;

	if(PS.b)
		cPs |= FLAG_B;

	if(PS.d)
		cPs |= FLAG_D;

	if(PS.i)
		cPs |= FLAG_I;

	if(PS.z)
		cPs |= FLAG_Z;

	if(PS.c)
		cPs |= FLAG_C;
		
	return cPs;
}

/* When pushing P to the stack, the B bit is not the CPU's "stored" flag:
 * - IRQ/NMI push B=0
 * - BRK/PHP push B=1
 */
static u8 _6502_GetPsWithB(_6502_Context_t *pContext, u8 cBreakFlag)
{
	u8 cPs = _6502_GetPs(pContext) & ~FLAG_B;

	if(cBreakFlag)
		cPs |= FLAG_B;

	return cPs;
}

static void _6502_ServiceInterrupt(_6502_Context_t *pContext, u16 sVector, u8 cBreakFlag, u16 sPcToPush)
{
	/* Push PC and P, then vector. Stack always lives in RAM ($0100-$01FF). */
	RAM[0x100 + CPU.sp] = (sPcToPush >> 8);
	CPU.sp--;
	RAM[0x100 + CPU.sp] = (u8)sPcToPush;
	CPU.sp--;
	RAM[0x100 + CPU.sp] = _6502_GetPsWithB(pContext, cBreakFlag);
	CPU.sp--;

	PS.i = 1;
	CPU.pc = RAM[sVector] | (RAM[sVector + 1] << 8);
}

static void _6502_SetPs(_6502_Context_t *pContext, u8 cPs)
{
	PS.n = cPs & FLAG_N;
	PS.v = cPs & FLAG_V;
	PS.b = cPs & FLAG_B;
	PS.d = cPs & FLAG_D;
	PS.i = cPs & FLAG_I;
	PS.z = cPs & FLAG_Z;
	PS.c = cPs & FLAG_C;
}

static u8 *_6502_AccumulatorAccess(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
		CPU.a = *pValue;

	return &CPU.a;
}

static u8 *_6502_RamAccess(_6502_Context_t *pContext, u8 *pValue)
{
	if(pValue)
	{
/*		if(pContext->sAccessAddress == 0x0818)
		{
			printf("$%04X: $%02X\n", pContext->sAccessAddress, *pValue);
		} 
*/	
		RAM[pContext->sAccessAddress] = *pValue;
	}

	return &RAM[pContext->sAccessAddress];
}

static u8 *_6502_RomAccess(_6502_Context_t *pContext, u8 *pValue)
{
	return &RAM[pContext->sAccessAddress];
}

void _6502_Init()
{
	u32 lIndex;

	for(lIndex = 0; lIndex < (sizeof(m_a6502CodeTable) / sizeof(m_a6502CodeTable[0])); lIndex++)
	{
		m_a6502CodeTable[lIndex].cOpcodeId = 56;
		m_a6502CodeTable[lIndex].cAddressType = 4;
		m_a6502CodeTable[lIndex].cCycles = 2;
	}
	
	for(lIndex = 0; lIndex < (sizeof(m_a6502CodeList) / sizeof(m_a6502CodeList[0])); lIndex++)
	{
		m_a6502CodeTable[m_a6502CodeList[lIndex].cIndex].cOpcodeId = m_a6502CodeList[lIndex].cOpcodeId;
		m_a6502CodeTable[m_a6502CodeList[lIndex].cIndex].cAddressType = m_a6502CodeList[lIndex].cAddressType;
		m_a6502CodeTable[m_a6502CodeList[lIndex].cIndex].cCycles = m_a6502CodeList[lIndex].cCycles;
	}
}

_6502_Context_t *_6502_Open() 
{
	u32 lIndex;
	_6502_Context_t *pContext;
	
	pContext = (_6502_Context_t *)malloc(sizeof(_6502_Context_t));
	
	if(pContext == NULL)
		return NULL;
	
	memset(pContext, 0, sizeof(_6502_Context_t));
	pContext->llIoCycleTimedEventCycle = 0xffffffffffffffffLL;
	
	RAM = malloc(_6502_MEMORY_SIZE);

	if(RAM == NULL)
	{
		free(pContext);

		return NULL;
	}

	memset(RAM, 0, _6502_MEMORY_SIZE);
	
	SRAM = malloc(_6502_MEMORY_SIZE);

	if(SRAM == NULL)
	{
		free(RAM);
		free(pContext);

		return NULL;
	}

	memset(SRAM, 0, _6502_MEMORY_SIZE);

	pContext->pAccessFunctionList = malloc(_6502_MEMORY_SIZE * sizeof(u8 *(*)(struct _6502_Context *, u8 *)));

	if(pContext->pAccessFunctionList == NULL)
	{
		free(SRAM);
		free(RAM);
		free(pContext);

		return NULL;
	}

	for(lIndex = 0; lIndex < _6502_MEMORY_SIZE; lIndex++)
		pContext->pAccessFunctionList[lIndex] = _6502_RamAccess;

	return pContext;
}

void _6502_Close(_6502_Context_t *pContext) 
{
	if(pContext->pIoData)
		free(pContext->pIoData);

	free(pContext->pAccessFunctionList);
	free(SRAM);
	free(RAM);
	free(pContext);
}

void _6502_SetRom(_6502_Context_t *pContext, u16 sStart, u16 sEnd)
{
	u32 lStart = sStart;

	while(lStart <= sEnd)
		pContext->pAccessFunctionList[lStart++] = _6502_RomAccess;
}

void _6502_SetRam(_6502_Context_t *pContext, u16 sStart, u16 sEnd)
{
	u32 lStart = sStart;

	while(lStart <= sEnd)
		pContext->pAccessFunctionList[lStart++] = _6502_RamAccess;
}

void _6502_SetIo(_6502_Context_t *pContext, u16 sAddress, u8 *(*IoAccessFunction)(_6502_Context_t *, u8 *))
{
	pContext->pAccessFunctionList[sAddress++] = IoAccessFunction;
}

u16 _6502_Disassemble(_6502_Context_t *pContext, u16 sAddress) 
{
	char *pMnemonic;
	u16 sValue;
	u8 *pMemory;
	
	pMemory = &RAM[sAddress];
	printf("%04X: %02X ", sAddress, pMemory[0]);
	pMnemonic = m_a6502MnemonicList[m_a6502CodeTable[pMemory[0]].cOpcodeId];
	
	switch(m_a6502CodeTable[pMemory[0]].cAddressType) 
 	{
	case 0: /* Immediate */
		printf("%02X     %s #$%02X\n", pMemory[1], pMnemonic, pMemory[1]);

		return(2);
		
	case 1: /* Absolute */
		sValue = pMemory[1] | (pMemory[2] << 8);
		printf("%02X %02X  %s $%04X\n", pMemory[1], pMemory[2], pMnemonic, sValue);

		return(3);
		
	case 2: /* Zero page */
		printf("%02X     %s $%02X\n", pMemory[1], pMnemonic, pMemory[1]);

		return(2);
		
	case 3: /* Accumulator */
		printf("       %s A\n", pMnemonic);

		return(1);
		
	case 5: /* Indexed indirect */
		printf("%02X     %s ($%02X,X)\n", pMemory[1], pMnemonic, pMemory[1]);

		return(2);
		
	case 6: /* Indirect indexed */
		printf("%02X     %s ($%02X),Y\n", pMemory[1], pMnemonic, pMemory[1]);

		return(2);
		
	case 7: /* Zero page x */
		printf("%02X     %s $%02X,X\n", pMemory[1], pMnemonic, pMemory[1]);

		return(2);
		
	case 8: /* Zero page y */
		printf("%02X     %s $%02X,Y\n", pMemory[1], pMnemonic, pMemory[1]);
		
		return(2);
		
	case 9: /* Absolute x */
		sValue = pMemory[1] | (pMemory[2] << 8);
		printf("%02X %02X  %s $%04X,X\n", pMemory[1], pMemory[2], pMnemonic, sValue);

		return(3);
		
	case 10: /* Absolute y */
		sValue = pMemory[1] | (pMemory[2] << 8);
		
		printf("%02X %02X  %s $%04X,Y\n", pMemory[1], pMemory[2], pMnemonic, sValue);

		return(3);
		
	case 11: /* Relative */
		sValue = (s8 )pMemory[1] + sAddress + 2;
		printf("%02X     %s $%04X\n", pMemory[1] & 0xff, pMnemonic, sValue);

		return(2);
		
	case 12: /* Indirect */
		sValue = pMemory[1] | (pMemory[2] << 8);

		printf("%02X %02X  %s ($%04X)\n", pMemory[1], pMemory[2], pMnemonic, sValue);

		return(3);
		
	default:
		printf("       %s\n", pMnemonic);

		return(1);
	}
}

u16 _6502_DisassembleLive(_6502_Context_t *pContext, u16 sAddress) 
{
	char *pMnemonic;
	u16 sValue;
	u8 cValue;
	u8 *pMemory;
	
	pMemory = &RAM[sAddress];
	printf("%04X: %02X ", sAddress, pMemory[0]);
	pMnemonic = m_a6502MnemonicList[m_a6502CodeTable[pMemory[0]].cOpcodeId];
	
	switch(m_a6502CodeTable[pMemory[0]].cAddressType) 
 	{
	case 0: /* Immediate */
		printf("%02X     %s #$%02X\n", pMemory[1], pMnemonic, pMemory[1]);

		return(2);
		
	case 1: /* Absolute */
		cValue = RAM[pMemory[1] | (pMemory[2] << 8)];

		printf("%02X %02X  %s $%04X   ($%02X)\n", 
			pMemory[1], pMemory[2], pMnemonic, pMemory[1] | (pMemory[2] << 8), cValue);

		return(3);
		
	case 2: /* Zero page */
		cValue = RAM[pMemory[1]];

		printf("%02X     %s $%02X     ($%02X)\n", 
			pMemory[1], pMnemonic, pMemory[1], cValue);

		return(2);
		
	case 3: /* Accumulator */
		printf("       %s A\n", pMnemonic);

		return(1);
		
	case 5: /* Indexed indirect */
		sValue = (pMemory[1] + CPU.x) & 0xff;
		cValue = RAM[RAM[sValue] | (RAM[sValue + 1] << 8)];

		printf("%02X     %s ($%02X,X) ($%04X:$%02X)\n", 
			pMemory[1], pMnemonic, pMemory[1], RAM[sValue] | (RAM[sValue + 1] << 8), cValue);

		return(2);
		
	case 6: /* Indirect indexed */
		sValue = pMemory[1];
		cValue = RAM[(RAM[sValue] | (RAM[sValue + 1] << 8)) + CPU.y];

		printf("%02X     %s ($%02X),Y ($%04X:$%02X)\n", 
			pMemory[1], pMnemonic, pMemory[1], (RAM[sValue] | (RAM[sValue + 1] << 8)) + CPU.y, cValue);

		return(2);
		
	case 7: /* Zero page x */
		cValue = RAM[(pMemory[1] + CPU.x) & 0xff];

		printf("%02X     %s $%02X,X   ($%04X:$%02X)\n", 
			pMemory[1], pMnemonic, pMemory[1], (pMemory[1] + CPU.x) & 0xff, cValue);

		return(2);
		
	case 8: /* Zero page y */
		cValue = RAM[(pMemory[1] + CPU.y) & 0xff];

		printf("%02X     %s $%02X,Y   ($%04X:$%02X)\n", 
			pMemory[1], pMnemonic, pMemory[1], (pMemory[1] + CPU.y) & 0xff, cValue);
		
		return(2);
		
	case 9: /* Absolute x */
		cValue = RAM[(pMemory[1] | (pMemory[2] << 8)) + CPU.x];

		printf("%02X %02X  %s $%02X%02X,X ($%04X:$%02X)\n", 
			pMemory[1], pMemory[2], pMnemonic, pMemory[2], pMemory[1], (pMemory[1] | (pMemory[2] << 8)) + CPU.x, cValue);

		return(3);
		
	case 10: /* Absolute y */
		cValue = RAM[(pMemory[1] | (pMemory[2] << 8)) + CPU.y];

		printf("%02X %02X  %s $%02X%02X,Y ($%04X:$%02X)\n", 
			pMemory[1], pMemory[2], pMnemonic, pMemory[2], pMemory[1], (pMemory[1] | (pMemory[2] << 8)) + CPU.y, cValue);

		return(3);
		
	case 11: /* Relative */
		sValue = (s8 )pMemory[1] + sAddress + 2;
		printf("%02X     %s $%04X\n", pMemory[1] & 0xff, pMnemonic, sValue);

		return(2);
		
	case 12: /* Indirect */
		sValue = pMemory[1] | (pMemory[2] << 8);

		printf("%02X %02X  %s ($%04X)\n", pMemory[1], pMemory[2], pMnemonic, sValue);

		return(3);
		
	default:
		printf("       %s\n", pMnemonic);

		return(1);
	}
}

void _6502_Status(_6502_Context_t *pContext) 
{
	char aFlags[9] = "nv_bdizc";
	
	printf("PC:%04X A:%02X X:%02X Y:%02X SP:1%02X PS:%02X (",
		CPU.pc, 
		CPU.a, 
		CPU.x,
		CPU.y,   
		CPU.sp, 
		_6502_GetPs(pContext));
	
	if(PS.n)
		aFlags[0] = 'N';

	if(PS.v)
		aFlags[1] = 'V';

	if(PS.b)
		aFlags[3] = 'B';

	if(PS.d)
		aFlags[4] = 'D';

	if(PS.i)
		aFlags[5] = 'I';

	if(PS.z)
		aFlags[6] = 'Z';

	if(PS.c)
		aFlags[7] = 'C';

	printf("%s)", aFlags);
}

void _6502_Nmi(_6502_Context_t *pContext)
{
	_6502_ServiceInterrupt(pContext, 0xfffa, 0, CPU.pc);
	pContext->llCycleCounter += 7;
}

void _6502_Reset(_6502_Context_t *pContext)
{
	/* 6502/SALLY reset does not push anything; it sets SP and vectors PC. */
	CPU.sp = 0xfd;
	PS.i = 1;
	PS.d = 0;
	PS.b = 0;
	pContext->cIrqPendingFlag = 0;
	CPU.pc = RAM[0xfffc] | (RAM[0xfffd] << 8);

	pContext->llCycleCounter += 7;
}

void _6502_Irq(_6502_Context_t *pContext)
{
	if(PS.i)
	{
		pContext->cIrqPendingFlag++;
	}
	else
	{
		if(pContext->cIrqPendingFlag)
			pContext->cIrqPendingFlag--;
		_6502_ServiceInterrupt(pContext, 0xfffe, 0, CPU.pc);
		pContext->llCycleCounter += 7;
	}	
}

u64 _6502_Run(_6502_Context_t *pContext, u64 llCycles)
{
	u8 cCode;
	u64 llCycleCounter = pContext->llCycleCounter;
	
	while(llCycleCounter < llCycles)
	{
		if(pContext->llCycleCounter >= pContext->llIoCycleTimedEventCycle)
			pContext->IoCycleTimedEventFunction(pContext);

		if(pContext->llCycleCounter >= pContext->llStallCycleCounter)
		{
			if(pContext->cIrqPendingFlag && !PS.i)
				_6502_Irq(pContext);

			cCode = RAM[CPU.pc++];

			pContext->AccessFunction = NULL;
			m_a6502AddressTypeFunctionList[m_a6502CodeTable[cCode].cAddressType](pContext);

			if(pContext->AccessFunction == NULL)
				pContext->AccessFunction = pContext->pAccessFunctionList[pContext->sAccessAddress];

			m_a6502OpcodeFunctionList[m_a6502CodeTable[cCode].cOpcodeId](pContext);

			pContext->llCycleCounter += m_a6502CodeTable[cCode].cCycles;
			llCycleCounter = pContext->llCycleCounter;
		}
		else
		{
			pContext->llCycleCounter++;
			llCycleCounter = pContext->llCycleCounter;
		}
	}

	return pContext->llCycleCounter;
}

/********************************************************************
*
* Opcode Funktionen
*
********************************************************************/

void _6502_LDA(_6502_Context_t *pContext) 
{
	CPU.a = *READ_ACCESS;

	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

void _6502_LDX(_6502_Context_t *pContext) 
{
	CPU.x = *READ_ACCESS;
	
	PS.z = !CPU.x;
	PS.n = CPU.x & 0x80;
}

void _6502_LDY(_6502_Context_t *pContext) 
{
	CPU.y = *READ_ACCESS;
	
	PS.z = !CPU.y;
	PS.n = CPU.y & 0x80;
}

void _6502_STA(_6502_Context_t *pContext) 
{
	WRITE_ACCESS(&CPU.a);
}

void _6502_STX(_6502_Context_t *pContext) 
{
	WRITE_ACCESS(&CPU.x);
}

void _6502_STY(_6502_Context_t *pContext) 
{
	WRITE_ACCESS(&CPU.y);
}

void _6502_TAX(_6502_Context_t *pContext) 
{
	CPU.x = CPU.a;
	
	PS.z = !CPU.x;
	PS.n = CPU.x & 0x80;
}

void _6502_TAY(_6502_Context_t *pContext) 
{
	CPU.y = CPU.a;
	
	PS.z = !CPU.y;
	PS.n = CPU.y & 0x80;
}

void _6502_TSX(_6502_Context_t *pContext) 
{
	CPU.x = CPU.sp;
	
	PS.z = !CPU.x;
	PS.n = CPU.x & 0x80;
}

void _6502_TXA(_6502_Context_t *pContext) 
{
	CPU.a = CPU.x;
	
	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

void _6502_TXS(_6502_Context_t *pContext) 
{
	CPU.sp = CPU.x;
}

void _6502_TYA(_6502_Context_t *pContext) 
{
	CPU.a = CPU.y;
	
	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

static void _6502_AdcValue(_6502_Context_t *pContext, u8 cValue)
{
	if(PS.d)
	{
		/* NMOS 6502 decimal adjust; V computed from binary sum (common emulator behavior). */
		u8 cA = CPU.a;
		u16 sSum = (u16)cA + (u16)cValue + (PS.c ? 1 : 0);
		u8 cBin = (u8)sSum;

		PS.v = !((cA ^ cValue) & 0x80) && ((cA ^ cBin) & 0x80);

		if(((cA & 0x0f) + (cValue & 0x0f) + (PS.c ? 1 : 0)) > 9)
			sSum += 0x06;

		PS.c = (sSum > 0x99);
		if(PS.c)
			sSum += 0x60;

		CPU.a = (u8)sSum;
		PS.z = !CPU.a;
		PS.n = CPU.a & 0x80;
	}
	else
	{
		u16 sSum = (u16)CPU.a + (u16)cValue + (PS.c ? 1 : 0);

		PS.v = !((CPU.a ^ cValue) & 0x80) && ((CPU.a ^ sSum) & 0x80);

		CPU.a = (u8)sSum;
		PS.c = sSum >> 8;
		PS.z = !CPU.a;
		PS.n = CPU.a & 0x80;
	}
}

static void _6502_SbcValue(_6502_Context_t *pContext, u8 cValue)
{
	if(PS.d)
	{
		u8 cA = CPU.a;
		u16 sDiff = (u16)cA - (u16)cValue - (PS.c ? 0 : 1);
		u8 cBin = (u8)sDiff;
		u8 cCarry = (sDiff & 0x100) ? 0 : 1; /* carry==1 means no borrow */

		PS.v = ((cA ^ cBin) & (cA ^ cValue) & 0x80) != 0;

		if(((cA & 0x0f) - (PS.c ? 0 : 1)) < (cValue & 0x0f))
			sDiff -= 0x06;

		if(!cCarry)
			sDiff -= 0x60;

		CPU.a = (u8)sDiff;
		PS.c = cCarry;
		PS.z = !CPU.a;
		PS.n = CPU.a & 0x80;
	}
	else
	{
		u8 cA = CPU.a;
		u16 sDiff = (u16)cA - (u16)cValue - (PS.c ? 0 : 1);
		u8 cRes = (u8)sDiff;

		PS.v = ((cA ^ cRes) & (cA ^ cValue) & 0x80) != 0;

		CPU.a = cRes;
		PS.c = (sDiff & 0x100) ? 0 : 1;
		PS.z = !CPU.a;
		PS.n = CPU.a & 0x80;
	}
}

void _6502_ADC(_6502_Context_t *pContext) 
{
	_6502_AdcValue(pContext, *READ_ACCESS);
}

void _6502_AND(_6502_Context_t *pContext) 
{
	CPU.a &= *READ_ACCESS;
	
	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

void _6502_EOR(_6502_Context_t *pContext) 
{
	CPU.a ^= *READ_ACCESS;
	
	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

void _6502_ORA(_6502_Context_t *pContext) 
{
	CPU.a |= *READ_ACCESS;
	
	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

void _6502_SBC(_6502_Context_t *pContext) 
{
	_6502_SbcValue(pContext, *READ_ACCESS);
}

void _6502_DEC(_6502_Context_t *pContext) 
{
	u8 cValue = *READ_ACCESS;
	
	cValue--;
	cValue = *WRITE_ACCESS(&cValue);
	
	PS.z = !cValue;
	PS.n = cValue & 0x80;
}

void _6502_DEX(_6502_Context_t *pContext) 
{
	CPU.x--;
	
	PS.z = !CPU.x;
	PS.n = CPU.x & 0x80;
}

void _6502_DEY(_6502_Context_t *pContext) 
{
	CPU.y--;
	
	PS.z = !CPU.y;
	PS.n = CPU.y & 0x80;
}

void _6502_INC(_6502_Context_t *pContext) 
{
	u8 cValue = *READ_ACCESS;
	
	cValue++;
	cValue = *WRITE_ACCESS(&cValue);
	
	PS.z = !cValue;
	PS.n = cValue & 0x80;
}

void _6502_INX(_6502_Context_t *pContext) 
{
	CPU.x++;
	
	PS.z = !CPU.x;
	PS.n = CPU.x & 0x80;
}

void _6502_INY(_6502_Context_t *pContext) 
{
	CPU.y++;
	
	PS.z = !CPU.y;
	PS.n = CPU.y & 0x80;
}

void _6502_ASL(_6502_Context_t *pContext) 
{
	u8 cValue = *READ_ACCESS;
	
	PS.c = cValue & 0x80;
	cValue <<= 1;
	cValue = *WRITE_ACCESS(&cValue);

	PS.z = !cValue;
	PS.n = cValue & 0x80;
}

void _6502_LSR(_6502_Context_t *pContext) 
{
	u8 cValue = *READ_ACCESS;

	PS.c = cValue & 0x01;	
	cValue >>= 1;
	cValue = *WRITE_ACCESS(&cValue);
	
	PS.z = !cValue;
	PS.n = cValue & 0x80;
}

void _6502_ROL(_6502_Context_t *pContext) 
{
	u8 cOldCarry = PS.c;
	u8 cValue = *READ_ACCESS;
	
	PS.c = cValue & 0x80;
	cValue <<= 1;

	if(cOldCarry)
		cValue |= 0x01;
		
	cValue = *WRITE_ACCESS(&cValue);
	
	PS.z = !cValue;
	PS.n = cValue & 0x80;
}

void _6502_ROR(_6502_Context_t *pContext) 
{
	u8 cOldCarry = PS.c;
	u8 cValue = *READ_ACCESS;
	
	PS.c = cValue & 0x01;
	cValue >>= 1;

	if(cOldCarry)
		cValue |= 0x80;
		
	cValue = *WRITE_ACCESS(&cValue);
	
	PS.z = !cValue;
	PS.n = cValue & 0x80;
}

void _6502_BIT(_6502_Context_t *pContext) 
{
	u8 cValue = *READ_ACCESS;
	
	PS.z = !(cValue & CPU.a);
	PS.v = cValue & 0x40;
	PS.n = cValue & 0x80;
}

void _6502_CMP(_6502_Context_t *pContext) 
{
	u8 cValue = *READ_ACCESS;
	
	PS.z = (CPU.a == cValue);
	PS.n = (CPU.a - cValue) & 0x80;
	PS.c = (CPU.a >= cValue);
}

void _6502_CPX(_6502_Context_t *pContext) 
{
	u8 cValue = *READ_ACCESS;
	
	PS.z = (CPU.x == cValue);
	PS.n = (CPU.x - cValue) & 0x80;
	PS.c = (CPU.x >= cValue);
}

void _6502_CPY(_6502_Context_t *pContext) 
{
	u8 cValue = *READ_ACCESS;
	
	PS.z = (CPU.y == cValue);
	PS.n = (CPU.y - cValue) & 0x80;
	PS.c = (CPU.y >= cValue);
}

void _6502_BCC(_6502_Context_t *pContext) 
{
	if(!PS.c)
		CPU.pc += (s8)*READ_ACCESS;
}

void _6502_BCS(_6502_Context_t *pContext) 
{
	if(PS.c)
		CPU.pc += (s8)*READ_ACCESS;
}

void _6502_BEQ(_6502_Context_t *pContext) 
{
	if(PS.z)
		CPU.pc += (s8)*READ_ACCESS;
}

void _6502_BMI(_6502_Context_t *pContext) 
{
	if(PS.n)
		CPU.pc += (s8)*READ_ACCESS;
}

void _6502_BNE(_6502_Context_t *pContext) 
{
	if(!PS.z)
		CPU.pc += (s8)*READ_ACCESS;
}

void _6502_BPL(_6502_Context_t *pContext) 
{
	if(!PS.n)
		CPU.pc += (s8)*READ_ACCESS;
}

void _6502_BVC(_6502_Context_t *pContext) 
{
	if(!PS.v)
		CPU.pc += (s8)*READ_ACCESS;
}

void _6502_BVS(_6502_Context_t *pContext) 
{
	if(PS.v)
		CPU.pc += (s8)*READ_ACCESS;
}

void _6502_BRK(_6502_Context_t *pContext) 
{
	/* BRK is not maskable by I; it always vectors like IRQ with B=1 and pushes PC+2. */
	_6502_ServiceInterrupt(pContext, 0xfffe, 1, CPU.pc + 1);
}

void _6502_JMP(_6502_Context_t *pContext) 
{
	CPU.pc = pContext->sAccessAddress;
}

void _6502_JSR(_6502_Context_t *pContext) 
{
	u16 sReturn = CPU.pc - 1;

	RAM[0x100 + CPU.sp] = (sReturn >> 8);
	CPU.sp--;
	RAM[0x100 + CPU.sp] = sReturn;
	CPU.sp--;

	CPU.pc = pContext->sAccessAddress;
}

void _6502_NOP(_6502_Context_t *pContext) 
{
	/* Nothing yet */
}

void _6502_RTI(_6502_Context_t *pContext) 
{
	CPU.sp++;
	_6502_SetPs(pContext, RAM[0x100 + CPU.sp]);
	CPU.sp++;
	CPU.pc = RAM[0x100 + CPU.sp];
	CPU.sp++;
	CPU.pc |= RAM[0x100 + CPU.sp] << 8;
}

void _6502_RTS(_6502_Context_t *pContext) 
{
	CPU.sp++;
	CPU.pc = RAM[0x100 + CPU.sp];
	CPU.sp++;
	CPU.pc |= RAM[0x100 + CPU.sp] << 8;

	CPU.pc++;
}

void _6502_CLC(_6502_Context_t *pContext) 
{
	PS.c = 0;
}

void _6502_CLD(_6502_Context_t *pContext) 
{
	PS.d = 0;
}

void _6502_CLI(_6502_Context_t *pContext) 
{
	PS.i = 0;
}

void _6502_CLV(_6502_Context_t *pContext) 
{
	PS.v = 0;
}

void _6502_SEC(_6502_Context_t *pContext) 
{
	PS.c = 1;
}

void _6502_SED(_6502_Context_t *pContext) 
{
	PS.d = 1;
}

void _6502_SEI(_6502_Context_t *pContext) 
{
	PS.i = 1;
}

void _6502_PHA(_6502_Context_t *pContext) 
{
	RAM[0x100 + CPU.sp] = CPU.a;
	CPU.sp--;
}

void _6502_PHP(_6502_Context_t *pContext) 
{
	RAM[0x100 + CPU.sp] = _6502_GetPsWithB(pContext, 1);
	CPU.sp--;
}

void _6502_PLA(_6502_Context_t *pContext) 
{
	CPU.sp++;
	CPU.a = RAM[0x100 + CPU.sp];

	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

void _6502_PLP(_6502_Context_t *pContext) 
{
	CPU.sp++;
	_6502_SetPs(pContext, RAM[0x100 + CPU.sp]);
}

void _6502_XXX(_6502_Context_t *pContext) 
{
	int i;

	printf("\nPC = $%04X, SP = $01%02X\n", CPU.pc - 1, CPU.sp);

	for(i = CPU.sp - 10; i < CPU.sp + 10; i++)
 		printf("$01%02X: $%02X\n", i & 0xff, RAM[0x100 + (i & 0xff)]);

	for(i = CPU.pc - 30; i < _6502_MEMORY_SIZE && i < CPU.pc + 30; i += _6502_Disassemble(pContext, i));

	printf("\n\n");
	
	exit(-1);
}

void _6502_LAX(_6502_Context_t *pContext) 
{
	CPU.a = CPU.x = *READ_ACCESS;

	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

void _6502_SLO(_6502_Context_t *pContext) 
{
	u8 cValue = *READ_ACCESS;

	PS.c = cValue & 0x80;
	
	cValue <<= 1;
	
	CPU.a |= *WRITE_ACCESS(&cValue);
	
	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

void _6502_ATX(_6502_Context_t *pContext) 
{
	CPU.a &= *READ_ACCESS;
	CPU.x = CPU.a;

	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

void _6502_AAX(_6502_Context_t *pContext) 
{
	u8 cValue = CPU.x & CPU.a;
	WRITE_ACCESS(&cValue);
}

void _6502_DOP(_6502_Context_t *pContext) 
{
	READ_ACCESS;
}

void _6502_TOP(_6502_Context_t *pContext) 
{
	READ_ACCESS;
}

void _6502_ASR(_6502_Context_t *pContext) 
{
	CPU.a &= *READ_ACCESS;

	PS.c = CPU.a & 0x01;

	CPU.a >>= 1;
	
	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

void _6502_ISC(_6502_Context_t *pContext) 
{
	/* ISC/ISB: INC memory, then SBC memory */
	u8 cValue = *READ_ACCESS;

	cValue++;
	WRITE_ACCESS(&cValue);

	_6502_SbcValue(pContext, cValue);
}

void _6502_SRE(_6502_Context_t *pContext) 
{
	u8 cValue = *READ_ACCESS;

	PS.c = cValue & 0x01;
	
	cValue >>= 1;
	
	CPU.a ^= *WRITE_ACCESS(&cValue);
	
	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

void _6502_RLA(_6502_Context_t *pContext) 
{
	u8 cOldCarry = PS.c ? 1 : 0;
	u8 cValue = *READ_ACCESS;

	PS.c = cValue & 0x80;
	cValue = (u8)((cValue << 1) | cOldCarry);

	cValue = *WRITE_ACCESS(&cValue);

	CPU.a &= cValue;
	
	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

void _6502_AAC(_6502_Context_t *pContext) 
{
	CPU.a &= *READ_ACCESS;
	
	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
	PS.c = PS.n;
}

void _6502_XAA(_6502_Context_t *pContext) 
{
	CPU.a = CPU.x;
	CPU.a &= *READ_ACCESS;
	
	PS.z = !CPU.a;
	PS.n = CPU.a & 0x80;
}

void _6502_DCP(_6502_Context_t *pContext)
{
	/* DCP/DCP: DEC memory, then CMP memory */
	u8 cValue = *READ_ACCESS;

	cValue--;
	cValue = *WRITE_ACCESS(&cValue);

	PS.z = (CPU.a == cValue);
	PS.n = (CPU.a - cValue) & 0x80;
	PS.c = (CPU.a >= cValue);
}

/********************************************************************
*
* Addressing Mode Funktionen
*
********************************************************************/

void _6502_Implicit(_6502_Context_t *pContext) 
{
	pContext->AccessFunction = _6502_RamAccess;
}

void _6502_Immediate(_6502_Context_t *pContext) 
{
	pContext->sAccessAddress = CPU.pc++;
}

void _6502_Absolute(_6502_Context_t *pContext) 
{
	u16 sAddress;
	
	sAddress = RAM[CPU.pc++];
	sAddress |= RAM[CPU.pc++] << 8;

	pContext->sAccessAddress = sAddress;
}

void _6502_ZeroPage(_6502_Context_t *pContext) 
{
	pContext->sAccessAddress = RAM[CPU.pc++];
}

void _6502_Accumulator(_6502_Context_t *pContext) 
{
	pContext->AccessFunction = _6502_AccumulatorAccess;
}

void _6502_IndexedIndirect(_6502_Context_t *pContext) 
{
	u16 sAddress = RAM[CPU.pc++] + CPU.x;

	pContext->sAccessAddress = RAM[sAddress & 0xff] | (RAM[(sAddress + 1) & 0xff] << 8);
}

void _6502_IndirectIndexed(_6502_Context_t *pContext) 
{
	u16 sAddress = RAM[CPU.pc++];

	pContext->sAccessAddress = (RAM[sAddress] | (RAM[(sAddress + 1) & 0xff] << 8)) + CPU.y;
}

void _6502_ZeroPageX(_6502_Context_t *pContext) 
{
	pContext->sAccessAddress = (RAM[CPU.pc++] + CPU.x) & 0xff;
}

void _6502_ZeroPageY(_6502_Context_t *pContext) 
{
	pContext->sAccessAddress = (RAM[CPU.pc++] + CPU.y) & 0xff;
}

void _6502_AbsoluteX(_6502_Context_t *pContext) 
{
	u16 sAddress;
	
	sAddress = RAM[CPU.pc++];
	sAddress |= RAM[CPU.pc++] << 8;
	sAddress += CPU.x;

	pContext->sAccessAddress = sAddress;
}

void _6502_AbsoluteY(_6502_Context_t *pContext) 
{
	u16 sAddress;
	
	sAddress = RAM[CPU.pc++];
	sAddress |= RAM[CPU.pc++] << 8;
	sAddress += CPU.y;

	pContext->sAccessAddress = sAddress;
}

void _6502_Relative(_6502_Context_t *pContext) 
{
	pContext->sAccessAddress = CPU.pc++;
}

void _6502_Indirect(_6502_Context_t *pContext) 
{
	u16 sAddress;
	
	sAddress = RAM[CPU.pc++];
	sAddress |= RAM[CPU.pc++] << 8;

	sAddress = (RAM[sAddress] | (RAM[(sAddress & 0xff00) | ((sAddress + 1) & 0x00ff)] << 8));

	pContext->sAccessAddress = sAddress;
}
