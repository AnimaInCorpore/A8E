# Compiler and Debugger Review

Review status: 2026-09-20.

The browser assembler and source debugger are functional for the current
single-source 6502/XEX workflow. The existing automated test suite passes, but
the following findings should remain visible for future work.

## Findings

### Run synchronization in worker mode

The assembler panel's Run action calls `loadDiskToDeviceSlot()` and then calls
`reset()` and `start()` immediately. In the worker/Tauri backend, the disk load
is sent as a fire-and-forget command, so startup can race the media load. The
HostFS row-level XEX Run action already uses the detailed awaitable loader and
should be used as the model for correcting the assembler Run path.

References:

- `jsA8E/js/app/assembler_ui.js`: `assembleRunExecutable()`
- `jsA8E/js/core/app_proxy.js`: `loadDiskToDeviceSlot()` and
  `loadDiskToDeviceSlotDetailed()`

### Source mapping after preprocessing

Assembler line and address maps are generated after preprocessing. Macro,
`.rept`, and `.include` expansion currently reuses or changes source line
numbers, so a breakpoint in the original editor can point to the wrong line or
be unavailable after expansion.

Future improvement: preserve source file and original line metadata through
preprocessor output and use it when generating `lineAddressMap` and
`addressLineMap`.

### Worker debugger acknowledgements

The worker proxy exposes both fire-and-forget and awaitable step methods. The
assembler UI currently calls the fire-and-forget `stepInstruction()` and
`stepOver()` methods, which return before the worker confirms the operation.
The UI can therefore report success before the instruction has executed.

Future improvement: use `stepInstructionAsync()` and `stepOverAsync()` in the
UI and update status only after the returned result is available.

### `stepOverAsync()` state validation

`stepInstructionAsync()` validates readiness and paused state, but
`stepOverAsync()` reads the current CPU opcode before performing equivalent
checks. Automation calls made before initialization or while running should be
normalized to a structured failure instead of relying on the caller's timing.

### Object format and linking

`.SEGMENT`, `.IMPORT`, and `.GLOBAL` are accepted and recorded as object
metadata, but XEX generation treats them as no-ops. `A8OBJ` currently provides
serialization and parsing only; there is no linker or relocation pass for
combining object modules.

This is intentionally out of scope for the current XEX editor workflow.

### `.SET` semantics

`.SET` is recognized by the parser but uses the same duplicate-symbol rule as
immutable constants. It cannot redefine an existing symbol. If traditional
assembler-compatible mutable `SET` behavior is required, it needs a separate
symbol-update path and dedicated tests.

### Automation symbol lookup

Assembler symbols are normalized to uppercase, while the automation `sym()`
helper currently performs a case-sensitive lookup. Calls such as `sym("START")`
work reliably; lowercase or mixed-case calls may return `null`.

## Implemented scope

The current implementation includes:

- 6502 XEX assembly with official and supported undocumented opcodes.
- Main 6502 addressing modes, labels, local labels, expressions, and branch
  range validation.
- `.ORG`, `.RUN`, `.DS`, `.RES`, `.BYTE`, `.WORD`, `.TEXT`, `.LOBYTES`,
  `.HIBYTES`, `.ASSERT`, `.ERROR`, and `.END`.
- `.include`, `.define`, `.undef`, `.macro`, `.rept`, conditional assembly,
  and `.local` preprocessing.
- HostFS source editing, assembly output, breakpoints, single-step, step-over,
  continue/pause, CPU state, trace inspection, and `runUntilPc` automation.
- Illegal-opcode and execution-error reporting plus debugger snapshot state.

The list above describes implemented behavior, not a promise that the tool is
a full relocatable assembler/linker or a full-featured IDE debugger.
