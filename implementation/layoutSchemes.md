# Layout Schemes

## Proposal

Add selectable presentation layouts to the `jsA8E` browser interface. The
layouts should organize the existing emulator, disk, filesystem, debugger,
keyboard, and joystick panels without changing the emulated machine state.

The presentation mode is a UI preference. Switching modes must not reset,
pause, reload, or otherwise interrupt the emulator.

The three layouts described here are the initial presets, not a closed list.
The layout model must allow additional arrangements to be added later without
changing the panel implementations or rewriting the layout-selection flow.

## Layout Selection

The layout modes are selected with individual toolbar buttons placed beside
the existing lifecycle controls:

```text
[Start/Pause] [Reset] [Audio] | [Emulation] [Work] [Development]
```

Each layout button must:

- show a clear active state;
- allow changing modes with one click;
- expose an accessible label and tooltip;
- remain usable while the emulator is running;
- preserve the selected mode in `localStorage`;
- restore the saved mode on the next page load;
- avoid changing the current panel contents or emulated machine state.

The buttons may use compact icon-only presentation at narrow widths, but
their accessible names must remain available to keyboard and assistive
technology users.

## Layout Modes

### Emulation

Purpose: normal operation and gameplay.

```text
┌─────────────────────────────────────────────┐
│                                             │
│                  Screen                     │
│                                             │
├─────────────────────────────────────────────┤
│             Keyboard + Joystick              │
└─────────────────────────────────────────────┘
```

Requirements:

- The emulator screen occupies the complete first row.
- The virtual keyboard and joystick occupy the second row.
- The keyboard and joystick remain independently hideable when needed.
- Development panels remain hidden unless explicitly opened through another
  existing UI action.

### Work

Purpose: working with disks and files while using the emulator.

```text
┌──────────────────────┬──────────────────────┐
│ Disk Library         │                      │
│ HostFS                │       Screen         │
├──────────────────────┴──────────────────────┤
│             Keyboard + Joystick              │
└─────────────────────────────────────────────┘
```

Requirements:

- The first row has two columns.
- The first column stacks `Disk Library` and `HostFS`.
- The second column contains the emulator screen.
- The second row contains the virtual keyboard and joystick.
- Disk Library and HostFS must remain independently scrollable if their
  contents exceed the available height.

### Development

Purpose: debugging and developing Atari software.

```text
┌──────────────────────┬──────────────────────┐
│ Debugger             │                      │
│ HostFS               │       Screen         │
│ Disk Library         │                      │
├──────────────────────┴──────────────────────┤
│                 Keyboard                      │
└─────────────────────────────────────────────┘
```

Requirements:

- The first row has two columns.
- The first column stacks `Debugger`, `HostFS`, and `Disk Library`.
- The second column contains the emulator screen.
- The second row contains the virtual keyboard.
- The joystick is hidden by default in this mode, but must remain available
  through its existing control if a development workflow requires it.
- Debugger, HostFS, and Disk Library must be independently scrollable or
  collapsible so that one panel cannot hide the others indefinitely.

## Disk Activity Indicator

Disk activity must remain visible in every layout and must follow the current
screen position.

The indicator must be positioned relative to the screen container, not to the
page or the global layout grid. This ensures that it remains in the lower-right
corner of the emulator screen when the screen changes size, column, or layout.

Existing activity semantics are preserved:

- yellow indicates disk reads;
- orange indicates disk writes or formats;
- the indicator remains above the canvas and screen contents through its
  dedicated overlay layer;
- worker-originated activity continues to use the existing event path without
  modifying SIO response data or timing.

## Responsive Behavior

The layouts must remain usable on desktop and mobile widths.

Desktop behavior:

- preserve the two-column arrangements described above;
- give the screen priority when horizontal space is limited;
- keep tool panels from forcing the screen below a usable size.

Mobile behavior:

- collapse two-column layouts into a single vertical flow;
- keep the screen before the lower-priority panels where possible;
- allow panel sections to scroll independently;
- keep the layout buttons visible in the primary toolbar, using compact
  controls when necessary.

The layout change must not alter the existing PAL/NTSC selection, memory
profile, worker selection, ROMs, disks, HostFS files, or emulator lifecycle.

## Persistence

Store the selected layout using a dedicated key, for example:

```text
a8e_layout_scheme
```

Accepted values:

```text
emulation
work
development
```

Unknown or missing values must fall back to `emulation`.

Additional arrangements may define their own stable identifier and may be
added to the same persisted preference set. If a saved arrangement is no
longer available, the UI must fall back to `emulation`.

## Implementation Direction

The implementation should extend the existing UI structure and shared panel
styles rather than introduce separate copies of panel components.

Likely files:

- `jsA8E/index.html`: layout buttons and layout containers;
- `jsA8E/style.css`: grid, responsive, active-button, and panel sizing rules;
- `jsA8E/js/app/ui.js`: layout selection, persistence, and panel visibility;
- `jsA8E/js/app/disk_activity_ui.js`: verify screen-relative overlay behavior;
- `implementation/jsA8E/UI.md`: update the implemented UI behavior after the
  feature is delivered.

The layout controller should use semantic state such as
`data-layout-scheme="emulation"` on the main layout container. CSS grid areas
and a small number of state classes should control presentation; panel logic
should remain owned by the existing panel modules.

New arrangements should be represented as layout definitions or presets that
declare panel placement, visibility, and responsive behavior. They should not
require new copies of `HostFS`, `Disk Library`, `Debugger`, keyboard,
joystick, or screen components.

## Acceptance Criteria

- The toolbar shows individual `Emulation`, `Work`, and `Development` buttons
  beside Start/Pause, Reset, and Audio.
- Exactly one layout button is active at a time.
- Switching layouts does not reset, pause, reload, or alter the emulator.
- `Emulation` shows the screen above keyboard and joystick.
- `Work` shows Disk Library and HostFS beside the screen, with keyboard and
  joystick below.
- `Development` shows Debugger, HostFS, and Disk Library beside the screen,
  with keyboard below.
- Disk activity remains visible and screen-relative in all three layouts.
- The selected layout survives a page reload.
- A future arrangement can be added by registering a new layout definition and
  selector without changing existing panel ownership or emulator behavior.
- Mobile layouts collapse without clipping the screen or making the toolbar
  unusable.
- Existing panel actions, automation attachment, worker behavior, and disk
  activity timing remain unchanged.

## Non-Goals

- No drag-and-drop panel docking in the first iteration.
- No arbitrary user-defined grid layouts in the first iteration.
- The first iteration only needs to ship the three defined presets; support for
  additional registered arrangements is required, but a custom layout editor
  is out of scope.
- No emulator reset or media remount when changing presentation modes.
- No replacement of the existing panel implementations.
