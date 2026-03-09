# Automation / Public Machine API

- Files: `jsA8E/js/app/automation_api.js`, `jsA8E/js/app/ui.js`, `jsA8E/js/core/atari.js`, `jsA8E/js/core/debugger.js`, `jsA8E/js/core/memory.js`, `jsA8E/js/core/input.js`, `jsA8E/js/core/hostfs.js`, `jsA8E/js/core/app_proxy.js`, `jsA8E/emulator_worker.js`, `jsA8E/js/core/assembler_core.js`
- Purpose: define the universal, browser-first automation abstraction for jsA8E so UI, in-browser tools, and external agents all use one coherent machine-control contract.
- Status: verified on 2026-03-09 (`implemented`, with follow-up UI/tooling ideas below).
- Notes: `window.A8EAutomation` now exposes the planned browser-first grouped surface (`system`, `media`, `input`, `debug`, `dev`, `artifacts`, `events`) while keeping the earlier flat aliases for compatibility. The live API covers worker-safe request/response RPC, deterministic paused-mode debug execution, explicit stop/fault semantics, memory/bank introspection, trace/counter export, framebuffer-based screenshot/artifact capture, HostFS access, source-text assembly, XEX launch helpers, wait primitives, mapped source context, and runtime disassembly. The browser UI attaches the live app instance, but the public contract lives in `automation_api.js`, not in UI internals.
- Issues: the base browser API is now in place, but there is still no dedicated in-browser automation console or standalone visible diagnostics panel layered on top of it.
- Todo: use the phased plan below for follow-up tooling work (for example an in-browser automation console/test page and richer UI integrations) while keeping the stable machine API itself transport-neutral and browser-first.

## Architecture Principle

jsA8E should expose a universal browser-first machine API.

- Browser-first means the canonical public contract is `window.A8EAutomation`.
- Universal means the abstraction describes an Atari 800 XL machine plus development services, not a GEOS-specific workflow.
- Consistent means UI, worker mode, in-browser tooling, and external harnesses must all observe the same semantics for control, debugging, media, and artifacts.
- Transport-neutral means worker RPC is an implementation detail, not the architecture.
- Stable means public methods, payloads, and result semantics must be versioned and evolve compatibly.

## Layer Model

The automation abstraction should be treated as a service boundary with five layers.

1. Machine services
   Boot, run-state, media management, and input control.
2. Debug services
   Breakpoints, stepping, paused-mode execution, register snapshots, counters, memory access, bank state, and trace export.
3. Development services
   HostFS operations, assembler/build helpers, and XEX launch helpers.
4. Artifact services
   Screenshot capture, structured artifact bundles, and machine-state export.
5. Transport
   Direct calls in main-thread mode and RPC in worker mode, with identical public behavior.

Consumers sit above those layers.

- Browser UI consumes the public services.
- In-browser tools consume the same public services.
- External harnesses can call the browser contract remotely.
- Target-specific flows such as GEOS presets sit above the universal API and must not shape the base contract.

## Ownership Boundaries

- `js/core/atari.js` should remain the root of machine services.
- `js/core/debugger.js` should own paused-mode execution semantics, breakpoints, counters, and trace export.
- `js/core/memory.js` should own memory-range and bank-state introspection.
- `js/core/input.js` should own keyboard, joystick, and console-key state transitions.
- `js/core/hostfs.js` and `js/core/hdevice.js` should back HostFS-oriented development services.
- `js/core/assembler_core.js` should back assembler automation rather than the visual assembler panel.
- `js/app/automation_api.js` should be the only public browser facade.
- `js/app/ui.js` should attach the live app instance and consume the public contract rather than define parallel control behavior.
- `js/core/app_proxy.js` and `emulator_worker.js` should preserve public semantics across transport and avoid introducing worker-only behaviors.
- Future external harnesses should remain thin clients of `window.A8EAutomation`.

## Representative Scenarios

The public machine API should make the following browser-first scenarios direct and unsurprising.

- Assemble source text to XEX from browser code.
- Assemble a HostFS source file and inspect structured build results.
- Run a generated XEX, wait for deterministic state or elapsed time, then capture a screenshot.
- Run until a breakpoint or PC address, dump memory, and export trace tail + counters.
- Drive keyboard, joystick, and console-key input without touching DOM event plumbing.

Representative examples the abstraction should support cleanly:

```js
const build = await window.A8EAutomation.dev.assembleSource({
  name: "TEST.ASM",
  text: sourceText,
});

await window.A8EAutomation.dev.runXex({
  bytes: build.bytes,
  name: "TEST.XEX",
});

await window.A8EAutomation.system.waitForTime({ ms: 10000, clock: "real" });
const screenshot = await window.A8EAutomation.artifacts.captureScreenshot();
```

```js
await window.A8EAutomation.debug.runUntilPc(targetPc, { maxInstructions: 500000 });
const cpu = await window.A8EAutomation.debug.getDebugState();
const sourceContext = await window.A8EAutomation.debug.getSourceContext({
  pc: cpu.pc,
  beforeLines: 50,
  afterLines: 50,
});
const disassembly = await window.A8EAutomation.debug.disassemble({
  pc: cpu.pc,
  beforeInstructions: 50,
  afterInstructions: 50,
});
```

```js
const stop = await window.A8EAutomation.system.waitForPause();
if (stop.reason === "fault_illegal_opcode") {
  const cpu = await window.A8EAutomation.debug.getDebugState();
  const trace = await window.A8EAutomation.debug.getTraceTail(32);
  const disassembly = await window.A8EAutomation.debug.disassemble({
    pc: cpu.pc,
    beforeInstructions: 20,
    afterInstructions: 20,
  });
}
```

## Public API Shape

The long-term public contract should be grouped by domain, while keeping current flat helpers as compatibility aliases.

```js
window.A8EAutomation = {
  apiVersion: "1",
  getCapabilities(),
  getSystemState(),
  system: {
    start(),
    pause(),
    reset(),
    waitForPause(),
    waitForPc(pc, options),
    waitForFrame(options),
  },
  media: {
    loadRom(spec),
    loadOsRom(data),
    loadBasicRom(data),
    mountDisk(data, options),
    unmountDisk(slot),
    getMountedMedia(),
  },
  input: {
    keyDown(event),
    keyUp(event),
    tapKey(event, options),
    typeText(text, options),
    setJoystick(port, state),
    setConsoleKeys(state),
    releaseAllInputs(),
  },
  debug: {
    setBreakpoints(addresses),
    stepInstruction(),
    stepOver(),
    runUntilPc(targetPc, options),
    readMemory(address),
    readRange(start, length, options),
    getDebugState(),
    getCounters(),
    getBankState(),
    getTraceTail(limit),
    getSourceContext(options),
    disassemble(options),
  },
  dev: {
    assembleSource(spec),
    assembleText(spec),
    listHostFiles(),
    readHostFile(name, options),
    writeHostFile(name, data, options),
    deleteHostFile(name),
    assembleHostFile(name, options),
    runXex(spec),
    getLastBuildResult(),
  },
  artifacts: {
    captureScreenshot(options),
    collectArtifacts(options),
  },
  events: {
    subscribe(listener),
    unsubscribe(listener),
  },
};
```

Rules for that shape:

- All public methods should be Promise-friendly even when current implementations are synchronous.
- Flat method names may remain as aliases for backward compatibility.
- Browser main-thread mode and worker mode must resolve equivalent results.
- Result objects should be JSON-friendly unless the method explicitly returns binary data.
- Every externally consumed result shape should carry a stable version when schema churn is likely.
- Source-oriented debug helpers should prefer returning structured data (line numbers, addresses, text, labels) rather than preformatted UI strings.
- Pause/fault reasons should be explicit enums in public state/event payloads, not free-form UI messages.

## Required Discovery Surface

Other agents should not have to guess runtime features.

- `apiVersion`: public automation contract version.
- `getCapabilities()`: boolean/enum feature matrix such as `worker`, `hostfs`, `assembler`, `trace`, `screenshot`, `disk`, `joystick`, `consoleKeys`.
- `getSystemState()`: one-call summary of run state, ROM readiness, mounted media, renderer backend, counters, debug state, and major capability state.

This should be implemented before adding more one-off commands because it reduces branching in all consumers.

## Stop and Fault Semantics

Paused execution must distinguish ordinary control flow from execution faults.

Public debug state and pause/event payloads should expose a stable `reason` value, with room for structured fault metadata.

Expected baseline reasons:

- `init`
- `frame`
- `reset`
- `pause`
- `breakpoint`
- `step`
- `stepover`
- `wait_complete`
- `fault_illegal_opcode`
- `fault_execution_error`

Expected fault metadata when available:

- `faultType`
- `faultMessage`
- `faultAddress`
- `opcode`
- `traceTail`

Rules:

- Illegal/unsupported opcode traps should pause deterministically and report `fault_illegal_opcode`.
- Other runtime failures that stop execution should report `fault_execution_error`.
- Fault reporting should not depend on UI console output.
- `system.waitForPause()` and event subscribers should receive the same stop reason semantics as `debug.getDebugState()`.
- Fault-stop snapshots should remain inspectable through normal debug helpers (`getDebugState`, `getCounters`, `getTraceTail`, `disassemble`, `getSourceContext`).

## Browser-First Rules

- Public automation must be usable from the browser alone.
- No feature should require Node-specific helpers to exist.
- External harnesses must only call public browser APIs and should not invent extra semantics unavailable in the browser.
- An in-browser automation console or harness is preferable to expanding the runner into the primary interface.
- GEOS support belongs in presets, scripts, or higher-level workflows layered on top of the universal browser contract.

## Consistency Rules

The abstraction should also improve emulator clarity.

- One operation, one authoritative implementation.
- UI must not bypass public machine-control semantics.
- Worker transport must not change behavior, only delivery.
- Debug stepping should remain paused-mode execution and must not silently route through frame scheduling.
- Screenshot capture should remain based on emulator framebuffer data, not visual canvas state.
- Development helpers should be built on core services, not on DOM panel behavior.
- Source context should be derived from assembler line maps and stored build metadata, not scraped from the visible editor state.
- Runtime disassembly should be derived from machine memory plus opcode tables, not from trace text intended for UI display.

## Source and Disassembly Inspection

To support assembler-as-testbed workflows cleanly, the public API should expose both source context and runtime disassembly.

- `debug.getSourceContext({ pc, beforeLines, afterLines })`
  Returns source-oriented context when the active code was built through jsA8E and line maps are available.
- `debug.disassemble({ pc, beforeInstructions, afterInstructions })`
  Returns decoded instruction records around the current PC from live memory, independent of whether source maps exist.

These two helpers solve different problems and should both exist.

- Source context answers "which source line did I hit and what nearby source lines matter?"
- Disassembly answers "what is actually in memory around the current PC right now?"

Expected source-context output:

- source name
- active line number
- active address
- bounded list of nearby source lines
- line-to-address metadata where available
- build/run metadata identifying which build result produced the mapping

Expected disassembly output:

- active PC
- bounded list of decoded instruction records before/after the focus point
- per-record address, opcode bytes, mnemonic, operand text, and optional target/label metadata
- a marker showing which instruction is the current focus

The source-context API should degrade cleanly when no line map is available by returning a structured "unmapped" result rather than failing. The disassembly API should remain available even when source context is unavailable.

This source/disassembly inspection path should also be the standard post-fault inspection path. Illegal-instruction detection is a representative acceptance scenario: the agent should be able to observe a `fault_illegal_opcode` stop, inspect CPU registers, fetch nearby disassembly, and fetch nearby source context if the failing program was assembled through jsA8E.

## Phased Roadmap

### Phase 1: Consolidate the Public Contract

Goal: make the existing surface explicit, versioned, and easier to consume.

- Add `apiVersion`, `getCapabilities()`, and `getSystemState()` to `window.A8EAutomation`.
- Add grouped namespaces (`system`, `media`, `input`, `debug`, `artifacts`) while preserving current flat aliases.
- Define result-shape invariants for debug snapshots, counters, screenshots, and artifacts.
- Document compatibility rules for main-thread and worker mode.

Acceptance:

- A browser script can discover capabilities and system state without touching UI internals.
- Existing consumers of the flat API continue to work.

### Phase 2: Wait/Event Primitives

Goal: remove ad hoc polling loops from agent workflows.

- Add `waitForPause()`, `waitForPc()`, `waitForBreakpoint()`, and `waitForFrame()`.
- Add a small `events` subscription model for debug-state changes and lifecycle events.
- Keep wait/event semantics browser-first and transport-neutral.
- Define stable stop/fault reasons shared by debug snapshots and event payloads.

Acceptance:

- An external consumer can run deterministic breakpoint-based flows without manual polling loops.
- An external consumer can distinguish breakpoint/step/pause from illegal-opcode and other fault stops.

### Phase 3: Source and Disassembly Inspection

Goal: make paused-state inspection useful for agent-driven assembler/debug workflows.

- Add `debug.getSourceContext({ pc, beforeLines, afterLines })` using assembler line maps and retained build metadata.
- Add `debug.disassemble({ pc, beforeInstructions, afterInstructions })` using live memory plus opcode tables.
- Keep both outputs structured and JSON-friendly.
- Preserve usefulness when source maps are absent by returning disassembly independently.

Acceptance:

- After a timed pause or breakpoint, an agent can fetch CPU state plus nearby source context and nearby runtime disassembly without reading UI state.

### Phase 4: Universal Input Completion

Goal: make the machine API Atari-wide rather than keyboard-centric.

- Add joystick state control.
- Add console-key control (`Start`, `Select`, `Option`).
- Add `releaseAllInputs()` as the universal cleanup primitive.
- Keep keyboard helpers for text-entry workflows.

Acceptance:

- An agent can drive cartridge, disk, menu, and game-style flows without synthesizing DOM-only behavior.

### Phase 5: Development Services

Goal: support assembler/testbed workflows fully inside the browser abstraction.

- Expose HostFS automation methods backed by core host/device services.
- Expose assembler automation methods backed by `assembler_core.js`, not by the visual panel.
- Make source-text assembly explicit and stable through `dev.assembleSource({ name, text, ... })` with structured build output.
- Add `runXex()` helpers that operate on assembled output or HostFS entries.
- Expose structured build results and last-build diagnostics.

Acceptance:

- An agent can write source, assemble it, run it, and inspect results without driving the UI.
- An agent can receive assembler errors, line maps, bytes, and run address through the public API rather than reading panel state.

### Phase 6: In-Browser Automation Harness

Goal: validate the abstraction in the same environment where it is defined.

- Add a lightweight browser-side automation console or development harness.
- Make it capable of exercising boot/media/input/debug/artifact paths.
- Use it for manual smoke testing of both main-thread and worker mode.

Acceptance:

- The browser build includes a minimal self-testbed for the public machine API.

### Phase 7: External Consumers and Presets

Goal: keep repo-side harnesses thin and target-specific.

- Keep future external harnesses as remote browser clients rather than defining a second primary control surface.
- Version any harness preset schema and the artifact schema once those higher-level tools exist.
- Add target-specific presets such as GEOS flows on top of the universal API.
- Add smoke scenarios for generic assembler/XEX workflows as well as target-specific flows.

Acceptance:

- Target-specific automation does not require changes to the base browser contract.

## Immediate Next Actions

Recommended order for the next implementation pass:

1. Add `apiVersion`, `getCapabilities()`, and `getSystemState()`.
2. Group the current API into domain namespaces with flat aliases kept for compatibility.
3. Add wait/event primitives.
4. Define explicit stop/fault reasons and expose them through pause/debug state.
5. Add source-context and disassembly helpers.
6. Add console-key and joystick automation.
7. Add HostFS automation.
8. Add assembler automation, starting with `dev.assembleSource({ name, text })` and `dev.runXex(...)`.
9. Add a small in-browser automation harness.
10. Add higher-level external harnesses only after the browser API is strong enough to support them cleanly.

## Non-Goals

- Do not make Node tooling the canonical control surface.
- Do not encode GEOS-specific semantics into the base machine API.
- Do not expose raw UI panel internals as automation dependencies.
- Do not let worker mode drift into a different public contract from main-thread mode.
