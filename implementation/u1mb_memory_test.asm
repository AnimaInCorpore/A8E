; Generic extended-memory test for 130XE, RAMBO, COMPY, and Ultimate1MB.
; Runs from RAM so PORTB bit 1/7 may be used as bank bits.
; The progress cursor is written to the standard OS screen area.

.ORG $2000

PORTB  = $D301
; Canonical assembly address; startup relocates stores to SAVMSC.
SCREEN = $9C40
; Only the indirect pointer must be in zero page. Keep the test state outside
; OS/VBI workspace so display services cannot corrupt a long-running test.
PTR    = $80
BANK   = $2FF2
PATTERN= $2FF3
ERRORS = $2FF4
TEMP   = $2FF5
MODE   = $2FF6
PHASE  = $2FF7
COUNT  = $2FF8
S2ERRORS = $2FF9
S3ERRORS = $2FFA
S4SAVE_PORTB = $2FFB
S4SAVE_DMA = $2FFC
S4SAVE_DLIST_LO = $2FFD
S4SAVE_DLIST_HI = $2FFE
S4ERRORS = $2FFF
BASE_PORTB = $2FF0
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
        STA BANK
        JSR CLEAR_STATUS
        JSR SHOW_TITLE
        JSR DETECT_MODE
        JSR SHOW_MODE
        LDA COUNT
        BNE NEXT_BANK
        JSR SHOW_NO_EXPANSION
        JMP DONE

NEXT_BANK:
        JSR SELECT_BANK
        LDA BANK
        CLC
        ADC #$55
        STA PATTERN
        JSR CLEAR_PAGE
        LDA #$03
        STA PHASE

        LDA #$00
        STA PTR
        LDA #$40
        STA PTR+1

WRITE_PAGE:
        LDY #$00
WRITE_BYTE:
        LDA PATTERN
        STA (PTR),Y
        INY
        BNE WRITE_BYTE
        INC PTR+1
        JSR SHOW_PAGE_PROGRESS
        LDA PTR+1
        CMP #$80
        BNE WRITE_PAGE

        LDA #$00
        STA PTR
        LDA #$40
        STA PTR+1
        JSR CLEAR_PAGE
        LDA #$0B
        STA PHASE

READ_PAGE:
        LDY #$00
READ_BYTE:
        LDA (PTR),Y
        CMP PATTERN
        BEQ READ_OK
        INC ERRORS
        JSR SHOW_ERROR
READ_OK:
        INY
        BNE READ_BYTE
        INC PTR+1
        JSR SHOW_PAGE_PROGRESS
        LDA PTR+1
        CMP #$80
        BNE READ_PAGE

        JSR SHOW_PROGRESS
        INC BANK
        LDA BANK
        CMP COUNT
        BNE NEXT_BANK

        JSR SHOW_COMPLETE
        JSR STAGE2
        JSR STAGE3
        JSR STAGE4
        ; Leave the machine in the normal motherboard-RAM view after testing.
        LDA #$FF
        STA PORTB
        JSR SHOW_STAGE2_RESULT
        JSR SHOW_STAGE3_RESULT
        JSR SHOW_STAGE4_RESULT
DONE:
        JMP DONE

; Probe the supported AHRM bank maps from largest to smallest.
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
PROBE_WRITE:
        JSR SELECT_BANK
        LDA BANK
        CLC
        ADC #$11
        STA $4000
        INC BANK
        LDA BANK
        CMP COUNT
        BNE PROBE_WRITE
        LDA #$00
        STA BANK
PROBE_READ:
        JSR SELECT_BANK
        LDA BANK
        CLC
        ADC #$11
        CMP $4000
        BEQ PROBE_OK
        INC ERRORS
PROBE_OK:
        INC BANK
        LDA BANK
        CMP COUNT
        BNE PROBE_READ
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
        LDA #$00
        STA BANK
        RTS

SET_BANK_COUNT:
        LDA MODE
        CMP #$01
        BNE SET_COUNT_576C
        LDA #$40
        STA COUNT
        RTS
SET_COUNT_576C:
        CMP #$02
        BNE SET_COUNT_576R
        LDA #$20
        STA COUNT
        RTS
SET_COUNT_576R:
        CMP #$03
        BNE SET_COUNT_320C
        LDA #$20
        STA COUNT
        RTS
SET_COUNT_320C:
        CMP #$04
        BNE SET_COUNT_320R
        LDA #$10
        STA COUNT
        RTS
SET_COUNT_320R:
        CMP #$05
        BNE SET_COUNT_192
        LDA #$10
        STA COUNT
        RTS
SET_COUNT_192:
        CMP #$06
        BNE SET_COUNT_128
        LDA #$08
        STA COUNT
        RTS
SET_COUNT_128:
        CMP #$07
        BNE SET_COUNT_NONE
        LDA #$04
        STA COUNT
        RTS
SET_COUNT_NONE:
        LDA #$00
        STA COUNT
        RTS

; Stage 2 checks bank retention and the CPU window transition.
STAGE2:
        LDA #$00
        STA S2ERRORS

        ; Write a different signature to every bank.
        LDA #$00
        STA BANK
S2_WRITE:
        JSR SELECT_BANK
        LDA BANK
        EOR #$A5
        STA PATTERN
        LDA PATTERN
        STA $4000
        INC BANK
        LDA BANK
        CMP COUNT
        BNE S2_WRITE

        ; Read them in reverse order to catch bank-selection aliasing.
        DEC BANK
S2_READ:
        JSR SELECT_BANK
        LDA BANK
        EOR #$A5
        CMP $4000
        BEQ S2_READ_OK
        INC S2ERRORS
S2_READ_OK:
        LDA BANK
        BEQ S2_WINDOW
        DEC BANK
        JMP S2_READ

        ; Verify that the hidden motherboard RAM survives a window toggle.
S2_WINDOW:
        JSR SELECT_BANK
        LDA $4000
        STA PATTERN
        LDA PORTB
        STA TEMP
        ORA #$10
        STA PORTB
        LDA #$A5
        STA $4000
        LDA TEMP
        AND #$EF
        STA PORTB
        LDA $4000
        CMP PATTERN
        BEQ S2_DONE
        INC S2ERRORS
S2_DONE:
        RTS

; Stage 3 checks the expected CPU/ANTIC window configuration.
; It validates PORTB configuration, not ANTIC DMA data fetches.
STAGE3:
        LDA #$00
        STA S3ERRORS
        JSR SELECT_BANK
        LDA PORTB
        STA TEMP
        LDA MODE
        CMP #$02
        BEQ S3_SEPARATE
        CMP #$04
        BEQ S3_SEPARATE
        CMP #$07
        BEQ S3_SEPARATE

        ; RAMBO and 1088K use a shared CPU+ANTIC window: bit 4 = 0.
        LDA TEMP
        AND #$EF
        STA PORTB
        LDA PORTB
        AND #$10
        BEQ S3_RESTORE
        INC S3ERRORS
        JMP S3_RESTORE

S3_SEPARATE:
        ; 130XE/COMPY use bit 4 for CPU and bit 5 for ANTIC.
        LDA TEMP
        ORA #$10
        AND #$DF
        STA PORTB
        LDA PORTB
        AND #$30
        CMP #$10
        BEQ S3_RESTORE
        INC S3ERRORS
S3_RESTORE:
        LDA TEMP
        STA PORTB
        RTS

; Stage 4 presents a short visual ANTIC DMA test using the expanded bank.
; The CPU cannot read back ANTIC DMA data, so this is intentionally reported
; after the user confirms the displayed pattern with START or SELECT.
STAGE4:
        LDA PORTB
        STA S4SAVE_PORTB
        LDA $022F
        STA S4SAVE_DMA
        LDA $0230
        STA S4SAVE_DLIST_LO
        LDA $0231
        STA S4SAVE_DLIST_HI

        LDA #$00
        STA BANK
        JSR SELECT_BANK
        LDA #$21
        STA PATTERN
        LDA #$00
        STA PTR
        LDA #$40
        STA PTR+1
S4_FILL:
        LDY #$00
S4_FILL_BYTE:
        LDA PATTERN
        STA (PTR),Y
        EOR #$03
        STA PATTERN
        INY
        BNE S4_FILL_BYTE
        INC PTR+1
        LDA PTR+1
        CMP #$44
        BNE S4_FILL

        LDA #$68
        STA PTR
        LDA #$41
        STA PTR+1
        LDX #$00
        LDY #$00
S4_PROMPT:
        LDA PROMPT_TEXT,X
        STA (PTR),Y
        INX
        INY
        CPX #$17
        BNE S4_PROMPT

        ; Keep the expanded window available to ANTIC while CPU access is off
        ; for separate-window configurations.
        LDA PORTB
        STA TEMP
        LDA MODE
        CMP #$02
        BEQ S4_ANTIC_ONLY
        CMP #$04
        BEQ S4_ANTIC_ONLY
        CMP #$07
        BNE S4_SET_DISPLAY
S4_ANTIC_ONLY:
        LDA TEMP
        ORA #$10
        AND #$DF
        STA PORTB
S4_SET_DISPLAY:
        LDA #$00
        STA $0230
        STA $D402
        LDA #$30
        STA $0231
        STA $D403
        LDA #$22
        STA $022F
        STA $D400
        LDX #$20
S4_WAIT_OUT:
        LDY #$00
S4_WAIT_IN:
        DEY
        BNE S4_WAIT_IN
        DEX
        BNE S4_WAIT_OUT

S4_WAIT_KEY:
        LDA $D01F
        AND #$01
        BEQ S4_PASS_KEY
        LDA $D01F
        AND #$02
        BEQ S4_FAIL_KEY
        JMP S4_WAIT_KEY
S4_PASS_KEY:
        LDA #$00
        STA S4ERRORS
        JMP S4_RESTORE_DISPLAY
S4_FAIL_KEY:
        LDA #$01
        STA S4ERRORS

S4_RESTORE_DISPLAY:
        LDA S4SAVE_DLIST_LO
        STA $0230
        STA $D402
        LDA S4SAVE_DLIST_HI
        STA $0231
        STA $D403
        LDA S4SAVE_DMA
        STA $022F
        STA $D400
        LDA S4SAVE_PORTB
        STA PORTB
        RTS

; Select the bank layout associated with MODE. Bit 4=0 enables the window.
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
        .WORD SELECT_1088-1, SELECT_576-1, SELECT_576_RAMBO-1, SELECT_320_COMPY-1
        .WORD SELECT_320-1, SELECT_192-1, SELECT_128-1

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
        .WORD SHOW_1088-1, SHOW_576-1, SHOW_576_RAMBO-1, SHOW_320_COMPY-1
        .WORD SHOW_320-1, SHOW_192-1, SHOW_128-1
SHOW_1088:
        LDA #$11
        STA SCREEN+20
        LDA #$10
        STA SCREEN+21
        LDA #$18
        STA SCREEN+22
        LDA #$18
        STA SCREEN+23
        LDA #$2B
        STA SCREEN+24
        RTS
SHOW_576:
        LDA #$15
        STA SCREEN+20
        LDA #$17
        STA SCREEN+21
        LDA #$16
        STA SCREEN+22
        LDA #$23
        STA SCREEN+23
        RTS
SHOW_576_RAMBO:
        LDA #$15
        STA SCREEN+20
        LDA #$17
        STA SCREEN+21
        LDA #$16
        STA SCREEN+22
        LDA #$32
        STA SCREEN+23
        RTS
SHOW_320_COMPY:
        LDA #$13
        STA SCREEN+20
        LDA #$12
        STA SCREEN+21
        LDA #$10
        STA SCREEN+22
        LDA #$23
        STA SCREEN+23
        RTS
SHOW_320:
        LDA #$13
        STA SCREEN+20
        LDA #$12
        STA SCREEN+21
        LDA #$10
        STA SCREEN+22
        LDA #$32
        STA SCREEN+23
        RTS
SHOW_192:
        LDA #$11
        STA SCREEN+20
        LDA #$19
        STA SCREEN+21
        LDA #$12
        STA SCREEN+22
        LDA #$2B
        STA SCREEN+23
        RTS
SHOW_128:
        LDA #$11
        STA SCREEN+20
        LDA #$12
        STA SCREEN+21
        LDA #$18
        STA SCREEN+22
        LDA #$2B
        STA SCREEN+23
        RTS

SHOW_NO_EXPANSION:
        LDA #$2E
        STA SCREEN+20
        RTS

; 576K RAMBO: bank bits 2,3,5,6.
SELECT_576_RAMBO:
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
        STA PORTB
        RTS

; 320K COMPY: bank bits 2,3,6,7.
SELECT_320_COMPY:
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

; 192K RAMBO: bank bits 2,3,6.
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

SELECT_576:
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
        STA PORTB
        RTS
SELECT_320:
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
SELECT_128:
        LDA BANK
        AND #$03
        ASL A
        ASL A
        ORA #$81
        ORA BASE_PORTB
        STA PORTB
        RTS

; Clear four status rows. Screen code 0 is a visible blank on the OS screen.
CLEAR_STATUS:
        LDX #$00
        LDA #$00
CLEAR_LOOP:
        STA SCREEN+40,X
        STA SCREEN+80,X
        STA SCREEN+120,X
        STA SCREEN+160,X
        INX
        CPX #$20
        BNE CLEAR_LOOP
        RTS

CLEAR_PAGE:
        LDX #$00
        LDA #$00
CLEAR_PAGE_LOOP:
        STA SCREEN+120,X
        STA SCREEN+160,X
        INX
        CPX #$20
        BNE CLEAR_PAGE_LOOP
        RTS

; Draw one completed 256-byte page. Page 0-31 and 32-63 use two rows.
SHOW_PAGE_PROGRESS:
        LDA PTR+1
        SEC
        SBC #$41
        STA TEMP
        AND #$1F
        TAX
        LDA TEMP
        AND #$20
        BEQ FIRST_PAGE_ROW
        LDA PHASE
        STA SCREEN+160,X
        RTS
FIRST_PAGE_ROW:
        LDA PHASE
        STA SCREEN+120,X
        RTS

; Draw one completed bank as a moving marker on two 32-character rows.
SHOW_PROGRESS:
        LDA BANK
        AND #$1F
        TAX
        LDA BANK
        AND #$20
        BEQ FIRST_PROGRESS_ROW
        LDA #$0D
        STA SCREEN+80,X
        RTS
FIRST_PROGRESS_ROW:
        LDA #$0D
        STA SCREEN+40,X
        RTS

SHOW_ERROR:
        LDA #$01
        STA SCREEN+240
        RTS

SHOW_STAGE2_RESULT:
        LDA S2ERRORS
        BNE SHOW_STAGE2_FAIL
        LDX #$00
SHOW_STAGE2_PASS_LOOP:
        LDA SYS_PASS_TEXT,X
        STA SCREEN+240,X
        INX
        CPX #$0F
        BNE SHOW_STAGE2_PASS_LOOP
        RTS
SHOW_STAGE2_FAIL:
        LDX #$00
SHOW_STAGE2_FAIL_LOOP:
        LDA SYS_FAIL_TEXT,X
        STA SCREEN+240,X
        INX
        CPX #$0F
        BNE SHOW_STAGE2_FAIL_LOOP
        RTS

SHOW_STAGE3_RESULT:
        LDA S3ERRORS
        BNE SHOW_STAGE3_FAIL
        LDX #$00
SHOW_STAGE3_PASS_LOOP:
        LDA ANTIC_PASS_TEXT,X
        STA SCREEN+280,X
        INX
        CPX #$0E
        BNE SHOW_STAGE3_PASS_LOOP
        RTS
SHOW_STAGE3_FAIL:
        LDX #$00
SHOW_STAGE3_FAIL_LOOP:
        LDA ANTIC_FAIL_TEXT,X
        STA SCREEN+280,X
        INX
        CPX #$0E
        BNE SHOW_STAGE3_FAIL_LOOP
        RTS

SHOW_STAGE4_RESULT:
        LDA S4ERRORS
        BNE SHOW_STAGE4_FAIL
        LDX #$00
SHOW_STAGE4_LOOP:
        LDA ANTIC_PASS_TEXT,X
        STA SCREEN+320,X
        INX
        CPX #$0E
        BNE SHOW_STAGE4_LOOP
        RTS
SHOW_STAGE4_FAIL:
        LDX #$00
SHOW_STAGE4_FAIL_LOOP:
        LDA ANTIC_FAIL_TEXT,X
        STA SCREEN+320,X
        INX
        CPX #$0E
        BNE SHOW_STAGE4_FAIL_LOOP
        RTS

SHOW_COMPLETE:
        LDA ERRORS
        BNE SHOW_FAIL
        LDX #$00
SHOW_PASS_LOOP:
        LDA RW_PASS_TEXT,X
        STA SCREEN+200,X
        INX
        CPX #$0D
        BNE SHOW_PASS_LOOP
        RTS
SHOW_FAIL:
        LDX #$00
SHOW_FAIL_LOOP:
        LDA RW_FAIL_TEXT,X
        STA SCREEN+200,X
        INX
        CPX #$0D
        BNE SHOW_FAIL_LOOP
        RTS

SHOW_TITLE:
        LDX #$00
SHOW_TITLE_LOOP:
        LDA TITLE_TEXT,X
        STA SCREEN,X
        INX
        CPX #$10
        BNE SHOW_TITLE_LOOP
        RTS

TITLE_TEXT:
        ; Atari screen codes: uppercase letters are $21-$3A, digits are $10-$19.
        .BYTE $35,$11,$2D,$22,$00,$2D,$25,$2D,$2F,$32,$39,$00,$34,$25,$33,$34
RW_PASS_TEXT:
        .BYTE $32,$37,$00,$22,$21,$2E,$2B,$33,$00,$30,$21,$33,$33
RW_FAIL_TEXT:
        .BYTE $32,$37,$00,$22,$21,$2E,$2B,$33,$00,$26,$21,$29,$2C
SYS_PASS_TEXT:
        .BYTE $33,$39,$33,$00,$23,$28,$25,$23,$2B,$33,$00,$30,$21,$33,$33
SYS_FAIL_TEXT:
        .BYTE $33,$39,$33,$00,$23,$28,$25,$23,$2B,$33,$00,$26,$21,$29,$2C
ANTIC_PASS_TEXT:
        .BYTE $21,$2E,$34,$29,$23,$00,$23,$26,$27,$00,$30,$21,$33,$33
ANTIC_FAIL_TEXT:
        .BYTE $21,$2E,$34,$29,$23,$00,$23,$26,$27,$00,$26,$21,$29,$2C

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

; Private state area. It is outside the program and screen buffers.
.ORG $2FF0
.BYTE $00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00,$00

; Seven blank lines, 24 mode-2 lines from expanded memory, then jump back.
.ORG $3000
.BYTE $70,$70,$70,$70,$70,$70,$70,$42,$00,$40
.BYTE $02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02
.BYTE $02,$02,$02,$02,$02,$02,$02,$02,$02,$02,$02
.BYTE $41,$00,$30

PROMPT_TEXT:
        .BYTE $30,$32,$25,$33,$33,$00,$33,$34,$21,$32,$34,$00,$34,$2F,$00,$23,$2F,$2E,$34,$29,$2E,$35,$25

.RUN START
