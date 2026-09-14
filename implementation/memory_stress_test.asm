; Extended-memory bank-switch stress test for 130XE, RAMBO, COMPY, and U1MB.
; This is intentionally separate from U1MB_MEMORY_TEST.XEX: it performs
; repeated bank changes and is aimed at software such as Mikie.

.ORG $2000

PORTB  = $D301
; Canonical assembly address; startup relocates stores to SAVMSC.
SCREEN = $9C40
PTR    = $80
BANK   = $2FF2
MODE   = $2FF3
COUNT  = $2FF4
ERRORS = $2FF5
ITER   = $2FF6
PATTERN= $2FF7
TEMP   = $2FF8
SAVE0  = $2FF9
SAVE1  = $2FFA
CTRL_STATUS = $2FFB
CTRL_ERRORS = $2FFC
SAVE_NMI = $2FFD
SAVE_DMA = $2FFE
BASE_PORTB = $2FFF
SCREEN_BASE = $2FFB
WORK_LO = $7C
WORK_HI = $7D

START:
        JSR RELOCATE_SCREEN
        LDA PORTB
        AND #$02
        STA BASE_PORTB
        LDA #$00
        STA ERRORS
        JSR CLEAR_SCREEN_ROWS
        JSR SHOW_TITLE
        JSR DETECT_MODE
        JSR SHOW_MODE
        LDA COUNT
        BNE STRESS_BEGIN
        JSR SHOW_NO_EXPANSION
        JMP DONE

STRESS_BEGIN:
        ; Establish a motherboard-RAM sentinel. Each stress pass must restore
        ; this view and leave it unchanged after switching expanded banks.
        LDA #$FF
        STA PORTB
        LDA #$A5
        STA $4000
        STA $7FFF

        LDA #$00
        STA ITER
STRESS_PASS:
        JSR SHOW_ITERATION
        LDA #$00
        STA BANK
STRESS_FORWARD:
        JSR SELECT_BANK
        JSR MAKE_PATTERN
        JSR WRITE_TEST_PAGES
        INC BANK
        LDA BANK
        CMP COUNT
        BNE STRESS_FORWARD

        ; Reverse traversal catches aliases and stale window state.
        DEC BANK
STRESS_REVERSE:
        JSR SELECT_BANK
        JSR MAKE_PATTERN
        JSR READ_TEST_PAGES
        LDA BANK
        BEQ STRESS_BASE_CHECK
        DEC BANK
        JMP STRESS_REVERSE

STRESS_BASE_CHECK:
        LDA #$FF
        STA PORTB
        LDA $4000
        CMP #$A5
        BEQ BASE_CHECK_2
        INC ERRORS
BASE_CHECK_2:
        LDA $7FFF
        CMP #$A5
        BEQ NEXT_STRESS_PASS
        INC ERRORS
NEXT_STRESS_PASS:
        INC ITER
        LDA ITER
        CMP #$20
        BNE STRESS_PASS

        ; Run the profile-specific PORTB control check as part of the normal
        ; certification flow. It covers Self-Test overlay behavior for RAMBO
        ; profiles and the high bank bit for 1088K RAMBO.
        JSR TEST_RAMBO_SELFTEST
        JSR SHOW_RESULT
        JSR SHOW_CONTROL_RESULT
        JMP DONE

; Profile-specific PORTB control probe. For 1088K RAMBO, bit 7 is a bank bit;
; for the smaller RAMBO profiles below, it selects the Self-Test overlay.
TEST_RAMBO_SELFTEST:
        LDA MODE
        CMP #$01
        BEQ CONTROL_TEST
        CMP #$03
        BEQ CONTROL_TEST
        CMP #$05
        BEQ CONTROL_TEST
        CMP #$06
        BEQ CONTROL_TEST
        LDA #$02
        STA CTRL_STATUS
        RTS
CONTROL_TEST:
        LDA #$00
        STA CTRL_STATUS
        STA CTRL_ERRORS
        LDA $D40E
        STA SAVE_NMI
        LDA $D400
        STA SAVE_DMA
        ; The overlay test must not let an NMI handler or ANTIC DMA fetch
        ; through $5000-$57FF while Self-Test ROM is temporarily selected.
        LDA #$00
        STA $D40E
        STA $D400
        STA BANK
CONTROL_BANK:
        JSR SELECT_BANK
        JSR MAKE_PATTERN
        LDA MODE
        CMP #$01
        BEQ CONTROL_1088_BANK
        LDA PATTERN
        STA $5000
        STA $57FF
        LDA PORTB
        EOR #$80
        STA PORTB
        ; Self-Test ROM now has priority over $5000-$57FF. Capture the ROM
        ; bytes, attempt writes through the overlay, and require the reads to
        ; remain unchanged. The RAM pattern is checked after the overlay is
        ; disabled again below.
        LDA $5000
        STA SAVE0
        LDA $57FF
        STA SAVE1
        LDA PATTERN
        EOR #$FF
        STA $5000
        STA $57FF
        LDA $5000
        CMP SAVE0
        BEQ CONTROL_READ_2
        INC CTRL_ERRORS
CONTROL_READ_2:
        LDA $57FF
        CMP SAVE1
        BEQ CONTROL_REENABLE
        INC CTRL_ERRORS
CONTROL_REENABLE:
        LDA PORTB
        EOR #$80
        STA PORTB
        LDA $5000
        CMP PATTERN
        BEQ CONTROL_VERIFY_2
        INC CTRL_ERRORS
CONTROL_VERIFY_2:
        LDA $57FF
        CMP PATTERN
        BEQ CONTROL_NEXT
        INC CTRL_ERRORS
        JMP CONTROL_NEXT

; In 1088K RAMBO, toggling bit 7 must select the paired bank, not the
; Self-Test ROM. Write distinct values on both sides of the transition and
; verify that returning to the original bank restores its value.
CONTROL_1088_BANK:
        LDA PATTERN
        STA $5000
        LDA PORTB
        EOR #$80
        STA PORTB
        LDA PATTERN
        EOR #$FF
        STA SAVE0
        STA $5000
        LDA $5000
        CMP SAVE0
        BEQ CONTROL_1088_REENABLE
        INC CTRL_ERRORS
CONTROL_1088_REENABLE:
        LDA PORTB
        EOR #$80
        STA PORTB
        LDA $5000
        CMP PATTERN
        BEQ CONTROL_NEXT
        INC CTRL_ERRORS
CONTROL_NEXT:
        INC BANK
        LDA BANK
        CMP COUNT
        BEQ CONTROL_DONE
        JMP CONTROL_BANK
CONTROL_DONE:
        ; Always leave the normal motherboard-RAM/OS view active after the
        ; temporary Self-Test ROM overlay check.
        LDA #$FF
        STA PORTB
        LDA SAVE_DMA
        STA $D400
        LDA SAVE_NMI
        STA $D40E
        RTS

DONE:
        JMP DONE

; Probe the AHRM bank layouts from largest to smallest.
DETECT_MODE:
        LDA #$01
        STA MODE
TRY_MODE:
        JSR SET_BANK_COUNT
        LDA COUNT
        BEQ NO_MODE
        LDA #$00
        STA ERRORS
        STA BANK
DETECT_WRITE:
        JSR SELECT_BANK
        LDA BANK
        CLC
        ADC #$31
        STA $4000
        INC BANK
        LDA BANK
        CMP COUNT
        BNE DETECT_WRITE
        LDA #$00
        STA BANK
DETECT_READ:
        JSR SELECT_BANK
        LDA BANK
        CLC
        ADC #$31
        CMP $4000
        BEQ DETECT_NEXT
        INC ERRORS
DETECT_NEXT:
        INC BANK
        LDA BANK
        CMP COUNT
        BNE DETECT_READ
        LDA ERRORS
        BEQ MODE_FOUND
        INC MODE
        LDA MODE
        CMP #$08
        BNE TRY_MODE
NO_MODE:
        LDA #$00
        STA MODE
        STA COUNT
MODE_FOUND:
        LDA #$FF
        STA PORTB
        LDA #$00
        STA BANK
        RTS

SET_BANK_COUNT:
        LDA MODE
        CMP #$01
        BNE COUNT_576C
        LDA #$40
        STA COUNT
        RTS
COUNT_576C:
        CMP #$02
        BNE COUNT_576R
        LDA #$20
        STA COUNT
        RTS
COUNT_576R:
        CMP #$03
        BNE COUNT_320C
        LDA #$20
        STA COUNT
        RTS
COUNT_320C:
        CMP #$04
        BNE COUNT_320R
        LDA #$10
        STA COUNT
        RTS
COUNT_320R:
        CMP #$05
        BNE COUNT_192
        LDA #$10
        STA COUNT
        RTS
COUNT_192:
        CMP #$06
        BNE COUNT_128
        LDA #$08
        STA COUNT
        RTS
COUNT_128:
        CMP #$07
        BNE COUNT_NONE
        LDA #$04
        STA COUNT
        RTS
COUNT_NONE:
        LDA #$00
        STA COUNT
        RTS

; Dispatch through RTS tables so all selectors remain independent.
SELECT_BANK:
        LDA MODE
        SEC
        SBC #$01
        ASL A
        TAX
        LDA SELECT_TABLE+1,X
        PHA
        LDA SELECT_TABLE,X
        PHA
        RTS
SELECT_TABLE:
        .WORD SELECT_1088-1,SELECT_576C-1,SELECT_576R-1,SELECT_320C-1
        .WORD SELECT_320R-1,SELECT_192-1,SELECT_128-1

SELECT_1088:
        LDA BANK
        AND #$07
        ASL A
        STA TEMP
        LDA BANK
        AND #$38
        ASL A
        ASL A
        ORA TEMP
        ORA #$01
        STA PORTB
        RTS
SELECT_576C:
        LDA BANK
        AND #$07
        ASL A
        STA TEMP
        LDA BANK
        AND #$18
        ASL A
        ASL A
        ASL A
        ORA TEMP
        ORA #$01
        ORA BASE_PORTB
        STA PORTB
        RTS
SELECT_576R:
        LDA BANK
        AND #$07
        ASL A
        STA TEMP
        LDA BANK
        AND #$18
        ASL A
        ASL A
        ORA TEMP
        ORA #$81
        ORA BASE_PORTB
        STA PORTB
        RTS
SELECT_320C:
        LDA BANK
        AND #$03
        ASL A
        ASL A
        STA TEMP
        LDA BANK
        AND #$0C
        ASL A
        ASL A
        ASL A
        ASL A
        ORA TEMP
        ORA #$01
        ORA BASE_PORTB
        STA PORTB
        RTS
SELECT_320R:
        LDA BANK
        AND #$03
        ASL A
        ASL A
        STA TEMP
        LDA BANK
        AND #$0C
        ASL A
        ASL A
        ASL A
        ORA TEMP
        ORA #$81
        ORA BASE_PORTB
        STA PORTB
        RTS
SELECT_192:
        LDA BANK
        AND #$03
        ASL A
        ASL A
        STA TEMP
        LDA BANK
        AND #$04
        ASL A
        ASL A
        ASL A
        ASL A
        ORA TEMP
        ORA #$81
        ORA BASE_PORTB
        STA PORTB
        RTS
SELECT_128:
        LDA BANK
        AND #$03
        ASL A
        ASL A
        ORA #$81
        ORA BASE_PORTB
        STA PORTB
        RTS

MAKE_PATTERN:
        LDA BANK
        EOR ITER
        EOR #$5A
        STA PATTERN
        RTS

WRITE_TEST_PAGES:
        LDA #$00
        STA PTR
        LDA #$40
        STA PTR+1
        JSR WRITE_PAGE
        LDA #$00
        STA PTR
        LDA #$7F
        STA PTR+1
        JMP WRITE_PAGE
WRITE_PAGE:
        LDY #$00
WRITE_LOOP:
        LDA PATTERN
        STA (PTR),Y
        INY
        BNE WRITE_LOOP
        RTS

READ_TEST_PAGES:
        LDA #$00
        STA PTR
        LDA #$40
        STA PTR+1
        JSR READ_PAGE
        LDA #$00
        STA PTR
        LDA #$7F
        STA PTR+1
READ_PAGE:
        LDY #$00
READ_LOOP:
        LDA (PTR),Y
        CMP PATTERN
        BEQ READ_OK
        INC ERRORS
READ_OK:
        INY
        BNE READ_LOOP
        RTS

CLEAR_SCREEN_ROWS:
        LDX #$00
        LDA #$00
CLEAR_LOOP:
        STA SCREEN+40,X
        STA SCREEN+80,X
        STA SCREEN+120,X
        STA SCREEN+160,X
        STA SCREEN+200,X
        INX
        BNE CLEAR_LOOP
        RTS

SHOW_TITLE:
        LDX #$00
TITLE_LOOP:
        LDA TITLE_TEXT,X
        STA SCREEN,X
        INX
        CPX #$16
        BNE TITLE_LOOP
        RTS
TITLE_TEXT:
        .BYTE $2D,$25,$2D,$2F,$32,$39,$00,$33,$34,$32,$25,$33,$33,$00,$34,$25,$33,$34,$00,$00,$00,$00

SHOW_MODE:
        LDA MODE
        SEC
        SBC #$01
        ASL A
        TAX
        LDA SHOW_TABLE+1,X
        PHA
        LDA SHOW_TABLE,X
        PHA
        RTS
SHOW_TABLE:
        .WORD SHOW_1088-1,SHOW_576C-1,SHOW_576R-1,SHOW_320C-1
        .WORD SHOW_320R-1,SHOW_192-1,SHOW_128-1
SHOW_1088:
        LDX #$00
        JMP SHOW_1088_TEXT
SHOW_576C:
        LDX #$00
        JMP SHOW_576C_TEXT
SHOW_576R:
        LDX #$00
        JMP SHOW_576R_TEXT
SHOW_320C:
        LDX #$00
        JMP SHOW_320C_TEXT
SHOW_320R:
        LDX #$00
        JMP SHOW_320R_TEXT
SHOW_192:
        LDX #$00
        JMP SHOW_192_TEXT
SHOW_128:
        LDX #$00
        JMP SHOW_128_TEXT
SHOW_1088_TEXT:
        LDA #$11
        STA SCREEN+20
        LDA #$10
        STA SCREEN+21
        LDA #$18
        STA SCREEN+22
        STA SCREEN+23
        LDA #$2B
        STA SCREEN+24
        RTS
SHOW_576C_TEXT:
        LDA #$15
        STA SCREEN+20
        LDA #$17
        STA SCREEN+21
        LDA #$16
        STA SCREEN+22
        LDA #$23
        STA SCREEN+23
        RTS
SHOW_576R_TEXT:
        JSR SHOW_576C_TEXT
        LDA #$32
        STA SCREEN+23
        RTS
SHOW_320C_TEXT:
        LDA #$13
        STA SCREEN+20
        LDA #$12
        STA SCREEN+21
        LDA #$10
        STA SCREEN+22
        LDA #$23
        STA SCREEN+23
        RTS
SHOW_320R_TEXT:
        JSR SHOW_320C_TEXT
        LDA #$32
        STA SCREEN+23
        RTS
SHOW_192_TEXT:
        LDA #$11
        STA SCREEN+20
        LDA #$19
        STA SCREEN+21
        LDA #$12
        STA SCREEN+22
        LDA #$2B
        STA SCREEN+23
        RTS
SHOW_128_TEXT:
        LDA #$11
        STA SCREEN+20
        LDA #$12
        STA SCREEN+21
        LDA #$18
        STA SCREEN+22
        LDA #$2B
        STA SCREEN+23
        RTS

SHOW_ITERATION:
        LDA ITER
        AND #$0F
        TAX
        LDA HEX_TEXT,X
        STA SCREEN+40
        LDA ITER
        LSR A
        LSR A
        LSR A
        LSR A
        TAX
        LDA HEX_TEXT,X
        STA SCREEN+41
        RTS
HEX_TEXT:
        .BYTE $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$21,$22,$23,$24,$25,$26

SHOW_NO_EXPANSION:
        LDX #$00
NO_EXP_LOOP:
        LDA NO_EXP_TEXT,X
        STA SCREEN+40,X
        INX
        CPX #$13
        BNE NO_EXP_LOOP
        RTS
NO_EXP_TEXT:
        .BYTE $2E,$2F,$00,$25,$38,$30,$21,$2E,$33,$29,$2F,$2E,$00,$26,$2F,$35,$2E,$24,$00

SHOW_RESULT:
        LDX #$00
        LDA ERRORS
        BNE SHOW_FAIL
SHOW_PASS:
        LDA PASS_TEXT,X
        STA SCREEN+80,X
        INX
        CPX #$12
        BNE SHOW_PASS
        RTS
SHOW_FAIL:
        LDA FAIL_TEXT,X
        STA SCREEN+80,X
        INX
        CPX #$12
        BNE SHOW_FAIL
        RTS
PASS_TEXT:
        .BYTE $33,$34,$32,$25,$33,$33,$00,$30,$21,$33,$33,$00,$00,$00,$00,$00,$00,$00
FAIL_TEXT:
        .BYTE $33,$34,$32,$25,$33,$33,$00,$26,$21,$29,$2C,$00,$00,$00,$00,$00,$00,$00

SHOW_CONTROL_RESULT:
        LDA CTRL_STATUS
        CMP #$02
        BEQ SHOW_CONTROL_NA
        LDA CTRL_ERRORS
        BNE SHOW_CONTROL_FAIL
        LDX #$00
SHOW_CONTROL_PASS_LOOP:
        LDA CONTROL_PASS_TEXT,X
        STA SCREEN+120,X
        INX
        CPX #$0E
        BNE SHOW_CONTROL_PASS_LOOP
        RTS
SHOW_CONTROL_FAIL:
        LDX #$00
SHOW_CONTROL_FAIL_LOOP:
        LDA CONTROL_FAIL_TEXT,X
        STA SCREEN+120,X
        INX
        CPX #$0E
        BNE SHOW_CONTROL_FAIL_LOOP
        RTS
SHOW_CONTROL_NA:
        LDX #$00
SHOW_CONTROL_NA_LOOP:
        LDA CONTROL_NA_TEXT,X
        STA SCREEN+120,X
        INX
        CPX #$0E
        BNE SHOW_CONTROL_NA_LOOP
        RTS
CONTROL_PASS_TEXT:
        .BYTE $30,$2F,$32,$34,$22,$00,$2D,$21,$30,$00,$30,$21,$33,$33
CONTROL_FAIL_TEXT:
        .BYTE $30,$2F,$32,$34,$22,$00,$2D,$21,$30,$00,$26,$21,$29,$2C
CONTROL_NA_TEXT:
        ; Atari screen codes: N/A uses $2E, $0F, $21.
        .BYTE $30,$2F,$32,$34,$22,$00,$2D,$21,$30,$00,$2E,$0F,$21,$00

; Relocate absolute screen stores to the OS-selected SAVMSC address.
RELOCATE_SCREEN:
        LDA $58
        STA SCREEN_BASE
        LDA $59
        STA SCREEN_BASE+1
        LDA #$00
        STA PTR
        LDA #$20
        STA PTR+1
RELOCATE_SCAN:
        LDA PTR+1
        CMP #>END_CODE
        BCC RELOCATE_BYTE
        BNE RELOCATE_DONE
        LDA PTR
        CMP #<END_CODE
        BCS RELOCATE_DONE
RELOCATE_BYTE:
        LDY #$00
        LDA (PTR),Y
        CMP #$8D
        BEQ RELOCATE_OPERAND
        CMP #$9D
        BEQ RELOCATE_OPERAND
        CMP #$99
        BEQ RELOCATE_OPERAND
        JMP RELOCATE_NEXT
RELOCATE_OPERAND:
        INY
        LDA (PTR),Y
        STA WORK_LO
        INY
        LDA (PTR),Y
        STA WORK_HI
        LDA WORK_LO
        SEC
        SBC #<SCREEN
        STA WORK_LO
        LDA WORK_HI
        SBC #>SCREEN
        STA WORK_HI
        BCC RELOCATE_NEXT
        LDA WORK_HI
        CMP #$02
        BCS RELOCATE_NEXT
        LDA WORK_LO
        CLC
        ADC SCREEN_BASE
        STA WORK_LO
        LDA WORK_HI
        ADC SCREEN_BASE+1
        STA WORK_HI
        LDY #$01
        LDA WORK_LO
        STA (PTR),Y
        INY
        LDA WORK_HI
        STA (PTR),Y
RELOCATE_NEXT:
        INC PTR
        BNE RELOCATE_SCAN
        INC PTR+1
        JMP RELOCATE_SCAN
RELOCATE_DONE:
        RTS

END_CODE:

.ORG $2FF0
.BYTE $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00

.RUN START
