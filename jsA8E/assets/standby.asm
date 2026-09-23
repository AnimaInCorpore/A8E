; Built-in D1 fallback screen. This is guest software, not emulator hardware.
; A custom ANTIC display list points at a private 40-column text screen. The
; message is copied there as Atari screen codes, without relying on CIO E:.

.org $2000

start:
    ; Clear 21 text rows. The zero screen code is a blank character.
    lda #$00
    ldx #$00
clearScreen:
    sta screenBuffer,x
    sta screenBuffer + $0100,x
    sta screenBuffer + $0200,x
    inx
    bne clearScreen
    ; The last page has only 72 bytes (840 bytes total).
    ldx #$00
clearLastRow:
    sta screenBuffer + $0300,x
    inx
    cpx #$48
    bne clearLastRow

    ; Put the SDLSTL display-list shadow where the OS VBI will pick it up.
    lda #<displayList
    sta $0230
    lda #>displayList
    sta $0231

    ; Center five short messages in the 21-row display.
    lda #<titleText
    sta $CB
    lda #>titleText
    sta $CC
    lda #<(screenBuffer + 258)
    sta $CD
    lda #>(screenBuffer + 258)
    sta $CE
    jsr drawText

    lda #<insertText
    sta $CB
    lda #>insertText
    sta $CC
    lda #<(screenBuffer + 333)
    sta $CD
    lda #>(screenBuffer + 333)
    sta $CE
    jsr drawText

    lda #<dropText
    sta $CB
    lda #>dropText
    sta $CC
    lda #<(screenBuffer + 408)
    sta $CD
    lda #>(screenBuffer + 408)
    sta $CE
    jsr drawText

    lda #<sideText
    sta $CB
    lda #>sideText
    sta $CC
    lda #<(screenBuffer + 485)
    sta $CD
    lda #>(screenBuffer + 485)
    sta $CE
    jsr drawText

    lda #<resetText
    sta $CB
    lda #>resetText
    sta $CC
    lda #<(screenBuffer + 567)
    sta $CD
    lda #>(screenBuffer + 567)
    sta $CE
    jsr drawText

wait:
    jmp wait

; Convert null-terminated uppercase ASCII to Atari screen codes.
; Letters map to $21-$3A, digits to $10-$19, and spaces to $00.
drawText:
    ldy #$00
drawTextNext:
    lda ($CB),y
    beq drawTextDone
    cmp #' '
    beq drawTextSpace
    cmp #'0'
    bcc drawTextLetter
    sec
    sbc #$20
    bcs drawTextStore
drawTextLetter:
    and #$1F
    ora #$20
    bne drawTextStore
drawTextSpace:
    lda #$00
drawTextStore:
    sta ($CD),y
    iny
    bne drawTextNext
drawTextDone:
    rts

titleText:
    .byte "A8E", $00
insertText:
    .byte "INSERT A DISK", $00
dropText:
    .byte "DROP A DISK OR OPEN DISK", $00
sideText:
    .byte "MOUNT SIDE 2 IN D1 WHEN ASKED", $00
resetText:
    .byte "FULL RESET TO BOOT FROM D1", $00

.org $2400
displayList:
    ; Three blank character rows place the 21-row text in the 192-line area.
    .byte $70, $70, $70
    .byte $42, <screenBuffer, >screenBuffer
    .rept 20
    .byte $02
    .endr
    .byte $41, <displayList, >displayList

.org $3000
screenBuffer:
    .rept 840
    .byte $00
    .endr
