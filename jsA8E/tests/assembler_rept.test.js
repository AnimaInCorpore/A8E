/* global __dirname, console, process, require */

"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");

// ---------------------------------------------------------------------------
// Minimal assembler loader — only the modules needed, no full emulator stack.
// ---------------------------------------------------------------------------

function loadAssembler() {
  const rootDir = path.resolve(__dirname, "..");
  const context = vm.createContext({});
  context.window = context;
  context.self = context;
  context.globalThis = context;

  const scripts = [
    "js/core/cpu_tables.js",
    "js/core/assembler/shared.js",
    "js/core/assembler/lexer.js",
    "js/core/assembler/preprocessor.js",
    "js/core/assembler/parser.js",
    "js/core/assembler/object_writer.js",
    "js/core/assembler/assembler.js",
    "js/core/assembler_core.js",
  ];

  for (const rel of scripts) {
    const src = fs.readFileSync(path.join(rootDir, rel), "utf8");
    vm.runInContext(src, context, { filename: rel });
  }

  return context.A8EAssemblerCore;
}

const asm = loadAssembler();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assemble(source) {
  return asm.assembleToXex(source);
}

function preprocessOnly(source) {
  // Access the internal preprocessSource via the module namespace
  const rootDir = path.resolve(__dirname, "..");
  const context = vm.createContext({});
  context.window = context;
  context.globalThis = context;
  const src = fs.readFileSync(
    path.join(rootDir, "js/core/assembler/preprocessor.js"),
    "utf8",
  );
  vm.runInContext(src, context, { filename: "preprocessor.js" });
  return context.A8EAssemblerModules.preprocessSource(source);
}

// ---------------------------------------------------------------------------
// Preprocessor-level .rept / .endr tests
// ---------------------------------------------------------------------------

// Basic repetition: .rept 3 emits 3 copies of the body
{
  const result = preprocessOnly(
    ".rept 3\n.byte $AA\n.endr\n",
  );
  assert.ok(result.ok, "preprocess ok");
  const lines = result.text.split("\n").filter(l => l.trim().length > 0);
  assert.equal(lines.length, 3, ".rept 3 should produce 3 body lines");
  assert.ok(lines.every(l => l.trim() === ".byte $AA"), "all lines should be .byte $AA");
}

// Zero count: .rept 0 emits nothing
{
  const result = preprocessOnly(".rept 0\n.byte $FF\n.endr\n");
  assert.ok(result.ok, "preprocess ok");
  const lines = result.text.split("\n").filter(l => l.trim().length > 0);
  assert.equal(lines.length, 0, ".rept 0 should produce no lines");
}

// Single repetition
{
  const result = preprocessOnly(".rept 1\n.byte $42\n.endr\n");
  assert.ok(result.ok, "preprocess ok");
  const lines = result.text.split("\n").filter(l => l.trim().length > 0);
  assert.equal(lines.length, 1, ".rept 1 should produce 1 line");
}

// Multi-line body
{
  const result = preprocessOnly(".rept 2\n.byte $01\n.byte $02\n.endr\n");
  assert.ok(result.ok, "preprocess ok");
  const lines = result.text.split("\n").filter(l => l.trim().length > 0);
  assert.equal(lines.length, 4, ".rept 2 with 2-line body should produce 4 lines");
}

// Nested .rept
{
  const result = preprocessOnly(".rept 3\n.rept 2\n.byte $FF\n.endr\n.endr\n");
  assert.ok(result.ok, "preprocess ok");
  const lines = result.text.split("\n").filter(l => l.trim().length > 0);
  assert.equal(lines.length, 6, "nested .rept 3/.rept 2 should produce 6 lines");
}

// Unterminated .rept should fail
{
  const result = preprocessOnly(".rept 3\n.byte $00\n");
  assert.ok(!result.ok, "unterminated .rept should fail");
  assert.ok(
    /unterminated/i.test(result.error),
    "error should mention 'unterminated'",
  );
}

// Orphan .endr should fail
{
  const result = preprocessOnly(".byte $00\n.endr\n");
  assert.ok(!result.ok, "orphan .endr should fail");
  assert.ok(
    /without matching/i.test(result.error),
    "error should mention 'without matching'",
  );
}

// .rept inside inactive conditional is not processed
{
  const result = preprocessOnly(
    ".ifdef UNDEFINED_SYMBOL\n.rept 5\n.byte $EE\n.endr\n.endif\n",
  );
  assert.ok(result.ok, "preprocess ok");
  const lines = result.text.split("\n").filter(l => l.trim().length > 0);
  assert.equal(lines.length, 0, ".rept inside inactive conditional emits nothing");
}

// ---------------------------------------------------------------------------
// Full assembler tests
// ---------------------------------------------------------------------------

// Display-list style: 22 repetitions of a single byte instruction
{
  const src = [
    "        org     $2000",
    "DL_MODE4 = $04",
    "DL_HSCROLL = $10",
    "DISPLAY_LIST:",
    "        .byte   $70,$70,$70",
    "        .byte   $54",
    "        .word   $6000",
    "        .rept   22",
    "        .byte   DL_MODE4 | DL_HSCROLL",
    "        .endr",
    "        .byte   $42",
    "        .word   $7000",
    "        .byte   $41",
    "        .word   DISPLAY_LIST",
    "        run     DISPLAY_LIST",
  ].join("\n");

  const result = assemble(src);
  assert.ok(result.ok, "display list assembly ok: " + (result.error || ""));

  // The segment starts at $2000.
  // Bytes: 3 (blanks) + 3 (LMS row0) + 22 (scroll rows) + 3 (status) + 3 (JVB) = 34
  const seg = result.bytes;
  // Find segment data starting at $2000 (XEX: FF FF lo hi lo hi ...data...)
  // XEX format: 0xFFFF start_lo start_hi end_lo end_hi data...
  assert.ok(seg.length >= 6, "XEX has header");
  assert.equal(seg[0], 0xff, "XEX magic[0]");
  assert.equal(seg[1], 0xff, "XEX magic[1]");

  // Count $14 bytes (DL_MODE4 | DL_HSCROLL = 0x14) in the output
  let count14 = 0;
  for (let i = 0; i < seg.length; i++) {
    if (seg[i] === 0x14) count14++;
  }
  assert.equal(count14, 22, "should have exactly 22 $14 bytes from .rept 22");
}

// .ds with expression constant
{
  const src = [
    "        org     $3000",
    "ROWS = 5",
    "COLS = 11",
    "TABLE:  .ds     ROWS * COLS",
    "END:    nop",
    "        run     END",
  ].join("\n");

  const result = assemble(src);
  assert.ok(result.ok, ".ds with expression: " + (result.error || ""));
  // TABLE at $3000, size = 55 bytes, END at $3037
  assert.equal(result.symbols["END"], 0x3037, "END should be at $3000 + 55 = $3037");
}

// < and > unary operators in immediate mode
{
  const src = [
    "        org     $2000",
    "TARGET = $1234",
    "        lda     #<TARGET",
    "        lda     #>TARGET",
    "        run     $2000",
  ].join("\n");

  const result = assemble(src);
  assert.ok(result.ok, "< > operators: " + (result.error || ""));
  // lda #$34 = A9 34, lda #$12 = A9 12
  const data = Array.from(result.bytes);
  const seqIdx = data.findIndex((b, i) =>
    b === 0xa9 && data[i + 1] === 0x34 && data[i + 2] === 0xa9 && data[i + 3] === 0x12,
  );
  assert.ok(seqIdx >= 0, "should find lda #$34, lda #$12 sequence");
}

// Forward references work with .rept output
{
  const src = [
    "        org     $2000",
    "        .rept   3",
    "        jmp     TARGET",
    "        .endr",
    "TARGET: nop",
    "        run     TARGET",
  ].join("\n");

  const result = assemble(src);
  assert.ok(result.ok, "forward ref after .rept: " + (result.error || ""));
  // TARGET = $2000 + 3*3 = $2009
  assert.equal(result.symbols["TARGET"], 0x2009, "TARGET after 3 jmp instructions");
}

// Reproduce the exact display list from main.asm (just DL portion)
{
  const src = [
    "DL_BLANK8   = $70",
    "DL_LMS      = $40",
    "DL_MODE2    = $02",
    "DL_MODE4    = $04",
    "DL_JVB      = $41",
    "SCREEN_BUF_A = $6000",
    "STATUS_LINE = $7000",
    "",
    "        org     $7400",
    "DISPLAY_LIST:",
    "        .byte   DL_BLANK8",
    "        .byte   DL_BLANK8",
    "        .byte   DL_BLANK8",
    "        .byte   $54",
    "        .word   SCREEN_BUF_A",
    "        .rept   22",
    "        .byte   $14",
    "        .endr",
    "        .byte   $42",
    "        .word   STATUS_LINE",
    "        .byte   DL_JVB",
    "        .word   DISPLAY_LIST",
    "        run     DISPLAY_LIST",
  ].join("\n");

  const result = assemble(src);
  assert.ok(result.ok, "main.asm DL: " + (result.error || ""));

  // Verify DISPLAY_LIST address
  assert.equal(result.symbols["DISPLAY_LIST"], 0x7400, "DISPLAY_LIST at $7400");

  // Find the DL data in the XEX output (segment starts at $7400)
  // XEX: FF FF 00 74 21 74 <34 bytes>
  const bytes = result.bytes;
  let dlOffset = -1;
  for (let i = 0; i < bytes.length - 5; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xff &&
        bytes[i + 2] === 0x00 && bytes[i + 3] === 0x74) {
      dlOffset = i + 6; // skip FF FF start_lo start_hi end_lo end_hi
      break;
    }
  }
  assert.ok(dlOffset >= 0, "should find DL segment header at $7400");

  // Expected DL bytes: 70 70 70 54 00 60 14*22 42 00 70 41 00 74
  const expected = [
    0x70, 0x70, 0x70,       // 3 blank-8 rows
    0x54, 0x00, 0x60,       // mode4+LMS+HSCROLL, SCREEN_BUF_A lo, hi
    ...Array(22).fill(0x14), // 22x mode4+HSCROLL
    0x42, 0x00, 0x70,       // mode2+LMS, STATUS_LINE lo, hi
    0x41, 0x00, 0x74,       // JVB, DISPLAY_LIST lo, hi
  ];

  for (let i = 0; i < expected.length; i++) {
    assert.equal(
      bytes[dlOffset + i],
      expected[i],
      `DL byte[${i}] should be $${expected[i].toString(16).padStart(2, "0")}`,
    );
  }
}

console.log("assembler_rept: all tests passed.");
